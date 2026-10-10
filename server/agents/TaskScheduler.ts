/**
 * TaskScheduler — Gère l'orchestration multi-agents avec dépendances
 *
 * Responsabilité unique : exécuter un plan d'orchestration en respectant
 * les dépendances entre tâches et la parallélisation.
 */
import type { AgentTask, OrchestrationPlan, TaskResult } from "./types.js";
import { getAgentDefinition } from "./roles.js";
import { ProgressNotifier } from "./ProgressNotifier.js";
import { createLogger } from "../utils/logger.js";
import type { AgentTaskRunner } from "./AgentTaskRunner.js";

const log = createLogger("TaskScheduler");

/** Rôle provisoire d'une tâche d'orchestration dont l'agent sera choisi par enchère. */
export const UNASSIGNED_ROLE = "unassigned";

/**
 * Moteur d'exécution d'une tâche. Implémenté par `AgentExecutor` (legacy) et
 * par `AgentRuntimeExecutor` (runtime agentique). Le scheduler dépend de cette
 * interface partagée, pas d'une implémentation concrète.
 */
export type TaskRunner = AgentTaskRunner;

export class TaskScheduler {
  constructor(
    private executor: TaskRunner,
    private notifier?: ProgressNotifier
  ) {}

  /** Callback appelé quand une tâche d'orchestration a fini de s'exécuter (quel que soit son statut). */
  private onTaskSettled?: (task: AgentTask) => void;

  /** Remplace le moteur d'exécution (bascule vers le runtime agentique). */
  setRunner(runner: TaskRunner): void {
    this.executor = runner;
  }

  /**
   * Résolveur de rôle (contract-net) pour les tâches sans rôle (`unassigned`).
   * Appelé JUSTE AVANT le lancement de la tâche : charges et notes sont alors
   * fraîches et les résultats des dépendances déjà injectés. Il fixe `task.role`
   * et peut retourner une fonction de libération de réservation, appelée dès que
   * l'exécution a démarré.
   */
  private roleResolver?: (task: AgentTask) => Promise<(() => void) | void>;

  setRoleResolver(resolver: ((task: AgentTask) => Promise<(() => void) | void>) | undefined): void {
    this.roleResolver = resolver;
  }

  /**
   * Enregistre un observateur de fin de tâche (ex. mise à jour des notes par
   * rôle du contract-net). Une erreur de l'observateur n'interrompt jamais
   * l'orchestration.
   */
  setOnTaskSettled(callback: ((task: AgentTask) => void) | undefined): void {
    this.onTaskSettled = callback;
  }

