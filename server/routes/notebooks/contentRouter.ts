import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { notebookManager, contentGenerator } from "../../notebooks/index.js";
import { enqueueSourceIngestion } from "../../notebooks/queueSourceIngestion.js";
import type { GeneratedDocType, ReportSuggestion } from "../../notebooks/types.js";
import { buildRevealPresentation, countSlides } from "./slidesTheme.js";
import { getSandboxRoot } from "../../utils/sandbox.js";

const IMAGE_CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

/**
 * Types de documents générés dont le `content` est un blob JSON (image, data D3)
 * plutôt que de la prose : non promouvables en source textuelle telle quelle.
 */
const NON_PROSE_DOC_TYPES = new Set<string>(["infographic", "visualization", "chart"]);

/** Types acceptés par /generate et /generate/stream. */
const GENERATABLE_TYPES: GeneratedDocType[] = [
  "summary", "faq", "study-guide", "briefing", "timeline", "outline", "mindmap", "swot", "glossary",
  "infographic", "full-report", "roadmap", "comparative-analysis", "synthesis-report",
  "report-business", "report-market", "report-technical", "report-competitive", "report-financial",
  "report-marketing", "report-product", "report-risk", "report-executive", "report-project",
];
import { SELF_ROOT } from "../../utils/selfRoot.js";

