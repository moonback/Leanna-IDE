/**
 * PermissionPolicy — Modèle de permissions par skill appliqué au runtime
 *
 * Roadmap V1.1 · Sécurité & contrôle de l'agent :
 *   « Modèle de permissions par skill (read / write / network / exec)
 *     déclaré et appliqué au runtime »
 *
 * Chaque outil déclare les permissions qu'il requiert (via son skill ou sa
 * déclaration). La politique définit, elle, ce qui est *accordé* globalement
 * à l'exécution. À chaque appel, le ToolRegistry compare les permissions
 * requises par l'outil au jeu accordé par la politique :
 *
 *   - mode "enforce" : un appel réclamant une permission non accordée est refusé.
 *   - mode "audit"   : l'appel passe mais un avertissement est journalisé.
 *   - mode "off"     : aucune vérification (comportement legacy).
 *
 * La politique est indépendante des permissions éventuellement fournies par
 * l'appelant (`callerPermissions`) : elle s'applique *toujours*, ce qui répond
 * à l'exigence « appliqué au runtime ».
 */

import {
  normalizePermissions,
  type ToolPermission,
} from "./types.js";
import type { EventBus } from "./EventBus.js";

export type PermissionMode = "enforce" | "audit" | "off";

/** Toutes les permissions accordées par défaut (comportement ouvert). */
export const ALL_PERMISSIONS: readonly ToolPermission[] = [
  "read",
  "write",
  "network",
  "exec",
  "dangerous",
];

export interface PermissionDecision {
  allowed: boolean;
  toolName: string;
  required: ToolPermission[];
  /** Permissions requises mais non accordées (vide si autorisé). */
  missing: ToolPermission[];
  mode: PermissionMode;
}

export interface PermissionPolicyConfig {
  /** Mode d'application. Défaut : "enforce". */
  mode?: PermissionMode;
  /** Permissions accordées globalement. Défaut : toutes. */
  granted?: ToolPermission[];
  /** EventBus optionnel pour émettre les décisions/refus. */
  eventBus?: EventBus;
  /** Callback appelé à chaque refus (audit, alerte…). */
  onDeny?: (decision: PermissionDecision) => void;
}

/**
 * Politique de permissions appliquée au runtime.
 */
export class PermissionPolicy {
  private mode: PermissionMode;
  private granted: Set<ToolPermission>;
  private readonly eventBus?: EventBus;
  private readonly onDeny?: (decision: PermissionDecision) => void;
  private denials: PermissionDecision[] = [];
  private static readonly MAX_DENIALS = 200;

  constructor(config: PermissionPolicyConfig = {}) {
    this.mode = config.mode ?? "enforce";
    this.granted = new Set(
      normalizePermissions(config.granted ?? [...ALL_PERMISSIONS])
    );
    this.eventBus = config.eventBus;
    this.onDeny = config.onDeny;
  }

  getMode(): PermissionMode {
    return this.mode;
  }

  setMode(mode: PermissionMode): void {
    this.mode = mode;
  }

  /** Permissions actuellement accordées (forme canonique triée). */
  getGranted(): ToolPermission[] {
    return normalizePermissions([...this.granted]);
  }

  /** Remplace le jeu de permissions accordées. */
  setGranted(permissions: ToolPermission[]): void {
    this.granted = new Set(normalizePermissions(permissions));
  }

  grant(permission: ToolPermission): void {
    for (const p of normalizePermissions([permission])) this.granted.add(p);
  }

  revoke(permission: ToolPermission): void {
    for (const p of normalizePermissions([permission])) this.granted.delete(p);
  }

  isGranted(permission: ToolPermission): boolean {
    return this.granted.has(normalizePermissions([permission])[0]!);
  }

