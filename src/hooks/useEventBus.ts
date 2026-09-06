/**
 * useEventBus - Hook React pour l'intégration avec l'EventBus central
 * 
 * Ce hook permet aux composants React de s'abonner et d'émettre des événements
 * via l'EventBus centralisé du système.
 * 
 * @example
 * // Abonnement à un événement spécifique
 * useEventBus("mission:started", (event) => {
 *   console.log("Mission démarrée:", event.data.missionId);
 * });
 * 
 * @example
 * // Abonnement à tous les événements d'un type
 * useEventBus("mission:*", (event) => {
 *   console.log("Événement mission:", event.type);
 * });
 * 
 * @example
 * // Émission d'un événement
 * const { emit } = useEventBus();
 * emit({ type: "workspace:context_changed", data: { path: "/new/path" } });
 */

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import type {
  EventType,
  Event,
  TypedEvent,
  EventHandler,
  EventFilter,
} from "../../server/core/types";
import { eventBus } from "../../server/core/EventBus";

/**
 * Resultat du hook useEventBus
 */
export interface UseEventBusResult {
  /**
   * Émet un événement via l'EventBus
   */
  emit: <T extends EventType>(event: TypedEvent<T>) => void;
  
  /**
   * Émet un événement avec des options supplémentaires
   */
  emitWithOptions: <T extends EventType>(
    event: TypedEvent<T>,
    options?: { 
      source?: string; 
      priority?: "low" | "medium" | "high" | "critical";
      correlationId?: string;
    }
  ) => void;
  
  /**
   * Abonne un handler à un type d'événement spécifique
   * Retourne une fonction de désabonnement
   */
  on: <T extends EventType>(eventType: T, handler: EventHandler<T>) => () => void;
  
  /**
   * Abonne un handler à tous les événements (wildcard)
   */
  onAny: (handler: (event: Event) => void) => () => void;
  
  /**
   * Abonne un handler avec un filtre avancé
   */
  onFilter: (filter: EventFilter, handler: (event: Event) => void) => () => void;
  
  /**
   * Abonnement one-shot (se désabonne après le premier événement)
   */
  once: <T extends EventType>(eventType: T, handler: EventHandler<T>) => () => void;
  
  /**
   * Récupère l'historique des événements
   */
  getHistory: (limit?: number, filter?: EventFilter) => Event[];
  
  /**
   * Récupère les métriques de l'EventBus
   */
  getMetrics: () => {
    total: number;
    byType: Record<string, number>;
    bySource: Record<string, number>;
    byPriority: Record<string, number>;
    failed: number;
    uptime: number;
    averagePerMinute: number;
  };
  
  /**
   * Nombre total d'événements dans l'historique
   */
  historySize: number;
  
  /**
   * Nombre d'abonnements actifs
   */
  subscriberCount: number;
}

/**
 * Hook React pour l'intégration avec l'EventBus
 * 
 * @param eventType - Type d'événement optionnel pour l'abonnement automatique
 * @param handler - Handler optionnel pour l'abonnement automatique
 * @returns Objet avec toutes les méthodes de l'EventBus
 */
