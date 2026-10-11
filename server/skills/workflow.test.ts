import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorkflow,
  getWorkflow,
  toggleWorkflow,
  deleteWorkflow,
  executeWorkflow,
  setWorkflowSkillHandler,
  planWorkflowWaves,
  type WorkflowDefinition,
  type WorkflowStep,
} from './workflow.js';

test('workflow: CRUD operations', async () => {

  const wf = await createWorkflow({
    name: 'Test Workflow',
    description: 'Unit test workflow',
    steps: [
      { id: 's1', action: 'time_get_current_time', args: {} }
    ]
  });

  assert.ok(wf.id);
  assert.equal(wf.name, 'Test Workflow');

  const fetched = getWorkflow(wf.id);
  assert.ok(fetched);
  assert.equal(fetched.name, 'Test Workflow');

  const toggled = await toggleWorkflow(wf.id, false);
  assert.ok(toggled);
  assert.equal(toggled.enabled, false);

  const deleted = await deleteWorkflow(wf.id);
  assert.equal(deleted, true);
  assert.equal(getWorkflow(wf.id), undefined);
});

// ─── Helper: fabrique un WorkflowDefinition minimal ───────────────────────────
function makeWorkflow(steps: WorkflowStep[], overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    id: 'wf-test-' + Math.random().toString(36).slice(2),
    name: 'inline',
    description: '',
    steps,
    enabled: true,
    createdAt: Date.now(),
    ...overrides,
  };
}

test('planWorkflowWaves: séquentiel pur quand aucun dependsOn', () => {
  const steps: WorkflowStep[] = [
    { id: 'a', action: 'x', args: {} },
    { id: 'b', action: 'y', args: {} },
    { id: 'c', action: 'z', args: {} },
  ];
  const waves = planWorkflowWaves(steps);
  // Une étape par vague, dans l'ordre.
  assert.deepEqual(waves.map((w) => w.map((s) => s.id)), [['a'], ['b'], ['c']]);
});

test('planWorkflowWaves: regroupe les étapes indépendantes en vagues parallèles', () => {
  const steps: WorkflowStep[] = [
    { id: 'a', action: 'x', args: {} },
    { id: 'b', action: 'y', args: {} },
    { id: 'final', action: 'z', args: {}, dependsOn: ['a', 'b'] },
  ];
  const waves = planWorkflowWaves(steps);
  assert.equal(waves.length, 2);
  assert.deepEqual(waves[0].map((s) => s.id).sort(), ['a', 'b']); // vague parallèle
  assert.deepEqual(waves[1].map((s) => s.id), ['final']);
});

test('planWorkflowWaves: détecte une dépendance circulaire', () => {
  const steps: WorkflowStep[] = [
    { id: 'a', action: 'x', args: {}, dependsOn: ['b'] },
    { id: 'b', action: 'y', args: {}, dependsOn: ['a'] },
  ];
  assert.throws(() => planWorkflowWaves(steps), /circulaire/i);
});

test('planWorkflowWaves: rejette une dépendance inexistante', () => {
  const steps: WorkflowStep[] = [
    { id: 'a', action: 'x', args: {}, dependsOn: ['ghost'] },
  ];
  assert.throws(() => planWorkflowWaves(steps), /n'existe pas/i);
});

test('executeWorkflow: résout les templates imbriqués (prev + steps profonds)', async () => {
  const calls: Array<{ name: string; args: any }> = [];
  setWorkflowSkillHandler(async (name, args) => {
    calls.push({ name, args });
    if (name === 'produce') {
      return { summary: { total: 42, critical: 3 }, branch: 'main' };
    }
    return { ok: true };
  });

  const wf = makeWorkflow([
    { id: 'src', action: 'produce', args: {} },
    {
      id: 'consume',
      action: 'consume',
      args: {
        // Accès imbriqué sur le résultat d'une étape nommée
        total: '{{steps.src.result.summary.total}}',
        // Interpolation dans une chaîne + accès prev imbriqué
        label: 'branche={{prev.result.branch}} critiques={{steps.src.result.summary.critical}}',
      },
    },
  ]);

  const result = await executeWorkflow(wf);
  assert.equal(result.status, 'success');

  const consumeCall = calls.find((c) => c.name === 'consume');
  assert.ok(consumeCall);
  // Référence pleine → valeur brute (number), pas une string
  assert.equal(consumeCall.args.total, 42);
  assert.equal(consumeCall.args.label, 'branche=main critiques=3');
});

test('executeWorkflow: DAG parallèle — final reçoit les résultats de ses dépendances', async () => {
  let finalArgs: any = null;
  setWorkflowSkillHandler(async (name, args) => {
    if (name === 'a') return { v: 'A' };
    if (name === 'b') return { v: 'B' };
    if (name === 'final') { finalArgs = args; return { done: true }; }
    return {};
  });

  const wf = makeWorkflow([
    { id: 'a', action: 'a', args: {} },
    { id: 'b', action: 'b', args: {} },
    {
      id: 'final',
      action: 'final',
      args: { fromA: '{{steps.a.result.v}}', fromB: '{{steps.b.result.v}}' },
      dependsOn: ['a', 'b'],
    },
  ]);

  const result = await executeWorkflow(wf);
  assert.equal(result.status, 'success');
  assert.equal(result.steps.length, 3);
  assert.ok(finalArgs);
  assert.equal(finalArgs.fromA, 'A');
  assert.equal(finalArgs.fromB, 'B');
});

test('executeWorkflow: onError=stop interrompt les vagues suivantes', async () => {
  const executed: string[] = [];
  setWorkflowSkillHandler(async (name) => {
    executed.push(name);
    if (name === 'boom') throw new Error('explosion');
    return { ok: true };
  });

  const wf = makeWorkflow([
    { id: 's1', action: 'boom', args: {}, onError: 'stop' },
    { id: 's2', action: 'after', args: {} },
  ]);

  const result = await executeWorkflow(wf);
  assert.equal(result.status, 'failed');
  // s2 ne doit jamais s'exécuter
  assert.ok(!executed.includes('after'));
});

test('executeWorkflow: onError=skip poursuit et marque le run partiel', async () => {
  setWorkflowSkillHandler(async (name) => {
    if (name === 'boom') throw new Error('explosion');
    return { ok: true };
  });

  const wf = makeWorkflow([
    { id: 's1', action: 'boom', args: {}, onError: 'skip' },
    { id: 's2', action: 'after', args: {} },
  ]);

  const result = await executeWorkflow(wf);
  assert.equal(result.status, 'partial');
  assert.equal(result.steps.find((s) => s.stepId === 's1')?.status, 'failed');
  assert.equal(result.steps.find((s) => s.stepId === 's2')?.status, 'success');
});
