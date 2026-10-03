/**
 * FileWatcher — Surveillance incrémentale des fichiers projet
 *
 * Surveille les changements de fichiers dans le projet et déclenche
 * une ré-indexation incrémentale (fichier par fichier) plutôt qu'un
 * scan complet. Utilise fs.watch natif avec debounce pour performance.
 *
 * Architecture :
 *   FileWatcher.start()
 *     ├── fs.watch(root, { recursive: true })
 *     ├── debounce(300ms) → accumule les changements
 *     └── ProjectIndexer.scanFile() ou .removeFile() par fichier
 *
 * Avantages vs scanAll() :
 *   - Indexation quasi-instantanée (<50ms par fichier modifié)
 *   - Pas de freeze du serveur sur gros projets
 *   - Graphe toujours à jour sans intervention manuelle
 */

import fs from "fs";
import path from "path";
import { createLogger } from "../utils/logger.js";
import { SELF_ROOT } from "../utils/selfRoot.js";
import { isSandboxActive, getSandboxRoot } from "../utils/sandbox.js";

const log = createLogger("FileWatcher");

// ─── Configuration ──────────────────────────────────────────────────────────

/** Délai de debounce : accumule les changements pendant cette durée */
const DEBOUNCE_MS = 500;

/** Extensions surveillées (même liste que ProjectIndexer) */
const WATCHABLE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".json", ".md", ".css", ".scss", ".html",
]);

/** Dossiers ignorés */
const IGNORED_DIRS = new Set([
  "node_modules", ".git", ".Leanna", "dist", "build", "out",
  "release", "coverage", ".vscode", ".idea", "assets", "public",
]);

/**
 * Fichiers ignorés.
 *
 * Inclut les fichiers ÉCRITS PAR LE PROCESS LUI-MÊME (état de connaissance,
 * mémoire, profil) : sans ça, sauvegarder l'un d'eux déclenche le watcher, qui
 * relance une indexation, qui ré-écrit ces fichiers… → boucle / double scan.
 * C'est la cause de la 2ᵉ passe « Relations extraites » observée après
 * l'écriture de .Leanna-profile.json.
 */
const IGNORED_FILES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
  ".project-knowledge.json", ".project-memory.json",
  ".Leanna-profile.json", ".Leanna-profile.json.tmp",
]);

/** Suffixes ignorés (fichiers temporaires écrits par le process). */
const IGNORED_SUFFIXES = [".tmp", ".swp", ".lock"];
/** Motif des fichiers temporaires d'écriture atomique (ex. .project-memory.json.tmp_1790…). */
const TMP_WRITE_PATTERN = /\.tmp[_.]?\d*$/i;

// ═══════════════════════════════════════════════════════════════════════════════
// FileWatcher
// ═══════════════════════════════════════════════════════════════════════════════

export type FileChangeType = "created" | "modified" | "deleted";

export interface FileChangeEvent {
  relativePath: string;
  type: FileChangeType;
  timestamp: number;
}

export type FileChangeHandler = (events: FileChangeEvent[]) => Promise<void> | void;

export class FileWatcher {
  private watcher: fs.FSWatcher | null = null;
  private pendingChanges: Map<string, FileChangeType> = new Map();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private handlers: Set<FileChangeHandler> = new Set();
  private isRunning: boolean = false;
  /** Racine sur laquelle le watcher tourne actuellement. */
  private currentRoot: string | null = null;
  /** Promesse du batch en cours — garantit qu'un seul batch s'exécute à la fois. */
  private batchInFlight: Promise<void> = Promise.resolve();
  private stats = {
    totalEventsProcessed: 0,
    totalBatchesDispatched: 0,
    lastEventAt: 0,
  };

  /**
   * Retourne la racine du workspace actif.
   */
  private getRoot(): string {
    if (isSandboxActive()) return getSandboxRoot();
    return SELF_ROOT;
  }

