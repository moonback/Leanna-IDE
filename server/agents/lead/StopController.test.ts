import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { StopController } from "./StopController.js";
import { createLeadRunState, DEFAULT_LEAD_BUDGET, resolveLeadBudget } from "./types.js";

function stateAt(startedAt: number, budget = {}) {
  return createLeadRunState("plan-1", "objectif", budget, startedAt);
}

describe("resolveLeadBudget", () => {
  it("garde les défauts pour un budget vide, undefined ou invalide", () => {
    assert.deepEqual(resolveLeadBudget(), { ...DEFAULT_LEAD_BUDGET });
    assert.deepEqual(resolveLeadBudget({}), { ...DEFAULT_LEAD_BUDGET });
    const r = resolveLeadBudget({ maxDelegations: undefined, maxWallTimeMs: Number.NaN, maxConsecutiveFailures: 0 });
    assert.deepEqual(r, { ...DEFAULT_LEAD_BUDGET });
  });

  it("applique les valeurs fournies", () => {
    assert.equal(resolveLeadBudget({ maxDelegations: 4 }).maxDelegations, 4);
  });
});

describe("StopController", () => {
  it("continue tant que le budget tient", () => {
    const stop = new StopController(() => 1_000);
    assert.deepEqual(stop.shouldContinue(stateAt(0), "delegation"), { continue: true });
  });

  it("stoppe sur la durée maximale", () => {
    const stop = new StopController(() => 5_000);
    const d = stop.shouldContinue(stateAt(0, { maxWallTimeMs: 5_000 }), "delegation");
    assert.equal(d.continue, false);
    assert.equal(!d.continue && d.reason, "wall_time");
  });

  it("stoppe sur le budget de délégations", () => {
    const stop = new StopController(() => 0);
    const state = stateAt(0, { maxDelegations: 2 });
    stop.recordDelegation(state);
    assert.equal(stop.shouldContinue(state, "delegation").continue, true);
    stop.recordDelegation(state);
    const d = stop.shouldContinue(state, "delegation");
    assert.equal(!d.continue && d.reason, "delegation_budget");
  });

  it("stoppe après N échecs consécutifs et remet le compteur à zéro sur un succès", () => {
    const stop = new StopController(() => 0);
    const state = stateAt(0, { maxConsecutiveFailures: 2 });
    stop.recordStageOutcome(state, "s1", false, 0);
    stop.recordStageOutcome(state, "s2", true, 1);
    assert.equal(state.consecutiveFailures, 0);
    stop.recordStageOutcome(state, "s3", false, 1);
    stop.recordStageOutcome(state, "s4", false, 1);
    const d = stop.shouldContinue(state, "delegation");
    assert.equal(!d.continue && d.reason, "consecutive_failures");
  });

  it("autorise toujours le premier replan puis stoppe sans progrès", () => {
    const stop = new StopController(() => 0);
    const state = stateAt(0);
    assert.equal(stop.shouldContinue(state, "replan").continue, true);
    const d = stop.shouldContinue(state, "replan");
    assert.equal(!d.continue && d.reason, "no_progress");
  });

  it("autorise un nouveau replan s'il y a eu du progrès", () => {
    const stop = new StopController(() => 0);
    const state = stateAt(0);
    assert.equal(stop.shouldContinue(state, "replan").continue, true);
    stop.recordStageOutcome(state, "s1", true, 1);
    assert.equal(stop.shouldContinue(state, "replan").continue, true);
  });

  it("un état stoppé le reste (décision collante)", () => {
    let now = 10_000;
    const stop = new StopController(() => now);
    const state = stateAt(0, { maxWallTimeMs: 10_000 });
    const first = stop.shouldContinue(state, "delegation");
    now = 0;
    assert.deepEqual(stop.shouldContinue(state, "delegation"), first);
    assert.deepEqual(state.stopped, first);
  });
});
