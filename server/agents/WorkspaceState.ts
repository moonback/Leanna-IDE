import { createHash, randomUUID } from "crypto";

export type VerificationStatus = "unknown" | "pending" | "passed" | "failed" | "stale";
export type VerificationIssueType = "syntax" | "typecheck" | "lint" | "test" | "build" | "security" | "dependency" | "configuration" | "review" | "regression";
export type VerificationSeverity = "error" | "warning" | "critical" | "info";

export interface VerificationIssue {
  id: string;
  type: VerificationIssueType;
  severity: VerificationSeverity;
  file: string;
  line?: number | null;
  column?: number | null;
  code?: string;
  rule?: string;
  message: string;
  context?: string;
  suggestion?: string;
  relatedFiles?: string[];
}

export interface VerificationRecord {
  path: string;
  contentHash: string;
  verifiedAt: string;
  syntax: { passed: boolean; errors: VerificationIssue[] };
  typecheck: { passed: boolean; errors: VerificationIssue[] };
  lint: { passed: boolean; errors: VerificationIssue[] };
  tests: { passed: boolean; executed: string[]; failures: VerificationIssue[] };
  security: { passed: boolean; issues: VerificationIssue[] };
  dependency: { passed: boolean; issues: VerificationIssue[]; relatedFiles: string[] };
  build: { passed: boolean; errors: VerificationIssue[]; executed: boolean };
  overall: boolean;
}

export interface WorkspaceFileState {
  path: string;
  exists: boolean;
  contentHash: string;
  previousHash?: string;
  content?: string;
  version: number;
  lastReadAt?: string;
  lastWriteAt?: string;
  lastVerifiedAt?: string;
  verifiedHash?: string;
  verificationStatus: VerificationStatus;
  verificationErrors: VerificationIssue[];
  modifiedByAgent?: string;
  modificationCount: number;
}

export interface AgentCompletionReport {
  success: boolean;
  confidence: number;
  filesModified: string[];
  filesVerified: string[];
  verificationRecords: VerificationRecord[];
  regressions: VerificationIssue[];
  unresolvedIssues: VerificationIssue[];
  testsPassed: number;
  testsFailed: number;
  typecheckPassed: boolean;
  lintPassed: boolean;
  reviewPassed: boolean;
}

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function normalizeIssue(raw: any, fallbackFile = "global", fallbackType: VerificationIssueType = "configuration"): VerificationIssue {
  return {
    id: raw?.id ?? randomUUID(),
    type: (raw?.type ?? fallbackType) as VerificationIssueType,
    severity: (raw?.severity === "critical" ? "critical" : raw?.severity === "warning" ? "warning" : raw?.severity === "info" ? "info" : "error") as VerificationSeverity,
    file: String(raw?.file ?? fallbackFile),
    line: raw?.line ?? null,
    column: raw?.column ?? null,
    code: raw?.code ?? raw?.rule,
    rule: raw?.rule,
    message: String(raw?.message ?? raw?.error ?? raw ?? "Issue inconnue"),
    context: raw?.context,
    suggestion: raw?.suggestion,
    relatedFiles: Array.isArray(raw?.relatedFiles) ? raw.relatedFiles : undefined,
  };
}

export class AuthoritativeWorkspaceState {
  private files = new Map<string, WorkspaceFileState>();

  get(path: string): WorkspaceFileState | undefined { return this.files.get(path); }
  entries(): WorkspaceFileState[] { return [...this.files.values()]; }
  modifiedFiles(): WorkspaceFileState[] { return this.entries().filter((f) => f.modificationCount > 0); }

  recordRead(path: string, content: string | null): WorkspaceFileState {
    const previous = this.files.get(path);
    const contentHash = content === null ? "missing" : hashContent(content);
    const changedAfterVerification = previous?.verifiedHash && previous.verifiedHash !== contentHash;
    const state: WorkspaceFileState = {
      path,
      exists: content !== null,
      contentHash,
      previousHash: previous?.contentHash,
      content: content ?? undefined,
      version: previous && previous.contentHash !== contentHash ? previous.version + 1 : previous?.version ?? 1,
      lastReadAt: new Date().toISOString(),
      lastWriteAt: previous?.lastWriteAt,
      lastVerifiedAt: previous?.lastVerifiedAt,
      verifiedHash: previous?.verifiedHash,
      verificationStatus: changedAfterVerification ? "stale" : previous?.verificationStatus ?? "unknown",
      verificationErrors: changedAfterVerification ? previous?.verificationErrors ?? [] : previous?.verificationErrors ?? [],
      modifiedByAgent: previous?.modifiedByAgent,
      modificationCount: previous?.modificationCount ?? 0,
    };
    this.files.set(path, state);
    return state;
  }

