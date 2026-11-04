import test from "node:test";
import assert from "node:assert/strict";
import { validateOrchestrationPlan, InvalidOrchestrationPlanError } from "./TaskScheduler.js";
import type { OrchestrationPlan, AgentTask } from "./types.js";

function task(id: string): AgentTask {
  return {
    id, role: "coder", title: id, description: id, priority: "medium",
    status: "pending", context: { files: [] }, createdAt: new Date(0).toISOString(),
  };
}
function plan(ids: string[], dependencies: Record<string, string[]>): OrchestrationPlan {
  return {
    id: "orch", title: "test", description: "test", tasks: ids.map(task),
    dependencies, status: "pending", createdAt: new Date(0).toISOString(),
  };
}
function expectInvalid(value: OrchestrationPlan, pattern: RegExp): void {
  assert.throws(() => validateOrchestrationPlan(value), (error: unknown) => {
    assert.ok(error instanceof InvalidOrchestrationPlanError);
    assert.match(error.message, pattern);
    return true;
  });
}

test("accepts a valid DAG with independent and chained tasks", () => {
  assert.doesNotThrow(() => validateOrchestrationPlan(plan(
    ["a", "b", "c"], { a: [], b: [], c: ["a", "b"] }
  )));
});

test("rejects dependencies that reference unknown task IDs", () => {
  expectInvalid(plan(["a"], { a: ["missing"] }), /Dépendance inconnue/);
});

test("rejects self-dependencies", () => {
  expectInvalid(plan(["a"], { a: ["a"] }), /Auto-dépendance/);
});

test("rejects dependency cycles before execution", () => {
  expectInvalid(plan(["a", "b", "c"], { a: ["c"], b: ["a"], c: ["b"] }), /Cycle de dépendances/);
});

test("rejects duplicate task IDs", () => {
  const value = plan(["a", "a"], { a: [] });
  expectInvalid(value, /IDs de tâches dupliqués/);
});

test("rejects dependency maps containing unknown task keys", () => {
  expectInvalid(plan(["a"], { a: [], ghost: [] }), /Clé de dépendances sans tâche/);
});


test("scheduler preserves blocked dependencies as incomplete rather than failed", async () => {
  const value: OrchestrationPlan = {
    id: "orch-run", title: "execution", description: "execution",
    tasks: ["root", "child"].map(task), dependencies: { root: [], child: ["root"] },
    status: "pending", createdAt: new Date(0).toISOString(),
  };
  const events: string[] = [];
  const { TaskScheduler } = await import("./TaskScheduler.js");
  const { ProgressNotifier } = await import("./ProgressNotifier.js");
  const notifier = new ProgressNotifier();
  notifier.setProgressCallback((_task, event) => events.push(event));
  const scheduler = new TaskScheduler({ async execute(current) {
    current.status = "failed";
    current.result = { success: false, outcome: "failed", summary: "failed", error: "agent error", durationMs: 1 };
  } }, notifier);
  await scheduler.execute(value);
  assert.equal(value.tasks[1].status, "incomplete");
  assert.equal(value.tasks[1].result?.outcome, "blocked");
  assert.deepEqual(events, ["incomplete"]);
  assert.equal(value.status, "failed");
});

test("scheduler preserves cancellation as a distinct orchestration terminal state", async () => {
  const value: OrchestrationPlan = {
    id: "orch-cancel", title: "cancel", description: "cancel", tasks: [task("root")],
    dependencies: { root: [] }, status: "pending", createdAt: new Date(0).toISOString(),
  };
  const { TaskScheduler } = await import("./TaskScheduler.js");
  const scheduler = new TaskScheduler({ async execute(current) {
    current.status = "cancelled";
    current.result = { success: false, outcome: "cancelled", summary: "cancelled", error: "cancelled_by_user", durationMs: 1 };
  } });
  await scheduler.execute(value);
  assert.equal(value.tasks[0].status, "cancelled");
  assert.equal(value.status, "cancelled");
});
