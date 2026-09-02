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

interface DependencyAudit {
  status: "success" | "failed" | "unavailable";
  vulnerabilities: Record<string, number>;
  advisories: Array<{ name: string; severity: string; range?: string; fixAvailable?: boolean }>;
  message: string;
}

function collectFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (directory: string) => {
    if (files.length >= MAX_FILES) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (files.length >= MAX_FILES || EXCLUDED_DIRS.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile() && TEXT_FILE_EXT.test(entry.name) && fs.statSync(absolute).size <= MAX_FILE_SIZE) files.push(absolute);
    }
  };
  walk(root);
  return files;
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

async function auditDependencies(root: string): Promise<DependencyAudit> {
  try {
    const { stdout } = await execFileAsync(process.platform === "win32" ? "npm.cmd" : "npm", ["audit", "--json", "--offline"], {
      cwd: root,
      timeout: AUDIT_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 2_000_000,
    });
    const report = JSON.parse(stdout);
    const metadata = report.metadata?.vulnerabilities ?? {};
    const advisories = Object.values(report.vulnerabilities ?? {}).map((item: any) => ({
      name: item.name,
      severity: item.severity,
      range: item.range,
      fixAvailable: Boolean(item.fixAvailable),
    })).slice(0, 100);
    return { status: "success", vulnerabilities: metadata, advisories, message: "Audit npm terminé en mode hors ligne." };
  } catch (error: any) {
    let report: any = null;
    try { report = JSON.parse(error.stdout || ""); } catch { /* npm peut ne rien fournir hors ligne */ }
    if (report?.metadata?.vulnerabilities) {
      return {
        status: "failed",
        vulnerabilities: report.metadata.vulnerabilities,
        advisories: Object.values(report.vulnerabilities ?? {}).map((item: any) => ({
          name: item.name,
          severity: item.severity,
          range: item.range,
          fixAvailable: Boolean(item.fixAvailable),
        })).slice(0, 100),
        message: "Des vulnérabilités de dépendances ont été détectées.",
      };
    }
    return {
      status: "unavailable",
      vulnerabilities: {},
      advisories: [],
      message: "Audit npm indisponible hors ligne; le scan statique reste exploitable.",
    };
  }
}

export const securityAuditSkill: Skill = {
  name: "security_audit",
  metadata: {
    version: "1.0.0",
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
    const scannedFiles: string[] = [];
    const issues: SecurityIssue[] = [];
    for (const file of collectFiles(root)) {
      const relative = path.relative(root, file).replace(/\\/g, "/");
      if (!includeTests && /(^|\/)([^/]*\.)?(test|spec)\.[^/]+$/i.test(relative)) continue;
      try {
        issues.push(...runSecurityAnalysis(fs.readFileSync(file, "utf8"), relative));
        scannedFiles.push(relative);
      } catch { /* fichier supprimé ou illisible pendant le scan */ }
    }
    const dependencies = await auditDependencies(root);
    const summary = summarizeIssues(issues);
    const dependencyHigh = Number(dependencies.vulnerabilities.high || 0)
      + Number(dependencies.vulnerabilities.critical || 0);
    const ok = summary.critical === 0 && summary.high === 0 && dependencyHigh === 0 && dependencies.status !== "failed";
    return {
      status: ok ? "success" : "failed",
      ok,
      readOnly: true,
      scope: { root, filesScanned: scannedFiles.length, truncated: scannedFiles.length >= MAX_FILES, includeTests },
      summary: { ...summary, dependencyHigh },
      issues: issues.slice(0, 500),
      dependencies,
      message: ok
        ? "Audit de sécurité terminé: aucune alerte bloquante détectée."
        : "Audit terminé: des alertes bloquantes nécessitent une correction.",
    };
  },
};
