import test from "node:test";
import assert from "node:assert/strict";
import { createSmartSkills } from "./SmartSkills.js";

test("quality_loop executes phases in order and returns a regression report", async () => {
  const calls: string[] = [];
  let content = "const value = 1;";
  const skill = createSmartSkills(async (name, args) => {
    calls.push(name);
    if (name === "read_project_file") return content;
    if (name === "modify_project_file") {
      content = "const value = 2;";
      return { ok: true };
    }
    if (name === "verify_file") return { status: "success", ok: true, test: { file: "sample.test.ts", ok: true } };
    if (name === "verify_format" || name === "verify_typecheck") return { status: "success", ok: true };
    return { status: "success", ok: true };
  });

  const result = await skill.handleToolCall("quality_loop", { path: "sample.ts", search: "1", replace: "2" });

  assert.equal(result.success, true);
  assert.equal(result.stoppedAt, "complete");
  assert.equal(result.diff.changed, true);
  assert.deepEqual(calls, ["read_project_file", "verify_file", "modify_project_file", "verify_format", "verify_typecheck", "verify_file", "read_project_file"]);
  assert.equal(result.testFile, "sample.test.ts");
});

test("quality_loop stops after the first failed phase", async () => {
  const calls: string[] = [];
  const skill = createSmartSkills(async (name) => {
    calls.push(name);
    if (name === "read_project_file") return "const value = 1;";
    if (name === "verify_file") return { status: "success", ok: true };
    if (name === "modify_project_file") return { ok: true };
    if (name === "verify_format") return { status: "failed", ok: false, error: "format failed" };
    return { status: "success", ok: true };
  });

  const result = await skill.handleToolCall("quality_loop", { path: "sample.ts", search: "1", replace: "2" });

  assert.equal(result.success, false);
  assert.equal(result.stoppedAt, "format");
  assert.equal(calls.includes("verify_typecheck"), false);
  assert.equal(calls.includes("verify_file",), true);
});
