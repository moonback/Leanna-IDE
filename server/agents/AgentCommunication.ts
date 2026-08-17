/**
 * AgentCommunication — Types et protocoles pour la communication inter-agents
 *
 * Définit les structures de messages, événements et protocoles
 * pour permettre aux agents de communiquer de manière autonome.
 */
import { z } from "zod";
import type { AgentRole, TaskResult } from "./types";

// ═══════════════════════════════════════════════════════════════════════════════
// Types de messages inter-agents
// ═══════════════════════════════════════════════════════════════════════════════

/** Type de message échangé entre agents */
export type AgentMessageType =
  | "task_request"      // Demande d'exécution de tâche
  | "task_response"     // Réponse avec résultat d'une tâche
  | "collaboration_request" // Demande de collaboration pour une tâche complexe
  | "status_query"      // Demande de statut d'un agent
  | "status_response"   // Réponse avec le statut
  | "event"             // Notification d'événement (non bloquant)
  | "broadcast";        // Message diffusé à tous les agents

/** Priorité d'un message */
export type MessagePriority = "low" | "medium" | "high" | "critical";

/** Message échangé entre agents */
export interface AgentMessage {
  id: string;
  type: AgentMessageType;
  from: AgentRole;
  to: AgentRole | "broadcast";
  priority: MessagePriority;
  timestamp: string;
  
  /** Contenu du message */
  payload: MessagePayload;
  
  /** ID de corrélation pour les request/response */
  correlationId?: string;
  
  /** Metadata optionnelles */
  metadata?: Record<string, unknown>;
}

/** Contenu d'un message (union discriminée par type) */
export type MessagePayload =
  | TaskRequestPayload
  | TaskResponsePayload
  | CollaborationRequestPayload
  | StatusQueryPayload
  | StatusResponsePayload
  | EventPayload
  | BroadcastPayload;

// ─── Payloads spécifiques ─────────────────────────────────────────────────────

export interface TaskRequestPayload {
  type: "task_request";
  taskId: string;
  title: string;
  description: string;
  files?: string[];
  instructions?: string;
  context?: Record<string, unknown>;
}

export interface TaskResponsePayload {
  type: "task_response";
  taskId: string;
  result: TaskResult;
}

export interface CollaborationRequestPayload {
  type: "collaboration_request";
  taskId: string;
  reason: string;
  context: {
    currentWork: string;
    blockedBy: string;
    requiredExpertise: string;
  };
}

export interface StatusQueryPayload {
  type: "status_query";
}

export interface StatusResponsePayload {
  type: "status_response";
  status: "idle" | "busy" | "overloaded" | "offline";
  currentTasks: number;
  maxConcurrency: number;
  queueLength: number;
}

export interface EventPayload {
  type: "event";
  eventType: string;
  data: Record<string, unknown>;
}

