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
    assert.equal(Buffer.from(pending[0].payload.buffer).toString("utf-8"), "notebook source payload");
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
