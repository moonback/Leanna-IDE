import { randomUUID } from "crypto";
import { AGENT_REGISTRY, getAgentDefinition } from "./roles";
import type {
  AgentRole,
  AgentTask,
  TaskResult,
  TaskStatus,
  TaskPriority,
  OrchestrationPlan,
} from "./types";
import { AgentExecutor, SkillHandler } from "./AgentExecutor";
import { TaskScheduler } from "./TaskScheduler";
import { ProgressNotifier, ProgressCallback, EventBroadcaster, AgentEvent } from "./ProgressNotifier";
import { AgentRegistry, agentRegistry } from "./AgentRegistry";
import { agentMessageBus } from "./AgentMessageBus";
import { COLLABORATION_PATTERNS } from "./AgentCommunication";
import { agentPersistence } from "./AgentPersistence";
import { createLogger } from "../utils/logger";

// Ré-exporter pour compatibilité et usage externe
export type { AgentEvent } from "./ProgressNotifier";
export { agentMessageBus } from "./AgentMessageBus";
export { agentRegistry } from "./AgentRegistry";
export { COLLABORATION_PATTERNS, DELEGATION_MATRIX } from "./AgentCommunication";

const log = createLogger("Orchestrator");

// ═══════════════════════════════════════════════════════════════════════════════
// AgentOrchestrator — Façade allégée (délègue l'exécution aux composants)
// ═══════════════════════════════════════════════════════════════════════════════

export class AgentOrchestrator {
  private tasks: Map<string, AgentTask> = new Map();
  private orchestrations: Map<string, OrchestrationPlan> = new Map();

  // Composants spécialisés
  private notifier = new ProgressNotifier();
  private executor = new AgentExecutor(this.notifier);
  private scheduler = new TaskScheduler(this.executor);

  // Registry des agents autonomes (partagé via singleton)
  private registry: AgentRegistry = agentRegistry;

  // ─── Configuration ────────────────────────────────────────────────────────

  /**
   * Injecte le handler de skills pour que les agents puissent appeler des outils.
   * Initialise également le registre d'agents autonomes.
   */
  setSkillHandler(handler: SkillHandler): void {
    this.executor.setSkillHandler(handler);

    // Initialiser le registre d'agents autonomes si ce n'est pas encore fait
    if (!this.registry.isReady) {
      this.registry.initialize(handler);
      log.info("🤖 Flotte d'agents autonomes initialisée");
    }
  }

  /** Configure le callback de progression */
  setProgressCallback(callback: ProgressCallback): void {
    this.notifier.setProgressCallback(callback);
    this.registry.setProgressCallback(callback);
  }

  /** Configure le broadcaster d'événements temps réel vers le frontend */
  setEventBroadcaster(broadcaster: EventBroadcaster): void {
    this.notifier.setEventBroadcaster(broadcaster);
    this.registry.setEventBroadcaster(broadcaster);

    // Transmettre les événements du bus de messages au frontend
    agentMessageBus.on("message", (msg) => {
      try {
        broadcaster({
          type: "agent_event",
          event: "task_started",
          taskId: msg.id,
          role: msg.from,
          // Encode les infos de bus dans le title pour parsing côté frontend
          title: `[bus] ${msg.from}→${msg.to} ${msg.type}`,
          status: "running",
          agentName: getAgentDefinition(msg.from).name,
          // detail contient les infos de routage pour le composant fleet
          detail: `bus:${msg.type}:${msg.from}:${String(msg.to)}:${msg.metadata?.autonomous === true ? 'auto' : 'manual'}`,
          timestamp: msg.timestamp,
        });
      } catch {
        // Ne pas bloquer si le broadcast échoue
      }
    });
  }

  // ─── Délégation simple ────────────────────────────────────────────────────

