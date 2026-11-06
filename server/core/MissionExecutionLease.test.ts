import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { MissionExecutionLease, MissionLeaseBusyError } from "./MissionExecutionLease.js";

test("mission lease rejects a second concurrent process and releases by owner token", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-lease-"));
  const first = MissionExecutionLease.acquire("mission-1", directory);
  assert.throws(
    () => MissionExecutionLease.acquire("mission-1", directory),
    MissionLeaseBusyError
  );
  first.release();
  const second = MissionExecutionLease.acquire("mission-1", directory);
  second.release();
  fs.rmSync(directory, { recursive: true, force: true });
});

test("mission lease reclaims only a demonstrably dead same-host owner", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-lease-stale-"));
  const lockPath = path.join(directory, "mission-2.lock");
  fs.writeFileSync(lockPath, JSON.stringify({
    missionId: "mission-2",
    pid: 2147483647,
    hostname: os.hostname(),
    token: "stale-owner",
    acquiredAt: new Date(0).toISOString(),
  }), "utf8");

  const lease = MissionExecutionLease.acquire("mission-2", directory);
  const current = JSON.parse(fs.readFileSync(lockPath, "utf8")) as { token: string };
  assert.notEqual(current.token, "stale-owner");
  lease.release();
  fs.rmSync(directory, { recursive: true, force: true });
});
