import { randomUUID } from "crypto";
import type { AgentPriority, AgentRuntime, RuntimeEvent } from "../runtime/index.js";
import type { AutonomousTask } from "./TaskManager.js";
import { PerceptionEngine, type Perception } from "./PerceptionEngine.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("Autonomy:Executive");
/** Short id for readable logs (first 8 chars of a uuid). */
const sid = (id?: string): string => (id ? id.slice(0, 8) : "—");
/** Clamp a long free-text value for a one-line log. */
const truncate = (text: string, max = 80): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * Shape of `task.metadata.anticipation` produced by AnticipationEngine when it
 * auto-launches a proactive proposal as a mission task. Kept in sync with the
 * metadata written in AnticipationEngine.emitProposal().
 */
interface AnticipationMeta {
  kind: "problem" | "opportunity" | "optimization" | "risk" | "automation";
  message: string;
  suggestedAction: string;
  affectedResources: string[];
  importance: number;
  /** True for scheduled proposals (e.g. the daily briefing) → SCHEDULE goal. */
  scheduled?: boolean;
  /** Optional Markdown digest carried from a daily briefing. */
  briefingSummary?: string;
}

/** The action selected by the deterministic autonomy policy. */
export type ObservationDisposition = "IGNORE" | "STORE" | "MONITOR" | "INVESTIGATE" | "ACT" | "ESCALATE";
export type AutonomousGoalSource = "USER" | "SYSTEM" | "MISSION" | "EVENT" | "SCHEDULE" | "AGENT" | "LEARNED";
export type AutonomousGoalStatus = "PENDING" | "ACTIVE" | "BLOCKED" | "PAUSED" | "COMPLETED" | "FAILED" | "CANCELLED" | "ESCALATED";

export interface AutonomousGoal {
  id: string;
  parentGoalId?: string;
  description: string;
  source: AutonomousGoalSource;
  priority: AgentPriority;
  status: AutonomousGoalStatus;
  constraints: string[];
  deadline?: number;
  budget?: { maxCostUsd?: number; maxTokens?: number };
  riskLevel: "low" | "medium" | "high" | "critical";
  successCriteria: string[];
  createdAt: number;
  updatedAt: number;
}

export interface PriorityFactors {
  urgency?: number; importance?: number; risk?: number; dependency?: number; userIntent?: number;
  deadline?: number; cost?: number; confidence?: number; impact?: number; missionPriority?: number;
}

/** Runtime-owned arbitration; model output must be converted to these bounded inputs. */
export class PriorityEngine {
  score(factors: PriorityFactors): number {
    const clamp = (value = 0) => Math.max(0, Math.min(1, value));
    return Math.round(100 * (
      clamp(factors.urgency) * .18 + clamp(factors.importance) * .18 + clamp(factors.risk) * .14 +
      clamp(factors.dependency) * .08 + clamp(factors.userIntent) * .12 + clamp(factors.deadline) * .1 +
      (1 - clamp(factors.cost)) * .04 + clamp(factors.confidence) * .05 + clamp(factors.impact) * .07 +
      clamp(factors.missionPriority) * .04
    ));
  }

  toPriority(score: number): AgentPriority {
    return score >= 80 ? "critical" : score >= 60 ? "high" : score >= 35 ? "medium" : "low";
  }
}

/**
 * Durable goal persistence seam. Best-effort and fully optional: every method
 * may be sync or async and must never throw into the GoalManager. The default
 * implementation (MemoryGoalStore) is backed by the runtime's project-level
 * Memory, so goals survive a restart wherever project memory is persisted.
 */
export interface GoalStore {
  save(goal: AutonomousGoal): Promise<void> | void;
  loadActive(): AutonomousGoal[];
  remove?(id: string): Promise<void> | void;
}

/**
 * GoalStore implementation over the runtime Memory (project level). Keys goals
 * under `autonomy:goal:<id>`. Terminal goals (COMPLETED/CANCELLED) are dropped
 * so restore() only ever rehydrates goals that still need attention.
 */
export class MemoryGoalStore implements GoalStore {
  private static readonly PREFIX = "autonomy:goal:";

  constructor(private readonly memory: AgentRuntime["memory"]) {}

