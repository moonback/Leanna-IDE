import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { ToolRegistry } from "../runtime/ToolRegistry.js";
import type { ToolDefinition } from "../runtime/types.js";
import { IdleWorker, type IdleMissionRunner } from "./IdleWorker.js";
import { AutonomyBudget } from "./AutonomyBudget.js";
import { AutonomyAuditLog } from "./AutonomyAuditLog.js";

function toolDef(name: string, permissions: ToolDefinition["permissions"]): ToolDefinition {
  return {
    declaration: { name, description: `tool ${name}`, parameters: {} },
    handler: async () => ({}),
    permissions,
    source: "builtin",
  };
}

/** A runtime double whose `tools` is a real registry with mixed permissions. */
function fakeRuntime() {
  const tools = new ToolRegistry({ enableMetrics: false });
  tools.register(toolDef("knowledge_project_doctor", ["read"]));
  tools.register(toolDef("codebase_read", ["read"]));
  tools.register(toolDef("fs_write_file", ["read", "write"]));   // excluded (write)
  tools.register(toolDef("shell_run", ["exec"]));                 // excluded (exec)
  tools.register(toolDef("undeclared_tool", []));                 // excluded (undeclared)
  return { tools } as never;
}

function tempAudit(): { audit: AutonomyAuditLog; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "leanna-idle-"));
  return { audit: new AutonomyAuditLog(dir), dir };
}

const generousBudget = () =>
  new AutonomyBudget({ maxActionsPerHour: 10, maxTokensPerHour: 1_000_000, maxCostUsdPerHour: 100, perMissionMaxTokens: 60_000, perMissionMaxCostUsd: 1 });

test("launches a read-only mission constrained to read-only tools, in dry-run", async () => {
  const { audit, dir } = tempAudit();
  try {
    let captured: Parameters<IdleMissionRunner>[0] | undefined;
    const worker = new IdleWorker(fakeRuntime(), {
      budget: generousBudget(),
      auditLog: audit,
      runMission: async (req) => { captured = req; return { success: true, tokens: 42, costUsd: 0.001 }; },
    });

    const launched = await worker.runOnce();
    assert.equal(launched, true);
    assert.ok(captured, "the mission runner should have been called");
    assert.equal(captured!.dryRun, true, "idle missions must be dry-run");
    // Only read-only, declared tools are offered.
    assert.deepEqual([...captured!.availableSkills].sort(), ["codebase_read", "knowledge_project_doctor"]);
    assert.ok(!captured!.availableSkills.includes("fs_write_file"));
    assert.ok(!captured!.availableSkills.includes("shell_run"));
    assert.ok(!captured!.availableSkills.includes("undeclared_tool"));

    const entries = audit.read();
    assert.ok(entries.some((e) => e.phase === "started" && e.dryRun === true));
    assert.ok(entries.some((e) => e.phase === "completed" && e.outcome === "success" && e.tokens === 42));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the kill switch (pause) stops all self-initiated work and is reversible", async () => {
  const { audit, dir } = tempAudit();
  try {
    let calls = 0;
    const worker = new IdleWorker(fakeRuntime(), {
      budget: generousBudget(), auditLog: audit,
      runMission: async () => { calls++; return { success: true }; },
    });

    worker.pause("test");
    assert.equal(await worker.runOnce(), false, "paused worker must not launch");
    assert.equal(calls, 0);

    worker.resume("test");
    assert.equal(await worker.runOnce(), true, "resumed worker launches again");
    assert.equal(calls, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("budget exhaustion blocks launches and is audited as skipped", async () => {
  const { audit, dir } = tempAudit();
  try {
    let calls = 0;
    const worker = new IdleWorker(fakeRuntime(), {
      // Only one action per hour.
      budget: new AutonomyBudget({ maxActionsPerHour: 1, maxTokensPerHour: 1e9, maxCostUsdPerHour: 1e9, perMissionMaxTokens: 1000, perMissionMaxCostUsd: 1 }),
      auditLog: audit,
      runMission: async () => { calls++; return { success: true }; },
    });

    assert.equal(await worker.runOnce(), true);
    assert.equal(await worker.runOnce(), false, "second launch blocked by actions/hour budget");
    assert.equal(calls, 1);
    assert.ok(audit.read().some((e) => e.phase === "skipped" && e.action === "idle:budget"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("does not run during active heartbeats, runs on idle/sleep", async () => {
  const { audit, dir } = tempAudit();
  try {
    let calls = 0;
    const worker = new IdleWorker(fakeRuntime(), {
      budget: generousBudget(), auditLog: audit,
      runMission: async () => { calls++; return { success: true }; },
    });

    assert.equal(await worker.onHeartbeat("active"), false);
    assert.equal(calls, 0);
    assert.equal(await worker.onHeartbeat("idle"), true);
    assert.equal(calls, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("skips when busy (active autonomy tasks in flight)", async () => {
  const { audit, dir } = tempAudit();
  try {
    let calls = 0;
    const worker = new IdleWorker(fakeRuntime(), {
      budget: generousBudget(), auditLog: audit,
      isBusy: () => true,
      runMission: async () => { calls++; return { success: true }; },
    });
    assert.equal(await worker.onHeartbeat("idle"), false);
    assert.equal(calls, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("records an action even when the mission throws, and audits the error", async () => {
  const { audit, dir } = tempAudit();
  try {
    const budget = new AutonomyBudget({ maxActionsPerHour: 2, maxTokensPerHour: 1e9, maxCostUsdPerHour: 1e9, perMissionMaxTokens: 1000, perMissionMaxCostUsd: 1 });
    const worker = new IdleWorker(fakeRuntime(), {
      budget, auditLog: audit,
      runMission: async () => { throw new Error("mission blew up"); },
    });

    assert.equal(await worker.runOnce(), true, "a throwing mission still counts as a launched action");
    assert.ok(audit.read().some((e) => e.phase === "error" && e.message.includes("blew up")));
    // The failed action consumed a budget slot.
    assert.equal(budget.snapshot().actions.used, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("without a mission runner wired, it stays observe-only", async () => {
  const { audit, dir } = tempAudit();
  try {
    const worker = new IdleWorker(fakeRuntime(), { budget: generousBudget(), auditLog: audit });
    assert.equal(await worker.runOnce(), false);
    assert.ok(audit.read().some((e) => e.phase === "skipped" && e.message.includes("observe-only")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
