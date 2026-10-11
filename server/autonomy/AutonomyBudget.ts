/**
 * AutonomyBudget — hard ceilings for *self-initiated* (idle) autonomous work.
 *
 * Phase 3 ("autonomie encadrée"): when Leanna works on her own during calm
 * periods, that work must be bounded. This component enforces three independent
 * ceilings, all per rolling hour unless noted:
 *   - actions/hour : how many self-initiated missions may be launched.
 *   - tokens/hour  : model tokens the self-initiated work may consume.
 *   - cost/hour    : estimated USD the self-initiated work may consume.
 *
 * It is deliberately NARROW: it governs only the idle/proactive loop, never the
 * user's own on-demand missions (those stay bounded by the existing per-mission
 * TelemetryService budget). Deterministic, in-memory, and side-effect free apart
 * from its own counters — mirroring the conventions of the autonomy package.
 */

export interface AutonomyBudgetConfig {
  /** Max self-initiated actions (missions) per rolling hour. 0 disables idle work. */
  maxActionsPerHour: number;
  /** Max model tokens consumed by self-initiated work per rolling hour. */
  maxTokensPerHour: number;
  /** Max estimated USD consumed by self-initiated work per rolling hour. */
  maxCostUsdPerHour: number;
  /** Per-mission token ceiling handed to the Executor/TelemetryService budget. */
  perMissionMaxTokens: number;
  /** Per-mission USD ceiling handed to the Executor/TelemetryService budget. */
  perMissionMaxCostUsd: number;
}

const positive = (value: number, fallback: number): number =>
  Number.isFinite(value) && value >= 0 ? value : fallback;

/** Reads budget ceilings from the environment, failing closed to safe defaults. */
export const autonomyBudgetConfigFromEnv = (
  env: NodeJS.ProcessEnv = process.env,
): AutonomyBudgetConfig => ({
  maxActionsPerHour: positive(Number(env.LEANNA_AUTONOMY_MAX_ACTIONS_PER_HOUR), 4),
  maxTokensPerHour: positive(Number(env.LEANNA_AUTONOMY_MAX_TOKENS_PER_HOUR), 200_000),
  maxCostUsdPerHour: positive(Number(env.LEANNA_AUTONOMY_MAX_COST_USD_PER_HOUR), 0.5),
  perMissionMaxTokens: positive(Number(env.LEANNA_AUTONOMY_PER_MISSION_MAX_TOKENS), 60_000),
  perMissionMaxCostUsd: positive(Number(env.LEANNA_AUTONOMY_PER_MISSION_MAX_COST_USD), 0.15),
});

/** A single accounted action within the rolling window. */
interface Accrual {
  at: number;
  tokens: number;
  costUsd: number;
}

/** The verdict returned by admit(): may this self-initiated action proceed? */
export interface BudgetVerdict {
  allowed: boolean;
  /** Human-readable reason, propagated to the audit log and events. */
  reason: string;
  /** Which ceiling blocked it, when denied. */
  limited?: "actions" | "tokens" | "cost";
}

/** A readable snapshot of current consumption vs. the ceilings. */
export interface BudgetSnapshot {
  windowMs: number;
  actions: { used: number; max: number };
  tokens: { used: number; max: number };
  costUsd: { used: number; max: number };
  perMission: { maxTokens: number; maxCostUsd: number };
}

/**
 * Rolling-hour budget for self-initiated autonomous work. `admit()` is a
 * pre-flight check (does launching one more action stay within every ceiling?);
 * `record()` accrues the real usage reported after the action completes.
 */
export class AutonomyBudget {
  private static readonly WINDOW_MS = 60 * 60_000; // 1 hour rolling window
  private readonly accruals: Accrual[] = [];

  constructor(private readonly config: AutonomyBudgetConfig = autonomyBudgetConfigFromEnv()) {}

  /** Per-mission ceilings to hand to the Executor/TelemetryService budget. */
  perMissionBudget(): { maxTokens: number; maxCostUsd: number } {
    return { maxTokens: this.config.perMissionMaxTokens, maxCostUsd: this.config.perMissionMaxCostUsd };
  }

  /**
   * Pre-flight: may one more self-initiated action start now? Denies when the
   * action count ceiling is reached, or when either resource ceiling is already
   * met (so a single over-budget action cannot be chased by another). An
   * actions ceiling of 0 disables idle work entirely.
   */
  admit(now = Date.now()): BudgetVerdict {
    this.prune(now);
    if (this.config.maxActionsPerHour <= 0) {
      return { allowed: false, reason: "Idle autonomy disabled (maxActionsPerHour = 0).", limited: "actions" };
    }
    if (this.accruals.length >= this.config.maxActionsPerHour) {
      return { allowed: false, reason: `Actions/hour budget reached (${this.accruals.length}/${this.config.maxActionsPerHour}).`, limited: "actions" };
    }
    const used = this.usage(now);
    if (used.tokens >= this.config.maxTokensPerHour) {
      return { allowed: false, reason: `Tokens/hour budget reached (${used.tokens}/${this.config.maxTokensPerHour}).`, limited: "tokens" };
    }
    if (used.costUsd >= this.config.maxCostUsdPerHour) {
      return { allowed: false, reason: `Cost/hour budget reached ($${used.costUsd.toFixed(4)}/$${this.config.maxCostUsdPerHour.toFixed(4)}).`, limited: "cost" };
    }
    return { allowed: true, reason: "Within idle autonomy budget." };
  }

  /**
   * Accrue the real usage of a completed self-initiated action. Always counts
   * as one action; tokens/cost default to 0 when unknown (an action still
   * consumes an action slot even if its model usage was not reported).
   */
  record(usage: { tokens?: number; costUsd?: number } = {}, now = Date.now()): void {
    this.accruals.push({ at: now, tokens: Math.max(0, usage.tokens ?? 0), costUsd: Math.max(0, usage.costUsd ?? 0) });
    this.prune(now);
  }

  /** Readable snapshot of current consumption vs. ceilings (for audit / UI). */
  snapshot(now = Date.now()): BudgetSnapshot {
    this.prune(now);
    const used = this.usage(now);
    return {
      windowMs: AutonomyBudget.WINDOW_MS,
      actions: { used: this.accruals.length, max: this.config.maxActionsPerHour },
      tokens: { used: used.tokens, max: this.config.maxTokensPerHour },
      costUsd: { used: used.costUsd, max: this.config.maxCostUsdPerHour },
      perMission: { maxTokens: this.config.perMissionMaxTokens, maxCostUsd: this.config.perMissionMaxCostUsd },
    };
  }

  private usage(now: number): { tokens: number; costUsd: number } {
    this.prune(now);
    let tokens = 0;
    let costUsd = 0;
    for (const a of this.accruals) { tokens += a.tokens; costUsd += a.costUsd; }
    return { tokens, costUsd };
  }

  /** Drop accruals older than the rolling window. */
  private prune(now: number): void {
    const cutoff = now - AutonomyBudget.WINDOW_MS;
    while (this.accruals.length > 0 && this.accruals[0].at <= cutoff) this.accruals.shift();
  }
}
