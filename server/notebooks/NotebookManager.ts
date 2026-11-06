/**
 * NotebookManager — CRUD et gestion des notebooks
 *
 * Gestionnaire central des notebooks : création, suppression, mise à jour,
 * ajout/suppression de sources, gestion des notes.
 */

import { createHash, randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { createLogger } from "../utils/logger.js";
import { SELF_ROOT } from "../utils/selfRoot.js";
import { embeddingStore } from "./EmbeddingStore.js";
import { chatResponseCache, ragSearchCache } from "./ResponseCache.js";
import type { Notebook, NotebookNote, Source, ChatMessage, GeneratedDocument, AudioOverview } from "./types.js";

const log = createLogger("NotebookManager");

// ─── Persistence ─────────────────────────────────────────────────────────────

const DATA_DIR = path.join(
  process.env.Leanna_CONFIG_PATH || process.env.ELECTRON_APP_PATH || SELF_ROOT || process.cwd(),
  ".Leanna",
  "notebooks"
);

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getNotebookPath(id: string): string {
  return path.join(DATA_DIR, `${id}.json`);
}

const CURRENT_NOTEBOOK_SCHEMA_VERSION = 1;

/**
 * Migre les enregistrements historiques avant de les exposer au reste du
 * système. Les migrations sont monotones : une version inconnue plus récente
 * est refusée plutôt que réécrite avec perte.
 */
function migrateNotebookRecord(value: unknown, fileId: string): Notebook {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Structure JSON invalide.");
  }

  const record = { ...(value as Record<string, unknown>) };
  let version = record.schemaVersion === undefined ? 0 : record.schemaVersion;
  if (!Number.isInteger(version) || typeof version !== "number" || version < 0) {
    throw new Error("Version de schéma invalide.");
  }
  if (version > CURRENT_NOTEBOOK_SCHEMA_VERSION) {
    throw new Error(`Schéma notebook ${version} non pris en charge (maximum ${CURRENT_NOTEBOOK_SCHEMA_VERSION}).`);
  }

  // v0 -> v1 : normaliser les champs optionnels des notebooks historiques.
  if (version < 1) {
    record.description = typeof record.description === "string" ? record.description : "";
    record.sources = Array.isArray(record.sources) ? record.sources : [];
    record.notes = Array.isArray(record.notes) ? record.notes : [];
    record.generatedDocuments = Array.isArray(record.generatedDocuments) ? record.generatedDocuments : [];
    record.audioOverviews = Array.isArray(record.audioOverviews) ? record.audioOverviews : [];
    record.chatHistory = Array.isArray(record.chatHistory) ? record.chatHistory : [];
    record.chatThreads = Array.isArray(record.chatThreads) ? record.chatThreads : [];
    record.color = typeof record.color === "string" ? record.color : COLORS[0];
    record.icon = typeof record.icon === "string" ? record.icon : ICONS[0];
    record.schemaVersion = 1;
    version = 1;
  }

  if (version !== CURRENT_NOTEBOOK_SCHEMA_VERSION
    || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(fileId)
    || record.id !== fileId
    || typeof record.title !== "string"
    || typeof record.description !== "string"
    || !Array.isArray(record.sources)
    || !Array.isArray(record.notes)
    || !Array.isArray(record.generatedDocuments)
    || !Array.isArray(record.audioOverviews)
    || !Array.isArray(record.chatHistory)
    || typeof record.createdAt !== "string"
    || typeof record.updatedAt !== "string"
    || (record.workspaceId !== undefined && typeof record.workspaceId !== "string")) {
    throw new Error("Schéma notebook invalide ou identifiant incohérent.");
  }

  return record as unknown as Notebook;
}

// ─── Couleurs et icônes par défaut ───────────────────────────────────────────

const COLORS = ["#60a5fa", "#34d399", "#fbbf24", "#a78bfa", "#f87171", "#06b6d4", "#f472b6", "#818cf8"];
const ICONS = ["📓", "📚", "🔬", "💡", "📊", "🎯", "🧪", "📖"];

// ─── Constantes de debounce ──────────────────────────────────────────────────

/** Délai de debounce pour les écritures de notebooks (ms) — même valeur que EmbeddingStore */
const PERSIST_DEBOUNCE_MS = 1500;

