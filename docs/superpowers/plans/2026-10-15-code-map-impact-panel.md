# Panneau d'impact de la cartographie du code — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** ajouter dans l'IDE un panneau « Impact » (zone droite) qui montre, pour le fichier actif ou le symbole sous le curseur, les dépendants, le risque et les tests à relancer.

**Architecture :** trois unités front indépendantes — un module pur (`impactModel.ts`), un hook de données (`useCodeMapImpact.ts`) et un composant (`ImpactPanel.tsx`) — puis un branchement dans `IdeView` (RightDock, menu contextuel Monaco), `StatusBar` (menu Outils) et `CommandPalette`. Aucune modification serveur : l'API `POST /api/knowledge/code-map/impact` existe déjà.

**Tech Stack :** React 18 + TypeScript, lucide-react, Monaco, Vitest + jsdom + @testing-library/react.

**Spec :** `docs/superpowers/specs/2026-10-15-code-map-impact-panel-design.md`

## Global Constraints

- Commentaires, libellés et messages en **français avec accents corrects**.
- Imports relatifs avec suffixe `.js` (convention du dépôt, ex. `'./impactModel.js'`).
- Couleurs uniquement via variables CSS : `--color-success`, `--color-warning`, `--color-error`, `--color-info`, `--text-muted`, `--text-dimmed`, `--border-base`, `--bg-panel`, `--accent-primary` (cf. `src/DESIGN_TOKENS.md`). Jamais la couleur seule pour porter une information.
- Requêtes authentifiées : en-tête `x-Leanna-token` lu dans `localStorage['Leanna_api_token']` s'il existe.
- Libellés de risque : `low` → `FAIBLE`, `medium` → `MOYEN`, `high` → `ÉLEVÉ`, `critical` → `CRITIQUE`.
- Délai d'attente du hook : **300 ms** ; cache LRU **20** entrées, clé `target|depth` ; profondeur **1–5**, défaut **3**.
- Extensions de code : `ts|tsx|js|jsx|mjs|cjs|mts|cts`.
- Commande de tests serveur copiée : `node --import tsx --import ./scripts/test-isolation.mjs --test <fichiers…>` ; tests front (`src/…`) : `npx vitest run --config vitest.config.ts <fichiers…>`.
- Tests front : `npm run test:ui` ; typage : `npm run typecheck`. Ne jamais lancer de test qui écrit dans le `.project-knowledge.json` réel.
- Commits : uniquement les fichiers de la tâche (`git commit -- <fichiers>`), d'autres sessions partagent l'index git.

## Review Focus

1. **Changement d'onglet rapide** (A → B → C en moins de 300 ms, ou réponse lente de A arrivant après B) : seul le rapport de la dernière cible s'affiche → test dans la tâche 2.
2. **Chemins exotiques** : antislashs Windows, préfixe `./`, onglet navigateur `__browser__:…`, chemin absolu sous la racine → cible normalisée ou `null` sans requête → tests dans la tâche 1.
3. **Réponse 200 mais `status !== 'success'`, ou corps non JSON** : état d'erreur lisible, pas de plantage → test dans la tâche 2.
4. **Clic droit sur un espace, un mot-clé ou une ponctuation** (mot vide ou non identifiant) : la cible retombe sur le fichier → test dans la tâche 1.
5. **Rapport volumineux** (300 fichiers impactés, `truncated`) : liste plafonnée à 100 lignes par groupe avec « +N autres fichiers », avertissement « Résultat partiel » visible → test dans la tâche 3.

---

### Task 1 : types front et modèle pur

**Files :**
- Create : `src/types/codeMap.ts`
- Create : `src/components/knowledge/impactModel.ts`
- Test : `src/components/knowledge/impactModel.test.ts`

**Interfaces :**
- Consumes : rien.
- Produces :
  - types `CodeMapRisk`, `CodeMapNodeKind`, `CodeMapEdgeKind`, `ImpactedNode`, `ImpactedFile`, `CodeMapImpactReport` (`src/types/codeMap.ts`)
  - `isCodeFile(p: string | null | undefined): boolean`
  - `toWorkspacePath(p: string | null | undefined, root?: string): string | null`
  - `buildImpactRef(filePath: string, word?: string | null): string`
  - `targetFile(ref: string): string`
  - `interface DistanceGroup { distance: number; label: string; files: ImpactedFile[] }`
  - `groupByDistance(report: Pick<CodeMapImpactReport, 'impactedFiles'>): DistanceGroup[]`
  - `countImpactedSources(report: Pick<CodeMapImpactReport, 'impactedFiles'>): number`
  - `firstLineFor(report: Pick<CodeMapImpactReport, 'impacted'>, filePath: string): number | undefined`
  - `buildTestCommands(files: string[]): string[]`
  - `riskLabel(risk: CodeMapRisk): string` et `riskColor(risk: CodeMapRisk): string`
  - `summaryHeadline(summary: string): string`

- [ ] **Step 1 : écrire les types front**

`src/types/codeMap.ts` :

```ts
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
```

- [ ] **Step 2 : écrire les tests qui échouent**

