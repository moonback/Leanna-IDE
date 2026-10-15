import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { CodeMapImpactReport } from '../../types/codeMap.js';

const hookState = {
  report: null as CodeMapImpactReport | null,
  loading: false,
  error: null as string | null,
  refresh: vi.fn(),
  targets: [] as (string | null)[],
  byTarget: null as Record<string, CodeMapImpactReport> | null,
};
vi.mock('../../hooks/useCodeMapImpact.js', () => ({
  useCodeMapImpact: (t: string | null) => {
    hookState.targets.push(t);
    return hookState.byTarget && t ? { ...hookState, report: hookState.byTarget[t] ?? null } : hookState;
  },
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
  hookState.targets = [];
  hookState.byTarget = null;
});

describe('ImpactPanel — symbole non suivi', () => {
  it('retombe sur le fichier quand fichier#Symbole est introuvable, avec une note', () => {
    hookState.byTarget = {
      'src/a.ts#log': baseReport({ targets: [], unresolved: ['src/a.ts#log'] }),
      'src/a.ts': baseReport(),
    };
    render(<ImpactPanel {...props({ target: 'src/a.ts#log', pinned: true })} />);
    expect(hookState.targets.at(-1)).toBe('src/a.ts');
    expect(screen.getByText('Symbole « log » non suivi par la cartographie : impact du fichier affiché')).toBeTruthy();
  });

  it('ne retombe pas sur un rapport d’une autre cible', () => {
    hookState.report = baseReport({ targets: [], unresolved: ['src/old.ts#x'] });
    render(<ImpactPanel {...props({ target: 'src/a.ts#log', pinned: true })} />);
    expect(hookState.targets.at(-1)).toBe('src/a.ts#log');
  });
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
