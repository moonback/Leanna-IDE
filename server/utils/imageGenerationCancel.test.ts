import test from 'node:test';
import assert from 'node:assert/strict';

import { generateImage } from './imageGeneration.js';

/**
 * Vérifie que generateImage honore un signal déjà abort : il renvoie null SANS
 * déclencher d'appel réseau. On fournit une clé API factice pour dépasser le
 * garde « clé manquante » et atteindre le contrôle d'annulation. Aucun fetch
 * réel n'est émis (le signal est abort avant la requête).
 */
test('generateImage: signal déjà abort → null sans appel réseau', async () => {
  const prevKey = process.env.OPENROUTER_API_KEY;
  const prevFree = process.env.OPENROUTER_FREE_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test-dummy-key';

  // Sentinelle : si fetch est appelé, le test échoue.
  const realFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error('fetch ne doit pas être appelé quand le signal est déjà abort');
  }) as typeof fetch;

  try {
    const controller = new AbortController();
    controller.abort();

    const result = await generateImage('un chat', { signal: controller.signal });

    assert.equal(result, null);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = realFetch;
    if (prevKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = prevKey;
    if (prevFree === undefined) delete process.env.OPENROUTER_FREE_API_KEY;
    else process.env.OPENROUTER_FREE_API_KEY = prevFree;
  }
});
