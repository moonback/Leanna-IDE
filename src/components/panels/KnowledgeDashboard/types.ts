// ═══════════════════════════════════════════════════════════════════════════════
// Types partagés — Knowledge Dashboard
// Source unique pour API response + UI components
// ═══════════════════════════════════════════════════════════════════════════════

export interface DashboardWorkspace {
  selfRoot: string;
  activeWorkspace: string;
  sandboxActive: boolean;
}

export interface DashboardGraph {
  lastIndexed: string;
  totalFiles: number;
  totalLines: number;
  totalEntities: number;
  totalExports: number;
  totalImports: number;
  averageFileSize: number;
  filesByExtension: Record<string, number>;
  entitiesByType: Record<string, number>;
  topLargest: FileStat[];
  topEntityDense: EntityDenseStat[];
  topImpacted: ImpactedFile[];
  couplingRanking: CouplingStat[];
  cycleCount: number;
  cycles: DependencyCycle[];
}

export interface FileStat {
  path: string;
  lines: number;
  size: number;
  entities: number;
}

export interface EntityDenseStat {
  path: string;
  entities: number;
  lines: number;
}

export interface ImpactedFile {
  path: string;
  impacted: number;
}

export interface CouplingStat {
  path: string;
  dependencies: number;
  dependents: number;
  totalEdges: number;
}

export interface DependencyCycle {
  files: string[];
  length: number;
}

export type ProjectFactCategory =
  | 'architecture'
  | 'convention'
  | 'pattern'
  | 'decision'
  | 'known-bug'
  | 'api'
  | 'module'
  | 'workflow'
  | 'security'
  | 'stack'
  | 'refactoring'
  | 'todo';

export interface ProjectFact {
  id: string;
  content: string;
  category: ProjectFactCategory;
  tags: string[];
  sourceFile?: string;
  createdAt: string;
  updatedAt: string;
  confidence: number;
  usageCount: number;
}

export interface DashboardMemory {
  totalFacts: number;
  factByCategory: Record<string, number>;
  topTags: TagCount[];
  topUsedFacts: ProjectFact[];
  recentFacts: ProjectFact[];
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface KnowledgeHealth {
  initialized: boolean;
  fileCount: number;
  entityCount: number;
  exportCount: number;
  importCount: number;
  cycleCount: number;
  factCount: number;
  criticalModuleCount: number;
  freshness: number;
  lastIndexed?: string;
  warnings: string[];
}

export type DetectedPatternType = 'error_pattern' | 'success_pattern' | 'optimization' | 'decision';

export interface DetectedPattern {
  type: DetectedPatternType;
  signature: string;
  occurrenceCount: number;
  relatedFiles: string[];
  aggregatedImportance: number;
  growthPct: number;
  isRecurring: boolean;
}

export interface DashboardPatterns {
  errorPatterns: DetectedPattern[];
  successPatterns: DetectedPattern[];
  optimizations: DetectedPattern[];
  decisions: DetectedPattern[];
}

export interface DashboardPayload {
  generatedAt: string;
  workspace: DashboardWorkspace;
  graph: DashboardGraph;
  memory: DashboardMemory;
  health: KnowledgeHealth;
  patterns: DashboardPatterns;
}

export type TabId = 'overview' | 'files' | 'memory' | 'health' | 'patterns';

export interface TabConfig {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

export const TABS: TabConfig[] = [
  { id: 'overview', label: 'Vue globale', icon: null as any }, // icon set in component
  { id: 'files', label: 'Fichiers & Couplage', icon: null as any },
  { id: 'memory', label: 'Mémoire projet', icon: null as any },
  { id: 'health', label: 'Santé', icon: null as any },
  { id: 'patterns', label: 'Patterns appris', icon: null as any },
];

export const CATEGORY_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  architecture: { label: 'Architecture', color: '#818cf8', icon: null as any },
  convention: { label: 'Conventions', color: '#22d3ee', icon: null as any },
  pattern: { label: 'Patterns', color: '#34d399', icon: null as any },
  decision: { label: 'Décisions', color: '#f59e0b', icon: null as any },
  'known-bug': { label: 'Bugs connus', color: '#f87171', icon: null as any },
  api: { label: 'API', color: '#60a5fa', icon: null as any },
  module: { label: 'Modules', color: '#a78bfa', icon: null as any },
  workflow: { label: 'Workflows', color: '#fbbf24', icon: null as any },
  security: { label: 'Sécurité', color: '#ef4444', icon: null as any },
  stack: { label: 'Stack', color: '#0ea5e9', icon: null as any },
  refactoring: { label: 'Refactorings', color: '#fb923c', icon: null as any },
  todo: { label: 'TODO', color: '#94a3b8', icon: null as any },
};

export const PATTERN_META: Record<DetectedPatternType, { label: string; color: string }> = {
  error_pattern: { label: "Patterns d'erreurs", color: '#f87171' },
  success_pattern: { label: 'Patterns de succès', color: '#4ade80' },
  optimization: { label: 'Optimisations', color: '#60a5fa' },
  decision: { label: 'Décisions', color: '#f59e0b' },
};