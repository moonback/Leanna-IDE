import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  SELF_ROOT,
  normalizeSelfPath,
  isWriteForbidden,
  isCriticalFile,
  resolveRealPathWithinSelf,
  auditSymlinks,
  setSelfRoot,
} from './selfRoot.js';

// Ensure SELF_ROOT is initialised — needed in test environments where no
// project has been persisted yet. Walk up from server/utils/ to project root.
{
  const __filename = fileURLToPath(import.meta.url);
  const __dirname_local = path.dirname(__filename);
  const projectRoot = path.resolve(__dirname_local, '..', '..');
  setSelfRoot(projectRoot);
}

test('selfRoot: root value and normalization', () => {
  assert.ok(typeof SELF_ROOT === 'string');

  // Should successfully normalize relative paths within root
  const normalPath = normalizeSelfPath('package.json');
  assert.ok(normalPath);
  assert.ok(normalPath.startsWith(SELF_ROOT));

  // Should reject paths attempting to escape root
  const escapedPath = normalizeSelfPath('../outside-folder');
  assert.equal(escapedPath, null);
});

test('selfRoot: critical and forbidden check', () => {
  // Critical files require confirmation
  assert.equal(isCriticalFile(path.resolve(SELF_ROOT, 'server.ts')), true);
  assert.equal(isCriticalFile(path.resolve(SELF_ROOT, '.env')), true);
  assert.equal(isCriticalFile(path.resolve(SELF_ROOT, 'random.ts')), false);

  // Forbidden files completely blocked
  assert.equal(isWriteForbidden(path.resolve(SELF_ROOT, '.git/config')), true);
  assert.equal(isWriteForbidden(path.resolve(SELF_ROOT, 'node_modules/some-lib')), true);
  assert.equal(isWriteForbidden(path.resolve(SELF_ROOT, 'src/App.tsx')), false);
});

test('selfRoot: resolveRealPathWithinSelf', async () => {
  const result = await resolveRealPathWithinSelf(path.resolve(SELF_ROOT, 'package.json'));
  assert.ok(result);
  assert.ok(result.startsWith(SELF_ROOT));
});

test('selfRoot: auditSymlinks', async () => {
  const result = await auditSymlinks();
  assert.ok(Array.isArray(result));
});