`src/components/knowledge/impactModel.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import {
  isCodeFile, toWorkspacePath, buildImpactRef, targetFile, groupByDistance,
  countImpactedSources, firstLineFor, buildTestCommands, riskLabel, riskColor,
  summaryHeadline,
} from './impactModel.js';
import type { ImpactedFile, ImpactedNode } from '../../types/codeMap.js';

const file = (filePath: string, distance: number, isTest = false, symbols: string[] = []): ImpactedFile =>
  ({ filePath, distance, isTest, symbols });

describe('isCodeFile', () => {
  it('reconnaît les extensions de code', () => {
    for (const p of ['a.ts', 'b.tsx', 'c.js', 'd.jsx', 'e.mjs', 'f.cjs', 'g.mts', 'h.cts', 'I.TS']) {
      expect(isCodeFile(p)).toBe(true);
    }
  });
  it('rejette le reste', () => {
    for (const p of ['README.md', 'package.json', 'a.css', '', null, undefined]) {
      expect(isCodeFile(p)).toBe(false);
    }
  });
});

describe('toWorkspacePath', () => {
  it('normalise antislashs et préfixes', () => {
    expect(toWorkspacePath('server\\knowledge\\a.ts')).toBe('server/knowledge/a.ts');
    expect(toWorkspacePath('./src/a.ts')).toBe('src/a.ts');
    expect(toWorkspacePath('/src/a.ts')).toBe('src/a.ts');
  });
  it('retire la racine du workspace (insensible à la casse)', () => {
    expect(toWorkspacePath('C:\\Users\\x\\proj\\src\\a.ts', 'c:/users/x/proj')).toBe('src/a.ts');
    expect(toWorkspacePath('C:/Users/x/proj/src/a.ts', 'C:\\Users\\x\\proj\\')).toBe('src/a.ts');
  });
  it('renvoie null pour les onglets navigateur et les chemins vides', () => {
    expect(toWorkspacePath('__browser__:https://example.com')).toBeNull();
    expect(toWorkspacePath('')).toBeNull();
    expect(toWorkspacePath(null)).toBeNull();
    expect(toWorkspacePath('./')).toBeNull();
  });
});

describe('buildImpactRef / targetFile', () => {
  it('ajoute un identifiant valide', () => {
    expect(buildImpactRef('src/a.ts', 'getUser')).toBe('src/a.ts#getUser');
    expect(buildImpactRef('src/a.ts', '$store')).toBe('src/a.ts#$store');
  });
  it('retombe sur le fichier si le mot est vide ou invalide', () => {
    expect(buildImpactRef('src/a.ts', '')).toBe('src/a.ts');
    expect(buildImpactRef('src/a.ts', '   ')).toBe('src/a.ts');
    expect(buildImpactRef('src/a.ts', null)).toBe('src/a.ts');
    expect(buildImpactRef('src/a.ts', '123')).toBe('src/a.ts');
    expect(buildImpactRef('src/a.ts', '=>')).toBe('src/a.ts');
  });
  it('extrait le fichier d’une cible', () => {
    expect(targetFile('src/a.ts#getUser')).toBe('src/a.ts');
    expect(targetFile('src/a.ts')).toBe('src/a.ts');
  });
});

describe('groupByDistance', () => {
  it('groupe, trie et nomme les niveaux', () => {
    const groups = groupByDistance({
      impactedFiles: [file('z.ts', 2), file('b.ts', 1), file('a.ts', 1), file('t.ts', 0, false, ['X'])],
    });
    expect(groups.map((g) => g.label)).toEqual(['Cible', 'Direct', 'Niveau 2']);
    expect(groups[1].files.map((f) => f.filePath)).toEqual(['a.ts', 'b.ts']);
  });
  it('renvoie une liste vide sans fichier', () => {
    expect(groupByDistance({ impactedFiles: [] })).toEqual([]);
  });
});

describe('countImpactedSources', () => {
  it('exclut les fichiers de test', () => {
    expect(countImpactedSources({ impactedFiles: [file('a.ts', 1), file('a.test.ts', 1, true)] })).toBe(1);
  });
});

describe('firstLineFor', () => {
  it('renvoie la plus petite ligne connue du fichier', () => {
    const node = (filePath: string, line?: number): ImpactedNode =>
      ({ id: `${filePath}#x${line}`, name: 'x', kind: 'function', filePath, line, distance: 1, via: 'calls', path: [] });
    const impacted = [node('a.ts', 40), node('a.ts', 12), node('a.ts'), node('b.ts', 3)];
    expect(firstLineFor({ impacted }, 'a.ts')).toBe(12);
    expect(firstLineFor({ impacted }, 'c.ts')).toBeUndefined();
  });
});

describe('buildTestCommands', () => {
  it('sépare tests serveur et tests front', () => {
    expect(buildTestCommands(['server/a.test.ts', 'src/b.test.tsx', 'server/c.test.ts'])).toEqual([
      'node --import tsx --import ./scripts/test-isolation.mjs --test server/a.test.ts server/c.test.ts',
      'npx vitest run --config vitest.config.ts src/b.test.tsx',
    ]);
  });
  it('renvoie une liste vide sans test', () => {
    expect(buildTestCommands([])).toEqual([]);
  });
});

