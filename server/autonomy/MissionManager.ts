/**
 * MissionManager — Exécution et suivi des missions autonomes
 *
 * Reçoit les DecisionProposals du DecisionEngine et les convertit
 * en tâches AgentOrchestrator. Suit le cycle de vie de chaque mission
 * et notifie le ReflectionEngine à la complétion.
 *
 * Responsabilités :
 *   - Valider le niveau d'autonomie avant exécution
 *   - Déléguer à AgentOrchestrator (delegateTask ou orchestrate)
 *   - Persister l'état des missions (mémoire + Supabase optionnel)
 *   - Émettre des événements WebSocket vers le frontend
 *   - Notifier le DecisionEngine (compteur de missions actives)
 */

import { randomUUID } from "crypto";
import { createLogger } from "../utils/logger.js";
import { agentOrchestrator } from "../agents/AgentOrchestrator.js";
import { autonomyController } from "./AutonomyController.js";
import type { DecisionProposal, Mission, MissionStatus } from "./types.js";
import type { AgentRole, TaskResult } from "../agents/types.js";

const log = createLogger("MissionManager");

// ─── Configuration ────────────────────────────────────────────────────────────

/** Nombre maximal de missions simultanées toutes cibles confondues */
const GLOBAL_MAX_CONCURRENT = 5;

/** Durée de rétention des missions terminées en mémoire (ms) */
const MISSION_RETENTION_MS = 24 * 60 * 60 * 1000; // 24h

// ═══════════════════════════════════════════════════════════════════════════════
// MISSION MANAGER
// ═══════════════════════════════════════════════════════════════════════════════

export type MissionCompletionHandler = (mission: Mission) => void | Promise<void>;
export type MissionEventBroadcaster = (event: object) => void;

export class MissionManager {
  /** Toutes les missions connues (actives + terminées récentes) */
  private missions: Map<string, Mission> = new Map();

  /** Handlers de complétion (ReflectionEngine, etc.) */
  private completionHandlers: Set<MissionCompletionHandler> = new Set();

  /** Broadcaster WebSocket optionnel */
  private broadcaster: MissionEventBroadcaster | null = null;

  /** Callbacks pour notifier le DecisionEngine des changements de compteurs */
  private onMissionStarted: ((goalId: string) => void) | null = null;
  private onMissionFinished: ((goalId: string) => void) | null = null;

  // ─── Configuration ────────────────────────────────────────────────────────

  /**
   * Configure le broadcaster WebSocket pour le frontend.
   */
  setBroadcaster(broadcaster: MissionEventBroadcaster): void {
    this.broadcaster = broadcaster;
  }

  /**
   * Configure les callbacks du DecisionEngine pour le suivi des compteurs.
   */
  setDecisionEngineCallbacks(
    onStarted: (goalId: string) => void,
    onFinished: (goalId: string) => void
  ): void {
    this.onMissionStarted = onStarted;
    this.onMissionFinished = onFinished;
  }

  /**
   * Enregistre un handler appelé quand une mission se termine.
   */
  onCompletion(handler: MissionCompletionHandler): () => void {
    this.completionHandlers.add(handler);
    return () => this.completionHandlers.delete(handler);
  }

  // ─── Exécution ────────────────────────────────────────────────────────────

  /**
   * Exécute une DecisionProposal en créant et lançant une Mission.
   * Retourne la mission créée (l'exécution est asynchrone).
   */
  async execute(proposal: DecisionProposal): Promise<Mission | null> {
    // 1. Vérifier le niveau d'autonomie global
    if (!autonomyController.meetsLevel(proposal.requiredAutonomyLevel)) {
      log.warn(
        `Mission refusée: niveau ${proposal.requiredAutonomyLevel} requis, ` +
          `courant: ${autonomyController.getLevel()}`
      );
      return null;
    }

    // 2. Vérifier la capacité globale
    const activeMissions = this.getActiveMissions();
    if (activeMissions.length >= GLOBAL_MAX_CONCURRENT) {
      log.warn(
        `Mission refusée: capacité globale atteinte ` +
          `(${activeMissions.length}/${GLOBAL_MAX_CONCURRENT} actives)`
      );
      return null;
    }

    // 3. Créer la mission
    const mission: Mission = {
      id: randomUUID(),
      goalId: proposal.goalId,
      title: proposal.missionTitle,
      description: proposal.missionDescription,
      status: "pending",
      priority: proposal.priority,
      agents: proposal.recommendedAgents,
      files: proposal.files,
      proposalId: proposal.id,
      createdAt: new Date().toISOString(),
    };

    this.missions.set(mission.id, mission);
    this._broadcast("mission_created", mission);
    log.info(`🚀 Mission créée: "${mission.title}" [${mission.priority}]`);

    // 4. Notifier le DecisionEngine
    this.onMissionStarted?.(proposal.goalId);

    // 5. Lancer l'exécution en arrière-plan
    this._run(mission, proposal).catch((err) => {
      log.error(`Mission "${mission.title}" a planté: ${err.message}`);
      this._setStatus(mission, "failed");
    });

    return mission;
  }

