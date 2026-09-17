/**
 * AutonomyController — Gestion des niveaux d'autorité
 *
 * Implémente la matrice de permissions L0-L8 :
 *   - Chaque outil possède un niveau requis
 *   - Chaque action est validée avant exécution
 *   - Niveau configurable à chaud sans redémarrage
 *   - Historique des décisions pour audit
 */

import { createLogger } from "../utils/logger.js";
import type { AutonomyLevel } from "./types.js";
import { AUTONOMY_LEVEL_LABELS } from "./types.js";

const log = createLogger("AutonomyController");

// ═══════════════════════════════════════════════════════════════════════════════
// PERMISSION REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export interface ToolPermissionEntry {
  /** Niveau minimal requis pour exécuter cet outil */
  requiredLevel: AutonomyLevel;
  /** Description de ce que fait l'outil */
  description: string;
  /** Si true, une confirmation utilisateur est TOUJOURS demandée */
  requiresConfirmation?: boolean;
  /** Catégorie de l'outil */
  category: ToolCategory;
}

export type ToolCategory =
  | "read"
  | "analysis"
  | "sandbox_write"
  | "test_execution"
  | "main_write"
  | "git"
  | "external"
  | "destructive";

/**
 * Matrice de permissions : outil → niveau requis.
 * Seuls les outils listés ici sont autorisés par l'AutonomyController.
 * Tout outil non listé est traité comme niveau 8 (le plus restrictif).
 */
const TOOL_PERMISSIONS: Record<string, ToolPermissionEntry> = {
  // ── L2 — Lecture ────────────────────────────────────────────────────────
  "filesystem.read": { requiredLevel: 2, description: "Lire un fichier", category: "read" },
  "filesystem.list": { requiredLevel: 2, description: "Lister un répertoire", category: "read" },
  "filesystem.search": { requiredLevel: 2, description: "Rechercher dans le workspace", category: "read" },
  "git.status": { requiredLevel: 2, description: "Lire le statut git", category: "read" },
  "git.log": { requiredLevel: 2, description: "Lire l'historique git", category: "read" },
  "git.diff": { requiredLevel: 2, description: "Lire le diff courant", category: "read" },

  // ── L3 — Analyse ────────────────────────────────────────────────────────
  "knowledge.graph.query": { requiredLevel: 3, description: "Interroger le Knowledge Graph", category: "analysis" },
  "knowledge.search": { requiredLevel: 3, description: "Recherche sémantique", category: "analysis" },
  "knowledge.impact": { requiredLevel: 3, description: "Analyser l'impact d'un changement", category: "analysis" },
  "memory.read": { requiredLevel: 3, description: "Lire la mémoire projet", category: "analysis" },
  "memory.search": { requiredLevel: 3, description: "Recherche en mémoire", category: "analysis" },

  // ── L4 — Sandbox ────────────────────────────────────────────────────────
  "sandbox.write": { requiredLevel: 4, description: "Écrire dans le sandbox isolé", category: "sandbox_write" },
  "sandbox.create_file": { requiredLevel: 4, description: "Créer un fichier dans le sandbox", category: "sandbox_write" },
  "sandbox.delete_file": { requiredLevel: 4, description: "Supprimer un fichier du sandbox", category: "sandbox_write" },
  "memory.write": { requiredLevel: 4, description: "Écrire en mémoire projet", category: "sandbox_write" },

  // ── L5 — Tests ──────────────────────────────────────────────────────────
  "terminal.run_tests": { requiredLevel: 5, description: "Lancer les tests", category: "test_execution" },
  "terminal.typecheck": { requiredLevel: 5, description: "Vérification TypeScript", category: "test_execution" },
  "sandbox.validate": { requiredLevel: 5, description: "Valider le sandbox (tsc + tests)", category: "test_execution" },
  "terminal.lint": { requiredLevel: 5, description: "Linter le code", category: "test_execution" },

  // ── L6 — Corrections autonomes ──────────────────────────────────────────
  "sandbox.sync_to_main": { requiredLevel: 6, description: "Synchroniser sandbox → main", category: "main_write" },
  "filesystem.write": { requiredLevel: 6, description: "Écrire dans le workspace principal", category: "main_write" },
  "filesystem.create_file": { requiredLevel: 6, description: "Créer un fichier dans le workspace", category: "main_write" },

  // ── L7 — Actions externes ────────────────────────────────────────────────
  "git.commit": { requiredLevel: 7, description: "Créer un commit git", category: "git" },
  "git.push": { requiredLevel: 7, description: "Pousser vers le remote", category: "git" },
  "git.branch": { requiredLevel: 7, description: "Créer/supprimer une branche", category: "git" },
  "browser.navigate": { requiredLevel: 7, description: "Naviguer dans le navigateur", category: "external" },
  "browser.click": { requiredLevel: 7, description: "Cliquer dans le navigateur", category: "external" },
  "telegram.send": { requiredLevel: 7, description: "Envoyer un message Telegram", category: "external" },
  "http.request": { requiredLevel: 7, description: "Requête HTTP externe", category: "external" },

  // ── L8 — Missions longues / Destructif ──────────────────────────────────
  "filesystem.delete_directory": { requiredLevel: 8, description: "Supprimer un dossier", category: "destructive", requiresConfirmation: true },
  "filesystem.bulk_delete": { requiredLevel: 8, description: "Suppression en masse", category: "destructive", requiresConfirmation: true },
  "git.force_push": { requiredLevel: 8, description: "Force push git", category: "git", requiresConfirmation: true },
  "external.purchase": { requiredLevel: 8, description: "Action d'achat externe", category: "external", requiresConfirmation: true },
  "long_mission.start": { requiredLevel: 8, description: "Démarrer une mission longue multi-agents", category: "external" },
};

