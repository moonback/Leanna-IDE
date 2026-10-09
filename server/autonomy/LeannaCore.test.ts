import test from "node:test";
import assert from "node:assert/strict";
import { EventBus } from "../runtime/EventBus.js";
import { LeannaCore, visualStateFromStatus } from "./LeannaCore.js";

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

test("broadcasts autonomy events to the configured real-time broadcaster", async () => {
  const runtime = fakeRuntime();
  const received: string[] = [];
  const core = new LeannaCore(runtime as never, {
    onTask: async () => {},
    broadcaster: (message) => {
      assert.equal(message.type, "autonomy_event");
      assert.ok(typeof message.timestamp === "string");
      assert.ok(!("type" in message.payload));
      received.push(message.event);
    },
  });
  core.start();

  runtime.events.emit({ type: "task:failed", taskId: "failed-2", error: "boom" });
  await sleep(10);

  assert.ok(received.includes("autonomy:taskCreated"), "should broadcast taskCreated");
  assert.ok(received.includes("autonomy:taskStateChanged"), "should broadcast taskStateChanged");
  await core.stop();
});

test("setBroadcaster attaches a broadcaster after construction", async () => {
  const runtime = fakeRuntime();
  const received: string[] = [];
  const core = new LeannaCore(runtime as never, { onTask: async () => {} });
  core.setBroadcaster((message) => received.push(message.event));
  core.start();

  runtime.events.emit({ type: "task:failed", taskId: "failed-3", error: "boom" });
  await sleep(10);

  assert.ok(received.length > 0, "broadcaster set post-construction should receive events");
  await core.stop();
});

test("visualStateFromStatus maps runtime status to a pixel-art visual state", () => {
  assert.equal(visualStateFromStatus("watching"), "THINKING");
  assert.equal(visualStateFromStatus("executing"), "EDITING");
  assert.equal(visualStateFromStatus("stopping"), "WAITING");
  assert.equal(visualStateFromStatus("error"), "WAITING");
  assert.equal(visualStateFromStatus("idle"), "IDLE");
  assert.equal(visualStateFromStatus("sleeping"), "IDLE");
  assert.equal(visualStateFromStatus("starting"), "IDLE");
  // Health degraded forces WAITING regardless of status.
  assert.equal(visualStateFromStatus("watching", "degraded"), "WAITING");
});

test("getState() exposes a visualState consistent with status", async () => {
  const runtime = fakeRuntime();
  const core = new LeannaCore(runtime as never, { onTask: async () => {} });
  core.start();
  // After start the status is "watching".
  assert.equal(core.getState().status, "watching");
  assert.equal(core.getState().visualState, "THINKING");
  await core.stop();
});

test("autonomy:stateChanged broadcasts carry visualState", async () => {
  const runtime = fakeRuntime();
  const stateChanges: Array<Record<string, unknown>> = [];
  const core = new LeannaCore(runtime as never, {
    onTask: async () => {},
    broadcaster: (message) => {
      if (message.event === "autonomy:stateChanged") stateChanges.push(message.payload);
    },
  });
  core.start();
  await sleep(10);
  // The timeline subscription is wired during start(); a guaranteed transition
  // (watching → stopping) is produced by stop() and must carry visualState.
  await core.stop();

  const stopping = stateChanges.find((p) => p.to === "stopping");
  assert.ok(stopping, "should broadcast a stateChanged to stopping");
  assert.equal(stopping!.visualState, "WAITING");
});