  /**
   * Annule une mission en cours.
   */
  cancel(missionId: string): boolean {
    const mission = this.missions.get(missionId);
    if (!mission || mission.status === "completed" || mission.status === "failed") {
      return false;
    }
    this._setStatus(mission, "cancelled");
    this.onMissionFinished?.(mission.goalId);
    return true;
  }

  // ─── Requêtes ─────────────────────────────────────────────────────────────

  getMission(id: string): Mission | undefined {
    return this.missions.get(id);
  }

  getActiveMissions(): Mission[] {
    return Array.from(this.missions.values()).filter(
      (m) => m.status === "pending" || m.status === "running" || m.status === "verifying"
    );
  }

  getMissionsForGoal(goalId: string): Mission[] {
    return Array.from(this.missions.values())
      .filter((m) => m.goalId === goalId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  listMissions(limit = 20): Mission[] {
    return Array.from(this.missions.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  getStats(): {
    total: number;
    active: number;
    completed: number;
    failed: number;
    cancelled: number;
  } {
    const all = Array.from(this.missions.values());
    return {
      total: all.length,
      active: all.filter((m) => ["pending", "running", "verifying"].includes(m.status)).length,
      completed: all.filter((m) => m.status === "completed").length,
      failed: all.filter((m) => m.status === "failed").length,
      cancelled: all.filter((m) => m.status === "cancelled").length,
    };
  }

  // ─── Maintenance ──────────────────────────────────────────────────────────

  /**
   * Supprime les missions terminées trop anciennes.
   */
  pruneOldMissions(): number {
    const cutoff = Date.now() - MISSION_RETENTION_MS;
    let pruned = 0;

    for (const [id, mission] of this.missions) {
      const isTerminal = ["completed", "failed", "cancelled"].includes(mission.status);
      if (isTerminal && mission.completedAt) {
        const completedMs = new Date(mission.completedAt).getTime();
        if (completedMs < cutoff) {
          this.missions.delete(id);
          pruned++;
        }
      }
    }

    if (pruned > 0) {
      log.debug(`🗑️ ${pruned} mission(s) anciennes supprimées`);
    }
    return pruned;
  }

  // ─── Exécution interne ────────────────────────────────────────────────────

  private async _run(mission: Mission, proposal: DecisionProposal): Promise<void> {
    this._setStatus(mission, "running");
    mission.startedAt = new Date().toISOString();
    const runStart = Date.now();

    try {
      // Choisir la stratégie d'exécution selon le nombre d'agents
      let result: TaskResult;

      if (proposal.recommendedAgents.length <= 1) {
        // Agent unique — délégation directe
        const primaryAgent: AgentRole = proposal.recommendedAgents[0] ?? "coder";
        const agentTask = await agentOrchestrator.delegateTask({
          role: primaryAgent,
          title: mission.title,
          description: mission.description,
          files: mission.files,
          priority: mission.priority,
        });

        // Attendre la completion en polling (AgentOrchestrator est async)
        result = await this._waitForTask(agentTask.id);
      } else {
        // Multi-agents — orchestration avec dépendances
        const orchestration = await agentOrchestrator.orchestrate({
          title: mission.title,
          description: mission.description,
          tasks: this._buildOrchestrationTasks(proposal),
        });

        // Attendre les résultats de l'orchestration
        result = await this._waitForOrchestration(orchestration.id);
      }

      mission.result = result;
      mission.durationMs = Date.now() - runStart;
      mission.completedAt = new Date().toISOString();

      const success = result.success;
      this._setStatus(mission, success ? "completed" : "failed");

      log.info(
        `${success ? "✅" : "❌"} Mission "${mission.title}" ` +
          `${success ? "complétée" : "échouée"} en ${(mission.durationMs / 1000).toFixed(1)}s`
      );
    } catch (err) {
      mission.durationMs = Date.now() - runStart;
      mission.completedAt = new Date().toISOString();
      mission.result = {
        success: false,
        outcome: "failed",
        summary: `Exception: ${(err as Error).message}`,
        error: (err as Error).message,
        durationMs: mission.durationMs,
      };
      this._setStatus(mission, "failed");
      log.error(`Mission "${mission.title}" exception: ${(err as Error).message}`);
    } finally {
      // Notifier le DecisionEngine de la fin
      this.onMissionFinished?.(mission.goalId);
      // Notifier les handlers de complétion (ReflectionEngine)
      this._notifyCompletion(mission);
    }
  }

  /**
   * Construit les tâches d'orchestration depuis la proposal.
   * Pattern séquentiel simple : coder → tester → reviewer
   */
  private _buildOrchestrationTasks(proposal: DecisionProposal): Array<{
    id?: string;
    role: AgentRole;
    title: string;
    description: string;
    files?: string[];
    priority?: import("../agents/types.js").TaskPriority;
    dependsOn?: string[];
  }> {
    const agents = proposal.recommendedAgents;
    const tasks: Array<{
      id: string;
      role: AgentRole;
      title: string;
      description: string;
      files?: string[];
      priority?: import("../agents/types.js").TaskPriority;
      dependsOn?: string[];
    }> = [];

    for (let i = 0; i < agents.length; i++) {
      const role = agents[i];
      const isFirst = i === 0;
      tasks.push({
        id: `step-${i + 1}`,
        role,
        title: `[${i + 1}/${agents.length}] ${this._agentLabel(role)}: ${proposal.missionTitle}`,
        description:
          proposal.missionDescription +
          (isFirst ? "" : `\n\nContext: suite des étapes précédentes.`),
        files: proposal.files,
        priority: proposal.priority,
        dependsOn: isFirst ? [] : [`step-${i}`],
      });
    }

    return tasks;
  }

  private _agentLabel(role: AgentRole): string {
    const labels: Record<string, string> = {
      coder: "Implémentation",
      tester: "Tests",
      reviewer: "Revue",
      security: "Audit sécurité",
      debugger: "Débogage",
      refactor: "Refactoring",
      architect: "Architecture",
      researcher: "Recherche",
      writer: "Documentation",
    };
    return labels[role] ?? role;
  }

  /**
   * Attend la complétion d'une tâche AgentOrchestrator par polling.
   * Timeout de 10 minutes.
   */
  private async _waitForTask(taskId: string): Promise<TaskResult> {
    const timeout = 10 * 60 * 1000;
    const pollInterval = 2_000;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      await new Promise((r) => setTimeout(r, pollInterval));

      const task = agentOrchestrator.getTask(taskId);
      if (!task) {
        return {
          success: false,
          outcome: "failed",
          summary: "Tâche introuvable",
          error: `Task ${taskId} not found`,
          durationMs: Date.now() - start,
        };
      }

      if (task.status === "completed") {
        return task.result ?? {
          success: true,
          outcome: "success",
          summary: task.title,
          durationMs: Date.now() - start,
        };
      }

      if (task.status === "failed" || task.status === "cancelled") {
        return task.result ?? {
          success: false,
          outcome: "failed" as const,
          summary: `Tâche ${task.status}`,
          error: String(task.status),
          durationMs: Date.now() - start,
        };
      }
    }

    return {
      success: false,
      outcome: "failed",
      summary: "Timeout — mission trop longue",
      error: "Mission timeout after 10 minutes",
      durationMs: timeout,
    };
  }

  /**
   * Attend la complétion d'une orchestration multi-agents.
   */
  private async _waitForOrchestration(orchestrationId: string): Promise<TaskResult> {
    const timeout = 20 * 60 * 1000;
    const pollInterval = 3_000;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      await new Promise((r) => setTimeout(r, pollInterval));

      const orch = agentOrchestrator.getOrchestration(orchestrationId);
      if (!orch) {
        return {
          success: false,
          outcome: "failed",
          summary: "Orchestration introuvable",
          error: `Orchestration ${orchestrationId} not found`,
          durationMs: Date.now() - start,
        };
      }

      if (orch.status === "completed") {
        const allTasks = orch.tasks;
        const allSuccess = allTasks.every((t) => t.status === "completed");
        const filesModified = allTasks.flatMap((t) => t.result?.filesModified ?? []);
        return {
          success: allSuccess,
          outcome: allSuccess ? "success" : "partial",
          summary: `Orchestration "${orch.title}" — ${allTasks.filter((t) => t.status === "completed").length}/${allTasks.length} tâches complétées`,
          filesModified: [...new Set(filesModified)],
          durationMs: Date.now() - start,
        };
      }

      if (orch.status === "failed") {
        return {
          success: false,
          outcome: "failed",
          summary: `Orchestration "${orch.title}" échouée`,
          error: "One or more tasks failed",
          durationMs: Date.now() - start,
        };
      }
    }

    return {
      success: false,
      outcome: "failed",
      summary: "Timeout orchestration",
      error: "Orchestration timeout after 20 minutes",
      durationMs: timeout,
    };
  }

  // ─── Helpers internes ─────────────────────────────────────────────────────

  private _setStatus(mission: Mission, status: MissionStatus): void {
    mission.status = status;
    this._broadcast("mission_status_changed", { missionId: mission.id, status, title: mission.title });
    log.debug(`Mission "${mission.title}" → ${status}`);
  }

  private _broadcast(event: string, data: object): void {
    if (!this.broadcaster) return;
    try {
      this.broadcaster({ type: "autonomous_core_event", event, ...data, timestamp: new Date().toISOString() });
    } catch {
      // Non bloquant
    }
  }

  private _notifyCompletion(mission: Mission): void {
    for (const handler of this.completionHandlers) {
      try {
        const result = handler(mission);
        if (result instanceof Promise) {
          result.catch((err) => log.error(`Handler complétion mission: ${err.message}`));
        }
      } catch (err) {
        log.error(`Handler complétion mission sync: ${(err as Error).message}`);
      }
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

/** Instance singleton partagée du MissionManager. */
export const missionManager = new MissionManager();