export function useEventBus<T extends EventType = EventType>(
  eventType?: T,
  handler?: EventHandler<T>
): UseEventBusResult {
  const unsubscribeRef = useRef<(() => void) | null>(null);
  
  // Mémoriser le handler pour éviter les re-créations
  const memoizedHandler = useCallback(handler || (() => {}), [handler]);

  useEffect(() => {
    // S'abonner si un eventType et un handler sont fournis
    if (eventType && memoizedHandler) {
      unsubscribeRef.current = eventBus.on(eventType, memoizedHandler as EventHandler<EventType>);
    }
    
    // Nettoyage à la désactivation
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [eventType, memoizedHandler]);

  // Méthode emit mémorisée
  const emit = useCallback(<T extends EventType>(event: TypedEvent<T>) => {
    eventBus.emit(event);
  }, []);

  // Méthode emitWithOptions mémorisée
  const emitWithOptions = useCallback(<T extends EventType>(
    event: TypedEvent<T>,
    options?: { 
      source?: string; 
      priority?: "low" | "medium" | "high" | "critical";
      correlationId?: string;
    }
  ) => {
    const normalizedEvent: TypedEvent<T> = {
      ...event,
      source: options?.source || event.source || "ui",
      priority: options?.priority || event.priority || "medium",
      correlationId: options?.correlationId || event.correlationId,
    } as TypedEvent<T>;
    eventBus.emit(normalizedEvent);
  }, []);

  // Méthode on mémorisée
  const on = useCallback(<T extends EventType>(eventType: T, handler: EventHandler<T>) => {
    return eventBus.on(eventType, handler);
  }, []);

  // Méthode onAny mémorisée
  const onAny = useCallback((handler: (event: Event) => void) => {
    return eventBus.onAny(handler);
  }, []);

  // Méthode onFilter mémorisée
  const onFilter = useCallback((filter: EventFilter, handler: (event: Event) => void) => {
    return eventBus.onFilter(filter, handler);
  }, []);

  // Méthode once mémorisée
  const once = useCallback(<T extends EventType>(eventType: T, handler: EventHandler<T>) => {
    return eventBus.once(eventType, handler);
  }, []);

  // Métriques mémorisées
  const { getHistory, getMetrics, historySize, subscriberCount } = useMemo(() => ({
    getHistory: eventBus.getHistory.bind(eventBus),
    getMetrics: eventBus.getMetrics.bind(eventBus),
    get historySize(): number {
      return eventBus.historySize;
    },
    get subscriberCount(): number {
      return eventBus.subscriberCount;
    },
  }), []);

  return {
    emit,
    emitWithOptions,
    on,
    onAny,
    onFilter,
    once,
    getHistory,
    getMetrics,
    historySize,
    subscriberCount,
  };
}

/**
 * Hook spécialisé pour écouter les événements d'agents
 */
export function useAgentEvents(callback: (event: Extract<Event, { type: `agent:${string}` }>) => void) {
  const { on } = useEventBus();
  
  useEffect(() => {
    const unsub = on("agent:*", callback as EventHandler<EventType>);
    return unsub;
  }, [on, callback]);
}

/**
 * Hook spécialisé pour écouter les événements de missions
 */
export function useMissionEvents(callback: (event: Extract<Event, { type: `mission:${string}` }>) => void) {
  const { on } = useEventBus();
  
  useEffect(() => {
    const unsub = on("mission:*", callback as EventHandler<EventType>);
    return unsub;
  }, [on, callback]);
}

/**
 * Hook spécialisé pour écouter les événements de tâches
 */
export function useTaskEvents(callback: (event: Extract<Event, { type: `task:${string}` }>) => void) {
  const { on } = useEventBus();
  
  useEffect(() => {
    const unsub = on("task:*", callback as EventHandler<EventType>);
    return unsub;
  }, [on, callback]);
}

/**
 * Hook spécialisé pour écouter les événements de vérification
 */
export function useVerificationEvents(callback: (event: Extract<Event, { type: `verification:${string}` }>) => void) {
  const { on } = useEventBus();
  
  useEffect(() => {
    const unsub = on("verification:*", callback as EventHandler<EventType>);
    return unsub;
  }, [on, callback]);
}

/**
 * Hook spécialisé pour écouter les événements d'artefacts
 */
export function useArtifactEvents(callback: (event: Extract<Event, { type: `artifact:${string}` }>) => void) {
  const { on } = useEventBus();
  
  useEffect(() => {
    const unsub = on("artifact:*", callback as EventHandler<EventType>);
    return unsub;
  }, [on, callback]);
}

/**
 * Hook spécialisé pour écouter les événements de checkpoint
 */
export function useCheckpointEvents(callback: (event: Extract<Event, { type: `checkpoint:${string}` }>) => void) {
  const { on } = useEventBus();
  
  useEffect(() => {
    const unsub = on("checkpoint:*", callback as EventHandler<EventType>);
    return unsub;
  }, [on, callback]);
}

/**
 * Hook pour écouter tous les événements du système
 */
export function useSystemEvents(callback: (event: Event) => void) {
  const { onAny } = useEventBus();
  
  useEffect(() => {
    const unsub = onAny(callback);
    return unsub;
  }, [onAny, callback]);
}

/**
 * Hook pour récupérer l'historique des événements
 */
export function useEventHistory(limit?: number, filter?: EventFilter) {
  const { getHistory } = useEventBus();
  
  const [history, setHistory] = useState<Event[]>([]);
  
  const refresh = useCallback(() => {
    const events = getHistory(limit, filter);
    setHistory([...events]);
  }, [getHistory, limit, filter]);

  const addEventListener = useCallback((callback: (events: Event[]) => void) => {
    const unsub = eventBus.onAny(() => {
      const events = getHistory(limit, filter);
      setHistory([...events]);
      callback(events);
    });
    return unsub;
  }, [getHistory, limit, filter]);

  return {
    history,
    refresh,
    addEventListener,
  };
}

export default useEventBus;
