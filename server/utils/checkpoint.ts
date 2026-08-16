/**
 * checkpoint.ts — Système de sauvegarde automatique avant chaque auto-modification.
 *
 * Avant toute écriture/suppression sur le code source, un commit git local
 * "checkpoint" est créé pour permettre un rollback trivial.
 * Après une série de modifications, une validation (tsc) est lancée.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { SELF_ROOT, hasProject } from "./selfRoot";

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 10_000;
const MAX_BUFFER = 2 * 1024 * 1024;

/**
 * Vérifie si Git est activé dans le profil courant.
 * Retourne false si gitEnabled === false explicitement.
 */
let _getProfile: (() => { gitEnabled?: boolean }) | null = null;
export function setCheckpointProfileGetter(getter: () => { gitEnabled?: boolean }) {
  _getProfile = getter;
}

import * as fs from "fs";
import * as path from "path";

function isGitEnabled(): boolean {
  try {
    const root = getProjectRoot();
    if (!fs.existsSync(path.join(root, ".git"))) return false;
  } catch {
    return false;
  }
  if (!_getProfile) return true; // activé par défaut si pas de getter configuré
  return _getProfile().gitEnabled !== false;
}

function getProjectRoot(): string {
  if (!hasProject() || !SELF_ROOT.trim()) {
    throw new Error("Aucun projet actif. Sélectionnez un projet avant de créer ou restaurer un checkpoint.");
  }
  return SELF_ROOT;
}

async function git(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const workDir = getProjectRoot();
  const result = await execFileAsync("git", args, {
    cwd: workDir,
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return { stdout: result.stdout || "", stderr: result.stderr || "" };
}

/**
 * Crée un commit checkpoint avant une modification.
 * Si le working tree est propre, ne fait rien.
 * Retourne le hash du commit créé, ou null si rien à commiter.
 */
export async function createCheckpoint(reason: string): Promise<string | null> {
  // Skip si git est désactivé dans le profil
  if (!isGitEnabled()) {
    return null;
  }

  try {
    // Utiliser le cache Git pour éviter un spawn inutile si le statut est déjà connu
    let hasChanges: boolean | null = null;
    try {
      const { gitStatusCache } = await import("../skills/git");
      const cached = gitStatusCache.get(getProjectRoot());
      if (cached && cached.files) {
        hasChanges = cached.files.length > 0;
      }
    } catch { /* cache indisponible, fallback ci-dessous */ }

    if (hasChanges === null) {
      const { stdout: status } = await git(["status", "--porcelain"]);
      hasChanges = status.trim().length > 0;
    }

    if (!hasChanges) {
      return null; // Rien à sauvegarder
    }

    // Stage tout et commit
    await git(["add", "-A"]);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const message = `[checkpoint] ${timestamp} — ${reason}`;
    await git(["commit", "-m", message, "--no-verify"]);

    // Invalider le cache git (le commit change l'état)
    try {
      const { gitStatusCache } = await import("../skills/git");
      gitStatusCache.invalidate(getProjectRoot());
    } catch { /* non bloquant */ }

    // Récupérer le hash
    const { stdout: hash } = await git(["rev-parse", "HEAD"]);
    console.log(`[Checkpoint] Créé: ${hash.trim().slice(0, 8)} — ${reason}`);
    return hash.trim();
  } catch (e: any) {
    console.warn(`[Checkpoint] Échec (non bloquant): ${e.message}`);
    return null;
  }
}

/**
 * Rollback vers un commit spécifique (soft reset pour garder les fichiers
 * dans le working tree, permettant à l'utilisateur de voir ce qui a changé).
 */
export async function rollbackToCheckpoint(commitHash: string): Promise<boolean> {
  if (!isGitEnabled()) {
    console.warn(`[Checkpoint] Git désactivé — rollback impossible`);
    return false;
  }
  try {
    await git(["reset", "--soft", commitHash]);
    console.log(`[Checkpoint] Rollback vers: ${commitHash.slice(0, 8)}`);
    return true;
  } catch (e: any) {
    console.error(`[Checkpoint] Rollback échoué: ${e.message}`);
    return false;
  }
}

/**
 * Liste les derniers checkpoints créés par l'IA.
 */
export async function listCheckpoints(count = 10): Promise<Array<{ hash: string; date: string; message: string }>> {
  if (!isGitEnabled()) return [];
  try {
    const { stdout } = await git([
      "log",
      `--max-count=${count}`,
      "--grep=[checkpoint]",
      "--format=%H|%aI|%s",
    ]);
    return stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash, date, ...msgParts] = line.split("|");
        return { hash, date, message: msgParts.join("|") };
      });
  } catch {
    return [];
  }
}

/**
 * Valide le code après modifications (tsc --noEmit).
 * Retourne { valid: true } ou { valid: false, errors: string }.
 */
export async function validateBuild(): Promise<{ valid: boolean; errors?: string }> {
  try {
    await execFileAsync("npx", ["tsc", "--noEmit"], {
      cwd: SELF_ROOT,
      timeout: 60_000,
      maxBuffer: MAX_BUFFER,
      shell: false,
      env: { ...process.env },
    });
    return { valid: true };
  } catch (e: any) {
    const output = (e.stdout || "") + "\n" + (e.stderr || "");
    // Distinguer une erreur d'exécution (npx introuvable) d'une erreur TypeScript
    if (e.code === "ENOENT" || (e.message && e.message.includes("ENOENT"))) {
      console.error(`[Checkpoint] npx introuvable — vérifier que Node.js est dans le PATH`);
      return { valid: false, errors: "npx introuvable dans le PATH. Vérifier l'installation de Node.js." };
    }
    console.warn(`[Checkpoint] Validation échouée:\n${output.slice(0, 500)}`);
    return { valid: false, errors: output.trim() };
  }
}
