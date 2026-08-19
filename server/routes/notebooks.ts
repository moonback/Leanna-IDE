/**
 * Routes API â€” Notebooks (concurrent NotebookLM)
 *
 * Endpoints pour gÃ©rer les notebooks, sources, chat groundÃ©,
 * gÃ©nÃ©ration de contenu et audio overviews.
 */

import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { notebookManager, sourceIngester, groundedChat, contentGenerator, embeddingStore } from "../notebooks";
import { backupService } from "../notebooks/BackupService";
import { sourceProcessingQueue } from "../notebooks/ProcessingQueue";
import { chatResponseCache, ragSearchCache } from "../notebooks/ResponseCache";
import type { GeneratedDocType, ReportSuggestion } from "../notebooks/types";
import { getProjectRoot } from "../utils/pathUtils";
import { getSandboxRoot } from "../utils/sandbox";

// Configuration multer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(pdf|txt|md|html|docx|doc|rtf|csv|json|yaml|yml)$/i;
    if (
      file.originalname.match(allowed) ||
      file.mimetype.startsWith("text/") ||
      file.mimetype === "application/pdf" ||
      file.mimetype === "application/json"
    ) {
      cb(null, true);
    } else {
      cb(new Error(`Type non supportÃ©: ${file.mimetype}`));
    }
  },
});

