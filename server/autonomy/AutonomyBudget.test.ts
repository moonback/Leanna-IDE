import test from "node:test";
import assert from "node:assert/strict";
import { AutonomyBudget, autonomyBudgetConfigFromEnv } from "./AutonomyBudget.js";

const config = {
  maxActionsPerHour: 3,
  maxTokensPerHour: 1000,
  maxCostUsdPerHour: 0.1,
  perMissionMaxTokens: 500,
  perMissionMaxCostUsd: 0.05,
};

test("env config fails closed to safe non-negative defaults", () => {
  assert.deepEqual(
    autonomyBudgetConfigFromEnv({ LEANNA_AUTONOMY_MAX_ACTIONS_PER_HOUR: "7", LEANNA_AUTONOMY_MAX_TOKENS_PER_HOUR: "nope" } as NodeJS.ProcessEnv),
    { maxActionsPerHour: 7, maxTokensPerHour: 200_000, maxCostUsdPerHour: 0.5, perMissionMaxTokens: 60_000, perMissionMaxCostUsd: 0.15 },
  );
  // Negative values are rejected (fail closed to the default).
  assert.equal(autonomyBudgetConfigFromEnv({ LEANNA_AUTONOMY_MAX_ACTIONS_PER_HOUR: "-5" } as NodeJS.ProcessEnv).maxActionsPerHour, 4);
});

test("admits actions until the per-hour action ceiling is reached", () => {
  const budget = new AutonomyBudget(config);
  for (let i = 0; i < 3; i++) {
    assert.equal(budget.admit().allowed, true, `action ${i} should be admitted`);
    budget.record({ tokens: 1, costUsd: 0 });
  }
  const verdict = budget.admit();
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.limited, "actions");
});

test("denies when the token ceiling is already met", () => {
  const budget = new AutonomyBudget(config);
  budget.record({ tokens: 1000 });
  const verdict = budget.admit();
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.limited, "tokens");
});

test("denies when the cost ceiling is already met", () => {
  const budget = new AutonomyBudget(config);
  budget.record({ costUsd: 0.1 });
  const verdict = budget.admit();
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.limited, "cost");
});

test("maxActionsPerHour of 0 disables idle work", () => {
  const budget = new AutonomyBudget({ ...config, maxActionsPerHour: 0 });
  const verdict = budget.admit();
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.limited, "actions");
});

test("the rolling window forgets accruals older than one hour", () => {
  const budget = new AutonomyBudget(config);
  const t0 = 1_000_000_000_000;
  // Fill the window at t0.
  for (let i = 0; i < 3; i++) budget.record({ tokens: 100 }, t0);
  assert.equal(budget.admit(t0).allowed, false, "full at t0");
  // 61 minutes later, the old accruals have aged out.
  const later = t0 + 61 * 60_000;
  assert.equal(budget.admit(later).allowed, true, "window cleared after an hour");
  const snap = budget.snapshot(later);
  assert.equal(snap.actions.used, 0);
  assert.equal(snap.tokens.used, 0);
});

test("snapshot reports used vs max per ceiling", () => {
  const budget = new AutonomyBudget(config);
  budget.record({ tokens: 250, costUsd: 0.02 });
  const snap = budget.snapshot();
  assert.deepEqual(snap.actions, { used: 1, max: 3 });
  assert.deepEqual(snap.tokens, { used: 250, max: 1000 });
  assert.equal(snap.costUsd.used, 0.02);
  assert.deepEqual(snap.perMission, { maxTokens: 500, maxCostUsd: 0.05 });
});
