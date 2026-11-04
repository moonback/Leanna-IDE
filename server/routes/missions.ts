import { Router, Request, Response } from "express";
import { missionTimeTravel, type TimelineMissionView } from "../mission/index.js";
import { projectDoctor } from "../knowledge/index.js";
import { writeEnvKey } from "./env.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Missions Router — Approbation humaine & curseur d'autonomie
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Expose au frontend les actions liées au curseur d'autonomie :
 *   - approuver / refuser une action en attente (mode "ask")
 *   - lister les approbations en attente d'une mission
 *   - lire et modifier le mode d'autonomie (suggest / ask / auto)
 *
 * L'Executor est fourni via un getter, car il est initialisé de façon
 * asynchrone dans le bootstrap (peut être null au tout début).
 */
/** Borne une chaîne pour la réponse JSON (jamais de champ géant). */
function clipText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/** Filtre les secrets et borne les snapshots avant exposition via les API de timeline. */
function sanitizeMissionPayload(value: unknown, key = "", depth = 0): unknown {
  if (/(password|passwd|secret|token|api[_-]?key|authorization|credential|cookie|private[_-]?key)/i.test(key)) {
    return "[masqué]";
  }
  if (depth > 4) return "[profondeur limitée]";
  if (typeof value === "string") return value.length > 1000 ? value.slice(0, 1000) + "…" : value;
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => sanitizeMissionPayload(item, "", depth + 1));
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 40);
    return Object.fromEntries(entries.map(([childKey, child]) => [
      childKey,
      sanitizeMissionPayload(child, childKey, depth + 1),
    ]));
  }
  return String(value);
}

