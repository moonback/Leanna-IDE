/**
 * Test de CARACTÉRISATION d'AudioOverviewPanel après découpage (Phase 2).
 *
 * Verrouille le comportement observable du flux de génération à travers la
 * nouvelle structure (parent orchestrateur + AudioGenerator présentationnel) :
 *  - le bouton « Générer le podcast » émet un POST vers /audio-overview ;
 *  - au succès (status ready), un toast s'affiche et onRefresh est appelé.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { AudioOverviewPanel } from './AudioOverviewPanel.js';
import { renderWithProviders, mockFetchRouter, jsonResponse, sseResponse } from '../../test/helpers.js';

const SOURCES = [{ id: 'src-1', title: 'Source A' }];

describe('AudioOverviewPanel — génération (caractérisation après découpage)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('génère un podcast et rafraîchit la liste', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const fetchMock = mockFetchRouter(
      [
        {
          match: '/audio-overviews/ov-1/audio',
          respond: () => sseResponse([
            'event: start\ndata: {"total":2}\n\n',
            'event: done\ndata: {"overview":{"id":"ov-1","audioReady":true}}\n\n',
          ]),
        },
        {
          match: '/audio-overview',
          respond: () =>
            jsonResponse({
              overview: {
                id: 'ov-1',
                title: 'Mon podcast',
                script: 'Leanna: Bonjour.\nNoah: Salut.',
                hostName: 'Leanna',
                coHostName: 'Noah',
                estimatedDuration: 300,
                status: 'ready',
                createdAt: new Date().toISOString(),
              },
            }),
        },
      ],
      () => jsonResponse({}),
    );

    renderWithProviders(
      <AudioOverviewPanel
        notebookId="nb-1"
        overviews={[]}
        sources={SOURCES}
        onRefresh={onRefresh}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Générer le podcast/ }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) =>
        String(url).includes('/api/notebooks/nb-1/audio-overview'),
      );
      expect(call).toBeTruthy();
      const init = call![1] as RequestInit;
      expect(init.method).toBe('POST');
    });

    expect(await screen.findByText('Audio Overview généré !')).toBeInTheDocument();
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());

    // Le fichier audio à deux voix est rendu automatiquement après le script.
    expect(await screen.findByText('Audio du podcast prêt !')).toBeInTheDocument();
    const renderCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/audio-overviews/ov-1/audio'));
    expect((renderCall![1] as RequestInit).method).toBe('POST');
  });
});