  /**
   * Délègue une tâche à un agent spécialisé.
   * Retourne immédiatement avec l'ID de la tâche (exécution async).
   */
  async delegateTask(params: {
    role: AgentRole;
    title: string;
    description: string;
    files?: string[];
    instructions?: string;
    priority?: TaskPriority;
    timeoutMs?: number;
  }): Promise<AgentTask> {
    const agent = getAgentDefinition(params.role);
    const currentRunning = this.executor.getRunningCount(params.role);

    log.info(`📋 Délégation → ${agent.name}: "${params.title}" (priorité: ${params.priority ?? "medium"})`);

    if (currentRunning >= agent.maxConcurrency) {
      log.warn(`⚠️ Rejet — ${agent.name} à capacité maximale (${agent.maxConcurrency})`);
      throw new Error(
        `L'agent "${agent.name}" est à capacité maximale (${agent.maxConcurrency} tâche(s) simultanée(s)). Réessaie plus tard.`
      );
    }

    const task: AgentTask = {
      id: randomUUID(),
      role: params.role,
      title: params.title,
      description: params.description,
      priority: params.priority ?? "medium",
      status: "pending",
      context: {
        files: params.files ?? [],
        instructions: params.instructions,
      },
      createdAt: new Date().toISOString(),
      timeoutMs: params.timeoutMs ?? agent.defaultTimeoutMs,
    };

    this.tasks.set(task.id, task);
    log.debug(`Tâche créée: ${task.id.slice(0, 8)} — timeout: ${task.timeoutMs}ms`);

    // Persister immédiatement (statut pending)
    agentPersistence.saveTask(task).catch(() => {});

    // Lancer l'exécution en arrière-plan
    this.executor.execute(task).catch((err) => {
      log.error(`Erreur non gérée pour tâche ${task.id.slice(0, 8)}: ${err.message}`);
    });

    return task;
  }

  // ─── Orchestration multi-agents ───────────────────────────────────────────