describe('risque et résumé', () => {
  it('libellés et couleurs', () => {
    expect(riskLabel('low')).toBe('FAIBLE');
    expect(riskLabel('medium')).toBe('MOYEN');
    expect(riskLabel('high')).toBe('ÉLEVÉ');
    expect(riskLabel('critical')).toBe('CRITIQUE');
    expect(riskColor('low')).toBe('var(--color-success)');
    expect(riskColor('medium')).toBe('var(--color-warning)');
    expect(riskColor('high')).toBe('var(--color-error)');
    expect(riskColor('critical')).toBe('var(--color-error)');
  });
  it('ne garde que la première ligne du résumé', () => {
    expect(summaryHeadline('Impact ÉLEVÉ (70/100) — 3 fichier(s)\nCibles : x')).toBe('Impact ÉLEVÉ (70/100) — 3 fichier(s)');
    expect(summaryHeadline('')).toBe('');
  });
});
```

- [ ] **Step 3 : vérifier l'échec**

Run : `npx vitest run --config vitest.config.ts src/components/knowledge/impactModel.test.ts`
Attendu : FAIL — « Failed to resolve import "./impactModel.js" ».

- [ ] **Step 4 : implémenter le modèle**

`src/components/knowledge/impactModel.ts` :

```ts
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
```

- [ ] **Step 5 : vérifier le succès**

Run : `npx vitest run --config vitest.config.ts src/components/knowledge/impactModel.test.ts`
Attendu : PASS (tous les tests).

- [ ] **Step 6 : commit**

```bash
git add -- src/types/codeMap.ts src/components/knowledge/impactModel.ts src/components/knowledge/impactModel.test.ts
git commit -m "feat(impact): modèle pur du panneau d'impact" -- src/types/codeMap.ts src/components/knowledge/impactModel.ts src/components/knowledge/impactModel.test.ts
```

---

### Task 2 : hook `useCodeMapImpact`

**Files :**
- Create : `src/hooks/useCodeMapImpact.ts`
- Test : `src/hooks/useCodeMapImpact.test.ts`

**Interfaces :**
- Consumes : `CodeMapImpactReport` (`src/types/codeMap.ts`).
- Produces :
  - `authHeaders(): Record<string, string>`
  - `interface CodeMapImpactState { report: CodeMapImpactReport | null; loading: boolean; error: string | null; refresh: () => void }`
  - `useCodeMapImpact(target: string | null, depth: number, debounceMs?: number): CodeMapImpactState`
  - `__clearImpactCache(): void` (tests uniquement)

- [ ] **Step 1 : écrire les tests qui échouent**

`src/hooks/useCodeMapImpact.test.ts` :

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCodeMapImpact, __clearImpactCache } from './useCodeMapImpact.js';
import { jsonResponse } from '../test/helpers.js';

const report = (name: string) => ({
  targets: [{ id: name, name, kind: 'file', filePath: name, exported: false }],
  unresolved: [], ambiguous: [], impacted: [], impactedFiles: [], testsToRun: [], untestedFiles: [],
  risk: 'low', riskScore: 0, warnings: [], maxDepthReached: false, truncated: false, summary: name,
});

function mockFetch(impl: (body: { targets: string[]; depth: number }) => Response | Promise<Response>) {
  const fn = vi.fn(async (_url: string, init?: RequestInit) => impl(JSON.parse(String(init?.body))));
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

async function flush(ms = 300) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

beforeEach(() => {
  vi.useFakeTimers();
  __clearImpactCache();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useCodeMapImpact', () => {
  it('ne fait rien sans cible', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ status: 'success', report: report('x') }));
    const { result } = renderHook(() => useCodeMapImpact(null, 3));
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ report: null, loading: false, error: null });
  });

  it('attend 300 ms puis envoie targets et depth', async () => {
    const fetchMock = mockFetch((b) => jsonResponse({ status: 'success', report: report(b.targets[0]) }));
    const { result } = renderHook(() => useCodeMapImpact('src/a.ts', 2));
    expect(result.current.loading).toBe(true);
    await flush(299);
    expect(fetchMock).not.toHaveBeenCalled();
    await flush(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/knowledge/code-map/impact');
    expect(JSON.parse(String(init?.body))).toEqual({ targets: ['src/a.ts'], depth: 2 });
    expect(result.current.report?.summary).toBe('src/a.ts');
    expect(result.current.loading).toBe(false);
  });

  it('une seule requête après des changements rapides', async () => {
    const fetchMock = mockFetch((b) => jsonResponse({ status: 'success', report: report(b.targets[0]) }));
    const { result, rerender } = renderHook(({ t }) => useCodeMapImpact(t, 3), { initialProps: { t: 'a.ts' } });
    await flush(100);
    rerender({ t: 'b.ts' });
    await flush(100);
    rerender({ t: 'c.ts' });
    await flush(300);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.report?.summary).toBe('c.ts');
  });

  it('ignore une réponse arrivée pour une cible périmée', async () => {
    let releaseA: (r: Response) => void = () => {};
    mockFetch((b) => b.targets[0] === 'a.ts'
      ? new Promise<Response>((resolve) => { releaseA = resolve; })
      : jsonResponse({ status: 'success', report: report('b.ts') }));
    const { result, rerender } = renderHook(({ t }) => useCodeMapImpact(t, 3), { initialProps: { t: 'a.ts' } });
    await flush();
    rerender({ t: 'b.ts' });
    await flush();
    await act(async () => { releaseA(jsonResponse({ status: 'success', report: report('a.ts') })); });
    expect(result.current.report?.summary).toBe('b.ts');
  });

  it('réutilise le cache, et refresh le contourne', async () => {
    const fetchMock = mockFetch((b) => jsonResponse({ status: 'success', report: report(b.targets[0]) }));
    const { result, rerender } = renderHook(({ t }) => useCodeMapImpact(t, 3), { initialProps: { t: 'a.ts' } });
    await flush();
    rerender({ t: 'b.ts' });
    await flush();
    rerender({ t: 'a.ts' });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.report?.summary).toBe('a.ts');
    act(() => result.current.refresh());
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('expose le message d’erreur du serveur', async () => {
    mockFetch(() => jsonResponse({ error: 'Carte indisponible' }, { ok: false, status: 500 }));
    const { result } = renderHook(() => useCodeMapImpact('a.ts', 3));
    await flush();
    expect(result.current).toMatchObject({ report: null, loading: false, error: 'Carte indisponible' });
  });

  it('traite un 200 sans status success comme une erreur', async () => {
    mockFetch(() => jsonResponse({ status: 'error' }));
    const { result } = renderHook(() => useCodeMapImpact('a.ts', 3));
    await flush();
    expect(result.current.error).toBe('Réponse inattendue du serveur (200)');
  });

  it('survit à un corps non JSON', async () => {
    mockFetch(() => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); } }) as unknown as Response);
    const { result } = renderHook(() => useCodeMapImpact('a.ts', 3));
    await flush();
    expect(result.current.error).toBe('Réponse inattendue du serveur (200)');
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npx vitest run --config vitest.config.ts src/hooks/useCodeMapImpact.test.ts`
Attendu : FAIL — « Failed to resolve import "./useCodeMapImpact.js" ».

- [ ] **Step 3 : implémenter le hook**

`src/hooks/useCodeMapImpact.ts` :

```ts
/**
 * useCodeMapImpact — rapport d'impact de la cartographie du code pour une cible
 * (`fichier` ou `fichier#Symbole`). Délai d'attente, annulation des requêtes
 * périmées et petit cache LRU partagé entre les montages du panneau.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CodeMapImpactReport } from '../types/codeMap.js';

const CACHE_MAX = 20;
const cache = new Map<string, CodeMapImpactReport>();

function cacheGet(key: string): CodeMapImpactReport | undefined {
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); }
  return hit;
}

function cacheSet(key: string, value: CodeMapImpactReport): void {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
}

/** Réservé aux tests. */
export function __clearImpactCache(): void {
  cache.clear();
}

export function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('Leanna_api_token');
  return { 'Content-Type': 'application/json', ...(token ? { 'x-Leanna-token': token } : {}) };
}

