import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { LeannaSupervisor, type MissionRunner } from "./LeannaSupervisor.js";
import { DurableMissionStore } from "./DurableMissionStore.js";
import { CheckpointManager, type FileGateway } from "./CheckpointManager.js";
import { EvidenceEngine } from "./EvidenceEngine.js";

function memGateway(initial: Record<string, string> = {}): FileGateway & { store: Map<string, string> } {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    store,
    exists: (p) => store.has(p),
    read: (p) => {
      const v = store.get(p);
      if (v === undefined) throw new Error(`missing ${p}`);
      return v;
    },
    write: (p, c) => void store.set(p, c),
    remove: (p) => void store.delete(p),
  };
}

function makeSupervisor(gateway?: FileGateway) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-sup-"));
  const sup = new LeannaSupervisor({
    maxAttempts: 3,
    missionStore: new DurableMissionStore(path.join(dir, "missions")),
    checkpoints: new CheckpointManager({ gateway: gateway ?? memGateway(), dirOverride: path.join(dir, "cp") }),
    evidence: new EvidenceEngine(path.join(dir, "ev")),
  });
  return { sup, dir };
}

test("nominal cycle reaches COMPLETED when evidence proves success", async () => {
  const { sup, dir } = makeSupervisor();
  const runner: MissionRunner = async () => ({
    success: true,
    touchedFiles: ["a.ts"],
    evidence: { filesModified: ["a.ts"], testsExecuted: [{ name: "unit", passed: true }] },
  });

  const result = await sup.runMission({ missionId: "m-ok", goal: "ship it", runner });
  assert.equal(result.finalState, "COMPLETED");
  assert.equal(result.attempts, 1);
  assert.equal(result.evidence?.passed, true);

  fs.rmSync(dir, { recursive: true, force: true });
});

test("failing evidence rolls back and escalates after max attempts", async () => {
  const gw = memGateway({ "a.ts": "original" });
  const { sup, dir } = makeSupervisor(gw);
  let attempts = 0;
  const runner: MissionRunner = async () => {
    attempts++;
    gw.write("a.ts", `broken-${attempts}`); // side effect that will be rolled back
    return {
      success: true, // runner claims success…
      touchedFiles: ["a.ts"],
      evidence: { filesModified: ["a.ts"], testsExecuted: [{ name: "unit", passed: false }] }, // …but proof says no
    };
  };

  const result = await sup.runMission({ missionId: "m-fail", goal: "fix", runner, plannedFiles: ["a.ts"] });
  assert.equal(result.finalState, "ESCALATED");
  assert.equal(result.attempts, 3, "it tried up to maxAttempts");
  // Proof beats narration: each failed attempt was rolled back to the original.
  assert.equal(gw.store.get("a.ts"), "original");

  fs.rmSync(dir, { recursive: true, force: true });
});

test("recovers on a later attempt: retry then succeed", async () => {
  const gw = memGateway({ "a.ts": "v0" });
  const { sup, dir } = makeSupervisor(gw);
  let attempts = 0;
  const runner: MissionRunner = async () => {
    attempts++;
    const passed = attempts >= 2; // fails once, then passes
    gw.write("a.ts", passed ? "fixed" : "still-broken");
    return {
      success: passed,
      touchedFiles: ["a.ts"],
      evidence: { filesModified: ["a.ts"], testsExecuted: [{ name: "unit", passed }] },
    };
  };

  const result = await sup.runMission({ missionId: "m-recover", goal: "fix flaky", runner, plannedFiles: ["a.ts"] });
  assert.equal(result.finalState, "COMPLETED");
  assert.equal(result.attempts, 2);
  // The committed attempt's change is preserved (not rolled back).
  assert.equal(gw.store.get("a.ts"), "fixed");

  fs.rmSync(dir, { recursive: true, force: true });
});

test("runner exception is treated as a failed attempt, not a crash", async () => {
  const { sup, dir } = makeSupervisor();
  const runner: MissionRunner = async () => {
    throw new Error("tool blew up");
  };
  const result = await sup.runMission({ missionId: "m-throw", goal: "risky", runner });
  assert.equal(result.finalState, "ESCALATED");

  fs.rmSync(dir, { recursive: true, force: true });
});