  save(goal: AutonomousGoal): void {
    const key = `${MemoryGoalStore.PREFIX}${goal.id}`;
    if (goal.status === "COMPLETED" || goal.status === "CANCELLED") {
      this.memory.delete?.("project", key);
      return;
    }
    void this.memory.set("project", key, goal);
  }

  remove(id: string): void {
    this.memory.delete?.("project", `${MemoryGoalStore.PREFIX}${id}`);
  }

  loadActive(): AutonomousGoal[] {
    try {
      const entries = this.memory.search?.("project", { prefix: MemoryGoalStore.PREFIX, limit: 500 }) ?? [];
      return entries
        .map((entry) => entry.value as AutonomousGoal)
        .filter((goal): goal is AutonomousGoal => Boolean(goal?.id) && goal.status !== "COMPLETED" && goal.status !== "CANCELLED");
    } catch {
      return [];
    }
  }
}

/**
 * In-memory, deduplicating goal index with an optional durable backing store.
 * When a GoalStore is supplied, every create/update/transition is mirrored to
 * it (best-effort) and `restore()` rehydrates non-terminal goals on startup.
 */
export class GoalManager {
  private readonly goals = new Map<string, AutonomousGoal>();

  constructor(private readonly store?: GoalStore) {}

  /** Rehydrate non-terminal goals from the store (idempotent; call once at startup). */
  restore(): number {
    if (!this.store) return 0;
    let restored = 0;
    for (const goal of this.store.loadActive()) {
      if (this.goals.has(goal.id)) continue;
      this.goals.set(goal.id, goal);
      restored++;
    }
    if (restored > 0) log.info(`♻️  Restored ${restored} non-terminal goal(s) from durable store.`);
    return restored;
  }

  createOrUpdate(input: Omit<AutonomousGoal, "id" | "createdAt" | "updatedAt" | "status">): { goal: AutonomousGoal; created: boolean } {
    const normalized = input.description.trim().toLowerCase().replace(/\s+/g, " ");
    const existing = [...this.goals.values()].find((goal) =>
      goal.status !== "COMPLETED" && goal.status !== "CANCELLED" && goal.description.toLowerCase().replace(/\s+/g, " ") === normalized,
    );
    if (existing) {
      existing.priority = input.priority;
      existing.riskLevel = input.riskLevel;
      existing.updatedAt = Date.now();
      this.persist(existing);
      log.debug(`🎯 Goal reused ${sid(existing.id)} [${existing.source}/${existing.priority}] — "${truncate(existing.description)}"`);
      return { goal: existing, created: false };
    }
    const now = Date.now();
    const goal: AutonomousGoal = { ...input, id: randomUUID(), status: "PENDING", createdAt: now, updatedAt: now };
    this.goals.set(goal.id, goal);
    this.persist(goal);
    log.info(`🎯 Goal created ${sid(goal.id)} [${goal.source}/${goal.priority}/risk:${goal.riskLevel}] — "${truncate(goal.description)}"`);
    return { goal, created: true };
  }

  list(): AutonomousGoal[] { return [...this.goals.values()]; }
  get(id: string): AutonomousGoal | undefined { return this.goals.get(id); }
  transition(id: string, status: AutonomousGoalStatus): void {
    const goal = this.goals.get(id);
    if (goal) {
      const from = goal.status;
      goal.status = status; goal.updatedAt = Date.now(); this.persist(goal);
      log.info(`🎯 Goal ${sid(id)} ${from} → ${status}`);
    }
  }

  /** Best-effort mirror to the durable store; never throws into the caller. */
  private persist(goal: AutonomousGoal): void {
    try { void this.store?.save(goal); } catch { /* persistence is best-effort */ }
  }
}

export interface AutonomousDecision {
  disposition: ObservationDisposition;
  reason: string;
  priority: AgentPriority;
  goal?: AutonomousGoal;
}

export interface AutonomousMissionRequest {
  cycleId: string;
  traceId: string;
  goal: AutonomousGoal;
  observation: Perception;
  task: AutonomousTask;
}

export interface AutonomousExecutiveOptions {
  /** The sole hand-off into planning/execution. Existing Mission/Brain systems own this callback. */
  executeMission?: (request: AutonomousMissionRequest) => Promise<{ success: boolean; summary?: string; escalate?: boolean }>;
  /** @deprecated Use maxConcurrentCycles; retained for configuration compatibility. */
  maxCycles?: number;
  /** Maximum executive cycles in flight; excess work remains in TaskManager's bounded queue. */
  maxConcurrentCycles?: number;
  onEvent?: (event: AutonomousExecutiveEvent) => void;
}

