import test from 'node:test';
import assert from 'node:assert/strict';
import { getModelLatencySnapshot, recordModelLatency, selectAdaptiveModel } from './modelRouter.js';

const success = (model: string, agentRole = 'coder') => ({
  id: model + '-success',
  provider: 'openrouter' as const,
  model,
  agentRole,
  inputTokens: 100,
  outputTokens: 100,
  totalTokens: 200,
  costUsd: 0.001,
  timestamp: new Date().toISOString(),
  usageSource: 'provider' as const,
  pricingSource: 'exact' as const,
});
const failure = (model: string, agentRole = 'coder') => ({
  provider: 'openrouter' as const,
  model,
  agentRole,
  timestamp: new Date().toISOString(),
  error: 'upstream timeout',
});

test('adaptive routing selects the lowest estimated cost among priced candidates', () => {
  const result = selectAdaptiveModel({
    candidates: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o-mini', 'openai/gpt-4o-mini'],
    promptChars: 400,
    maxOutputTokens: 1000,
    usage: [],
    failures: [],
  });
  assert.equal(result?.model, 'openai/gpt-4o-mini');
  assert.equal(result?.complexity, 'simple');
  assert.equal(result?.observedSuccesses, 0);
});

test('complex tasks increase the impact of historical failures', () => {
  const candidates = ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o'];
  const usage = [
    success('openai/gpt-4o'), success('openai/gpt-4o'), success('openai/gpt-4o'),
    success('anthropic/claude-3.5-sonnet'), success('anthropic/claude-3.5-sonnet'),
    success('anthropic/claude-3.5-sonnet'),
  ];
  const failures = [
    failure('openai/gpt-4o'), failure('openai/gpt-4o'), failure('openai/gpt-4o'),
  ];
  const result = selectAdaptiveModel({
    candidates,
    promptChars: 20_000,
    maxOutputTokens: 12_000,
    usage,
    failures,
  });
  assert.equal(result?.complexity, 'complex');
  assert.equal(result?.model, 'anthropic/claude-3.5-sonnet');
  assert.equal(result?.observedFailures, 0);
});

test('latency observations are retained in a bounded in-memory sample', () => {
  const model = 'test/latency-sample';
  recordModelLatency(model, 120);
  recordModelLatency(model, 240);
  assert.equal(getModelLatencySnapshot()[model], 240);
});

test('observed latency breaks ties between candidates with identical prices', () => {
  const result = selectAdaptiveModel({
    candidates: ['google/gemini-3.6-flash', 'google/gemini-2.0-flash-exp'],
    promptChars: 500,
    usage: [],
    failures: [],
    latencyMsByModel: {
      'google/gemini-3.6-flash': 30_000,
      'google/gemini-2.0-flash-exp': 500,
    },
  });
  assert.equal(result?.model, 'google/gemini-2.0-flash-exp');
});

test('unknown-price models are excluded and one candidate is not a routing decision', () => {
  assert.equal(selectAdaptiveModel({
    candidates: ['unknown/provider-model', 'openai/gpt-4o-mini'],
    promptChars: 100,
    usage: [],
    failures: [],
  }), undefined);

  assert.equal(selectAdaptiveModel({
    candidates: ['openai/gpt-4o-mini'],
    promptChars: 100,
    usage: [],
    failures: [],
  }), undefined);
});
