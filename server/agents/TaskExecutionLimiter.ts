/**
 * Shared concurrency limiter for agent task execution.
 *
 * It enforces both a process-wide ceiling and per-role ceilings. Waiters are
 * resumed FIFO among currently eligible roles, so a saturated role cannot
 * block unrelated agents from using otherwise-free global capacity.
 */
export class TaskExecutionCancelledError extends Error {
  constructor(readonly taskId: string) {
    super(`Tâche ${taskId} annulée avant d'obtenir un créneau d'exécution`);
    this.name = "TaskExecutionCancelledError";
  }
}

interface LimiterWaiter {
  taskId?: string;
  role?: string;
  roleLimit?: number;
  resolve: (granted: boolean) => void;
}

export class TaskExecutionLimiter {
  private active = 0;
  private readonly activeByRole = new Map<string, number>();
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

  getActiveCount(role: string): number {
    return this.activeByRole.get(role) ?? 0;
  }

  cancel(taskId: string): boolean {
    const index = this.waiters.findIndex((waiter) => waiter.taskId === taskId);
    if (index < 0) return false;
    const [waiter] = this.waiters.splice(index, 1);
    waiter.resolve(false);
    this.drain();
    return true;
  }

  async run<T>(
    operation: () => Promise<T>,
    taskId?: string,
    role?: string,
    roleLimit?: number,
  ): Promise<T> {
    if (roleLimit !== undefined && (!Number.isInteger(roleLimit) || roleLimit < 1)) {
      throw new RangeError("roleLimit doit être un entier supérieur ou égal à 1");
    }

    const waiter: LimiterWaiter = { taskId, role, roleLimit, resolve: () => undefined };
    if (this.canAcquire(waiter)) {
      this.reserve(waiter);
    } else {
      const granted = await new Promise<boolean>((resolve) => {
        waiter.resolve = resolve;
        this.waiters.push(waiter);
      });
      if (!granted) throw new TaskExecutionCancelledError(taskId ?? "unknown");
    }

    try {
      return await operation();
    } finally {
      this.release(waiter);
    }
  }

  private canAcquire(waiter: LimiterWaiter): boolean {
    if (this.active >= this.maxConcurrent) return false;
    if (!waiter.role || waiter.roleLimit === undefined) return true;
    return this.getActiveCount(waiter.role) < waiter.roleLimit;
  }

  private reserve(waiter: LimiterWaiter): void {
    this.active++;
    if (waiter.role) {
      this.activeByRole.set(waiter.role, this.getActiveCount(waiter.role) + 1);
    }
  }

  private release(waiter: LimiterWaiter): void {
    this.active = Math.max(0, this.active - 1);
    if (waiter.role) {
      const next = this.getActiveCount(waiter.role) - 1;
      if (next <= 0) this.activeByRole.delete(waiter.role);
      else this.activeByRole.set(waiter.role, next);
    }
    this.drain();
  }

  /** Grant free slots to the oldest waiter whose role currently has capacity. */
  private drain(): void {
    while (this.active < this.maxConcurrent) {
      const index = this.waiters.findIndex((waiter) => this.canAcquire(waiter));
      if (index < 0) return;
      const [waiter] = this.waiters.splice(index, 1);
      this.reserve(waiter);
      waiter.resolve(true);
    }
  }
}

/** Process-wide guard shared by both legacy and agentic task executors. */
export const agentTaskExecutionLimiter = new TaskExecutionLimiter(8);
