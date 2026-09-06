/**
 * Core Types — Types fondamentaux unifiés pour tout le système
 * 
 * Ce fichier centralise tous les types utilisés par l'EventBus central,
 * les composants agents/, mission/, verification/, artifacts/, etc.
 * 
 * Principes :
 * - Types simples, pas de classes
 * - Discriminated unions pour les événements
 * - Composition plutôt que héritage
 * - Compatibilité avec l'existant (runtime/, agents/, mission/)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Base Types
// ═══════════════════════════════════════════════════════════════════════════════

/** Identifiants uniques */
export type ID = string;
export type Timestamp = string; // ISO 8601
export type ISODateString = string;

/** Priorités */
export type Priority = "low" | "medium" | "high" | "critical";

/** Statuts de base */
export type Status = "pending" | "in_progress" | "completed" | "failed" | "cancelled" | "blocked";

// ═══════════════════════════════════════════════════════════════════════════════
// Task Types
// ═══════════════════════════════════════════════════════════════════════════════

/** État d'une tâche */
export type TaskState =
  | "pending"
  | "planning"
  | "running"
  | "reviewing"
  | "validating"
  | "completed"
  | "failed"
  | "cancelled";

/** Transition valide entre états de tâche */
export type TaskTransition =
  | { from: "pending"; to: "planning" | "running" | "cancelled" }
  | { from: "planning"; to: "running" | "failed" | "cancelled" }
  | { from: "running"; to: "reviewing" | "validating" | "completed" | "failed" | "cancelled" }
  | { from: "reviewing"; to: "running" | "completed" | "failed" }
  | { from: "validating"; to: "completed" | "failed" | "running" };

/** Résultat d'une tâche */
export interface TaskResult {
  success: boolean;
  summary: string;
  details?: string;
  filesModified?: string[];
  suggestions?: string[];
  error?: string;
  durationMs: number;
  delegatedTo?: string[];
  confidence?: number; // 0-1
}

/** Contexte d'une tâche */
export interface TaskContext {
  taskId: string;
  title: string;
  description: string;
  files: string[];
  instructions?: string;
  previousResults?: TaskResult[];
  metadata?: Record<string, unknown>;
}

