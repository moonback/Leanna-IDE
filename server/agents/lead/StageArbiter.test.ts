import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { StageArbiter } from "./StageArbiter.js";
import { createLeadRunState, type ArbitrationInput } from "./types.js";
import type { BrainStage, StageVerification, VerificationIssue } from "../brain/types.js";
import type { TaskResult } from "../types.js";

const stage = (role = "coder"): BrainStage => ({
  id: "s1", title: "Étape", description: "", agentRole: role, agentReason: "", skills: [], tools: [],
  files: [], instructions: "", dependsOn: [], status: "running", priority: "high",
});

const verification = (passed: boolean, issues: VerificationIssue[] = []): StageVerification => ({
  stageId: "s1", role: "coder", passed, syntaxCheckOk: passed, testsOk: passed, semanticCheckOk: passed,
  issues, summary: passed ? "ok" : "ko", timestamp: new Date().toISOString(),
});

const result = (over: Partial<TaskResult> = {}): TaskResult => ({
  success: true, outcome: "success", summary: "Fichier corrigé et vérifié.", durationMs: 1, filesModified: ["a.ts"], ...over,
});

function input(over: Partial<ArbitrationInput> = {}): ArbitrationInput {
  return { stage: stage(), verification: verification(true), result: result(), attempt: 1, maxAttempts: 3, ...over };
}

const arbiter = new StageArbiter();
const none = () => null;
const state = () => createLeadRunState("p", "objectif", undefined, 0);

describe("StageArbiter", () => {
  it("règle 1 : vérification passée sans écriture et plan seulement → correct", () => {
    const v = arbiter.arbitrate(
      input({ result: result({ filesModified: [], summary: "Je vais modifier le fichier ensuite." }) }),
      state(), none
    );
    assert.equal(v.action, "correct");
    assert.match(v.rationale, /contradiction/);
  });

  it("règle 1 sans tentative restante → abandon", () => {
    const v = arbiter.arbitrate(
      input({ attempt: 4, result: result({ filesModified: [], summary: "Je vais modifier le fichier ensuite." }) }),
      state(), none
    );
    assert.equal(v.action, "abandon");
  });

  it("règle 1 ne s'applique pas à un rôle de revue", () => {
    const v = arbiter.arbitrate(
      input({ stage: stage("reviewer"), result: result({ filesModified: [], summary: "Je vais relire." }) }),
      state(), none
    );
    assert.equal(v.action, "accept");
  });

  it("règle 2 : vérification passée → accept", () => {
    assert.equal(arbiter.arbitrate(input(), state(), none).action, "accept");
  });

  it("accepte une étape passée sans résultat", () => {
    assert.equal(arbiter.arbitrate(input({ result: undefined }), state(), none).action, "accept");
  });

  it("règle 3 : issue critique répétée → abandon", () => {
    const s = state();
    const crit: VerificationIssue[] = [{ severity: "critical", message: "build cassé", file: "a.ts" }];
    const first = arbiter.arbitrate(input({ verification: verification(false, crit) }), s, none);
    assert.equal(first.action, "correct");
    const second = arbiter.arbitrate(input({ verification: verification(false, crit), attempt: 2 }), s, none);
    assert.equal(second.action, "abandon");
    assert.match(second.rationale, /build cassé/);
  });

  it("règle 4 : bloqué sans trace → reassign, une seule fois par étape", () => {
    const s = state();
    const blocked = input({ verification: verification(false), result: result({ success: false, outcome: "blocked", filesModified: [] }) });
    const first = arbiter.arbitrate(blocked, s, () => "debugger");
    assert.deepEqual([first.action, first.action === "reassign" && first.toRole], ["reassign", "debugger"]);
    assert.ok(s.reassigned.has("s1"));
    assert.equal(arbiter.arbitrate(blocked, s, () => "debugger").action, "correct");
  });

  it("règle 4 : échec avec outils exécutés → pas de réaffectation", () => {
    const v = arbiter.arbitrate(
      input({
        verification: verification(false),
        result: result({
          success: false, outcome: "failed", filesModified: [],
          evidence: { filesRead: [], filesModified: [], toolsExecuted: ["read_project_file"], commandsExecuted: [] } as unknown as TaskResult["evidence"],
        }),
      }),
      state(), () => "debugger"
    );
    assert.equal(v.action, "correct");
  });

  it("règles 5/6 : correct tant qu'il reste des tentatives, puis abandon", () => {
    assert.equal(arbiter.arbitrate(input({ verification: verification(false), attempt: 3 }), state(), none).action, "correct");
    assert.equal(arbiter.arbitrate(input({ verification: verification(false), attempt: 4 }), state(), none).action, "abandon");
  });
});
