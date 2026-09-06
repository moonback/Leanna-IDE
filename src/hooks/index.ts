/**
 * Hooks personnalisés
 * 
 * Hooks pour l'intégration avec les composants backend
 */

export { useEnsureNotebook, useNotebookId } from './useEnsureNotebook.js';

// Hooks pour l'intégration avec les nouveaux composants backend
export * from './useEventBus.js';
export * from './useArtifactManager.js';
export * from './useVerificationManager.js';

// Re-export des hooks existants
export * from './useLiveAPI.js';
export * from './useAgentEventStream.js';

