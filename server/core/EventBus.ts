/**
 * EventBus — Bus d'événements centralisé et unifié
 * 
 * Ce composant est le fondement de toute l'architecture événementielle du système.
 * Il remplace et unifie :
 * - runtime/EventBus (événements runtime de base)
 * - agents/AgentMessageBus (messagerie inter-agents)
 * - agents/AgentEventStream (stream temps réel)
 * - mission/Executor (événements de mission)
 * 
 * Fonctionnalités :
 * - Pub/Sub typé par événement avec tous les types du système
 * - Wildcard listener (*) pour tous les événements
 * - Middleware pipeline pour traitement avant/après
 * - Traçage distribué avec traceId et correlationId
 * - Priorités d'événements (low, medium, high, critical)
 * - Métriques complètes par type d'événement
 * - Filtrage avancé des événements
 * - Historique des événements avec rotation
 * - Persistance optionnelle (Supabase, fichiers, etc.)
 * - Compatibilité avec l'existant
 * 
 * @example
 * // Emit an event
 * eventBus.emit({
 *   type: "mission:started",
 *   data: { missionId: "abc123", title: "Ma Mission" },
 *   source: "mission.Executor",
 *   priority: "high"
 * });
 * 
 * // Subscribe to a specific event
 * const unsub = eventBus.on("mission:started", (event) => {
 *   console.log("Mission demarree: " + event.data.title);
 * });
 * 
 * // Subscribe to all events in a category
 * eventBus.on("mission:*", (event) => {
 *   console.log("Evenement mission: " + event.type);
 * });
 * 
 * // Logging middleware
 * eventBus.use((event, next) => {
 *   console.log("[" + event.timestamp + "] " + event.type);
 *   next();
 * });
 */

import type {
  ID,
  Timestamp,
  Priority,
  Event,
  TypedEvent,
  EventType,
  EventData,
  EventDataMap,
  EventHandler,
  AnyEventHandler,
  EventFilter,
  EventSubscription,
  EventBusConfig,
} from "./types.js";
import {
  DEFAULT_EVENT_BUS_CONFIG,
} from "./types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Types Internes
// ═══════════════════════════════════════════════════════════════════════════════

/** Middleware type */
type Middleware = (event: Event, next: () => void) => void;

/** Persistence handler pour sauvegarder les événements */
export type EventPersistenceHandler = (event: Event) => Promise<void>;

/** Logger type */
type Logger = {
  debug: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
};

/** Métriques par type d'événement */
interface EventMetrics {
  total: number;
  byType: Map<EventType, number>;
  bySource: Map<string, number>;
  byPriority: Map<Priority, number>;
  failed: number;
  startTime?: number;
}

/** État du traçage */
interface TracingState {
  enabled: boolean;
  traceCounter: number;
  activeTraces: Set<ID>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EventBus Central
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * EventBus centralisé pour tout le système.
 * 
 * Ce bus gère tous les événements du système de manière unifiée,
 * permettant une communication découplée entre tous les composants.
 */
export class EventBus {
  // Subscriptions
  private subscriptions: EventSubscription[] = [];
  private wildcardSubscriptions: EventSubscription[] = [];
  
  // Middlewares
  private middlewares: Middleware[] = [];
  
  // Métriques
  private metrics: EventMetrics = {
    total: 0,
    byType: new Map(),
    bySource: new Map(),
    byPriority: new Map(),
    failed: 0,
    startTime: Date.now(),
  };
  
  // Historique
  private eventHistory: Event[] = [];
  
  // Configuration
  private config: EventBusConfig;
  
  // Traçage
  private tracing: TracingState = {
    enabled: true,
    traceCounter: 0,
    activeTraces: new Set(),
  };
  
  // Persistence
  private persistenceHandlers: EventPersistenceHandler[] = [];
  
  // Logger
  private logger: Logger;
  
  // Compteur pour les IDs
  private nextId = 0;

