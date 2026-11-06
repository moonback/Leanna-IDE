import { Router, Request, Response } from "express";
import { backupService } from "../../notebooks/index.js";

const SAFE_BACKUP_ID = /^backup-[0-9]+$/;
const SAFE_NOTEBOOK_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sendError(res: Response, error: unknown, status = 500): void {
  const message = error instanceof Error ? error.message : String(error);
  res.status(status).json({ status: "error", error: message });
}

export function createBackupRouter(): Router {
  const router = Router();

  router.post("/backup/run", async (_req: Request, res: Response): Promise<void> => {
    try {
      const metadata = await backupService.runBackup();
      if (!metadata) {
        res.json({ status: "success", backup: null, message: "Aucune modification à sauvegarder." });
        return;
      }
      res.json({ status: "success", backup: metadata });
    } catch (e: unknown) {
      sendError(res, e);
    }
  });

  router.get("/backup/list", (_req: Request, res: Response): void => {
    try {
      const backups = backupService.listBackups();
      if (!Array.isArray(backups)) throw new Error("Liste de sauvegardes invalide.");
      res.json({ status: "success", backups });
    } catch (e: unknown) {
      sendError(res, e);
    }
  });

  router.post("/backup/restore", (req: Request, res: Response): void => {
    try {
      if (!isRecord(req.body)) {
        sendError(res, new Error("Le corps JSON est requis."), 400);
        return;
      }

      const { backupId, notebookId } = req.body;
      if (typeof backupId !== "string" || !SAFE_BACKUP_ID.test(backupId)) {
        sendError(res, new Error("Le champ 'backupId' est invalide."), 400);
        return;
      }
      if (notebookId !== undefined && (typeof notebookId !== "string" || !SAFE_NOTEBOOK_ID.test(notebookId))) {
        sendError(res, new Error("Le champ 'notebookId' est invalide."), 400);
        return;
      }

      if (typeof notebookId === "string") {
        const success = backupService.restoreNotebook(backupId, notebookId);
        if (!success) {
          sendError(res, new Error("Backup ou notebook introuvable, ou contenu invalide."), 404);
          return;
        }
        res.json({ status: "success", restored: 1, errors: 0, notebookId });
        return;
      }

      const result = backupService.restoreAll(backupId);
      if (!result || !Number.isSafeInteger(result.restored) || !Number.isSafeInteger(result.errors)) {
        throw new Error("Résultat de restauration invalide.");
      }
      const status = result.errors > 0 ? 207 : "success";
      res.status(result.errors > 0 ? 207 : 200).json({ status, ...result });
    } catch (e: unknown) {
      sendError(res, e);
    }
  });

  router.get("/backup/config", (_req: Request, res: Response): void => {
    try {
      res.json({ status: "success", config: backupService.getConfig() });
    } catch (e: unknown) {
      sendError(res, e);
    }
  });

  router.patch("/backup/config", (req: Request, res: Response): void => {
    try {
      if (!isRecord(req.body)) {
        sendError(res, new Error("Le corps JSON est requis."), 400);
        return;
      }
      const allowed = new Set(["intervalMs", "maxBackups", "enabled"]);
      const keys = Object.keys(req.body);
      if (keys.length === 0 || keys.some((key) => !allowed.has(key))) {
        sendError(res, new Error("La configuration doit contenir au moins un champ autorisé."), 400);
        return;
      }

      const { intervalMs, maxBackups, enabled } = req.body;
      if (intervalMs !== undefined
        && (!Number.isSafeInteger(intervalMs) || (intervalMs as number) < 60_000 || (intervalMs as number) > 30 * 24 * 60 * 60 * 1000)) {
        sendError(res, new Error("intervalMs doit être compris entre 60 000 ms et 30 jours."), 400);
        return;
      }
      if (maxBackups !== undefined
        && (!Number.isSafeInteger(maxBackups) || (maxBackups as number) < 1 || (maxBackups as number) > 100)) {
        sendError(res, new Error("maxBackups doit être un entier compris entre 1 et 100."), 400);
        return;
      }
      if (enabled !== undefined && typeof enabled !== "boolean") {
        sendError(res, new Error("enabled doit être un booléen."), 400);
        return;
      }

      backupService.updateConfig({ intervalMs: intervalMs as number | undefined, maxBackups: maxBackups as number | undefined, enabled: enabled as boolean | undefined });
      res.json({ status: "success", config: backupService.getConfig() });
    } catch (e: unknown) {
      sendError(res, e, 400);
    }
  });

  return router;
}
