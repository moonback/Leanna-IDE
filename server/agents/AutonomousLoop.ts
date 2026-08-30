/**
 * AutonomousLoop — Boucle de décision autonome Observe → Decide → Act
 *
 * Enveloppe l'AgentExecutor pour permettre aux agents d'itérer sur leur propre
 * travail de manière autonome, sans intervention humaine.
 *
 * Cycle par itération :
 *   1. OBSERVE  — Analyse le résultat de l'itération précédente
 *   2. DECIDE   — Détermine si une itération supplémentaire est nécessaire
 *   3. ACT      — Relance l'exécution avec un prompt enrichi du contexte accumulé
 *
 * Conditions de ré-itération :
 *   - L'agent a émis un signal ## RETRY dans sa sortie
 *   - Des fichiers écrits ont des erreurs de vérification (verify_file)
 *   - La confiance du résultat est trop basse (score interne)
 *   - Des délégations ont échoué et l'agent veut les ré-essayer
 *
 * Conditions d'arrêt :
 *   - Résultat jugé satisfaisant (pas de signal RETRY, confiance suffisante)
 *   - Nombre max d'itérations atteint (configurable, défaut: 3)
 *   - Timeout global dépassé
 *   - Deux itérations consécutives produisent le même résultat (détection de boucle)
 *
 * Améliorations implémentées :
 *   - Détection précoce des erreurs avec analyse sémantique
 *   - Stratégies de pivot : questionnement, recherche contextuelle, délégation
 *   - Proactivité accrue avec propositions d'alternatives
 */
import { randomUUID } from "crypto";
import type { AgentTask, TaskResult } from "./types.js";
import { AgentExecutor } from "./AgentExecutor.js";
import { getAgentDefinition } from "./roles.js";
import { createLogger } from "../utils/logger.js";
import { EarlyErrorDetection, createEarlyErrorDetection, type ErrorAnalysisReport } from "./EarlyErrorDetection.js";
import { PivotStrategies, createPivotStrategies, type PivotDecision, type PivotType } from "./PivotStrategies.js";

const log = createLogger("AutonomousLoop");

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface LoopConfig {
  /** Nombre maximum d'itérations (défaut: 3) */
  maxIterations: number;
  /** Timeout global pour toutes les itérations cumulées (ms, défaut: 5 min) */
  globalTimeoutMs: number;
  /** Seuil de confiance minimum pour accepter un résultat (0-1, défaut: 0.6) */
  minConfidenceScore: number;
  /** Activer la vérification des fichiers après écriture (défaut: true) */
  verifyFiles: boolean;
}

export interface IterationRecord {
  iteration: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  resultSummary: string;
  confidenceScore: number;
  decision: LoopDecision;
  decisionReason: string;
  filesWritten: string[];
  delegationsSent: number;
  retrySignal: boolean;
  verifyErrors: string[];
}

export type LoopDecision = "continue" | "stop" | "stop_loop_detected" | "stop_timeout" | "stop_max_iterations";

export interface LoopResult {
  finalTask: AgentTask;
  totalIterations: number;
  totalDurationMs: number;
  iterations: IterationRecord[];
  finalDecision: LoopDecision;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: LoopConfig = {
  maxIterations: 3,
  globalTimeoutMs: 5 * 60 * 1000, // 5 minutes
  minConfidenceScore: 0.6,
  verifyFiles: true,
};

// Seuil de similarité pour la détection de boucle (0-1)
const LOOP_DETECTION_SIMILARITY = 0.85;

// Budget maximal d'erreurs cumulées avant arrêt forcé
const MAX_CUMULATIVE_ERRORS = 6;

// ═══════════════════════════════════════════════════════════════════════════════
// AutonomousLoop
// ═══════════════════════════════════════════════════════════════════════════════

export class AutonomousLoop {
  // Nouveaux composants pour l'amélioration de l'autonomie
  private readonly earlyErrorDetection: EarlyErrorDetection;
  private readonly pivotStrategies: PivotStrategies;
  
  // État pour le tracking des échecs et des pivots
  private consecutiveFailures: number = 0;
  private lastPivotDecision?: PivotDecision;
  private pivotHistory: PivotDecision[] = [];
  
