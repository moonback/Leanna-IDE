/**
 * TaskScheduler — Gère l'orchestration multi-agents avec dépendances
 *
 * Responsabilité unique : exécuter un plan d'orchestration en respectant
 * les dépendances entre tâches et la parallélisation.
 */
import type { AgentTask, OrchestrationPlan, TaskResult } from "./types.js";
import { getAgentDefinition } from "./roles.js";
import { AgentExecutor } from "./AgentExecutor.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("TaskScheduler");

export class TaskScheduler {
  constructor(private executor: AgentExecutor) {}

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
              summary: "Tâche bloquée par une dépendance non terminée",
              error: `Dépendances non satisfaites: ${deps.join(", ") || "inconnues"}`,
              durationMs: 0,
            };
            failed.add(b.id);
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
        // Injecter les résultats des dépendances dans le contexte
        const deps = plan.dependencies[task.id] ?? [];
        const previousResults: TaskResult[] = deps
          .map((depId) => plan.tasks.find((t) => t.id === depId)?.result)
          .filter(Boolean) as TaskResult[];

        if (previousResults.length > 0) {
          task.context.previousResults = previousResults;
        }

        await this.executor.execute(task);

        if (task.status === "completed") {
          completed.add(task.id);
        } else {
          failed.add(task.id);
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
            summary: "Tâche annulée : dépendance échouée",
            error: `Dépendance(s) échouée(s): ${deps.filter(d => failed.has(d)).join(", ")}`,
            durationMs: 0,
          };
          failed.add(task.id);
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