// ═══════════════════════════════════════════════════════════════════════════════
// PERMISSION DECISION
// ═══════════════════════════════════════════════════════════════════════════════

export type PermissionDecision =
  | { allowed: true; requiresConfirmation: false }
  | { allowed: true; requiresConfirmation: true; reason: string }
  | { allowed: false; reason: string; requiredLevel: AutonomyLevel; currentLevel: AutonomyLevel };

export interface PermissionAuditEntry {
  timestamp: string;
  tool: string;
  decision: "allowed" | "denied" | "confirmation_required";
  currentLevel: AutonomyLevel;
  requiredLevel: AutonomyLevel;
  reason?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTONOMY CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════════

export class AutonomyController {
  private level: AutonomyLevel;
  private auditLog: PermissionAuditEntry[] = [];
  private readonly maxAuditLogSize = 500;

  constructor(initialLevel: AutonomyLevel = 6) {
    this.level = initialLevel;
    log.info(`🔐 AutonomyController initialisé — niveau: ${this.level} (${AUTONOMY_LEVEL_LABELS[this.level]})`);
  }

  // ─── Niveau courant ────────────────────────────────────────────────────────

  getLevel(): AutonomyLevel {
    return this.level;
  }

  setLevel(level: AutonomyLevel): void {
    const previous = this.level;
    this.level = level;
    log.info(
      `🔐 Niveau d'autonomie changé: ${previous} (${AUTONOMY_LEVEL_LABELS[previous]}) → ${level} (${AUTONOMY_LEVEL_LABELS[level]})`
    );
  }

  getLevelLabel(): string {
    return AUTONOMY_LEVEL_LABELS[this.level];
  }

  // ─── Vérification d'autorisation ─────────────────────────────────────────

  /**
   * Vérifie si un outil est autorisé au niveau courant.
   */
  canUse(toolName: string): PermissionDecision {
    const entry = TOOL_PERMISSIONS[toolName];
    const requiredLevel: AutonomyLevel = entry?.requiredLevel ?? 8;

    if (this.level < requiredLevel) {
      const reason = entry
        ? `L'outil "${toolName}" requiert le niveau ${requiredLevel} (${AUTONOMY_LEVEL_LABELS[requiredLevel]}). Niveau actuel: ${this.level} (${AUTONOMY_LEVEL_LABELS[this.level]})`
        : `Outil inconnu "${toolName}" — niveau 8 requis par défaut. Niveau actuel: ${this.level}`;

      this._audit(toolName, "denied", requiredLevel, reason);
      return { allowed: false, reason, requiredLevel, currentLevel: this.level };
    }

    if (entry?.requiresConfirmation) {
      const reason = `L'outil "${toolName}" est autorisé (niveau ${this.level} ≥ ${requiredLevel}) mais requiert une confirmation explicite.`;
      this._audit(toolName, "confirmation_required", requiredLevel);
      return { allowed: true, requiresConfirmation: true, reason };
    }

    this._audit(toolName, "allowed", requiredLevel);
    return { allowed: true, requiresConfirmation: false };
  }

