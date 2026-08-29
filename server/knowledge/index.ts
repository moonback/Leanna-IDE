/**
 * Knowledge System — Compréhension avancée du projet
 *
 * Ce module ajoute à Leanna une capacité de compréhension profonde du projet :
 * - ProjectIndexer : scanne tous les fichiers et extrait les entités de code
 * - KnowledgeGraph : graphe permanent des connaissances du projet (persisté)
 * - DependencyGraph : graphe orienté des dépendances entre fichiers
 * - ProjectMemory : mémoire projet dédiée (architecture, conventions, décisions)
 * - SemanticSearch : recherche sémantique dans le codebase
 *
 * Architecture :
 *   ProjectIndexer → KnowledgeGraph → ProjectKnowledge.json
 *                                      ↓
 *   DependencyGraph ← KnowledgeGraph  ↓
 *   ImpactAnalyzer  ← DependencyGraph ↓
 *   SemanticSearch  ← KnowledgeGraph  ↓
 *   ReasoningPipeline ← SemanticSearch + ProjectMemory
 */

// Sprint 1 — ProjectIndexer + KnowledgeGraph
export { ProjectIndexer, projectIndexer } from "./ProjectIndexer.js";
export { KnowledgeGraph, knowledgeGraph } from "./KnowledgeGraph.js";

// File Watcher — Indexation incrémentale
export { FileWatcher, fileWatcher, type FileChangeEvent, type FileChangeType, type FileChangeHandler } from "./FileWatcher.js";

// Relation Extractor — Relations sémantiques entre entités
export { RelationExtractor, relationExtractor } from "./RelationExtractor.js";

// Types
export type {
  CodeEntity,
  CodeEntityType,
  FileNode,
  KnowledgeGraphState,
  KnowledgeStats,
  DependencyCycle,
  ImpactReport,
  ProjectFact,
  ProjectKnowledgeCategory,
  ProjectContext,
  RelevantFile,
  RelevantSection,
  ContextBatch,
  UnderstandingScore,
  Lesson,
  LearningResult,
  ReasoningResult,
  ReasoningStep,
  StepResult,
  PipelineContext,
  EntityRelation,
  EntityRelationType,
} from "./types.js";

// Sprint 2 — DependencyGraph
export { DependencyGraph, dependencyGraph } from "./DependencyGraph.js";

// Sprint 3 — ProjectMemory
export { ProjectMemory, projectMemory } from "./ProjectMemory.js";

// Sprint 4 — SemanticSearch
export { SemanticSearch, semanticSearch } from "./SemanticSearch.js";

// Sprint 5 — ReasoningPipeline
export { ReasoningPipeline, reasoningPipeline } from "./ReasoningPipeline.js";

// Sprint 7 — ImpactAnalyzer
export {
  ImpactAnalyzer,
  impactAnalyzer,
  type ImpactMode,
  type RiskLevel,
  type ImpactedFile,
  type TestRecommendation,
  type ExtendedImpactReport,
  type ImpactAnalysisOptions,
} from "./ImpactAnalyzer.js";

// Sprint 8 — PlanningEngine
export {
  PlanningEngine,
  planningEngine,
  type PlanningStrategy,
  type PlanningRiskMode,
  type PlanningStep,
  type ParallelWave,
  type StructuredPlan,
  type PlanningOptions,
} from "./PlanningEngine.js";

// Sprint 9 — UnderstandingEngine
export {
  UnderstandingEngine,
  understandingEngine,
  type ContextStrategy,
  type ContextDetailLevel,
  type MissingAction,
  type ContextualRecommendation,
  type KnowledgeHealth,
  type UnderstandingContext,
  type BuildContextOptions,
} from "./UnderstandingEngine.js";

// Sprint 10 — LearningEngine
export {
  LearningEngine,
  learningEngine,
  type LearningMode,
  type DetectedPattern,
  type AutoImprovement,
  type LearningOptions,
  type MissionLearningInput,
} from "./LearningEngine.js";

// Sprint 11 — DocumentStore (analyse inter-documents)
export {
  DocumentStore,
  getDocumentStore,
  type StoredDocument,
  type DocumentLink,
  type DocumentStoreData,
} from "./DocumentStore.js";

// Sprint 12 — DocumentExtractor (extraction automatique des documents du workspace)
export {
  DocumentExtractor,
  documentExtractor,
  type ExtractedDocument,
  type DocumentSection,
  type DocumentMetadata,
  type ExtractionStats,
} from "./DocumentExtractor.js";

