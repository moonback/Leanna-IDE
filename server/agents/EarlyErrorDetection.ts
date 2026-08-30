/**
 * EarlyErrorDetection — Détection précoce et analyse sémantique des erreurs
 */

import { createLogger } from "../utils/logger.js";

const log = createLogger("EarlyErrorDetection");

// Types

export type ErrorSeverity = "critical" | "high" | "medium" | "low";
export type ErrorCategory = 
  | "syntax"
  | "type"
  | "lint"
  | "runtime"
  | "logic"
  | "dependency"
  | "configuration"
  | "permission"
  | "unknown";

export interface DetectedError {
  message: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  file?: string;
  line?: number;
  recommendation: string;
  isBlocking: boolean;
  confidence: number;
}

export interface ErrorAnalysisReport {
  errors: DetectedError[];
  totalErrors: number;
  criticalCount: number;
  blockingCount: number;
  categories: ErrorCategory[];
  riskScore: number;
  recommendations: string[];
  requiresHumanIntervention: boolean;
  needsClarification: boolean;
  clarificationQuestions?: string[];
}

// Error patterns
const ERROR_PATTERNS: Array<{ regex: RegExp; category: ErrorCategory; severity: ErrorSeverity; recommendation: string }> = [
  // Syntax errors
  { regex: /Unexpected token|SyntaxError/, category: "syntax", severity: "high", recommendation: "Vérifiez la syntaxe du code" },
  { regex: /Missing.*;|Expected.*;/, category: "syntax", severity: "medium", recommendation: "Ajoutez un point-virgule manquant" },
  
  // Type errors
  { regex: /Type.*is not assignable|Argument of type.*is not assignable/, category: "type", severity: "high", recommendation: "Vérifiez la compatibilité des types" },
  
  // Runtime errors
  { regex: /ReferenceError|Cannot read property|Cannot read properties of null/, category: "runtime", severity: "critical", recommendation: "Vérifiez que la variable est définie" },
  
  // Dependency errors
  { regex: /Cannot find module|Module not found/, category: "dependency", severity: "critical", recommendation: "Installez le module manquant" },
  
  // Permission errors
  { regex: /Permission denied|EACCES/, category: "permission", severity: "critical", recommendation: "Vérifiez les permissions" },
];

export class EarlyErrorDetection {
  private consecutiveFailureCount: number = 0;
  private lastErrorCategory?: ErrorCategory;
  private errorHistory: DetectedError[] = [];

  analyzeExecutionReport(report: {
    success: boolean;
    details?: string;
    fileValidationErrors?: Array<{ path: string; error: string }>;
    filesModified?: string[];
    errors?: string[];
  }): ErrorAnalysisReport {
    const allErrors: DetectedError[] = [];
    const categories: ErrorCategory[] = [];
    let criticalCount = 0;
    let blockingCount = 0;
    const recommendations: string[] = [];
    const clarificationQuestions: string[] = [];

    // Helper to add unique errors
    const addError = (error: DetectedError) => {
      if (!allErrors.some(e => e.message === error.message)) {
        allErrors.push(error);
      }
    };

    // Analyze file validation errors
    if (report.fileValidationErrors) {
      for (const fileError of report.fileValidationErrors) {
        const detected = this.detectErrorPattern(fileError.error);
        if (detected) {
          addError({ ...detected, file: fileError.path });
        }
      }
    }

    // Analyze general errors
    if (report.errors) {
      for (const error of report.errors) {
        const detected = this.detectErrorPattern(error);
        if (detected) {
          addError(detected);
        }
      }
    }

    // Analyze details for error patterns
    if (report.details) {
      const errorMessages = this.extractErrorMessagesFromText(report.details);
      for (const errorMsg of errorMessages) {
        const detected = this.detectErrorPattern(errorMsg);
        if (detected && !allErrors.some(e => e.message === detected.message)) {
          addError(detected);
        }
      }
    }

    // Classify errors
    for (const error of allErrors) {
      if (!categories.includes(error.category)) {
        categories.push(error.category);
      }
      if (error.severity === "critical") criticalCount++;
      if (error.isBlocking) blockingCount++;
      if (error.severity === "critical" || error.severity === "high") {
        if (!recommendations.includes(error.recommendation)) {
          recommendations.push(error.recommendation);
        }
      }
    }

    // Calculate risk score
    const riskScore = this.calculateRiskScore(allErrors, report.success);

    // Determine if human intervention is needed
    const requiresHumanIntervention = criticalCount > 2 || blockingCount > 3 || riskScore > 0.8;

    // Determine if clarification is needed
    const needsClarification = this.consecutiveFailureCount >= 2 || 
      (this.consecutiveFailureCount >= 1 && riskScore > 0.6);

    // Generate clarification questions
    if (needsClarification) {
      const uniqueCategories = this.getUniqueCategories(categories);
      if (uniqueCategories.includes("dependency")) {
        clarificationQuestions.push("Des dépendances semblent manquantes. Dois-je les installer ?");
      }
      if (uniqueCategories.includes("permission")) {
        clarificationQuestions.push("Permissions manquantes. Dois-je demander plus de droits ?");
      }
      if (uniqueCategories.includes("syntax") || uniqueCategories.includes("type")) {
        clarificationQuestions.push("Des erreurs de syntaxe/typage détectées. Dois-je relire les fichiers ?");
      }
      if (clarificationQuestions.length === 0 && allErrors.length > 0) {
        clarificationQuestions.push(`J'ai détecté ${allErrors.length} erreur(s). Quelle approche adopter ?`);
      }
    }

    // Update state
    this.errorHistory = [...this.errorHistory, ...allErrors].slice(-20);
    if (!report.success) {
      this.consecutiveFailureCount++;
    } else {
      this.consecutiveFailureCount = 0;
    }

    if (allErrors.length > 0) {
      this.lastErrorCategory = allErrors[0].category;
    }

    return {
      errors: allErrors,
      totalErrors: allErrors.length,
      criticalCount,
      blockingCount,
      categories: this.getUniqueCategories(categories),
      riskScore,
      recommendations,
      requiresHumanIntervention,
      needsClarification,
      clarificationQuestions: clarificationQuestions.length > 0 ? clarificationQuestions : undefined,
    };
  }

