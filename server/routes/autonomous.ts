/**
 * autonomous.ts — Routes REST pour l'Autonomous Core V2
 *
 * Toutes les routes sont montées sur /api/agents/autonomous/*
 * et protégées par requireAuth en amont dans server.ts.
 *
 * Endpoints :
 *   GET    /status              — statut global du runtime
 *   GET    /diagnostics         — diagnostics complets
 *   PATCH  /level               — changer le niveau d'autonomie
 *   POST   /start               — démarrer le runtime
 *   POST   /stop                — arrêter le runtime
 *   POST   /trigger             — injecter un PerceptionEvent manuellement
 *   POST   /scan                — déclencher un scan d'opportunités
 *
 *   GET    /goals               — lister les objectifs
 *   POST   /goals               — créer un objectif
 *   GET    /goals/:id           — détail d'un objectif
 *   PATCH  /goals/:id           — mettre à jour un objectif
 *   PATCH  /goals/:id/pause     — mettre en pause
 *   PATCH  /goals/:id/resume    — reprendre
 *   DELETE /goals/:id           — supprimer
 *
 *   GET    /missions            — missions récentes
 *   GET    /missions/:id        — détail d'une mission
 *   POST   /missions/:id/cancel — annuler une mission
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { autonomousRuntime } from "../autonomy/AutonomousRuntime.js";
import { AUTONOMY_LEVEL_LABELS } from "../autonomy/types.js";
import type { AutonomyLevel, GoalCreateInput, PerceptionEventType } from "../autonomy/types.js";

const router = Router();

// ─── Helper ───────────────────────────────────────────────────────────────────

function ok(res: Response, data: unknown) {
  return res.json({ success: true, data });
}

function err(res: Response, status: number, message: string) {
  return res.status(status).json({ success: false, error: message });
}

// ═══════════════════════════════════════════════════════════════════════════════
// RUNTIME
// ═══════════════════════════════════════════════════════════════════════════════

// GET /status
router.get("/status", (_req: Request, res: Response) => {
  try {
    return ok(res, autonomousRuntime.getStatus());
  } catch (e) {
    return err(res, 500, (e as Error).message);
  }
});

// GET /diagnostics
router.get("/diagnostics", (_req: Request, res: Response) => {
  try {
    return ok(res, autonomousRuntime.getDiagnostics());
  } catch (e) {
    return err(res, 500, (e as Error).message);
  }
});

// PATCH /level  — body: { level: 0-8 }
router.patch("/level", (req: Request, res: Response) => {
  const schema = z.object({
    level: z.number().int().min(0).max(8),
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) {
    return err(res, 400, parse.error.issues.map((i) => i.message).join(", "));
  }
  try {
    autonomousRuntime.setAutonomyLevel(parse.data.level as AutonomyLevel);
    return ok(res, {
      level: parse.data.level,
      label: AUTONOMY_LEVEL_LABELS[parse.data.level as AutonomyLevel],
    });
  } catch (e) {
    return err(res, 500, (e as Error).message);
  }
});

// POST /start
router.post("/start", async (_req: Request, res: Response) => {
  try {
    const started = await autonomousRuntime.start();
    return ok(res, { started, status: autonomousRuntime.getStatus() });
  } catch (e) {
    return err(res, 500, (e as Error).message);
  }
});

// POST /stop
router.post("/stop", (_req: Request, res: Response) => {
  try {
    autonomousRuntime.stop();
    return ok(res, { stopped: true });
  } catch (e) {
    return err(res, 500, (e as Error).message);
  }
});

// POST /trigger — body: { type: PerceptionEventType, payload?, files? }
router.post("/trigger", (req: Request, res: Response) => {
  const schema = z.object({
    type: z.string().min(1),
    payload: z.record(z.unknown()).optional(),
    files: z.array(z.string()).optional(),
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) {
    return err(res, 400, parse.error.issues.map((i) => i.message).join(", "));
  }
  try {
    autonomousRuntime.triggerPerception(
      parse.data.type as PerceptionEventType,
      parse.data.payload,
      parse.data.files
    );
    return ok(res, { triggered: true, type: parse.data.type });
  } catch (e) {
    return err(res, 500, (e as Error).message);
  }
});

// POST /scan — déclenche un scan d'opportunités immédiat
router.post("/scan", async (_req: Request, res: Response) => {
  try {
    const opportunities = await autonomousRuntime.scanOpportunities();
    return ok(res, { count: opportunities.length, opportunities });
  } catch (e) {
    return err(res, 500, (e as Error).message);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GOALS
// ═══════════════════════════════════════════════════════════════════════════════

const GoalCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  cadence: z.enum(["once", "continuous", "on_change", "scheduled"]).optional(),
  schedule: z.string().optional(),
  constraints: z
    .object({
      noBreakingChanges: z.boolean().optional(),
      requireTests: z.boolean().optional(),
      requireTypeCheck: z.boolean().optional(),
      maxAutonomyLevel: z.number().int().min(0).max(8).optional(),
      excludePaths: z.array(z.string()).optional(),
      maxConcurrentMissions: z.number().int().min(1).max(10).optional(),
    })
    .optional(),
  checks: z
    .array(
      z.object({
        type: z.enum([
          "typescript",
          "tests",
          "security",
          "dependencies",
          "git_status",
          "architecture",
          "tech_debt",
          "documentation",
          "custom",
        ]),
        label: z.string().optional(),
        params: z.record(z.unknown()).optional(),
      })
    )
    .optional(),
  successCriteria: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// GET /goals
router.get("/goals", (req: Request, res: Response) => {
  try {
    const statusFilter = req.query.status as string | undefined;
    const goals = autonomousRuntime.listGoals();
    const filtered = statusFilter
      ? goals.filter((g) => g.status === statusFilter)
      : goals;
    return ok(res, filtered);
  } catch (e) {
    return err(res, 500, (e as Error).message);
  }
});

// POST /goals
router.post("/goals", (req: Request, res: Response) => {
  const parse = GoalCreateSchema.safeParse(req.body);
  if (!parse.success) {
    return err(res, 400, parse.error.issues.map((i) => i.message).join(", "));
  }
  try {
    const goal = autonomousRuntime.createGoal(parse.data as GoalCreateInput);
    return res.status(201).json({ success: true, data: goal });
  } catch (e) {
    return err(res, 500, (e as Error).message);
  }
});

// GET /goals/:id
router.get("/goals/:id", (req: Request, res: Response) => {
  const goal = autonomousRuntime.getGoal(req.params.id);
  if (!goal) return err(res, 404, `Objectif "${req.params.id}" introuvable`);
  return ok(res, goal);
});

// PATCH /goals/:id — mise à jour partielle
router.patch("/goals/:id", async (req: Request, res: Response) => {
  const goal = autonomousRuntime.getGoal(req.params.id);
  if (!goal) return err(res, 404, `Objectif "${req.params.id}" introuvable`);

  try {
    const { goalManager } = await import("../autonomy/GoalManager.js");
    const updated = goalManager.update(req.params.id, req.body);
    if (!updated) return err(res, 404, `Objectif "${req.params.id}" introuvable`);
    return ok(res, updated);
  } catch (e) {
    return err(res, 500, (e as Error).message);
  }
});

// PATCH /goals/:id/pause
router.patch("/goals/:id/pause", (req: Request, res: Response) => {
  const ok_ = autonomousRuntime.pauseGoal(req.params.id);
  if (!ok_) return err(res, 404, `Objectif "${req.params.id}" introuvable`);
  return ok(res, { paused: true, id: req.params.id });
});

// PATCH /goals/:id/resume
router.patch("/goals/:id/resume", (req: Request, res: Response) => {
  const ok_ = autonomousRuntime.resumeGoal(req.params.id);
  if (!ok_) return err(res, 404, `Objectif "${req.params.id}" introuvable`);
  return ok(res, { resumed: true, id: req.params.id });
});

// DELETE /goals/:id
router.delete("/goals/:id", (req: Request, res: Response) => {
  const deleted = autonomousRuntime.deleteGoal(req.params.id);
  if (!deleted) return err(res, 404, `Objectif "${req.params.id}" introuvable`);
  return ok(res, { deleted: true, id: req.params.id });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MISSIONS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /missions
router.get("/missions", (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const missions = autonomousRuntime.listMissions(limit);
    return ok(res, missions);
  } catch (e) {
    return err(res, 500, (e as Error).message);
  }
});

// GET /missions/:id
router.get("/missions/:id", (req: Request, res: Response) => {
  const mission = autonomousRuntime.getMission(req.params.id);
  if (!mission) return err(res, 404, `Mission "${req.params.id}" introuvable`);
  return ok(res, mission);
});

// POST /missions/:id/cancel
router.post("/missions/:id/cancel", (req: Request, res: Response) => {
  const cancelled = autonomousRuntime.cancelMission(req.params.id);
  if (!cancelled) {
    return err(res, 400, `Mission "${req.params.id}" introuvable ou déjà terminée`);
  }
  return ok(res, { cancelled: true, id: req.params.id });
});

export default router;
