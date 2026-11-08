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