test("explicit escalate suggestion short-circuits retries", async () => {
  const { sup, dir } = makeSupervisor();
  let attempts = 0;
  const runner: MissionRunner = async () => {
    attempts++;
    return {
      success: false,
      suggestedRecovery: "escalate",
      evidence: { testsExecuted: [{ name: "unit", passed: false }] },
    };
  };
  const result = await sup.runMission({ missionId: "m-esc", goal: "hopeless", runner });
  assert.equal(result.finalState, "ESCALATED");
  assert.equal(attempts, 1, "escalated immediately, no further attempts");

  fs.rmSync(dir, { recursive: true, force: true });
});

test("mission state is persisted durably and ends terminal", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-sup-"));
  const store = new DurableMissionStore(path.join(dir, "missions"));
  const sup = new LeannaSupervisor({
    maxAttempts: 2,
    missionStore: store,
    checkpoints: new CheckpointManager({ gateway: memGateway(), dirOverride: path.join(dir, "cp") }),
    evidence: new EvidenceEngine(path.join(dir, "ev")),
  });

  const runner: MissionRunner = async () => ({
    success: true,
    evidence: { testsExecuted: [{ name: "unit", passed: true }] },
  });
  await sup.runMission({ missionId: "m-persist", goal: "persist", runner });

  const reloaded = store.load("m-persist");
  assert.ok(reloaded);
  assert.equal(reloaded!.current, "COMPLETED");
  assert.equal(reloaded!.isTerminal(), true);
  // The lifecycle history captured the full governed cycle.
  const states = reloaded!.snapshot().history.map((h) => h.to);
  assert.ok(states.includes("PLANNING"));
  assert.ok(states.includes("VERIFYING"));
  assert.ok(states.includes("COMMITTING"));

  fs.rmSync(dir, { recursive: true, force: true });
});

// ─── Sprint 3 : durcissement du Supervisor ──────────────────────────────────

test("reloads a persisted mission instead of recreating a fresh one", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-sup-"));
  const store = new DurableMissionStore(path.join(dir, "missions"));

  // Première exécution : la mission réussit et devient COMPLETED (terminal).
  const sup1 = new LeannaSupervisor({
    maxAttempts: 2,
    missionStore: store,
    checkpoints: new CheckpointManager({ gateway: memGateway(), dirOverride: path.join(dir, "cp") }),
    evidence: new EvidenceEngine(path.join(dir, "ev")),
  });
  const okRunner: MissionRunner = async () => ({
    success: true,
    evidence: { testsExecuted: [{ name: "unit", passed: true }] },
  });
  await sup1.runMission({ missionId: "m-reload", goal: "do", runner: okRunner });

  // Seconde exécution : un nouveau Supervisor relit l'état terminal persisté et
  // NE relance PAS le runner.
  const sup2 = new LeannaSupervisor({
    maxAttempts: 2,
    missionStore: store,
    checkpoints: new CheckpointManager({ gateway: memGateway(), dirOverride: path.join(dir, "cp") }),
    evidence: new EvidenceEngine(path.join(dir, "ev")),
  });
  let called = false;
  const spyRunner: MissionRunner = async () => {
    called = true;
    return { success: true, evidence: { testsExecuted: [{ name: "unit", passed: true }] } };
  };
  const result = await sup2.runMission({ missionId: "m-reload", goal: "do", runner: spyRunner });

  assert.equal(result.finalState, "COMPLETED");
  assert.equal(result.attempts, 0, "no new attempt on an already-terminal mission");
  assert.equal(called, false, "runner must not run for a completed mission");

  fs.rmSync(dir, { recursive: true, force: true });
});

test("an evidence failure never leaves the machine stuck in a transient state", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-sup-"));
  const store = new DurableMissionStore(path.join(dir, "missions"));
  // Evidence engine qui lève systématiquement.
  const throwingEvidence = {
    record() {
      throw new Error("evidence engine exploded");
    },
  } as unknown as EvidenceEngine;

  const sup = new LeannaSupervisor({
    maxAttempts: 2,
    missionStore: store,
    checkpoints: new CheckpointManager({ gateway: memGateway(), dirOverride: path.join(dir, "cp") }),
    evidence: throwingEvidence,
  });

  const runner: MissionRunner = async () => ({ success: true });
  const result = await sup.runMission({ missionId: "m-stuck", goal: "verify", runner });

  // Au lieu de rester en VERIFYING, la mission bascule proprement en FAILED…
  assert.equal(result.finalState, "FAILED");
  // …et l'état FAILED est bien persisté (reprise cohérente).
  const reloaded = store.load("m-stuck");
  assert.equal(reloaded?.current, "FAILED");
  assert.equal(reloaded?.isTerminal(), true);

  fs.rmSync(dir, { recursive: true, force: true });
});

