import test from "node:test";
import assert from "node:assert/strict";
import { EventBus } from "../runtime/EventBus.js";
import { AutonomousExecutive, PriorityEngine, autonomousExecutiveConfigFromEnv } from "./AutonomousExecutive.js";

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

test("reads a safe executive concurrency limit from the environment", () => {
  assert.equal(autonomousExecutiveConfigFromEnv({ LEANNA_AUTONOMY_MAX_CONCURRENT_CYCLES: "3" } as NodeJS.ProcessEnv).maxConcurrentCycles, 3);
  assert.equal(autonomousExecutiveConfigFromEnv({ LEANNA_AUTONOMY_MAX_CONCURRENT_CYCLES: "0" } as NodeJS.ProcessEnv).maxConcurrentCycles, 1);
  assert.equal(autonomousExecutiveConfigFromEnv({ LEANNA_AUTONOMY_MAX_CONCURRENT_CYCLES: "invalid" } as NodeJS.ProcessEnv).maxConcurrentCycles, 1);
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

test("releases the concurrency budget after a completed cycle", async () => {
  const runtime = fakeRuntime();
  const executive = new AutonomousExecutive(runtime as never, {
    maxConcurrentCycles: 1,
    executeMission: async () => ({ success: true }),
  });
  const task = (id: string) => ({ id, type: "maintenance" as const, title: "failure", priority: "high" as const, sourceEventId: id, fingerprint: id, createdAt: Date.now(), status: "pending" as const, attempts: 0, maxRetries: 1, timeoutMs: 100, metadata: { event: { type: "task:failed" as const, taskId: id, error: "boom" } } });
  await executive.execute(task("one"));
  await executive.execute(task("two"));
  assert.equal(executive.goals.list().filter((goal) => goal.status === "COMPLETED").length, 2);
});

// ── GAP-2: memory-informed decisions ─────────────────────────────────────────

/** Fake runtime with a working in-memory project store (get + set). */
function memoryRuntime() {
  const store = new Map<string, unknown>();
  return {
    events: new EventBus(),
    memory: {
      get: (_level: string, key: string) => store.get(key),
      set: async (_level: string, key: string, value: unknown) => { store.set(key, value); },
    },
    store,
  };
}

test("repeated failures of the same goal class escalate instead of re-attempting", async () => {
  const runtime = memoryRuntime();
  // Simulate three prior failures recorded for this event class.
  runtime.store.set(`autonomy:fingerprint:task:failed`, { failures: 3 });

  const executive = new AutonomousExecutive(runtime as never, { executeMission: async () => ({ success: true }) });
  const decision = executive.decide({ type: "task:failed", taskId: "x", error: "boom" });
  assert.equal(decision.disposition, "ESCALATE", "3 prior failures should force escalation");
});

test("a fresh goal class with no failure history still acts", () => {
  const runtime = memoryRuntime();
  const executive = new AutonomousExecutive(runtime as never);
  const decision = executive.decide({ type: "task:failed", taskId: "x", error: "boom" });
  assert.equal(decision.disposition, "ACT");
});

test("execute records a per-fingerprint failure tally consumed by later decisions", async () => {
  const runtime = memoryRuntime();
  const executive = new AutonomousExecutive(runtime as never, { executeMission: async () => ({ success: false }) });
  const task = { id: "t", type: "maintenance" as const, title: "f", priority: "high" as const, sourceEventId: "t", fingerprint: "t", createdAt: Date.now(), status: "pending" as const, attempts: 0, maxRetries: 1, timeoutMs: 100, metadata: { event: { type: "task:failed" as const, taskId: "t", error: "boom" } } };
  await executive.execute(task);
  const recorded = [...runtime.store.keys()].some((k) => k.startsWith("autonomy:fingerprint:"));
  assert.equal(recorded, true, "a fingerprint tally must be persisted after a blocked mission");
});

// ── Phase 2: goal persistence ────────────────────────────────────────────────

/** Memory fake supporting set/get/search/delete, like the real project store. */
function persistentRuntime() {
  const store = new Map<string, unknown>();
  return {
    events: new EventBus(),
    memory: {
      get: (_level: string, key: string) => store.get(key),
      set: async (_level: string, key: string, value: unknown) => { store.set(key, value); },
      delete: (_level: string, key: string) => store.delete(key),
      search: (_level: string, query: { prefix?: string; limit?: number }) =>
        [...store.entries()]
          .filter(([k]) => !query.prefix || k.startsWith(query.prefix))
          .slice(0, query.limit ?? 20)
          .map(([key, value]) => ({ key, value, level: "project", createdAt: 0, updatedAt: 0 })),
    },
    store,
  };
}

test("goals are mirrored to project memory under autonomy:goal:<id>", () => {
  const runtime = persistentRuntime();
  const executive = new AutonomousExecutive(runtime as never);
  executive.decide({ type: "task:failed", taskId: "x", error: "boom" });

  const goalKeys = [...runtime.store.keys()].filter((k) => k.startsWith("autonomy:goal:"));
  assert.equal(goalKeys.length, 1, "a created goal must be persisted");
});

test("completed/cancelled goals are removed from the durable store", async () => {
  const runtime = persistentRuntime();
  const executive = new AutonomousExecutive(runtime as never, { executeMission: async () => ({ success: true }) });
  await executive.execute({ id: "t", type: "maintenance", title: "f", priority: "high", sourceEventId: "t", fingerprint: "t", createdAt: Date.now(), status: "pending", attempts: 0, maxRetries: 1, timeoutMs: 100, metadata: { event: { type: "task:failed", taskId: "t", error: "boom" } } } as never);

  // The goal transitioned PENDING → ACTIVE → COMPLETED; the terminal state must
  // have purged it from the store even though it stays in the in-memory list.
  const goalKeys = [...runtime.store.keys()].filter((k) => k.startsWith("autonomy:goal:"));
  assert.equal(goalKeys.length, 0, "a completed goal must be purged from durable storage");
});

test("a fresh executive restores non-terminal goals from the store", () => {
  const runtime = persistentRuntime();
  // Seed a persisted, still-active goal as a prior process would have left it.
  runtime.store.set("autonomy:goal:g-1", {
    id: "g-1", description: "resume me", source: "EVENT", priority: "high", status: "ACTIVE",
    constraints: [], riskLevel: "high", successCriteria: [], createdAt: 1, updatedAt: 1,
  });

  const executive = new AutonomousExecutive(runtime as never);
  const restored = executive.goals.get("g-1");

  assert.ok(restored, "a non-terminal goal must be rehydrated at construction");
  assert.equal(restored!.description, "resume me");
  assert.equal(executive.goals.list().length, 1);
});
