import test from "node:test";
import assert from "node:assert/strict";
import { EventBus } from "../runtime/EventBus.js";
import type { RuntimeEvent } from "../runtime/types.js";
import { AnticipationEngine } from "./AnticipationEngine.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Minimal AgentRuntime double exposing only what the engine reads. */
function fakeRuntime(stats = { failed: 0 }) {
  const events = new EventBus();
  return {
    events,
    getStats: () => ({ tasks: { failed: stats.failed } }),
  };
}

/** Capture every autonomy:anticipation event emitted on the bus. */
function captureProposals(events: EventBus) {
  const seen: Array<Extract<RuntimeEvent, { type: "autonomy:anticipation" }>> = [];
  events.on("autonomy:anticipation", (event) => seen.push(event));
  return seen;
}

const emptyStrategy = { getFailingSkills: () => [] } as never;
const emptyLearning = {
  getPatternsHistory: () => ({ errorPatterns: [], successPatterns: [], optimizations: [], decisions: [] }),
} as never;

test("reactive: a failed runtime task becomes a problem proposal", async () => {
  const runtime = fakeRuntime();
  const seen = captureProposals(runtime.events);
  const engine = new AnticipationEngine(runtime as never, {
    strategyMemory: emptyStrategy,
    learningEngine: emptyLearning,
  });
  engine.start();

  runtime.events.emit({ type: "task:failed", taskId: "t-1", error: "boom" });
  await sleep(5);

  assert.equal(seen.length, 1);
  assert.equal(seen[0].kind, "problem");
  assert.ok(seen[0].importance >= 0.4);
  assert.ok(seen[0].affectedResources.includes("t-1"));
  engine.stop();
});

test("reactive: identical signals are deduplicated within the window", async () => {
  const runtime = fakeRuntime();
  const seen = captureProposals(runtime.events);
  const engine = new AnticipationEngine(runtime as never, {
    strategyMemory: emptyStrategy,
    learningEngine: emptyLearning,
  });
  engine.start();

  runtime.events.emit({ type: "task:failed", taskId: "dup", error: "boom" });
  runtime.events.emit({ type: "task:failed", taskId: "dup", error: "boom" });
  await sleep(5);

  assert.equal(seen.length, 1, "duplicate signal class should emit a single proposal");
  engine.stop();
});

test("reactive: a permission denial is classified as a risk", async () => {
  const runtime = fakeRuntime();
  const seen = captureProposals(runtime.events);
  const engine = new AnticipationEngine(runtime as never, {
    strategyMemory: emptyStrategy,
    learningEngine: emptyLearning,
  });
  engine.start();

  runtime.events.emit({
    type: "tool:permissionDenied",
    toolName: "fs_delete",
    required: [],
    missing: ["undeclared"],
    mode: "enforce",
    enforced: true,
  });
  await sleep(5);

  assert.equal(seen.length, 1);
  assert.equal(seen[0].kind, "risk");
  engine.stop();
});

test("proactive sweep: failing skills surface a problem proposal", () => {
  const runtime = fakeRuntime();
  const seen = captureProposals(runtime.events);
  const strategy = {
    getFailingSkills: () => [
      { skillName: "flaky_tool", totalCalls: 10, successRate: 0.2, recentSuccessRate: 0.1, avgDurationMs: 100, failing: true },
    ],
  } as never;
  const engine = new AnticipationEngine(runtime as never, {
    strategyMemory: strategy,
    learningEngine: emptyLearning,
  });

  const emitted = engine.sweepNow();

  assert.ok(emitted.some((p) => p.kind === "problem" && p.affectedResources.includes("flaky_tool")));
  assert.ok(seen.some((e) => e.affectedResources.includes("flaky_tool")));
});

test("proactive sweep: recurring error pattern is reported with its count", () => {
  const runtime = fakeRuntime();
  const learning = {
    getPatternsHistory: () => ({
      errorPatterns: [
        {
          type: "error_pattern",
          signature: "err-sig-1",
          description: "TypeScript error TS2345 in src/foo.ts",
          occurrenceCount: 4,
          sourceIds: ["a", "b", "c", "d"],
          relatedFiles: ["src/foo.ts"],
          aggregatedImportance: 0.6,
          isRecurring: true,
        },
      ],
      successPatterns: [],
      optimizations: [],
      decisions: [],
    }),
  } as never;
  const engine = new AnticipationEngine(runtime as never, {
    strategyMemory: emptyStrategy,
    learningEngine: learning,
  });

  const emitted = engine.sweepNow();
  const proposal = emitted.find((p) => p.fingerprint === "sweep:error-pattern:err-sig-1");

  assert.ok(proposal, "recurring error pattern should produce a proposal");
  assert.ok(proposal!.message.includes("4 fois"));
});

test("proactive sweep: failed runtime tasks raise a risk proposal", () => {
  const runtime = fakeRuntime({ failed: 3 });
  const engine = new AnticipationEngine(runtime as never, {
    strategyMemory: emptyStrategy,
    learningEngine: emptyLearning,
  });

  const emitted = engine.sweepNow();

  assert.ok(emitted.some((p) => p.kind === "risk" && p.message.includes("3")));
});

