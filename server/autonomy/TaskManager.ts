import { randomUUID } from "crypto";
import type { AgentPriority } from "../runtime/types.js";

export type AutonomousTaskStatus = "pending" | "running" | "completed" | "failed" | "dead_letter" | "cancelled";
export interface AutonomousTask {
  id: string; type: "maintenance" | "reactive" | "mission" | "reflection"; title: string; priority: AgentPriority;
  sourceEventId: string; fingerprint: string; createdAt: number; status: AutonomousTaskStatus; attempts: number; maxRetries: number; timeoutMs: number; metadata?: Record<string, unknown>; error?: string;
}
export interface TaskManagerConfig { maxConcurrency: number; dedupeTtlMs: number; retryDelayMs: number; maxRetries: number; timeoutMs: number; circuitBreakerThreshold: number; circuitBreakerCooldownMs: number; }
export const taskManagerConfigFromEnv = (env: NodeJS.ProcessEnv = process.env): TaskManagerConfig => {
  const n = (key: string, fallback: number) => { const value = Number(env[key]); return Number.isFinite(value) && value > 0 ? value : fallback; };
  return { maxConcurrency: n("LEANNA_AUTONOMY_MAX_CONCURRENCY", 2), dedupeTtlMs: n("LEANNA_AUTONOMY_DEDUPE_TTL_MS", 300_000), retryDelayMs: n("LEANNA_AUTONOMY_RETRY_DELAY_MS", 1_000), maxRetries: n("LEANNA_AUTONOMY_MAX_RETRIES", 3), timeoutMs: n("LEANNA_AUTONOMY_TASK_TIMEOUT_MS", 60_000), circuitBreakerThreshold: n("LEANNA_AUTONOMY_CIRCUIT_BREAKER_THRESHOLD", 5), circuitBreakerCooldownMs: n("LEANNA_AUTONOMY_CIRCUIT_BREAKER_COOLDOWN_MS", 300_000) };
};

/** Bounded, priority-aware queue for autonomy-only work. It does not replace AgentRuntime's agent queue. */
export class TaskManager {
  private readonly tasks = new Map<string, AutonomousTask>(); private readonly queue: string[] = []; private readonly dedupe = new Map<string, number>(); private readonly failures = new Map<string, { count: number; openedAt?: number }>(); private running = 0;
  constructor(private readonly execute: (task: AutonomousTask) => Promise<void>, private readonly config = taskManagerConfigFromEnv()) {}
  submit(input: Omit<AutonomousTask, "id" | "createdAt" | "status" | "attempts" | "maxRetries" | "timeoutMs">): AutonomousTask | undefined {
    this.prune(); if (this.dedupe.has(input.fingerprint) || this.isCircuitOpen(input.type)) return undefined;
    const task: AutonomousTask = { ...input, id: randomUUID(), createdAt: Date.now(), status: "pending", attempts: 0, maxRetries: this.config.maxRetries, timeoutMs: this.config.timeoutMs };
    this.tasks.set(task.id, task); this.dedupe.set(task.fingerprint, Date.now() + this.config.dedupeTtlMs); this.queue.push(task.id); this.pump(); return task;
  }
  list(): AutonomousTask[] { return [...this.tasks.values()].sort((a, b) => b.createdAt - a.createdAt); }
  get pendingCount(): number { return this.queue.length; }
  async stop(): Promise<void> { for (const id of this.queue.splice(0)) { const task = this.tasks.get(id); if (task) task.status = "cancelled"; } }
  private pump(): void { while (this.running < this.config.maxConcurrency && this.queue.length) { this.queue.sort((a, b) => priority(this.tasks.get(b)!.priority) - priority(this.tasks.get(a)!.priority) || this.tasks.get(a)!.createdAt - this.tasks.get(b)!.createdAt); const id = this.queue.shift()!; const task = this.tasks.get(id)!; void this.run(task); } }
  private async run(task: AutonomousTask): Promise<void> { this.running++; task.status = "running"; task.attempts++; try { await withTimeout(this.execute(task), task.timeoutMs); task.status = "completed"; this.failures.delete(task.type); } catch (error) { task.error = error instanceof Error ? error.message : String(error); const f = this.failures.get(task.type) ?? { count: 0 }; f.count++; if (f.count >= this.config.circuitBreakerThreshold) f.openedAt = Date.now(); this.failures.set(task.type, f); if (task.attempts < task.maxRetries && !this.isCircuitOpen(task.type)) { task.status = "pending"; setTimeout(() => { this.queue.push(task.id); this.pump(); }, this.config.retryDelayMs * 2 ** (task.attempts - 1)); } else task.status = "dead_letter"; } finally { this.running--; this.pump(); } }
  private prune(): void { const now = Date.now(); for (const [key, expires] of this.dedupe) if (expires <= now) this.dedupe.delete(key); }
  private isCircuitOpen(type: string): boolean { const failure = this.failures.get(type); if (!failure?.openedAt) return false; if (Date.now() - failure.openedAt >= this.config.circuitBreakerCooldownMs) { this.failures.delete(type); return false; } return true; }
}
const priority = (value: AgentPriority) => ({ low: 0, medium: 1, high: 2, critical: 3 })[value];
const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => await Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Autonomy task timed out after ${timeoutMs}ms`)), timeoutMs))]);
