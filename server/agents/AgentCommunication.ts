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
  coder: [
    { targetRole: "test", taskTypes: ["unit-test", "regression-test"], reason: "Tests après modification de code" },
    { targetRole: "docs", taskTypes: ["code-documentation"], reason: "Documentation du code modifié" },
    { targetRole: "review", taskTypes: ["code-quality-check"], reason: "Revue qualité après modification" },
  ],
  architect: [
    { targetRole: "coder", taskTypes: ["implement-design", "code-change"], reason: "Implémentation de changements selon le design" },
    { targetRole: "refactor", taskTypes: ["code-restructure", "split-module"], reason: "Implémentation de changements architecturaux" },
    { targetRole: "docs", taskTypes: ["architecture-doc", "design-doc"], reason: "Documentation des décisions architecturales" },
    { targetRole: "security", taskTypes: ["security-review"], reason: "Validation sécurité des choix d'architecture" },
  ],
  refactor: [
    { targetRole: "test", taskTypes: ["regression-test", "refactor-verification"], reason: "Vérification que le refactoring n'a pas cassé de fonctionnalités" },
    { targetRole: "review", taskTypes: ["code-quality-check"], reason: "Revue qualité du code refactoré" },
  ],
  test: [
    { targetRole: "refactor", taskTypes: ["test-code-cleanup"], reason: "Amélioration de la qualité du code de test" },
    { targetRole: "docs", taskTypes: ["test-documentation"], reason: "Documentation des scénarios de test" },
  ],
  docs: [
    { targetRole: "architect", taskTypes: ["architecture-validation"], reason: "Validation de la cohérence architecturale de la doc" },
    { targetRole: "review", taskTypes: ["doc-review"], reason: "Revue de la qualité de la documentation" },
  ],
  security: [
    { targetRole: "coder", taskTypes: ["security-fix"], reason: "Implémentation des corrections de sécurité" },
    { targetRole: "refactor", taskTypes: ["security-fix"], reason: "Implémentation des corrections de sécurité" },
    { targetRole: "test", taskTypes: ["security-test"], reason: "Tests de validation des correctifs de sécurité" },
  ],
  review: [
    { targetRole: "coder", taskTypes: ["code-fix", "quality-improvement"], reason: "Implémentation des corrections et améliorations" },
    { targetRole: "refactor", taskTypes: ["quality-improvement"], reason: "Implémentation des améliorations de qualité" },
    { targetRole: "test", taskTypes: ["coverage-improvement"], reason: "Amélioration de la couverture de test" },
    { targetRole: "docs", taskTypes: ["doc-improvement"], reason: "Amélioration de la documentation" },
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
    name: "refactor-with-safety",
    description: "Refactoring sécurisé avec tests avant/après",
    participants: ["test", "refactor", "review"],
    workflow: [
      { step: 1, agent: "test", action: "Générer tests de régression" },
      { step: 2, agent: "test", action: "Exécuter tests (baseline)", dependsOn: [1] },
      { step: 3, agent: "refactor", action: "Effectuer refactoring", dependsOn: [2] },
      { step: 4, agent: "test", action: "Re-exécuter tests (validation)", dependsOn: [3] },
      { step: 5, agent: "review", action: "Revue qualité du code refactoré", dependsOn: [4] },
    ],
  },
  {
    name: "security-audit-full",
    description: "Audit de sécurité complet avec correction et validation",
    participants: ["security", "refactor", "test"],
    workflow: [
      { step: 1, agent: "security", action: "Audit de sécurité complet" },
      { step: 2, agent: "refactor", action: "Implémenter les corrections", dependsOn: [1] },
      { step: 3, agent: "test", action: "Tests de sécurité", dependsOn: [2] },
      { step: 4, agent: "security", action: "Validation finale", dependsOn: [3] },
    ],
  },
  {
    name: "new-feature-complete",
    description: "Développement complet d'une nouvelle fonctionnalité",
    participants: ["architect", "refactor", "test", "docs", "review"],
    workflow: [
      { step: 1, agent: "architect", action: "Design architectural" },
      { step: 2, agent: "refactor", action: "Implémentation du code", dependsOn: [1] },
      { step: 3, agent: "test", action: "Tests unitaires et d'intégration", dependsOn: [2] },
      { step: 4, agent: "docs", action: "Documentation technique", dependsOn: [2] },
      { step: 5, agent: "review", action: "Revue de code finale", dependsOn: [3, 4] },
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
  from: z.enum(["coder", "test", "docs", "refactor", "security", "review", "architect"]),
  to: z.union([
    z.enum(["coder", "test", "docs", "refactor", "security", "review", "architect"]),
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