  /**
   * Crée une nouvelle instance d'EventBus
   * @param config Configuration personnalisée
   * @param logger Logger personnalisé (console par défaut)
   */
  constructor(config: Partial<EventBusConfig> = {}, logger?: Logger) {
    this.config = { ...DEFAULT_EVENT_BUS_CONFIG, ...config };
    this.logger = logger || {
      debug: console.debug.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    };

    this.logger.info("[EventBus] Initialisé avec maxHistorySize:", this.config.maxHistorySize);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Subscription Methods
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Abonne un handler à un type d'événement spécifique.
   * 
   * @param eventType - Type d'événement (supporte les wildcards comme "mission:*")
   * @param handler - Fonction appelée quand l'événement est émis
   * @returns Fonction de désabonnement
   * 
   * @example
   * const unsub = eventBus.on("mission:started", (event) => {
   *   console.log("Mission démarrée");
   * });
   * 
   * // Avec wildcard
   * eventBus.on("mission:*", (event) => {
   *   console.log("Evenement mission: " + event.type);
   * });
   */
  on<T extends EventType>(
    eventType: T,
    handler: EventHandler<T>
  ): () => void {
    const id = this.nextId++;
    
    // Vérifier si c'est un wildcard
    if (eventType === "*" || eventType.includes(":*") || eventType.endsWith(":*")) {
      this.wildcardSubscriptions.push({
        id,
        eventType,
        handler: handler as unknown as EventHandler,
      });
    } else {
      this.subscriptions.push({
        id,
        eventType,
        handler: handler as unknown as EventHandler,
      });
    }

    this.logger.debug(`[EventBus] Abonnement #${id} à "${eventType}"`);
    
    return () => this.off(id);
  }

  /**
   * Abonne un handler à TOUS les événements (wildcard total).
   * 
   * @param handler - Fonction appelée pour chaque événement
   * @returns Fonction de désabonnement
   */
  onAny(handler: AnyEventHandler): () => void {
    const id = this.nextId++;
    this.wildcardSubscriptions.push({
      id,
      eventType: "*",
      handler: handler as EventHandler,
    });
    
    this.logger.debug(`[EventBus] Abonnement #${id} à tous les événements`);
    return () => this.off(id);
  }

  /**
   * Abonnement one-shot : se désabonne après la première réception.
   * 
   * @param eventType - Type d'événement
   * @param handler - Fonction appelée une seule fois
   * @returns Fonction de désabonnement
   */
  once<T extends EventType>(
    eventType: T,
    handler: EventHandler<T>
  ): () => void {
    const unsub = this.on(eventType, (event) => {
      unsub();
      handler(event as Extract<Event, { type: T }>);
    });
    return unsub;
  }

  /**
   * Abonne un handler avec un filtre avancé.
   * 
   * @param filter - Filtre d'événements
   * @param handler - Fonction appelée quand un événement correspond au filtre
   * @returns Fonction de désabonnement
   */
  onFilter(filter: EventFilter, handler: AnyEventHandler): () => void {
    const id = this.nextId++;
    const wrappedHandler: AnyEventHandler = (event) => {
      if (this.matchFilter(event, filter)) {
        handler(event);
      }
    };
    
    this.wildcardSubscriptions.push({
      id,
      eventType: "*",
      handler: wrappedHandler as EventHandler,
    });
    
    return () => this.off(id);
  }

  /**
   * Désabonne un handler par son ID.
   * 
   * @param id - ID de l'abonnement
   * @returns true si l'abonnement a été supprimé
   */
  off(id: number): boolean {
    const removedFromSubs = this.removeSubscription(this.subscriptions, id);
    const removedFromWildcards = this.removeSubscription(this.wildcardSubscriptions, id);
    return removedFromSubs || removedFromWildcards;
  }

  /**
   * Désabonne tous les handlers pour un type d'événement.
   * 
   * @param eventType - Type d'événement
   */
  offAll(eventType: EventType): void {
    this.subscriptions = this.subscriptions.filter((sub) => sub.eventType !== eventType);
    this.wildcardSubscriptions = this.wildcardSubscriptions.filter(
      (sub) => sub.eventType !== eventType
    );
  }

  /**
   * Supprime tous les abonnements.
   */
  clearSubscriptions(): void {
    this.subscriptions = [];
    this.wildcardSubscriptions = [];
    this.logger.info("[EventBus] Tous les abonnements supprimés");
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Emit Methods
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Émet un événement à tous les handlers abonnés.
   * 
   * @param event - Événement à émettre
   * 
   * @example
   * eventBus.emit({
   *   type: "mission:started",
   *   data: { missionId: "abc123" },
   *   source: "mission.Executor",
   *   priority: "high"
   * });
   */
  emit<T extends EventType>(event: TypedEvent<T>): void {
    // Appliquer la configuration par défaut
    const normalizedEvent: Event = {
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
      priority: event.priority || this.config.defaultPriority,
      source: event.source || "unknown",
      traceId: event.traceId || (this.tracing.enabled ? this.generateTraceId() : undefined),
      data: event.data,
    } as Event;

    // Passer par le pipeline de middlewares
    if (this.middlewares.length > 0) {
      this.runMiddlewares(normalizedEvent, 0, () => this.dispatch(normalizedEvent));
    } else {
      this.dispatch(normalizedEvent);
    }
  }

  /**
   * Émet plusieurs événements en une seule opération.
   * 
   * @param events - Tableau d'événements à émettre
   */
  emitBatch(events: Event[]): void {
    for (const event of events) {
      this.emit(event as TypedEvent<EventType>);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Middleware Methods
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Ajoute un middleware au pipeline.
   * Les middlewares s'exécutent dans l'ordre d'ajout.
   * 
   * @param middleware - Middleware à ajouter
   * 
   * @example
   * // Middleware de logging
   * eventBus.use((event, next) => {
   *   console.log("[" + event.type + "]", event.data);
   *   next();
   * });
   * 
   * // Middleware de timing
   * eventBus.use((event, next) => {
   *   const start = Date.now();
   *   next();
   *   const duration = Date.now() - start;
   *   console.log("Middleware execute en " + duration + "ms");
   * });
   */
  use(middleware: Middleware): void {
    this.middlewares.push(middleware);
    this.logger.debug("[EventBus] Middleware ajouté");
  }

  /**
   * Supprime un middleware du pipeline.
   * 
   * @param middleware - Middleware à supprimer
   * @returns true si le middleware a été supprimé
   */
  removeMiddleware(middleware: Middleware): boolean {
    const index = this.middlewares.indexOf(middleware);
    if (index !== -1) {
      this.middlewares.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Supprime tous les middlewares.
   */
  clearMiddlewares(): void {
    this.middlewares = [];
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Persistence Methods
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Ajoute un handler de persistance pour sauvegarder les événements.
   * 
   * @param handler - Fonction de persistance
   */
  addPersistenceHandler(handler: EventPersistenceHandler): void {
    this.persistenceHandlers.push(handler);
    this.logger.info("[EventBus] Handler de persistance ajouté");
  }

  /**
   * Supprime un handler de persistance.
   * 
   * @param handler - Handler à supprimer
   * @returns true si le handler a été supprimé
   */
  removePersistenceHandler(handler: EventPersistenceHandler): boolean {
    const index = this.persistenceHandlers.indexOf(handler);
    if (index !== -1) {
      this.persistenceHandlers.splice(index, 1);
      return true;
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Tracing Methods
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Active ou désactive le traçage distribué.
   * 
   * @param enabled - true pour activer, false pour désactiver
   */
  enableTracing(enabled: boolean = true): void {
    this.tracing.enabled = enabled;
    this.logger.info(`[EventBus] Traçage ${enabled ? "activé" : "désactivé"}`);
  }

  /**
   * Génère un nouvel ID de trace.
   * 
   * @returns ID de trace unique
   */
  generateTraceId(): ID {
    return `trace-${++this.tracing.traceCounter}-${Date.now()}`;
  }

  /**
   * Démarre une nouvelle trace.
   * 
   * @returns ID de trace
   */
  startTrace(): ID {
    const traceId = this.generateTraceId();
    this.tracing.activeTraces.add(traceId);
    return traceId;
  }

  /**
   * Termine une trace.
   * 
   * @param traceId - ID de la trace à terminer
   */
  endTrace(traceId: ID): void {
    this.tracing.activeTraces.delete(traceId);
  }

  /**
   * Retourne les traces actives.
   */
  getActiveTraces(): ID[] {
    return Array.from(this.tracing.activeTraces);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Metrics & History Methods
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Retourne les métriques d'événements.
   */
  getMetrics(): {
    total: number;
    byType: Record<string, number>;
    bySource: Record<string, number>;
    byPriority: Record<string, number>;
    failed: number;
    uptime: number;
    averagePerMinute: number;
  } {
    const now = Date.now();
    const uptime = now - (this.metrics.startTime || now);
    const minutes = uptime / 60000;
    
    return {
      total: this.metrics.total,
      byType: Object.fromEntries(this.metrics.byType),
      bySource: Object.fromEntries(this.metrics.bySource),
      byPriority: Object.fromEntries(this.metrics.byPriority),
      failed: this.metrics.failed,
      uptime,
      averagePerMinute: minutes > 0 ? this.metrics.total / minutes : 0,
    };
  }

  /**
   * Retourne l'historique des événements.
   * 
   * @param limit - Nombre maximal d'événements à retourner (par défaut, tous)
   * @param filter - Filtre optionnel
   * @returns Tableau d'événements
   */
  getHistory(limit?: number, filter?: EventFilter): Event[] {
    let events = [...this.eventHistory];
    
    // Appliquer le filtre
    if (filter) {
      events = events.filter((event) => this.matchFilter(event, filter));
    }
    
    // Limiter le nombre de résultats
    if (limit && limit > 0) {
      events = events.slice(-limit);
    }
    
    return events;
  }

  /**
   * Retourne le nombre total d'événements dans l'historique.
   */
  get historySize(): number {
    return this.eventHistory.length;
  }

  /**
   * Retourne le nombre d'abonnements actifs.
   */
  get subscriberCount(): number {
    return this.subscriptions.length + this.wildcardSubscriptions.length;
  }

  /**
   * Efface l'historique des événements.
   */
  clearHistory(): void {
    this.eventHistory = [];
    this.logger.info("[EventBus] Historique effacé");
  }

  /**
   * Efface les métriques.
   */
  resetMetrics(): void {
    this.metrics = {
      total: 0,
      byType: new Map(),
      bySource: new Map(),
      byPriority: new Map(),
      failed: 0,
      startTime: Date.now(),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Reset Methods
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Réinitialise complètement l'EventBus (utile pour les tests).
   */
  reset(): void {
    this.subscriptions = [];
    this.wildcardSubscriptions = [];
    this.middlewares = [];
    this.eventHistory = [];
    this.metrics = {
      total: 0,
      byType: new Map(),
      bySource: new Map(),
      byPriority: new Map(),
      failed: 0,
      startTime: Date.now(),
    };
    this.nextId = 0;
    this.tracing = {
      enabled: true,
      traceCounter: 0,
      activeTraces: new Set(),
    };
    this.persistenceHandlers = [];
    this.logger.info("[EventBus] Réinitialisé");
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Static Methods
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Crée un événement typé de manière sûre.
   * 
   * @param type - Type d'événement
   * @param data - Données de l'événement
   * @param options - Options supplémentaires
   * @returns Événement typé
   */
  static create<T extends EventType>(
    type: T,
    data: T extends keyof EventDataMap ? EventDataMap[T] : EventData,
    options: {
      source?: string;
      correlationId?: ID;
      traceId?: ID;
      priority?: Priority;
      timestamp?: Timestamp;
    } = {}
  ): Event {
    return {
      type,
      data,
      timestamp: options.timestamp || new Date().toISOString(),
      source: options.source,
      correlationId: options.correlationId,
      traceId: options.traceId,
      priority: options.priority,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Private Methods
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Vérifie si un événement correspond à un filtre.
   */
  private matchFilter(event: Event, filter: EventFilter): boolean {
    // Filtre par type
    if (filter.types && filter.types.length > 0) {
      const matchesType = filter.types.some((type) => {
        if (type === "*") return true;
        if (type.endsWith(":*")) {
          return event.type.startsWith(type.slice(0, -2));
        }
        return event.type === type;
      });
      if (!matchesType) return false;
    }

    // Filtre par source
    if (filter.source && event.source !== filter.source) {
      return false;
    }

    // Filtre par correlationId
    if (filter.correlationId && event.correlationId !== filter.correlationId) {
      return false;
    }

    // Filtre par traceId
    if (filter.traceId && event.traceId !== filter.traceId) {
      return false;
    }

    // Filtre par plage de temps
    if (filter.startTime && event.timestamp < filter.startTime) {
      return false;
    }
    if (filter.endTime && event.timestamp > filter.endTime) {
      return false;
    }

    // Filtre par priorité minimale
    if (filter.minPriority) {
      const priorityOrder: Priority[] = ["low", "medium", "high", "critical"];
      const eventPriorityIndex = priorityOrder.indexOf((event.priority || "medium") as Priority);
      const minPriorityIndex = priorityOrder.indexOf(filter.minPriority);
      if (eventPriorityIndex < minPriorityIndex) {
        return false;
      }
    }

    return true;
  }

  /**
   * Supprime un abonnement d'une liste.
   */
  private removeSubscription(subscriptions: EventSubscription[], id: number): boolean {
    const index = subscriptions.findIndex((sub) => sub.id === id);
    if (index !== -1) {
      subscriptions.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Vérifie si un type d'événement correspond à un pattern (wildcard).
   */
  private matchEventType(eventType: EventType, pattern: EventType): boolean {
    if (pattern === "*") return true;
    if (pattern === eventType) return true;
    
    // Gestion des wildcards comme "mission:*"
    if (pattern.endsWith(":*")) {
      const prefix = pattern.slice(0, -2);
      return eventType.startsWith(prefix + ":");
    }
    
    return false;
  }

  /**
   * Exécute le dispatch des événements aux handlers abonnés.
   */
  private dispatch(event: Event): void {
    const startTime = Date.now();
    
    try {
      // Incrémenter les métriques
      this.metrics.total++;
      this.metrics.byType.set(event.type, (this.metrics.byType.get(event.type) || 0) + 1);
      if (event.source) {
        this.metrics.bySource.set(event.source, (this.metrics.bySource.get(event.source) || 0) + 1);
      }
      if (event.priority) {
        this.metrics.byPriority.set(event.priority, (this.metrics.byPriority.get(event.priority) || 0) + 1);
      }

      // Ajouter à l'historique
      this.addToHistory(event);

      // Exécuter les handlers spécifiques au type
      for (const sub of this.subscriptions) {
        if (this.matchEventType(event.type, sub.eventType)) {
          this.executeHandler(sub, event);
        }
      }

      // Exécuter les handlers wildcard
      for (const sub of this.wildcardSubscriptions) {
        if (this.matchEventType(event.type, sub.eventType)) {
          this.executeHandler(sub, event);
        }
      }

      // Exécuter les handlers de persistance
      if (this.config.enablePersistence) {
        this.executePersistenceHandlers(event);
      }

    } catch (error) {
      this.metrics.failed++;
      this.logger.error("[EventBus] Erreur lors du dispatch:", error);
    }
  }

  /**
   * Exécute un handler avec gestion des erreurs.
   */
  private executeHandler(sub: EventSubscription, event: Event): void {
    try {
      (sub.handler as AnyEventHandler)(event);
    } catch (error) {
      this.logger.error(
        `[EventBus] Erreur dans le handler #${sub.id} pour l'evenement ${event.type}:`,
        error
      );
      // Ne jamais bloquer le bus à cause d'un handler défaillant
    }
  }

  /**
   * Exécute les handlers de persistance.
   */
  private async executePersistenceHandlers(event: Event): Promise<void> {
    const promises = this.persistenceHandlers.map((handler) => {
      return handler(event).catch((error) => {
        this.logger.error("[EventBus] Erreur de persistance:", error);
      });
    });
    await Promise.all(promises);
  }

  /**
   * Ajoute un événement à l'historique.
   */
  private addToHistory(event: Event): void {
    this.eventHistory.push(event);
    
    // Limiter la taille de l'historique
    if (this.eventHistory.length > this.config.maxHistorySize) {
      const toRemove = Math.max(
        1,
        Math.ceil(this.eventHistory.length * 0.2)
      );
      this.eventHistory.splice(0, toRemove);
    }
  }

  /**
   * Exécute la chaîne de middlewares.
   */
  private runMiddlewares(event: Event, index: number, done: () => void): void {
    if (index >= this.middlewares.length) {
      done();
      return;
    }
    
    try {
      const middleware = this.middlewares[index];
      middleware(event, () => this.runMiddlewares(event, index + 1, done));
    } catch (error) {
      this.logger.error("[EventBus] Erreur dans le middleware:", error);
      // Continuer avec le middleware suivant
      this.runMiddlewares(event, index + 1, done);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Singleton Instance
// ═══════════════════════════════════════════════════════════════════════════════

/** Instance singleton de l'EventBus central */
export const eventBus = new EventBus();

// ═══════════════════════════════════════════════════════════════════════════════
// Factory Functions
// ═══════════════════════════════════════════════════════════════════════════════

// Re-exporter les types pour les factory functions
import type {
  TaskEventType,
  TaskEventData,
  AgentEventType,
  AgentEventData,
  ToolEventType,
  ToolEventData,
  MissionEventType,
  MissionEventData,
  VerificationEventType,
  VerificationEventData,
  CheckpointEventType,
  CheckpointEventData,
  RecoveryEventType,
  RecoveryEventData,
  ReplanEventType,
  ReplanEventData,
} from "./types.js";

/**
 * Crée un événement de tâche.
 */
export function createTaskEvent(
  type: TaskEventType,
  data: TaskEventData
): Event {
  return EventBus.create(type, data, { source: "core.EventBus" });
}

/**
 * Crée un événement d'agent.
 */
export function createAgentEvent(
  type: AgentEventType,
  data: AgentEventData
): Event {
  return EventBus.create(type, data, { source: "core.EventBus" });
}

/**
 * Crée un événement d'outil.
 */
export function createToolEvent(
  type: ToolEventType,
  data: ToolEventData
): Event {
  return EventBus.create(type, data, { source: "core.EventBus" });
}

/**
 * Crée un événement de mission.
 */
export function createMissionEvent(
  type: MissionEventType,
  data: MissionEventData
): Event {
  return EventBus.create(type, data, { source: "core.EventBus" });
}

/**
 * Crée un événement de vérification.
 */
export function createVerificationEvent(
  type: VerificationEventType,
  data: VerificationEventData
): Event {
  return EventBus.create(type, data, { source: "core.EventBus" });
}

/**
 * Crée un événement de checkpoint.
 */
export function createCheckpointEvent(
  type: CheckpointEventType,
  data: CheckpointEventData
): Event {
  return EventBus.create(type, data, { source: "core.EventBus" });
}

/**
 * Crée un événement de récupération.
 */
export function createRecoveryEvent(
  type: RecoveryEventType,
  data: RecoveryEventData
): Event {
  return EventBus.create(type, data, { source: "core.EventBus" });
}

/**
 * Crée un événement de replanification.
 */
export function createReplanEvent(
  type: ReplanEventType,
  data: ReplanEventData
): Event {
  return EventBus.create(type, data, { source: "core.EventBus" });
}

export default eventBus;

