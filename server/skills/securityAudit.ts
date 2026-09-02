import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { Skill, validateArgs } from "./base.js";
import { getProjectRoot, EXCLUDED_DIRS, TEXT_FILE_EXT } from "./codebaseHelpers.js";
import { runSecurityAnalysis, type SecurityIssue } from "./verify.js";

const execFileAsync = promisify(execFile);
const MAX_FILES = 500;
const MAX_FILE_SIZE = 500_000;
const AUDIT_TIMEOUT_MS = 45_000;

type PackageManager = "npm" | "yarn" | "pnpm" | "none";

interface DependencyAudit {
  status: "success" | "failed" | "unavailable";
  packageManager: PackageManager;
  vulnerabilities: Record<string, number>;
  advisories: Array<{ name: string; severity: string; range?: string; fixAvailable?: boolean }>;
  advisoriesTruncated?: boolean;
  message: string;
}

/**
 * Détecte le gestionnaire de paquets utilisé à la racine du projet, en se basant
 * sur les fichiers de lock présents. Évite de lancer `npm audit` (et son coût
 * process/timeout) sur un projet yarn/pnpm ou sans dépendances Node du tout.
 */
function detectPackageManager(root: string): PackageManager {
  if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(root, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(root, "package-lock.json")) || fs.existsSync(path.join(root, "package.json"))) return "npm";
  return "none";
}

function collectFiles(root: string): { files: string[]; skipped: number } {
  const files: string[] = [];
  let skipped = 0;
  const visitedRealPaths = new Set<string>();

  const walk = (directory: string) => {
    if (files.length >= MAX_FILES) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      skipped++;
      return;
    }

    for (const entry of entries) {
      if (files.length >= MAX_FILES || EXCLUDED_DIRS.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);

      // Évite de suivre les liens symboliques (cycles, sorties du projet) tout
      // en restant tolérant si le FS ne remonte pas correctement isSymbolicLink().
      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        try {
          const real = fs.realpathSync(absolute);
          if (visitedRealPaths.has(real)) continue;
          visitedRealPaths.add(real);
        } catch {
          skipped++;
          continue;
        }
        walk(absolute);
        continue;
      }

      if (!entry.isFile() || !TEXT_FILE_EXT.test(entry.name)) continue;

      try {
        const stats = fs.statSync(absolute);
        if (stats.size <= MAX_FILE_SIZE) files.push(absolute);
      } catch {
        // Fichier supprimé/inaccessible entre le readdir et le stat: on l'ignore.
        skipped++;
      }
    }
  };

  walk(root);
  return { files, skipped };
}

function summarizeIssues(issues: SecurityIssue[]) {
  return {
    total: issues.length,
    critical: issues.filter(issue => issue.severity === "critical").length,
    high: issues.filter(issue => issue.severity === "high").length,
    medium: issues.filter(issue => issue.severity === "medium").length,
    low: issues.filter(issue => issue.severity === "low").length,
  };
}

function parseNpmAuditOutput(rawStdout: string): Pick<DependencyAudit, "vulnerabilities" | "advisories" | "advisoriesTruncated"> | null {
  let report: any;
  try {
    report = JSON.parse(rawStdout);
  } catch {
    return null;
  }
  const metadata = report?.metadata?.vulnerabilities;
  if (!metadata || typeof metadata !== "object") return null;

  const vulnerabilities: Record<string, number> = {};
  for (const [key, value] of Object.entries(metadata)) {
    vulnerabilities[key] = Number(value) || 0;
  }

  const allAdvisories = Object.values(report.vulnerabilities ?? {})
    .map((item: any) => ({
      name: String(item?.name ?? "unknown"),
      severity: String(item?.severity ?? "unknown"),
      range: item?.range ? String(item.range) : undefined,
      fixAvailable: Boolean(item?.fixAvailable),
    }));

  return {
    vulnerabilities,
    advisories: allAdvisories.slice(0, 100),
    advisoriesTruncated: allAdvisories.length > 100,
  };
}