test("auto-launch: high-importance actionable proposals are queued through submitTask", () => {
  const runtime = fakeRuntime({ failed: 20 }); // drives importance to the ceiling
  const submitted: string[] = [];
  const engine = new AnticipationEngine(runtime as never, {
    strategyMemory: emptyStrategy,
    learningEngine: emptyLearning,
    config: {
      sweepEveryTicks: 1,
      minImportance: 0.4,
      autoLaunchThreshold: 0.85,
      dedupeTtlMs: 600_000,
      historyLimit: 50,
      reflectEveryTicks: 0,
    },
    submitTask: (input) => {
      submitted.push(input.title);
      return {
        ...input,
        id: "task-1",
        createdAt: Date.now(),
        status: "pending",
        attempts: 0,
        maxRetries: 3,
        timeoutMs: 60_000,
      };
    },
  });

  const emitted = engine.sweepNow();
  const risk = emitted.find((p) => p.kind === "risk");

  assert.ok(risk, "a high failure count should produce a risk proposal");
  assert.equal(risk!.queuedAsTask, true, "high-importance proposal should be queued as a mission task");
  assert.equal(submitted.length, 1);
  assert.ok(submitted[0].startsWith("Anticipation:"));
});

test("without a submitTask seam, proposals are surfaced but never auto-launched", () => {
  const runtime = fakeRuntime({ failed: 20 });
  const engine = new AnticipationEngine(runtime as never, {
    strategyMemory: emptyStrategy,
    learningEngine: emptyLearning,
  });

  const emitted = engine.sweepNow();

  assert.ok(emitted.length > 0);
  assert.ok(emitted.every((p) => p.queuedAsTask === false));
});

test("proposals below minImportance are not emitted", async () => {
  const runtime = fakeRuntime();
  const seen = captureProposals(runtime.events);
  const engine = new AnticipationEngine(runtime as never, {
    strategyMemory: emptyStrategy,
    learningEngine: emptyLearning,
  });
  engine.start();

  // A routine, low-importance event (default perception importance 0.15).
  runtime.events.emit({ type: "agent:idle", agentId: "a-1" });
  await sleep(5);

  assert.equal(seen.length, 0);
  engine.stop();
});

// ─── Phase 2: proactivité réelle ─────────────────────────────────────────────
// These fakes isolate the new detectors from the real knowledge singletons so
// each integration point is verified deterministically. Empty engines are the
// default so the pre-Phase-2 tests above keep asserting exact counts.

const emptyOpportunity = { scan: () => ({ opportunities: [], generatedAt: "", summary: "" }) } as never;
const emptyDoctor = {
  diagnose: () => ({ scores: {}, global: 100, issues: [], improvementMissions: [], generatedAt: "", summary: "" }),
} as never;
const emptyPrediction = {
  predict: () => ({ successProbability: 1, successPercent: 100, riskLevel: "low", risks: [], estimatedDurationMs: 0, estimatedCostUsd: 0, estimatedTokens: 0, recommendedStrategy: [], steps: [], confidence: 1, generatedAt: "", summary: "" }),
} as never;
const emptyBriefing = {
  generate: () => ({ greeting: "", projectName: "", healthScore: 0, counts: { critical: 0, pending: 0, improvement: 0 }, items: [], recommendedMissions: [], highlights: [], generatedAt: "", summary: "" }),
} as never;

/** All knowledge engines wired to empty fakes; override per-test as needed. */
function phase2Engine(runtime: ReturnType<typeof fakeRuntime>, overrides: Record<string, unknown> = {}) {
  return new AnticipationEngine(runtime as never, {
    strategyMemory: emptyStrategy,
    learningEngine: emptyLearning,
    opportunityEngine: emptyOpportunity,
    projectDoctor: emptyDoctor,
    predictionEngine: emptyPrediction,
    dailyBriefing: emptyBriefing,
    ...overrides,
  } as never);
}

test("sweep: OpportunityEngine opportunities become proposals", () => {
  const runtime = fakeRuntime();
  const opportunityEngine = {
    scan: () => ({
      opportunities: [
        { id: "OPP-1", kind: "automation", message: "Workflow répété 5×", suggestedAction: "Créer un workflow.", value: 70, effort: 2, payoff: 35, affectedResources: ["x.ts"], signature: "automation:x" },
      ],
      generatedAt: "", summary: "",
    }),
  } as never;
  const engine = phase2Engine(runtime, { opportunityEngine });

  const emitted = engine.sweepNow();
  const proposal = emitted.find((p) => p.fingerprint === "sweep:opportunity:automation:x");

  assert.ok(proposal, "an opportunity should produce a proposal");
  assert.equal(proposal!.kind, "automation");
  assert.ok(proposal!.message.includes("Workflow répété"));
});

