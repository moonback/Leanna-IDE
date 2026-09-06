/**
 * VerificationManager — Gestionnaire central de vérifications
 * 
 * Ce composant gère :
 * - L'enregistrement et la configuration des vérificateurs
 * - L'exécution de vérifications multiples sur une cible
 * - La coordination des résultats de vérification
 * - L'intégration avec EventBus pour les événements de vérification
 * 
 * Fonctionnalités :
 * - Enregistrement de vérificateurs multiples
 * - Exécution de toutes les vérifications pertinentes sur une cible
 * - Aggregation des résultats
 * - Gestion des priorités
 * - Émission d'événements de vérification
 * - Support des stratégies (fail-fast, continue-on-error, etc.)
 * 
 * @example
 * // Créer un gestionnaire
 * const verificationManager = new VerificationManager({
 *   strategy: "fail-fast",
 *   enabled: true
 * });
 * 
 * // Ajouter des vérificateurs
 * verificationManager.addVerifier(safetyVerifier);
 * verificationManager.addVerifier(qualityVerifier);
 * verificationManager.addVerifier(constraintVerifier);
 * 
 * // Exécuter toutes les vérifications sur une action
 * const results = await verificationManager.verify({
 *   targetId: "action-123",
 *   targetType: "action",
 *   targetData: someAction
 * });
 * 
 * if (results.allPassed) {
 *   // Continuer avec l'exécution
 * } else {
 *   // Bloquer ou gérer l'échec
 * }
 */

import { eventBus } from "../core/EventBus.js";
import { Verifier, type VerifierConfig, type VerifierStats } from "./Verifier.js";
import type {
  ID,
  Timestamp,
  Priority,
  VerificationType,
  VerificationStatus,
  VerificationResult,
  VerificationContext,
  VerifierDefinition,
} from "../core/types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

/** Stratégie d'exécution des vérifications */
export type VerificationStrategy = 
  | "fail-fast"       // Arrêter à la première vérification échouée
  | "continue"        // Continuer toutes les vérifications même si certaines échouent
  | "collect-all";   // Même que continue, mais toujours retourner tous les résultats

/** Résultat agrégé de plusieurs vérifications */
export interface VerificationAggregatedResult {
  /** ID unique du lot de vérifications */
  batchId: ID;
  /** ID de la cible vérifiée */
  targetId: ID;
  /** Type de la cible */
  targetType: VerificationContext["targetType"];
  /** Résultats individuels de chaque vérificateur */
  results: VerificationResult[];
  /** Toutes les vérifications ont-elles passé ? */
  allPassed: boolean;
  /** Y a-t-il eu des erreurs ? */
  hasErrors: boolean;
  /** Y a-t-il eu des échecs ? */
  hasFailures: boolean;
  /** Nombre de vérifications passées */
  passedCount: number;
  /** Nombre de vérifications échouées */
  failedCount: number;
  /** Nombre de vérifications ignorées */
  skippedCount: number;
  /** Nombre d'erreurs */
  errorCount: number;
  /** Résumé global */
  summary: string;
  /** Durée totale (ms) */
  totalDurationMs: number;
  /** Timestamp de début */
  startedAt: Timestamp;
  /** Timestamp de fin */
  completedAt: Timestamp;
}

/** Configuration du VerificationManager */
export interface VerificationManagerConfig {
  /** Stratégie par défaut */
  strategy: VerificationStrategy;
  /** Activer le gestionnaire */
  enabled: boolean;
  /** Timeout par vérification (ms) */
  timeoutMs: number;
  /** Nombre maximal de vérificateurs actifs */
  maxConcurrent: number;
  /** Activer les logs */
  enableLogs: boolean;
  /** Filtrer les vérificateurs par type */
  filterByType?: VerificationType[];
  /** Filtrer les vérificateurs par priorité minimale */
  minPriority?: Priority;
}

/** Configuration par défaut */
export const DEFAULT_VERIFICATION_MANAGER_CONFIG: VerificationManagerConfig = {
  strategy: "fail-fast",
  enabled: true,
  timeoutMs: 10000,
  maxConcurrent: 10,
  enableLogs: true,
};

// ═══════════════════════════════════════════════════════════════════════════════
// VerificationManager
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gestionnaire central de vérifications.
 * 
 * Ce composant coordonne l'exécution de multiples vérificateurs sur une cible
 * et agrège les résultats.
 */
export class VerificationManager {
  // Vérificateurs enregistrés
  private verifiers: Map<ID, Verifier> = new Map();
  
  // Configuration
  private config: VerificationManagerConfig;
  
  // Statistiques
  private stats: {
    totalBatches: number;
    totalVerifications: number;
    passed: number;
    failed: number;
    skipped: number;
    errors: number;
    avgDurationMs: number;
  } = {
    totalBatches: 0,
    totalVerifications: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    errors: 0,
    avgDurationMs: 0,
  };
  