/** Reads only positive integer limits; malformed environment values fail closed to the safe default. */
export const autonomousExecutiveConfigFromEnv = (
  env: NodeJS.ProcessEnv = process.env,
): Pick<AutonomousExecutiveOptions, "maxConcurrentCycles"> => {
  const parsed = Number(env.LEANNA_AUTONOMY_MAX_CONCURRENT_CYCLES);
  return { maxConcurrentCycles: Number.isInteger(parsed) && parsed > 0 ? parsed : 1 };
};

export interface AutonomousExecutiveEvent {
  type: string;
  traceId: string;
  cycleId: string;
  timestamp: number;
  status?: string;
  goalId?: string;
  taskId?: string;
  error?: string;
  // Index signature keeps the event structurally compatible with the generic
  // broadcaster payload in LeannaCore.broadcastExecutive (fixes GAP-4).
  [key: string]: unknown;
}

/**
 * Bounded perception → decision → mission bridge. It deliberately delegates
 * planning, tool authorization, dry-run, verification and reflection to the
 * already configured Mission/Brain/ToolRegistry pipeline instead of bypassing it.
 */
export class AutonomousExecutive {
  readonly goals: GoalManager;
  readonly priorities = new PriorityEngine();
  private readonly perception = new PerceptionEngine();
  private activeCycles = 0;

  constructor(private readonly runtime: AgentRuntime, private readonly options: AutonomousExecutiveOptions = {}) {
    // Goals are mirrored to project-level Memory so they survive a restart
    // wherever project memory is persisted. restore() rehydrates non-terminal
    // goals once at construction; it is a safe no-op when nothing was stored.
    this.goals = new GoalManager(new MemoryGoalStore(runtime.memory));
    this.goals.restore();
  }

  /**
   * Stable fingerprint of an event *class*, not a specific resource. This mirrors
   * the goal-dedup philosophy (resource identifiers are intentionally excluded so
   * repeated instances of the same failure class share one goal/tally), which is
   * what lets decide() recognise a recurring-but-impossible objective.
   */
  private fingerprint(event: RuntimeEvent, _observation: Perception): string {
    return event.type;
  }

  /**
   * Memory-informed bias (GAP-2). Reads the outcome recorded by a previous cycle
   * for the same fingerprint. If that class of goal was already escalated or
   * blocked recently, we raise urgency (it needs attention) and, once it has
   * failed repeatedly, we escalate immediately instead of re-attempting an
   * impossible mission. Deterministic and bounded; never invokes an LLM.
   */
  private recallOutcome(fingerprint: string): { escalate: boolean; urgencyBonus: number } {
    try {
      const recalled = this.runtime.memory.get("project", `autonomy:fingerprint:${fingerprint}`) as
        | { failures?: number; lastDisposition?: string }
        | undefined;
      if (!recalled) return { escalate: false, urgencyBonus: 0 };
      const failures = Number(recalled.failures) || 0;
      // 3+ prior failures of the same class → stop retrying, escalate to a human.
      return { escalate: failures >= 3, urgencyBonus: Math.min(0.3, failures * 0.1) };
    } catch {
      return { escalate: false, urgencyBonus: 0 };
    }
  }