export function createContentRouter(): Router {
  const router = Router();

  // Refuser les identifiants appartenant à un autre workspace avant toute
  // lecture, mutation, génération, export ou réindexation.
  router.use("/:id", (req: Request, res: Response, next) => {
    if (!notebookManager.getNotebook(req.params.id, SELF_ROOT || undefined)) {
      res.status(404).json({ error: "Notebook introuvable dans le workspace actif." });
      return;
    }
    next();
  });

  router.post("/:id/generate", async (req: Request, res: Response): Promise<void> => {
    try {
      const { type, sourceIds, language, customInstructions, imageModel, notebookModel } = req.body;

      if (!type || !GENERATABLE_TYPES.includes(type)) {
        res.status(400).json({
          error: `Le champ 'type' doit être l'un de: ${GENERATABLE_TYPES.join(", ")}`,
        });
        return;
      }

      const doc = await contentGenerator.generate(req.params.id, type, { sourceIds, language, customInstructions, imageModel, notebookModel });
      res.json({ status: "success", document: doc });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/:id/generate/stream", async (req: Request, res: Response): Promise<void> => {
    try {
      const { type, sourceIds, language, customInstructions, imageModel, notebookModel } = req.body;

      if (!type || !GENERATABLE_TYPES.includes(type)) {
        res.status(400).json({
          error: `Le champ 'type' doit être l'un de: ${GENERATABLE_TYPES.join(", ")}`,
        });
        return;
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      // Arrêter la génération si le client annule ou ferme la connexion.
      const abort = new AbortController();
      res.on("close", () => {
        if (!res.writableEnded) abort.abort();
      });

      res.write(`event: start\ndata: ${JSON.stringify({ type, status: "generating" })}\n\n`);

      const doc = await contentGenerator.generate(req.params.id, type, {
        sourceIds,
        language,
        customInstructions,
        imageModel,
        notebookModel,
        signal: abort.signal,
        onChunk: (chunk: string) => {
          if (!abort.signal.aborted) res.write(`event: chunk\ndata: ${JSON.stringify({ text: chunk })}\n\n`);
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

  router.get("/:id/generated", (req: Request, res: Response): void => {
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

  // Sert le fichier image d'un document généré (infographie) depuis la sandbox.
  // Le PNG n'est plus stocké en base64 dans le notebook JSON — il est lu sur disque.
  router.get("/:id/generated/:docId/image", (req: Request, res: Response): void => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }

      const doc = notebook.generatedDocuments.find((d) => d.id === req.params.docId);
      if (!doc) {
        res.status(404).json({ error: "Document introuvable." });
        return;
      }

      // Extraire le chemin relatif de l'image depuis le content JSON.
      let relativePath: string | undefined;
      try {
        const meta = JSON.parse(doc.content);
        relativePath = meta.filePath;
      } catch {
        /* content non-JSON — pas une infographie */
      }

      if (!relativePath || typeof relativePath !== "string") {
        res.status(404).json({ error: "Aucune image associée à ce document." });
        return;
      }

      // Résoudre et confiner le chemin dans la sandbox (anti path-traversal).
      const sandboxRoot = getSandboxRoot();
      const resolved = path.resolve(sandboxRoot, relativePath);
      const sandboxPrefix = path.resolve(sandboxRoot) + path.sep;
      if (!resolved.startsWith(sandboxPrefix)) {
        res.status(400).json({ error: "Chemin d'image invalide." });
        return;
      }

      if (!fs.existsSync(resolved)) {
        res.status(404).json({ error: "Fichier image introuvable sur disque." });
        return;
      }

      const ext = path.extname(resolved).toLowerCase();
      res.setHeader("Content-Type", IMAGE_CONTENT_TYPES[ext] || "application/octet-stream");
      res.setHeader("Cache-Control", "private, max-age=86400");
      fs.createReadStream(resolved)
        .on("error", () => {
          if (!res.headersSent) res.status(500).json({ error: "Erreur lecture image." });
        })
        .pipe(res);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.delete("/:id/generated/:docId", (req: Request, res: Response): void => {
    try {
      const success = notebookManager.deleteGeneratedDocument(req.params.id, req.params.docId);
      if (!success) {
        res.status(404).json({ error: "Document introuvable." });
        return;
      }
      res.json({ status: "success", message: "Document supprimé." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Promouvoir un document généré en source du notebook ──────────────────
  // Le document généré est ingéré comme une vraie source (chunking + embeddings),
  // ce qui le rend immédiatement interrogeable par le chat groundé ET par
  // l'assistant vocal (outil notebook_search), sans reconnexion.
  router.post("/:id/generated/:docId/add-to-sources", async (req: Request, res: Response): Promise<void> => {
    try {
      const notebookId = req.params.id;
      const notebook = notebookManager.getNotebook(notebookId);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }

      const doc = notebook.generatedDocuments.find((d) => d.id === req.params.docId);
      if (!doc) {
        res.status(404).json({ error: "Document introuvable." });
        return;
      }

      if (NON_PROSE_DOC_TYPES.has(doc.type)) {
        res.status(400).json({
          error: "Ce type de document (image/visualisation) ne peut pas être ajouté comme source textuelle.",
        });
        return;
      }

      const content = (doc.content || "").trim();
      if (!content) {
        res.status(400).json({ error: "Le document est vide." });
        return;
      }

      // Éviter les doublons : si une source avec le même titre existe déjà, on refuse.
      const title = doc.title?.trim() || "Document généré";
      if (notebook.sources.some((s) => s.title === title)) {
        res.status(409).json({ error: "Une source portant ce titre existe déjà." });
        return;
      }

      const source = await enqueueSourceIngestion({
        notebookId,
        kind: "buffer",
        buffer: Buffer.from(content, "utf-8"),
        fileName: title,
        mimeType: "text/markdown",
      });

      res.json({
        status: "success",
        source: {
          id: source.sourceId,
          title: source.title,
          type: source.type,
          summary: source.summary,
          keywords: source.keywords,
          wordCount: source.wordCount,
          chunksCount: source.chunksCount,
          language: source.language,
        },
      });
    } catch (e: any) {
      res.status(e.statusCode || 500).json({ error: e.message });
    }
  });

  router.post("/:id/generated/:docId/slides", (req: Request, res: Response): void => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }

      const doc = notebook.generatedDocuments.find((d: any) => d.id === req.params.docId);
      if (!doc) {
        res.status(404).json({ error: "Document introuvable." });
        return;
      }

      const {
        theme = "black",
        transition = "slide",
        ratio = "16:9",
        density = "normal",
      } = req.body as { theme?: string; transition?: string; ratio?: string; density?: string };

      const html = buildRevealPresentation(doc.title, doc.content, { theme, transition, ratio, density });

      res.json({ status: "success", html, slidesCount: countSlides(doc.content, density as any) + 1 });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/:id/report-suggestions", async (req: Request, res: Response): Promise<void> => {
    try {
      const suggestions: ReportSuggestion[] = await contentGenerator.suggestReports(req.params.id);
      res.json({ status: "success", suggestions });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
