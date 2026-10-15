/**
 * Copie front des types du rapport d'impact de la cartographie du code
 * (source : server/knowledge/CodeMap.ts). Garder synchronisé à la main :
 * le front n'importe pas de code serveur.
 */

export type CodeMapRisk = 'low' | 'medium' | 'high' | 'critical';

export type CodeMapNodeKind =
  | 'file' | 'class' | 'interface' | 'type' | 'enum'
  | 'function' | 'method' | 'component' | 'constant' | 'variable';

export type CodeMapEdgeKind =
  | 'contains' | 'imports' | 'imports_symbol' | 're_exports' | 'calls'
  | 'uses' | 'references_type' | 'extends' | 'implements' | 'tests';

export interface ImpactedNode {
  id: string;
  name: string;
  kind: CodeMapNodeKind;
  filePath: string;
  line?: number;
  distance: number;
  via: CodeMapEdgeKind;
  path: string[];
}

export interface ImpactedFile {
  filePath: string;
  distance: number;
  symbols: string[];
  isTest: boolean;
}

export interface CodeMapImpactReport {
  targets: Array<{ id: string; name: string; kind: CodeMapNodeKind; filePath: string; exported: boolean }>;
  unresolved: string[];
  ambiguous: Array<{ ref: string; candidates: string[] }>;
  impacted: ImpactedNode[];
  impactedFiles: ImpactedFile[];
  testsToRun: string[];
  untestedFiles: string[];
  risk: CodeMapRisk;
  riskScore: number;
  warnings: string[];
  maxDepthReached: boolean;
  truncated: boolean;
  summary: string;
}
