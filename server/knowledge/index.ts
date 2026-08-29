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
export { ProjectIndexer, projectIndexer } from "./ProjectIndexer";
export { KnowledgeGraph, knowledgeGraph } from "./KnowledgeGraph";

// File Watcher — Indexation incrémentale
export { FileWatcher, fileWatcher, type FileChangeEvent, type FileChangeType, type FileChangeHandler } from "./FileWatcher";

// Relation Extractor — Relations sémantiques entre entités
export { RelationExtractor, relationExtractor } from "./RelationExtractor";

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
} from "./types";

// Sprint 2 — DependencyGraph
export { DependencyGraph, dependencyGraph } from "./DependencyGraph";

// Sprint 3 — ProjectMemory
export { ProjectMemory, projectMemory } from "./ProjectMemory";

// Sprint 4 — SemanticSearch
export { SemanticSearch, semanticSearch } from "./SemanticSearch";

// Sprint 5 — ReasoningPipeline
export { ReasoningPipeline, reasoningPipeline } from "./ReasoningPipeline";

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
} from "./ImpactAnalyzer";

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
} from "./PlanningEngine";

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
} from "./UnderstandingEngine";

// Sprint 10 — LearningEngine
export {
  LearningEngine,
  learningEngine,
  type LearningMode,
  type DetectedPattern,
  type AutoImprovement,
  type LearningOptions,
  type MissionLearningInput,
} from "./LearningEngine";

// Sprint 11 — DocumentStore (analyse inter-documents)
export {
  DocumentStore,
  getDocumentStore,
  type StoredDocument,
  type DocumentLink,
  type DocumentStoreData,
} from "./DocumentStore";

// Sprint 12 — DocumentExtractor (extraction automatique des documents du workspace)
export {
  DocumentExtractor,
  documentExtractor,
  type ExtractedDocument,
  type DocumentSection,
  type DocumentMetadata,
  type ExtractionStats,
} from "./DocumentExtractor";

