/**
 * Verifier — Composant de vérification indépendant
 * 
 * Ce composant permet de vérifier des états, actions, résultats avant/après exécution.
 * Il est conçu pour être :
 * - Indépendant (pas de dépendance sur d'autres composants)
 * - Pluggable (nouveaux vérificateurs peuvent être ajoutés)
 * - Typé (chaque vérificateur a ses propres types de données)
 * - Extensible (support des vérifications personnalisées)
 * 
 * Types de vérification supportés :
 * - pre_action : Avant exécution d'une action
 * - post_action : Après exécution d'une action
 * - pre_commit : Avant commit de changements
 * - post_commit : Après commit
 * - safety_check : Vérification de sécurité
 * - quality_check : Vérification de qualité
 * - constraint : Vérification de contraintes métiers
 * - custom : Vérification personnalisée
 * 
 * @example
 * // Créer un vérificateur de sécurité
 * const safetyVerifier = new Verifier({
 *   name: "safety-checker",
 *   type: "safety_check",
 *   handler: async (context) => {
 *     if (context.targetType === "action") {
 *       const action = context.targetData as PlannedAction;
 *       if (action.skillName === "delete_file") {
 *         return {
 *           success: false,
 *           checks: [{
 *             name: "dangerous_operation",
 *             passed: false,
 *             message: "Suppression de fichiers non autorisée",
 *             severity: "critical"
 *           }]
 *         };
 *       }
 *     }
 *     return { success: true, checks: [] };
 *   }
 * });
 * 
 * // Exécuter une vérification
 * const result = await safetyVerifier.verify({
 *   targetId: "action-123",
 *   targetType: "action",
 *   targetData: someAction
 * });
 */

import type {
  ID,
  Timestamp,
  Priority,
  VerificationType,
  VerificationStatus,
  VerificationResult,
  VerificationCheck,
  VerificationContext,
  VerificationHandler,
  VerifierDefinition,
  WorkspaceContext,
  PlannedAction,
  Task,
  Goal,
  MissionState,
  Artifact,
} from "../core/types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Types Internes
// ═══════════════════════════════════════════════════════════════════════════════

/** Statut interne d'un vérificateur */
type VerifierStatus = "idle" | "verifying" | "error" | "disabled";

/** Statistiques d'un vérificateur */
export interface VerifierStats {
  totalChecks: number;
  passed: number;
  failed: number;
  skipped: number;
  errors: number;
  avgDurationMs: number;
  lastRunAt?: Timestamp;
}

/** Configuration d'un vérificateur */
export interface VerifierConfig {
  /** Timeout par défaut pour les vérifications (ms) */
  defaultTimeoutMs: number;
  /** Nombre maximal de tentatives en cas d'erreur */
  maxRetries: number;
  /** Activer les logs détaillés */
  enableDebugLogs: boolean;
  /** Continuer même si une vérification échoue */
  continueOnFailure: boolean;
  /** Désactiver tous les vérificateurs par défaut */
  disabledByDefault: boolean;
}

/** Configuration par défaut */
export const DEFAULT_VERIFIER_CONFIG: VerifierConfig = {
  defaultTimeoutMs: 5000,
  maxRetries: 1,
  enableDebugLogs: false,
  continueOnFailure: true,
  disabledByDefault: false,
};

// ═══════════════════════════════════════════════════════════════════════════════
// Classe Verifier
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Vérificateur unique qui exécute des vérifications sur des cibles spécifiques.
 * 
 * Chaque vérificateur a :
 * - Un nom unique
 * - Un type de vérification (pre_action, post_action, safety_check, etc.)
 * - Un handler qui effectue la vérification réelle
 * - Une priorité
 * - Une configuration (timeout, activé/désactivé)
 */
export class Verifier {
  // Identification
  private readonly id: ID;
  private readonly definition: VerifierDefinition;
  
  // État
  private status: VerifierStatus = "idle";
  private enabled: boolean;
  
