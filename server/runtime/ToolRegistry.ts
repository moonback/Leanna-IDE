/**
 * ToolRegistry — Registre centralisé des outils
 * 
 * Point unique d'enregistrement, de découverte et d'exécution des outils.
 * Remplace le système dispersé SkillManager + keyword routing.
 * 
 * Fonctionnalités :
 * - Enregistrement dynamique (plugins ajoutent leurs outils au démarrage)
 * - Validation des permissions
 * - Métriques par outil (durée, taux de succès)
 * - Timeout et retry configurables
 * - Cache optionnel par outil
 * - Aucune dépendance sur la structure des agents
 */

import type {
  ToolDeclaration,
  ToolDefinition,
  ToolHandler,
  ToolPermission,
  ToolCallMetrics,
} from "./types.js";
import type { EventBus } from "./EventBus.js";
import { PermissionPolicy, PermissionDeniedError, isDangerousOnlyDenial } from "./PermissionPolicy.js";
import { DryRunController } from "./DryRun.js";
import { AuthorizationGate } from "./AuthorizationGate.js";
import type { AutonomyPolicy } from "../mission/AutonomyPolicy.js";
import { requestConfirmation } from "../utils/confirmationBridge.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface ToolEntry {
  definition: ToolDefinition;
  metrics: { calls: number; failures: number; totalMs: number };
}

export interface ToolCallOptions {
  /** Agent qui appelle l'outil */
  agentId?: string;
  /** Override du timeout par défaut */
  timeoutMs?: number;
  /** Nombre de retries en cas d'échec */
  retries?: number;
  /** Permissions de l'appelant */
  callerPermissions?: ToolPermission[];
  /** Contexte à passer au handler (pour compatibilité avec les skills legacy) */
  context?: any;
  /**
   * Force (true) ou désactive (false) la simulation pour cet appel précis,
   * en surchargeant l'état global du DryRunController. Laisser indéfini pour
   * suivre l'état global.
   */
  dryRun?: boolean;
  /**
   * Signal d'annulation (kill-switch temps-réel).
   *
   * Quand fourni, l'appel est interrompu dès que le signal est déclenché :
   *   - avant l'exécution : rejet immédiat sans lancer le handler ;
   *   - pendant l'exécution : la promesse `call()` se résout en erreur
   *     `ToolAbortedError` sans attendre la fin du handler, et le signal est
   *     propagé au handler via `context.signal` afin qu'un handler coopératif
   *     (ex. `run_project_command`) tue réellement le sous-processus en cours.
   *
   * C'est le maillon qui rend l'annulation « temps-réel » : sans lui, une
   * action longue (build de 10 min) tournait jusqu'à son terme même après
   * l'annulation de la tâche.
   */
  signal?: AbortSignal;
  /**
   * Étape de mission à laquelle rattacher l'appel pour la garde d'idempotence.
   * Sans `missionId` ET `stepId`, un outil à effet de bord s'exécute sans
   * déduplication (voir `LedgerGuard`).
   */
  idempotencyScope?: IdempotencyScope;
  /**
   * Le curseur d'autonomie a déjà été appliqué par l'appelant (l'Executor de
   * missions décide et obtient lui-même l'approbation) : ne pas redemander.
   */
  autonomyApproved?: boolean;
  /** Runs after all authorization/idempotency gates and immediately before the handler. */
  beforeExecute?: (toolName: string, args: Record<string, unknown>) => Promise<void>;
}

/** Identifie l'étape de mission d'un appel d'outil (clé d'idempotence). */
export interface IdempotencyScope {
  missionId?: string;
  stepId?: string;
}

