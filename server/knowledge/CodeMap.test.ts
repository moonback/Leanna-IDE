import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CodeMap,
  maskCommentsAndStrings,
  parseImportStatements,
  resolveImportSpecifier,
  type CodeMapSource,
} from "./CodeMap.js";
import type { CodeEntity, FileNode } from "./types.js";

// ─── Mini-projet en mémoire ───────────────────────────────────────────────────

const FIXTURE: Record<string, string> = {
  "src/types.ts": [
    "export interface User { id: string; name: string }",
    "export type Role = \"admin\" | \"user\";",
  ].join("\n"),
  "src/repo.ts": [
    "import type { User } from \"./types.js\";",
    "export class BaseRepo { count(): number { return 0; } }",
    "export class UserRepo extends BaseRepo {",
    "  find(id: string): User | null {",
    "    return null;",
    "  }",
    "}",
    "export function makeRepo(): UserRepo {",
    "  return new UserRepo();",
    "}",
  ].join("\n"),
  "src/index.ts": [
    "export { makeRepo } from \"./repo.js\";",
    "export * from \"./types.js\";",
  ].join("\n"),
  "src/service.ts": [
    "import { makeRepo, type User } from \"./index.js\";",
    "// makeRepo() cité dans un commentaire ne compte pas",
    "export const label = \"makeRepo()\";",
    "export function getUser(id: string): User | null {",
    "  const repo = makeRepo();",
    "  return repo.find(id);",
    "}",
    "export function unrelated(): number {",
    "  return 42;",
    "}",
  ].join("\n"),
  "src/api.ts": [
    "import * as svc from \"./service.js\";",
    "export function handler(id: string) {",
    "  return svc.getUser(id);",
    "}",
  ].join("\n"),
  "src/other.ts": [
    "export function unrelated(): string {",
    "  return \"x\";",
    "}",
  ].join("\n"),
  "src/service.test.ts": [
    "import { getUser } from \"./service.js\";",
    "getUser(\"1\");",
  ].join("\n"),
};

/** Fin de bloc par comptage d'accolades à partir de la ligne `i` (0-based). */
function blockEnd(lines: string[], i: number): number {
  let depth = 0;
  let opened = false;
  for (let j = i; j < lines.length; j++) {
    for (const ch of lines[j]) {
      if (ch === "{") { depth++; opened = true; }
      if (ch === "}") depth--;
    }
    if (opened && depth <= 0) return j + 1;
  }
  return i + 1;
}

/** Extraction minimale d'entités, à la manière de ProjectIndexer. */
function entitiesOf(filePath: string, content: string): { entities: CodeEntity[]; exports: string[] } {
  const lines = content.split("\n");
  const entities: CodeEntity[] = [];
  const exports: string[] = [];
  lines.forEach((text, i) => {
    const exported = /^export\s/.test(text);
    const push = (name: string, type: CodeEntity["type"], end?: number) => {
      entities.push({ name, type, filePath, lineStart: i + 1, lineEnd: end, modifiers: exported ? ["export"] : undefined });
      if (exported) exports.push(name);
    };
    let m: RegExpMatchArray | null;
    if ((m = text.match(/^(?:export\s+)?class\s+(\w+)/))) push(m[1], "class", blockEnd(lines, i));
    else if ((m = text.match(/^(?:export\s+)?interface\s+(\w+)/))) push(m[1], "interface", blockEnd(lines, i));
    else if ((m = text.match(/^(?:export\s+)?type\s+(\w+)/))) push(m[1], "type");
    else if ((m = text.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/))) push(m[1], "function", blockEnd(lines, i));
    else if ((m = text.match(/^(?:export\s+)?const\s+(\w+)/))) push(m[1], "constant");
    else if ((m = text.match(/^ {2}(\w+)\(.*\).*\{\s*$/))) push(m[1], "method", blockEnd(lines, i));
  });
  return { entities, exports };
}

/**
 * `bare` reproduit l'index persisté réel : ni méthodes, ni fin de bloc des
 * classes (seul l'AST Tree-sitter en mémoire les fournit).
 */
function makeSource(files: Record<string, string>, opts: { bare?: boolean } = {}): CodeMapSource {
  const nodes: FileNode[] = Object.entries(files).map(([p, content]) => {
    const extracted = entitiesOf(p, content);
    const exports = extracted.exports;
    let entities = extracted.entities;
    if (opts.bare) {
      entities = entities
        .filter((e) => e.type !== "method")
        .map((e) => (e.type === "class" ? { ...e, lineEnd: undefined } : e));
    }
    return {
      path: p,
      name: p.split("/").pop()!,
      extension: ".ts",
      size: content.length,
      lines: content.split("\n").length,
      lastModified: "2026-01-01T00:00:00.000Z",
      entities,
      imports: [],
      exports,
      language: "typescript",
    };
  });
  return { files: nodes, readContent: (p) => files[p] ?? null };
}

