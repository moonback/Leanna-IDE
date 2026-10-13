/**
 * MissionDetail — plan d'exécution en direct et délégations proposées.
 *
 *  - le plan de l'agent (trace du runtime) s'affiche avec le statut par étape ;
 *  - une délégation proposée se lance via POST /api/agents/delegate.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MissionDetail, type MissionDetailData } from './MissionDetail.js';
import { renderWithProviders, mockFetchRouter, jsonResponse } from '../../test/helpers.js';

const TASK: MissionDetailData = {
  id: 'task-1',
  role: 'coder',
  title: 'Ajouter la pagination',
  status: 'completed',
  execution: {
    intent: 'Paginer la liste des missions',
    successCriteria: ['typecheck à 0 erreur'],
    steps: [
      { description: 'Lire le composant de liste', status: 'done' },
      { description: 'Ajouter la pagination', status: 'done' },
      { description: 'Vérifier le typecheck', status: 'failed' },
    ],
    budget: {
      iterations: 4, maxIterations: 12, toolCalls: 9, maxToolCalls: 30,
      readCalls: 3, writeCalls: 2, verifyCalls: 3, recoveryCalls: 1,
    },
    recoveries: 1,
    replans: 0,
  },
  result: {
    success: false,
    outcome: 'partial',
    summary: 'Pagination ajoutée, typecheck en échec.',
    filesModified: ['src/List.tsx'],
    fileValidationErrors: [],
    suggestions: [],
    delegatedSubTasks: [],
    proposedDelegations: [{ role: 'tester', reason: 'Couvrir la pagination par des tests', files: ['src/List.tsx'] }],
  },
};

describe('MissionDetail — plan et délégations', () => {
  beforeEach(() => localStorage.clear());

  it("affiche le plan d'exécution avec le statut de chaque étape", async () => {
    mockFetchRouter([{ match: '/api/agents/tasks/task-1', respond: () => jsonResponse({ task: TASK }) }]);
    renderWithProviders(<MissionDetail taskId="task-1" status="completed" color="#4f8cff" />);

    expect(await screen.findByText('Paginer la liste des missions')).toBeInTheDocument();
    expect(screen.getByText('Vérifier le typecheck')).toBeInTheDocument();
    expect(screen.getAllByText('Fait')).toHaveLength(2);
    expect(screen.getByText('Échec')).toBeInTheDocument();
    expect(screen.getByText('1 récupération')).toBeInTheDocument();
  });

  it('lance une délégation proposée en un clic', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetchRouter([
      { match: '/api/agents/tasks/task-1', respond: () => jsonResponse({ task: TASK }) },
      { match: '/api/agents/delegate', respond: () => jsonResponse({ taskId: 't2', role: 'tester', status: 'pending' }) },
    ]);
    renderWithProviders(<MissionDetail taskId="task-1" status="completed" color="#4f8cff" />);

    await user.click(await screen.findByRole('button', { name: /Lancer/ }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Lancée (tester)'));
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/agents/delegate'));
    const body = JSON.parse(String(call?.[1]?.body));
    expect(body).toMatchObject({ role: 'tester', files: ['src/List.tsx'] });
    expect(body.description).toContain('Ajouter la pagination');
  });
});
