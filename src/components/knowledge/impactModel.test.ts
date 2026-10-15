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
