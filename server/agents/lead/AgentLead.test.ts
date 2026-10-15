import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { AgentLead } from "./AgentLead.js";
import { AgentSelector } from "./AgentSelector.js";
import { DEFAULT_LEAD_BUDGET, type LeadDecision } from "./types.js";
import type { BrainPlan, BrainStage, StageVerification } from "../brain/types.js";

const STAGES: Record<string, "build"> = { debugger: "build", coder: "build" };

function makeSelector(scores: Record<string, number>) {
  return new AgentSelector({
    scoreRole: (role) => (role in scores ? { score: scores[role], skillMatch: 1 } : null),
    teamRoles: () => [], candidateRoles: () => Object.keys(scores), roleExists: () => true,
    inferCapabilities: () => ["code"], stageOf: (role) => STAGES[role],
  });
}

function stage(id: string, role: string, status: BrainStage["status"] = "pending"): BrainStage {
  return {
    id, title: `Étape ${id}`, description: "", agentRole: role, agentReason: "planner", skills: [], tools: [],
    files: [], instructions: "", dependsOn: [], status, priority: "high",
  };
}

function plan(stages: BrainStage[]): BrainPlan {
  return {
    id: "plan-lead", goal: "objectif", stages, estimatedDurationMs: 0, architectureRationale: "",
    createdAt: new Date().toISOString(), status: "executing",
    understanding: {
      intent: "", domain: "general", complexity: "simple", keyTechnologies: [], relevantFiles: [],
      requirements: [], successCriteria: [], potentialRisks: [], rationale: "",
    },
  };
}

function makeLead(scores: Record<string, number>, published: LeadDecision[] = [], now = () => 0) {
  return new AgentLead({ selector: makeSelector(scores), now, publish: (d) => published.push(d) });
}

describe("AgentLead", () => {
  it("begin fusionne un budget partiel avec les défauts", () => {
    const state = makeLead({}).begin(plan([]), { maxDelegations: 5, maxWallTimeMs: undefined });
    assert.equal(state.budget.maxDelegations, 5);
    assert.equal(state.budget.maxWallTimeMs, DEFAULT_LEAD_BUDGET.maxWallTimeMs);
    assert.equal(state.goal, "objectif");
  });

  it("selectAgents réaffecte seulement les étapes pending et journalise", () => {
    const published: LeadDecision[] = [];
    const lead = makeLead({ debugger: 0.2, coder: 0.9 }, published);
    const p = plan([stage("s1", "debugger"), stage("s2", "debugger", "completed")]);
    const state = lead.begin(p);
    lead.selectAgents(p, state);
    assert.equal(p.stages[0].agentRole, "coder");
    assert.match(p.stages[0].agentReason, /Agent Lead/);
    assert.equal(p.stages[1].agentRole, "debugger");
    assert.equal(state.decisions.length, 1);
    assert.equal(state.decisions[0].kind, "select");
    assert.deepEqual(published, state.decisions);
  });

  it("arbitrate journalise le verdict et propose une réaffectation via le sélecteur", () => {
    const lead = makeLead({ debugger: 0.9, coder: 0.7 });
    const p = plan([stage("s1", "debugger", "running")]);
    const state = lead.begin(p);
    const verification: StageVerification = {
      stageId: "s1", role: "debugger", passed: false, syntaxCheckOk: false, testsOk: false, semanticCheckOk: false,
      issues: [], summary: "ko", timestamp: new Date().toISOString(),
    };
    const v = lead.arbitrate({
      stage: p.stages[0], verification, attempt: 1, maxAttempts: 3,
      result: { success: false, outcome: "blocked", summary: "bloqué", durationMs: 1, filesModified: [] },
    }, state);
    assert.deepEqual([v.action, v.action === "reassign" && v.toRole], ["reassign", "coder"]);
    assert.equal(state.decisions.at(-1)?.kind, "arbitrate");
  });

  it("shouldContinue journalise l'arrêt une seule fois", () => {
    const lead = makeLead({}, [], () => 0);
    const state = lead.begin(plan([]), { maxDelegations: 1 });
    lead.recordDelegation(state, "stage");
    assert.equal(lead.shouldContinue(state, "delegation").continue, false);
    assert.equal(lead.shouldContinue(state, "delegation").continue, false);
    assert.equal(state.decisions.filter((d) => d.kind === "stop").length, 1);
  });

  it("nextBestRole exclut les rôles fournis", () => {
    const lead = makeLead({ debugger: 0.9, coder: 0.7 });
    const p = plan([stage("s1", "debugger")]);
    assert.equal(lead.nextBestRole(p.stages[0], lead.begin(p), ["debugger"]), "coder");
  });
});
