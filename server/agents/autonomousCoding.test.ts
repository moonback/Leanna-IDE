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
