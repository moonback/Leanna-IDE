import test from 'node:test';
import assert from 'node:assert/strict';
import { missionSkill, updateMissionSkills, initMissionSystem } from './mission.js';

test('missionSkill: missions interrompues par un redémarrage visibles et pilotables depuis la conversation', async () => {
  const pending = [{ missionId: 'm1', title: 'Refonte', priority: 'high', status: 'in_progress', updatedAt: '2026-11-08' }];
  const decisions: string[] = [];
  const fakeExecutor: any = {
    listActiveMissions: () => [],
    listCompletedMissions: () => [],
    getMission: () => undefined,
    listPendingResumes: () => pending,
    resumeMission: () => false,
    cancelMission: () => false,
    confirmResume: (id: string, d: string) => { decisions.push(`${id}:${d}`); return true; },
  };
  initMissionSystem(fakeExecutor, []);

  const list: any = await missionSkill.handleToolCall!('mission_list', {});
  assert.equal(list.interrupted.length, 1);
  assert.equal(list.interrupted[0].status, 'interrupted');
  assert.equal(list.total, 1);

  const status: any = await missionSkill.handleToolCall!('mission_status', { missionId: 'm1' });
  assert.equal(status.status, 'interrupted');
  assert.equal(status.awaitingDecision, true);

  const resumed: any = await missionSkill.handleToolCall!('mission_resume', { missionId: 'm1' });
  assert.equal(resumed.success, true);
  await missionSkill.handleToolCall!('mission_cancel', { missionId: 'm1' });
  assert.deepEqual(decisions, ['m1:reactivate', 'm1:delete']);
});

test('missionSkill: metadata and skills update', () => {
  assert.equal(missionSkill.name, 'mission');
  const declNames = missionSkill.declarations.map((d: any) => d.name);
  assert.ok(declNames.includes('mission_create'));
  assert.ok(declNames.includes('mission_status'));

  assert.doesNotThrow(() => {
    updateMissionSkills(['skill1', 'skill2']);
  });
});

test('mission_create: transmet le pont navigateur uniquement avec un contexte UI complet', async () => {
  const readPending = new Map<string, any>();
  const actionPending = new Map<string, any>();
  const emitted: any[] = [];
  let captured: any;
  const fakeExecutor: any = {
    startMission: async (params: any) => {
      captured = params;
      return {
        id: 'mission-ui',
        status: 'running',
        getState: () => ({ title: params.title }),
      };
    },
  };
  initMissionSystem(fakeExecutor, ['read_project_file']);

  const context: any = {
    emitIdeAction: (action: any) => emitted.push(action),
    browserReadPending: readPending,
    browserActionPending: actionPending,
  };
  const result: any = await missionSkill.handleToolCall!('mission_create', {
    title: 'Parcourir la page',
    description: 'Ouvrir la page et vérifier son contenu',
  }, context);

  assert.equal(result.missionId, 'mission-ui');
  assert.equal(captured.browserContext.emitIdeAction, context.emitIdeAction);
  assert.equal(captured.browserContext.browserReadPending, readPending);
  assert.equal(captured.browserContext.browserActionPending, actionPending);
  captured.browserContext.emitIdeAction({ type: 'probe' });
  assert.deepEqual(emitted, [{ type: 'probe' }]);
  assert.ok(captured.availableSkills.includes('browser_click'));
  assert.ok(captured.availableSkills.includes('browser_get_console'));

  await missionSkill.handleToolCall!('mission_create', {
    title: 'Mission autonome',
    description: 'Lire un fichier du projet',
  });
  assert.equal(captured.browserContext, undefined);
  assert.deepEqual(captured.availableSkills, ['read_project_file']);
});
