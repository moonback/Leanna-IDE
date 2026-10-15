import { AgentEvidenceEvaluator } from "../AgentEvidenceEvaluator.js";
import { stageOfRole, type SwarmStage } from "../SwarmComposer.js";
import type { AgentRole } from "../types.js";
import type { ArbitrationInput, ArbitrationVerdict, LeadRunState } from "./types.js";

export interface StageArbiterDeps {
  isPlanningOnly?: (text: string) => boolean;
  stageOf?: (role: AgentRole) => SwarmStage | undefined;
}

/**
 * Jugement par étape de l'Agent Lead : combine le verdict du vérificateur,
 * les preuves d'exécution et l'historique de l'étape. Règles appliquées dans
 * l'ordre (spec §6).
 */
export class StageArbiter {
  private readonly isPlanningOnly: (text: string) => boolean;
  private readonly stageOf: (role: AgentRole) => SwarmStage | undefined;

  constructor(deps: StageArbiterDeps = {}) {
    const evaluator = new AgentEvidenceEvaluator();
    this.isPlanningOnly = deps.isPlanningOnly ?? ((text) => evaluator.isPlanningOnly(text));
    this.stageOf = deps.stageOf ?? stageOfRole;
  }

  arbitrate(input: ArbitrationInput, state: LeadRunState, nextBest: () => AgentRole | null): ArbitrationVerdict {
    const { stage, verification, result, attempt, maxAttempts } = input;
    const attemptsLeft = attempt <= maxAttempts;
    const filesModified = result?.filesModified ?? [];

    if (verification.passed) {
      const writes = this.stageOf(stage.agentRole) === "build";
      if (writes && filesModified.length === 0 && this.isPlanningOnly(result?.summary ?? "")) {
        return attemptsLeft
          ? { action: "correct", rationale: "contradiction : vérification passée sans aucune écriture (plan seulement)" }
          : { action: "abandon", rationale: "aucune écriture produite malgré les corrections" };
      }
      return { action: "accept", rationale: "vérification réussie" };
    }

    const signatures = verification.issues
      .filter((issue) => issue.severity === "critical")
      .map((issue) => `${issue.file ?? ""}|${issue.message}`);
    const seen = state.issueHistory.get(stage.id) ?? new Set<string>();
    const repeated = signatures.find((sig) => seen.has(sig));
    for (const sig of signatures) seen.add(sig);
    state.issueHistory.set(stage.id, seen);
    if (repeated) {
      return { action: "abandon", rationale: `issue critique répétée sans progrès : ${repeated.split("|").slice(1).join("|")}` };
    }

    const noTrace = filesModified.length === 0 && (result?.evidence?.toolsExecuted?.length ?? 0) === 0;
    const unproductive = result?.outcome === "blocked" || result?.outcome === "failed";
    if (unproductive && noTrace && attemptsLeft && !state.reassigned.has(stage.id)) {
      const toRole = nextBest();
      if (toRole) {
        state.reassigned.add(stage.id);
        return { action: "reassign", toRole, rationale: `${stage.agentRole} n'a rien produit (${result?.outcome}) → ${toRole}` };
      }
    }

    if (attemptsLeft) return { action: "correct", rationale: "vérification échouée : correction" };
    return { action: "abandon", rationale: "tentatives de correction épuisées" };
  }
}