export interface ToolRegistryConfig {
  /** Timeout par défaut pour les appels d'outils (ms) */
  defaultTimeoutMs?: number;
  /** Activer les métriques */
  enableMetrics?: boolean;
  /** EventBus pour les notifications */
  eventBus?: EventBus;
  /**
   * Politique de permissions appliquée au runtime.
   * Si absente, une politique est construite depuis l'environnement
   * (Leanna_PERMISSION_MODE / Leanna_GRANTED_PERMISSIONS).
   */
  permissionPolicy?: PermissionPolicy;
  /**
   * Contrôleur de simulation (dry-run global).
   * Si absent, un contrôleur désactivé est créé.
   */
  dryRun?: DryRunController;
  /**
   * Garde d'idempotence optionnelle (P0.3). Si fournie, chaque appel d'outil
   * passe par elle AVANT exécution : un appel déjà complété est resservi sans
   * réexécution ; un appel à effet de bord interrompu par un crash est bloqué.
   * Découplé du noyau via une interface : aucun cycle d'import, aucun impact si
   * la garde n'est pas configurée.
   */
  idempotency?: IdempotencyGuard;
  /**
   * Garde de sécurité pré-exécution optionnel (jugement Jev). Si fourni, chaque
   * appel d'outil À EFFET DE BORD passe par lui AVANT exécution ; une action
   * jugée risquée est bloquée. Aucun impact si non configuré.
   */
  safetyGate?: SafetyGate;
}

/**
 * Contrat minimal d'une garde d'idempotence, implémenté par un adaptateur
 * au-dessus de `server/core/ExecutionLedger`. Volontairement défini ici pour
 * garder `ToolRegistry` indépendant du noyau.
 */
export interface IdempotencyGuard {
  /**
   * Décide du sort d'un appel d'outil AVANT exécution.
   *   - `{ decision: "execute", commit, fail }` : exécuter, puis appeler commit
   *     (succès) ou fail (échec) ;
   *   - `{ decision: "skip", result }` : ne pas exécuter, renvoyer `result` ;
   *   - `{ decision: "block", reason }` : refuser (rejeu dangereux après crash).
   */
  guard(
    tool: string,
    args: Record<string, unknown>,
    permissions: ToolPermission[] | undefined,
    agentId: string | undefined,
    scope?: IdempotencyScope
  ):
    | { decision: "execute"; commit: (result: unknown) => void; fail: (error: string) => void }
    | { decision: "skip"; result: unknown }
    | { decision: "block"; reason: string };
}

/**
 * Contrat minimal d'un garde de sécurité PRÉ-EXÉCUTION, implémenté par un
 * adaptateur (voir `server/core/SafetyGate.ts`). Volontairement défini ici pour
 * garder `ToolRegistry` indépendant de l'implémentation du jugement (Jev).
 *
 * Appelé APRÈS les permissions et AVANT le dry-run/idempotence, uniquement pour
 * les outils à effet de bord. Retourne :
 *   - `{ decision: "allow" }`  : exécuter normalement ;
 *   - `{ decision: "block", reason }` : refuser (lève `SafetyGateBlockedError`).
 * Un `"review"` de la couche de jugement est traité comme un blocage assorti
 * du motif, l'exécution automatique restant fail-closed.
 */
export interface SafetyGate {
  evaluate(
    tool: string,
    args: Record<string, unknown>,
    permissions: ToolPermission[] | undefined,
    agentId: string | undefined
  ): Promise<{ decision: "allow" } | { decision: "block"; reason: string }>;
}

/** Erreur levée quand le curseur d'autonomie refuse une action (AUDIT-012). */
export class AutonomyDeniedError extends Error {
  readonly toolName: string;
  readonly reason: string;
  constructor(toolName: string, reason: string) {
    super(`[autonomy] "${toolName}" refusé : ${reason}`);
    this.name = "AutonomyDeniedError";
    this.toolName = toolName;
    this.reason = reason;
  }
}

