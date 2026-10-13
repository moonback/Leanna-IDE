import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSourcesContext, spreadIndices } from './generationContext.js';
import type { Source } from './types.js';

function makeSource(id: string, chunkCount: number, chunkLength = 100): Source {
  return {
    id,
    notebookId: 'nb',
    title: `Source ${id}`,
    type: 'text',
    origin: `origin://${id}`,
    rawText: '',
    summary: `Résumé ${id}`,
    keywords: ['alpha', 'beta'],
    chunks: Array.from({ length: chunkCount }, (_, i) => ({
      id: `${id}-c${i}`,
      sourceId: id,
      content: `[${id}#${i}]`.padEnd(chunkLength, '.'),
      index: i,
      metadata: { startChar: 0, endChar: chunkLength },
    })),
    addedAt: new Date().toISOString(),
    wordCount: 0,
    language: 'fr',
  } as unknown as Source;
}

test('spreadIndices couvre début, milieu et fin', () => {
  assert.deepEqual(spreadIndices(10, 3), [0, 5, 9]);
  assert.deepEqual(spreadIndices(3, 10), [0, 1, 2]);
  assert.deepEqual(spreadIndices(5, 1), [0]);
  assert.deepEqual(spreadIndices(0, 4), []);
});

test('les passages viennent de tout le document, pas seulement du début', () => {
  const ctx = buildSourcesContext([makeSource('a', 100)], { budgetChars: 2_000 });
  assert.match(ctx, /\[a#0\]/);
  assert.match(ctx, /\[a#99\]/);
  assert.doesNotMatch(ctx, /\[a#1\]\./);
});

test('le budget est partagé entre les sources et respecté', () => {
  const sources = [makeSource('a', 200), makeSource('b', 200)];
  const ctx = buildSourcesContext(sources, { budgetChars: 6_000 });
  assert.ok(ctx.length <= 6_000 + 200, `contexte trop long : ${ctx.length}`);
  assert.match(ctx, /## Source a/);
  assert.match(ctx, /## Source b/);
  assert.match(ctx, /\[b#199\]/);
});

test('une petite source est incluse en entier, avec mots-clés si demandé', () => {
  const ctx = buildSourcesContext([makeSource('a', 3)], { includeKeywords: true });
  for (const i of [0, 1, 2]) assert.match(ctx, new RegExp(`\\[a#${i}\\]`));
  assert.match(ctx, /Mots-clés : alpha, beta/);
});
