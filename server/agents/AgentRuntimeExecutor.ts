/**
 * AgentRuntimeExecutor — Pont entre l'orchestration legacy et le runtime agentique.
 *
 * L'orchestrateur, le TaskScheduler et les agents autonomes manipulent des
 * `AgentTask` et lisent `task.status` / `task.result` in-place après
 * `execute(task)`. Cet adaptateur expose EXACTEMENT cette surface, mais délègue
 * l'exécution au vrai runtime agentique (`server/runtime/agentic/AgenticRuntime`),
 * qui donne réellement ses outils à l'agent et boucle
 * analyse → plan → écriture → vérification → correction → re-vérification.
 *
 * Il remplace `AgentExecutor` comme moteur d'exécution des tâches, sans changer
 * les appelants : ceux-ci continuent d'appeler `execute(task)`.
 */

import type { AgenticRuntime } from "../runtime/agentic/AgenticRuntime.js";
import type { AgentResult, AgentTask as AgenticTask, AgentBudget, RuntimePhase } from "../runtime/agentic/types.js";
import { getAgentDefinitionOrThrow, hasAgent } from "./roles.js";
import type { AgentTask, TaskResult, TaskOutcome } from "./types.js";
import type { AgentTaskRunner } from "./AgentTaskRunner.js";
import type { CoreKernel } from "../core/kernel.js";
import { ProgressNotifier } from "./ProgressNotifier.js";
import { randomUUID } from "node:crypto";
import { createLogger } from "../utils/logger.js";

const log = createLogger("AgentRuntimeExecutor");

/**
 * Traduction des jalons de phase du runtime en progression affichée (x/5).
 * L'étape 1/5 « Planification » est émise avant l'appel à `run()`, et 5/5
 * « Terminé » après ; ce tableau couvre les transitions intermédiaires pour que
 * l'UI reflète l'avancement réel au lieu de rester bloquée sur 1/5.
 */
const RUNTIME_PHASE_PROGRESS: Record<RuntimePhase, { current: number; total: number; label: string } | undefined> = {
  planning: { current: 1, total: 5, label: "Planification" },
  acting: { current: 2, total: 5, label: "Exécution" },
  verifying: { current: 3, total: 5, label: "Vérification" },
  finalizing: { current: 4, total: 5, label: "Finalisation" },
};

/**
 * Exécuteur de tâches basé sur le runtime agentique.
 * Compatible avec la surface publique de `AgentExecutor` utilisée par les
 * appelants (execute / getRunningCount / cancel / isRunning).
 */
export class AgentRuntimeExecutor implements AgentTaskRunner {
  private runningCount = new Map<string, number>();
  private active = new Map<string, AbortController>();
  /**
   * Gouvernance optionnelle (F-05) : quand branchée, chaque tâche passe par le
   * LeannaSupervisor (preuve avant succès, snapshot/rollback des fichiers
   * déclarés, récupération bornée). Absente → exécution directe (défaut).
   */
  private supervise: CoreKernel["runSupervisedAgenticMission"] | null = null;

  constructor(
    private readonly agentic: AgenticRuntime,
    private readonly notifier: ProgressNotifier,
    private readonly defaultBudget?: Partial<AgentBudget>
  ) {}

  /** Branche (ou retire avec `null`) la gouvernance du Supervisor. */
  setSupervision(run: CoreKernel["runSupervisedAgenticMission"] | null): void {
    this.supervise = run;
  }

  isSupervised(): boolean {
    return this.supervise !== null;
  }

