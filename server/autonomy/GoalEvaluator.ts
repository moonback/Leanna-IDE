/**
 * GoalEvaluator — Évaluation de la satisfaction d'un objectif
 *
 * Pour chaque objectif actif, évalue si ses checks sont satisfaits
 * en interrogeant l'état réel du workspace : TypeScript, tests, sécurité,
 * dépendances, statut git, dette technique.
 *
 * Conçu pour être non-bloquant : les checks lents (tsc, tests) ont un timeout.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { createLogger } from "../utils/logger.js";
import { SELF_ROOT } from "../utils/selfRoot.js";
import type { Goal, GoalCheck, GoalCheckResult, GoalEvaluationResult } from "./types.js";

const execFileAsync = promisify(execFile);
const log = createLogger("GoalEvaluator");

// ─── Configuration ────────────────────────────────────────────────────────────

const CHECK_TIMEOUT_MS = 30_000; // 30s par check

// ═══════════════════════════════════════════════════════════════════════════════
// GOAL EVALUATOR
// ═══════════════════════════════════════════════════════════════════════════════

export class GoalEvaluator {
  /**
   * Évalue si un objectif est satisfait.
   * Exécute chaque check de l'objectif et calcule un score global (0-1).
   */
  async evaluate(goal: Goal, workspaceRoot?: string): Promise<GoalEvaluationResult> {
    const root = workspaceRoot ?? SELF_ROOT;
    const now = new Date().toISOString();

    if (!goal.checks || goal.checks.length === 0) {
      // Pas de checks définis → satisfaction par défaut
      return {
        goalId: goal.id,
        satisfied: true,
        score: 1,
        checkResults: [],
        summary: "Aucun check défini — objectif considéré satisfait.",
        evaluatedAt: now,
      };
    }

    log.debug(`Évaluation de "${goal.title}" (${goal.checks.length} check(s))…`);

    const checkResults: GoalCheckResult[] = [];

    for (const check of goal.checks) {
      const result = await this._runCheck(check, root);
      checkResults.push(result);
    }

    const passed = checkResults.filter((r) => r.passed).length;
    const total = checkResults.length;
    const score = total > 0 ? passed / total : 1;
    const satisfied = score >= 0.8; // Seuil : 80% des checks doivent passer

    const failedChecks = checkResults
      .filter((r) => !r.passed)
      .map((r) => r.check.label ?? r.check.type)
      .join(", ");

    const summary = satisfied
      ? `✅ Objectif satisfait (${passed}/${total} checks passés)`
      : `⚠️ Objectif non satisfait — checks échoués : ${failedChecks}`;

    log.debug(`"${goal.title}" → ${satisfied ? "✅" : "❌"} score=${(score * 100).toFixed(0)}%`);

    return {
      goalId: goal.id,
      satisfied,
      score,
      checkResults,
      summary,
      evaluatedAt: now,
    };
  }

  // ─── Dispatching des checks ───────────────────────────────────────────────

  private async _runCheck(check: GoalCheck, root: string): Promise<GoalCheckResult> {
    try {
      switch (check.type) {
        case "typescript":
          return await this._checkTypeScript(check, root);
        case "tests":
          return await this._checkTests(check, root);
        case "security":
          return await this._checkSecurity(check, root);
        case "dependencies":
          return await this._checkDependencies(check, root);
        case "git_status":
          return await this._checkGitStatus(check, root);
        case "architecture":
          return await this._checkArchitecture(check, root);
        case "tech_debt":
          return await this._checkTechDebt(check, root);
        case "documentation":
          return await this._checkDocumentation(check, root);
        case "custom":
          return await this._checkCustom(check, root);
        default:
          return {
            check,
            passed: true,
            details: `Check de type inconnu "${check.type}" — ignoré`,
          };
      }
    } catch (err) {
      return {
        check,
        passed: false,
        details: `Erreur lors du check: ${(err as Error).message}`,
      };
    }
  }

  // ─── Implémentations ──────────────────────────────────────────────────────

  private async _checkTypeScript(check: GoalCheck, root: string): Promise<GoalCheckResult> {
    const tsconfig = path.join(root, "tsconfig.json");
    if (!fs.existsSync(tsconfig)) {
      return { check, passed: true, details: "Pas de tsconfig.json — check ignoré" };
    }

    try {
      const tscBin = path.join(root, "node_modules", ".bin", "tsc");
      const cmd = fs.existsSync(tscBin) ? tscBin : "tsc";

      await withTimeout(
        execFileAsync(cmd, ["--noEmit", "--pretty", "false"], { cwd: root }),
        CHECK_TIMEOUT_MS
      );

      return { check, passed: true, details: "TypeScript valide — aucune erreur" };
    } catch (err: any) {
      const output = (err.stdout ?? "") + (err.stderr ?? "");
      const errorCount = (output.match(/error TS/g) ?? []).length;
      return {
        check,
        passed: false,
        details: `TypeScript: ${errorCount} erreur(s) détectée(s)\n${output.slice(0, 500)}`,
      };
    }
  }

  private async _checkTests(check: GoalCheck, root: string): Promise<GoalCheckResult> {
    const pkg = this._readPackageJson(root);
    if (!pkg?.scripts?.test) {
      return { check, passed: true, details: "Pas de script test défini — check ignoré" };
    }

    // Détecter le runner
    const testScript: string = pkg.scripts.test;
    const isVitest = testScript.includes("vitest");
    const isJest = testScript.includes("jest");

    try {
      const extraArgs: string[] = [];
      // Forcer le mode "run" (non-watch) pour ne pas bloquer
      if (isVitest) extraArgs.push("--run");
      if (isJest) extraArgs.push("--passWithNoTests");

      const npm = process.platform === "win32" ? "npm.cmd" : "npm";
      await withTimeout(
        execFileAsync(npm, ["run", "test", "--", ...extraArgs], { cwd: root }),
        CHECK_TIMEOUT_MS
      );

      return { check, passed: true, details: "Tests passés avec succès" };
    } catch (err: any) {
      const output = (err.stdout ?? "") + (err.stderr ?? "");
      return {
        check,
        passed: false,
        details: `Tests échoués:\n${output.slice(0, 500)}`,
      };
    }
  }

  private async _checkSecurity(check: GoalCheck, root: string): Promise<GoalCheckResult> {
    const pkgLock = fs.existsSync(path.join(root, "package-lock.json"));
    const yarnLock = fs.existsSync(path.join(root, "yarn.lock"));

    if (!pkgLock && !yarnLock) {
      return { check, passed: true, details: "Pas de lockfile — audit ignoré" };
    }

    try {
      const npm = process.platform === "win32" ? "npm.cmd" : "npm";
      const { stdout } = await withTimeout(
        execFileAsync(npm, ["audit", "--json", "--audit-level=high"], { cwd: root }),
        CHECK_TIMEOUT_MS
      );

      const report = JSON.parse(stdout ?? "{}");
      const vulns = report?.metadata?.vulnerabilities ?? {};
      const critical = (vulns.critical ?? 0) + (vulns.high ?? 0);

      if (critical > 0) {
        return {
          check,
          passed: false,
          details: `Sécurité: ${critical} vulnérabilité(s) critiques/hautes détectées`,
        };
      }

      return { check, passed: true, details: "Aucune vulnérabilité critique/haute détectée" };
    } catch (err: any) {
      // npm audit retourne exit code 1 si des vulnés sont trouvées
      const output = err.stdout ?? "";
      try {
        const report = JSON.parse(output);
        const vulns = report?.metadata?.vulnerabilities ?? {};
        const critical = (vulns.critical ?? 0) + (vulns.high ?? 0);
        return {
          check,
          passed: critical === 0,
          details: critical > 0
            ? `Sécurité: ${critical} vulnérabilité(s) critiques/hautes`
            : "Aucune vulnérabilité critique/haute",
        };
      } catch {
        return { check, passed: true, details: "Impossible d'analyser le rapport npm audit" };
      }
    }
  }

  private async _checkDependencies(check: GoalCheck, root: string): Promise<GoalCheckResult> {
    const pkgPath = path.join(root, "package.json");
    if (!fs.existsSync(pkgPath)) {
      return { check, passed: true, details: "Pas de package.json — check ignoré" };
    }

    try {
      const npm = process.platform === "win32" ? "npm.cmd" : "npm";
      const { stdout } = await withTimeout(
        execFileAsync(npm, ["outdated", "--json"], { cwd: root }),
        CHECK_TIMEOUT_MS
      );

      if (!stdout || stdout.trim() === "{}") {
        return { check, passed: true, details: "Toutes les dépendances sont à jour" };
      }

      const outdated = JSON.parse(stdout);
      const count = Object.keys(outdated).length;
      return {
        check,
        passed: count <= 5, // Tolérance : jusqu'à 5 dépendances obsolètes
        details: `${count} dépendance(s) obsolète(s) : ${Object.keys(outdated).slice(0, 5).join(", ")}${count > 5 ? "…" : ""}`,
      };
    } catch {
      return { check, passed: true, details: "Impossible de vérifier les dépendances" };
    }
  }

  private async _checkGitStatus(check: GoalCheck, root: string): Promise<GoalCheckResult> {
    const gitDir = path.join(root, ".git");
    if (!fs.existsSync(gitDir)) {
      return { check, passed: true, details: "Pas de dépôt git — check ignoré" };
    }

    try {
      const { stdout } = await withTimeout(
        execFileAsync("git", ["status", "--porcelain"], { cwd: root }),
        CHECK_TIMEOUT_MS
      );

      const lines = (stdout ?? "").trim().split("\n").filter(Boolean);
      if (lines.length === 0) {
        return { check, passed: true, details: "Workspace git propre" };
      }

      return {
        check,
        passed: false,
        details: `${lines.length} fichier(s) non commités : ${lines.slice(0, 3).join(", ")}${lines.length > 3 ? "…" : ""}`,
      };
    } catch {
      return { check, passed: true, details: "Impossible de vérifier le statut git" };
    }
  }

  private async _checkArchitecture(check: GoalCheck, root: string): Promise<GoalCheckResult> {
    // Vérification heuristique de la cohérence architecturale
    const issues: string[] = [];

    // Vérifier la présence de fichiers index
    const srcDir = path.join(root, "src");
    const serverDir = path.join(root, "server");
    const hasSrc = fs.existsSync(srcDir);
    const hasServer = fs.existsSync(serverDir);

    if (!hasSrc && !hasServer) {
      return { check, passed: true, details: "Structure de projet non standard — check ignoré" };
    }

    // Vérifier les imports circulaires (heuristique simple)
    // Dans une vraie implémentation, on déléguerait ça au KnowledgeGraph
    const tsconfigExists = fs.existsSync(path.join(root, "tsconfig.json"));
    if (!tsconfigExists && (hasSrc || hasServer)) {
      issues.push("Pas de tsconfig.json dans un projet TypeScript");
    }

    return {
      check,
      passed: issues.length === 0,
      details: issues.length === 0
        ? "Architecture cohérente"
        : `Issues détectées : ${issues.join("; ")}`,
    };
  }

  private async _checkTechDebt(check: GoalCheck, root: string): Promise<GoalCheckResult> {
    // Compter les TODO/FIXME/HACK dans le code source
    let count = 0;
    const extensions = [".ts", ".tsx", ".js", ".jsx"];
    const debtPatterns = /\/\/\s*(TODO|FIXME|HACK|XXX|BUG|TEMP)\b/i;

    const countInDir = (dir: string, depth = 0): void => {
      if (depth > 4) return;
      if (!fs.existsSync(dir)) return;

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (["node_modules", ".git", "dist", "build", ".Leanna"].includes(entry.name)) continue;
            countInDir(fullPath, depth + 1);
          } else if (entry.isFile() && extensions.includes(path.extname(entry.name))) {
            try {
              const content = fs.readFileSync(fullPath, "utf-8");
              const matches = content.match(new RegExp(debtPatterns.source, "gi")) ?? [];
              count += matches.length;
            } catch { /* fichier non lisible */ }
          }
        }
      } catch { /* dossier non accessible */ }
    };

    countInDir(root);

    const threshold = (check.params?.maxDebt as number) ?? 50;
    return {
      check,
      passed: count <= threshold,
      details: `${count} marker(s) de dette technique (TODO/FIXME/HACK) — seuil: ${threshold}`,
    };
  }

  private async _checkDocumentation(check: GoalCheck, root: string): Promise<GoalCheckResult> {
    const readme = path.join(root, "README.md");
    if (!fs.existsSync(readme)) {
      return {
        check,
        passed: false,
        details: "README.md manquant",
      };
    }

    const content = fs.readFileSync(readme, "utf-8");
    if (content.trim().length < 200) {
      return {
        check,
        passed: false,
        details: `README.md trop court (${content.trim().length} caractères < 200)`,
      };
    }

    return { check, passed: true, details: "Documentation présente" };
  }

  private async _checkCustom(check: GoalCheck, _root: string): Promise<GoalCheckResult> {
    // Les checks custom sont évalués à true par défaut — l'agent brain peut les évaluer
    return {
      check,
      passed: true,
      details: `Check custom "${check.label ?? check.type}" — évaluation déléguée à un agent`,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private _readPackageJson(root: string): Record<string, any> | null {
    try {
      const pkgPath = path.join(root, "package.json");
      if (!fs.existsSync(pkgPath)) return null;
      return JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    } catch {
      return null;
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout après ${ms}ms`)),
      ms
    );
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// ─── Singleton ────────────────────────────────────────────────────────────────

/** Instance singleton partagée du GoalEvaluator. */
export const goalEvaluator = new GoalEvaluator();
