import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { setSelfRoot } from '../../utils/selfRoot.js';
import { DocumentMemory } from './DocumentMemory.js';

// Régression : le store chargé pour un workspace ne doit jamais être écrit dans
// le DocumentKnowledge.json d'un autre workspace après un changement de projet.
test('DocumentMemory: recharge et écrit par workspace', () => {
  const rootA = fs.mkdtempSync(path.join(os.tmpdir(), 'docmem-a-'));
  const rootB = fs.mkdtempSync(path.join(os.tmpdir(), 'docmem-b-'));
  try {
    const mem = new DocumentMemory();

    setSelfRoot(rootA);
    mem.addCollection('collection-a');
    mem.save();

    setSelfRoot(rootB);
    assert.deepEqual(mem.getCollections(), [], 'le workspace B démarre vide');
    mem.addCollection('collection-b');
    mem.save();

    const read = (root: string) =>
      JSON.parse(fs.readFileSync(path.join(root, '.Leanna', 'DocumentKnowledge.json'), 'utf-8'));
    assert.deepEqual(read(rootA).collections, ['collection-a']);
    assert.deepEqual(read(rootB).collections, ['collection-b']);

    setSelfRoot(rootA);
    assert.deepEqual(mem.getCollections(), ['collection-a']);
  } finally {
    fs.rmSync(rootA, { recursive: true, force: true });
    fs.rmSync(rootB, { recursive: true, force: true });
  }
});