export function createNotebooksRouter(): Router {
  const router = Router();

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // NOTEBOOKS CRUD
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // GET /api/notebooks â€” Liste tous les notebooks
  router.get("/", (_req: Request, res: Response) => {
    try {
      const notebooks = notebookManager.getAllNotebooks();
      const light = notebooks.map(nb => ({
        id: nb.id,
        title: nb.title,
        description: nb.description,
        sourcesCount: nb.sources.length,
        notesCount: nb.notes.length,
        color: nb.color,
        icon: nb.icon,
        createdAt: nb.createdAt,
        updatedAt: nb.updatedAt,
      }));
      res.json({ status: "success", notebooks: light });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/notebooks â€” CrÃ©e un nouveau notebook
  router.post("/", (req: Request, res: Response) => {
    try {
      const { title, description } = req.body;
      if (!title || typeof title !== "string") {
        res.status(400).json({ error: "Le champ 'title' est requis." });
        return;
      }
      const notebook = notebookManager.createNotebook(title.trim(), description || "");
      res.json({ status: "success", notebook });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/:id â€” DÃ©tail d'un notebook
  router.get("/:id", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      // Retourner sans le rawText des sources (trop volumineux)
      const light = {
        ...notebook,
        sources: notebook.sources.map(s => ({
          id: s.id,
          title: s.title,
          type: s.type,
          origin: s.origin,
          summary: s.summary,
          keywords: s.keywords,
          wordCount: s.wordCount,
          language: s.language,
          addedAt: s.addedAt,
          chunksCount: s.chunks.length,
        })),
      };
      res.json({ status: "success", notebook: light });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // PATCH /api/notebooks/:id â€” Mise Ã  jour d'un notebook
  router.patch("/:id", (req: Request, res: Response) => {
    try {
      const { title, description, color, icon } = req.body;
      const updated = notebookManager.updateNotebook(req.params.id, { title, description, color, icon });
      if (!updated) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      res.json({ status: "success", notebook: updated });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/notebooks/:id â€” Supprime un notebook
  router.delete("/:id", (req: Request, res: Response) => {
    try {
      const success = notebookManager.deleteNotebook(req.params.id);
      if (!success) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      res.json({ status: "success", message: "Notebook supprimÃ©." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/stats â€” Statistiques globales
  router.get("/stats/global", (_req: Request, res: Response) => {
    try {
      const stats = notebookManager.getStats();
      res.json({ status: "success", stats });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // SOURCES
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // POST /api/notebooks/:id/sources/upload â€” Upload un fichier comme source
  router.post("/:id/sources/upload", upload.single("file"), async (req: Request, res: Response) => {
    try {
      const notebookId = req.params.id;
      const notebook = notebookManager.getNotebook(notebookId);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: "Aucun fichier fourni." });
        return;
      }

      const source = await sourceIngester.ingestFromBuffer(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        notebookId
      );

      notebookManager.addSource(notebookId, source);

      res.json({
        status: "success",
        source: {
          id: source.id,
          title: source.title,
          type: source.type,
          summary: source.summary,
          keywords: source.keywords,
          wordCount: source.wordCount,
          chunksCount: source.chunks.length,
          language: source.language,
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/notebooks/:id/sources/upload-multi â€” Upload plusieurs fichiers simultanÃ©ment
  router.post("/:id/sources/upload-multi", upload.array("files", 20), async (req: Request, res: Response) => {
    try {
      const notebookId = req.params.id;
      const notebook = notebookManager.getNotebook(notebookId);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }

      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        res.status(400).json({ error: "Aucun fichier fourni." });
        return;
      }

      // IngÃ©rer chaque fichier (sÃ©quentiellement pour Ã©viter les rate limits API)
      const results: Array<{
        filename: string;
        status: "success" | "error";
        source?: any;
        error?: string;
      }> = [];

      for (const file of files) {
        try {
          const source = await sourceIngester.ingestFromBuffer(
            file.buffer,
            file.originalname,
            file.mimetype,
            notebookId
          );
          notebookManager.addSource(notebookId, source);

          results.push({
            filename: file.originalname,
            status: "success",
            source: {
              id: source.id,
              title: source.title,
              type: source.type,
              summary: source.summary,
              keywords: source.keywords,
              wordCount: source.wordCount,
              chunksCount: source.chunks.length,
              language: source.language,
            },
          });
        } catch (e: any) {
          results.push({
            filename: file.originalname,
            status: "error",
            error: e.message,
          });
        }
      }

      const successCount = results.filter(r => r.status === "success").length;
      const errorCount = results.filter(r => r.status === "error").length;

      res.json({
        status: errorCount === 0 ? "success" : (successCount > 0 ? "partial" : "error"),
        total: files.length,
        successCount,
        errorCount,
        results,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/notebooks/:id/sources/upload-queued â€” Upload via la queue de processing (non-bloquant)
  router.post("/:id/sources/upload-queued", upload.array("files", 20), (req: Request, res: Response) => {
    try {
      const notebookId = req.params.id;
      const notebook = notebookManager.getNotebook(notebookId);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }

      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        res.status(400).json({ error: "Aucun fichier fourni." });
        return;
      }

      const priority = (req.body.priority as "urgent" | "normal" | "low") || "normal";
      const taskIds: string[] = [];

      for (const file of files) {
        const taskId = `src-${notebookId.slice(0, 8)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const task = sourceProcessingQueue.enqueue(
          taskId,
          "source-ingest",
          {
            notebookId,
            fileName: file.originalname,
            mimeType: file.mimetype,
            buffer: file.buffer,
          },
          { priority }
        );

        if (task) {
          taskIds.push(task.id);
        }
      }

      res.json({
        status: "success",
        message: `${taskIds.length} fichier(s) ajoutÃ©(s) Ã  la queue de processing.`,
        taskIds,
        queueStats: sourceProcessingQueue.getStats(),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/notebooks/:id/sources/url â€” IngÃ¨re une URL comme source
  router.post("/:id/sources/url", async (req: Request, res: Response) => {
    try {
      const notebookId = req.params.id;
      const notebook = notebookManager.getNotebook(notebookId);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }

      const { url } = req.body;
      if (!url || typeof url !== "string") {
        res.status(400).json({ error: "Le champ 'url' est requis." });
        return;
      }

      const source = await sourceIngester.ingestFromURL(url, notebookId);
      notebookManager.addSource(notebookId, source);

      res.json({
        status: "success",
        source: {
          id: source.id,
          title: source.title,
          type: source.type,
          summary: source.summary,
          keywords: source.keywords,
          wordCount: source.wordCount,
          chunksCount: source.chunks.length,
          language: source.language,
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/notebooks/:id/sources/text â€” Ajoute du texte brut comme source
  router.post("/:id/sources/text", async (req: Request, res: Response) => {
    try {
      const notebookId = req.params.id;
      const notebook = notebookManager.getNotebook(notebookId);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }

      const { title, content } = req.body;
      if (!content || typeof content !== "string") {
        res.status(400).json({ error: "Le champ 'content' est requis." });
        return;
      }

      const buffer = Buffer.from(content, "utf-8");
      const source = await sourceIngester.ingestFromBuffer(
        buffer,
        title || "Note collÃ©e",
        "text/plain",
        notebookId
      );
      notebookManager.addSource(notebookId, source);

      res.json({
        status: "success",
        source: {
          id: source.id,
          title: source.title,
          type: source.type,
          summary: source.summary,
          keywords: source.keywords,
          wordCount: source.wordCount,
          chunksCount: source.chunks.length,
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/notebooks/:id/sources/:sourceId â€” Supprime une source
  router.delete("/:id/sources/:sourceId", (req: Request, res: Response) => {
    try {
      const success = notebookManager.removeSource(req.params.id, req.params.sourceId);
      if (!success) {
        res.status(404).json({ error: "Source introuvable." });
        return;
      }
      res.json({ status: "success", message: "Source supprimÃ©e." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/notebooks/:id/sources/:sourceId/reindex â€” Re-indexer une source
  router.post("/:id/sources/:sourceId/reindex", async (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      const source = notebook.sources.find(s => s.id === req.params.sourceId);
      if (!source) {
        res.status(404).json({ error: "Source introuvable." });
        return;
      }

      // Re-index: remove old embeddings and re-embed the chunks
      const { embeddingStore } = await import("../notebooks/EmbeddingStore.js");
      embeddingStore.removeSource(req.params.sourceId, req.params.id);

      // Re-embed all chunks of this source
      const chunks = source.chunks || [];
      if (chunks.length > 0) {
        await embeddingStore.indexChunks(
          chunks.map((c: any) => ({ id: c.id, content: c.content })),
          req.params.sourceId,
          req.params.id
        );
      }

      res.json({ status: "success", chunksCount: chunks.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/:id/sources/:sourceId/content â€” Contenu brut d'une source
  router.get("/:id/sources/:sourceId/content", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      const source = notebook.sources.find(s => s.id === req.params.sourceId);
      if (!source) {
        res.status(404).json({ error: "Source introuvable." });
        return;
      }
      // Return the raw content (stored in source or reconstructed from chunks)
      const content = source.rawText
        || (source.chunks && source.chunks.length > 0
          ? source.chunks.sort((a, b) => a.index - b.index).map(c => c.content).join("\n\n")
          : source.summary || "Contenu non disponible.");
      res.json({ status: "success", content });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/notebooks/:id/sources/:sourceId/tags â€” Ajouter un tag
  router.post("/:id/sources/:sourceId/tags", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      const source = notebook.sources.find(s => s.id === req.params.sourceId);
      if (!source) {
        res.status(404).json({ error: "Source introuvable." });
        return;
      }
      const { tag } = req.body;
      if (!tag || typeof tag !== "string") {
        res.status(400).json({ error: "Le champ 'tag' est requis." });
        return;
      }
      if (!source.keywords.includes(tag.trim())) {
        source.keywords.push(tag.trim());
        notebook.updatedAt = new Date().toISOString();
        notebookManager.persistNotebook(req.params.id);
      }
      res.json({ status: "success", keywords: source.keywords });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/notebooks/:id/sources/:sourceId/tags â€” Supprimer un tag
  router.delete("/:id/sources/:sourceId/tags", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      const source = notebook.sources.find(s => s.id === req.params.sourceId);
      if (!source) {
        res.status(404).json({ error: "Source introuvable." });
        return;
      }
      const { tag } = req.body;
      source.keywords = source.keywords.filter(k => k !== tag);
      notebook.updatedAt = new Date().toISOString();
      notebookManager.persistNotebook(req.params.id);
      res.json({ status: "success", keywords: source.keywords });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // RÃ‰SUMÃ‰ GLOBAL DES SOURCES
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // GET /api/notebooks/:id/sources-summary â€” RÃ©sumÃ© synthÃ©tique de toutes les sources
  router.get("/:id/sources-summary", async (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      if (notebook.sources.length === 0) {
        res.json({ status: "success", summary: null, message: "Aucune source." });
        return;
      }

      // VÃ©rifier si le rÃ©sumÃ© est en cache et Ã  jour
      const cached = (notebook as any)._sourcesSummaryCache as { hash: string; summary: string } | undefined;
      const currentHash = notebook.sources.map(s => s.id).sort().join("|");

      if (cached && cached.hash === currentHash) {
        res.json({ status: "success", summary: cached.summary, cached: true });
        return;
      }

      // Construire le contexte Ã  partir des rÃ©sumÃ©s individuels de chaque source
      const sourcesContext = notebook.sources.map(s =>
        `### ðŸ“„ ${s.title} (${s.type})\n**RÃ©sumÃ© :** ${s.summary}\n**Mots-clÃ©s :** ${s.keywords.join(", ")}\n**Volume :** ${s.wordCount} mots`
      ).join("\n\n");

      const lang = notebook.sources[0]?.language || "fr";
      const langInstruction = lang === "fr" ? "RÃ©ponds en franÃ§ais." : "Reply in English.";

      const prompt = `${langInstruction}

Tu es un assistant de synthÃ¨se documentaire. GÃ©nÃ¨re un rÃ©sumÃ© global et structurÃ© qui combine les informations de TOUTES les sources ci-dessous en un encart cohÃ©rent.

Le rÃ©sumÃ© doit :
- ÃŠtre un paragraphe de synthÃ¨se (3-6 phrases) qui capture l'essence de l'ensemble des sources
- Suivi de bullet-points des points clÃ©s (max 8 points)
- Terminer avec les thÃ¨mes/mots-clÃ©s transversaux

Format Markdown court et lisible (pas de titres # principaux, utilise ** pour le gras et - pour les listes).

SOURCES (${notebook.sources.length}) :
${sourcesContext}

GÃ©nÃ¨re le rÃ©sumÃ© global maintenant.`;

      const { generateText: genText } = await import("../utils/textGeneration");
      const result = await genText({
        prompt,
        temperature: 0.3,
        maxOutputTokens: 1024,
      });

      // Mettre en cache dans le notebook
      (notebook as any)._sourcesSummaryCache = { hash: currentHash, summary: result.text };
      notebookManager.persistNotebook(req.params.id);

      res.json({ status: "success", summary: result.text, cached: false });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/notebooks/:id/sources-summary â€” Invalide le cache du rÃ©sumÃ© (force recalcul)
  router.delete("/:id/sources-summary", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      delete (notebook as any)._sourcesSummaryCache;
      notebookManager.persistNotebook(req.params.id);
      res.json({ status: "success", message: "Cache du rÃ©sumÃ© invalidÃ©." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // CHAT GROUNDÃ‰ (Q&A avec citations)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // POST /api/notebooks/:id/chat â€” Poser une question
  router.post("/:id/chat", async (req: Request, res: Response) => {
    try {
      const { question } = req.body;
      if (!question || typeof question !== "string") {
        res.status(400).json({ error: "Le champ 'question' est requis." });
        return;
      }

      const message = await groundedChat.ask(req.params.id, question.trim());
      res.json({ status: "success", message });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/notebooks/:id/chat/stream â€” Poser une question (SSE streaming)
  router.post("/:id/chat/stream", async (req: Request, res: Response) => {
    try {
      const { question, threadId } = req.body;
      if (!question || typeof question !== "string") {
        res.status(400).json({ error: "Le champ 'question' est requis." });
        return;
      }

      // Headers SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      // Envoyer un event "start" pour confirmer la connexion
      res.write(`event: start\ndata: ${JSON.stringify({ status: "streaming" })}\n\n`);

      // Stream la rÃ©ponse chunk par chunk
      const message = await groundedChat.askStream(
        req.params.id,
        question.trim(),
        (chunk: string) => {
          res.write(`event: chunk\ndata: ${JSON.stringify({ text: chunk })}\n\n`);
        }
      );

      // Si un threadId est fourni, sauvegarder aussi dans le thread
      if (threadId) {
        const notebook = notebookManager.getNotebook(req.params.id);
        if (notebook?.chatThreads) {
          const thread = notebook.chatThreads.find((t: any) => t.id === threadId);
          if (thread) {
            // Ajouter la question utilisateur et la rÃ©ponse
            thread.messages.push({
              id: `msg-${Date.now()}-u`,
              role: 'user',
              content: question.trim(),
              citations: [],
              timestamp: new Date().toISOString(),
            });
            thread.messages.push(message);
            // Mettre Ã  jour le titre du thread si c'est le premier message
            if (thread.messages.length <= 2) {
              thread.title = question.trim().slice(0, 50) + (question.length > 50 ? '...' : '');
            }
            notebookManager.persistNotebook(req.params.id);
          }
        }
      }

      // GÃ©nÃ©rer les follow-ups en parallÃ¨le
      let followUps: string[] = [];
      try {
        followUps = await groundedChat.generateFollowUps(req.params.id);
      } catch { /* ignore */ }

      // Envoyer le message final complet avec citations et follow-ups
      res.write(`event: done\ndata: ${JSON.stringify({ message, followUps })}\n\n`);
      res.end();
    } catch (e: any) {
      // Si les headers SSE sont dÃ©jÃ  envoyÃ©s, envoyer l'erreur en event
      if (res.headersSent) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: e.message })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: e.message });
      }
    }
  });

  // GET /api/notebooks/:id/chat/follow-ups â€” Questions de suivi contextuelles
  router.get("/:id/chat/follow-ups", async (req: Request, res: Response) => {
    try {
      const followUps = await groundedChat.generateFollowUps(req.params.id);
      res.json({ status: "success", followUps });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/notebooks/:id/chat/deep-dive â€” Mode exploration approfondie (SSE)
  router.post("/:id/chat/deep-dive", async (req: Request, res: Response) => {
    try {
      const { question } = req.body;
      if (!question || typeof question !== "string") {
        res.status(400).json({ error: "Le champ 'question' est requis." });
        return;
      }

      // Headers SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      res.write(`event: start\ndata: ${JSON.stringify({ mode: "deep-dive" })}\n\n`);

      const message = await groundedChat.deepDive(
        req.params.id,
        question.trim(),
        (stage: string, content: string) => {
          res.write(`event: progress\ndata: ${JSON.stringify({ stage, content })}\n\n`);
        }
      );

      // Follow-ups aprÃ¨s deep dive
      let followUps: string[] = [];
      try {
        followUps = await groundedChat.generateFollowUps(req.params.id);
      } catch { /* ignore */ }

      res.write(`event: done\ndata: ${JSON.stringify({ message, followUps })}\n\n`);
      res.end();
    } catch (e: any) {
      if (res.headersSent) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: e.message })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: e.message });
      }
    }
  });

  // GET /api/notebooks/:id/chat/history â€” Historique du chat
  router.get("/:id/chat/history", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      const threadId = req.query.threadId as string | undefined;
      if (threadId && notebook.chatThreads) {
        const thread = notebook.chatThreads.find((t: any) => t.id === threadId);
        res.json({ status: "success", messages: thread?.messages || [] });
      } else {
        res.json({ status: "success", messages: notebook.chatHistory });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/:id/chat/threads â€” Liste des threads
  router.get("/:id/chat/threads", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      const threads = (notebook.chatThreads || []).map((t: any) => ({
        id: t.id,
        title: t.title,
        createdAt: t.createdAt,
      }));
      res.json({ status: "success", threads });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/notebooks/:id/chat/threads â€” CrÃ©er un thread
  router.post("/:id/chat/threads", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      if (!notebook.chatThreads) notebook.chatThreads = [];

      const thread = {
        id: `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: req.body.title || `Conversation ${notebook.chatThreads.length + 1}`,
        messages: [],
        createdAt: new Date().toISOString(),
      };
      notebook.chatThreads.push(thread);
      notebook.updatedAt = new Date().toISOString();
      notebookManager.persistNotebook(req.params.id);

      res.json({ status: "success", thread: { id: thread.id, title: thread.title, createdAt: thread.createdAt } });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/notebooks/:id/chat/threads/:threadId â€” Supprimer un thread
  router.delete("/:id/chat/threads/:threadId", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      if (notebook.chatThreads) {
        notebook.chatThreads = notebook.chatThreads.filter((t: any) => t.id !== req.params.threadId);
        notebook.updatedAt = new Date().toISOString();
        notebookManager.persistNotebook(req.params.id);
      }
      res.json({ status: "success" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/notebooks/:id/chat/feedback â€” Feedback thumbs up/down
  router.post("/:id/chat/feedback", (req: Request, res: Response) => {
    try {
      const { messageId, feedback } = req.body;
      // Store feedback (for now just acknowledge â€” could persist for analytics)
      res.json({ status: "success", messageId, feedback });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/notebooks/:id/chat/history â€” Effacer l'historique
  router.delete("/:id/chat/history", (req: Request, res: Response) => {
    try {
      notebookManager.clearChatHistory(req.params.id);
      res.json({ status: "success", message: "Historique effacÃ©." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/:id/chat/suggestions â€” Questions suggÃ©rÃ©es
  router.get("/:id/chat/suggestions", async (req: Request, res: Response) => {
    try {
      const suggestions = await groundedChat.suggestQuestions(req.params.id);
      res.json({ status: "success", suggestions });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/:id/chat/export â€” Exporter la conversation en Markdown
  router.get("/:id/chat/export", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }

      if (notebook.chatHistory.length === 0) {
        res.status(400).json({ error: "Aucun message Ã  exporter." });
        return;
      }

      const format = (req.query.format as string) || "markdown";

      // Construire le Markdown
      const lines: string[] = [];
      lines.push(`# Chat â€” ${notebook.title}`);
      lines.push(`> ExportÃ© le ${new Date().toLocaleString("fr-FR")}`);
      lines.push(`> ${notebook.chatHistory.length} messages\n`);
      lines.push("---\n");

      for (const msg of notebook.chatHistory) {
        const role = msg.role === "user" ? "ðŸ§‘ **Utilisateur**" : "ðŸ¤– **Assistant**";
        const time = new Date(msg.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
        lines.push(`### ${role} â€” ${time}\n`);
        lines.push(msg.content);

        if (msg.citations.length > 0) {
          lines.push("\n<details><summary>ðŸ“š Citations</summary>\n");
          for (const cit of msg.citations) {
            lines.push(`- **${cit.sourceTitle}** (pertinence: ${(cit.relevance * 100).toFixed(0)}%)`);
            lines.push(`  > ${cit.excerpt}\n`);
          }
          lines.push("</details>");
        }
        lines.push("\n---\n");
      }

      const markdown = lines.join("\n");

      if (format === "markdown") {
        const filename = `chat-${notebook.title.replace(/[^a-zA-Z0-9]/g, "-").slice(0, 40)}-${Date.now()}.md`;
        res.setHeader("Content-Type", "text/markdown; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.send(markdown);
      } else {
        // JSON fallback (le frontend peut convertir en PDF cÃ´tÃ© client)
        res.json({ status: "success", markdown, title: notebook.title });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/:id/chat/chunk/:chunkId â€” RÃ©cupÃ©rer le contenu complet d'un chunk (pour hover citations)
  router.get("/:id/chat/chunk/:chunkId", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }

      const chunkId = req.params.chunkId;

      // Chercher le chunk dans toutes les sources
      for (const source of notebook.sources) {
        const chunk = source.chunks.find(c => c.id === chunkId);
        if (chunk) {
          res.json({
            status: "success",
            chunk: {
              id: chunk.id,
              content: chunk.content,
              sourceTitle: source.title,
              sourceId: source.id,
              index: chunk.index,
              metadata: chunk.metadata,
            },
          });
          return;
        }
      }

      res.status(404).json({ error: "Chunk introuvable." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/notebooks/:id/chat/compare â€” Comparer des sources entre elles (SSE)
  router.post("/:id/chat/compare", async (req: Request, res: Response) => {
    try {
      const { sourceIds } = req.body;
      if (!sourceIds || !Array.isArray(sourceIds) || sourceIds.length < 2) {
        res.status(400).json({ error: "Au moins 2 sourceIds sont requis." });
        return;
      }

      // Headers SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      res.write(`event: start\ndata: ${JSON.stringify({ mode: "compare" })}\n\n`);

      const message = await groundedChat.compareSources(
        req.params.id,
        sourceIds,
        (chunk: string) => {
          res.write(`event: chunk\ndata: ${JSON.stringify({ text: chunk })}\n\n`);
        }
      );

      let followUps: string[] = [];
      try {
        followUps = await groundedChat.generateFollowUps(req.params.id);
      } catch { /* ignore */ }

      res.write(`event: done\ndata: ${JSON.stringify({ message, followUps })}\n\n`);
      res.end();
    } catch (e: any) {
      if (res.headersSent) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: e.message })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: e.message });
      }
    }
  });

  // POST /api/notebooks/:id/chat/insights â€” Extraire les insights des sources (SSE)
  router.post("/:id/chat/insights", async (req: Request, res: Response) => {
    try {
      // Headers SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      res.write(`event: start\ndata: ${JSON.stringify({ mode: "insights" })}\n\n`);

      const message = await groundedChat.extractInsights(
        req.params.id,
        (chunk: string) => {
          res.write(`event: chunk\ndata: ${JSON.stringify({ text: chunk })}\n\n`);
        }
      );

      let followUps: string[] = [];
      try {
        followUps = await groundedChat.generateFollowUps(req.params.id);
      } catch { /* ignore */ }

      res.write(`event: done\ndata: ${JSON.stringify({ message, followUps })}\n\n`);
      res.end();
    } catch (e: any) {
      if (res.headersSent) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: e.message })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: e.message });
      }
    }
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // NOTES
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // POST /api/notebooks/:id/notes â€” CrÃ©er une note
  router.post("/:id/notes", (req: Request, res: Response) => {
    try {
      const { title, content } = req.body;
      if (!title) {
        res.status(400).json({ error: "Le champ 'title' est requis." });
        return;
      }
      const note = notebookManager.addNote(req.params.id, title, content || "");
      if (!note) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      res.json({ status: "success", note });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // PATCH /api/notebooks/:id/notes/:noteId â€” Modifier une note
  router.patch("/:id/notes/:noteId", (req: Request, res: Response) => {
    try {
      const { title, content, pinned } = req.body;
      const note = notebookManager.updateNote(req.params.id, req.params.noteId, { title, content, pinned });
      if (!note) {
        res.status(404).json({ error: "Note introuvable." });
        return;
      }
      res.json({ status: "success", note });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/notebooks/:id/notes/:noteId â€” Supprimer une note
  router.delete("/:id/notes/:noteId", (req: Request, res: Response) => {
    try {
      const success = notebookManager.deleteNote(req.params.id, req.params.noteId);
      if (!success) {
        res.status(404).json({ error: "Note introuvable." });
        return;
      }
      res.json({ status: "success", message: "Note supprimÃ©e." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // GÃ‰NÃ‰RATION DE CONTENU
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // POST /api/notebooks/:id/generate â€” GÃ©nÃ©rer un document dÃ©rivÃ©
  router.post("/:id/generate", async (req: Request, res: Response) => {
    try {
      const { type, sourceIds, language, customInstructions } = req.body;
      const validTypes: GeneratedDocType[] = ["summary", "faq", "study-guide", "briefing", "timeline", "outline", "mindmap", "swot", "glossary", "infographic", "full-report", "report-business", "report-market", "report-technical", "report-competitive", "report-financial", "report-marketing", "report-product", "report-risk", "report-executive", "report-project"];

      if (!type || !validTypes.includes(type)) {
        res.status(400).json({
          error: `Le champ 'type' doit Ãªtre l'un de: ${validTypes.join(", ")}`,
        });
        return;
      }

      const doc = await contentGenerator.generate(req.params.id, type, { sourceIds, language, customInstructions });
      res.json({ status: "success", document: doc });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/notebooks/:id/generate/stream â€” GÃ©nÃ©rer un document dÃ©rivÃ© (SSE streaming)
  router.post("/:id/generate/stream", async (req: Request, res: Response) => {
    try {
      const { type, sourceIds, language, customInstructions } = req.body;
      const validTypes: GeneratedDocType[] = ["summary", "faq", "study-guide", "briefing", "timeline", "outline", "mindmap", "swot", "glossary", "infographic", "full-report", "report-business", "report-market", "report-technical", "report-competitive", "report-financial", "report-marketing", "report-product", "report-risk", "report-executive", "report-project"];

      if (!type || !validTypes.includes(type)) {
        res.status(400).json({
          error: `Le champ 'type' doit Ãªtre l'un de: ${validTypes.join(", ")}`,
        });
        return;
      }

      // Headers SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      res.write(`event: start\ndata: ${JSON.stringify({ type, status: "generating" })}\n\n`);

      const doc = await contentGenerator.generate(req.params.id, type, {
        sourceIds,
        language,
        customInstructions,
        onChunk: (chunk: string) => {
          res.write(`event: chunk\ndata: ${JSON.stringify({ text: chunk })}\n\n`);
        },
      });

      res.write(`event: done\ndata: ${JSON.stringify({ document: doc })}\n\n`);
      res.end();
    } catch (e: any) {
      if (res.headersSent) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: e.message })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: e.message });
      }
    }
  });

  // GET /api/notebooks/:id/generated â€” Liste des documents gÃ©nÃ©rÃ©s
  router.get("/:id/generated", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      res.json({ status: "success", documents: notebook.generatedDocuments });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/notebooks/:id/generated/:docId â€” Supprimer un document gÃ©nÃ©rÃ©
  router.delete("/:id/generated/:docId", (req: Request, res: Response) => {
    try {
      const success = notebookManager.deleteGeneratedDocument(req.params.id, req.params.docId);
      if (!success) {
        res.status(404).json({ error: "Document introuvable." });
        return;
      }
      res.json({ status: "success", message: "Document supprimÃ©." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/:id/report-suggestions â€” Suggestions de rapports basÃ©es sur les sources
  router.get("/:id/report-suggestions", async (req: Request, res: Response) => {
    try {
      const suggestions: ReportSuggestion[] = await contentGenerator.suggestReports(req.params.id);
      res.json({ status: "success", suggestions });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // AUDIO OVERVIEW (Podcast)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // POST /api/notebooks/:id/audio-overview â€” GÃ©nÃ©rer un podcast
  router.post("/:id/audio-overview", async (req: Request, res: Response) => {
    try {
      const { language, duration, sourceIds, tone, customInstructions } = req.body;
      const overview = await contentGenerator.generateAudioOverview(req.params.id, {
        language, duration, sourceIds, tone, customInstructions,
      });
      res.json({ status: "success", overview });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/notebooks/:id/audio-overviews/:overviewId/tts â€” GÃ©nÃ©rer l'audio TTS du podcast (SSE streaming)
  router.post("/:id/audio-overviews/:overviewId/tts", async (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }

      const overview = notebook.audioOverviews?.find((o: any) => o.id === req.params.overviewId);
      if (!overview || overview.status !== "ready") {
        res.status(404).json({ error: "Audio overview introuvable ou pas prÃªt." });
        return;
      }

      const { generateSpeech } = await import("../utils/geminiTTS");

      // Voix naturelles Kokoro pour les deux hÃ´tes
      // ff_siwis = voix fÃ©minine franÃ§aise (Alex)
      // am_adam = voix masculine anglaise naturelle (Sam) â€” ou af_jessica pour fÃ©minine
      const alexVoice = req.body.alexVoice || "ff_siwis";
      const samVoice = req.body.samVoice || "Puck";

      // DÃ©couper le script en rÃ©pliques
      const lines = overview.script.split("\n").filter((l: string) => l.trim());
      const dialogueLines: { speaker: string; text: string }[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        const isAlex = trimmed.startsWith("Alex:") || trimmed.startsWith("Alex :");
        const isSam = trimmed.startsWith("Sam:") || trimmed.startsWith("Sam :");

        if (isAlex) {
          dialogueLines.push({ speaker: "alex", text: trimmed.replace(/^Alex\s*:\s*/i, "") });
        } else if (isSam) {
          dialogueLines.push({ speaker: "sam", text: trimmed.replace(/^Sam\s*:\s*/i, "") });
        } else if (trimmed) {
          // Narration / didascalie â€” on la donne Ã  Alex par dÃ©faut
          dialogueLines.push({ speaker: "alex", text: trimmed });
        }
      }

      if (dialogueLines.length === 0) {
        res.status(400).json({ error: "Le script ne contient aucune rÃ©plique." });
        return;
      }

      // Headers SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      res.write(`event: start\ndata: ${JSON.stringify({ total: dialogueLines.length })}\n\n`);

      for (let i = 0; i < dialogueLines.length; i++) {
        const { speaker, text } = dialogueLines[i];
        const voice = speaker === "alex" ? alexVoice : samVoice;

        try {
          const audioBase64 = await generateSpeech(text, { voiceName: voice });
          if (audioBase64) {
            res.write(`event: chunk\ndata: ${JSON.stringify({
              index: i,
              speaker,
              text,
              audio: audioBase64,
            })}\n\n`);
          } else {
            res.write(`event: skip\ndata: ${JSON.stringify({ index: i, speaker, reason: "no audio" })}\n\n`);
          }
        } catch (ttsErr: any) {
          res.write(`event: skip\ndata: ${JSON.stringify({ index: i, speaker, reason: ttsErr.message })}\n\n`);
        }
      }

      res.write(`event: done\ndata: ${JSON.stringify({ totalGenerated: dialogueLines.length })}\n\n`);
      res.end();
    } catch (e: any) {
      if (res.headersSent) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: e.message })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: e.message });
      }
    }
  });

  // GET /api/notebooks/:id/audio-overviews â€” Liste des audio overviews
  router.get("/:id/audio-overviews", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      res.json({ status: "success", overviews: notebook.audioOverviews });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/notebooks/:id/audio-overviews/:overviewId â€” Supprimer un audio overview
  router.delete("/:id/audio-overviews/:overviewId", (req: Request, res: Response) => {
    try {
      const success = notebookManager.deleteAudioOverview(req.params.id, req.params.overviewId);
      if (!success) {
        res.status(404).json({ error: "Audio overview introuvable." });
        return;
      }
      res.json({ status: "success", message: "Audio overview supprimÃ©." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/:id/audio-overviews/:overviewId/export â€” Exporter le script audio en Markdown
  router.get("/:id/audio-overviews/:overviewId/export", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }

      const overview = notebook.audioOverviews?.find((o: any) => o.id === req.params.overviewId);
      if (!overview) {
        res.status(404).json({ error: "Audio overview introuvable." });
        return;
      }

      // Construire le Markdown
      const lines: string[] = [];
      lines.push(`# ðŸŽ™ï¸ ${overview.title}`);
      lines.push("");
      lines.push(`> ExportÃ© le ${new Date().toLocaleString("fr-FR")}`);
      lines.push(`> DurÃ©e estimÃ©e : ${Math.floor(overview.estimatedDuration / 60)}:${(overview.estimatedDuration % 60).toString().padStart(2, "0")}`);
      lines.push("");
      lines.push("---");
      lines.push("");

      // Formater le script
      const scriptLines = overview.script.split("\n");
      for (const line of scriptLines) {
        const trimmed = line.trim();
        if (!trimmed) {
          lines.push("");
          continue;
        }

        const isAlex = trimmed.startsWith("Alex:") || trimmed.startsWith("Alex :");
        const isSam = trimmed.startsWith("Sam:") || trimmed.startsWith("Sam :");

        if (isAlex) {
          const text = trimmed.replace(/^Alex\s*:\s*/i, "");
          lines.push(`**ðŸ§‘ Alex :** ${text}`);
          lines.push("");
        } else if (isSam) {
          const text = trimmed.replace(/^Sam\s*:\s*/i, "");
          lines.push(`**ðŸ¤– Sam :** ${text}`);
          lines.push("");
        } else {
          lines.push(`*${trimmed}*`);
          lines.push("");
        }
      }

      lines.push("---");
      lines.push("");
      lines.push(`*Script gÃ©nÃ©rÃ© le ${new Date(overview.createdAt).toLocaleString("fr-FR")}*`);

      const markdown = lines.join("\n");

      const saveToWorkspace = req.query.save === "true" || req.query.save === "sandbox";
      const saveToSandbox = req.query.save === "sandbox";

      if (saveToWorkspace) {
        // DÃ©terminer le rÃ©pertoire cible
        const targetRoot = saveToSandbox ? getSandboxRoot() : getProjectRoot();

        const filename = `audio-script-${overview.title.replace(/[^a-zA-Z0-9Ã Ã¢Ã¤Ã©Ã¨ÃªÃ«Ã¯Ã®Ã´Ã¹Ã»Ã¼Ã¿Ã§Ã€Ã‚Ã„Ã‰ÃˆÃŠÃ‹ÃÃŽÃ”Ã™Ã›ÃœÅ¸Ã‡ ]/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 50)}.md`;
        const filePath = path.join(targetRoot, filename);
        // CrÃ©er le rÃ©pertoire si nÃ©cessaire (sandbox peut ne pas exister)
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, markdown, "utf-8");

        res.json({
          status: "success",
          message: saveToSandbox ? `Script audio sauvegardÃ© dans la sandbox` : `Script sauvegardÃ© dans le workspace`,
          filePath: filename,
          destination: saveToSandbox ? "sandbox" : "workspace",
          markdown,
        });
      } else {
        // TÃ©lÃ©chargement direct
        const filename = `audio-script-${overview.title.replace(/[^a-zA-Z0-9]/g, "-").slice(0, 40)}-${Date.now()}.md`;
        res.setHeader("Content-Type", "text/markdown; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.send(markdown);
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // EMBEDDINGS (gestion des vecteurs)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // POST /api/notebooks/:id/embeddings/reindex â€” Re-vectoriser toutes les sources
  router.post("/:id/embeddings/reindex", async (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }

      let totalIndexed = 0;
      for (const source of notebook.sources) {
        const indexed = await embeddingStore.indexChunks(
          source.chunks.map(c => ({ id: c.id, content: c.content })),
          source.id,
          notebook.id
        );
        totalIndexed += indexed;
      }

      res.json({
        status: "success",
        message: `${totalIndexed} chunks vectorisÃ©s sur ${notebook.sources.reduce((acc, s) => acc + s.chunks.length, 0)} total.`,
        indexed: totalIndexed,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/:id/embeddings/stats â€” Stats des embeddings
  router.get("/:id/embeddings/stats", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }

      const stats = embeddingStore.getStats(req.params.id);
      const totalChunks = notebook.sources.reduce((acc, s) => acc + s.chunks.length, 0);

      res.json({
        status: "success",
        stats: {
          indexed: stats.total,
          totalChunks,
          coverage: totalChunks > 0 ? Math.round((stats.total / totalChunks) * 100) : 0,
          bySource: Object.fromEntries(stats.bySource),
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/embeddings/memory â€” Stats mÃ©moire globales des embeddings
  router.get("/embeddings/memory", (_req: Request, res: Response) => {
    try {
      const memStats = embeddingStore.getMemoryStats();
      res.json({ status: "success", memory: memStats });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // BACKUP (sauvegarde & restauration)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // POST /api/notebooks/backup/run â€” Lancer un backup manuel
  router.post("/backup/run", async (_req: Request, res: Response) => {
    try {
      const metadata = await backupService.runBackup();
      if (!metadata) {
        res.json({ status: "success", message: "Aucune modification Ã  sauvegarder." });
        return;
      }
      res.json({ status: "success", backup: metadata });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/backup/list â€” Lister les backups disponibles
  router.get("/backup/list", (_req: Request, res: Response) => {
    try {
      const backups = backupService.listBackups();
      res.json({ status: "success", backups });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/notebooks/backup/restore â€” Restaurer depuis un backup
  router.post("/backup/restore", (req: Request, res: Response) => {
    try {
      const { backupId, notebookId } = req.body;
      if (!backupId || typeof backupId !== "string") {
        res.status(400).json({ error: "Le champ 'backupId' est requis." });
        return;
      }

      if (notebookId) {
        // Restaurer un seul notebook
        const success = backupService.restoreNotebook(backupId, notebookId);
        if (!success) {
          res.status(404).json({ error: "Backup ou notebook introuvable." });
          return;
        }
        res.json({ status: "success", message: `Notebook ${notebookId} restaurÃ©.` });
      } else {
        // Restaurer tous les notebooks du backup
        const result = backupService.restoreAll(backupId);
        res.json({ status: "success", ...result });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/backup/config â€” Configuration des backups
  router.get("/backup/config", (_req: Request, res: Response) => {
    try {
      res.json({ status: "success", config: backupService.getConfig() });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // PATCH /api/notebooks/backup/config â€” Modifier la configuration
  router.patch("/backup/config", (req: Request, res: Response) => {
    try {
      const { intervalMs, maxBackups, enabled } = req.body;
      backupService.updateConfig({ intervalMs, maxBackups, enabled });
      res.json({ status: "success", config: backupService.getConfig() });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // QUEUE (file d'attente de processing)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // GET /api/notebooks/queue/stats â€” Statistiques de la queue
  router.get("/queue/stats", (_req: Request, res: Response) => {
    try {
      const stats = sourceProcessingQueue.getStats();
      res.json({ status: "success", stats });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/queue/pending â€” TÃ¢ches en attente
  router.get("/queue/pending", (_req: Request, res: Response) => {
    try {
      const pending = sourceProcessingQueue.getPending().map(t => ({
        id: t.id,
        type: t.type,
        priority: t.priority,
        status: t.status,
        attempts: t.attempts,
        createdAt: t.createdAt,
        progress: t.progress,
      }));
      res.json({ status: "success", tasks: pending });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/queue/processing â€” TÃ¢ches en cours
  router.get("/queue/processing", (_req: Request, res: Response) => {
    try {
      const processing = sourceProcessingQueue.getProcessing().map(t => ({
        id: t.id,
        type: t.type,
        priority: t.priority,
        status: t.status,
        attempts: t.attempts,
        startedAt: t.startedAt,
        progress: t.progress,
      }));
      res.json({ status: "success", tasks: processing });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/queue/task/:taskId â€” Statut d'une tÃ¢che
  router.get("/queue/task/:taskId", (req: Request, res: Response) => {
    try {
      const task = sourceProcessingQueue.getTask(req.params.taskId);
      if (!task) {
        res.status(404).json({ error: "TÃ¢che introuvable." });
        return;
      }
      res.json({
        status: "success",
        task: {
          id: task.id,
          type: task.type,
          priority: task.priority,
          status: task.status,
          attempts: task.attempts,
          maxAttempts: task.maxAttempts,
          progress: task.progress,
          error: task.error,
          createdAt: task.createdAt,
          startedAt: task.startedAt,
          completedAt: task.completedAt,
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/notebooks/queue/task/:taskId â€” Annuler une tÃ¢che
  router.delete("/queue/task/:taskId", (req: Request, res: Response) => {
    try {
      const success = sourceProcessingQueue.cancel(req.params.taskId);
      if (!success) {
        res.status(404).json({ error: "TÃ¢che introuvable ou dÃ©jÃ  en cours." });
        return;
      }
      res.json({ status: "success", message: "TÃ¢che annulÃ©e." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/notebooks/queue/clear â€” Vider la queue
  router.delete("/queue/clear", (_req: Request, res: Response) => {
    try {
      sourceProcessingQueue.clear();
      res.json({ status: "success", message: "Queue vidÃ©e." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // CACHE (statistiques & contrÃ´le)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // GET /api/notebooks/cache/stats â€” Statistiques du cache
  router.get("/cache/stats", (_req: Request, res: Response) => {
    try {
      const chatStats = chatResponseCache.getStats();
      const ragStats = ragSearchCache.getStats();
      res.json({
        status: "success",
        chat: chatStats,
        rag: ragStats,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/notebooks/cache/clear â€” Vider le cache
  router.delete("/cache/clear", (_req: Request, res: Response) => {
    try {
      chatResponseCache.clear();
      ragSearchCache.clear();
      res.json({ status: "success", message: "Cache vidÃ©." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/notebooks/cache/:notebookId â€” Invalider le cache d'un notebook
  router.delete("/cache/:notebookId", (req: Request, res: Response) => {
    try {
      const chatInvalidated = chatResponseCache.invalidateNotebook(req.params.notebookId);
      const ragInvalidated = ragSearchCache.invalidateNotebook(req.params.notebookId);
      res.json({
        status: "success",
        invalidated: { chat: chatInvalidated, rag: ragInvalidated },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

