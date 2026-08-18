/**
 * NotebookManager — CRUD et gestion des notebooks
 *
 * Gestionnaire central des notebooks : création, suppression, mise à jour,
 * ajout/suppression de sources, gestion des notes.
 */

import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { createLogger } from "../utils/logger";
import { SELF_ROOT } from "../utils/selfRoot";
import { embeddingStore } from "./EmbeddingStore";
import type { Notebook, NotebookNote, Source, ChatMessage, GeneratedDocument, AudioOverview } from "./types";

const log = createLogger("NotebookManager");

// ─── Persistence ─────────────────────────────────────────────────────────────

const DATA_DIR = path.join(
  process.env.JARVIS_CONFIG_PATH || process.env.ELECTRON_APP_PATH || SELF_ROOT || process.cwd(),
  ".jarvis",
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

// ─── Couleurs et icônes par défaut ───────────────────────────────────────────

const COLORS = ["#60a5fa", "#34d399", "#fbbf24", "#a78bfa", "#f87171", "#06b6d4", "#f472b6", "#818cf8"];
const ICONS = ["📓", "📚", "🔬", "💡", "📊", "🎯", "🧪", "📖"];

// ═══════════════════════════════════════════════════════════════════════════════

export class NotebookManager {
  private notebooks: Map<string, Notebook> = new Map();

  constructor() {
    this.loadAll();
  }

  // ─── Chargement / Persistence ────────────────────────────────────────────

  private loadAll(): void {
    ensureDataDir();
    try {
      const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith(".json"));
      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(DATA_DIR, file), "utf-8");
          const notebook = JSON.parse(raw) as Notebook;
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

  private persist(notebook: Notebook): void {
    ensureDataDir();
    const filePath = getNotebookPath(notebook.id);
    fs.writeFileSync(filePath, JSON.stringify(notebook, null, 2), "utf-8");
  }

  private remove(id: string): void {
    const filePath = getNotebookPath(id);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  // ─── CRUD Notebooks ──────────────────────────────────────────────────────

  createNotebook(title: string, description = ""): Notebook {
    const id = randomUUID();
    const colorIndex = this.notebooks.size % COLORS.length;
    const iconIndex = this.notebooks.size % ICONS.length;

    const notebook: Notebook = {
      id,
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
    log.info(`📓 Notebook créé: "${title}" (${id})`);
    return notebook;
  }

  getNotebook(id: string): Notebook | undefined {
    return this.notebooks.get(id);
  }

  getAllNotebooks(): Notebook[] {
    return Array.from(this.notebooks.values())
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
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

    notebook.sources.push(source);
    notebook.updatedAt = new Date().toISOString();
    this.persist(notebook);
    log.info(`📄 Source ajoutée au notebook "${notebook.title}": "${source.title}"`);
    return notebook;
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

  getStats(): {
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

    for (const nb of this.notebooks.values()) {
      totalSources += nb.sources.length;
      totalNotes += nb.notes.length;
      for (const src of nb.sources) {
        totalChunks += src.chunks.length;
        totalWords += src.wordCount;
      }
    }

    return {
      totalNotebooks: this.notebooks.size,
      totalSources,
      totalNotes,
      totalChunks,
      totalWords,
    };
  }
}

// Singleton
export const notebookManager = new NotebookManager();