export interface CodeMapImpactState {
  report: CodeMapImpactReport | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useCodeMapImpact(target: string | null, depth: number, debounceMs = 300): CodeMapImpactState {
  const [report, setReport] = useState<CodeMapImpactReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const forceRef = useRef(false);

  const refresh = useCallback(() => {
    forceRef.current = true;
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!target) {
      setReport(null);
      setLoading(false);
      setError(null);
      return;
    }
    const key = `${target}|${depth}`;
    const force = forceRef.current;
    forceRef.current = false;

    const cached = force ? undefined : cacheGet(key);
    if (cached) {
      setReport(cached);
      setLoading(false);
      setError(null);
      return;
    }

    // L'ancien rapport reste affiché (atténué) pendant le chargement.
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/knowledge/code-map/impact', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ targets: [target], depth }),
          signal: controller.signal,
        });
        const body = await res.json().catch(() => null) as { status?: string; report?: CodeMapImpactReport; error?: string } | null;
        if (controller.signal.aborted) return;
        if (!res.ok || body?.status !== 'success' || !body.report) {
          setReport(null);
          setError(body?.error ?? `Réponse inattendue du serveur (${res.status})`);
        } else {
          cacheSet(key, body.report);
          setReport(body.report);
        }
        setLoading(false);
      } catch (e) {
        if (controller.signal.aborted) return;
        setReport(null);
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [target, depth, debounceMs, nonce]);

  return { report, loading, error, refresh };
}
```

- [ ] **Step 4 : vérifier le succès**

Run : `npx vitest run --config vitest.config.ts src/hooks/useCodeMapImpact.test.ts`
Attendu : PASS (8 tests).

- [ ] **Step 5 : commit**

```bash
git add -- src/hooks/useCodeMapImpact.ts src/hooks/useCodeMapImpact.test.ts
git commit -m "feat(impact): hook useCodeMapImpact (délai, annulation, cache)" -- src/hooks/useCodeMapImpact.ts src/hooks/useCodeMapImpact.test.ts
```

---

### Task 3 : composant `ImpactPanel`

**Files :**
- Create : `src/components/knowledge/ImpactPanel.tsx`
- Test : `src/components/knowledge/ImpactPanel.test.tsx`

**Interfaces :**
- Consumes : `useCodeMapImpact`, `authHeaders` (tâche 2) ; `isCodeFile`, `targetFile`, `groupByDistance`, `countImpactedSources`, `firstLineFor`, `buildTestCommands`, `riskLabel`, `riskColor`, `summaryHeadline` (tâche 1).
- Produces :
  - `interface ImpactPanelProps { target: string | null; pinned: boolean; onTogglePin: () => void; onOpenFile: (path: string, line?: number) => void; onClose: () => void }`
  - `export function ImpactPanel(props: ImpactPanelProps): JSX.Element`
  - constante exportée `MAX_ROWS_PER_GROUP = 100`

- [ ] **Step 1 : écrire les tests qui échouent**

`src/components/knowledge/ImpactPanel.test.tsx` :

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { CodeMapImpactReport } from '../../types/codeMap.js';

const hookState = {
  report: null as CodeMapImpactReport | null,
  loading: false,
  error: null as string | null,
  refresh: vi.fn(),
};
vi.mock('../../hooks/useCodeMapImpact.js', () => ({
  useCodeMapImpact: () => hookState,
  authHeaders: () => ({}),
}));

import { ImpactPanel, MAX_ROWS_PER_GROUP } from './ImpactPanel.js';

const baseReport = (over: Partial<CodeMapImpactReport> = {}): CodeMapImpactReport => ({
  targets: [{ id: 'f:src/a.ts', name: 'a.ts', kind: 'file', filePath: 'src/a.ts', exported: false }],
  unresolved: [], ambiguous: [], impacted: [], impactedFiles: [], testsToRun: [], untestedFiles: [],
  risk: 'low', riskScore: 0, warnings: [], maxDepthReached: false, truncated: false,
  summary: 'Impact FAIBLE (0/100) — 0 fichier(s)\nCibles : a.ts', ...over,
});

const props = (over: Partial<Parameters<typeof ImpactPanel>[0]> = {}) => ({
  target: 'src/a.ts', pinned: false, onTogglePin: vi.fn(), onOpenFile: vi.fn(), onClose: vi.fn(), ...over,
});

beforeEach(() => {
  hookState.report = null;
  hookState.loading = false;
  hookState.error = null;
  hookState.refresh = vi.fn();
});

describe('ImpactPanel — états', () => {
  it('sans fichier ouvert', () => {
    render(<ImpactPanel {...props({ target: null })} />);
    expect(screen.getByText('Ouvre un fichier de code pour voir son impact')).toBeTruthy();
  });

  it('fichier non-code', () => {
    render(<ImpactPanel {...props({ target: 'README.md' })} />);
    expect(screen.getByText('Pas de code à analyser dans ce fichier')).toBeTruthy();
  });

  it('chargement sans rapport précédent', () => {
    hookState.loading = true;
    render(<ImpactPanel {...props()} />);
    expect(screen.getByRole('status', { name: 'Analyse en cours' })).toBeTruthy();
  });

  it('erreur avec bouton Réessayer', () => {
    hookState.error = 'Carte indisponible';
    render(<ImpactPanel {...props()} />);
    expect(screen.getByText('Carte indisponible')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(hookState.refresh).toHaveBeenCalled();
  });

  it('cible non résolue avec bouton Réindexer', () => {
    hookState.report = baseReport({ targets: [], unresolved: ['src/a.ts'] });
    render(<ImpactPanel {...props()} />);
    expect(screen.getByText("Ce fichier ou symbole n'est pas encore dans la cartographie")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Réindexer' })).toBeTruthy();
  });

  it('aucun dépendant', () => {
    hookState.report = baseReport();
    render(<ImpactPanel {...props()} />);
    expect(screen.getByText('Aucun dépendant : modification sans effet de bord connu')).toBeTruthy();
    expect(screen.getByText('FAIBLE')).toBeTruthy();
  });
});

describe('ImpactPanel — rapport', () => {
  it('affiche risque, groupes et ouvre un fichier à la bonne ligne', () => {
    hookState.report = baseReport({
      risk: 'high', riskScore: 70,
      impactedFiles: [
        { filePath: 'src/b.ts', distance: 1, symbols: ['useA'], isTest: false },
        { filePath: 'src/c.test.ts', distance: 2, symbols: [], isTest: true },
      ],
      impacted: [{ id: 'src/b.ts#useA', name: 'useA', kind: 'function', filePath: 'src/b.ts', line: 12, distance: 1, via: 'calls', path: [] }],
      testsToRun: ['src/c.test.ts'],
    });
    const p = props();
    render(<ImpactPanel {...p} />);
    expect(screen.getByText('ÉLEVÉ')).toBeTruthy();
    expect(screen.getByText('Direct')).toBeTruthy();
    expect(screen.getByText('Niveau 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /src\/b\.ts/ }));
    expect(p.onOpenFile).toHaveBeenCalledWith('src/b.ts', 12);
  });

  it('plafonne chaque groupe et annonce le reste', () => {
    const many = Array.from({ length: MAX_ROWS_PER_GROUP + 5 }, (_, i) => ({
      filePath: `src/f${String(i).padStart(3, '0')}.ts`, distance: 1, symbols: [], isTest: false,
    }));
    hookState.report = baseReport({ risk: 'critical', impactedFiles: many, truncated: true });
    render(<ImpactPanel {...props()} />);
    expect(screen.getByText('+5 autres fichiers')).toBeTruthy();
    expect(screen.getByText(/Résultat partiel/)).toBeTruthy();
  });

  it('navigation clavier entre les lignes', () => {
    hookState.report = baseReport({
      impactedFiles: [
        { filePath: 'src/b.ts', distance: 1, symbols: [], isTest: false },
        { filePath: 'src/c.ts', distance: 1, symbols: [], isTest: false },
      ],
    });
    render(<ImpactPanel {...props()} />);
    const first = screen.getByRole('button', { name: /src\/b\.ts/ });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /src\/c\.ts/ }));
  });

  it('bouton d’épinglage', () => {
    hookState.report = baseReport();
    const p = props({ pinned: true });
    render(<ImpactPanel {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Désépingler la cible' }));
    expect(p.onTogglePin).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npx vitest run --config vitest.config.ts src/components/knowledge/ImpactPanel.test.tsx`
