/**
 * Runtime Types — Types fondamentaux du nouveau runtime
 * 
 * Principes : types simples, pas de classes, composition, discriminated unions.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Task State Machine
// ═══════════════════════════════════════════════════════════════════════════════

export type TaskState =
  | "pending"
  | "planning"
  | "running"
  | "reviewing"
  | "validating"
  | "completed"
  | "failed"
  | "cancelled";

export type TaskTransition =
  | { from: "pending"; to: "planning" | "running" | "cancelled" }
  | { from: "planning"; to: "running" | "failed" | "cancelled" }
  | { from: "running"; to: "reviewing" | "validating" | "completed" | "failed" | "cancelled" }
  | { from: "reviewing"; to: "running" | "completed" | "failed" }
  | { from: "validating"; to: "completed" | "failed" | "running" };

export const VALID_TRANSITIONS: Record<TaskState, TaskState[]> = {
  pending: ["planning", "running", "cancelled"],
  planning: ["running", "failed", "cancelled"],
  running: ["reviewing", "validating", "completed", "failed", "cancelled"],
  reviewing: ["running", "completed", "failed"],
  validating: ["completed", "failed", "running"],
  completed: [],
  failed: [],
  cancelled: [],
};

// ═══════════════════════════════════════════════════════════════════════════════
// Agent Plugin Interface
// ═══════════════════════════════════════════════════════════════════════════════

export interface AgentMetadata {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  maxConcurrency: number;
  timeoutMs: number;
}

export interface AgentContext {
  taskId: string;
  title: string;
  description: string;
  files: string[];
  instructions?: string;
  previousResults?: TaskResult[];
  metadata?: Record<string, unknown>;
}

export interface TaskResult {
  success: boolean;
  summary: string;
  details?: string;
  filesModified?: string[];
  suggestions?: string[];
  error?: string;
  durationMs: number;
  delegatedTo?: string[];
}

export type AgentPriority = "low" | "medium" | "high" | "critical";

export interface Task {
  id: string;
  agentId: string;
  title: string;
  description: string;
  priority: AgentPriority;
  state: TaskState;
  context: AgentContext;
  result?: TaskResult;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  timeoutMs: number;
  parentTaskId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tool Registry
// ═══════════════════════════════════════════════════════════════════════════════

export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolDefinition {
  declaration: ToolDeclaration;
  handler: ToolHandler;
  /** Permissions requises pour utiliser cet outil */
  permissions?: ToolPermission[];
  /** Timeout max en ms (défaut: 30s) */
  timeoutMs?: number;
  /** Catégorie pour le filtrage */
  category?: string;
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

export type ToolPermission = "read" | "write" | "execute" | "network" | "dangerous";

export interface ToolCallMetrics {
  toolName: string;
  durationMs: number;
  success: boolean;
  timestamp: number;
  agentId?: string;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Event Bus
// ═══════════════════════════════════════════════════════════════════════════════

export type RuntimeEvent =
  | { type: "task:created"; task: Task }
  | { type: "task:stateChanged"; taskId: string; from: TaskState; to: TaskState }
  | { type: "task:completed"; taskId: string; result: TaskResult }
  | { type: "task:failed"; taskId: string; error: string }
  | { type: "tool:called"; toolName: string; agentId?: string }
  | { type: "tool:completed"; toolName: string; durationMs: number; success: boolean }
  | { type: "agent:registered"; agentId: string }
  | { type: "agent:busy"; agentId: string; taskId: string }
  | { type: "agent:idle"; agentId: string }
  | { type: "workflow:started"; workflowId: string; name: string }
  | { type: "workflow:stepCompleted"; workflowId: string; stepId: string; success: boolean }
  | { type: "workflow:completed"; workflowId: string; success: boolean }
  | { type: "memory:updated"; level: MemoryLevel; key: string };

export type RuntimeEventType = RuntimeEvent["type"];
export type RuntimeEventHandler<T extends RuntimeEventType = RuntimeEventType> =
  (event: Extract<RuntimeEvent, { type: T }>) => void;

// ═══════════════════════════════════════════════════════════════════════════════
// Memory
// ═══════════════════════════════════════════════════════════════════════════════

export type MemoryLevel = "working" | "session" | "project" | "longterm";

export interface MemoryEntry {
  key: string;
  value: unknown;
  level: MemoryLevel;
  createdAt: number;
  updatedAt: number;
  ttl?: number; // ms, après lequel l'entrée expire
  tags?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Workflow Engine
// ═══════════════════════════════════════════════════════════════════════════════

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  triggers?: WorkflowTrigger[];
}

export interface WorkflowStep {
  id: string;
  action: string;
  args?: Record<string, unknown>;
  label?: string;
  condition?: string;
  dependsOn?: string[];
  onError?: "stop" | "skip" | "retry";
  maxRetries?: number;
  timeoutMs?: number;
}

export interface WorkflowTrigger {
  type: "schedule" | "event" | "manual";
  config: Record<string, unknown>;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  state: TaskState;
  startedAt: number;
  completedAt?: number;
  currentStepIndex: number;
  stepResults: Map<string, { success: boolean; result?: unknown; error?: string }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Prompt Registry
// ═══════════════════════════════════════════════════════════════════════════════

export interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  variables?: string[];
  version: number;
  /** ID du prompt parent pour l'héritage */
  extends?: string;
  /** Catégorie pour le regroupement */
  category?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Runtime Configuration
// ═══════════════════════════════════════════════════════════════════════════════

export interface RuntimeConfig {
  maxConcurrentTasks: number;
  defaultTimeoutMs: number;
  enableMetrics: boolean;
  enablePersistence: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  maxConcurrentTasks: 10,
  defaultTimeoutMs: 60_000,
  enableMetrics: true,
  enablePersistence: true,
  logLevel: "info",
};
