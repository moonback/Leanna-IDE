/**
 * IdleWorker — turns calm periods into *useful, bounded, read-only* work.
 *
 * Phase 3 ("autonomie encadrée"): instead of emitting a static "I'm idle"
 * reflection, Leanna uses genuinely quiet moments (heartbeat idle/sleep, no
 * active autonomy tasks) to run a READ-ONLY diagnostic/review mission — project
 * health, a dependency/code review, a dry-run of the test/typecheck surface.
 *
 * Every launch is triple-gated:
 *   1. Kill switch — a reversible pause() that stops all self-initiated work.
 *   2. Budget      — AutonomyBudget ceilings (actions/tokens/cost per hour).
 *   3. Read-only   — the mission is constrained to a read-only skill allowlist
 *                    AND forced into dry-run, so it can never mutate anything.
 *
 * Every decision (considered / skipped / started / completed / error) is written
 * to the AutonomyAuditLog so a human can read exactly what ran and what it cost.
 *
 * It rides the existing heartbeat tick (no new timer) and launches through the
 * SAME executeMission seam as every other autonomy mission, so permissions,
 * dry-run and approval policy are unchanged.
 *
 * ── What this revision improves (behaviour preserved) ───────────────────────
 *   • Less wasted work in calm periods: the budget pre-flight runs BEFORE the
 *     tool inventory is built, and the read-only allowlist is cached with a
 *     short TTL instead of being recomputed on every heartbeat.
 *   • Stronger async handling: the worker enforces its OWN wall-clock deadline
 *     around the mission (defence-in-depth if the runner ignores caps.timeoutMs)
 *     and closes the admit()→running race so two idle missions can never overlap.
 *   • Clearer rotation: the plan cursor only advances when a plan is actually
 *     launched, so an eligible diagnostic is never silently skipped in the ring.
 */

import { randomUUID } from "crypto";
import type { AgentRuntime } from "../runtime/index.js";
import { buildToolInventory } from "../runtime/ToolInventory.js";
import { createLogger } from "../utils/logger.js";
import { AutonomyBudget } from "./AutonomyBudget.js";
import { AutonomyAuditLog } from "./AutonomyAuditLog.js";

const log = createLogger("Autonomy:IdleWork");

/** Outcome of a self-initiated mission, reported by the executeMission seam. */
export interface IdleMissionResult {
  success: boolean;
  summary?: string;
  escalate?: boolean;
  /** Real usage reported by the mission, when available (for the budget). */
  tokens?: number;
  costUsd?: number;
}

/** Hard caps keeping an idle diagnostic short and bounded. */
export interface IdleMissionCaps {
  /** Wall-clock timeout (ms) for the whole mission. */
  timeoutMs: number;
  /** Max sub-goals the planner may create. */
  maxSubGoals: number;
  /** Max sub-goals run concurrently in a wave. */
  maxConcurrentGoals: number;
}

/** The hand-off into the existing mission pipeline, constrained to read-only. */
export type IdleMissionRunner = (request: {
  title: string;
  description: string;
  /** Read-only skill allowlist the mission must be constrained to. */
  availableSkills: string[];
  /** Always true: a side-effect-free simulation. */
  dryRun: true;
  /** Per-mission token/cost ceilings from the budget. */
  budget: { maxTokens: number; maxCostUsd: number };
  /** Wall-time + plan-size caps so a background diagnostic stays short. */
  caps: IdleMissionCaps;
}) => Promise<IdleMissionResult>;

const positiveInt = (value: number, fallback: number): number =>
  Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;

/** Reads idle-mission caps from the environment, failing closed to safe defaults. */
export const idleMissionCapsFromEnv = (env: NodeJS.ProcessEnv = process.env): IdleMissionCaps => ({
  timeoutMs: positiveInt(Number(env.LEANNA_AUTONOMY_IDLE_TIMEOUT_MS), 120_000),
  maxSubGoals: positiveInt(Number(env.LEANNA_AUTONOMY_IDLE_MAX_SUBGOALS), 2),
  maxConcurrentGoals: positiveInt(Number(env.LEANNA_AUTONOMY_IDLE_MAX_CONCURRENT_GOALS), 1),
});

/**
 * How long the derived read-only allowlist is reused before being rebuilt from
 * the ToolRegistry. The tool set is stable at runtime once bootstrapped, so a
 * short TTL spares a full inventory walk on every calm heartbeat while still
 * picking up any late MCP/custom registrations within a few seconds.
 */
const ALLOWLIST_TTL_MS = 30_000;

