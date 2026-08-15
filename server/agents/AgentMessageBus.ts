/**
 * AgentMessageBus — Bus de messages inter-agents
 *
 * Implémente un système de messagerie pub/sub + request/response
 * permettant aux agents de communiquer de manière asynchrone et découplée.
 *
 * Fonctionnalités :
 * - Publish/Subscribe par rôle et type de message
 * - Request/Response avec timeout et corrélation
 * - Broadcast à tous les agents
 * - Queue de messages avec priorité
 * - Retry avec backoff exponentiel
 * - Métriques et historique des messages
 */
import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import type { AgentRole } from "./types";
import type {
  AgentMessage,
  MessageHandler,
  MessagePriority,
  MessageSubscription,
  PublishOptions,
  StatusResponsePayload,
} from "./AgentCommunication";
import { agentPersistence } from "./AgentPersistence";
import { createLogger } from "../utils/logger";

const log = createLogger("AgentMessageBus");

// ─── Types internes ───────────────────────────────────────────────────────────

interface PendingRequest {
  resolve: (message: AgentMessage) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

interface MessageMetric {
  messageId: string;
  from: AgentRole;
  to: AgentRole | "broadcast";
  type: string;
  timestamp: number;
  processingMs?: number;
  success: boolean;
}

// Capacité max de la file de messages par priorité
const QUEUE_CAPACITY = 100;
// Délai max avant délivrance forcée (ms)
const MAX_DELIVERY_DELAY_MS = 30_000;
// TTL de la dead-letter queue (ms) — messages non délivrés expirés après ce délai
const DEAD_LETTER_TTL_MS = 60_000;

interface DeadLetterEntry {
  message: AgentMessage;
  enqueuedAt: number;
  attempts: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AgentMessageBus
// ═══════════════════════════════════════════════════════════════════════════════

export class AgentMessageBus extends EventEmitter {
  private subscriptions: Map<string, MessageSubscription> = new Map();
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private messageHistory: AgentMessage[] = [];
  private metrics: MessageMetric[] = [];
  private processingQueue = false;
  private queue: Array<{ message: AgentMessage; options: PublishOptions }> = [];
  /** Dead-letter queue : messages non délivrés car l'agent cible n'était pas abonné */
  private deadLetterQueue: Map<AgentRole, DeadLetterEntry[]> = new Map();

  constructor(private readonly maxHistorySize = 100) {
    super();
  }

  // ─── Subscription ─────────────────────────────────────────────────────────

  /**
   * Abonne un agent à un type de message.
   * Déclenche la re-livraison des messages en dead-letter queue pour ce rôle.
   * @returns ID de subscription pour désabonnement
   */
  subscribe(
    agentRole: AgentRole,
    messageType: AgentMessage["type"] | "*",
    handler: MessageHandler
  ): string {
    const subId = randomUUID();
    this.subscriptions.set(subId, {
      id: subId,
      agentRole,
      messageType,
      handler,
    });
    log.debug(`📬 Agent "${agentRole}" abonné au type "${messageType}" (sub: ${subId.slice(0, 8)})`);

    // Re-livrer immédiatement les messages en attente pour ce rôle
    this.flushDeadLetterQueue(agentRole).catch((err) => {
      log.warn(`Échec flush dead-letter queue pour "${agentRole}": ${(err as Error).message}`);
    });

    return subId;
  }

  /**
   * Désabonne un agent via son ID de subscription.
   */
  unsubscribe(subscriptionId: string): boolean {
    const removed = this.subscriptions.delete(subscriptionId);
    if (removed) log.debug(`📭 Subscription ${subscriptionId.slice(0, 8)} supprimée`);
    return removed;
  }

  /**
   * Désabonne tous les handlers d'un agent.
   */
  unsubscribeAll(agentRole: AgentRole): void {
    for (const [id, sub] of this.subscriptions) {
      if (sub.agentRole === agentRole) {
        this.subscriptions.delete(id);
      }
    }
    log.debug(`📭 Toutes les subscriptions de "${agentRole}" supprimées`);
  }

  // ─── Publication ──────────────────────────────────────────────────────────

  /**
   * Publie un message sur le bus (sans attendre de réponse).
   */
  async publish(message: AgentMessage, options: PublishOptions = {}): Promise<void> {
    this.addToHistory(message);
    log.debug(
      `📤 [${message.from}] → [${message.to}] type="${message.type}" id=${message.id.slice(0, 8)}`
    );

    // Retry si configuré
    if (options.retry) {
      await this.withRetry(() => this.deliver(message, options), options.retry);
    } else {
      await this.deliver(message, options);
    }
  }

