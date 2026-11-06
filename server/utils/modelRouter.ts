import { resolvePricing, type FailedModelCall, type TokenUsage } from '../observability/TelemetryService.js';

export type TaskComplexity = 'simple' | 'standard' | 'complex';

const latencySamples = new Map<string, number[]>();

/** Latence observée en mémoire, bornée aux 50 derniers appels par modèle. */
export function recordModelLatency(model: string, latencyMs: number): void {
  if (!model || !Number.isFinite(latencyMs) || latencyMs <= 0) return;
  const samples = latencySamples.get(model) ?? [];
  samples.push(latencyMs);
  if (samples.length > 50) samples.shift();
  latencySamples.set(model, samples);
}

export function getModelLatencySnapshot(): Record<string, number> {
  return Object.fromEntries([...latencySamples].map(([model, samples]) => {
    const sorted = [...samples].sort((a, b) => a - b);
    return [model, sorted[Math.floor(sorted.length / 2)] ?? 0];
  }));
}

export interface AdaptiveModelInput {
  candidates: string[];
  promptChars: number;
  maxOutputTokens?: number;
  usage: TokenUsage[];
  failures: FailedModelCall[];
  latencyMsByModel?: Record<string, number>;
}

export interface AdaptiveModelDecision {
  model: string;
  complexity: TaskComplexity;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
  observedSuccesses: number;
  observedFailures: number;
  score: number;
}

/**
 * Selects only from user-configured candidates with known pricing.
 * It deliberately does not infer model quality from a model name.
 */
export function selectAdaptiveModel(input: AdaptiveModelInput): AdaptiveModelDecision | undefined {
  const candidates = [...new Set(input.candidates.map((model) => model.trim()).filter(Boolean))];
  if (candidates.length < 2) return undefined;

  const promptChars = Math.max(0, Number.isFinite(input.promptChars) ? input.promptChars : 0);
  const complexity: TaskComplexity = promptChars > 12_000 || (input.maxOutputTokens ?? 0) > 8_000
    ? 'complex'
    : promptChars > 3_000 || (input.maxOutputTokens ?? 0) > 2_000
      ? 'standard'
      : 'simple';

  const estimatedInputTokens = Math.max(1, Math.ceil(promptChars / 4));
  const outputTarget = complexity === 'complex' ? 4096 : complexity === 'standard' ? 2048 : 512;
  const outputCap = Number.isFinite(input.maxOutputTokens) && (input.maxOutputTokens ?? 0) > 0
    ? input.maxOutputTokens!
    : 8192;
  const estimatedOutputTokens = Math.min(outputTarget, outputCap);
  const riskWeight = complexity === 'complex' ? 5 : complexity === 'standard' ? 2.5 : 1;

  const ranked = candidates.flatMap((model) => {
    const resolved = resolvePricing(model);
    // Unknown/default prices are not safe enough for automatic cost routing.
    if (resolved.source === 'default' || resolved.source === 'unpriced') return [];
    const successes = input.usage.filter((record) => record.model === model && record.provider === 'openrouter').length;
    const failures = input.failures.filter((record) => record.model === model && record.provider === 'openrouter').length;
    const observations = successes + failures;
    const failureRate = observations >= 3
      ? failures / observations
      : Math.min(0.3, failures * 0.1);
    const estimatedCostUsd =
      (estimatedInputTokens / 1_000_000) * resolved.pricing.inputPer1M +
      (estimatedOutputTokens / 1_000_000) * resolved.pricing.outputPer1M;
    const latencyMs = input.latencyMsByModel?.[model] ?? 0;
    const latencyFactor = latencyMs > 0 ? 1 + Math.min(2, latencyMs / (complexity === 'complex' ? 15_000 : 8_000)) : 1;
    const score = estimatedCostUsd * (1 + failureRate * riskWeight) * latencyFactor;
    return [{
      model,
      complexity,
      estimatedInputTokens,
      estimatedOutputTokens,
      estimatedCostUsd,
      observedSuccesses: successes,
      observedFailures: failures,
      score,
    }];
  });

  // Never call it adaptive if fewer than two candidates have usable prices.
  if (ranked.length < 2) return undefined;
  ranked.sort((a, b) => a.score - b.score);
  return ranked[0];
}
