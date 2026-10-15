/**
 * Résolution des spécificateurs d'import vers les chemins de fichiers connus.
 *
 * Module feuille (aucune dépendance interne) partagé par KnowledgeGraph et
 * CodeMap : CodeMap importe KnowledgeGraph au niveau module, l'inverse
 * créerait un cycle d'évaluation.
 */

import path from "path";

const JS_TO_TS_EXT: Record<string, string[]> = {
  ".js": [".ts", ".tsx"],
  ".jsx": [".tsx"],
  ".mjs": [".mts"],
  ".cjs": [".cts"],
};
export const RESOLVE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".json"];

export function normalizeCodePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/^\/+/, "");
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
