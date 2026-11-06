import { Router, Request, Response } from "express";
import { notebookManager } from "../../notebooks/index.js";
import { enqueueSourceIngestion } from "../../notebooks/queueSourceIngestion.js";
import { SELF_ROOT } from "../../utils/selfRoot.js";

export function createNotesRouter(): Router {
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

  router.post("/:id/notes", (req: Request, res: Response): void => {
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

  router.patch("/:id/notes/:noteId", (req: Request, res: Response): void => {
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

  router.delete("/:id/notes/:noteId", (req: Request, res: Response): void => {
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

  // ── Convertir une note en source ─────────────────────────────────────────
  // La note est ingérée comme une vraie source (chunking + embeddings), donc
  // interrogeable par le chat et utilisable par la génération.
  router.post("/:id/notes/:noteId/add-to-sources", async (req: Request, res: Response): Promise<void> => {
    try {
      const notebookId = req.params.id;
      const notebook = notebookManager.getNotebook(notebookId);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }

      const note = notebook.notes.find((n) => n.id === req.params.noteId);
      if (!note) {
        res.status(404).json({ error: "Note introuvable." });
        return;
      }

      const content = (note.content || "").trim();
      if (!content) {
        res.status(400).json({ error: "La note est vide." });
        return;
      }

      const title = `Note — ${note.title?.trim() || "Sans titre"}`;
      if (notebook.sources.some((s) => s.title === title)) {
        res.status(409).json({ error: "Cette note est déjà dans les sources." });
        return;
      }

      const markdown = `# ${note.title || "Note"}\n\n${content}`;
      const source = await enqueueSourceIngestion({
        notebookId,
        kind: "buffer",
        buffer: Buffer.from(markdown, "utf-8"),
        fileName: title,
        mimeType: "text/markdown",
      });

      res.json({
        status: "success",
        source: { id: source.sourceId, title: source.title, type: source.type, chunksCount: source.chunksCount },
      });
    } catch (e: any) {
      res.status(e.statusCode || 500).json({ error: e.message });
    }
  });

  return router;
}
