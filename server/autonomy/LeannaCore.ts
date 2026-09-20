import { randomUUID } from "crypto";
import type { AgentRuntime, EventBus } from "../runtime/index.js";
import type { RuntimeEvent } from "../runtime/types.js";
import { HeartbeatService, heartbeatConfigFromEnv } from "./HeartbeatService.js";
import { PerceptionEngine } from "./PerceptionEngine.js";
import { TaskManager, taskManagerConfigFromEnv, type AutonomousTask } from "./TaskManager.js";

export type LeannaRuntimeStatus = "starting" | "watching" | "idle" | "sleeping" | "executing" | "stopping" | "error";
export interface LeannaRuntimeState { status: LeannaRuntimeStatus; activeTasks: number; pendingEvents: number; lastWakeAt?: number; lastReflectionAt?: number; health: "healthy" | "degraded"; recentFailures: string[]; }
export interface LeannaCoreOptions { onTask?: (task: AutonomousTask) => Promise<void>; }

/**
 * Event-driven autonomy coordinator. It reuses the Runtime EventBus, mission
 * executor (through an injected task handler), permissions and dry-run guards.
 * It intentionally creates no polling/LLM decision loop.
 */
export class LeannaCore {
  private readonly perception = new PerceptionEngine(); private readonly taskManager: TaskManager; private readonly heartbeat: HeartbeatService; private readonly unsubscribers: Array<() => void> = [];
  private started = false; private state: LeannaRuntimeState = { status: "starting", activeTasks: 0, pendingEvents: 0, health: "healthy", recentFailures: [] };
  constructor(private readonly runtime: AgentRuntime, options: LeannaCoreOptions = {}) {
    this.taskManager = new TaskManager(async (task) => { this.setStatus("executing", `Executing ${task.type} task.`); await options.onTask?.(task); }, taskManagerConfigFromEnv());
    this.heartbeat = new HeartbeatService(runtime.events, () => this.healthCheck(), heartbeatConfigFromEnv());
  }
  start(): void { if (this.started) return; this.started = true; this.setStatus("watching", "Autonomy runtime started."); this.unsubscribers.push(this.events.onAny(event => this.handleEvent(event))); this.heartbeat.start(); }
  async stop(): Promise<void> { if (!this.started) return; this.setStatus("stopping", "Graceful shutdown requested."); this.heartbeat.stop(); this.unsubscribers.splice(0).forEach(unsubscribe => unsubscribe()); await this.taskManager.stop(); this.started = false; }
  getState(): Readonly<LeannaRuntimeState> { return { ...this.state, activeTasks: this.taskManager.list().filter(task => task.status === "running").length }; }
  getTasks(): AutonomousTask[] { return this.taskManager.list(); }
  private get events(): EventBus { return this.runtime.events; }
  private handleEvent(event: RuntimeEvent): void {
    if (event.type.startsWith("autonomy:" as never)) return;
    this.state.pendingEvents++; this.state.lastWakeAt = Date.now(); this.heartbeat.wake(event.type);
    const perception = this.perception.perceive(event); this.state.pendingEvents--;
    if (!perception.requiresAttention || perception.possibleActions.length === 0) return;
    const type = perception.possibleActions.includes("maintenance") ? "maintenance" : "reactive";
    const task = this.taskManager.submit({ type, title: `Autonomy: ${perception.reason}`, priority: perception.importance >= .8 ? "high" : "medium", sourceEventId: this.eventId(event), fingerprint: `${event.type}:${perception.affectedResources.sort().join(",")}`, metadata: { reason: perception.reason, resources: perception.affectedResources } });
    if (task) this.events.emit({ type: "autonomy:taskCreated", taskId: task.id, taskType: task.type, sourceEventId: task.sourceEventId });
  }
  private healthCheck(): { attentionRequired: boolean; reason: string } { const stats = this.runtime.getStats(); const degraded = !this.runtime.isRunning || stats.tasks.failed > 0; this.state.health = degraded ? "degraded" : "healthy"; const reason = degraded ? "Runtime has failed tasks or is stopped." : "Runtime healthy."; this.events.emit({ type: "autonomy:health", status: this.state.health, reason }); return { attentionRequired: degraded, reason }; }
  private setStatus(to: LeannaRuntimeStatus, reason: string): void { const from = this.state.status; this.state.status = to; this.events.emit({ type: "autonomy:stateChanged", from, to, reason }); }
  private eventId(event: RuntimeEvent): string { return "taskId" in event ? event.taskId : "workflowId" in event ? event.workflowId : "toolName" in event ? `${event.type}:${event.toolName}` : randomUUID(); }
}