  // Configuration
  private config: VerifierConfig;
  
  // Statistiques
  private stats: VerifierStats = {
    totalChecks: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    errors: 0,
    avgDurationMs: 0,
  };
  
  // Historique (limité)
  private history: VerificationResult[] = [];
  private readonly maxHistorySize = 100;
  
  // Logger (optionnel, injectable)
  private logger: {
    debug: (message: string, ...args: unknown[]) => void;
    info: (message: string, ...args: unknown[]) => void;
    warn: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
  };

  /**
   * Crée un nouveau vérificateur.
   * 
   * @param definition - Définition du vérificateur
   * @param config - Configuration personnalisée
   * @param logger - Logger optionnel (console par défaut)
   */
  constructor(
    definition: VerifierDefinition,
    config: Partial<VerifierConfig> = {},
    logger?: {
      debug: (message: string, ...args: unknown[]) => void;
      info: (message: string, ...args: unknown[]) => void;
      warn: (message: string, ...args: unknown[]) => void;
      error: (message: string, ...args: unknown[]) => void;
    }
  ) {
    this.id = `verifier-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.definition = definition;
    this.config = { ...DEFAULT_VERIFIER_CONFIG, ...config };
    this.enabled = !this.config.disabledByDefault && definition.enabled;
    this.logger = logger || {
      debug: console.debug.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    };

    this.logger.debug(`[Verifier] ${definition.name} (${this.id}) initialisé`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Getters
  // ═══════════════════════════════════════════════════════════════════════════════

  /** Retourne l'ID du vérificateur */
  getId(): ID {
    return this.id;
  }

  /** Retourne le nom du vérificateur */
  getName(): string {
    return this.definition.name;
  }

  /** Retourne le type de vérification */
  getType(): VerificationType {
    return this.definition.type;
  }

  /** Retourne la priorité */
  getPriority(): Priority {
    return this.definition.priority;
  }

  /** Retourne le statut */
  getStatus(): VerifierStatus {
    return this.status;
  }

  /** Retourne si le vérificateur est activé */
  isEnabled(): boolean {
    return this.enabled;
  }

  /** Retourne les statistiques */
  getStats(): VerifierStats {
    return { ...this.stats };
  }

  /** Retourne l'historique des vérifications */
  getHistory(limit?: number): VerificationResult[] {
    if (limit) {
      return [...this.history].slice(-limit);
    }
    return [...this.history];
  }

  /** Retourne les types de cibles supportés */
  getSupportedTargetTypes(): VerificationContext["targetType"][] {
    return this.definition.targetTypes;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Configuration Methods
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Active le vérificateur.
   */
  enable(): void {
    this.enabled = true;
    this.logger.info(`[Verifier] ${this.definition.name} activé`);
  }

  /**
   * Désactive le vérificateur.
   */
  disable(): void {
    this.enabled = false;
    this.logger.info(`[Verifier] ${this.definition.name} désactivé`);
  }

  /**
   * Met à jour la configuration.
   */
  updateConfig(partialConfig: Partial<VerifierConfig>): void {
    this.config = { ...this.config, ...partialConfig };
    this.logger.debug(`[Verifier] ${this.definition.name} config mise à jour`);
  }

  /**
   * Définit un timeout personnalisé pour ce vérificateur.
   */
  setTimeout(timeoutMs: number): void {
    this.config.defaultTimeoutMs = timeoutMs;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Verification Methods
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Exécute une vérification sur une cible.
   * 
   * @param context - Contexte de la vérification
   * @returns Résultat de la vérification
   */
  async verify(context: VerificationContext): Promise<VerificationResult> {
    // Vérifier si le vérificateur est activé
    if (!this.enabled) {
      this.logger.debug(`[Verifier] ${this.definition.name} est désactivé, skip`);
      return this.createSkippedResult(context);
    }

    // Vérifier si le type de cible est supporté
    if (!this.definition.targetTypes.includes(context.targetType)) {
      this.logger.debug(
        `[Verifier] ${this.definition.name} ne supporte pas le type de cible: ${context.targetType}`
      );
      return this.createSkippedResult(context);
    }

    this.status = "verifying";
    const startTime = Date.now();
    let attempts = 0;
    let lastError: Error | undefined;

    try {
      // Exécuter la vérification avec retry si nécessaire
      while (attempts <= this.config.maxRetries) {
        try {
          const result = await this.executeHandler(context);
          this.updateStats(startTime, true, result);
          this.history.push(result);
          
          if (this.history.length > this.maxHistorySize) {
            this.history.shift();
          }
          
          this.status = "idle";
          return result;
        } catch (error) {
          lastError = error as Error;
          attempts++;
          
          if (attempts <= this.config.maxRetries) {
            this.logger.warn(
              `[Verifier] ${this.definition.name} tentative ${attempts}/${this.config.maxRetries}: ${lastError.message}`
            );
            await new Promise((resolve) => 
              setTimeout(resolve, this.config.defaultTimeoutMs)
            );
          }
        }
      }

      // Si toutes les tentatives ont échoué
      this.updateStats(startTime, false);
      return this.createErrorResult(context, lastError);
    } catch (error) {
      this.updateStats(startTime, false);
      this.status = "error";
      return this.createErrorResult(context, error as Error);
    }
  }

  /**
   * Exécute le handler de vérification avec timeout.
   */
  private async executeHandler(context: VerificationContext): Promise<VerificationResult> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Timeout: Vérification ${this.definition.name} a dépassé ${this.config.defaultTimeoutMs}ms`));
      }, this.config.defaultTimeoutMs);
    });

    try {
      const resultPromise = this.definition.handler(context);
      const result = await Promise.race([resultPromise, timeoutPromise]);
      return result;
    } catch (error) {
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Helper Methods
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Met à jour les statistiques après une vérification.
   */
  private updateStats(startTime: number, success: boolean, result?: VerificationResult): void {
    const durationMs = Date.now() - startTime;
    
    this.stats.totalChecks++;
    
    if (success) {
      this.stats.passed++;
    } else if (result?.status === "failed") {
      this.stats.failed++;
    } else if (result?.status === "skipped") {
      this.stats.skipped++;
    } else {
      this.stats.errors++;
    }

    // Mettre à jour la durée moyenne
    const totalDuration = this.stats.avgDurationMs * (this.stats.totalChecks - 1);
    this.stats.avgDurationMs = (totalDuration + durationMs) / this.stats.totalChecks;
    this.stats.lastRunAt = new Date().toISOString();
  }

  /**
   * Crée un résultat de vérification avec statut "passed".
   */
  private createPassedResult(
    context: VerificationContext,
    checks: VerificationCheck[]
  ): VerificationResult {
    return {
      id: this.generateId(),
      type: this.definition.type,
      status: "passed",
      verifierName: this.definition.name,
      targetId: context.targetId,
      targetType: context.targetType,
      checks,
      summary: `Vérification ${this.definition.name} passée`,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 0,
    };
  }

  /**
   * Crée un résultat de vérification avec statut "failed".
   */
  private createFailedResult(
    context: VerificationContext,
    checks: VerificationCheck[]
  ): VerificationResult {
    return {
      id: this.generateId(),
      type: this.definition.type,
      status: "failed",
      verifierName: this.definition.name,
      targetId: context.targetId,
      targetType: context.targetType,
      checks,
      summary: `Vérification ${this.definition.name} échouée`,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 0,
    };
  }

  /**
   * Crée un résultat de vérification avec statut "skipped".
   */
  private createSkippedResult(context: VerificationContext): VerificationResult {
    return {
      id: this.generateId(),
      type: this.definition.type,
      status: "skipped",
      verifierName: this.definition.name,
      targetId: context.targetId,
      targetType: context.targetType,
      checks: [],
      summary: `Vérification ${this.definition.name} ignorée (type de cible non supporté ou désactivé)`,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 0,
    };
  }

  /**
   * Crée un résultat de vérification avec statut "error".
   */
  private createErrorResult(context: VerificationContext, error: Error): VerificationResult {
    return {
      id: this.generateId(),
      type: this.definition.type,
      status: "error",
      verifierName: this.definition.name,
      targetId: context.targetId,
      targetType: context.targetType,
      checks: [{
        id: this.generateId(),
        name: "internal_error",
        description: "Erreur interne du vérificateur",
        passed: false,
        message: error.message,
        severity: "error",
        fixSuggestion: "Vérifiez les logs du vérificateur",
      }],
      summary: `Vérification ${this.definition.name} en erreur: ${error.message}`,
      error: error.message,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 0,
    };
  }

  /**
   * Génère un ID unique.
   */
  private generateId(): ID {
    return `verif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Factory Functions for Common Verifiers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Crée un vérificateur de type "safety_check" pour bloquer les opérations dangereuses.
 */
function createSafetyVerifier(
  config: Partial<VerifierConfig> = {}
): Verifier {
  const handler: VerificationHandler = async (context) => {
    const checks: VerificationCheck[] = [];
    const dangerousPatterns = [
      "delete",
      "remove",
      "drop",
      "truncate",
      "rm",
      "del",
      "erase",
      "format",
    ];

    // Vérifier si c'est une action
    if (context.targetType === "action") {
      const action = context.targetData as { skillName?: string; args?: Record<string, unknown> };
      
      if (action.skillName) {
        const lowerSkillName = action.skillName.toLowerCase();
        const isDangerous = dangerousPatterns.some((pattern) =>
          lowerSkillName.includes(pattern)
        );

        if (isDangerous) {
          checks.push({
            id: `safety-${Date.now()}`,
            name: "dangerous_operation",
            description: "Opération potentiellement dangereuse détectée",
            passed: false,
            message: `Le skill "${action.skillName}" semble dangereux`,
            severity: "critical",
            fixSuggestion: "Utilisez une opération plus sûre ou ajoutez une confirmation explicite",
          });
        } else {
          checks.push({
            id: `safety-${Date.now()}`,
            name: "safe_operation",
            description: "Opération vérifiée comme sûre",
            passed: true,
            message: `Le skill "${action.skillName}" semble sûr`,
            severity: "info",
          });
        }
      }
    }

    // Vérifier les arguments pour des patterns dangereux
    if (context.targetType === "action") {
      const data = context.targetData as { args?: Record<string, unknown> };
      if (data.args) {
        for (const [key, value] of Object.entries(data.args)) {
          if (typeof value === "string") {
            const lowerValue = value.toLowerCase();
            const isDangerous = dangerousPatterns.some((pattern) =>
              lowerValue.includes(pattern)
            );

            if (isDangerous && key.toLowerCase().includes("force")) {
              checks.push({
                id: `safety-${Date.now()}-${key}`,
                name: "dangerous_flag",
                description: "Flag dangereux détecté",
                passed: false,
                message: `L'argument "${key}" avec valeur "${value}" semble dangereux`,
                severity: "critical",
                fixSuggestion: "Ne pas utiliser de flags de force sans confirmation",
              });
            }
          }
        }
      }
    }

    const allPassed = checks.every((c) => c.passed);
    return {
      id: `safety-${Date.now()}`,
      type: "safety_check",
      status: allPassed ? "passed" : "failed",
      verifierName: "safety-verifier",
      targetId: context.targetId,
      targetType: context.targetType,
      checks,
      summary: allPassed
        ? "Vérification de sécurité passée"
        : "Vérification de sécurité échouée - opération bloquée",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 0,
    };
  };

  return new Verifier(
    {
      name: "safety-verifier",
      description: "Vérifie les opérations dangereuses (suppression, formatage, etc.)",
      type: "safety_check",
      targetTypes: ["action", "task", "mission", "goal"],
      handler,
      priority: "critical",
      enabled: true,
      timeoutMs: 1000,
    },
    config
  );
}

