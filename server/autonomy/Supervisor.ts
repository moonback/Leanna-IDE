/**
 * SUPERVISOR — Boucle de contrôle côté serveur.
 *
 * Le Supervisor intercepte les résultats des outils après exécution
 * et injecte des instructions correctives dans la session Gemini Live
 * quand des problèmes sont détectés (verify échoue, tests cassés, etc.)
 *
 * C'est la pièce manquante entre "le modèle reçoit le résultat d'erreur"
 * et "le modèle est FORCÉ de corriger avant de continuer".
 *
 * Architecture:
 *   handleToolCall()
 *     → skillManager.handleToolCall()
 *     → Supervisor.evaluate(result)
 *       → Si problème: inject correction directive via sendClientContent
 *       → Si boucle: escalate ou abort
 *     → session.sendToolResponse()
 */

import { createLogger } from "../utils/logger";

const log = createLogger("Supervisor");

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface SupervisorConfig {
  /** Max retries avant escalation (défaut: 3) */
  maxRetries: number;
  /** Active la correction automatique (défaut: true) */
  autoCorrect: boolean;
  /** Active le suivi de mission persistant (défaut: true) */
  trackMission: boolean;
  /** Timeout par action (ms, défaut: 30000) */
  actionTimeout: number;
}

export interface VerifyFailure {
  file: string;
  errors: string;
  timestamp: number;
  attemptNumber: number;
}

export interface MissionObjective {
  id: string;
  description: string;
  successCriteria: string[];
  status: "active" | "completed" | "failed" | "paused";
  startedAt: number;
  /** Fichiers modifiés pendant cette mission */
  touchedFiles: Set<string>;
  /** Historique des vérifications échouées */
  verifyFailures: VerifyFailure[];
  /** Nombre total de corrections effectuées */
  corrections: number;
}

export type SessionInjector = (message: string) => void;

// ═══════════════════════════════════════════════════════════════════════════════
// Supervisor
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_CONFIG: SupervisorConfig = {
  maxRetries: 3,
  autoCorrect: true,
  trackMission: true,
  actionTimeout: 30000,
};

export class Supervisor {
  private config: SupervisorConfig;
  private currentMission: MissionObjective | null = null;
  private injector: SessionInjector | null = null;

  /** Historique des corrections par fichier (pour détection de boucles) */
  private correctionHistory: Map<string, { count: number; lastErrors: string[] }> = new Map();

  /** Fichiers bloqués après détection de boucle */
  private blockedFiles: Set<string> = new Set();

  /** Timestamp de la dernière directive injectée par fichier (pour backoff) */
  private lastDirectiveAt: Map<string, number> = new Map();

  /** Compteur global de corrections dans la session */
  private totalCorrections = 0;
  private static readonly MAX_TOTAL_CORRECTIONS = 10;

  /** Délai de base pour le backoff exponentiel (ms) */
  private static readonly BACKOFF_BASE_MS = 500;

