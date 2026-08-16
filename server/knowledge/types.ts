/**
 * Types du Knowledge System — Compréhension avancée du projet
 *
 * Définit les structures de données pour :
 * - ProjectIndexer : scan des fichiers et extraction d'entités (code et documents)
 * - KnowledgeGraph : graphe permanent des connaissances du projet
 * - ProjectMemory : mémoire projet persistante
 * - SemanticSearch : recherche sémantique dans les documents du projet
 */

import { z } from "zod";

// ═══════════════════════════════════════════════════════════════════════════════
// Types ProjectIndexer
// ═══════════════════════════════════════════════════════════════════════════════

/** Types d'entités que l'indexeur extrait des documents */
export type CodeEntityType =
  | "section"         // Titre de section Markdown (H1-H6)
  | "summary"         // Paragraphe introductif / résumé d'une section
  | "todo"            // Tâche à faire (checkbox Markdown - [ ] / - [x])
  | "frontmatter"     // Métadonnée YAML en en-tête (titre, auteur, date, tags)
  | "code_block"      // Bloc de code dans un document (```lang ... ```)
  | "alert"           // Bloc d'alerte (> [!NOTE], > [!WARNING], > [!TIP]...)
  | "doc_link"        // Lien vers un autre document ([texte](./doc.md))
  | "export"          // Élément exporté
  | "import";         // Élément ou lien importé

/** Une entité de code extraite d'un fichier */
export interface CodeEntity {
  /** Nom de l'entité */
  name: string;
  /** Type d'entité */
  type: CodeEntityType;
  /** Chemin du fichier (relatif à la racine du projet) */
  filePath: string;
  /** Ligne de début (1-based) */
  lineStart: number;
  /** Ligne de fin (1-based, optionnel) */
  lineEnd?: number;
  /** Signature complète (premiers 200 chars) */
  signature?: string;
  /** Modificateurs : 'export', 'default', 'async', 'abstract', etc. */
  modifiers?: string[];
  /** Description JSDoc si trouvée */
  description?: string;
  /** Dépendances : imports externes ou chemins de fichiers */
  dependencies?: string[];
  /** Métadonnées supplémentaires (HTTP method, table name, env var value, etc.) */
  metadata?: Record<string, any>;
}

/** Un fichier indexé dans le projet */
export interface FileNode {
  /** Chemin relatif depuis la racine du projet */
  path: string;
  /** Nom du fichier */
  name: string;
  /** Extension */
  extension: string;
  /** Taille en octets */
  size: number;
  /** Nombre de lignes */
  lines: number;
  /** Date de dernière modification */
  lastModified: string;
  /** Entités contenues dans ce fichier (code ou documentaires) */
  entities: CodeEntity[];
  /** Imports / liens sortants du fichier */
  imports: string[];
  /** Exports / sections exportées du fichier */
  exports: string[];
  /** Langage détecté */
  language:
    | "typescript" | "javascript"
    | "json"
    | "markdown" | "mdx"
    | "plaintext"
    | "yaml"
    | "csv"
    | "rst"
    | "css" | "html"
    | "other";
}

// ═══════════════════════════════════════════════════════════════════════════════
// Types KnowledgeGraph
// ═══════════════════════════════════════════════════════════════════════════════

/** Types de relations sémantiques entre entités documentaires */
export type EntityRelationType =
  | "references"    // Document A mentionne ou cite le document B
  | "includes"      // Document A inclut le document B (![[note]] ou embed)
  | "mentions"      // Document A mentionne le titre d'un autre document
  | "depends_on";   // Lien ou dépendance documentaire directe

/** Une relation sémantique entre deux entités du graphe */
export interface EntityRelation {
  /** Entité source (qui hérite, utilise, teste...) */
  source: {
    name: string;
    filePath: string;
    type: CodeEntityType;
  };
  /** Entité cible (qui est héritée, utilisée, testée...) */
  target: {
    name: string;
    filePath: string;
    type: CodeEntityType;
  };
  /** Type de relation */
  relationType: EntityRelationType;
  /** Confiance dans cette relation (0-1) */
  confidence: number;
  /** Ligne dans le fichier source où la relation est déclarée */
  sourceLine?: number;
}

/** État global du KnowledgeGraph */
export interface KnowledgeGraphState {
  /** Racine du projet */
  projectRoot: string;
  /** Tous les fichiers indexés, indexés par chemin relatif */
  files: Record<string, FileNode>;
  /** Index des entités : nom → liste d'entités (une même classe peut être définie et importée) */
  entities: Record<string, CodeEntity[]>;
  /** Dépendances entre fichiers : fichier → [fichiers dont il dépend] */
  dependencies: Record<string, string[]>;
  /** Dépendances inverses : fichier → [fichiers qui en dépendent] */
  dependents: Record<string, string[]>;
  /** Relations sémantiques entre entités */
  relations: EntityRelation[];
  /** Date du dernier indexage */
  lastIndexed: string;
  /** Statistiques */
  stats: KnowledgeStats;
}