/**
 * Safety margin added to caps.timeoutMs for the worker's OWN deadline guard.
 * The runner is expected to honour caps.timeoutMs; this outer guard only trips
 * if it does not, so it is deliberately a little looser than the inner cap.
 */
const DEADLINE_GRACE_MS = 15_000;

/** A read-only diagnostic Leanna can run on her own. */
interface IdlePlan {
  action: string;
  title: string;
  description: string;
  /** Tool-name substrings that identify the read-only skills this plan needs. */
  prefer: string[];
}

/**
 * The rotation of read-only diagnostics. Each needs at least one matching
 * read-only tool in the allowlist to be eligible; otherwise it is skipped.
 * Ordered by value — health first, then review, then the test/typecheck surface.
 */
const IDLE_PLANS: IdlePlan[] = [
  // {
  //   action: "idle:project-doctor",
  //   title: "Diagnostic de santé du projet (lecture seule)",
  //   description: "Analyser la santé du projet (architecture, sécurité, tests, dette) via les outils de diagnostic. Analyse en lecture seule UNIQUEMENT : ne produis aucun fichier, n'écris rien ; l'objectif est l'analyse elle-même, pas un livrable sur disque.",
  //   prefer: ["knowledge_project_doctor", "knowledge_opportunities", "knowledge_build_context"],
  // },
  {
    action: "idle:code-review",
    title: "Revue de code en lecture seule",
    description: "Parcourir le code et les dépendances pour repérer les risques et les améliorations possibles. Analyse en lecture seule UNIQUEMENT : ne produis aucun fichier, n'écris rien ; l'objectif est l'analyse elle-même, pas un livrable sur disque.",
    prefer: ["codebase", "knowledge_semantic_search", "knowledge_build_context"],
  },
  {
    action: "idle:predict-review",
    title: "Revue des opportunités et prédiction de risque (lecture seule)",
    description: "Examiner les opportunités d'amélioration et estimer le risque de la mission prioritaire. Analyse en lecture seule UNIQUEMENT : ne produis aucun fichier, n'écris rien ; l'objectif est l'analyse elle-même, pas un livrable sur disque.",
    prefer: ["knowledge_opportunities", "knowledge_predict", "knowledge_daily_briefing"],
  },
];

export interface IdleWorkerOptions {
  budget?: AutonomyBudget;
  auditLog?: AutonomyAuditLog;
  /** The constrained mission runner. When omitted, the worker only audits. */
  runMission?: IdleMissionRunner;
  /** True when the autonomy runtime has active tasks (skip idle work then). */
  isBusy?: () => boolean;
  /** Master enable from env; a false value keeps the worker fully dormant. */
  enabled?: boolean;
  /** Wall-time + plan-size caps for each idle diagnostic. Defaults from env. */
  caps?: IdleMissionCaps;
}

/** Deterministic, bounded idle worker. */
export class IdleWorker {
  private readonly budget: AutonomyBudget;
  private readonly audit: AutonomyAuditLog;
  private readonly runMission?: IdleMissionRunner;
  private readonly isBusy: () => boolean;
  private readonly enabled: boolean;
  private readonly caps: IdleMissionCaps;

  /** Kill switch: when paused, no self-initiated work is launched. */
  private paused = false;
  /** Guards against overlapping idle missions (claimed before any await). */
  private running = false;
  /** Round-robin cursor over IDLE_PLANS. */
  private planCursor = 0;

  /** Cached read-only allowlist + the moment it was derived (TTL-gated). */
  private allowlistCache?: { skills: string[]; at: number };

  constructor(private readonly runtime: AgentRuntime, options: IdleWorkerOptions = {}) {
    this.budget = options.budget ?? new AutonomyBudget();
    this.audit = options.auditLog ?? new AutonomyAuditLog();
    this.runMission = options.runMission;
    this.caps = options.caps ?? idleMissionCapsFromEnv();
    this.isBusy = options.isBusy ?? (() => false);
    this.enabled = options.enabled ?? true;
  }

  /** Kill switch — stop launching self-initiated work (reversible). */
  pause(reason = "kill switch"): void {
    if (this.paused) return;
    this.paused = true;
    log.warn(`⏸️  Idle autonomy PAUSED — ${reason}.`);
    this.audit.append({ phase: "skipped", action: "idle:pause", message: `Idle autonomy paused — ${reason}.` });
  }

  /** Resume self-initiated work after a pause. */
  resume(reason = "operator"): void {
    if (!this.paused) return;
    this.paused = false;
    log.info(`▶️  Idle autonomy RESUMED — ${reason}.`);
    this.audit.append({ phase: "considered", action: "idle:resume", message: `Idle autonomy resumed — ${reason}.` });
  }

