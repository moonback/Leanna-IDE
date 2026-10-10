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
import { BrainPlanValidator } from "./BrainPlanValidator.js";
import { BrainScheduler } from "./BrainScheduler.js";
import { agentOrchestrator, type AgentOrchestrator } from "../AgentOrchestrator.js";
import { agentEventStream } from "../AgentEventStream.js";
import { swarmComposer, type SwarmHandle } from "../SwarmComposer.js";
import { createLogger } from "../../utils/logger.js";
import type { AgentTask } from "../types.js";

const log = createLogger("AgentBrain");

/** Contexte d'exécution partagé entre les étapes d'un run (et ses réplanifications). */
interface BrainRunContext {
  verifications: StageVerification[];
  corrections: BrainCorrectionAttempt[];
  filesModified: Set<string>;
  stageResults: Map<string, { stage: BrainStage; result?: any; durationMs: number }>;
  correctionLoop: BrainCorrectionLoop;
  maxCorrectionAttempts: number;
  understanding: BrainPlan["understanding"];
}

/**
 * Dépendances injectables du Brain. Toutes optionnelles : par défaut le Brain
 * construit ses composants réels. Sert à l'injection déterministe pour les
 * tests de bout en bout du superviseur (understanding/planner/verifier
 * scriptés, sans réseau).
 */
export interface AgentBrainDeps {
  understandingEngine?: Pick<GoalUnderstandingEngine, "understand">;
  planner?: Pick<DynamicPlanner, "plan">;
  verifier?: BrainVerifier;
}

export class AgentBrain {
  private understandingEngine: Pick<GoalUnderstandingEngine, "understand">;
  private planner: Pick<DynamicPlanner, "plan">;
  private verifier: BrainVerifier;
  private validator = new BrainPlanValidator();
  private orchestrator: AgentOrchestrator;
  private activePlans = new Map<string, BrainPlan>();
  private results = new Map<string, BrainExecutionResult>();

