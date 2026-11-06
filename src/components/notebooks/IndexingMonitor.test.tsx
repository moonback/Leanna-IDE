import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { IndexingMonitor } from './IndexingMonitor.js';
import { renderWithProviders, mockFetchRouter, jsonResponse } from '../../test/helpers.js';

describe('IndexingMonitor', () => {
  beforeEach(() => localStorage.clear());

  it('affiche les compteurs et relance uniquement la source choisie', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetchRouter([
      {
        match: '/embeddings/indexing-status',
        respond: () => jsonResponse({
          status: 'success',
          indexing: {
            total: 2, indexed: 1, pending: 0, partial: 0, failed: 1, attempts: 5,
            sources: [
              { id: 'source-ok', title: 'Document indexé', type: 'pdf', indexingStatus: 'indexed', indexingAttempts: 1 },
              { id: 'source-ko', title: 'Document en erreur', type: 'url', indexingStatus: 'failed', indexingAttempts: 4, indexingError: 'Provider indisponible' },
            ],
          },
        }),
      },
      {
        match: '/sources/source-ko/retry',
        respond: () => jsonResponse({ status: 'accepted', sourceId: 'source-ko' }, { status: 202 }),
      },
    ], () => jsonResponse({}));

    renderWithProviders(<IndexingMonitor notebookId="nb-1" />);

    expect(await screen.findByText('Document indexé')).toBeInTheDocument();
    expect(screen.getByText('Document en erreur')).toBeInTheDocument();
    expect(screen.getByText('Provider indisponible')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url, init]) =>
        String(url).includes('/sources/source-ko/retry') && (init as RequestInit)?.method === 'POST',
      )).toBe(true);
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/sources/source-ok/retry'))).toBe(false);
  });
  it('permet de relancer une source historique dont le statut est inconnu', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetchRouter([
      {
        match: '/embeddings/indexing-status',
        respond: () => jsonResponse({
          status: 'success',
          indexing: {
            total: 1, indexed: 0, pending: 0, partial: 0, failed: 0, attempts: 0,
            sources: [{ id: 'legacy-source', title: 'Ancienne source', type: 'pdf', indexingStatus: 'unknown', indexingAttempts: 0 }],
          },
        }),
      },
      {
        match: '/sources/legacy-source/retry',
        respond: () => jsonResponse({ status: 'accepted', sourceId: 'legacy-source' }, { status: 202 }),
      },
    ], () => jsonResponse({}));

    renderWithProviders(<IndexingMonitor notebookId="nb-legacy" />);

    expect(await screen.findByText('Ancienne source')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url, init]) =>
        String(url).includes('/sources/legacy-source/retry') && (init as RequestInit)?.method === 'POST',
      )).toBe(true);
    });
  });

});
