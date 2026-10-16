import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildChildEnv, classifyNpmExecution, systemSkill } from './system.js';
import { handleConfirmationResponse } from '../utils/confirmationBridge.js';
import { setSelfRoot } from '../utils/selfRoot.js';

const run = (command: string, ctx?: any) =>
  systemSkill.handleToolCall('run_project_command', { command }, ctx) as Promise<any>;

/** Contexte qui approuve automatiquement et mémorise les demandes reçues. */
function approvingContext() {
  const requests: any[] = [];
  return {
    requests,
    ctx: {
      emitToClient: (data: any) => {
        requests.push(data);
        handleConfirmationResponse(data.requestId, true);
      },
    },
  };
}

test('run_project_command: node et npx exigent un canal de confirmation', async () => {
  for (const cmd of ['node -v', 'npx tsc --version']) {
    const res = await run(cmd);
    assert.match(String(res.error), /confirmation/i, cmd);
    assert.equal(res.stdout, undefined, `${cmd} ne doit pas s'exécuter`);
  }
});

test('run_project_command: les drapeaux d\'évaluation de node sont refusés sans confirmation', async () => {
  for (const cmd of ['node -p process.env', 'node -e process.exit', 'node --eval=1', 'node --print process.env', 'node -pe 1']) {
    const { ctx, requests } = approvingContext();
    const res = await run(cmd, ctx);
    assert.match(String(res.error), /évaluation|eval/i, cmd);
    assert.equal(requests.length, 0, `${cmd} ne doit même pas demander confirmation`);
  }
});

test('run_project_command: node approuvé en risque élevé, sans secrets dans l\'environnement', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'leanna-sys-env-'));
  fs.writeFileSync(path.join(root, 'env.js'), 'console.log(JSON.stringify(Object.keys(process.env)))');
  setSelfRoot(root);
  process.env.GEMINI_API_KEY = 'secret-de-test';
  process.env.LEANNA_TEST_SECRET = 'secret-de-test';
  try {
    const { ctx, requests } = approvingContext();
    const res = await run('node env.js', ctx);
    assert.equal(res.status, 'success', JSON.stringify(res));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].riskLevel, 'high');
    const keys: string[] = JSON.parse(res.stdout);
    assert.ok(!keys.includes('GEMINI_API_KEY'));
    assert.ok(!keys.includes('LEANNA_TEST_SECRET'));
    assert.ok(keys.some((k) => k.toUpperCase() === 'PATH'));
  } finally {
    delete process.env.GEMINI_API_KEY;
    delete process.env.LEANNA_TEST_SECRET;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('buildChildEnv ne garde que les variables de la liste blanche', () => {
  const env = buildChildEnv({ PATH: '/bin', Path: 'C:\\bin', HOME: '/h', OPENROUTER_API_KEY: 'x', TELEGRAM_BOT_TOKEN: 'y', Leanna_MASTER_KEY: 'z' });
  assert.equal(env.PATH, '/bin');
  assert.equal(env.Path, 'C:\\bin');
  assert.equal(env.HOME, '/h');
  assert.equal(env.OPENROUTER_API_KEY, undefined);
  assert.equal(env.TELEGRAM_BOT_TOKEN, undefined);
  assert.equal(env.Leanna_MASTER_KEY, undefined);
});

test('systemSkill: metadata', () => {
  assert.equal(systemSkill.name, 'system');
  const declNames = systemSkill.declarations.map((d: any) => d.name);
  assert.ok(declNames.includes('system_info'));
  assert.ok(declNames.includes('system_execute_command'));
});

test('npm execution policy distinguishes known-safe project scripts', () => {
  assert.equal(classifyNpmExecution(['npm', 'run', 'test']), 'known-safe-project');
  assert.equal(classifyNpmExecution(['npm', 'run', 'build']), 'known-safe-project');
  assert.equal(classifyNpmExecution(['npm', 'run', 'typecheck']), 'known-safe-project');
  assert.equal(classifyNpmExecution(['npm', 'run', 'release']), 'arbitrary-script');
  assert.equal(classifyNpmExecution(['npm', 'ls']), 'read-only');
});
