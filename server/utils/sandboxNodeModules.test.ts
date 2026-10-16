import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { setSelfRoot } from './selfRoot.js';
import {
  activateSandbox,
  assertSandboxReady,
  deactivateSandbox,
  ensureSandboxNodeModules,
  getSandboxRoot,
  initSandbox,
  resetSandbox,
} from './sandbox.js';
import { stopWatching } from './sandboxWatcher.js';

const tmpDirs: string[] = [];
after(() => {
  deactivateSandbox();
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

/** Projet temporaire avec un node_modules minimal et un package-lock.json. */
async function makeProject(): Promise<{ root: string; sandbox: string }> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'leanna-nm-test-'));
  tmpDirs.push(root);
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"nm-test"}');
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{"lockfileVersion":3,"v":1}');
  fs.mkdirSync(path.join(root, 'node_modules', 'next'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'next', 'package.json'), '{"name":"next"}');
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'index.ts'), 'export {};\n');
  setSelfRoot(root);
  await initSandbox();
  activateSandbox();
  return { root, sandbox: getSandboxRoot() };
}

const linkType = process.platform === 'win32' ? 'junction' : 'dir';

test('node_modules: copie réelle, puis recopie seulement si le lockfile change', async () => {
  const { root, sandbox } = await makeProject();
  const copiedPkg = path.join(sandbox, 'node_modules', 'next', 'package.json');

  const first = await ensureSandboxNodeModules();
  assert.equal(first.status, 'copied', first.reason);
  assert.ok(fs.existsSync(copiedPkg));
  assert.equal(fs.lstatSync(path.join(sandbox, 'node_modules')).isSymbolicLink(), false);

  assert.equal((await ensureSandboxNodeModules()).status, 'up-to-date');

  // Dépendance retirée + lockfile modifié → miroir mis à jour.
  fs.rmSync(path.join(root, 'node_modules', 'next'), { recursive: true });
  fs.mkdirSync(path.join(root, 'node_modules', 'react'));
  fs.writeFileSync(path.join(root, 'node_modules', 'react', 'index.js'), '');
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{"lockfileVersion":3,"v":2}');

  assert.equal((await ensureSandboxNodeModules()).status, 'copied');
  assert.ok(!fs.existsSync(copiedPkg), 'les paquets disparus de la source sont retirés');
  assert.ok(fs.existsSync(path.join(sandbox, 'node_modules', 'react', 'index.js')));
});

test('node_modules: une ancienne jonction est remplacée sans toucher sa cible', async () => {
  const { root, sandbox } = await makeProject();
  const target = path.join(sandbox, 'node_modules');
  fs.symlinkSync(path.join(root, 'node_modules'), target, linkType);

  assert.equal((await ensureSandboxNodeModules()).status, 'copied');
  assert.equal(fs.lstatSync(target).isSymbolicLink(), false);
  assert.ok(fs.existsSync(path.join(root, 'node_modules', 'next', 'package.json')), 'la source est intacte');
});

test('node_modules: le garde refuse toute écriture agent dans node_modules du sandbox', async () => {
  await makeProject();
  for (const p of ['node_modules/next/index.js', 'NODE_MODULES/x.js', 'node_modules']) {
    assert.throws(() => assertSandboxReady(p), { name: 'SandboxGuardError' }, p);
  }
  assert.ok(assertSandboxReady('src/index.ts'));
});

test('node_modules: le nettoyage conserve la copie et ne suit jamais un lien', async () => {
  const { sandbox } = await makeProject();
  assert.equal((await ensureSandboxNodeModules()).status, 'copied');

  // Lien posé dans le sandbox vers un dossier extérieur précieux.
  const precious = fs.mkdtempSync(path.join(os.tmpdir(), 'leanna-nm-precious-'));
  tmpDirs.push(precious);
  fs.writeFileSync(path.join(precious, 'keep.txt'), 'keep');
  fs.symlinkSync(precious, path.join(sandbox, 'link-out'), linkType);

  try {
    await resetSandbox();
  } finally {
    stopWatching();
  }

  assert.ok(fs.existsSync(path.join(precious, 'keep.txt')), 'la cible du lien est intacte');
  assert.ok(!fs.existsSync(path.join(sandbox, 'link-out')), 'le lien est retiré');
  assert.ok(fs.existsSync(path.join(sandbox, 'node_modules', 'next', 'package.json')), 'node_modules conservé');
  assert.equal((await ensureSandboxNodeModules()).status, 'up-to-date');
});
