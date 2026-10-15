/**
 * Le proxy /api/openrouter/chat était hors télémétrie et hors budget (audit
 * 2026-10-15). Fournisseur simulé : seules les requêtes vers openrouter.ai
 * sont interceptées, le serveur Express de test est appelé réellement.
 */
import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createOpenRouterRouter } from './openrouter.js';
import { telemetryService } from '../observability/TelemetryService.js';
import { runWithTelemetryContext } from '../utils/textGeneration.js';

const realFetch = globalThis.fetch;
let upstreamCalls = 0;
let baseUrl = '';
let server: ReturnType<ReturnType<typeof express>['listen']>;

before(async () => {
  const app = express();
  app.use(express.json());
  // Permet de tester le budget : la mission est fournie par l'en-tête de test.
  app.use((req, _res, next) => {
    const missionId = req.header('x-test-mission');
    if (missionId) runWithTelemetryContext({ missionId }, () => next());
    else next();
  });
  app.use('/api/openrouter', createOpenRouterRouter(() => ({})));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  globalThis.fetch = (async (url: any, init: any) => {
    if (String(url).startsWith('https://openrouter.ai')) {
      upstreamCalls++;
      return new Response(JSON.stringify({
        model: 'openai/gpt-4o',
        choices: [{ message: { content: 'pong' } }],
        usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
      }), { status: 200 });
    }
    return realFetch(url, init);
  }) as typeof fetch;
});

after(async () => {
  globalThis.fetch = realFetch;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  upstreamCalls = 0;
  (telemetryService as any).recentRecords = [];
});

const chat = (headers: Record<string, string> = {}) =>
  realFetch(`${baseUrl}/api/openrouter/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ apiKey: 'sk-test', model: 'openai/gpt-4o', messages: [{ role: 'user', content: 'ping' }] }),
  });

test('/chat proxy records provider usage in central telemetry', async () => {
  const res = await chat();
  assert.equal(res.status, 200);
  const [rec] = telemetryService.getUsageRecords();
  assert.equal(rec.provider, 'openrouter');
  assert.equal(rec.model, 'openai/gpt-4o');
  assert.equal(rec.inputTokens, 12);
  assert.equal(rec.outputTokens, 3);
  assert.equal(rec.toolName, 'openrouter_chat_proxy');
});

test('/chat proxy is refused before the upstream call when the mission budget is exhausted', async () => {
  telemetryService.setMissionBudget('chat-m', { maxTokens: 1 });
  telemetryService.recordTokenUsage({ missionId: 'chat-m', provider: 'openrouter', model: 'openai/gpt-4o', inputTokens: 5, outputTokens: 0 });
  try {
    const res = await chat({ 'x-test-mission': 'chat-m' });
    assert.equal(res.status, 429);
    assert.equal(upstreamCalls, 0);
  } finally {
    telemetryService.clearMissionBudget('chat-m');
  }
});
