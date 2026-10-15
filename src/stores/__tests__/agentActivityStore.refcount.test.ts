import {
  initActivityStore, destroyActivityStore, getAgentTasks,
} from '../agentActivityStore.js';

function emitTask(id: string) {
  window.dispatchEvent(new CustomEvent('Leanna-agent-event', {
    detail: { type: 'agent_event', taskId: id, role: 'coder', title: id, agentName: 'Dev', status: 'running' },
  }));
}

describe('agentActivityStore — comptage des montages', () => {
  afterEach(() => destroyActivityStore(true));

  it("reste actif tant qu'un consommateur est monté", () => {
    initActivityStore(); // ex. shell v3
    initActivityStore(); // ex. IdeView
    emitTask('a');
    destroyActivityStore(); // IdeView se démonte
    emitTask('b');
    expect(getAgentTasks().map(t => t.id)).toEqual(['a', 'b']);
  });

  it('se détruit au départ du dernier consommateur', () => {
    initActivityStore();
    emitTask('a');
    destroyActivityStore();
    expect(getAgentTasks()).toEqual([]);
    emitTask('b');
    expect(getAgentTasks()).toEqual([]);
  });

  it('force=true ignore le compteur (arrêt de l\'app)', () => {
    initActivityStore();
    initActivityStore();
    destroyActivityStore(true);
    emitTask('a');
    expect(getAgentTasks()).toEqual([]);
  });
});
