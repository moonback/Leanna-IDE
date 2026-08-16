/**
 * ProjectIndexer — Indexeur intelligent du projet
 *
 * Responsabilité unique : scanner tous les fichiers du projet,
 * extraire les entités (sections de documents, titres Markdown, métadonnées,
 * tâches, blocs de code, liens) et alimenter le KnowledgeGraph.
 *
 * Orientation : documents structurés (Markdown, texte, YAML, CSV, RST)
 * en plus des fichiers de code (TypeScript/JavaScript).
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
import { SELF_ROOT } from "../utils/selfRoot";
import { createLogger } from "../utils/logger";
import { knowledgeGraph } from "./KnowledgeGraph";
import type { CodeEntity, FileNode } from "./types";
import { isSandboxActive, getSandboxRoot } from "../utils/sandbox";
import { fileWatcher } from "./FileWatcher";
import type { FileChangeEvent } from "./FileWatcher";
import { relationExtractor } from "./RelationExtractor";

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
  ".jarvis",
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

/** Extensions de fichiers documentaires analysables */
const ANALYZABLE_EXTENSIONS = new Set([
  ".md",
  ".mdx",
  ".txt",
  ".yaml",
  ".yml",
  ".csv",
  ".rst",
  ".json",
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
   * Extrait les entités documentaires d'un fichier (Markdown, texte brut, YAML, CSV, JSON).
   */
  private extractEntities(
    relativePath: string,
    content: string,
    lines: string[],
    ext: string
  ): CodeEntity[] {
    const entities: CodeEntity[] = [];

    // ─── Fichiers Markdown et MDX : extraction documentaire enrichie ─────────
    if (ext === ".md" || ext === ".mdx") {
      entities.push(...this.extractMarkdownEntities(relativePath, content, lines));
    }

    // ─── Fichiers texte brut ──────────────────────────────────────────────────
    if (ext === ".txt") {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Lignes qui ressemblent à des titres de section (ex: "== SECTION ==", "--- TITRE ---")
        if (/^[=\-*_]{3,}\s+.+\s+[=\-*_]{3,}$/.test(line.trim()) || /^[A-ZÀÁÂÃÄÅ ]{6,}$/.test(line.trim())) {
          entities.push({
            name: line.trim().replace(/[=\-*_]+/g, "").trim() || line.trim(),
            type: "section",
            filePath: relativePath,
            lineStart: i + 1,
            signature: line.trim().slice(0, 200),
            metadata: { level: 1, format: "text" },
          });
        }
      }
    }

    // ─── Fichiers YAML ────────────────────────────────────────────────────────
    if (ext === ".yaml" || ext === ".yml") {
      for (let i = 0; i < lines.length; i++) {
        // Clés de niveau racine (non indentées)
        const topLevelKey = lines[i].match(/^([a-zA-Z_][\w\-]*):/);
        if (topLevelKey) {
          entities.push({
            name: topLevelKey[1],
            type: "frontmatter",
            filePath: relativePath,
            lineStart: i + 1,
            signature: lines[i].trim().slice(0, 200),
            metadata: { format: "yaml" },
          });
        }
      }
    }

    // ─── Fichiers CSV : en-têtes de colonnes ──────────────────────────────────
    if (ext === ".csv" && lines.length > 0) {
      const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
      headers.forEach((header, idx) => {
        if (header) {
          entities.push({
            name: header,
            type: "frontmatter",
            filePath: relativePath,
            lineStart: 1,
            signature: `colonne[${idx}]: ${header}`,
            metadata: { format: "csv", columnIndex: idx, totalRows: lines.length - 1 },
          });
        }
      });
    }

    // ─── Fichiers JSON : extraire les clés racines ────────────────────────────
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
   * Extraction complète des entités d'un document Markdown ou MDX.
   *
   * Extrait :
   * - Titres H1-H6 (type "section") avec niveau, texte et résumé du paragraphe suivant
   * - Frontmatter YAML (type "frontmatter") : titre, auteur, date, tags, etc.
   * - Tâches Markdown (type "todo") : - [ ] et - [x]
   * - Blocs de code (type "code_block") avec le langage détecté
   * - Alertes GitHub-style (type "alert") : > [!NOTE], > [!WARNING], etc.
   * - Liens documentaires (type "doc_link") : [texte](./doc.md)
   */
  private extractMarkdownEntities(
    filePath: string,
    _content: string,
    lines: string[]
  ): CodeEntity[] {
    const entities: CodeEntity[] = [];
    let inFrontmatter = false;
    let inCodeBlock = false;
    let codeBlockLang = "";
    let codeBlockStart = -1;
    const alertPattern = /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i;
    const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
    const seenLinks = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // ── Frontmatter YAML (--- au début du fichier) ─────────────────────────
      if (i === 0 && trimmed === "---") {
        inFrontmatter = true;
        continue;
      }
      if (inFrontmatter) {
        if (trimmed === "---" || trimmed === "...") {
          inFrontmatter = false;
        } else {
          const fmKey = trimmed.match(/^([\w\-]+):\s*(.*)/);
          if (fmKey) {
            entities.push({
              name: fmKey[1],
              type: "frontmatter",
              filePath,
              lineStart: i + 1,
              signature: trimmed.slice(0, 200),
              metadata: { key: fmKey[1], value: fmKey[2].trim() },
            });
          }
        }
        continue;
      }

      // ── Blocs de code (```lang ... ```) ────────────────────────────────────
      const codeBlockOpen = trimmed.match(/^```(\w*)/);
      if (codeBlockOpen && !inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = codeBlockOpen[1] || "text";
        codeBlockStart = i + 1;
        continue;
      }
      if (inCodeBlock && trimmed === "```") {
        const blockLines = i - codeBlockStart;
        if (blockLines > 0) {
          entities.push({
            name: "bloc_" + (codeBlockLang || "code") + "_L" + codeBlockStart,
            type: "code_block",
            filePath,
            lineStart: codeBlockStart,
            lineEnd: i + 1,
            signature: "```" + codeBlockLang + " (" + blockLines + " lignes)",
            metadata: { language: codeBlockLang, lines: blockLines },
          });
        }
        inCodeBlock = false;
        codeBlockLang = "";
        codeBlockStart = -1;
        continue;
      }
      if (inCodeBlock) continue;

      // ── Titres H1-H6 ───────────────────────────────────────────────────────
      const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const title = headingMatch[2].trim();
        // Récupère le premier paragraphe sous ce titre comme résumé
        let summary = "";
        for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
          const nextLine = lines[j].trim();
          if (nextLine && !nextLine.startsWith("#") && !nextLine.startsWith(">") && !nextLine.startsWith("-") && !nextLine.startsWith("```")) {
            summary = nextLine.slice(0, 200);
            break;
          }
        }
        entities.push({
          name: title,
          type: "section",
          filePath,
          lineStart: i + 1,
          signature: trimmed.slice(0, 200),
          description: summary || undefined,
          metadata: { level, anchor: title.toLowerCase().replace(/[^a-z0-9\u00e0-\u00ff]+/g, "-") },
        });
        continue;
      }

      // ── Alertes GitHub-style ────────────────────────────────────────────────
      const alertMatch = trimmed.match(alertPattern);
      if (alertMatch) {
        const alertType = alertMatch[1].toUpperCase();
        const alertText = lines[i + 1]?.trim().replace(/^>\s*/, "") || "";
        entities.push({
          name: "[" + alertType + "] " + alertText.slice(0, 60),
          type: "alert",
          filePath,
          lineStart: i + 1,
          signature: trimmed.slice(0, 200),
          metadata: { alertType, text: alertText.slice(0, 300) },
        });
        continue;
      }

      // ── Tâches (checkboxes) ─────────────────────────────────────────────────
      const todoMatch = trimmed.match(/^-\s+\[( |x|X)\]\s+(.+)/);
      if (todoMatch) {
        const done = todoMatch[1].toLowerCase() === "x";
        const taskText = todoMatch[2].trim();
        entities.push({
          name: taskText.slice(0, 100),
          type: "todo",
          filePath,
          lineStart: i + 1,
          signature: trimmed.slice(0, 200),
          metadata: { done, text: taskText.slice(0, 300) },
        });
        continue;
      }

      // ── Liens documentaires (ne garde que les liens relatifs vers des fichiers)
      let linkMatch: RegExpExecArray | null;
      linkPattern.lastIndex = 0;
      while ((linkMatch = linkPattern.exec(line)) !== null) {
        const linkText = linkMatch[1];
        const linkTarget = linkMatch[2];
        if (!linkTarget.startsWith("http") && !linkTarget.startsWith("#") && !seenLinks.has(linkTarget)) {
          seenLinks.add(linkTarget);
          entities.push({
            name: linkText.slice(0, 100),
            type: "doc_link",
            filePath,
            lineStart: i + 1,
            signature: ("[" + linkText + "](" + linkTarget + ")").slice(0, 200),
            dependencies: [linkTarget],
            metadata: { target: linkTarget, text: linkText },
          });
        }
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

    if (ext === ".md" || ext === ".mdx") {
      const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
      for (const line of lines) {
        const trimmed = line.trim();
        const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)/);
        if (headingMatch) {
          exports.push(headingMatch[2].trim());
        }
        let match: RegExpExecArray | null;
        linkPattern.lastIndex = 0;
        while ((match = linkPattern.exec(line)) !== null) {
          const target = match[2];
          if (!target.startsWith("http") && !target.startsWith("#")) {
            imports.push(target);
          }
        }
      }
    }

    return { imports: [...new Set(imports)], exports: [...new Set(exports)] };
  }

  // ─── Entités structurelles ─────────────────────────────────────────────────



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
          type: "frontmatter",
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
          type: "frontmatter",
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
      case ".mdx":
        return "mdx";
      case ".txt":
        return "plaintext";
      case ".yaml":
      case ".yml":
        return "yaml";
      case ".csv":
        return "csv";
      case ".rst":
        return "rst";
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
      if (!/\.(md|mdx|txt|yaml|yml|csv|rst|json)$/i.test(fileNode.extension)) continue;

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

    log.info(`🔗 Relations extraites: ${allRelations.length} (references: ${allRelations.filter(r => r.relationType === "references").length}, includes: ${allRelations.filter(r => r.relationType === "includes").length}, mentions: ${allRelations.filter(r => r.relationType === "mentions").length})`);
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
