/**
 * ProcessingQueue — File d'attente pour le traitement des sources
 *
 * Implémente un système de queue in-memory avec :
 *   - Concurrence limitée (max N tâches parallèles)
 *   - Retry automatique avec backoff exponentiel
 *   - Priorités (urgent, normal, low)
 *   - Progression en temps réel (callback)
 *   - Annulation de tâches
 *   - Statistiques (temps moyen, erreurs, débit)
 */

import fs from "fs";
import path from "path";
import { createLogger } from "../utils/logger.js";
import { SELF_ROOT } from "../utils/selfRoot.js";

const log = createLogger("ProcessingQueue");

// ─── Types ───────────────────────────────────────────────────────────────────

export type TaskPriority = "urgent" | "normal" | "low";
export type TaskStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";

export interface QueueTask<T = unknown> {
  id: string;
  type: string;
  priority: TaskPriority;
  status: TaskStatus;
  payload: T;
  /** Nombre de tentatives effectuées */
  attempts: number;
  /** Nombre maximum de tentatives */
  maxAttempts: number;
  /** Résultat en cas de succès */
  result?: unknown;
  /** Erreur en cas d'échec */
  error?: string;
  /** Timestamps */
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  /** Progression (0-100) */
  progress: number;
}

export interface QueueConfig {
  /** Nombre maximum de tâches traitées en parallèle */
  concurrency: number;
  /** Nombre maximum de tentatives par tâche */
  maxRetries: number;
  /** Délai initial avant retry (ms) — doublé à chaque tentative */
  retryBaseDelayMs: number;
  /** Taille maximale de la queue */
  maxQueueSize: number;
  /** Fichier de reprise des tâches en attente (payloads JSON-serialisables). */
  persistenceFile?: string;
}

export interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  totalProcessed: number;
  avgProcessingTimeMs: number;
  errorRate: number;
}

type TaskHandler<T> = (task: QueueTask<T>, onProgress: (pct: number) => void) => Promise<unknown>;

// ═══════════════════════════════════════════════════════════════════════════════

export class ProcessingQueue<T = unknown> {
  private queue: QueueTask<T>[] = [];
  private processing: Map<string, QueueTask<T>> = new Map();
  /** Tâches en backoff : elles restent durables et annulables pendant le délai. */
  private retrying: Map<string, QueueTask<T>> = new Map();
  private retryTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private completed: QueueTask<T>[] = [];
  private handler: TaskHandler<T> | null = null;
  private config: QueueConfig;
  private totalProcessed = 0;
  private totalProcessingTime = 0;
  private totalErrors = 0;
  private listeners: Map<string, ((task: QueueTask<T>) => void)[]> = new Map();

  constructor(config?: Partial<QueueConfig>) {
    this.config = {
      concurrency: config?.concurrency ?? 2,
      maxRetries: config?.maxRetries ?? 3,
      retryBaseDelayMs: config?.retryBaseDelayMs ?? 1000,
      maxQueueSize: config?.maxQueueSize ?? 100,
      persistenceFile: config?.persistenceFile,
    };
    this.restorePending();
  }

  // ─── Configuration ─────────────────────────────────────────────────────────

  /** Définit le handler qui traite les tâches */
  setHandler(handler: TaskHandler<T>): void {
    this.handler = handler;
    this.processNext();
  }