Attendu : FAIL — « Failed to resolve import "./ImpactPanel.js" ».

- [ ] **Step 3 : implémenter le composant**

`src/components/knowledge/ImpactPanel.tsx` :

```tsx
/**
 * ImpactPanel — panneau de la zone droite de l'IDE : ce qu'une modification du
 * fichier actif (ou du symbole ciblé) risque de casser. Lecture seule, branché
 * sur POST /api/knowledge/code-map/impact via useCodeMapImpact.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle, Check, ClipboardCopy, FlaskConical, Pin, PinOff, RefreshCcw, X,
} from 'lucide-react';
import { authHeaders, useCodeMapImpact } from '../../hooks/useCodeMapImpact.js';
import {
  buildTestCommands, countImpactedSources, firstLineFor, groupByDistance,
  isCodeFile, riskColor, riskLabel, summaryHeadline, targetFile,
} from './impactModel.js';
import type { CodeMapImpactReport } from '../../types/codeMap.js';

export const MAX_ROWS_PER_GROUP = 100;
const DEPTHS = [1, 2, 3, 4, 5];

export interface ImpactPanelProps {
  target: string | null;
  pinned: boolean;
  onTogglePin: () => void;
  onOpenFile: (path: string, line?: number) => void;
  onClose: () => void;
}

function Message({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'error' }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-center text-sm"
      style={{ color: tone === 'error' ? 'var(--color-error)' : 'var(--text-muted)' }}>
      <div className="flex flex-col items-center gap-3">{children}</div>
    </div>
  );
}

function Skeleton() {
  return (
    <div role="status" aria-label="Analyse en cours" className="flex flex-col gap-2 p-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-4 animate-pulse rounded" style={{ backgroundColor: 'var(--border-base)', width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

function splitPath(p: string): { dir: string; name: string } {
  const i = p.lastIndexOf('/');
  return i === -1 ? { dir: '', name: p } : { dir: p.slice(0, i + 1), name: p.slice(i + 1) };
}

/** ↑/↓ déplacent le focus entre les lignes `[data-impact-row]` du panneau. */
function handleRowKeys(e: React.KeyboardEvent<HTMLElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const rows = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[data-impact-row]')];
  const i = rows.indexOf(document.activeElement as HTMLButtonElement);
  if (i === -1) return;
  e.preventDefault();
  rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
}

function ReportView({ report, onOpenFile }: { report: CodeMapImpactReport; onOpenFile: ImpactPanelProps['onOpenFile'] }) {
  const groups = useMemo(() => groupByDistance(report), [report]);
  const commands = useMemo(() => buildTestCommands(report.testsToRun), [report]);
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(commands.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* presse-papiers indisponible : sans conséquence */ }
  }, [commands]);

  const alerts = [
    ...report.warnings,
    ...report.ambiguous.map((a) => `Plusieurs symboles nommés ${a.ref} — tous retenus`),
    ...(report.truncated || report.maxDepthReached
      ? ['Résultat partiel : augmente la profondeur ou cible un symbole précis']
      : []),
  ];

  return (
    <div className="flex flex-col gap-4 p-3 text-sm" onKeyDown={handleRowKeys}>
      <p style={{ color: 'var(--text-muted)' }}>{summaryHeadline(report.summary)}</p>

      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          ['Fichiers impactés', countImpactedSources(report)],
          ['Tests à relancer', report.testsToRun.length],
          ['Non couverts', report.untestedFiles.length],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded p-2" style={{ border: '1px solid var(--border-base)' }}>
            <dd className="text-lg font-semibold">{value}</dd>
            <dt className="text-xs" style={{ color: 'var(--text-dimmed)' }}>{label}</dt>
          </div>
        ))}
      </dl>

      {groups.length === 0 && (
        <p style={{ color: 'var(--color-success)' }}>Aucun dépendant : modification sans effet de bord connu</p>
      )}

      {groups.map((g) => (
        <section key={g.distance} aria-label={g.label}>
          <h3 className="mb-1 text-xs font-semibold uppercase" style={{ color: 'var(--text-dimmed)' }}>{g.label}</h3>
          <ul className="flex flex-col">
            {g.files.slice(0, MAX_ROWS_PER_GROUP).map((f) => {
              const { dir, name } = splitPath(f.filePath);
              const extra = f.symbols.length - 3;
              return (
                <li key={f.filePath}>
                  <button
                    type="button"
                    data-impact-row
                    aria-label={f.filePath}
                    onClick={() => onOpenFile(f.filePath, firstLineFor(report, f.filePath))}
                    className="flex w-full flex-col items-start rounded px-2 py-1 text-left hover:bg-[var(--border-base)] focus:outline focus:outline-1 focus:outline-[var(--accent-primary)]"
                  >
                    <span className="flex w-full items-center gap-2 truncate">
                      <span className="truncate"><span style={{ color: 'var(--text-dimmed)' }}>{dir}</span>{name}</span>
                      {f.isTest && (
                        <span className="rounded px-1 text-[10px]" style={{ color: 'var(--color-info)', border: '1px solid var(--color-info)' }}>test</span>
                      )}
                    </span>
                    {f.symbols.length > 0 && (
                      <span className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                        {f.symbols.slice(0, 3).join(', ')}{extra > 0 ? ` +${extra}` : ''}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {g.files.length > MAX_ROWS_PER_GROUP && (
            <p className="px-2 text-xs" style={{ color: 'var(--text-dimmed)' }}>
              +{g.files.length - MAX_ROWS_PER_GROUP} autres fichiers
            </p>
          )}
        </section>
      ))}

      {report.testsToRun.length > 0 && (
        <section aria-label="Tests à relancer">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="flex items-center gap-1 text-xs font-semibold uppercase" style={{ color: 'var(--text-dimmed)' }}>
              <FlaskConical size={12} /> Tests à relancer
            </h3>
            <button type="button" onClick={copy} className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent-primary)' }}>
              {copied ? <Check size={12} /> : <ClipboardCopy size={12} />}
              {copied ? 'Copié' : 'Copier la commande'}
            </button>
          </div>
          <ul className="flex flex-col">
            {report.testsToRun.map((t) => (
              <li key={t}>
                <button type="button" data-impact-row aria-label={t} onClick={() => onOpenFile(t)}
                  className="w-full truncate rounded px-2 py-1 text-left hover:bg-[var(--border-base)]">
                  {t}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(alerts.length > 0 || report.untestedFiles.length > 0) && (
        <details open={alerts.length > 0}>
          <summary className="flex cursor-pointer items-center gap-1 text-xs font-semibold uppercase" style={{ color: 'var(--color-warning)' }}>
            <AlertTriangle size={12} /> Alertes
          </summary>
          <ul className="mt-1 flex flex-col gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            {alerts.map((a) => <li key={a}>{a}</li>)}
            {report.untestedFiles.map((f) => <li key={f}>Non couvert par un test : {f}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

export function ImpactPanel({ target, pinned, onTogglePin, onOpenFile, onClose }: ImpactPanelProps) {
  const [depth, setDepth] = useState(3);
  const analyzable = !!target && isCodeFile(targetFile(target));
  const { report, loading, error, refresh } = useCodeMapImpact(analyzable ? target : null, depth);
  const [reindexing, setReindexing] = useState(false);

  const reindex = useCallback(async () => {
    setReindexing(true);
    try {
      await fetch('/api/knowledge/reindex', { method: 'POST', headers: authHeaders() });
    } catch { /* l'état d'erreur du rafraîchissement suffira */ }
    setReindexing(false);
    refresh();
  }, [refresh]);

  const primary = report?.targets[0];
  const unresolved = !!report && report.targets.length === 0 && report.unresolved.length > 0;

  let body: React.ReactNode;
  if (!target) body = <Message>Ouvre un fichier de code pour voir son impact</Message>;
  else if (!analyzable) body = <Message>Pas de code à analyser dans ce fichier</Message>;
  else if (error) body = (
    <Message tone="error">
      <span>{error}</span>
      <button type="button" onClick={refresh} className="flex items-center gap-1 rounded px-2 py-1"
        style={{ border: '1px solid var(--border-base)', color: 'var(--text-muted)' }}>
        <RefreshCcw size={12} /> Réessayer
      </button>
    </Message>
  );
  else if (!report) body = <Skeleton />;
  else if (unresolved) body = (
    <Message>
      <span>Ce fichier ou symbole n'est pas encore dans la cartographie</span>
      <button type="button" onClick={reindex} disabled={reindexing} className="flex items-center gap-1 rounded px-2 py-1"
        style={{ border: '1px solid var(--border-base)' }}>
        <RefreshCcw size={12} /> {reindexing ? 'Réindexation…' : 'Réindexer'}
      </button>
    </Message>
  );
  else body = (
    <div style={{ opacity: loading ? 0.5 : 1 }} aria-busy={loading}>
      <ReportView report={report} onOpenFile={onOpenFile} />
    </div>
  );

  return (
    <section aria-label="Impact de la modification" className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-shrink-0 items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid var(--border-base)' }}>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{primary?.name ?? (target ? targetFile(target).split('/').pop() : 'Impact')}</div>
          {primary && <div className="text-xs" style={{ color: 'var(--text-dimmed)' }}>{primary.kind}</div>}
        </div>
        {report && !unresolved && (
          <span className="rounded px-2 py-0.5 text-xs font-semibold"
            style={{ color: riskColor(report.risk), border: `1px solid ${riskColor(report.risk)}` }}
            title={`Score de risque ${report.riskScore}/100`}>
            {riskLabel(report.risk)}
          </span>
        )}
        <label className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span className="sr-only">Profondeur</span>
          <select aria-label="Profondeur" value={depth} onChange={(e) => setDepth(Number(e.target.value))}
            className="rounded bg-transparent px-1" style={{ border: '1px solid var(--border-base)' }}>
            {DEPTHS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <button type="button" onClick={onTogglePin} aria-label={pinned ? 'Désépingler la cible' : 'Épingler la cible'}
          aria-pressed={pinned} style={{ color: pinned ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
          {pinned ? <PinOff size={14} /> : <Pin size={14} />}
        </button>
        <button type="button" onClick={onClose} aria-label="Fermer le panneau" style={{ color: 'var(--text-muted)' }}>
          <X size={14} />
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{body}</div>
    </section>
  );
}
```