export function createMissionsRouter(
  getExecutor: () => any | null,
  handleToolCall?: (name: string, args: any) => Promise<any>
): Router {
  const router = Router();

  // ── Créer une mission (chemin déterministe, indépendant du LLM) ──────────
  router.post("/missions", async (req: Request, res: Response) => {
    if (!handleToolCall) {
      return res.status(503).json({ error: "Création de mission indisponible (handler non configuré)." });
    }
    const { title, description, priority, dryRun } = req.body ?? {};
    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "Champ 'title' (string) requis." });
    }
    if (typeof description !== "string" || !description.trim()) {
      return res.status(400).json({ error: "Champ 'description' (string) requis." });
    }
    // Valider la priorité côté route (point mineur de l'audit) : rejeter une
    // valeur inconnue plutôt que de la propager silencieusement.
    const ALLOWED_PRIORITIES = ["low", "medium", "high", "critical"];
    if (priority !== undefined && !ALLOWED_PRIORITIES.includes(priority)) {
      return res.status(400).json({
        error: "Champ 'priority' invalide (low | medium | high | critical).",
      });
    }
    try {
      // Réutilise exactement le chemin du skill (validation, skills disponibles, executor).
      const result = await handleToolCall("mission_create", {
        title: title.trim(),
        description: description.trim(),
        priority: priority ?? "medium",
        dryRun: dryRun === true,
      });
      if (result && typeof result === "object" && "error" in result) {
        return res.status(400).json(result);
      }
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  // ── Diagnostiquer : créer les missions d'amélioration du Project Doctor ──
  // Lance le diagnostic puis matérialise les missions proposées via le chemin
  // mission_create existant (validation, skills, executor, permissions).
  router.post("/missions/doctor/create", async (req: Request, res: Response) => {
    if (!handleToolCall) {
      return res.status(503).json({ error: "Création de mission indisponible (handler non configuré)." });
    }
    try {
      const report = projectDoctor.diagnose();
      const requestedMax = Number(req.body?.max);
      const max = Number.isInteger(requestedMax) && requestedMax > 0 ? Math.min(requestedMax, 10) : 5;
      const missions = report.improvementMissions.slice(0, max);
      const created: Array<{ missionId: string; title: string }> = [];
      const failed: Array<{ title: string; error: string }> = [];

      for (const m of missions) {
        try {
          const result = await handleToolCall("mission_create", {
            title: m.title,
            description: m.description,
            priority: m.priority,
          });
          if (result && typeof result === "object" && "missionId" in result) {
            created.push({ missionId: String((result as any).missionId), title: m.title });
          } else {
            failed.push({ title: m.title, error: (result as any)?.error ?? "Création refusée." });
          }
        } catch (err) {
          failed.push({ title: m.title, error: (err as Error).message });
        }
      }

      return res.json({ status: "success", global: report.global, created, failed, proposed: missions.length });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  // ── Simuler une mission (dry-run bout-en-bout, aucun effet de bord) ──────
  router.post("/missions/simulate", async (req: Request, res: Response) => {
    if (!handleToolCall) {
      return res.status(503).json({ error: "Simulation indisponible (handler non configuré)." });
    }
    const { title, description, priority } = req.body ?? {};
    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "Champ 'title' (string) requis." });
    }
    try {
      const result = await handleToolCall("mission_simulate", {
        title: title.trim(),
        description: typeof description === "string" && description.trim() ? description.trim() : title.trim(),
        priority: priority ?? "medium",
      });
      if (result && typeof result === "object" && "error" in result) {
        return res.status(400).json(result);
      }
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  const requireExecutor = (res: Response): any | null => {
    const executor = getExecutor();
    if (!executor) {
      res.status(503).json({ error: "Mission System non initialisé." });
      return null;
    }
    return executor;
  };

  /** Sérialise une Mission (instance) vers la forme attendue par le frontend. */
  const serializeMission = (mission: any, executor?: any) => {
    const state = mission.getState();
    // L'état de pause est suivi dans l'Executor (mission.status reste
    // "in_progress" pendant une pause). On le reflète DANS le statut : sinon le
    // rafraîchissement périodique du panneau écrasait le « En pause » optimiste
    // par « En cours » toutes les 3 s. `paused` reste exposé pour compatibilité.
    const paused = typeof executor?.isPaused === "function" ? executor.isPaused(state.id) === true : false;
    const status = paused && state.status === "in_progress" ? "paused" : state.status;
    const goalsRecord = state.goals ?? {};
    // Sous-objectifs = tous les goals ayant un parent (on exclut la racine).
    const goals = Object.values(goalsRecord)
      .filter((g: any) => g.parentId !== null)
      .map((g: any) => ({
        id: g.id,
        title: g.title,
        status: g.status,
        actions: (g.plannedActions ?? []).map((a: any) => ({
          id: a.id,
          skill: a.skillName,
          status: a.status,
          confidence: a.reflection?.confidence,
          decision: a.reflection?.decision,
          durationMs: a.durationMs,
          // Cause lisible d'un échec (réflexion post-action), bornée.
          failure: clipText(a.reflection?.failure, 300),
        })),
      }));

    const errors: Array<{ action: string; error: string }> = state.context?.errors ?? [];
    const lastError = errors.length > 0 ? errors[errors.length - 1] : undefined;
    const end = state.completedAt ? Date.parse(state.completedAt) : Date.now();
    const start = Date.parse(state.createdAt);
    const evaluation = typeof executor?.getSelfEvaluation === "function"
      ? executor.getSelfEvaluation(state.id)
      : undefined;
    const plan = typeof executor?.getMissionPlan === "function" ? executor.getMissionPlan(state.id) : undefined;

    return {
      id: state.id,
      title: state.title,
      description: clipText(state.description, 2000),
      status,
      paused,
      priority: state.priority,
      goals,
      activeGoalId: state.activeGoalId,
      confidence: state.metrics?.averageConfidence ?? 0.5,
      metrics: {
        totalActions: state.metrics?.totalActions ?? 0,
        successfulActions: state.metrics?.successfulActions ?? 0,
        failedActions: state.metrics?.failedActions ?? 0,
        // Durée murale de la mission (pas du temps CPU cumulé).
        totalDurationMs: Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : 0,
        // Estimation du plan, pas une mesure réelle de tokens consommés.
        estimatedTokens: state.metrics?.estimatedTokens || plan?.estimatedTokens || 0,
      },
      artifacts: Array.from(new Set(
        Object.values(goalsRecord).flatMap((goal: any) => goal.result?.artifacts ?? [])
          .filter((artifact: unknown): artifact is string => typeof artifact === "string" && artifact.length > 0)
          .map((artifact: string) => clipText(artifact, 500)!)
      )).slice(0, 100),
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      completedAt: state.completedAt,
      durationMs: Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : undefined,
      lastError: lastError
        ? { action: String(lastError.action), error: clipText(lastError.error, 500) }
        : undefined,
      errorCount: errors.length,
      plan,
      selfEvaluation: evaluation
        ? {
            overall: evaluation.overall,
            scores: evaluation.scores,
            summary: clipText(evaluation.summary, 600),
            notes: (evaluation.notes ?? []).slice(0, 5),
            nextTimeStartWith: clipText(evaluation.nextTimeStartWith, 300),
          }
        : undefined,
    };
  };

  // ── Lister les missions (actives + complétées) — état initial du panneau ──
  // Tri : missions vivantes d'abord, puis les plus récentes.
  router.get("/missions", (_req: Request, res: Response) => {
    const executor = requireExecutor(res);
    if (!executor) return;
    try {
      const active = (executor.listActiveMissions?.() ?? []).map((m: any) => serializeMission(m, executor));
      const completed = (executor.listCompletedMissions?.() ?? []).map((m: any) => serializeMission(m, executor));
      const byRecency = (a: { createdAt: string }, b: { createdAt: string }) =>
        Date.parse(b.createdAt) - Date.parse(a.createdAt);
      return res.json({ missions: [...active.sort(byRecency), ...completed.sort(byRecency)] });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  /** Resolve a mission instance by id from active or completed lists. */
  const findMission = (executor: any, id: string): any | undefined =>
    executor.getMission?.(id) ??
    (executor.listCompletedMissions?.() ?? []).find((m: any) => m.id === id);

  // ── Mission Time Travel : timeline chronologique reconstruite ────────────
  router.get("/missions/:id/timeline", (req: Request, res: Response) => {
    const executor = requireExecutor(res);
    if (!executor) return;
    const mission = findMission(executor, req.params.id);
    if (!mission) {
      return res.status(404).json({ error: "Mission introuvable.", missionId: req.params.id });
    }
    try {
      const timeline = missionTimeTravel.buildTimeline(mission.getState() as TimelineMissionView);
      return res.json({ status: "success", timeline: sanitizeMissionPayload(timeline) });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  // ── Rewind : instantané d'une étape + trace y menant ─────────────────────
  router.get("/missions/:id/timeline/:step", (req: Request, res: Response) => {
    const executor = requireExecutor(res);
    if (!executor) return;
    const mission = findMission(executor, req.params.id);
    if (!mission) {
      return res.status(404).json({ error: "Mission introuvable.", missionId: req.params.id });
    }
    const step = Number(req.params.step);
    if (!Number.isInteger(step) || step < 0) {
      return res.status(400).json({ error: "Index d'étape invalide." });
    }
    try {
      const { target, trail } = missionTimeTravel.rewindTo(mission.getState() as TimelineMissionView, step);
      if (!target) {
        return res.status(404).json({ error: `Étape ${step} hors limites.` });
      }
      return res.json({ status: "success", target: sanitizeMissionPayload(target), trail: sanitizeMissionPayload(trail) });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  // ── Approuver / refuser une action en attente ────────────────────────────
  router.post("/missions/:id/approve", (req: Request, res: Response) => {
    const executor = requireExecutor(res);
    if (!executor) return;

    const missionId = req.params.id;
    const { actionId, approved } = req.body ?? {};
    if (typeof actionId !== "string" || !actionId.trim()) {
      return res.status(400).json({ error: "Champ 'actionId' (string) requis." });
    }
    if (typeof approved !== "boolean") {
      return res.status(400).json({ error: "Champ 'approved' (boolean) requis." });
    }

    // Correctif audit (point 8) : l'action doit appartenir à la mission :id de
    // l'URL. Sans ce contrôle, un actionId pouvait être approuvé via n'importe
    // quelle mission (approbation croisée). On n'applique le contrôle que si
    // l'Executor expose la vérification (compat).
    if (
      typeof executor.actionBelongsToMission === "function" &&
      !executor.actionBelongsToMission(missionId, actionId)
    ) {
      return res.status(404).json({
        error: "Cette action n'appartient pas à la mission indiquée (ou mission introuvable).",
        missionId,
        actionId,
      });
    }

    const resolved = executor.resolveApproval(actionId, approved);
    if (!resolved) {
      return res.status(404).json({
        error: "Aucune approbation en attente pour cet actionId (peut-être déjà résolue ou expirée).",
        actionId,
      });
    }
    return res.json({ ok: true, actionId, approved });
  });

  // ── Mettre une mission en pause ──────────────────────────────────────────
  router.post("/missions/:id/pause", (req: Request, res: Response) => {
    const executor = requireExecutor(res);
    if (!executor) return;

    const missionId = req.params.id;
    // Mission inconnue/non active → 404 ; conflit d'état (déjà en pause) → 409.
    const active = typeof executor.getMission === "function" ? executor.getMission(missionId) : undefined;
    if (!active) {
      return res.status(404).json({ error: "Mission introuvable ou non active.", missionId });
    }
    if (typeof executor.isPaused === "function" && executor.isPaused(missionId)) {
      return res.status(409).json({ error: "Mission déjà en pause.", missionId });
    }
    const ok = executor.pauseMission?.(missionId) ?? false;
    if (!ok) {
      return res.status(409).json({ error: "Impossible de mettre la mission en pause.", missionId });
    }
    return res.json({ ok: true, missionId, status: "paused" });
  });

  // ── Reprendre une mission en pause ───────────────────────────────────────
  router.post("/missions/:id/resume", (req: Request, res: Response) => {
    const executor = requireExecutor(res);
    if (!executor) return;

    const missionId = req.params.id;
    // Mission inconnue/non active → 404 ; non en pause → 409 (conflit d'état).
    const active = typeof executor.getMission === "function" ? executor.getMission(missionId) : undefined;
    if (!active) {
      return res.status(404).json({ error: "Mission introuvable ou non active.", missionId });
    }
    if (typeof executor.isPaused === "function" && !executor.isPaused(missionId)) {
      return res.status(409).json({ error: "Mission non en pause.", missionId });
    }
    const ok = executor.resumeMission?.(missionId) ?? false;
    if (!ok) {
      return res.status(409).json({ error: "Impossible de reprendre la mission.", missionId });
    }
    return res.json({ ok: true, missionId, status: "in_progress" });
  });

  // ── Annuler une mission active ───────────────────────────────────────────
  router.post("/missions/:id/cancel", (req: Request, res: Response) => {
    const executor = requireExecutor(res);
    if (!executor) return;

    const missionId = req.params.id;
    const ok = executor.cancelMission?.(missionId) ?? false;
    if (!ok) {
      return res.status(404).json({
        error: "Mission introuvable ou déjà terminée.",
        missionId,
      });
    }
    return res.json({ ok: true, missionId, status: "cancelled" });
  });

  // ── Relancer une mission terminée (même brief, nouvelle mission) ─────────
  // Uniquement depuis l'historique : relancer une mission encore vivante
  // créerait un doublon concurrent sur les mêmes fichiers.
  router.post("/missions/:id/retry", async (req: Request, res: Response) => {
    const executor = requireExecutor(res);
    if (!executor) return;
    if (!handleToolCall) {
      return res.status(503).json({ error: "Création de mission indisponible (handler non configuré)." });
    }
    const missionId = req.params.id;
    if (executor.getMission?.(missionId)) {
      return res.status(409).json({ error: "Mission encore active : annulez-la avant de la relancer.", missionId });
    }
    const mission = findMission(executor, missionId);
    if (!mission) {
      return res.status(404).json({ error: "Mission introuvable.", missionId });
    }
    const state = mission.getState();
    try {
      const result = await handleToolCall("mission_create", {
        title: state.title,
        description: state.description || state.title,
        priority: state.priority ?? "medium",
      });
      if (result && typeof result === "object" && "error" in result) {
        return res.status(400).json(result);
      }
      return res.json({ ...(result as object), retriedFrom: missionId });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  // ── Supprimer une mission (active → annulée puis retirée, ou historique) ──
  router.delete("/missions/:id", (req: Request, res: Response) => {
    const executor = requireExecutor(res);
    if (!executor) return;

    const missionId = req.params.id;
    const ok = executor.deleteMission?.(missionId) ?? false;
    if (!ok) {
      return res.status(404).json({ error: "Mission introuvable.", missionId });
    }
    return res.json({ ok: true, missionId, deleted: true });
  });

  // ── Lister les approbations en attente ───────────────────────────────────
  router.get("/missions/pending-approvals", (_req: Request, res: Response) => {
    const executor = requireExecutor(res);
    if (!executor) return;
    const pending = typeof executor.listPendingApprovalDetails === "function"
      ? executor.listPendingApprovalDetails()
      : executor.listPendingApprovals();
    return res.json({ pending });
  });

  // ── Lister les missions interrompues en attente de décision ──────────────
  // (reprise au démarrage : réactiver ou effacer).
  router.get("/missions/pending-resumes", (_req: Request, res: Response) => {
    const executor = requireExecutor(res);
    if (!executor) return;
    return res.json({ pending: executor.listPendingResumes?.() ?? [] });
  });

  // ── Décider du sort d'une mission interrompue (réactiver / effacer) ──────
  router.post("/missions/:id/resume-decision", (req: Request, res: Response) => {
    const executor = requireExecutor(res);
    if (!executor) return;

    const missionId = req.params.id;
    const { decision } = req.body ?? {};
    if (decision !== "reactivate" && decision !== "delete") {
      return res.status(400).json({
        error: "Champ 'decision' invalide (reactivate | delete).",
      });
    }

    const ok = executor.confirmResume?.(missionId, decision) ?? false;
    if (!ok) {
      return res.status(404).json({
        error: "Aucune mission interrompue en attente pour cet ID (déjà décidée ou inexistante).",
        missionId,
      });
    }
    return res.json({ ok: true, missionId, decision });
  });

  // ── Lire le mode d'autonomie courant ─────────────────────────────────────
  router.get("/missions/autonomy", (_req: Request, res: Response) => {
    const executor = requireExecutor(res);
    if (!executor) return;
    const policy = executor.getAutonomyPolicy?.();
    if (!policy) return res.json({ mode: null, enabled: false });
    return res.json({ mode: policy.getMode(), enabled: true });
  });

  // ── Modifier le mode d'autonomie ─────────────────────────────────────────
  router.post("/missions/autonomy", (req: Request, res: Response) => {
    const executor = requireExecutor(res);
    if (!executor) return;

    const { mode } = req.body ?? {};
    if (!["suggest", "ask", "auto"].includes(mode)) {
      return res.status(400).json({ error: "Champ 'mode' invalide (suggest | ask | auto)." });
    }
    const policy = executor.getAutonomyPolicy?.();
    if (!policy) return res.status(503).json({ error: "Curseur d'autonomie non configuré." });

    policy.setMode(mode);
    // Persister le choix : sans cela il était perdu au redémarrage (AUDIT-011).
    let persisted = true;
    try {
      writeEnvKey("LEANNA_AUTONOMY_MODE", mode);
    } catch (err) {
      persisted = false;
      console.warn(`[missions] ⚠️ Mode d'autonomie non persisté: ${(err as Error).message}`);
    }
    return res.json({ ok: true, mode, persisted });
  });

  return router;
}
