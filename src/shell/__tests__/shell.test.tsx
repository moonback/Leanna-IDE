import { screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { renderWithProviders, mockFetchRouter, jsonResponse } from '../../test/helpers.js';
import { CockpitShell } from '../CockpitShell.js';
import { toShellMissions, summarizeAgentTasks, basename } from '../useShellData.js';
import { activityText } from '../BottomBar.js';
import type { AgentTaskEntry } from '../../stores/agentActivityStore.js';

function task(partial: Partial<AgentTaskEntry>): AgentTaskEntry {
  return {
    id: Math.random().toString(36).slice(2), role: 'coder', title: 'Tâche', status: 'running',
    agentName: 'Développeur', timestamp: Date.now(), steps: [], ...partial,
  };
}

describe('helpers du shell', () => {
  it('toShellMissions garde les missions vivantes et calcule la progression', () => {
    const missions = toShellMissions([
      { id: 'a', title: 'Refonte', status: 'in_progress', goals: [{ status: 'completed' }, { status: 'completed' }, { status: 'pending' }, { status: 'pending' }] },
      { id: 'b', title: 'Pause', status: 'in_progress', paused: true, goals: [] },
      { id: 'c', title: 'Finie', status: 'completed', goals: [{ status: 'completed' }] },
      { title: 'Sans id', status: 'pending' },
    ]);
    expect(missions).toEqual([
      { id: 'a', title: 'Refonte', status: 'in_progress', progress: 50 },
      { id: 'b', title: 'Pause', status: 'paused', progress: null },
    ]);
  });

  it('summarizeAgentTasks ne compte que les tâches vivantes, par rôle', () => {
    const s = summarizeAgentTasks([
      task({ role: 'coder', timestamp: 1 }),
      task({ role: 'coder', timestamp: 3 }),
      task({ role: 'tester', status: 'pending', timestamp: 2 }),
      task({ role: 'security', status: 'completed' }),
    ]);
    expect(s.activeRoles).toBe(2);
    expect(s.live.map(t => t.timestamp)).toEqual([3, 2, 1]);
  });

  it('activityText décrit l\'activité en cours', () => {
    expect(activityText(summarizeAgentTasks([]))).toBe('Aucune tâche en cours');
    expect(activityText(summarizeAgentTasks([task({}), task({})]))).toBe('2 agents exécutent des tâches en parallèle');
    expect(activityText(summarizeAgentTasks([task({ status: 'pending' })]))).toBe('1 tâche(s) en attente');
  });

  it('basename gère les chemins Windows et POSIX', () => {
    expect(basename('C:\\Users\\Mayss\\Desktop\\Leanna-ide\\')).toBe('Leanna-ide');
    expect(basename('/home/dev/projet')).toBe('projet');
  });
});

describe('CockpitShell', () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetchRouter([
      { match: '/api/health', respond: () => jsonResponse({ status: 'ok' }) },
      { match: '/api/system/metrics', respond: () => jsonResponse({
        cpu: { percent: 12, cores: 8 },
        memory: { totalMB: 16384, usedMB: 8192, percent: 50 },
        process: { rssMB: 300, uptimeSeconds: 10 },
      }) },
      { match: '/api/missions', respond: () => jsonResponse({ missions: [
        { id: 'm1', title: 'Correction des bugs', status: 'in_progress', goals: [{ status: 'completed' }, { status: 'pending' }] },
      ] }) },
      { match: '/api/git/status', respond: () => jsonResponse({ branch: 'main', files: [{}, {}] }) },
      { match: '/api/workspace', respond: () => jsonResponse({ workspace: 'C:\\dev\\Leanna-ide', exists: true }) },
    ]);
  });

  function renderShell(path: string) {
    return renderWithProviders(
      <MemoryRouter initialEntries={[path]}>
        <CockpitShell nav={<nav aria-label="Navigation test" />}>
          <main>Contenu</main>
        </CockpitShell>
      </MemoryRouter>,
    );
  }

  it('affiche les données réelles hors IDE (rail ouvert par défaut, barre du bas)', async () => {
    renderShell('/pilotage');
    expect(await screen.findByText('Système actif')).toBeInTheDocument();
    expect(await screen.findByRole('progressbar', { name: 'Correction des bugs' })).toHaveAttribute('aria-valuenow', '50');
    expect(await screen.findByRole('meter', { name: 'RAM' })).toHaveAttribute('aria-valuenow', '50');
    expect(await screen.findByText('Workspace : Leanna-ide')).toBeInTheDocument();
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('Aucun agent actif. Les agents apparaissent ici dès qu\'une tâche démarre.')).toBeInTheDocument();
  });

  it('agents : le rail et la TopBar suivent les événements du store', async () => {
    renderShell('/pilotage');
    act(() => {
      window.dispatchEvent(new CustomEvent('Leanna-agent-event', {
        detail: { type: 'agent_event', taskId: 't1', role: 'tester', title: 'Lancer les tests', agentName: 'Testeur', status: 'running' },
      }));
    });
    expect(await screen.findByText('Lancer les tests')).toBeInTheDocument();
    expect(screen.getByText('Testeur')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1 agent actif' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('1 agent exécute une tâche')).toBeInTheDocument();
  });

  it("dans l'IDE : rail fermé par défaut, pas de barre du bas, bascule persistée", async () => {
    renderShell('/ide');
    expect(screen.queryByRole('complementary', { name: 'Agents, missions et ressources' })).not.toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Afficher le panneau Agents & missions' }));
    expect(screen.getByRole('complementary', { name: 'Agents, missions et ressources' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('Leanna_shell_v3_prefs')!).rightRail.ide).toBe(true);
  });

  it('le bouton de recherche ouvre la palette de commandes', async () => {
    const onOpen = vi.fn();
    window.addEventListener('Leanna-open-command-palette', onOpen);
    renderShell('/pilotage');
    await userEvent.click(screen.getByRole('button', { name: /Rechercher une vue/ }));
    expect(onOpen).toHaveBeenCalledOnce();
    window.removeEventListener('Leanna-open-command-palette', onOpen);
  });
});