- [ ] **Step 4 : vérifier le succès**

Run : `npx vitest run --config vitest.config.ts src/components/knowledge/ImpactPanel.test.tsx`
Attendu : PASS (10 tests). Si `getByText('FAIBLE')` trouve plusieurs nœuds, c'est un bug de rendu (le libellé ne doit apparaître que dans la puce) : corriger le composant, pas le test.

- [ ] **Step 5 : typage**

Run : `npm run typecheck`
Attendu : aucune erreur.

- [ ] **Step 6 : commit**

```bash
git add -- src/components/knowledge/ImpactPanel.tsx src/components/knowledge/ImpactPanel.test.tsx
git commit -m "feat(impact): composant ImpactPanel" -- src/components/knowledge/ImpactPanel.tsx src/components/knowledge/ImpactPanel.test.tsx
```

---

### Task 4 : branchement dans l'IDE (RightDock, menu contextuel, menu Outils, palette)

**Files :**
- Modify : `src/components/ide/CommandPalette.tsx` (imports lucide l. 4-7, `CommandPaletteProps` l. 33-44, `commands` l. 116-123)
- Modify : `src/components/ide/StatusBar.tsx` (imports lucide l. 10-26, `StatusBarProps` l. 45-63, destructuration ~l. 307-310, tableau du menu Outils après l'item `missions` ~l. 754-768)
- Modify : `src/views/IdeView.tsx` (`RightPanelName`/`openRightPanel` l. 236-251, `handleEditorMount` l. 822-845, `<RightDock>` l. 1257-1300, `<StatusBar>` ~l. 1316-1325, `<CommandPalette>` ~l. 1375-1387)
- Test : `src/components/ide/__tests__/CommandPalette.impact.test.tsx`

**Interfaces :**
- Consumes : `ImpactPanel`, `ImpactPanelProps` (tâche 3) ; `toWorkspacePath`, `buildImpactRef` (tâche 1) ; dans `IdeView` : `openRightPanel`, `toggleRightPanel`, `closeRightPanel`, `openFileAt(filePath, line?, column?)`, `editorPathRef`, `fileSystem.activePath`.
- Produces : `CommandPaletteProps.onAnalyzeImpact?: () => void` ; `StatusBarProps.onToggleImpact?: () => void` ; `RightPanelName` inclut `'impact'`.

- [ ] **Step 1 : écrire le test de la palette (échoue)**

`src/components/ide/__tests__/CommandPalette.impact.test.tsx` :

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommandPalette } from '../CommandPalette.js';

