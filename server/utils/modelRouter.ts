import { resolvePricing, type FailedModelCall, type TokenUsage } from '../observability/TelemetryService.js';

export type TaskComplexity = 'simple' | 'standard' | 'complex';

export interface AdaptiveModelInput {
  candidates: string[];
  promptChars: number;
  maxOutputTokens?: number;
  usage: TokenUsage[];
  failures: FailedModelCall[];
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
    const score = estimatedCostUsd * (1 + failureRate * riskWeight);
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

  ranked.sort((a, b) => a.score - b.score);
  return ranked[0];
}