  isPaused(): boolean { return this.paused; }
  isRunning(): boolean { return this.running; }
  getAuditLog(): AutonomyAuditLog { return this.audit; }
  getBudget(): AutonomyBudget { return this.budget; }

  /** Drop the cached allowlist so the next run rebuilds it from the registry. */
  invalidateAllowlistCache(): void {
    this.allowlistCache = undefined;
  }

  /**
   * Entry point, called on each heartbeat. Only acts during genuinely calm
   * periods (idle/sleep, not busy). Returns true when a mission was launched.
   *
   * Fast rejections (disabled / paused / active / busy / already running) are
   * checked first so a calm heartbeat does almost no work. The budget
   * pre-flight is also consulted here, BEFORE the heavier allowlist/plan work,
   * so a hour spent at the ceiling never rebuilds the tool inventory for nothing.
   */
  async onHeartbeat(state: "active" | "idle" | "sleep"): Promise<boolean> {
    if (!this.enabled || this.paused) return false;
    if (state === "active") return false;
    if (this.running || this.isBusy()) return false;
    if (!this.budget.admit().allowed) return false;
    return this.runOnce();
  }

  /**
   * Run a single read-only diagnostic now (also used by tests/on-demand).
   * Honours the kill switch and budget; returns true if a mission launched.
   */
  async runOnce(): Promise<boolean> {
    if (!this.enabled || this.paused) return false;
    // Claim the single-flight slot synchronously, before any await, so a second
    // heartbeat that fires during the admit/allowlist work cannot slip through.
    if (this.running) return false;
    this.running = true;
    try {
      return await this.runOnceInner();
    } finally {
      this.running = false;
    }
  }