  /**
   * Publie un message et attend une réponse (request/response pattern).
   * @throws Timeout si la réponse n'arrive pas dans le délai
   */
  async request(
    message: AgentMessage,
    timeoutMs: number = 30_000
  ): Promise<AgentMessage> {
    const correlationId = randomUUID();
    message.correlationId = correlationId;

    this.addToHistory(message);
    log.debug(
      `📤 [${message.from}] → [${message.to}] request id=${message.id.slice(0, 8)} correl=${correlationId.slice(0, 8)}`
    );

    return new Promise<AgentMessage>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(correlationId);
        reject(
          new Error(
            `Timeout: aucune réponse de "${message.to}" pour la requête ${message.id.slice(0, 8)} (${timeoutMs}ms)`
          )
        );
      }, timeoutMs);

      this.pendingRequests.set(correlationId, { resolve, reject, timeout });
      this.deliver(message, {}).catch(reject);
    });
  }

  /**
   * Diffuse un message à tous les agents abonnés.
   */
  async broadcast(
    from: AgentRole,
    eventType: string,
    data: Record<string, unknown> = {}
  ): Promise<void> {
    const message: AgentMessage = {
      id: randomUUID(),
      type: "broadcast",
      from,
      to: "broadcast",
      priority: "low",
      timestamp: new Date().toISOString(),
      payload: { type: "broadcast", message: eventType, data },
    };

    this.addToHistory(message);
    log.debug(`📢 [${from}] broadcast: "${eventType}"`);
    await this.deliverToAll(message);
  }

  /**
   * Répond à un message (ferme le cycle request/response).
   */
  async respond(
    originalMessage: AgentMessage,
    from: AgentRole,
    payload: AgentMessage["payload"]
  ): Promise<void> {
    if (!originalMessage.correlationId) return;

    const response: AgentMessage = {
      id: randomUUID(),
      type: "task_response",
      from,
      to: originalMessage.from,
      priority: originalMessage.priority,
      timestamp: new Date().toISOString(),
      payload,
      correlationId: originalMessage.correlationId,
    };

    this.addToHistory(response);
    const pending = this.pendingRequests.get(originalMessage.correlationId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(originalMessage.correlationId);
      pending.resolve(response);
      log.debug(
        `📬 Réponse délivrée correl=${originalMessage.correlationId.slice(0, 8)}`
      );
    }
  }

  // ─── Query ────────────────────────────────────────────────────────────────

  /** Interroge le statut d'un agent */
  async queryStatus(
    from: AgentRole,
    target: AgentRole,
    timeoutMs = 5_000
  ): Promise<StatusResponsePayload | null> {
    try {
      const response = await this.request(
        {
          id: randomUUID(),
          type: "status_query",
          from,
          to: target,
          priority: "low",
          timestamp: new Date().toISOString(),
          payload: { type: "status_query" },
        },
        timeoutMs
      );
      return response.payload as StatusResponsePayload;
    } catch {
      return null;
    }
  }

  // ─── Métriques & historique ───────────────────────────────────────────────

  /** Retourne les N derniers messages de l'historique */
  getHistory(limit = 50): AgentMessage[] {
    return this.messageHistory.slice(-limit);
  }

  /** Retourne les métriques d'utilisation du bus */
  getMetrics(): {
    totalMessages: number;
    successRate: number;
    byAgentRole: Record<string, number>;
    byMessageType: Record<string, number>;
    pendingRequests: number;
    activeSubscriptions: number;
    deadLetterQueue: Record<string, number>;
  } {
    const byAgentRole: Record<string, number> = {};
    const byMessageType: Record<string, number> = {};

    for (const m of this.metrics) {
      byAgentRole[m.from] = (byAgentRole[m.from] ?? 0) + 1;
      byMessageType[m.type] = (byMessageType[m.type] ?? 0) + 1;
    }

    const successful = this.metrics.filter((m) => m.success).length;

    const deadLetterQueue: Record<string, number> = {};
    for (const [role, entries] of this.deadLetterQueue) {
      const active = entries.filter((e) => Date.now() - e.enqueuedAt < DEAD_LETTER_TTL_MS);
      if (active.length > 0) deadLetterQueue[role] = active.length;
    }

    return {
      totalMessages: this.metrics.length,
      successRate: this.metrics.length > 0 ? successful / this.metrics.length : 1,
      byAgentRole,
      byMessageType,
      pendingRequests: this.pendingRequests.size,
      activeSubscriptions: this.subscriptions.size,
      deadLetterQueue,
    };
  }

  // ─── Interne ──────────────────────────────────────────────────────────────

  private async deliver(message: AgentMessage, options: PublishOptions): Promise<void> {
    const startTime = Date.now();
    let success = false;

    try {
      if (message.to === "broadcast") {
        await this.deliverToAll(message);
      } else {
        await this.deliverToAgent(message.to, message);
      }
      success = true;
    } finally {
      this.metrics.push({
        messageId: message.id,
        from: message.from,
        to: message.to,
        type: message.type,
        timestamp: startTime,
        processingMs: Date.now() - startTime,
        success,
      });
      // Garder les métriques sous contrôle
      if (this.metrics.length > 1000) {
        this.metrics.splice(0, 200);
      }
    }
  }

  private async deliverToAgent(
    targetRole: AgentRole,
    message: AgentMessage
  ): Promise<void> {
    const handlers: MessageHandler[] = [];

    for (const sub of this.subscriptions.values()) {
      if (
        sub.agentRole === targetRole &&
        (sub.messageType === "*" || sub.messageType === message.type)
      ) {
        handlers.push(sub.handler);
      }
    }

    if (handlers.length === 0) {
      // ── Dead-letter queue : l'agent n'est pas encore abonné ──────────────
      // On conserve le message et on le re-livrera dès que l'agent s'abonera.
      // Seuls les task_request sont mis en dead-letter (les autres types ne
      // nécessitent pas de garantie de livraison).
      if (message.type === "task_request" || message.type === "collaboration_request") {
        const queue = this.deadLetterQueue.get(targetRole) ?? [];
        const now = Date.now();

        // Expirer les vieux messages avant d'ajouter
        const active = queue.filter((e) => now - e.enqueuedAt < DEAD_LETTER_TTL_MS);
        active.push({ message, enqueuedAt: now, attempts: 0 });
        this.deadLetterQueue.set(targetRole, active);

        log.warn(
          `📭 [${targetRole}] non abonné — message ${message.id.slice(0, 8)} mis en dead-letter queue (${active.length} en attente)`
        );
      } else {
        log.warn(
          `⚠️ Aucun handler pour agent "${targetRole}" type="${message.type}" — message ${message.id.slice(0, 8)} ignoré`
        );
      }
      return;
    }

    await Promise.allSettled(
      handlers.map((h) =>
        h(message).catch((err) =>
          log.error(`Handler [${targetRole}] erreur: ${err.message}`)
        )
      )
    );
  }

  /**
   * Re-livre les messages en dead-letter queue pour un rôle donné.
   * Appelé automatiquement quand un agent s'abonne.
   */
  private async flushDeadLetterQueue(role: AgentRole): Promise<void> {
    const queue = this.deadLetterQueue.get(role);
    if (!queue || queue.length === 0) return;

    const now = Date.now();
    const toDeliver = queue.filter((e) => now - e.enqueuedAt < DEAD_LETTER_TTL_MS);
    this.deadLetterQueue.delete(role);

    if (toDeliver.length === 0) return;

    log.info(
      `📬 [${role}] abonné — re-livraison de ${toDeliver.length} message(s) en dead-letter queue`
    );

    for (const entry of toDeliver) {
      entry.attempts++;
      await this.deliverToAgent(role, entry.message).catch((err) => {
        log.error(`Re-livraison [${role}] erreur: ${err.message}`);
      });
    }
  }

  private async deliverToAll(message: AgentMessage): Promise<void> {
    const handlers: MessageHandler[] = [];
    const seen = new Set<AgentRole>();

    for (const sub of this.subscriptions.values()) {
      // Éviter de diffuser à l'émetteur lui-même
      if (sub.agentRole === message.from) continue;
      // Un seul handler par rôle pour le broadcast
      if (seen.has(sub.agentRole)) continue;

      if (sub.messageType === "*" || sub.messageType === message.type) {
        seen.add(sub.agentRole);
        handlers.push(sub.handler);
      }
    }

    await Promise.allSettled(
      handlers.map((h) =>
        h(message).catch((err) =>
          log.error(`Broadcast handler erreur: ${err.message}`)
        )
      )
    );
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    retry: NonNullable<PublishOptions["retry"]>
  ): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= retry.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (err) {
        lastError = err as Error;
        if (attempt < retry.maxRetries) {
          const delay =
            retry.backoff === "exponential"
              ? Math.min(1000 * Math.pow(2, attempt), 8_000)
              : 500 * (attempt + 1);
          log.warn(
            `🔄 Retry ${attempt + 1}/${retry.maxRetries} dans ${delay}ms — ${lastError.message}`
          );
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    throw lastError!;
  }

  private addToHistory(message: AgentMessage): void {
    this.messageHistory.push(message);
    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory.splice(0, 50);
    }
    // Persister dans Supabase (best-effort, silencieux)
    agentPersistence.saveMessage(message).catch(() => {});
    // Émettre l'événement pour les listeners externes (ex: WebSocket)
    this.emit("message", message);
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const agentMessageBus = new AgentMessageBus();
