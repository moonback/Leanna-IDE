/**
 * AgentEventStreamAdapter — Adapter pour intégrer AgentEventStream avec EventBus
 * 
 * Cet adapter permet de :
 * - Transformer les événements de AgentEventStream en événements EventBus
 * - Forwarder les événements de EventBus vers AgentEventStream pour les clients frontend
 * - Maintenir la compatibilité avec le code existant
 * 
 * Schéma d'intégration :
 * 
 * AgentEventStream <---> AgentEventStreamAdapter <---> EventBus
 * 
 * Les événements émis sur AgentEventStream sont transformés et émis sur EventBus.
 * Les événements pertinents de EventBus sont forwardés vers AgentEventStream.
 */

import { agentEventStream } from "../../agents/AgentEventStream.js";
import { eventBus } from "../EventBus.js";
import type { AgentEvent } from "../../agents/ProgressNotifier.js";
import type { EventType, Event } from "../types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Mapping des événements AgentEvent vers les types d'événements
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mapping des types d'événements AgentEvent vers les types d'événements EventBus
 */
const AGENT_EVENT_TO_EVENT_TYPE: Record<AgentEvent["event"], EventType> = {
  task_started: "mission:action_started",
  task_progress: "mission:action_progress",
  task_completed: "mission:action_completed",
  task_failed: "mission:action_failed",
  orchestration_started: "mission:started",
  orchestration_completed: "mission:completed",
};

// ═══════════════════════════════════════════════════════════════════════════════
// Mapping inverse : types d'événements EventBus vers AgentEvent
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Types d'événements qui doivent être forwardés vers AgentEventStream
 */
const FORWARD_TO_AGENT_STREAM: EventType[] = [
  "mission:started",
  "mission:plan_created",
  "mission:goal_started",
  "mission:goal_completed",
  "mission:goal_failed",
  "mission:goal_escalated",
  "mission:goal_blocked",
  "mission:action_started",
  "mission:action_completed",
  "mission:action_failed",
  "mission:progress",
  "mission:completed",
  "mission:failed",
  "mission:cancelled",
  "mission:paused",
  "mission:resumed",
  "agent:started",
  "agent:completed",
  "agent:failed",
  "agent:busy",
  "agent:idle",
  "agent:error",
  "agent:status_changed",
];

/**
 * Mapping des types d'événements EventBus vers AgentEvent["event"]
 */
const EVENT_TYPE_TO_AGENT_EVENT: Partial<Record<EventType, AgentEvent["event"]>> = {
  "mission:started": "orchestration_started",
  "mission:plan_created": "orchestration_started",
  "mission:goal_started": "task_started",
  "mission:goal_completed": "task_completed",
  "mission:goal_failed": "task_failed",
  "mission:goal_escalated": "task_failed",
  "mission:goal_blocked": "task_failed",
  "mission:action_started": "task_started",
  "mission:action_completed": "task_completed",
  "mission:action_failed": "task_failed",
  "mission:progress": "task_progress",
  "mission:completed": "orchestration_completed",
  "mission:failed": "task_failed",
  "mission:cancelled": "task_failed",
  "mission:paused": "task_progress",
  "mission:resumed": "task_started",
  "agent:started": "task_started",
  "agent:completed": "task_completed",
  "agent:failed": "task_failed",
  "agent:busy": "task_started",
  "agent:idle": "task_completed",
  "agent:error": "task_failed",
  "agent:status_changed": "task_progress",
};

// ═══════════════════════════════════════════════════════════════════════════════
// AgentEventStreamAdapter
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Adapter pour intégrer AgentEventStream avec EventBus.
 * 
 * Cet adapter :
 * 1. Écoute les événements sur AgentEventStream
 * 2. Les transforme en événements EventBus
 * 3. Les émet sur EventBus
 * 4. Forward les événements pertinents de EventBus vers AgentEventStream
 */
export class AgentEventStreamAdapter {
  private initialized = false;
  private eventStreamUnsub: (() => void) | null = null;
  private eventBusUnsubs: Map<EventType, () => void> = new Map();

  constructor() {
    this.initialize();
  }

