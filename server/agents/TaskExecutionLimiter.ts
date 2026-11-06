/**
 * Shared concurrency limiter for agent task execution.
 *
 * A scheduler-local batch limit protects one orchestration; this limiter
 * protects the process across multiple scheduler instances and direct
 * delegations. Waiting callers are resumed FIFO.
 */
export class TaskExecutionCancelledError extends Error {
  constructor(readonly taskId: string) {
    super(`Tâche ${taskId} annulée avant d'obtenir un créneau d'exécution`);
    this.name = "TaskExecutionCancelledError";
  }
}

interface LimiterWaiter {
  taskId?: string;
  resolve: (granted: boolean) => void;
}

export class TaskExecutionLimiter {
  private active = 0;
  private readonly waiters: LimiterWaiter[] = [];

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

  cancel(taskId: string): boolean {
    const index = this.waiters.findIndex((waiter) => waiter.taskId === taskId);
    if (index < 0) return false;
    const [waiter] = this.waiters.splice(index, 1);
    waiter.resolve(false);
    return true;
  }

  async run<T>(operation: () => Promise<T>, taskId?: string): Promise<T> {
    if (this.active < this.maxConcurrent) {
      this.active++;
    } else {
      // The occupied slot is handed directly to the next waiter on release.
      // Do not decrement/re-increment around the handoff: that would let a
      // newly arriving caller steal the slot before the waiter resumes.
      const granted = await new Promise<boolean>((resolve) => this.waiters.push({ taskId, resolve }));
      if (!granted) throw new TaskExecutionCancelledError(taskId ?? "unknown");
    }

    try {
      return await operation();
    } finally {
      const next = this.waiters.shift();
      if (next) next.resolve(true);
      else this.active--;
    }
  }
}

/** Process-wide guard shared by the orchestrator's execution entry points. */
export const agentTaskExecutionLimiter = new TaskExecutionLimiter(8);
