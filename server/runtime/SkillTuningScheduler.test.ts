import test from "node:test";
import assert from "node:assert/strict";
import { createSkillTuningScheduler } from "./SkillTuningScheduler.js";
import type { SkillTuningStore } from "./SkillTraceStore.js";

function createStore(onCreate: () => void): SkillTuningStore {
  return {
    record: async () => {},
    listRecent: async () => [],
    getMetrics: async () => [{
      toolName: "security_audit",
      calls: 6,
      failures: 2,
      successRate: 0.67,
      averageDurationMs: 20,
      feedback: { correct: 0, incorrect: 2, needsImprovement: 0 },
    }],
    recordFeedback: async () => {},
    listProposals: async () => [],
    createProposal: async (proposal: any) => {
      onCreate();
      return { id: "proposal-1", createdAt: new Date().toISOString(), ...proposal };
    },
    updateProposalStatus: async () => { throw new Error("unused"); },
    markProposalApplied: async () => {},
  };
}

test("skill tuning scheduler: runs an analysis on demand", async () => {
  let created = 0;
  const scheduler = createSkillTuningScheduler(createStore(() => { created += 1; }), 0);
  await scheduler.runNow();
  assert.equal(created, 1);
  scheduler.stop();
});

test("skill tuning scheduler: stays disabled without an interval", async () => {
  let created = 0;
  const scheduler = createSkillTuningScheduler(createStore(() => { created += 1; }), 0);
  scheduler.start();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(created, 0);
  scheduler.stop();
});
