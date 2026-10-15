import { contractNetNegotiator } from "../ContractNetNegotiator.js";
import { swarmComposer, stageOfRole, type SwarmStage } from "../SwarmComposer.js";
import { getAgentDefinition, hasAgent, listAgentRoles } from "../roles.js";
import { inferRequiredCapabilities } from "../capabilityInference.js";
import type { AgentRole } from "../types.js";
import type { BrainStage } from "../brain/types.js";

/** Écart de score minimal pour qu'un autre rôle remplace celui du planner. */
export const SELECTION_MARGIN = 0.15;

export interface RoleScore {
  score: number;
  skillMatch: number;
}

/** Dépendances injectables (toutes optionnelles ; défauts = modules réels). */
export interface AgentSelectorDeps {
  scoreRole?: (role: AgentRole, requiredCapabilities: string[]) => RoleScore | null;
  runningCount?: (role: AgentRole) => number;
  maxConcurrency?: (role: AgentRole) => number | undefined;
  teamRoles?: (objective: string) => AgentRole[];
  candidateRoles?: () => AgentRole[];
  roleExists?: (role: AgentRole) => boolean;
  inferCapabilities?: (text: string, instructions?: string) => string[];
  stageOf?: (role: AgentRole) => SwarmStage | undefined;
}

export interface RoleChoice {
  role: AgentRole;
  changed: boolean;
  rationale: string;
}

interface RankedRole {
  role: AgentRole;
  score: number;
}

/** Familles étanches : on ne réaffecte jamais une étape de réflexion vers de l'écriture (et inversement). */
function familyOf(stage: SwarmStage): string {
  return stage === "research" || stage === "design" ? "think" : stage;
}

function defaultScoreRole(role: AgentRole, requiredCapabilities: string[]): RoleScore | null {
  const bid = contractNetNegotiator.buildAutoBid(role, {
    taskId: "agent-lead-selection",
    title: "",
    description: "",
    requiredCapabilities,
  });
  if (!bid) return null;
  return { score: contractNetNegotiator.scoreBid(bid), skillMatch: bid.skillMatch };
}

/**
 * Choix déterministe de l'agent d'une étape : réutilise la composition
 * d'équipe (SwarmComposer) et le scoring contract-net, sans enchère sur le bus.
 */
export class AgentSelector {
  private readonly deps: Required<AgentSelectorDeps>;

  constructor(deps: AgentSelectorDeps = {}) {
    this.deps = {
      scoreRole: deps.scoreRole ?? defaultScoreRole,
      runningCount: deps.runningCount ?? (() => 0),
      maxConcurrency: deps.maxConcurrency ?? ((role) => getAgentDefinition(role)?.maxConcurrency),
      teamRoles: deps.teamRoles ?? ((objective) => swarmComposer.plan({ objective: { title: objective } }).pipeline),
      candidateRoles: deps.candidateRoles ?? (() => listAgentRoles()),
      roleExists: deps.roleExists ?? hasAgent,
      inferCapabilities: deps.inferCapabilities ?? inferRequiredCapabilities,
      stageOf: deps.stageOf ?? stageOfRole,
    };
  }

  isSaturated(role: AgentRole): boolean {
    const max = this.deps.maxConcurrency(role);
    return typeof max === "number" && this.deps.runningCount(role) >= max;
  }

  choose(stage: BrainStage, goal: string): RoleChoice {
    const current = stage.agentRole;
    if (!this.deps.stageOf(current)) {
      return { role: current, changed: false, rationale: "rôle hors pipeline connu : conservé" };
    }
    const ranked = this.rank(stage, goal, []);
    const currentScore = ranked.find((r) => r.role === current)?.score ?? 0;

    if (this.isSaturated(current)) {
      const alt = ranked.find((r) => r.role !== current && !this.isSaturated(r.role));
      if (alt) {
        return { role: alt.role, changed: true, rationale: `${current} à capacité maximale → ${alt.role} (score ${alt.score.toFixed(2)})` };
      }
    }

    const best = ranked[0];
    if (best && best.role !== current && best.score - currentScore >= SELECTION_MARGIN) {
      return {
        role: best.role,
        changed: true,
        rationale: `${best.role} plus adapté que ${current} (score ${best.score.toFixed(2)} vs ${currentScore.toFixed(2)})`,
      };
    }
    return { role: current, changed: false, rationale: "rôle du planner conservé" };
  }

  nextBest(stage: BrainStage, goal: string, exclude: AgentRole[]): AgentRole | null {
    if (!this.deps.stageOf(stage.agentRole)) return null;
    const alt = this.rank(stage, goal, exclude).find((r) => !this.isSaturated(r.role));
    return alt?.role ?? null;
  }

  private rank(stage: BrainStage, goal: string, exclude: AgentRole[]): RankedRole[] {
    const currentStage = this.deps.stageOf(stage.agentRole);
    if (!currentStage) return [];
    const family = familyOf(currentStage);
    const required = this.deps.inferCapabilities(`${stage.title} ${stage.description}`, stage.instructions);
    const pool = new Set<AgentRole>([
      stage.agentRole,
      ...this.deps.teamRoles(`${goal} ${stage.title}`),
      ...this.deps.candidateRoles(),
    ]);

    const ranked: RankedRole[] = [];
    for (const role of pool) {
      if (exclude.includes(role) || !this.deps.roleExists(role)) continue;
      const candidateStage = this.deps.stageOf(role);
      if (!candidateStage || familyOf(candidateStage) !== family) continue;
      const scored = this.deps.scoreRole(role, required);
      if (!scored) continue;
      if (role !== stage.agentRole && scored.skillMatch <= 0) continue;
      ranked.push({ role, score: scored.score });
    }
    return ranked.sort((a, b) => b.score - a.score || a.role.localeCompare(b.role));
  }
}
