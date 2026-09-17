import type {
  BrainGoalInput,
  BrainPlan,
  BrainStage,
  BrainExecutionResult,
  StageVerification,
  BrainCorrectionAttempt,
} from "./types.js";
import { GoalUnderstandingEngine } from "./GoalUnderstandingEngine.js";
import { DynamicPlanner } from "./DynamicPlanner.js";
import { BrainVerifier } from "./BrainVerifier.js";
import { BrainCorrectionLoop } from "./BrainCorrectionLoop.js";
import { agentOrchestrator, type AgentOrchestrator } from "../AgentOrchestrator.js";
import { agentEventStream } from "../AgentEventStream.js";
import { createLogger } from "../../utils/logger.js";
import type { AgentTask } from "../types.js";

const log = createLogger("AgentBrain");

export class AgentBrain {
  private understandingEngine = new GoalUnderstandingEngine();
  private planner = new DynamicPlanner();
  private verifier = new BrainVerifier();
  private orchestrator: AgentOrchestrator;
  private activePlans = new Map<string, BrainPlan>();
  private results = new Map<string, BrainExecutionResult>();

  constructor(orchestrator: AgentOrchestrator = agentOrchestrator) {
    this.orchestrator = orchestrator;
  }

  /**
   * Étape 1 & 2 : Compréhension et Planification dynamique sans exécution
   */
  async planGoal(input: BrainGoalInput): Promise<BrainPlan> {
    log.info(`🧠 Agent Brain démarré pour l'objectif: "${input.goal}"`);

    // 1. Compréhension de l'objectif
    const understanding = await this.understandingEngine.understand(input);

    // 2. Décomposition dynamique en DAG
    const plan = await this.planner.plan(understanding, input);

    this.activePlans.set(plan.id, plan);

    // Émettre un événement pour la visibilité de l'interface
    agentEventStream.publish({
      type: "agent_event",
      event: "orchestration_started",
      taskId: plan.id,
      role: "planner",
      title: `[Agent Brain] Plan généré (${plan.stages.length} étapes) : ${plan.goal}`,
      status: "pending",
      agentName: "Agent Brain",
      detail: `Planification: ${plan.stages.map((s) => s.agentRole).join(" → ")}`,
      timestamp: new Date().toISOString(),
    });

    return plan;
  }

