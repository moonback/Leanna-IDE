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

export { WorkspaceState } from "./WorkspaceState";
export type { WorkspaceFileState, WorkspaceCompletionReport, WorkspaceRead, VerificationIssue, VerificationRecord, VerificationSeverity } from "./WorkspaceState";
export { AgentValidation } from "./AgentValidation";
export type { ValidationSnapshot, RegressionReport } from "./AgentValidation";
export { AgentRepairLoop } from "./AgentRepairLoop";
export type { RepairAction, RepairDirective } from "./AgentRepairLoop";

// Exports existants (inchangés)
export { 
  STATIC_AGENT_REGISTRY, 
  getAgentDefinition, 
  getAgentDefinitionOrThrow,
  listAgentDefinitions, 
  listAgentRoles,
  hasAgent
} from "./roles";
export { isDelegationAllowed } from "./AgentCommunication";

// Dynamic Agent Registry
export { DynamicAgentRegistry, dynamicAgentRegistry } from "./DynamicAgentRegistry";
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

// Tool-Agent Mapper (spécialisation des compétences)
export {
  TOOL_CATEGORIES,
  initializeToolAgentMapper,
  getAgentsForTool,
  getPrimaryAgentForTool,
  canAgentUseTool,
  getToolCategory,
  getAllToolCategories,
  getToolsForAgent,
  getRecommendedRolesForCategory,
} from "./toolAgentMapper";
export {
  agentRoleSchema,
  taskPrioritySchema,
  delegateTaskSchema,
  orchestrateSchema,
  listAgentTasksSchema,
} from "./types";

// === NOUVEAUX EXPORTS POUR LES AMÉLIORATIONS ===

// Délégation structurée (remplace le parsing Markdown)
export { DelegationManager, delegationManager } from "./DelegationManager";
export type { 
  StructuredDelegation, 
  BatchDelegation, 
  DelegationResult, 
  DelegationEvent 
} from "./DelegationManager";

// Routage avancé
export type { RoutingStrategy } from "./AgentCommunication";

// Surveillance et traçage du MessageBus
export { MessageBusMonitor, messageBusMonitor } from "./MessageBusMonitor";
export type { 
  AlertSeverity, 
  MonitorAlert, 
  AggregatedMetrics, 
  HealthStatus,
  MessageFlowNode,
  MessageFlowEdge,
  MessageFlowGraph
} from "./MessageBusMonitor";
