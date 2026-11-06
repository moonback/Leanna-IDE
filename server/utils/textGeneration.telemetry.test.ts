/**
 * Tests de non-régression — textGeneration : attribution, budgets avant appel,
 * retries/fallbacks, streams et usage manquant. Fournisseurs simulés (fetch
 * OpenRouter mocké, SDK Gemini stubé) : aucun appel réseau ni coût réel.
 */
import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { Models } from '@google/genai';
import {
  generateText,
  generateTextStream,
  setTextGenerationProfile,
  runWithTelemetryContext,
  getTelemetryContext,
  getActiveModel,
  BudgetExceededError,
  normalizeGeminiUsage,
  normalizeOpenRouterUsage,
} from './textGeneration.js';
import { telemetryService } from '../observability/TelemetryService.js';
import { addGeminiKey, removeGeminiKey, getGeminiKeys } from './geminiKeyPool.js';

const svc: any = telemetryService;
const originalFetch = globalThis.fetch;
const originalGenerateInternal = (Models.prototype as any).generateContentInternal;
let fetchCalls = 0;
let requestedModels: string[] = [];

type OrBehaviour = { status?: number; usage?: any; content?: string; delayMs?: number; stream?: boolean };

function mockOpenRouter(behaviour: OrBehaviour | (() => OrBehaviour)) {
  globalThis.fetch = (async (_url: any, init: any) => {
    fetchCalls++;
    const b = typeof behaviour === 'function' ? behaviour() : behaviour;
    if (b.delayMs) await new Promise((r) => setTimeout(r, b.delayMs));
    if (b.status && b.status >= 400) return new Response('upstream error', { status: b.status });
    const body = JSON.parse(init.body);
    requestedModels.push(body.model);
    if (body.stream) {
      const enc = new TextEncoder();
      const lines = [
        `data: ${JSON.stringify({ choices: [{ delta: { content: b.content ?? 'hello' } }] })}\n`,
        ...(b.usage ? [`data: ${JSON.stringify({ choices: [{ delta: {} }], usage: b.usage })}\n`] : []),
        'data: [DONE]\n',
      ];
      return new Response(new ReadableStream({ start(c) { lines.forEach((l) => c.enqueue(enc.encode(l))); c.close(); } }), { status: 200 });
    }
    return new Response(
      JSON.stringify({ choices: [{ message: { content: b.content ?? 'ok' } }], ...(b.usage ? { usage: b.usage } : {}) }),
      { status: 200 },
    );
  }) as typeof fetch;
}

async function clearGeminiKeys() {
  while (getGeminiKeys().length > 0) await removeGeminiKey(0);
}

beforeEach(async () => {
  svc.recentRecords = [];
  svc.recentFailures = [];
  fetchCalls = 0;
  requestedModels = [];
  delete process.env.LEANNA_PROVIDER_FALLBACK;
  setTextGenerationProfile({ textProvider: 'openrouter', openrouterApiKey: 'sk-test' });
  (Models.prototype as any).generateContentInternal = originalGenerateInternal;
  await clearGeminiKeys();
});

after(async () => {
  globalThis.fetch = originalFetch;
  (Models.prototype as any).generateContentInternal = originalGenerateInternal;
  await clearGeminiKeys();
});

const USAGE = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 };

test('custom agent model overrides the profile model without overriding an explicit call model', async () => {
  setTextGenerationProfile({
    textProvider: 'openrouter',
    openrouterApiKey: 'sk-test',
    openrouterModel: 'openai/gpt-6-luna',
    agents: { customAgents: [{ role: 'coder', model: 'cohere/north-mini-code:free' }] },
  });
  assert.equal(getActiveModel('coder'), 'cohere/north-mini-code:free');
  assert.equal(getActiveModel('reviewer'), 'openai/gpt-6-luna');

  mockOpenRouter({ usage: USAGE });
  await generateText({ prompt: 'code task', agentRole: 'coder' });
  await generateText({ prompt: 'explicit override', agentRole: 'coder', openrouterModel: 'openai/gpt-6-luna-pro' });
  assert.deepEqual(requestedModels, ['cohere/north-mini-code:free', 'openai/gpt-6-luna-pro']);
});

