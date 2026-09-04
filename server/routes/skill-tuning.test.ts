import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "http";
import { createSkillTuningRouter } from "./skill-tuning.js";
import type { SkillTuningStore } from "../runtime/SkillTraceStore.js";

function createTestServer(store: SkillTuningStore, versionStore?: any): Promise<{ server: Server; port: number }> {
  const app = express();
  app.use(express.json());
  app.use("/api/skill-tuning", createSkillTuningRouter(store, versionStore));
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve({ server, port: (server.address() as any).port }));
  });
}

const store: SkillTuningStore = {
  record: async () => {},
  listRecent: async () => [{
    id: "trace-1",
    callId: "call-1",
    toolName: "security_audit",
    startedAt: "2026-09-04T00:00:00.000Z",
    createdAt: "2026-09-04T00:00:00.000Z",
    durationMs: 12,
    success: true,
    attemptCount: 1,
    arguments: {},
  }],
  getMetrics: async () => [{
    toolName: "security_audit",
    calls: 1,
    failures: 0,
    successRate: 1,
    averageDurationMs: 12,
    feedback: { correct: 0, incorrect: 0, needsImprovement: 0 },
  }],
  recordFeedback: async () => {},
  listProposals: async () => [],
  createProposal: async (proposal: any) => ({ id: "proposal-1", createdAt: "2026-09-04T00:00:00.000Z", ...proposal }),
  updateProposalStatus: async (id: string, status: any) => ({ id, createdAt: "2026-09-04T00:00:00.000Z", toolName: "security_audit", status, hypothesis: "", evidence: {}, proposedChange: {}, expectedMetric: "", confidence: 0.8 }),
  markProposalApplied: async () => {},
};

test("skill tuning routes: returns aggregated metrics", async () => {
  const { server, port } = await createTestServer(store);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/skill-tuning/metrics?toolName=security_audit`);
    assert.equal(response.status, 200);
    const body = await response.json() as any;
    assert.equal(body.metrics[0].successRate, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("skill tuning routes: validates and records feedback", async () => {
  let received: any;
  const feedbackStore = { ...store, recordFeedback: async (feedback: any) => { received = feedback; } };
  const { server, port } = await createTestServer(feedbackStore);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/skill-tuning/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId: "call-1", label: "needs_improvement", correction: "Lire les dépendances avant l'audit." }),
    });
    assert.equal(response.status, 201);
    assert.equal(received.label, "needs_improvement");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("skill tuning routes: rejects invalid feedback", async () => {
  const { server, port } = await createTestServer(store);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/skill-tuning/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId: "call-1", label: "unknown" }),
    });
    assert.equal(response.status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("skill tuning routes: generates and reviews a proposal", async () => {
  let reviewed: any;
  const proposalStore: SkillTuningStore = {
    ...store,
    getMetrics: async () => [{
      toolName: "security_audit",
      calls: 6,
      failures: 2,
      successRate: 0.67,
      averageDurationMs: 30,
      feedback: { correct: 1, incorrect: 1, needsImprovement: 1 },
    }],
    createProposal: async (proposal: any) => ({ id: "proposal-1", createdAt: "2026-09-04T00:00:00.000Z", ...proposal }),
    updateProposalStatus: async (id: string, status: any) => {
      reviewed = { id, status };
      return { ...reviewed, toolName: "security_audit", hypothesis: "", evidence: {}, proposedChange: {}, expectedMetric: "", confidence: 0.8, createdAt: "2026-09-04T00:00:00.000Z" };
    },
    markProposalApplied: async () => {},
  };
  const { server, port } = await createTestServer(proposalStore);
  try {
    const generated = await fetch(`http://127.0.0.1:${port}/api/skill-tuning/proposals/generate`, { method: "POST" });
    assert.equal(generated.status, 201);
    const reviewedResponse = await fetch(`http://127.0.0.1:${port}/api/skill-tuning/proposals/proposal-1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });
    assert.equal(reviewedResponse.status, 200);
    assert.equal(reviewed.status, "approved");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("skill tuning routes: does not duplicate an open proposal", async () => {
  let created = false;
  const proposalStore: SkillTuningStore = {
    ...store,
    getMetrics: async () => [{
      toolName: "security_audit",
      calls: 6,
      failures: 2,
      successRate: 0.67,
      averageDurationMs: 30,
      feedback: { correct: 1, incorrect: 1, needsImprovement: 1 },
    }],
    listProposals: async () => [{
      id: "proposal-existing",
      toolName: "security_audit",
      status: "proposed",
      hypothesis: "Déjà analysé",
      evidence: {},
      proposedChange: {},
      expectedMetric: "",
      confidence: 0.8,
      createdAt: "2026-09-04T00:00:00.000Z",
    }],
    createProposal: async (proposal: any) => {
      created = true;
      return { id: "proposal-2", createdAt: "2026-09-04T00:00:00.000Z", ...proposal };
    },
  };
  const { server, port } = await createTestServer(proposalStore);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/skill-tuning/proposals/generate`, { method: "POST" });
    assert.equal(response.status, 201);
    const body = await response.json() as any;
    assert.deepEqual(body.proposals, []);
    assert.equal(created, false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("skill tuning routes: requires approval before applying a revision", async () => {
  let applied = false;
  const versionStore = {
    applyUpdate: async () => {
      applied = true;
      return { skill: {}, revision: { id: "revision-1" } };
    },
    rollback: async () => ({ skill: {}, revision: { id: "revision-1" } }),
    listRevisions: async () => [],
  };
  const { server, port } = await createTestServer(store, versionStore);
  try {
    const response = await fetch("http://127.0.0.1:" + port + "/api/skill-tuning/proposals/proposal-1/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skillId: "00000000-0000-0000-0000-000000000001", updates: { enabled: false } }),
    });
    assert.equal(response.status, 404);
    assert.equal(applied, false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});