  decide(event: RuntimeEvent): AutonomousDecision {
    const observation = this.perception.perceive(event);
    if (!observation.requiresAttention) {
      const disposition = observation.importance < .1 ? "IGNORE" : "STORE";
      log.debug(`🧭 Decision ${disposition} for ${event.type} (importance ${observation.importance.toFixed(2)}): ${observation.reason}`);
      return { disposition, reason: observation.reason, priority: "low" };
    }
    const memory = this.recallOutcome(this.fingerprint(event, observation));
    const score = this.priorities.score({ importance: observation.importance, urgency: Math.min(1, (observation.requiresAttention ? .7 : 0) + memory.urgencyBonus), risk: observation.importance, confidence: .8, impact: observation.importance });
    const priority = this.priorities.toPriority(score);
    const { goal } = this.goals.createOrUpdate({
      // Resource identifiers are intentionally excluded: repeated instances of
      // the same failure class are one goal until it is resolved/escalated.
      description: this.goalDescription(event, observation), source: "EVENT", priority, riskLevel: priority === "critical" ? "critical" : priority === "high" ? "high" : "medium",
      constraints: ["Use the existing ToolRegistry, PermissionPolicy, DryRunController and confirmation flow."],
      // Investigative deliverable: the condition is understood then recovered or
      // escalated. NOT a written file — these are analysis/recovery cycles, so
      // the wording avoids artifact keywords that would wrongly demand a file.
      successCriteria: ["The triggering condition is understood and either recovered or escalated for a human."],
    });
    if (event.type === "tool:permissionDenied") {
      log.warn(`🧭 Decision ESCALATE for ${event.type} [goal ${sid(goal.id)}/${priority}]: ${observation.reason}`);
      return { disposition: "ESCALATE", reason: observation.reason, priority, goal };
    }
    // A goal class that already failed repeatedly is escalated rather than
    // re-attempted, preventing an infinite loop on an impossible objective.
    if (memory.escalate) {
      log.warn(`🧭 Decision ESCALATE for ${event.type} [goal ${sid(goal.id)}] — repeated failures of the same class.`);
      return { disposition: "ESCALATE", reason: `${observation.reason} (échecs répétés du même type — escalade)`, priority, goal };
    }
    const disposition = observation.possibleActions.includes("maintenance") ? "ACT" : "INVESTIGATE";
    log.info(`🧭 Decision ${disposition} for ${event.type} [goal ${sid(goal.id)}/${priority}] (importance ${observation.importance.toFixed(2)}): ${observation.reason}`);
    return { disposition, reason: observation.reason, priority, goal };
  }

  private goalDescription(event: RuntimeEvent, observation: Perception): string {
    switch (event.type) {
      case "task:failed": return "Recover or escalate repeated runtime task failures.";
      case "tool:permissionDenied": return `Resolve or escalate denied permission for tool ${event.toolName}.`;
      case "workflow:completed": return event.success ? "Record completed workflow." : "Recover or escalate failed workflow.";
      default: return observation.reason;
    }
  }

