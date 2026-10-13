/**
 * MissionPanel — synchronisation serveur, statuts et actions.
 *
 *  - une mission en pause côté serveur reste affichée « En pause » ;
 *  - une mission annulée est libellée « Annulée » et classée dans l'historique ;
 *  - les filtres actives / terminées restreignent la liste ;
 *  - « Relancer » appelle POST /api/missions/:id/retry.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MissionPanel } from './MissionPanel.js';
import { renderWithProviders, mockFetchRouter, jsonResponse } from '../../test/helpers.js';

const MISSIONS = [
  {
    id: 'm-live', title: 'Refactor du routeur', description: 'Découper le routeur', status: 'in_progress', paused: true,
    priority: 'high', goals: [], activeGoalId: null, confidence: 0.8,
    metrics: { totalActions: 2, successfulActions: 2, failedActions: 0 },
    createdAt: '2026-10-13T10:00:00.000Z', durationMs: 65_000,
  },
  {
    id: 'm-cancel', title: 'Migration SQL', description: 'Migrer le schéma', status: 'cancelled', paused: false,
    priority: 'medium', goals: [], activeGoalId: null, confidence: 0.3,
    metrics: { totalActions: 1, successfulActions: 0, failedActions: 1 },
    createdAt: '2026-10-13T09:00:00.000Z', completedAt: '2026-10-13T09:01:00.000Z',
    lastError: { action: 'run_project_command', error: 'exit 1' }, errorCount: 1,
    selfEvaluation: { overall: 35, scores: { planAccuracy: 30 }, notes: [], nextTimeStartWith: 'lire le schéma' },
  },
];

function setup() {
  return mockFetchRouter([
    { match: /\/api\/missions\/m-cancel\/retry$/, respond: () => jsonResponse({ missionId: 'm-new', retriedFrom: 'm-cancel' }) },
    { match: '/api/missions/pending-resumes', respond: () => jsonResponse({ pending: [] }) },
    { match: /\/api\/missions$/, respond: () => jsonResponse({ missions: MISSIONS }) },
  ]);
}

describe('MissionPanel', () => {
  beforeEach(() => localStorage.clear());

  it('affiche la pause serveur et classe une mission annulée dans l’historique', async () => {
    setup();
    const user = userEvent.setup();
    renderWithProviders(<MissionPanel inline />);

    expect(await screen.findByText('En pause')).toBeInTheDocument();
    expect(screen.getByText('Annulée')).toBeInTheDocument();

    // Les cartes retirées sortent avec une animation : on attend leur départ.
    await user.click(screen.getByRole('tab', { name: /terminées/ }));
    await waitFor(() => expect(screen.queryByText('Refactor du routeur')).not.toBeInTheDocument());
    expect(screen.getByText('Migration SQL')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /actives/ }));
    await waitFor(() => expect(screen.queryByText('Migration SQL')).not.toBeInTheDocument());
    expect(screen.getByText('Refactor du routeur')).toBeInTheDocument();
  });

  it('montre la dernière erreur et l’auto-évaluation, puis relance la mission', async () => {
    const fetchMock = setup();
    const user = userEvent.setup();
    renderWithProviders(<MissionPanel inline />);

    const title = await screen.findByText('Migration SQL');
    await user.click(title);
    expect(await screen.findByText('exit 1')).toBeInTheDocument();
    expect(screen.getByText('35/100')).toBeInTheDocument();
    expect(screen.getByText('lire le schéma')).toBeInTheDocument();

    const card = title.closest('[role="button"]') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: /Relancer la mission/ }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url, init]) =>
        String(url).endsWith('/api/missions/m-cancel/retry') && init?.method === 'POST')).toBe(true),
    );
  });
});
