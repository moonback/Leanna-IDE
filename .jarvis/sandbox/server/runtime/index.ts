/**
 * Runtime — Point d'entrée du nouveau cœur architectural
 * 
 * Usage :
 *   import { createRuntime } from "./server/runtime";
 *   const runtime = createRuntime({ enableMetrics: true });
 *   await runtime.start();
 * 
 * Le runtime est le conteneur unique de tous les composants.
 * Tous les autres modules dépendent du runtime, jamais l'inverse.
 */

// Core
export { AgentRuntime } from "./AgentRuntime";
export type { AgentPlugin } from "./AgentRuntime";
export { EventBus } from "./EventBus";
export { StateMachine } from "./StateMachine";
export { ToolRegistry, ToolNotFoundError, ToolTimeoutError, ToolPermissionError } from "./ToolRegistry";
export { Memory } from "./Memory";
export { WorkflowEngine } from "./WorkflowEngine";
export { PromptRegistry } from "./PromptRegistry";
export { AgentLoader } from "./AgentLoader";
export { Observability } from "./Observability";

// Types
export type {
  Task,
  TaskState,
  TaskResult,
  AgentMetadata,
  AgentContext,
  AgentPriority,
  ToolDeclaration,
  ToolDefinition,
  ToolHandler,
  ToolPermission,
  ToolCallMetrics,
  RuntimeEvent,
  RuntimeEventType,
  RuntimeEventHandler,
  MemoryLevel,
  MemoryEntry,
  WorkflowDefinition,
  WorkflowStep,
  WorkflowRun,
  PromptTemplate,
  RuntimeConfig,
} from "./types";
export { DEFAULT_RUNTIME_CONFIG, VALID_TRANSITIONS } from "./types";

// Agents (plugins)
export { defaultAgents, defineAgent } from "./agents";
export type { AgentConfig } from "./agents";

// Compatibility Layer
export { SkillManagerV2 } from "./compat/SkillManagerV2";
export { adaptSkill, adaptAllSkills, createToolCallProxy } from "./compat/SkillAdapter";
export type { LegacySkill, AdaptOptions } from "./compat/SkillAdapter";

// Prompts
export { loadPromptTemplates, buildSystemPrompt } from "./prompts/loader";
export { SystemPromptBuilder, buildSystemInstructionV3 } from "./prompts/SystemPromptBuilder";

// Bootstrap
export { bootstrapRuntime, bootstrapRuntimeSync } from "./bootstrap";
export type { BootstrapConfig, BootstrapResult } from "./bootstrap";

// ─── Factory ─────────────────────────────────────────────────────────────────

import { AgentRuntime } from "./AgentRuntime";
import { defaultAgents } from "./agents";
import type { RuntimeConfig } from "./types";

/**
 * Factory pour créer un runtime pré-configuré avec les agents par défaut.
 */
export function createRuntime(config: Partial<RuntimeConfig> = {}): AgentRuntime {
  const runtime = new AgentRuntime(config);

  for (const agent of defaultAgents) {
    runtime.registerAgent(agent);
  }

  return runtime;
}
