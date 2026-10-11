import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { AutonomyAuditLog } from "./AutonomyAuditLog.js";

function tempLog(): { log: AutonomyAuditLog; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "leanna-audit-"));
  return { log: new AutonomyAuditLog(dir), dir };
}

test("append then read round-trips entries oldest-first", () => {
  const { log, dir } = tempLog();
  try {
    log.append({ phase: "considered", action: "idle:diagnostic", message: "looking" });
    log.append({ phase: "started", action: "idle:diagnostic", message: "launching", dryRun: true });
    log.append({ phase: "completed", action: "idle:diagnostic", message: "done", outcome: "success", tokens: 123 });

    const entries = log.read();
    assert.equal(entries.length, 3);
    assert.equal(entries[0].phase, "considered");
    assert.equal(entries[2].outcome, "success");
    assert.equal(entries[2].tokens, 123);
    // Every entry gets an ISO timestamp.
    assert.ok(entries.every((e) => typeof e.ts === "string" && e.ts.includes("T")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("read(limit) returns only the most recent N", () => {
  const { log, dir } = tempLog();
  try {
    for (let i = 0; i < 5; i++) log.append({ phase: "considered", action: "x", message: `#${i}` });
    const recent = log.read(2);
    assert.equal(recent.length, 2);
    assert.equal(recent[0].message, "#3");
    assert.equal(recent[1].message, "#4");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("reading an absent log yields an empty array", () => {
  const { log, dir } = tempLog();
  try {
    assert.deepEqual(log.read(), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
