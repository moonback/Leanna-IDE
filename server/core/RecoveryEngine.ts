/**
 * RecoveryEngine — deterministic recovery policy for supervised missions.
 *
 * The classifier is intentionally local and cheap: it never calls an LLM and
 * never weakens permission, safety, or side-effect guarantees.
 */
import type { RunnerOutcome, RecoveryDecision } from "./LeannaSupervisor.js";

export type FailureCategory =
  | "transient"
  | "verification"
  | "implementation"
  | "planning"
  | "permission"
  | "safety"
  | "side_effect_unknown"
  | "provider_quota"
  | "unknown";

export interface RecoveryAssessment {
  category: FailureCategory;
  decision: RecoveryDecision;
  reason: string;
  retryable: boolean;
}

const PERMISSION_PATTERNS = [/authorization denied|permission denied|not authorized|approval refused|access denied/i];
const SAFETY_PATTERNS = [
  /prompt.?injection/i,
  /policy violation/i,
  /unsafe|security violation|blocked by safety/i,
];
const UNKNOWN_EFFECT_PATTERNS = [
  /unknown side.?effect/i,
  /side.?effect.*unknown/i,
  /payment.*status unknown/i,
  /request outcome unknown/i,
];
const TRANSIENT_PATTERNS = [
  /\b429\b|rate.?limit/i,
  /\b503\b|\b502\b|\b504\b/,
  /econnreset|econnrefused|etimedout|enotfound|network error|socket hang up/i,
  /timeout|temporarily unavailable|service unavailable/i,
];
const QUOTA_PATTERNS = [/quota exceeded|insufficient credits|billing limit|token budget exceeded/i];
const PLANNING_PATTERNS = [/invalid plan|dependency cycle|no viable plan|planning failed|missing prerequisite/i];
const IMPLEMENTATION_PATTERNS = [
  /typescript|tsc|type.?error|compile error|build failed|test failed|assertion/i,
  /syntaxerror|referenceerror|cannot find module|module not found/i,
];

function matchesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

/** Classifies a failed attempt from observed errors and verification facts. */
export function classifyFailure(outcome: RunnerOutcome): FailureCategory {
  const evidence = outcome.evidence;
  const failedChecks = [
    ...(evidence?.runtimeChecks ?? []),
    ...(evidence?.testsExecuted ?? []),
    ...(evidence?.typecheck ? [evidence.typecheck] : []),
    ...(evidence?.lint ? [evidence.lint] : []),
  ].filter((check) => !check.passed);
  const message = [
    outcome.error ?? "",
    ...failedChecks.map((check) => `${check.name}: ${check.details ?? ""}`),
  ].join("\n");

  if (matchesAny(message, PERMISSION_PATTERNS)) return "permission";
  if (matchesAny(message, SAFETY_PATTERNS)) return "safety";
  if (matchesAny(message, UNKNOWN_EFFECT_PATTERNS)) return "side_effect_unknown";
  if (matchesAny(message, QUOTA_PATTERNS)) return "provider_quota";
  if (matchesAny(message, TRANSIENT_PATTERNS)) return "transient";
  if (matchesAny(message, PLANNING_PATTERNS)) return "planning";
  if (failedChecks.length > 0 || matchesAny(message, IMPLEMENTATION_PATTERNS)) return "implementation";
  if (outcome.suggestedRecovery === "escalate") return "unknown";
  return "unknown";
}

/**
 * Selects one bounded strategy. Safety and uncertain external effects always
 * override runner suggestions; other explicit suggestions remain advisory.
 */
export class RecoveryEngine {
  assess(outcome: RunnerOutcome, attempt: number, maxAttempts: number): RecoveryAssessment {
    const category = classifyFailure(outcome);
    if (attempt >= maxAttempts) {
      return { category, decision: "escalate", reason: "Recovery attempt budget exhausted.", retryable: false };
    }

    switch (category) {
      case "safety":
      case "permission":
      case "side_effect_unknown":
      case "provider_quota":
        return {
          category,
          decision: "escalate",
          reason: category === "side_effect_unknown"
            ? "External side-effect outcome is uncertain; blind replay is forbidden."
            : `Failure category '${category}' requires operator intervention.`,
          retryable: false,
        };
      case "transient":
        return { category, decision: "retry", reason: "Transient infrastructure failure; bounded retry is safe.", retryable: true };
      case "implementation":
        return { category, decision: "repair", reason: "Verification or implementation failure; target a minimal repair.", retryable: true };
      case "planning":
        return { category, decision: "replan", reason: "The current plan is invalid; construct a new plan.", retryable: true };
      case "unknown":
        if (outcome.suggestedRecovery === "escalate") {
          return { category, decision: "escalate", reason: "Runner explicitly requested escalation.", retryable: false };
        }
        if (outcome.suggestedRecovery) {
          return { category, decision: outcome.suggestedRecovery, reason: "Using the runner's explicit recovery hint.", retryable: true };
        }
        return attempt === 1
          ? { category, decision: "retry", reason: "One bounded retry for an unclassified failure.", retryable: true }
          : { category, decision: "replan", reason: "Unclassified failure persisted after retry.", retryable: true };
    }
  }
}
