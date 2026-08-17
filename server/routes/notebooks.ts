/**
 * Routes API — Notebooks (concurrent NotebookLM)
 *
 * Endpoints pour gérer les notebooks, sources, chat groundé,
 * génération de contenu et audio overviews.
 */

import { Router, Request, Response } from "express";
import multer from "multer";
import { notebookManager, sourceIngester, groundedChat, contentGenerator, embeddingStore } from "../notebooks";
import type { GeneratedDocType } from "../notebooks/types";

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
      cb(new Error(`Type non supporté: ${file.mimetype}`));
    }
  },
});

export function createNotebooksRouter(): Router {
  const router = Router();

  // ═══════════════════════════════════════════════════════════════════════════
  // NOTEBOOKS CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/notebooks — Liste tous les notebooks
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

  // POST /api/notebooks — Crée un nouveau notebook
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

  // GET /api/notebooks/:id — Détail d'un notebook
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

  // PATCH /api/notebooks/:id — Mise à jour d'un notebook
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

  // DELETE /api/notebooks/:id — Supprime un notebook
  router.delete("/:id", (req: Request, res: Response) => {
    try {
      const success = notebookManager.deleteNotebook(req.params.id);
      if (!success) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      res.json({ status: "success", message: "Notebook supprimé." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/stats — Statistiques globales
  router.get("/stats/global", (_req: Request, res: Response) => {
    try {
      const stats = notebookManager.getStats();
      res.json({ status: "success", stats });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SOURCES
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /api/notebooks/:id/sources/upload — Upload un fichier comme source
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

  // POST /api/notebooks/:id/sources/url — Ingère une URL comme source
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

  // POST /api/notebooks/:id/sources/text — Ajoute du texte brut comme source
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
        title || "Note collée",
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

  // DELETE /api/notebooks/:id/sources/:sourceId — Supprime une source
  router.delete("/:id/sources/:sourceId", (req: Request, res: Response) => {
    try {
      const success = notebookManager.removeSource(req.params.id, req.params.sourceId);
      if (!success) {
        res.status(404).json({ error: "Source introuvable." });
        return;
      }
      res.json({ status: "success", message: "Source supprimée." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CHAT GROUNDÉ (Q&A avec citations)
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /api/notebooks/:id/chat — Poser une question
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

  // POST /api/notebooks/:id/chat/stream — Poser une question (SSE streaming)
  router.post("/:id/chat/stream", async (req: Request, res: Response) => {
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

      // Envoyer un event "start" pour confirmer la connexion
      res.write(`event: start\ndata: ${JSON.stringify({ status: "streaming" })}\n\n`);

      // Stream la réponse chunk par chunk
      const message = await groundedChat.askStream(
        req.params.id,
        question.trim(),
        (chunk: string) => {
          res.write(`event: chunk\ndata: ${JSON.stringify({ text: chunk })}\n\n`);
        }
      );

      // Générer les follow-ups en parallèle
      let followUps: string[] = [];
      try {
        followUps = await groundedChat.generateFollowUps(req.params.id);
      } catch { /* ignore */ }

      // Envoyer le message final complet avec citations et follow-ups
      res.write(`event: done\ndata: ${JSON.stringify({ message, followUps })}\n\n`);
      res.end();
    } catch (e: any) {
      // Si les headers SSE sont déjà envoyés, envoyer l'erreur en event
      if (res.headersSent) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: e.message })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: e.message });
      }
    }
  });

  // GET /api/notebooks/:id/chat/follow-ups — Questions de suivi contextuelles
  router.get("/:id/chat/follow-ups", async (req: Request, res: Response) => {
    try {
      const followUps = await groundedChat.generateFollowUps(req.params.id);
      res.json({ status: "success", followUps });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/notebooks/:id/chat/deep-dive — Mode exploration approfondie (SSE)
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

      // Follow-ups après deep dive
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

  // GET /api/notebooks/:id/chat/history — Historique du chat
  router.get("/:id/chat/history", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      res.json({ status: "success", messages: notebook.chatHistory });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/notebooks/:id/chat/history — Effacer l'historique
  router.delete("/:id/chat/history", (req: Request, res: Response) => {
    try {
      notebookManager.clearChatHistory(req.params.id);
      res.json({ status: "success", message: "Historique effacé." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/:id/chat/suggestions — Questions suggérées
  router.get("/:id/chat/suggestions", async (req: Request, res: Response) => {
    try {
      const suggestions = await groundedChat.suggestQuestions(req.params.id);
      res.json({ status: "success", suggestions });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NOTES
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /api/notebooks/:id/notes — Créer une note
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

  // PATCH /api/notebooks/:id/notes/:noteId — Modifier une note
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

  // DELETE /api/notebooks/:id/notes/:noteId — Supprimer une note
  router.delete("/:id/notes/:noteId", (req: Request, res: Response) => {
    try {
      const success = notebookManager.deleteNote(req.params.id, req.params.noteId);
      if (!success) {
        res.status(404).json({ error: "Note introuvable." });
        return;
      }
      res.json({ status: "success", message: "Note supprimée." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GÉNÉRATION DE CONTENU
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /api/notebooks/:id/generate — Générer un document dérivé
  router.post("/:id/generate", async (req: Request, res: Response) => {
    try {
      const { type, sourceIds, language } = req.body;
      const validTypes: GeneratedDocType[] = ["summary", "faq", "study-guide", "briefing", "timeline", "outline"];

      if (!type || !validTypes.includes(type)) {
        res.status(400).json({
          error: `Le champ 'type' doit être l'un de: ${validTypes.join(", ")}`,
        });
        return;
      }

      const doc = await contentGenerator.generate(req.params.id, type, { sourceIds, language });
      res.json({ status: "success", document: doc });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/:id/generated — Liste des documents générés
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

  // DELETE /api/notebooks/:id/generated/:docId — Supprimer un document généré
  router.delete("/:id/generated/:docId", (req: Request, res: Response) => {
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

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIO OVERVIEW (Podcast)
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /api/notebooks/:id/audio-overview — Générer un podcast
  router.post("/:id/audio-overview", async (req: Request, res: Response) => {
    try {
      const { language, duration } = req.body;
      const overview = await contentGenerator.generateAudioOverview(req.params.id, { language, duration });
      res.json({ status: "success", overview });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/:id/audio-overviews — Liste des audio overviews
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

  // ═══════════════════════════════════════════════════════════════════════════
  // EMBEDDINGS (gestion des vecteurs)
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /api/notebooks/:id/embeddings/reindex — Re-vectoriser toutes les sources
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
        message: `${totalIndexed} chunks vectorisés sur ${notebook.sources.reduce((acc, s) => acc + s.chunks.length, 0)} total.`,
        indexed: totalIndexed,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/:id/embeddings/stats — Stats des embeddings
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

  return router;
}