  /**
   * Exécute un plan d'orchestration complet.
   * Les tâches sans dépendances s'exécutent en parallèle.
   * Gère le deadlock quand des dépendances échouent.
   */
  async execute(plan: OrchestrationPlan): Promise<void> {
    const orchShortId = plan.id.slice(0, 8);
    const startTime = Date.now();

    log.info(`▶ Orchestration "${plan.title}" (${orchShortId}) — ${plan.tasks.length} tâche(s)`);

    plan.status = "running";
    const completed = new Set<string>();
    const failed = new Set<string>();
    let iteration = 0;

    while (completed.size + failed.size < plan.tasks.length) {
      iteration++;
      log.debug(`[${orchShortId}] Itération ${iteration} — Terminées: ${completed.size} | Échouées: ${failed.size}`);

      // Trouver les tâches prêtes (dépendances satisfaites et pas encore démarrées)
      const ready = plan.tasks.filter((t) => {
        if (t.status !== "pending") return false;
        const deps = plan.dependencies[t.id] ?? [];
        return deps.every((depId) => completed.has(depId));
      });

      if (ready.length === 0) {
        const running = plan.tasks.filter((t) => t.status === "running");
        if (running.length === 0) {
          // Deadlock: tâches en attente dont les dépendances ont échoué
          log.warn(`[${orchShortId}] Deadlock détecté — tâches bloquées par dépendances échouées`);
          const blocked = plan.tasks.filter(t => t.status === "pending");
          for (const b of blocked) {
            const deps = plan.dependencies[b.id] ?? [];
            const failedDeps = deps.filter(d => failed.has(d));
            log.warn(`  Bloquée: "${b.title}" — attend: ${failedDeps.join(", ")}`);
            b.status = "incomplete";
            b.completedAt = new Date().toISOString();
            b.result = {
              success: false,
              outcome: "failed",
              summary: "Tâche bloquée par une dépendance non terminée",
              error: `Dépendances non satisfaites: ${deps.join(", ") || "inconnues"}`,
              durationMs: 0,
            };
            failed.add(b.id);
            this.notifier?.notify(b, "failed");
          }
          break;
        }
        // Attendre que les tâches en cours terminent
        await this.sleep(500);
        continue;
      }

      log.info(`[${orchShortId}] Lancement de ${ready.length} tâche(s) en parallèle`);

      // Lancer les tâches prêtes en parallèle
      const executions = ready.map(async (task) => {
        const taskShortId = task.id.slice(0, 8);

        // Attribution dynamique du rôle (contract-net) pour les tâches sans rôle.
        let releaseReservation: (() => void) | void = undefined;
        if (task.role === UNASSIGNED_ROLE) {
          // Injection des dépendances AVANT l'enchère : la description reste celle de la tâche,
          // mais le résolveur peut s'appuyer sur `task.context.previousResults`.
          const earlyDeps = plan.dependencies[task.id] ?? [];
          const early = earlyDeps
            .map((depId) => plan.tasks.find((t) => t.id === depId)?.result)
            .filter(Boolean) as TaskResult[];
          if (early.length > 0) task.context.previousResults = early;

          try {
            if (!this.roleResolver) throw new Error("aucun résolveur de rôle configuré");
            releaseReservation = await this.roleResolver(task);
          } catch (err) {
            log.error(`[${orchShortId}] [task:${taskShortId}] Attribution du rôle impossible: ${(err as Error).message}`);
            task.status = "failed";
            task.completedAt = new Date().toISOString();
            task.result = {
              success: false,
              outcome: "failed",
              summary: "Aucun agent n'a pu être attribué à la tâche",
              error: (err as Error).message,
              durationMs: 0,
            };
            failed.add(task.id);
            this.notifier?.notify(task, "failed");
            return;
          }
        }

        const agentName = getAgentDefinition(task.role)?.name ?? task.role;
        // Injecter les résultats des dépendances dans le contexte
        const deps = plan.dependencies[task.id] ?? [];
        const previousResults: TaskResult[] = deps
          .map((depId) => plan.tasks.find((t) => t.id === depId)?.result)
          .filter(Boolean) as TaskResult[];

        if (previousResults.length > 0) {
          task.context.previousResults = previousResults;
          log.debug(`[${orchShortId}] [task:${taskShortId}] [${agentName}] Contexte injecté: ${previousResults.length} résultat(s) de dépendance(s)`);
        }

        log.info(`[${orchShortId}] [task:${taskShortId}] ➤ [${agentName}] Lancement: "${task.title}" | Dépendances satisfaites: ${deps.length > 0 ? deps.map(d => d.slice(0, 8)).join(", ") : "aucune"}`);
        const taskStart = Date.now();
        const execution = this.executor.execute(task);
        // `execute` a pris sa place de façon synchrone : la réservation n'est plus utile.
        try {
          releaseReservation?.();
        } catch {
          /* best-effort */
        }
        await execution;
        const taskMs = Date.now() - taskStart;
        try {
          this.onTaskSettled?.(task);
        } catch (err) {
          log.warn(`[${orchShortId}] onTaskSettled en erreur: ${(err as Error).message}`);
        }

        if (task.status === "completed") {
          completed.add(task.id);
          log.info(`[${orchShortId}] [task:${taskShortId}] ✅ [${agentName}] Terminé en ${(taskMs / 1000).toFixed(1)}s | Progression: ${completed.size + failed.size}/${plan.tasks.length}`);
        } else {
          failed.add(task.id);
          log.warn(`[${orchShortId}] [task:${taskShortId}] ❌ [${agentName}] Échoué en ${(taskMs / 1000).toFixed(1)}s — ${task.result?.error ?? "raison inconnue"} | Progression: ${completed.size + failed.size}/${plan.tasks.length}`);
        }
      });

      await Promise.allSettled(executions);

      // (Audit §7) Marquer immédiatement les tâches dont toutes les dépendances
      // incluent une tâche échouée, plutôt que d'attendre le deadlock.
      for (const task of plan.tasks) {
        if (task.status !== "pending") continue;
        const deps = plan.dependencies[task.id] ?? [];
        const hasFailedDep = deps.some((depId) => failed.has(depId));
        if (hasFailedDep) {
          task.status = "incomplete";
          task.completedAt = new Date().toISOString();
          task.result = {
            success: false,
            outcome: "failed",
            summary: "Tâche annulée : dépendance échouée",
            error: `Dépendance(s) échouée(s): ${deps.filter(d => failed.has(d)).join(", ")}`,
            durationMs: 0,
          };
          failed.add(task.id);
          this.notifier?.notify(task, "failed");
          log.warn(`[${orchShortId}] Tâche "${task.title}" annulée (dépendance échouée)`);
        }
      }
    }

    // Une orchestration n'est terminée avec succès que si chaque tâche porte un
    // résultat vérifié. Les exécutions partielles/incomplètes restent visibles.
    const totalDuration = Date.now() - startTime;
    if (completed.size === plan.tasks.length) {
      plan.status = "completed";
    } else if (completed.size > 0) {
      plan.status = "incomplete";
    } else {
      plan.status = "failed";
    }
    plan.completedAt = new Date().toISOString();

    const emoji = plan.status === "completed" ? "✅" : "❌";
    log.info(`${emoji} Orchestration "${plan.title}" terminée en ${(totalDuration / 1000).toFixed(1)}s — ${completed.size}/${plan.tasks.length} vérifiée(s), ${failed.size} incomplète(s)/échouée(s)`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
