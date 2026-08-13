/**
 * selfRoot.ts — Source unique de vérité pour le répertoire racine du projet actif.
 *
 * Jarvis-OS est un IDE universel multi-projets : l'utilisateur choisit un projet
 * externe via la modal de sélection, l'IA travaille dessus, et peut en changer
 * à tout moment. Ce module centralise la résolution du root (SELF_ROOT) et
 * fournit les garde-fous de chemin utilisés par tous les skills et routes.
 *
 * NOUVEAU : Au démarrage sans projet sélectionné, SELF_ROOT est "" (vide).
 * Toutes les initialisations dépendantes du projet (ProjectMemory, Sandbox,
 * KnowledgeGraph) sont déclenchées uniquement après setSelfRoot().
 */

import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

/**
 * Résout le dossier du module courant de façon robuste.
 * En ESM (dev via tsx), utilise import.meta.url.
 * En CJS bundlé (production esbuild), import.meta.url est vide → fallback sur
 * __dirname natif CJS ou process.cwd().
 */
function resolveModuleDir(): string {
  try {
    // @ts-ignore — import.meta peut être vide en sortie CJS
    const metaUrl = typeof import.meta !== "undefined" ? import.meta.url : "";
    if (metaUrl) {
      return path.dirname(fileURLToPath(metaUrl));
    }
  } catch { /* import.meta indisponible en CJS */ }
  // Fallback CJS : __dirname est défini par le bundle esbuild
  if (typeof __dirname !== "undefined") return __dirname;
  return process.cwd();
}

const __moduleDir = resolveModuleDir();

// ── Jarvis app root (le dossier de Jarvis lui-même, immuable) ─────────────────

/**
 * Résout le dossier de l'app Jarvis (là où tourne server.ts).
 * Utilisé uniquement pour trouver les fichiers de config internes à Jarvis
 * (ex : persistedProject.json). Ne doit PAS être utilisé comme workspace projet.
 */
function resolveJarvisAppRoot(): string {
  // Remonter de server/utils/ → root de l'app Jarvis
  const fromModule = path.resolve(__moduleDir, "..", "..");
  const pkg = path.join(fromModule, "package.json");
  if (fs.existsSync(pkg)) return fromModule;
  return process.cwd();
}

const JARVIS_APP_ROOT = resolveJarvisAppRoot();

// ── Persistance du projet sélectionné ────────────────────────────────────────

/**
 * Fichier de config interne (dans le dossier Jarvis) qui mémorise
 * le dernier projet sélectionné par l'utilisateur.
 * IMPORTANT : situé dans le .jarvis/ du repo Jarvis lui-même,
 * pas dans le workspace projet.
 */
function getPersistedProjectPath(): string {
  return path.join(JARVIS_APP_ROOT, ".jarvis", "lastProject.json");
}

function loadPersistedProject(): string | null {
  try {
    const configPath = getPersistedProjectPath();
    if (!fs.existsSync(configPath)) return null;
    const data = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    if (data?.projectRoot && typeof data.projectRoot === "string") {
      const resolved = path.resolve(data.projectRoot);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        return resolved;
      }
    }
  } catch { /* silent */ }
  return null;
}

function persistProject(projectRoot: string): void {
  try {
    const configPath = getPersistedProjectPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ projectRoot }, null, 2), "utf-8");
  } catch (e: any) {
    console.warn("[SelfRoot] Impossible de persister le projet:", e.message);
  }
}

function clearPersistedProject(): void {
  try {
    const configPath = getPersistedProjectPath();
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
  } catch { /* silent */ }
}

// ── SELF_ROOT ─────────────────────────────────────────────────────────────────

/**
 * Racine du workspace projet actif.
 * "" (chaîne vide) = aucun projet sélectionné (état initial).
 * Peut être changée dynamiquement via setSelfRoot().
 */
export let SELF_ROOT: string = "";

/**
 * Retourne true si un projet est actuellement actif.
 */
export function hasProject(): boolean {
  return SELF_ROOT !== "";
}

/**
 * Initialise SELF_ROOT depuis le projet persisté (si disponible).
 * À appeler UNE SEULE FOIS au démarrage du serveur.
 * Si aucun projet n'est persisté, SELF_ROOT reste "" et
 * le serveur démarre en mode "aucun projet".
 */
export function initSelfRoot(): void {
  // Override explicite (tests/CI uniquement)
  if (process.env.JARVIS_SELF_ROOT_OVERRIDE?.trim()) {
    const override = process.env.JARVIS_SELF_ROOT_OVERRIDE.trim();
    if (fs.existsSync(override) && fs.statSync(override).isDirectory()) {
      SELF_ROOT = path.resolve(override);
      console.log(`[SelfRoot] Override actif: ${SELF_ROOT}`);
      return;
    }
  }

  const persisted = loadPersistedProject();
  if (persisted) {
    SELF_ROOT = persisted;
    console.log(`[SelfRoot] Projet restauré: ${SELF_ROOT}`);
  } else {
    SELF_ROOT = "";
    console.log("[SelfRoot] Aucun projet sélectionné — en attente d'un projet.");
  }
}

/**
 * Change la racine du workspace à chaud.
 * Valide que le chemin existe et contient du code source.
 * Retourne le nouveau chemin ou lève une erreur.
 */
