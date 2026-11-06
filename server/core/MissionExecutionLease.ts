import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { coreDir } from "./paths.js";

interface LeaseRecord {
  missionId: string;
  pid: number;
  hostname: string;
  token: string;
  acquiredAt: string;
}

export class MissionLeaseBusyError extends Error {
  constructor(readonly missionId: string, readonly owner?: Pick<LeaseRecord, "pid" | "hostname" | "acquiredAt">) {
    super(`Mission ${missionId} is already leased by another execution process.`);
    this.name = "MissionLeaseBusyError";
  }
}

/**
 * Exclusive process lease for a mission. A lease is only reclaimed
 * automatically when its owner is on this host and the PID is demonstrably
 * dead. Unknown/corrupt/remote leases fail closed.
 */
export class MissionExecutionLease {
  private released = false;

  private constructor(
    readonly missionId: string,
    private readonly lockPath: string,
    private readonly token: string
  ) {}

  static acquire(missionId: string, directoryOverride?: string): MissionExecutionLease {
    const safeId = missionId.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const directory = directoryOverride ?? coreDir("mission-leases");
    fs.mkdirSync(directory, { recursive: true });
    const lockPath = path.join(directory, `${safeId}.lock`);
    const token = randomUUID();
    const record: LeaseRecord = {
      missionId,
      pid: process.pid,
      hostname: os.hostname(),
      token,
      acquiredAt: new Date().toISOString(),
    };

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const fd = fs.openSync(lockPath, "wx", 0o600);
        try {
          fs.writeFileSync(fd, JSON.stringify(record), "utf8");
          fs.fsyncSync(fd);
        } catch (error) {
          fs.closeSync(fd);
          try { fs.unlinkSync(lockPath); } catch { /* best effort */ }
          throw error;
        }
        fs.closeSync(fd);
        return new MissionExecutionLease(missionId, lockPath, token);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        let existing: LeaseRecord;
        try {
          existing = JSON.parse(fs.readFileSync(lockPath, "utf8")) as LeaseRecord;
        } catch {
          throw new MissionLeaseBusyError(missionId);
        }
        if (!existing || typeof existing.pid !== "number" || typeof existing.hostname !== "string" || typeof existing.token !== "string") {
          throw new MissionLeaseBusyError(missionId);
        }
        if (existing.hostname !== os.hostname() || isProcessAlive(existing.pid)) {
          throw new MissionLeaseBusyError(missionId, {
            pid: existing.pid,
            hostname: existing.hostname,
            acquiredAt: existing.acquiredAt,
          });
        }
        // Same-host dead owner: reclaim once. The next wx open arbitrates races.
        try { fs.unlinkSync(lockPath); } catch {
          throw new MissionLeaseBusyError(missionId);
        }
      }
    }
    throw new MissionLeaseBusyError(missionId);
  }

  release(): void {
    if (this.released) return;
    this.released = true;
    try {
      const current = JSON.parse(fs.readFileSync(this.lockPath, "utf8")) as LeaseRecord;
      if (current.token === this.token && current.pid === process.pid) {
        fs.unlinkSync(this.lockPath);
      }
    } catch {
      // Never remove a lease we cannot prove belongs to this process.
    }
  }
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