const base = {
  mode: 'commands' as const,
  openFiles: [],
  onOpenFile: vi.fn(),
  onClose: vi.fn(),
  onSave: vi.fn(),
  onFormat: vi.fn(),
  onToggleMinimap: vi.fn(),
  onToggleWordWrap: vi.fn(),
  onToggleSettings: vi.fn(),
  onShowDiff: vi.fn(),
};

describe('CommandPalette — analyse d’impact', () => {
  it('propose et déclenche « Analyser l’impact du fichier »', () => {
    const onAnalyzeImpact = vi.fn();
    render(<CommandPalette {...base} onAnalyzeImpact={onAnalyzeImpact} />);
    fireEvent.click(screen.getByText("Analyser l'impact du fichier"));
    expect(onAnalyzeImpact).toHaveBeenCalled();
    expect(base.onClose).toHaveBeenCalled();
  });

  it('n’affiche pas la commande sans gestionnaire', () => {
    render(<CommandPalette {...base} />);
    expect(screen.queryByText("Analyser l'impact du fichier")).toBeNull();
  });
});
```

Run : `npx vitest run --config vitest.config.ts src/components/ide/__tests__/CommandPalette.impact.test.tsx`
Attendu : FAIL — « Unable to find an element with the text: Analyser l'impact du fichier ». (Si le rendu échoue sur `Modal`/`Tooltip` faute de portail, lire `src/test/setup.ts` et `src/test/helpers.tsx` pour l'aide de rendu existante et l'utiliser.)

- [ ] **Step 2 : ajouter la commande dans `CommandPalette.tsx`**

Imports lucide : ajouter `Network` à la liste :

```ts
import {
  Search, Command, Save, WrapText, Map, AlignJustify, Network,
  X, ArrowUp, ArrowDown, CornerDownLeft,
} from 'lucide-react';
```

Dans `CommandPaletteProps`, après `onShowDiff: () => void;` :

```ts
  /** Ouvre le panneau d'impact sur le fichier actif (absent = commande masquée). */
  onAnalyzeImpact?: () => void;
```

Ajouter `onAnalyzeImpact` à la destructuration des props du composant, puis remplacer la fin du tableau `commands` et ses dépendances :

```tsx
    { id: 'diff',           label: 'Voir les différences',     description: 'Comparer le fichier actif avec la version sauvegardée', category: 'Fichier', icon: <Search size={14} />,                            action: () => { onShowDiff();       onClose(); } },
    ...(onAnalyzeImpact ? [
      { id: 'analyze-impact', label: "Analyser l'impact du fichier", description: 'Voir ce qu’une modification du fichier actif risque de casser', category: 'Fichier', icon: <Network size={14} />, action: () => { onAnalyzeImpact(); onClose(); } },
    ] : []),
  ], [onSave, onFormat, onToggleMinimap, onToggleWordWrap, onToggleSettings, onShowDiff, onAnalyzeImpact, onClose]);
```

Run : `npx vitest run --config vitest.config.ts src/components/ide/__tests__/CommandPalette.impact.test.tsx`
Attendu : PASS (2 tests).

- [ ] **Step 3 : ajouter l'entrée du menu Outils dans `StatusBar.tsx`**

Imports lucide : ajouter `Network,` dans la liste (avant `type LucideIcon`).

Dans `StatusBarProps`, après `onToggleTokenDetail?: () => void;` :

```ts
  onToggleImpact?: () => void;
