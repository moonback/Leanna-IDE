import test from "node:test";
import assert from "node:assert/strict";
import { RecoveryEngine, classifyFailure } from "./RecoveryEngine.js";
import type { RunnerOutcome } from "./LeannaSupervisor.js";

const engine = new RecoveryEngine();

test("transient network failures use bounded retry", () => {
  const outcome: RunnerOutcome = { success: false, error: "HTTP 503 service unavailable" };
  const assessment = engine.assess(outcome, 1, 3);
  assert.equal(assessment.category, "transient");
  assert.equal(assessment.decision, "retry");
  assert.equal(assessment.retryable, true);
});

test("verification failures select targeted repair", () => {
  const outcome: RunnerOutcome = {
    success: false,
    evidence: { typecheck: { name: "tsc", passed: false, details: "TS2322 type error" } },
  };
  assert.equal(classifyFailure(outcome), "implementation");
  assert.equal(engine.assess(outcome, 1, 3).decision, "repair");
});

test("permission and prompt-injection failures cannot be retried", () => {
  for (const error of ["permission denied by policy", "prompt injection detected"]) {
    const assessment = engine.assess({ success: false, error }, 1, 3);
    assert.equal(assessment.decision, "escalate");
    assert.equal(assessment.retryable, false);
  }
});

test("uncertain external side effects prohibit blind replay", () => {
  const assessment = engine.assess({
    success: false,
    error: "payment request outcome unknown after connection loss",
    suggestedRecovery: "retry",
  }, 1, 3);
  assert.equal(assessment.category, "side_effect_unknown");
  assert.equal(assessment.decision, "escalate");
});

test("invalid plans select replan", () => {
  const assessment = engine.assess({ success: false, error: "invalid plan: missing prerequisite" }, 1, 3);
  assert.equal(assessment.category, "planning");
  assert.equal(assessment.decision, "replan");
});

test("attempt budget always forces escalation", () => {
  const assessment = engine.assess({ success: false, error: "HTTP 503" }, 3, 3);
  assert.equal(assessment.decision, "escalate");
  assert.equal(assessment.retryable, false);
});

test("runner escalation hint is preserved for otherwise unknown failures", () => {
  const assessment = engine.assess({
    success: false,
    error: "unclassified runner failure",
    suggestedRecovery: "escalate",
  }, 1, 3);
  assert.equal(assessment.decision, "escalate");
});
