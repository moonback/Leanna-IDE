import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'http';
import { createEnvRouter } from './env.js';

test('env routes: GET / returns grouped sections with masked secrets', async (t) => {
  // .env de fixture isolé : le test ne dépend pas (et ne lit pas) du .env réel.
  const fs = await import('fs');
  const os = await import('os');
  const path = await import('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leanna-env-'));
  const prevConfigPath = process.env.Leanna_CONFIG_PATH;
  process.env.Leanna_CONFIG_PATH = dir;
  fs.writeFileSync(path.join(dir, '.env'), 'LOG_LEVEL="info"\nGEMINI_API_KEY="plain-secret-value"\n');
  t.after(() => {
    if (prevConfigPath === undefined) delete process.env.Leanna_CONFIG_PATH;
    else process.env.Leanna_CONFIG_PATH = prevConfigPath;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const app = express();
  app.use(express.json());
  app.use('/api/env', createEnvRouter());

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/env`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.status, 'success');
    assert.ok(Array.isArray(body.sections));
    assert.ok(body.sections.length > 0);

    // Vérifie qu'aucun secret n'est exposé en clair dans la liste générale
    for (const section of body.sections) {
      for (const v of section.vars) {
        if (v.sensitive) {
          assert.equal(v.value, '', `Le secret ${v.key} ne doit pas avoir de valeur en clair dans GET /`);
        }
      }
    }
    const vars = body.sections.flatMap((section: any) => section.vars);
    assert.equal(vars.find((v: any) => v.key === 'LOG_LEVEL')?.value, 'info');
    assert.equal(vars.find((v: any) => v.key === 'GEMINI_API_KEY')?.hasValue, true);
    assert.ok(!JSON.stringify(body).includes('plain-secret-value'));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('env routes: GET /reveal/:key returns 404 for unknown keys', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/env', createEnvRouter());

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/env/reveal/UNKNOWN_KEY_NEVER_EXISTING_XYZ`);
    assert.equal(res.status, 404);
    const body = (await res.json()) as any;
    assert.equal(body.status, 'error');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('env routes: POST / validates body updates and rejects malformed payload', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/env', createEnvRouter());

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;

  try {
    // 1. Payload vide / invalide
    const badRes = await fetch(`http://127.0.0.1:${port}/api/env`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(badRes.status, 400);

    // 2. Mise à jour de clés inconnues rejetée
    const updateRes = await fetch(`http://127.0.0.1:${port}/api/env`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        updates: {
          UNAUTHORIZED_INVENTED_KEY: 'test',
        },
      }),
    });
    assert.equal(updateRes.status, 200);
    const updateBody = (await updateRes.json()) as any;
    assert.equal(updateBody.status, 'success');
    assert.ok(updateBody.rejected.includes('UNAUTHORIZED_INVENTED_KEY'));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('env routes: POST / never encrypts keys that are not decrypted at startup', async () => {
  const fs = await import('fs');
  const os = await import('os');
  const path = await import('path');
  const { decrypt } = await import('../utils/crypto.js');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leanna-env-'));
  const prevConfigPath = process.env.Leanna_CONFIG_PATH;
  const prevMaster = process.env.Leanna_MASTER_KEY;
  const prevGemini = process.env.GEMINI_API_KEY;
  const prevMasterInFile = 'A'.repeat(43) + '=';
  process.env.Leanna_CONFIG_PATH = dir;
  process.env.Leanna_MASTER_KEY = Buffer.alloc(32, 7).toString('base64');
  fs.writeFileSync(
    path.join(dir, '.env'),
    `Leanna_MASTER_KEY="${prevMasterInFile}"\nVITE_Leanna_API_TOKEN=""\nGEMINI_API_KEY=""\n`,
  );

  const app = express();
  app.use(express.json());
  app.use('/api/env', createEnvRouter());
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;

  try {
    const newMaster = Buffer.alloc(32, 9).toString('base64');
    const res = await fetch(`http://127.0.0.1:${port}/api/env`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        updates: {
          Leanna_MASTER_KEY: newMaster,
          VITE_Leanna_API_TOKEN: 'front-token',
          GEMINI_API_KEY: 'gemini-secret',
        },
      }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.deepEqual(body.applied.sort(), ['GEMINI_API_KEY', 'Leanna_MASTER_KEY', 'VITE_Leanna_API_TOKEN']);

    const written = fs.readFileSync(path.join(dir, '.env'), 'utf-8');
    // La master key et les clés VITE_* doivent rester en clair : elles ne sont
    // jamais déchiffrées au démarrage.
    assert.match(written, new RegExp(`^Leanna_MASTER_KEY="${newMaster.replace(/[+/=]/g, '\\$&')}"$`, 'm'));
    assert.match(written, /^VITE_Leanna_API_TOKEN="front-token"$/m);
    // Les clés déchiffrées au démarrage restent chiffrées au repos.
    const gemini = written.match(/^GEMINI_API_KEY="(.*)"$/m)?.[1] ?? '';
    assert.ok(gemini.startsWith('gcm:'), 'GEMINI_API_KEY doit être chiffrée sur disque');
    assert.equal(decrypt(gemini), 'gemini-secret');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (prevConfigPath === undefined) delete process.env.Leanna_CONFIG_PATH;
    else process.env.Leanna_CONFIG_PATH = prevConfigPath;
    if (prevMaster === undefined) delete process.env.Leanna_MASTER_KEY;
    else process.env.Leanna_MASTER_KEY = prevMaster;
    if (prevGemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prevGemini;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
