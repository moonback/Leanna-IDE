import { z } from "zod";
import type { AgentRole, TaskResult } from "../types.js";
import type { BrainPlan, BrainStage, StageVerification } from "../brain/types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Agent Lead — contrats de la couche de décision branchée sur l'AgentBrain
// ═══════════════════════════════════════════════════════════════════════════════

export type StopReason = "wall_time" | "delegation_budget" | "consecutive_failures" | "no_progress";

export type StopDecision =
  | { continue: true }
  | { continue: false; reason: StopReason; detail: string };

export type LeadStop = Extract<StopDecision, { continue: false }>;

export type ArbitrationVerdict =
  | { action: "accept"; rationale: string }
  | { action: "correct"; rationale: string; targetRole?: AgentRole }
  | { action: "reassign"; rationale: string; toRole: AgentRole }
  | { action: "abandon"; rationale: string };

export type DelegationKind = "stage" | "correction" | "reassign";

export interface LeadBudget {
  maxWallTimeMs: number;
  maxDelegations: number;
  maxConsecutiveFailures: number;
}

export const DEFAULT_LEAD_BUDGET: Readonly<LeadBudget> = Object.freeze({
  maxWallTimeMs: 20 * 60_000,
  maxDelegations: 25,
  maxConsecutiveFailures: 3,
});

export interface LeadDecision {
  kind: "select" | "arbitrate" | "stop";
  stageId?: string;
  summary: string;
  rationale: string;
  timestamp: string;
}

export interface LeadRunState {
  planId: string;
  goal: string;
  startedAt: number;
  budget: LeadBudget;
  delegations: number;
  consecutiveFailures: number;
  completedStages: Set<string>;
  filesVerified: number;
  /** Marqueur de progrès relevé au dernier replan autorisé (null = aucun replan encore). */
  lastReplanMarker: number | null;
  reassigned: Set<string>;
  /** stageId → signatures des issues critiques déjà vues. */
  issueHistory: Map<string, Set<string>>;
  decisions: LeadDecision[];
  stopped?: LeadStop;
}

export interface ArbitrationInput {
  stage: BrainStage;
  verification: StageVerification;
  result?: TaskResult;
  /** Numéro (1-based) de la prochaine tentative de correction. */
  attempt: number;
  maxAttempts: number;
}

export interface LeadPolicy {
  begin(plan: BrainPlan, budget?: Partial<LeadBudget>): LeadRunState;
  selectAgents(plan: BrainPlan, state: LeadRunState): void;
  arbitrate(input: ArbitrationInput, state: LeadRunState): ArbitrationVerdict;
  shouldContinue(state: LeadRunState, point: "delegation" | "replan"): StopDecision;
  nextBestRole(stage: BrainStage, state: LeadRunState, exclude: AgentRole[]): AgentRole | null;
  recordDelegation(state: LeadRunState, kind: DelegationKind): void;
  recordStageOutcome(state: LeadRunState, stageId: string, passed: boolean, filesVerified: number): void;
}

/** Fusionne un budget partiel avec les défauts ; ignore les valeurs absentes, non finies ou ≤ 0. */
export function resolveLeadBudget(budget?: Partial<LeadBudget>): LeadBudget {
  const merged: LeadBudget = { ...DEFAULT_LEAD_BUDGET };
  for (const key of Object.keys(merged) as Array<keyof LeadBudget>) {
    const value = budget?.[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) merged[key] = value;
  }
  return merged;
}

export function createLeadRunState(
  planId: string,
  goal: string,
  budget: Partial<LeadBudget> | undefined,
  startedAt: number
): LeadRunState {
  return {
    planId,
    goal,
    startedAt,
    budget: resolveLeadBudget(budget),
    delegations: 0,
    consecutiveFailures: 0,
    completedStages: new Set<string>(),
    filesVerified: 0,
    lastReplanMarker: null,
    reassigned: new Set<string>(),
    issueHistory: new Map<string, Set<string>>(),
    decisions: [],
  };
}

/** Progrès mesurable : étapes validées + fichiers vérifiés. */
export function progressMarker(state: LeadRunState): number {
  return state.completedStages.size + state.filesVerified;
}

// ─── Schémas d'entrée (API, outil, route) ─────────────────────────────────────

export const leadBudgetSchema = z.object({
  maxWallTimeMs: z.number().int().min(10_000).max(2 * 60 * 60_000).optional(),
  maxDelegations: z.number().int().min(1).max(200).optional(),
  maxConsecutiveFailures: z.number().int().min(1).max(20).optional(),
});

/** Champs à ajouter aux schémas d'exécution du Brain. */
export const leadOptionsShape = {
  lead: z.boolean().optional(),
  leadBudget: leadBudgetSchema.optional(),
};
