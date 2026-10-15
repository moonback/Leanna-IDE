/**
 * Fonctions pures du panneau d'impact : normalisation des cibles,
 * regroupement du rapport et libellés. Ni React ni fetch ici.
 */

import type { CodeMapImpactReport, CodeMapRisk, ImpactedFile } from '../../types/codeMap.js';

const CODE_FILE_RE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/i;
const IDENTIFIER_RE = /^[A-Za-z_$][\w$]*$/;
const BROWSER_PREFIX = '__browser__:';

export function isCodeFile(p: string | null | undefined): boolean {
  return !!p && CODE_FILE_RE.test(p);
}

/** Chemin relatif au workspace, avec des `/` ; `null` si inexploitable. */
export function toWorkspacePath(p: string | null | undefined, root?: string): string | null {
  if (!p || p.startsWith(BROWSER_PREFIX)) return null;
  let out = p.replace(/\\/g, '/');
  if (root) {
    const r = root.replace(/\\/g, '/').replace(/\/+$/, '');
    if (r && out.toLowerCase().startsWith(`${r.toLowerCase()}/`)) out = out.slice(r.length + 1);
  }
  out = out.replace(/^(\.\/)+/, '').replace(/^\/+/, '');
  return out || null;
}

/** `fichier#mot` si le mot est un identifiant, sinon le fichier seul. */
export function buildImpactRef(filePath: string, word?: string | null): string {
  const w = word?.trim();
  return w && IDENTIFIER_RE.test(w) ? `${filePath}#${w}` : filePath;
}

const NAMED_IMPORT_RE = /import\s+(?:type\s+)?(?:([A-Za-z_$][\w$]*)\s*,\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
const DEFAULT_IMPORT_RE = /import\s+(?:type\s+)?([A-Za-z_$][\w$]*)\s+from\s*['"]([^'"]+)['"]/g;

/** Chemin du module importé, sans extension (la cartographie complète l'extension). */
function resolveModuleStem(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('.')) {
    const dir = fromFile.includes('/') ? fromFile.slice(0, fromFile.lastIndexOf('/')) : '';
    const parts = dir ? dir.split('/') : [];
    for (const seg of spec.split('/')) {
      if (seg === '..') parts.pop();
      else if (seg !== '.' && seg !== '') parts.push(seg);
    }
    base = parts.join('/');
  } else if (spec.startsWith('@/') || spec.startsWith('~/')) {
    base = `src/${spec.slice(2)}`;
  } else {
    return null;
  }
  return base.replace(/\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/i, '') || null;
}

/**
 * Si `word` est importé dans `source` depuis un module interne, renvoie la
 * cible vers sa définition (`module#NomDOrigine`, ou `module` pour un import
 * par défaut). `null` pour un symbole local ou un paquet externe.
 */
export function importedSymbolRef(source: string, filePath: string, word: string): string | null {
  for (const m of source.matchAll(NAMED_IMPORT_RE)) {
    const [, def, names, spec] = m;
    if (def === word) return resolveModuleStem(filePath, spec);
    for (const raw of names.split(',')) {
      const parts = raw.replace(/^\s*type\s+/, '').trim().split(/\s+as\s+/);
      const original = parts[0]?.trim();
      const local = (parts[1] ?? parts[0])?.trim();
      if (local === word && original) {
        const stem = resolveModuleStem(filePath, spec);
        return stem ? `${stem}#${original}` : null;
      }
    }
  }
  for (const m of source.matchAll(DEFAULT_IMPORT_RE)) {
    if (m[1] === word) return resolveModuleStem(filePath, m[2]);
  }
  return null;
}

/**
 * Cible analysable : fichier de code, ou module sans extension (issu d'un
 * import, que la cartographie complète elle-même).
 */
export function isAnalyzableTarget(ref: string): boolean {
  const file = targetFile(ref);
  if (!file) return false;
  const last = file.slice(file.lastIndexOf('/') + 1);
  return isCodeFile(file) || !last.includes('.');
}

export function targetFile(ref: string): string {
  const i = ref.indexOf('#');
  return i === -1 ? ref : ref.slice(0, i);
}

export interface DistanceGroup {
  distance: number;
  label: string;
  files: ImpactedFile[];
}

function distanceLabel(d: number): string {
  if (d <= 0) return 'Cible';
  if (d === 1) return 'Direct';
  return `Niveau ${d}`;
}

export function groupByDistance(report: Pick<CodeMapImpactReport, 'impactedFiles'>): DistanceGroup[] {
  const byDistance = new Map<number, ImpactedFile[]>();
  for (const f of report.impactedFiles) {
    const list = byDistance.get(f.distance) ?? [];
    list.push(f);
    byDistance.set(f.distance, list);
  }
  return [...byDistance.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([distance, files]) => ({
      distance,
      label: distanceLabel(distance),
      files: [...files].sort((a, b) => a.filePath.localeCompare(b.filePath)),
    }));
}

export function countImpactedSources(report: Pick<CodeMapImpactReport, 'impactedFiles'>): number {
  return report.impactedFiles.filter((f) => !f.isTest).length;
}

export function firstLineFor(report: Pick<CodeMapImpactReport, 'impacted'>, filePath: string): number | undefined {
  let best: number | undefined;
  for (const n of report.impacted) {
    if (n.filePath !== filePath || n.line == null) continue;
    if (best === undefined || n.line < best) best = n.line;
  }
  return best;
}

export function buildTestCommands(files: string[]): string[] {
  const front = files.filter((f) => f.startsWith('src/'));
  const server = files.filter((f) => !f.startsWith('src/'));
  const out: string[] = [];
  if (server.length) out.push(`node --import tsx --import ./scripts/test-isolation.mjs --test ${server.join(' ')}`);
  if (front.length) out.push(`npx vitest run --config vitest.config.ts ${front.join(' ')}`);
  return out;
}

const RISK_LABEL: Record<CodeMapRisk, string> = { low: 'FAIBLE', medium: 'MOYEN', high: 'ÉLEVÉ', critical: 'CRITIQUE' };
const RISK_COLOR: Record<CodeMapRisk, string> = {
  low: 'var(--color-success)',
  medium: 'var(--color-warning)',
  high: 'var(--color-error)',
  critical: 'var(--color-error)',
};

export function riskLabel(risk: CodeMapRisk): string {
  return RISK_LABEL[risk];
}

export function riskColor(risk: CodeMapRisk): string {
  return RISK_COLOR[risk];
}

/** Le résumé serveur est multi-lignes ; le panneau n'affiche que l'accroche. */
export function summaryHeadline(summary: string): string {
  return summary.split('\n', 1)[0] ?? '';
}
