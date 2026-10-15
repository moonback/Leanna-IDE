/**
 * Intégration Agent Lead ↔ AgentBrain : plan, understanding et vérification
 * scriptés (sans LLM), orchestrateur simulé qui écrit sur disque.
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { AgentBrain } from "../brain/AgentBrain.js";
import { AgentLead } from "./AgentLead.js";
import { AgentSelector } from "./AgentSelector.js";
import { createLeadRunState, type LeadPolicy } from "./types.js";
import type { BrainGoalInput, BrainPlan, BrainStage, GoalUnderstanding, StageVerification } from "../brain/types.js";
import type { TaskOutcome } from "../types.js";

let tmpRoot: string;
let targetFile: string;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-lead-"));
  targetFile = path.join(tmpRoot, "example.ts");
});
after(() => {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
});
beforeEach(() => fs.writeFileSync(targetFile, "const value: string = 123;\n", "utf-8"));

const understanding = (): GoalUnderstanding => ({
  intent: "Corriger", domain: "bugfix", complexity: "moderate", keyTechnologies: ["TypeScript"],
  relevantFiles: [targetFile], requirements: [], successCriteria: [], potentialRisks: [], rationale: "test",
});

const makeStage = (id: string, role: string, dependsOn: string[] = []): BrainStage => ({
  id, title: `Étape ${id} (${role})`, description: `Corrige ${targetFile}`, agentRole: role, agentReason: "test",
  skills: [], tools: ["modify_project_file"], files: [targetFile], instructions: "Corrige", dependsOn,
  status: "pending", priority: "high",
});

const makePlan = (stages: BrainStage[]): BrainPlan => ({
  id: "plan-lead-int", goal: "Corrige example.ts", understanding: understanding(), stages,
  estimatedDurationMs: 0, architectureRationale: "test", createdAt: new Date().toISOString(), status: "planned",
});

const input = (extra: Partial<BrainGoalInput> = {}): BrainGoalInput => ({
  goal: "Corrige example.ts", contextFiles: [targetFile], mode: "auto", maxCorrectionAttempts: 3, maxReplans: 0, ...extra,
});

/** Vérification scriptée : passe si le fichier contient GOOD ; `critical` force une issue critique. */
function scriptedVerifier(critical = false) {
  return {
    async verifyStage(stage: BrainStage): Promise<StageVerification> {
      const passed = !critical && fs.readFileSync(targetFile, "utf-8").includes("GOOD");
      return {
        stageId: stage.id, role: stage.agentRole, passed, syntaxCheckOk: passed, testsOk: passed, semanticCheckOk: passed,
        issues: passed ? [] : [{ severity: critical ? "critical" : "error", message: "type error", file: targetFile }],
        summary: passed ? "ok" : "échec", timestamp: new Date().toISOString(),
      };
    },
  };
}

type Reply = { content: string | null; outcome?: TaskOutcome } | Error;

function makeOrchestrator(reply: (params: { role: string; title: string }) => Reply) {
  let counter = 0;
  const tasks = new Map<string, unknown>();
  const delegated: Array<{ role: string; title: string }> = [];
  return {
    delegated,
    canRunTool: false,
    async runTool() { return null; },
    async delegateTask(params: { role: string; title: string }) {
      const r = reply(params);
      if (r instanceof Error) throw r;
      delegated.push({ role: params.role, title: params.title });
      const id = `task-${counter++}`;
      const filesModified: string[] = [];
      if (r.content !== null) {
        fs.writeFileSync(targetFile, r.content, "utf-8");
        filesModified.push(targetFile);
      }
      const outcome = r.outcome ?? "success";
      const task = {
        id, role: params.role, title: params.title, status: "completed",
        result: { success: outcome === "success", outcome, summary: "Fichier modifié.", filesModified, durationMs: 1 },
      };
      tasks.set(id, task);
      return task;
    },
    getTask(id: string) { return tasks.get(id); },
  };
}

const STAGES: Record<string, "build"> = { debugger: "build", coder: "build" };
function stubLead(): AgentLead {
  return new AgentLead({
    publish: () => {},
    selector: new AgentSelector({
      scoreRole: (role) => (role in STAGES ? { score: role === "debugger" ? 0.8 : 0.7, skillMatch: 1 } : null),
      teamRoles: () => [], candidateRoles: () => ["debugger", "coder"], roleExists: () => true,
      inferCapabilities: () => ["code"], stageOf: (role) => STAGES[role],
    }),
  });
}