/** Tâche complète */
export interface Task {
  id: ID;
  agentId: string;
  title: string;
  description: string;
  priority: Priority;
  state: TaskState;
  context: TaskContext;
  result?: TaskResult;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  timeoutMs: number;
  parentTaskId?: ID;
  parentGoalId?: ID;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Agent Types
// ═══════════════════════════════════════════════════════════════════════════════

/** Rôle d'un agent */
export type AgentRole = string; // Ex: "planner", "executor", "researcher", "writer"

/** Métadonnées d'un agent */
export interface AgentMetadata {
  id: ID;
  name: string;
  description: string;
  role: AgentRole;
  capabilities: string[];
  maxConcurrency: number;
  timeoutMs: number;
  version?: string;
  author?: string;
}

/** Statut d'un agent */
export type AgentStatus = "idle" | "busy" | "processing" | "error" | "unavailable";

/** État d'un agent */
export interface AgentState {
  agentId: ID;
  role: AgentRole;
  status: AgentStatus;
  currentTaskId?: ID;
  tasksCompleted: number;
  tasksFailed: number;
  lastActivityAt: Timestamp;
  errors: string[];
}

/** Charge d'un agent (pour load-balancing) */
export interface AgentLoad {
  agentId: ID;
  activeTasks: number;
  messageCount: number;
  avgProcessingTimeMs: number;
  loadScore: number; // score = activeTasks * avgProcessingTimeMs
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tool/Skill Types
// ═══════════════════════════════════════════════════════════════════════════════

/** Déclaration d'un outil/skill */
export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  category?: string;
}

/** Définition complète d'un outil */
export interface ToolDefinition {
  declaration: ToolDeclaration;
  handler: ToolHandler;
  permissions?: ToolPermission[];
  timeoutMs?: number;
  category?: string;
  enabled?: boolean;
}

/** Handler d'un outil */
export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

/** Permissions d'un outil */
export type ToolPermission = "read" | "write" | "execute" | "network" | "dangerous";

/** Résultat d'un appel d'outil */
export interface ToolCallResult {
  toolName: string;
  success: boolean;
  result?: unknown;
  error?: string;
  durationMs: number;
  timestamp: number;
  agentId?: ID;
}

/** Métriques d'un appel d'outil */
export interface ToolCallMetrics {
  toolName: string;
  durationMs: number;
  success: boolean;
  timestamp: number;
  agentId?: ID;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Mission Types
// ═══════════════════════════════════════════════════════════════════════════════

/** Priorité d'un objectif */
export type GoalPriority = "low" | "medium" | "high" | "critical";

/** Statut d'un objectif */
export type GoalStatus = "pending" | "in_progress" | "completed" | "failed" | "cancelled" | "blocked";

/** Résultat d'un objectif */
export interface GoalResult {
  success: boolean;
  summary: string;
  lessonsLearned?: string[];
  reasoning?: string;
}

/** Objectif (Goal) dans une mission */
export interface Goal {
  id: ID;
  parentId: ID | null;
  title: string;
  description: string;
  successCriteria: string[];
  priority: GoalPriority;
  status: GoalStatus;
  children: ID[];
  plannedActions: PlannedAction[];
  attempts: number;
  maxAttempts: number;
  createdAt: Timestamp;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  result?: GoalResult;
  blockReason?: string;
  blockedBy?: ID;
}

/** Action planifiée */
export interface PlannedAction {
  id: ID;
  skillName: string;
  args: Record<string, unknown>;
  score: number; // Score de pertinence (0-1)
  status: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
  result?: unknown;
  error?: string;
  reflection?: ReflectionResult;
  confidence?: number;
  durationMs?: number;
}

/** Résultat de réflexion sur une action */
export interface ReflectionResult {
  actionId: ID;
  timestamp: Timestamp;
  observation: string;
  success: string | null;
  failure: string | null;
  hypothesis?: string;
  confidence: number; // 0-1
  decision: DecisionType;
  reasoning: string;
}

/** Type de décision après une action */
export type DecisionType = "continue" | "retry" | "replan" | "escalate" | "abort";

/** Configuration d'une mission */
export interface MissionConfig {
  maxRetries: number;
  maxSubGoals: number;
  maxDepth: number;
  enableReflection: boolean;
  maxActionsPerGoal: number;
  enablePersistence: boolean;
}

/** Contexte d'une mission */
export interface MissionContext {
  relevantFiles: string[];
  decisions: Array<{ what: string; why: string; when: Timestamp }>;
  errors: Array<{ action: string; error: string; when: Timestamp }>;
  hypotheses: string[];
  dependencies: string[];
}

/** Métriques d'une mission */
export interface MissionMetrics {
  totalActions: number;
  successfulActions: number;
  failedActions: number;
  retriedActions: number;
  averageConfidence: number; // 0-1
  totalDurationMs: number;
  estimatedTokens: number;
}

/** État complet d'une mission */
export interface MissionState {
  id: ID;
  title: string;
  description: string;
  status: GoalStatus;
  priority: GoalPriority;
  goalStack: ID[];
  goals: Record<ID, Goal>;
  activeGoalId: ID | null;
  reflections: ReflectionResult[];
  context: MissionContext;
  metrics: MissionMetrics;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
}

/** Plan de mission */
export interface MissionPlan {
  missionId: ID;
  objectives: string[];
  targetedFiles: string[];
  tools: string[];
  risks: string[];
  estimatedTokens: number;
  stopConditions: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// File/Artifact Types
// ═══════════════════════════════════════════════════════════════════════════════

/** Type de fichier */
export type FileType = "code" | "config" | "document" | "data" | "media" | "other";

/** Statut d'un fichier */
export type FileStatus = "unchanged" | "read" | "modified" | "created" | "deleted";

/** Artefact produit par une action/mission */
export interface Artifact {
  id: ID;
  name: string;
  path: string;
  type: FileType;
  status: FileStatus;
  size: number; // bytes
  hash: string; // SHA-256
  createdAt: Timestamp;
  modifiedAt: Timestamp;
  createdBy: ID; // taskId or agentId
  metadata?: Record<string, unknown>;
}

/** Métadonnées de version d'artefact */
export interface ArtifactVersion {
  id: ID;
  artifactId: ID;
  contentHash: string;
  timestamp: Timestamp;
  size: number;
  createdBy: ID;
  description?: string;
}

/** Référence à un artefact */
export interface ArtifactReference {
  artifactId: ID;
  versionId?: ID;
  path: string;
  usedAt: Timestamp;
  usedBy: ID;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Checkpoint Types
// ═══════════════════════════════════════════════════════════════════════════════

/** Type de checkpoint */
export type CheckpointType = "manual" | "automatic" | "before_action" | "after_action" | "error_recovery";

/** Statut d'un checkpoint */
export type CheckpointStatus = "created" | "active" | "restored" | "rolledback" | "deleted";

/** Checkpoint (point de sauvegarde) */
export interface Checkpoint {
  id: ID;
  name: string;
  type: CheckpointType;
  status: CheckpointStatus;
  missionId?: ID;
  taskId?: ID;
  goalId?: ID;
  createdAt: Timestamp;
  restoredAt?: Timestamp;
  rolledbackAt?: Timestamp;
  deletedAt?: Timestamp;
  snapshot: CheckpointSnapshot;
  metadata: CheckpointMetadata;
}

/** Snapshot d'état d'un checkpoint */
export interface CheckpointSnapshot {
  // État des missions
  missions: MissionState[];
  // État des tâches
  tasks: Task[];
  // État des agents
  agents: AgentState[];
  // Artefacts
  artifacts: Artifact[];
  // Contexte global
  workspaceContext?: WorkspaceContext;
}

/** Métadonnées d'un checkpoint */
export interface CheckpointMetadata {
  createdBy: ID; // userId or system
  description?: string;
  tags: string[];
  size: number; // bytes
  hash: string; // SHA-256 du snapshot
  dependencies: ID[]; // IDs des checkpoints dépendants
}

// ═══════════════════════════════════════════════════════════════════════════════
// Verification Types
// ═══════════════════════════════════════════════════════════════════════════════

/** Type de vérification */
export type VerificationType = 
  | "pre_action"      // Avant exécution d'une action
  | "post_action"     // Après exécution d'une action
  | "pre_commit"     // Avant commit de changements
  | "post_commit"    // Après commit
  | "safety_check"   // Vérification de sécurité
  | "quality_check"  // Vérification de qualité
  | "constraint"     // Vérification de contraintes
  | "custom";        // Vérification personnalisée

/** Statut de vérification */
export type VerificationStatus = "pending" | "running" | "passed" | "failed" | "skipped" | "error";

/** Résultat d'une vérification */
export interface VerificationResult {
  id: ID;
  type: VerificationType;
  status: VerificationStatus;
  verifierName: string;
  targetId: ID; // taskId, actionId, missionId, etc.
  targetType: "task" | "action" | "mission" | "goal" | "artifact" | "workspace";
  checks: VerificationCheck[];
  summary: string;
  details?: string;
  startedAt: Timestamp;
  completedAt?: Timestamp;
  durationMs?: number;
  error?: string;
}

/** Vérification individuelle */
export interface VerificationCheck {
  id: ID;
  name: string;
  description: string;
  passed: boolean;
  message?: string;
  severity: "info" | "warning" | "error" | "critical";
  fixSuggestion?: string;
  data?: Record<string, unknown>;
}

/** Définition d'un vérificateur */
export interface VerifierDefinition {
  name: string;
  description: string;
  type: VerificationType;
  targetTypes: Array<"task" | "action" | "mission" | "goal" | "artifact" | "workspace">;
  handler: VerificationHandler;
  priority: Priority;
  enabled: boolean;
  timeoutMs: number;
}

/** Handler de vérification */
export type VerificationHandler = (
  context: VerificationContext
) => Promise<VerificationResult>;

/** Contexte de vérification */
export interface VerificationContext {
  targetId: ID;
  targetType: "task" | "action" | "mission" | "goal" | "artifact" | "workspace";
  targetData: unknown; // Les données de la cible
  workspaceContext: WorkspaceContext;
  previousResults?: VerificationResult[];
  metadata?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Recovery Types
// ═══════════════════════════════════════════════════════════════════════════════

/** Type de récupération */
export type RecoveryType = 
  | "retry"           // Réessayer l'action
  | "replan"         // Replanifier
  | "rollback"       // Retour à un checkpoint
  | "escalate"       // Escalader à un agent humain
  | "fallback"       // Utiliser une action de secours
  | "skip"           // Sauter l'action
  | "abort";         // Abandonner la mission

/** Stratégie de récupération */
export interface RecoveryStrategy {
  id: ID;
  name: string;
  type: RecoveryType;
  conditions: RecoveryCondition[];
  handler: RecoveryHandler;
  priority: Priority;
  maxAttempts: number;
  cooldownMs: number; // Délai entre les tentatives
}

/** Condition de récupération */
export interface RecoveryCondition {
  type: "always" | "on_failure" | "on_error" | "on_timeout" | "on_constraint_violation";
  errorPattern?: string; // Regex pour filtrer les erreurs
  maxAttempts?: number;
  minConfidence?: number;
}

/** Handler de récupération */
export type RecoveryHandler = (
  context: RecoveryContext
) => Promise<RecoveryOutcome>;

/** Contexte de récupération */
export interface RecoveryContext {
  missionId: ID;
  taskId?: ID;
  actionId?: ID;
  goalId?: ID;
  error: Error;
  attemptCount: number;
  maxAttempts: number;
  previousResults?: TaskResult[];
  availableCheckpoints: Checkpoint[];
  workspaceContext: WorkspaceContext;
}

/** Résultat d'une récupération */
export interface RecoveryOutcome {
  success: boolean;
  recoveryType: RecoveryType;
  summary: string;
  actionsTaken: string[];
  newPlan?: PlannedAction[];
  checkpointId?: ID; // Si rollback
  shouldContinue: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Replanning Types
// ═══════════════════════════════════════════════════════════════════════════════

/** Raison de la replanification */
export type ReplanReason = 
  | "action_failed"
  | "constraint_violated"
  | "new_information"
  | "user_request"
  | "timeout"
  | "resource_unavailable"
  | "conflict_detected"
  | "quality_issue";

/** Contexte de replanification */
export interface ReplanContext {
  missionId: ID;
  goalId: ID;
  actionId?: ID;
  failedAction?: PlannedAction;
  error?: string;
  reason: ReplanReason;
  availableSkills: string[];
  previousPlan: PlannedAction[];
  currentState: MissionState;
  workspaceContext: WorkspaceContext;
}

/** Résultat de replanification */
export interface ReplanResult {
  success: boolean;
  newPlan: PlannedAction[];
  changes: ReplanChange[];
  summary: string;
  confidence: number; // 0-1
  reasoning: string;
}

/** Changement dans le plan */
export interface ReplanChange {
  type: "added" | "removed" | "modified" | "reordered";
  actionId: ID;
  oldAction?: PlannedAction;
  newAction?: PlannedAction;
  reason: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Workspace Types
// ═══════════════════════════════════════════════════════════════════════════════

/** Niveau de mémoire */
export type MemoryLevel = "working" | "session" | "project" | "longterm";

/** Entrée de mémoire */
export interface MemoryEntry {
  key: string;
  value: unknown;
  level: MemoryLevel;
  createdAt: number;
  updatedAt: number;
  ttl?: number; // ms, après lequel l'entrée expire
  tags?: string[];
}

/** Contexte du workspace */
export interface WorkspaceContext {
  id: ID;
  name: string;
  rootPath: string;
  currentBranch?: string;
  gitStatus?: Record<string, FileStatus>;
  openFiles: string[];
  activeAgents: ID[];
  activeMissions: ID[];
  lastActivityAt: Timestamp;
  metadata?: Record<string, unknown>;
}

/** État du workspace */
export interface WorkspaceState {
  context: WorkspaceContext;
  tasks: Task[];
  agents: AgentState[];
  missions: MissionState[];
  artifacts: Artifact[];
  checkpoints: Checkpoint[];
  verifications: VerificationResult[];
  updatedAt: Timestamp;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Event Types (EventBus Central)
// ═══════════════════════════════════════════════════════════════════════════════

// -- Task Events --

/** Événements de tâche */
export type TaskEventType =
  | "task:created"
  | "task:state_changed"
  | "task:started"
  | "task:progress"
  | "task:completed"
  | "task:failed"
  | "task:cancelled"
  | "task:retrying";

/** Données d'un événement de tâche */
export interface TaskEventData {
  taskId: ID;
  task?: Task;
  from?: TaskState;
  to?: TaskState;
  result?: TaskResult;
  error?: string;
  progress?: { current: number; total: number; label: string };
  timestamp: Timestamp;
}

// -- Agent Events --

/** Événements d'agent */
export type AgentEventType =
  | "agent:registered"
  | "agent:unregistered"
  | "agent:started"
  | "agent:completed"
  | "agent:failed"
  | "agent:busy"
  | "agent:idle"
  | "agent:error"
  | "agent:status_changed";

/** Données d'un événement d'agent */
export interface AgentEventData {
  agentId: ID;
  agent?: AgentState;
  metadata?: AgentMetadata;
  error?: string;
  previousStatus?: AgentStatus;
  newStatus?: AgentStatus;
  taskId?: ID;
  timestamp: Timestamp;
}

// -- Tool Events --

/** Événements d'outil */
export type ToolEventType =
  | "tool:called"
  | "tool:started"
  | "tool:completed"
  | "tool:failed"
  | "tool:timeout";

/** Données d'un événement d'outil */
export interface ToolEventData {
  toolName: string;
  agentId?: ID;
  taskId?: ID;
  actionId?: ID;
  args?: Record<string, unknown>;
  result?: unknown;
  success?: boolean;
  error?: string;
  durationMs?: number;
  timestamp: Timestamp;
}

// -- File Events --

/** Événements de fichier */
export type FileEventType =
  | "file:read"
  | "file:modified"
  | "file:created"
  | "file:deleted"
  | "file:renamed"
  | "file:copied";

/** Données d'un événement de fichier */
export interface FileEventData {
  filePath: string;
  fileType?: FileType;
  artifactId?: ID;
  previousPath?: string; // Pour rename
  newPath?: string; // Pour rename/copy
  size?: number;
  hash?: string;
  modifiedBy?: ID; // agentId, taskId, or userId
  timestamp: Timestamp;
}

// -- Mission Events --

/** Événements de mission */
export type MissionEventType =
  | "mission:created"
  | "mission:started"
  | "mission:plan_created"
  | "mission:goal_started"
  | "mission:goal_completed"
  | "mission:goal_failed"
  | "mission:goal_escalated"
  | "mission:goal_blocked"
  | "mission:action_started"
  | "mission:action_completed"
  | "mission:action_failed"
  | "mission:progress"
  | "mission:completed"
  | "mission:failed"
  | "mission:cancelled"
  | "mission:paused"
  | "mission:resumed";

/** Données d'un événement de mission */
export interface MissionEventData {
  missionId: ID;
  mission?: MissionState;
  goalId?: ID;
  goal?: Goal;
  actionId?: ID;
  action?: PlannedAction;
  plan?: MissionPlan;
  progress?: { current: number; total: number; label: string };
  result?: GoalResult;
  error?: string;
  reason?: string;
  timestamp: Timestamp;
}

// -- Verification Events --

/** Événements de vérification */
export type VerificationEventType =
  | "verification:scheduled"
  | "verification:started"
  | "verification:progress"
  | "verification:passed"
  | "verification:failed"
  | "verification:skipped"
  | "verification:error";

/** Données d'un événement de vérification */
export interface VerificationEventData {
  verificationId: ID;
  type: VerificationType;
  verifierName: string;
  targetId: ID;
  targetType: "task" | "action" | "mission" | "goal" | "artifact" | "workspace";
  status: VerificationStatus;
  result?: VerificationResult;
  checks?: VerificationCheck[];
  error?: string;
  timestamp: Timestamp;
}

// -- Checkpoint Events --

/** Événements de checkpoint */
export type CheckpointEventType =
  | "checkpoint:created"
  | "checkpoint:creating"
  | "checkpoint:restored"
  | "checkpoint:restoring"
  | "checkpoint:rolledback"
  | "checkpoint:rollingback"
  | "checkpoint:deleted"
  | "checkpoint:listed";

/** Données d'un événement de checkpoint */
export interface CheckpointEventData {
  checkpointId: ID;
  checkpoint?: Checkpoint;
  missionId?: ID;
  taskId?: ID;
  fromCheckpointId?: ID; // Pour rollback, le checkpoint source
  reason?: string;
  timestamp: Timestamp;
}

// -- Artifact Events --

/** Événements d'artefact */
export type ArtifactEventType =
  | "artifact:created"
  | "artifact:modified"
  | "artifact:versioned"
  | "artifact:deleted"
  | "artifact:referenced"
  | "artifact:exported";

/** Données d'un événement d'artefact */
export interface ArtifactEventData {
  artifactId: ID;
  artifact?: Artifact;
  versionId?: ID;
  version?: ArtifactVersion;
  reference?: ArtifactReference;
  path: string;
  action: "create" | "modify" | "version" | "delete" | "reference" | "export";
  timestamp: Timestamp;
}

// -- Recovery Events --

/** Événements de récupération */
export type RecoveryEventType =
  | "recovery:triggered"
  | "recovery:started"
  | "recovery:completed"
  | "recovery:failed"
  | "recovery:retrying"
  | "recovery:replanning"
  | "recovery:rollingback"
  | "recovery:escalating"
  | "recovery:aborted";

/** Données d'un événement de récupération */
export interface RecoveryEventData {
  recoveryId: ID;
  recoveryType: RecoveryType;
  context: RecoveryContext;
  outcome?: RecoveryOutcome;
  error?: string;
  attemptCount: number;
  timestamp: Timestamp;
}

// -- Replanning Events --

/** Événements de replanification */
export type ReplanEventType =
  | "replan:triggered"
  | "replan:started"
  | "replan:completed"
  | "replan:failed"
  | "replan:action_added"
  | "replan:action_removed"
  | "replan:action_modified";

/** Données d'un événement de replanification */
export interface ReplanEventData {
  replanId: ID;
  missionId: ID;
  goalId: ID;
  context: ReplanContext;
  result?: ReplanResult;
  error?: string;
  timestamp: Timestamp;
}

// -- Workspace Events --

/** Événements de workspace */
export type WorkspaceEventType =
  | "workspace:initialized"
  | "workspace:context_changed"
  | "workspace:memory_updated"
  | "workspace:shutdown"
  | "workspace:error";

/** Données d'un événement de workspace */
export interface WorkspaceEventData {
  workspaceId: ID;
  context?: WorkspaceContext;
  memory?: MemoryEntry[];
  error?: string;
  timestamp: Timestamp;
}

// -- Message Events (from AgentMessageBus) --

/** Événements de message */
export type MessageEventType =
  | "message:published"
  | "message:received"
  | "message:delivered"
  | "message:failed"
  | "message:broadcast";

/** Données d'un événement de message */
export interface MessageEventData {
  messageId: ID;
  from: AgentRole | ID;
  to: AgentRole | ID | "broadcast";
  type: string;
  priority?: Priority;
  correlationId?: ID;
  success: boolean;
  error?: string;
  durationMs?: number;
  timestamp: Timestamp;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Unified Event Types
// ═══════════════════════════════════════════════════════════════════════════════

/** Tous les types d'événements */
export type EventType =
  | TaskEventType
  | AgentEventType
  | ToolEventType
  | FileEventType
  | MissionEventType
  | VerificationEventType
  | CheckpointEventType
  | ArtifactEventType
  | RecoveryEventType
  | ReplanEventType
  | WorkspaceEventType
  | MessageEventType
  | "system:ready"
  | "system:shutdown"
  | "system:error"
  | "*"; // Wildcard pour tous les événements

/** Données génériques d'un événement */
export interface EventData {
  [key: string]: unknown;
}

/** Événement unifié */
export interface Event {
  type: EventType;
  data: unknown; // Permet n'importe quel type de données
  timestamp: Timestamp;
  source?: string; // Composant qui a émis l'événement (ex: "mission.Executor", "agents.AgentMessageBus")
  correlationId?: ID; // Pour corrélation entre événements liés
  traceId?: ID; // Pour traçage distribué
  priority?: Priority; // Priorité de l'événement pour traitement
}

// -- Event Data Union Types for Type Safety --

/** Données spécifiques par type d'événement */
export type EventDataMap = {
  // Task Events
  "task:created": TaskEventData;
  "task:state_changed": TaskEventData;
  "task:started": TaskEventData;
  "task:progress": TaskEventData;
  "task:completed": TaskEventData;
  "task:failed": TaskEventData;
  "task:cancelled": TaskEventData;
  "task:retrying": TaskEventData;

  // Agent Events
  "agent:registered": AgentEventData;
  "agent:unregistered": AgentEventData;
  "agent:started": AgentEventData;
  "agent:completed": AgentEventData;
  "agent:failed": AgentEventData;
  "agent:busy": AgentEventData;
  "agent:idle": AgentEventData;
  "agent:error": AgentEventData;
  "agent:status_changed": AgentEventData;

  // Tool Events
  "tool:called": ToolEventData;
  "tool:started": ToolEventData;
  "tool:completed": ToolEventData;
  "tool:failed": ToolEventData;
  "tool:timeout": ToolEventData;

  // File Events
  "file:read": FileEventData;
  "file:modified": FileEventData;
  "file:created": FileEventData;
  "file:deleted": FileEventData;
  "file:renamed": FileEventData;
  "file:copied": FileEventData;

  // Mission Events
  "mission:created": MissionEventData;
  "mission:started": MissionEventData;
  "mission:plan_created": MissionEventData;
  "mission:goal_started": MissionEventData;
  "mission:goal_completed": MissionEventData;
  "mission:goal_failed": MissionEventData;
  "mission:goal_escalated": MissionEventData;
  "mission:goal_blocked": MissionEventData;
  "mission:action_started": MissionEventData;
  "mission:action_completed": MissionEventData;
  "mission:action_failed": MissionEventData;
  "mission:progress": MissionEventData;
  "mission:completed": MissionEventData;
  "mission:failed": MissionEventData;
  "mission:cancelled": MissionEventData;
  "mission:paused": MissionEventData;
  "mission:resumed": MissionEventData;

  // Verification Events
  "verification:scheduled": VerificationEventData;
  "verification:started": VerificationEventData;
  "verification:progress": VerificationEventData;
  "verification:passed": VerificationEventData;
  "verification:failed": VerificationEventData;
  "verification:skipped": VerificationEventData;
  "verification:error": VerificationEventData;

  // Checkpoint Events
  "checkpoint:created": CheckpointEventData;
  "checkpoint:creating": CheckpointEventData;
  "checkpoint:restored": CheckpointEventData;
  "checkpoint:restoring": CheckpointEventData;
  "checkpoint:rolledback": CheckpointEventData;
  "checkpoint:rollingback": CheckpointEventData;
  "checkpoint:deleted": CheckpointEventData;
  "checkpoint:listed": CheckpointEventData;

  // Artifact Events
  "artifact:created": ArtifactEventData;
  "artifact:modified": ArtifactEventData;
  "artifact:versioned": ArtifactEventData;
  "artifact:deleted": ArtifactEventData;
  "artifact:referenced": ArtifactEventData;
  "artifact:exported": ArtifactEventData;

  // Recovery Events
  "recovery:triggered": RecoveryEventData;
  "recovery:started": RecoveryEventData;
  "recovery:completed": RecoveryEventData;
  "recovery:failed": RecoveryEventData;
  "recovery:retrying": RecoveryEventData;
  "recovery:replanning": RecoveryEventData;
  "recovery:rollingback": RecoveryEventData;
  "recovery:escalating": RecoveryEventData;
  "recovery:aborted": RecoveryEventData;

  // Replan Events
  "replan:triggered": ReplanEventData;
  "replan:started": ReplanEventData;
  "replan:completed": ReplanEventData;
  "replan:failed": ReplanEventData;
  "replan:action_added": ReplanEventData;
  "replan:action_removed": ReplanEventData;
  "replan:action_modified": ReplanEventData;

  // Workspace Events
  "workspace:initialized": WorkspaceEventData;
  "workspace:context_changed": WorkspaceEventData;
  "workspace:memory_updated": WorkspaceEventData;
  "workspace:shutdown": WorkspaceEventData;
  "workspace:error": WorkspaceEventData;

  // Message Events
  "message:published": MessageEventData;
  "message:received": MessageEventData;
  "message:delivered": MessageEventData;
  "message:failed": MessageEventData;
  "message:broadcast": MessageEventData;

  // System Events
  "system:ready": { timestamp: Timestamp };
  "system:shutdown": { reason?: string; timestamp: Timestamp };
  "system:error": { error: string; timestamp: Timestamp };
};

/** Événement typé par son type */
export type TypedEvent<T extends EventType = EventType> = {
  type: T;
  data: T extends keyof EventDataMap ? EventDataMap[T] : EventData;
  timestamp: Timestamp;
  source?: string;
  correlationId?: ID;
  traceId?: ID;
  priority?: Priority;
};

// ═══════════════════════════════════════════════════════════════════════════════
// Event Bus Types
// ═══════════════════════════════════════════════════════════════════════════════

/** Handler d'événement */
export type EventHandler<T extends EventType = EventType> = (
  event: Extract<Event, { type: T }>
) => void;

/** Handler pour tous les événements */
export type AnyEventHandler = (event: Event) => void;

/** Filtre d'événements */
export interface EventFilter {
  types?: EventType[];
  source?: string;
  correlationId?: ID;
  traceId?: ID;
  startTime?: Timestamp;
  endTime?: Timestamp;
  minPriority?: Priority;
}

/** Abonnement à un événement */
export interface EventSubscription {
  id: number;
  eventType: EventType;
  handler: EventHandler;
  priority?: Priority;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration Types
// ═══════════════════════════════════════════════════════════════════════════════

/** Configuration de l'EventBus */
export interface EventBusConfig {
  maxHistorySize: number; // Nombre max d'événements dans l'historique
  enableMetrics: boolean; // Activer le suivi des métriques
  enableTracing: boolean; // Activer le traçage distribué
  enablePersistence: boolean; // Persister les événements
  defaultPriority: Priority; // Priorité par défaut
}

/** Configuration par défaut */
export const DEFAULT_EVENT_BUS_CONFIG: EventBusConfig = {
  maxHistorySize: 1000,
  enableMetrics: true,
  enableTracing: true,
  enablePersistence: true,
  defaultPriority: "medium",
};

// ═══════════════════════════════════════════════════════════════════════════════
// Index Types
// ═══════════════════════════════════════════════════════════════════════════════
