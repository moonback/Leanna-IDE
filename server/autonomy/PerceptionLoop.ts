/**
 * PerceptionLoop — Boucle de perception continue
 *
 * Connecte les sources d'événements (FileWatcher, EventBus runtime, git, timers)
 * vers un flux unifié de PerceptionEvents.
 *
 * Architecture :
 *   FileWatcher.onChange()        ──┐
 *   RuntimeEventBus.on(*)         ──┤
 *   SchedulerTick (setInterval)   ──┼──→ PerceptionLoop → handlers[]
 *   GitPoller (optionnel)         ──┘
 *
 * Les handlers enregistrés reçoivent chaque PerceptionEvent produit.
 */

import { randomUUID } from "crypto";
import { createLogger } from "../utils/logger.js";
import { fileWatcher } from "../knowledge/FileWatcher.js";
import type { FileChangeEvent } from "../knowledge/FileWatcher.js";
import type { PerceptionEvent, PerceptionEventType } from "./types.js";

const log = createLogger("PerceptionLoop");

// ─── Configuration ────────────────────────────────────────────────────────────

/** Intervalle du tick scheduler (ms) */
const SCHEDULER_TICK_MS = 60_000; // 1 minute

/** Fenêtre de déduplication des événements (ms) */
const DEDUP_WINDOW_MS = 5_000;

// ═══════════════════════════════════════════════════════════════════════════════
// PERCEPTION LOOP
// ═══════════════════════════════════════════════════════════════════════════════

export type PerceptionHandler = (event: PerceptionEvent) => void | Promise<void>;

export class PerceptionLoop {
  private handlers: Set<PerceptionHandler> = new Set();
  private isRunning = false;

  // Nettoyage des abonnements
  private unsubscribeFileWatcher: (() => void) | null = null;
  private unsubscribeRuntimeBus: (() => void) | null = null;
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;

  // Déduplication : fingerprint → timestamp du dernier événement émis
  private recentEventKeys: Map<string, number> = new Map();
  private dedupCleanupTimer: ReturnType<typeof setInterval> | null = null;

  // Stats
  private stats = {
    totalEventsProduced: 0,
    totalEventsDeduplicated: 0,
    startedAt: 0,
  };

  // ─── Cycle de vie ──────────────────────────────────────────────────────────

  /**
   * Démarre la boucle de perception.
   * Idempotent — retourne false si déjà actif.
   */
  start(): boolean {
    if (this.isRunning) {
      log.debug("PerceptionLoop déjà actif");
      return false;
    }

    log.info("👁️ PerceptionLoop démarrage…");
    this.stats.startedAt = Date.now();

    // 1. FileWatcher → événements workspace
    this._connectFileWatcher();

    // 2. Runtime EventBus → événements agents/tasks
    this._connectRuntimeEventBus();

    // 3. Scheduler tick → signal périodique pour décisions cadencées
    this._startSchedulerTick();

    // 4. Nettoyage du cache de déduplication
    this.dedupCleanupTimer = setInterval(() => this._cleanupDedupCache(), 30_000);

    this.isRunning = true;
    log.info("👁️ PerceptionLoop actif");
    return true;
  }

  /**
   * Arrête la boucle de perception.
   */
  stop(): void {
    if (!this.isRunning) return;

    if (this.unsubscribeFileWatcher) {
      this.unsubscribeFileWatcher();
      this.unsubscribeFileWatcher = null;
    }

    if (this.unsubscribeRuntimeBus) {
      this.unsubscribeRuntimeBus();
      this.unsubscribeRuntimeBus = null;
    }

    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }

    if (this.dedupCleanupTimer) {
      clearInterval(this.dedupCleanupTimer);
      this.dedupCleanupTimer = null;
    }

