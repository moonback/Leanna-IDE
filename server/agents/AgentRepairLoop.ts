import { hashContent, type VerificationIssue, type VerificationRecord } from "./WorkspaceState";

export interface RepairProgress {
  action: "continue" | "change_strategy" | "stop_loop" | "rollback_replan";
  reason: string;
  issueCountDelta: number;
  repeatedPatch: boolean;
}

export interface RepairAttempt {
  attempt: number;
  fileHashes: Record<string, string>;
  issueSignature: string;
  issueCount: number;
  patchSignature?: string;
}

export interface RepairPlan {
  rootFiles: string[];
  groupedIssues: Record<string, VerificationIssue[]>;
  prompt: string;
  progress: RepairProgress;
}

function issueSignature(issues: VerificationIssue[]): string {
  return issues
    .map((i) => `${i.type}:${i.file}:${i.line ?? "?"}:${i.code ?? i.rule ?? ""}:${i.message.slice(0, 120)}`)
    .sort()
    .join("|");
}

export class AgentRepairLoop {
  private attempts: RepairAttempt[] = [];
  private patchHashes = new Set<string>();

  recordPatch(patch: string): boolean {
    const hash = hashContent(patch.trim());
    const repeated = this.patchHashes.has(hash);
    this.patchHashes.add(hash);
    return repeated;
  }

  repair(input: { taskTitle: string; records: VerificationRecord[]; fileHashes: Record<string, string>; lastPatch?: string }): RepairPlan {
    const issues = input.records.flatMap((r) => [
      ...r.syntax.errors,
      ...r.typecheck.errors,
      ...r.lint.errors,
      ...r.tests.failures,
      ...r.security.issues,
      ...r.dependency.issues,
      ...r.build.errors,
    ]);
    const groupedIssues = issues.reduce<Record<string, VerificationIssue[]>>((acc, issue) => {
      const key = issue.relatedFiles?.[0] ?? issue.file;
      (acc[key] ??= []).push(issue);
      return acc;
    }, {});
    const current: RepairAttempt = {
      attempt: this.attempts.length + 1,
      fileHashes: input.fileHashes,
      issueSignature: issueSignature(issues),
      issueCount: issues.length,
      patchSignature: input.lastPatch ? hashContent(input.lastPatch.trim()) : undefined,
    };
    const previous = this.attempts.at(-1);
    const repeatedPatch = input.lastPatch ? this.recordPatch(input.lastPatch) : false;
    const issueCountDelta = previous ? current.issueCount - previous.issueCount : 0;
    let progress: RepairProgress = { action: "continue", reason: "Première correction ou erreurs en baisse.", issueCountDelta, repeatedPatch };
    if (repeatedPatch || (previous && previous.issueSignature === current.issueSignature && JSON.stringify(previous.fileHashes) === JSON.stringify(current.fileHashes))) {
      progress = { action: "stop_loop", reason: "Même patch, mêmes hashes ou même diagnostic répété : boucle détectée.", issueCountDelta, repeatedPatch };
    } else if (previous && issueCountDelta === 0 && previous.issueSignature === current.issueSignature) {
      progress = { action: "change_strategy", reason: "Aucune progression mesurable : changer de stratégie et relire les causes racines.", issueCountDelta, repeatedPatch };
    } else if (previous && issueCountDelta > Math.max(3, previous.issueCount)) {
      progress = { action: "rollback_replan", reason: "Forte augmentation des erreurs : replanifier ou rollback Git sécurisé.", issueCountDelta, repeatedPatch };
    }
    this.attempts.push(current);
    const rootFiles = Object.entries(groupedIssues)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([file]) => file);
    const prompt = [
      `ERROR REPAIR LOOP — tâche: ${input.taskTitle}`,
      `Action recommandée: ${progress.action} (${progress.reason})`,
      "Lis les fichiers courants listés ci-dessous avant tout patch. Corrige la cause racine, pas chaque erreur isolément.",
      ...rootFiles.map((file) => `FILE ${file}: ${groupedIssues[file].length} issue(s) — ${groupedIssues[file].map((i) => `${i.code ?? i.rule ?? i.type}@${i.line ?? "?"}: ${i.message}`).join(" | ")}`),
    ].join("\n");
    return { rootFiles, groupedIssues, prompt, progress };
  }
}
