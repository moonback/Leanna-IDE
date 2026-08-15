import test from "node:test";
import assert from "node:assert/strict";
import { AuthoritativeWorkspaceState, hashContent, verificationRecordFromToolResult } from "./WorkspaceState";
import { AgentRepairLoop } from "./AgentRepairLoop";
import { RegressionDetector } from "./RegressionDetector";

test("workspace state tracks read/write/hash/verification and stale detection", () => {
  const state = new AuthoritativeWorkspaceState();
  const read = state.recordRead("src/a.ts", "export const a = 1;\n");
  assert.equal(read.exists, true);
  assert.equal(read.version, 1);
  const written = state.recordWrite("src/a.ts", read.content ?? null, "export const a = 2;\n", "Agent Coder");
  assert.equal(written.previousHash, read.contentHash);
  assert.equal(written.verificationStatus, "pending");
  const record = verificationRecordFromToolResult("src/a.ts", hashContent("export const a = 2;\n"), { status: "success", ok: true, contentHash: hashContent("export const a = 2;\n"), typecheck: { ok: true }, lint: { ok: true }, security: { ok: true } });
  state.recordVerification("src/a.ts", record);
  assert.equal(state.assertCompletionReady(["src/a.ts"]).length, 0);
  state.recordRead("src/a.ts", "export const a = 3;\n");
  const issues = state.assertCompletionReady(["src/a.ts"]);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /hash courant|Vérification/);
});

test("repair loop groups root-cause issues and detects repeated no-progress loops", () => {
  const loop = new AgentRepairLoop();
  const failedRecord = verificationRecordFromToolResult("src/types.ts", "h1", {
    status: "failed",
    ok: false,
    allIssues: [
      { type: "typecheck", file: "src/App.tsx", line: 4, code: "TS2345", message: "Bad User", relatedFiles: ["src/types.ts"] },
      { type: "typecheck", file: "src/broken.ts", line: 2, code: "TS2322", message: "Bad User", relatedFiles: ["src/types.ts"] },
    ],
  });
  const first = loop.repair({ taskTitle: "corrige TypeScript", records: [failedRecord], fileHashes: { "src/types.ts": "h1" }, lastPatch: "patch-a" });
  assert.deepEqual(first.rootFiles, ["src/types.ts"]);
  const second = loop.repair({ taskTitle: "corrige TypeScript", records: [failedRecord], fileHashes: { "src/types.ts": "h1" }, lastPatch: "patch-a" });
  assert.equal(second.progress.action, "stop_loop");
});

test("regression detector reports only new post-edit failures", () => {
  const detector = new RegressionDetector();
  const baselineRecord = verificationRecordFromToolResult("src/a.ts", "h1", { status: "failed", ok: false, allIssues: [{ type: "typecheck", file: "src/a.ts", line: 1, code: "TS1", message: "existing" }] });
  const baseline = detector.createBaseline([baselineRecord]);
  const afterRecord = verificationRecordFromToolResult("src/a.ts", "h2", { status: "failed", ok: false, allIssues: [
    { type: "typecheck", file: "src/a.ts", line: 1, code: "TS1", message: "existing" },
    { type: "test", file: "src/a.test.ts", line: 9, rule: "test-process", message: "new failure" },
  ] });
  const regressions = detector.compare(baseline, [afterRecord]);
  assert.equal(regressions.length, 2);
  assert.ok(regressions.some((r) => r.message.includes("new failure")));
});

import { AgentExecutor } from "./AgentExecutor";
import type { AgentTask } from "./types";

test("AgentExecutor coder writes, re-reads, verifies, and runs global checks before completion", async () => {
  const calls: string[] = [];
  let content = "export const value = 1;\n";
  let agentTurn = 0;
  const executor = new AgentExecutor({ notify() { /* noop */ } } as any);
  executor.setSkillHandler(async (name: string, args: any) => {
    calls.push(name);
    if (name === "list_project_files") return { status: "success", files: ["src/a.ts"], count: 1 };
    if (name === "read_project_file") return { status: "success", path: args.path, content };
    if (name === "agent_execute") {
      agentTurn++;
      if (agentTurn === 1) {
        return JSON.stringify({ tool_calls: [{ name: "write_project_file", parameters: { path: "src/a.ts", content: "export const value = 2;\n" } }] });
      }
      return "## Résultats vérifiés\n- src/a.ts modifié et vérifié.\n## Preuves d'exécution\n- Vérification : PASS";
    }
    if (name === "write_project_file") {
      content = String(args.content);
      return { status: "success", path: args.path };
    }
    if (name === "verify_file") {
      return { status: "success", ok: true, contentHash: hashContent(content), typecheck: { ok: true }, lint: { ok: true }, security: { ok: true } };
    }
    if (name === "verify_typecheck" || name === "verify_lint") return { status: "success", ok: true };
    throw new Error(`Unexpected tool: ${name}`);
  });

  const task: AgentTask = {
    id: "task-autonomous-1",
    role: "coder",
    title: "Update src/a.ts",
    description: "Change value in src/a.ts",
    priority: "medium",
    status: "pending",
    context: { files: ["src/a.ts"] },
    createdAt: new Date().toISOString(),
  };

  await executor.execute(task);
  assert.equal(task.status, "completed");
  assert.equal(content, "export const value = 2;\n");
  assert.ok(calls.includes("write_project_file"));
  assert.ok(calls.includes("verify_file"));
  assert.ok(calls.includes("verify_typecheck"));
  assert.ok(calls.includes("verify_lint"));
  assert.equal((task.result?.evidence?.verification as any).records.length, 1);
  assert.equal((task.result?.evidence?.verification as any).workspaceState[0].verificationStatus, "passed");
});
