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
}

export interface ToolRegistryConfig {
  /** Timeout par défaut pour les appels d'outils (ms) */
  defaultTimeoutMs?: number;
  /** Activer les métriques */
  enableMetrics?: boolean;
  /** EventBus pour les notifications */
  eventBus?: EventBus;
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

  constructor(config: ToolRegistryConfig = {}) {
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 120_000;
    this.enableMetrics = config.enableMetrics ?? true;
    this.eventBus = config.eventBus;
  }

  // ─── Enregistrement ────────────────────────────────────────────────────────

  /**
   * Enregistre un outil dans le registre.
   * Si un outil avec le même nom existe déjà, il est remplacé.
   */
  register(definition: ToolDefinition): void {
    const name = definition.declaration.name;
    this.tools.set(name, {
      definition,
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

    // Vérification des permissions
    if (entry.definition.permissions?.length) {
      this.checkPermissions(name, entry.definition.permissions, options.callerPermissions);
    }

    const timeoutMs = options.timeoutMs ?? entry.definition.timeoutMs ?? this.defaultTimeoutMs;
    const maxRetries = options.retries ?? 0;

    this.eventBus?.emit({ type: "tool:called", toolName: name, agentId: options.agentId });

    let lastError: Error | undefined;
    const startTime = Date.now();

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.executeWithTimeout(
          entry.definition.handler,
          args,
          timeoutMs,
          options.context
        );

        // Mettre en cache pour les outils de lecture
        if (name === 'read_project_file' || name === 'list_project_files') {
          const key = `${name}:${JSON.stringify(args)}`;
          this.readCache.set(key, { value: result, expires: Date.now() + 5000 });
        }

        const durationMs = Date.now() - startTime;
        this.recordMetrics(entry, name, durationMs, true, options.agentId);
        this.eventBus?.emit({ type: "tool:completed", toolName: name, durationMs, success: true });

        return result;
      } catch (err) {
        lastError = err as Error;
        if (attempt < maxRetries) {
          // Backoff exponentiel : 1s → 2s → 4s (max)
          await this.sleep(Math.min(1000 * Math.pow(2, attempt), 4000));
        }
      }
    }

    const durationMs = Date.now() - startTime;
    this.recordMetrics(entry, name, durationMs, false, options.agentId, lastError?.message);
    this.eventBus?.emit({ type: "tool:completed", toolName: name, durationMs, success: false });

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
    context?: any
  ): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new ToolTimeoutError(timeoutMs));
      }, timeoutMs);

      // Essayer d'appeler avec contexte si le handler l'accepte ( pour compatibilité legacy)
      // Les handlers modernes prennent seulement args, mais les handlers legacy peuvent prendre context
      const resultPromise = (handler as any).length >= 3 
        ? (handler as any)(args, context)
        : handler(args);

      resultPromise
        .then((result: unknown) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err: any) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  private checkPermissions(
    toolName: string,
    required: ToolPermission[],
    caller?: ToolPermission[]
  ): void {
    if (!caller) return; // Pas de restrictions si aucune permission déclarée par l'appelant

    for (const perm of required) {
      if (!caller.includes(perm)) {
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

export class ToolPermissionError extends Error {
  constructor(toolName: string, permission: ToolPermission) {
    super(`Permission "${permission}" requise pour l'outil "${toolName}"`);
    this.name = "ToolPermissionError";
  }
}