async function auditDependencies(root: string): Promise<DependencyAudit> {
  const packageManager = detectPackageManager(root);

  if (packageManager === "none") {
    return {
      status: "unavailable",
      packageManager,
      vulnerabilities: {},
      advisories: [],
      advisoriesTruncated: false,
      message: "Aucun package.json détecté: audit de dépendances ignoré.",
    };
  }

  if (packageManager !== "npm") {
    return {
      status: "unavailable",
      packageManager,
      vulnerabilities: {},
      advisories: [],
      advisoriesTruncated: false,
      message: `Gestionnaire de paquets détecté (${packageManager}) non pris en charge hors ligne; scan statique uniquement.`,
    };
  }

  try {
    const { stdout } = await execFileAsync(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["audit", "--json", "--offline"],
      { cwd: root, timeout: AUDIT_TIMEOUT_MS, windowsHide: true, maxBuffer: 2_000_000 },
    );
    const parsed = parseNpmAuditOutput(stdout);
    if (!parsed) {
      return {
        status: "unavailable",
        packageManager,
        vulnerabilities: {},
        advisories: [],
        advisoriesTruncated: false,
        message: "Réponse npm audit illisible; le scan statique reste exploitable.",
      };
    }
    return { status: "success", packageManager, ...parsed, message: "Audit npm terminé en mode hors ligne." };
  } catch (error: any) {
    const parsed = parseNpmAuditOutput(error?.stdout || "");
    if (parsed) {
      return {
        status: "failed",
        packageManager,
        ...parsed,
        message: "Des vulnérabilités de dépendances ont été détectées.",
      };
    }
    const timedOut = error?.killed && error?.signal;
    return {
      status: "unavailable",
      packageManager,
      vulnerabilities: {},
      advisories: [],
      advisoriesTruncated: false,
      message: timedOut
        ? "Audit npm interrompu (délai dépassé); le scan statique reste exploitable."
        : "Audit npm indisponible hors ligne; le scan statique reste exploitable.",
    };
  }
}

export const securityAuditSkill: Skill = {
  name: "security_audit",
  metadata: {
    version: "1.1.0",
    description: "Audit défensif autonome et non mutatif du workspace.",
    category: "security",
  },
  declarations: [{
    name: "security_audit",
    description: "Audit complet en lecture seule: SAST, secrets, configuration et npm hors ligne. Aucune commande arbitraire ni mutation.",
    parameters: {
      type: "OBJECT",
      properties: { includeTests: { type: "BOOLEAN", description: "Inclure les fichiers de test dans le scan (défaut: false)." } },
    },
    category: "security",
    mutating: false,
    timeoutMs: 120_000,
  }],
  inputSchemas: { security_audit: z.object({ includeTests: z.boolean().optional().default(false) }) },
  handleToolCall: async (name, args) => {
    if (name !== "security_audit") throw new Error(`Unknown tool in security_audit: ${name}`);
    const { includeTests } = validateArgs(securityAuditSkill.inputSchemas!.security_audit, args ?? {}, name);
    const root = getProjectRoot();
    const auditStartedAt = Date.now();

    const { files: candidateFiles, skipped } = collectFiles(root);
    const scannedFiles: string[] = [];
    let skippedByFilter = 0;
    const issues: SecurityIssue[] = [];

    for (const file of candidateFiles) {
      const relative = path.relative(root, file).replace(/\\/g, "/");
      if (!includeTests && /(^|\/)([^/]*\.)?(test|spec)\.[^/]+$/i.test(relative)) {
        skippedByFilter++;
        continue;
      }
      try {
        issues.push(...runSecurityAnalysis(fs.readFileSync(file, "utf8"), relative));
        scannedFiles.push(relative);
      } catch {
        // Fichier supprimé ou illisible pendant le scan.
      }
    }

    const dependencies = await auditDependencies(root);
    const summary = summarizeIssues(issues);
    const dependencyHigh = Number(dependencies.vulnerabilities.high || 0)
      + Number(dependencies.vulnerabilities.critical || 0);
    const dependenciesComplete = dependencies.status === "success" || dependencies.packageManager === "none";
    const dependenciesBlocking = dependencies.status === "failed" && dependencyHigh > 0;
    const ok = summary.critical === 0 && summary.high === 0 && !dependenciesBlocking && dependenciesComplete;
    const issuesTruncated = issues.length > 500;
    const durationMs = Date.now() - auditStartedAt;

    return {
      status: ok ? "success" : "failed",
      ok,
      readOnly: true,
      generatedAt: new Date().toISOString(),
      durationMs,
      scope: {
        root,
        filesScanned: scannedFiles.length,
        filesSkipped: skipped + skippedByFilter,
        truncated: candidateFiles.length >= MAX_FILES,
        includeTests,
      },
      summary: {
        ...summary,
        dependencyHigh,
        issuesReturned: Math.min(issues.length, 500),
        issuesTruncated,
        dependenciesComplete,
      },
      issues: issues.slice(0, 500),
      dependencies,
      message: ok
        ? "Audit de sécurité terminé: aucune alerte bloquante détectée."
        : dependenciesComplete
          ? "Audit terminé: des alertes bloquantes nécessitent une correction."
          : "Audit incomplet: l’audit des dépendances n’a pas pu être réalisé.",
    };
  },
};