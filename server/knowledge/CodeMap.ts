/**
 * CodeMap — Cartographie vivante du code
 *
 * Graphe unifié et typé des fichiers, fonctions, méthodes, classes, interfaces,
 * types, dépendances et appels du projet. Il sert un seul but : permettre aux
 * agents de mesurer l'impact d'une modification AVANT de toucher au code.
 *
 * Ce que la cartographie ajoute aux briques existantes :
 *   - KnowledgeGraph / DependencyGraph raisonnent au niveau FICHIER ;
 *   - ASTCallGraph ne voit que les appels de fonctions ;
 *   - CodeMap relie les SYMBOLES entre eux : quel symbole importe, appelle,
 *     étend, implémente ou référence (y compris en position de type) quel autre,
 *     à travers les barils de réexport, avec un résolveur d'imports qui gère
 *     les spécificateurs ESM `./x.js → x.ts` et les alias `@/`.
 *
 * Modèle :
 *   Nœuds  : file | class | interface | type | enum | function | method
 *            | component | constant | variable
 *   Arêtes : contains | imports | imports_symbol | re_exports | calls | uses
 *            | references_type | extends | implements | tests
 *   Ids    : `file:<chemin>` pour un fichier, `<chemin>#<Nom>` pour un symbole,
 *            `<chemin>#<Classe>.<méthode>` pour une méthode.
 *
 * « Vivante » : l'instance partagée `codeMap` s'abonne à KnowledgeGraph.onUpdate
 * et se marque périmée à chaque réindexation (scan complet, fichier modifié ou
 * supprimé). Elle se reconstruit paresseusement à la requête suivante ; le
 * contenu des fichiers est mis en cache par date de modification, donc seule la
 * partie modifiée du projet est relue sur disque.
 */

import fs from "fs";
import path from "path";
import { createLogger } from "../utils/logger.js";
import { SELF_ROOT } from "../utils/selfRoot.js";
import { knowledgeGraph } from "./KnowledgeGraph.js";
import type { ASTFileResult, CodeEntity, EntityRelation, FileNode } from "./types.js";

const log = createLogger("CodeMap");

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type CodeMapNodeKind =
  | "file"
  | "class"
  | "interface"
  | "type"
  | "enum"
  | "function"
  | "method"
  | "component"
  | "constant"
  | "variable";

export type CodeMapEdgeKind =
  | "contains"          // fichier → symbole, classe → méthode
  | "imports"           // fichier → fichier
  | "imports_symbol"    // fichier → symbole importé nommément
  | "re_exports"        // fichier baril → symbole réexporté
  | "calls"             // symbole → fonction/méthode/classe appelée (ou instanciée)
  | "uses"              // symbole → valeur utilisée sans appel
  | "references_type"   // symbole → type/interface/enum/classe en position de type
  | "extends"           // classe/interface → parent
  | "implements"        // classe → interface
  | "tests";            // fichier de test → fichier source

export interface CodeMapNode {
  id: string;
  kind: CodeMapNodeKind;
  name: string;
  filePath: string;
  lineStart?: number;
  lineEnd?: number;
  exported: boolean;
  signature?: string;
  /** Classe englobante pour une méthode */
  className?: string;
}

export interface CodeMapEdge {
  from: string;
  to: string;
  kind: CodeMapEdgeKind;
  /** Ligne (1-based) dans le fichier de `from` où la relation apparaît */
  line?: number;
}

/** Données brutes nécessaires à la construction de la carte. */
export interface CodeMapSource {
  files: FileNode[];
  relations?: EntityRelation[];
  astResults?: Map<string, ASTFileResult>;
  /** Lit le contenu d'un fichier (chemin relatif). `null` si illisible. */
  readContent(filePath: string, file: FileNode): string | null;
}

export interface CodeMapStats {
  version: number;
  builtAt: string | null;
  buildMs: number;
  files: number;
  symbols: number;
  edges: number;
  nodesByKind: Partial<Record<CodeMapNodeKind, number>>;
  edgesByKind: Partial<Record<CodeMapEdgeKind, number>>;
  stale: boolean;
}

export interface ImpactedNode {
  id: string;
  name: string;
  kind: CodeMapNodeKind;
  filePath: string;
  line?: number;
  /** Distance (en arêtes) depuis la cible la plus proche */
  distance: number;
  /** Nature du lien vers le nœud précédent dans la chaîne */
  via: CodeMapEdgeKind;
  /** Chaîne de propagation : [cible, …, ce nœud] */
  path: string[];
}

export interface ImpactedFile {
  filePath: string;
  distance: number;
  /** Symboles impactés dans ce fichier */
  symbols: string[];
  isTest: boolean;
}

export type CodeMapRisk = "low" | "medium" | "high" | "critical";

export interface CodeMapImpactReport {
  targets: Array<{ id: string; name: string; kind: CodeMapNodeKind; filePath: string; exported: boolean }>;
  /** Références d'entrée introuvables dans la carte */
  unresolved: string[];
  /** Références ambiguës (même nom dans plusieurs fichiers) → toutes retenues */
  ambiguous: Array<{ ref: string; candidates: string[] }>;
  impacted: ImpactedNode[];
  impactedFiles: ImpactedFile[];
  /** Fichiers de test à relancer après la modification */
  testsToRun: string[];
  /** Fichiers impactés qu'aucun test connu ne couvre */
  untestedFiles: string[];
  risk: CodeMapRisk;
  riskScore: number;
  warnings: string[];
  maxDepthReached: boolean;
  truncated: boolean;
  summary: string;
}

export interface CodeMapImpactOptions {
  /** Profondeur max de propagation (défaut 3, max 8) */
  maxDepth?: number;
  /** Nombre max de nœuds impactés retournés (défaut 300) */
  maxNodes?: number;
}

export interface SymbolDescription {
  node: CodeMapNode;
  /** Qui dépend de ce nœud (arêtes entrantes, hors `contains`) */
  usedBy: Array<{ id: string; name: string; filePath: string; kind: CodeMapEdgeKind; line?: number }>;
  /** De quoi ce nœud dépend (arêtes sortantes, hors `contains`) */
  uses: Array<{ id: string; name: string; filePath: string; kind: CodeMapEdgeKind; line?: number }>;
  /** Membres (méthodes d'une classe, symboles d'un fichier) */
  members: Array<{ id: string; name: string; kind: CodeMapNodeKind; line?: number; exported: boolean }>;
  tests: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Constantes & utilitaires purs
// ═══════════════════════════════════════════════════════════════════════════════

const CODE_EXT_RE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/i;
const TEST_FILE_RE = /(^|\/)(__tests__|tests?)\/|\.(test|spec)\.[cm]?[jt]sx?$/i;

const ENTITY_KIND: Partial<Record<CodeEntity["type"], CodeMapNodeKind>> = {
  class: "class",
  interface: "interface",
  type: "type",
  enum: "enum",
  function: "function",
  method: "method",
  component: "component",
  constant: "constant",
  variable: "variable",
};

/** Arêtes suivies à rebours pour propager un impact. */
const IMPACT_EDGE_KINDS: ReadonlySet<CodeMapEdgeKind> = new Set([
  "imports",
  "imports_symbol",
  "re_exports",
  "calls",
  "uses",
  "references_type",
  "extends",
  "implements",
]);

const TYPE_LIKE: ReadonlySet<CodeMapNodeKind> = new Set(["interface", "type", "enum"]);
const CALLABLE: ReadonlySet<CodeMapNodeKind> = new Set(["function", "method", "component", "class"]);

const JS_TO_TS_EXT: Record<string, string[]> = {
  ".js": [".ts", ".tsx"],
  ".jsx": [".tsx"],
  ".mjs": [".mts"],
  ".cjs": [".cts"],
};
const RESOLVE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".json"];