  /** The actual run, executed while the single-flight slot is held. */
  private async runOnceInner(): Promise<boolean> {
    const runId = randomUUID();
    const admit = this.budget.admit();
    if (!admit.allowed) {
      log.debug(`💤 Idle run skipped — ${admit.reason}`);
      this.audit.append({ phase: "skipped", action: "idle:budget", message: admit.reason, runId, budget: this.budgetLine() });
      return false;
    }

    const allowlist = this.readOnlyAllowlist();
    const plan = this.selectPlan(allowlist);
    if (!plan) {
      log.debug(`💤 Idle run skipped — no eligible read-only diagnostic (${allowlist.length} read-only tools available).`);
      this.audit.append({ phase: "skipped", action: "idle:no-plan", message: "No eligible read-only diagnostic for the current tool set.", runId });
      return false;
    }

    log.debug(`💤 Calm period — considering read-only diagnostic « ${plan.title} » (budget ${this.budgetLine().actions} actions).`);
    this.audit.append({
      phase: "considered", action: plan.action, runId,
      message: `Calm period — considering read-only diagnostic « ${plan.title} ».`,
      budget: this.budgetLine(),
    });

    // Without a runner wired we only observe/audit (observe-only mode).
    if (!this.runMission) {
      log.debug("💤 Idle run skipped — no mission runner wired (observe-only mode).");
      this.audit.append({ phase: "skipped", action: plan.action, message: "No mission runner wired (observe-only mode).", runId });
      return false;
    }

    // Only now do we commit this slot of the rotation; a plan that could not be
    // launched (budget/observe-only) never advances the ring.
    this.commitPlanCursor(plan);

    const perMission = this.budget.perMissionBudget();
    const startedAt = Date.now();
    log.info(`💤→🔬 Idle diagnostic launching (dry-run) « ${plan.title} » [${allowlist.length} read-only tools, timeout ${Math.round(this.caps.timeoutMs / 1000)}s, runId ${runId.slice(0, 8)}].`);
    this.audit.append({
      phase: "started", action: plan.action, runId, skills: allowlist.slice(0, 12), dryRun: true,
      message: `Launching read-only (dry-run) mission « ${plan.title} » (timeout ${Math.round(this.caps.timeoutMs / 1000)}s, ≤${this.caps.maxSubGoals} sub-goals).`,
    });

    try {
      const result = await this.runWithDeadline(this.runMission({
        title: plan.title,
        description: plan.description,
        availableSkills: allowlist,
        dryRun: true,
        budget: perMission,
        caps: this.caps,
      }));
      // Account the real usage (defaults to one action with 0 tokens/cost).
      this.budget.record({ tokens: result.tokens, costUsd: result.costUsd });
      const outcome = result.success ? "success" : result.escalate ? "blocked" : "failed";
      log.info(`🔬 Idle diagnostic ${outcome} in ${Date.now() - startedAt}ms « ${plan.title} » — ${result.tokens ?? 0} tokens, $${(result.costUsd ?? 0).toFixed(4)} (budget now ${this.budgetLine().actions} actions).`);
      this.audit.append({
        phase: "completed", action: plan.action, runId, outcome,
        tokens: result.tokens, costUsd: result.costUsd, dryRun: true,
        message: result.summary ?? `Read-only diagnostic ${outcome}.`,
        budget: this.budgetLine(),
      });
      return true;
    } catch (error) {
      // A thrown or timed-out mission still consumed an action slot.
      this.budget.record({});
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`🔬 Idle diagnostic errored after ${Date.now() - startedAt}ms « ${plan.title} »: ${msg}`);
      this.audit.append({
        phase: "error", action: plan.action, runId, outcome: "error",
        message: msg,
        budget: this.budgetLine(),
      });
      return true;
    }
  }

  /**
   * Defence-in-depth wall-clock guard. The runner is expected to honour
   * caps.timeoutMs itself; this outer deadline (a little looser, by
   * DEADLINE_GRACE_MS) only trips when it does not, so a misbehaving mission
   * can never pin the single-flight slot indefinitely. The settled promise is
   * ignored once the deadline wins — it stays dry-run and side-effect-free.
   */
  private runWithDeadline<T>(promise: Promise<T>): Promise<T> {
    const deadlineMs = this.caps.timeoutMs + DEADLINE_GRACE_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Idle diagnostic exceeded worker deadline (${Math.round(deadlineMs / 1000)}s).`)),
        deadlineMs,
      );
      // Do not keep the event loop alive just for this guard.
      (timer as { unref?: () => void }).unref?.();
    });
    return Promise.race([promise, deadline]).finally(() => {
      if (timer) clearTimeout(timer);
    }) as Promise<T>;
  }

  /** Readable budget line for an audit entry (used/max per ceiling). */
  private budgetLine(): { actions: string; tokens: string; costUsd: string } {
    const s = this.budget.snapshot();
    return {
      actions: `${s.actions.used}/${s.actions.max}`,
      tokens: `${s.tokens.used}/${s.tokens.max}`,
      costUsd: `$${s.costUsd.used.toFixed(4)}/$${s.costUsd.max.toFixed(4)}`,
    };
  }

  /**
   * The read-only skill allowlist: every registered tool whose declared
   * authorization level is "read-only" (no write/exec/network/dangerous, and
   * not undeclared). Derived from the canonical ToolInventory classifier so the
   * definition of "read-only" matches the rest of the runtime.
   *
   * Cached for ALLOWLIST_TTL_MS: the tool set is stable once bootstrapped, so
   * rebuilding the whole inventory on every calm heartbeat is wasted work.
   */
  private readOnlyAllowlist(now = Date.now()): string[] {
    const cached = this.allowlistCache;
    if (cached && now - cached.at < ALLOWLIST_TTL_MS) return cached.skills;
    try {
      const inventory = buildToolInventory(this.runtime.tools);
      const skills = inventory.records
        .filter((record) => record.authorization === "read-only" && record.permissions.length > 0)
        .map((record) => record.name);
      this.allowlistCache = { skills, at: now };
      return skills;
    } catch {
      // On failure, prefer a slightly stale allowlist over launching blind.
      return cached?.skills ?? [];
    }
  }

  /**
   * Pick the next eligible plan (round-robin) whose preferred tools are present
   * in the read-only allowlist, so we never launch a diagnostic the current
   * tool set cannot actually perform read-only. Pure lookup: the cursor is only
   * advanced later, by commitPlanCursor, once the plan is actually launched.
   */
  private selectPlan(allowlist: string[]): IdlePlan | undefined {
    if (allowlist.length === 0) return undefined;
    const allow = new Set(allowlist);
    const has = (needle: string) =>
      allow.has(needle) || allowlist.some((name) => name.includes(needle));
    for (let i = 0; i < IDLE_PLANS.length; i++) {
      const plan = IDLE_PLANS[(this.planCursor + i) % IDLE_PLANS.length];
      if (plan.prefer.some(has)) return plan;
    }
    return undefined;
  }

  /** Advance the round-robin cursor to just past the launched plan. */
  private commitPlanCursor(plan: IdlePlan): void {
    const index = IDLE_PLANS.indexOf(plan);
    if (index >= 0) this.planCursor = (index + 1) % IDLE_PLANS.length;
  }
}