// ═══════════════════════════════════════════════════════════════════════════════

export class NotebookManager {
  private notebooks: Map<string, Notebook> = new Map();
  /** Timers de debounce pour la persistence asynchrone */
  private persistTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.loadAll();
    void this.recoverPendingSourceIndexes();
  }

  // ─── Chargement / Persistence ────────────────────────────────────────────

  private loadAll(): void {
    ensureDataDir();
    try {
      const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith(".json"));
      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(DATA_DIR, file), "utf-8");
          const notebook = migrateNotebookRecord(JSON.parse(raw), file.slice(0, -".json".length));
          this.notebooks.set(notebook.id, notebook);
        } catch (e: any) {
          log.warn(`Erreur chargement notebook ${file}: ${e.message}`);
        }
      }
      log.info(`✅ ${this.notebooks.size} notebook(s) chargé(s)`);
    } catch (e: any) {
      log.warn(`Impossible de charger les notebooks: ${e.message}`);
    }
  }

  /** 
   * Planifie l'écriture asynchrone et débouncée d'un notebook sur disque.
   * Pattern identique à EmbeddingStore pour éviter de bloquer l'event loop.
   */
  private persist(notebook: Notebook): void {
    // Annuler le timer précédent s'il existe
    const existing = this.persistTimers.get(notebook.id);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.persistTimers.delete(notebook.id);
      this.flushNotebook(notebook);
    }, PERSIST_DEBOUNCE_MS);

    this.persistTimers.set(notebook.id, timer);
  }

  /**
   * Écriture atomique : le fichier temporaire est entièrement écrit avant le
   * rename. Un arrêt ou une erreur pendant l'écriture ne laisse pas un JSON tronqué.
   */
  private flushNotebook(notebook: Notebook): boolean {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(notebook.id)) {
      log.warn("Persistence refusée : identifiant de notebook invalide.");
      return false;
    }
    ensureDataDir();
    const filePath = getNotebookPath(notebook.id);
    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    try {
      notebook.schemaVersion = CURRENT_NOTEBOOK_SCHEMA_VERSION;
      fs.writeFileSync(tempPath, JSON.stringify(notebook, null, 2), "utf-8");
      fs.renameSync(tempPath, filePath);
      log.debug(`💾 Notebook "${notebook.title}" (${notebook.id.slice(0, 8)}) persisté atomiquement`);
      return true;
    } catch (err: any) {
      try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch { /* best effort */ }
      log.warn(`Erreur persistence notebook ${notebook.id.slice(0, 8)}: ${err.message}`);
      return false;
    }
  }

  /** Public persist — save a notebook to disk (used by routes for direct mutations) */
  persistNotebook(notebookId: string): void {
    const notebook = this.notebooks.get(notebookId);
    if (notebook) this.persist(notebook);
  }

  /** 
   * Force l'écriture immédiate de tous les notebooks en attente.
   * À appeler avant la fermeture de l'application.
   */
  flushAll(): void {
    for (const [notebookId, timer] of this.persistTimers) {
      clearTimeout(timer);
      this.persistTimers.delete(notebookId);
      const notebook = this.notebooks.get(notebookId);
      if (notebook) this.flushNotebook(notebook);
    }
  }

  private remove(id: string): void {
    // Annuler le flush en attente avant de supprimer
    const timer = this.persistTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.persistTimers.delete(id);
    }

    const filePath = getNotebookPath(id);
    if (fs.existsSync(filePath)) {
      fs.unlink(filePath, (err) => {
        if (err) log.warn(`Erreur suppression notebook ${id.slice(0, 8)}: ${err.message}`);
      });
    }
  }

  // ─── CRUD Notebooks ──────────────────────────────────────────────────────

  createNotebook(title: string, description = "", workspaceId?: string): Notebook {
    const id = randomUUID();
    const colorIndex = this.notebooks.size % COLORS.length;
    const iconIndex = this.notebooks.size % ICONS.length;

    const notebook: Notebook = {
      id,
      schemaVersion: CURRENT_NOTEBOOK_SCHEMA_VERSION,
      ...(workspaceId ? { workspaceId } : {}),
      title,
      description,
      sources: [],
      notes: [],
      generatedDocuments: [],
      audioOverviews: [],
      chatHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      color: COLORS[colorIndex],
      icon: ICONS[iconIndex],
    };

    this.notebooks.set(id, notebook);
    this.persist(notebook);
    log.info(`📓 Notebook créé: "${title}" (${id})${workspaceId ? ` [workspace: ${workspaceId}]` : ""}`);
    return notebook;
  }

  getNotebook(id: string, workspaceId?: string): Notebook | undefined {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) return undefined;
    const notebook = this.notebooks.get(id);
    if (!notebook) return undefined;
    // Lorsqu'un workspace est fourni, aucun notebook d'un autre workspace
    // (ni notebook historique sans workspace) ne doit être exposé.
    if (workspaceId !== undefined && notebook.workspaceId !== workspaceId) return undefined;
    return notebook;
  }

  getAllNotebooks(workspaceId?: string): Notebook[] {
    const all = Array.from(this.notebooks.values())
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    if (!workspaceId) return all;

    // Retourne uniquement les notebooks de ce workspace.
    // Les notebooks sans workspaceId (créés avant la migration) sont exclus
    // une fois qu'un workspaceId est disponible, pour éviter de polluer tous les workspaces.
    return all.filter(nb => nb.workspaceId === workspaceId);
  }

  updateNotebook(id: string, updates: Partial<Pick<Notebook, "title" | "description" | "color" | "icon">>): Notebook | undefined {
    const notebook = this.notebooks.get(id);
    if (!notebook) return undefined;

    if (updates.title !== undefined) notebook.title = updates.title;
    if (updates.description !== undefined) notebook.description = updates.description;
    if (updates.color !== undefined) notebook.color = updates.color;
    if (updates.icon !== undefined) notebook.icon = updates.icon;
    notebook.updatedAt = new Date().toISOString();

    this.persist(notebook);
    return notebook;
  }

  deleteNotebook(id: string): boolean {
    const notebook = this.notebooks.get(id);
    if (!notebook) return false;

    this.notebooks.delete(id);
    this.remove(id);

    // Nettoyer tous les embeddings du notebook
    embeddingStore.removeNotebook(id);

    log.info(`🗑️ Notebook supprimé: "${notebook.title}" (${id})`);
    return true;
  }

  // ─── Gestion des Sources ─────────────────────────────────────────────────

  addSource(notebookId: string, source: Source): Notebook | undefined {
    const notebook = this.notebooks.get(notebookId);
    if (!notebook) return undefined;

    const contentHash = createHash("sha256").update(source.rawText || "", "utf-8").digest("hex");
    source.contentHash = contentHash;
    const normalizeOrigin = (origin: string) => origin.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    const normalizedOrigin = normalizeOrigin(source.origin);
    const sameOrigin = notebook.sources.find(existing =>
      existing.type === source.type && normalizeOrigin(existing.origin) === normalizedOrigin
    );

    if (sameOrigin) {
      const existingHash = sameOrigin.contentHash
        || createHash("sha256").update(sameOrigin.rawText || "", "utf-8").digest("hex");

      if (existingHash === contentHash) {
        if (!sameOrigin.contentHash) {
          sameOrigin.contentHash = contentHash;
          notebook.updatedAt = new Date().toISOString();
          if (!this.flushNotebook(notebook)) {
            delete sameOrigin.contentHash;
            throw new Error("Impossible de persister l'empreinte de la source existante.");
          }
        }
        Object.assign(source, sameOrigin);
        if (sameOrigin.indexingStatus !== "indexed") {
          void this.indexSourceChunks(notebookId, sameOrigin.id);
        }
        log.info(`⏭️ Source identique, import ignoré: "${sameOrigin.title}" (${sameOrigin.id})`);
        void embeddingStore.indexChunks(
          sameOrigin.chunks.map(chunk => ({ id: chunk.id, content: chunk.content })),
          sameOrigin.id,
          notebookId
        ).catch(error => log.warn(`Réindexation de la source existante impossible: ${error.message}`));
        return notebook;
      }

      // Préparer une nouvelle version sans modifier l'objet canonique avant
      // que le nouveau document puisse être publié durablement.
      const previous = { ...sameOrigin };
      const replacementSource: Source = {
        ...source,
        id: sameOrigin.id,
        notebookId,
        addedAt: sameOrigin.addedAt,
        indexingStatus: "pending",
        indexingError: undefined,
        indexingUpdatedAt: new Date().toISOString(),
        chunks: source.chunks.map(chunk => ({
          ...chunk,
          id: randomUUID(),
          sourceId: sameOrigin.id,
        })),
      };

      Object.assign(sameOrigin, replacementSource);
      notebook.updatedAt = new Date().toISOString();
      const pendingTimer = this.persistTimers.get(notebookId);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        this.persistTimers.delete(notebookId);
      }

      if (!this.flushNotebook(notebook)) {
        Object.assign(sameOrigin, previous);
        throw new Error("Le remplacement n'a pas pu être enregistré durablement ; l'ancienne source est conservée.");
      }

      // La nouvelle version est durable. Invalider maintenant les vecteurs
      // de l'ancienne version ; les indexations en vol sont clôturées par
      // le compteur de génération de l'EmbeddingStore.
      Object.assign(source, sameOrigin);
      embeddingStore.removeSource(sameOrigin.id, notebookId);
      void this.indexSourceChunks(notebookId, sameOrigin.id);

      chatResponseCache.invalidateNotebook(notebookId);
      ragSearchCache.invalidateNotebook(notebookId);
      log.info(`🔄 Source mise à jour à origine constante: "${sameOrigin.title}" (${sameOrigin.id})`);
      return notebook;
    }

    source.indexingStatus = "pending";
    source.indexingError = undefined;
    source.indexingUpdatedAt = new Date().toISOString();
    notebook.sources.push(source);
    notebook.updatedAt = new Date().toISOString();

    const pendingTimer = this.persistTimers.get(notebookId);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      this.persistTimers.delete(notebookId);
    }
    if (!this.flushNotebook(notebook)) {
      notebook.sources.pop();
      throw new Error("La source n'a pas pu être enregistrée durablement ; indexation annulée.");
    }

    void this.indexSourceChunks(notebookId, source.id);

    chatResponseCache.invalidateNotebook(notebookId);
    ragSearchCache.invalidateNotebook(notebookId);
    log.info(`📄 Source ajoutée au notebook "${notebook.title}": "${source.title}"`);
    return notebook;
  }


  /**
   * Indexe une source et persiste son état. Une opération interrompue reste
   * marquée pending ; elle pourra être reprise au prochain démarrage.
   */
  private async indexSourceChunks(notebookId: string, sourceId: string): Promise<void> {
    const notebook = this.notebooks.get(notebookId);
    const source = notebook?.sources.find(item => item.id === sourceId);
    if (!notebook || !source) return;

    source.indexingStatus = "pending";
    source.indexingError = undefined;
    source.indexingUpdatedAt = new Date().toISOString();
    if (!this.flushNotebook(notebook)) {
      log.warn(`Impossible de persister l'état pending de l'indexation source ${sourceId}`);
      return;
    }

    try {
      // Nettoyer les IDs de chunks d'une éventuelle version précédente avant
      // de recalculer. Cela ferme aussi la fenêtre de crash après publication
      // de la nouvelle source mais avant le nettoyage des anciens vecteurs.
      embeddingStore.removeSource(source.id, notebookId);
      const indexed = await embeddingStore.indexChunks(
        source.chunks.map(chunk => ({ id: chunk.id, content: chunk.content })),
        source.id,
        notebookId
      );
      source.indexingStatus = indexed >= source.chunks.length ? "indexed" : "partial";
      source.indexingError = indexed >= source.chunks.length
        ? undefined
        : `${source.chunks.length - indexed} chunk(s) sans embedding après indexation.`;
      source.indexingUpdatedAt = new Date().toISOString();
      this.flushNotebook(notebook);
      if (source.indexingStatus !== "indexed") {
        log.warn(`Indexation partielle de la source ${sourceId}: ${source.indexingError}`);
      }
    } catch (error: any) {
      source.indexingStatus = "failed";
      source.indexingError = String(error?.message || error).slice(0, 500);
      source.indexingUpdatedAt = new Date().toISOString();
      this.flushNotebook(notebook);
      log.warn(`Indexation échouée pour source ${sourceId}: ${source.indexingError}`);
    }
  }

  /** Reprend au démarrage uniquement les sources explicitement non indexées. */
  private async recoverPendingSourceIndexes(): Promise<void> {
    for (const notebook of this.notebooks.values()) {
      for (const source of notebook.sources) {
        if (source.indexingStatus === "pending" || source.indexingStatus === "failed" || source.indexingStatus === "partial") {
          log.info(`♻️ Reprise de l'indexation source ${source.id} (${source.indexingStatus})`);
          await this.indexSourceChunks(notebook.id, source.id);
        }
      }
    }
  }

  removeSource(notebookId: string, sourceId: string): boolean {
    const notebook = this.notebooks.get(notebookId);
    if (!notebook) return false;

    const index = notebook.sources.findIndex(s => s.id === sourceId);
    if (index === -1) return false;

    notebook.sources.splice(index, 1);
    notebook.updatedAt = new Date().toISOString();
    this.persist(notebook);

    // Nettoyer les embeddings associés
    embeddingStore.removeSource(sourceId, notebookId);

    // Invalider les caches chat/RAG — le corpus de sources a changé.
    chatResponseCache.invalidateNotebook(notebookId);
    ragSearchCache.invalidateNotebook(notebookId);

    return true;
  }

  getSource(notebookId: string, sourceId: string): Source | undefined {
    const notebook = this.notebooks.get(notebookId);
    if (!notebook) return undefined;
    return notebook.sources.find(s => s.id === sourceId);
  }

  // ─── Notes ───────────────────────────────────────────────────────────────

  addNote(notebookId: string, title: string, content = ""): NotebookNote | undefined {
    const notebook = this.notebooks.get(notebookId);
    if (!notebook) return undefined;

    const note: NotebookNote = {
      id: randomUUID(),
      notebookId,
      title,
      content,
      sourceReferences: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pinned: false,
    };

    notebook.notes.push(note);
    notebook.updatedAt = new Date().toISOString();
    this.persist(notebook);
    return note;
  }

  updateNote(notebookId: string, noteId: string, updates: Partial<Pick<NotebookNote, "title" | "content" | "pinned">>): NotebookNote | undefined {
    const notebook = this.notebooks.get(notebookId);
    if (!notebook) return undefined;

    const note = notebook.notes.find(n => n.id === noteId);
    if (!note) return undefined;

    if (updates.title !== undefined) note.title = updates.title;
    if (updates.content !== undefined) note.content = updates.content;
    if (updates.pinned !== undefined) note.pinned = updates.pinned;
    note.updatedAt = new Date().toISOString();
    notebook.updatedAt = new Date().toISOString();

    this.persist(notebook);
    return note;
  }

  deleteNote(notebookId: string, noteId: string): boolean {
    const notebook = this.notebooks.get(notebookId);
    if (!notebook) return false;

    const index = notebook.notes.findIndex(n => n.id === noteId);
    if (index === -1) return false;

    notebook.notes.splice(index, 1);
    notebook.updatedAt = new Date().toISOString();
    this.persist(notebook);
    return true;
  }

  // ─── Chat History ────────────────────────────────────────────────────────

  addChatMessage(notebookId: string, message: ChatMessage): void {
    const notebook = this.notebooks.get(notebookId);
    if (!notebook) return;

    notebook.chatHistory.push(message);
    notebook.updatedAt = new Date().toISOString();

    // Limiter l'historique à 200 messages
    if (notebook.chatHistory.length > 200) {
      notebook.chatHistory = notebook.chatHistory.slice(-200);
    }

    this.persist(notebook);
  }

  clearChatHistory(notebookId: string): void {
    const notebook = this.notebooks.get(notebookId);
    if (!notebook) return;

    notebook.chatHistory = [];
    notebook.updatedAt = new Date().toISOString();
    this.persist(notebook);
  }

  /**
   * Retourne les messages d'un thread de conversation (vide si introuvable).
   * Permet au chat groundé de construire un contexte ISOLÉ par thread plutôt
   * que de mélanger tous les threads via l'historique global.
   */
  getThreadMessages(notebookId: string, threadId: string): ChatMessage[] {
    const notebook = this.notebooks.get(notebookId);
    if (!notebook?.chatThreads) return [];
    const thread = notebook.chatThreads.find(t => t.id === threadId);
    return thread ? thread.messages : [];
  }

  /**
   * Ajoute un message aux messages d'un thread spécifique (sans toucher à
   * l'historique global). Met à jour le titre du thread à partir de la
   * première question. Retourne true si le thread existe.
   */
  addThreadMessage(notebookId: string, threadId: string, message: ChatMessage): boolean {
    const notebook = this.notebooks.get(notebookId);
    if (!notebook?.chatThreads) return false;
    const thread = notebook.chatThreads.find(t => t.id === threadId);
    if (!thread) return false;

    thread.messages.push(message);

    // Titre dérivé de la première question utilisateur du thread.
    if (message.role === "user" && thread.messages.filter(m => m.role === "user").length === 1) {
      const q = message.content.trim();
      thread.title = q.slice(0, 50) + (q.length > 50 ? "..." : "");
    }

    notebook.updatedAt = new Date().toISOString();
    this.persist(notebook);
    return true;
  }

  /**
   * Enregistre le retour utilisateur (pouce haut/bas) sur un message assistant.
   * Cherche le message dans l'historique global ET dans les threads de conversation.
   * Retourne true si un message a été trouvé et mis à jour.
   */
  setMessageFeedback(
    notebookId: string,
    messageId: string,
    feedback: "up" | "down" | null
  ): boolean {
    const notebook = this.notebooks.get(notebookId);
    if (!notebook) return false;

    let target = notebook.chatHistory.find(m => m.id === messageId);

    if (!target && notebook.chatThreads) {
      for (const thread of notebook.chatThreads) {
        target = thread.messages.find(m => m.id === messageId);
        if (target) break;
      }
    }

    if (!target) return false;

    target.feedback = feedback;
    notebook.updatedAt = new Date().toISOString();
    this.persist(notebook);
    return true;
  }

  // ─── Generated Documents ─────────────────────────────────────────────────

  addGeneratedDocument(notebookId: string, doc: GeneratedDocument): void {
    const notebook = this.notebooks.get(notebookId);
    if (!notebook) return;

    notebook.generatedDocuments.push(doc);
    notebook.updatedAt = new Date().toISOString();
    this.persist(notebook);
  }

  deleteGeneratedDocument(notebookId: string, docId: string): boolean {
    const notebook = this.notebooks.get(notebookId);
    if (!notebook) return false;

    const index = notebook.generatedDocuments.findIndex(d => d.id === docId);
    if (index === -1) return false;

    notebook.generatedDocuments.splice(index, 1);
    notebook.updatedAt = new Date().toISOString();
    this.persist(notebook);
    return true;
  }

  // ─── Audio Overviews ─────────────────────────────────────────────────────

  addAudioOverview(notebookId: string, overview: AudioOverview): void {
    const notebook = this.notebooks.get(notebookId);
    if (!notebook) return;

    notebook.audioOverviews.push(overview);
    notebook.updatedAt = new Date().toISOString();
    this.persist(notebook);
  }

  deleteAudioOverview(notebookId: string, overviewId: string): boolean {
    const notebook = this.notebooks.get(notebookId);
    if (!notebook) return false;

    const index = notebook.audioOverviews.findIndex(o => o.id === overviewId);
    if (index === -1) return false;

    notebook.audioOverviews.splice(index, 1);
    notebook.updatedAt = new Date().toISOString();
    this.persist(notebook);
    return true;
  }

  // ─── Stats ───────────────────────────────────────────────────────────────

  getStats(workspaceId?: string): {
    totalNotebooks: number;
    totalSources: number;
    totalNotes: number;
    totalChunks: number;
    totalWords: number;
  } {
    let totalSources = 0;
    let totalNotes = 0;
    let totalChunks = 0;
    let totalWords = 0;

    const scopedNotebooks = Array.from(this.notebooks.values()).filter(
      nb => workspaceId === undefined || nb.workspaceId === workspaceId
    );
    for (const nb of scopedNotebooks) {
      totalSources += nb.sources.length;
      totalNotes += nb.notes.length;
      for (const src of nb.sources) {
        totalChunks += src.chunks.length;
        totalWords += src.wordCount;
      }
    }

    return {
      totalNotebooks: scopedNotebooks.length,
      totalSources,
      totalNotes,
      totalChunks,
      totalWords,
    };
  }
}

// Singleton
export const notebookManager = new NotebookManager();
