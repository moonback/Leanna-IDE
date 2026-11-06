import fs from "fs";
import os from "os";
import path from "path";
import test from "node:test";
import assert from "node:assert/strict";
import { ProcessingQueue } from "./ProcessingQueue.js";

test("ProcessingQueue restores pending source payloads after restart", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-notebook-queue-"));
  const persistenceFile = path.join(directory, "queue.json");
  try {
    const original = new ProcessingQueue<{ buffer: Buffer }>({ persistenceFile });
    const queued = original.enqueue("source-task-1", "source-ingest", {
      buffer: Buffer.from("notebook source payload", "utf-8"),
    });
    assert.ok(queued);
    assert.equal(original.getPending().length, 1);

    const restarted = new ProcessingQueue<{ buffer: Buffer }>({ persistenceFile });
    const pending = restarted.getPending();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].id, "source-task-1");
    assert.equal(pending[0].status, "pending");
    assert.ok(Buffer.isBuffer(pending[0].payload.buffer), "persisted Buffer payloads must be restored as Buffers");
    assert.equal(pending[0].payload.buffer.toString("utf-8"), "notebook source payload");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("ProcessingQueue ignores malformed persisted tasks", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-notebook-queue-invalid-"));
  const persistenceFile = path.join(directory, "queue.json");
  try {
    fs.writeFileSync(persistenceFile, JSON.stringify({
      version: 1,
      tasks: [
        { id: "../escape", type: "source-ingest", priority: "urgent", status: "pending", attempts: 0, maxAttempts: 3, createdAt: new Date().toISOString(), payload: {} },
        { id: "valid", type: "source-ingest", priority: "normal", status: "completed", attempts: 1, maxAttempts: 3, createdAt: new Date().toISOString(), payload: {} },
      ],
    }));
    const queue = new ProcessingQueue({ persistenceFile });
    assert.equal(queue.getPending().length, 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("ProcessingQueue persists tasks waiting for retry backoff", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-notebook-queue-retry-"));
  const persistenceFile = path.join(directory, "queue.json");
  const queue = new ProcessingQueue<{ value: string }>({
    persistenceFile,
    retryBaseDelayMs: 30_000,
    maxRetries: 2,
  });
  try {
    queue.setHandler(async () => {
      throw new Error("temporary failure");
    });
    queue.enqueue("retry-task", "source-ingest", { value: "retry me" });
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(queue.getPending().length, 1);
    assert.equal(queue.getTask("retry-task")?.status, "pending");

    const restarted = new ProcessingQueue<{ value: string }>({ persistenceFile });
    assert.equal(restarted.getPending().length, 1);
    assert.equal(restarted.getPending()[0].id, "retry-task");
    assert.equal(restarted.getPending()[0].attempts, 1);
    assert.ok(restarted.getPending()[0].nextAttemptAt);
    let restartedHandlerCalls = 0;
    restarted.setHandler(async () => {
      restartedHandlerCalls++;
      return undefined;
    });
    assert.equal(restartedHandlerCalls, 0, "a restored retry must respect its persisted backoff");
    assert.equal(restarted.cancel("retry-task"), true);
  } finally {
    queue.cancel("retry-task");
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("ProcessingQueue.waitForTask resolves when a queued task completes", async () => {
  const queue = new ProcessingQueue<{ value: number }>({ concurrency: 1 });
  queue.setHandler(async task => ({ doubled: task.payload.value * 2 }));
  const task = queue.enqueue("wait-complete", "test", { value: 21 });
  assert.ok(task);
  const completed = await queue.waitForTask(task.id);
  assert.equal(completed.status, "completed");
  assert.deepEqual(completed.result, { doubled: 42 });
});

test("ProcessingQueue.waitForTask rejects when a queued task fails permanently", async () => {
  const queue = new ProcessingQueue({ concurrency: 1, maxRetries: 1 });
  queue.setHandler(async () => { throw new Error("terminal failure"); });
  const task = queue.enqueue("wait-failed", "test", {});
  assert.ok(task);
  await assert.rejects(queue.waitForTask(task.id), /terminal failure/);
});

test("ProcessingQueue rejects enqueue when the initial durable write fails", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-notebook-queue-write-failure-"));
  try {
    const queue = new ProcessingQueue<{ value: string }>({ persistenceFile: directory });
    const task = queue.enqueue("not-durable", "test", { value: "must not be accepted" });
    assert.equal(task, null);
    assert.equal(queue.getPending().length, 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("ProcessingQueue does not retry permanent validation errors", async () => {
  const queue = new ProcessingQueue({ concurrency: 1, maxRetries: 3 });
  queue.setHandler(async () => { throw new Error("invalid document format"); });
  const task = queue.enqueue("permanent-error", "test", {});
  assert.ok(task);
  await assert.rejects(queue.waitForTask(task.id), /invalid document format/);
  assert.equal(task.attempts, 1);
  assert.equal(queue.getStats().failed, 1);
});
