/**
 * Tests de non-régression — compression du contexte (audit 2026-10-15) :
 * les décisions et contraintes anciennes ne doivent pas disparaître du
 * contexte résumé. Fournisseur simulé, aucun appel réseau.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCriticalStatements,
  optimizeMessages,
  summarizeWithLLM,
  getBudgetForModel,
  type ChatMessage,
} from './tokenOptimizer.js';
import { setTextGenerationProfile } from './textGeneration.js';

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });

function longConversation(turns: number): ChatMessage[] {
  const msgs: ChatMessage[] = [];
  for (let i = 0; i < turns; i++) {
    const fact = i === 2 ? ' DÉCISION CRITIQUE: la base de données cible est PostgreSQL 16.' : '';
    msgs.push({ role: 'user', content: `Question ${i}: ${'détail '.repeat(280)}${fact}` });
    msgs.push({ role: 'assistant', content: `Réponse ${i}. ${'explication '.repeat(160)}` });
  }
  return msgs;
}

test('extractCriticalStatements finds decisions even at the end of a very long sentence', () => {
  const out = extractCriticalStatements([
    { role: 'user', content: `${'bla '.repeat(500)} décision: utiliser PostgreSQL 16` },
    { role: 'assistant', content: 'Rien de spécial ici.' },
    { role: 'user', content: 'Il ne faut jamais pousser sur main. Ne jamais pousser sur main.' },
  ]);
  assert.ok(out.some((s) => s.includes('PostgreSQL 16')), JSON.stringify(out));
  assert.ok(out.some((s) => /ne jamais pousser/i.test(s)));
  assert.ok(out.every((s) => s.length <= 302));
});

test('extractCriticalStatements is deduplicated and bounded, keeping the most recent', () => {
  const msgs: ChatMessage[] = Array.from({ length: 50 }, (_, i) => ({
    role: 'user' as const, content: `Décision numéro ${i} validée par l'équipe.`,
  }));
  msgs.push({ role: 'user', content: 'Décision numéro 49 validée par l\'équipe.' });
  const out = extractCriticalStatements(msgs, 200);
  assert.ok(out.join('').length <= 200);
  assert.ok(out[out.length - 1].includes('49'));
  assert.equal(new Set(out).size, out.length);
});

test('optimizeMessages (local summary) keeps an old critical decision and the system rules', () => {
  const input: ChatMessage[] = [{ role: 'system', content: 'Règle: ne jamais exécuter rm -rf.' }, ...longConversation(40)];
  const budget = { ...getBudgetForModel('default'), conversationHistory: 20_000 };
  const res = optimizeMessages(input, budget);
  assert.ok(res.messages.length < input.length, 'history was compressed');
  assert.ok(res.messages.some((m) => m.content.includes('PostgreSQL 16')), 'critical decision preserved');
  assert.ok(res.messages.some((m) => m.content.includes('ne jamais exécuter rm -rf')), 'system rule preserved');
});

test('summarizeWithLLM covers the most recent messages (not only the first 30) and appends critical points', async () => {
  setTextGenerationProfile({ textProvider: 'openrouter', openrouterApiKey: 'sk-test' });
  process.env.OPENROUTER_API_KEY = 'sk-test';
  let sentPrompt = '';
  globalThis.fetch = (async (_url: any, init: any) => {
    sentPrompt = JSON.parse(init.body).messages.map((m: any) => m.content).join('\n');
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'Résumé: discussion technique.' } }],
      usage: { prompt_tokens: 900, completion_tokens: 40, total_tokens: 940 },
    }), { status: 200 });
  }) as typeof fetch;
  try {
    const msgs: ChatMessage[] = [];
    for (let i = 0; i < 60; i++) {
      msgs.push({ role: i % 2 ? 'assistant' : 'user', content: `Message ${i}${i === 1 ? '. Contrainte: budget de 200 €.' : ''}` });
    }
    const res = await summarizeWithLLM(msgs);
    assert.equal(res.method, 'llm');
    assert.match(sentPrompt, /Message 59/, 'last message is part of the summarized input');
    assert.match(res.summary, /Points critiques préservés[\s\S]*budget de 200 €/);
    assert.equal(res.tokensUsed, 940, 'real provider tokens are reported');
  } finally {
    delete process.env.OPENROUTER_API_KEY;
  }
});