  /** Recharge uniquement les tâches en attente. Les tâches en cours au crash
   * ne sont pas rejouées automatiquement : leur effet externe peut être partiel. */
  private restorePending(): void {
    const file = this.config.persistenceFile;
    if (!file || !fs.existsSync(file)) return;
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf-8"));
      if (!parsed || typeof parsed !== "object" || (parsed as any).version !== 1 || !Array.isArray((parsed as any).tasks)) {
        throw new Error("Format de queue invalide.");
      }
      const restored = (parsed as any).tasks.filter((task: any) =>
        task && typeof task.id === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(task.id)
        && typeof task.type === "string"
        && ["urgent", "normal", "low"].includes(task.priority)
        && task.status === "pending" && Number.isInteger(task.attempts)
        && Number.isInteger(task.maxAttempts) && task.maxAttempts > task.attempts
        && typeof task.createdAt === "string" && task.payload !== undefined
      ).slice(0, this.config.maxQueueSize) as QueueTask<T>[];
      this.queue = restored;
      log.info(`♻️ ${restored.length} tâche(s) en attente restaurée(s)`);
    } catch (error: any) {
      log.error(`Impossible de restaurer la queue persistée : ${error.message}`);
    }
  }

  /** Persiste atomiquement la file en attente. */
  private persistPending(): void {
    const file = this.config.persistenceFile;
    if (!file) return;
    const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(temp, JSON.stringify({ version: 1, tasks: [...this.queue, ...this.retrying.values()] }), "utf-8");
      fs.renameSync(temp, file);
    } catch (error: any) {
      try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch { /* best effort */ }
      log.error(`Échec de persistance de la queue : ${error.message}`);
    }
  }

  // ─── Ajout de tâches ───────────────────────────────────────────────────────

  /** Ajoute une tâche dans la queue */
  enqueue(
    id: string,
    type: string,
    payload: T,
    options?: { priority?: TaskPriority; maxAttempts?: number }
  ): QueueTask<T> | null {
    // Vérifier la taille de la queue
    if (this.queue.length + this.retrying.size >= this.config.maxQueueSize) {
      log.warn(`Queue pleine (${this.config.maxQueueSize} tâches). Tâche rejetée: ${id}`);
      return null;
    }

    // Vérifier les doublons
    if (this.queue.some(t => t.id === id) || this.processing.has(id) || this.retrying.has(id)) {
      log.warn(`Tâche déjà en queue/processing: ${id}`);
      return null;
    }

    const task: QueueTask<T> = {
      id,
      type,
      priority: options?.priority ?? "normal",
      status: "pending",
      payload,
      attempts: 0,
      maxAttempts: options?.maxAttempts ?? this.config.maxRetries,
      createdAt: new Date().toISOString(),
      progress: 0,
    };

    // Insérer selon la priorité
    const insertIndex = this.findInsertIndex(task.priority);
    this.queue.splice(insertIndex, 0, task);
    this.persistPending();

    log.info(`📥 Tâche ajoutée: ${type} (${id}) [${task.priority}] — queue: ${this.queue.length}`);

    // Déclencher le processing
    this.processNext();

    return task;
  }

  /** Annule une tâche en attente */
  cancel(taskId: string): boolean {
    const index = this.queue.findIndex(t => t.id === taskId);
    if (index !== -1) {
      const task = this.queue[index];
      task.status = "cancelled";
      task.completedAt = new Date().toISOString();
      this.queue.splice(index, 1);
      this.completed.push(task);
      this.persistPending();
      this.emit(taskId, task);
      log.info(`❌ Tâche annulée: ${taskId}`);
      return true;
    }
    return false;
  }

  // ─── Processing ────────────────────────────────────────────────────────────

  private async processNext(): Promise<void> {
    if (!this.handler) return;
    if (this.processing.size >= this.config.concurrency) return;
    if (this.queue.length === 0) return;

    const task = this.queue.shift()!;
    task.status = "processing";
    task.startedAt = new Date().toISOString();
    task.attempts++;
    this.persistPending();
    this.processing.set(task.id, task);

    this.emit(task.id, task);

    try {
      const result = await this.handler(task, (pct) => {
        task.progress = Math.min(100, Math.max(0, pct));
        this.emit(task.id, task);
      });

      task.status = "completed";
      task.result = result;
      task.progress = 100;
      task.completedAt = new Date().toISOString();

      const duration = Date.now() - new Date(task.startedAt!).getTime();
      this.totalProcessed++;
      this.totalProcessingTime += duration;

      log.info(`✅ Tâche terminée: ${task.type} (${task.id}) — ${duration}ms`);
    } catch (e: any) {
      log.error(`❌ Erreur tâche ${task.id} (tentative ${task.attempts}/${task.maxAttempts}): ${e.message}`);

      if (task.attempts < task.maxAttempts) {
        // Retry avec backoff exponentiel
        task.status = "pending";
        task.progress = 0;
        const delay = this.config.retryBaseDelayMs * Math.pow(2, task.attempts - 1);

        log.info(`🔄 Retry dans ${delay}ms...`);
        setTimeout(() => {
          this.queue.unshift(task); // Remettre en tête
          this.persistPending();
          this.processNext();
        }, delay);
      } else {
        task.status = "failed";
        task.error = e.message;
        task.completedAt = new Date().toISOString();
        this.totalErrors++;
      }
    } finally {
      this.processing.delete(task.id);
      if (task.status === "completed" || task.status === "failed") {
        this.completed.push(task);
        this.trimCompleted();
      }
      this.persistPending();
      this.emit(task.id, task);
    }

    // Traiter la tâche suivante
    this.processNext();
  }

  // ─── Événements ────────────────────────────────────────────────────────────

  /** S'abonner aux mises à jour d'une tâche */
  onUpdate(taskId: string, callback: (task: QueueTask<T>) => void): () => void {
    if (!this.listeners.has(taskId)) {
      this.listeners.set(taskId, []);
    }
    this.listeners.get(taskId)!.push(callback);

    // Retourner une fonction de désabonnement
    return () => {
      const list = this.listeners.get(taskId);
      if (list) {
        const idx = list.indexOf(callback);
        if (idx >= 0) list.splice(idx, 1);
        if (list.length === 0) this.listeners.delete(taskId);
      }
    };
  }

  private emit(taskId: string, task: QueueTask<T>): void {
    const listeners = this.listeners.get(taskId);
    if (listeners) {
      for (const cb of listeners) {
        try {
          cb(task);
        } catch { /* ignore listener errors */ }
      }
    }
  }

  // ─── Requêtes ──────────────────────────────────────────────────────────────

  /** Récupère le statut d'une tâche */
  getTask(taskId: string): QueueTask<T> | undefined {
    return (
      this.queue.find(t => t.id === taskId) ??
      this.processing.get(taskId) ??
      this.completed.find(t => t.id === taskId)
    );
  }

  /** Statistiques globales de la queue */
  getStats(): QueueStats {
    return {
      pending: this.queue.length + this.retrying.size,
      processing: this.processing.size,
      completed: this.completed.filter(t => t.status === "completed").length,
      failed: this.completed.filter(t => t.status === "failed").length,
      cancelled: this.completed.filter(t => t.status === "cancelled").length,
      totalProcessed: this.totalProcessed,
      avgProcessingTimeMs: this.totalProcessed > 0 ? Math.round(this.totalProcessingTime / this.totalProcessed) : 0,
      errorRate: this.totalProcessed > 0 ? this.totalErrors / (this.totalProcessed + this.totalErrors) : 0,
    };
  }

  /** Tâches en cours */
  getProcessing(): QueueTask<T>[] {
    return Array.from(this.processing.values());
  }

  /** Tâches en attente */
  getPending(): QueueTask<T>[] {
    return [...this.queue];
  }

  // ─── Utilitaires ───────────────────────────────────────────────────────────

  private findInsertIndex(priority: TaskPriority): number {
    const priorityOrder: Record<TaskPriority, number> = { urgent: 0, normal: 1, low: 2 };
    const targetPriority = priorityOrder[priority];

    for (let i = 0; i < this.queue.length; i++) {
      if (priorityOrder[this.queue[i].priority] > targetPriority) {
        return i;
      }
    }
    return this.queue.length;
  }

  private trimCompleted(): void {
    // Garder max 200 tâches complétées (mémoire)
    if (this.completed.length > 200) {
      this.completed = this.completed.slice(-200);
    }
  }

  /** Vide la queue (tâches en attente uniquement) */
  clear(): void {
    for (const task of this.queue) {
      task.status = "cancelled";
      task.completedAt = new Date().toISOString();
    }
    this.completed.push(...this.queue);
    this.queue = [];
    this.persistPending();
    this.trimCompleted();
    log.info("🧹 Queue vidée");
  }
}

// ─── Singleton pour le processing des sources ────────────────────────────────

export interface SourceProcessingPayload {
  notebookId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}

const NOTEBOOK_DATA_DIR = path.join(
  process.env.Leanna_CONFIG_PATH || process.env.ELECTRON_APP_PATH || SELF_ROOT || process.cwd(),
  ".Leanna", "notebooks"
);

export const sourceProcessingQueue = new ProcessingQueue<SourceProcessingPayload>({
  persistenceFile: path.join(NOTEBOOK_DATA_DIR, "source-processing-queue.json"),
  concurrency: 2,
  maxRetries: 3,
  retryBaseDelayMs: 2000,
  maxQueueSize: 50,
});
