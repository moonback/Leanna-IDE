import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ToolRegistry } from "../runtime/ToolRegistry.js";
import { PermissionPolicy } from "../runtime/PermissionPolicy.js";
import { ExecutionLedger } from "./ExecutionLedger.js";
import { LedgerGuard } from "./LedgerGuard.js";

function ledgerFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-guard-"));
  return path.join(dir, "actions.jsonl");
}

function ledgerLines(file: string): string[] {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean);
}

/** A registry that allows everything, so we test idempotency, not permissions. */
function permissiveRegistry(guard: LedgerGuard): ToolRegistry {
  return new ToolRegistry({
    permissionPolicy: PermissionPolicy.fromEnv({ Leanna_PERMISSION_MODE: "off" } as NodeJS.ProcessEnv),
    idempotency: guard,
  });
}

/** Registers a counting tool and returns a getter for its execution count. */
function countingTool(registry: ToolRegistry, name: string, permissions: string[]): () => number {
  let runs = 0;
  registry.register({
    declaration: { name, description: name, parameters: { type: "object", properties: {} } },
    handler: async () => {
      runs++;
      return { ok: true, n: runs };
    },
    permissions,
  } as any);
  return () => runs;
}

const SCOPE = { missionId: "m1", stepId: "a1" };

test("ToolRegistry skips re-execution of a completed effectful call in the same mission step", async () => {
  const guard = new LedgerGuard(new ExecutionLedger(ledgerFile()));
  const registry = permissiveRegistry(guard);
  const runs = countingTool(registry, "write_thing", ["write"]);

  const r1 = await registry.call("write_thing", { path: "a.ts" }, { idempotencyScope: SCOPE });
  const r2 = await registry.call("write_thing", { path: "a.ts" }, { idempotencyScope: SCOPE });

  assert.equal(runs(), 1, "effectful handler executed exactly once");
  assert.deepEqual(r1, r2, "second call reused the recorded result");
});

test("read-only tools are never deduplicated nor journaled, even inside a mission step", async () => {
  const file = ledgerFile();
  const guard = new LedgerGuard(new ExecutionLedger(file));
  const registry = permissiveRegistry(guard);
  const runs = countingTool(registry, "verify_file", ["read"]);

  await registry.call("verify_file", { path: "a.ts" }, { idempotencyScope: SCOPE });
  await registry.call("verify_file", { path: "a.ts" }, { idempotencyScope: SCOPE });

  assert.equal(runs(), 2, "a re-verification must observe the current state");
  assert.equal(ledgerLines(file).length, 0, "reads leave no ledger entry");
});

test("read-only results are not served from the ledger after a restart", async () => {
  const file = ledgerFile();
  const reg1 = permissiveRegistry(new LedgerGuard(new ExecutionLedger(file)));
  countingTool(reg1, "read_project_file", ["read"]);
  await reg1.call("read_project_file", { path: "a.ts" }, { idempotencyScope: SCOPE });

  const reg2 = permissiveRegistry(new LedgerGuard(new ExecutionLedger(file)));
  const runs2 = countingTool(reg2, "read_project_file", ["read"]);
  await reg2.call("read_project_file", { path: "a.ts" }, { idempotencyScope: SCOPE });

  assert.equal(runs2(), 1, "the read ran again after restart");
});

test("effectful calls without a mission step scope always execute and are not journaled", async () => {
  const file = ledgerFile();
  const registry = permissiveRegistry(new LedgerGuard(new ExecutionLedger(file)));
  const runs = countingTool(registry, "run_project_command", ["exec"]);

  await registry.call("run_project_command", { cmd: "npm test" });
  await registry.call("run_project_command", { cmd: "npm test" });
  await registry.call("run_project_command", { cmd: "npm test" }, { idempotencyScope: { missionId: "m1" } });

  assert.equal(runs(), 3, "no global cache across missions or without a step id");
  assert.equal(ledgerLines(file).length, 0);
});

test("the same effectful call in another step or mission executes again", async () => {
  const registry = permissiveRegistry(new LedgerGuard(new ExecutionLedger(ledgerFile())));
  const runs = countingTool(registry, "run_project_command", ["exec"]);

  await registry.call("run_project_command", { cmd: "npm test" }, { idempotencyScope: SCOPE });
  await registry.call("run_project_command", { cmd: "npm test" }, { idempotencyScope: { missionId: "m1", stepId: "a2" } });
  await registry.call("run_project_command", { cmd: "npm test" }, { idempotencyScope: { missionId: "m2", stepId: "a1" } });

  assert.equal(runs(), 3);
});

test("an effectful call interrupted by a crash is blocked on replay of the same step only", () => {
  const file = ledgerFile();
  const g1 = new LedgerGuard(new ExecutionLedger(file));
  const started = g1.guard("write_thing", { path: "a.ts" }, ["write"], undefined, SCOPE);
  assert.equal(started.decision, "execute");
  // crash: neither commit nor fail is called

  const g2 = new LedgerGuard(new ExecutionLedger(file));
  assert.equal(g2.guard("write_thing", { path: "a.ts" }, ["write"], undefined, SCOPE).decision, "block");
  assert.equal(
    g2.guard("write_thing", { path: "a.ts" }, ["write"], undefined, { missionId: "m2", stepId: "a1" }).decision,
    "execute",
    "another mission is not affected"
  );
});

test("ambient mission context combines with the per-call step id", () => {
  const file = ledgerFile();
  const guard = new LedgerGuard(new ExecutionLedger(file));
  guard.setContext({ missionId: "supervised" });
  const g = guard.guard("write_thing", { path: "a.ts" }, ["write"], undefined, { missionId: "task-1", stepId: "iter-1" });
  assert.equal(g.decision, "execute");
  if (g.decision === "execute") g.commit(null);
  const key = JSON.parse(ledgerLines(file).pop()!).idempotencyKey as string;
  assert.ok(key.startsWith("supervised:iter-1:write_thing:"), `ambient mission id wins (got ${key})`);
});

test("guard without registry wiring leaves behavior unchanged", async () => {
  const registry = new ToolRegistry({
    permissionPolicy: PermissionPolicy.fromEnv({ Leanna_PERMISSION_MODE: "off" } as NodeJS.ProcessEnv),
  });
  const runs = countingTool(registry, "plain", ["write"]);

  await registry.call("plain", { a: 1 }, { idempotencyScope: SCOPE });
  await registry.call("plain", { a: 1 }, { idempotencyScope: SCOPE });
  assert.equal(runs(), 2, "without a guard, every call runs (unchanged behavior)");
});