  /**
   * Enregistre un handler appelé à chaque batch de changements.
   */
  onChange(handler: FileChangeHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /**
   * Démarre la surveillance des fichiers.
   * Utilise fs.watch en mode récursif (Windows et macOS supporté nativement).
   *
   * Si le watcher tourne déjà sur la même racine, retourne true sans rien faire.
   * Si la racine a changé (sandbox activé/désactivé), redémarre automatiquement.
   */
  start(): boolean {
    const root = this.getRoot();

    // Déjà actif sur la bonne racine — rien à faire
    if (this.isRunning && this.currentRoot === root) {
      log.debug("FileWatcher déjà actif sur la même racine");
      return true;
    }

    // Racine différente (ex. sandbox activé) : arrêter l'ancien watcher
    if (this.isRunning) {
      log.info(`🔄 Racine changée (${this.currentRoot} → ${root}), redémarrage du FileWatcher`);
      this.stop();
    }

    try {
      const watcher = fs.watch(root, { recursive: true }, (eventType, filename) => {
        if (!filename) return;

        // Normaliser le chemin (Windows → forward slashes)
        const relativePath = filename.replace(/\\/g, "/");

        // Filtrer les fichiers non pertinents
        if (!this.shouldWatch(relativePath)) return;

        // Déterminer le type de changement
        const absPath = path.join(root, relativePath);
        let changeType: FileChangeType;

        try {
          if (fs.existsSync(absPath)) {
            // Le fichier existe → modification ou création
            changeType = this.pendingChanges.has(relativePath) ? "modified" : "modified";
            // Détection création : si le fichier n'était pas dans le batch précédent
            // On simplifie : "rename" = création/suppression, "change" = modification
            if (eventType === "rename") {
              changeType = "created";
            }
          } else {
            // Le fichier n'existe plus → suppression
            changeType = "deleted";
          }
        } catch {
          changeType = "modified";
        }

        this.pendingChanges.set(relativePath, changeType);
        this.scheduleBatch();
      });

      // Bug 5 : capturer les erreurs fs.watch (EMFILE, ENOSPC, …) pour éviter
      // un crash non géré du process.
      watcher.on("error", (err: Error) => {
        log.error(`❌ Erreur fs.watch (${root}): ${err.message}`);
        // Arrêter proprement et laisser l'appelant relancer si nécessaire
        this.stop();
      });

      this.watcher = watcher;
      this.isRunning = true;
      this.currentRoot = root;
      log.info(`👁️ FileWatcher démarré sur: ${root}`);
      return true;
    } catch (err) {
      log.error(`❌ Impossible de démarrer le FileWatcher: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Arrête la surveillance.
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingChanges.clear();
    this.isRunning = false;
    this.currentRoot = null;
    log.info("🛑 FileWatcher arrêté");
  }

  /**
   * Retourne si le watcher est actif.
   */
  get running(): boolean {
    return this.isRunning;
  }

  /**
   * Retourne les statistiques du watcher.
   */
  getStats() {
    return { ...this.stats, running: this.isRunning };
  }

  // ─── Logique interne ──────────────────────────────────────────────────────

  /**
   * Vérifie si un fichier doit être surveillé.
   */
  private shouldWatch(relativePath: string): boolean {
    // Vérifier les dossiers ignorés
    const parts = relativePath.split("/");
    for (const part of parts) {
      if (IGNORED_DIRS.has(part)) return false;
    }

    // Vérifier le nom de fichier
    const filename = path.basename(relativePath);
    if (IGNORED_FILES.has(filename)) return false;

    // Fichiers temporaires d'écriture (atomique) : ex. foo.json.tmp_1790…, foo.swp
    if (TMP_WRITE_PATTERN.test(filename)) return false;
    if (IGNORED_SUFFIXES.some((s) => filename.endsWith(s))) return false;

    // Ignorer les fichiers cachés (dont .Leanna-profile.json, .env, etc.)
    // AVANT la vérification d'extension : un état interne écrit par le process
    // ne doit jamais déclencher de ré-indexation, quelle que soit son extension.
    if (filename.startsWith(".")) return false;

    // Vérifier l'extension
    const ext = path.extname(filename).toLowerCase();
    if (!WATCHABLE_EXTENSIONS.has(ext)) return false;

    return true;
  }

  /**
   * Programme l'envoi d'un batch de changements après le debounce.
   */
  private scheduleBatch(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      // Bug 6 : sérialiser les batchs — si un batch est déjà en cours,
      // attendre qu'il finisse avant d'en lancer un nouveau.
      // Ainsi refreshSemanticRelations() ne peut jamais tourner en parallèle.
      this.batchInFlight = this.batchInFlight.then(() => this.dispatchBatch());
    }, DEBOUNCE_MS);
  }

  /**
   * Envoie le batch de changements accumulés aux handlers.
   */
  private async dispatchBatch(): Promise<void> {
    if (this.pendingChanges.size === 0) return;

    const events: FileChangeEvent[] = [];
    const now = Date.now();

    for (const [relativePath, type] of this.pendingChanges) {
      events.push({ relativePath, type, timestamp: now });
    }

    this.pendingChanges.clear();
    this.stats.totalEventsProcessed += events.length;
    this.stats.totalBatchesDispatched++;
    this.stats.lastEventAt = now;

    log.info(`📦 Batch: ${events.length} fichier(s) changé(s) [${events.map(e => `${e.type}:${path.basename(e.relativePath)}`).join(", ")}]`);

    // Notifier tous les handlers
    for (const handler of this.handlers) {
      try {
        await handler(events);
      } catch (err) {
        log.error(`❌ Handler FileWatcher a échoué: ${(err as Error).message}`);
      }
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

/** Instance singleton partagée du FileWatcher */
export const fileWatcher = new FileWatcher();