  reset(): void {
    this.consecutiveFailureCount = 0;
    this.lastErrorCategory = undefined;
    this.errorHistory = [];
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

  private detectErrorPattern(errorMessage: string): DetectedError | null {
    if (!errorMessage || typeof errorMessage !== 'string') return null;

    for (const pattern of ERROR_PATTERNS) {
      if (pattern.regex.test(errorMessage)) {
        const isBlocking = pattern.severity === "critical" || pattern.severity === "high";
        return {
          message: errorMessage.slice(0, 500),
          category: pattern.category,
          severity: pattern.severity,
          recommendation: pattern.recommendation,
          isBlocking,
          confidence: 0.8,
        };
      }
    }

    return this.guessErrorCategory(errorMessage);
  }

  private guessErrorCategory(errorMessage: string): DetectedError | null {
    const lowerMessage = errorMessage.toLowerCase();
    
    let category: ErrorCategory = "unknown";
    let severity: ErrorSeverity = "medium";
    let recommendation = "Investiguez cette erreur";
    let isBlocking = false;

    if (lowerMessage.includes("syntax") || lowerMessage.includes("parse")) {
      category = "syntax"; severity = "high"; recommendation = "Corrigez la syntaxe"; isBlocking = true;
    } else if (lowerMessage.includes("type") || lowerMessage.includes("assignable")) {
      category = "type"; severity = "high"; recommendation = "Vérifiez les types"; isBlocking = true;
    } else if (lowerMessage.includes("module not found") || lowerMessage.includes("cannot find module")) {
      category = "dependency"; severity = "critical"; recommendation = "Installez les dépendances"; isBlocking = true;
    } else if (lowerMessage.includes("permission") || lowerMessage.includes("denied")) {
      category = "permission"; severity = "critical"; recommendation = "Vérifiez les permissions"; isBlocking = true;
    } else if (lowerMessage.includes("not defined") || lowerMessage.includes("runtime")) {
      category = "runtime"; severity = "critical"; recommendation = "Vérifiez les variables"; isBlocking = true;
    }

    return {
      message: errorMessage.slice(0, 500),
      category,
      severity,
      recommendation,
      isBlocking,
      confidence: 0.5,
    };
  }

  private extractErrorMessagesFromText(text: string): string[] {
    const errorLines: string[] = [];
    const lines = text.split('\n');
    const errorKeywords = [
      'error', 'Error', 'ERROR', 'erreur', 'Erreur', 'ERREUR',
      'failed', 'Failed', 'FAILED', 'not found', 'manquant',
      'invalid', 'Invalid', 'undefined', 'null', 'Cannot',
    ];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && errorKeywords.some(kw => trimmed.includes(kw))) {
        errorLines.push(trimmed);
      }
    }

    return errorLines;
  }

  private calculateRiskScore(errors: DetectedError[], success: boolean): number {
    if (errors.length === 0 && success) return 0;
    if (errors.length === 0 && !success) return 0.3;

    let score = 0;
    score += Math.min(0.3, errors.length * 0.1);

    const severityWeights = { critical: 0.3, high: 0.2, medium: 0.1, low: 0.05 };
    for (const error of errors) {
      score += severityWeights[error.severity] || 0;
    }

    const blockingCount = errors.filter(e => e.isBlocking).length;
    score += blockingCount * 0.15;

    if (!success) {
      score += 0.2;
    }

    return Math.min(1, Math.max(0, score));
  }
}

export function createEarlyErrorDetection(): EarlyErrorDetection {
  return new EarlyErrorDetection();
}
