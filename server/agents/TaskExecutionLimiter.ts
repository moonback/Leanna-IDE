/**
 * Shared concurrency limiter for agent task execution.
 *
 * A scheduler-local batch limit protects one orchestration; this limiter
 * protects the process across multiple scheduler instances and direct
 * delegations. Waiting callers are resumed FIFO.
 */
export class TaskExecutionLimiter {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(readonly maxConcurrent: number = 8) {
    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
      throw new RangeError("maxConcurrent doit être un entier supérieur ou égal à 1");
    }
  }

  get activeCount(): number {
    return this.active;
  }

  get pendingCount(): number {
    return this.waiters.length;
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active < this.maxConcurrent) {
      this.active++;
    } else {
      // The occupied slot is handed directly to the next waiter on release.
      // Do not decrement/re-increment around the handoff: that would let a
      // newly arriving caller steal the slot before the waiter resumes.
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }

    try {
      return await operation();
    } finally {
      const next = this.waiters.shift();
      if (next) next();
      else this.active--;
    }
  }
}

/** Process-wide guard shared by the orchestrator's execution entry points. */
export const agentTaskExecutionLimiter = new TaskExecutionLimiter(8);