test('getActiveModel follows the selected OpenRouter model and safe defaults', () => {
  setTextGenerationProfile({ textProvider: 'openrouter', openrouterModel: 'anthropic/claude-3.5-sonnet' });
  assert.equal(getActiveModel(), 'anthropic/claude-3.5-sonnet');
  setTextGenerationProfile({ textProvider: 'openrouter', openrouterModel: '   ' });
  assert.equal(getActiveModel(), 'google/gemini-3.6-flash');
  setTextGenerationProfile({ textProvider: 'gemini' });
  assert.equal(getActiveModel(), 'gemini-3.8-flash');
});


// ─── Comptage / normalisation ────────────────────────────────────────────────

test('success on primary provider records input/output tokens from provider usage', async () => {
  mockOpenRouter({ usage: USAGE });
  const res = await generateText({ prompt: 'hi', forceProvider: 'openrouter' });
  assert.deepEqual(res.tokenUsage, { inputTokens: 10, outputTokens: 5, totalTokens: 15 });
  const [rec] = telemetryService.getUsageRecords();
  assert.equal(rec.inputTokens, 10);
  assert.equal(rec.outputTokens, 5);
  assert.equal(rec.usageSource, 'provider');
  assert.equal(rec.isFallback, undefined);
});

test('normalizeGeminiUsage counts thoughts as billed output and tool-use prompt as input', () => {
  const u = normalizeGeminiUsage({
    promptTokenCount: 100, toolUsePromptTokenCount: 20, candidatesTokenCount: 50,
    thoughtsTokenCount: 400, cachedContentTokenCount: 60, totalTokenCount: 570,
  })!;
  assert.equal(u.inputTokens, 120);
  assert.equal(u.outputTokens, 450);
  assert.equal(u.reasoningTokens, 400);
  assert.equal(u.cachedInputTokens, 60);
  assert.equal(u.inputTokens + u.outputTokens, u.providerTotalTokens);
  assert.equal(normalizeGeminiUsage({}), undefined);
});

test('normalizeOpenRouterUsage keeps cached, reasoning and provider cost', () => {
  const u = normalizeOpenRouterUsage({
    prompt_tokens: 100, completion_tokens: 40, total_tokens: 140, cost: 0.0012,
    prompt_tokens_details: { cached_tokens: 30 }, completion_tokens_details: { reasoning_tokens: 25 },
  })!;
  assert.deepEqual(u, { inputTokens: 100, outputTokens: 40, cachedInputTokens: 30, reasoningTokens: 25, providerTotalTokens: 140, providerCostUsd: 0.0012 });
});

test('Gemini call: thoughts tokens are billed (total matches provider total)', async () => {
  await addGeminiKey('AIzaTESTKEY000000000000000000000001');
  (Models.prototype as any).generateContentInternal = async () => ({
    candidates: [{ content: { parts: [{ text: 'ok' }] } }],
    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, thoughtsTokenCount: 400, totalTokenCount: 550 },
  });
  const res = await generateText({ prompt: 'x', forceProvider: 'gemini', geminiModel: 'gemini-2.5-pro' });
  assert.equal(res.tokenUsage?.totalTokens, 550);
  const [rec] = telemetryService.getUsageRecords();
  assert.equal(rec.outputTokens, 450);
  assert.equal(rec.reasoningTokens, 400);
});

test('response without usage metadata is recorded as ESTIMATED instead of being dropped', async () => {
  mockOpenRouter({ content: 'x'.repeat(40) });
  const res = await generateText({ prompt: 'p'.repeat(80), forceProvider: 'openrouter' });
  assert.equal(res.tokenUsage?.estimated, true);
  const [rec] = telemetryService.getUsageRecords();
  assert.equal(rec.usageSource, 'estimated');
  assert.equal(rec.inputTokens, 20);
  assert.equal(rec.outputTokens, 10);
});

// ─── Attribution concurrente ────────────────────────────────────────────────

test('concurrent tasks keep their own telemetry context (no cross-attribution)', async () => {
  mockOpenRouter(() => ({ usage: USAGE, delayMs: 5 }));
  const run = (id: string, wait: number) =>
    runWithTelemetryContext({ taskId: id, agentRole: `role-${id}` }, async () => {
      await new Promise((r) => setTimeout(r, wait));
      await generateText({ prompt: id, forceProvider: 'openrouter' });
      return getTelemetryContext().taskId;
    });
  const seen = await Promise.all([run('A', 20), run('B', 1), run('C', 10)]);
  assert.deepEqual(seen, ['A', 'B', 'C']);
  const pairs = telemetryService.getUsageRecords().map((r) => `${r.taskId}:${r.agentRole}`).sort();
  assert.deepEqual(pairs, ['A:role-A', 'B:role-B', 'C:role-C']);
  assert.deepEqual(getTelemetryContext(), {}, 'no context leaks outside the run');
});