  /** Exécute un outil isolé (ex: verify_file relancé par la boucle autonome). */
  runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.agentic.callTool(name, args);
  }

  getRunningCount(role: string): number {
    return this.runningCount.get(role) ?? 0;
  }

  isRunning(taskId: string): boolean {
    return this.active.has(taskId);
  }

  /**
   * Annulation coopérative. Le runtime agentique ne prend pas encore de signal
   * d'annulation en cours de boucle ; on marque l'intention et on laisse la
   * tâche se terminer au prochain point de contrôle naturel.
   */
  cancel(taskId: string): boolean {
    const controller = this.active.get(taskId);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  /**
   * Exécute une tâche via le runtime agentique et écrit le résultat in-place,
   * en respectant le contrat de `AgentExecutor.execute`.
   */
  async execute(task: AgentTask): Promise<void> {
    const shortId = task.id.slice(0, 8);

    if (!hasAgent(task.role)) {
      task.status = "failed";
      task.result = {
        success: false,
        outcome: "failed",
        summary: `Agent "${task.role}" introuvable`,
        error: `Agent "${task.role}" non enregistré.`,
        durationMs: 0,
      };
      this.notifier.notify(task, "failed");
      return;
    }

    const agent = getAgentDefinitionOrThrow(task.role);
    const startTime = Date.now();

    const controller = new AbortController();
    this.active.set(task.id, controller);
    this.increment(task.role);
    task.status = "running";
    task.startedAt = new Date().toISOString();
    this.notifier.notify(task, "started");

    log.info(`[task:${shortId}] ▶ [${agent.name}] via runtime agentique — "${task.title}"`);
    this.notifier.notify(task, "progress", { current: 1, total: 5, label: "Planification" });

    try {
      const agenticTask: AgenticTask = {
        id: task.id,
        role: task.role,
        goal: this.buildGoal(task),
        files: task.context.files,
        instructions: task.context.instructions,
        metadata: {
          ...(task.orchestrationId ? { missionId: task.orchestrationId } : {}),
          title: task.title,
        },
        budget: this.defaultBudget,
        // Propage l'annulation jusqu'au runtime : un clic « Annuler » interrompt
        // désormais réellement la planification/boucle, au lieu d'être ignoré.
        signal: controller.signal,
        // Reflète l'avancement RÉEL de phase vers l'UI. Sans cela, la tâche
        // restait figée sur « 1/5 Planification » jusqu'à la toute fin.
        onProgress: (phase) => {
          const step = RUNTIME_PHASE_PROGRESS[phase];
          if (step) this.notifier.notify(task, "progress", step);
        },
        // Plan + budget en direct : lus par GET /api/agents/tasks/:id (MissionDetail).
        onTrace: (trace) => {
          task.execution = trace;
        },
      };

      const result = this.supervise
        ? await this.runSupervised(this.supervise, task, agenticTask)
        : await this.agentic.run(agenticTask);
      task.result = this.toTaskResult(result);
      // Le runtime RETOURNE un résultat "blocked" sur annulation (il ne lève pas) :
      // sans ce test, une annulation utilisateur était rapportée "failed".
      const cancelled = !result.success && controller.signal.aborted;
      task.status = result.success ? "completed" : cancelled ? "cancelled" : "failed";
      task.completedAt = new Date().toISOString();

      this.notifier.notify(task, "progress", { current: 5, total: 5, label: "Terminé" });
      this.notifier.notify(task, result.success ? "completed" : cancelled ? "cancelled" : "failed");

      log.info(
        `[task:${shortId}] ${result.success ? "✅" : "❌"} [${agent.name}] ` +
          `outcome=${result.outcome} — ${result.filesModified.length} fichier(s) modifié(s) — ` +
          `${(result.durationMs / 1000).toFixed(1)}s`
      );
    } catch (err) {
      // Si l'annulation a été demandée, c'est un arrêt volontaire, pas un échec.
      const cancelled = controller.signal.aborted;
      task.status = cancelled ? "cancelled" : "failed";
      task.completedAt = new Date().toISOString();
      task.result = {
        success: false,
        outcome: cancelled ? "blocked" : "failed",
        summary: cancelled ? `Tâche "${task.title}" annulée` : `Échec de l'agent ${agent.name}`,
        error: cancelled ? undefined : (err as Error).message,
        durationMs: Date.now() - startTime,
      };
      if (cancelled) {
        log.info(`[task:${shortId}] 🛑 [${agent.name}] annulée par l'utilisateur`);
        this.notifier.notify(task, "cancelled");
      } else {
        log.error(`[task:${shortId}] ❌ [${agent.name}] ${(err as Error).message}`);
        this.notifier.notify(task, "failed");
      }
    } finally {
      this.active.delete(task.id);
      this.decrement(task.role);
    }
  }

  /**
   * Exécute la tâche sous le Supervisor : le verdict du Supervisor (preuve)
   * prime sur l'auto-évaluation du runtime. Une tentative non validée a vu ses
   * fichiers déclarés restaurés : ils ne sont plus rapportés comme modifiés.
   */
  private async runSupervised(
    supervise: CoreKernel["runSupervisedAgenticMission"],
    task: AgentTask,
    agenticTask: AgenticTask
  ): Promise<AgentResult> {
    const plannedFiles = task.context.files ?? [];
    const sup = await supervise(this.agentic, {
      // Identifiant unique par exécution : une ré-exécution de la même tâche ne
      // doit pas être court-circuitée par un snapshot terminal précédent.
      missionId: `agent-task:${task.id}:${randomUUID().slice(0, 8)}`,
      goal: agenticTask.goal,
      role: task.role,
      plannedFiles,
      baseTask: { ...agenticTask },
    });
    const last = sup.lastResult;
    if (!last) throw new Error(`Supervisor: aucune tentative exécutée (état ${sup.finalState}).`);
    if (sup.finalState === "COMPLETED") return last;

    return {
      ...last,
      success: false,
      outcome: last.success ? "partial" : last.outcome,
      filesModified: last.filesModified.filter((f) => !plannedFiles.includes(f)),
      error: last.error ?? `Supervisor: preuve insuffisante (état ${sup.finalState}, ${sup.attempts} tentative(s)).`,
    };
  }

  // ─── Adaptation des formats ────────────────────────────────────────────────

  /** Construit l'objectif en langage naturel à partir de la tâche legacy. */
  private buildGoal(task: AgentTask): string {
    const parts = [task.title];
    if (task.description && task.description !== task.title) parts.push(task.description);
    // Critères de succès vérifiables (transmis par délégation/négociation) :
    // ils indiquent explicitement au modèle que la tâche attend un artefact.
    const criteria = task.context.successCriteria;
    if (criteria?.length) {
      parts.push(`\nCRITÈRES DE SUCCÈS (à satisfaire) :\n${criteria.map((c) => `- ${c}`).join("\n")}`);
    }
    // Injecter les résultats de dépendances (chaînage d'orchestration).
    const prev = task.context.previousResults;
    if (prev?.length) {
      const summaries = prev
        .map((r) => `- ${r.summary}${r.filesModified?.length ? ` (fichiers: ${r.filesModified.join(", ")})` : ""}`)
        .join("\n");
      parts.push(`\nRÉSULTATS DES ÉTAPES PRÉCÉDENTES :\n${summaries}`);
    }
    return parts.join("\n\n");
  }

  /** Convertit un AgentResult (agentique) en TaskResult (legacy). */
  private toTaskResult(result: AgentResult): TaskResult {
    const outcome: TaskOutcome = result.outcome;
    return {
      success: result.success,
      outcome,
      summary: result.final.summary,
      details: result.final.details,
      filesModified: result.filesModified,
      suggestions: result.final.suggestions,
      proposedDelegations: result.final.delegations?.length ? result.final.delegations : undefined,
      error: result.error,
      durationMs: result.durationMs,
      evidence: {
        filesRead: result.filesRead, // remonté depuis le runtime (session.readFilesSeen)
        filesModified: result.filesModified,
        toolsExecuted: result.toolsExecuted,
        commandsExecuted: result.toolsExecuted.filter((t) => t === "run_project_command"),
        verification: {
          passed: result.verifications.length > 0 && result.verifications.every((v) => v.passed),
          checks: result.verifications.flatMap((v) => v.checks),
          errors: result.verifications.flatMap((v) => v.issues),
        },
      },
    };
  }

  private increment(role: string): void {
    this.runningCount.set(role, (this.runningCount.get(role) ?? 0) + 1);
  }

  private decrement(role: string): void {
    const current = this.runningCount.get(role) ?? 1;
    this.runningCount.set(role, Math.max(0, current - 1));
  }
}
