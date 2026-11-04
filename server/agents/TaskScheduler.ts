/**
 * TaskScheduler — Gère l'orchestration multi-agents avec dépendances
 *
 * Responsabilité unique : exécuter un plan d'orchestration en respectant
 * les dépendances entre tâches et la parallélisation.
 */
import type { OrchestrationPlan, TaskResult } from "./types.js";
import { getAgentDefinition } from "./roles.js";
import { ProgressNotifier } from "./ProgressNotifier.js";
import { createLogger } from "../utils/logger.js";
import type { AgentTaskRunner } from "./AgentTaskRunner.js";

const log = createLogger("TaskScheduler");

/**
 * Moteur d'exécution d'une tâche. Implémenté par `AgentExecutor` (legacy) et
 * par `AgentRuntimeExecutor` (runtime agentique). Le scheduler dépend de cette
 * interface partagée, pas d'une implémentation concrète.
 */

export type TaskRunner = AgentTaskRunner;

/** Diagnostic emitted when an orchestration graph is not executable. */
export class InvalidOrchestrationPlanError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Plan d'orchestration invalide : ${issues.join(" ; ")}`);
    this.name = "InvalidOrchestrationPlanError";
  }
}

/**
 * Validate the complete dependency graph before any agent is started.
 * Unknown references, duplicate task IDs, self-dependencies and cycles are
 * rejected deterministically instead of leaving the scheduler in a deadlock.
 */
export function validateOrchestrationPlan(plan: OrchestrationPlan): void {
  const issues: string[] = [];
  const ids = plan.tasks.map((task) => task.id);
  const known = new Set(ids);

  if (known.size !== ids.length) issues.push("IDs de tâches dupliqués");

  for (const task of plan.tasks) {
    const deps = plan.dependencies?.[task.id] ?? [];
    const seen = new Set<string>();
    for (const depId of deps) {
      if (seen.has(depId)) issues.push(`Dépendance dupliquée "${depId}" pour "${task.id}"`);
      seen.add(depId);
      if (!known.has(depId)) issues.push(`Dépendance inconnue "${depId}" référencée par "${task.id}"`);
      if (depId === task.id) issues.push(`Auto-dépendance interdite pour "${task.id}"`);
    }
  }

  for (const key of Object.keys(plan.dependencies ?? {})) {
    if (!known.has(key)) issues.push(`Clé de dépendances sans tâche "${key}"`);
  }

  // Three-colour DFS: 0 = unseen, 1 = active stack, 2 = fully visited.
  const color = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const reportedCycles = new Set<string>();
  const visit = (id: string): void => {
    color.set(id, 1);
    stack.push(id);
    for (const depId of plan.dependencies?.[id] ?? []) {
      if (!known.has(depId)) continue;
      const state = color.get(depId) ?? 0;
      if (state === 0) visit(depId);
      else if (state === 1) {
        const start = stack.indexOf(depId);
        const cycle = [...stack.slice(start), depId];
        const signature = [...cycle.slice(0, -1)].sort().join("|");
        if (!reportedCycles.has(signature)) {
          reportedCycles.add(signature);
          issues.push(`Cycle de dépendances : ${cycle.join(" → ")}`);
        }
      }
    }
    stack.pop();
    color.set(id, 2);
  };
  for (const id of ids) if ((color.get(id) ?? 0) === 0) visit(id);

  if (issues.length) throw new InvalidOrchestrationPlanError(issues);
}

export class TaskScheduler {
  constructor(
    private executor: TaskRunner,
    private notifier?: ProgressNotifier
  ) {}

  /** Remplace le moteur d'exécution (bascule vers le runtime agentique). */
  setRunner(runner: TaskRunner): void {
    this.executor = runner;
  }