test('nested context inherits the parent missionId', async () => {
  mockOpenRouter({ usage: USAGE });
  await runWithTelemetryContext({ missionId: 'M1' }, () =>
    runWithTelemetryContext({ taskId: 'T1', missionId: undefined }, () =>
      generateText({ prompt: 'x', forceProvider: 'openrouter' })));
  const [rec] = telemetryService.getUsageRecords();
  assert.equal(rec.missionId, 'M1');
  assert.equal(rec.taskId, 'T1');
});

// ─── Retries / fallbacks ────────────────────────────────────────────────────

test('primary failure then fallback success: attributed to the fallback provider/model', async () => {
  setTextGenerationProfile({ textProvider: 'gemini', openrouterApiKey: 'sk-test' });
  mockOpenRouter({ usage: USAGE });
  // Aucune clé Gemini → échec du primaire
  const res = await generateText({ prompt: 'x' });
  assert.equal(res.provider, 'openrouter');
  assert.equal(res.isFallback, true);
  const [rec] = telemetryService.getUsageRecords();
  assert.equal(rec.provider, 'openrouter');
  assert.equal(rec.model, 'google/gemini-3.6-flash');
  assert.equal(rec.isFallback, true);
  assert.equal(rec.fallbackFrom, 'gemini');
  const failures = telemetryService.getRecentFailures();
  assert.equal(failures.length, 1);
  assert.equal(failures[0].provider, 'gemini');
});

test('permanent OpenRouter 401 does not silently fail over to another provider', async () => {
  mockOpenRouter({ status: 401 });
  await assert.rejects(() => generateText({ prompt: 'x' }), /OpenRouter 401/);
  assert.equal(fetchCalls, 1, 'the invalid credential must not trigger a second provider');
  assert.equal(telemetryService.getRecentFailures().length, 1);
});

test('transient OpenRouter 429 remains eligible for cross-provider failover', async () => {
  mockOpenRouter({ status: 429 });
  await assert.rejects(() => generateText({ prompt: 'x' }), /Aucune clé Gemini API disponible/);
  assert.equal(fetchCalls, 1, 'OpenRouter is attempted once before Gemini fallback');
  assert.equal(telemetryService.getRecentFailures().length, 2);
});

test('all providers failing: error raised, attempts bounded, no tokens recorded', async () => {
  mockOpenRouter({ status: 500 });
  await assert.rejects(() => generateText({ prompt: 'x' }), /Tous les providers ont échoué/);
  assert.equal(fetchCalls, 1, 'OpenRouter attempted once (Gemini has no key)');
  assert.equal(telemetryService.getUsageRecords().length, 0);
  assert.equal(telemetryService.getRecentFailures().length, 2);
});

// ─── Budgets appliqués AVANT génération ─────────────────────────────────────

test('budget exceeded: the next call is refused BEFORE reaching any provider', async () => {
  mockOpenRouter({ usage: USAGE });
  telemetryService.setMissionBudget('B1', { maxTokens: 10 });
  try {
    await runWithTelemetryContext({ missionId: 'B1' }, async () => {
      await generateText({ prompt: 'x', forceProvider: 'openrouter' }); // 15 tokens → dépassé
      const before = fetchCalls;
      await assert.rejects(() => generateText({ prompt: 'y', forceProvider: 'openrouter' }), BudgetExceededError);
      await assert.rejects(() => generateTextStream({ prompt: 'y', onChunk: () => {} }), BudgetExceededError);
      assert.equal(fetchCalls, before, 'no provider call after the budget is exhausted');
    });
  } finally {
    telemetryService.clearMissionBudget('B1');
  }
});

test('budget refusal does not trigger the cross-provider fallback', async () => {
  setTextGenerationProfile({ textProvider: 'openrouter', openrouterApiKey: 'sk-test' });
  mockOpenRouter({ usage: USAGE });
  telemetryService.setMissionBudget('B2', { maxTokens: 5 });
  try {
    await runWithTelemetryContext({ missionId: 'B2' }, async () => {
      await assert.rejects(() => generateText({ prompt: 'x'.repeat(100) }), BudgetExceededError);
    });
    assert.equal(fetchCalls, 0);
    assert.equal(telemetryService.getRecentFailures().length, 0);
  } finally {
    telemetryService.clearMissionBudget('B2');
  }
});

