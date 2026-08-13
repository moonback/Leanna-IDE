export { AgentOrchestrator, agentOrchestrator } from "./AgentOrchestrator";
export type { AgentEvent } from "./AgentOrchestrator";
export { agentMessageBus } from "./AgentOrchestrator";
export { agentRegistry } from "./AgentOrchestrator";
export { COLLABORATION_PATTERNS, DELEGATION_MATRIX } from "./AgentOrchestrator";

// Exports directs des nouveaux modules autonomes
export { AutonomousAgent } from "./AutonomousAgent";
export { AgentRegistry } from "./AgentRegistry";
export { AgentMessageBus } from "./AgentMessageBus";
export { DelegationParser, delegationParser } from "./DelegationParser";
export { AutonomousLoop } from "./AutonomousLoop";
export type { LoopConfig, LoopResult, IterationRecord, LoopDecision } from "./AutonomousLoop";
export type { ParsedDelegation, DelegationParseResult } from "./DelegationParser";
export { AgentPersistence, agentPersistence } from "./AgentPersistence";
export type {
  AgentMessage,
  AgentMessageType,
  MessagePriority,
  MessageHandler,
  MessageSubscription,
  PublishOptions,
  DelegationCapability,
  CollaborationPattern,
  TaskRequestPayload,
  TaskResponsePayload,
  StatusResponsePayload,
  EventPayload,
  BroadcastPayload,
} from "./AgentCommunication";

// Exports existants (inchangés)
export { AGENT_REGISTRY, getAgentDefinition, listAgentDefinitions } from "./roles";
export type {
  AgentRole,
  AgentTask,
  TaskContext,
  TaskResult,
  TaskStatus,
  TaskPriority,
  OrchestrationPlan,
  AgentDefinition,
} from "./types";
export {
  agentRoleSchema,
  taskPrioritySchema,
  delegateTaskSchema,
  orchestrateSchema,
  listAgentTasksSchema,
} from "./types";
