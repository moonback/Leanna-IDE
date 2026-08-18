/**
 * Notebooks Module — Point d'entrée
 *
 * Concurrent de NotebookLM : collections de sources avec
 * chat grounded, résumés, génération de contenu et audio overview.
 */

export { notebookManager } from "./NotebookManager";
export { sourceIngester } from "./SourceIngester";
export { embeddingStore } from "./EmbeddingStore";
export { ragEngine } from "./RAGEngine";
export { groundedChat } from "./GroundedChat";
export { contentGenerator } from "./ContentGenerator";
export { backupService } from "./BackupService";
export { sourceProcessingQueue } from "./ProcessingQueue";
export { chatResponseCache, ragSearchCache } from "./ResponseCache";
export type * from "./types";
