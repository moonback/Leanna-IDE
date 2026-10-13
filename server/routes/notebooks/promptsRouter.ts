/**
 * promptsRouter — API d'édition des prompts système des notebooks.
 *
 * Monté sous /api/notebooks. Expose :
 *   GET    /prompts            → liste de tous les prompts (défaut + override)
 *   GET    /prompts/:id        → un prompt précis
 *   PUT    /prompts/:id        → définit l'override d'un prompt { content }
 *   DELETE /prompts/:id        → réinitialise un prompt (supprime l'override)
 *   POST   /prompts/reset-all  → réinitialise tous les prompts
 *
 * IMPORTANT : ce routeur doit être monté AVANT le routeur CRUD qui définit
 * `/:id`, sinon « prompts » serait interprété comme un id de notebook.
 */

import { Router, Request, Response } from "express";
import { notebookPromptStore } from "../../notebooks/index.js";

export function createNotebookPromptsRouter(): Router {
  const router = Router();

  // Liste de tous les prompts éditables.
  router.get("/prompts", (_req: Request, res: Response): void => {
    try {
      res.json({ status: "success", prompts: notebookPromptStore.list() });
    } catch (e: any) {
      res.status(500).json({ status: "error", error: e.message });
    }
  });

  // Réinitialise TOUS les prompts (avant /:id pour éviter la capture).
  router.post("/prompts/reset-all", (_req: Request, res: Response): void => {
    try {
      notebookPromptStore.resetAll();
      res.json({ status: "success", prompts: notebookPromptStore.list() });
    } catch (e: any) {
      res.status(500).json({ status: "error", error: e.message });
    }
  });

  // Un prompt précis.
  router.get("/prompts/:id", (req: Request, res: Response): void => {
    const view = notebookPromptStore.get(req.params.id);
    if (!view) {
      res.status(404).json({ status: "error", error: `Prompt inconnu: ${req.params.id}` });
      return;
    }
    res.json({ status: "success", prompt: view });
  });

  // Définit (ou efface) l'override d'un prompt.
  router.put("/prompts/:id", (req: Request, res: Response): void => {
    const { content } = (req.body ?? {}) as { content?: string };
    if (typeof content !== "string") {
      res.status(400).json({ status: "error", error: "Le champ 'content' (string) est requis." });
      return;
    }
    const ok = notebookPromptStore.set(req.params.id, content);
    if (!ok) {
      res.status(404).json({ status: "error", error: `Prompt inconnu: ${req.params.id}` });
      return;
    }
    res.json({ status: "success", prompt: notebookPromptStore.get(req.params.id) });
  });

  // Réinitialise un prompt (supprime son override).
  router.delete("/prompts/:id", (req: Request, res: Response): void => {
    const ok = notebookPromptStore.reset(req.params.id);
    if (!ok) {
      res.status(404).json({ status: "error", error: `Prompt inconnu: ${req.params.id}` });
      return;
    }
    res.json({ status: "success", prompt: notebookPromptStore.get(req.params.id) });
  });

  return router;
}
