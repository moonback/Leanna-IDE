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
 */

import { randomUUID } from "crypto";
import type { AgentRuntime } from "../runtime/index.js";
import { buildToolInventory } from "../runtime/ToolInventory.js";
import { AutonomyBudget } from "./AutonomyBudget.js";
import { AutonomyAuditLog } from "./AutonomyAuditLog.js";

/** Outcome of a self-initiated mission, reported by the executeMission seam. */
export interface IdleMissionResult {
  success: boolean;
  summary?: string;
  escalate?: boolean;
  /** Real usage reported by the mission, when available (for the budget). */
  tokens?: number;
  costUsd?: number;
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
}) => Promise<IdleMissionResult>;

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
  {
    action: "idle:project-doctor",
    title: "Diagnostic de santé du projet (lecture seule)",
    description: "Analyser la santé du projet (architecture, sécurité, tests, dette) et résumer les problèmes prioritaires, sans aucune modification.",
    prefer: ["knowledge_project_doctor", "knowledge_opportunities", "knowledge_build_context"],
  },
  {
    action: "idle:code-review",
    title: "Revue de code en lecture seule",
    description: "Parcourir le code et les dépendances pour repérer les risques et les améliorations possibles, en lecture seule, sans rien modifier.",
    prefer: ["codebase", "knowledge_semantic_search", "knowledge_build_context"],
  },
  {
    action: "idle:predict-review",
    title: "Revue des opportunités et prédiction de risque (lecture seule)",
    description: "Lister les opportunités d'amélioration et estimer le risque de la mission prioritaire, en lecture seule.",
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
}

/** Deterministic, bounded idle worker. */
export class IdleWorker {
  private readonly budget: AutonomyBudget;
  private readonly audit: AutonomyAuditLog;
  private readonly runMission?: IdleMissionRunner;
  private readonly isBusy: () => boolean;
  private readonly enabled: boolean;

  /** Kill switch: when paused, no self-initiated work is launched. */
  private paused = false;
  /** Guards against overlapping idle missions. */
  private running = false;
  /** Round-robin cursor over IDLE_PLANS. */
  private planCursor = 0;

  constructor(private readonly runtime: AgentRuntime, options: IdleWorkerOptions = {}) {
    this.budget = options.budget ?? new AutonomyBudget();
    this.audit = options.auditLog ?? new AutonomyAuditLog();
    this.runMission = options.runMission;
    this.isBusy = options.isBusy ?? (() => false);
    this.enabled = options.enabled ?? true;
  }

  /** Kill switch — stop launching self-initiated work (reversible). */
  pause(reason = "kill switch"): void {
    if (this.paused) return;
    this.paused = true;
    this.audit.append({ phase: "skipped", action: "idle:pause", message: `Idle autonomy paused — ${reason}.` });
  }

  /** Resume self-initiated work after a pause. */
  resume(reason = "operator"): void {
    if (!this.paused) return;
    this.paused = false;
    this.audit.append({ phase: "considered", action: "idle:resume", message: `Idle autonomy resumed — ${reason}.` });
  }

  isPaused(): boolean { return this.paused; }
  getAuditLog(): AutonomyAuditLog { return this.audit; }
  getBudget(): AutonomyBudget { return this.budget; }

  /**
   * Entry point, called on each heartbeat. Only acts during genuinely calm
   * periods (idle/sleep, not busy). Returns true when a mission was launched.
   */
  async onHeartbeat(state: "active" | "idle" | "sleep"): Promise<boolean> {
    if (!this.enabled || this.paused) return false;
    if (state === "active") return false;
    if (this.running || this.isBusy()) return false;
    return this.runOnce();
  }

  /**
   * Run a single read-only diagnostic now (also used by tests/on-demand).
   * Honours the kill switch and budget; returns true if a mission launched.
   */
  async runOnce(): Promise<boolean> {
    if (!this.enabled || this.paused) return false;
    if (this.running) return false;

    const runId = randomUUID();
    const admit = this.budget.admit();
    if (!admit.allowed) {
      this.audit.append({ phase: "skipped", action: "idle:budget", message: admit.reason, runId, budget: this.budgetLine() });
      return false;
    }

    const allowlist = this.readOnlyAllowlist();
    const plan = this.selectPlan(allowlist);
    if (!plan) {
      this.audit.append({ phase: "skipped", action: "idle:no-plan", message: "No eligible read-only diagnostic for the current tool set.", runId });
      return false;
    }

    this.audit.append({
      phase: "considered", action: plan.action, runId,
      message: `Calm period — considering read-only diagnostic « ${plan.title} ».`,
      budget: this.budgetLine(),
    });

    // Without a runner wired we only observe/audit (observe-only mode).
    if (!this.runMission) {
      this.audit.append({ phase: "skipped", action: plan.action, message: "No mission runner wired (observe-only mode).", runId });
      return false;
    }

    this.running = true;
    const perMission = this.budget.perMissionBudget();
    this.audit.append({
      phase: "started", action: plan.action, runId, skills: allowlist.slice(0, 12), dryRun: true,
      message: `Launching read-only (dry-run) mission « ${plan.title} ».`,
    });

    try {
      const result = await this.runMission({
        title: plan.title,
        description: plan.description,
        availableSkills: allowlist,
        dryRun: true,
        budget: perMission,
      });
      // Account the real usage (defaults to one action with 0 tokens/cost).
      this.budget.record({ tokens: result.tokens, costUsd: result.costUsd });
      const outcome = result.success ? "success" : result.escalate ? "blocked" : "failed";
      this.audit.append({
        phase: "completed", action: plan.action, runId, outcome,
        tokens: result.tokens, costUsd: result.costUsd, dryRun: true,
        message: result.summary ?? `Read-only diagnostic ${outcome}.`,
        budget: this.budgetLine(),
      });
      return true;
    } catch (error) {
      // A thrown mission still consumed an action slot.
      this.budget.record({});
      this.audit.append({
        phase: "error", action: plan.action, runId, outcome: "error",
        message: error instanceof Error ? error.message : String(error),
        budget: this.budgetLine(),
      });
      return true;
    } finally {
      this.running = false;
    }
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
   */
  private readOnlyAllowlist(): string[] {
    try {
      const inventory = buildToolInventory(this.runtime.tools);
      return inventory.records
        .filter((record) => record.authorization === "read-only" && record.permissions.length > 0)
        .map((record) => record.name);
    } catch {
      return [];
    }
  }

  /**
   * Pick the next eligible plan (round-robin) whose preferred tools are present
   * in the read-only allowlist, so we never launch a diagnostic the current
   * tool set cannot actually perform read-only.
   */
  private selectPlan(allowlist: string[]): IdlePlan | undefined {
    if (allowlist.length === 0) return undefined;
    const has = (needle: string) => allowlist.some((name) => name === needle || name.includes(needle));
    for (let i = 0; i < IDLE_PLANS.length; i++) {
      const plan = IDLE_PLANS[(this.planCursor + i) % IDLE_PLANS.length];
      if (plan.prefer.some(has)) {
        this.planCursor = (this.planCursor + i + 1) % IDLE_PLANS.length;
        return plan;
      }
    }
    return undefined;
  }
}