export function normalizeCodePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/^\/+/, "");
}

export function isTestFile(filePath: string): boolean {
  return TEST_FILE_RE.test(filePath);
}

/**
 * Résout un spécificateur d'import vers un fichier connu.
 * Gère : chemins relatifs, extensions ESM `.js` pointant vers `.ts`,
 * fichiers `index.*`, alias `@/` et `~/` (→ `src/`). Retourne `null`
 * pour les paquets externes ou les cibles inconnues.
 */
export function resolveImportSpecifier(fromFile: string, spec: string, known: ReadonlySet<string>): string | null {
  let base: string;
  if (spec.startsWith(".")) {
    base = path.posix.normalize(path.posix.join(path.posix.dirname(normalizeCodePath(fromFile)), spec));
  } else if (spec.startsWith("@/") || spec.startsWith("~/")) {
    base = `src/${spec.slice(2)}`;
  } else if (spec.startsWith("/")) {
    base = spec.slice(1);
  } else {
    return null;
  }
  base = normalizeCodePath(base);

  const candidates: string[] = [base];
  const ext = path.posix.extname(base);
  if (JS_TO_TS_EXT[ext]) {
    const stem = base.slice(0, -ext.length);
    for (const alt of JS_TO_TS_EXT[ext]) candidates.push(stem + alt);
  }
  for (const e of RESOLVE_EXTS) candidates.push(base + e);
  for (const e of RESOLVE_EXTS) candidates.push(`${base}/index${e}`);

  for (const c of candidates) if (known.has(c)) return c;
  return null;
}

/**
 * Remplace commentaires et contenu des chaînes par des espaces en conservant
 * les retours à la ligne (les numéros de ligne restent valides). Les chaînes
 * d'un `from "…"` / `import("…")` / `require("…")` sont conservées pour que
 * l'analyse des imports reste possible sur le texte nettoyé.
 */