  constructor(orchestrator: AgentOrchestrator = agentOrchestrator, deps: AgentBrainDeps = {}) {
    this.orchestrator = orchestrator;
    this.understandingEngine = deps.understandingEngine ?? new GoalUnderstandingEngine();
    this.planner = deps.planner ?? new DynamicPlanner();
    // Vérification d'étape alignée sur WorkspaceState : si le moteur actif
    // expose runTool (runtime agentique), le BrainVerifier fait une
    // vérification HASHÉE des fichiers modifiés (verify_file → hash gate).
    // Sinon, il retombe sur les contrôles superficiels (compatibilité).
    if (deps.verifier) {
      this.verifier = deps.verifier;
    } else {
      const runTool = this.orchestrator.canRunTool
        ? (name: string, args: Record<string, unknown>) => this.orchestrator.runTool(name, args)
        : undefined;
      this.verifier = new BrainVerifier(runTool);
    }
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

    // 3. Validation stricte du DAG produit (Zod + cycles + refs + rôles)
    const validation = this.validator.validate(plan);
    if (!validation.ok) {
      const detail = validation.issues.join(" ; ");
      log.error(`❌ Plan invalide (${plan.id.slice(0, 8)}) : ${detail}`);
      plan.status = "failed";
      throw new Error(`Plan généré invalide : ${detail}`);
    }

    // 4. Générer la visualisation Mermaid du DAG
    plan.mermaid = this.validator.toMermaid(plan);

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
   * Cycle complet : Compréhension → Décomposition → Validation →
   *                 Exécution parallèle (DAG) → Vérification → Correction →
   *                 Réplanification à chaud → Résultat
   */
  async executeGoal(input: BrainGoalInput): Promise<BrainExecutionResult> {
    const startTime = Date.now();
    log.info(`🚀 Lancement de l'exécution complète par Agent Brain: "${input.goal}"`);

    // Générer + valider le plan dynamique
    const plan = await this.planGoal(input);
    plan.status = "executing";

    // ── Composition de swarm pilotée par le plan réel ────────────────────────
    // L'équipe est composée à partir de l'objectif ET des skills/outils que le
    // plan validé compte réellement exécuter (pas d'un texte libre). Elle est
    // instanciée ici, avant toute étape, et dissoute dans le `finally` ci-dessous
    // — garantissant la libération même en cas d'exception.
    const team = this.composeTeamForPlan(plan);

    // Contexte partagé accumulé au fil de l'exécution (et des réplanifications)
    const ctx: BrainRunContext = {
      verifications: [],
      corrections: [],
      filesModified: new Set<string>(),
      stageResults: new Map<string, { stage: BrainStage; result?: any; durationMs: number }>(),
      correctionLoop: new BrainCorrectionLoop(input.maxCorrectionAttempts ?? 3),
      maxCorrectionAttempts: input.maxCorrectionAttempts ?? 3,
      understanding: plan.understanding,
    };

    try {
      const scheduler = new BrainScheduler((stage, deps) => this.executeStage(stage, plan, ctx, deps));

      // Exécution initiale du DAG complet
      let report = await scheduler.execute(plan.stages);

      // ── Réplanification à chaud du sous-graphe restant (garde-fou anti-boucle) ──
      const maxReplans = input.maxReplans ?? 2;
      let replans = 0;
      while (report.failed.length > 0 && replans < maxReplans) {
        replans++;
        const replanned = await this.replanSubgraph(plan, report, ctx, replans, maxReplans);
        if (!replanned) {
          log.warn(`🛑 Réplanification impossible — arrêt propre après ${replans} tentative(s)`);
          break;
        }
        report = await scheduler.execute(plan.stages);
      }

      // ── Synthèse du résultat ────────────────────────────────────────────────
      const totalDurationMs = Date.now() - startTime;
      const allCompleted = plan.stages.every((s) => s.status === "completed");
      const anyCompleted = plan.stages.some((s) => s.status === "completed");
      const globalSuccess = allCompleted;

      plan.status = allCompleted ? "completed" : anyCompleted ? "incomplete" : "failed";

      const stageResults = plan.stages.map(
        (s) => ctx.stageResults.get(s.id) ?? { stage: s, result: s.result, durationMs: s.durationMs ?? 0 }
      );

      const failedStage = plan.stages.find((s) => s.status === "failed" || s.status === "skipped");
      const summary = globalSuccess
        ? `Objectif accompli avec succès en ${plan.stages.length} étapes (${plan.stages.map((s) => s.agentRole).join(" → ")}). ${ctx.filesModified.size} fichier(s) mis à jour, validés et sans régression.`
        : `Exécution ${plan.status === "incomplete" ? "partielle" : "en échec"} — difficulté sur l'étape : ${failedStage?.title ?? "inconnue"}${replans > 0 ? ` (après ${replans} réplanification(s))` : ""}.`;

      const deliverables = [
        ...Array.from(ctx.filesModified).map((f) => `Fichier modifié : ${f}`),
        ...ctx.verifications.map((v) => v.summary),
      ];

      const result: BrainExecutionResult = {
        planId: plan.id,
        goal: input.goal,
        success: globalSuccess,
        understanding: plan.understanding,
        stages: stageResults,
        filesModified: Array.from(ctx.filesModified),
        verifications: ctx.verifications,
        corrections: ctx.corrections,
        totalDurationMs,
        summary,
        deliverables,
        team: team ?? undefined,
      };

      this.results.set(plan.id, result);

      agentEventStream.publish({
        type: "agent_event",
        event: "orchestration_completed",
        taskId: plan.id,
        role: "planner",
        title: `[Agent Brain] ${globalSuccess ? "Objectif validé" : plan.status === "incomplete" ? "Partiellement accompli" : "Échec"} : ${plan.goal}`,
        status: globalSuccess ? "completed" : "failed",
        agentName: "Agent Brain",
        detail: summary,
        timestamp: new Date().toISOString(),
      });

      log.info(`🏁 Exécution Brain terminée (${totalDurationMs}ms). Statut: ${plan.status} — ${replans} réplanification(s)`);
      return result;
    } finally {
      // Dissolution de l'équipe en fin de mission (succès, échec OU exception).
      // Pour des rôles statiques partagés, dissolve() est un no-op sûr ; seuls
      // les rôles créés dynamiquement pour la mission seraient désenregistrés.
      this.dissolveTeam(plan, team);
    }
  }

  /**
   * Compose l'équipe de la mission à partir du PLAN RÉEL : l'objectif
   * (`plan.goal` + intention comprise) et les skills/outils que les étapes
   * comptent exécuter (`stage.skills` + `stage.tools`). Publie un événement
   * d'observabilité. Best-effort : une erreur de composition ne fait jamais
   * échouer la mission (retourne `null`).
   */
  private composeTeamForPlan(plan: BrainPlan): SwarmHandle | null {
    try {
      const planRoles = Array.from(new Set(plan.stages.map((s) => s.agentRole)));
      const plannedSkills = Array.from(
        new Set(plan.stages.flatMap((s) => [...(s.skills ?? []), ...(s.tools ?? [])]))
      );
      log.info(
        `🐝 Composition de swarm pour "${plan.goal}" (plan ${plan.id.slice(0, 8)}) — ` +
          `rôles du plan: [${planRoles.join(", ")}], ` +
          `${plannedSkills.length} skill(s)/outil(s) planifié(s)`
      );
      log.debug(`🐝 Skills planifiés dérivés du plan : [${plannedSkills.join(", ")}]`);

      const handle = swarmComposer.compose({
        objective: { title: plan.goal, description: plan.understanding.intent },
        plannedSkills,
      });

      agentEventStream.publish({
        type: "agent_event",
        event: "task_progress",
        taskId: plan.id,
        role: "planner",
        title: `[Agent Brain] Équipe composée (${handle.members.length} agents)`,
        status: "running",
        agentName: "Agent Brain",
        detail: `Pipeline : ${handle.pipeline.join(" → ")}`,
        timestamp: new Date().toISOString(),
      });
      log.info(
        `🐝 Équipe composée (${handle.members.length} agents) : ${handle.pipeline.join(" → ")}`
      );
      // Détail du raisonnement de recrutement (DEBUG) : pourquoi chaque membre.
      for (const m of handle.members) {
        log.debug(`   └─ ${m.role} [${m.stage}] — ${m.rationale}`);
      }
      return handle;
    } catch (err: any) {
      log.warn(`Composition de swarm ignorée (best-effort) : ${err?.message ?? err}`);
      return null;
    }
  }

  /** Dissout l'équipe de la mission (best-effort, jamais bloquant). */
  private dissolveTeam(plan: BrainPlan, team: SwarmHandle | null): void {
    if (!team) return;
    try {
      const { dissolved } = team.dissolve();
      agentEventStream.publish({
        type: "agent_event",
        event: "task_progress",
        taskId: plan.id,
        role: "planner",
        title: `[Agent Brain] Équipe dissoute`,
        status: "completed",
        agentName: "Agent Brain",
        detail: dissolved.length > 0 ? `Rôles dynamiques libérés : ${dissolved.join(", ")}` : `Équipe de rôles statiques — rien à libérer`,
        timestamp: new Date().toISOString(),
      });
      log.info(`🧹 Équipe dissoute pour "${plan.goal}"${dissolved.length ? ` (libérés : ${dissolved.join(", ")})` : ""}`);
    } catch (err: any) {
      log.warn(`Dissolution de swarm ignorée (best-effort) : ${err?.message ?? err}`);
    }
  }

  /**
   * Exécute une étape unique : délégation → attente → vérification → boucle de
   * correction autonome jusqu'au budget. Accumule fichiers/vérifs/corrections
   * dans le contexte partagé. Renvoie la vérification finale (verdict de l'étape).
   *
   * Cette méthode est appelée par le BrainScheduler pour chaque étape prête,
   * potentiellement en parallèle avec d'autres.
   */
  private async executeStage(
    stage: BrainStage,
    plan: BrainPlan,
    ctx: BrainRunContext,
    _depResults: StageVerification[]
  ): Promise<StageVerification> {
    const stageStartTime = Date.now();
    stage.startedAt = new Date().toISOString();

    log.info(`▶️ Exécution étape "${stage.title}" (${stage.agentRole})`);

    agentEventStream.publish({
      type: "agent_event",
      event: "task_started",
      taskId: stage.id,
      role: stage.agentRole,
      title: `[Brain Stage] ${stage.title}`,
      status: "running",
      agentName: stage.agentRole,
      detail: stage.description,
      timestamp: new Date().toISOString(),
    });

    let stageTaskResult: any = null;

    try {
      const delegatedTask: AgentTask = await this.orchestrator.delegateTask({
        role: stage.agentRole,
        title: stage.title,
        description: `${stage.description}\n\nOutils autorisés : ${stage.tools.join(", ")}`,
        files: stage.files,
        instructions: stage.instructions,
        priority: stage.priority,
      });

      stageTaskResult = await this.awaitTaskCompletion(delegatedTask.id);
      stage.result = stageTaskResult;

      if (stageTaskResult?.filesModified) {
        for (const f of stageTaskResult.filesModified) ctx.filesModified.add(f);
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

    // Vérification
    let verification = await this.verifier.verifyStage(
      stage,
      ctx.understanding,
      Array.from(ctx.filesModified)
    );
    ctx.verifications.push(verification);

    // Boucle de correction autonome bornée
    let attempt = 1;
    while (!verification.passed && attempt <= ctx.maxCorrectionAttempts) {
      log.warn(`⚠️ Correction autonome pour ${stage.id} (tentative ${attempt})`);
      plan.status = "correcting";

      const correction = ctx.correctionLoop.createCorrection(
        stage,
        verification,
        attempt,
        ctx.understanding
      );
      if (!correction) break;
      ctx.corrections.push(correction);

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
          for (const f of fixResult.filesModified) ctx.filesModified.add(f);
        }

        // Reporter le résultat de la correction sur l'étape : la re-vérification
        // doit refléter l'état corrigé, pas l'échec initial.
        if (fixResult) {
          stage.result = fixResult;
        }

        verification = await this.verifier.verifyStage(
          stage,
          ctx.understanding,
          Array.from(ctx.filesModified)
        );
        ctx.verifications.push(verification);

        if (verification.passed) {
          correction.resolved = true;
          log.info(`✅ Auto-correction réussie pour ${stage.id} à la tentative ${attempt}`);
          break;
        }
      } catch (corrErr: any) {
        log.error(`❌ Erreur pendant la correction: ${corrErr.message}`);
      }

      attempt++;
    }

    stage.durationMs = Date.now() - stageStartTime;
    stage.completedAt = new Date().toISOString();

    ctx.stageResults.set(stage.id, {
      stage,
      result: stage.result,
      durationMs: stage.durationMs,
    });

    agentEventStream.publish({
      type: "agent_event",
      event: verification.passed ? "task_completed" : "task_failed",
      taskId: stage.id,
      role: stage.agentRole,
      title: `[Brain Stage] ${stage.title}`,
      status: verification.passed ? "completed" : "failed",
      agentName: stage.agentRole,
      detail: verification.summary,
      timestamp: new Date().toISOString(),
    });

    return verification;
  }

  /**
   * Réplanifie à chaud le sous-graphe restant après un échec persistant.
   * Préserve les étapes déjà `completed` et régénère les étapes non terminées
   * en injectant le contexte d'échec, puis revalide le plan résultant.
   *
   * @returns true si un nouveau sous-graphe exécutable a été produit, false sinon.
   */
  private async replanSubgraph(
    plan: BrainPlan,
    report: import("./BrainScheduler.js").BrainScheduleReport,
    ctx: BrainRunContext,
    replanIndex: number,
    maxReplans: number
  ): Promise<boolean> {
    const completedStages = plan.stages.filter((s) => s.status === "completed");
    const unfinished = plan.stages.filter((s) => s.status !== "completed");
    if (unfinished.length === 0) return false;

    const failedStage = plan.stages.find((s) => s.id === report.firstFailedStageId) ?? unfinished[0];
    const failedVerif = ctx.verifications.filter((v) => v.stageId === failedStage.id).pop();
    const diagnostic = failedVerif?.issues.map((i) => i.message).join(" ; ") || failedVerif?.summary || "échec non diagnostiqué";

    log.warn(`🔄 Réplanification ${replanIndex}/${maxReplans} — sous-graphe de ${unfinished.length} étape(s) non terminée(s). Cause: ${diagnostic}`);

    agentEventStream.publish({
      type: "agent_event",
      event: "task_progress",
      taskId: plan.id,
      role: "planner",
      title: `[Agent Brain] Réplanification ${replanIndex}/${maxReplans} du sous-graphe restant`,
      status: "running",
      agentName: "Agent Brain",
      detail: `Cause: ${diagnostic}`,
      timestamp: new Date().toISOString(),
    });

    // Régénérer un plan pour les étapes restantes en enrichissant les instructions
    // avec le contexte de l'échec.
    const enrichedUnderstanding: typeof plan.understanding = {
      ...plan.understanding,
      requirements: [
        ...plan.understanding.requirements,
        `Réplanification suite à l'échec de "${failedStage.title}" : ${diagnostic}`,
      ],
    };

    let regenerated: BrainStage[];
    try {
      const subPlan = await this.planner.plan(enrichedUnderstanding, {
        goal: plan.goal,
        contextFiles: plan.understanding.relevantFiles,
        instructions: `Concentre-toi uniquement sur la finalisation des étapes restantes. Contexte de l'échec précédent : ${diagnostic}`,
        mode: "auto",
      });
      regenerated = subPlan.stages;
    } catch (err: any) {
      log.error(`Réplanification échouée (planner) : ${err.message}`);
      return false;
    }

    if (!regenerated || regenerated.length === 0) return false;

    // Réindexer les étapes régénérées pour éviter toute collision d'id avec les
    // étapes déjà complétées, et les faire dépendre du dernier travail préservé.
    const completedIds = completedStages.map((s) => s.id);
    const completedIdSet = new Set(completedIds);
    const reindexed: BrainStage[] = regenerated.map((s, i) => {
      const newId = `replan${replanIndex}-${i + 1}-${s.agentRole}`;
      return { ...s, id: newId, status: "pending" as const, result: undefined };
    });
    // Remapper les dépendances internes (anciennes → nouvelles) au sein du sous-plan
    const idMap = new Map<string, string>();
    regenerated.forEach((s, i) => idMap.set(s.id, reindexed[i].id));
    for (const s of reindexed) {
      s.dependsOn = (s.dependsOn ?? [])
        .map((d) => {
          // #7 : une dépendance vers une étape DÉJÀ COMPLÉTÉE doit être conservée
          // telle quelle. L'ancien code ne mappait que via idMap (sous-plan
          // régénéré) puis filtrait `Boolean(d)`, ce qui supprimait silencieusement
          // ces liens et cassait l'ordre topologique attendu du DAG.
          if (idMap.has(d)) return idMap.get(d)!;
          if (completedIdSet.has(d)) return d;
          return undefined;
        })
        // #8 : refuse l'auto-dépendance (un stage se référençant lui-même ferait
        // rejeter tout le plan par le BrainPlanValidator).
        .filter((d): d is string => Boolean(d) && d !== s.id);
      // La première étape du sous-plan reprend après le travail déjà validé
      // (fallback appliqué seulement si AUCUNE dépendance exploitable n'a été posée).
      if (s.dependsOn.length === 0 && completedIds.length > 0) {
        s.dependsOn = [completedIds[completedIds.length - 1]];
      }
    }

    // Nouveau plan = étapes complétées préservées + sous-graphe régénéré
    plan.stages = [...completedStages, ...reindexed];

    // Revalider le plan reconstruit
    const validation = this.validator.validate(plan);
    if (!validation.ok) {
      log.error(`Sous-graphe régénéré invalide : ${validation.issues.join(" ; ")}`);
      return false;
    }
    plan.mermaid = this.validator.toMermaid(plan);
    plan.status = "executing";
    return true;
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
