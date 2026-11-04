import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { agentEventStream, AgentEventStream } from "./AgentEventStream.js";
import type { AgentEvent } from "./ProgressNotifier.js";

test("agent event stream notifies subscribers and supports unsubscribe", () => {
  const received: AgentEvent[] = [];
  const unsubscribe = agentEventStream.subscribe(({ event }) => received.push(event));
  const event = {
    type: "agent_event",
    event: "task_started",
    taskId: "task-test",
    role: "coder",
    title: "Test",
    status: "running",
    agentName: "Développeur",
    timestamp: new Date().toISOString(),
  } as AgentEvent;

  agentEventStream.publish(event);
  unsubscribe();
  agentEventStream.publish(event);

  assert.equal(received.length, 1);
  assert.equal(received[0].taskId, "task-test");
});

function makeEvent(taskId: string): AgentEvent {
  return {
    type: "agent_event",
    event: "task_started",
    taskId,
    role: "coder",
    title: taskId,
    status: "running",
    agentName: "Coder",
    timestamp: new Date(0).toISOString(),
  };
}

test("replays events after a cursor across stream instances (server restart)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-agent-events-"));
  const filePath = path.join(dir, "events.jsonl");
  const first = new AgentEventStream({ filePath });
  assert.equal(first.publish(makeEvent("task-1")), 1);
  assert.equal(first.publish(makeEvent("task-2")), 2);

  const restarted = new AgentEventStream({ filePath });
  const replayed: number[] = [];
  const unsubscribe = restarted.subscribe((entry) => replayed.push(entry.id), 1);
  assert.deepEqual(replayed, [2]);

  assert.equal(restarted.publish(makeEvent("task-3")), 3);
  assert.deepEqual(replayed, [2, 3]);
  unsubscribe();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("bounds replay history while preserving a monotonic event cursor", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-agent-events-"));
  const filePath = path.join(dir, "events.jsonl");
  const stream = new AgentEventStream({ filePath, maxHistory: 2 });
  stream.publish(makeEvent("task-1"));
  stream.publish(makeEvent("task-2"));
  stream.publish(makeEvent("task-3"));

  assert.deepEqual(stream.getHistory().map((entry) => entry.id), [2, 3]);
  const restarted = new AgentEventStream({ filePath, maxHistory: 2 });
  assert.equal(restarted.getLatestId(), 3);
  assert.deepEqual(restarted.getHistory().map((entry) => entry.id), [2, 3]);
  fs.rmSync(dir, { recursive: true, force: true });
});