  /**
   * Exécute un plan d'orchestration complet.
   * Les tâches sans dépendances s'exécutent en parallèle.
   * Gère le deadlock quand des dépendances échouent.
   */
  async execute(plan: OrchestrationPlan): Promise<void> {
    validateOrchestrationPlan(plan);
    const orchShortId = plan.id.slice(0, 8);
    const startTime = Date.now();

    log.info(`▶ Orchestration "${plan.title}" (${orchShortId}) — ${plan.tasks.length} tâche(s)`);

    plan.status = "running";
    const completed = new Set<string>();
    const failed = new Set<string>();
    const incomplete = new Set<string>();
    const cancelled = new Set<string>();
    const unsatisfied = new Set<string>();
    let iteration = 0;
    const syncTerminalStatuses = (): void => {
      for (const task of plan.tasks) {
        if (task.status === "completed") completed.add(task.id);
        else if (task.status === "failed") { failed.add(task.id); unsatisfied.add(task.id); }
        else if (task.status === "incomplete") { incomplete.add(task.id); unsatisfied.add(task.id); }
        else if (task.status === "cancelled") { cancelled.add(task.id); unsatisfied.add(task.id); }
      }
    };
    syncTerminalStatuses();
    while (completed.size + failed.size + incomplete.size + cancelled.size < plan.tasks.length) {
      syncTerminalStatuses();
      iteration++;
      log.debug(`[${orchShortId}] Itération ${iteration} — Terminées: ${completed.size} | Échouées: ${failed.size} | Incomplètes: ${incomplete.size} | Annulées: ${cancelled.size}`);

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
            const failedDeps = deps.filter(d => unsatisfied.has(d));
            log.warn(`  Bloquée: "${b.title}" — attend: ${failedDeps.join(", ")}`);
            b.status = "incomplete";
            b.completedAt = new Date().toISOString();
            b.result = {
              success: false,
              outcome: "blocked",
              summary: "Tâche bloquée par une dépendance non terminée",
              error: `Dépendances non satisfaites: ${deps.join(", ") || "inconnues"}`,
              durationMs: 0,
            };
            incomplete.add(b.id);
            unsatisfied.add(b.id);
            this.notifier?.notify(b, "incomplete");
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
        await this.executor.execute(task);
        const taskMs = Date.now() - taskStart;

        syncTerminalStatuses();
        const progress = completed.size + failed.size + incomplete.size + cancelled.size;
        if (task.status === "completed") {
          log.info(`[${orchShortId}] [task:${taskShortId}] ✅ [${agentName}] Terminé en ${(taskMs / 1000).toFixed(1)}s | Progression: ${progress}/${plan.tasks.length}`);
        } else if (task.status === "cancelled") {
          log.info(`[${orchShortId}] [task:${taskShortId}] 🛑 [${agentName}] Annulé | Progression: ${progress}/${plan.tasks.length}`);
        } else {
          log.warn(`[${orchShortId}] [task:${taskShortId}] ❌ [${agentName}] ${task.status} en ${(taskMs / 1000).toFixed(1)}s — ${task.result?.error ?? "raison inconnue"} | Progression: ${progress}/${plan.tasks.length}`);
        }
      });

      await Promise.allSettled(executions);

      // (Audit §7) Marquer immédiatement les tâches dont toutes les dépendances
      // incluent une tâche échouée, plutôt que d'attendre le deadlock.
      for (const task of plan.tasks) {
        if (task.status !== "pending") continue;
        const deps = plan.dependencies[task.id] ?? [];
        const blockedDeps = deps.filter((depId) => unsatisfied.has(depId));
        if (blockedDeps.length > 0) {
          task.status = "incomplete";
          task.completedAt = new Date().toISOString();
          task.result = {
            success: false,
            outcome: "blocked",
            summary: "Tâche incomplète : dépendance non satisfaite",
            error: `Dépendance(s) non satisfaite(s): ${blockedDeps.join(", ")}`,
            durationMs: 0,
          };
          incomplete.add(task.id);
          unsatisfied.add(task.id);
          this.notifier?.notify(task, "incomplete");
          log.warn(`[${orchShortId}] Tâche "${task.title}" incomplète (dépendance non satisfaite)`);
        }
      }
    }

    // Une orchestration n'est terminée avec succès que si chaque tâche porte un
    // résultat vérifié. Les exécutions partielles/incomplètes restent visibles.
    const totalDuration = Date.now() - startTime;
    syncTerminalStatuses();
    if (cancelled.size > 0 && failed.size === 0) {
      plan.status = "cancelled";
    } else if (failed.size > 0 && completed.size === 0) {
      plan.status = "failed";
    } else if (completed.size === plan.tasks.length) {
      plan.status = "completed";
    } else if (completed.size > 0 || incomplete.size > 0 || cancelled.size > 0) {
      plan.status = "incomplete";
    } else {
      plan.status = "failed";
    }
    plan.completedAt = new Date().toISOString();

    const emoji = plan.status === "completed" ? "✅" : "❌";
    log.info(`${emoji} Orchestration "${plan.title}" terminée en ${(totalDuration / 1000).toFixed(1)}s — ${completed.size}/${plan.tasks.length} vérifiée(s), ${incomplete.size} incomplète(s), ${failed.size} échouée(s), ${cancelled.size} annulée(s)`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