/** Erreur levée quand le garde de sécurité refuse une action. */
export class SafetyGateBlockedError extends Error {
  readonly toolName: string;
  readonly reason: string;
  constructor(toolName: string, reason: string) {
    super(`[safety-gate] "${toolName}" bloqué : ${reason}`);
    this.name = "SafetyGateBlockedError";
    this.toolName = toolName;
    this.reason = reason;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ToolRegistry
// ═══════════════════════════════════════════════════════════════════════════════

export class ToolRegistry {
  private tools = new Map<string, ToolEntry>();
  private defaultTimeoutMs: number;
  private enableMetrics: boolean;
  private eventBus?: EventBus;
  private callHistory: ToolCallMetrics[] = [];
  private static readonly MAX_HISTORY = 500;
  private readCache = new Map<string, { value: any; expires: number }>();
  private permissionPolicy: PermissionPolicy;
  private dryRun: DryRunController;
  private idempotency?: IdempotencyGuard;
  private safetyGate?: SafetyGate;
  private autonomyPolicy?: AutonomyPolicy;

  constructor(config: ToolRegistryConfig = {}) {
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 120_000;
    this.enableMetrics = config.enableMetrics ?? true;
    this.eventBus = config.eventBus;
    this.permissionPolicy =
      config.permissionPolicy ?? PermissionPolicy.fromEnv(process.env, { eventBus: config.eventBus });
    this.dryRun = config.dryRun ?? new DryRunController({ eventBus: config.eventBus });
    this.idempotency = config.idempotency;
    this.safetyGate = config.safetyGate;
  }

  /** Branche (ou remplace) la garde d'idempotence après construction. */
  setIdempotencyGuard(guard: IdempotencyGuard | undefined): void {
    this.idempotency = guard;
  }

  /** Branche (ou remplace) le garde de sécurité pré-exécution après construction. */
  setSafetyGate(gate: SafetyGate | undefined): void {
    this.safetyGate = gate;
  }

  /**
   * Branche le curseur d'autonomie (suggest/ask/auto + .leannaignore) sur TOUS
   * les appels : voix/chat, agents et missions (AUDIT-012).
   */
  setAutonomyPolicy(policy: AutonomyPolicy | undefined): void {
    this.autonomyPolicy = policy;
  }

  /** Retourne la politique de permissions appliquée au runtime. */
  getPermissionPolicy(): PermissionPolicy {
    return this.permissionPolicy;
  }

  /** Remplace la politique de permissions (utile pour les tests / reconfiguration). */
  setPermissionPolicy(policy: PermissionPolicy): void {
    this.permissionPolicy = policy;
  }

  /** Retourne le contrôleur de simulation (dry-run global). */
  getDryRun(): DryRunController {
    return this.dryRun;
  }

  /** Remplace le contrôleur de simulation. */
  setDryRun(controller: DryRunController): void {
    this.dryRun = controller;
  }

  // ─── Enregistrement ────────────────────────────────────────────────────────

  /**
   * Enregistre un outil dans le registre.
   * Si un outil avec le même nom existe déjà, il est remplacé.
   */
  register(definition: ToolDefinition): void {
    const name = definition.declaration.name;
    // Horodatage posé par le registre (pas par l'adaptateur) : il reflète
    // l'ordre d'enregistrement RÉEL, ce qui permet d'expliquer les snapshots de
    // compteurs pris à des instants différents du bootstrap. On préserve une
    // valeur déjà fournie (ré-enregistrement idempotent) uniquement si présente.
    const stamped: ToolDefinition =
      definition.registeredAt === undefined
        ? { ...definition, registeredAt: Date.now() }
        : definition;
    this.tools.set(name, {
      definition: stamped,
      metrics: { calls: 0, failures: 0, totalMs: 0 },
    });
  }

  /**
   * Enregistre plusieurs outils d'un coup (batch).
   */
  registerAll(definitions: ToolDefinition[]): void {
    for (const def of definitions) {
      this.register(def);
    }
  }

  /**
   * Supprime un outil du registre.
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Vérifie si un outil existe.
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  // ─── Découverte ────────────────────────────────────────────────────────────

  /**
   * Retourne toutes les déclarations d'outils (pour le LLM).
   */
  getDeclarations(): ToolDeclaration[] {
    return Array.from(this.tools.values()).map((t) => t.definition.declaration);
  }

  /**
   * Retourne toutes les définitions d'outils complètes (avec timeout, permissions, catégorie).
   */
  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  /**
   * Retourne toutes les entrées d'outils avec définitions et métriques.
   */
  getToolEntries(): Array<{ definition: ToolDefinition; metrics: { calls: number; failures: number; totalMs: number } }> {
    return Array.from(this.tools.values()).map((t) => ({
      definition: t.definition,
      metrics: { ...t.metrics },
    }));
  }

  /**
   * Retourne la définition d'un outil spécifique.
   */
  getDefinition(name: string): ToolDefinition | undefined {
    return this.tools.get(name)?.definition;
  }

  /**
   * Retourne les déclarations filtrées par catégorie.
   */
  getDeclarationsByCategory(category: string): ToolDeclaration[] {
    return Array.from(this.tools.values())
      .filter((t) => t.definition.category === category)
      .map((t) => t.definition.declaration);
  }

  /**
   * Retourne les catégories disponibles.
   */
  getCategories(): string[] {
    const categories = new Set<string>();
    for (const entry of this.tools.values()) {
      if (entry.definition.category) {
        categories.add(entry.definition.category);
      }
    }
    return Array.from(categories);
  }

  /**
   * Recherche d'outils par mot-clé dans le nom ou la description.
   */
  search(query: string): ToolDeclaration[] {
    const lower = query.toLowerCase();
    return Array.from(this.tools.values())
      .filter((t) => {
        const decl = t.definition.declaration;
        return (
          decl.name.toLowerCase().includes(lower) ||
          decl.description.toLowerCase().includes(lower)
        );
      })
      .map((t) => t.definition.declaration);
  }

  /**
   * Nombre total d'outils enregistrés.
   */
  get size(): number {
    return this.tools.size;
  }

  // ─── Exécution ─────────────────────────────────────────────────────────────

  /**
   * Appelle un outil par son nom avec des arguments.
   * Gère timeout, permissions, métriques et retry.
   */
  async call(
    name: string,
    args: Record<string, unknown>,
    options: ToolCallOptions = {}
  ): Promise<unknown> {
    // Kill-switch temps-réel : si le signal est déjà déclenché, on n'entame
    // même pas l'appel. Court-circuite aussi le cache et la simulation.
    if (options.signal?.aborted) {
      throw new ToolAbortedError(name);
    }

    // Cache pour read_project_file et list_project_files
    if (name === 'read_project_file' || name === 'list_project_files') {
      const key = `${name}:${JSON.stringify(args)}`;
      const cached = this.readCache.get(key);
      if (cached && Date.now() < cached.expires) {
        return cached.value;
      }
    }

    const entry = this.tools.get(name);
    if (!entry) {
      throw new ToolNotFoundError(name, this.getSuggestions(name));
    }

    // Application de la politique de permissions au runtime.
    // Contrairement à checkPermissions (basé sur l'appelant), la politique
    // s'applique TOUJOURS — c'est l'exigence « appliqué au runtime ».
    // Point de passage unique des autorisations : AuthorizationGate combine la
    // politique de permissions et, si branché, le curseur d'autonomie.
    const authorize = (permissionPolicy: PermissionPolicy) =>
      new AuthorizationGate({
        permissionPolicy,
        ...(this.autonomyPolicy ? { autonomyPolicy: this.autonomyPolicy } : {}),
      }).authorize({
        toolName: name,
        required: entry.definition.permissions,
        attribution: entry.definition.attribution,
        agentId: options.agentId,
        args,
      });
    let verdict = authorize(this.permissionPolicy);
    const simulated = options.dryRun ?? this.dryRun.isEnabled();
    let humanApproved = false;
    if (!verdict.permissionDecision.allowed) {
      // IMP-01 : `dangerous` n'est pas accordé par défaut. Le refus peut être
      // levé au cas par cas par une approbation humaine (ou par l'appelant qui
      // l'a déjà obtenue : autonomyApproved), jamais automatiquement.
      if (!isDangerousOnlyDenial(verdict.permissionDecision)) {
        throw new PermissionDeniedError(verdict.permissionDecision);
      }
      if (!simulated && !options.autonomyApproved) {
        const emit = options.context?.emitToClient;
        humanApproved =
          typeof emit === "function" &&
          (await requestConfirmation(
            name,
            "tool-call",
            emit,
            `Action « dangerous » non accordée par la politique de permissions — approbation humaine requise.`,
            "high"
          ));
        if (!humanApproved) throw new PermissionDeniedError(verdict.permissionDecision);
      }
      // Octroi limité à CET appel : les autres axes (agent, sandbox, autonomie)
      // sont réévalués normalement.
      verdict = authorize(
        new PermissionPolicy({
          mode: this.permissionPolicy.getMode(),
          granted: [...this.permissionPolicy.getGranted(), "dangerous"],
        })
      );
      if (!verdict.permissionDecision.allowed) {
        throw new PermissionDeniedError(verdict.permissionDecision);
      }
    }
    // Une simulation n'agit pas : le curseur ne s'applique qu'aux exécutions réelles.
    if (!simulated && !options.autonomyApproved) {
      if (verdict.decision === "deny") {
        throw new AutonomyDeniedError(name, verdict.reason);
      }
      // Déjà approuvée ci-dessus (dangerous) : pas de seconde demande.
      if (verdict.decision === "ask" && !humanApproved) {
        const emit = options.context?.emitToClient;
        // Sans canal d'approbation (agent autonome…), on refuse : fail-closed.
        const approved =
          typeof emit === "function" &&
          (await requestConfirmation(name, "tool-call", emit, verdict.reason, "high"));
        if (!approved) {
          throw new AutonomyDeniedError(
            name,
            typeof emit === "function" ? "action non approuvée." : `${verdict.reason} Aucun canal d'approbation disponible.`
          );
        }
      }
    }

    // Vérification additionnelle des permissions de l'appelant (le cas échéant).
    if (entry.definition.permissions?.length) {
      this.checkPermissions(name, entry.definition.permissions, options.callerPermissions);
    }

    // ── Garde de sécurité pré-exécution (jugement Jev) ──────────────────────
    // Placé APRÈS les permissions (on n'évalue pas une action déjà refusée) et
    // AVANT le dry-run/idempotence (on veut juger l'action réelle, pas une
    // simulation). Uniquement pour les outils à effet de bord : un outil de
    // lecture ne peut rien casser. Fail-closed : le gate bloque en cas de doute.
    if (
      this.safetyGate &&
      this.dryRun.hasSideEffect(entry.definition.permissions) &&
      !(options.dryRun ?? this.dryRun.isEnabled())
    ) {
      const verdict = await this.safetyGate.evaluate(
        name,
        args,
        entry.definition.permissions,
        options.agentId
      );
      if (verdict.decision === "block") {
        this.eventBus?.emit({ type: "tool:completed", toolName: name, durationMs: 0, success: false });
        throw new SafetyGateBlockedError(name, verdict.reason);
      }
    }

    // Dry-run global : intercepte les outils à effet de bord avant toute
    // exécution. Un override par appel (options.dryRun) prime sur l'état global.
    const dryRunActive = options.dryRun ?? this.dryRun.isEnabled();
    if (dryRunActive && this.dryRun.hasSideEffect(entry.definition.permissions)) {
      // On enregistre l'appel dans les métriques comme un succès simulé,
      // sans exécuter le handler.
      const simulated = this.dryRun.simulate(
        name,
        entry.definition.permissions,
        args,
        options.agentId
      );
      this.recordMetrics(entry, name, 0, true, options.agentId);
      this.eventBus?.emit({ type: "tool:completed", toolName: name, durationMs: 0, success: true });
      return simulated;
    }

    // ── Garde d'idempotence (P0.3) ──────────────────────────────────────────
    // Placée APRÈS le dry-run (une simulation ne doit rien journaliser) et
    // AVANT l'exécution réelle. Si aucune garde n'est branchée, comportement
    // strictement inchangé.
    let ledgerCommit: ((result: unknown) => void) | undefined;
    let ledgerFail: ((error: string) => void) | undefined;
    if (this.idempotency) {
      const g = this.idempotency.guard(
        name,
        args,
        entry.definition.permissions,
        options.agentId,
        options.idempotencyScope
      );
      if (g.decision === "skip") {
        // Résultat déjà connu : on le ressert sans réexécuter le handler.
        this.eventBus?.emit({ type: "tool:completed", toolName: name, durationMs: 0, success: true });
        return g.result;
      }
      if (g.decision === "block") {
        throw new Error(`[idempotency] ${name}: ${g.reason}`);
      }
      ledgerCommit = g.commit;
      ledgerFail = g.fail;
    }

    const timeoutMs = options.timeoutMs ?? entry.definition.timeoutMs ?? this.defaultTimeoutMs;
    const maxRetries = options.retries ?? 0;

    this.eventBus?.emit({ type: "tool:called", toolName: name, agentId: options.agentId });

    let lastError: Error | undefined;
    const startTime = Date.now();
    // Un outil à effet de bord (écriture, commande…) peut changer ce que décrit
    // le cache de lecture : on le vide après l'appel, réussi ou non, pour qu'une
    // relecture post-écriture observe le contenu réel et non une copie périmée.
    const invalidatesReads = this.getDryRun().hasSideEffect(entry.definition.permissions);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await options.beforeExecute?.(name, args);
        const result = await this.executeWithTimeout(
          entry.definition.handler,
          args,
          timeoutMs,
          options.context,
          options.signal
        );

        // Mettre en cache pour les outils de lecture
        if (name === 'read_project_file' || name === 'list_project_files') {
          const key = `${name}:${JSON.stringify(args)}`;
          this.readCache.set(key, { value: result, expires: Date.now() + 5000 });
        }

        const durationMs = Date.now() - startTime;
        this.recordMetrics(entry, name, durationMs, true, options.agentId);
        this.eventBus?.emit({ type: "tool:completed", toolName: name, durationMs, success: true });
        ledgerCommit?.(result);
        if (invalidatesReads) this.readCache.clear();

        return result;
      } catch (err) {
        lastError = err as Error;
        // Une annulation ne se retente jamais : le kill-switch doit être
        // immédiat et définitif pour cet appel.
        if (err instanceof ToolAbortedError || options.signal?.aborted) {
          if (!(err instanceof ToolAbortedError)) lastError = new ToolAbortedError(name);
          break;
        }
        if (attempt < maxRetries) {
          // Backoff exponentiel : 1s → 2s → 4s (max)
          await this.sleep(Math.min(1000 * Math.pow(2, attempt), 4000));
        }
      }
    }

    const durationMs = Date.now() - startTime;
    this.recordMetrics(entry, name, durationMs, false, options.agentId, lastError?.message);
    this.eventBus?.emit({ type: "tool:completed", toolName: name, durationMs, success: false });
    ledgerFail?.(lastError?.message ?? "unknown error");
    if (invalidatesReads) this.readCache.clear();

    throw lastError!;
  }

