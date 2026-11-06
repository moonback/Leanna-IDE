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
    if (this.active >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }

    this.active++;
    try {
      return await operation();
    } finally {
      this.active--;
      this.waiters.shift()?.();
    }
  }
}

/** Process-wide guard shared by the orchestrator's execution entry points. */
export const agentTaskExecutionLimiter = new TaskExecutionLimiter(8);
