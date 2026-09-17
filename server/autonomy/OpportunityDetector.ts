/**
 * OpportunityDetector — Détection passive d'opportunités d'amélioration
 *
 * Scanne périodiquement le workspace à la recherche de :
 *   - Dette technique (TODO/FIXME/HACK)
 *   - Tests manquants
 *   - Documentation manquante
 *   - Dépendances obsolètes / vulnérables
 *   - Problèmes de sécurité évidents
 *   - Duplication de code (heuristique)
 *   - Incohérences architecturales
 *
 * Produit des Opportunity[] qui peuvent alimenter de nouveaux Goal.
 * Respecte les niveaux d'autonomie — analyse seulement, aucune modification.
 */

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { createLogger } from "../utils/logger.js";
import { SELF_ROOT } from "../utils/selfRoot.js";
import type { Opportunity, OpportunityType } from "./types.js";

const log = createLogger("OpportunityDetector");

// ─── Configuration ────────────────────────────────────────────────────────────

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "build", ".Leanna", "coverage", "out", "release"]);

/** Taille max d'un fichier scanné (bytes) — évite les fichiers générés */
const MAX_FILE_SIZE = 200_000; // 200KB

// ═══════════════════════════════════════════════════════════════════════════════
// OPPORTUNITY DETECTOR
// ═══════════════════════════════════════════════════════════════════════════════

export type OpportunityHandler = (opportunities: Opportunity[]) => void | Promise<void>;

export class OpportunityDetector {
  private handlers: Set<OpportunityHandler> = new Set();
  private lastScanAt: number = 0;
  private scanTimer: ReturnType<typeof setInterval> | null = null;

  /** Intervalle de scan périodique (ms) */
  private readonly scanIntervalMs: number;

  constructor(scanIntervalMs = 30 * 60 * 1000) { // 30 min par défaut
    this.scanIntervalMs = scanIntervalMs;
  }

  // ─── Cycle de vie ──────────────────────────────────────────────────────────

  /**
   * Démarre le scan périodique.
   */
  start(): void {
    if (this.scanTimer) return;

    // Premier scan après 2 minutes (laisser le serveur se stabiliser)
    setTimeout(() => this.scanAndDispatch(), 2 * 60 * 1000);

    this.scanTimer = setInterval(() => this.scanAndDispatch(), this.scanIntervalMs);
    log.info(`🔍 OpportunityDetector démarré (intervalle: ${Math.round(this.scanIntervalMs / 60000)}min)`);
  }

  /**
   * Arrête le scan périodique.
   */
  stop(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
  }

