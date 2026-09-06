/**
 * AgentMessageBusAdapter — Adapter pour intégrer AgentMessageBus avec EventBus
 * 
 * Cet adapter permet de :
 * - Transformer les messages de AgentMessageBus en événements EventBus
 * - Forwarder les événements de EventBus vers AgentMessageBus si nécessaire
 * - Maintenir la compatibilité avec le code existant
 * 
 * Schéma d'intégration :
 * 
 * AgentMessageBus <---> AgentMessageBusAdapter <---> EventBus
 * 
 * Les messages publiés sur AgentMessageBus sont transformés en événements
 * et émis sur EventBus. Les abonnements à AgentMessageBus continuent de fonctionner.
 */

import { agentMessageBus } from "../../agents/AgentMessageBus.js";
import { eventBus } from "../EventBus.js";
import { agentEventStream } from "../../agents/AgentEventStream.js";
import type {
  AgentMessage,
  MessageHandler,
} from "../../agents/AgentCommunication.js";
import type { AgentRole } from "../../agents/types.js";
import type { EventType, Event } from "../types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Types de messages vers types d'événements
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mapping des types de messages vers les types d'événements
 * Cette mapping permet de transformer les messages en événements typés.
 */
const MESSAGE_TYPE_TO_EVENT_TYPE: Record<string, EventType> = {
  // Messages de tâche
  task_request: "agents:task_request",
  task_response: "agents:task_response",
  task_progress: "mission:action_progress",
  task_started: "mission:action_started",
  task_completed: "mission:action_completed",
  task_failed: "mission:action_failed",
  
  // Messages de collaboration
  collaboration_request: "agents:collaboration_request",
  collaboration_response: "agents:collaboration_response",
  
  // Messages de statut
  status_query: "agent:status_changed",
  status_response: "agent:status_changed",
  
  // Messages de broadcast
  broadcast: "message:broadcast",
  
  // Messages système
  heartbeat: "agent:status_changed",
  ping: "system:ready",
  pong: "system:ready",
};

/**
 * Noms d'événements par défaut par type de message
 */
const DEFAULT_EVENT_TYPES: Record<string, EventType> = {
  // Tâches
  task: "mission:action_completed",
  
  // Agents
  agent: "agent:status_changed",
  
  // Outils
  tool: "tool:completed",
  
  // Missions
  mission: "mission:completed",
  
  // Messages
  message: "message:delivered",
};

// ═══════════════════════════════════════════════════════════════════════════════
// AgentMessageBusAdapter
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Adapter pour intégrer AgentMessageBus avec EventBus.
 * 
 * Cet adapter :
 * 1. Écoute les messages sur AgentMessageBus
 * 2. Les transforme en événements EventBus
 * 3. Les émet sur EventBus
 * 4. Permet aussi d'émettre des messages via EventBus qui seront forwardés à AgentMessageBus
 */
export class AgentMessageBusAdapter {
  private initialized = false;
  private messageSubscriptions: Map<string, () => void> = new Map();
  private eventSubscriptions: Map<EventType, () => void> = new Map();

  constructor() {
    this.initialize();
  }

  /**
   * Initialise l'adapter en abonnant aux messages de AgentMessageBus.
   */
  private initialize(): void {
    if (this.initialized) return;
    
    this.initialized = true;
    
    // Écouter tous les messages sur AgentMessageBus
    // Malheureusement, AgentMessageBus n'a pas de méthode pour écouter tous les messages
    // donc nous allons intercepter les événements "message" émis par le bus
    
    // AgentMessageBus étend EventEmitter, donc nous pouvons écouter l'événement "message"
    const messageHandler = (message: AgentMessage) => {
      this.handleMessage(message);
    };
    
    agentMessageBus.on("message" as never, messageHandler as never);
    
    // Stocker pour désabonnement
    this.messageSubscriptions.set("all-messages", () => {
      agentMessageBus.off("message" as never, messageHandler as never);
    });
    
    console.log("[AgentMessageBusAdapter] Initialisé");
  }

