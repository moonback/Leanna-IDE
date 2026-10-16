/**
 * MissionControlView — AUDIT-018 : aucune mission ne démarre sans simulation
 * préalable et confirmation explicite.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import MissionControlView from './MissionControlView.js';
import { ConfirmDialogProvider } from '../components/ui/ConfirmDialog.js';
import { mockFetchRouter, jsonResponse } from '../test/helpers.js';

vi.mock('../hooks/useAutonomyTimeline.js', () => ({
  useAutonomyTimeline: () => ({
    state: null,
    connection: 'open',
    proposals: [{
      proposalId: 'p1', kind: 'problem', importance: 1, priority: 'high',
      message: 'Cycles de dépendance détectés', affectedResources: [],
      suggestedAction: 'Casser les cycles', queuedAsTask: false,
    }],
  }),
}));

function setup() {
  return mockFetchRouter([
    { match: '/api/missions/simulate', respond: () => jsonResponse({ status: 'success', summary: 'Plan en 2 étapes', filesWouldChange: ['src/a.ts'], riskLevel: 'medium' }) },
    { match: '/api/missions/autonomy', respond: () => jsonResponse({ mode: 'auto', enabled: true }) },
    { match: /\/api\/missions$/, respond: () => jsonResponse({ status: 'success', missionId: 'm1' }) },
  ]);
}

const renderView = () => render(
  <MemoryRouter>
    <ConfirmDialogProvider>
      <MissionControlView embedded />
    </ConfirmDialogProvider>
  </MemoryRouter>,
);

const missionPosts = (fetchMock: ReturnType<typeof setup>) =>
  fetchMock.mock.calls.filter(([url, init]) => /\/api\/missions$/.test(String(url)) && init?.method === 'POST');

describe('MissionControlView — lancement de mission', () => {
  it('simule et affiche la confirmation avant tout POST /api/missions', async () => {
    const fetchMock = setup();
    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByRole('button', { name: /Simuler et lancer/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('src/a.ts');
    expect(dialog).toHaveTextContent("Mode d'autonomie : auto");
    expect(missionPosts(fetchMock)).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Exécuter' }));
    await waitFor(() => expect(missionPosts(fetchMock)).toHaveLength(1));
  });

  it("n'envoie rien si l'utilisateur annule", async () => {
    const fetchMock = setup();
    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByRole('button', { name: /Simuler et lancer/ }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(missionPosts(fetchMock)).toHaveLength(0);
    expect(screen.getByRole('button', { name: /Simuler et lancer/ })).toBeEnabled();
  });
});