function buildMap(files: Record<string, string> = FIXTURE): CodeMap {
  return new CodeMap(() => makeSource(files));
}

const hasEdge = (map: CodeMap, from: string, to: string, kind?: string) =>
  map.getOutgoing(from).some((e) => e.to === to && (!kind || e.kind === kind));

// ─── Utilitaires ──────────────────────────────────────────────────────────────

describe("CodeMap — utilitaires", () => {
  const known = new Set(["src/a.ts", "src/lib/index.ts", "src/c.tsx", "server/x.ts"]);

  it("résout les spécificateurs ESM .js vers .ts, les index et les alias", () => {
    assert.equal(resolveImportSpecifier("src/b.ts", "./a.js", known), "src/a.ts");
    assert.equal(resolveImportSpecifier("src/b.ts", "./a", known), "src/a.ts");
    assert.equal(resolveImportSpecifier("src/b.ts", "./lib", known), "src/lib/index.ts");
    assert.equal(resolveImportSpecifier("src/b.ts", "./c.jsx", known), "src/c.tsx");
    assert.equal(resolveImportSpecifier("src/deep/b.ts", "@/a", known), "src/a.ts");
    assert.equal(resolveImportSpecifier("src\\deep\\b.ts", "../../server/x.js", known), "server/x.ts");
    assert.equal(resolveImportSpecifier("src/b.ts", "react", known), null);
    assert.equal(resolveImportSpecifier("src/b.ts", "./absent.js", known), null);
  });

  it("analyse les clauses d'import/export", () => {
    const src = [
      "import Def, { A, B as C, type D } from \"./x.js\";",
      "import * as ns from \"./y.js\";",
      "export { E as F } from \"./z.js\";",
      "export * from \"./w.js\";",
      "export interface Body {",
      "  a: string;",
      "}",
      "import {",
      "  G,",
      "} from \"./g.js\";",
    ].join("\n");
    const parsed = parseImportStatements(maskCommentsAndStrings(src));
    assert.equal(parsed.length, 5);
    assert.deepEqual(parsed[0].named, [
      { imported: "A", local: "A" },
      { imported: "B", local: "C" },
      { imported: "D", local: "D" },
      { imported: "default", local: "Def" },
    ]);
    assert.equal(parsed[1].namespace, "ns");
    assert.deepEqual(parsed[2].named, [{ imported: "E", local: "F" }]);
    assert.equal(parsed[2].isExport, true);
    assert.equal(parsed[3].star, true);
    // Le corps de l'interface ne doit pas être confondu avec une clause d'import
    assert.equal(parsed[4].spec, "./g.js");
    assert.equal(parsed[4].line, 8);
    assert.deepEqual(parsed[4].named, [{ imported: "G", local: "G" }]);
  });

  it("analyse les imports dynamiques et CommonJS liés à un nom", () => {
    const src = [
      "async function f() {",
      "  const { a, b: c } = await import(\"./x.js\");",
      "  const ns = require(\"./y\");",
      "}",
    ].join("\n");
    const parsed = parseImportStatements(maskCommentsAndStrings(src));
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].line, 2);
    assert.deepEqual(parsed[0].named, [{ imported: "a", local: "a" }, { imported: "b", local: "c" }]);
    assert.equal(parsed[1].namespace, "ns");
    assert.equal(parsed[1].spec, "./y");
  });

  it("masque commentaires et chaînes en conservant les lignes et les spécificateurs", () => {
    const src = "const a = \"foo()\"; // bar()\n/* baz()\n*/ import x from \"./x.js\";";
    const masked = maskCommentsAndStrings(src);
    assert.equal(masked.split("\n").length, 3);
    assert.ok(!masked.includes("foo"));
    assert.ok(!masked.includes("bar"));
    assert.ok(!masked.includes("baz"));
    assert.ok(masked.includes("\"./x.js\""));
  });
});

// ─── Construction du graphe ───────────────────────────────────────────────────