    this.isRunning = false;
    log.info("🛑 PerceptionLoop arrêté");
  }

  get running(): boolean {
    return this.isRunning;
  }

  // ─── Abonnement ────────────────────────────────────────────────────────────

  /**
   * Enregistre un handler appelé à chaque PerceptionEvent.
   * Retourne une fonction de désabonnement.
   */
  onEvent(handler: PerceptionHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  // ─── Émission manuelle (pour tests et intégrations externes) ─────────────

  /**
   * Injecte manuellement un événement dans le flux.
   */
  emit(type: PerceptionEventType, payload?: Record<string, unknown>, files?: string[]): void {
    const event: PerceptionEvent = {
      id: randomUUID(),
      type,
      timestamp: Date.now(),
      files,
      payload,
      source: "manual",
    };
    this._dispatch(event);
  }

  // ─── Statistiques ────────────────────────────────────────────────────────

  getStats() {
    return {
      ...this.stats,
      running: this.isRunning,
      handlers: this.handlers.size,
      dedupCacheSize: this.recentEventKeys.size,
    };
  }

  // ─── Connexion FileWatcher ────────────────────────────────────────────────

  private _connectFileWatcher(): void {
    // Démarrer le FileWatcher s'il n'est pas encore actif
    if (!fileWatcher.running) {
      fileWatcher.start();
    }

    this.unsubscribeFileWatcher = fileWatcher.onChange(
      async (events: FileChangeEvent[]) => {
        // Grouper les événements par type
        const created = events.filter((e) => e.type === "created");
        const modified = events.filter((e) => e.type === "modified");
        const deleted = events.filter((e) => e.type === "deleted");

        // Émettre un événement de batch si plusieurs fichiers changent ensemble
        if (events.length > 1) {
          this._dispatch(this._makeEvent("workspace.batch_changed", {
            createdCount: created.length,
            modifiedCount: modified.length,
            deletedCount: deleted.length,
          }, events.map((e) => e.relativePath)));
        } else if (events.length === 1) {
          // Événement individuel
          const e = events[0];
          const type: PerceptionEventType =
            e.type === "created"
              ? "workspace.file_created"
              : e.type === "deleted"
              ? "workspace.file_deleted"
              : "workspace.file_changed";

          this._dispatch(this._makeEvent(type, { changeType: e.type }, [e.relativePath]));
        }

        // Détecter les changements de dépendances
        const hasPkgChange = events.some(
          (e) => e.relativePath.includes("package.json") && !e.relativePath.includes("node_modules")
        );
        if (hasPkgChange) {
          this._dispatch(this._makeEvent("dependency.changed", {
            files: events.filter((e) => e.relativePath.includes("package.json")).map((e) => e.relativePath),
          }));
        }
      }
    );
  }

  // ─── Connexion Runtime EventBus ──────────────────────────────────────────

  private _connectRuntimeEventBus(): void {
    // S'abonner aux broadcasts du bus d'agents (AgentMessageBus)
    import("../agents/AgentMessageBus.js")
      .then((module) => {
        if (!module?.agentMessageBus) return;
        const bus = module.agentMessageBus;

        bus.on("message", (msg: any) => {
          this._handleAgentMessage(msg);
        });

        log.debug("PerceptionLoop connecté à AgentMessageBus");
      })
      .catch((err) => {
        log.warn(`Impossible de se connecter à AgentMessageBus: ${err.message}`);
      });
  }

  private _handleAgentMessage(msg: any): void {
    if (!msg?.type) return;

    switch (msg.type) {
      case "task_completed":
        this._dispatch(this._makeEvent("mission.completed", {
          taskId: msg.id,
          role: msg.from,
          success: true,
        }));
        break;

      case "task_failed":
        this._dispatch(this._makeEvent("mission.failed", {
          taskId: msg.id,
          role: msg.from,
          error: msg.payload?.error,
        }));
        break;

      default:
        break;
    }
  }

  // ─── Tick scheduler ──────────────────────────────────────────────────────

  private _startSchedulerTick(): void {
    this.schedulerTimer = setInterval(() => {
      this._dispatch(this._makeEvent("scheduler.tick", {
        timestamp: Date.now(),
        interval: SCHEDULER_TICK_MS,
      }));
    }, SCHEDULER_TICK_MS);

    // Émettre immédiatement un tick au démarrage
    setImmediate(() => {
      this._dispatch(this._makeEvent("scheduler.tick", {
        timestamp: Date.now(),
        initial: true,
      }));
    });
  }

  // ─── Dispatch ────────────────────────────────────────────────────────────

  private _dispatch(event: PerceptionEvent): void {
    // Déduplication : ignorer les événements trop récents du même type+fichiers
    const key = this._eventKey(event);
    const lastSeen = this.recentEventKeys.get(key);
    const now = Date.now();

    if (lastSeen && now - lastSeen < DEDUP_WINDOW_MS) {
      this.stats.totalEventsDeduplicated++;
      return;
    }

    this.recentEventKeys.set(key, now);
    this.stats.totalEventsProduced++;

    log.debug(`📡 Event: ${event.type} (files: ${event.files?.length ?? 0})`);

    // Notifier les handlers
    for (const handler of this.handlers) {
      try {
        const result = handler(event);
        if (result instanceof Promise) {
          result.catch((err) => {
            log.error(`Handler PerceptionLoop a échoué: ${err.message}`);
          });
        }
      } catch (err) {
        log.error(`Handler PerceptionLoop synchrone a échoué: ${(err as Error).message}`);
      }
    }
  }

  private _makeEvent(
    type: PerceptionEventType,
    payload?: Record<string, unknown>,
    files?: string[],
    riskScore?: number,
    source?: string
  ): PerceptionEvent {
    return {
      id: randomUUID(),
      type,
      timestamp: Date.now(),
      files,
      payload,
      riskScore,
      source: source ?? "perception_loop",
    };
  }

  private _eventKey(event: PerceptionEvent): string {
    const filesKey = (event.files ?? []).slice(0, 3).sort().join("|");
    return `${event.type}:${filesKey}`;
  }

  private _cleanupDedupCache(): void {
    const cutoff = Date.now() - DEDUP_WINDOW_MS * 2;
    for (const [key, ts] of this.recentEventKeys) {
      if (ts < cutoff) this.recentEventKeys.delete(key);
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

/** Instance singleton partagée de la PerceptionLoop. */
export const perceptionLoop = new PerceptionLoop();
