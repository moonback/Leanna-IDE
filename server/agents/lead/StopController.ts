import { progressMarker, type LeadRunState, type LeadStop, type StopDecision } from "./types.js";

/**
 * Décide si l'Agent Lead autorise une nouvelle délégation ou réplanification.
 * Arrêt collant : une fois stoppé, toutes les décisions suivantes sont identiques.
 */
export class StopController {
  constructor(private readonly now: () => number = Date.now) {}

  shouldContinue(state: LeadRunState, point: "delegation" | "replan"): StopDecision {
    if (state.stopped) return state.stopped;
    const stop = this.evaluate(state, point);
    if (stop) {
      state.stopped = stop;
      return stop;
    }
    if (point === "replan") state.lastReplanMarker = progressMarker(state);
    return { continue: true };
  }

  recordDelegation(state: LeadRunState): void {
    state.delegations++;
  }

  recordStageOutcome(state: LeadRunState, stageId: string, passed: boolean, filesVerified: number): void {
    if (passed) {
      state.completedStages.add(stageId);
      state.consecutiveFailures = 0;
    } else {
      state.consecutiveFailures++;
    }
    state.filesVerified = Math.max(state.filesVerified, filesVerified);
  }

  private evaluate(state: LeadRunState, point: "delegation" | "replan"): LeadStop | null {
    const { budget } = state;
    const elapsed = this.now() - state.startedAt;
    if (elapsed >= budget.maxWallTimeMs) {
      return { continue: false, reason: "wall_time", detail: `durée ${Math.round(elapsed / 1000)}s ≥ ${Math.round(budget.maxWallTimeMs / 1000)}s` };
    }
    if (state.delegations >= budget.maxDelegations) {
      return { continue: false, reason: "delegation_budget", detail: `${state.delegations} délégation(s) ≥ budget de ${budget.maxDelegations}` };
    }
    if (state.consecutiveFailures >= budget.maxConsecutiveFailures) {
      return { continue: false, reason: "consecutive_failures", detail: `${state.consecutiveFailures} échec(s) consécutif(s)` };
    }
    if (point === "replan" && state.lastReplanMarker !== null && progressMarker(state) <= state.lastReplanMarker) {
      return { continue: false, reason: "no_progress", detail: "aucun progrès depuis la dernière réplanification" };
    }
    return null;
  }
}