/**
 * Crée un vérificateur de type "quality_check" pour vérifier la qualité des résultats.
 */
function createQualityVerifier(
  config: Partial<VerifierConfig> = {}
): Verifier {
  const handler: VerificationHandler = async (context) => {
    const checks: VerificationCheck[] = [];

    // Vérifier si c'est un résultat de task
    if (context.targetType === "task" || context.targetType === "action") {
      const result = context.targetData as { result?: { success?: boolean; error?: string } };
      
      if (result.result) {
        // Vérifier le succès
        if (result.result.success === false) {
          checks.push({
            id: `quality-${Date.now()}`,
            name: "result_failed",
            description: "La tâche/action a échoué",
            passed: false,
            message: `Echec: ${(result.result as { error?: string }).error || "Erreur inconnue"}`,
            severity: "error",
            fixSuggestion: "Verifiez les logs et corrigez l'erreur",
          });
        } else {
          checks.push({
            id: `quality-${Date.now()}`,
            name: "result_success",
            description: "La tache/action a reussi",
            passed: true,
            message: "Resultat valide",
            severity: "info",
          });
        }

        // Vérifier la présence de données requises
        const resultData = result.result as { error?: string; summary?: string };
        if (resultData && !resultData.error && !resultData.summary) {
          checks.push({
            id: `quality-${Date.now()}-missing`,
            name: "missing_summary",
            description: "Resume manquant dans le result",
            passed: false,
            message: "Le resultat ne contient pas de summary",
            severity: "warning",
            fixSuggestion: "Ajoutez un summary au resultat",
          });
        }
      }
    }

    // Vérifier si c'est un artefact
    if (context.targetType === "artifact") {
      const artifact = context.targetData as Artifact;
      
      if (artifact) {
        if (!artifact.path) {
          checks.push({
            id: `quality-${Date.now()}`,
            name: "missing_path",
            description: "Chemin manquant pour l'artefact",
            passed: false,
            message: "L'artefact n'a pas de chemin défini",
            severity: "error",
            fixSuggestion: "Spécifiez un chemin valide",
          });
        }

        if (!artifact.name) {
          checks.push({
            id: `quality-${Date.now()}-name`,
            name: "missing_name",
            description: "Nom manquant pour l'artefact",
            passed: false,
            message: "L'artefact n'a pas de nom",
            severity: "warning",
            fixSuggestion: "Ajoutez un nom à l'artefact",
          });
        }
      }
    }

    const allPassed = checks.every((c) => c.passed);
    const hasErrors = checks.some((c) => c.severity === "error");

    return {
      id: `quality-${Date.now()}`,
      type: "quality_check",
      status: hasErrors ? "failed" : allPassed ? "passed" : "passed",
      verifierName: "quality-verifier",
      targetId: context.targetId,
      targetType: context.targetType,
      checks,
      summary: hasErrors
        ? "Vérification de qualité échouée"
        : allPassed
          ? "Vérification de qualité passée"
          : "Vérification de qualité passée avec avertissements",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 0,
    };
  };

  return new Verifier(
    {
      name: "quality-verifier",
      description: "Vérifie la qualité des résultats et artefacts",
      type: "quality_check",
      targetTypes: ["task", "action", "artifact", "mission", "goal"],
      handler,
      priority: "high",
      enabled: true,
      timeoutMs: 2000,
    },
    config
  );
}

