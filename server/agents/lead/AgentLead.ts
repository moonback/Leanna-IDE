import { agentEventStream } from "../AgentEventStream.js";
import { createLogger } from "../../utils/logger.js";
import type { AgentRole } from "../types.js";
import type { BrainPlan, BrainStage } from "../brain/types.js";
import { AgentSelector } from "./AgentSelector.js";
import { StageArbiter } from "./StageArbiter.js";
import { StopController } from "./StopController.js";
import {
  createLeadRunState,
  type ArbitrationInput,
  type ArbitrationVerdict,
  type DelegationKind,
  type LeadBudget,
  type LeadDecision,
  type LeadPolicy,
  type LeadRunState,
  type StopDecision,
} from "./types.js";

const log = createLogger("AgentLead");

export interface AgentLeadOptions {
  now?: () => number;
  /** Compteur de tâches en cours par rôle (orchestrateur) ; absent = jamais saturé. */
  runningCount?: (role: AgentRole) => number;
  selector?: AgentSelector;
  arbiter?: StageArbiter;
  stopController?: StopController;
  publish?: (decision: LeadDecision, state: LeadRunState) => void;
}

function publishToEventStream(decision: LeadDecision, state: LeadRunState): void {
  agentEventStream.publish({
    type: "agent_event",
    event: "task_progress",
    taskId: decision.stageId ?? state.planId,
    role: "planner",
    title: `[Agent Lead] ${decision.summary}`,
    status: "running",
    agentName: "Agent Lead",
    detail: decision.rationale,
    timestamp: decision.timestamp,
  });
}

/**
 * Agent Lead — chef d'orchestre de l'AgentBrain : choisit les agents, arbitre
 * chaque étape et décide de l'arrêt. Couche de décision pure : l'exécution
 * reste celle du Brain (scheduler, délégation, vérification, correction).
 */
export class AgentLead implements LeadPolicy {
  private readonly now: () => number;
  private readonly selector: AgentSelector;
  private readonly arbiter: StageArbiter;
  private readonly stopController: StopController;
  private readonly publish: (decision: LeadDecision, state: LeadRunState) => void;

  constructor(options: AgentLeadOptions = {}) {
    this.now = options.now ?? Date.now;
    this.selector = options.selector ?? new AgentSelector({ runningCount: options.runningCount });
    this.arbiter = options.arbiter ?? new StageArbiter();
    this.stopController = options.stopController ?? new StopController(this.now);
    this.publish = options.publish ?? publishToEventStream;
  }

  begin(plan: BrainPlan, budget?: Partial<LeadBudget>): LeadRunState {
    return createLeadRunState(plan.id, plan.goal, budget, this.now());
  }

  selectAgents(plan: BrainPlan, state: LeadRunState): void {
    for (const stage of plan.stages) {
      if (stage.status !== "pending") continue;
      const choice = this.selector.choose(stage, state.goal);
      if (!choice.changed) continue;
      const from = stage.agentRole;
      stage.agentRole = choice.role;
      stage.agentReason = `${stage.agentReason} | Agent Lead : ${choice.rationale}`;
      this.decide(state, { kind: "select", stageId: stage.id, summary: `${stage.title} : ${from} → ${choice.role}`, rationale: choice.rationale });
    }
  }

  arbitrate(input: ArbitrationInput, state: LeadRunState): ArbitrationVerdict {
    const verdict = this.arbiter.arbitrate(input, state, () =>
      this.selector.nextBest(input.stage, state.goal, [input.stage.agentRole])
    );
    const target = verdict.action === "reassign" ? ` → ${verdict.toRole}` : "";
    this.decide(state, {
      kind: "arbitrate",
      stageId: input.stage.id,
      summary: `${input.stage.title} : ${verdict.action}${target}`,
      rationale: verdict.rationale,
    });
    return verdict;
  }

  shouldContinue(state: LeadRunState, point: "delegation" | "replan"): StopDecision {
    const alreadyStopped = Boolean(state.stopped);
    const decision = this.stopController.shouldContinue(state, point);
    if (!decision.continue && !alreadyStopped) {
      log.warn(`🛑 Agent Lead : arrêt (${decision.reason}) — ${decision.detail}`);
      this.decide(state, { kind: "stop", summary: `arrêt : ${decision.reason}`, rationale: decision.detail });
    }
    return decision;
  }

  nextBestRole(stage: BrainStage, state: LeadRunState, exclude: AgentRole[]): AgentRole | null {
    return this.selector.nextBest(stage, state.goal, exclude);
  }

  recordDelegation(state: LeadRunState, _kind: DelegationKind): void {
    this.stopController.recordDelegation(state);
  }

  recordStageOutcome(state: LeadRunState, stageId: string, passed: boolean, filesVerified: number): void {
    this.stopController.recordStageOutcome(state, stageId, passed, filesVerified);
  }

  private decide(state: LeadRunState, decision: Omit<LeadDecision, "timestamp">): void {
    const full: LeadDecision = { ...decision, timestamp: new Date(this.now()).toISOString() };
    state.decisions.push(full);
    try {
      this.publish(full, state);
    } catch {
      // La publication d'événements ne doit jamais bloquer une décision.
    }
  }
}
