/**
 * DecisionEngine — Cerveau décisionnel de l'Autonomous Core V2
 *
 * Reçoit les PerceptionEvents et les croise avec les objectifs actifs
 * pour décider si une mission doit être lancée.
 *
 * Logique :
 *   PerceptionEvent × Goal → analyse de pertinence → DecisionProposal
 *
 * Filtres :
 *   - Niveau d'autonomie
 *   - Cooldown entre missions d'un même objectif
 *   - Nombre de missions simultanées
 *   - Score de confiance minimum
 *
 * Le DecisionEngine ne lance pas les missions — il produit des proposals
 * que le MissionManager exécute.
 */

import { randomUUID } from "crypto";
import { createLogger } from "../utils/logger.js";
import type { PerceptionEvent, Goal, DecisionProposal, DecisionAction } from "./types.js";
import type { AgentRole, TaskPriority } from "../agents/types.js";
import { autonomyController } from "./AutonomyController.js";

const log = createLogger("DecisionEngine");

// ─── Configuration ────────────────────────────────────────────────────────────

/** Cooldown minimal entre deux missions du même objectif (ms) */
const DEFAULT_MISSION_COOLDOWN_MS = 5 * 60 * 1000; // 5 min

/** Score de confiance minimal pour créer une mission */
const MIN_CONFIDENCE = 0.35;

// Mapping événement → pertinence par type de check d'objectif
const EVENT_CHECK_RELEVANCE: Record<string, string[]> = {
  "workspace.file_changed": ["typescript", "tests", "architecture", "tech_debt"],
  "workspace.file_created": ["typescript", "tests", "architecture", "documentation"],
  "workspace.file_deleted": ["typescript", "tests", "architecture"],
  "workspace.batch_changed": ["typescript", "tests", "security", "architecture"],
  "dependency.changed": ["security", "dependencies", "tests"],
  "scheduler.tick": ["typescript", "tests", "security", "dependencies", "git_status", "tech_debt"],
  "build.failed": ["typescript", "tests"],
  "test.failed": ["tests"],
  "security.alert": ["security"],
  "mission.completed": [],
  "mission.failed": [],
};

// Mapping check type → agents recommandés
const CHECK_AGENTS: Record<string, AgentRole[]> = {
  typescript: ["debugger", "coder"],
  tests: ["tester", "debugger"],
  security: ["security", "reviewer"],
  dependencies: ["researcher", "coder"],
  git_status: ["coder"],
  architecture: ["architect", "reviewer"],
  tech_debt: ["refactor", "coder"],
  documentation: ["writer"],
  custom: ["planner", "coder"],
};

// ═══════════════════════════════════════════════════════════════════════════════
// DECISION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

export type ProposalHandler = (proposal: DecisionProposal) => void | Promise<void>;

export class DecisionEngine {
  private proposalHandlers: Set<ProposalHandler> = new Set();

  /** Timestamp de la dernière décision par goalId */
  private lastDecisionAt: Map<string, number> = new Map();

  /** Nombre de missions actives par goalId */
  private activeMissionCount: Map<string, number> = new Map();

  // ─── Abonnement ────────────────────────────────────────────────────────────

  /**
   * Enregistre un handler appelé pour chaque DecisionProposal produite.
   */
  onProposal(handler: ProposalHandler): () => void {
    this.proposalHandlers.add(handler);
    return () => this.proposalHandlers.delete(handler);
  }

  // ─── Point d'entrée principal ─────────────────────────────────────────────

  /**
   * Évalue un PerceptionEvent contre la liste des objectifs actifs.
   * Pour chaque objectif concerné, produit un DecisionProposal si pertinent.
   */
  async decide(event: PerceptionEvent, goals: Goal[]): Promise<DecisionProposal[]> {
    if (goals.length === 0) return [];

    const proposals: DecisionProposal[] = [];

    for (const goal of goals) {
      const proposal = this._evaluateGoal(event, goal);
      if (proposal && proposal.action === "create_mission") {
        proposals.push(proposal);
        this._dispatch(proposal);
      }
    }

    if (proposals.length > 0) {
      log.info(
        `🧠 Décision: ${proposals.length} mission(s) proposée(s) pour event "${event.type}"`
      );
    }

    return proposals;
  }

  // ─── Méthodes de gestion du contexte ────────────────────────────────────

  /**
   * Signale qu'une mission a démarré pour un objectif.
   */
  missionStarted(goalId: string): void {
    const current = this.activeMissionCount.get(goalId) ?? 0;
    this.activeMissionCount.set(goalId, current + 1);
    this.lastDecisionAt.set(goalId, Date.now());
  }

