import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { findLeaks, parseEnv } = require('../scripts/check-bundle-secrets.cjs');

// AUDIT-001 : le scan de build détecte un secret du .env inliné dans dist/.
test('check-bundle-secrets: détecte un jeton inliné, ignore les clés publiques', () => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'leanna-dist-'));
  fs.mkdirSync(path.join(dist, 'assets'));
  const token = 'tok_0123456789abcdefghijklmnopqrstuvwxyzAB';
  const anon = 'eyJhbGciOiJIUzI1NiJ9.public-anon-key';
  fs.writeFileSync(path.join(dist, 'assets', 'index.js'), `const a="${anon}";`);

  const env = parseEnv(`Leanna_API_TOKEN="${token}"\nVITE_SUPABASE_ANON_KEY="${anon}"\nSUPABASE_ANON_KEY="${anon}"\n`);
  assert.deepEqual(findLeaks(dist, env), []);

  fs.writeFileSync(path.join(dist, 'assets', 'index.js'), `const t="${token}";`);
  const leaks = findLeaks(dist, env);
  assert.deepEqual(leaks.map((l: any) => l.key), ['Leanna_API_TOKEN']);
  assert.ok(!JSON.stringify(leaks).includes(token), 'la valeur ne doit jamais être rapportée');
});
