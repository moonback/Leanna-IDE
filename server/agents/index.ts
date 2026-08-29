// Agent Core
export { AgentOrchestrator, agentOrchestrator } from "./AgentOrchestrator";
export type { AgentEvent } from "./AgentOrchestrator";
export { COLLABORATION_PATTERNS, DELEGATION_MATRIX } from "./AgentCommunication";

// Message Bus et Communication
export { AgentMessageBus } from "./AgentMessageBus";
export { agentMessageBus } from "./AgentMessageBus";
export type { RoutingStrategy } from "./AgentCommunication";

// Délégation
export { DelegationParser, delegationParser } from "./DelegationParser";
export { DelegationManager, delegationManager } from "./DelegationManager";
export type { 
  StructuredDelegation, 
  BatchDelegation, 
  DelegationResult, 
  DelegationEvent 
} from "./DelegationManager";
export type { ParsedDelegation, DelegationParseResult } from "./DelegationParser";

// Surveillance
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

// Autonomous
export { AutonomousAgent } from "./AutonomousAgent";
export { AgentRegistry } from "./AgentRegistry";
export { AutonomousLoop } from "./AutonomousLoop";
export type { LoopConfig, LoopResult, IterationRecord, LoopDecision } from "./AutonomousLoop";
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