/** Statistiques du KnowledgeGraph */
export interface KnowledgeStats {
  totalFiles: number;
  totalLines: number;
  totalEntities: number;
  totalExports: number;
  totalImports: number;
  averageFileSize: number;
  filesByExtension: Record<string, number>;
  entitiesByType: Record<string, number>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Types DependencyGraph
// ═══════════════════════════════════════════════════════════════════════════════

/** Un cycle de dépendance détecté */
export interface DependencyCycle {
  /** Les fichiers impliqués dans le cycle (ordre du cycle) */
  files: string[];
  /** Taille du cycle */
  length: number;
}

/** Rapport d'impact d'une modification */
export interface ImpactReport {
  /** Fichier modifié */
  filePath: string;
  /** Fichiers directement impactés (dépendants directs) */
  directImpacts: string[];
  /** Fichiers indirectement impactés (dépendants des dépendants) */
  indirectImpacts: string[];
  /** Score de risque (0-100) */
  riskScore: number;
  /** Nombre total de fichiers impactés */
  totalImpacted: number;
  /** Cycles potentiellement cassés */
  affectedCycles: DependencyCycle[];
  /** Modules critiques impactés */
  criticalModulesAffected: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Types ProjectMemory
// ═══════════════════════════════════════════════════════════════════════════════

/** Catégories de connaissances projet */
export type ProjectKnowledgeCategory =
  // ── Catégories générales ─────────────────────────────────────────────────
  | "architecture"
  | "convention"
  | "pattern"
  | "decision"
  | "known-bug"
  | "api"
  | "module"
  | "workflow"
  | "security"
  | "stack"
  | "refactoring"
  | "todo"
  // ── Catégories documentaires ─────────────────────────────────────────────
  | "document"       // Document ou fichier texte du projet
  | "style-guide"    // Guide de style rédactionnel
  | "glossary"       // Définition de termes / glossaire
  | "template"       // Modèle de document réutilisable
  | "editorial"      // Décision éditoriale (ton, registre, format)
  | "structure";     // Organisation de la hiérarchie documentaire

/** Un fait de connaissance projet */
export interface ProjectFact {
  id: string;
  content: string;
  category: ProjectKnowledgeCategory;
  tags: string[];
  /** Source : fichier qui a inspiré ce fait */
  sourceFile?: string;
  /** Date de création */
  createdAt: string;
  /** Date de dernière mise à jour */
  updatedAt: string;
  /** Confiance (0-1) */
  confidence: number;
  /** Nombre de fois que ce fait a été utilisé */
  usageCount: number;
  /** Métadonnées contextuelles (agent, tâche, etc.) */
  metadata?: Record<string, any>;
  /**
   * Fait structurel = stable dans le temps (cycles de dépendances, décisions, conventions).
   * Protège ce fait contre l'élagage agressif du GC même s'il est peu utilisé.
   */
  isStructural?: boolean;
}


/** Résultat de contexte pour une tâche */
export interface ProjectContext {
  facts: ProjectFact[];
  architectureSummary: string;
  relevantFiles: string[];
  conventions: string[];
  decisions: string[];
  knownBugs: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Types SemanticSearch
// ═══════════════════════════════════════════════════════════════════════════════

/** Résultat de recherche sémantique */
export interface RelevantFile {
  /** Chemin du fichier */
  filePath: string;
  /** Score de pertinence (0-1) */
  relevance: number;
  /** Raison de la pertinence */
  reason: string;
  /** Sections extraites les plus pertinentes */
  relevantSections: RelevantSection[];
}

/** Section pertinente extraite d'un fichier */
export interface RelevantSection {
  /** Ligne de début */
  lineStart: number;
  /** Ligne de fin */
  lineEnd: number;
  /** Contenu extrait */
  content: string;
  /** Score de pertinence de cette section */
  relevance: number;
}

/** Contexte complet pour le raisonnement */
export interface ContextBatch {
  /** Question originale */
  query: string;
  /** Fichiers pertinents trouvés */
  files: RelevantFile[];
  /** Fait mémoire pertinents */
  facts: ProjectFact[];
  /** Fichier d'entrée principal (si spécifié) */
  primaryFile?: string;
  /** Informations sur la qualité du contexte */
  quality: {
    /** Nombre total de fichiers trouvés */
    totalFiles: number;
    /** Score de confiance moyen */
    averageConfidence: number;
    /** Si assez de contexte a été trouvé */
    sufficient: boolean;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Types ReasoningPipeline
// ═══════════════════════════════════════════════════════════════════════════════

/** Étapes du pipeline de raisonnement */
export type ReasoningStep =
  | "understanding"
  | "search"
  | "context"
  | "reasoning"
  | "self_critique"
  | "final";

/** Résultat d'une étape du pipeline */
export interface StepResult {
  step: ReasoningStep;
  input: string;
  output: string;
  durationMs: number;
  confidence: number;
}

/** Contexte d'exécution du pipeline */
export interface PipelineContext {
  /** Mode de raisonnement */
  mode: "fast" | "balanced" | "deep";
  /** Tâche ou question utilisateur */
  task: string;
  /** Fichiers déjà lus (contexte existant) */
  existingContext: string[];
  /** Actions déjà effectuées */
  history: string[];
}

/** Résultat final du pipeline */
export interface ReasoningResult {
  /** Réponse finale */
  answer: string;
  /** Résultats de chaque étape */
  steps: StepResult[];
  /** Confiance globale */
  confidence: number;
  /** Durée totale */
  totalDurationMs: number;
  /** Suggestions d'actions suivantes */
  suggestions: string[];
  /** Si une vérification est recommandée */
  requiresVerification: boolean;
  /** Métriques tokens */
  tokensUsed: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Types UnderstandingEngine
// ═══════════════════════════════════════════════════════════════════════════════

/** Score de compréhension */
export interface UnderstandingScore {
  /** Score de contexte trouvé (0-100) */
  contextFound: number;
  /** Score de relations entre fichiers (0-100) */
  relations: number;
  /** Score de confiance globale (0-100) */
  confidence: number;
  /** Niveau de risque estimé */
  risk: "low" | "medium" | "high";
  /** Actions manquantes */
  missingActions: string[];
  /** Fichiers non lus qui pourraient être pertinents */
  unreadFiles: string[];
  /** Vérifications recommandées */
  recommendedChecks: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Types LearningEngine
// ═══════════════════════════════════════════════════════════════════════════════

/** Leçon apprise après une mission */
export interface Lesson {
  /** Type de leçon */
  type: "error_pattern" | "success_pattern" | "optimization" | "decision";
  /** Description de la leçon */
  description: string;
  /** Action recommandée pour le futur */
  recommendation: string;
  /** Fichier concerné */
  filePath?: string;
  /** Mission concernée */
  missionId: string;
  /** Timestamp */
  timestamp: string;
  /** Score d'importance (0-1) */
  importance: number;
}

/** Résultat d'apprentissage d'une mission */
export interface LearningResult {
  /** Leçons extraites */
  lessons: Lesson[];
  /** Améliorations appliquées */
  improvementsApplied: string[];
  /** Fichiers modifiés pendant l'apprentissage */
  filesModified: string[];
  /** Résumé */
  summary: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Schemas Zod
// ═══════════════════════════════════════════════════════════════════════════════

export const codeEntitySchema = z.object({
  name: z.string().min(1),
  type: z.enum([
    // Entités de code
    "class", "function", "interface", "enum", "type", "constant",
    "variable", "component", "method", "import", "export",
    "route", "db_table", "env_var", "test", "symbol",
    // Entités documentaires
    "section", "summary", "todo", "frontmatter", "code_block", "alert", "doc_link",
  ]),
  filePath: z.string().min(1),
  lineStart: z.number().int().nonnegative(),
  lineEnd: z.number().int().positive().optional(),
  signature: z.string().optional(),
  modifiers: z.array(z.string()).optional(),
  description: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  /** Métadonnées supplémentaires (niveau de titre, langage du bloc, cible du lien, etc.) */
  metadata: z.record(z.any()).optional(),
});

export const knowledgeGraphSchema = z.object({
  projectRoot: z.string(),
  files: z.record(z.any()),
  entities: z.record(z.array(codeEntitySchema)),
  dependencies: z.record(z.array(z.string())),
  dependents: z.record(z.array(z.string())),
  relations: z.array(z.any()).default([]),
  lastIndexed: z.string(),
  stats: z.object({
    totalFiles: z.number(),
    totalLines: z.number(),
    totalEntities: z.number(),
    totalExports: z.number(),
    totalImports: z.number(),
    averageFileSize: z.number(),
    filesByExtension: z.record(z.number()),
    entitiesByType: z.record(z.number()),
  }),
});

