/**
 * Autonomy Router — REST surface for monitoring & controlling bounded autonomy.
 *
 * Phase 3 ("autonomie encadrée") exposes the self-initiated idle-work subsystem
 * to the UI: the per-hour budget snapshot, the readable audit trail, the kill
 * switch state, and pause/resume controls. It intentionally mirrors the small
 * `createMetricsRouter(runtime, autonomy?)` template — a factory closing over
 * the live `LeannaCore`, returning an Express Router mounted under `/api`
 * (so it inherits the global `requireAuth` middleware).
 *
 * Every endpoint is read-mostly and side-effect-free except the two POST
 * controls, which only toggle the idle loop (never touch user/event missions).
 */

import { Router, type Request, type Response } from "express";
import type { LeannaCore } from "../autonomy/LeannaCore.js";

export function createAutonomyRouter(autonomy: LeannaCore): Router {
  const router = Router();

  // GET /api/autonomy/state — current runtime state (status, health, counts).
  router.get("/state", (_req: Request, res: Response) => {
    res.json(autonomy.getState());
  });

  // GET /api/autonomy/tasks — bounded list of autonomy tasks (newest first).
  router.get("/tasks", (req: Request, res: Response) => {
    const limit = clampLimit(req.query.limit, 100, 500);
    res.json({ tasks: autonomy.getTasks().slice(0, limit) });
  });

  // GET /api/autonomy/proposals — proactive anticipation proposals (newest first).
  router.get("/proposals", (req: Request, res: Response) => {
    const limit = clampLimit(req.query.limit, 50, 200);
    res.json({ proposals: autonomy.getProposals().slice(0, limit) });
  });

  // GET /api/autonomy/idle-budget — rolling-hour budget for self-initiated work.
  // Returns { budget: null } (200) when idle work is not wired, so the UI can
  // distinguish "disabled" from an error.
  router.get("/idle-budget", (_req: Request, res: Response) => {
    res.json({ budget: autonomy.getIdleBudget() ?? null });
  });

  // GET /api/autonomy/idle-audit — readable append-only trail of idle actions.
  router.get("/idle-audit", (req: Request, res: Response) => {
    const limit = clampLimit(req.query.limit, 100, 1000);
    res.json({ entries: autonomy.getIdleAudit(limit) });
  });

  // GET /api/autonomy/idle-paused — kill-switch state of the idle loop.
  router.get("/idle-paused", (_req: Request, res: Response) => {
    res.json({ paused: autonomy.isIdleWorkPaused() });
  });

  // POST /api/autonomy/idle/pause — kill switch: stop self-initiated work.
  router.post("/idle/pause", (req: Request, res: Response) => {
    const reason = typeof req.body?.reason === "string" ? req.body.reason : "operator (UI)";
    autonomy.pauseIdleWork(reason);
    res.json({ ok: true, paused: autonomy.isIdleWorkPaused() });
  });

  // POST /api/autonomy/idle/resume — resume self-initiated work after a pause.
  router.post("/idle/resume", (req: Request, res: Response) => {
    const reason = typeof req.body?.reason === "string" ? req.body.reason : "operator (UI)";
    autonomy.resumeIdleWork(reason);
    res.json({ ok: true, paused: autonomy.isIdleWorkPaused() });
  });

  return router;
}

/** Parse and clamp a `?limit` query param to a safe bounded integer. */
function clampLimit(raw: unknown, fallback: number, max: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), max);
}
