/**
 * Autonomous Core V2 — Types fondamentaux
 *
 * Contrats de données de toute la couche autonome :
 *   Goal, Mission, AutonomyLevel, PerceptionEvent, DecisionProposal
 */

import type { AgentRole, TaskPriority, TaskResult } from "../agents/types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// AUTONOMY LEVELS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Niveaux d'autorité de Leanna.
 *
 * L0 — Chat uniquement (réponses textuelles)
 * L1 — Suggestions sans exécution
 * L2 — Lecture autonome du workspace
 * L3 — Analyse autonome (Knowledge Graph, mémoire, compreh)
 * L4 — Modifications dans le sandbox isolé
 * L5 — Exécution de tests et validation
 * L6 — Corrections autonomes (sync sandbox → main après validation)
 * L7 — Actions externes autorisées (git, browser, Telegram)
 * L8 — Missions longues multi-agents en arrière-plan
 */
export type AutonomyLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const AUTONOMY_LEVEL_LABELS: Record<AutonomyLevel, string> = {
  0: "Chat uniquement",
  1: "Suggestions",
  2: "Lecture autonome",
  3: "Analyse autonome",
  4: "Sandbox — modifications isolées",
  5: "Tests & validation",
  6: "Corrections autonomes",
  7: "Actions externes",
  8: "Missions longues",
};

// ═══════════════════════════════════════════════════════════════════════════════
// GOALS
// ═══════════════════════════════════════════════════════════════════════════════

export type GoalStatus = "active" | "paused" | "completed" | "failed" | "archived";
export type GoalCadence = "once" | "continuous" | "on_change" | "scheduled";
export type GoalPriority = "low" | "medium" | "high" | "critical";

export interface GoalConstraints {
  /** Ne pas introduire de breaking changes */
  noBreakingChanges?: boolean;
  /** Tests obligatoires avant sync */
  requireTests?: boolean;
  /** TypeScript strict */
  requireTypeCheck?: boolean;
  /** Niveau d'autonomie maximal autorisé pour cet objectif */
  maxAutonomyLevel?: AutonomyLevel;
  /** Fichiers / dossiers hors scope */
  excludePaths?: string[];
  /** Nombre maximal de missions simultanées déclenchées par cet objectif */
  maxConcurrentMissions?: number;
}

export interface GoalCheck {
  /** Identifiant de la vérification */
  type:
    | "typescript"
    | "tests"
    | "security"
    | "dependencies"
    | "git_status"
    | "architecture"
    | "tech_debt"
    | "documentation"
    | "custom";
  /** Label humain */
  label?: string;
  /** Paramètres libres selon le type */
  params?: Record<string, unknown>;
}

export interface Goal {
  id: string;
  /** Titre court */
  title: string;
  /** Description complète de l'objectif */
  description: string;
  priority: GoalPriority;
  status: GoalStatus;
  cadence: GoalCadence;
  /** Expression cron ou délai ms si cadence === "scheduled" */
  schedule?: string;
  constraints: GoalConstraints;
  /** Liste des checks à effectuer pour évaluer la satisfaction */
  checks: GoalCheck[];
  /** Critères de succès lisibles */
  successCriteria: string[];
  /** Tags libres pour regroupement */
  tags: string[];
  createdAt: string;
  updatedAt: string;
  lastEvaluatedAt?: string;
  lastMissionAt?: string;
  completedAt?: string;
  /** Méta-données libres */
  metadata?: Record<string, unknown>;
}

