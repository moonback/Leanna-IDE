import test from "node:test";
import assert from "node:assert/strict";
import { TaskExecutionLimiter } from "./TaskExecutionLimiter.js";

test("TaskExecutionLimiter caps concurrent operations and drains its FIFO queue", async () => {
  const limiter = new TaskExecutionLimiter(2);
  let active = 0;
  let peak = 0;
  const order: number[] = [];

  await Promise.all(Array.from({ length: 7 }, (_, index) => limiter.run(async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 4));
    order.push(index);
    active--;
  })));

  assert.equal(peak, 2);
  assert.equal(active, 0);
  assert.equal(limiter.activeCount, 0);
  assert.equal(limiter.pendingCount, 0);
  assert.deepEqual([...order].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6]);
});

test("TaskExecutionLimiter releases its slot when an operation rejects", async () => {
  const limiter = new TaskExecutionLimiter(1);

  await assert.rejects(
    limiter.run(async () => {
      throw new Error("expected failure");
    }),
    /expected failure/
  );

  const result = await limiter.run(async () => "next operation");
  assert.equal(result, "next operation");
  assert.equal(limiter.activeCount, 0);
  assert.equal(limiter.pendingCount, 0);
});

test("TaskExecutionLimiter rejects invalid capacity", () => {
  assert.throws(() => new TaskExecutionLimiter(0), /maxConcurrent/);
  assert.throws(() => new TaskExecutionLimiter(1.5), /maxConcurrent/);
});