describe("CodeMap — construction", () => {
  it("crée nœuds fichiers, symboles, méthodes et arêtes contains", () => {
    const map = buildMap();
    assert.equal(map.getNode("file:src/repo.ts")?.kind, "file");
    assert.equal(map.getNode("src/repo.ts#UserRepo")?.kind, "class");
    assert.equal(map.getNode("src/repo.ts#UserRepo.find")?.kind, "method");
    assert.equal(map.getNode("src/types.ts#User")?.kind, "interface");
    assert.ok(hasEdge(map, "file:src/repo.ts", "src/repo.ts#UserRepo", "contains"));
    assert.ok(hasEdge(map, "src/repo.ts#UserRepo", "src/repo.ts#UserRepo.find", "contains"));
  });

  it("relie imports de fichiers, symboles importés et réexports via baril", () => {
    const map = buildMap();
    assert.ok(hasEdge(map, "file:src/service.ts", "file:src/index.ts", "imports"));
    // Le baril est traversé : l'import pointe vers la définition d'origine
    assert.ok(hasEdge(map, "file:src/service.ts", "src/repo.ts#makeRepo", "imports_symbol"));
    assert.ok(hasEdge(map, "file:src/service.ts", "src/types.ts#User", "imports_symbol"));
    assert.ok(hasEdge(map, "file:src/index.ts", "src/repo.ts#makeRepo", "re_exports"));
  });

  it("détecte appels, références de type, héritage et espaces de noms", () => {
    const map = buildMap();
    assert.ok(hasEdge(map, "src/service.ts#getUser", "src/repo.ts#makeRepo", "calls"));
    assert.ok(hasEdge(map, "src/service.ts#getUser", "src/types.ts#User", "references_type"));
    assert.ok(hasEdge(map, "src/repo.ts#UserRepo.find", "src/types.ts#User", "references_type"));
    assert.ok(hasEdge(map, "src/repo.ts#UserRepo", "src/repo.ts#BaseRepo", "extends"));
    assert.ok(hasEdge(map, "src/repo.ts#makeRepo", "src/repo.ts#UserRepo", "calls"));
    assert.ok(hasEdge(map, "src/api.ts#handler", "src/service.ts#getUser", "calls"));
    assert.ok(hasEdge(map, "file:src/service.test.ts", "file:src/service.ts", "tests"));
  });

  it("ignore les mentions dans les commentaires et les chaînes", () => {
    const map = buildMap();
    assert.ok(!hasEdge(map, "src/service.ts#label", "src/repo.ts#makeRepo"));
    assert.ok(!hasEdge(map, "file:src/service.ts", "src/repo.ts#makeRepo", "calls"));
  });
});

// ─── Analyse d'impact ─────────────────────────────────────────────────────────

describe("CodeMap — analyse d'impact", () => {
  it("propage l'impact d'une fonction à ses appelants directs et transitifs", () => {
    const map = buildMap();
    const r = map.analyzeImpact(["src/repo.ts#makeRepo"]);
    const byId = new Map(r.impacted.map((i) => [i.id, i]));

    assert.equal(r.targets.length, 1);
    assert.equal(byId.get("src/service.ts#getUser")?.distance, 1);
    assert.equal(byId.get("src/service.ts#getUser")?.via, "calls");
    assert.equal(byId.get("src/api.ts#handler")?.distance, 2);
    assert.deepEqual(byId.get("src/api.ts#handler")?.path, [
      "src/repo.ts#makeRepo",
      "src/service.ts#getUser",
      "src/api.ts#handler",
    ]);
    assert.ok(!byId.has("src/service.ts#unrelated"), "un symbole voisin non lié ne doit pas être impacté");
    assert.ok(r.impactedFiles.some((f) => f.filePath === "src/api.ts"));
    assert.ok(r.testsToRun.includes("src/service.test.ts"));
    assert.ok(r.summary.includes("getUser"));
  });

  it("respecte la profondeur maximale et le signale", () => {
    const map = buildMap();
    const r = map.analyzeImpact(["src/repo.ts#makeRepo"], { maxDepth: 1 });
    assert.ok(!r.impacted.some((i) => i.id === "src/api.ts#handler"));
    assert.equal(r.maxDepthReached, true);
  });

  it("signale les consommateurs d'un type et recommande le typecheck", () => {
    const map = buildMap();
    const r = map.analyzeImpact(["User"]);
    const ids = r.impacted.map((i) => i.id);
    assert.ok(ids.includes("src/repo.ts#UserRepo.find"));
    assert.ok(ids.includes("src/service.ts#getUser"));
    assert.ok(r.warnings.some((w) => w.includes("typecheck")));
  });

  it("une cible fichier inclut ses symboles exportés", () => {
    const map = buildMap();
    const r = map.analyzeImpact(["src/service.ts"]);
    assert.ok(r.impacted.some((i) => i.id === "src/api.ts#handler"));
    assert.ok(r.testsToRun.includes("src/service.test.ts"));
  });

  it("rapporte les références introuvables et ambiguës", () => {
    const map = buildMap();
    const r = map.analyzeImpact(["doesNotExist", "unrelated"]);
    assert.deepEqual(r.unresolved, ["doesNotExist"]);
    assert.equal(r.ambiguous.length, 1);
    assert.equal(r.ambiguous[0].candidates.length, 2);
  });

  it("décrit un symbole (utilisateurs, dépendances, membres, tests)", () => {
    const map = buildMap();
    const d = map.describe("src/service.ts#getUser")!;
    assert.ok(d.usedBy.some((u) => u.id === "src/api.ts#handler"));
    assert.ok(d.uses.some((u) => u.id === "src/repo.ts#makeRepo"));
    assert.deepEqual(d.tests, ["src/service.test.ts"]);
    const cls = map.describe("src/repo.ts#UserRepo")!;
    assert.ok(cls.members.some((m) => m.name === "find"));
    assert.equal(map.findSymbols("getus")[0]?.id, "src/service.ts#getUser");
  });
});