  /**
   * Signale qu'une mission s'est terminée pour un objectif.
   */
  missionFinished(goalId: string): void {
    const current = this.activeMissionCount.get(goalId) ?? 0;
    this.activeMissionCount.set(goalId, Math.max(0, current - 1));
  }

  // ─── Logique d'évaluation ────────────────────────────────────────────────

  private _evaluateGoal(event: PerceptionEvent, goal: Goal): DecisionProposal | null {
    // 1. Vérifier si l'objectif est concerné par cet événement
    const relevanceScore = this._computeRelevance(event, goal);
    if (relevanceScore < MIN_CONFIDENCE) return null;

    // 2. Vérifier le niveau d'autonomie
    const maxLevel = goal.constraints.maxAutonomyLevel ?? 6;
    if (!autonomyController.meetsLevel(maxLevel)) {
      log.debug(
        `Goal "${goal.title}" bloqué par niveau d'autonomie ` +
          `(requis ≤ ${maxLevel}, courant: ${autonomyController.getLevel()})`
      );
      return null;
    }

    // 3. Vérifier le cooldown entre missions
    const lastDecision = this.lastDecisionAt.get(goal.id) ?? 0;
    const cooldown = DEFAULT_MISSION_COOLDOWN_MS;
    if (Date.now() - lastDecision < cooldown) {
      log.debug(`Goal "${goal.title}" en cooldown (${Math.round((cooldown - (Date.now() - lastDecision)) / 1000)}s restant)`);
      return null;
    }

    // 4. Vérifier le nombre de missions simultanées
    const activeCount = this.activeMissionCount.get(goal.id) ?? 0;
    const maxConcurrent = goal.constraints.maxConcurrentMissions ?? 2;
    if (activeCount >= maxConcurrent) {
      log.debug(`Goal "${goal.title}" : ${activeCount}/${maxConcurrent} missions actives — attente`);
      return null;
    }

    // 5. Déterminer les agents et construire la proposition
    const { agents, priority, title, description } = this._buildMissionSpec(event, goal, relevanceScore);
    const requiredLevel = this._computeRequiredLevel(goal, event);

    if (!autonomyController.meetsLevel(requiredLevel)) {
      log.debug(`Goal "${goal.title}" : niveau requis ${requiredLevel} non satisfait`);
      return null;
    }

    const proposal: DecisionProposal = {
      id: randomUUID(),
      triggerEventId: event.id,
      goalId: goal.id,
      action: "create_mission" as DecisionAction,
      priority,
      missionTitle: title,
      missionDescription: description,
      recommendedAgents: agents,
      files: event.files ?? [],
      confidence: relevanceScore,
      reason: this._buildReason(event, goal, relevanceScore),
      requiredAutonomyLevel: requiredLevel,
      createdAt: new Date().toISOString(),
    };

    return proposal;
  }

  private _computeRelevance(event: PerceptionEvent, goal: Goal): number {
    const relevantCheckTypes = EVENT_CHECK_RELEVANCE[event.type] ?? [];
    if (relevantCheckTypes.length === 0) {
      // Événements de mission → pas de mission auto
      return 0;
    }

    const goalCheckTypes = goal.checks.map((c) => c.type);
    if (goalCheckTypes.length === 0) {
      // Objectif sans checks → basse pertinence
      return 0.3;
    }

    // Intersection entre checks de l'objectif et checks pertinents pour cet événement
    const intersection = goalCheckTypes.filter((t) => relevantCheckTypes.includes(t));
    const relevance = intersection.length / goalCheckTypes.length;

    // Bonus pour événements de tick (périodique) : pertinence uniforme plus basse
    if (event.type === "scheduler.tick") {
      return Math.min(0.4, relevance * 0.6);
    }

    // Bonus pour events à haut risque
    const riskBonus = (event.riskScore ?? 0) * 0.2;
    return Math.min(1, relevance * 0.7 + riskBonus + 0.1);
  }

