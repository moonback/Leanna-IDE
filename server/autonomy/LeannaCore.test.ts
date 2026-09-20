import test from "node:test";
import assert from "node:assert/strict";
import { EventBus } from "../runtime/EventBus.js";
import { LeannaCore } from "./LeannaCore.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function fakeRuntime() {
  const events = new EventBus();
  return {
    events,
    isRunning: true,
    getStats: () => ({ tasks: { failed: 0 } }),
    memory: { set: async () => {} },
  };
}

test("creates one bounded autonomy task for duplicate failed runtime events", async () => {
  const runtime = fakeRuntime();
  const core = new LeannaCore(runtime as never, { onTask: async () => {} });
  core.start();

  runtime.events.emit({ type: "task:failed", taskId: "failed-1", error: "boom" });
  runtime.events.emit({ type: "task:failed", taskId: "failed-1", error: "boom" });
  await sleep(10);

  assert.equal(core.getTasks().length, 1);
  assert.equal(core.getTasks()[0].status, "completed");
  await core.stop();
});
