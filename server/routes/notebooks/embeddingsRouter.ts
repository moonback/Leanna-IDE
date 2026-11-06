import { Router, Request, Response } from "express";
import { notebookManager, embeddingStore } from "../../notebooks/index.js";
import { SELF_ROOT } from "../../utils/selfRoot.js";

export function createEmbeddingsRouter(): Router {
  const router = Router();

  // Refuser les identifiants appartenant à un autre workspace avant toute
  // lecture, mutation, génération, export ou réindexation.
  router.use("/:id", (req: Request, res: Response, next) => {
    // Préserver les endpoints statiques qui partagent le premier segment.
    if (req.params.id === "embeddings") {
      next();
      return;
    }
    if (!notebookManager.getNotebook(req.params.id, SELF_ROOT || undefined)) {
      res.status(404).json({ error: "Notebook introuvable dans le workspace actif." });
      return;
    }
    next();
  });

  router.post("/:id/embeddings/reindex", async (req: Request, res: Response): Promise<void> => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }

      let queued = 0;
      for (const source of notebook.sources) {
        if (notebookManager.retrySourceIndexing(notebook.id, source.id)) queued++;
      }

      res.status(202).json({
        status: "accepted",
        message: `${queued} source(s) placée(s) en réindexation. Consultez indexing-status pour suivre la progression.`,
        queued,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/:id/embeddings/reconcile", async (req: Request, res: Response): Promise<void> => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }

      const report = await embeddingStore.reconcileNotebook(
        notebook.sources.map(source => ({
          id: source.id,
          chunks: (source.chunks || []).map(chunk => ({ id: chunk.id, content: chunk.content })),
        })),
        notebook.id
      );

      res.json({
        status: report.missing === 0 ? "success" : "partial",
        message: report.missing === 0
          ? "Index vectoriel réconcilié avec les sources du notebook."
          : "Réconciliation partielle : certains embeddings restent indisponibles.",
        ...report,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** Vue opérationnelle du pipeline d'indexation, sans exposer le texte source. */
  router.get("/:id/embeddings/indexing-status", (req: Request, res: Response): void => {
    const status = notebookManager.getSourceIndexingStatus(req.params.id);
    if (!status) {
      res.status(404).json({ error: "Notebook introuvable." });
      return;
    }
    res.json({ status: "success", indexing: status });
  });

  /** Retry ciblé d'une source ; l'opération continue en arrière-plan. */
  router.post("/:id/embeddings/sources/:sourceId/retry", (req: Request, res: Response): void => {
    const retried = notebookManager.retrySourceIndexing(req.params.id, req.params.sourceId);
    if (!retried) {
      res.status(404).json({ error: "Source introuvable dans ce notebook." });
      return;
    }
    res.status(202).json({ status: "accepted", sourceId: req.params.sourceId });
  });

  router.get("/:id/embeddings/stats", (req: Request, res: Response): void => {
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

  router.get("/embeddings/memory", (_req: Request, res: Response): void => {
    try {
      const memStats = embeddingStore.getMemoryStats();
      res.json({ status: "success", memory: memStats });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