  /**
   * Cycle complet : Compréhension → Décomposition → Choix agents/skills/outils →
   *                 Exécution → Vérification → Correction → Résultat
   */
  async executeGoal(input: BrainGoalInput): Promise<BrainExecutionResult> {
    const startTime = Date.now();
    log.info(`🚀 Lancement de l'exécution complète par Agent Brain: "${input.goal}"`);

    // Générer le plan dynamique
    const plan = await this.planGoal(input);
    plan.status = "executing";

    const stageResults: Array<{ stage: BrainStage; result?: any; durationMs: number }> = [];
    const allVerifications: StageVerification[] = [];
    const allCorrections: BrainCorrectionAttempt[] = [];
    const allFilesModified = new Set<string>();

    const correctionLoop = new BrainCorrectionLoop(input.maxCorrectionAttempts ?? 3);

    let globalSuccess = true;

    // Exécution des étapes selon leurs dépendances
    for (let i = 0; i < plan.stages.length; i++) {
      const stage = plan.stages[i];
      const stageStartTime = Date.now();
      stage.status = "running";
      stage.startedAt = new Date().toISOString();

      log.info(`▶️ Exécution étape ${i + 1}/${plan.stages.length}: "${stage.title}" (${stage.agentRole})`);

      agentEventStream.publish({
        type: "agent_event",
        event: "task_started",
        taskId: stage.id,
        role: stage.agentRole,
        title: `[Brain Stage ${i + 1}/${plan.stages.length}] ${stage.title}`,
        status: "running",
        agentName: stage.agentRole,
        detail: stage.description,
        timestamp: new Date().toISOString(),
      });

      let stageTaskResult: any = null;

      try {
        // Exécuter la tâche via l'orchestrateur
        const delegatedTask: AgentTask = await this.orchestrator.delegateTask({
          role: stage.agentRole,
          title: stage.title,
          description: `${stage.description}\n\nOutils autorisés : ${stage.tools.join(", ")}`,
          files: stage.files,
          instructions: stage.instructions,
          priority: stage.priority,
        });

        // Attendre que la tâche se termine (pooling de complétion du statut)
        stageTaskResult = await this.awaitTaskCompletion(delegatedTask.id);
        stage.result = stageTaskResult;

        if (stageTaskResult?.filesModified) {
          for (const f of stageTaskResult.filesModified) {
            allFilesModified.add(f);
          }
        }
      } catch (err: any) {
        log.error(`❌ Erreur d'exécution de l'étape ${stage.id}: ${err.message}`);
        stageTaskResult = {
          success: false,
          outcome: "failed" as const,
          summary: err.message ?? "Erreur d'exécution",
          durationMs: Date.now() - stageStartTime,
          error: err.message,
          filesModified: [],
        };
        stage.result = stageTaskResult;
      }

      // Étape Vérification
      let verification = await this.verifier.verifyStage(
        stage,
        plan.understanding,
        Array.from(allFilesModified)
      );
      allVerifications.push(verification);

      // Étape Correction autonome si échec
      let attempt = 1;
      while (!verification.passed && attempt <= (input.maxCorrectionAttempts ?? 3)) {
        log.warn(`⚠️ Déclenchement de la correction autonome pour ${stage.id} (tentative ${attempt})`);
        plan.status = "correcting";

        const correction = correctionLoop.createCorrection(
          stage,
          verification,
          attempt,
          plan.understanding
        );

        if (!correction) break;

        allCorrections.push(correction);

        agentEventStream.publish({
          type: "agent_event",
          event: "task_progress",
          taskId: stage.id,
          role: correction.targetRole,
          title: `[Auto-Correction ${attempt}] Réparation pour ${stage.title}`,
          status: "running",
          agentName: correction.targetRole,
          detail: correction.diagnostic,
          timestamp: new Date().toISOString(),
        });

        try {
          const fixTask = await this.orchestrator.delegateTask({
            role: correction.targetRole,
            title: `[Auto-Correction] Fix pour ${stage.title}`,
            description: correction.correctiveInstructions,
            files: correction.filesToFix,
            priority: "critical",
          });

          const fixResult = await this.awaitTaskCompletion(fixTask.id);
          if (fixResult?.filesModified) {
            for (const f of fixResult.filesModified) {
              allFilesModified.add(f);
            }
          }

          // Re-vérifier
          verification = await this.verifier.verifyStage(
            stage,
            plan.understanding,
            Array.from(allFilesModified)
          );
          allVerifications.push(verification);

          if (verification.passed) {
            correction.resolved = true;
            log.info(`✅ Auto-correction réussie pour ${stage.id} à la tentative ${attempt} !`);
            break;
          }
        } catch (corrErr: any) {
          log.error(`❌ Erreur pendant la correction: ${corrErr.message}`);
        }

        attempt++;
      }

      stage.durationMs = Date.now() - stageStartTime;
      stage.completedAt = new Date().toISOString();
      stage.status = verification.passed ? "completed" : "failed";

      stageResults.push({
        stage,
        result: stage.result,
        durationMs: stage.durationMs,
      });

      agentEventStream.publish({
        type: "agent_event",
        event: verification.passed ? "task_completed" : "task_failed",
        taskId: stage.id,
        role: stage.agentRole,
        title: `[Brain Stage ${i + 1}/${plan.stages.length}] ${stage.title}`,
        status: verification.passed ? "completed" : "failed",
        agentName: stage.agentRole,
        detail: verification.summary,
        timestamp: new Date().toISOString(),
      });

      if (!verification.passed) {
        globalSuccess = false;
        log.error(`❌ Échec persistant de l'étape ${stage.id}. Interruption du pipeline.`);
        break;
      }
    }

    const totalDurationMs = Date.now() - startTime;
    plan.status = globalSuccess ? "completed" : "failed";

    // Synthèse du résultat
    const summary = globalSuccess
      ? `Objectif accompli avec succès en ${plan.stages.length} étapes (${plan.stages.map((s) => s.agentRole).join(" → ")}). ${allFilesModified.size} fichier(s) mis à jour, validés et sans régression.`
      : `L'exécution a rencontré une difficulté sur l'étape : ${stageResults[stageResults.length - 1]?.stage.title ?? "Inconnue"}.`;

    const deliverables = [
      ...Array.from(allFilesModified).map((f) => `Fichier modifié : ${f}`),
      ...allVerifications.map((v) => v.summary),
    ];

    const result: BrainExecutionResult = {
      planId: plan.id,
      goal: input.goal,
      success: globalSuccess,
      understanding: plan.understanding,
      stages: stageResults,
      filesModified: Array.from(allFilesModified),
      verifications: allVerifications,
      corrections: allCorrections,
      totalDurationMs,
      summary,
      deliverables,
    };

    this.results.set(plan.id, result);

    agentEventStream.publish({
      type: "agent_event",
      event: "orchestration_completed",
      taskId: plan.id,
      role: "planner",
      title: `[Agent Brain] ${globalSuccess ? "Objectif validé" : "Échec"} : ${plan.goal}`,
      status: globalSuccess ? "completed" : "failed",
      agentName: "Agent Brain",
      detail: summary,
      timestamp: new Date().toISOString(),
    });

    log.info(`🏁 Exécution Brain terminée (${totalDurationMs}ms). Succès: ${globalSuccess}`);
    return result;
  }

  /**
   * Récupère un plan en mémoire
   */
  getPlan(planId: string): BrainPlan | undefined {
    return this.activePlans.get(planId);
  }

  /**
   * Récupère un résultat d'exécution
   */
  getResult(planId: string): BrainExecutionResult | undefined {
    return this.results.get(planId);
  }

  /**
   * Attente active de terminaison d'une tâche déléguée
   */
  private async awaitTaskCompletion(taskId: string, maxWaitMs = 180_000): Promise<any> {
    const checkInterval = 200;
    const start = Date.now();

    while (Date.now() - start < maxWaitMs) {
      const task = this.orchestrator.getTask(taskId);
      if (!task) {
        throw new Error(`Tâche ${taskId} introuvable dans l'orchestrateur`);
      }

      if (task.status === "completed") {
        return task.result ?? { success: true, outcome: "completed" as const, summary: "Tâche complétée", durationMs: 0, filesModified: [] };
      }

      if (task.status === "failed") {
        return task.result ?? { success: false, outcome: "failed" as const, summary: "Tâche échouée", durationMs: 0, error: "Tâche échouée" };
      }

      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }

    throw new Error(`Délai d'attente dépassé (${maxWaitMs}ms) pour la tâche ${taskId}`);
  }
}

export const agentBrain = new AgentBrain();
