import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { AgentSelector, type AgentSelectorDeps } from "./AgentSelector.js";
import { stageOfRole } from "../SwarmComposer.js";
import type { BrainStage } from "../brain/types.js";

const STAGES: Record<string, "build" | "design" | "verify"> = {
  debugger: "build", coder: "build", refactor: "build", architect: "design", tester: "verify",
};

function stage(role: string): BrainStage {
  return {
    id: "s1", title: "Corriger le bug", description: "Corrige src/a.ts", agentRole: role, agentReason: "planner",
    skills: [], tools: [], files: [], instructions: "", dependsOn: [], status: "pending", priority: "high",
  };
}

function selector(scores: Record<string, number>, extra: Partial<AgentSelectorDeps> = {}) {
  return new AgentSelector({
    scoreRole: (role) => (role in scores ? { score: scores[role], skillMatch: scores[role] > 0 ? 1 : 0 } : null),
    teamRoles: () => [],
    candidateRoles: () => Object.keys(scores),
    roleExists: () => true,
    inferCapabilities: () => ["code"],
    stageOf: (role) => STAGES[role],
    ...extra,
  });
}

describe("AgentSelector.choose", () => {
  it("conserve le rôle du planner sous la marge", () => {
    const c = selector({ debugger: 0.8, coder: 0.9 }).choose(stage("debugger"), "objectif");
    assert.deepEqual([c.role, c.changed], ["debugger", false]);
  });

  it("réaffecte au-delà de la marge", () => {
    const c = selector({ debugger: 0.6, coder: 0.9 }).choose(stage("debugger"), "objectif");
    assert.deepEqual([c.role, c.changed], ["coder", true]);
    assert.match(c.rationale, /coder/);
  });

  it("réaffecte si le rôle du planner est à capacité maximale", () => {
    const s = selector({ debugger: 0.9, coder: 0.5 }, {
      runningCount: (role) => (role === "debugger" ? 1 : 0),
      maxConcurrency: () => 1,
    });
    const c = s.choose(stage("debugger"), "objectif");
    assert.deepEqual([c.role, c.changed], ["coder", true]);
    assert.match(c.rationale, /capacité/);
  });

  it("ne considère jamais un rôle saturé sans compteur de tâches en cours", () => {
    const s = selector({ debugger: 0.9 }, { maxConcurrency: () => 1 });
    assert.equal(s.isSaturated("debugger"), false);
  });

  it("ne réaffecte jamais design ↔ build", () => {
    const c = selector({ architect: 0.1, coder: 1 }).choose(stage("architect"), "objectif");
    assert.deepEqual([c.role, c.changed], ["architect", false]);
  });

  it("ignore un candidat sans compétence requise", () => {
    const s = new AgentSelector({
      scoreRole: (role) => (role === "coder" ? { score: 0.99, skillMatch: 0 } : { score: 0.2, skillMatch: 1 }),
      teamRoles: () => [], candidateRoles: () => ["debugger", "coder"], roleExists: () => true,
      inferCapabilities: () => ["code"], stageOf: (role) => STAGES[role],
    });
    assert.equal(s.choose(stage("debugger"), "objectif").changed, false);
  });

  it("ne touche pas un rôle hors pipeline connu", () => {
    const s = selector({ data_analyst: 0.1, coder: 1 });
    const c = s.choose(stage("data_analyst"), "objectif");
    assert.deepEqual([c.role, c.changed], ["data_analyst", false]);
    assert.equal(s.nextBest(stage("data_analyst"), "objectif", ["data_analyst"]), null);
  });
});

describe("AgentSelector.nextBest", () => {
  it("renvoie le meilleur candidat hors exclusions et non saturé", () => {
    const s = selector({ debugger: 0.9, coder: 0.7, refactor: 0.5 }, {
      runningCount: (role) => (role === "coder" ? 1 : 0),
      maxConcurrency: () => 1,
    });
    assert.equal(s.nextBest(stage("debugger"), "objectif", ["debugger"]), "refactor");
  });

  it("renvoie null quand aucun candidat ne reste", () => {
    assert.equal(selector({ debugger: 0.9 }).nextBest(stage("debugger"), "objectif", ["debugger"]), null);
  });
});

describe("stageOfRole", () => {
  it("cartographie les rôles connus et ignore les clés du prototype", () => {
    assert.equal(stageOfRole("coder"), "build");
    assert.equal(stageOfRole("toString"), undefined);
    assert.equal(stageOfRole("data_analyst"), undefined);
  });
});