export function setSelfRoot(newPath: string): string {
  const resolved = path.resolve(newPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Le chemin n'existe pas: ${resolved}`);
  }
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`Le chemin n'est pas un dossier: ${resolved}`);
  }
  SELF_ROOT = resolved;
  persistProject(resolved);
  console.log(`[SelfRoot] Jarvis-OS root verrouillé: ${SELF_ROOT}`);
  return SELF_ROOT;
}

/**
 * Réinitialise le workspace : remet SELF_ROOT à "" en mémoire
 * et supprime le fichier de persistance lastProject.json.
 * À appeler quand l'utilisateur veut changer de projet.
 */
export function resetSelfRoot(): void {
  SELF_ROOT = "";
  clearPersistedProject();
  console.log('[SelfRoot] Workspace réinitialisé — aucun projet actif.');
}

// ── Fichiers protégés ────────────────────────────────────────────────────────

/**
 * Fichiers/patterns dont l'écriture ou la suppression nécessitent une
 * confirmation explicite de l'utilisateur (pas d'auto-apply silencieux).
 */
export const CRITICAL_FILES: readonly string[] = [
  "server.ts",
  "server/security.ts",
  "server/utils/selfRoot.ts",
  "electron/main.cjs",
  "electron/preload.cjs",
  ".env",
  ".env.local",
  ".gemini-keys.json",
];

/**
 * Fichiers/dossiers totalement interdits en écriture/suppression,
 * même avec confirmation utilisateur.
 */
export const FORBIDDEN_WRITE_TARGETS: readonly string[] = [
  ".git/config",
  ".git/HEAD",
  "node_modules",
];

// ── Validation de chemin ─────────────────────────────────────────────────────

/**
 * Résout un chemin relatif par rapport au SELF_ROOT et vérifie qu'il
 * ne sort pas du périmètre. Retourne le chemin absolu normalisé ou null.
 * Retourne null si aucun projet n'est actif.
 */
export function normalizeSelfPath(target: string): string | null {
  if (!SELF_ROOT) return null;
  const resolved = path.resolve(SELF_ROOT, target);
  if (resolved === SELF_ROOT || resolved.startsWith(SELF_ROOT + path.sep)) {
    return resolved;
  }
  return null;
}

/**
 * Vérifie qu'un chemin absolu résolu (après normalisation) ne cible pas
 * un fichier interdit en écriture.
 * Retourne true (interdit) si aucun projet actif.
 */
export function isWriteForbidden(absolutePath: string): boolean {
  if (!SELF_ROOT) return true;
  const relative = path.relative(SELF_ROOT, absolutePath).replace(/\\/g, "/");
  return FORBIDDEN_WRITE_TARGETS.some(
    (pattern) => relative === pattern || relative.startsWith(pattern + "/")
  );
}

/**
 * Vérifie si un fichier est critique (nécessite confirmation).
 */
export function isCriticalFile(absolutePath: string): boolean {
  if (!SELF_ROOT) return true;
  const relative = path.relative(SELF_ROOT, absolutePath).replace(/\\/g, "/");
  return CRITICAL_FILES.some(
    (pattern) => relative === pattern || relative.startsWith(pattern + "/")
  );
}

/**
 * SECURITY: Résout les symlinks et vérifie que le chemin réel reste
 * dans le SELF_ROOT. Protège contre les symlink escape attacks.
 */
export async function resolveRealPathWithinSelf(candidatePath: string): Promise<string | null> {
  if (!SELF_ROOT) return null;
  try {
    const [realCandidate, realRoot] = await Promise.all([
      fs.promises.realpath(candidatePath),
      fs.promises.realpath(SELF_ROOT),
    ]);
    if (realCandidate === realRoot || realCandidate.startsWith(realRoot + path.sep)) {
      return realCandidate;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Symlink audit ─────────────────────────────────────────────────────────────

/**
 * Scanne les répertoires source pour détecter des symlinks potentiellement
 * dangereuses qui pourraient permettre de sortir du SELF_ROOT.
 * Ne bloque pas le démarrage — log un avertissement.
 * Ne fait rien si aucun projet n'est actif.
 */
export async function auditSymlinks(): Promise<string[]> {
  if (!SELF_ROOT) return [];
  const suspicious: string[] = [];
  const dirsToScan = ['src', 'server', 'electron'];

  for (const dir of dirsToScan) {
    const fullDir = path.join(SELF_ROOT, dir);
    try {
      await scanForSymlinks(fullDir, suspicious);
    } catch { /* dir might not exist */ }
  }

  if (suspicious.length > 0) {
    console.warn(`[SelfRoot] ⚠️ ${suspicious.length} symlink(s) suspecte(s) détectée(s):`);
    for (const s of suspicious) {
      console.warn(`  → ${s}`);
    }
  }

  return suspicious;
}

async function scanForSymlinks(dir: string, results: string[], depth = 0): Promise<void> {
  if (depth > 5) return;
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        try {
          const realPath = await fs.promises.realpath(fullPath);
          if (!realPath.startsWith(SELF_ROOT)) {
            results.push(`${path.relative(SELF_ROOT, fullPath)} → ${realPath} [HORS PÉRIMÈTRE]`);
          }
        } catch {
          results.push(`${path.relative(SELF_ROOT, fullPath)} → [CASSÉ/INACCESSIBLE]`);
        }
      } else if (entry.isDirectory()) {
        await scanForSymlinks(fullPath, results, depth + 1);
      }
    }
  } catch { /* permission denied or similar */ }
}