function makeBrain(orch: unknown, plan: BrainPlan, lead: LeadPolicy, critical = false): AgentBrain {
  return new AgentBrain(orch as never, {
    understandingEngine: { understand: async () => understanding() },
    planner: { plan: async () => JSON.parse(JSON.stringify(plan)) as BrainPlan },
    verifier: scriptedVerifier(critical) as never,
    lead,
  });
}

const GOOD = "const value = 123; // GOOD\n";
const BAD = "const value = 123; // BAD\n";

describe("Agent Lead intégré à l'AgentBrain", () => {
  it("réaffecte une étape bloquée vers un autre agent qui la réussit", async () => {
    const orch = makeOrchestrator(({ role }) => (role === "debugger" ? { content: null, outcome: "blocked" } : { content: GOOD }));
    const result = await makeBrain(orch, makePlan([makeStage("s1", "debugger")]), stubLead()).executeGoal(input());
    assert.equal(result.success, true, result.summary);
    assert.deepEqual(orch.delegated.map((d) => d.role), ["debugger", "coder"]);
    assert.equal(result.stages[0].stage.agentRole, "coder");
    assert.ok(result.leadDecisions?.some((d) => d.kind === "arbitrate" && /reassign/.test(d.summary)));
  });

  it("abandonne une issue critique répétée sans épuiser les corrections", async () => {
    const orch = makeOrchestrator(() => ({ content: BAD }));
    const result = await makeBrain(orch, makePlan([makeStage("s1", "debugger")]), stubLead(), true).executeGoal(input());
    assert.equal(result.success, false);
    assert.equal(result.corrections.length, 1, "une seule correction avant l'abandon");
    assert.equal(orch.delegated.length, 2);
  });

  it("s'arrête proprement quand le budget de délégations est atteint", async () => {
    const orch = makeOrchestrator(() => ({ content: GOOD }));
    const plan = makePlan([makeStage("s1", "debugger"), makeStage("s2", "debugger", ["s1"])]);
    const result = await makeBrain(orch, plan, stubLead()).executeGoal(input({ leadBudget: { maxDelegations: 1 } }));
    assert.equal(result.success, false);
    assert.equal(result.stopReason, "delegation_budget");
    assert.equal(orch.delegated.length, 1);
    assert.match(result.summary, /Agent Lead/);
    assert.equal(result.budgetUsage?.delegations, 1);
  });

  it("se rabat sur un autre agent quand le rôle est à capacité maximale", async () => {
    const orch = makeOrchestrator(({ role }) =>
      role === "debugger"
        ? new Error(`L'agent "Debugger" est à capacité maximale (1 tâche(s) simultanée(s)). Réessaie plus tard.`)
        : { content: GOOD }
    );
    const result = await makeBrain(orch, makePlan([makeStage("s1", "debugger")]), stubLead()).executeGoal(input());
    assert.equal(result.success, true, result.summary);
    assert.equal(result.stages[0].stage.agentRole, "coder");
  });

  it("un Lead qui lève des exceptions ne change pas l'issue de la mission", async () => {
    const boom = () => { throw new Error("lead en panne"); };
    const brokenLead: LeadPolicy = {
      begin: (plan) => createLeadRunState(plan.id, plan.goal, undefined, Date.now()),
      selectAgents: boom, arbitrate: boom, shouldContinue: boom, nextBestRole: boom,
      recordDelegation: boom, recordStageOutcome: boom,
    };
    const orch = makeOrchestrator(({ title }) => ({ content: title.includes("Auto-Correction") ? GOOD : BAD }));
    const result = await makeBrain(orch, makePlan([makeStage("s1", "debugger")]), brokenLead).executeGoal(input());
    assert.equal(result.success, true, result.summary);
    assert.equal(result.corrections.length, 1);
  });

  it("lead: false restaure le comportement sans Agent Lead", async () => {
    const orch = makeOrchestrator(() => ({ content: GOOD }));
    const plan = makePlan([makeStage("s1", "debugger"), makeStage("s2", "debugger", ["s1"])]);
    const result = await makeBrain(orch, plan, stubLead()).executeGoal(input({ lead: false, leadBudget: { maxDelegations: 1 } }));
    assert.equal(result.success, true);
    assert.equal(orch.delegated.length, 2);
    assert.equal(result.leadDecisions, undefined);
    assert.equal(result.stopReason, undefined);
  });
});
