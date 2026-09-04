import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "http";
import { createSkillTuningRouter } from "./skill-tuning.js";
import type { SkillTuningStore } from "../runtime/SkillTraceStore.js";

function createTestServer(store: SkillTuningStore): Promise<{ server: Server; port: number }> {
  const app = express();
  app.use(express.json());
  app.use("/api/skill-tuning", createSkillTuningRouter(store));
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