  async execute(task: AutonomousTask): Promise<void> {
    const event = task.metadata?.event as RuntimeEvent | undefined;
    const anticipation = task.metadata?.anticipation as AnticipationMeta | undefined;
    if (!event && anticipation) return this.executeAnticipation(task, anticipation);
    if (!event) return; // Restored legacy tasks remain safe no-ops until a planner provides context.
    const limit = this.options.maxConcurrentCycles ?? this.options.maxCycles ?? 1;
    if (this.activeCycles >= limit) {
      log.warn(`⛔ Cycle rejected for task ${sid(task.id)} (${event.type}) — concurrency budget exhausted (${this.activeCycles}/${limit}); will be retried.`);
      throw new Error("Autonomy concurrency budget exhausted; task will be retried by TaskManager.");
    }
    this.activeCycles++;
    const cycleId = randomUUID(); const traceId = `autonomy:${cycleId}`;
    const startedAt = Date.now();
    try {
      log.info(`▶️  Cycle ${sid(cycleId)} started — reactive task ${sid(task.id)} (${event.type}), ${this.activeCycles}/${limit} in flight.`);
      this.emit("autonomy.cycle.started", traceId, cycleId, { taskId: task.id });
      const decision = this.decide(event);
      this.emit("autonomy.decision.made", traceId, cycleId, { taskId: task.id, goalId: decision.goal?.id, status: decision.disposition });
      if (decision.disposition === "IGNORE" || decision.disposition === "STORE" || decision.disposition === "MONITOR") {
        await this.runtime.memory.set("session", `autonomy:observation:${task.id}`, { event, decision, observedAt: Date.now() }, { ttl: 86_400_000 });
        this.emit("autonomy.memory.updated", traceId, cycleId, { taskId: task.id, status: "stored" });
        log.debug(`⏹️  Cycle ${sid(cycleId)} ended — observation ${decision.disposition.toLowerCase()}, no mission.`);
        return;
      }
      if (!decision.goal || decision.disposition === "ESCALATE" || !this.options.executeMission) {
        decision.goal && this.goals.transition(decision.goal.id, "ESCALATED");
        this.emit("autonomy.cycle.escalated", traceId, cycleId, { taskId: task.id, goalId: decision.goal?.id, status: decision.reason });
        log.warn(`🚨 Cycle ${sid(cycleId)} escalated [goal ${sid(decision.goal?.id)}]: ${decision.reason}`);
        return;
      }
      this.goals.transition(decision.goal.id, "ACTIVE");
      this.emit("autonomy.mission.created", traceId, cycleId, { taskId: task.id, goalId: decision.goal.id });
      log.info(`🚀 Mission handoff [cycle ${sid(cycleId)}/goal ${sid(decision.goal.id)}] — "${truncate(decision.goal.description)}"`);
      const result = await this.options.executeMission({ cycleId, traceId, goal: decision.goal, observation: this.perception.perceive(event), task });
      this.goals.transition(decision.goal.id, result.escalate ? "ESCALATED" : result.success ? "COMPLETED" : "BLOCKED");
      await this.runtime.memory.set("project", `autonomy:outcome:${decision.goal.id}`, { result, cycleId, traceId, completedAt: Date.now() });
      // Persist a per-fingerprint tally so decide() can bias future cycles of the
      // same goal class (GAP-2). Success resets the failure counter. Guarded so a
      // memory backend without get() (e.g. minimal test doubles) never breaks the cycle.
      let failures = 0;
      try {
        const fingerprint = this.fingerprint(event, this.perception.perceive(event));
        const prior = (this.runtime.memory.get?.("project", `autonomy:fingerprint:${fingerprint}`) as { failures?: number } | undefined)?.failures ?? 0;
        failures = result.success ? 0 : prior + 1;
        await this.runtime.memory.set("project", `autonomy:fingerprint:${fingerprint}`, { failures, lastDisposition: decision.disposition, updatedAt: Date.now() });
      } catch { /* per-fingerprint tally is best-effort */ }
      this.emit(result.escalate ? "autonomy.cycle.escalated" : "autonomy.cycle.completed", traceId, cycleId, { taskId: task.id, goalId: decision.goal.id, status: result.success ? "completed" : "blocked" });
      const outcome = result.escalate ? "ESCALATED" : result.success ? "completed ✅" : "blocked ⚠️";
      const durationMs = Date.now() - startedAt;
      const tally = result.success ? "" : ` (fingerprint failures: ${failures})`;
      log.info(`🏁 Cycle ${sid(cycleId)} ${outcome} in ${durationMs}ms [goal ${sid(decision.goal.id)}]${tally} — ${truncate(result.summary ?? decision.reason)}`);
    } catch (error) {
      log.error(`💥 Cycle ${sid(cycleId)} threw after ${Date.now() - startedAt}ms (task ${sid(task.id)}, ${event.type}): ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      this.activeCycles--;
    }
  }

  /**
   * Execute an auto-launched anticipation proposal. Unlike reactive tasks there
   * is no RuntimeEvent, so we synthesise an equivalent goal + observation from
   * the proposal metadata and reuse the same mission hand-off, memory tally and
   * escalation-after-repeated-failure logic. The per-fingerprint tally keys on
   * `anticipation:<signal>` (finer than event.type), so recurring instances of
   * one problem class share a counter and escalate after 3 failures.
   */
  private async executeAnticipation(task: AutonomousTask, a: AnticipationMeta): Promise<void> {
    const limit = this.options.maxConcurrentCycles ?? this.options.maxCycles ?? 1;
    if (this.activeCycles >= limit) {
      log.warn(`⛔ Anticipation cycle rejected for task ${sid(task.id)} (${a.kind}) — concurrency budget exhausted (${this.activeCycles}/${limit}); will be retried.`);
      throw new Error("Autonomy concurrency budget exhausted; task will be retried by TaskManager.");
    }
    this.activeCycles++;
    const cycleId = randomUUID(); const traceId = `autonomy:${cycleId}`;
    const startedAt = Date.now();
    try {
      log.info(`▶️  Cycle ${sid(cycleId)} started — anticipation ${a.scheduled ? "SCHEDULE" : a.kind} task ${sid(task.id)} (importance ${a.importance.toFixed(2)}): "${truncate(a.message)}"`);
      this.emit("autonomy.cycle.started", traceId, cycleId, { taskId: task.id });

      const memory = this.recallOutcome(task.fingerprint);
      const score = this.priorities.score({
        importance: a.importance,
        urgency: Math.min(1, a.importance * 0.8 + memory.urgencyBonus),
        risk: a.kind === "risk" ? a.importance : a.importance * 0.6,
        confidence: 0.7, impact: a.importance,
      });
      const priority = this.priorities.toPriority(score);
      const { goal } = this.goals.createOrUpdate({
        description: `${a.suggestedAction} (${a.message})`,
        // Scheduled proposals (daily briefing) are time-driven, not learned.
        source: a.scheduled ? "SCHEDULE" : "LEARNED", priority,
        riskLevel: priority === "critical" ? "critical" : priority === "high" ? "high" : "medium",
        constraints: ["Use the existing ToolRegistry, PermissionPolicy, DryRunController and confirmation flow."],
        // Investigative deliverable: the detected condition is analysed then
        // mitigated or escalated. Wording avoids artifact keywords (no "report")
        // so an analysis mission isn't wrongly required to write a file.
        successCriteria: ["The detected condition is analysed and either mitigated or escalated for a human."],
      });
      this.emit("autonomy.decision.made", traceId, cycleId, { taskId: task.id, goalId: goal.id, status: memory.escalate ? "ESCALATE" : "ACT" });

      if (memory.escalate || !this.options.executeMission) {
        this.goals.transition(goal.id, "ESCALATED");
        this.emit("autonomy.cycle.escalated", traceId, cycleId, {
          taskId: task.id, goalId: goal.id,
          status: memory.escalate ? `${a.message} (échecs répétés — escalade)` : a.message,
        });
        log.warn(`🚨 Cycle ${sid(cycleId)} escalated [goal ${sid(goal.id)}] — ${memory.escalate ? "repeated failures" : "no mission runner wired"}.`);
        return;
      }

      const observation: Perception = {
        event: { type: "autonomy:anticipation", proposalId: task.sourceEventId, kind: a.kind,
          importance: a.importance, priority, message: a.message,
          affectedResources: a.affectedResources, suggestedAction: a.suggestedAction, queuedAsTask: true } as RuntimeEvent,
        importance: a.importance, novelty: 1, requiresAttention: true,
        affectedResources: a.affectedResources, possibleActions: ["mission"], reason: a.message,
      };

      this.goals.transition(goal.id, "ACTIVE");
      this.emit("autonomy.mission.created", traceId, cycleId, { taskId: task.id, goalId: goal.id });
      log.info(`🚀 Mission handoff [cycle ${sid(cycleId)}/goal ${sid(goal.id)}] — anticipation "${truncate(a.suggestedAction)}"`);
      const result = await this.options.executeMission({ cycleId, traceId, goal, observation, task });
      this.goals.transition(goal.id, result.escalate ? "ESCALATED" : result.success ? "COMPLETED" : "BLOCKED");
      await this.runtime.memory.set("project", `autonomy:outcome:${goal.id}`, { result, cycleId, traceId, completedAt: Date.now() });
      let failures = 0;
      try {
        const key = `autonomy:fingerprint:${task.fingerprint}`;
        const prior = (this.runtime.memory.get?.("project", key) as { failures?: number } | undefined)?.failures ?? 0;
        failures = result.success ? 0 : prior + 1;
        await this.runtime.memory.set("project", key, { failures, lastDisposition: "ACT", updatedAt: Date.now() });
      } catch { /* best-effort */ }
      this.emit(result.escalate ? "autonomy.cycle.escalated" : "autonomy.cycle.completed", traceId, cycleId, {
        taskId: task.id, goalId: goal.id, status: result.success ? "completed" : (result.summary ?? "blocked"),
      });
      const outcome = result.escalate ? "ESCALATED" : result.success ? "completed ✅" : "blocked ⚠️";
      const tally = result.success ? "" : ` (fingerprint failures: ${failures})`;
      log.info(`🏁 Cycle ${sid(cycleId)} ${outcome} in ${Date.now() - startedAt}ms [goal ${sid(goal.id)}]${tally} — ${truncate(result.summary ?? a.message)}`);
    } catch (error) {
      log.error(`💥 Anticipation cycle ${sid(cycleId)} threw after ${Date.now() - startedAt}ms (task ${sid(task.id)}): ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      this.activeCycles--;
    }
  }

  private emit(type: string, traceId: string, cycleId: string, extra: Omit<AutonomousExecutiveEvent, "type" | "traceId" | "cycleId" | "timestamp">): void {
    this.options.onEvent?.({ type, traceId, cycleId, timestamp: Date.now(), ...extra });
  }
}
