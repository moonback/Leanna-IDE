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
import { createLogger } from "../../utils/logger.js";
import type { AgentTask } from "../types.js";
import { AgentLead } from "../lead/AgentLead.js";
import type { ArbitrationVerdict, DelegationKind, LeadPolicy, LeadRunState, LeadStop, StopDecision } from "../lead/types.js";

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
  /** Agent Lead actif pour ce run (null = désactivé ou indisponible). */
  lead: LeadPolicy | null;
  leadState: LeadRunState | null;
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
  /** Politique de décision Agent Lead (défaut : AgentLead réel). */
  lead?: LeadPolicy;
}

export class AgentBrain {
  private understandingEngine: Pick<GoalUnderstandingEngine, "understand">;
  private planner: Pick<DynamicPlanner, "plan">;
  private verifier: BrainVerifier;
  private validator = new BrainPlanValidator();
  private orchestrator: AgentOrchestrator;
  private lead: LeadPolicy;
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
    this.lead = deps.lead ?? new AgentLead({
      runningCount: typeof this.orchestrator.getRunningCount === "function"
        ? (role) => this.orchestrator.getRunningCount(role)
        : undefined,
    });
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

    // Agent Lead : actif par défaut, désactivable par `lead: false`.
    const lead = input.lead === false ? null : this.lead;
    const leadState = lead
      ? this.safeLead("begin", () => lead.begin(plan, input.leadBudget), null as LeadRunState | null)
      : null;

    // Contexte partagé accumulé au fil de l'exécution (et des réplanifications)
    const ctx: BrainRunContext = {
      verifications: [],
      corrections: [],
      filesModified: new Set<string>(),
      stageResults: new Map<string, { stage: BrainStage; result?: any; durationMs: number }>(),
      correctionLoop: new BrainCorrectionLoop(input.maxCorrectionAttempts ?? 3),
      maxCorrectionAttempts: input.maxCorrectionAttempts ?? 3,
      understanding: plan.understanding,
      lead: leadState ? lead : null,
      leadState,
    };

    this.applyAgentSelection(plan, ctx);

    const scheduler = new BrainScheduler((stage, deps) => this.executeStage(stage, plan, ctx, deps));

    // Exécution initiale du DAG complet
    let report = await scheduler.execute(plan.stages);

