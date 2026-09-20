import { randomUUID } from "crypto";
import type { AgentRuntime, EventBus } from "../runtime/index.js";
import type { RuntimeEvent } from "../runtime/types.js";
import { HeartbeatService, heartbeatConfigFromEnv } from "./HeartbeatService.js";
import { PerceptionEngine } from "./PerceptionEngine.js";
import {
  TaskManager,
  taskManagerConfigFromEnv,
  type AutonomousTask,
  type AutonomousTaskStatus,
} from "./TaskManager.js";

export type LeannaRuntimeStatus =
  | "starting"
  | "watching"
  | "idle"
  | "sleeping"
  | "executing"
  | "stopping"
  | "error";

export interface LeannaRuntimeState {
  status: LeannaRuntimeStatus;
  activeTasks: number;
  pendingEvents: number;
  lastWakeAt?: number;
  lastReflectionAt?: number;
  health: "healthy" | "degraded";
  recentFailures: string[];
}

export interface LeannaCoreOptions {
  onTask?: (task: AutonomousTask) => Promise<void>;
}

const MAX_RECENT_FAILURES = 20;

/**
 * Event-driven autonomy coordinator. It reuses the Runtime EventBus and keeps
 * all tool/mission execution behind existing permission, dry-run and approval
 * policies. Neither perception nor heartbeat invokes an LLM.
 */
export class LeannaCore {
  private readonly perception = new PerceptionEngine();
  private readonly taskManager: TaskManager;
  private readonly heartbeat: HeartbeatService;
  private readonly unsubscribers: Array<() => void> = [];
  private started = false;
  private state: LeannaRuntimeState = {
    status: "starting",
    activeTasks: 0,
    pendingEvents: 0,
    health: "healthy",
    recentFailures: [],
  };

  constructor(private readonly runtime: AgentRuntime, options: LeannaCoreOptions = {}) {
    this.taskManager = new TaskManager(
      async (task) => {
        this.setStatus("executing", `Executing ${task.type} task.`);
        await options.onTask?.(task);
      },
      taskManagerConfigFromEnv(),
      (task, previous) => this.handleTaskStateChange(task, previous),
    );
    this.heartbeat = new HeartbeatService(
      runtime.events,
      () => this.healthCheck(),
      heartbeatConfigFromEnv(),
    );
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.setStatus("watching", "Autonomy runtime started.");
    this.unsubscribers.push(this.events.onAny((event) => this.handleEvent(event)));
    this.unsubscribers.push(this.events.on("autonomy:heartbeat", (event) => this.handleHeartbeat(event.state)));
    this.heartbeat.start();
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.setStatus("stopping", "Graceful shutdown requested.");
    this.heartbeat.stop();
    this.unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
    await this.taskManager.stop();
    this.started = false;
  }

  getState(): Readonly<LeannaRuntimeState> {
    return {
      ...this.state,
      activeTasks: this.taskManager.list().filter((task) => task.status === "running").length,
      recentFailures: [...this.state.recentFailures],
    };
  }

  getTasks(): AutonomousTask[] {
    return this.taskManager.list();
  }

  private get events(): EventBus {
    return this.runtime.events;
  }

  private handleEvent(event: RuntimeEvent): void {
    if (event.type.startsWith("autonomy:" as never)) return;

    this.state.pendingEvents++;
    this.state.lastWakeAt = Date.now();
    this.heartbeat.wake(event.type);
    const perception = this.perception.perceive(event);
    this.state.pendingEvents--;

    if (!perception.requiresAttention || perception.possibleActions.length === 0) return;

    const type = perception.possibleActions.includes("maintenance") ? "maintenance" : "reactive";
    const task = this.taskManager.submit({
      type,
      title: `Autonomy: ${perception.reason}`,
      priority: perception.importance >= 0.8 ? "high" : "medium",
      sourceEventId: this.eventId(event),
      fingerprint: `${event.type}:${perception.affectedResources.sort().join(",")}`,
      metadata: { reason: perception.reason, resources: perception.affectedResources },
    });

    if (task) {
      this.events.emit({
        type: "autonomy:taskCreated",
        taskId: task.id,
        taskType: task.type,
        sourceEventId: task.sourceEventId,
      });
    }
  }

  private handleTaskStateChange(task: AutonomousTask, previous: AutonomousTaskStatus): void {
    this.events.emit({
      type: "autonomy:taskStateChanged",
      taskId: task.id,
      taskType: task.type,
      from: previous,
      to: task.status,
      error: task.error,
    });

    if (task.status === "dead_letter") {
      this.state.recentFailures = [task.error ?? task.title, ...this.state.recentFailures].slice(0, MAX_RECENT_FAILURES);
      this.state.health = "degraded";
      this.setStatus("error", `Task ${task.id} reached the dead-letter queue.`);
    } else if (task.status === "completed" && this.started) {
      this.setStatus("watching", "Autonomy task completed.");
    }
  }

  private handleHeartbeat(state: "active" | "idle" | "sleep"): void {
    if (!this.started || this.getState().activeTasks > 0) return;
    this.setStatus(state === "active" ? "watching" : state === "idle" ? "idle" : "sleeping", `Heartbeat entered ${state}.`);
  }

  private healthCheck(): { attentionRequired: boolean; reason: string } {
    const stats = this.runtime.getStats();
    const degraded = !this.runtime.isRunning || stats.tasks.failed > 0 || this.state.recentFailures.length > 0;
    this.state.health = degraded ? "degraded" : "healthy";
    const reason = degraded ? "Runtime has failed tasks or is stopped." : "Runtime healthy.";
    this.events.emit({ type: "autonomy:health", status: this.state.health, reason });
    return { attentionRequired: degraded, reason };
  }

  private setStatus(to: LeannaRuntimeStatus, reason: string): void {
    const from = this.state.status;
    if (from === to) return;
    this.state.status = to;
    this.events.emit({ type: "autonomy:stateChanged", from, to, reason });
  }

  private eventId(event: RuntimeEvent): string {
    if ("taskId" in event) return event.taskId;
    if ("workflowId" in event) return event.workflowId;
    if ("toolName" in event) return `${event.type}:${event.toolName}`;
    return randomUUID();
  }
}
