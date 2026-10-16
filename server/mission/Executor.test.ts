import test from 'node:test';
import assert from 'node:assert/strict';
import { Executor } from './Executor.js';

test('Executor emits an explicit plan before mission start', async () => {
  const events: string[] = [];
  let plan: Record<string, unknown> | undefined;
  const executor = new Executor();
  executor.setSkillHandler(async () => null);
  executor.setEventEmitter((event, data) => {
    events.push(event);
    if (event === 'mission_plan') plan = data.plan as Record<string, unknown>;
  });

  await executor.startMission({
    title: 'Inspect server.ts',
    description: 'Analyser server.ts et vérifier les conditions de déploiement.',
    availableSkills: [],
  });

  assert.equal(events[0], 'mission_plan');
  assert.equal(events[1], 'mission_started');
  assert.ok(plan);
  for (const key of ['objectives', 'targetedFiles', 'tools', 'risks', 'estimatedTokens', 'stopConditions']) {
    assert.ok(key in plan);
  }
  assert.deepEqual(plan.targetedFiles, ['server.ts']);
});

test('Executor exposes a completion promise for autonomous callers', async () => {
  const executor = new Executor();
  executor.setSkillHandler(async () => null);
  const mission = await executor.startMission({
    title: 'Autonomy completion',
    description: 'Verify that autonomous callers observe a terminal mission state.',
    availableSkills: [],
  });

  const completed = await executor.waitForMission(mission.id);
  assert.ok(completed);
  assert.ok(['completed', 'failed'].includes(completed.status));
  const learning = executor.getLearningResult(mission.id);
  assert.ok(learning, 'terminal missions should produce reviewable learning proposals');
  assert.deepEqual(learning.improvementsApplied, [], 'mission finalization must not auto-apply learning proposals');
});

// ─── Sprint 3 : skill mission complété + plafonnement du Planner ─────────────

test('Executor caps sub-goals at maxSubGoals when the LLM over-decomposes', async () => {
  const events: string[] = [];
  // Config avec un plafond bas pour rendre le test rapide et déterministe.
  const executor = new Executor({ maxSubGoals: 3 });
  executor.setSkillHandler(async () => null);
  executor.setEventEmitter((event, data) => {
    if (event === 'plan_truncated') events.push(`${data.proposed}->${data.kept}`);
  });

  // LLM qui renvoie 8 sous-objectifs (> maxSubGoals=3).
  const over = Array.from({ length: 8 }, (_, i) => ({
    title: `Étape ${i + 1}`,
    description: `desc ${i + 1}`,
    successCriteria: ['ok'],
    priority: 'medium',
    dependsOn: [],
  }));
  executor.setLLMDecompose(async () => JSON.stringify(over));

  const mission = await executor.startMission({
    title: 'Grosse mission',
    description: 'Une mission que le LLM sur-découpe.',
    availableSkills: [],
  });
  await executor.waitForMission(mission.id);

  // La troncature a bien été signalée…
  assert.deepEqual(events, ['8->3']);
  // …et seuls 3 sous-objectifs (hors racine) existent.
  const subGoals = Object.values(mission.getState().goals).filter((g) => g.parentId !== null);
  assert.equal(subGoals.length, 3, 'les sous-objectifs sont plafonnés à maxSubGoals');
});

test('Executor.addGoal attaches a sub-goal to an active mission (and rejects unknown ones)', async () => {
  const executor = new Executor();
  // skillHandler lent pour garder la mission active le temps d'ajouter un goal.
  executor.setSkillHandler(() => new Promise((r) => setTimeout(() => r(null), 50)));
  // Pas de décomposition LLM → une seule racine, exécution directe.
  const mission = await executor.startMission({
    title: 'Mission vivante',
    description: 'Rester active pour accepter un ajout de sous-objectif.',
    availableSkills: [],
  });

  const res = executor.addGoal(mission.id, {
    title: 'Nouvelle étape',
    description: 'Ajoutée à chaud',
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    const goal = mission.getGoal(res.goalId);
    assert.ok(goal, 'le sous-objectif ajouté est présent');
    assert.equal(goal!.title, 'Nouvelle étape');
  }

  // Mission inconnue → échec typé, pas d'exception.
  const bad = executor.addGoal('does-not-exist', { title: 'x', description: 'y' });
  assert.equal(bad.ok, false);

  await executor.waitForMission(mission.id);
});

test('Executor pause/resume toggles the paused state of an active mission', async () => {
  const executor = new Executor();
  executor.setSkillHandler(() => new Promise((r) => setTimeout(() => r(null), 50)));
  const mission = await executor.startMission({
    title: 'Pausable',
    description: 'Vérifier pause puis reprise.',
    availableSkills: [],
  });

  assert.equal(executor.pauseMission(mission.id), true);
  assert.equal(executor.isPaused(mission.id), true);
  // Re-pause interdite tant qu'elle est déjà en pause.
  assert.equal(executor.pauseMission(mission.id), false);
  assert.equal(executor.resumeMission(mission.id), true);
  assert.equal(executor.isPaused(mission.id), false);
  // Reprendre une mission non en pause échoue.
  assert.equal(executor.resumeMission(mission.id), false);

  await executor.waitForMission(mission.id);
});

// ─── Sprint 3 (partie 2) : vérification d'objectif par PREUVE ────────────────

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EvidenceEngine } from '../core/EvidenceEngine.js';

