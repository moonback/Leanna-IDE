/**
 * PivotStrategies — Stratégies de pivot améliorées pour l'agent autonome
 */

import { createLogger } from "../utils/logger.js";
import type { AgentTask, TaskResult } from "./types.js";
import type { DetectedError, ErrorAnalysisReport, ErrorCategory } from "./EarlyErrorDetection.js";

const log = createLogger("PivotStrategies");

// Types

export type PivotType = 
  | "questioning"
  | "contextual_research"
  | "delegation"
  | "alternative"
  | "stop"
  | "continue";

export interface PivotDecision {
  type: PivotType;
  reason: string;
  priority: number;
  confidence: number;
  questions?: string[];
  researchQuery?: string;
  targetAgent?: string;
  alternatives?: PivotAlternative[];
  report?: string;
}

export interface PivotAlternative {
  description: string;
  action: string;
  successProbability: number;
  complexity: "low" | "medium" | "high";
}

export interface PivotContext {
  task: AgentTask;
  previousResult: TaskResult;
  errorAnalysis: ErrorAnalysisReport;
  iterationCount: number;
  maxIterations: number;
  elapsedTimeMs: number;
  iterationHistory: Array<{ iteration: number; errors: DetectedError[]; success: boolean; decision: string }>;
  availableTools: string[];
  availableAgents: string[];
}

export interface PivotStrategyConfig {
  questioningThreshold: number;
  researchRiskThreshold: number;
  researchCategories: ErrorCategory[];
  enableAutoDelegation: boolean;
  enableAutoAlternatives: boolean;
  researchTimeoutMs: number;
}

const DEFAULT_CONFIG: PivotStrategyConfig = {
  questioningThreshold: 2,
  researchRiskThreshold: 0.6,
  researchCategories: ["runtime", "dependency", "permission", "configuration"],
  enableAutoDelegation: true,
  enableAutoAlternatives: true,
  researchTimeoutMs: 30_000,
};

const CATEGORY_TO_AGENT: Record<ErrorCategory, string[]> = {
  syntax: ["code_reviewer", "developer"],
  type: ["code_reviewer", "developer"],
  lint: ["code_reviewer", "developer"],
  runtime: ["debugger", "developer"],
  logic: ["developer", "architect"],
  dependency: ["devops", "developer"],
  configuration: ["devops", "developer"],
  permission: ["sysadmin", "developer"],
  unknown: ["developer", "generalist"],
};

export class PivotStrategies {
  private config: PivotStrategyConfig;
  private consecutiveFailures: number = 0;
  private lastPivot?: PivotDecision;
  private pivotHistory: PivotDecision[] = [];

