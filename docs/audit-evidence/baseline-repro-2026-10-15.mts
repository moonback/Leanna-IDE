// Script de reproduction des défauts D1–D9 — à exécuter sur le commit ec70926 (avant correction) :
//   git checkout ec70926 && node --import tsx --import ./scripts/test-isolation.mjs docs/audit-evidence/baseline-repro-2026-10-15.mts
// Résultat observé : docs/audit-evidence/baseline-repro-2026-10-15.json
// Baseline reproduction of telemetry/budget defects (run BEFORE fixes).
// Run from repo root: node --import tsx --import ./scripts/test-isolation.mjs <this file>
const { Models } = await import(`${process.cwd()}/node_modules/@google/genai/dist/node/index.mjs`);
const root = process.cwd();
const tg = await import(`${root}/server/utils/textGeneration.ts`);
const { telemetryService } = await import(`${root}/server/observability/TelemetryService.ts`);
const pool = await import(`${root}/server/utils/geminiKeyPool.ts`);

const out: Record<string, unknown> = {};
const svc: any = telemetryService;
const reset = () => { svc.usageStore = []; };

let fetchCalls = 0;
const orReply = (usage: any) => async (_url: any, init: any) => {
  fetchCalls++;
  const body = JSON.parse(init.body);
  if (body.stream) {
    const enc = new TextEncoder();
    const chunks = [
      `data: {"choices":[{"delta":{"content":"hi"}}]}\n`,
      `data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":11,"completion_tokens":7,"total_tokens":18}}\n`,
      `data: [DONE]\n`,
    ];
    return new Response(new ReadableStream({ start(c) { chunks.forEach(x => c.enqueue(enc.encode(x))); c.close(); } }), { status: 200 });
  }
  await new Promise(r => setTimeout(r, 5));
  return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }], ...(usage ? { usage } : {}) }), { status: 200 });
};
tg.setTextGenerationProfile({ textProvider: 'openrouter', openrouterApiKey: 'sk-test' });
process.env.LEANNA_PROVIDER_FALLBACK = '0';

// D1 — concurrent context contamination
globalThis.fetch = orReply({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }) as any;
reset();
async function task(id: string, delay: number) {
  tg.setTelemetryContext({ taskId: id, agentRole: id });
  await new Promise(r => setTimeout(r, delay));
  await tg.generateText({ prompt: 'x' });
}
await Promise.all([task('A', 20), task('B', 1)]);
out.D1_concurrent_attribution = svc.usageStore.map((u: any) => u.taskId);
tg.clearTelemetryContext();

// D2 — streaming not recorded
reset();
await tg.generateTextStream({ prompt: 'x', onChunk: () => {} });
out.D2_stream_records = svc.usageStore.length;

// D3 — budget does not block a new call
reset(); fetchCalls = 0;
telemetryService.setMissionBudget('m1', { maxTokens: 10 });
tg.setTelemetryContext({ missionId: 'm1' });
await tg.generateText({ prompt: 'x' }); // 15 tokens -> exceeded
const before = fetchCalls;
let blocked = false;
try { await tg.generateText({ prompt: 'y' }); } catch { blocked = true; }
out.D3_budget = { exceededAfterFirst: telemetryService.checkBudget('m1').exceeded, secondCallBlocked: blocked, providerCallsAfterExceeded: fetchCalls - before };
tg.clearTelemetryContext();

// D4 — model variant falls back to DEFAULT pricing
out.D4_pricing = {
  exact_gemini25pro: telemetryService.calculateCost('gemini-2.5-pro', 1e6, 0),
  variant_preview: telemetryService.calculateCost('gemini-2.5-pro-preview-05-06', 1e6, 0),
  models_prefix: telemetryService.calculateCost('models/gemini-2.5-pro', 1e6, 0),
  openrouter_free: telemetryService.calculateCost('openai/gpt-4o-mini:free', 1e6, 0),
};

// D5 — response without usage metadata is not recorded at all
reset();
globalThis.fetch = orReply(null) as any;
await tg.generateText({ prompt: 'x' });
out.D5_records_without_usage = svc.usageStore.length;

// D6 — aggregates drop after a successful flush
reset();
globalThis.fetch = orReply({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }) as any;
await tg.generateText({ prompt: 'x' });
const aggBefore = telemetryService.getAggregatedStats().totalTokens;
svc.supabase = { from: () => ({ insert: async () => ({ error: null }) }) };
await svc.flushToSupabase();
out.D6_aggregates = { before: aggBefore, afterFlush: telemetryService.getAggregatedStats().totalTokens };
svc.supabase = null;

// D7 — without Supabase the store grows unbounded
reset();
for (let i = 0; i < 1500; i++) telemetryService.recordTokenUsage({ provider: 'gemini', model: 'gemini-2.0-flash', inputTokens: 1, outputTokens: 1 });
out.D7_store_len_without_supabase = svc.usageStore.length;

// D8 — fallback not distinguished
reset();
process.env.LEANNA_PROVIDER_FALLBACK = '1';
tg.setTextGenerationProfile({ textProvider: 'gemini', openrouterApiKey: 'sk-test' });
await tg.generateText({ prompt: 'x' }); // no gemini key -> fallback to openrouter
out.D8_fallback_record_keys = Object.keys(svc.usageStore[0] ?? {});

// D9 — Gemini thoughts tokens dropped
reset();
await pool.addGeminiKey('AIzaFAKEKEYFORTEST000000000000000');
(Models.prototype as any).generateContentInternal = async () => ({
  candidates: [{ content: { parts: [{ text: 'ok' }] } }],
  usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, thoughtsTokenCount: 400, cachedContentTokenCount: 60, totalTokenCount: 550 },
});
await tg.generateText({ prompt: 'x', forceProvider: 'gemini' });
const r = svc.usageStore[0];
out.D9_gemini = { input: r?.inputTokens, output: r?.outputTokens, total: r?.totalTokens, providerTotal: 550 };

console.log(JSON.stringify(out, null, 2));
process.exit(0);