export interface BroadcastPayload {
  type: "broadcast";
  message: string;
  data?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Protocole de communication
// ═══════════════════════════════════════════════════════════════════════════════

/** Handler de message asynchrone */
export type MessageHandler = (message: AgentMessage) => Promise<void>;

/** Subscription à un type de message */
export interface MessageSubscription {
  id: string;
  agentRole: AgentRole;
  messageType: AgentMessageType | "*";
  handler: MessageHandler;
}

/** Stratégie de routage pour les messages */
export type RoutingStrategy = "direct" | "broadcast" | "round-robin" | "load-balanced";

/** Options de publication de message */
export interface PublishOptions {
  /** Attendre une réponse ? */
  awaitResponse?: boolean;
  /** Timeout pour la réponse (ms) */
  timeout?: number;
  /** Stratégie de routage */
  routing?: RoutingStrategy;
  /** Retry en cas d'échec ? */
  retry?: {
    maxRetries: number;
    backoff: "linear" | "exponential";
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Capacités de délégation et collaboration
// ═══════════════════════════════════════════════════════════════════════════════

/** Capacité d'un agent à déléguer à un autre */
export interface DelegationCapability {
  /** Agent cible */
  targetRole: AgentRole;
  /** Types de tâches qu'il peut lui déléguer */
  taskTypes: string[];
  /** Raison de la délégation */
  reason: string;
}

/** Matrice de délégation : quels agents peuvent déléguer à qui */
export const DELEGATION_MATRIX: Record<AgentRole, DelegationCapability[]> = {
  writer: [
    { targetRole: "proofreader", taskTypes: ["relecture", "correction"], reason: "Relecture après rédaction" },
    { targetRole: "formatter", taskTypes: ["mise-en-forme", "formatage"], reason: "Mise en forme du document rédigé" },
    { targetRole: "summarizer", taskTypes: ["resume", "synthese"], reason: "Création d'un résumé exécutif" },
  ],
  formatter: [
    { targetRole: "proofreader", taskTypes: ["verification-format"], reason: "Vérification de la cohérence du formatage" },
    { targetRole: "writer", taskTypes: ["contenu-manquant"], reason: "Signaler les sections vides nécessitant du contenu" },
  ],
  researcher: [
    { targetRole: "writer", taskTypes: ["redaction-findings"], reason: "Rédaction à partir des résultats de recherche" },
    { targetRole: "planner", taskTypes: ["structuration-recherche"], reason: "Structuration des findings en plan" },
    { targetRole: "summarizer", taskTypes: ["synthese-sources"], reason: "Synthèse des sources collectées" },
  ],
  proofreader: [
    { targetRole: "writer", taskTypes: ["reformulation", "reecriture"], reason: "Réécriture de passages problématiques" },
    { targetRole: "translator", taskTypes: ["verification-traduction"], reason: "Vérification de la qualité d'une traduction" },
  ],
  translator: [
    { targetRole: "proofreader", taskTypes: ["relecture-traduction"], reason: "Relecture de la traduction dans la langue cible" },
    { targetRole: "formatter", taskTypes: ["formatage-traduction"], reason: "Remise en forme du document traduit" },
  ],
  summarizer: [
    { targetRole: "proofreader", taskTypes: ["relecture-resume"], reason: "Relecture du résumé produit" },
    { targetRole: "writer", taskTypes: ["developpement-point"], reason: "Développer un point du résumé si nécessaire" },
  ],
  planner: [
    { targetRole: "writer", taskTypes: ["redaction-section", "redaction-document"], reason: "Rédaction selon le plan établi" },
    { targetRole: "researcher", taskTypes: ["recherche-complementaire"], reason: "Recherche complémentaire pour un point du plan" },
    { targetRole: "formatter", taskTypes: ["mise-en-forme-plan"], reason: "Formatage du plan en document structuré" },
  ],
};

/** Patterns de collaboration entre agents */
export interface CollaborationPattern {
  name: string;
  description: string;
  participants: AgentRole[];
  workflow: Array<{
    step: number;
    agent: AgentRole;
    action: string;
    dependsOn?: number[];
  }>;
}

/** Patterns de collaboration prédéfinis */
export const COLLABORATION_PATTERNS: CollaborationPattern[] = [
  {
    name: "document-complet",
    description: "Création complète d'un document : planification → rédaction → correction → mise en forme",
    participants: ["planner", "writer", "proofreader", "formatter"],
    workflow: [
      { step: 1, agent: "planner", action: "Créer le plan et la structure du document" },
      { step: 2, agent: "writer", action: "Rédiger le contenu selon le plan", dependsOn: [1] },
      { step: 3, agent: "proofreader", action: "Relecture et correction orthographique/grammaticale", dependsOn: [2] },
      { step: 4, agent: "formatter", action: "Mise en forme finale et formatage Markdown", dependsOn: [3] },
    ],
  },
  {
    name: "traduction-verifiee",
    description: "Traduction d'un document avec relecture de qualité",
    participants: ["writer", "translator", "proofreader"],
    workflow: [
      { step: 1, agent: "writer", action: "Préparer et nettoyer le texte source" },
      { step: 2, agent: "translator", action: "Traduire le document", dependsOn: [1] },
      { step: 3, agent: "proofreader", action: "Relecture de la traduction", dependsOn: [2] },
    ],
  },
  {
    name: "recherche-redaction",
    description: "Recherche approfondie puis rédaction documentée",
    participants: ["researcher", "planner", "writer", "proofreader"],
    workflow: [
      { step: 1, agent: "researcher", action: "Recherche et collecte d'informations" },
      { step: 2, agent: "planner", action: "Structurer les findings en plan", dependsOn: [1] },
      { step: 3, agent: "writer", action: "Rédiger le document à partir de la recherche", dependsOn: [2] },
      { step: 4, agent: "proofreader", action: "Relecture et vérification des sources", dependsOn: [3] },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Schemas Zod pour validation
// ═══════════════════════════════════════════════════════════════════════════════

export const agentMessageSchema = z.object({
  id: z.string().uuid(),
  type: z.enum([
    "task_request",
    "task_response",
    "collaboration_request",
    "status_query",
    "status_response",
    "event",
    "broadcast",
  ]),
  from: z.enum(["writer", "formatter", "researcher", "proofreader", "translator", "summarizer", "planner"]),
  to: z.union([
    z.enum(["writer", "formatter", "researcher", "proofreader", "translator", "summarizer", "planner"]),
    z.literal("broadcast"),
  ]),
  priority: z.enum(["low", "medium", "high", "critical"]),
  timestamp: z.string().datetime(),
  payload: z.any(), // Validation plus spécifique dans les handlers
  correlationId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const publishOptionsSchema = z.object({
  awaitResponse: z.boolean().optional(),
  timeout: z.number().int().positive().optional(),
  routing: z.enum(["direct", "broadcast", "round-robin", "load-balanced"]).optional(),
  retry: z
    .object({
      maxRetries: z.number().int().min(1).max(5),
      backoff: z.enum(["linear", "exponential"]),
    })
    .optional(),
});