  constructor(config: Partial<PivotStrategyConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async decidePivot(context: PivotContext): Promise<PivotDecision> {
    const { errorAnalysis } = context;

    // 1. Check stop condition
    const stopDecision = this.checkStopCondition(context);
    if (stopDecision) {
      this.pivotHistory.push(stopDecision);
      this.lastPivot = stopDecision;
      return stopDecision;
    }

    // 2. Check questioning pivot (after 2 consecutive failures)
    if (this.consecutiveFailures >= this.config.questioningThreshold || errorAnalysis.needsClarification) {
      const questions = this.generateClarificationQuestion(errorAnalysis, context.task);
      const decision: PivotDecision = {
        type: "questioning",
        reason: `Clarification nécessaire après ${this.consecutiveFailures} échec(s)`,
        priority: 0.9,
        confidence: 0.85,
        questions,
      };
      this.pivotHistory.push(decision);
      this.lastPivot = decision;
      return decision;
    }

    // 3. Check contextual research pivot (for high-risk errors)
    const hasResearchTool = context.availableTools.includes("browser_research");
    if (hasResearchTool && errorAnalysis.riskScore >= this.config.researchRiskThreshold) {
      const query = this.generateResearchQuery(errorAnalysis, context.task);
      const decision: PivotDecision = {
        type: "contextual_research",
        reason: `Score de risque élevé (${errorAnalysis.riskScore.toFixed(2)})`,
        priority: 0.8,
        confidence: 0.75,
        researchQuery: query,
      };
      this.pivotHistory.push(decision);
      this.lastPivot = decision;
      return decision;
    }

    // 4. Check delegation pivot
    if (this.config.enableAutoDelegation && context.availableAgents.length > 0) {
      const targetAgent = this.getDelegationTarget(errorAnalysis, context.availableAgents);
      if (targetAgent && errorAnalysis.totalErrors >= 2) {
        const decision: PivotDecision = {
          type: "delegation",
          reason: `Délégation à ${targetAgent} pour résoudre les erreurs`,
          priority: 0.75,
          confidence: 0.7,
          targetAgent,
        };
        this.pivotHistory.push(decision);
        this.lastPivot = decision;
        return decision;
      }
    }

    // 5. Check alternative pivot
    if (this.config.enableAutoAlternatives) {
      const alternatives = this.generateAlternatives(errorAnalysis, context.task);
      if (alternatives.length > 0 && (errorAnalysis.riskScore >= 0.4 || errorAnalysis.totalErrors >= 2)) {
        const decision: PivotDecision = {
          type: "alternative",
          reason: `Proposition de ${alternatives.length} alternative(s)`,
          priority: 0.6,
          confidence: 0.65,
          alternatives,
        };
        this.pivotHistory.push(decision);
        this.lastPivot = decision;
        return decision;
      }
    }

    // 6. Default: continue
    const continueDecision: PivotDecision = {
      type: "continue",
      reason: "Aucune stratégie de pivot nécessaire, continuation",
      priority: 0.1,
      confidence: 0.9,
    };

    this.pivotHistory.push(continueDecision);
    this.lastPivot = continueDecision;
    return continueDecision;
  }

  generateAlternatives(errorAnalysis: ErrorAnalysisReport, task: AgentTask): PivotAlternative[] {
    const alternatives: PivotAlternative[] = [];
    const { errors, categories, riskScore } = errorAnalysis;

    if (errors.length === 0) return alternatives;

    // Add alternatives based on categories
    for (const category of this.getUniqueCategories(categories)) {
      const categoryAlternatives = this.getAlternativesForCategory(category);
      alternatives.push(...categoryAlternatives);
    }

    // Sort by success probability
    alternatives.sort((a, b) => b.successProbability - a.successProbability);

    return alternatives.slice(0, 5);
  }

  generateClarificationQuestion(errorAnalysis: ErrorAnalysisReport, task: AgentTask): string[] {
    const questions: string[] = [];
    const { errors, categories, clarificationQuestions } = errorAnalysis;

    if (clarificationQuestions && clarificationQuestions.length > 0) {
      return clarificationQuestions;
    }

    if (this.consecutiveFailures >= 2) {
      questions.push(`J'ai échoué ${this.consecutiveFailures} fois. Pouvez-vous clarifier "${task.title}" ?`);
    }

    const uniqueCategories = this.getUniqueCategories(categories);

    if (uniqueCategories.includes("dependency")) {
      questions.push("Des dépendances semblent manquantes. Dois-je les installer ?");
    }

    if (uniqueCategories.includes("permission")) {
      questions.push("Permissions manquantes. Dois-je demander plus de droits ?");
    }

    if (uniqueCategories.includes("syntax") || uniqueCategories.includes("type")) {
      questions.push("Des erreurs de syntaxe/typage détectées. Dois-je relire les fichiers ?");
    }

    if (questions.length === 0 && errors.length > 0) {
      questions.push(`J'ai détecté ${errors.length} erreur(s). Quelle approche adopter ?`);
    }

    return questions.slice(0, 3);
  }

  generateResearchQuery(errorAnalysis: ErrorAnalysisReport, task: AgentTask): string {
    const { errors, categories } = errorAnalysis;

    if (errors.length === 0) {
      return `How to solve ${task.title}`;
    }

    const primaryCategory = categories[0] || "unknown";
    const keyErrors = errors.slice(0, 2).map(e => e.message).join(" AND ");
    const taskContext = task.description?.slice(0, 100) || "";

    return `How to fix: ${keyErrors} in context of: ${taskContext}`;
  }

  getDelegationTarget(errorAnalysis: ErrorAnalysisReport, availableAgents: string[]): string | null {
    const { categories } = errorAnalysis;
    if (categories.length === 0) return null;

    const priorityOrder: ErrorCategory[] = ["permission", "runtime", "dependency", "configuration", "type", "syntax", "lint", "logic", "unknown"];
    
    for (const cat of priorityOrder) {
      if (categories.includes(cat)) {
        const preferredAgents = CATEGORY_TO_AGENT[cat] || [];
        for (const agent of preferredAgents) {
          if (availableAgents.includes(agent)) {
            return agent;
          }
        }
      }
    }

    // Fallback to generic agents
    for (const agent of ["developer", "generalist"]) {
      if (availableAgents.includes(agent)) {
        return agent;
      }
    }

    return null;
  }

  updateAfterIteration(success: boolean, errors: DetectedError[]): void {
    if (!success) {
      this.consecutiveFailures++;
    } else {
      this.consecutiveFailures = 0;
    }
  }

  reset(): void {
    this.consecutiveFailures = 0;
    this.lastPivot = undefined;
    this.pivotHistory = [];
  }

  getPivotHistory(): PivotDecision[] {
    return [...this.pivotHistory];
  }

  // Private methods
  
  private getUniqueCategories(categories: ErrorCategory[]): ErrorCategory[] {
    const seen: ErrorCategory[] = [];
    for (const cat of categories) {
      if (!seen.includes(cat)) {
        seen.push(cat);
      }
    }
    return seen;
  }

  private checkStopCondition(context: PivotContext): PivotDecision | null {
    const { errorAnalysis, maxIterations } = context;
    const { criticalCount, blockingCount, riskScore, requiresHumanIntervention, totalErrors } = errorAnalysis;

    if (requiresHumanIntervention) {
      const report = this.generateStopReport(context);
      return {
        type: "stop",
        reason: "Intervention humaine nécessaire",
        priority: 1.0,
        confidence: 0.9,
        report,
      };
    }

    const MAX_TOTAL_ERRORS = 10;
    if (totalErrors >= MAX_TOTAL_ERRORS) {
      const report = this.generateStopReport(context);
      return {
        type: "stop",
        reason: `Trop d'erreurs cumulées (${totalErrors})`,
        priority: 0.9,
        confidence: 0.8,
        report,
      };
    }

    if (this.consecutiveFailures >= maxIterations) {
      const report = this.generateStopReport(context);
      return {
        type: "stop",
        reason: `Trop d'échecs consécutifs (${this.consecutiveFailures})`,
        priority: 0.8,
        confidence: 0.8,
        report,
      };
    }

    return null;
  }

  private generateStopReport(context: PivotContext): string {
    const { errorAnalysis, task } = context;
    const { errors, totalErrors, criticalCount, blockingCount, categories, riskScore } = errorAnalysis;

    const reportParts = [
      `=== RAPPORT D'ARRÊT ===`,
      ``,
      `Tâche: ${task.title}`,
      `Erreurs: ${totalErrors} total, ${criticalCount} critiques, ${blockingCount} bloquantes`,
      `Score de risque: ${(riskScore * 100).toFixed(1)}%`,
      `Catégories: ${categories.join(', ')}`,
    ];

    return reportParts.join('\n');
  }

  private getAlternativesForCategory(category: ErrorCategory): PivotAlternative[] {
    const alternatives: PivotAlternative[] = [];

    switch (category) {
      case "syntax":
        alternatives.push({ description: "Corriger la syntaxe manuellement", action: "manual_fix", successProbability: 0.8, complexity: "medium" });
        break;
      case "type":
        alternatives.push({ description: "Ajouter des annotations de type", action: "add_types", successProbability: 0.85, complexity: "medium" });
        break;
      case "lint":
        alternatives.push({ description: "Exécuter lint --fix", action: "lint_fix", successProbability: 0.9, complexity: "low" });
        break;
      case "runtime":
        alternatives.push({ description: "Ajouter des vérifications de nullité", action: "add_null_checks", successProbability: 0.8, complexity: "medium" });
        break;
      case "dependency":
        alternatives.push({ description: "Installer les dépendances manquantes", action: "install_deps", successProbability: 0.9, complexity: "low" });
        break;
      case "configuration":
        alternatives.push({ description: "Vérifier les variables d'environnement", action: "check_env", successProbability: 0.8, complexity: "low" });
        break;
      case "permission":
        alternatives.push({ description: "Demander des permissions supplémentaires", action: "request_permissions", successProbability: 0.6, complexity: "medium" });
        break;
      default:
        alternatives.push({ description: "Relire les fichiers concernés", action: "reread_files", successProbability: 0.7, complexity: "low" });
    }

    return alternatives;
  }
}

export function createPivotStrategies(config?: Partial<PivotStrategyConfig>): PivotStrategies {
  return new PivotStrategies(config);
}
