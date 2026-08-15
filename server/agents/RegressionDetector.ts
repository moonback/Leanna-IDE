import { normalizeIssue, type VerificationIssue, type VerificationRecord } from "./WorkspaceState";

export interface VerificationBaseline {
  records: VerificationRecord[];
  issueSignature: Set<string>;
  issueCount: number;
  createdAt: string;
}

function flatten(records: VerificationRecord[]): VerificationIssue[] {
  return records.flatMap((r) => [...r.syntax.errors, ...r.typecheck.errors, ...r.lint.errors, ...r.tests.failures, ...r.security.issues, ...r.dependency.issues, ...r.build.errors]);
}
function signature(issue: VerificationIssue): string {
  return `${issue.type}:${issue.file}:${issue.line ?? "?"}:${issue.code ?? issue.rule ?? ""}:${issue.message.slice(0, 160)}`;
}

export class RegressionDetector {
  createBaseline(records: VerificationRecord[] = []): VerificationBaseline {
    const issues = flatten(records);
    return { records, issueSignature: new Set(issues.map(signature)), issueCount: issues.length, createdAt: new Date().toISOString() };
  }

  compare(baseline: VerificationBaseline, after: VerificationRecord[]): VerificationIssue[] {
    const afterIssues = flatten(after);
    const newIssues = afterIssues.filter((issue) => !baseline.issueSignature.has(signature(issue)));
    const failuresLost = after.flatMap((record) => record.tests.passed ? [] : record.tests.failures);
    return [...newIssues, ...failuresLost].map((issue) => normalizeIssue({ ...issue, type: issue.type === "test" ? "regression" : issue.type }, issue.file, "regression"));
  }
}
