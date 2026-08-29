/**
 * ProjectIndexer — Indexeur intelligent du projet
 *
 * Responsabilité unique : scanner tous les fichiers du projet,
 * extraire les entités de code (classes, fonctions, interfaces, etc.),
 * et alimenter le KnowledgeGraph.
 *
 * Utilise les parsers disponibles (extractFileOutline depuis codebaseHelpers)
 * pour une extraction légère et rapide, sans dépendance à un parser TypeScript complet.
 *
 * Architecture :
 *   ProjectIndexer.scanAll()
 *     ├── walkDirectory() → liste tous les fichiers
 *     ├── parseFile() → pour chaque fichier, extrait les entités
 *     └── knowledgeGraph.update() → alimente le graphe
 *
 *   ProjectIndexer.watchFile(filePath)
 *     └── parseFile() → knowledgeGraph.updateFile()
 */

import fs from "fs";
import path from "path";
import { SELF_ROOT } from "../utils/selfRoot.js";
import { createLogger } from "../utils/logger.js";
import { knowledgeGraph } from "./KnowledgeGraph.js";
import type { CodeEntity, FileNode } from "./types.js";
import { extractFileOutline } from "../skills/codebaseHelpers.js";
import type { OutlineEntry } from "../skills/codebaseHelpers.js";
import { isSandboxActive, getSandboxRoot } from "../utils/sandbox.js";
import { fileWatcher } from "./FileWatcher.js";
import type { FileChangeEvent } from "./FileWatcher.js";
import { relationExtractor } from "./RelationExtractor.js";

const log = createLogger("ProjectIndexer");

// ─── Configuration ──────────────────────────────────────────────────────────

/** Répertoires exclus du scan */
const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "release",
  "coverage",
  ".vscode",
  ".idea",
  ".Leanna",
  "assets",
  "public",
]);

/** Fichiers exclus du scan */
const EXCLUDED_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  ".DS_Store",
  "thumbs.db",
  ".gitignore",
  ".env",
  ".env.local",
  ".gemini-keys.json",
  ".npmrc",
  // Fichiers de persistance du Knowledge System — exclus pour éviter l'auto-indexation
  // (sinon le scan crée des copies parasites de 1-2 MB dans server/knowledge/)
  "ProjectKnowledge.json",
  "ProjectMemory.json",
]);

/** Extensions de fichiers analysables */
const ANALYZABLE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".css",
  ".scss",
  ".html",
]);

/** Taille maximale d'un fichier pour l'analyse (500 KB) */
const MAX_FILE_SIZE = 500_000;

// ═══════════════════════════════════════════════════════════════════════════════
// ProjectIndexer
// ═══════════════════════════════════════════════════════════════════════════════

export class ProjectIndexer {
  private customProjectRoot?: string;

  constructor(projectRoot?: string) {
    this.customProjectRoot = projectRoot;
  }

  /**
   * Retourne la racine du workspace ACTIF : sandbox si le mode est activé,
   * sinon la racine configurée (SELF_ROOT par défaut).
   */
  protected getActiveProjectRoot(): string {
    if (isSandboxActive()) {
      return getSandboxRoot();
    }
    return this.customProjectRoot || SELF_ROOT;
  }

  // ─── Scan complet ─────────────────────────────────────────────────────────

