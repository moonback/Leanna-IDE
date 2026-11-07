/**
 * Types partagés du sous-module Chat (NotebookChat).
 */

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

export interface CitationAudit {
  retrievedChunks: number;
  citedChunks: number;
  citedSources: number;
  explicitReferences: number;
  validReferences: number;
  invalidReferences: number;
  retrievalCoveragePercent: number;
  status: 'valid' | 'partial' | 'invalid' | 'implicit' | 'missing';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  citationAudit?: CitationAudit;
  timestamp: string;
}

export interface SandboxFolder {
  path: string;
  name: string;
  depth: number;
}

export interface QueuedChatRequest {
  id: string;
  question: string;
  sourceIds?: string[];
  personality?: string;
  threadId?: string;
}

export interface ChatThreadSummary {
  id: string;
  title: string;
  createdAt: string;
  messageCount?: number;
  /** Première question posée (tronquée), sert de libellé si le titre est générique */
  preview?: string;
}
