/**
 * Routes API pour le Document Panel.
 *
 * Expose les opérations du DocumentStore et du DocumentLinker skill
 * via des endpoints REST simples pour le frontend.
 *
 * Routes :
 *   POST /api/documents/list        → Liste les documents
 *   POST /api/documents/search      → Recherche dans les documents
 *   POST /api/documents/analyze-links → Analyse les liens inter-documents
 *   POST /api/documents/synthesize  → Synthèse multi-documents
 *   POST /api/documents/remove      → Supprime un document
 *   POST /api/documents/add-tag     → Ajoute des tags
 *   GET  /api/documents/status      → Stats du store
 */

import { Router, Request, Response } from 'express';
import { getDocumentStore } from '../knowledge/DocumentStore';
import { ProfileConfig } from '../prompts/systemInstruction';
import { createLogger } from '../utils/logger';

const log = createLogger('DocumentsRoute');

export function createDocumentsRouter(getProfile: () => ProfileConfig): Router {
  const router = Router();

  // POST /api/documents/list
  router.post('/list', (_req: Request, res: Response) => {
    try {
      const { include_summaries = true, include_links = true } = _req.body || {};
      const store = getDocumentStore();
      const docs = store.getAllDocuments();
      const links = include_links ? store.getAllLinks() : [];

      res.json({
        documents: docs.map((d) => ({
          id: d.id,
          fileName: d.fileName,
          mimeType: d.mimeType,
          uploadedAt: d.uploadedAt,
          keywords: d.keywords,
          tags: d.tags,
          summary: include_summaries ? d.summary : undefined,
          textLength: d.extractedText.length,
        })),
        links: links.map((l) => ({
          docA: l.docA,
          docB: l.docB,
          linkType: l.linkType,
          description: l.description,
          confidence: l.confidence,
        })),
      });
    } catch (e: any) {
      log.error('list error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/documents/search
  router.post('/search', (req: Request, res: Response) => {
    try {
      const { query, max_results = 10 } = req.body || {};
      if (!query) {
        res.status(400).json({ error: 'query requis' });
        return;
      }
      const store = getDocumentStore();
      const results = store.searchDocuments(query, max_results);

      res.json({
        results: results.map((r) => ({
          id: r.id,
          fileName: r.fileName,
          relevance: r.relevance,
          keywords: r.keywords,
          summary: r.summary?.slice(0, 500),
          uploadedAt: r.uploadedAt,
        })),
      });
    } catch (e: any) {
      log.error('search error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/documents/analyze-links
  router.post('/analyze-links', async (req: Request, res: Response) => {
    try {
      const { document_ids, focus, save_links = true } = req.body || {};
      const store = getDocumentStore();

      // Determine documents to analyze
      let docIds: string[] = document_ids;
      if (!docIds || docIds.length === 0) {
        const allDocs = store.getAllDocuments();
        docIds = allDocs
          .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
          .slice(0, 6)
          .map((d) => d.id);
      }

      if (docIds.length < 2) {
        res.status(400).json({ error: 'Il faut au moins 2 documents pour analyser les liens.' });
        return;
      }

      const docs = docIds.map((id) => store.getDocument(id)).filter(Boolean) as any[];
      const crossContext = store.buildCrossDocumentContext(docIds, 6000);

      // Build analysis prompt
      const focusInstruction = focus ? `Concentre-toi particulièrement sur : ${focus}.` : '';
      const analysisPrompt = [
        'Tu es un expert en analyse documentaire. Voici plusieurs documents. Identifie les LIENS et CONNEXIONS entre eux.',
        '', focusInstruction, '',
        'Pour chaque lien trouvé, indique :',
        '1. Les deux documents concernés (par leur nom de fichier)',
        '2. Le TYPE de lien : thematic, complementary, contradictory, sequential, reference',
        '3. Une DESCRIPTION précise du lien (1-2 phrases)',
        '4. Un score de CONFIANCE (0.0 à 1.0)',
        '',
        'Termine par une section synthèse résumant les connexions principales.',
        '',
        'Réponds en JSON : { "links": [{ "docA": "...", "docB": "...", "linkType": "...", "description": "...", "confidence": 0.X }], "synthesis": "..." }',
        '',
        '═══ DOCUMENTS À ANALYSER ═══', '',
        crossContext,
      ].join('\n');

      // Call LLM
      const profile = getProfile();
      let llmResponse = '';

      const provider = profile.textProvider || 'gemini';
      if (provider === 'openrouter') {
        const orKey = (profile as any).openrouterApiKey?.trim() || process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_FREE_API_KEY;
        if (!orKey) { res.status(400).json({ error: 'Aucune clé API OpenRouter.' }); return; }
        const orModel = (profile as any).openrouterModel || 'google/gemini-2.5-flash';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90_000);
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${orKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://jarvis-os.local', 'X-Title': 'Jarvis-OS' },
          body: JSON.stringify({ model: orModel, messages: [{ role: 'user', content: analysisPrompt }], temperature: 0.3, max_tokens: 2048 }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`OpenRouter ${response.status}`);
        const data = await response.json();
        llmResponse = data.choices?.[0]?.message?.content || '';
      } else {
        const { withGeminiRetry } = await import('../utils/geminiKeyPool');
        const response = await withGeminiRetry((ai) => ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [{ text: analysisPrompt }] }],
        }));
        llmResponse = response.text || '';
      }

      // Parse response
      let analysisResult: { links: any[]; synthesis: string } = { links: [], synthesis: llmResponse };
      try {
        const jsonMatch = llmResponse.match(/\{[\s\S]*"links"[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          analysisResult = {
            links: (parsed.links || []).map((l: any) => ({
              docA: l.docA || '', docB: l.docB || '',
              linkType: l.linkType || l.link_type || 'thematic',
              description: l.description || '',
              confidence: Number(l.confidence) || 0.5,
            })),
            synthesis: parsed.synthesis || parsed.synthese || '',
          };
        }
      } catch { /* fallback to raw response */ }

      // Save links if requested
      if (save_links && analysisResult.links.length > 0) {
        for (const link of analysisResult.links) {
          const docA = docs.find((d: any) => d.fileName === link.docA || d.id === link.docA);
          const docB = docs.find((d: any) => d.fileName === link.docB || d.id === link.docB);
          if (docA && docB) {
            store.addLink({ docA: docA.id, docB: docB.id, linkType: link.linkType, description: link.description, confidence: link.confidence });
          }
        }
      }

      res.json({
        documents_analyzed: docs.map((d: any) => ({ id: d.id, fileName: d.fileName })),
        links: analysisResult.links,
        synthesis: analysisResult.synthesis,
        saved: save_links,
      });
    } catch (e: any) {
      log.error('analyze-links error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/documents/synthesize
  router.post('/synthesize', async (req: Request, res: Response) => {
    try {
      const { document_ids, question, format = 'report' } = req.body || {};
      const store = getDocumentStore();

      let docIds: string[] = document_ids;
      if (!docIds || docIds.length === 0) {
        const allDocs = store.getAllDocuments();
        docIds = allDocs
          .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
          .slice(0, 5)
          .map((d) => d.id);
      }

      if (docIds.length === 0) {
        res.status(400).json({ error: 'Aucun document disponible.' });
        return;
      }

      const docs = docIds.map((id) => store.getDocument(id)).filter(Boolean) as any[];
      const crossContext = store.buildCrossDocumentContext(docIds, 8000);

      const formatInstruction: Record<string, string> = {
        summary: 'Produis un résumé court (5-10 phrases) combinant les informations essentielles.',
        report: 'Produis un rapport structuré avec titres, sections, et bullet points.',
        bullets: 'Produis une liste à puces hiérarchique des points clés, regroupés par thème.',
      };

      const questionPart = question
        ? `L'utilisateur demande : "${question}". Oriente ta synthèse pour y répondre.`
        : 'Fais une synthèse générale.';

      const prompt = [
        'Tu es un expert en synthèse documentaire. Voici plusieurs documents.',
        questionPart, '', formatInstruction[format] || formatInstruction.report, '',
        'Cite les sources (nom du document). Signale les contradictions. Réponds en français.', '',
        '═══ DOCUMENTS ═══', '', crossContext,
      ].join('\n');

      const profile = getProfile();
      let synthesis = '';
      const provider = profile.textProvider || 'gemini';

      if (provider === 'openrouter') {
        const orKey = (profile as any).openrouterApiKey?.trim() || process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_FREE_API_KEY;
        if (!orKey) { res.status(400).json({ error: 'Aucune clé API OpenRouter.' }); return; }
        const orModel = (profile as any).openrouterModel || 'google/gemini-2.5-flash';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90_000);
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${orKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://jarvis-os.local', 'X-Title': 'Jarvis-OS' },
          body: JSON.stringify({ model: orModel, messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 2048 }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`OpenRouter ${response.status}`);
        const data = await response.json();
        synthesis = data.choices?.[0]?.message?.content || '';
      } else {
        const { withGeminiRetry } = await import('../utils/geminiKeyPool');
        const response = await withGeminiRetry((ai) => ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        }));
        synthesis = response.text || '';
      }

      res.json({
        documents_used: docs.map((d: any) => ({ id: d.id, fileName: d.fileName })),
        format,
        question: question || null,
        synthesis,
      });
    } catch (e: any) {
      log.error('synthesize error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/documents/remove
  router.post('/remove', (req: Request, res: Response) => {
    try {
      const { document_id } = req.body || {};
      if (!document_id) { res.status(400).json({ error: 'document_id requis' }); return; }
      const store = getDocumentStore();
      const doc = store.getDocument(document_id);
      if (!doc) { res.status(404).json({ error: 'Document introuvable' }); return; }
      store.removeDocument(document_id);
      res.json({ status: 'success', message: `Document "${doc.fileName}" supprimé.` });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/documents/add-tag
  router.post('/add-tag', (req: Request, res: Response) => {
    try {
      const { document_id, tags } = req.body || {};
      if (!document_id || !tags) { res.status(400).json({ error: 'document_id et tags requis' }); return; }
      const store = getDocumentStore();
      const doc = store.getDocument(document_id);
      if (!doc) { res.status(404).json({ error: 'Document introuvable' }); return; }
      const newTags = (tags as string[]).filter((t) => !doc.tags.includes(t));
      doc.tags.push(...newTags);
      store.save();
      res.json({ status: 'success', tags: doc.tags, added: newTags });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/documents/status
  router.get('/status', (_req: Request, res: Response) => {
    try {
      const store = getDocumentStore();
      res.json(store.getStats());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