  /**
   * Scanne tous les fichiers du projet et met à jour le KnowledgeGraph.
   * C'est la méthode principale à appeler au démarrage.
   */
  async scanAll(): Promise<{
    totalFiles: number;
    totalEntities: number;
    durationMs: number;
  }> {
    const startTime = Date.now();
    const root = this.getActiveProjectRoot();
    log.info(`🔍 Scan complet du projet (root: ${root})...`);

    // 1. Lister tous les fichiers
    const files: string[] = [];
    await this.walkDirectory(root, files, root);
    log.info(`📋 ${files.length} fichiers trouvés`);

    // 2. Parser chaque fichier
    const parsedFiles: FileNode[] = [];
    let totalEntities = 0;

    for (const relativePath of files) {
      try {
        const fileNode = await this.parseFile(relativePath);
        if (fileNode) {
          parsedFiles.push(fileNode);
          totalEntities += fileNode.entities.length;
        }
      } catch (err) {
        log.debug(`⚠️ Échec parsing: ${relativePath} — ${(err as Error).message}`);
      }
    }

    // 3. Alimenter le KnowledgeGraph
    knowledgeGraph.update(parsedFiles);

    // 4. Extraire les relations sémantiques entre entités
    const allRelations = this.extractAllRelations(parsedFiles, root);
    knowledgeGraph.setRelations(allRelations);
    knowledgeGraph.save();

    const durationMs = Date.now() - startTime;
    log.info(`✅ Scan terminé: ${parsedFiles.length} fichiers, ${totalEntities} entités, ${allRelations.length} relations (${(durationMs / 1000).toFixed(1)}s)`);

    return {
      totalFiles: parsedFiles.length,
      totalEntities,
      durationMs,
    };
  }

  /**
   * Scanne un seul fichier et met à jour le KnowledgeGraph.
   * Utile après une modification de fichier.
   */
  async scanFile(relativePath: string): Promise<FileNode | null> {
    try {
      const fileNode = await this.parseFile(relativePath);
      if (fileNode) {
        knowledgeGraph.updateFile(fileNode);
        this.refreshSemanticRelations();
        return fileNode;
      }
    } catch (err) {
      log.warn(`⚠️ Échec scan fichier: ${relativePath} — ${(err as Error).message}`);
    }
    return null;
  }

  /**
   * Supprime un fichier du KnowledgeGraph.
   */
  removeFile(relativePath: string): void {
    knowledgeGraph.removeFile(relativePath);
    this.refreshSemanticRelations();
  }

  // ─── Parsing d'un fichier ─────────────────────────────────────────────────

  /**
   * Parse un fichier et retourne un FileNode avec ses entités extraites.
   */
  private async parseFile(relativePath: string): Promise<FileNode | null> {
    const absolutePath = path.join(this.getActiveProjectRoot(), relativePath);

    // Vérifier que le fichier existe
    if (!fs.existsSync(absolutePath)) return null;

    const stats = fs.statSync(absolutePath);
    if (!stats.isFile()) return null;

    // Ignorer les fichiers trop volumineux
    if (stats.size > MAX_FILE_SIZE) {
      log.debug(`⏭️ Fichier trop volumineux: ${relativePath} (${stats.size} octets)`);
      return null;
    }

    const ext = path.extname(relativePath).toLowerCase();
    const name = path.basename(relativePath);

    // Lire le contenu
    let content: string;
    try {
      content = fs.readFileSync(absolutePath, "utf-8");
    } catch {
      return null; // Fichier binaire ou illisible
    }

    const lines = content.split(/\r?\n/);

    // Extraire les entités selon le type de fichier
    const entities = this.extractEntities(relativePath, content, lines, ext);

    // Extraire les imports et exports
    const { imports, exports } = this.extractImportsExports(content, lines, ext);

    return {
      path: relativePath,
      name,
      extension: ext || ".txt",
      size: stats.size,
      lines: lines.length,
      lastModified: stats.mtime.toISOString(),
      entities,
      imports,
      exports,
      language: this.detectLanguage(ext),
    };
  }

  // ─── Extraction d'entités ─────────────────────────────────────────────────

