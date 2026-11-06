import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRoxaneConfig } from './types.js';

test('normalizeRoxaneConfig supplies safe defaults', () => {
  const config = normalizeRoxaneConfig(undefined);
  assert.equal(config.name, 'Roxane');
  assert.equal(config.enabled, true);
  assert.equal(config.provider, 'gemini');
  assert.equal(config.maxRounds, 3);
});

test('normalizeRoxaneConfig clamps numeric controls', () => {
  const config = normalizeRoxaneConfig({
    temperature: 99,
    topP: -2,
    maxTokens: 999999,
    contradictionLevel: 500,
    maxRounds: 99,
    maxDurationSeconds: 1,
  });
  assert.equal(config.temperature, 2);
  assert.equal(config.topP, 0);
  assert.equal(config.maxTokens, 8192);
  assert.equal(config.contradictionLevel, 100);
  assert.equal(config.maxRounds, 8);
  assert.equal(config.maxDurationSeconds, 60);
});

test('normalizeRoxaneConfig restricts provider and response style', () => {
  const config = normalizeRoxaneConfig({ provider: 'unknown', responseStyle: 'verbose' });
  assert.equal(config.provider, 'gemini');
  assert.equal(config.responseStyle, 'balanced');
});
