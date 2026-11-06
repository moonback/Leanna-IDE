import { Router, Request, Response } from 'express';
import { exportToPdf } from '../export/pdfExporter.js';
import { exportToDocx } from '../export/docxExporter.js';
import { exportToStandaloneHtml } from '../export/htmlExporter.js';
import { notebookManager } from '../notebooks/index.js';
import { SELF_ROOT } from '../utils/selfRoot.js';

const MAX_MARKDOWN_LENGTH = 2 * 1024 * 1024;
const MAX_TITLE_LENGTH = 200;
const MAX_FILENAME_LENGTH = 120;
const NOTEBOOK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const THEMES = new Set(['dark', 'light', 'academic', 'modern']);
const FORMATS = new Set(['pdf', 'doc', 'docx', 'html']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeText(value: unknown, fallback: string, maxLength: number): string | null {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) return null;
  return value.trim() || fallback;
}

function safeDownloadName(value: string, extension: 'pdf' | 'doc' | 'docx' | 'html'): { header: string; filename: string } {
  const base = value
    .normalize('NFKC')
    .replace(/\.[a-z0-9]{1,8}$/i, '')
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_FILENAME_LENGTH) || 'document';
  const filename = `${base}.${extension}`;
  const asciiFallback = filename.normalize('NFKD').replace(/[^\x20-\x7E]/g, '_').replace(/["\\\\]/g, '_');
  return {
    filename,
    header: `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  };
}

function validatePayload(body: unknown): { markdown: string; title: string; filename: string } | null {
  if (!isRecord(body) || typeof body.markdown !== 'string' || !body.markdown.trim() || body.markdown.length > MAX_MARKDOWN_LENGTH) {
    return null;
  }
  const title = safeText(body.title, 'Document Leanna', MAX_TITLE_LENGTH);
  const filename = safeText(body.filename, title || 'document', MAX_FILENAME_LENGTH);
  if (!title || !filename) return null;
  return { markdown: body.markdown, title, filename };
}

function sendValidationError(res: Response, message: string) {
  return res.status(400).json({ status: 'error', error: message });
}

export function createExportRouter(): Router {
  const router = Router();

  router.post('/pdf', async (req: Request, res: Response) => {
    const payload = validatePayload(req.body);
    if (!payload) return sendValidationError(res, 'markdown, title ou filename invalide (markdown requis, 2 Mio maximum).');
    try {
      const buffer = await exportToPdf(payload.markdown, { title: payload.title });
      const download = safeDownloadName(payload.filename, 'pdf');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', download.header);
      res.setHeader('Content-Length', buffer.length);
      return res.send(buffer);
    } catch (error) {
      console.error('[Export] Erreur export PDF:', error);
      return res.status(500).json({ status: 'error', error: 'Erreur lors de la génération du PDF.' });
    }
  });

  // Exporte un véritable document Word OpenXML.
  router.post('/docx', (req: Request, res: Response) => {
    const payload = validatePayload(req.body);
    if (!payload) return sendValidationError(res, 'markdown, title ou filename invalide (markdown requis, 2 Mio maximum).');
    try {
      const buffer = exportToDocx(payload.markdown, { title: payload.title });
      const download = safeDownloadName(payload.filename, 'docx');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', download.header);
      res.setHeader('Content-Length', buffer.length);
      return res.send(buffer);
    } catch (error) {
      console.error('[Export] Erreur export Word:', error);
      return res.status(500).json({ status: 'error', error: 'Erreur lors de la génération du DOCX.' });
    }
  });

  router.post('/html', (req: Request, res: Response) => {
    const payload = validatePayload(req.body);
    if (!payload) return sendValidationError(res, 'markdown, title ou filename invalide (markdown requis, 2 Mio maximum).');
    const theme = req.body.theme === undefined ? 'modern' : req.body.theme;
    if (typeof theme !== 'string' || !THEMES.has(theme)) return sendValidationError(res, 'Thème HTML invalide.');
    try {
      const html = exportToStandaloneHtml(payload.markdown, { title: payload.title, theme: theme as 'dark' | 'light' | 'academic' | 'modern' });
      const download = safeDownloadName(payload.filename, 'html');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', download.header);
      return res.send(html);
    } catch (error) {
      console.error('[Export] Erreur export HTML:', error);
      return res.status(500).json({ status: 'error', error: 'Erreur lors de la génération du HTML.' });
    }
  });

  router.post('/notebook/:id', async (req: Request, res: Response) => {
    const id = req.params.id;
    if (!NOTEBOOK_ID_PATTERN.test(id)) return sendValidationError(res, 'Identifiant de notebook invalide.');
    const body = isRecord(req.body) ? req.body : {};
    const format = body.format === undefined ? 'pdf' : body.format;
    const theme = body.theme === undefined ? 'light' : body.theme;
    if (typeof format !== 'string' || !FORMATS.has(format)) return sendValidationError(res, 'Format demandé invalide (pdf, docx ou html).');
    if (typeof theme !== 'string' || !THEMES.has(theme)) return sendValidationError(res, 'Thème HTML invalide.');

    try {
      const notebook = notebookManager.getNotebook(id, SELF_ROOT || undefined);
      if (!notebook) return res.status(404).json({ status: 'error', error: 'Notebook introuvable.' });

      let markdown = `# 📓 ${notebook.title || 'Notebook'}\n\n`;
      if (notebook.description) markdown += `> ${notebook.description}\n\n`;
      if (notebook.sources?.length) {
        markdown += `## 📚 Sources (${notebook.sources.length})\n\n`;
        for (const source of notebook.sources) {
          markdown += `### ${source.title || source.origin}\n\n`;
          if (source.summary) markdown += `**Résumé :**\n${source.summary}\n\n`;
          if (source.rawText && source.rawText.length < 5000) markdown += `**Extrait :**\n\n${source.rawText.slice(0, 1000)}\n\n`;
        }
      }
      if (notebook.notes?.length) {
        markdown += `## 📝 Notes & Synthèses (${notebook.notes.length})\n\n`;
        for (const note of notebook.notes) markdown += `### ${note.title || 'Note'}\n\n${note.content || ''}\n\n`;
      }
      if (markdown.length > MAX_MARKDOWN_LENGTH) return sendValidationError(res, 'Le notebook dépasse la taille maximale exportable (2 Mio).');

      const title = safeText(notebook.title, 'Notebook', MAX_TITLE_LENGTH);
      if (!title) return sendValidationError(res, 'Titre du notebook invalide.');
      const extension = format === 'doc' || format === 'docx' ? 'docx' : format as 'pdf' | 'html';
      const download = safeDownloadName(title, extension);
      if (format === 'html') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Disposition', download.header);
        return res.send(exportToStandaloneHtml(markdown, { title, theme: theme as 'dark' | 'light' | 'academic' | 'modern' }));
      }
      if (format === 'doc' || format === 'docx') {
        const buffer = exportToDocx(markdown, { title });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', download.header);
        res.setHeader('Content-Length', buffer.length);
        return res.send(buffer);
      }
      const buffer = await exportToPdf(markdown, { title });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', download.header);
      res.setHeader('Content-Length', buffer.length);
      return res.send(buffer);
    } catch (error) {
      console.error('[Export] Erreur export notebook:', error);
      return res.status(500).json({ status: 'error', error: 'Erreur lors de l’export du notebook.' });
    }
  });

  return router;
}

export default createExportRouter;