  // Historique des analyses d'erreurs pour le contexte
  private errorAnalysisHistory: ErrorAnalysisReport[] = [];

  constructor(
    private readonly executor: AgentExecutor,
    private readonly config: LoopConfig = DEFAULT_CONFIG
  ) {
    // Initialiser les modules d'amélioration
    this.earlyErrorDetection = createEarlyErrorDetection();
    this.pivotStrategies = createPivotStrategies();
  }

  /**
   * Exécute une tâche dans la boucle autonome.
   * Peut lancer plusieurs itérations selon la décision interne.
   */
  async run(task: AgentTask): Promise<LoopResult> {
    const agent = getAgentDefinition(task.role);
    const globalStart = Date.now();
    const iterations: IterationRecord[] = [];
    let iteration = 0;
    let finalDecision: LoopDecision = "stop";

    log.info(
      `🔄 [${agent.name}] AutonomousLoop démarré — max ${this.config.maxIterations} itérations`
    );

    // Snapshot du contexte original pour ne pas le corrompre entre itérations
    const originalDescription = task.description;
    const originalFiles = [...task.context.files];

    while (iteration < this.config.maxIterations) {
      iteration++;

      // ── Vérification timeout global ──
      const elapsed = Date.now() - globalStart;
      if (elapsed >= this.config.globalTimeoutMs) {
        log.warn(
          `[${agent.name}] Timeout global atteint (${elapsed}ms) — arrêt après itération ${iteration - 1}`
        );
        finalDecision = "stop_timeout";
        break;
      }

      log.info(`[${agent.name}] Itération ${iteration}/${this.config.maxIterations}`);

      const iterStart = Date.now();

      // ── ACT : exécuter l'itération ──
      await this.executor.execute(task);

      const iterDuration = Date.now() - iterStart;
      const result = task.result;

      if (!result) {
        log.error(`[${agent.name}] Pas de résultat à l'itération ${iteration} — arrêt`);
        finalDecision = "stop";
        break;
      }

      // ── OBSERVE : analyser le résultat avec détection précoce des erreurs ──
      const observation = await this.observe(task, result);
      
      // Analyser avec le module de détection précoce des erreurs
      const errorAnalysis = this.earlyErrorDetection.analyzeExecutionReport({
        success: result.success,
        details: result.details,
        fileValidationErrors: result.fileValidationErrors,
        filesModified: result.filesModified,
        errors: observation.verifyErrors,
      });
      
      // Mettre à jour l'historique des analyses
      this.errorAnalysisHistory.push(errorAnalysis);
      
      // Mettre à jour le compteur d'échecs
      if (!result.success) {
        this.consecutiveFailures++;
        this.pivotStrategies.updateAfterIteration(false, errorAnalysis.errors);
      } else {
        this.consecutiveFailures = 0;
        this.pivotStrategies.updateAfterIteration(true, []);
      }

      const record: IterationRecord = {
        iteration,
        startedAt: task.startedAt ?? new Date().toISOString(),
        completedAt: task.completedAt ?? new Date().toISOString(),
        durationMs: iterDuration,
        resultSummary: result.summary,
        confidenceScore: observation.confidenceScore,
        decision: "continue", // sera mis à jour
        decisionReason: "",
        filesWritten: result.filesModified ?? [],
        delegationsSent: result.delegatedSubTasks?.length ?? 0,
        retrySignal: observation.hasRetrySignal,
        verifyErrors: observation.verifyErrors,
      };

      // ── DECIDE : décider de continuer ou non, avec stratégies de pivot ──
      const decision = await this.decideWithPivotStrategies(
        observation, 
        iterations, 
        iteration, 
        errorAnalysis,
        task,
        result,
        elapsed
      );
      record.decision = decision.action;
      record.decisionReason = decision.reason;
      
      // Stocker la décision de pivot si applicable
      if (decision.pivotDecision) {
        this.lastPivotDecision = decision.pivotDecision;
        this.pivotHistory.push(decision.pivotDecision);
      }
      iterations.push(record);

      log.info(
        `[${agent.name}] Itération ${iteration} — confiance: ${(observation.confidenceScore * 100).toFixed(0)}% — décision: ${decision.action} (${decision.reason})`
      );

      if (decision.action !== "continue") {
        finalDecision = decision.action;
        break;
      }

      // ── Préparer l'itération suivante ──
      this.enrichTaskForNextIteration(task, result, observation, iteration, originalDescription, originalFiles);

      // Reset du statut pour la prochaine itération
      task.status = "pending";
      task.startedAt = undefined;
      task.completedAt = undefined;
    }

    // Si on a atteint le max sans décision explicite
    if (iteration >= this.config.maxIterations && finalDecision === "stop") {
      finalDecision = "stop_max_iterations";
      log.info(`[${agent.name}] Max itérations atteint (${this.config.maxIterations})`);
    }

    const totalDuration = Date.now() - globalStart;
    log.info(
      `✅ [${agent.name}] AutonomousLoop terminé — ${iteration} itération(s) en ${(totalDuration / 1000).toFixed(1)}s — décision finale: ${finalDecision}`
    );

    return {
      finalTask: task,
      totalIterations: iteration,
      totalDurationMs: totalDuration,
      iterations,
      finalDecision,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OBSERVE
  // ═══════════════════════════════════════════════════════════════════════════

  private async observe(
    task: AgentTask,
    result: TaskResult
  ): Promise<ObservationReport> {
    const details = result.details ?? "";

    // Signal explicite de retry dans la sortie de l'agent
    const hasRetrySignal =
      result.success === false ||
      /##\s*RETRY|##\s*RELANCER|##\s*CORRECTION_NÉCESSAIRE/i.test(details);

    // Un échec ne peut jamais être interprété comme un signal DONE.
    const hasDoneSignal =
      result.success === true && /##\s*TERMINÉ|##\s*DONE|##\s*COMPLET/i.test(details);

    const verifyErrors: string[] = [];

    // Erreurs déjà connues à l'écriture (rejets pré-validation, cf. GeneratedFileWriter)
    if (result.fileValidationErrors?.length) {
      for (const e of result.fileValidationErrors) {
        verifyErrors.push(`${e.path}: ${e.error}`);
      }
    }

    // AgentExecutor vérifie déjà chaque écriture et expose la preuve structurée.
    // Ne relancer les vérifications que si cette preuve est absente ou négative.
    const evidencePassed = result.evidence?.verification.passed === true;
    if (this.config.verifyFiles && result.filesModified?.length && !evidencePassed) {
      for (const file of result.filesModified.slice(0, 5)) {
        const error = await this.verifyFile(file);
        if (error) verifyErrors.push(`${file}: ${error}`);
      }
    }

    // Validation build synchrone uniquement lorsque l’exécuteur n’a pas déjà
    // fourni une vérification complète, afin d’éviter le double travail.
    if (result.filesModified?.length && !evidencePassed) {
      try {
        const { runValidation } = await import("../utils/postEditValidator");
        const buildResult = await runValidation();
        if (!buildResult.valid && buildResult.errors) {
          verifyErrors.push(`build: ${buildResult.errors.slice(0, 500)}`);
        }
      } catch {
        // non bloquant si la validation échoue à se lancer
      }
    }

    // Score de confiance composite (avec tracking des erreurs précédentes)
    const confidenceScore = this.computeConfidence({
      success: result.success,
      hasRetrySignal,
      hasDoneSignal,
      verifyErrors,
      resultLength: details.length,
      filesWritten: result.filesModified?.length ?? 0,
      previousErrorCount: (task.context as any)?._previousErrorCount,
    });

    // Stocker le nombre d'erreurs pour la prochaine itération
    (task.context as any)._previousErrorCount = verifyErrors.length;

    return {
      hasRetrySignal,
      hasDoneSignal,
      verifyErrors,
      confidenceScore,
      resultLength: details.length,
      resultSummary: result.summary,
    };
  }

  private async verifyFile(filePath: string): Promise<string | null> {
    try {
      const result = await (this.executor as any).skillHandler?.("verify_file", { path: filePath });
      if (!result || result.ok === true || result.status === "success") return null;
      const issues = Array.isArray(result.allIssues)
        ? result.allIssues.slice(0, 10).map((issue: any) => `${issue.file ?? "global"}${issue.line ? `:${issue.line}` : ""} — ${issue.message ?? "Erreur"}`)
        : [];
      const phases = [result.typecheck, result.lint, result.test].filter((phase: any) => phase?.ok === false);
      const phaseOutput = phases.flatMap((phase: any) => [phase.output, phase.stdout, phase.stderr]).filter(Boolean);
      const details = [...issues, ...phaseOutput, result.message, result.stderr, result.error].filter(Boolean).join("\n");
      return details.slice(0, 5000) || `verify_file a échoué (code ${result.exitCode ?? "inconnu"}).`;
    } catch (error) {
      return `verify_file indisponible: ${(error as Error).message}`;
    }
  }

  private computeConfidence(factors: {
    success: boolean;
    hasRetrySignal: boolean;
    hasDoneSignal: boolean;
    verifyErrors: string[];
    resultLength: number;
    filesWritten: number;
    previousErrorCount?: number;
  }): number {
    let score = factors.success ? 0.5 : 0.1;

    // Bonus : signal DONE explicite
    if (factors.hasDoneSignal) score += 0.2;

    // Malus : signal RETRY explicite
    if (factors.hasRetrySignal) score -= 0.3;

    // Malus : erreurs de vérification de fichiers
    score -= factors.verifyErrors.length * 0.15;

    // Malus amplifié : les erreurs n'ont pas diminué entre itérations
    if (
      factors.previousErrorCount !== undefined &&
      factors.verifyErrors.length >= factors.previousErrorCount &&
      factors.previousErrorCount > 0
    ) {
      score -= 0.25;
    }

    // Bonus modéré : résultat détaillé (plafonné pour éviter le "gonflage")
    if (factors.resultLength > 500) score += 0.05;
    if (factors.resultLength > 2000) score += 0.05;

    // Bonus fichiers produits (uniquement si pas d'erreurs)
    if (factors.filesWritten > 0 && factors.verifyErrors.length === 0) score += 0.1;

    return Math.max(0, Math.min(1, score));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DECIDE
  // ═══════════════════════════════════════════════════════════════════════════

  private decide(
    obs: ObservationReport,
    history: IterationRecord[],
    currentIteration: number
  ): { action: LoopDecision; reason: string } {
    // ── Budget d'erreurs cumulées — arrêt forcé si trop d'erreurs au total ──
    const totalCumulativeErrors = history.reduce(
      (sum, it) => sum + it.verifyErrors.length, 0
    ) + obs.verifyErrors.length;

    if (totalCumulativeErrors > MAX_CUMULATIVE_ERRORS) {
      return {
        action: "stop",
        reason: `Budget d'erreurs épuisé (${totalCumulativeErrors} erreurs cumulées > ${MAX_CUMULATIVE_ERRORS}) — intervention humaine requise`,
      };
    }

    // ── Détection de boucle : comparer les summaries des itérations ──
    if (history.length >= 1) {
      const lastSummary = history[history.length - 1].resultSummary;

      // Comparaison par similarité textuelle entre les deux derniers résumés
      const similarity = this.stringSimilarity(lastSummary, obs.resultSummary);
      if (similarity > LOOP_DETECTION_SIMILARITY) {
        return {
          action: "stop_loop_detected",
          reason: `Résultat trop similaire au précédent (similarité: ${(similarity * 100).toFixed(0)}%)`,
        };
      }

      // Double vérification : deux itérations successives avec summaries identiques
      if (history.length >= 2) {
        const prev1 = history[history.length - 1].resultSummary;
        const prev2 = history[history.length - 2].resultSummary;
        const prevSimilarity = this.stringSimilarity(prev1, prev2);
        if (prevSimilarity > LOOP_DETECTION_SIMILARITY) {
          return {
            action: "stop_loop_detected",
            reason: `Deux itérations consécutives quasi-identiques détectées (${(prevSimilarity * 100).toFixed(0)}%)`,
          };
        }
      }
    }

    // ── Erreurs qui ne diminuent pas — l'agent tourne en rond ──
    if (history.length >= 1 && obs.verifyErrors.length > 0) {
      const lastErrors = history[history.length - 1].verifyErrors.length;
      if (obs.verifyErrors.length >= lastErrors && lastErrors > 0) {
        // Les erreurs n'ont pas diminué — vérifier si c'est la 2e fois consécutive
        if (
          history.length >= 2 &&
          history[history.length - 2].verifyErrors.length <= lastErrors
        ) {
          return {
            action: "stop",
            reason: `Les erreurs ne diminuent pas (${obs.verifyErrors.length} ≥ ${lastErrors}) — l'agent ne progresse plus`,
          };
        }
      }
    }

    // ── Confiance suffisante → arrêt ──
    if (obs.confidenceScore >= this.config.minConfidenceScore && !obs.hasRetrySignal) {
      return {
        action: "stop",
        reason: `Confiance suffisante (${(obs.confidenceScore * 100).toFixed(0)}% ≥ ${(this.config.minConfidenceScore * 100).toFixed(0)}%)`,
      };
    }

    // ── Signal RETRY explicite → continuer ──
    if (obs.hasRetrySignal) {
      return {
        action: "continue",
        reason: "Signal RETRY explicite de l'agent",
      };
    }

    // ── Erreurs de vérification → continuer pour corriger ──
    if (obs.verifyErrors.length > 0) {
      return {
        action: "continue",
        reason: `${obs.verifyErrors.length} erreur(s) de vérification à corriger`,
      };
    }

    // ── Confiance trop basse → continuer ──
    if (obs.confidenceScore < this.config.minConfidenceScore) {
      return {
        action: "continue",
        reason: `Confiance insuffisante (${(obs.confidenceScore * 100).toFixed(0)}% < ${(this.config.minConfidenceScore * 100).toFixed(0)}%)`,
      };
    }

    return { action: "stop", reason: "Résultat acceptable" };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DECIDE avec Stratégies de Pivot
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Décision de continuation/arrêt avec intégration des stratégies de pivot.
   * Cette méthode étend la logique de décision de base avec :
   * - Détection précoce des erreurs
   * - Stratégies de pivot (questionnement, recherche contextuelle, délégation)
   * - Proactivité accrue avec propositions d'alternatives
   */
  private async decideWithPivotStrategies(
    obs: ObservationReport,
    history: IterationRecord[],
    currentIteration: number,
    errorAnalysis: ErrorAnalysisReport,
    task: AgentTask,
    result: TaskResult,
    elapsedTimeMs: number
  ): Promise<LoopDecisionWithPivot> {
    const agent = getAgentDefinition(task.role);
    
    // 1. D'abord, vérifier les stratégies de pivot
    const pivotContext: any = {
      task,
      previousResult: result,
      errorAnalysis,
      iterationCount: currentIteration,
      maxIterations: this.config.maxIterations,
      elapsedTimeMs,
      iterationHistory: history.map(h => ({
        iteration: h.iteration,
        errors: [], // On pourrait enrichir cela avec les erreurs historiques
        success: !h.verifyErrors || h.verifyErrors.length === 0,
        decision: h.decision,
      })),
      availableTools: this.getAvailableTools(),
      availableAgents: this.getAvailableAgents(),
    };

    const pivotDecision = await this.pivotStrategies.decidePivot(pivotContext);
    
    // 2. Si une stratégie de pivot nécessite une action immédiate (questionnement ou arrêt),
    // donner la priorité au pivot
    if (pivotDecision.type === "questioning" || pivotDecision.type === "stop") {
      return {
        action: pivotDecision.type === "stop" ? "stop" : "stop",
        reason: pivotDecision.reason,
        pivotDecision,
      };
    }

    // 3. Pour les autres types de pivot, appliquer la logique de décision normale
    // mais en tenant compte de la décision de pivot
    const baseDecision = this.decide(obs, history, currentIteration);
    
    // 4. Si une recherche contextuelle est nécessaire, EXÉCUTER la recherche
    if (pivotDecision.type === "contextual_research" && pivotDecision.researchQuery) {
      log.info(
        `[${agent.name}] Recherche contextuelle nécessaire: ${pivotDecision.researchQuery}`
      );
      
      // Exécuter la recherche via l'executor (si l'outil est disponible)
      const researchResult = await this.executeBrowserResearch(pivotDecision.researchQuery);
      if (researchResult) {
        // Intégrer les résultats de la recherche dans le contexte de la tâche
        this.enrichContextWithResearchResults(task, researchResult, errorAnalysis);
      }
    }
    
    // 5. Intégrer la proactivité : si on a un échec, proposer des alternatives
    if (!result.success) {
      // Proposer des alternatives proactivement
      this.handleProactiveSuggestions(errorAnalysis, task, result);
    }

    // 6. Si une délégation est recommandée, l'inclure dans la décision
    if (pivotDecision.type === "delegation" && pivotDecision.targetAgent) {
      log.info(
        `[${agent.name}] Délégation recommandée vers: ${pivotDecision.targetAgent}`
      );
      // On pourrait ici déléguer à l'agent cible
    }

    return {
      ...baseDecision,
      pivotDecision,
    };
  }

  /**
   * Gère les suggestions proactives lors d'un échec.
   * Propose des alternatives dès le premier échec.
   */
  private handleProactiveSuggestions(
    errorAnalysis: ErrorAnalysisReport,
    task: AgentTask,
    result: TaskResult
  ): void {
    const agent = getAgentDefinition(task.role);
    const { errors, categories, riskScore } = errorAnalysis;

    if (errors.length === 0) return;

    // Générer des alternatives
    const alternatives = this.pivotStrategies.generateAlternatives(errorAnalysis, task);
    
    if (alternatives.length > 0) {
      const alternativeDescriptions = alternatives
        .slice(0, 3)
        .map(alt => `  - ${alt.description} (succès: ${(alt.successProbability * 100).toFixed(0)}%)`)
        .join('\n');

      log.info(
        `[${agent.name}] ⚡ PROACTIF: ${alternatives.length} alternative(s) disponible(s) pour résoudre les erreurs:`
      );
      log.info(alternativeDescriptions);

      // Ajouter les alternatives au contexte de la tâche pour la prochaine itération
      this.enrichContextWithAlternatives(task, alternatives, errorAnalysis);
    }

    // Générer des questions si nécessaire (après 2 échecs ou score de risque élevé)
    if (this.consecutiveFailures >= 2 || riskScore > 0.7) {
      const questions = this.pivotStrategies.generateClarificationQuestion(errorAnalysis, task);
      
      if (questions.length > 0) {
        log.warn(
          `[${agent.name}] ❓ QUESTIONNEMENT: Après ${this.consecutiveFailures} échec(s), clarification nécessaire:`
        );
        for (const question of questions) {
          log.warn(`  - ${question}`);
        }

        // Ajouter les questions au contexte pour la communication utilisateur
        this.enrichContextWithQuestions(task, questions);
      }
    }

    // Recommandations basées sur l'analyse des erreurs
    if (errorAnalysis.recommendations.length > 0) {
      log.info(
        `[${agent.name}] 💡 RECOMMANDATIONS:`
      );
      for (const recommendation of errorAnalysis.recommendations.slice(0, 3)) {
        log.info(`  - ${recommendation}`);
      }
    }
  }

  /**
   * Enrichit le contexte de la tâche avec les alternatives proposées
   */
  private enrichContextWithAlternatives(
    task: AgentTask,
    alternatives: any[],
    errorAnalysis: ErrorAnalysisReport
  ): void {
    const alternativeSection = [
      ``,
      `## Alternatives Proposées (Proactivité Accrue)`,
      ``,
      `J'ai détecté des erreurs et je propose les alternatives suivantes :`,
      ...alternatives.map((alt: any) => `
- **${alt.description}** (probabilité: ${(alt.successProbability * 100).toFixed(0)}%, complexité: ${alt.complexity})
`),
      ``,
      `Tu peux choisir l'une de ces approches ou continuer normalement.`,
    ].join('\n');

    if (!task.context.pivotSuggestions) {
      task.context.pivotSuggestions = [];
    }
    task.context.pivotSuggestions.push({
      iteration: this.errorAnalysisHistory.length,
      alternatives: alternatives.map((alt: any) => ({
        description: alt.description,
        action: alt.action,
        successProbability: alt.successProbability,
      })),
      errorAnalysis: {
        totalErrors: errorAnalysis.totalErrors,
        categories: errorAnalysis.categories,
        riskScore: errorAnalysis.riskScore,
      },
    });
  }

  /**
   * Enrichit le contexte de la tâche avec les questions pour l'utilisateur
   */
  private enrichContextWithQuestions(task: AgentTask, questions: string[]): void {
    if (!task.context.clarificationQuestions) {
      task.context.clarificationQuestions = [];
    }
    task.context.clarificationQuestions = [...task.context.clarificationQuestions, ...questions];

    // Ajouter une indication dans la description de la tâche
    if (questions.length > 0) {
      const questionsSection = [
        ``,
        `## Questions pour clarification (Pivot par Questionnement)`,
        ``,
        `Pour mieux résoudre cette tâche, pourriez-vous répondre à ces questions :`,
        ...questions.map(q => `- ${q}`),
        ``,
      ].join('\n');

      task.description = `${task.description}\n${questionsSection}`;
    }
  }

  /**
   * Récupère la liste des outils disponibles pour les stratégies de pivot
   */
  private getAvailableTools(): string[] {
    // Pour l'instant, retourner les outils connus
    // En réalité, cela devrait provenir de la configuration de l'agent
    return [
      "list_project_files",
      "read_project_file",
      "write_project_file",
      "modify_project_file",
      "verify_file",
      "browser_research",
      "reasoning_think",
      "agent_execute",
    ];
  }

  /**
   * Récupère la liste des agents disponibles pour la délégation
   */
  private getAvailableAgents(): string[] {
    // Pour l'instant, retourner les rôles d'agents connus
    // En réalité, cela devrait provenir de l'AgentOrchestrator
    return [
      "developer",
      "code_reviewer",
      "debugger",
      "tester",
      "architect",
      "devops",
      "sysadmin",
      "generalist",
    ];
  }

  /**
   * Exécute une recherche browser_research pour résoudre les erreurs
   */
  private async executeBrowserResearch(query: string): Promise<string | null> {
    const agent = getAgentDefinition(this.executor as any);
    
    try {
      // Utiliser le skillHandler de l'executor pour appeler browser_research
      const skillHandler = (this.executor as any).skillHandler;
      if (skillHandler) {
        log.info(`[Browser Research] Exécution de la recherche: "${query}"`);
        
        const result = await skillHandler("browser_research", { 
          query: query, 
          maxSources: 3 
        });
        
        if (result && result.success !== false) {
          log.info(`[Browser Research] Recherche réussie`);
          return typeof result === 'string' ? result : JSON.stringify(result);
        } else {
          log.warn(`[Browser Research] Recherche échouée: ${result?.error || 'inconnu'}`);
        }
      } else {
        log.warn(`[Browser Research] skillHandler non disponible`);
      }
    } catch (error) {
      log.error(`[Browser Research] Erreur lors de la recherche: ${(error as Error).message}`);
    }
    
    return null;
  }

  /**
   * Enrichit le contexte de la tâche avec les résultats de la recherche
   */
  private enrichContextWithResearchResults(
    task: AgentTask,
    researchResult: string,
    errorAnalysis: ErrorAnalysisReport
  ): void {
    const agent = getAgentDefinition(task.role);
    
    // Ajouter les résultats de la recherche au contexte
    const researchSection = [
      ``,
      `## Résultats de la recherche contextuelle (Pivot par Recherche)`,
      ``,
      `J'ai effectué une recherche pour résoudre les erreurs détectées:`,
      ``,
      researchResult,
      ``,
      `Source: recherche web automatique`,
    ].join('\n');

    // Ajouter au contexte de la tâche
    if (!task.context.metadata) {
      task.context.metadata = {};
    }
    
    task.context.metadata.researchResults = [
      ...(task.context.metadata.researchResults as any[] || []),
      {
        query: errorAnalysis.errors.map(e => e.message).join('; '),
        result: researchResult,
        categories: errorAnalysis.categories,
        riskScore: errorAnalysis.riskScore,
        timestamp: new Date().toISOString(),
      }
    ];

    // Ajouter à la description de la tâche
    task.description = `${task.description}\n${researchSection}`;

    log.info(
      `[${agent.name}] Contexte enrichi avec les résultats de la recherche`
    );
  }

  /**
   * Réinitialise l'état interne de la boucle pour une nouvelle tâche
   */
  reset(): void {
    this.consecutiveFailures = 0;
    this.lastPivotDecision = undefined;
    this.pivotHistory = [];
    this.errorAnalysisHistory = [];
    this.earlyErrorDetection.reset();
    this.pivotStrategies.reset();
  }

  /**
   * Récupère l'historique des décisions de pivot
   */
  getPivotHistory(): any[] {
    return [...this.pivotHistory];
  }

  /**
   * Récupère l'historique des analyses d'erreurs
   */
  getErrorAnalysisHistory(): ErrorAnalysisReport[] {
    return [...this.errorAnalysisHistory];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACT — Enrichissement du contexte pour la prochaine itération
  // ═══════════════════════════════════════════════════════════════════════════

  private enrichTaskForNextIteration(
    task: AgentTask,
    prevResult: TaskResult,
    obs: ObservationReport,
    iterationNumber: number,
    originalDescription: string,
    originalFiles: string[]
  ): void {
    const correctionParts: string[] = [
      `## Contexte de l'itération ${iterationNumber} (à corriger / améliorer)`,
      ``,
      `**Résultat précédent :** ${prevResult.summary}`,
    ];

    if (obs.verifyErrors.length > 0) {
      correctionParts.push(
        ``,
        `**⚠️ Erreurs de vérification détectées :**`,
        ...obs.verifyErrors.map((e) => `- ${e}`),
        ``,
        `**→ Tu DOIS corriger ces erreurs dans cette itération.**`
      );
    }

    if (obs.hasRetrySignal) {
      // Extraire le contenu du bloc ## RETRY pour guider l'itération suivante
      const retryMatch = prevResult.details?.match(
        /##\s*RETRY\s*\n([\s\S]*?)(?=\n##|$)/i
      );
      if (retryMatch) {
        correctionParts.push(
          ``,
          `**Signal RETRY de l'itération précédente :**`,
          retryMatch[1].trim()
        );
      }
    }

    // Injecter le contexte de correction dans la description de la tâche
    task.description = `${originalDescription}\n\n${correctionParts.join("\n")}`;

    // Ajouter les fichiers produits à la précédente itération comme contexte
    if (prevResult.filesModified?.length) {
      const newFiles = [
        ...originalFiles,
        ...prevResult.filesModified,
      ].filter((v, i, arr) => arr.indexOf(v) === i);
      task.context.files = newFiles;
    }

    // Injecter un résumé léger du résultat précédent (pas le résultat complet)
    // pour ne pas saturer la fenêtre de contexte du LLM
    const lightResult = {
      summary: prevResult.summary,
      success: prevResult.success,
      errors: obs.verifyErrors,
      filesModified: prevResult.filesModified,
    };

    task.context.previousResults = [
      ...(task.context.previousResults ?? []),
      lightResult as any,
    ].slice(-2); // Max 2 itérations précédentes pour garder le prompt léger

    log.debug(
      `[Itération ${iterationNumber + 1}] Contexte enrichi — ${task.context.files.length} fichier(s), ${task.context.previousResults.length} résultat(s) précédent(s)`
    );
  }

  // ─── Utilitaires ──────────────────────────────────────────────────────────

  private stringSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (!a || !b) return 0;
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    if (longer.length === 0) return 1;
    return (longer.length - this.editDistance(longer, shorter)) / longer.length;
  }

  private editDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    // Optimisation : limiter à 200 chars pour ne pas bloquer sur de gros textes
    const sa = a.slice(0, 200);
    const sb = b.slice(0, 200);
    const dp: number[][] = Array.from({ length: sa.length + 1 }, (_, i) =>
      Array.from({ length: sb.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= sa.length; i++) {
      for (let j = 1; j <= sb.length; j++) {
        dp[i][j] =
          sa[i - 1] === sb[j - 1]
            ? dp[i - 1][j - 1]
            : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[sa.length][sb.length];
  }
}

// ─── Types internes ───────────────────────────────────────────────────────────

interface ObservationReport {
  hasRetrySignal: boolean;
  hasDoneSignal: boolean;
  verifyErrors: string[];
  confidenceScore: number;
  resultLength: number;
  resultSummary: string;
}

// Type de retour étendu pour la décision avec pivot
interface LoopDecisionWithPivot {
  action: LoopDecision;
  reason: string;
  pivotDecision?: PivotDecision;
}