    // ── Réplanification à chaud du sous-graphe restant (garde-fou anti-boucle) ──
    const maxReplans = input.maxReplans ?? 2;
    let replans = 0;
    while (report.failed.length > 0 && replans < maxReplans) {
      const gate = this.leadGate(ctx, "replan");
      if (!gate.continue) {
        log.warn(`🛑 Agent Lead : pas de réplanification (${gate.reason}) — ${gate.detail}`);
        break;
      }
      replans++;
      const replanned = await this.replanSubgraph(plan, report, ctx, replans, maxReplans);
      if (!replanned) {
        log.warn(`🛑 Réplanification impossible — arrêt propre après ${replans} tentative(s)`);
        break;
      }
      this.applyAgentSelection(plan, ctx);
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
    const leadStop = ctx.leadState?.stopped;
    const baseSummary = globalSuccess
      ? `Objectif accompli avec succès en ${plan.stages.length} étapes (${plan.stages.map((s) => s.agentRole).join(" → ")}). ${ctx.filesModified.size} fichier(s) mis à jour, validés et sans régression.`
      : `Exécution ${plan.status === "incomplete" ? "partielle" : "en échec"} — difficulté sur l'étape : ${failedStage?.title ?? "inconnue"}${replans > 0 ? ` (après ${replans} réplanification(s))` : ""}.`;
    const summary = !globalSuccess && leadStop
      ? `${baseSummary} Arrêt décidé par l'Agent Lead : ${leadStop.detail}.`
      : baseSummary;

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
      ...(ctx.leadState
        ? {
            stopReason: ctx.leadState.stopped?.reason,
            leadDecisions: [...ctx.leadState.decisions],
            budgetUsage: { delegations: ctx.leadState.delegations, wallTimeMs: totalDurationMs },
          }
        : {}),
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

    // Garde Agent Lead : aucune délégation une fois le budget épuisé.
    const gate = this.leadGate(ctx, "delegation");
    if (!gate.continue) {
      const stopped = this.leadStopVerification(stage, gate);
      stage.result = { success: false, outcome: "failed" as const, summary: stopped.summary, durationMs: 0, error: stopped.summary, filesModified: [] };
      ctx.verifications.push(stopped);
      return this.finishStage(stage, ctx, stopped, stageStartTime);
    }

    try {
      const delegatedTask: AgentTask = await this.delegateWithFallback(stage, ctx, {
        role: stage.agentRole,
        title: stage.title,
        description: `${stage.description}\n\nOutils autorisés : ${stage.tools.join(", ")}`,
        files: stage.files,
        instructions: stage.instructions,
        priority: stage.priority,
      }, "stage");

      const stageTaskResult = await this.awaitTaskCompletion(delegatedTask.id);
      stage.result = stageTaskResult;
      if (stageTaskResult?.filesModified) {
        for (const f of stageTaskResult.filesModified) ctx.filesModified.add(f);
      }
    } catch (err: any) {
      log.error(`❌ Erreur d'exécution de l'étape ${stage.id}: ${err.message}`);
      stage.result = {
        success: false,
        outcome: "failed" as const,
        summary: err.message ?? "Erreur d'exécution",
        durationMs: Date.now() - stageStartTime,
        error: err.message,
        filesModified: [],
      };
    }

    // Vérification
    let verification = await this.verifier.verifyStage(stage, ctx.understanding, Array.from(ctx.filesModified));
    ctx.verifications.push(verification);

    // Boucle de correction bornée, pilotée par l'arbitrage de l'Agent Lead
    let attempt = 1;
    let verdict = this.arbitrateStage(stage, verification, ctx, attempt);
    while ((verdict.action === "correct" || verdict.action === "reassign") && attempt <= ctx.maxCorrectionAttempts) {
      if (!this.leadGate(ctx, "delegation").continue) break;
      plan.status = "correcting";

      if (verdict.action === "reassign") {
        verification = await this.reassignStage(stage, ctx, verdict.toRole, verdict.rationale);
      } else {
        const corrected = await this.runCorrection(stage, ctx, verification, attempt, verdict.targetRole);
        if (!corrected) break;
        verification = corrected;
      }

      attempt++;
      verdict = this.arbitrateStage(stage, verification, ctx, attempt);
    }

    // Le Lead peut rejeter une étape que le vérificateur a laissée passer.
    if (verdict.action !== "accept" && verification.passed) {
      verification = {
        ...verification,
        passed: false,
        semanticCheckOk: false,
        summary: `Rejeté par l'Agent Lead : ${verdict.rationale}`,
        timestamp: new Date().toISOString(),
      };
      ctx.verifications.push(verification);
    }

    return this.finishStage(stage, ctx, verification, stageStartTime);
  }

  /** Une tentative de correction autonome (comportement historique), re-vérifiée. */
  private async runCorrection(
    stage: BrainStage,
    ctx: BrainRunContext,
    verification: StageVerification,
    attempt: number,
    targetRole?: string
  ): Promise<StageVerification | null> {
    log.warn(`⚠️ Correction autonome pour ${stage.id} (tentative ${attempt})`);
    const correction = ctx.correctionLoop.createCorrection(stage, verification, attempt, ctx.understanding);
    if (!correction) return null;
    if (targetRole) correction.targetRole = targetRole;
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
      const fixTask = await this.delegateWithFallback(stage, ctx, {
        role: correction.targetRole,
        title: `[Auto-Correction] Fix pour ${stage.title}`,
        description: correction.correctiveInstructions,
        files: correction.filesToFix,
        priority: "critical",
      }, "correction");

      const fixResult = await this.awaitTaskCompletion(fixTask.id);
      if (fixResult?.filesModified) {
        for (const f of fixResult.filesModified) ctx.filesModified.add(f);
      }
      // La re-vérification doit refléter l'état corrigé, pas l'échec initial.
      if (fixResult) stage.result = fixResult;
    } catch (corrErr: any) {
      log.error(`❌ Erreur pendant la correction: ${corrErr.message}`);
      return verification;
    }