// ─── Index sans AST : extraction depuis le source ─────────────────────────────

const STORE_FIXTURE: Record<string, string> = {
  "src/store.ts": [
    "export class Store {",
    "  private items: string[] = [];",
    "  add(item: string): void {",
    "    this.items.push(item);",
    "    this.notify();",
    "  }",
    "  private notify(): void {",
    "    return;",
    "  }",
    "  static create(): Store {",
    "    return new Store();",
    "  }",
    "}",
    "export const store = new Store();",
  ].join("\n"),
  "src/useStore.ts": [
    "import { store, Store } from \"./store.js\";",
    "export function addTwice(x: string) {",
    "  store.add(x);",
    "  store?.add(x);",
    "}",
    "export function fresh() {",
    "  return Store.create();",
    "}",
  ].join("\n"),
};

describe("CodeMap — index sans AST", () => {
  const map = new CodeMap(() => makeSource(STORE_FIXTURE, { bare: true }));

  it("retrouve la fin des classes et leurs méthodes depuis le source", () => {
    assert.equal(map.getNode("src/store.ts#Store")?.lineEnd, 13);
    for (const m of ["add", "notify", "create"]) {
      assert.equal(map.getNode(`src/store.ts#Store.${m}`)?.kind, "method", m);
    }
    assert.equal(map.getNode("src/store.ts#Store.items"), undefined, "une propriété n'est pas une méthode");
  });

  it("résout this.m(), singleton.m() et Classe.statique()", () => {
    assert.ok(hasEdge(map, "src/store.ts#Store.add", "src/store.ts#Store.notify", "calls"));
    assert.ok(hasEdge(map, "src/useStore.ts#addTwice", "src/store.ts#Store.add", "calls"));
    assert.ok(hasEdge(map, "src/useStore.ts#fresh", "src/store.ts#Store.create", "calls"));
  });

  it("propage l'impact d'une méthode privée jusqu'aux consommateurs du singleton", () => {
    const r = map.analyzeImpact(["Store.notify"]);
    const byId = new Map(r.impacted.map((i) => [i.id, i.distance]));
    assert.equal(byId.get("src/store.ts#Store.add"), 1);
    assert.equal(byId.get("src/useStore.ts#addTwice"), 2);
    assert.ok(!byId.has("src/useStore.ts#fresh"));
  });
});

// ─── Carte vivante ────────────────────────────────────────────────────────────

describe("CodeMap — carte vivante", () => {
  it("se reconstruit après invalidation et reflète le nouveau code", () => {
    const files = { ...FIXTURE };
    const map = buildMap(files);
    let rebuilt = 0;
    map.onRebuilt(() => rebuilt++);

    assert.ok(map.analyzeImpact(["src/repo.ts#makeRepo"]).impacted.some((i) => i.id === "src/service.ts#getUser"));
    const v1 = map.getStats().version;

    files["src/service.ts"] = files["src/service.ts"].replace("const repo = makeRepo();", "const repo = null as any;");
    // Sans invalidation, la carte reste sur l'état précédent
    assert.ok(map.analyzeImpact(["src/repo.ts#makeRepo"]).impacted.some((i) => i.id === "src/service.ts#getUser"));

    map.invalidate();
    assert.equal(map.isStale(), true);
    const r = map.analyzeImpact(["src/repo.ts#makeRepo"]);
    assert.ok(!r.impacted.some((i) => i.id === "src/service.ts#getUser"));
    assert.equal(map.getStats().version, v1 + 1);
    assert.equal(rebuilt, 2);
  });
});