  /**
   * Traite un message de AgentMessageBus et le transforme en événement.
   */
  private handleMessage(message: AgentMessage): void {
    try {
      // Déterminer le type d'événement
      const eventType = this.getEventTypeFromMessage(message);
      
      // Créer l'événement
      const event: Event = {
        type: eventType,
        data: {
          messageId: message.id,
          from: message.from,
          to: message.to,
          type: message.type,
          payload: message.payload,
          priority: message.priority,
          timestamp: message.timestamp,
          correlationId: message.correlationId,
        },
        timestamp: new Date().toISOString(),
        source: "agents.AgentMessageBus",
        correlationId: message.correlationId,
      };
      
      // Émettre sur EventBus
      eventBus.emit(event as never);
      
      // aussi émettre sur AgentEventStream pour compatibilité
      if (message.type !== "broadcast") {
        agentEventStream.publish({
          type: "agent_event",
          event: this.mapToAgentEventType(message.type),
          taskId: message.id,
          role: message.from as AgentRole,
          title: message.type,
          status: "completed",
          agentName: message.from,
          timestamp: message.timestamp,
          detail: JSON.stringify(message.payload),
        });
      }
    } catch (error) {
      console.error("[AgentMessageBusAdapter] Erreur de traitement:", error);
    }
  }

  /**
   * Détermine le type d'événement à partir d'un message.
   */
  private getEventTypeFromMessage(message: AgentMessage): EventType {
    // Vérifier si on a un mapping direct
    if (MESSAGE_TYPE_TO_EVENT_TYPE[message.type]) {
      return MESSAGE_TYPE_TO_EVENT_TYPE[message.type];
    }
    
    // Sinon, utiliser le type par défaut basé sur la structure
    if (message.type.includes(":")) {
      return `agents:${message.type}` as EventType;
    }
    
    // Type par défaut
    return DEFAULT_EVENT_TYPES[message.type] || ("message:" + message.type) as EventType;
  }

  /**
   * Mappe un type de message vers un type d'événement agent.
   */
  private mapToAgentEventType(messageType: string): import("../../agents/ProgressNotifier.js").AgentEvent["event"] {
    const mapping: Record<string, import("../../agents/ProgressNotifier.js").AgentEvent["event"]> = {
      task_request: "task_started",
      task_response: "task_completed",
      task_progress: "task_progress",
      task_started: "task_started",
      task_completed: "task_completed",
      task_failed: "task_failed",
      broadcast: "task_started",
    };
    
    return mapping[messageType] || "task_progress";
  }

  /**
   * Émet un message via AgentMessageBus et EventBus.
   */
  publish(message: AgentMessage): void {
    // Publier sur AgentMessageBus
    agentMessageBus.publish(message).catch((error) => {
      console.error("[AgentMessageBusAdapter] Erreur de publication:", error);
    });
    
    // aussi émettre sur EventBus
    this.handleMessage(message);
  }

  /**
   * Abonne un handler à un type de message spécifique via EventBus.
   */
  onMessage<T extends AgentMessage["type"]>(
    messageType: T,
    handler: MessageHandler
  ): () => void {
    // Créer un wrapper qui écoute sur AgentMessageBus
    const subId = agentMessageBus.subscribe(
      handler as never,
      messageType as never,
      handler as never
    );
    
    // Retourner la fonction de désabonnement
    return () => {
      agentMessageBus.unsubscribe(subId);
    };
  }

  /**
   * Abonne un handler à tous les messages d'un rôle spécifique.
   */
  onMessagesFrom(role: AgentRole, handler: MessageHandler): () => void {
    const subId = agentMessageBus.subscribe(role, "*", handler as never);
    return () => agentMessageBus.unsubscribe(subId);
  }

  /**
   * Désinitialise l'adapter.
   */
  destroy(): void {
    for (const unsub of this.messageSubscriptions.values()) {
      unsub();
    }
    for (const unsub of this.eventSubscriptions.values()) {
      unsub();
    }
    this.messageSubscriptions.clear();
    this.eventSubscriptions.clear();
    this.initialized = false;
    
    console.log("[AgentMessageBusAdapter] Désinitialisé");
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
export const agentMessageBusAdapter = new AgentMessageBusAdapter();

export default AgentMessageBusAdapter;