  // ─── Métriques ─────────────────────────────────────────────────────────────

  /**
   * Retourne les métriques agrégées par outil.
   */
  getToolMetrics(): Record<string, { calls: number; failures: number; avgMs: number }> {
    const result: Record<string, { calls: number; failures: number; avgMs: number }> = {};
    for (const [name, entry] of this.tools) {
      if (entry.metrics.calls > 0) {
        result[name] = {
          calls: entry.metrics.calls,
          failures: entry.metrics.failures,
          avgMs: Math.round(entry.metrics.totalMs / entry.metrics.calls),
        };
      }
    }
    return result;
  }

  /**
   * Retourne l'historique des N derniers appels.
   */
  getCallHistory(limit = 50): ToolCallMetrics[] {
    return this.callHistory.slice(-limit);
  }

  /**
   * Reset des métriques (utile pour les tests).
   */
  resetMetrics(): void {
    for (const entry of this.tools.values()) {
      entry.metrics = { calls: 0, failures: 0, totalMs: 0 };
    }
    this.callHistory = [];
  }

  // ─── Privé ───────────────────────────────────────────────────────────────

  private async executeWithTimeout(
    handler: ToolHandler,
    args: Record<string, unknown>,
    timeoutMs: number,
    context?: any,
    signal?: AbortSignal
  ): Promise<unknown> {
    // Le signal est propagé au handler via le contexte : un handler coopératif
    // (ex. `run_project_command`) peut alors tuer son sous-processus. On ne
    // modifie jamais l'objet fourni par l'appelant (clone superficiel).
    const handlerContext =
      signal !== undefined
        ? { ...(context ?? {}), signal }
        : context;

    return new Promise<unknown>((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (signal) signal.removeEventListener("abort", onAbort);
        fn();
      };

      const timer = setTimeout(() => {
        finish(() => reject(new ToolTimeoutError(timeoutMs)));
      }, timeoutMs);

      // Kill-switch temps-réel : dès que le signal se déclenche, `call()` se
      // résout en erreur SANS attendre la fin du handler. Le handler coopératif
      // reçoit le même signal via le contexte et libère ses ressources
      // (processus enfant, requête réseau…) de son côté.
      const onAbort = () => finish(() => reject(new ToolAbortedError(handlerName(handler))));
      if (signal) {
        if (signal.aborted) {
          finish(() => reject(new ToolAbortedError(handlerName(handler))));
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }

      // Essayer d'appeler avec contexte si le handler l'accepte (compat legacy +
      // propagation du signal). Les handlers modernes déclarés directement dans
      // le registre prennent seulement `args` (arité 1) ; les handlers adaptés
      // depuis les skills legacy prennent `(args, context)` (arité ≥ 2) et
      // reçoivent ainsi le contexte par appel — dont `context.signal`.
      const resultPromise = (handler as any).length >= 2
        ? (handler as any)(args, handlerContext)
        : handler(args);

      resultPromise
        .then((result: unknown) => {
          finish(() => resolve(result));
        })
        .catch((err: any) => {
          finish(() => reject(err));
        });
    });
  }