test('evidence-based verification fails a goal when a skill reports a factual failure', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leanna-exec-ev-'));
  const verified: Array<{ passed: boolean }> = [];

  const executor = new Executor();
  // Un skill de vérification qui signale factuellement un échec (status: failed)
  // SANS clé `error` — exactement le cas que detectSkillFailure doit attraper.
  executor.setSkillHandler(async (name: string) => {
    if (name === 'verify_typecheck') return { status: 'failed', message: 'TS2322' };
    return null;
  });
  executor.setEvidenceEngine(new EvidenceEngine(path.join(dir, 'ev')), true);
  executor.setEventEmitter((event, data) => {
    if (event === 'goal_verified') verified.push({ passed: data.passed as boolean });
  });

  // Pas de LLM : une seule racine, plan via le scorer heuristique.
  // On force un plan contenant verify_typecheck en l'exposant comme skill dispo.
  const mission = await executor.startMission({
    title: 'Vérifier la compilation',
    description: 'Lancer verify_typecheck et confirmer la compilation.',
    availableSkills: ['verify_typecheck'],
  });
  await executor.waitForMission(mission.id);

  // La mission ne doit PAS être marquée réussie : la preuve (status failed) prime.
  assert.equal(mission.status !== 'completed', true, 'un check factuel échoué interdit le succès');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('evidence-based verification passes a goal when all factual checks pass', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leanna-exec-ev-'));
  const executor = new Executor();
  executor.setSkillHandler(async () => ({ ok: true, status: 'success' }));
  executor.setEvidenceEngine(new EvidenceEngine(path.join(dir, 'ev')), true);

  const mission = await executor.startMission({
    title: 'Action réussie',
    description: 'Exécuter une action qui réussit factuellement.',
    availableSkills: ['verify_typecheck'],
  });
  await executor.waitForMission(mission.id);

  const completed = await executor.waitForMission(mission.id);
  assert.ok(completed);
  assert.equal(completed.status, 'completed', 'tous les checks factuels passent → succès');

  fs.rmSync(dir, { recursive: true, force: true });
});

// ─── Unification : couture Executor → Supervisor ─────────────────────────────

import { LeannaSupervisor } from '../core/LeannaSupervisor.js';
import { DurableMissionStore } from '../core/DurableMissionStore.js';
import { CheckpointManager } from '../core/CheckpointManager.js';

function supervisorInDir(dir: string): LeannaSupervisor {
  const memGateway = (() => {
    const store = new Map<string, string>();
    return {
      exists: (p: string) => store.has(p),
      read: (p: string) => { const v = store.get(p); if (v === undefined) throw new Error(`missing ${p}`); return v; },
      write: (p: string, c: string) => void store.set(p, c),
      remove: (p: string) => void store.delete(p),
    };
  })();
  return new LeannaSupervisor({
    maxAttempts: 1,
    missionStore: new DurableMissionStore(path.join(dir, 'missions')),
    checkpoints: new CheckpointManager({ gateway: memGateway, dirOverride: path.join(dir, 'cp') }),
    evidence: new EvidenceEngine(path.join(dir, 'ev')),
  });
}

