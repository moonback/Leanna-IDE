/**
 * promptOverrides — Gestion des surcharges modifiables des prompts .md.
 *
 * Problème résolu :
 *   En application packagée (Electron), le serveur tourne depuis `app.asar`,
 *   une archive EN LECTURE SEULE. Les prompts bundlés (`dist/prompts/*.md`)
 *   y sont lisibles mais NON modifiables → toute écriture lève `ENOENT`/`EROFS`.
 *
 * Solution (même pattern que le .env du projet) :
 *   - On lit depuis un dossier d'overrides PERSISTANT et modifiable, situé sous
 *     `Leanna_CONFIG_PATH` (= userData d'Electron) : `<configBase>/.Leanna/prompts`.
 *   - À défaut d'override pour un fichier donné, on retombe sur le prompt bundlé
 *     (source de vérité en lecture seule).
 *   - Les écritures vont TOUJOURS dans le dossier d'overrides (créé au besoin).
 *
 * Ce module est la source unique de résolution de chemins, utilisée à la fois
 * par le routeur HTTP (`routes/prompts.ts`) et par le chargement des templates
 * (`loader.ts` via SystemPromptBuilder), afin que l'édition prenne effet.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname_compat =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

/**
 * Dossier des prompts BUNDLÉS (lecture seule en prod).
 * Reprend la logique de SystemPromptBuilder.resolvePromptsDir() : le premier
 * dossier contenant `base.md` gagne.
 */
export function resolveBasePromptsDir(): string {
  const candidates = [
    __dirname_compat,
    path.join(__dirname_compat, "prompts"),
    path.join(process.cwd(), "dist", "prompts"),
    path.join(process.cwd(), "server", "runtime", "prompts"),
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, "base.md"))) return dir;
    } catch {
      /* ignore */
    }
  }
  return __dirname_compat;
}

/** Racine de config persistante (userData en prod Electron, cwd en dev). */
function getConfigBase(): string {
  return (
    process.env.Leanna_CONFIG_PATH ||
    process.env.ELECTRON_APP_PATH ||
    process.cwd()
  );
}

/**
 * Dossier d'overrides modifiable : `<configBase>/.Leanna/prompts`.
 * N'est PAS créé par cette fonction (lecture) — voir ensureOverridesDir().
 */
export function resolveOverridesDir(): string {
  return path.join(getConfigBase(), ".Leanna", "prompts");
}

/** Crée le dossier d'overrides s'il n'existe pas et le renvoie. */
export function ensureOverridesDir(): string {
  const dir = resolveOverridesDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Vrai si `name` est un nom de fichier `.md` simple, sans composante de chemin. */
export function isValidMarkdownName(name: string): boolean {
  if (typeof name !== "string" || name.length === 0) return false;
  if (!name.toLowerCase().endsWith(".md")) return false;
  if (name.includes("/") || name.includes("\\") || name.includes("..")) return false;
  if (path.basename(name) !== name) return false;
  return true;
}

/** Chemin absolu du fichier bundlé (peut ne pas exister). */
export function basePathFor(name: string): string {
  return path.join(resolveBasePromptsDir(), name);
}

/** Chemin absolu du fichier d'override (peut ne pas exister). */
export function overridePathFor(name: string): string {
  return path.join(resolveOverridesDir(), name);
}

/** Vrai si une surcharge existe pour ce fichier. */
export function isOverridden(name: string): boolean {
  try {
    return fs.existsSync(overridePathFor(name));
  } catch {
    return false;
  }
}

/**
 * Chemin EFFECTIF à lire pour un fichier : l'override s'il existe, sinon le
 * fichier bundlé. Renvoie null si aucun des deux n'existe.
 */
export function effectivePathFor(name: string): string | null {
  const ov = overridePathFor(name);
  if (fs.existsSync(ov)) return ov;
  const base = basePathFor(name);
  if (fs.existsSync(base)) return base;
  return null;
}

/**
 * Liste l'union des noms de fichiers `.md` : ceux du dossier bundlé + ceux
 * présents uniquement en override. Trié alphabétiquement.
 */
export function listPromptNames(): string[] {
  const names = new Set<string>();
  for (const dir of [resolveBasePromptsDir(), resolveOverridesDir()]) {
    try {
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        if (f.toLowerCase().endsWith(".md")) names.add(f);
      }
    } catch {
      /* ignore */
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** Écrit (ou crée) une surcharge pour `name`. Le dossier est créé au besoin. */
export function writeOverride(name: string, content: string): void {
  ensureOverridesDir();
  fs.writeFileSync(overridePathFor(name), content, "utf-8");
}

/**
 * Supprime la surcharge d'un fichier (retour à la version bundlée).
 * No-op si aucune surcharge n'existe.
 */
export function removeOverride(name: string): void {
  const ov = overridePathFor(name);
  try {
    if (fs.existsSync(ov)) fs.unlinkSync(ov);
  } catch {
    /* ignore */
  }
}
