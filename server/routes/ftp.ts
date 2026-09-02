/**
 * ftp.ts — Routes REST pour la connexion FTP workspace.
 *
 * Endpoints :
 *   POST /api/ftp/test       — Teste la connexion (retourne ok/error)
 *   POST /api/ftp/download   — Télécharge le workspace FTP (SSE streaming)
 *   POST /api/ftp/push       — Pousse les fichiers locaux vers le FTP (SSE streaming)
 *   GET  /api/ftp/list       — Liste un répertoire FTP distant
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import {
  testFtpConnection,
  downloadFtpWorkspace,
  pushFtpChanges,
  listFtpDirectory,
  ftpLocalMirrorPath,
  type FtpConfig,
} from "../utils/ftpSync.js";

export function createFtpRouter(): Router {
  const router = Router();

  // ── Schéma de validation commun ─────────────────────────────────────────────
  const FtpConfigSchema = z.object({
    host: z.string().min(1, "L'hôte FTP est requis."),
    port: z.coerce.number().int().min(1).max(65535).default(21),
    user: z.string().min(1, "Le nom d'utilisateur est requis."),
    password: z.string(), // peut être vide pour FTP anonyme
    remotePath: z.string().default("/"),
    secure: z.boolean().default(false),
  });

  // ── POST /api/ftp/test ──────────────────────────────────────────────────────
  router.post("/test", async (req: Request, res: Response) => {
    const parsed = FtpConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ ok: false, error: parsed.error.errors[0]?.message ?? "Paramètres invalides." });
    }

    const config: FtpConfig = parsed.data;
    const result = await testFtpConnection(config);
    return res.json(result);
  });

  // ── POST /api/ftp/download — SSE streaming ──────────────────────────────────
  router.post("/download", async (req: Request, res: Response) => {
    const parsed = FtpConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: parsed.error.errors[0]?.message ?? "Paramètres invalides." });
    }

    const config: FtpConfig = parsed.data;

    // Setup SSE
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const sendEvent = (type: string, data: Record<string, unknown>) => {
      if (res.writableEnded) return;
      try {
        res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
      } catch {
        /* client disconnected */
      }
    };
    const finish = () => {
      try {
        if (!res.writableEnded) res.end();
      } catch { /* ignore */ }
    };

    try {
      const localDir = await downloadFtpWorkspace(config, (info) => {
        sendEvent("log", { level: info.level, message: info.message });
      });

      sendEvent("log", { level: "info", message: "🔌 Activation du workspace…" });

      // Activer le workspace local via le mécanisme sandbox existant
      const { switchSandboxProject } = await import("../utils/sandbox.js");
      const newRoot = await switchSandboxProject(localDir);

      // Persister dans le registre des workspaces avec les métadonnées FTP
      const { addOrUpdateWorkspace } = await import("../utils/selfRoot.js");
      const workspaceName = `FTP: ${config.host}${config.remotePath !== "/" ? config.remotePath : ""}`;
      addOrUpdateWorkspace(newRoot, undefined, workspaceName);

      // Recharger le Knowledge System
      try {
        const { knowledgeGraph } = await import("../knowledge/KnowledgeGraph.js");
        const { projectMemory } = await import("../knowledge/ProjectMemory.js");
        const { projectIndexer } = await import("../knowledge/ProjectIndexer.js");
        knowledgeGraph.load();
        projectMemory.load();
        projectIndexer.scanAll({ onProgress: () => {} }).catch(() => {});
        sendEvent("log", { level: "info", message: "🧠 Knowledge System rechargé." });
      } catch { /* silent */ }

      sendEvent("log", { level: "info", message: `🎉 Workspace FTP actif : ${newRoot}` });
      sendEvent("done", { status: "success", newRoot, localDir });
    } catch (err: any) {
      sendEvent("log", { level: "error", message: `❌ ${err.message || String(err)}` });
      sendEvent("error", { error: err.message || String(err) });
    } finally {
      finish();
    }
  });

  // ── POST /api/ftp/push — SSE streaming ─────────────────────────────────────
  router.post("/push", async (req: Request, res: Response) => {
    const BodySchema = z.object({
      config: FtpConfigSchema,
      localRoot: z.string().min(1, "localRoot est requis."),
      // Optionnel : liste de chemins relatifs à pousser (push sélectif)
      // Si absent ou vide → push complet
      files: z.array(z.string()).optional().default([]),
    });

    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: parsed.error.errors[0]?.message ?? "Paramètres invalides." });
    }

    const { config, localRoot, files } = parsed.data;

    // Setup SSE
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const sendEvent = (type: string, data: Record<string, unknown>) => {
      if (res.writableEnded) return;
      try {
        res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
      } catch { /* ignore */ }
    };
    const finish = () => {
      try {
        if (!res.writableEnded) res.end();
      } catch { /* ignore */ }
    };

    try {
      const uploaded = await pushFtpChanges(config as FtpConfig, localRoot, files, (info) => {
        sendEvent("log", { level: info.level, message: info.message });
      });

      sendEvent("done", { status: "success", uploaded });
    } catch (err: any) {
      sendEvent("log", { level: "error", message: `❌ ${err.message || String(err)}` });
      sendEvent("error", { error: err.message || String(err) });
    } finally {
      finish();
    }
  });

  // ── GET /api/ftp/list ───────────────────────────────────────────────────────
  router.post("/list", async (req: Request, res: Response) => {
    const BodySchema = z.object({
      config: FtpConfigSchema,
      remotePath: z.string().optional(),
    });

    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: parsed.error.errors[0]?.message ?? "Paramètres invalides." });
    }

    try {
      const entries = await listFtpDirectory(
        parsed.data.config as FtpConfig,
        parsed.data.remotePath
      );
      return res.json({
        entries: entries.map((e) => ({
          name: e.name,
          type: e.type === 2 ? "directory" : "file",
          size: e.size,
          date: e.rawModifiedAt,
        })),
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || String(err) });
    }
  });

  // ── GET /api/ftp/local-path — Calcule le chemin miroir sans se connecter ────
  router.post("/local-path", (req: Request, res: Response) => {
    const parsed = FtpConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: parsed.error.errors[0]?.message ?? "Paramètres invalides." });
    }
    return res.json({ localPath: ftpLocalMirrorPath(parsed.data as FtpConfig) });
  });

  return router;
}
