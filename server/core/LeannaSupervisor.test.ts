import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { LeannaSupervisor, type MissionRunner } from "./LeannaSupervisor.js";
import { DurableMissionStore } from "./DurableMissionStore.js";
import { CheckpointManager, makeNodeFileGateway, type FileGateway } from "./CheckpointManager.js";
import { EvidenceEngine } from "./EvidenceEngine.js";
import { MissionStateMachine } from "./MissionStateMachine.js";
import { ExecutionLedger } from "./ExecutionLedger.js";

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

test("a runner that ignores AbortSignal is quarantined and never raced with rollback", async () => {
  const gw = memGateway({ "a.ts": "original" });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-sup-"));
  const sup = new LeannaSupervisor({
    maxAttempts: 1,
    runnerTimeoutMs: 20,
    missionStore: new DurableMissionStore(path.join(dir, "missions")),
    checkpoints: new CheckpointManager({ gateway: gw, dirOverride: path.join(dir, "cp") }),
    evidence: new EvidenceEngine(path.join(dir, "ev")),
  });

  const runner: MissionRunner = async () => {
    // Deliberately ignore AbortSignal and mutate after the timeout grace period.
    await new Promise((resolve) => setTimeout(resolve, 400));
    gw.write("a.ts", "late-write");
    return { success: true };
  };

  const result = await sup.runMission({
    missionId: "m-timeout-ignores-abort",
    goal: "must not race rollback",
    runner,
    plannedFiles: ["a.ts"],
  });

  assert.equal(result.finalState, "ESCALATED");
  assert.equal(result.rollbackComplete, false);
  assert.match(result.residualFiles?.[0] ?? "", /runner encore actif/);
  assert.equal(gw.store.get("a.ts"), "original", "rollback must be withheld while runner is active");

  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(gw.store.get("a.ts"), "late-write", "late side effect is surfaced, not overwritten by a racing rollback");
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

test("dynamically discovered files are captured before write and restored on failed evidence", async () => {
  const gw = memGateway({ "discovered.ts": "original" });
  const { sup, dir } = makeSupervisor(gw);
  const runner: MissionRunner = async ({ beforeToolCall }) => {
    await beforeToolCall?.("write_project_file", { path: "discovered.ts" });
    gw.write("discovered.ts", "mutated");
    return {
      success: true,
      evidence: { testsExecuted: [{ name: "unit", passed: false }] },
    };
  };
  const result = await sup.runMission({
    missionId: "m-dynamic-capture",
    goal: "edit an unplanned file",
    runner,
    resolveWriteTargets: (_tool, args) => args.path === "discovered.ts" ? ["discovered.ts"] : [],
  });
  assert.equal(result.finalState, "ESCALATED");
  assert.equal(gw.store.get("discovered.ts"), "original");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("supervisor reports residual files when rollback cannot restore a locked file", async () => {
  const gw = memGateway({ "a.ts": "original" });
  const write = gw.write;
  gw.write = (filePath, content) => {
    if (filePath === "a.ts" && content === "original") throw new Error("file locked");
    write(filePath, content);
  };
  const { sup, dir } = makeSupervisor(gw);
  const runner: MissionRunner = async () => {
    gw.write("a.ts", "changed");
    return { success: true, evidence: { testsExecuted: [{ name: "unit", passed: false }] } };
  };
  const result = await sup.runMission({
    missionId: "m-rollback-residual",
    goal: "restore a locked file",
    runner,
    plannedFiles: ["a.ts"],
  });
  assert.equal(result.finalState, "FAILED");
  assert.equal(result.rollbackComplete, false);
  assert.deepEqual(result.residualFiles, ["a.ts"]);
  assert.equal(gw.store.get("a.ts"), "changed");
  fs.rmSync(dir, { recursive: true, force: true });
});


test("supervisor rolls back a recursively deleted directory discovered at tool time", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-supervised-workspace-"));
  const folder = path.join(workspace, "src", "feature");
  fs.mkdirSync(path.join(folder, "empty"), { recursive: true });
  fs.writeFileSync(path.join(folder, "index.ts"), "export const safe = true;", "utf8");

  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-sup-dir-"));
  const sup = new LeannaSupervisor({
    maxAttempts: 1,
    missionStore: new DurableMissionStore(path.join(stateDir, "missions")),
    checkpoints: new CheckpointManager({ gateway: makeNodeFileGateway(), dirOverride: path.join(stateDir, "checkpoints") }),
    evidence: new EvidenceEngine(path.join(stateDir, "evidence")),
  });
  const runner: MissionRunner = async ({ beforeToolCall }) => {
    await beforeToolCall?.("delete_project_folder", { path: folder });
    fs.rmSync(folder, { recursive: true, force: true });
    return {
      success: true,
      evidence: { testsExecuted: [{ name: "verification", passed: false }] },
    };
  };

  const result = await sup.runMission({
    missionId: "m-recursive-folder-rollback",
    goal: "delete then fail verification",
    runner,
    resolveWriteTargets: (_toolName, args) => typeof args.path === "string" ? [args.path] : [],
  });

  assert.equal(result.finalState, "ESCALATED");
  assert.equal(result.rollbackComplete, true);
  assert.equal(fs.readFileSync(path.join(folder, "index.ts"), "utf8"), "export const safe = true;");
  assert.equal(fs.statSync(path.join(folder, "empty")).isDirectory(), true);

  fs.rmSync(workspace, { recursive: true, force: true });
  fs.rmSync(stateDir, { recursive: true, force: true });
});

test("an open checkpoint after restart blocks automatic replay and marks recovery required", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-sup-recovery-"));
  const missions = new DurableMissionStore(path.join(dir, "missions"));
  const checkpointsDir = path.join(dir, "checkpoints");
  const gateway = memGateway({ "a.ts": "before-crash" });
  const checkpoints = new CheckpointManager({ gateway, dirOverride: checkpointsDir });
  const { MissionStateMachine } = await import("./MissionStateMachine.js");
  const machine = new MissionStateMachine("m-crash");
  machine.transition("PLANNING"); machine.transition("READY"); machine.transition("RUNNING");
  missions.save(machine);
  const checkpoint = checkpoints.snapshot(["a.ts"], { missionId: "m-crash", label: "attempt-1" });
  gateway.write("a.ts", "possibly-applied");
  const restarted = new LeannaSupervisor({ maxAttempts: 2, missionStore: missions,
    checkpoints: new CheckpointManager({ gateway, dirOverride: checkpointsDir }),
    evidence: new EvidenceEngine(path.join(dir, "evidence")) });
  let runnerCalled = false;
  const result = await restarted.runMission({ missionId: "m-crash", goal: "do not replay uncertain work",
    runner: async () => { runnerCalled = true; return { success: true }; } });
  assert.equal(result.finalState, "RECOVERY_REQUIRED");
  assert.equal(result.recoveryRequired, true);
  assert.equal(result.attempts, 0);
  assert.equal(runnerCalled, false);
  assert.equal(gateway.store.get("a.ts"), "possibly-applied");
  assert.equal(checkpoints.get(checkpoint.id)?.status, "open");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("crash recovery quarantines an interrupted attempt instead of replaying it", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-crash-recovery-"));
  const missionDir = path.join(dir, "missions");
  const checkpointDir = path.join(dir, "checkpoints");
  const store = new DurableMissionStore(missionDir);
  const checkpoints = new CheckpointManager({ gateway: memGateway({ "a.ts": "before" }), dirOverride: checkpointDir });
  const checkpoint = checkpoints.snapshot(["a.ts"], { missionId: "m-crash", label: "attempt-2" });
  const machine = new MissionStateMachine("m-crash");
  machine.transition("PLANNING");
  machine.transition("READY");
  machine.transition("RUNNING");
  machine.setActiveAttempt({
    attempt: 2,
    checkpointId: checkpoint.id,
    phase: "executing",
    updatedAt: new Date().toISOString(),
  });
  store.save(machine);

  // Simulate a process restart: all durable stores are rehydrated from disk.
  const restartedStore = new DurableMissionStore(missionDir);
  const restartedCheckpoints = new CheckpointManager({ gateway: memGateway({ "a.ts": "after-crash" }), dirOverride: checkpointDir });
  const restartedLedger = new ExecutionLedger(ledgerPath);
  const supervisor = new LeannaSupervisor({
    maxAttempts: 3,
    missionStore: restartedStore,
    checkpoints: restartedCheckpoints,
    evidence: new EvidenceEngine(path.join(dir, "evidence")),
    ledger: restartedLedger,
  });
  let executions = 0;
  const result = await supervisor.runMission({
    missionId: "m-crash",
    goal: "recover safely",
    runner: async () => {
      executions++;
      return { success: true, evidence: { testsExecuted: [{ name: "must-not-run", passed: true }] } };
    },
  });

  assert.equal(result.finalState, "RECOVERY_REQUIRED");
  assert.equal(result.recoveryRequired, true);
  assert.equal(executions, 0, "an interrupted side-effecting attempt must never be replayed automatically");
  assert.equal(restartedStore.load("m-crash")?.current, "RECOVERY_REQUIRED");
  assert.equal(restartedCheckpoints.listOpenForMission("m-crash").length, 1);

  fs.rmSync(dir, { recursive: true, force: true });
});

test("an unknown side effect in the durable ledger blocks automatic mission replay", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-ledger-recovery-"));
  const ledgerPath = path.join(dir, "ledger.jsonl");
  const initialLedger = new ExecutionLedger(ledgerPath);
  initialLedger.begin({ missionId: "m-ledger-unknown", stepId: "step-1", tool: "publish_release", args: { tag: "v1" } }, true);
  const restoredLedger = new ExecutionLedger(ledgerPath);
  const store = new DurableMissionStore(path.join(dir, "missions"));
  const machine = new MissionStateMachine("m-ledger-unknown");
  machine.transition("PLANNING");
  machine.transition("READY");
  store.save(machine);
  const supervisor = new LeannaSupervisor({
    missionStore: store,
    checkpoints: new CheckpointManager({ gateway: memGateway(), dirOverride: path.join(dir, "checkpoints") }),
    evidence: new EvidenceEngine(path.join(dir, "evidence")),
    ledger: restoredLedger,
  });
  let executions = 0;
  const result = await supervisor.runMission({
    missionId: "m-ledger-unknown",
    goal: "do not duplicate external effect",
    runner: async () => { executions++; return { success: true }; },
  });

  assert.equal(result.finalState, "RECOVERY_REQUIRED");
  assert.equal(result.recoveryRequired, true);
  assert.equal(executions, 0);

  fs.rmSync(dir, { recursive: true, force: true });
});


test("passes the selected repair strategy into the next runner attempt", async () => {
  const { sup, dir } = makeSupervisor();
  const recoveryStrategies: Array<string | undefined> = [];
  let attempts = 0;
  const runner: MissionRunner = async (ctx) => {
    recoveryStrategies.push(ctx.recovery);
    attempts++;
    if (attempts === 1) {
      return {
        success: false,
        error: "TypeScript TS2322 type error",
        evidence: { typecheck: { name: "tsc", passed: false, details: "TS2322" } },
      };
    }
    return { success: true, evidence: { testsExecuted: [{ name: "unit", passed: true }] } };
  };

  const result = await sup.runMission({ missionId: "m-repair-context", goal: "repair types", runner });
  assert.equal(result.finalState, "COMPLETED");
  assert.deepEqual(recoveryStrategies, [undefined, "repair"]);

  fs.rmSync(dir, { recursive: true, force: true });
});


test("unknown side effects in the execution ledger force escalation without replay", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-ledger-recovery-"));
  const ledgerPath = path.join(dir, "actions.jsonl");
  const interrupted = new ExecutionLedger(ledgerPath);
  interrupted.begin({
    missionId: "m-unknown-effect",
    stepId: "send-1",
    tool: "send_email",
    args: { to: "recipient@example.test" },
  }, true);
  // Rehydration converts an orphaned started side effect into unknown.
  const ledger = new ExecutionLedger(ledgerPath);
  const sup = new LeannaSupervisor({
    maxAttempts: 3,
    missionStore: new DurableMissionStore(path.join(dir, "missions")),
    checkpoints: new CheckpointManager({ gateway: memGateway(), dirOverride: path.join(dir, "cp") }),
    evidence: new EvidenceEngine(path.join(dir, "ev")),
    ledger,
  });
  let attempts = 0;
  const runner: MissionRunner = async () => {
    attempts++;
    return { success: false, error: "temporary connection failure" };
  };

  const result = await sup.runMission({ missionId: "m-unknown-effect", goal: "send once", runner });
  assert.equal(result.finalState, "ESCALATED");
  assert.equal(attempts, 1, "unknown external side effects must never be blindly replayed");

  fs.rmSync(dir, { recursive: true, force: true });
});