/**
 * Crée un vérificateur de contraintes métiers.
 */
function createConstraintVerifier(
  constraints: {
    maxFileSize?: number;
    allowedExtensions?: string[];
    maxActions?: number;
    requiredFields?: string[];
  } = {},
  config: Partial<VerifierConfig> = {}
): Verifier {
  const handler: VerificationHandler = async (context) => {
    const checks: VerificationCheck[] = [];

    // Vérifier la taille des fichiers
    if (context.targetType === "artifact" && constraints.maxFileSize) {
      const artifact = context.targetData as Artifact;
      if (artifact && artifact.size > constraints.maxFileSize) {
        checks.push({
          id: `constraint-${Date.now()}`,
          name: "file_too_large",
          description: "Fichier trop volumineux",
          passed: false,
          message: `Taille: ${artifact.size} bytes, Max: ${constraints.maxFileSize} bytes`,
          severity: "error",
          fixSuggestion: "Réduisez la taille du fichier",
        });
      } else {
        checks.push({
          id: `constraint-${Date.now()}`,
          name: "file_size_ok",
          description: "Taille du fichier acceptable",
          passed: true,
          message: `Taille: ${artifact?.size || 0} bytes`,
          severity: "info",
        });
      }
    }

    // Vérifier les extensions
    if (context.targetType === "artifact" && constraints.allowedExtensions) {
      const artifact = context.targetData as Artifact;
      if (artifact?.path) {
        const ext = artifact.path.split(".").pop()?.toLowerCase();
        if (ext && !constraints.allowedExtensions.includes(ext)) {
          checks.push({
            id: `constraint-${Date.now()}-ext`,
            name: "invalid_extension",
            description: "Extension non autorisée",
            passed: false,
            message: `Extension: .${ext}, Autorisées: ${constraints.allowedExtensions.join(", ")}`,
            severity: "error",
            fixSuggestion: "Utilisez une extension autorisée",
          });
        }
      }
    }

    // Vérifier le nombre d'actions
    if (context.targetType === "mission" && constraints.maxActions) {
      const mission = context.targetData as MissionState;
      if (mission) {
        const totalActions = Object.values(mission.goals || {}).reduce(
          (sum, goal: Goal) => sum + goal.plannedActions?.length || 0,
          0
        );
        if (totalActions > constraints.maxActions) {
          checks.push({
            id: `constraint-${Date.now()}-actions`,
            name: "too_many_actions",
            description: "Trop d'actions planifiées",
            passed: false,
            message: `Actions: ${totalActions}, Max: ${constraints.maxActions}`,
            severity: "error",
            fixSuggestion: "Réduisez le nombre d'actions",
          });
        }
      }
    }

    // Vérifier les champs requis
    if (context.targetType === "task" && constraints.requiredFields) {
      const task = context.targetData as Task;
      if (task) {
        for (const field of constraints.requiredFields) {
          if (!(field in task) || task[field as keyof Task] === undefined) {
            checks.push({
              id: `constraint-${Date.now()}-${field}`,
              name: "missing_required_field",
              description: `Champ requis manquant: ${field}`,
              passed: false,
              message: `Le champ "${field}" est requis mais manquant`,
              severity: "error",
              fixSuggestion: `Ajoutez le champ "${field}"`,
            });
          }
        }
      }
    }

    const allPassed = checks.every((c) => c.passed);
    return {
      id: `constraint-${Date.now()}`,
      type: "constraint",
      status: allPassed ? "passed" : "failed",
      verifierName: "constraint-verifier",
      targetId: context.targetId,
      targetType: context.targetType,
      checks,
      summary: allPassed
        ? "Toutes les contraintes respectées"
        : "Certaines contraintes ne sont pas respectées",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 0,
    };
  };

  return new Verifier(
    {
      name: "constraint-verifier",
      description: "Vérifie le respect des contraintes métiers",
      type: "constraint",
      targetTypes: ["task", "action", "artifact", "mission", "goal"],
      handler,
      priority: "high",
      enabled: true,
      timeoutMs: 1000,
    },
    config
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Index
// ═══════════════════════════════════════════════════════════════════════════════

export {
  createSafetyVerifier,
  createQualityVerifier,
  createConstraintVerifier,
};

export default Verifier;
