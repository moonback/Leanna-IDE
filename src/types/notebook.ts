/**
 * Types centralisés pour le système de Notebooks
 */

// ─── Sources ─────────────────────────────────────────────────────────────────

export interface SourceItem {
  id: string;
  title: string;
  type: SourceType;
  origin: string;
  summary: string;
  keywords: string[];
  wordCount: number;
  language: string;
  addedAt: string;
  chunksCount: number;
  indexingStatus?: 'pending' | 'indexed' | 'partial' | 'failed' | 'unknown';
  indexingAttempts?: number;
  indexingError?: string;
  indexingUpdatedAt?: string;
  indexingNextRetryAt?: string;
  indexingHistory?: Array<{
    attempt: number;
    at: string;
    outcome: 'indexed' | 'partial' | 'failed';
    category: 'none' | 'transient' | 'permanent';
    durationMs: number;
    message?: string;
  }>;
}

export type SourceType = 'pdf' | 'text' | 'markdown' | 'url' | 'html' | 'youtube' | 'audio' | 'docx';

// ─── Chat ────────────────────────────────────────────────────────────────────

export interface Citation {
  sourceId: string;
  sourceTitle: string;
  chunkId: string;
  excerpt: string;
  relevance: number;
  /** Numéro N du marqueur [SOURCE N] dans la réponse (citations récentes uniquement) */
  ref?: number;
  /** Chemin du fichier d'origine (sources codebase/github-repo), si connu. */
  filePath?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  timestamp: string;
}

// ─── Notes ───────────────────────────────────────────────────────────────────

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}

// ─── Generated Documents ─────────────────────────────────────────────────────

export interface GeneratedDoc {
  id: string;
  type: string;
  title: string;
  content: string;
  createdAt: string;
}

// ─── Audio Overviews ─────────────────────────────────────────────────────────

export interface AudioOverview {
  id: string;
  title: string;
  script: string;
  audioUrl?: string;
  duration?: number;
  status: 'pending' | 'generating' | 'ready' | 'error';
  createdAt: string;
}

// ─── Notebook ────────────────────────────────────────────────────────────────

export interface NotebookData {
  id: string;
  title: string;
  description: string;
  sources: SourceItem[];
  notes: NoteItem[];
  generatedDocuments: GeneratedDoc[];
  audioOverviews: AudioOverview[];
  chatHistory: ChatMessage[];
  color: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotebookSummary {
  id: string;
  title: string;
  description: string;
  color: string;
  icon: string;
  sourcesCount: number;
  notesCount: number;
  createdAt: string;
  updatedAt: string;
}