```

Ajouter `onToggleImpact,` à la destructuration des props (à côté de `onToggleTokenDetail,`).

Dans le tableau des items du menu Outils, juste après l'objet `key: 'missions'` (avant `'divider'`) :

```ts
    {
      key: 'impact',
      icon: Network,
      label: 'Impact',
      description: 'Ce qu’une modification du fichier actif risque de casser',
      onClick: () => { onToggleImpact?.(); setShowToolsMenu(false); },
      iconColor: 'var(--color-warning)',
    },
```

- [ ] **Step 4 : brancher `IdeView.tsx`**

4a. Imports en tête de fichier (avec les autres imports de composants) :

```ts
import { ImpactPanel } from '../components/knowledge/ImpactPanel.js';
import { buildImpactRef, toWorkspacePath } from '../components/knowledge/impactModel.js';
```

4b. À côté des autres états de panneaux droits (`showTokenDetail`…) :

```ts
  const [showImpact, setShowImpact] = useState(false);
  // Cible épinglée du panneau d'impact (`fichier` ou `fichier#Symbole`) ;
  // null = la cible suit le fichier actif.
  const [impactPin, setImpactPin] = useState<string | null>(null);
```

4c. Remplacer le type et compléter `openRightPanel` :

```ts
  type RightPanelName =
    | 'search' | 'mcp' | 'vision' | 'skillsMonitor' | 'missions'
    | 'agents' | 'fleet' | 'telegram' | 'modelPicker' | 'tokenDetail' | 'impact';
```

et, dans le corps de `openRightPanel`, après `setShowTokenDetail(target === 'tokenDetail');` :

```ts
    setShowImpact(target === 'impact');
```

4d. Cible effective, juste après `closeRightPanel` :

```ts
  const impactTarget = impactPin ?? toWorkspacePath(fileSystem.activePath);
```

4e. Dans `handleEditorMount`, après l'action `Leanna-send-selection-to-ai` :

```ts
    editor.addAction({
      id: 'Leanna-analyze-impact',
      label: "Analyser l'impact",
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.6,
      run: (ed: any) => {
        const file = toWorkspacePath(editorPathRef.current);
        if (!file) return;
        const pos = ed.getPosition();
        const word = pos ? ed.getModel()?.getWordAtPosition(pos)?.word : null;
        setImpactPin(buildImpactRef(file, word));
        openRightPanel('impact');
      },
    });
```

et ajouter `openRightPanel` au tableau de dépendances du `useCallback` :

```ts
  }, [fileSystem.activePath, ideSettings, applySettingsToEditor, sendSelectionToAI, openRightPanel]);
```

4f. `<RightDock>` : ajouter `|| showImpact` à la condition `open` :

```tsx
              open={
                showGlobalSearch || showMcp || visionEnabled ||
                (showSkillsMonitor && connected) || showMissions || showAgents ||
                showFleet || showTelegram || showModelPicker || showTokenDetail || showImpact
              }
```

et, après le bloc `{showTokenDetail && (…)}` :

```tsx
              {showImpact && (
                <ImpactPanel
                  target={impactTarget}
                  pinned={impactPin !== null}
                  onTogglePin={() => setImpactPin((p) => (p !== null ? null : impactTarget))}
                  onOpenFile={(p, line) => { void openFileAt(p, line); }}
                  onClose={closeRightPanel}
                />
              )}
```

4g. `<StatusBar>` : après `onToggleTokenDetail={…}` :

```tsx
          onToggleImpact={() => { setImpactPin(null); toggleRightPanel('impact', showImpact); }}
```

4h. `<CommandPalette>` : après `onShowDiff={…}` :

```tsx
          onAnalyzeImpact={() => { setImpactPin(null); openRightPanel('impact'); }}
```

- [ ] **Step 5 : typage et suite front**

Run : `npm run typecheck`
Attendu : aucune erreur.

Run : `npm run test:ui`
Attendu : toute la suite passe (y compris les nouveaux tests des tâches 1 à 4).

- [ ] **Step 6 : vérification dans l'app**

Démarrer l'app via `preview_start` (configuration de `.claude/launch.json` ; la créer si absente avec la commande de dev du `package.json`). Puis vérifier, captures à l'appui :
1. Ouvrir `server/knowledge/types.ts` → menu Outils › Impact : le panneau affiche une puce de risque et des fichiers « Direct ».
2. Changer d'onglet vers un autre `.ts` : le panneau suit.
3. Clic droit sur un nom de fonction › « Analyser l'impact » : l'en-tête montre le symbole, l'épingle est active ; changer d'onglet ne change pas la cible.
4. Ouvrir un `.md` (non épinglé) : « Pas de code à analyser dans ce fichier ».
5. Cliquer un fichier impacté : il s'ouvre à la ligne indiquée.
6. Console du navigateur sans erreur (`read_console_messages`).

Si la cartographie est vide (index perdu), utiliser le bouton « Réindexer » du panneau — c'est le comportement prévu.

- [ ] **Step 7 : commit**

```bash
git add -- src/components/ide/CommandPalette.tsx src/components/ide/StatusBar.tsx src/views/IdeView.tsx src/components/ide/__tests__/CommandPalette.impact.test.tsx
git commit -m "feat(impact): panneau d'impact dans l'IDE (zone droite, clic droit, menu Outils, palette)" -- src/components/ide/CommandPalette.tsx src/components/ide/StatusBar.tsx src/views/IdeView.tsx src/components/ide/__tests__/CommandPalette.impact.test.tsx
```

---

## Couverture de la spec

| Spec | Tâche |
|---|---|
| §4.1 points d'entrée (StatusBar, palette, clic droit) | 4 (StatusBar = entrée du menu Outils, emplacement des autres bascules de panneau) |
| §4.2 cible, suivi/épinglage, normalisation, mot sous le curseur, non-code | 1 (`toWorkspacePath`, `buildImpactRef`, `isCodeFile`), 3 (épingle), 4 (état `impactPin`) |
| §4.3 en-tête, résumé, groupes, tests + copie, alertes | 1, 3 |
| §4.4 états | 3 |
| §4.5 accessibilité (section nommée, libellé texte du risque, boutons, ↑/↓) | 3 |
| §5 unités et intégration | 1-4 |
| §6 erreurs (non-2xx, status, annulation, périmé, Réessayer) | 2, 3 |
| §7 tests | 1-4 |
