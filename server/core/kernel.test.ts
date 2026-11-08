import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ToolRegistry } from "../runtime/ToolRegistry.js";
import { PermissionPolicy } from "../runtime/PermissionPolicy.js";
import { createCoreKernel, idempotencyEnabledFromEnv, supervisionEnabledFromEnv, agentSupervisionEnabledFromEnv, missionSupervisionEnabledFromEnv } from "./kernel.js";
import { supervisionModeFromEnv, requiresSupervision } from "./supervisionConfig.js";
import { safetyGateModeFromEnv } from "./JevSafetyGate.js";
import { hashArguments } from "./ExecutionLedger.js";

function ledgerFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-kernel-"));
  return path.join(dir, "actions.jsonl");
}

function offRegistry(): ToolRegistry {
  return new ToolRegistry({
    permissionPolicy: PermissionPolicy.fromEnv({ Leanna_PERMISSION_MODE: "off" } as NodeJS.ProcessEnv),
  });
}

test("idempotencyEnabledFromEnv reads LEANNA_IDEMPOTENCY", () => {
  assert.equal(idempotencyEnabledFromEnv({ LEANNA_IDEMPOTENCY: "true" } as NodeJS.ProcessEnv), true);
  assert.equal(idempotencyEnabledFromEnv({ LEANNA_IDEMPOTENCY: "1" } as NodeJS.ProcessEnv), true);
  assert.equal(idempotencyEnabledFromEnv({ LEANNA_IDEMPOTENCY: "false" } as NodeJS.ProcessEnv), false);
  assert.equal(idempotencyEnabledFromEnv({ LEANNA_IDEMPOTENCY: "0" } as NodeJS.ProcessEnv), false);
  // IMP-03 : actif par défaut, opt-out explicite uniquement.
  assert.equal(idempotencyEnabledFromEnv({} as NodeJS.ProcessEnv), true);
});

test("kernel exposes all P0 bricks", () => {
  const kernel = createCoreKernel({ enableIdempotency: false });
  assert.ok(kernel.ledger);
  assert.ok(kernel.guard);
  assert.ok(kernel.checkpoints);
  assert.ok(kernel.evidence);
  assert.ok(kernel.missionStore);
  assert.ok(kernel.supervisor);
  assert.equal(kernel.idempotencyEnabled, false);
});

test("guard is attached to the registry only when enabled", async () => {
  // Disabled: behavior unchanged, every call runs.
  const reg1 = offRegistry();
  const k1 = createCoreKernel({ registry: reg1, enableIdempotency: false, ledgerFile: ledgerFile() });
  assert.equal(k1.idempotencyEnabled, false);

  let runs1 = 0;
  reg1.register({
    declaration: { name: "w", description: "x", parameters: { type: "object", properties: {} } },
    handler: async () => ++runs1,
    permissions: ["write"],
  } as any);
  await reg1.call("w", { a: 1 });
  await reg1.call("w", { a: 1 });
  assert.equal(runs1, 2, "no guard => runs every time");

  // Enabled: effectful duplicate is deduplicated.
  const reg2 = offRegistry();
  const k2 = createCoreKernel({ registry: reg2, enableIdempotency: true, ledgerFile: ledgerFile() });
  k2.guard.setContext({ missionId: "m", stepId: "s" });
  assert.equal(k2.idempotencyEnabled, true);

  let runs2 = 0;
  reg2.register({
    declaration: { name: "w", description: "x", parameters: { type: "object", properties: {} } },
    handler: async () => ++runs2,
    permissions: ["write"],
  } as any);
  await reg2.call("w", { a: 1 });
  await reg2.call("w", { a: 1 });
  assert.equal(runs2, 1, "guard enabled => effectful call deduplicated");
});

test("enabling idempotency without a registry does not attach a guard", () => {
  const k = createCoreKernel({ enableIdempotency: true });
  assert.equal(k.idempotencyEnabled, false, "no registry => nothing to attach");
});

// ─── F-06 : contexte d'idempotence isolé entre missions supervisées concurrentes ─

function okResult(): any {
  return {
    success: true, outcome: "success", filesRead: [], filesModified: [], toolsExecuted: ["w"],
    verifications: [{ passed: true, checks: ["ok"], issues: [] }],
  };
}

test("concurrent supervised missions keep their own idempotency context (no cross-mission skip)", async () => {
  const registry = offRegistry();
  const file = ledgerFile();
  const kernel = createCoreKernel({
    registry, enableIdempotency: true, ledgerFile: file,
    missionStoreDir: fs.mkdtempSync(path.join(os.tmpdir(), "leanna-kernel-ms-")),
  });
  let runs = 0;
  registry.register({
    declaration: { name: "w", description: "x", parameters: { type: "object", properties: {} } },
    handler: async () => ++runs,
    permissions: ["write"],
  } as any);

  // Même stepId, même outil, mêmes args : seule la mission distingue les clés.
  const runtimeWithDelay = (ms: number) => ({
    async run() {
      await new Promise((r) => setTimeout(r, ms));
      await registry.call("w", { path: "a.ts" }, { idempotencyScope: { stepId: "iter-1" } } as any);
      return okResult();
    },
  });

  const [a, b] = await Promise.all([
    kernel.runSupervisedAgenticMission(runtimeWithDelay(30), { goal: "A", missionId: "mission-A" }),
    kernel.runSupervisedAgenticMission(runtimeWithDelay(5), { goal: "B", missionId: "mission-B" }),
  ]);

  assert.equal(a.finalState, "COMPLETED");
  assert.equal(b.finalState, "COMPLETED");
  assert.equal(runs, 2, "chaque mission exécute sa propre écriture");
  const keys = fs.readFileSync(file, "utf8").trim().split("\n")
    .map((l) => JSON.parse(l).idempotencyKey as string);
  assert.ok(keys.some((k) => k.startsWith("mission-A:iter-1:")), `clé de A attendue (${keys.join(", ")})`);
  assert.ok(keys.some((k) => k.startsWith("mission-B:iter-1:")), `clé de B attendue (${keys.join(", ")})`);
});