export interface GoalCreateInput {
  title: string;
  description: string;
  priority?: GoalPriority;
  cadence?: GoalCadence;
  schedule?: string;
  constraints?: Partial<GoalConstraints>;
  checks?: GoalCheck[];
  successCriteria?: string[];
  tags?: string[];
  metadata?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PERCEPTION
// ═══════════════════════════════════════════════════════════════════════════════

export type PerceptionEventType =
  | "workspace.file_changed"
  | "workspace.file_created"
  | "workspace.file_deleted"
  | "workspace.batch_changed"
  | "git.commit"
  | "git.branch_changed"
  | "build.failed"
  | "build.succeeded"
  | "test.failed"
  | "test.passed"
  | "dependency.changed"
  | "security.alert"
  | "opportunity.detected"
  | "user.message"
  | "scheduler.tick"
  | "goal.added"
  | "goal.changed"
  | "mission.completed"
  | "mission.failed";

export interface PerceptionEvent {
  id: string;
  type: PerceptionEventType;
  timestamp: number;
  /** Fichiers concernés (si applicable) */
  files?: string[];
  /** Données contextuelles libres */
  payload?: Record<string, unknown>;
  /** Niveau de risque estimé (0-1) */
  riskScore?: number;
  /** Source ayant produit cet événement */
  source?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DECISION
// ═══════════════════════════════════════════════════════════════════════════════

export type DecisionAction =
  | "create_mission"
  | "watch_and_wait"
  | "escalate_to_user"
  | "skip";

export interface DecisionProposal {
  id: string;
  /** Événement de perception ayant déclenché la décision */
  triggerEventId: string;
  /** Objectif concerné */
  goalId: string;
  action: DecisionAction;
  /** Priorité de la mission proposée */
  priority: TaskPriority;
  /** Titre humain de la mission */
  missionTitle: string;
  /** Description complète */
  missionDescription: string;
  /** Agents recommandés */
  recommendedAgents: AgentRole[];
  /** Fichiers concernés */
  files: string[];
  /** Score de confiance (0-1) */
  confidence: number;
  /** Raison de la décision */
  reason: string;
  /** Niveau d'autonomie requis */
  requiredAutonomyLevel: AutonomyLevel;
  createdAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MISSIONS
// ═══════════════════════════════════════════════════════════════════════════════

export type MissionStatus =
  | "pending"
  | "running"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled";

export interface Mission {
  id: string;
  goalId: string;
  title: string;
  description: string;
  status: MissionStatus;
  priority: TaskPriority;
  /** ID de la tâche AgentOrchestrator correspondante */
  agentTaskId?: string;
  /** Agents impliqués */
  agents: AgentRole[];
  files: string[];
  /** Résultat de la mission */
  result?: TaskResult;
  /** Leçons apprises (post-réflexion) */
  lessonsLearned?: string[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  /** Durée totale en ms */
  durationMs?: number;
  /** Source de la décision ayant créé la mission */
  proposalId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// OPPORTUNITY
// ═══════════════════════════════════════════════════════════════════════════════

export type OpportunityType =
  | "tech_debt"
  | "missing_test"
  | "missing_doc"
  | "stale_dependency"
  | "security_issue"
  | "code_duplication"
  | "architecture_inconsistency"
  | "abandoned_todo"
  | "performance_issue"
  | "type_error";

export interface Opportunity {
  id: string;
  type: OpportunityType;
  title: string;
  description: string;
  /** Fichiers concernés */
  files: string[];
  /** Score de priorité (0-1) */
  score: number;
  /** Effort estimé */
  estimatedEffort: "low" | "medium" | "high";
  detectedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RUNTIME STATE
// ═══════════════════════════════════════════════════════════════════════════════

export type AutonomousState =
  | "idle"
  | "observing"
  | "understanding"
  | "planning"
  | "executing"
  | "verifying"
  | "reflecting"
  | "learning"
  | "waiting";

export interface AutonomousRuntimeStatus {
  state: AutonomousState;
  autonomyLevel: AutonomyLevel;
  activeGoals: number;
  activeMissions: number;
  totalMissionsRun: number;
  totalMissionsSucceeded: number;
  totalMissionsFailed: number;
  lastEventAt?: number;
  lastMissionAt?: string;
  uptime: number;
  startedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GOAL EVALUATION
// ═══════════════════════════════════════════════════════════════════════════════

export type GoalCheckResult = {
  check: GoalCheck;
  passed: boolean;
  details: string;
};

export interface GoalEvaluationResult {
  goalId: string;
  satisfied: boolean;
  score: number; // 0-1
  checkResults: GoalCheckResult[];
  summary: string;
  evaluatedAt: string;
}
