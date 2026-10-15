/**
 * Télémétrie et budgets des appels NON textuels (audit 2026-10-15, passe 3) :
 * embeddings, TTS, images, sessions Live. Fournisseurs simulés, aucun réseau.
 */
import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { telemetryService, resolvePricing } from '../observability/TelemetryService.js';
import {
  recordModelCallUsage,
  reserveModelCallBudget,
  runWithTelemetryContext,
  trackedGeminiEmbed,
  normalizeGeminiUsage,
  BudgetExceededError,
} from './textGeneration.js';
import { embedTextsOpenRouter } from './openrouterEmbeddings.js';
import { generateImage } from './imageGeneration.js';

const svc: any = telemetryService;
const originalFetch = globalThis.fetch;
let fetchCalls = 0;

beforeEach(() => {
  svc.recentRecords = [];
  svc.recentFailures = [];
  fetchCalls = 0;
  process.env.OPENROUTER_API_KEY = 'sk-test';
});

after(() => {
  globalThis.fetch = originalFetch;
  delete process.env.OPENROUTER_API_KEY;
});

test('pricing: non-text calls are never priced from a text tariff nor DEFAULT_PRICING', () => {
  // Le modèle TTS ne doit PAS hériter du tarif texte de « gemini-2.0-flash ».
  assert.equal(resolvePricing('gemini-2.0-flash-preview-tts', 'tts').source, 'unpriced');
  assert.equal(resolvePricing('openai/text-embedding-3-small', 'embedding').source, 'unpriced');
  assert.equal(resolvePricing('acme/image-x:free', 'image').source, 'free');
});

test('Live usage uses responseTokenCount as output and is recorded per request', () => {
  const u = normalizeGeminiUsage({ promptTokenCount: 1000, responseTokenCount: 200, totalTokenCount: 1200 })!;
  assert.equal(u.outputTokens, 200);
  recordModelCallUsage({
    provider: 'gemini', model: 'gemini-3.8-live', kind: 'live', toolName: 'gemini_live',
    rawUsage: { promptTokenCount: 1000, responseTokenCount: 200 }, promptCharCount: 0, outputText: '',
  });
  const [rec] = telemetryService.getUsageRecords();
  assert.equal(rec.kind, 'live');
  assert.equal(rec.totalTokens, 1200);
  assert.equal(rec.pricingSource, 'unpriced');
  assert.equal(rec.costUsd, 0);
  const stats = telemetryService.getAggregatedStats();
  assert.equal(stats.unpricedCalls, 1);
  assert.equal(stats.byKind.live.tokens, 1200);
});

test('Live message without usage is not recorded (no phantom request)', () => {
  const cost = recordModelCallUsage({
    provider: 'gemini', model: 'gemini-3.8-live', kind: 'live', rawUsage: undefined, promptCharCount: 0, outputText: '',
  });
  assert.equal(cost, 0);
  assert.equal(telemetryService.getUsageRecords().length, 0);
});

test('OpenRouter embeddings: usage recorded once even after a retried 5xx', async () => {
  let n = 0;
  globalThis.fetch = (async () => {
    fetchCalls++;
    if (n++ === 0) return new Response('overloaded', { status: 503 });
    return new Response(JSON.stringify({
      model: 'openai/text-embedding-3-small',
      data: [{ embedding: [0.1, 0.2], index: 0 }],
      usage: { prompt_tokens: 42, total_tokens: 42, cost: 0.00001 },
    }), { status: 200 });
  }) as typeof fetch;
  const vectors = await embedTextsOpenRouter(['hello world'], { maxRetries: 2 });
  assert.deepEqual(vectors, [[0.1, 0.2]]);
  assert.equal(fetchCalls, 2);
  const recs = telemetryService.getUsageRecords();
  assert.equal(recs.length, 1, 'no double counting across retries');
  assert.equal(recs[0].kind, 'embedding');
  assert.equal(recs[0].inputTokens, 42);
  assert.equal(recs[0].costUsd, 0.00001, 'provider-reported cost is used for unpriced kinds');
});

