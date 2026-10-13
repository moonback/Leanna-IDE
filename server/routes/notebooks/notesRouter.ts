import { Router, Request, Response } from "express";
import { notebookManager, sourceIngester } from "../../notebooks/index.js";

export function createNotesRouter(): Router {
  const router = Router();

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
      const source = await sourceIngester.ingestFromBuffer(
        Buffer.from(markdown, "utf-8"),
        title,
        "text/markdown",
        notebookId,
      );
      notebookManager.addSource(notebookId, source);

      res.json({
        status: "success",
        source: { id: source.id, title: source.title, type: source.type, chunksCount: source.chunks.length },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