test("runSupervisedAgenticMission forwards the real task fields and returns the last raw result", async () => {
  const kernel = createCoreKernel({
    enableIdempotency: false, ledgerFile: ledgerFile(),
    missionStoreDir: fs.mkdtempSync(path.join(os.tmpdir(), "leanna-kernel-ms-")),
  });
  const controller = new AbortController();
  let seen: any;
  const runtime = { async run(task: any) { seen = task; return { ...okResult(), marker: 42 }; } };

  const res = await kernel.runSupervisedAgenticMission(runtime, {
    goal: "G", missionId: "m-forward", role: "coder",
    baseTask: { signal: controller.signal, budget: { maxIterations: 3 }, metadata: { title: "T" } },
  });

  assert.equal(res.finalState, "COMPLETED");
  assert.equal(seen.signal, controller.signal, "le signal d'annulation atteint le runtime");
  assert.deepEqual(seen.budget, { maxIterations: 3 });
  assert.equal(seen.metadata.title, "T");
  assert.equal(seen.metadata.missionId, "m-forward", "le missionId supervisé prime");
  assert.equal((res.lastResult as any)?.marker, 42);
});


test("one canonical supervision flag governs missions and agents with legacy fallback", () => {
  assert.equal(supervisionEnabledFromEnv({ LEANNA_SUPERVISED: "true" } as NodeJS.ProcessEnv), true);
  assert.equal(agentSupervisionEnabledFromEnv({ LEANNA_SUPERVISED: "1" } as NodeJS.ProcessEnv), true);
  assert.equal(missionSupervisionEnabledFromEnv({ LEANNA_SUPERVISED: "false", LEANNA_AGENT_SUPERVISED: "true" } as NodeJS.ProcessEnv), false,
    "an explicit canonical false overrides legacy true");
  assert.equal(supervisionEnabledFromEnv({ LEANNA_MISSION_SUPERVISED: "true" } as NodeJS.ProcessEnv), true);
  assert.equal(supervisionEnabledFromEnv({ LEANNA_MISSION_SUPERVISED: "false", LEANNA_AGENT_SUPERVISED: "true" } as NodeJS.ProcessEnv), true,
    "either legacy opt-in enables supervision when the canonical flag is absent");
  assert.equal(supervisionEnabledFromEnv({ LEANNA_AGENT_SUPERVISED: "1" } as NodeJS.ProcessEnv), true);
  // IMP-04 : supervisé par défaut (mode "risky").
  assert.equal(supervisionEnabledFromEnv({} as NodeJS.ProcessEnv), true);
  assert.equal(supervisionEnabledFromEnv({ LEANNA_SUPERVISED: "off" } as NodeJS.ProcessEnv), false);
});

test("IMP-04/05 : une seule règle de supervision par risque pour missions et agents", () => {
  assert.equal(supervisionModeFromEnv({} as NodeJS.ProcessEnv), "risky");
  assert.equal(supervisionModeFromEnv({ LEANNA_SUPERVISED: "all" } as NodeJS.ProcessEnv), "all");
  assert.equal(supervisionModeFromEnv({ LEANNA_SUPERVISED: "risky", LEANNA_AGENT_SUPERVISED: "true" } as NodeJS.ProcessEnv), "risky");
  assert.equal(requiresSupervision("risky", { mutates: true }), true);
  assert.equal(requiresSupervision("risky", { mutates: false }), false);
  assert.equal(requiresSupervision("all", { mutates: false }), true);
  assert.equal(requiresSupervision("off", { mutates: true }), false);
});

test("IMP-04/05 : Mission Executor applique la même règle (mission réelle supervisée, simulation non)", async () => {
  const { Executor } = await import("../mission/Executor.js");
  const { LeannaSupervisor } = await import("./LeannaSupervisor.js");
  const ex = new Executor();
  const mission = (dryRun: boolean) => ({ getConfig: () => ({ dryRun }) }) as any;
  ex.setSupervisor(new LeannaSupervisor(), "risky");
  assert.equal(ex.requiresSupervision(mission(false)), true);
  assert.equal(ex.requiresSupervision(mission(true)), false);
  ex.setSupervisedMode(false);
  assert.equal(ex.requiresSupervision(mission(false)), false);
});

test("IMP-02 : Jev observe par défaut quand un juge est disponible, explicite prioritaire", () => {
  assert.equal(safetyGateModeFromEnv({} as NodeJS.ProcessEnv), "off");
  assert.equal(safetyGateModeFromEnv({ OPENROUTER_API_KEY: "k" } as NodeJS.ProcessEnv), "audit");
  assert.equal(safetyGateModeFromEnv({ OPENROUTER_API_KEY: "k", LEANNA_SAFETY_GATE: "off" } as NodeJS.ProcessEnv), "off");
  assert.equal(safetyGateModeFromEnv({ LEANNA_SAFETY_GATE: "enforce" } as NodeJS.ProcessEnv), "enforce");
});

test("IMP-03 : le hash d'arguments tient compte des clés imbriquées", () => {
  const a = hashArguments({ edits: [{ old: "a", new: "b" }] });
  const b = hashArguments({ edits: [{ old: "a", new: "c" }] });
  assert.notEqual(a, b, "deux éditions différentes ne doivent jamais partager une clé");
  assert.equal(hashArguments({ x: { b: 1, a: 2 } }), hashArguments({ x: { a: 2, b: 1 } }), "ordre des clés indifférent");
});
