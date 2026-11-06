import test from "node:test";
import assert from "node:assert/strict";
import { TaskExecutionCancelledError, TaskExecutionLimiter } from "./TaskExecutionLimiter.js";

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

test("TaskExecutionLimiter removes a cancelled waiter without starting it later", async () => {
  const limiter = new TaskExecutionLimiter(1);
  let releaseFirst!: () => void;
  let secondStarted = false;

  const first = limiter.run(() => new Promise<void>((resolve) => {
    releaseFirst = resolve;
  }), "first-task");
  const second = limiter.run(async () => {
    secondStarted = true;
  }, "cancelled-task");

  await Promise.resolve();
  assert.equal(limiter.pendingCount, 1);
  assert.equal(limiter.cancel("cancelled-task"), true);
  await assert.rejects(second, TaskExecutionCancelledError);

  releaseFirst();
  await first;
  assert.equal(secondStarted, false);
  assert.equal(limiter.activeCount, 0);
  assert.equal(limiter.pendingCount, 0);
});

test("role quotas prevent overbooking without blocking other roles", async () => {
  const limiter = new TaskExecutionLimiter(2);
  let releaseCoder!: () => void;
  let releaseReviewer!: () => void;
  const started: string[] = [];

  const coderOne = limiter.run(async () => {
    started.push("coder-1");
    await new Promise<void>((resolve) => { releaseCoder = resolve; });
  }, "coder-1", "coder", 1);
  const reviewerOne = limiter.run(async () => {
    started.push("reviewer-1");
    await new Promise<void>((resolve) => { releaseReviewer = resolve; });
  }, "reviewer-1", "reviewer", 1);

  await Promise.resolve();
  const coderTwo = limiter.run(async () => { started.push("coder-2"); }, "coder-2", "coder", 1);
  const reviewerTwo = limiter.run(async () => { started.push("reviewer-2"); }, "reviewer-2", "reviewer", 1);
  await Promise.resolve();

  assert.equal(limiter.getActiveCount("coder"), 1);
  assert.equal(limiter.getActiveCount("reviewer"), 1);
  assert.equal(limiter.pendingCount, 2);

  // Free a global slot while coder is still at its per-role ceiling.
  releaseReviewer();
  await reviewerOne;
  await Promise.resolve();
  assert.ok(started.includes("reviewer-2"), "an eligible role must not be blocked by an older saturated-role waiter");
  assert.ok(!started.includes("coder-2"), "coder must stay within its role limit");

  releaseCoder();
  await Promise.all([coderOne, coderTwo, reviewerTwo]);
  assert.equal(limiter.activeCount, 0);
  assert.equal(limiter.getActiveCount("coder"), 0);
  assert.equal(limiter.getActiveCount("reviewer"), 0);
  assert.equal(limiter.pendingCount, 0);
});

test("TaskExecutionLimiter rejects invalid per-role capacity", async () => {
  const limiter = new TaskExecutionLimiter(2);
  await assert.rejects(limiter.run(async () => undefined, "bad-role-limit", "coder", 0), /roleLimit/);
});