  /**
   * Vérifie si un niveau d'autonomie requis est satisfait.
   */
  meetsLevel(required: AutonomyLevel): boolean {
    return this.level >= required;
  }

  /**
   * Asserte qu'un niveau est satisfait — lance une erreur sinon.
   */
  assertLevel(required: AutonomyLevel, context?: string): void {
    if (!this.meetsLevel(required)) {
      throw new AutonomyDeniedError(
        required,
        this.level,
        context ?? "action non spécifiée"
      );
    }
  }

  // ─── Inspection ───────────────────────────────────────────────────────────

  /**
   * Retourne tous les outils autorisés au niveau courant.
   */
  getAllowedTools(): string[] {
    return Object.entries(TOOL_PERMISSIONS)
      .filter(([, entry]) => entry.requiredLevel <= this.level && !entry.requiresConfirmation)
      .map(([name]) => name);
  }

  /**
   * Retourne tous les outils bloqués au niveau courant.
   */
  getBlockedTools(): Array<{ tool: string; requiredLevel: AutonomyLevel; description: string }> {
    return Object.entries(TOOL_PERMISSIONS)
      .filter(([, entry]) => entry.requiredLevel > this.level)
      .map(([tool, entry]) => ({
        tool,
        requiredLevel: entry.requiredLevel,
        description: entry.description,
      }));
  }

  /**
   * Retourne les entrées d'audit récentes.
   */
  getAuditLog(limit = 50): PermissionAuditEntry[] {
    return this.auditLog.slice(-limit);
  }

  /**
   * Retourne les statistiques des permissions.
   */
  getStats(): {
    currentLevel: AutonomyLevel;
    currentLevelLabel: string;
    allowedTools: number;
    blockedTools: number;
    auditEntries: number;
    recentDenials: number;
  } {
    const allowed = this.getAllowedTools().length;
    const blocked = this.getBlockedTools().length;
    const cutoff = Date.now() - 60 * 60 * 1000; // dernière heure
    const recentDenials = this.auditLog.filter(
      (e) => e.decision === "denied" && new Date(e.timestamp).getTime() > cutoff
    ).length;

    return {
      currentLevel: this.level,
      currentLevelLabel: AUTONOMY_LEVEL_LABELS[this.level],
      allowedTools: allowed,
      blockedTools: blocked,
      auditEntries: this.auditLog.length,
      recentDenials,
    };
  }

  // ─── Interne ──────────────────────────────────────────────────────────────

  private _audit(
    tool: string,
    decision: PermissionAuditEntry["decision"],
    requiredLevel: AutonomyLevel,
    reason?: string
  ): void {
    this.auditLog.push({
      timestamp: new Date().toISOString(),
      tool,
      decision,
      currentLevel: this.level,
      requiredLevel,
      reason,
    });

    // Rotation du log
    if (this.auditLog.length > this.maxAuditLogSize) {
      this.auditLog = this.auditLog.slice(-this.maxAuditLogSize);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTONOMY DENIED ERROR
// ═══════════════════════════════════════════════════════════════════════════════

export class AutonomyDeniedError extends Error {
  constructor(
    public readonly requiredLevel: AutonomyLevel,
    public readonly currentLevel: AutonomyLevel,
    public readonly context: string
  ) {
    super(
      `[AutonomyDenied] Niveau ${requiredLevel} (${AUTONOMY_LEVEL_LABELS[requiredLevel]}) requis pour "${context}". ` +
        `Niveau actuel: ${currentLevel} (${AUTONOMY_LEVEL_LABELS[currentLevel]})`
    );
    this.name = "AutonomyDeniedError";
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

/** Instance singleton partagée de l'AutonomyController. */
export const autonomyController = new AutonomyController(6);
