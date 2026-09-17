/**
 * AUTONOMY MODULE — Point d'entrée
 *
 * Exporte les composants du moteur d'autonomie :
 * 1. Supervisor — Boucle de contrôle serveur-side (V1)
 * 2. SmartSkills — Skills composites avec boucle intégrée (V1)
 * 3. Autonomous Core V2 — Couche d'autonomie persistante
 */

export { Supervisor, supervisor } from "./Supervisor.js";
export type { SupervisorConfig, MissionObjective, SessionInjector } from "./Supervisor.js";

export { createSmartSkills } from "./SmartSkills.js";
export type { SkillHandler } from "./SmartSkills.js";

// ── Autonomous Core V2 ────────────────────────────────────────────────────────

// Runtime principal
export { AutonomousRuntime, autonomousRuntime } from "./AutonomousRuntime.js";
export type { RuntimeBroadcaster } from "./AutonomousRuntime.js";

// Composants individuels (singletons)
export { autonomyController, AutonomyController, AutonomyDeniedError } from "./AutonomyController.js";
export type { ToolPermissionEntry, ToolCategory, PermissionDecision, PermissionAuditEntry } from "./AutonomyController.js";

export { goalManager, GoalManager } from "./GoalManager.js";

export { goalEvaluator, GoalEvaluator } from "./GoalEvaluator.js";

export { perceptionLoop, PerceptionLoop } from "./PerceptionLoop.js";
export type { PerceptionHandler } from "./PerceptionLoop.js";

export { decisionEngine, DecisionEngine } from "./DecisionEngine.js";
export type { ProposalHandler } from "./DecisionEngine.js";

export { missionManager, MissionManager } from "./MissionManager.js";
export type { MissionCompletionHandler, MissionEventBroadcaster } from "./MissionManager.js";

export { reflectionEngine, ReflectionEngine } from "./ReflectionEngine.js";
export type { ReflectionResult, ReflectionBroadcaster } from "./ReflectionEngine.js";

export { opportunityDetector, OpportunityDetector } from "./OpportunityDetector.js";
export type { OpportunityHandler } from "./OpportunityDetector.js";

// Types V2
export type {
  AutonomyLevel,
  AutonomousState,
  AutonomousRuntimeStatus,
  Goal,
  GoalCreateInput,
  GoalStatus,
  GoalPriority,
  GoalCadence,
  GoalConstraints,
  GoalCheck,
  GoalEvaluationResult,
  GoalCheckResult,
  Mission,
  MissionStatus,
  PerceptionEvent,
  PerceptionEventType,
  DecisionProposal,
  DecisionAction,
  Opportunity,
  OpportunityType,
} from "./types.js";

export { AUTONOMY_LEVEL_LABELS } from "./types.js";
