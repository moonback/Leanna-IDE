import test from "node:test";
import assert from "node:assert/strict";
import { EventBus } from "../runtime/EventBus.js";
import { AutonomousExecutive, PriorityEngine } from "./AutonomousExecutive.js";

function fakeRuntime() {
  const stored: Array<{ level: string; key: string; value: unknown }> = [];
  return { events: new EventBus(), memory: { set: async (level: string, key: string, value: unknown) => { stored.push({ level, key, value }); } }, stored };
}

test("priority arbitration is deterministic and bounded", () => {
  const engine = new PriorityEngine();
  assert.equal(engine.score({ importance: 1, urgency: 1, risk: 1, dependency: 1, userIntent: 1, deadline: 1, cost: 0, confidence: 1, impact: 1, missionPriority: 1 }), 100);
  assert.equal(engine.toPriority(80), "critical");
  assert.equal(engine.toPriority(34), "low");
});

test("deduplicates matching event goals before mission handoff", () => {
  const runtime = fakeRuntime();
  const executive = new AutonomousExecutive(runtime as never);
  const first = executive.decide({ type: "task:failed", taskId: "one", error: "boom" });
  const second = executive.decide({ type: "task:failed", taskId: "two", error: "boom" });
  assert.equal(first.disposition, "ACT");
  assert.equal(first.goal?.id, second.goal?.id);
  assert.equal(executive.goals.list().length, 1);
});

test("permission denials escalate without executing a mission", async () => {
  const runtime = fakeRuntime();
  let executions = 0;
  const executive = new AutonomousExecutive(runtime as never, { executeMission: async () => { executions++; return { success: true }; } });
  await executive.execute({ id: "task", type: "reactive", title: "denied", priority: "high", sourceEventId: "x", fingerprint: "x", createdAt: Date.now(), status: "pending", attempts: 0, maxRetries: 1, timeoutMs: 100, metadata: { event: { type: "tool:permissionDenied", toolName: "write", required: ["write"], missing: ["write"], mode: "enforce", enforced: true } } });
  assert.equal(executions, 0);
  assert.equal(executive.goals.list()[0].status, "ESCALATED");
});
