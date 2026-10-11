/**
 * AutonomyAuditLog — a readable, append-only trail of self-initiated work.
 *
 * Phase 3 ("autonomie encadrée"): every action Leanna takes on her own during
 * calm periods is written here as one JSON object per line, so a human can read
 * exactly what ran, when, what it cost, and how it ended. It deliberately
 * mirrors the durable-store conventions already used by EvidenceEngine /
 * CheckpointManager: atomic/append writers from server/core/paths.ts, a
 * constructor dir override for tests, and best-effort writes that never throw
 * into the autonomy loop.
 *
 * The file lives at `.Leanna/core/autonomy/audit.jsonl`.
 */

import path from "path";
import { coreDir, appendJsonl, readJsonl } from "../core/paths.js";

/** The kind of lifecycle moment being recorded. */
export type AutonomyAuditPhase =
  | "considered"   // the idle loop looked at doing work
  | "skipped"      // declined (kill switch, budget, busy, nothing to do)
  | "started"      // a self-initiated read-only mission was launched
  | "completed"    // it finished (success or not)
  | "error";       // it threw before producing a terminal result

/** One append-only audit entry. Flat and self-describing for easy reading. */
export interface AutonomyAuditEntry {
  /** ISO timestamp of the event. */
  ts: string;
  phase: AutonomyAuditPhase;
  /** Short machine-readable action id (e.g. "idle:diagnostic"). */
  action: string;
  /** Human-readable one-liner. */
  message: string;
  /** The read-only skills the mission was constrained to, when applicable. */
  skills?: string[];
  /** Whether the mission ran in dry-run (no side effects). */
  dryRun?: boolean;
  /** Outcome, for completed/error phases. */
  outcome?: "success" | "blocked" | "failed" | "error";
  /** Accounted usage for this action. */
  tokens?: number;
  costUsd?: number;
  /** Rolling-hour budget state at the time (used/max), for transparency. */
  budget?: { actions?: string; tokens?: string; costUsd?: string };
  /** Correlation id tying related entries (considered → started → completed). */
  runId?: string;
  /** Free-form extra detail. */
  detail?: string;
}

/** Append-only JSONL audit log for self-initiated autonomy. */
export class AutonomyAuditLog {
  private readonly file: string;

  constructor(dirOverride?: string) {
    const dir = dirOverride ?? coreDir("autonomy");
    this.file = path.join(dir, "audit.jsonl");
  }

  /** Absolute path of the audit file (for the UI / documentation). */
  get path(): string {
    return this.file;
  }

  /** Append one entry. Best-effort: a write failure must never break autonomy. */
  append(entry: Omit<AutonomyAuditEntry, "ts"> & { ts?: string }): void {
    try {
      appendJsonl(this.file, { ts: new Date().toISOString(), ...entry });
    } catch {
      /* audit logging is best-effort and must never affect the runtime */
    }
  }

  /** Read the trail (oldest first). `limit` returns only the most recent N. */
  read(limit?: number): AutonomyAuditEntry[] {
    const all = readJsonl<AutonomyAuditEntry>(this.file);
    return limit && limit > 0 ? all.slice(-limit) : all;
  }
}