  private checkPermissions(
    toolName: string,
    required: ToolPermission[],
    caller?: ToolPermission[]
  ): void {
    if (!caller) return; // Pas de restrictions si aucune permission déclarée par l'appelant

    const normalize = (p: ToolPermission): ToolPermission => (p === "execute" ? "exec" : p);
    const callerSet = new Set(caller.map(normalize));

    for (const perm of required) {
      if (!callerSet.has(normalize(perm))) {
        throw new ToolPermissionError(toolName, perm);
      }
    }
  }

  private recordMetrics(
    entry: ToolEntry,
    name: string,
    durationMs: number,
    success: boolean,
    agentId?: string,
    error?: string
  ): void {
    if (!this.enableMetrics) return;

    entry.metrics.calls++;
    entry.metrics.totalMs += durationMs;
    if (!success) entry.metrics.failures++;

    this.callHistory.push({
      toolName: name,
      durationMs,
      success,
      timestamp: Date.now(),
      agentId,
      error,
    });

    // Garder l'historique sous contrôle
    if (this.callHistory.length > ToolRegistry.MAX_HISTORY) {
      this.callHistory.splice(0, 100);
    }
  }

  private getSuggestions(name: string): string[] {
    const lower = name.toLowerCase();
    return Array.from(this.tools.keys())
      .filter((k) => {
        // Levenshtein simplifié : sous-chaîne commune
        return k.toLowerCase().includes(lower.slice(0, 4)) ||
          lower.includes(k.toLowerCase().slice(0, 4));
      })
      .slice(0, 3);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Erreurs spécifiques
// ═══════════════════════════════════════════════════════════════════════════════

export class ToolNotFoundError extends Error {
  constructor(name: string, suggestions: string[]) {
    const hint = suggestions.length > 0
      ? ` Suggestions: ${suggestions.join(", ")}`
      : "";
    super(`Outil "${name}" introuvable.${hint}`);
    this.name = "ToolNotFoundError";
  }
}

export class ToolTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Outil timeout après ${timeoutMs}ms`);
    this.name = "ToolTimeoutError";
  }
}

/**
 * Erreur levée lorsqu'un appel d'outil est interrompu par le kill-switch
 * temps-réel (AbortSignal déclenché avant ou pendant l'exécution).
 *
 * Distincte de `ToolTimeoutError` : ici l'arrêt est volontaire (annulation
 * utilisateur / budget dépassé), pas un dépassement de délai. Les couches
 * supérieures (AgentExecutor) peuvent la mapper vers un statut `cancelled`.
 */
export class ToolAbortedError extends Error {
  constructor(toolName?: string) {
    super(toolName ? `Outil "${toolName}" interrompu (annulation)` : "Outil interrompu (annulation)");
    this.name = "ToolAbortedError";
  }
}

/** Nom lisible d'un handler pour les messages d'erreur (best-effort). */
function handlerName(handler: ToolHandler): string | undefined {
  const n = (handler as { name?: string })?.name;
  return n && n !== "handler" && n !== "" ? n : undefined;
}

export class ToolPermissionError extends Error {
  constructor(toolName: string, permission: ToolPermission) {
    super(`Permission "${permission}" requise pour l'outil "${toolName}"`);
    this.name = "ToolPermissionError";
  }
}