  /**
   * Orchestre plusieurs tâches avec gestion des dépendances.
   * Les tâches sans dépendances s'exécutent en parallèle.
   */
  async orchestrate(params: {
    title: string;
    description: string;
    tasks: Array<{
      role: AgentRole;
      title: string;
      description: string;
      files?: string[];
      instructions?: string;
      priority?: TaskPriority;
      dependsOn?: string[];
    }>;
  }): Promise<OrchestrationPlan> {
    const orchestrationId = randomUUID();

    log.info(`🎯 Orchestration "${params.title}" — ${params.tasks.length} tâche(s), agents: ${[...new Set(params.tasks.map(t => t.role))].join(", ")}`);

    const agentTasks: AgentTask[] = [];
    const dependencies: Record<string, string[]> = {};

    // Première passe : les IDs doivent exister avant de pouvoir résoudre les dépendances.
    const taskIds = params.tasks.map(() => randomUUID());
    const idByTitle = new Map<string, string>();
    params.tasks.forEach((taskDef, index) => {
      idByTitle.set(taskDef.title, taskIds[index]);
    });

    // Seconde passe : créer les tâches et traduire les titres du même plan en IDs réels.
    for (let i = 0; i < params.tasks.length; i++) {
      const taskDef = params.tasks[i];
      const agent = getAgentDefinition(taskDef.role);
      const taskId = taskIds[i];

      const task: AgentTask = {
        id: taskId,
        orchestrationId,
        role: taskDef.role,
        title: taskDef.title,
        description: taskDef.description,
        priority: taskDef.priority ?? "medium",
        status: "pending",
        context: {
          files: taskDef.files ?? [],
          instructions: taskDef.instructions,
        },
        createdAt: new Date().toISOString(),
        timeoutMs: agent.defaultTimeoutMs,
      };

      agentTasks.push(task);
      this.tasks.set(task.id, task);
      dependencies[taskId] = (taskDef.dependsOn ?? []).map(
        (reference) => idByTitle.get(reference) ?? reference
      );
    }

    const plan: OrchestrationPlan = {
      id: orchestrationId,
      title: params.title,
      description: params.description,
      tasks: agentTasks,
      dependencies,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    this.orchestrations.set(orchestrationId, plan);
    log.info(`Plan d'orchestration créé (${orchestrationId.slice(0, 8)}). Lancement...`);

    // Persister le plan d'orchestration
    agentPersistence.saveOrchestration(plan).catch(() => {});

    // Lancer l'orchestration en arrière-plan
    this.scheduler.execute(plan).catch((err) => {
      log.error(`Erreur orchestration ${orchestrationId.slice(0, 8)}: ${err.message}`);
    });

    return plan;
  }

  // ─── Collaboration inter-agents ───────────────────────────────────────────

  /**
   * Lance une collaboration structurée entre agents selon un pattern prédéfini.
   * Ex: "refactor-with-safety", "security-audit-full", "new-feature-complete"
   *
   * @param patternName - Nom du pattern de collaboration (voir COLLABORATION_PATTERNS)
   * @param context - Contexte partagé pour tous les agents du pattern
   */
  async collaborateByPattern(params: {
    patternName: string;
    context: {
      title: string;
      description: string;
      files?: string[];
      instructions?: string;
    };
  }): Promise<OrchestrationPlan> {
    const pattern = COLLABORATION_PATTERNS.find((p) => p.name === params.patternName);
    if (!pattern) {
      throw new Error(
        `Pattern de collaboration "${params.patternName}" introuvable. Disponibles: ${COLLABORATION_PATTERNS.map((p) => p.name).join(", ")}`
      );
    }

    log.info(`🤝 Collaboration par pattern "${pattern.name}" — ${pattern.participants.length} agent(s): ${pattern.participants.join(", ")}`);

    // Transformer les étapes dépendantes en titres de tâches résolvables par orchestrate().
    const stepTitle = (stepNumber: number) => {
      const step = pattern.workflow.find((workflowStep) => workflowStep.step === stepNumber);
      return step ? `[${pattern.name}] Étape ${step.step}: ${step.action}` : undefined;
    };
    const tasks = pattern.workflow.map((step) => ({
      role: step.agent,
      title: `[${pattern.name}] Étape ${step.step}: ${step.action}`,
      description: `${params.context.description}\n\nÉtape ${step.step} du pattern "${pattern.name}": ${step.action}`,
      files: params.context.files,
      instructions: params.context.instructions,
      priority: "high" as TaskPriority,
      dependsOn: (step.dependsOn ?? []).map(stepTitle).filter((title): title is string => Boolean(title)),
    }));

    // Notifier le bus du démarrage de la collaboration
    await agentMessageBus.broadcast("architect", "collaboration_started", {
      pattern: pattern.name,
      participants: pattern.participants,
      title: params.context.title,
    }).catch(() => {});

    return this.orchestrate({
      title: `[${pattern.name}] ${params.context.title}`,
      description: pattern.description,
      tasks,
    });
  }

  /**
   * Retourne l'état de santé complet de la flotte d'agents autonomes.
   */
  getFleetStatus() {
    if (!this.registry.isReady) {
      return {
        initialized: false,
        message: "Le registre d'agents n'est pas encore initialisé (setSkillHandler() pas encore appelé)",
      };
    }
    return {
      initialized: true,
      ...this.registry.getFleetStatus(),
    };
  }

  /**
   * Délègue une tâche directement à un agent autonome via le bus de messages.
   * Contrairement à delegateTask(), cela passe par le AutonomousAgent complet
   * qui peut lui-même sous-déléguer à d'autres agents.
   */
  async delegateAutonomously(params: {
    role: AgentRole;
    title: string;
    description: string;
    files?: string[];
    instructions?: string;
    priority?: TaskPriority;
    timeoutMs?: number;
  }): Promise<AgentTask> {
    // Utiliser le chemin standard (crée la tâche et notifie via AgentExecutor)
    const task = await this.delegateTask(params);

    // Notifier le bus de messages que l'orchestrateur a délégué cette tâche
    await agentMessageBus
      .broadcast("architect", "task_delegated_by_orchestrator", {
        taskId: task.id,
        role: params.role,
        title: params.title,
      })
      .catch(() => {});

    return task;
  }

  // ─── Requêtes ─────────────────────────────────────────────────────────────

  /** Récupère une tâche par son ID */
  getTask(taskId: string): AgentTask | undefined {
    return this.tasks.get(taskId);
  }

  /** Liste les tâches avec filtres optionnels */
  listTasks(filters?: { role?: AgentRole; status?: TaskStatus; limit?: number }): AgentTask[] {
    let results = Array.from(this.tasks.values());

    if (filters?.role) {
      results = results.filter((t) => t.role === filters.role);
    }
    if (filters?.status) {
      results = results.filter((t) => t.status === filters.status);
    }

    // Tri par date de création décroissante
    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return results.slice(0, filters?.limit ?? 20);
  }

  /** Récupère un plan d'orchestration */
  getOrchestration(orchestrationId: string): OrchestrationPlan | undefined {
    return this.orchestrations.get(orchestrationId);
  }

  /** Liste les orchestrations */
  listOrchestrations(): OrchestrationPlan[] {
    return Array.from(this.orchestrations.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /** Annule une tâche en attente */
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== "pending") return false;
    task.status = "cancelled";
    agentPersistence.updateTaskStatus(taskId, "cancelled").catch(() => {});
    return true;
  }

  /**
   * Restaure les tâches et orchestrations depuis Supabase au redémarrage.
   * Les tâches "running" au moment du crash sont marquées "failed".
   * Les tâches "pending" sont rechargées en mémoire pour reprise éventuelle.
   */
  async restoreFromPersistence(): Promise<{ tasks: number; orchestrations: number }> {
    if (!agentPersistence.isAvailable) {
      log.debug("restoreFromPersistence: Supabase non disponible — skip");
      return { tasks: 0, orchestrations: 0 };
    }

    try {
      // Charger les tâches récentes en mémoire (sans les ré-exécuter)
      const recentTasks = await agentPersistence.loadRecentTasks(200);
      for (const task of recentTasks) {
        // Les tâches "running" au moment du crash → failed
        if (task.status === "running") {
          task.status = "failed";
          task.result = {
            success: false,
            summary: "Tâche interrompue par un redémarrage du serveur",
            error: "Server restart",
            durationMs: 0,
          };
          await agentPersistence.updateTaskStatus(
            task.id,
            "failed",
            task.result,
            task.startedAt,
            new Date().toISOString()
          );
        }
        this.tasks.set(task.id, task);
      }

      // Charger les orchestrations récentes
      const recentOrchs = await (agentPersistence as any).loadRecentOrchestrations(50);
      for (const row of recentOrchs) {
        if (!this.orchestrations.has(row.id)) {
          this.orchestrations.set(row.id, {
            id: row.id,
            title: row.title,
            description: row.description,
            status: row.status === "running" ? "failed" : row.status,
            tasks: [],            // Les tâches sont déjà en mémoire via loadRecentTasks
            dependencies: row.dependencies,
            createdAt: row.created_at,
            completedAt: row.completed_at ?? undefined,
          });
          // Marquer les orchestrations "running" comme failed
          if (row.status === "running") {
            await agentPersistence.updateOrchestrationStatus(row.id, "failed", new Date().toISOString());
          }
        }
      }

      log.info(
        `✅ Restauration depuis Supabase: ${recentTasks.length} tâche(s), ${recentOrchs.length} orchestration(s)`
      );
      return { tasks: recentTasks.length, orchestrations: recentOrchs.length };
    } catch (err) {
      log.error(`restoreFromPersistence: ${(err as Error).message}`);
      return { tasks: 0, orchestrations: 0 };
    }
  }

  /** Retourne les statistiques globales des agents */
  getStats(): {
    totalTasks: number;
    byStatus: Record<TaskStatus, number>;
    byRole: Record<AgentRole, number>;
    activeOrchestrations: number;
  } {
    const allTasks = Array.from(this.tasks.values());
    const byStatus: Record<TaskStatus, number> = {
      pending: 0, running: 0, completed: 0, failed: 0, cancelled: 0,
    };
    const byRole: Record<AgentRole, number> = {
      coder: 0, test: 0, docs: 0, refactor: 0, security: 0, review: 0, architect: 0,
    };

    for (const task of allTasks) {
      byStatus[task.status]++;
      byRole[task.role]++;
    }

    const activeOrchestrations = Array.from(this.orchestrations.values())
      .filter((o) => o.status === "running" || o.status === "pending").length;

    return { totalTasks: allTasks.length, byStatus, byRole, activeOrchestrations };
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const agentOrchestrator = new AgentOrchestrator();