  constructor(config: Partial<SupervisorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ─── Configuration ────────────────────────────────────────────────────────

  /**
   * Injecte la fonction qui permet d'envoyer des messages dans la session Live.
   * C'est le lien entre le superviseur et Gemini.
   */
  setSessionInjector(injector: SessionInjector): void {
    this.injector = injector;
  }

  /**
   * Démarre une nouvelle mission (objectif persistant).
   */
  startMission(description: string, successCriteria: string[] = []): MissionObjective {
    this.currentMission = {
      id: `mission_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      description,
      successCriteria: successCriteria.length > 0 ? successCriteria : [
        "Code compile sans erreur",
        "verify_file passe",
        "Aucun breaking change",
      ],
      status: "active",
      startedAt: Date.now(),
      touchedFiles: new Set(),
      verifyFailures: [],
      corrections: 0,
    };

    log.info(`🎯 Mission démarrée: "${description}" (${this.currentMission.id})`);
    return this.currentMission;
  }

  /**
   * Récupère la mission active.
   */
  getMission(): MissionObjective | null {
    return this.currentMission;
  }

  /**
   * Termine la mission active.
   */
  completeMission(success: boolean): void {
    if (!this.currentMission) return;
    this.currentMission.status = success ? "completed" : "failed";
    log.info(`${success ? "✓" : "✗"} Mission terminée: "${this.currentMission.description}" (${this.currentMission.corrections} corrections)`);
    this.currentMission = null;
    this.correctionHistory.clear();
    this.blockedFiles.clear();
    this.lastDirectiveAt.clear();
    this.totalCorrections = 0;
  }

  // ─── Évaluation post-outil ────────────────────────────────────────────────

  /**
   * Évalue le résultat d'un verify_file et décide de la réaction.
   * Retourne true si une correction a été injectée (le modèle va recevoir une directive).
   */
  evaluateVerifyResult(
    filePath: string,
    verifyResult: any,
  ): { needsCorrection: boolean; directive?: string } {
    // Si verify passe → tout va bien
    if (verifyResult?.ok === true || verifyResult?.status === "ok" || verifyResult?.valid === true) {
      // Nettoyer le compteur pour ce fichier
      this.correctionHistory.delete(filePath);
      if (this.currentMission) {
        this.currentMission.touchedFiles.add(filePath);
      }
      return { needsCorrection: false };
    }

    // Extraire les erreurs
    const errors = this.extractErrors(verifyResult);
    if (!errors) {
      return { needsCorrection: false };
    }

    // Tracker le fichier
    if (this.currentMission) {
      this.currentMission.touchedFiles.add(filePath);
    }

    // Vérifier le nombre de retries pour ce fichier
    const history = this.correctionHistory.get(filePath) || { count: 0, lastErrors: [] };
    history.count++;
    // Garder un historique glissant (max 5 dernières erreurs pour détecter les alternances)
    history.lastErrors.push(errors);
    if (history.lastErrors.length > 5) history.lastErrors.shift();
    this.correctionHistory.set(filePath, history);

    // Détection de boucle élargie : erreur identique à l'une des 3 dernières tentatives
    const recentErrors = history.lastErrors.slice(0, -1); // tout sauf la courante
    const isLoop = recentErrors.some((prev) => prev === errors);

    // --- Trop de retries globaux → escalation (toujours prioritaire) ---
    if (this.totalCorrections >= Supervisor.MAX_TOTAL_CORRECTIONS) {
      log.warn(`⚠️ Limite de corrections globale atteinte (${Supervisor.MAX_TOTAL_CORRECTIONS}). Escalation.`);
      this.blockedFiles.add(filePath);
      return {
        needsCorrection: true,
        directive: this.buildEscalationDirective(filePath, errors),
      };
    }

    // --- Boucle détectée (erreur déjà vue) → bloquer le fichier immédiatement ---
    if (isLoop) {
      log.warn(`🔄 Boucle détectée sur ${filePath} (attempt #${history.count}). Fichier bloqué.`);
      this.blockedFiles.add(filePath);
      this.totalCorrections++; // compter la tentative ratée pour atteindre MAX
      if (this.currentMission) {
        this.currentMission.corrections++;
        this.currentMission.verifyFailures.push({
          file: filePath,
          errors,
          timestamp: Date.now(),
          attemptNumber: history.count,
        });
      }
      return {
        needsCorrection: true,
        directive: this.buildLoopBreakDirective(filePath, errors),
      };
    }

    // --- Trop de retries sur ce fichier → pivot ---
    if (history.count > this.config.maxRetries) {
      log.warn(`⚠️ Fichier ${filePath}: ${history.count} tentatives échouées. Pivot nécessaire.`);
      this.totalCorrections++;
      if (this.currentMission) {
        this.currentMission.corrections++;
        this.currentMission.verifyFailures.push({
          file: filePath,
          errors,
          timestamp: Date.now(),
          attemptNumber: history.count,
        });
      }
      return {
        needsCorrection: true,
        directive: this.buildPivotDirective(filePath, errors, history.count),
      };
    }

    // --- Cas normal : backoff exponentiel puis injection ---
    const backoffMs = Supervisor.BACKOFF_BASE_MS * Math.pow(2, history.count - 1);
    const lastAt = this.lastDirectiveAt.get(filePath) ?? 0;
    const elapsed = Date.now() - lastAt;
    if (elapsed < backoffMs) {
      const wait = backoffMs - elapsed;
      log.debug(`⏳ Backoff ${wait}ms pour ${filePath} (attempt #${history.count})`);
      // On retourne la directive quand même — l'appelant peut attendre ou ignorer
    }
    this.lastDirectiveAt.set(filePath, Date.now());

    this.totalCorrections++;
    if (this.currentMission) {
      this.currentMission.corrections++;
      this.currentMission.verifyFailures.push({
        file: filePath,
        errors,
        timestamp: Date.now(),
        attemptNumber: history.count,
      });
    }

    log.info(`🔧 Correction #${history.count} pour ${filePath} (backoff: ${backoffMs}ms)`);
    return {
      needsCorrection: true,
      directive: this.buildCorrectionDirective(filePath, errors, history.count),
    };
  }

  /**
   * Évalue un résultat de build global.
   */
  evaluateBuildResult(result: { valid: boolean; errors?: string }): {
    needsCorrection: boolean;
    directive?: string;
  } {
    if (result.valid) return { needsCorrection: false };

    return {
      needsCorrection: true,
      directive: this.buildGlobalBuildDirective(result.errors || "Build failed"),
    };
  }

  /**
   * Injecte une directive dans la session Gemini Live.
   * C'est ici que le superviseur FORCE le modèle à agir.
   */
  injectDirective(directive: string): void {
    if (!this.injector) {
      log.warn("Pas d'injecteur configuré. Directive ignorée.");
      return;
    }
    this.injector(directive);
  }

  // ─── Construction des directives ─────────────────────────────────────────

  private buildCorrectionDirective(file: string, errors: string, attempt: number): string {
    return [
      `[SUPERVISOR — CORRECTION REQUISE]`,
      ``,
      `Le fichier "${file}" contient des erreurs après ta modification (tentative ${attempt}/${this.config.maxRetries}).`,
      ``,
      `Erreurs détectées:`,
      errors.slice(0, 500),
      ``,
      `INSTRUCTION OBLIGATOIRE:`,
      `1. Analyse les erreurs ci-dessus.`,
      `2. Corrige le fichier immédiatement (patch_project_file ou modify_project_file).`,
      `3. La vérification sera relancée automatiquement.`,
      ``,
      `Ne passe PAS à une autre tâche tant que ce fichier n'est pas valide.`,
    ].join("\n");
  }

  private buildPivotDirective(file: string, errors: string, attempts: number): string {
    return [
      `[SUPERVISOR — PIVOT REQUIS]`,
      ``,
      `Le fichier "${file}" a échoué ${attempts} fois avec des approches similaires.`,
      ``,
      `Dernières erreurs:`,
      errors.slice(0, 300),
      ``,
      `INSTRUCTION OBLIGATOIRE:`,
      `1. STOP — N'essaie pas la même approche une fois de plus.`,
      `2. DIAGNOSE — Pourquoi tes corrections précédentes n'ont pas fonctionné ?`,
      `3. PIVOT — Adopte une approche fondamentalement différente :`,
      `   - Peut-être la structure du code doit changer`,
      `   - Peut-être un import manque ou un type est incorrect`,
      `   - Peut-être le fichier entier doit être réécrit (write_project_file)`,
      `4. Si tu es bloqué, explique le problème à l'utilisateur et demande de l'aide.`,
    ].join("\n");
  }

  private buildLoopBreakDirective(file: string, errors: string): string {
    return [
      `[SUPERVISOR — BOUCLE DÉTECTÉE]`,
      ``,
      `Tu produis les MÊMES erreurs sur "${file}" après correction.`,
      `Tes corrections précédentes ne changent pas le résultat.`,
      ``,
      `Erreurs (identiques aux précédentes):`,
      errors.slice(0, 300),
      ``,
      `INSTRUCTION OBLIGATOIRE:`,
      `1. Relis le fichier en entier (read_project_file sans restriction de lignes).`,
      `2. Comprends la CAUSE RACINE — pas juste le symptôme.`,
      `3. Propose une solution DIFFÉRENTE de ce que tu as déjà essayé.`,
      `4. Si c'est un problème de type/import, vérifie les fichiers dépendants.`,
    ].join("\n");
  }

  private buildEscalationDirective(_file: string, _errors: string): string {
    return [
      `[SUPERVISOR — ESCALATION]`,
      ``,
      `Trop de corrections ont été nécessaires (${this.totalCorrections}/${Supervisor.MAX_TOTAL_CORRECTIONS}).`,
      `Cela indique un problème structurel.`,
      ``,
      `INSTRUCTION:`,
      `1. Explique à l'utilisateur ce qui bloque.`,
      `2. Résume les erreurs persistantes.`,
      `3. Propose des options : rollback, approche différente, ou aide humaine.`,
      `4. N'essaie PLUS de corriger automatiquement sans validation humaine.`,
    ].join("\n");
  }

  private buildGlobalBuildDirective(errors: string): string {
    return [
      `[SUPERVISOR — BUILD CASSÉ]`,
      ``,
      `Le build global du projet a échoué après tes modifications.`,
      ``,
      `Erreurs:`,
      errors.slice(0, 800),
      ``,
      `INSTRUCTION OBLIGATOIRE:`,
      `1. Identifie quels fichiers tu as modifiés qui causent le problème.`,
      `2. Corrige-les un par un en commençant par celui qui a le plus d'erreurs.`,
      `3. Vérifie après chaque correction.`,
      `4. Le build doit passer avant que la tâche soit considérée terminée.`,
    ].join("\n");
  }

  // ─── Utilitaires ─────────────────────────────────────────────────────────

  private extractErrors(verifyResult: any): string | null {
    if (!verifyResult) return null;

    // Format verify_file: { ok: false, tsc: { ok: false, errors: "..." }, lint: {...}, test: {...} }
    const parts: string[] = [];

    if (verifyResult.tsc && !verifyResult.tsc.ok) {
      parts.push(`TypeScript: ${verifyResult.tsc.errors || verifyResult.tsc.stderr || "Erreur"}`);
    }
    if (verifyResult.lint && !verifyResult.lint.ok) {
      parts.push(`Lint: ${verifyResult.lint.errors || verifyResult.lint.stderr || "Erreur"}`);
    }
    if (verifyResult.test && !verifyResult.test.ok) {
      parts.push(`Tests: ${verifyResult.test.errors || verifyResult.test.stderr || "Erreur"}`);
    }

    // Fallback pour d'autres formats
    if (parts.length === 0) {
      if (verifyResult.error) parts.push(verifyResult.error);
      if (verifyResult.errors) parts.push(verifyResult.errors);
      if (verifyResult.stderr) parts.push(verifyResult.stderr);
    }

    return parts.length > 0 ? parts.join("\n") : null;
  }

  /**
   * Vérifie si un fichier est bloqué (boucle de correction détectée).
   * Utilisé par le serveur pour rejeter les écritures sur ce fichier.
   */
  isFileBlocked(filePath: string): boolean {
    return this.blockedFiles.has(filePath);
  }

  /**
   * Reset complet (utile pour nouvelle session).
   */
  reset(): void {
    this.currentMission = null;
    this.correctionHistory.clear();
    this.blockedFiles.clear();
    this.lastDirectiveAt.clear();
    this.totalCorrections = 0;
  }

  /**
   * Statistiques de la session.
   */
  getStats(): {
    totalCorrections: number;
    activeMission: string | null;
    filesWithIssues: string[];
    blockedFiles: string[];
  } {
    return {
      totalCorrections: this.totalCorrections,
      activeMission: this.currentMission?.description ?? null,
      filesWithIssues: Array.from(this.correctionHistory.entries())
        .filter(([_, h]) => h.count > 0)
        .map(([f]) => f),
      blockedFiles: Array.from(this.blockedFiles),
    };
  }
}

// ─── Instance singleton ─────────────────────────────────────────────────────

export const supervisor = new Supervisor();