test('OpenRouter embeddings are refused before sending when the mission budget is exhausted', async () => {
  globalThis.fetch = (async () => { fetchCalls++; return new Response('{}', { status: 200 }); }) as typeof fetch;
  telemetryService.setMissionBudget('emb-m', { maxTokens: 10 });
  try {
    await runWithTelemetryContext({ missionId: 'emb-m' }, async () => {
      await assert.rejects(() => embedTextsOpenRouter(['x'.repeat(400)]), BudgetExceededError);
    });
    assert.equal(fetchCalls, 0);
  } finally {
    telemetryService.clearMissionBudget('emb-m');
  }
});

test('Gemini embeddings: estimated tokens recorded, failures recorded without tokens', async () => {
  const ok = { models: { embedContent: async () => ({ embeddings: [{ values: [1, 2, 3] }] }) } } as any;
  await trackedGeminiEmbed(ok, { model: 'gemini-embedding-2', contents: 'x'.repeat(40) });
  const [rec] = telemetryService.getUsageRecords();
  assert.equal(rec.kind, 'embedding');
  assert.equal(rec.usageSource, 'estimated');
  assert.equal(rec.inputTokens, 10);

  const ko = { models: { embedContent: async () => { throw new Error('503'); } } } as any;
  await assert.rejects(() => trackedGeminiEmbed(ko, { model: 'gemini-embedding-2', contents: 'y' }));
  assert.equal(telemetryService.getUsageRecords().length, 1);
  assert.equal(telemetryService.getRecentFailures().length, 1);
});

test('TTS: billed characters recorded as units; refused once the budget is exceeded', () => {
  recordModelCallUsage({
    provider: 'openrouter', model: 'hexgrad/kokoro-82m', kind: 'tts', rawUsage: undefined,
    promptCharCount: 120, outputText: '', units: 120, unit: 'characters',
  });
  const [rec] = telemetryService.getUsageRecords();
  assert.equal(rec.units, 120);
  assert.equal(rec.unit, 'characters');
  assert.equal(rec.totalTokens, 0);

  telemetryService.setMissionBudget('tts-m', { maxTokens: 5 });
  telemetryService.recordTokenUsage({ missionId: 'tts-m', provider: 'gemini', model: 'gemini-2.0-flash', inputTokens: 10, outputTokens: 0 });
  try {
    assert.throws(
      () => runWithTelemetryContext({ missionId: 'tts-m' }, () => reserveModelCallBudget('hexgrad/kokoro-82m', 10, 'tts')),
      BudgetExceededError,
    );
  } finally {
    telemetryService.clearMissionBudget('tts-m');
  }
});

test('Image generation: one image recorded with provider cost; budget refusal returns null without a call', async () => {
  globalThis.fetch = (async () => {
    fetchCalls++;
    return new Response(JSON.stringify({
      model: 'black-forest-labs/flux-1.1-pro',
      data: [{ b64_json: 'aGVsbG8=' }],
      usage: { total_cost: 0.04 },
    }), { status: 200 });
  }) as typeof fetch;
  const res = await generateImage('a cat');
  assert.equal(res?.cost, 0.04);
  const [rec] = telemetryService.getUsageRecords();
  assert.equal(rec.kind, 'image');
  assert.equal(rec.units, 1);
  assert.equal(rec.costUsd, 0.04);

  telemetryService.setMissionBudget('img-m', { maxCostUsd: 0.01 });
  telemetryService.recordTokenUsage({ missionId: 'img-m', provider: 'openrouter', model: 'openai/gpt-4o', inputTokens: 1_000_000, outputTokens: 0 });
  try {
    const before = fetchCalls;
    const refused = await runWithTelemetryContext({ missionId: 'img-m' }, () => generateImage('a dog'));
    assert.equal(refused, null);
    assert.equal(fetchCalls, before);
  } finally {
    telemetryService.clearMissionBudget('img-m');
  }
});