  /**
   * Extrait les entités de code d'un fichier.
   * Utilise extractFileOutline pour le parsing (déjà existant dans codebaseHelpers).
   */
  private extractEntities(
    relativePath: string,
    content: string,
    lines: string[],
    ext: string
  ): CodeEntity[] {
    const entities: CodeEntity[] = [];

    // Utiliser extractFileOutline pour les fichiers TypeScript/JavaScript
    if (/^\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(ext)) {
      const outline = extractFileOutline(lines, ext);

      for (const entry of outline) {
        // Déterminer le type CodeEntityType depuis OutlineEntry
        const entityType = this.mapOutlineType(entry.type);
        const signature = entry.signature || lines[entry.line - 1]?.trimStart().slice(0, 200);

        // Détecter les modificateurs
        const modifiers: string[] = [];
        if (entry.type === "export" || this.isExportLine(lines[entry.line - 1])) {
          modifiers.push("export");
        }
        if (entry.type === "import") {
          modifiers.push("import");
        }
        if (
          entry.type === "function" &&
          lines[entry.line - 1]?.trimStart().startsWith("async")
        ) {
          modifiers.push("async");
        }

        // Extraire la description JSDoc si présente
        const description = this.extractJsDoc(lines, entry.line);

        // Extraire les dépendances (imports)
        const dependencies: string[] = [];
        if (entry.type === "import") {
          const importMatch = lines[entry.line - 1]?.match(/from\s+['"](.+)['"]/);
          if (importMatch) {
            dependencies.push(importMatch[1]);
          }
        }

        const entity: CodeEntity = {
          name: entry.name,
          type: entityType,
          filePath: relativePath,
          lineStart: entry.line,
          lineEnd: entry.endLine,
          signature,
          modifiers: modifiers.length > 0 ? modifiers : undefined,
          description: description || undefined,
          dependencies: dependencies.length > 0 ? dependencies : undefined,
        };

        entities.push(entity);
      }

      // ── Extraction des routes/endpoints API ────────────────────────────────
      entities.push(...this.extractRouteEntities(relativePath, lines));

      // ── Extraction des variables d'environnement ───────────────────────────
      entities.push(...this.extractEnvVarEntities(relativePath, lines));

      // ── Extraction des tables de base de données ───────────────────────────
      entities.push(...this.extractDbTableEntities(relativePath, lines));

      // ── Extraction des cas de test ─────────────────────────────────────────
      entities.push(...this.extractTestEntities(relativePath, lines));

      // ── Extraction des symboles importés et exportés ───────────────────────
      entities.push(...this.extractSymbolEntities(relativePath, lines));
    }

    // Pour les fichiers Markdown : extraire les titres comme "entités"
    if (ext === ".md") {
      for (let i = 0; i < lines.length; i++) {
        const headingMatch = lines[i].match(/^(#{1,3})\s+(.+)/);
        if (headingMatch) {
          entities.push({
            name: headingMatch[2].trim(),
            type: "export",
            filePath: relativePath,
            lineStart: i + 1,
            signature: lines[i].trim().slice(0, 200),
          });
        }
      }
    }

    // Pour les fichiers JSON : extraire les clés racines
    if (ext === ".json") {
      try {
        const parsed = JSON.parse(content);
        this.extractJsonKeys(parsed, relativePath, entities, "");
      } catch {
        // Ignorer les JSON invalides
      }
    }

    return entities;
  }

  /**
   * Extrait les imports et exports d'un fichier.
   */
  private extractImportsExports(
    _content: string,
    lines: string[],
    ext: string
  ): { imports: string[]; exports: string[] } {
    const imports: string[] = [];
    const exports: string[] = [];

    if (!/^\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(ext)) {
      return { imports, exports };
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Imports et réexports ES modules (default, named et combinaisons)
      const staticImport = line.match(/^(?:import|export)\b.*?\s+from\s+['"]([^'"]+)['"]/);
      if (staticImport) {
        imports.push(staticImport[1]);
      }

      // Imports sans binding : import "./polyfill.js"
      const sideEffectImport = line.match(/^import\s+['"]([^'"]+)['"]/);
      if (sideEffectImport) {
        imports.push(sideEffectImport[1]);
      }

      // Imports CommonJS
      const requireImport = line.match(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/);
      if (requireImport) {
        imports.push(requireImport[1]);
      }

      // Dynamic imports
      const dynamicImport = line.match(/import\(['"]([^'"]+)['"]\)/);
      if (dynamicImport) {
        imports.push(dynamicImport[1]);
      }

      // Exports named
      const exportMatch = line.match(
        /^export\s+(?:default\s+)?(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/
      );
      if (exportMatch) {
        exports.push(exportMatch[1]);
      }

      // Export { ... }
      const exportBrace = line.match(/^export\s+\{([^}]+)\}/);
      if (exportBrace) {
        const names = exportBrace[1]
          .split(",")
          .map((n) => n.trim().split(/\s+as\s+/)[0])
          .filter(Boolean);
        exports.push(...names);
      }

      // Export * from
      const exportStar = line.match(/^export\s+\*\s+from\s+['"]([^'"]+)['"]/);
      if (exportStar) {
        exports.push(`* from ${exportStar[1]}`);
      }

      // Export default
      if (/^export\s+default\s+/.test(line) && !exportMatch) {
        const defaultMatch = line.match(/^export\s+default\s+(function|class)\s+(\w+)/);
        if (defaultMatch) {
          exports.push(`default:${defaultMatch[2]}`);
        } else {
          exports.push("default");
        }
      }
    }

    return { imports: [...new Set(imports)], exports: [...new Set(exports)] };
  }

  // ─── Entités structurelles ─────────────────────────────────────────────────

  /** Extrait les endpoints Express définis par le fichier. */
  private extractRouteEntities(filePath: string, lines: string[]): CodeEntity[] {
    const entities: CodeEntity[] = [];
    const seen = new Set<string>();
    const routePattern = /\b(?:app|router)\.(get|post|put|delete|patch|all)\s*\(\s*['"`]([^'"`]+)['"`]/i;

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(routePattern);
      if (!match) continue;

      const method = match[1].toUpperCase();
      const routePath = match[2];
      const name = `${method} ${routePath}`;
      if (seen.has(name)) continue;
      seen.add(name);

      entities.push({
        name,
        type: "route",
        filePath,
        lineStart: i + 1,
        signature: lines[i].trim().slice(0, 200),
        metadata: { framework: "express", method, path: routePath },
      });
    }

    return entities;
  }

  /** Extrait les accès Node/Vite à des variables d'environnement, sans leur valeur. */
  private extractEnvVarEntities(filePath: string, lines: string[]): CodeEntity[] {
    const entities: CodeEntity[] = [];
    const seen = new Set<string>();
    const patterns: { regex: RegExp; runtime: "node" | "vite" }[] = [
      { regex: /process\.env\.([A-Z_][A-Z0-9_]*)/g, runtime: "node" },
      { regex: /process\.env\[['"]([A-Z_][A-Z0-9_]*)['"]\]/g, runtime: "node" },
      { regex: /import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g, runtime: "vite" },
    ];

    for (let i = 0; i < lines.length; i++) {
      for (const { regex, runtime } of patterns) {
        regex.lastIndex = 0;
        for (const match of lines[i].matchAll(regex)) {
          const name = match[1];
          if (seen.has(name)) continue;
          seen.add(name);
          entities.push({
            name,
            type: "env_var",
            filePath,
            lineStart: i + 1,
            signature: lines[i].trim().slice(0, 200),
            metadata: { runtime },
          });
        }
      }
    }

    return entities;
  }

  /** Extrait les tables SQL/Supabase référencées et leur mode d'accès. */
  private extractDbTableEntities(filePath: string, lines: string[]): CodeEntity[] {
    const tables = new Map<string, { line: number; access: Set<"read" | "write" | "schema"> }>();
    const addTable = (name: string, line: number, access: "read" | "write" | "schema") => {
      const current = tables.get(name) ?? { line, access: new Set<"read" | "write" | "schema">() };
      current.access.add(access);
      tables.set(name, current);
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const supabase = line.match(/\.from\s*\(\s*['"`]([a-z_][a-z0-9_]*)['"`]\s*\)/i);
      if (supabase) {
        const isWrite = /\.(?:insert|update|upsert|delete)\s*\(/.test(`${line}\n${lines[i + 1] ?? ""}`);
        addTable(supabase[1], i + 1, isWrite ? "write" : "read");
      }

      const create = line.match(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
      if (create) addTable(create[1], i + 1, "schema");

      const select = line.match(/\bSELECT\b.*\bFROM\s+(\w+)/i);
      if (select) addTable(select[1], i + 1, "read");

      const insert = line.match(/\bINSERT\s+INTO\s+(\w+)/i);
      if (insert) addTable(insert[1], i + 1, "write");

      const update = line.match(/\bUPDATE\s+(\w+)\s+SET\b/i);
      if (update) addTable(update[1], i + 1, "write");

      const deleteFrom = line.match(/\bDELETE\s+FROM\s+(\w+)/i);
      if (deleteFrom) addTable(deleteFrom[1], i + 1, "write");
    }

    return [...tables.entries()].map(([name, { line, access }]) => ({
      name,
      type: "db_table" as const,
      filePath,
      lineStart: line,
      signature: `Database table ${name}`,
      metadata: { access: [...access].sort() },
    }));
  }

  /** Extrait les suites et cas de test déclarés avec describe, it ou test. */
  private extractTestEntities(filePath: string, lines: string[]): CodeEntity[] {
    if (!/\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(filePath) && !/(?:^|\/)tests?\//i.test(filePath)) {
      return [];
    }

    const entities: CodeEntity[] = [];
    const seen = new Set<string>();
    const testPattern = /\b(describe|it|test)\s*\(\s*['"`]([^'"`]+)['"`]/;
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(testPattern);
      if (!match) continue;
      const [, kind, label] = match;
      const name = `${kind}: ${label}`;
      if (seen.has(name)) continue;
      seen.add(name);
      entities.push({
        name,
        type: "test",
        filePath,
        lineStart: i + 1,
        signature: lines[i].trim().slice(0, 200),
        metadata: { kind },
      });
    }
    return entities;
  }

  /** Extrait des symboles nommés importés ou exportés, avec leur module d'origine. */
  private extractSymbolEntities(filePath: string, lines: string[]): CodeEntity[] {
    const entities: CodeEntity[] = [];
    const seen = new Set<string>();
    const addSymbol = (
      name: string,
      line: number,
      direction: "import" | "export",
      source?: string,
      exportedAs?: string
    ) => {
      const key = `${direction}:${name}:${source ?? ""}:${exportedAs ?? ""}`;
      if (!name || seen.has(key)) return;
      seen.add(key);
      entities.push({
        name,
        type: "symbol",
        filePath,
        lineStart: line,
        signature: `${direction} ${name}${source ? ` from ${source}` : ""}`,
        modifiers: [direction],
        metadata: { direction, source, exportedAs },
      });
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const namedImport = line.match(/^\s*import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/);
      if (namedImport) {
        for (const binding of namedImport[1].split(",")) {
          const [original, local = original] = binding.trim().split(/\s+as\s+/);
          addSymbol(local.trim(), i + 1, "import", namedImport[2], original.trim());
        }
      }

      const defaultImport = line.match(/^\s*import\s+(?:type\s+)?([A-Za-z_$][\w$]*)\s*(?:,\s*[^;]+)?\s+from\s+['"]([^'"]+)['"]/);
      if (defaultImport) addSymbol(defaultImport[1], i + 1, "import", defaultImport[2], "default");

      const declarationExport = line.match(/^\s*export\s+(?:default\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/);
      if (declarationExport) addSymbol(declarationExport[1], i + 1, "export");

      const namedExport = line.match(/^\s*export\s+\{([^}]+)\}(?:\s+from\s+['"]([^'"]+)['"])?/);
      if (namedExport) {
        for (const binding of namedExport[1].split(",")) {
          const [original, exported = original] = binding.trim().split(/\s+as\s+/);
          addSymbol(exported.trim(), i + 1, "export", namedExport[2], original.trim());
        }
      }
    }

    return entities;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Marche récursive dans le répertoire pour lister tous les fichiers.
   * @param baseRoot Racine de base utilisée pour calculer les chemins relatifs
   *                 (doit être la même racine qu'avec laquelle le walk a été démarré,
   *                  typiquement getActiveProjectRoot()).
   */
  private async walkDirectory(dir: string, files: string[], baseRoot: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      // Ignorer les répertoires exclus
      if (EXCLUDED_DIRS.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseRoot, fullPath).replace(/\\/g, "/");

      if (entry.isDirectory()) {
        await this.walkDirectory(fullPath, files, baseRoot);
      } else if (entry.isFile()) {
        // Ignorer les fichiers exclus
        if (EXCLUDED_FILES.has(entry.name)) continue;

        const ext = path.extname(entry.name).toLowerCase();
        // Ignorer les extensions non analysables
        if (!ANALYZABLE_EXTENSIONS.has(ext)) continue;

        files.push(relativePath);
      }
    }
  }

  /**
   * Mappe le type OutlineEntry vers CodeEntityType.
   */
  private mapOutlineType(outlineType: OutlineEntry["type"]): CodeEntity["type"] {
    const mapping: Record<string, CodeEntity["type"]> = {
      function: "function",
      class: "class",
      interface: "interface",
      type: "type",
      export: "export",
      import: "import",
      variable: "variable",
      method: "method",
      component: "component",
    };
    return mapping[outlineType] || "export";
  }

  /**
   * Détecte si une ligne est un export.
   */
  private isExportLine(line: string | undefined): boolean {
    if (!line) return false;
    return line.trimStart().startsWith("export ");
  }

  /**
   * Extrait la description JSDoc au-dessus d'une ligne donnée.
   */
  private extractJsDoc(lines: string[], lineNumber: number): string | null {
    const jsDocLines: string[] = [];
    let i = lineNumber - 2; // ligne avant l'entité

    // Remonter les lignes de commentaires
    while (i >= 0) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith("*") || trimmed.startsWith("/**")) {
        jsDocLines.unshift(trimmed);
      } else if (trimmed.startsWith("//")) {
        jsDocLines.unshift(trimmed);
      } else if (trimmed === "") {
        // Ligne vide — continue (peut-être un padding)
      } else {
        break; // Ligne de code ou autre
      }
      i--;
    }

    if (jsDocLines.length === 0) return null;

    // Nettoyer les marqueurs JSDoc
    return jsDocLines
      .map((l) => l.replace(/^\/\*\*?\s*/, "").replace(/^\s*\*\s?/, "").replace(/\s*\*\/$/, "").trim())
      .filter(Boolean)
      .join(" ")
      .slice(0, 500);
  }

  /**
   * Extrait les clés d'un objet JSON comme entités.
   */
  private extractJsonKeys(
    obj: any,
    filePath: string,
    entities: CodeEntity[],
    prefix: string
  ): void {
    if (typeof obj !== "object" || obj === null) return;

    for (const [key, value] of Object.entries(obj)) {
      const fullName = prefix ? `${prefix}.${key}` : key;

      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        entities.push({
          name: fullName,
          type: "constant",
          filePath,
          lineStart: 0,
          signature: `{ ${Object.keys(value).join(", ")} }`,
        });
        // Ne pas récurser pour les gros objets
        if (Object.keys(value).length < 20) {
          this.extractJsonKeys(value, filePath, entities, fullName);
        }
      } else {
        const valueStr =
          typeof value === "string"
            ? `"${value.slice(0, 50)}"`
            : JSON.stringify(value);
        entities.push({
          name: fullName,
          type: "constant",
          filePath,
          lineStart: 0,
          signature: `${key}: ${valueStr}`,
        });
      }
    }
  }

  /**
   * Détecte le langage d'un fichier à partir de son extension.
   */
  private detectLanguage(
    ext: string
  ): FileNode["language"] {
    switch (ext) {
      case ".ts":
      case ".tsx":
        return "typescript";
      case ".js":
      case ".jsx":
      case ".mjs":
      case ".cjs":
        return "javascript";
      case ".json":
        return "json";
      case ".md":
        return "markdown";
      case ".css":
      case ".scss":
        return "css";
      case ".html":
        return "html";
      default:
        return "other";
    }
  }

  // ─── Extraction de relations ────────────────────────────────────────────────

  /**
   * Reconstruit les relations sur l'état courant après une indexation incrémentale.
   * Les relations (tests, appels, tables et imports) pouvant traverser les fichiers,
   * une reconstruction globale garantit l'absence de liens périmés.
   */
  private refreshSemanticRelations(): number {
    const relations = this.extractAllRelations(
      knowledgeGraph.getAllFiles(),
      this.getActiveProjectRoot()
    );
    knowledgeGraph.setRelations(relations);
    knowledgeGraph.save();
    return relations.length;
  }

  /**
   * Extrait toutes les relations sémantiques de tous les fichiers parsés.
   */
  private extractAllRelations(parsedFiles: FileNode[], root: string): import("./types").EntityRelation[] {
    const allFiles: Record<string, FileNode> = {};
    for (const f of parsedFiles) allFiles[f.path] = f;

    const allRelations: import("./types").EntityRelation[] = [];

    for (const fileNode of parsedFiles) {
      // Ne traiter que les fichiers TypeScript/JavaScript
      if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(fileNode.extension)) continue;

      try {
        const absPath = path.join(root, fileNode.path);
        if (!fs.existsSync(absPath)) continue;
        const content = fs.readFileSync(absPath, "utf-8");
        const relations = relationExtractor.extractRelations(fileNode, content, allFiles);
        allRelations.push(...relations);
      } catch {
        // Ignorer les erreurs de lecture
      }
    }

    log.info(`🔗 Relations extraites: ${allRelations.length} (extends: ${allRelations.filter(r => r.relationType === "extends").length}, implements: ${allRelations.filter(r => r.relationType === "implements").length}, composes: ${allRelations.filter(r => r.relationType === "composes").length}, tests: ${allRelations.filter(r => r.relationType === "tests").length})`);
    return allRelations;
  }

  // ─── File Watcher Integration ─────────────────────────────────────────────

  /**
   * Démarre la surveillance des fichiers pour indexation incrémentale.
   * Chaque modification de fichier déclenche un re-scan individuel (~5-50ms).
   * 
   * Appeler après le premier scanAll() pour maintenir le graphe à jour.
   */
  startWatching(): boolean {
    const started = fileWatcher.start();
    if (!started) return false;

    fileWatcher.onChange(async (events: FileChangeEvent[]) => {
      await this.handleFileChanges(events);
    });

    log.info("👁️ Indexation incrémentale activée via FileWatcher");
    return true;
  }

  /**
   * Arrête la surveillance des fichiers.
   */
  stopWatching(): void {
    fileWatcher.stop();
    log.info("🛑 Indexation incrémentale désactivée");
  }

  /**
   * Gère un batch de changements de fichiers.
   */
  private async handleFileChanges(events: FileChangeEvent[]): Promise<void> {
    const t0 = Date.now();
    let indexed = 0;
    let removed = 0;
    let errors = 0;

    for (const event of events) {
      try {
        if (event.type === "deleted") {
          knowledgeGraph.removeFile(event.relativePath);
          removed++;
        } else {
          // "created" ou "modified" → re-parse le fichier
          const fileNode = await this.parseFile(event.relativePath);
          if (fileNode) {
            knowledgeGraph.updateFile(fileNode);
            indexed++;
          }
        }
      } catch (err) {
        log.debug(`⚠️ Erreur indexation incrémentale: ${event.relativePath} — ${(err as Error).message}`);
        errors++;
      }
    }

    if (indexed > 0 || removed > 0) {
      const relationCount = this.refreshSemanticRelations();
      const duration = Date.now() - t0;
      log.info(`⚡ Indexation incrémentale: +${indexed} ré-indexé(s), -${removed} supprimé(s), ${relationCount} relations${errors > 0 ? `, ${errors} erreur(s)` : ""} (${duration}ms)`);
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

/** Instance singleton partagée du ProjectIndexer */
export const projectIndexer = new ProjectIndexer();