test("a runner that exceeds the timeout counts as a failed attempt", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-sup-"));
  const sup = new LeannaSupervisor({
    maxAttempts: 1,
    runnerTimeoutMs: 30,
    missionStore: new DurableMissionStore(path.join(dir, "missions")),
    checkpoints: new CheckpointManager({ gateway: memGateway(), dirOverride: path.join(dir, "cp") }),
    evidence: new EvidenceEngine(path.join(dir, "ev")),
  });

  let aborted = false;
  const slowRunner: MissionRunner = ({ signal }) =>
    new Promise((resolve) => {
      // Ne se résout jamais à temps : le timeout doit gagner. Le timer n'est
      // pas unref() : comme un vrai runner (I/O en cours), il maintient la
      // boucle d'événements active ; sinon le processus de test se termine
      // avant que le timeout (lui-même unref) du superviseur ne se déclenche.
      const slow = setTimeout(() => resolve({ success: true }), 5000);
      signal?.addEventListener("abort", () => { aborted = true; clearTimeout(slow); });
    });

  const result = await sup.runMission({ missionId: "m-timeout", goal: "slow", runner: slowRunner });

  assert.equal(result.finalState, "ESCALATED", "timeout → failed attempt → escalate at maxAttempts");
  assert.equal(aborted, true, "the runner received the abort signal on timeout");

  fs.rmSync(dir, { recursive: true, force: true });
});

test("WAITING_APPROVAL: a refused approval escalates without running", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-sup-"));
  const sup = new LeannaSupervisor({
    maxAttempts: 2,
    missionStore: new DurableMissionStore(path.join(dir, "missions")),
    checkpoints: new CheckpointManager({ gateway: memGateway(), dirOverride: path.join(dir, "cp") }),
    evidence: new EvidenceEngine(path.join(dir, "ev")),
  });

  let ran = false;
  const runner: MissionRunner = async () => { ran = true; return { success: true }; };
  const result = await sup.runMission({
    missionId: "m-approval",
    goal: "sensitive",
    runner,
    hooks: {
      needsApproval: () => true,
      awaitApproval: async () => false, // refusée
    },
  });

  assert.equal(result.finalState, "ESCALATED");
  assert.equal(ran, false, "runner never executed without approval");
  const states = new DurableMissionStore(path.join(dir, "missions")).load("m-approval")?.snapshot().history.map((h) => h.to);
  assert.ok(states?.includes("WAITING_APPROVAL"), "went through WAITING_APPROVAL");

  fs.rmSync(dir, { recursive: true, force: true });
});

test("PAUSED: shouldPause suspends then awaitResume lets the mission complete", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-sup-"));
  const sup = new LeannaSupervisor({
    maxAttempts: 2,
    missionStore: new DurableMissionStore(path.join(dir, "missions")),
    checkpoints: new CheckpointManager({ gateway: memGateway(), dirOverride: path.join(dir, "cp") }),
    evidence: new EvidenceEngine(path.join(dir, "ev")),
  });

  let resumed = false;
  let pauseAsked = false;
  const runner: MissionRunner = async () => ({
    success: true,
    evidence: { testsExecuted: [{ name: "unit", passed: true }] },
  });
  const result = await sup.runMission({
    missionId: "m-pause",
    goal: "pausable",
    runner,
    hooks: {
      shouldPause: () => { const first = !pauseAsked; pauseAsked = true; return first; },
      awaitResume: async () => { resumed = true; },
    },
  });

  assert.equal(result.finalState, "COMPLETED");
  assert.equal(resumed, true, "awaitResume was awaited");
  const states = new DurableMissionStore(path.join(dir, "missions")).load("m-pause")?.snapshot().history.map((h) => h.to);
  assert.ok(states?.includes("PAUSED"), "went through PAUSED");

  fs.rmSync(dir, { recursive: true, force: true });
});
