/**
 * Tests de non-régression — audit télémétrie/coûts du 2026-10-15.
 * Aucun appel réseau : la persistance Supabase est simulée.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { TelemetryService, resolvePricing } from './TelemetryService.js';

function freshService(): any {
  const svc: any = new TelemetryService();
  svc.supabase = null;
  return svc;
}

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-12, `${a} ≈ ${b}`);

// ─── Checklist C — coûts ─────────────────────────────────────────────────────

test('cost: known model with input and output tokens follows the per-million formula', () => {
  const svc = freshService();
  // gemini-2.5-pro configuré à 0.90 / 3.50 par 1M
  near(svc.calculateCost('gemini-2.5-pro', 1_000_000, 1_000_000), 0.90 + 3.50);
  near(svc.calculateCost('gemini-2.5-pro', 2_000, 500), (2_000 / 1e6) * 0.90 + (500 / 1e6) * 3.50);
});

test('cost: call without output tokens only bills input', () => {
  const svc = freshService();
  near(svc.calculateCost('openai/gpt-4o', 10_000, 0), (10_000 / 1e6) * 2.5);
});

test('cost: negative or non-finite counts are clamped to zero', () => {
  const svc = freshService();
  assert.equal(svc.calculateCost('openai/gpt-4o', -5, Number.NaN), 0);
});

test('pricing: unknown model uses DEFAULT_PRICING and is flagged "default"', () => {
  const r = resolvePricing('acme/unknown-model-x');
  assert.equal(r.source, 'default');
  assert.deepEqual(r.pricing, { inputPer1M: 0.5, outputPer1M: 1.5 });
});

test('pricing: version/preview suffix and models/ prefix are normalized to the base tariff', () => {
  assert.deepEqual(
    { s: resolvePricing('gemini-2.5-pro-preview-05-06').source, k: resolvePricing('gemini-2.5-pro-preview-05-06').key },
    { s: 'normalized', k: 'gemini-2.5-pro' },
  );
  assert.equal(resolvePricing('models/gemini-2.5-pro').key, 'gemini-2.5-pro');
  assert.equal(resolvePricing('gemini-2.0-flash-001').key, 'gemini-2.0-flash');
  assert.equal(resolvePricing('gemini-2.5-pro').source, 'exact');
});

test('pricing: a distinct variant (-lite) does NOT inherit the base model tariff', () => {
  assert.equal(resolvePricing('gemini-2.0-flash-lite').source, 'default');
});

test('pricing: OpenRouter :free variants cost nothing', () => {
  const r = resolvePricing('openai/gpt-4o-mini:free');
  assert.equal(r.source, 'free');
  assert.equal(freshService().calculateCost('openai/gpt-4o-mini:free', 1e6, 1e6), 0);
});

test('recordTokenUsage: cached and reasoning tokens are stored, cached billed at input rate (conservative)', () => {
  const svc = freshService();
  const cost = svc.recordTokenUsage({
    provider: 'gemini', model: 'gemini-2.5-pro',
    inputTokens: 1000, outputTokens: 600, cachedInputTokens: 400, reasoningTokens: 500,
  });
  const [rec] = svc.getUsageRecords();
  assert.equal(rec.cachedInputTokens, 400);
  assert.equal(rec.reasoningTokens, 500);
  assert.equal(rec.totalTokens, 1600);
  assert.equal(rec.usageSource, 'provider');
  assert.equal(rec.pricingSource, 'exact');
  near(cost, (1000 / 1e6) * 0.90 + (600 / 1e6) * 3.50);
});

test('recordTokenUsage: fallback provider and model are kept on the record', () => {
  const svc = freshService();
  svc.recordTokenUsage({
    provider: 'openrouter', model: 'google/gemini-3.6-flash', inputTokens: 10, outputTokens: 5,
    isFallback: true, fallbackFrom: 'gemini',
  });
  const [rec] = svc.getUsageRecords();
  assert.equal(rec.provider, 'openrouter');
  assert.equal(rec.model, 'google/gemini-3.6-flash');
  assert.equal(rec.isFallback, true);
  assert.equal(rec.fallbackFrom, 'gemini');
  assert.equal(svc.getAggregatedStats().fallbackCalls, 1);
});

// ─── Checklist B / J — agrégations et persistance ───────────────────────────

test('aggregates: per model / provider / agent / mission are consistent with records', () => {
  const svc = freshService();
  svc.recordTokenUsage({ provider: 'gemini', model: 'gemini-2.0-flash', inputTokens: 100, outputTokens: 50, agentRole: 'coder', missionId: 'm1' });
  svc.recordTokenUsage({ provider: 'openrouter', model: 'openai/gpt-4o', inputTokens: 10, outputTokens: 5, agentRole: 'reviewer', missionId: 'm1' });
  svc.recordTokenUsage({ provider: 'gemini', model: 'gemini-2.0-flash', inputTokens: 1, outputTokens: 1 });
  const s = svc.getAggregatedStats();
  assert.equal(s.totalTokens, 167);
  assert.equal(s.byProvider.gemini.tokens, 152);
  assert.equal(s.byProvider.openrouter.calls, 1);
  assert.equal(s.byAgent.coder.tokens, 150);
  assert.equal(s.byMission.m1.tokens, 165);
  assert.equal(s.unattributedCalls, 1);
  near(s.totalCost, Object.values<any>(s.byModel).reduce((a, m) => a + m.cost, 0));
});

test('persistence: a successful flush no longer erases dashboard aggregates', async () => {
  const svc = freshService();
  const inserted: any[] = [];
  svc.supabase = { from: () => ({ insert: async (rows: any[]) => { inserted.push(...rows); return { error: null }; } }) };
  svc.recordTokenUsage({ provider: 'gemini', model: 'gemini-2.0-flash', inputTokens: 10, outputTokens: 5 });
  await svc.flushToSupabase();
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].usage_source, 'provider');
  assert.equal(svc.getAggregatedStats().totalTokens, 15);
  const st = svc.getPersistenceStatus();
  assert.equal(st.pending, 0);
  assert.equal(st.persistedTotal, 1);
});

test('persistence: without Supabase nothing accumulates in the flush queue (bounded memory)', () => {
  const svc = freshService();
  for (let i = 0; i < 1500; i++) svc.recordTokenUsage({ provider: 'gemini', model: 'gemini-2.0-flash', inputTokens: 1, outputTokens: 1 });
  const st = svc.getPersistenceStatus();
  assert.equal(st.configured, false);
  assert.equal(st.pending, 0);
  assert.equal(svc.getAggregatedStats().totalTokens, 3000);
});

test('persistence: transient DB error is visible and the batch is requeued', async () => {
  const svc = freshService();
  svc.supabase = { from: () => ({ insert: async () => ({ error: { code: '500', message: 'boom' } }) }) };
  svc.recordTokenUsage({ provider: 'gemini', model: 'gemini-2.0-flash', inputTokens: 1, outputTokens: 1 });
  await svc.flushToSupabase();
  const st = svc.getPersistenceStatus();
  assert.equal(st.pending, 1);
  assert.match(st.lastError, /boom/);
});

test('persistence: bounded queue counts dropped records instead of losing them silently', () => {
  const svc = freshService();
  svc.supabase = { from: () => ({ insert: async () => ({ error: { code: '500', message: 'down' } }) }) };
  svc.flushToSupabase = async () => {}; // empêche le flush anticipé
  for (let i = 0; i < 5010; i++) svc.recordTokenUsage({ provider: 'gemini', model: 'gemini-2.0-flash', inputTokens: 1, outputTokens: 1 });
  const st = svc.getPersistenceStatus();
  assert.equal(st.pending, 5000);
  assert.equal(st.droppedUnpersisted, 10);
});

test('persistence: missing table disables persistence and reports the loss explicitly', async () => {
  const svc = freshService();
  svc.supabase = { from: () => ({ insert: async () => ({ error: { code: 'PGRST205', message: 'Could not find the table' } }) }) };
  svc.recordTokenUsage({ provider: 'gemini', model: 'gemini-2.0-flash', inputTokens: 1, outputTokens: 1 });
  await svc.flushToSupabase();
  const st = svc.getPersistenceStatus();
  assert.equal(st.disabled, true);
  assert.equal(st.droppedUnpersisted, 1);
  assert.match(st.disabledReason, /token_usage/);
});

test('persistence: missing v2 columns falls back to the v1 schema without losing data', async () => {
  const svc = freshService();
  const batches: any[][] = [];
  svc.supabase = {
    from: () => ({
      insert: async (rows: any[]) => {
        batches.push(rows);
        return 'usage_source' in rows[0]
          ? { error: { code: 'PGRST204', message: "Could not find the 'usage_source' column of 'token_usage'" } }
          : { error: null };
      },
    }),
  };
  svc.recordTokenUsage({ provider: 'gemini', model: 'gemini-2.0-flash', inputTokens: 1, outputTokens: 1 });
  await svc.flushToSupabase();
  assert.equal(batches.length, 2);
  assert.equal('usage_source' in batches[1][0], false);
  const st = svc.getPersistenceStatus();
  assert.equal(st.legacySchema, true);
  assert.equal(st.persistedTotal, 1);
});

// ─── Checklist G — budgets ───────────────────────────────────────────────────

test('budget: reservation is refused once the token budget is reached', () => {
  const svc = freshService();
  svc.setMissionBudget('m', { maxTokens: 100 });
  svc.recordTokenUsage({ missionId: 'm', provider: 'gemini', model: 'gemini-2.0-flash', inputTokens: 60, outputTokens: 40 });
  assert.equal(svc.checkBudget('m').exceeded, true, 'reaching the limit exactly marks it exceeded');
  const r = svc.reserveBudget('m', { model: 'gemini-2.0-flash', inputTokens: 1 });
  assert.equal(r.allowed, false);
});

test('budget: in-flight reservations are counted for concurrent calls', () => {
  const svc = freshService();
  svc.setMissionBudget('m', { maxTokens: 1000 });
  const a = svc.reserveBudget('m', { model: 'gemini-2.0-flash', inputTokens: 600 });
  assert.equal(a.allowed, true);
  const b = svc.reserveBudget('m', { model: 'gemini-2.0-flash', inputTokens: 600 });
  assert.equal(b.allowed, false, 'second parallel call would exceed the budget');
  a.release();
  const c = svc.reserveBudget('m', { model: 'gemini-2.0-flash', inputTokens: 600 });
  assert.equal(c.allowed, true, 'released reservation frees the room');
});

test('budget: cost budget is enforced before the call', () => {
  const svc = freshService();
  svc.setMissionBudget('m', { maxCostUsd: 0.001 });
  // 1M tokens d'entrée sur gpt-4o = 2.5 $ estimé
  const r = svc.reserveBudget('m', { model: 'openai/gpt-4o', inputTokens: 1_000_000 });
  assert.equal(r.allowed, false);
  assert.match(r.reason, /Cost budget/);
});

test('budget: missions without a budget (or no mission) are never blocked', () => {
  const svc = freshService();
  assert.equal(svc.reserveBudget(undefined, { model: 'x', inputTokens: 1e9 }).allowed, true);
  assert.equal(svc.reserveBudget('nobudget', { model: 'x', inputTokens: 1e9 }).allowed, true);
});

test('failed calls are counted without adding tokens', () => {
  const svc = freshService();
  svc.recordFailedCall({ provider: 'gemini', model: 'gemini-2.0-flash', error: '503' });
  const s = svc.getAggregatedStats();
  assert.equal(s.totalTokens, 0);
  assert.equal(s.coverage.failedCallsSinceStart, 1);
  assert.equal(svc.getRecentFailures().length, 1);
});