  /**
   * Évalue si un outil peut être appelé compte tenu de ses permissions requises.
   * N'applique aucun effet de bord de refus — voir `enforce()`.
   */
  evaluate(
    toolName: string,
    required: readonly ToolPermission[] | undefined
  ): PermissionDecision {
    const normalized = normalizePermissions(required);

    if (this.mode === "off" || normalized.length === 0) {
      return { allowed: true, toolName, required: normalized, missing: [], mode: this.mode };
    }

    const missing = normalized.filter((p) => !this.granted.has(p));
    const allowed = this.mode === "audit" ? true : missing.length === 0;

    return { allowed, toolName, required: normalized, missing, mode: this.mode };
  }

  /**
   * Applique la politique : émet les événements/callbacks et journalise les refus.
   * Retourne la décision. En mode "enforce", `allowed=false` doit conduire
   * l'appelant à lever une erreur de permission.
   */
  enforce(
    toolName: string,
    required: readonly ToolPermission[] | undefined,
    agentId?: string
  ): PermissionDecision {
    const decision = this.evaluate(toolName, required);

    if (decision.missing.length > 0) {
      // Refus (enforce) ou simple avertissement (audit).
      this.recordDenial(decision);
      this.onDeny?.(decision);

      if (this.mode === "audit") {
        console.warn(
          `[PermissionPolicy] AUDIT — outil "${toolName}" utilise ` +
            `[${decision.missing.join(", ")}] non accordé(s)` +
            (agentId ? ` (agent: ${agentId})` : "")
        );
      }

      this.eventBus?.emit({
        type: "tool:permissionDenied",
        toolName,
        required: decision.required,
        missing: decision.missing,
        mode: this.mode,
        enforced: this.mode === "enforce",
        agentId,
      });
    }

    return decision;
  }

  /** Historique des refus récents (pour l'UI d'audit). */
  getDenials(limit = 50): PermissionDecision[] {
    return this.denials.slice(-limit);
  }

  private recordDenial(decision: PermissionDecision): void {
    this.denials.push(decision);
    if (this.denials.length > PermissionPolicy.MAX_DENIALS) {
      this.denials.splice(0, this.denials.length - PermissionPolicy.MAX_DENIALS);
    }
  }

  // ─── Fabrique depuis l'environnement ─────────────────────────────────────

  /**
   * Construit une politique depuis les variables d'environnement :
   *   - Leanna_PERMISSION_MODE   : enforce | audit | off (défaut: enforce)
   *   - Leanna_GRANTED_PERMISSIONS : liste CSV (ex: "read,write,network")
   *                                  défaut : toutes les permissions
   */
  static fromEnv(
    env: NodeJS.ProcessEnv = process.env,
    extra: Omit<PermissionPolicyConfig, "mode" | "granted"> = {}
  ): PermissionPolicy {
    const rawMode = (env.Leanna_PERMISSION_MODE ?? "enforce").toLowerCase();
    const mode: PermissionMode =
      rawMode === "off" || rawMode === "audit" || rawMode === "enforce"
        ? (rawMode as PermissionMode)
        : "enforce";

    const rawGranted = env.Leanna_GRANTED_PERMISSIONS?.trim();
    const granted = rawGranted
      ? (rawGranted
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean) as ToolPermission[])
      : [...ALL_PERMISSIONS];

    return new PermissionPolicy({ mode, granted, ...extra });
  }
}

/**
 * Erreur levée quand un outil réclame une permission non accordée
 * par la politique runtime (mode "enforce").
 */
export class PermissionDeniedError extends Error {
  public readonly toolName: string;
  public readonly missing: ToolPermission[];
  public readonly required: ToolPermission[];

  constructor(decision: PermissionDecision) {
    super(
      `Permission refusée pour l'outil "${decision.toolName}" : ` +
        `permission(s) [${decision.missing.join(", ")}] non accordée(s) par la politique runtime.`
    );
    this.name = "PermissionDeniedError";
    this.toolName = decision.toolName;
    this.missing = decision.missing;
    this.required = decision.required;
  }
}