export function maskCommentsAndStrings(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") { out += " "; i++; }
      continue;
    }
    if (c === "/" && next === "*") {
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { out += src[i] === "\n" ? "\n" : " "; i++; }
      if (i < n) { out += "  "; i += 2; }
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      const keep = /(?:\bfrom|\bimport\s*\(|\brequire\s*\(|\bimport)\s*$/.test(out.slice(-24));
      const quote = c;
      out += c; i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\" && i + 1 < n) { out += keep ? src[i] + src[i + 1] : "  "; i += 2; continue; }
        if (quote !== "`" && src[i] === "\n") break; // chaîne non terminée : on s'arrête à la ligne
        out += keep || src[i] === "\n" ? src[i] : " ";
        i++;
      }
      if (i < n && src[i] === quote) { out += quote; i++; }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

interface ParsedImport {
  spec: string;
  line: number;
  /** Position [début, fin[ de la déclaration dans le texte */
  start: number;
  end: number;
  isExport: boolean;
  /** local → nom importé (`default` pour l'import par défaut) */
  named: Array<{ imported: string; local: string }>;
  namespace?: string;
  /** `export * from` */
  star: boolean;
}

/** Extrait les déclarations import/export … from du texte nettoyé. */
export function parseImportStatements(masked: string): ParsedImport[] {
  const out: ParsedImport[] = [];
  // Clause stricte : `X`, `X, {…}`, `X, * as ns`, `{…}`, `* as ns`, `*` — jamais
  // un corps de déclaration (sinon `export interface A {…}` avalerait l'import suivant).
  const re = /\b(import|export)\s+(?:type\s+)?((?:[\w$]+\s*,\s*)?(?:\*(?:\s*as\s+[\w$]+)?|\{[^{}]*\})|[\w$]+)\s*from\s*['"]([^'"]+)['"]/g;
  let line = 1;
  let cursor = 0;
  for (const m of masked.matchAll(re)) {
    const isExport = m[1] === "export";
    let clause = m[2].trim();
    const start = m.index ?? 0;
    for (; cursor < start; cursor++) if (masked.charCodeAt(cursor) === 10) line++;
    const parsed: ParsedImport = { spec: m[3], line, start, end: start + m[0].length, isExport, named: [], star: false };

    const brace = clause.match(/\{([^}]*)\}/);
    if (brace) {
      for (const raw of brace[1].split(",")) {
        const part = raw.trim().replace(/^type\s+/, "");
        if (!part) continue;
        const [imported, local] = part.split(/\s+as\s+/).map((s) => s.trim());
        if (/^[\w$]+$/.test(imported)) parsed.named.push({ imported, local: local && /^[\w$]+$/.test(local) ? local : imported });
      }
      clause = clause.replace(brace[0], "");
    }
    const ns = clause.match(/\*\s*as\s+([\w$]+)/);
    if (ns) {
      parsed.namespace = ns[1];
      clause = clause.replace(ns[0], "");
    } else if (/\*/.test(clause)) {
      parsed.star = true;
      clause = clause.replace("*", "");
    }
    const def = clause.replace(/,/g, " ").trim();
    if (!isExport && /^[\w$]+$/.test(def)) parsed.named.push({ imported: "default", local: def });
    out.push(parsed);
  }

  // Imports dynamiques / CommonJS liés à un nom :
  //   const { a, b: c } = await import("./x.js")   const ns = require("./x")
  const dynRe = /\b(?:const|let|var)\s+(\{[^{}]*\}|[\w$]+)\s*=\s*(?:await\s+)?(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of masked.matchAll(dynRe)) {
    const start = m.index ?? 0;
    const parsed: ParsedImport = { spec: m[2], line: lineAt(masked, start), start, end: start + m[0].length, isExport: false, named: [], star: false };
    if (m[1].startsWith("{")) {
      for (const raw of m[1].slice(1, -1).split(",")) {
        const [imported, local] = raw.split(":").map((s) => s.trim().replace(/\s*=.*$/, ""));
        if (/^[\w$]+$/.test(imported)) parsed.named.push({ imported, local: local && /^[\w$]+$/.test(local) ? local : imported });
      }
    } else {
      parsed.namespace = m[1];
    }
    out.push(parsed);
  }
  return out.sort((a, b) => a.start - b.start);
}

function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** Remplace des plages du texte par des espaces (retours à la ligne conservés). */
function blankRanges(text: string, ranges: Array<{ start: number; end: number }>): string {
  if (!ranges.length) return text;
  let out = "";
  let pos = 0;
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
    if (r.start < pos) continue;
    out += text.slice(pos, r.start) + text.slice(r.start, r.end).replace(/[^\n]/g, " ");
    pos = r.end;
  }
  return out + text.slice(pos);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CodeMap
// ═══════════════════════════════════════════════════════════════════════════════

interface FileScope {
  /** Nom visible dans le fichier → id du symbole (locaux + importés) */
  bindings: Map<string, string>;
  /** Alias `import * as ns` → fichier */
  namespaces: Map<string, string>;
  /** Texte nettoyé (commentaires, chaînes et déclarations d'import neutralisés) */
  lines: string[];
}

const MEMBER_RE =
  /^\s*(?:(?:public|private|protected|static|readonly|async|override|abstract|declare|get|set)\s+)*\*?\s*([A-Za-z_$][\w$]*)\s*\??\s*(?:<[^>]*>)?\s*(?:\(|=\s*(?:async\s+)?(?:\([^)]*\)|[\w$]+)\s*(?::\s*[^=]+)?=>)/;
const NOT_MEMBER = new Set(["if", "for", "while", "switch", "catch", "return", "super", "else", "do", "try", "with", "typeof", "await", "new", "function"]);
/** Natures dont la portée se lit par appariement d'accolades */
const BLOCK_KINDS: ReadonlySet<CodeMapNodeKind> = new Set(["class", "function", "component", "interface", "enum"]);

/**
 * Ligne (1-based) fermant le bloc ouvert sur la ligne `start` (0-based) ou dans
 * les 3 suivantes (signature multi-lignes). `null` si l'instruction se termine
 * avant toute accolade. Les accolades entre parenthèses (types de paramètres)
 * sont ignorées.
 */
function blockEndLine(lines: string[], start: number): number | null {
  let depth = 0;
  let parens = 0;
  let opened = false;
  for (let i = start; i < lines.length && (opened || i < start + 4); i++) {
    for (const ch of lines[i]) {
      if (ch === "(") parens++;
      else if (ch === ")") parens = Math.max(0, parens - 1);
      else if (parens > 0) continue;
      else if (ch === "{") { depth++; opened = true; }
      else if (ch === "}") { depth--; if (opened && depth === 0) return i + 1; }
      else if (ch === ";" && !opened) return null;
    }
  }
  return null;
}

interface FileIndex {
  /** Symboles de premier niveau par nom */
  topLevel: Map<string, string>;
  /** Symbole exporté par défaut */
  defaultExport?: string;
  /** Réexports nommés : nom exporté → { fichier source, nom source } */
  reExports: Map<string, { file: string; name: string }>;
  /** `export * from` */
  starExports: string[];
}

export class CodeMap {
  private nodes = new Map<string, CodeMapNode>();
  private outEdges = new Map<string, CodeMapEdge[]>();
  private inEdges = new Map<string, CodeMapEdge[]>();
  private nameIndex = new Map<string, string[]>();
  private fileIndex = new Map<string, FileIndex>();
  private fileSymbols = new Map<string, string[]>();
  /** Constante/variable singleton → classe instanciée */
  private instanceOf = new Map<string, string>();
  private edgeKeys = new Set<string>();

  private stale = true;
  private version = 0;
  private builtAt: string | null = null;
  private buildMs = 0;
  private listeners = new Set<(stats: CodeMapStats) => void>();

  constructor(private readonly sourceProvider: () => CodeMapSource) {}

  // ─── Cycle de vie ─────────────────────────────────────────────────────────

  /** Marque la carte comme périmée ; elle sera reconstruite à la prochaine requête. */
  invalidate(): void {
    this.stale = true;
  }

  isStale(): boolean {
    return this.stale;
  }

  /** Notifié après chaque reconstruction (UI, télémétrie). */
  onRebuilt(listener: (stats: CodeMapStats) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Reconstruit la carte si elle est périmée. */
  ensureFresh(): void {
    if (this.stale) this.rebuild();
  }

  rebuild(): void {
    const t0 = Date.now();
    this.reset();
    const source = this.sourceProvider();
    this.build(source);
    this.stale = false;
    this.version++;
    this.builtAt = new Date().toISOString();
    this.buildMs = Date.now() - t0;
    const stats = this.getStats();
    log.info(`🗺️ Cartographie reconstruite: ${stats.files} fichiers, ${stats.symbols} symboles, ${stats.edges} arêtes (${this.buildMs}ms)`);
    for (const l of this.listeners) {
      try { l(stats); } catch (e) { log.warn(`Listener CodeMap.onRebuilt a échoué: ${(e as Error).message}`); }
    }
  }

  private reset(): void {
    this.nodes.clear();
    this.outEdges.clear();
    this.inEdges.clear();
    this.nameIndex.clear();
    this.fileIndex.clear();
    this.fileSymbols.clear();
    this.edgeKeys.clear();
  }

  // ─── Construction ─────────────────────────────────────────────────────────

  private build(source: CodeMapSource): void {
    const files = source.files
      .map((f) => ({ ...f, path: normalizeCodePath(f.path) }))
      .filter((f) => CODE_EXT_RE.test(f.path));
    const known = new Set(files.map((f) => f.path));
    const astByPath = new Map<string, ASTFileResult>();
    for (const [p, r] of source.astResults ?? []) astByPath.set(normalizeCodePath(p), r);

    // 1. Nœuds fichiers + symboles
    for (const file of files) {
      this.addNode({ id: fileId(file.path), kind: "file", name: path.posix.basename(file.path), filePath: file.path, exported: false });
      this.addSymbols(file, astByPath.get(file.path));
    }

    // 2. Imports, réexports, usages (nécessite le contenu)
    const parsedByFile = new Map<string, { masked: string; imports: ParsedImport[] }>();
    for (const file of files) {
      let content: string | null = null;
      try { content = source.readContent(file.path, file); } catch { content = null; }
      if (content == null) continue;
      const masked = maskCommentsAndStrings(content);
      const imports = parseImportStatements(masked);
      parsedByFile.set(file.path, { masked, imports });
      this.refineFromSource(file.path, masked.split("\n"));

      const idx = this.fileIndex.get(file.path)!;
      for (const imp of imports) {
        if (!imp.isExport) continue;
        const target = resolveImportSpecifier(file.path, imp.spec, known);
        if (!target) continue;
        if (imp.star) idx.starExports.push(target);
        for (const { imported, local } of imp.named) idx.reExports.set(local, { file: target, name: imported });
      }
    }

    // Arêtes fichier → fichier (tous les imports, y compris side-effect / require / import())
    for (const file of files) {
      const specs = new Set(file.imports ?? []);
      for (const imp of parsedByFile.get(file.path)?.imports ?? []) specs.add(imp.spec);
      for (const spec of specs) {
        const target = resolveImportSpecifier(file.path, spec, known);
        if (target && target !== file.path) {
          this.addEdge(fileId(file.path), fileId(target), "imports");
          if (isTestFile(file.path) && !isTestFile(target)) this.addEdge(fileId(file.path), fileId(target), "tests");
        }
      }
    }

    // Portée de chaque fichier : symboles importés (liaisons locales) et espaces de noms
    const scopes = new Map<string, FileScope>();
    for (const file of files) {
      const parsed = parsedByFile.get(file.path);
      if (!parsed) continue;
      const scope: FileScope = {
        // Les symboles de premier niveau du fichier sont visibles localement ;
        // un import de même nom les masquerait, d'où l'ordre de copie.
        bindings: new Map(this.fileIndex.get(file.path)!.topLevel),
        namespaces: new Map(),
        lines: [],
      };
      for (const imp of parsed.imports) {
        const target = resolveImportSpecifier(file.path, imp.spec, known);
        if (!target) continue;
        if (imp.namespace) scope.namespaces.set(imp.namespace, target);
        for (const { imported, local } of imp.named) {
          const sym = this.resolveExport(target, imported);
          if (!sym) continue;
          this.addEdge(fileId(file.path), sym, imp.isExport ? "re_exports" : "imports_symbol", imp.line);
          if (!imp.isExport) scope.bindings.set(local, sym);
        }
      }
      // Les déclarations import/export…from ne sont pas des usages : on les neutralise.
      scope.lines = blankRanges(parsed.masked, parsed.imports).split("\n");
      scopes.set(file.path, scope);
    }

    // Instances singletons : `export const x = new Classe(…)` → x.m() résout Classe.m
    this.instanceOf.clear();
    for (const [filePath, scope] of scopes) {
      for (const id of this.fileSymbols.get(filePath) ?? []) {
        const n = this.nodes.get(id)!;
        if ((n.kind !== "constant" && n.kind !== "variable") || n.className || n.lineStart == null) continue;
        const m = scope.lines[n.lineStart - 1]?.match(/=\s*new\s+([\w$]+)/);
        const cls = m ? scope.bindings.get(m[1]) : undefined;
        if (cls && this.nodes.get(cls)?.kind === "class") this.instanceOf.set(id, cls);
      }
    }

    // Usages dans le corps des symboles
    for (const [filePath, scope] of scopes) this.scanUsages(filePath, scope);

    // 3. Relations sémantiques déjà calculées par l'indexeur (héritage, appels AST…)
    for (const rel of source.relations ?? []) this.addRelation(rel);
  }

  private addSymbols(file: FileNode, ast: ASTFileResult | undefined): void {
    const idx: FileIndex = { topLevel: new Map(), reExports: new Map(), starExports: [] };
    this.fileIndex.set(file.path, idx);
    const exportsSet = new Set(file.exports ?? []);
    const defaultName = (file.exports ?? []).find((e) => e.startsWith("default:"))?.slice("default:".length);

    const classes: Array<{ name: string; start: number; end: number }> = [];
    for (const c of ast?.classes ?? []) classes.push({ name: c.name, start: c.lineStart, end: c.lineEnd });
    for (const e of file.entities ?? []) {
      if (e.type === "class" && e.lineEnd && !classes.some((c) => c.name === e.name)) {
        classes.push({ name: e.name, start: e.lineStart, end: e.lineEnd });
      }
    }
    const enclosingClass = (line: number): string | undefined =>
      classes.find((c) => line > c.start && line <= c.end)?.name;

    const add = (
      name: string,
      kind: CodeMapNodeKind,
      lineStart: number | undefined,
      lineEnd: number | undefined,
      exported: boolean,
      signature?: string,
      className?: string,
    ): void => {
      if (!/^[\w$]+$/.test(name)) return;
      const id = className ? `${file.path}#${className}.${name}` : `${file.path}#${name}`;
      const existing = this.nodes.get(id);
      if (existing) {
        existing.lineEnd ??= lineEnd;
        existing.signature ??= signature;
        existing.exported ||= exported;
        return;
      }
      this.addNode({ id, kind, name, filePath: file.path, lineStart, lineEnd, exported, signature, className });
      if (className) {
        this.addEdge(`${file.path}#${className}`, id, "contains");
      } else {
        this.addEdge(fileId(file.path), id, "contains");
        idx.topLevel.set(name, id);
      }
    };

    // Classes d'abord pour que les méthodes puissent s'y rattacher
    for (const c of ast?.classes ?? []) add(c.name, "class", c.lineStart, c.lineEnd, c.isExported || exportsSet.has(c.name));
    for (const e of file.entities ?? []) {
      const kind = ENTITY_KIND[e.type];
      if (!kind) continue;
      const isExported = (e.modifiers ?? []).includes("export") || exportsSet.has(e.name) || defaultName === e.name;
      if (kind === "method") {
        const cls = enclosingClass(e.lineStart);
        if (cls) add(e.name, "method", e.lineStart, e.lineEnd, false, e.signature, cls);
        continue;
      }
      // Une constante/variable non exportée imbriquée dans une classe est un détail d'implémentation
      if ((kind === "variable" || kind === "constant") && !isExported && enclosingClass(e.lineStart)) continue;
      add(e.name, kind, e.lineStart, e.lineEnd, isExported, e.signature);
    }
    for (const fn of ast?.functions ?? []) {
      if (fn.isMethod && fn.className) {
        add(fn.name, "method", fn.lineStart, fn.lineEnd, false, undefined, fn.className);
      } else if (!fn.isMethod && !enclosingClass(fn.lineStart)) {
        add(fn.name, "function", fn.lineStart, fn.lineEnd, fn.isExported || exportsSet.has(fn.name));
      }
    }

    if (defaultName && idx.topLevel.has(defaultName)) idx.defaultExport = idx.topLevel.get(defaultName);

    // Fin de portée inconnue (types, constantes…) : on l'estime jusqu'au symbole
    // de premier niveau suivant, pour rattacher correctement les usages du corps.
    const top = [...idx.topLevel.values()]
      .map((id) => this.nodes.get(id)!)
      .filter((n) => n.lineStart != null)
      .sort((a, b) => a.lineStart! - b.lineStart!);
    top.forEach((n, i) => {
      if (n.lineEnd != null && n.lineEnd > n.lineStart!) return;
      const next = top[i + 1]?.lineStart;
      n.lineEnd = Math.max(n.lineStart!, (next ?? (file.lines || n.lineStart!) + 1) - 1);
    });
  }

  /**
   * Complète ce que l'indexeur n'a pas fourni, à partir du source nettoyé :
   * fin exacte des blocs (classes, fonctions, interfaces…) et membres de classes
   * (indispensable quand l'index AST Tree-sitter n'est pas en mémoire).
   */
  private refineFromSource(filePath: string, lines: string[]): void {
    for (const id of [...(this.fileSymbols.get(filePath) ?? [])]) {
      const n = this.nodes.get(id)!;
      if (n.className || n.lineStart == null) continue;
      const isFnConst = (n.kind === "constant" || n.kind === "variable")
        && /=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*(?::[^=]+)?=>|[\w$]+\s*=>)/.test(lines[n.lineStart - 1] ?? "");
      if (!BLOCK_KINDS.has(n.kind) && !isFnConst) continue;
      const end = blockEndLine(lines, n.lineStart - 1);
      if (end) n.lineEnd = end;
      if (n.kind === "class" && end) this.addClassMembers(filePath, n, lines);
    }
  }

  private addClassMembers(filePath: string, cls: CodeMapNode, lines: string[]): void {
    const start = cls.lineStart! - 1;
    const end = cls.lineEnd! - 1;
    const members: Array<{ name: string; line: number }> = [];
    let depth = 0;
    let parens = 0;
    for (let i = start; i <= end; i++) {
      if (depth === 1 && parens === 0) {
        const m = lines[i].match(MEMBER_RE);
        if (m && !NOT_MEMBER.has(m[1])) members.push({ name: m[1], line: i + 1 });
      }
      for (const ch of lines[i]) {
        if (ch === "(") parens++;
        else if (ch === ")") parens = Math.max(0, parens - 1);
        else if (parens > 0) continue;
        else if (ch === "{") depth++;
        else if (ch === "}") depth--;
      }
    }
    members.forEach((m, k) => {
      const next = members[k + 1]?.line ?? cls.lineEnd!;
      const id = `${filePath}#${cls.name}.${m.name}`;
      const existing = this.nodes.get(id);
      if (existing) {
        existing.lineEnd ??= Math.max(m.line, next - 1);
        return;
      }
      this.addNode({ id, kind: "method", name: m.name, filePath, lineStart: m.line, lineEnd: Math.max(m.line, next - 1), exported: false, className: cls.name });
      this.addEdge(cls.id, id, "contains");
    });
  }

  /** Classe propriétaire d'un nœud (lui-même s'il s'agit d'une classe). */
  private classOf(id: string): string | null {
    const n = this.nodes.get(id);
    if (!n) return null;
    if (n.kind === "class") return n.id;
    return n.className ? `${n.filePath}#${n.className}` : null;
  }

  /** Résout `name` exporté par `file` vers un symbole, en suivant les barils. */
  private resolveExport(file: string, name: string, depth = 0, seen = new Set<string>()): string | null {
    const key = `${file}::${name}`;
    if (depth > 8 || seen.has(key)) return null;
    seen.add(key);
    const idx = this.fileIndex.get(file);
    if (!idx) return null;
    if (name === "default") return idx.defaultExport ?? null;
    const direct = idx.topLevel.get(name);
    if (direct) return direct;
    const re = idx.reExports.get(name);
    if (re) return this.resolveExport(re.file, re.name, depth + 1, seen);
    for (const star of idx.starExports) {
      const hit = this.resolveExport(star, name, depth + 1, seen);
      if (hit) return hit;
    }
    return null;
  }

  /**
   * Détecte les références aux symboles importés / locaux dans le texte nettoyé
   * et les rattache au symbole englobant le plus interne (ou au fichier pour le
   * code de niveau module).
   */
  private scanUsages(filePath: string, scope: FileScope): void {
    const ranges = (this.fileSymbols.get(filePath) ?? [])
      .map((id) => this.nodes.get(id)!)
      .filter((n) => n.lineStart != null)
      .map((n) => ({ id: n.id, start: n.lineStart!, end: n.lineEnd ?? n.lineStart! }))
      .sort((a, b) => (a.end - a.start) - (b.end - b.start));
    const ownerOf = (line: number): string =>
      ranges.find((r) => line >= r.start && line <= r.end)?.id ?? fileId(filePath);

    // `nom` ou `nom.membre` / `nom?.membre` (le membre sert aux espaces de noms, à this, aux classes et singletons)
    const identRe = /(?<![\w$.])([A-Za-z_$][\w$]*)(?:\s*\??\.\s*([A-Za-z_$][\w$]*))?/g;
    scope.lines.forEach((text, i) => {
      const lineNo = i + 1;
      let owner: string | null = null;
      const emit = (target: string, before: string, after: string): void => {
        owner ??= ownerOf(lineNo);
        if (owner === target) return;
        // Ignore la ligne de déclaration du symbole lui-même
        const t = this.nodes.get(target);
        if (t?.lineStart === lineNo && t.filePath === filePath) return;
        this.addEdge(owner, target, this.classifyUsage(target, before, after), lineNo);
      };
      for (const m of text.matchAll(identRe)) {
        const [whole, name, member] = m;
        const start = m.index ?? 0;
        const before = text.slice(0, start);
        const afterName = text.slice(start + name.length);
        const afterMember = text.slice(start + whole.length);

        if (name === "this") {
          if (!member) continue;
          owner ??= ownerOf(lineNo);
          const cls = this.classOf(owner);
          if (cls && this.nodes.has(`${cls}.${member}`)) emit(`${cls}.${member}`, before, afterMember);
          continue;
        }

        const target = scope.bindings.get(name);
        if (!target) {
          const ns = scope.namespaces.get(name);
          const sym = ns && member ? this.resolveExport(ns, member) : null;
          if (sym) emit(sym, before, afterMember);
          continue;
        }
        emit(target, before, afterName);
        if (member) {
          // Classe.statique() ou singleton.methode()
          const cls = this.nodes.get(target)?.kind === "class" ? target : this.instanceOf.get(target);
          if (cls && this.nodes.has(`${cls}.${member}`)) emit(`${cls}.${member}`, before, afterMember);
        }
      }
    });
  }

  private classifyUsage(target: string, before: string, after: string): CodeMapEdgeKind {
    const kind = this.nodes.get(target)?.kind;
    if (/\bextends\s+([\w$.]+\s*,\s*)*$/.test(before)) return "extends";
    if (/\bimplements\s+([\w$.]+\s*,\s*)*$/.test(before)) return "implements";
    if (kind && TYPE_LIKE.has(kind)) return "references_type";
    if (/\bnew\s+$/.test(before)) return "calls";
    if (kind && CALLABLE.has(kind) && /^\s*(<[^>]*>)?\s*\(/.test(after)) return "calls";
    if (kind === "class" && /(:\s*|<\s*|\|\s*|&\s*|\bas\s+)$/.test(before)) return "references_type";
    if (kind === "component" && /<\s*$/.test(before)) return "calls";
    return "uses";
  }

  private addRelation(rel: EntityRelation): void {
    const kindMap: Partial<Record<EntityRelation["relationType"], CodeMapEdgeKind>> = {
      extends: "extends",
      implements: "implements",
      calls: "calls",
      uses: "uses",
      composes: "calls",
      tests: "tests",
    };
    const kind = kindMap[rel.relationType];
    if (!kind) return;
    if (kind === "tests") {
      const from = fileId(normalizeCodePath(rel.source.filePath));
      const to = fileId(normalizeCodePath(rel.target.filePath));
      if (this.nodes.has(from) && this.nodes.has(to) && from !== to) this.addEdge(from, to, "tests");
      return;
    }
    const from = this.findSymbolIn(normalizeCodePath(rel.source.filePath), rel.source.name);
    const to = this.findSymbolIn(normalizeCodePath(rel.target.filePath), rel.target.name)
      ?? this.uniqueByName(rel.target.name);
    if (from && to && from !== to) this.addEdge(from, to, kind, rel.sourceLine);
  }

  private findSymbolIn(filePath: string, name: string): string | null {
    if (!filePath) return null;
    const top = this.fileIndex.get(filePath)?.topLevel.get(name);
    if (top) return top;
    const dotted = this.nodes.get(`${filePath}#${name}`);
    if (dotted) return dotted.id;
    const candidates = (this.nameIndex.get(name) ?? []).filter((id) => this.nodes.get(id)?.filePath === filePath);
    return candidates.length === 1 ? candidates[0] : null;
  }

  private uniqueByName(name: string): string | null {
    const ids = this.nameIndex.get(name) ?? [];
    return ids.length === 1 ? ids[0] : null;
  }

  private addNode(node: CodeMapNode): void {
    this.nodes.set(node.id, node);
    if (node.kind !== "file") {
      (this.fileSymbols.get(node.filePath) ?? this.fileSymbols.set(node.filePath, []).get(node.filePath)!).push(node.id);
      const list = this.nameIndex.get(node.name) ?? [];
      list.push(node.id);
      this.nameIndex.set(node.name, list);
    }
  }

  private addEdge(from: string, to: string, kind: CodeMapEdgeKind, line?: number): void {
    if (from === to || !this.nodes.has(from) || !this.nodes.has(to)) return;
    const key = `${from}|${to}|${kind}`;
    if (this.edgeKeys.has(key)) return;
    this.edgeKeys.add(key);
    const edge: CodeMapEdge = { from, to, kind, line };
    (this.outEdges.get(from) ?? this.outEdges.set(from, []).get(from)!).push(edge);
    (this.inEdges.get(to) ?? this.inEdges.set(to, []).get(to)!).push(edge);
  }

  // ─── Requêtes ─────────────────────────────────────────────────────────────

  getNode(id: string): CodeMapNode | undefined {
    this.ensureFresh();
    return this.nodes.get(id);
  }

  getIncoming(id: string): CodeMapEdge[] {
    this.ensureFresh();
    return this.inEdges.get(id) ?? [];
  }

  getOutgoing(id: string): CodeMapEdge[] {
    this.ensureFresh();
    return this.outEdges.get(id) ?? [];
  }

  getStats(): CodeMapStats {
    const nodesByKind: Partial<Record<CodeMapNodeKind, number>> = {};
    const edgesByKind: Partial<Record<CodeMapEdgeKind, number>> = {};
    for (const n of this.nodes.values()) nodesByKind[n.kind] = (nodesByKind[n.kind] ?? 0) + 1;
    let edges = 0;
    for (const list of this.outEdges.values()) {
      for (const e of list) { edgesByKind[e.kind] = (edgesByKind[e.kind] ?? 0) + 1; edges++; }
    }
    const files = nodesByKind.file ?? 0;
    return {
      version: this.version,
      builtAt: this.builtAt,
      buildMs: this.buildMs,
      files,
      symbols: this.nodes.size - files,
      edges,
      nodesByKind,
      edgesByKind,
      stale: this.stale,
    };
  }

  /**
   * Résout une référence libre vers des ids de nœuds.
   * Formes acceptées : `chemin/fichier.ts`, `chemin/fichier.ts#Symbole`,
   * `chemin/fichier.ts#Classe.méthode`, `Symbole`, `Classe.méthode`.
   */
  resolveRef(ref: string): string[] {
    this.ensureFresh();
    const clean = normalizeCodePath(ref.trim());
    if (!clean) return [];
    const [filePart, symPart] = clean.includes("#") ? clean.split("#", 2) : [clean, ""];

    if (symPart) {
      const file = this.matchFile(filePart);
      if (!file) return [];
      const id = `${file}#${symPart}`;
      if (this.nodes.has(id)) return [id];
      const fallback = this.findSymbolIn(file, symPart.split(".").pop()!);
      return fallback ? [fallback] : [];
    }

    const file = this.matchFile(clean);
    if (file) return [fileId(file)];

    if (clean.includes(".") && !CODE_EXT_RE.test(clean)) {
      const [cls, method] = clean.split(".", 2);
      const hits = (this.nameIndex.get(method) ?? []).filter((id) => this.nodes.get(id)?.className === cls);
      if (hits.length) return hits;
    }
    return [...(this.nameIndex.get(clean) ?? [])];
  }

  private matchFile(p: string): string | null {
    if (this.fileIndex.has(p)) return p;
    for (const ext of RESOLVE_EXTS) if (this.fileIndex.has(p + ext)) return p + ext;
    const suffixHits = [...this.fileIndex.keys()].filter((f) => f.endsWith(`/${p}`));
    return suffixHits.length === 1 ? suffixHits[0] : null;
  }

  /** Recherche de symboles par nom (exact > préfixe > sous-chaîne). */
  findSymbols(query: string, opts: { limit?: number; kinds?: CodeMapNodeKind[] } = {}): CodeMapNode[] {
    this.ensureFresh();
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const kinds = opts.kinds?.length ? new Set(opts.kinds) : null;
    const scored: Array<{ node: CodeMapNode; score: number }> = [];
    for (const node of this.nodes.values()) {
      if (node.kind === "file" || (kinds && !kinds.has(node.kind))) continue;
      const name = node.name.toLowerCase();
      const qualified = node.className ? `${node.className}.${node.name}`.toLowerCase() : name;
      let score = 0;
      if (name === q || qualified === q) score = 100;
      else if (name.startsWith(q)) score = 60;
      else if (name.includes(q) || qualified.includes(q)) score = 30;
      if (!score) continue;
      if (node.exported) score += 5;
      score += Math.min(10, (this.inEdges.get(node.id)?.length ?? 0));
      scored.push({ node, score });
    }
    return scored
      .sort((a, b) => b.score - a.score || a.node.id.localeCompare(b.node.id))
      .slice(0, opts.limit ?? 20)
      .map((s) => s.node);
  }

  /** Décrit un nœud : qui l'utilise, ce qu'il utilise, ses membres, ses tests. */
  describe(id: string, limit = 40): SymbolDescription | null {
    this.ensureFresh();
    const node = this.nodes.get(id);
    if (!node) return null;
    const view = (e: CodeMapEdge, other: string) => {
      const n = this.nodes.get(other)!;
      return { id: other, name: n.className ? `${n.className}.${n.name}` : n.name, filePath: n.filePath, kind: e.kind, line: e.line };
    };
    const usedBy = (this.inEdges.get(id) ?? []).filter((e) => e.kind !== "contains" && e.kind !== "tests").map((e) => view(e, e.from));
    const uses = (this.outEdges.get(id) ?? []).filter((e) => e.kind !== "contains" && e.kind !== "tests").map((e) => view(e, e.to));
    const members = (this.outEdges.get(id) ?? [])
      .filter((e) => e.kind === "contains")
      .map((e) => this.nodes.get(e.to)!)
      .map((n) => ({ id: n.id, name: n.name, kind: n.kind, line: n.lineStart, exported: n.exported }));
    return {
      node,
      usedBy: usedBy.slice(0, limit),
      uses: uses.slice(0, limit),
      members: members.slice(0, limit * 2),
      tests: this.testsFor(node.filePath),
    };
  }

  private testsFor(filePath: string): string[] {
    if (isTestFile(filePath)) return [filePath];
    return (this.inEdges.get(fileId(filePath)) ?? [])
      .filter((e) => e.kind === "tests")
      .map((e) => this.nodes.get(e.from)!.filePath)
      .sort();
  }

  /**
   * Analyse d'impact AVANT modification : propage à rebours, depuis les cibles,
   * le long des arêtes de dépendance (imports, appels, références de type,
   * héritage…). Une cible « fichier » inclut ses symboles exportés.
   */
  analyzeImpact(refs: string[], opts: CodeMapImpactOptions = {}): CodeMapImpactReport {
    this.ensureFresh();
    const maxDepth = clamp(opts.maxDepth ?? 3, 1, 8);
    const maxNodes = clamp(opts.maxNodes ?? 300, 10, 5000);

    const unresolved: string[] = [];
    const ambiguous: CodeMapImpactReport["ambiguous"] = [];
    const seeds = new Set<string>();
    const explicit = new Set<string>();
    for (const ref of refs) {
      const ids = this.resolveRef(ref);
      if (!ids.length) { unresolved.push(ref); continue; }
      if (ids.length > 1) ambiguous.push({ ref, candidates: ids });
      for (const id of ids) {
        seeds.add(id);
        explicit.add(id);
        const node = this.nodes.get(id)!;
        if (node.kind === "file") {
          for (const e of this.outEdges.get(id) ?? []) {
            if (e.kind === "contains" && this.nodes.get(e.to)?.exported) seeds.add(e.to);
          }
        } else if (node.kind === "class" || node.kind === "interface") {
          // Modifier une classe touche aussi les appelants de ses méthodes
          for (const e of this.outEdges.get(id) ?? []) if (e.kind === "contains") seeds.add(e.to);
        }
      }
    }

    // BFS inverse
    const visited = new Map<string, ImpactedNode>();
    const queue: Array<{ id: string; depth: number; path: string[] }> = [];
    for (const s of seeds) queue.push({ id: s, depth: 0, path: [s] });
    const seedSet = new Set(seeds);
    let maxDepthReached = false;
    let truncated = false;

    while (queue.length) {
      const { id, depth, path: chain } = queue.shift()!;
      if (depth >= maxDepth) {
        if ((this.inEdges.get(id) ?? []).some((e) => IMPACT_EDGE_KINDS.has(e.kind))) maxDepthReached = true;
        continue;
      }
      for (const e of this.inEdges.get(id) ?? []) {
        if (!IMPACT_EDGE_KINDS.has(e.kind)) continue;
        if (seedSet.has(e.from) || visited.has(e.from)) continue;
        if (visited.size >= maxNodes) { truncated = true; break; }
        const n = this.nodes.get(e.from)!;
        const nextPath = [...chain, e.from];
        visited.set(e.from, {
          id: n.id,
          name: n.className ? `${n.className}.${n.name}` : n.name,
          kind: n.kind,
          filePath: n.filePath,
          line: e.line,
          distance: depth + 1,
          via: e.kind,
          path: nextPath,
        });
        // Un fichier est une feuille : la propagation passe par ses SYMBOLES (arêtes
        // précises), pas par le graphe d'imports transitif qui surestime l'impact.
        // Les barils sont déjà court-circuités par resolveExport().
        if (n.kind === "file") continue;
        queue.push({ id: e.from, depth: depth + 1, path: nextPath });
      }
      if (truncated) break;
    }

    // Agrégation par fichier
    const seedFiles = new Set([...seeds].map((s) => this.nodes.get(s)!.filePath));
    const byFile = new Map<string, ImpactedFile>();
    for (const imp of visited.values()) {
      if (seedFiles.has(imp.filePath) && imp.kind === "file") continue;
      const f = byFile.get(imp.filePath) ?? { filePath: imp.filePath, distance: imp.distance, symbols: [], isTest: isTestFile(imp.filePath) };
      f.distance = Math.min(f.distance, imp.distance);
      if (imp.kind !== "file") f.symbols.push(imp.name);
      byFile.set(imp.filePath, f);
    }
    const impactedFiles = [...byFile.values()]
      .filter((f) => !seedFiles.has(f.filePath) || f.symbols.length > 0)
      .sort((a, b) => a.distance - b.distance || a.filePath.localeCompare(b.filePath));

    // Tests
    const tests = new Set<string>();
    const untested: string[] = [];
    for (const f of [...seedFiles, ...impactedFiles.map((x) => x.filePath)]) {
      if (isTestFile(f)) { tests.add(f); continue; }
      const t = this.testsFor(f);
      t.forEach((x) => tests.add(x));
      if (!t.length) untested.push(f);
    }

    const targets = [...explicit]
      .map((id) => this.nodes.get(id)!)
      .map((n) => ({ id: n.id, name: n.className ? `${n.className}.${n.name}` : n.name, kind: n.kind, filePath: n.filePath, exported: n.exported }));

    const impacted = [...visited.values()].sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
    const { risk, score, warnings } = this.assessRisk(targets, impacted, impactedFiles, untested, maxDepthReached, truncated);

    const report: CodeMapImpactReport = {
      targets,
      unresolved,
      ambiguous,
      impacted,
      impactedFiles,
      testsToRun: [...tests].sort(),
      untestedFiles: untested.filter((f) => !isTestFile(f)).sort(),
      risk,
      riskScore: score,
      warnings,
      maxDepthReached,
      truncated,
      summary: "",
    };
    report.summary = renderImpactSummary(report);
    return report;
  }

  private assessRisk(
    targets: CodeMapImpactReport["targets"],
    impacted: ImpactedNode[],
    files: ImpactedFile[],
    untested: string[],
    maxDepthReached: boolean,
    truncated: boolean,
  ): { risk: CodeMapRisk; score: number; warnings: string[] } {
    const warnings: string[] = [];
    const prodFiles = files.filter((f) => !f.isTest);
    const directFiles = new Set(impacted.filter((i) => i.distance === 1).map((i) => i.filePath));
    const dirs = new Set(prodFiles.map((f) => f.filePath.split("/").slice(0, 2).join("/")));

    let score = 0;
    score += Math.min(40, prodFiles.length * 4);
    score += Math.min(20, directFiles.size * 3);
    score += Math.min(15, Math.max(0, dirs.size - 1) * 5);
    const exportedTargets = targets.filter((t) => t.exported);
    if (exportedTargets.length) score += 10;
    if (untested.filter((f) => !isTestFile(f)).length) score += 10;
    if (maxDepthReached || truncated) score += 5;
    score = Math.min(100, score);

    for (const t of exportedTargets) {
      const users = new Set(
        impacted.filter((i) => i.path[0] === t.id && i.distance === 1 && i.filePath !== t.filePath).map((i) => i.filePath),
      );
      if (users.size > 0) {
        const testUsers = [...users].filter(isTestFile).length;
        const detail = testUsers ? ` (dont ${testUsers} de test)` : "";
        warnings.push(`${t.name} est exporté et utilisé directement par ${users.size} fichier(s)${detail} : tout changement de signature, de type ou de comportement doit y être répercuté.`);
      }
    }
    const typeTargets = targets.filter((t) => TYPE_LIKE.has(t.kind));
    if (typeTargets.length) {
      warnings.push(`Modification de type(s) (${typeTargets.map((t) => t.name).join(", ")}) : lancer le typecheck complet, les erreurs apparaîtront chez les consommateurs.`);
    }
    const untestedProd = untested.filter((f) => !isTestFile(f));
    if (untestedProd.length) warnings.push(`${untestedProd.length} fichier(s) impacté(s) sans test connu.`);
    if (truncated) warnings.push("Analyse tronquée (trop de nœuds) : l'impact réel est plus large.");
    else if (maxDepthReached) warnings.push("Profondeur maximale atteinte : des impacts indirects plus lointains existent.");

    const risk: CodeMapRisk = score >= 70 ? "critical" : score >= 45 ? "high" : score >= 20 ? "medium" : "low";
    return { risk, score, warnings };
  }

  /** Vue sérialisable (éventuellement filtrée par préfixe de chemin) pour l'UI. */
  toJSON(opts: { pathPrefix?: string; maxNodes?: number; includeFiles?: boolean } = {}): { nodes: CodeMapNode[]; edges: CodeMapEdge[]; stats: CodeMapStats } {
    this.ensureFresh();
    const prefix = opts.pathPrefix ? normalizeCodePath(opts.pathPrefix) : "";
    const max = opts.maxNodes ?? 2000;
    const nodes: CodeMapNode[] = [];
    for (const n of this.nodes.values()) {
      if (prefix && !n.filePath.startsWith(prefix)) continue;
      if (opts.includeFiles === false && n.kind === "file") continue;
      nodes.push(n);
      if (nodes.length >= max) break;
    }
    const ids = new Set(nodes.map((n) => n.id));
    const edges: CodeMapEdge[] = [];
    for (const list of this.outEdges.values()) for (const e of list) if (ids.has(e.from) && ids.has(e.to)) edges.push(e);
    return { nodes, edges, stats: this.getStats() };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Rendu texte (contexte LLM compact)
// ═══════════════════════════════════════════════════════════════════════════════

const RISK_LABEL: Record<CodeMapRisk, string> = { low: "FAIBLE", medium: "MOYEN", high: "ÉLEVÉ", critical: "CRITIQUE" };

export function renderImpactSummary(r: CodeMapImpactReport, maxLines = 25): string {
  const out: string[] = [];
  out.push(`Impact ${RISK_LABEL[r.risk]} (${r.riskScore}/100) — ${r.impactedFiles.filter((f) => !f.isTest).length} fichier(s), ${r.impacted.filter((i) => i.kind !== "file").length} symbole(s) touchés.`);
  if (r.targets.length) out.push(`Cibles : ${r.targets.slice(0, 8).map((t) => `${t.name} (${t.kind}, ${t.filePath})`).join("; ")}`);
  if (r.unresolved.length) out.push(`Introuvables : ${r.unresolved.join(", ")}`);
  const direct = r.impacted.filter((i) => i.distance === 1 && i.kind !== "file");
  if (direct.length) {
    out.push("Dépendants directs :");
    for (const i of direct.slice(0, maxLines)) out.push(`  - ${i.name} [${i.kind}] ${i.filePath}${i.line ? `:${i.line}` : ""} (${i.via})`);
    if (direct.length > maxLines) out.push(`  … +${direct.length - maxLines}`);
  }
  const indirect = r.impactedFiles.filter((f) => f.distance > 1 && !f.isTest);
  if (indirect.length) out.push(`Fichiers indirects : ${indirect.slice(0, 15).map((f) => f.filePath).join(", ")}${indirect.length > 15 ? ` … +${indirect.length - 15}` : ""}`);
  if (r.testsToRun.length) out.push(`Tests à relancer : ${r.testsToRun.slice(0, 15).join(", ")}`);
  for (const w of r.warnings) out.push(`⚠ ${w}`);
  return out.join("\n");
}

function fileId(p: string): string {
  return `file:${p}`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(v)));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Instance partagée branchée sur le KnowledgeGraph
// ═══════════════════════════════════════════════════════════════════════════════

const contentCache = new Map<string, { stamp: string; content: string }>();

function readProjectFile(filePath: string, file: FileNode): string | null {
  if (!SELF_ROOT) return null;
  const stamp = `${file.lastModified}|${file.size}`;
  const cached = contentCache.get(filePath);
  if (cached && cached.stamp === stamp) return cached.content;
  try {
    const content = fs.readFileSync(path.join(SELF_ROOT, filePath), "utf-8");
    contentCache.set(filePath, { stamp, content });
    return content;
  } catch {
    contentCache.delete(filePath);
    return null;
  }
}

export const codeMap = new CodeMap(() => ({
  files: knowledgeGraph.getAllFiles(),
  relations: knowledgeGraph.getRelations(),
  astResults: knowledgeGraph.getAllASTResults(),
  readContent: readProjectFile,
}));

// Vivante : toute réindexation (scan, fichier modifié/supprimé) périme la carte.
knowledgeGraph.onUpdate(() => {
  codeMap.invalidate();
});