  /**
   * Initialise l'adapter.
   */
  private initialize(): void {
    if (this.initialized) return;
    
    this.initialized = true;
    
    // Écouter les événements sur AgentEventStream
    this.eventStreamUnsub = agentEventStream.subscribe((agentEvent) => {
      this.handleAgentEvent(agentEvent);
    });
    
    // Écouter les événements pertinents sur EventBus et les forwarder vers AgentEventStream
    for (const eventType of FORWARD_TO_AGENT_STREAM) {
      const unsub = eventBus.on(eventType, (event) => {
        this.forwardToAgentStream(event);
      });
      this.eventBusUnsubs.set(eventType, unsub);
    }
    
    console.log("[AgentEventStreamAdapter] Initialisé");
  }

  /**
   * Traite un événement de AgentEventStream et le transforme en événement EventBus.
   */
  private handleAgentEvent(agentEvent: AgentEvent): void {
    try {
      // Mapper le type d'événement
      const eventType = AGENT_EVENT_TO_EVENT_TYPE[agentEvent.event] || 
        (`mission:${agentEvent.event}` as EventType);
      
      // Créer l'événement EventBus
      const event: Event = {
        type: eventType,
        data: {
          taskId: agentEvent.taskId,
          role: agentEvent.role,
          title: agentEvent.title,
          status: agentEvent.status,
          agentName: agentEvent.agentName,
          detail: agentEvent.detail,
          timestamp: agentEvent.timestamp,
          summary: agentEvent.summary,
          durationMs: agentEvent.durationMs,
          progress: agentEvent.progress,
        },
        timestamp: new Date().toISOString(),
        source: "agents.AgentEventStream",
      };
      
      // Émettre sur EventBus
      eventBus.emit(event as never);
    } catch (error) {
      console.error("[AgentEventStreamAdapter] Erreur de traitement:", error);
    }
  }

  /**
   * Forward un événement EventBus vers AgentEventStream.
   */
  private forwardToAgentStream(event: Event): void {
    try {
      // Mapper le type d'événement
      const agentEventType = EVENT_TYPE_TO_AGENT_EVENT[event.type];
      
      if (!agentEventType) {
        // Ne pas forwarder les événements non mappés
        return;
      }
      
      // Extraire les données pertinentes
      const eventData = event.data as Record<string, unknown>;
      
      // Créer l'événement AgentEvent
      const agentEvent: AgentEvent = {
        type: "agent_event",
        event: agentEventType,
        taskId: (eventData.taskId as string) || eventData.missionId as string || event.id || "",
        role: (eventData.role as import("../../agents/types.js").AgentRole) || "system",
        title: (eventData.title as string) || event.type,
        status: (eventData.status as import("../../agents/ProgressNotifier.js").TaskStatus) || "completed",
        agentName: (eventData.agentName as string) || "Unknown",
        timestamp: event.timestamp,
        detail: (eventData.error as string) || (eventData.summary as string) || "",
        summary: eventData.summary as string | undefined,
        durationMs: eventData.durationMs as number | undefined,
        progress: eventData.progress as { current: number; total: number; label: string } | undefined,
      };
      
      // Publier sur AgentEventStream
      agentEventStream.publish(agentEvent);
    } catch (error) {
      console.error("[AgentEventStreamAdapter] Erreur de forward:", error);
    }
  }

  /**
   * Publie un événement directement sur AgentEventStream et EventBus.
   */
  publish(agentEvent: AgentEvent): void {
    // Publier sur AgentEventStream
    agentEventStream.publish(agentEvent);
    
    // aussi émettre sur EventBus
    this.handleAgentEvent(agentEvent);
  }

  /**
   * Désinitialise l'adapter.
   */
  destroy(): void {
    if (this.eventStreamUnsub) {
      this.eventStreamUnsub();
      this.eventStreamUnsub = null;
    }
    
    for (const unsub of this.eventBusUnsubs.values()) {
      unsub();
    }
    this.eventBusUnsubs.clear();
    
    this.initialized = false;
    console.log("[AgentEventStreamAdapter] Désinitialisé");
  }

  /**
   * Retourne si l'adapter est initialisé.
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Singleton Instance
// ═══════════════════════════════════════════════════════════════════════════════

/** Instance singleton de l'adapter */
export const agentEventStreamAdapter = new AgentEventStreamAdapter();

export default AgentEventStreamAdapter;
