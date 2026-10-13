/**
 * Route /api/missions — sérialisation et relance.
 *
 *  - une mission en pause est exposée avec le statut "paused" (le polling du
 *    panneau ne doit plus écraser l'état de pause) ;
 *  - plan, durée, dernière erreur et auto-évaluation sont exposés ;
 *  - tri : missions actives puis historique, plus récentes d'abord ;
 *  - POST /missions/:id/retry relance le même brief, refuse une mission active.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createMissionsRouter } from "./missions.js";

function fakeMission(id: string, overrides: Record<string, unknown> = {}) {
  const state = {
    id,
    title: `Mission ${id}`,
    description: `Brief ${id}`,
    status: "in_progress",
    priority: "high",
    goals: {
      root: { id: "root", parentId: null, title: "racine", status: "in_progress", plannedActions: [] },
      g1: {
        id: "g1", parentId: "root", title: "Lire", status: "failed",
        plannedActions: [{
          id: "a1", skillName: "read_project_file", status: "failed", durationMs: 12,
          reflection: { confidence: 0.2, decision: "replan", failure: "Fichier introuvable" },
        }],
      },
    },
    activeGoalId: "g1",
    metrics: { averageConfidence: 0.4, totalActions: 1, successfulActions: 0, failedActions: 1 },
    context: { errors: [{ action: "read_project_file", error: "ENOENT" }] },
    createdAt: "2026-10-13T10:00:00.000Z",
    updatedAt: "2026-10-13T10:01:00.000Z",
    ...overrides,
  };
  return { id, getState: () => state };
}

describe("createMissionsRouter", () => {
  let server: Server;
  let base: string;
  const created: Array<Record<string, unknown>> = [];

  const active = fakeMission("m-active");
  const older = fakeMission("m-old", {
    status: "failed", createdAt: "2026-10-12T09:00:00.000Z", completedAt: "2026-10-12T09:00:30.000Z",
  });
  const newer = fakeMission("m-new", {
    status: "cancelled", createdAt: "2026-10-13T08:00:00.000Z", completedAt: "2026-10-13T08:00:05.000Z",
  });

  const executor = {
    listActiveMissions: () => [active],
    listCompletedMissions: () => [older, newer],
    getMission: (id: string) => (id === "m-active" ? active : undefined),
    isPaused: (id: string) => id === "m-active",
    getMissionPlan: (id: string) => (id === "m-active" ? { objectives: ["Lire"], tools: ["read_project_file"] } : undefined),
    getSelfEvaluation: (id: string) =>
      id === "m-old"
        ? { overall: 42, scores: { planAccuracy: 40 }, summary: "Moyen", notes: ["n1"], nextTimeStartWith: "lire d'abord" }
        : undefined,
  };

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api", createMissionsRouter(() => executor, async (name, args) => {
      created.push({ name, ...args });
      return { missionId: "m-retry", status: "started" };
    }));
    server = app.listen(0);
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });

  after(() => new Promise<void>((r) => server.close(() => r())));

  it("expose statut paused, plan, erreur, durée et auto-évaluation, triés", async () => {
    const res = await fetch(`${base}/missions`);
    const { missions } = await res.json();

    assert.deepEqual(missions.map((m: { id: string }) => m.id), ["m-active", "m-new", "m-old"]);
    const [a, , old] = missions;
    assert.equal(a.status, "paused");
    assert.equal(a.paused, true);
    assert.equal(a.description, "Brief m-active");
    assert.deepEqual(a.plan.objectives, ["Lire"]);
    assert.deepEqual(a.lastError, { action: "read_project_file", error: "ENOENT" });
    assert.equal(a.goals[0].actions[0].failure, "Fichier introuvable");
    assert.equal(old.durationMs, 30_000);
    assert.equal(old.selfEvaluation.overall, 42);
  });

  it("relance une mission de l'historique avec le même brief", async () => {
    const res = await fetch(`${base}/missions/m-old/retry`, { method: "POST" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.retriedFrom, "m-old");
    assert.deepEqual(created.at(-1), {
      name: "mission_create", title: "Mission m-old", description: "Brief m-old", priority: "high",
    });
  });

  it("refuse de relancer une mission active (409) ou inconnue (404)", async () => {
    assert.equal((await fetch(`${base}/missions/m-active/retry`, { method: "POST" })).status, 409);
    assert.equal((await fetch(`${base}/missions/inconnue/retry`, { method: "POST" })).status, 404);
  });
});