    const next = await this.verifier.verifyStage(stage, ctx.understanding, Array.from(ctx.filesModified));
    ctx.verifications.push(next);
    if (next.passed) {
      correction.resolved = true;
      log.info(`✅ Auto-correction réussie pour ${stage.id} à la tentative ${attempt}`);
    }
    return next;
  }

  /** Réattribue l'étape à un autre agent (décision Agent Lead), puis re-vérifie. */
  private async reassignStage(
    stage: BrainStage,
    ctx: BrainRunContext,
    toRole: string,
    rationale: string
  ): Promise<StageVerification> {
    const fromRole = stage.agentRole;
    stage.agentRole = toRole;
    stage.agentReason = `${stage.agentReason} | Agent Lead : réattribution ${fromRole} → ${toRole} (${rationale})`;
    log.warn(`🔀 Agent Lead : réattribution de "${stage.title}" ${fromRole} → ${toRole}`);

    try {
      const task = await this.delegateWithFallback(stage, ctx, {
        role: toRole,
        title: `[Agent Lead] Réattribution : ${stage.title}`,
        description: `${stage.description}\n\nOutils autorisés : ${stage.tools.join(", ")}`,
        files: stage.files,
        instructions: stage.instructions,
        priority: stage.priority,
      }, "reassign");
      const result = await this.awaitTaskCompletion(task.id);
      if (result?.filesModified) {
        for (const f of result.filesModified) ctx.filesModified.add(f);
      }
      if (result) stage.result = result;
    } catch (err: any) {
      log.error(`❌ Réattribution échouée pour ${stage.id}: ${err.message}`);
    }

    const next = await this.verifier.verifyStage(stage, ctx.understanding, Array.from(ctx.filesModified));
    ctx.verifications.push(next);
    return next;
  }

  /** Clôture commune d'une étape : durées, résultat, comptabilité Lead, événement. */
  private finishStage(
    stage: BrainStage,
    ctx: BrainRunContext,
    verification: StageVerification,
    stageStartTime: number
  ): StageVerification {
    stage.durationMs = Date.now() - stageStartTime;
    stage.completedAt = new Date().toISOString();
    ctx.stageResults.set(stage.id, { stage, result: stage.result, durationMs: stage.durationMs });

    if (ctx.lead && ctx.leadState) {
      const lead = ctx.lead;
      const state = ctx.leadState;
      this.safeLead("recordStageOutcome", () => lead.recordStageOutcome(state, stage.id, verification.passed, ctx.filesModified.size), undefined);
    }

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
   * Délègue via l'orchestrateur en comptant la délégation dans le budget du
   * Lead. Si le rôle est à capacité maximale, le Lead propose un autre agent
   * (une seule nouvelle tentative).
   */
  private async delegateWithFallback(
    stage: BrainStage,
    ctx: BrainRunContext,
    params: Parameters<AgentOrchestrator["delegateTask"]>[0],
    kind: DelegationKind
  ): Promise<AgentTask> {
    const lead = ctx.lead;
    const state = ctx.leadState;
    if (lead && state) this.safeLead("recordDelegation", () => lead.recordDelegation(state, kind), undefined);

    try {
      return await this.orchestrator.delegateTask(params);
    } catch (err: any) {
      const message = String(err?.message ?? err);
      if (!lead || !state || !message.includes("capacité maximale")) throw err;
      const alt = this.safeLead("nextBestRole", () => lead.nextBestRole(stage, state, [params.role]), null as string | null);
      if (!alt) throw err;
      log.info(`🔁 Agent Lead : ${params.role} à capacité maximale → ${alt}`);
      if (kind !== "correction") {
        stage.agentReason = `${stage.agentReason} | Agent Lead : ${params.role} à capacité maximale → ${alt}`;
        stage.agentRole = alt;
      }
      return await this.orchestrator.delegateTask({ ...params, role: alt });
    }
  }

  /** Verdict d'étape : Agent Lead si actif, sinon règles historiques. */
  private arbitrateStage(
    stage: BrainStage,
    verification: StageVerification,
    ctx: BrainRunContext,
    attempt: number
  ): ArbitrationVerdict {
    const legacy: ArbitrationVerdict = verification.passed
      ? { action: "accept", rationale: "vérification réussie" }
      : attempt <= ctx.maxCorrectionAttempts
        ? { action: "correct", rationale: "vérification échouée" }
        : { action: "abandon", rationale: "tentatives épuisées" };
    const lead = ctx.lead;
    const state = ctx.leadState;
    if (!lead || !state) return legacy;
    const verdict = this.safeLead(
      "arbitrate",
      () => lead.arbitrate({ stage, verification, result: stage.result, attempt, maxAttempts: ctx.maxCorrectionAttempts }, state),
      legacy
    );
    // Garde-fou : le Lead ne peut pas accepter une étape non vérifiée.
    return verdict.action === "accept" && !verification.passed ? legacy : verdict;
  }

  /** Point de décision continuer/arrêter (toujours « continuer » sans Lead). */
  private leadGate(ctx: BrainRunContext, point: "delegation" | "replan"): StopDecision {
    const lead = ctx.lead;
    const state = ctx.leadState;
    if (!lead || !state) return { continue: true };
    return this.safeLead("shouldContinue", () => lead.shouldContinue(state, point), { continue: true } as StopDecision);
  }

  /** Réaffectation des rôles des étapes en attente ; régénère le Mermaid si besoin. */
  private applyAgentSelection(plan: BrainPlan, ctx: BrainRunContext): void {
    const lead = ctx.lead;
    const state = ctx.leadState;
    if (!lead || !state) return;
    const before = plan.stages.map((s) => s.agentRole).join("|");
    this.safeLead("selectAgents", () => lead.selectAgents(plan, state), undefined);
    if (plan.stages.map((s) => s.agentRole).join("|") !== before) {
      plan.mermaid = this.validator.toMermaid(plan);
    }
  }

  private leadStopVerification(stage: BrainStage, stop: LeadStop): StageVerification {
    const summary = `Arrêt Agent Lead : ${stop.detail}`;
    return {
      stageId: stage.id,
      role: stage.agentRole,
      passed: false,
      syntaxCheckOk: false,
      testsOk: false,
      semanticCheckOk: false,
      issues: [{ severity: "error", message: summary, rule: "agent_lead_stop" }],
      summary,
      timestamp: new Date().toISOString(),
    };
  }

  /** Exécute un hook du Lead ; en cas d'exception, journalise et renvoie le repli historique. */
  private safeLead<T>(label: string, fn: () => T, fallback: T): T {
    try {
      return fn();
    } catch (err: any) {
      log.warn(`Agent Lead (${label}) en erreur — repli sur le comportement standard : ${err?.message ?? err}`);
      return fallback;
    }
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
    const reindexed: BrainStage[] = regenerated.map((s, i) => {
      const newId = `replan${replanIndex}-${i + 1}-${s.agentRole}`;
      return { ...s, id: newId, status: "pending" as const, result: undefined };
    });
    // Remapper les dépendances internes (anciennes → nouvelles) au sein du sous-plan
    const idMap = new Map<string, string>();
    regenerated.forEach((s, i) => idMap.set(s.id, reindexed[i].id));
    for (const s of reindexed) {
      s.dependsOn = (s.dependsOn ?? [])
        .map((d) => idMap.get(d))
        .filter((d): d is string => Boolean(d));
      // La première étape du sous-plan reprend après le travail déjà validé
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