  recordWrite(path: string, beforeContent: string | null, afterContent: string, agent: string): WorkspaceFileState {
    const beforeHash = beforeContent === null ? "missing" : hashContent(beforeContent);
    const previous = this.files.get(path);
    const afterHash = hashContent(afterContent);
    const state: WorkspaceFileState = {
      path,
      exists: true,
      contentHash: afterHash,
      previousHash: beforeHash,
      content: afterContent,
      version: (previous?.version ?? 0) + 1,
      lastReadAt: new Date().toISOString(),
      lastWriteAt: new Date().toISOString(),
      verificationStatus: "pending",
      verificationErrors: [],
      modifiedByAgent: agent,
      modificationCount: (previous?.modificationCount ?? 0) + 1,
    };
    this.files.set(path, state);
    return state;
  }

  recordVerification(path: string, record: VerificationRecord): WorkspaceFileState {
    const previous = this.files.get(path) ?? this.recordRead(path, null);
    const currentHash = previous.contentHash;
    const stale = currentHash !== record.contentHash;
    const state: WorkspaceFileState = {
      ...previous,
      lastVerifiedAt: record.verifiedAt,
      verifiedHash: record.contentHash,
      verificationStatus: stale ? "stale" : record.overall ? "passed" : "failed",
      verificationErrors: [...record.syntax.errors, ...record.typecheck.errors, ...record.lint.errors, ...record.tests.failures, ...record.security.issues, ...record.dependency.issues, ...record.build.errors],
    };
    this.files.set(path, state);
    return state;
  }

  assertCompletionReady(paths: string[]): VerificationIssue[] {
    return paths.flatMap((path) => {
      const state = this.files.get(path);
      if (!state) return [normalizeIssue({ type: "configuration", file: path, message: "Fichier modifié absent du workspace state." }, path)];
      if (!state.exists) return [normalizeIssue({ type: "configuration", file: path, message: "Fichier modifié introuvable." }, path)];
      if (state.verificationStatus !== "passed" || state.verifiedHash !== state.contentHash) {
        return [normalizeIssue({ type: "configuration", file: path, message: `Vérification non valide pour le hash courant (${state.verificationStatus}).`, context: `currentHash=${state.contentHash}; verifiedHash=${state.verifiedHash ?? "none"}` }, path)];
      }
      return [];
    });
  }
}

export function verificationRecordFromToolResult(path: string, contentHash: string, result: any): VerificationRecord {
  const issues: VerificationIssue[] = Array.isArray(result?.allIssues) ? result.allIssues.map((i: any) => normalizeIssue(i, path)) : [];
  const byType = (type: VerificationIssueType): VerificationIssue[] => issues.filter((issue: VerificationIssue) => issue.type === type);
  return {
    path,
    contentHash: result?.contentHash ?? contentHash,
    verifiedAt: result?.verifiedAt ?? new Date().toISOString(),
    syntax: { passed: result?.prevalidation?.tsSyntax !== false && byType("syntax").length === 0, errors: byType("syntax") },
    typecheck: { passed: result?.typecheck?.ok !== false && byType("typecheck").length === 0, errors: byType("typecheck") },
    lint: { passed: result?.lint?.ok !== false && byType("lint").filter((i: VerificationIssue) => i.severity !== "warning" && i.severity !== "info").length === 0, errors: byType("lint") },
    tests: { passed: result?.test?.ok !== false && byType("test").length === 0, executed: result?.test?.file ? [result.test.file] : [], failures: byType("test") },
    security: { passed: result?.security?.ok !== false && byType("security").filter((i: VerificationIssue) => i.severity === "critical" || i.severity === "error").length === 0, issues: byType("security") },
    dependency: { passed: byType("dependency").length === 0, issues: byType("dependency"), relatedFiles: result?.dependency?.relatedFiles ?? [] },
    build: { passed: result?.build?.ok !== false && byType("build").length === 0, errors: byType("build"), executed: Boolean(result?.build?.executed) },
    overall: Boolean(result?.ok) && result?.status === "success",
  };
}