test('supervised mode governs a successful mission through the lifecycle to COMPLETED', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leanna-exec-sup-'));
  const events: Array<{ state: string; passed: unknown }> = [];

  const executor = new Executor();
  executor.setSkillHandler(async () => ({ ok: true }));
  const supervisor = supervisorInDir(dir);
  executor.setSupervisor(supervisor, true);
  executor.setEventEmitter((event, data) => {
    if (event === 'mission_supervised') events.push({ state: data.lifecycleState as string, passed: data.evidencePassed });
  });

  const mission = await executor.startMission({
    title: 'Mission supervisée',
    description: 'Exécuter sous gouvernance du Supervisor.',
    availableSkills: [],
  });
  const done = await executor.waitForMission(mission.id);

  assert.ok(done);
  assert.equal(done.status, 'completed', 'la mission Executor aboutit');
  // Le cycle de vie durable a atteint COMPLETED et la preuve a été scellée.
  assert.equal(events.length, 1);
  assert.equal(events[0].state, 'COMPLETED');

  // Le snapshot durable du Supervisor reflète l'état terminal.
  const reloaded = new DurableMissionStore(path.join(dir, 'missions')).load(mission.id);
  assert.equal(reloaded?.current, 'COMPLETED');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('default mode (no supervisor) keeps running missions directly', async () => {
  const executor = new Executor();
  executor.setSkillHandler(async () => null);
  let supervisedSeen = false;
  executor.setEventEmitter((event) => { if (event === 'mission_supervised') supervisedSeen = true; });

  const mission = await executor.startMission({
    title: 'Mission directe',
    description: 'Aucun Supervisor branché : exécution directe.',
    availableSkills: [],
  });
  const done = await executor.waitForMission(mission.id);

  assert.ok(done);
  assert.equal(supervisedSeen, false, 'pas de gouvernance Supervisor sur le chemin par défaut');

  fs.rmSync(fs.mkdtempSync(path.join(os.tmpdir(), 'noop-')), { recursive: true, force: true });
});

// ─── Preuve : objectif à livrable sans écriture = échec ──────────────────────

test('evidence verification fails an artifact-expecting goal when nothing was written', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leanna-exec-art-'));
  const executor = new Executor();
  // Un skill de lecture qui réussit factuellement mais ne produit AUCUN fichier.
  executor.setSkillHandler(async () => ({ ok: true }));
  executor.setEvidenceEngine(new EvidenceEngine(path.join(dir, 'ev')), true);

  // Titre/description réclamant explicitement un livrable (rapport/document).
  const mission = await executor.startMission({
    title: 'Produire le rapport d’audit',
    description: 'Rédiger et écrire un rapport Markdown documentant les résultats.',
    availableSkills: ['read_project_file'],
  });
  const done = await executor.waitForMission(mission.id);

  assert.ok(done);
  // Aucun fichier produit alors qu'un livrable est attendu → mission non réussie.
  assert.notEqual(done.status, 'completed', 'un objectif à livrable sans écriture ne doit pas réussir');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('Executor scopes each skill call to its mission action for the idempotency guard', async () => {
  const scopes: Array<{ missionId: string; stepId: string } | undefined> = [];
  const executor = new Executor();
  executor.setSkillHandler(async (_name, _args, opts) => {
    scopes.push(opts?.idempotencyScope);
    return { ok: true };
  });

  const mission = await executor.startMission({
    title: 'Vérifier la compilation',
    description: 'Lancer verify_typecheck.',
    availableSkills: ['verify_typecheck'],
  });
  await executor.waitForMission(mission.id);

  assert.ok(scopes.length > 0, 'au moins un skill exécuté');
  const actionIds = new Set(
    Object.values(mission.toJSON().goals).flatMap((g) => g.plannedActions.map((a) => a.id))
  );
  for (const scope of scopes) {
    assert.equal(scope?.missionId, mission.id);
    assert.ok(scope && actionIds.has(scope.stepId), `stepId = id d'une action planifiée (${scope?.stepId})`);
  }
});

// ─── AUDIT-013 : vérification honnête des objectifs ──────────────────────────

const goalWith = (statuses: string[], successCriteria: string[] = []) => ({
  title: 'Objectif',
  description: 'Détail',
  successCriteria,
  plannedActions: statuses.map((status, i) => ({ id: `a${i}`, skillName: 'tool', status, result: null })),
});
const verify = (executor: Executor, goal: unknown) =>
  (executor as any).verifyGoalCriteria({ id: 'm1' }, goal) as Promise<{ passed: boolean; unverified?: boolean }>;

test('verifyGoalCriteria: sans critère, une action échouée suffit à refuser le succès', async () => {
  const executor = new Executor();
  assert.equal((await verify(executor, goalWith(['completed', 'failed']))).passed, false);
  assert.equal((await verify(executor, goalWith(['completed', 'completed']))).passed, true);
});

test('verifyGoalCriteria: un verdict LLM négatif reste négatif (non vérifié)', async () => {
  const executor = new Executor();
  executor.setLLMVerify(async () => '{"passed": false, "reasoning": "critère non démontré"}');
  const verdict = await verify(executor, goalWith(['completed'], ['le test passe']));
  assert.equal(verdict.passed, false);
  assert.equal(verdict.unverified, true);
});

test('verifyGoalCriteria: un verdict LLM positif est retenu', async () => {
  const executor = new Executor();
  executor.setLLMVerify(async () => '{"passed": true, "reasoning": "ok"}');
  assert.equal((await verify(executor, goalWith(['completed'], ['le test passe']))).passed, true);
});