  // Historique
  private history: VerificationAggregatedResult[] = [];
  private readonly maxHistorySize = 100;

  /**
   * Crée un nouveau VerificationManager.
   */
  constructor(config: Partial<VerificationManagerConfig> = {}) {
    this.config = { ...DEFAULT_VERIFICATION_MANAGER_CONFIG, ...config };
    console.log("[VerificationManager] Initialisé avec stratégie:", this.config.strategy);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Verifier Management
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Ajoute un vérificateur au gestionnaire.
   */
  addVerifier(verifier: Verifier): ID {
    const id = verifier.getId();
    this.verifiers.set(id, verifier);
    console.log(`[VerificationManager] Vérificateur ajouté: ${verifier.getName()}`);
    return id;
  }

  /**
   * Supprime un vérificateur par son ID.
   */
  removeVerifier(id: ID): boolean {
    const removed = this.verifiers.delete(id);
    if (removed) {
      console.log(`[VerificationManager] Vérificateur supprimé: ${id}`);
    }
    return removed;
  }

  /**
   * Supprime un vérificateur par son nom.
   */
  removeVerifierByName(name: string): boolean {
    for (const [id, verifier] of this.verifiers) {
      if (verifier.getName() === name) {
        return this.removeVerifier(id);
      }
    }
    return false;
  }

  /**
   * Retourne un vérificateur par son ID.
   */
  getVerifier(id: ID): Verifier | undefined {
    return this.verifiers.get(id);
  }

  /**
   * Retourne un vérificateur par son nom.
   */
  getVerifierByName(name: string): Verifier | undefined {
    for (const verifier of this.verifiers.values()) {
      if (verifier.getName() === name) {
        return verifier;
      }
    }
    return undefined;
  }

  /**
   * Retourne tous les vérificateurs.
   */
  getAllVerifiers(): Verifier[] {
    return Array.from(this.verifiers.values());
  }

  /**
   * Retourne les vérificateurs par type.
   */
  getVerifiersByType(type: VerificationType): Verifier[] {
    const result: Verifier[] = [];
    for (const verifier of this.verifiers.values()) {
      if (verifier.getType() === type) {
        result.push(verifier);
      }
    }
    return result;
  }

  /**
   * Active tous les vérificateurs.
   */
  enableAll(): void {
    for (const verifier of this.verifiers.values()) {
      verifier.enable();
    }
    console.log("[VerificationManager] Tous les vérificateurs activés");
  }

  /**
   * Désactive tous les vérificateurs.
   */
  disableAll(): void {
    for (const verifier of this.verifiers.values()) {
      verifier.disable();
    }
    console.log("[VerificationManager] Tous les vérificateurs désactivés");
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Verification Execution
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Exécute toutes les vérifications pertinentes sur une cible.
   * 
   * @param context - Contexte de la vérification
   * @returns Résultat agrégé de toutes les vérifications
   */
  async verify(context: VerificationContext): Promise<VerificationAggregatedResult> {
    if (!this.config.enabled) {
      return this.createEmptyResult(context, "Désactivé");
    }

    const batchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = new Date().toISOString();
    
    // Filtrer les vérificateurs pertinents
    const relevantVerifiers = this.getRelevantVerifiers(context);
    
    if (relevantVerifiers.length === 0) {
      return this.createEmptyResult(context, "Aucun vérificateur pertinent");
    }

    // Émettre l'événement de début
    this.emitEvent("verification:scheduled", {
      batchId,
      targetId: context.targetId,
      targetType: context.targetType,
      verifierCount: relevantVerifiers.length,
      timestamp: startTime,
    });

    const results: VerificationResult[] = [];
    let hasErrors = false;
    let hasFailures = false;
    let passedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    // Exécuter les vérifications selon la stratégie
    if (this.config.strategy === "fail-fast") {
      // Arrêter à la première vérification échouée
      for (const verifier of relevantVerifiers) {
        const result = await this.executeVerifier(verifier, context);
        results.push(result);
        
        this.updateCounters(result, {
          passedCount: () => passedCount++,
          failedCount: () => failedCount++,
          skippedCount: () => skippedCount++,
          errorCount: () => { hasErrors = true; errorCount++; },
          hasFailures: () => { hasFailures = true; }
        });
        
        // Arrêter si échec
        if (result.status === "failed" || result.status === "error") {
          break;
        }
      }
    } else {
      // Continuer toutes les vérifications (continue ou collect-all)
      const promises = relevantVerifiers.map(async (verifier) => {
        return this.executeVerifier(verifier, context);
      });
      
      const settledResults = await Promise.allSettled(promises);
      
      for (const settled of settledResults) {
        if (settled.status === "fulfilled") {
          const result = settled.value;
          results.push(result);
          
          this.updateCounters(result, {
            passedCount: () => passedCount++,
            failedCount: () => failedCount++,
            skippedCount: () => skippedCount++,
            errorCount: () => { hasErrors = true; errorCount++; },
            hasFailures: () => { hasFailures = true; }
          });
        } else {
          // Erreur lors de l'exécution de la vérification
          hasErrors = true;
          errorCount++;
          results.push({
            id: `error-${Date.now()}`,
            type: "verification",
            status: "error",
            verifierName: "unknown",
            targetId: context.targetId,
            targetType: context.targetType,
            checks: [{
              id: `error-${Date.now()}`,
              name: "verification_error",
              description: "Erreur lors de la vérification",
              passed: false,
              message: settled.reason instanceof Error ? settled.reason.message : String(settled.reason),
              severity: "error",
            }],
            summary: "Erreur d'exécution de la vérification",
            startedAt: startTime,
            completedAt: new Date().toISOString(),
            durationMs: 0,
          });
        }
      }
    }

    const completedAt = new Date().toISOString();
    const totalDurationMs = new Date(completedAt).getTime() - new Date(startTime).getTime();
    
    const aggregated: VerificationAggregatedResult = {
      batchId,
      targetId: context.targetId,
      targetType: context.targetType,
      results,
      allPassed: passedCount === relevantVerifiers.length && !hasErrors && !hasFailures,
      hasErrors,
      hasFailures,
      passedCount,
      failedCount,
      skippedCount,
      errorCount,
      summary: this.createSummary(results, relevantVerifiers.length),
      totalDurationMs,
      startedAt: startTime,
      completedAt,
    };

    // Émettre l'événement de résultat
    this.emitEvent("verification:completed", aggregated);
    
    // Ajouter à l'historique
    this.history.push(aggregated);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
    
    // Mettre à jour les statistiques
    this.updateStats(aggregated);
    
    return aggregated;
  }

  /**
   * Exécute une vérification simple (première vérification pertinente).
   */
  async verifySimple(context: VerificationContext): Promise<VerificationResult | null> {
    const relevantVerifiers = this.getRelevantVerifiers(context);
    if (relevantVerifiers.length === 0) {
      return null;
    }
    
    // Utiliser le vérificateur avec la plus haute priorité
    relevantVerifiers.sort((a, b) => {
      const priorityOrder: Priority[] = ["critical", "high", "medium", "low"];
      return priorityOrder.indexOf(a.getPriority()) - priorityOrder.indexOf(b.getPriority());
    });
    
    const verifier = relevantVerifiers[0];
    return this.executeVerifier(verifier, context);
  }

  /**
   * Exécute un vérificateur spécifique.
   */
  private async executeVerifier(verifier: Verifier, context: VerificationContext): Promise<VerificationResult> {
    // Émettre l'événement de début pour ce vérificateur
    this.emitEvent("verification:started", {
      verifierName: verifier.getName(),
      targetId: context.targetId,
      targetType: context.targetType,
      timestamp: new Date().toISOString(),
    });
    
    const result = await verifier.verify(context);
    
    // Émettre l'événement de fin pour ce vérificateur
    this.emitEvent(`verification:${result.status}`, {
      ...result,
      batchId: `single-${Date.now()}`,
    });
    
    return result;
  }

  /**
   * Retourne les vérificateurs pertinents pour une cible.
   */
  private getRelevantVerifiers(context: VerificationContext): Verifier[] {
    const result: Verifier[] = [];
    
    for (const verifier of this.verifiers.values()) {
      if (!verifier.isEnabled()) continue;
      
      // Filtrer par type de cible
      if (verifier.getSupportedTargetTypes().includes(context.targetType)) {
        result.push(verifier);
      }
    }
    
    // Trier par priorité
    result.sort((a, b) => {
      const priorityOrder: Priority[] = ["critical", "high", "medium", "low"];
      return priorityOrder.indexOf(a.getPriority()) - priorityOrder.indexOf(b.getPriority());
    });
    
    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Event Emission
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Émet un événement de vérification sur EventBus.
   */
  private emitEvent(type: EventType, data: Record<string, unknown>): void {
    if (this.config.enableLogs) {
      console.log(`[VerificationManager] Événement: ${type}`, data);
    }
    
    eventBus.emit({
      type,
      data,
      timestamp: new Date().toISOString(),
      source: "verification.VerificationManager",
    } as never);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Helper Methods
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Crée un résultat vide (quand aucun vérificateur n'est pertinent).
   */
  private createEmptyResult(context: VerificationContext, reason: string): VerificationAggregatedResult {
    const now = new Date().toISOString();
    return {
      batchId: `empty-${Date.now()}`,
      targetId: context.targetId,
      targetType: context.targetType,
      results: [],
      allPassed: true, // Considéré comme passé s'il n'y a rien à vérifier
      hasErrors: false,
      hasFailures: false,
      passedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      errorCount: 0,
      summary: reason,
      totalDurationMs: 0,
      startedAt: now,
      completedAt: now,
    };
  }

  /**
   * Met à jour les compteurs basés sur un résultat de vérification.
   */
  private updateCounters(
    result: VerificationResult,
    counters: {
      passedCount: () => void;
      failedCount: () => void;
      skippedCount: () => void;
      errorCount: () => void;
      hasFailures: () => void;
    }
  ): void {
    switch (result.status) {
      case "passed":
        counters.passedCount();
        break;
      case "failed":
        counters.failedCount();
        counters.hasFailures();
        break;
      case "skipped":
        counters.skippedCount();
        break;
      case "error":
      case "running":
        counters.errorCount();
        counters.hasFailures();
        break;
    }
  }

  /**
   * Crée un résumé à partir des résultats.
   */
  private createSummary(results: VerificationResult[], totalCount: number): string {
    const passed = results.filter((r) => r.status === "passed").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const skipped = results.filter((r) => r.status === "skipped").length;
    const errors = results.filter((r) => r.status === "error").length;
    
    if (passed === totalCount && skipped === 0 && failed === 0 && errors === 0) {
      return `Toutes les vérifications (${totalCount}) ont passé`;
    }
    
    const parts: string[] = [];
    if (passed > 0) parts.push(`${passed} passé`);
    if (failed > 0) parts.push(`${failed} échoué`);
    if (skipped > 0) parts.push(`${skipped} ignoré`);
    if (errors > 0) parts.push(`${errors} erreur`);
    
    return `Vérifications: ${parts.join(", ")} sur ${totalCount} totales`;
  }

  /**
   * Met à jour les statistiques du gestionnaire.
   */
  private updateStats(result: VerificationAggregatedResult): void {
    this.stats.totalBatches++;
    this.stats.totalVerifications += result.results.length;
    this.stats.passed += result.passedCount;
    this.stats.failed += result.failedCount;
    this.stats.skipped += result.skippedCount;
    this.stats.errors += result.errorCount;
    
    // Mettre à jour la durée moyenne
    const totalDuration = this.stats.avgDurationMs * (this.stats.totalBatches - 1);
    this.stats.avgDurationMs = (totalDuration + result.totalDurationMs) / this.stats.totalBatches;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Configuration Methods
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Active le gestionnaire.
   */
  enable(): void {
    this.config.enabled = true;
    console.log("[VerificationManager] Activé");
  }

  /**
   * Désactive le gestionnaire.
   */
  disable(): void {
    this.config.enabled = false;
    console.log("[VerificationManager] Désactivé");
  }

  /**
   * Met à jour la configuration.
   */
  updateConfig(partialConfig: Partial<VerificationManagerConfig>): void {
    this.config = { ...this.config, ...partialConfig };
    console.log("[VerificationManager] Configuration mise à jour");
  }

  /**
   * Définit la stratégie.
   */
  setStrategy(strategy: VerificationStrategy): void {
    this.config.strategy = strategy;
    console.log(`[VerificationManager] Stratégie mise à jour: ${strategy}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Getters
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Retourne le nombre de vérificateurs enregistrés.
   */
  getVerifierCount(): number {
    return this.verifiers.size;
  }

  /**
   * Retourne les statistiques.
   */
  getStats(): {
    totalBatches: number;
    totalVerifications: number;
    passed: number;
    failed: number;
    skipped: number;
    errors: number;
    avgDurationMs: number;
  } {
    return { ...this.stats };
  }

  /**
   * Retourne l'historique.
   */
  getHistory(limit?: number): VerificationAggregatedResult[] {
    if (limit) {
      return [...this.history].slice(-limit);
    }
    return [...this.history];
  }

  /**
   * Retourne toutes les vérifications depuis l'historique.
   */
  getAllVerifications(): VerificationResult[] {
    return this.history.flatMap(batch => batch.results);
  }

  /**
   * Retourne si le gestionnaire est activé.
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Réinitialise les statistiques.
   */
  resetStats(): void {
    this.stats = {
      totalBatches: 0,
      totalVerifications: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      errors: 0,
      avgDurationMs: 0,
    };
    console.log("[VerificationManager] Statistiques réinitialisées");
  }

  /**
   * Efface l'historique.
   */
  clearHistory(): void {
    this.history = [];
    console.log("[VerificationManager] Historique effacé");
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Singleton Instance
// ═══════════════════════════════════════════════════════════════════════════════

/** Instance singleton du VerificationManager */
export const verificationManager = new VerificationManager();

export default VerificationManager;