  private _buildMissionSpec(
    event: PerceptionEvent,
    goal: Goal,
    confidence: number
  ): {
    agents: AgentRole[];
    priority: TaskPriority;
    title: string;
    description: string;
  } {
    const relevantCheckTypes = EVENT_CHECK_RELEVANCE[event.type] ?? [];
    const goalCheckTypes = goal.checks.map((c) => c.type);
    const activeChecks = goalCheckTypes.filter((t) => relevantCheckTypes.includes(t));

    // Agents recommandés basés sur les checks actifs
    const agentSet = new Set<AgentRole>();
    for (const checkType of activeChecks.slice(0, 3)) {
      const agents = CHECK_AGENTS[checkType] ?? [];
      agents.slice(0, 2).forEach((a) => agentSet.add(a));
    }

    // Toujours inclure reviewer si plusieurs agents
    if (agentSet.size > 1) agentSet.add("reviewer");

    const agents: AgentRole[] = Array.from(agentSet).slice(0, 3);
    if (agents.length === 0) agents.push("coder");

    // Priorité selon confiance et priorité de l'objectif
    let priority: TaskPriority = "low";
    if (confidence > 0.8 || goal.priority === "critical") priority = "high";
    else if (confidence > 0.6 || goal.priority === "high") priority = "medium";
    else if (event.type === "dependency.changed" || event.type === "build.failed") priority = "medium";

    // Titre et description
    const eventLabel = this._humanizeEventType(event.type);
    const filesLabel =
      event.files && event.files.length > 0
        ? ` (${event.files.slice(0, 2).join(", ")}${event.files.length > 2 ? "…" : ""})`
        : "";
    const checkLabel = activeChecks.slice(0, 2).join(", ") || "vérification générale";

    const title = `[${goal.title}] ${eventLabel}${filesLabel}`;
    const description =
      `Objectif: "${goal.title}"\n` +
      `Déclencheur: ${eventLabel}${filesLabel}\n` +
      `Checks concernés: ${checkLabel}\n` +
      `Critères de succès:\n${goal.successCriteria.map((c) => `  - ${c}`).join("\n") || "  - Aucun défini"}\n` +
      `Contraintes: ${goal.constraints.noBreakingChanges ? "pas de breaking changes, " : ""}` +
      `${goal.constraints.requireTests ? "tests requis, " : ""}` +
      `${goal.constraints.requireTypeCheck ? "TypeScript valide" : ""}`;

    return { agents, priority, title, description };
  }

  private _computeRequiredLevel(goal: Goal, event: PerceptionEvent): import("./types.js").AutonomyLevel {
    // Événements de tick → lecture + analyse seulement
    if (event.type === "scheduler.tick") return 3;

    // Changements de fichiers → sandbox (L4) minimum
    if (
      event.type.startsWith("workspace.") ||
      event.type === "build.failed" ||
      event.type === "test.failed"
    ) {
      return goal.constraints.requireTests ? 5 : 4;
    }

    // Dépendances → analyse + tests
    if (event.type === "dependency.changed") return 5;

    // Sécurité → analyse seulement
    if (event.type === "security.alert") return 3;

    return 4;
  }

  private _buildReason(event: PerceptionEvent, goal: Goal, relevance: number): string {
    const relevantChecks = EVENT_CHECK_RELEVANCE[event.type] ?? [];
    const concernedChecks = goal.checks
      .filter((c) => relevantChecks.includes(c.type))
      .map((c) => c.label ?? c.type)
      .join(", ");

    return (
      `Événement "${event.type}" pertinent pour l'objectif "${goal.title}" ` +
      `(confiance: ${(relevance * 100).toFixed(0)}%). ` +
      (concernedChecks ? `Checks concernés: ${concernedChecks}.` : "")
    );
  }

  private _humanizeEventType(type: string): string {
    const labels: Record<string, string> = {
      "workspace.file_changed": "Fichier modifié",
      "workspace.file_created": "Fichier créé",
      "workspace.file_deleted": "Fichier supprimé",
      "workspace.batch_changed": "Batch de fichiers modifiés",
      "dependency.changed": "Dépendance modifiée",
      "scheduler.tick": "Vérification périodique",
      "build.failed": "Build échoué",
      "test.failed": "Tests échoués",
      "security.alert": "Alerte sécurité",
    };
    return labels[type] ?? type;
  }

  // ─── Dispatch ────────────────────────────────────────────────────────────

  private _dispatch(proposal: DecisionProposal): void {
    for (const handler of this.proposalHandlers) {
      try {
        const result = handler(proposal);
        if (result instanceof Promise) {
          result.catch((err) => {
            log.error(`Handler DecisionProposal a échoué: ${err.message}`);
          });
        }
      } catch (err) {
        log.error(`Handler DecisionProposal synchrone a échoué: ${(err as Error).message}`);
      }
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

/** Instance singleton partagée du DecisionEngine. */
export const decisionEngine = new DecisionEngine();
