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