test('budget is checked on every attempt of a fallback-enabled call', async () => {
  // Primaire Gemini « réussit » mais fait exploser le budget ; on force ensuite
  // un échec primaire pour vérifier que le fallback est lui aussi contrôlé.
  setTextGenerationProfile({ textProvider: 'gemini', openrouterApiKey: 'sk-test' });
  mockOpenRouter({ usage: USAGE });
  telemetryService.setMissionBudget('B3', { maxTokens: 12 });
  try {
    await runWithTelemetryContext({ missionId: 'B3' }, async () => {
      await generateText({ prompt: 'x' }); // gemini sans clé → fallback OpenRouter (15 tokens)
      await assert.rejects(() => generateText({ prompt: 'x' }), BudgetExceededError);
    });
    assert.equal(fetchCalls, 1);
  } finally {
    telemetryService.clearMissionBudget('B3');
  }
});

test('parallel calls in one mission: in-flight reservations prevent overshooting', async () => {
  mockOpenRouter({ usage: { prompt_tokens: 300, completion_tokens: 0, total_tokens: 300 }, delayMs: 10 });
  telemetryService.setMissionBudget('B4', { maxTokens: 500 });
  try {
    const prompt = 'z'.repeat(1200); // ~300 tokens estimés
    const results = await runWithTelemetryContext({ missionId: 'B4' }, () =>
      Promise.allSettled([1, 2, 3].map(() => generateText({ prompt, forceProvider: 'openrouter' }))));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    assert.equal(ok, 1, 'only one 300-token call fits in a 500-token budget');
    assert.equal(fetchCalls, 1);
  } finally {
    telemetryService.clearMissionBudget('B4');
  }
});

// ─── Streams ────────────────────────────────────────────────────────────────

test('OpenRouter stream: usage from the final SSE chunk is recorded', async () => {
  mockOpenRouter({ usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 } });
  const chunks: string[] = [];
  const text = await runWithTelemetryContext({ taskId: 'S1' }, () =>
    generateTextStream({ prompt: 'x', forceProvider: 'openrouter', onChunk: (c) => chunks.push(c) }));
  assert.equal(text, 'hello');
  const [rec] = telemetryService.getUsageRecords();
  assert.equal(rec.streamed, true);
  assert.equal(rec.inputTokens, 7);
  assert.equal(rec.taskId, 'S1');
});

test('OpenRouter stream without usage chunk is recorded as estimated', async () => {
  mockOpenRouter({ content: 'abcdefgh' });
  await generateTextStream({ prompt: 'x'.repeat(40), forceProvider: 'openrouter', onChunk: () => {} });
  const [rec] = telemetryService.getUsageRecords();
  assert.equal(rec.usageSource, 'estimated');
  assert.equal(rec.outputTokens, 2);
});

// ─── agent_execute : pas de rappel redondant du même fournisseur ─────────────

test('agent_execute fallback really switches provider (no duplicate call to the same one)', async () => {
  const { reasoningSkill } = await import('../skills/reasoning.js');
  mockOpenRouter({ content: '   ', usage: USAGE }); // réponse vide facturée
  const res: any = await reasoningSkill.handleToolCall!('agent_execute', { prompt: 'do it' }, {} as any);
  assert.ok(res.error, 'gemini fallback has no key → error');
  assert.equal(fetchCalls, 1, 'OpenRouter must not be called a second time');
});

test('agent_execute stops immediately when the mission budget is exhausted', async () => {
  const { reasoningSkill } = await import('../skills/reasoning.js');
  mockOpenRouter({ usage: USAGE });
  telemetryService.setMissionBudget('B5', { maxTokens: 1 });
  try {
    const res: any = await runWithTelemetryContext({ missionId: 'B5' }, () =>
      reasoningSkill.handleToolCall!('agent_execute', { prompt: 'do it' }, {} as any));
    assert.match(res.error, /Budget de mission épuisé/);
    assert.equal(fetchCalls, 0);
  } finally {
    telemetryService.clearMissionBudget('B5');
  }
});
