import test from 'node:test';
import assert from 'node:assert/strict';

import { executeGraphify } from './graphify.js';

/**
 * Vérifie le chemin d'annulation « court » de executeGraphify : quand le signal
 * est déjà abort, la fonction renvoie immédiatement { cancelled: true } SANS
 * spawner de sous-processus graphify. C'est le seul chemin déterministe,
 * testable sans binaire graphify installé.
 */
test('executeGraphify: signal déjà abort → cancelled sans spawn de process', async () => {
  const controller = new AbortController();
  controller.abort();

  const result = await executeGraphify(['update', '.'], undefined, 60000, controller.signal);

  assert.equal(result.success, false);
  assert.equal(result.cancelled, true);
  assert.match(result.error ?? '', /annul/i);
});
