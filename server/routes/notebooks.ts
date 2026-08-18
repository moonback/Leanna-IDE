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

  // POST /api/notebooks/:id/sources/upload-multi — Upload plusieurs fichiers simultanément
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

      // Ingérer chaque fichier (séquentiellement pour éviter les rate limits API)
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

  // GET /api/notebooks/:id/chat/export — Exporter la conversation en Markdown
  router.get("/:id/chat/export", (req: Request, res: Response) => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }

      if (notebook.chatHistory.length === 0) {
        res.status(400).json({ error: "Aucun message à exporter." });
        return;
      }

      const format = (req.query.format as string) || "markdown";

      // Construire le Markdown
      const lines: string[] = [];
      lines.push(`# Chat — ${notebook.title}`);
      lines.push(`> Exporté le ${new Date().toLocaleString("fr-FR")}`);
      lines.push(`> ${notebook.chatHistory.length} messages\n`);
      lines.push("---\n");

      for (const msg of notebook.chatHistory) {
        const role = msg.role === "user" ? "🧑 **Utilisateur**" : "🤖 **Assistant**";
        const time = new Date(msg.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
        lines.push(`### ${role} — ${time}\n`);
        lines.push(msg.content);

        if (msg.citations.length > 0) {
          lines.push("\n<details><summary>📚 Citations</summary>\n");
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
        // JSON fallback (le frontend peut convertir en PDF côté client)
        res.json({ status: "success", markdown, title: notebook.title });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/notebooks/:id/chat/chunk/:chunkId — Récupérer le contenu complet d'un chunk (pour hover citations)
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

  // POST /api/notebooks/:id/chat/compare — Comparer des sources entre elles (SSE)
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

  // POST /api/notebooks/:id/chat/insights — Extraire les insights des sources (SSE)
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
      const { type, sourceIds, language, customInstructions } = req.body;
      const validTypes: GeneratedDocType[] = ["summary", "faq", "study-guide", "briefing", "timeline", "outline", "mindmap", "swot", "glossary"];

      if (!type || !validTypes.includes(type)) {
        res.status(400).json({
          error: `Le champ 'type' doit être l'un de: ${validTypes.join(", ")}`,
        });
        return;
      }

      const doc = await contentGenerator.generate(req.params.id, type, { sourceIds, language, customInstructions });
      res.json({ status: "success", document: doc });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/notebooks/:id/generate/stream — Générer un document dérivé (SSE streaming)
  router.post("/:id/generate/stream", async (req: Request, res: Response) => {
    try {
      const { type, sourceIds, language, customInstructions } = req.body;
      const validTypes: GeneratedDocType[] = ["summary", "faq", "study-guide", "briefing", "timeline", "outline", "mindmap", "swot", "glossary"];

      if (!type || !validTypes.includes(type)) {
        res.status(400).json({
          error: `Le champ 'type' doit être l'un de: ${validTypes.join(", ")}`,
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
