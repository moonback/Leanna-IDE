/**
 * ExecutorAdapter — Adapter pour intégrer mission/Executor avec EventBus
 * 
 * Cet adapter permet de :
 * - Transformer les événements de Executor en événements EventBus
 * - Permettre à Executor d'émettre des événements via EventBus
 * - Maintenir la compatibilité avec le code existant
 * 
 * Schéma d'intégration :
 * 
 * Executor <---> ExecutorAdapter <---> EventBus
 * 
 * Les événements émis par Executor (via son ExecutorEventEmitter) sont
 * transformés et émis sur EventBus. Les composants qui écoutent EventBus
 * reçoivent ces événements de manière unifiée.
 */

import { Executor, type ExecutorEventEmitter } from "../../mission/Executor.js";
import { eventBus } from "../EventBus.js";
import { createMissionEvent, createTaskEvent, createToolEvent } from "../EventBus.js";
import type { Event, EventType } from "../types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Mapping des événements Executor vers les types d'événements
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mapping des noms d'événements de Executor vers les types d'événements EventBus
 */
const EXECUTOR_EVENT_TO_EVENT_TYPE: Record<string, EventType> = {
  // Mission events
  mission_plan: "mission:plan_created",
  mission_started: "mission:started",
  mission_completed: "mission:completed",
  mission_failed: "mission:failed",
  mission_cancelled: "mission:cancelled",
  mission:paused: "mission:paused",
  mission:resumed: "mission:resumed",
  
  // Goal events
  goal_started: "mission:goal_started",
  goal_completed: "mission:goal_completed",
  goal_failed: "mission:goal_failed",
  goal_escalated: "mission:goal_escalated",
  goal_blocked: "mission:goal_blocked",
  
  // Action events
  action_started: "mission:action_started",
  action_completed: "mission:action_completed",
  action_failed: "mission:action_failed",
};

// ═══════════════════════════════════════════════════════════════════════════════
// Types pour l'émetteur d'événements de Executor
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Type des données d'événements de Executor
 */
interface ExecutorEventData {
  missionId: string;
  goalId?: string;
  actionId?: string;
  error?: string;
  success?: boolean;
  result?: unknown;
  [key: string]: unknown;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ExecutorAdapter
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Adapter pour intégrer Executor avec EventBus.
 * 
 * Cet adapter :
 * 1. Crée un émetteur d'événements pour Executor qui émet sur EventBus
 * 2. Transforme les événements de Executor en événements EventBus typés
 * 3. Permet une intégration transparente
 */
export class ExecutorAdapter implements ExecutorEventEmitter {
  private initialized = false;

  constructor() {
    this.initialize();
  }

  /**
   * Initialise l'adapter.
   */
  private initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    console.log("[ExecutorAdapter] Initialisé");
  }

  /**
   * Méthode appelée par Executor pour émettre un événement.
   * Cette méthode transforme l'événement et l'émet sur EventBus.
   */
  emit(eventName: string, data: Record<string, unknown>): void {
    try {
      // Déterminer le type d'événement EventBus
      const eventType = EXECUTOR_EVENT_TO_EVENT_TYPE[eventName] || 
        (`mission:${eventName}` as EventType);
      
      // Créer l'événement EventBus
      const eventData = this.transformExecutorData(eventName, data);
      
      const event: Event = {
        type: eventType,
        data: eventData,
        timestamp: new Date().toISOString(),
        source: "mission.Executor",
      };
      
      // Émettre sur EventBus
      eventBus.emit(event as never);
    } catch (error) {
      console.error("[ExecutorAdapter] Erreur d'émission:", error);
    }
  }

  /**
   * Transforme les données de Executor en données d'événement EventBus.
   */
  private transformExecutorData(eventName: string, data: Record<string, unknown>): Record<string, unknown> {
    const eventData: Record<string, unknown> = { ...data };
    
    // Ajouter des champs spécifiques selon le type d'événement
    switch (eventName) {
      case "mission_plan":
        eventData.missionId = data.missionId;
        eventData.plan = data.plan;
        break;
        
      case "mission_started":
      case "mission_completed":
      case "mission_failed":
      case "mission_cancelled":
        eventData.missionId = data.missionId;
        if (data.title) eventData.title = data.title;
        break;
        
      case "goal_started":
      case "goal_completed":
      case "goal_failed":
      case "goal_escalated":
      case "goal_blocked":
        eventData.missionId = data.missionId;
        eventData.goalId = data.goalId;
        if (data.title) eventData.title = data.title;
        if (data.reason) eventData.reason = data.reason;
        break;
        
      case "action_started":
      case "action_completed":
      case "action_failed":
        eventData.missionId = data.missionId;
        eventData.goalId = data.goalId;
        eventData.actionId = data.actionId;
        if (data.skill) eventData.skill = data.skill;
        if (data.success !== undefined) eventData.success = data.success;
        if (data.confidence !== undefined) eventData.confidence = data.confidence;
        if (data.decision) eventData.decision = data.decision;
        if (data.durationMs !== undefined) eventData.durationMs = data.durationMs;
        break;
    }
    
    return eventData;
  }

  /**
   * Crée un émetteur d'événements pour Executor.
   * Cette méthode retourne une fonction qui peut être passée à Executor.setEventEmitter().
   */
  createEventEmitter(): ExecutorEventEmitter {
    return (eventName: string, data: Record<string, unknown>) => {
      this.emit(eventName, data);
    };
  }

  /**
   * Configure un Executor pour utiliser cet adapter.
   */
  configureExecutor(executor: Executor): void {
    const emitter = this.createEventEmitter();
    executor.setEventEmitter(emitter);
  }

  /**
   * Émet un événement de mission directement.
   */
  emitMissionEvent(
    eventType: "mission:created" | "mission:started" | "mission:plan_created" | 
               "mission:completed" | "mission:failed" | "mission:cancelled",
    data: Record<string, unknown>
  ): void {
    const event = createMissionEvent(eventType, data as never);
    eventBus.emit(event as never);
  }

  /**
   * Émet un événement de tâche directement.
   */
  emitTaskEvent(
    eventType: "task:created" | "task:started" | "task:progress" | 
               "task:completed" | "task:failed" | "task:cancelled",
    data: Record<string, unknown>
  ): void {
    const event = createTaskEvent(eventType, data as never);
    eventBus.emit(event as never);
  }

  /**
   * Désinitialise l'adapter.
   */
  destroy(): void {
    this.initialized = false;
    console.log("[ExecutorAdapter] Désinitialisé");
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
export const executorAdapter = new ExecutorAdapter();

export default ExecutorAdapter;
