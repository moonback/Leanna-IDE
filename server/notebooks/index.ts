/**
 * Notebooks Module — Point d'entrée
 *
 * Concurrent de NotebookLM : collections de sources avec
 * chat grounded, résumés, génération de contenu et audio overview.
 */

export { notebookManager } from "./NotebookManager";
export { sourceIngester } from "./SourceIngester";
export { ragEngine } from "./RAGEngine";
export { groundedChat } from "./GroundedChat";
export { contentGenerator } from "./ContentGenerator";
export type * from "./types";
