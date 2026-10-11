import test from 'node:test';
import assert from 'node:assert/strict';
import { AUDIT_WORKFLOW_DEFINITION } from './audit-workflow.js';
import { planWorkflowWaves, type WorkflowStep } from '../skills/workflow.js';

const steps = AUDIT_WORKFLOW_DEFINITION.steps as unknown as WorkflowStep[];

test('audit-workflow: le DAG est valide (pas de cycle, deps existantes)', () => {
  // planWorkflowWaves lève si une dépendance est inexistante ou circulaire.
  assert.doesNotThrow(() => planWorkflowWaves(steps));
});

test('audit-workflow: les étapes légères démarrent dans la première vague', () => {
  const waves = planWorkflowWaves(steps);
  const firstWave = new Set(waves[0].map((s) => s.id));
  // git-check, check-missions, git-log-recent et generate-codebase n'ont
  // aucune dépendance → elles doivent toutes être dans la vague 1.
  assert.ok(firstWave.has('git-check'));
  assert.ok(firstWave.has('check-missions'));
  assert.ok(firstWave.has('git-log-recent'));
  assert.ok(firstWave.has('generate-codebase'));
});

test('audit-workflow: la chaîne lourde est sérialisée', () => {
  const waves = planWorkflowWaves(steps);
  const waveIndexOf = (id: string) => waves.findIndex((w) => w.some((s) => s.id === id));

  // generate-codebase < typecheck < run-tests < security-audit (ordre strict).
  assert.ok(waveIndexOf('generate-codebase') < waveIndexOf('typecheck'));
  assert.ok(waveIndexOf('typecheck') < waveIndexOf('run-tests'));
  assert.ok(waveIndexOf('run-tests') < waveIndexOf('security-audit'));
});

test('audit-workflow: save-report est la toute dernière étape (seul dans la dernière vague)', () => {
  const waves = planWorkflowWaves(steps);
  const lastWave = waves[waves.length - 1];
  assert.deepEqual(lastWave.map((s) => s.id), ['save-report']);
});

test('audit-workflow: la parallélisation réduit le nombre de vagues', () => {
  const waves = planWorkflowWaves(steps);
  // 8 étapes. En séquentiel pur ce serait 8 vagues. Avec le DAG, les étapes
  // légères fusionnent dans la chaîne lourde → strictement moins de 8 vagues.
  assert.ok(waves.length < steps.length, `attendu < ${steps.length} vagues, obtenu ${waves.length}`);
});