test("sweep: ProjectDoctor critical issue becomes a risk proposal", () => {
  const runtime = fakeRuntime();
  const projectDoctor = {
    diagnose: () => ({
      scores: {}, global: 40,
      issues: [
        { dimension: "security", severity: "critical", message: "secret commité", penalty: 40, affectedResources: [".env"], suggestedAction: "Révoquer et purger le secret." },
        { dimension: "tests", severity: "low", message: "couverture faible", penalty: 5, affectedResources: [], suggestedAction: "Ajouter des tests." },
      ],
      improvementMissions: [], generatedAt: "", summary: "",
    }),
  } as never;
  const engine = phase2Engine(runtime, { projectDoctor });

  const emitted = engine.sweepNow();
  const risk = emitted.find((p) => p.fingerprint.startsWith("sweep:health:security:"));

  assert.ok(risk, "a critical health issue should surface");
  assert.equal(risk!.kind, "risk");
  assert.ok(risk!.importance >= 0.9);
  // The low-severity issue must NOT produce a proposal.
  assert.ok(!emitted.some((p) => p.fingerprint.startsWith("sweep:health:tests:")));
});

test("sweep: PredictionEngine flags a risky top improvement mission", () => {
  const runtime = fakeRuntime();
  const projectDoctor = {
    diagnose: () => ({
      scores: {}, global: 60, issues: [],
      improvementMissions: [
        { title: "Refonte sécurité", description: "...", priority: "high", dimension: "security", affectedResources: ["auth.ts"] },
      ],
      generatedAt: "", summary: "",
    }),
  } as never;
  const predictionEngine = {
    predict: () => ({ successProbability: 0.3, successPercent: 30, riskLevel: "critical", risks: [], estimatedDurationMs: 0, estimatedCostUsd: 0, estimatedTokens: 0, recommendedStrategy: ["analyser", "tester"], steps: [], confidence: 0.5, generatedAt: "", summary: "" }),
  } as never;
  const engine = phase2Engine(runtime, { projectDoctor, predictionEngine });

  const emitted = engine.sweepNow();
  const risk = emitted.find((p) => p.fingerprint === "sweep:prediction:security:critical");

  assert.ok(risk, "a low-success top mission should raise a risk proposal");
  assert.ok(risk!.message.includes("30%"));
  assert.ok(risk!.suggestedAction.includes("analyser"));
});

test("daily briefing: emitted once per day, carries scheduled metadata on launch", () => {
  const runtime = fakeRuntime();
  const dailyBriefing = {
    generate: () => ({
      greeting: "", projectName: "demo", healthScore: 50,
      counts: { critical: 2, pending: 1, improvement: 0 },
      items: [], highlights: [],
      recommendedMissions: [{ title: "Corriger X", description: "...", priority: "critical" }],
      generatedAt: "", summary: "digest",
    }),
  } as never;
  const submitted: Array<Record<string, unknown>> = [];
  const engine = phase2Engine(runtime, {
    dailyBriefing,
    submitTask: (input: Record<string, unknown>) => {
      submitted.push(input);
      return { ...input, id: "task-brief", createdAt: Date.now(), status: "pending", attempts: 0, maxRetries: 1, timeoutMs: 1000 };
    },
  });

  const first = engine.briefNow();
  const second = engine.briefNow(); // same day → suppressed by dedupe

  assert.ok(first, "first briefing of the day should emit");
  assert.equal(second, undefined, "second briefing same day should be suppressed");
  assert.ok(first!.message.includes("2 critique"));
  // 2 criticals → importance 0.8 < autoLaunch 0.85 by default, so NOT launched.
  assert.equal(first!.queuedAsTask, false);
  assert.equal(submitted.length, 0);
});

test("daily briefing: a high-importance briefing auto-launches a scheduled goal", () => {
  const runtime = fakeRuntime();
  const dailyBriefing = {
    generate: () => ({
      greeting: "", projectName: "demo", healthScore: 10,
      counts: { critical: 5, pending: 0, improvement: 0 },
      items: [], highlights: [],
      recommendedMissions: [{ title: "Corriger la faille", description: "...", priority: "critical" }],
      generatedAt: "", summary: "digest",
    }),
  } as never;
  const submitted: Array<{ metadata?: { anticipation?: { scheduled?: boolean; briefingSummary?: string } } }> = [];
  const engine = phase2Engine(runtime, {
    dailyBriefing,
    // Lower the auto-launch threshold so the 0.8-importance briefing launches.
    config: { sweepEveryTicks: 4, minImportance: 0.4, autoLaunchThreshold: 0.75, dedupeTtlMs: 600_000, historyLimit: 50, reflectEveryTicks: 0 },
    submitTask: (input: { metadata?: { anticipation?: { scheduled?: boolean; briefingSummary?: string } } }) => {
      submitted.push(input);
      return { ...input, id: "task-brief", createdAt: Date.now(), status: "pending", attempts: 0, maxRetries: 1, timeoutMs: 1000 } as never;
    },
  });

  const proposal = engine.briefNow();

  assert.ok(proposal);
  assert.equal(proposal!.queuedAsTask, true);
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].metadata?.anticipation?.scheduled, true, "scheduled flag must reach the task metadata");
  assert.equal(submitted[0].metadata?.anticipation?.briefingSummary, "digest");
});