  /**
   * Enregistre un handler appelé avec chaque batch d'opportunités.
   */
  onOpportunities(handler: OpportunityHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  // ─── Scan ─────────────────────────────────────────────────────────────────

  /**
   * Lance un scan complet et dispatch les opportunités trouvées.
   */
  async scanAndDispatch(root?: string): Promise<Opportunity[]> {
    const workspaceRoot = root ?? SELF_ROOT;
    log.debug(`🔍 Scan d'opportunités sur ${workspaceRoot}…`);

    try {
      const opportunities = await this.scan(workspaceRoot);
      this.lastScanAt = Date.now();

      if (opportunities.length > 0) {
        log.info(`🔍 ${opportunities.length} opportunité(s) détectée(s)`);
        this._dispatch(opportunities);
      }

      return opportunities;
    } catch (err) {
      log.error(`Scan échoué: ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * Scanne le workspace et retourne les opportunités détectées.
   */
  async scan(root: string): Promise<Opportunity[]> {
    const opportunities: Opportunity[] = [];
    const now = new Date().toISOString();

    // Collecter tous les fichiers sources
    const sourceFiles: string[] = [];
    this._collectFiles(root, sourceFiles);

    if (sourceFiles.length === 0) {
      return [];
    }

    // ── Détecteurs parallèles ────────────────────────────────────────────
    const [
      techDebt,
      missingTests,
      missingDoc,
      securityIssues,
      staleDeps,
    ] = await Promise.all([
      this._detectTechDebt(sourceFiles, root, now),
      this._detectMissingTests(sourceFiles, root, now),
      this._detectMissingDocumentation(root, now),
      this._detectSecurityIssues(sourceFiles, now),
      this._detectStaleDependencies(root, now),
    ]);

    opportunities.push(...techDebt, ...missingTests, ...missingDoc, ...securityIssues, ...staleDeps);

    // Trier par score décroissant
    return opportunities.sort((a, b) => b.score - a.score);
  }

  // ─── Détecteurs ──────────────────────────────────────────────────────────

  private async _detectTechDebt(
    files: string[],
    _root: string,
    now: string
  ): Promise<Opportunity[]> {
    const DEBT_PATTERN = /\/\/\s*(TODO|FIXME|HACK|XXX|BUG|TEMP)\b[:\s]*(.*)/gi;
    const debtByFile: Map<string, { type: string; comment: string }[]> = new Map();

    for (const file of files) {
      try {
        const stat = fs.statSync(file);
        if (stat.size > MAX_FILE_SIZE) continue;

        const content = fs.readFileSync(file, "utf-8");
        const matches: { type: string; comment: string }[] = [];
        let m: RegExpExecArray | null;

        const re = new RegExp(DEBT_PATTERN.source, "gi");
        while ((m = re.exec(content)) !== null) {
          matches.push({ type: m[1].toUpperCase(), comment: (m[2] ?? "").trim().slice(0, 100) });
        }

        if (matches.length > 0) {
          debtByFile.set(file, matches);
        }
      } catch { /* fichier inaccessible */ }
    }

    const totalDebt = Array.from(debtByFile.values()).reduce((sum, arr) => sum + arr.length, 0);
    if (totalDebt === 0) return [];

    const topFiles = Array.from(debtByFile.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 5)
      .map(([f]) => path.relative(SELF_ROOT, f).replace(/\\/g, "/"));

    return [
      {
        id: randomUUID(),
        type: "tech_debt" as OpportunityType,
        title: `${totalDebt} marker(s) de dette technique détectés`,
        description:
          `${totalDebt} TODO/FIXME/HACK dans ${debtByFile.size} fichier(s). ` +
          `Top fichiers: ${topFiles.slice(0, 3).join(", ")}`,
        files: topFiles,
        score: Math.min(1, totalDebt / 50),
        estimatedEffort: totalDebt > 30 ? "high" : totalDebt > 10 ? "medium" : "low",
        detectedAt: now,
      },
    ];
  }

  private async _detectMissingTests(
    files: string[],
    root: string,
    now: string
  ): Promise<Opportunity[]> {
    // Fichiers source sans test correspondant
    const sourceWithoutTest: string[] = [];

    for (const file of files) {
      const rel = path.relative(root, file).replace(/\\/g, "/");

      // Ignorer les fichiers de test eux-mêmes et les types
      if (
        rel.includes(".test.") ||
        rel.includes(".spec.") ||
        rel.includes("__tests__") ||
        rel.includes(".d.ts") ||
        rel.includes("/types")
      ) continue;

      // Chercher le fichier de test correspondant
      const withoutExt = file.replace(/\.[^.]+$/, "");
      const testVariants = [
        `${withoutExt}.test.ts`,
        `${withoutExt}.spec.ts`,
        `${withoutExt}.test.tsx`,
        `${withoutExt}.spec.tsx`,
        file.replace("/src/", "/__tests__/").replace(/\.ts$/, ".test.ts"),
      ];

      const hasTest = testVariants.some((v) => fs.existsSync(v));
      if (!hasTest) {
        sourceWithoutTest.push(path.relative(root, file).replace(/\\/g, "/"));
      }
    }

    if (sourceWithoutTest.length === 0) return [];

    // Ne signaler que si un ratio significatif est sans tests
    const ratio = sourceWithoutTest.length / Math.max(1, files.length);
    if (ratio < 0.3) return []; // < 30% → pas urgent

    return [
      {
        id: randomUUID(),
        type: "missing_test" as OpportunityType,
        title: `${sourceWithoutTest.length} fichier(s) source sans test`,
        description: `${sourceWithoutTest.length}/${files.length} fichiers sources (${(ratio * 100).toFixed(0)}%) n'ont pas de test correspondant.`,
        files: sourceWithoutTest.slice(0, 10),
        score: Math.min(0.8, ratio),
        estimatedEffort: sourceWithoutTest.length > 20 ? "high" : sourceWithoutTest.length > 5 ? "medium" : "low",
        detectedAt: now,
      },
    ];
  }

  private async _detectMissingDocumentation(
    root: string,
    now: string
  ): Promise<Opportunity[]> {
    const opportunities: Opportunity[] = [];

    const readme = path.join(root, "README.md");
    if (!fs.existsSync(readme)) {
      opportunities.push({
        id: randomUUID(),
        type: "missing_doc" as OpportunityType,
        title: "README.md manquant",
        description: "Le projet n'a pas de README.md",
        files: [],
        score: 0.6,
        estimatedEffort: "low",
        detectedAt: now,
      });
    } else {
      const content = fs.readFileSync(readme, "utf-8");
      if (content.trim().length < 300) {
        opportunities.push({
          id: randomUUID(),
          type: "missing_doc" as OpportunityType,
          title: "README.md insuffisant",
          description: `README.md trop court (${content.trim().length} caractères)`,
          files: ["README.md"],
          score: 0.3,
          estimatedEffort: "low",
          detectedAt: now,
        });
      }
    }

    return opportunities;
  }

  private async _detectSecurityIssues(
    files: string[],
    now: string
  ): Promise<Opportunity[]> {
    const issues: { file: string; issue: string }[] = [];

    // Patterns de sécurité évidents dans le code
    const SECURITY_PATTERNS: { pattern: RegExp; issue: string }[] = [
      { pattern: /eval\s*\(/g, issue: "Utilisation d'eval()" },
      { pattern: /innerHTML\s*=/g, issue: "Affectation directe à innerHTML (XSS)" },
      { pattern: /dangerouslySetInnerHTML/g, issue: "dangerouslySetInnerHTML (React XSS)" },
      { pattern: /process\.env\.[A-Z_]+\s*(?!&&|\?\?)/, issue: "Variable d'env sans fallback sécurisé" },
      { pattern: /console\.log\([^)]*(?:password|token|secret|key)/gi, issue: "Log de credentials potentiel" },
      { pattern: /['"`]https?:\/\/[^'"` ]+['"`]\s*\+/, issue: "Concaténation d'URL (injection potentielle)" },
    ];

    for (const file of files.slice(0, 200)) { // Limiter à 200 fichiers
      try {
        const stat = fs.statSync(file);
        if (stat.size > MAX_FILE_SIZE) continue;

        const content = fs.readFileSync(file, "utf-8");
        const rel = path.relative(SELF_ROOT, file).replace(/\\/g, "/");

        for (const { pattern, issue } of SECURITY_PATTERNS) {
          if (pattern.test(content)) {
            issues.push({ file: rel, issue });
            break; // Un seul issue par fichier pour éviter le bruit
          }
          // Reset lastIndex pour les regex globales
          pattern.lastIndex = 0;
        }
      } catch { /* skip */ }
    }

    if (issues.length === 0) return [];

    return [
      {
        id: randomUUID(),
        type: "security_issue" as OpportunityType,
        title: `${issues.length} problème(s) de sécurité potentiels`,
        description: issues.slice(0, 3).map((i) => `${i.file}: ${i.issue}`).join("; "),
        files: issues.map((i) => i.file).slice(0, 10),
        score: Math.min(1, 0.5 + issues.length * 0.1),
        estimatedEffort: "medium",
        detectedAt: now,
      },
    ];
  }

  private async _detectStaleDependencies(
    root: string,
    now: string
  ): Promise<Opportunity[]> {
    const pkgPath = path.join(root, "package.json");
    if (!fs.existsSync(pkgPath)) return [];

    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      const staleDeps: string[] = [];

      // Vérifier les dépendances avec des versions very old (heuristique sur le semver)
      for (const [name, version] of Object.entries(deps as Record<string, string>)) {
        // Détecter les majors très vieux — heuristique simple
        const match = String(version).match(/^[\^~]?(\d+)\./);
        if (match) {
          const major = parseInt(match[1], 10);
          // Packages connus pour avoir des versions bien plus récentes
          const KNOWN_OLD: Record<string, number> = {
            "react": 18, "react-dom": 18, "typescript": 5,
            "vite": 5, "express": 4, "next": 14,
          };
          if (KNOWN_OLD[name] && major < KNOWN_OLD[name] - 1) {
            staleDeps.push(`${name}@${version} (actuel: v${KNOWN_OLD[name]})`);
          }
        }
      }

      if (staleDeps.length === 0) return [];

      return [
        {
          id: randomUUID(),
          type: "stale_dependency" as OpportunityType,
          title: `${staleDeps.length} dépendance(s) potentiellement obsolète(s)`,
          description: `Versions possiblement dépassées: ${staleDeps.slice(0, 5).join(", ")}`,
          files: ["package.json"],
          score: Math.min(0.7, 0.3 + staleDeps.length * 0.1),
          estimatedEffort: "medium",
          detectedAt: now,
        },
      ];
    } catch {
      return [];
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private _collectFiles(dir: string, result: string[], depth = 0): void {
    if (depth > 5) return;
    if (!fs.existsSync(dir)) return;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (IGNORED_DIRS.has(entry.name)) continue;

        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          this._collectFiles(fullPath, result, depth + 1);
        } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
          result.push(fullPath);
        }
      }
    } catch { /* dossier non accessible */ }
  }

  private _dispatch(opportunities: Opportunity[]): void {
    for (const handler of this.handlers) {
      try {
        const result = handler(opportunities);
        if (result instanceof Promise) {
          result.catch((err) => log.error(`Handler opportunities: ${err.message}`));
        }
      } catch (err) {
        log.error(`Handler opportunities sync: ${(err as Error).message}`);
      }
    }
  }

  getStats() {
    return {
      running: this.scanTimer !== null,
      lastScanAt: this.lastScanAt,
      scanIntervalMs: this.scanIntervalMs,
    };
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

/** Instance singleton partagée de l'OpportunityDetector. */
export const opportunityDetector = new OpportunityDetector();
