/**
 * Constantes et types partagés du sous-module Sources.
 * Extraits de SourcePanel pour être réutilisés par le hook useSourceUpload,
 * UploadToolbar, UploadQueue, SourceListFull et SourceListCompact.
 */

export interface SourceItem {
  id: string;
  title: string;
  type: string;
  origin: string;
  summary: string;
  keywords: string[];
  wordCount: number;
  language: string;
  addedAt: string;
  chunksCount: number;
  /** Durable vector-indexing state; absent on legacy sources. */
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

export interface UploadFileStatus {
  name: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

export const TYPE_ICONS: Record<string, string> = {
  pdf: '📕', text: '📄', markdown: '📝', url: '🌐',
  html: '🌍', youtube: '📺', audio: '🎵', docx: '📘', image: '🖼️',
  'github-repo': '💻',
};

export const TYPE_COLORS: Record<string, string> = {
  pdf: 'var(--color-error)', text: 'var(--text-muted)', markdown: 'var(--color-accent-alt)', url: 'var(--notebook-accent)',
  html: 'var(--accent-secondary)', youtube: 'var(--color-error)', audio: 'var(--color-warning)', docx: 'var(--notebook-accent)', image: 'var(--color-success)',
  'github-repo': 'var(--notebook-accent)',
};

export const ACCEPTED_EXTENSIONS = '.pdf,.txt,.md,.html,.docx,.doc,.rtf,.csv,.json,.yaml,.yml,.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg';
