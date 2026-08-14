import fs from "fs";
import path from "path";
import { isWriteForbidden, isCriticalFile } from "../utils/selfRoot";
import { requestConfirmation, type ConfirmationRequest } from "../utils/confirmationBridge";
import { triggerRestartIfNeeded } from "../utils/serverRestart";
import { scheduleValidation } from "../utils/postEditValidator";
import { appendAuditEvent, generateDiffSummary } from "../audit";
import { isSandboxActive, markFileModified } from "../utils/sandbox";
import { createLogger } from "../utils/logger";
import {
  getProjectRoot,
  resolveWritePath,
  resolveSandboxWriteTarget,
  checkWorkspace
} from "./codebaseHelpers";

const log = createLogger("CodebaseWriter");

// ── Rate limiting pour les opérations d'écriture ────────────────────────────
const WRITE_RATE_LIMIT = 30; // max 30 écritures par minute
const WRITE_WINDOW_MS = 60_000;
const writeTimestamps: number[] = [];

function checkWriteRateLimit(): boolean {
  const now = Date.now();
  // Purger les entrées plus vieilles que la fenêtre
  while (writeTimestamps.length > 0 && writeTimestamps[0] < now - WRITE_WINDOW_MS) {
    writeTimestamps.shift();
  }
  if (writeTimestamps.length >= WRITE_RATE_LIMIT) {
    return false; // Rate limited
  }
  writeTimestamps.push(now);
  return true;
}

// ── Garde-fou fichiers critiques ────────────────────────────────────────────

/** Sous-ensemble des opérations de confirmation qui correspondent à une écriture fichier (exclut 'npm-command'). */
type FileOperation = Extract<ConfirmationRequest["operation"], "write" | "modify" | "patch" | "rename" | "delete">;

interface GuardResult {
  blocked: boolean;
  error?: string;
}

/**
 * Vérifie la confirmation utilisateur pour un fichier critique.
 *
 * FAIL-CLOSED : si le fichier est critique et qu'aucun canal de confirmation
 * n'est disponible (appel autonome via AgentOrchestrator/MissionExecutor, qui
 * n'injectent pas toolContext.emitToClient), l'opération est refusée directement.
 */
async function guardCriticalFile(
  critical: boolean,
  requestedPath: string,
  operation: FileOperation,
  toolContext: any,
  reason: string | undefined,
  content?: { proposed?: string; previous?: string; renameTo?: string }
): Promise<GuardResult> {
  if (!critical) return { blocked: false };

  // ── Cas 1 : pas de canal de confirmation interactif (agent/mission autonome)
  if (!toolContext?.emitToClient) {
    console.warn(`[Codebase] Écriture critique bloquée : pas de canal de confirmation interactif pour ${operation} sur ${requestedPath}`);
    return {
      blocked: true,
      error: `Opération refusée : ${requestedPath} est un fichier critique et aucune confirmation interactive n'est possible dans ce contexte d'exécution.`,
    };
  }

  // ── Cas 2 : canal disponible → confirmation interactive classique
  const approved = await requestConfirmation(requestedPath, operation, toolContext.emitToClient, reason);
  if (!approved) {
    return {
      blocked: true,
      error: `Modification refusée par l'utilisateur: ${requestedPath} est un fichier critique.`,
    };
  }

  return { blocked: false };
}

function resolveCurrentSandboxPath(requestedPath: string, expectedPath: string): string | null {
  const currentPath = resolveWritePath(requestedPath);
  return currentPath === expectedPath ? currentPath : null;
}

// ─── Writer Handlers ──────────────────────────────────────────────────────────

export async function handleWriteProjectFile(args: any, toolContext: any) {
  if (!checkWriteRateLimit()) return { error: "Rate limit atteint : trop d'écritures par minute. Attendez avant de modifier d'autres fichiers." };
  if (!checkWorkspace().exists) return { error: "Workspace non disponible.", path: getProjectRoot() };
  const requestedPath = String(args.path || "").trim();
  const content = String(args.content || "");
  if (!requestedPath) return { error: "Le chemin de fichier est requis." };
  const target = resolveSandboxWriteTarget(requestedPath);
  if (!target) return { error: "Chemin invalide ou en dehors du workspace." };
  const normalized = target.sandboxPath;
  // Les politiques portent sur le chemin logique du projet, jamais sur
  // `.jarvis/sandbox/...`, afin de préserver .env/.git et les fichiers critiques.
  if (isWriteForbidden(target.logicalPath)) return { error: `Écriture interdite sur ce fichier protégé: ${requestedPath}` };
  const critical = isCriticalFile(target.logicalPath);

  // La cible réelle est exclusivement le chemin sandbox canonique.
  const writePath = normalized;
  const sandboxMode = isSandboxActive();
  // Lire l'ancien contenu AVANT la confirmation : nécessaire pour le diff
  // d'audit et pour joindre previousContent à une éventuelle proposition.
  let beforeContent: string | null = null;
  try { beforeContent = fs.existsSync(writePath) ? await fs.promises.readFile(writePath, 'utf-8') : null; } catch { /* nouveau fichier */ }

  // Confirmation interactive (ou mise en file d'attente) pour fichiers critiques
  const guard = await guardCriticalFile(
    critical,
    requestedPath,
    'write',
    toolContext,
    `Écriture de ${Buffer.byteLength(content, "utf-8")} octets`,
    { proposed: content, previous: beforeContent ?? undefined }
  );
  if (guard.blocked) return { error: guard.error, critical: true };

  // Checkpoint automatique avant écriture (seulement en mode direct)
  if (!sandboxMode) {
    try {
      const { createCheckpoint } = await import("../utils/checkpoint");
      await createCheckpoint(`avant écriture: ${requestedPath}`);
    } catch { /* non bloquant */ }
  }
  if (!resolveCurrentSandboxPath(requestedPath, writePath)) return { error: "Sandbox indisponible ou chemin modifié — écriture refusée." };
  await fs.promises.mkdir(path.dirname(writePath), { recursive: true });
  await fs.promises.writeFile(writePath, content, "utf-8");
  // Marquer le fichier comme modifié dans le sandbox
  if (sandboxMode) markFileModified(requestedPath);
  console.log(`[Codebase] File written: ${requestedPath}${critical ? ' [CRITIQUE]' : ''}${sandboxMode ? ' [SANDBOX]' : ''}`);
  // Audit enrichi avec diff
  appendAuditEvent({ action: 'write_project_file', target: requestedPath, actor: 'ai', diff: generateDiffSummary(beforeContent, content) }).catch((err) => {
    console.warn(`[Audit] appendAuditEvent failed for write_project_file on ${requestedPath}:`, err);
  });
  toolContext.emitIdeAction?.({ type: "open-file", path: requestedPath });
  toolContext.emitIdeAction?.({ type: "file-changed", path: requestedPath });
  // En mode sandbox, pas de restart ni de validation auto (isolé)
  if (!sandboxMode) {
    triggerRestartIfNeeded(requestedPath);
    scheduleValidation();
  }
  return { status: "success", path: requestedPath, bytesWritten: Buffer.byteLength(content, "utf-8"), critical, sandbox: sandboxMode, message: `File ${requestedPath} written successfully.${sandboxMode ? ' 📦 (sandbox)' : ''}${critical ? ' ⚠️ Fichier critique modifié.' : ''}` };
}

export async function handleModifyProjectFile(args: any, toolContext: any) {
  if (!checkWriteRateLimit()) return { error: "Rate limit atteint : trop d'écritures par minute." };
  if (!checkWorkspace().exists) return { error: "Workspace non disponible.", path: getProjectRoot() };
  const requestedPath = String(args.path || "").trim();
  let searchText = String(args.searchText || "");
  const replaceText = String(args.replaceText ?? "");
  const replaceAll = args.replaceAll === true;
  const startMarker = args.startMarker ? String(args.startMarker).trim() : null;
  const endMarker = args.endMarker ? String(args.endMarker).trim() : null;

  if (!requestedPath) return { error: "Le chemin de fichier est requis. Exemple: modify_project_file({ path: 'src/file.ts', searchText: 'texte exact', replaceText: 'nouveau texte' })" };

  // Mode startMarker/endMarker : le backend construit searchText depuis le fichier
  if (!searchText && startMarker && endMarker) {
    const target = resolveSandboxWriteTarget(requestedPath);
    if (!target) return { error: "Chemin invalide ou en dehors du workspace." };
    if (!fs.existsSync(target.sandboxPath)) return { error: "Fichier introuvable." };
    const content = await fs.promises.readFile(target.sandboxPath, "utf-8");
    const startIdx = content.indexOf(startMarker);
    const endIdx = startIdx >= 0 ? content.indexOf(endMarker, startIdx) : -1;
    if (startIdx === -1) return { error: `startMarker introuvable dans le fichier: "${startMarker.slice(0, 80)}"` };
    if (endIdx === -1) return { error: `endMarker introuvable après startMarker: "${endMarker.slice(0, 80)}"` };
    searchText = content.slice(startIdx, endIdx + endMarker.length);
    log.info(`[modify_project_file] Mode marker: searchText construit (${searchText.length} chars) depuis startMarker/endMarker`);
  }

  if (!searchText) return { error: "searchText est OBLIGATOIRE et ne peut pas être vide. Tu DOIS d'abord lire le fichier avec read_project_file({ path, full: true }) puis copier le texte EXACT à remplacer dans searchText. Alternative: utilise startMarker et endMarker pour délimiter le bloc à remplacer." };
  const target = resolveSandboxWriteTarget(requestedPath);
  if (!target) return { error: "Chemin invalide ou en dehors du workspace." };
  const normalized = target.sandboxPath;
  if (isWriteForbidden(target.logicalPath)) return { error: `Écriture interdite sur ce fichier protégé: ${requestedPath}` };
  if (!fs.existsSync(normalized)) return { error: "Fichier introuvable." };

  const content = await fs.promises.readFile(normalized, "utf-8");
  if (!content.includes(searchText)) {
    // Donner un contexte utile à l'agent pour qu'il corrige
    const firstLines = content.split("\n").slice(0, 5).join("\n");
    return {
      error: `searchText introuvable dans le fichier "${requestedPath}". Le texte fourni ne correspond à aucun passage du fichier. Relis le fichier avec read_project_file({ path: "${requestedPath}", full: true }) et copie le texte EXACT (espaces, indentation, retours à la ligne) que tu veux remplacer.`,
      hint: `Début du fichier:\n${firstLines}`,
      totalLines: content.split("\n").length,
    };
  }

  const occurrences = content.split(searchText).length - 1;
  const newContent = replaceAll
    ? content.split(searchText).join(replaceText)
    : content.replace(searchText, () => replaceText);

  const critical = isCriticalFile(target.logicalPath);
  // Confirmation interactive (ou mise en file d'attente) pour fichiers critiques
  const guard = await guardCriticalFile(
    critical,
    requestedPath,
    'modify',
    toolContext,
    `Remplacement de texte`,
    { proposed: newContent, previous: content }
  );
  if (guard.blocked) return { error: guard.error, critical: true };

  const sandboxMode = isSandboxActive();
  // Checkpoint automatique avant modification (seulement en mode direct)
  if (!sandboxMode) {
    try {
      const { createCheckpoint } = await import("../utils/checkpoint");
      await createCheckpoint(`avant modification: ${requestedPath}`);
    } catch { /* non bloquant */ }
  }
  if (!resolveCurrentSandboxPath(requestedPath, normalized)) return { error: "Sandbox indisponible ou chemin modifié — écriture refusée." };
  await fs.promises.writeFile(normalized, newContent, "utf-8");
  if (sandboxMode) markFileModified(requestedPath);
  console.log(`[Codebase] File modified: ${requestedPath}${critical ? ' [CRITIQUE]' : ''}${sandboxMode ? ' [SANDBOX]' : ''}`);
  appendAuditEvent({ action: 'modify_project_file', target: requestedPath, actor: 'ai', diff: generateDiffSummary(content, newContent) }).catch((err) => {
    console.warn(`[Audit] appendAuditEvent failed for modify_project_file on ${requestedPath}:`, err);
  });
  toolContext.emitIdeAction?.({ type: "open-file", path: requestedPath });
  toolContext.emitIdeAction?.({ type: "file-changed", path: requestedPath });
  if (!sandboxMode) {
    triggerRestartIfNeeded(requestedPath);
    scheduleValidation();
  }
  return { status: "success", path: requestedPath, replacements: replaceAll ? occurrences : 1, critical, sandbox: sandboxMode, message: `File ${requestedPath} modified successfully.${sandboxMode ? ' 📦 (sandbox)' : ''}${critical ? ' ⚠️ Fichier critique modifié.' : ''}` };
}

export async function handlePatchProjectFile(args: any, toolContext: any) {
  if (!checkWriteRateLimit()) return { error: "Rate limit atteint : trop d'écritures par minute." };
  if (!checkWorkspace().exists) return { error: "Workspace non disponible.", path: getProjectRoot() };
  const requestedPath = String(args.path || "").trim();
  if (!requestedPath) return { error: "Le chemin de fichier est requis." };
  if (!args.operations || !Array.isArray(args.operations) || args.operations.length === 0) {
    return { error: "Au moins une opération est requise dans 'operations'." };
  }
  const target = resolveSandboxWriteTarget(requestedPath);
  if (!target) return { error: "Chemin invalide ou en dehors du workspace." };
  const normalized = target.sandboxPath;
  if (isWriteForbidden(target.logicalPath)) return { error: `Écriture interdite sur ce fichier protégé: ${requestedPath}` };
  if (!fs.existsSync(normalized)) return { error: "Fichier introuvable." };

  const raw = await fs.promises.readFile(normalized, "utf-8");
  let lines = raw.split(/\r?\n/);
  let appliedOps = 0;

  const normalizedOps = args.operations.map((op: any) => {
    const startLine = typeof op.startLine === "number" ? op.startLine : 0;
    const endLine = typeof op.endLine === "number" ? op.endLine : startLine;
    return { ...op, __rangeStart: startLine, __rangeEnd: op.type === "insert" ? startLine : endLine };
  });
  const sortedOps = [...normalizedOps].sort((a: any, b: any) => (b.__rangeStart || 0) - (a.__rangeStart || 0));

  // Les opérations sont triées par __rangeStart décroissant :
  //   sortedOps[i].__rangeStart  ≥  sortedOps[i+1].__rangeStart
  // Il y a chevauchement si le début de l'op de plus haut index (a)
  // est ≤ la fin de l'op de plus bas index (b), c'est-à-dire si les
  // plages [b.start, b.end] et [a.start, a.end] se recoupent.
  for (let i = 0; i < sortedOps.length - 1; i++) {
    const a = sortedOps[i];     // plage haute  (start ≥ b.start)
    const b = sortedOps[i + 1]; // plage basse
    const aStart = a.__rangeStart || 0;
    const bEnd   = b.__rangeEnd   || 0;
    if (aStart <= bEnd) {
      return {
        error: `Opérations qui se chevauchent détectées (lignes ${b.__rangeStart}-${b.__rangeEnd} et ${a.__rangeStart}-${a.__rangeEnd}). Fusionne-les en une seule opération ou sépare-les en plages disjointes.`,
      };
    }
  }

  for (const op of sortedOps) {
    const type = String(op.type || "").trim();
    const startLine = typeof op.startLine === "number" ? op.startLine : 0;
    const endLine = typeof op.endLine === "number" ? op.endLine : startLine;
    const content = typeof op.content === "string" ? op.content : "";

    if (startLine < 1 || startLine > lines.length + 1) {
      return { error: `Ligne ${startLine} hors limites (fichier: ${lines.length} lignes).` };
    }

    switch (type) {
      case "replace": {
        if (endLine < startLine || endLine > lines.length) {
          return { error: `endLine ${endLine} invalide pour replace (max: ${lines.length}).` };
        }
        const newLines = content.split("\n");
        lines.splice(startLine - 1, endLine - startLine + 1, ...newLines);
        appliedOps++;
        break;
      }
      case "insert": {
        const newLines = content.split("\n");
        lines.splice(startLine, 0, ...newLines); // Insert after startLine
        appliedOps++;
        break;
      }
      case "delete": {
        if (endLine < startLine || endLine > lines.length) {
          return { error: `endLine ${endLine} invalide pour delete (max: ${lines.length}).` };
        }
        lines.splice(startLine - 1, endLine - startLine + 1);
        appliedOps++;
        break;
      }
      default:
        return { error: `Type d'opération inconnu: '${type}'. Utilise 'replace', 'insert' ou 'delete'.` };
    }
  }

  const newContent = lines.join("\n");

  const critical = isCriticalFile(target.logicalPath);
  // Confirmation interactive (ou mise en file d'attente) pour fichiers critiques
  const guard = await guardCriticalFile(
    critical,
    requestedPath,
    'patch',
    toolContext,
    `Patch (${args.operations.length} opération(s))`,
    { proposed: newContent, previous: raw }
  );
  if (guard.blocked) return { error: guard.error, critical: true };

  // Checkpoint automatique avant patch (seulement en mode direct)
  const sandboxMode_patch = isSandboxActive();
  if (!sandboxMode_patch) {
    try {
      const { createCheckpoint } = await import("../utils/checkpoint");
      await createCheckpoint(`avant patch: ${requestedPath}`);
    } catch { /* non bloquant */ }
  }

  if (!resolveCurrentSandboxPath(requestedPath, normalized)) return { error: "Sandbox indisponible ou chemin modifié — écriture refusée." };
  await fs.promises.writeFile(normalized, newContent, "utf-8");
  if (sandboxMode_patch) markFileModified(requestedPath);
  console.log(`[Codebase] File patched: ${requestedPath} (${appliedOps} ops)${critical ? ' [CRITIQUE]' : ''}${sandboxMode_patch ? ' [SANDBOX]' : ''}`);
  appendAuditEvent({ action: 'patch_project_file', target: requestedPath, actor: 'ai', diff: generateDiffSummary(raw, newContent) }).catch((err) => {
    console.warn(`[Audit] appendAuditEvent failed for patch_project_file on ${requestedPath}:`, err);
  });
  toolContext.emitIdeAction?.({ type: "open-file", path: requestedPath });
  toolContext.emitIdeAction?.({ type: "file-changed", path: requestedPath });
  if (!sandboxMode_patch) {
    triggerRestartIfNeeded(requestedPath);
    scheduleValidation();
  }
  return {
    status: "success",
    path: requestedPath,
    operationsApplied: appliedOps,
    newTotalLines: lines.length,
    critical,
    sandbox: sandboxMode_patch,
    message: `File ${requestedPath} patched successfully (${appliedOps} operations).${sandboxMode_patch ? ' 📦 (sandbox)' : ''}${critical ? ' ⚠️ Fichier critique modifié.' : ''}`,
  };
}

export async function handleRenameProjectFile(args: any, toolContext: any) {
  if (!checkWorkspace().exists) return { error: "Workspace non disponible.", path: getProjectRoot() };
  const oldPath = String(args.oldPath || "").trim();
  const newPath = String(args.newPath || "").trim();
  if (!oldPath || !newPath) return { error: "oldPath et newPath sont requis." };
  const oldTarget = resolveSandboxWriteTarget(oldPath);
  const newTarget = resolveSandboxWriteTarget(newPath);
  if (!oldTarget || !newTarget) return { error: "Chemin invalide ou en dehors du workspace." };
  const normalizedOld = oldTarget.sandboxPath;
  const normalizedNew = newTarget.sandboxPath;
  if (isWriteForbidden(oldTarget.logicalPath)) return { error: `Renommage interdit sur ce fichier protégé: ${oldPath}` };
  if (isWriteForbidden(newTarget.logicalPath)) return { error: `Destination interdite (fichier protégé): ${newPath}` };
  if (!fs.existsSync(normalizedOld)) return { error: `Introuvable: ${oldPath}` };

  const critical = isCriticalFile(oldTarget.logicalPath) || isCriticalFile(newTarget.logicalPath);
  // Confirmation interactive (ou mise en file d'attente) pour fichiers critiques.
  // Pas de contenu à joindre (un renommage ne change pas le contenu), mais
  // on transmet renameTo pour que l'UI affiche "ancien → nouveau" au lieu
  // d'un diff vide.
  const guard = await guardCriticalFile(critical, oldPath, 'rename', toolContext, `Renommage vers ${newPath}`, { renameTo: newPath });
  if (guard.blocked) return { error: guard.error, critical: true };

  const sandboxMode_ren = isSandboxActive();
  // Checkpoint automatique avant renommage (seulement en mode direct)
  if (!sandboxMode_ren) {
    try {
      const { createCheckpoint } = await import("../utils/checkpoint");
      await createCheckpoint(`avant renommage: ${oldPath} → ${newPath}`);
    } catch { /* non bloquant */ }
  }
  if (!resolveCurrentSandboxPath(oldPath, normalizedOld) || !resolveCurrentSandboxPath(newPath, normalizedNew)) {
    return { error: "Sandbox indisponible ou chemin modifié — renommage refusé." };
  }
  await fs.promises.mkdir(path.dirname(normalizedNew), { recursive: true });
  await fs.promises.rename(normalizedOld, normalizedNew);
  if (sandboxMode_ren) { markFileModified(oldPath); markFileModified(newPath); }
  console.log(`[Codebase] Renamed: ${oldPath} -> ${newPath}${critical ? ' [CRITIQUE]' : ''}${sandboxMode_ren ? ' [SANDBOX]' : ''}`);
  if (!sandboxMode_ren) {
    triggerRestartIfNeeded(oldPath);
    triggerRestartIfNeeded(newPath);
    scheduleValidation();
  }
  return { status: "success", oldPath, newPath, critical, sandbox: sandboxMode_ren, message: `Renamed ${oldPath} to ${newPath}.${sandboxMode_ren ? ' 📦 (sandbox)' : ''}${critical ? ' ⚠️ Fichier critique impliqué.' : ''}` };
}

export async function handleDeleteProjectFile(args: any, toolContext: any) {
  if (!checkWriteRateLimit()) return { error: "Rate limit atteint : trop d'écritures par minute." };
  if (!checkWorkspace().exists) return { error: "Workspace non disponible.", path: getProjectRoot() };
  const requestedPath = String(args.path || "").trim();
  if (!requestedPath) return { error: "Le chemin de fichier est requis." };
  const target = resolveSandboxWriteTarget(requestedPath);
  if (!target) return { error: "Chemin invalide ou en dehors du workspace." };
  const normalized = target.sandboxPath;
  if (isWriteForbidden(target.logicalPath)) return { error: `Suppression interdite sur ce fichier protégé: ${requestedPath}` };
  if (!fs.existsSync(normalized)) return { error: "Fichier introuvable." };
  const stats = await fs.promises.stat(normalized);
  if (!stats.isFile()) return { error: "Le chemin doit pointer vers un fichier." };

  // Lire le contenu avant suppression : nécessaire pour le rollback via la
  // proposition evolutionStore si l'opération est bloquée en mode autonome.
  let beforeContent: string | null = null;
  try { beforeContent = await fs.promises.readFile(normalized, 'utf-8'); } catch { /* fichier binaire ou illisible */ }

  const critical = isCriticalFile(target.logicalPath);
  const guard = await guardCriticalFile(
    critical,
    requestedPath,
    'delete',
    toolContext,
    `Suppression du fichier`,
    { previous: beforeContent ?? undefined }
  );
  if (guard.blocked) return { error: guard.error, critical: true };

  const sandboxMode_del = isSandboxActive();
  // Checkpoint automatique avant suppression (seulement en mode direct)
  if (!sandboxMode_del) {
    try {
      const { createCheckpoint } = await import("../utils/checkpoint");
      await createCheckpoint(`avant suppression: ${requestedPath}`);
    } catch { /* non bloquant */ }
  }
  if (!resolveCurrentSandboxPath(requestedPath, normalized)) return { error: "Sandbox indisponible ou chemin modifié — suppression refusée." };
  await fs.promises.unlink(normalized);
  if (sandboxMode_del) markFileModified(requestedPath);
  console.log(`[Codebase] File deleted: ${requestedPath}${critical ? ' [CRITIQUE]' : ''}${sandboxMode_del ? ' [SANDBOX]' : ''}`);
  appendAuditEvent({ action: 'delete_project_file', target: requestedPath, actor: 'ai', diff: '[DELETED]' }).catch((err) => {
    console.warn(`[Audit] appendAuditEvent failed for delete_project_file on ${requestedPath}:`, err);
  });
  if (!sandboxMode_del) {
    triggerRestartIfNeeded(requestedPath);
    scheduleValidation();
  }
  return { status: "success", path: requestedPath, critical, sandbox: sandboxMode_del, message: `File ${requestedPath} deleted.${sandboxMode_del ? ' 📦 (sandbox)' : ''}${critical ? ' ⚠️ Fichier critique supprimé.' : ''}` };
}

export async function handleCreateProjectDirectory(args: any) {
  if (!checkWorkspace().exists) return { error: "Workspace non disponible.", path: getProjectRoot() };
  const requestedPath = String(args.path || "").trim();
  if (!requestedPath) return { error: "Le chemin du dossier est requis." };
  const target = resolveSandboxWriteTarget(requestedPath);
  if (!target) return { error: "Sandbox indisponible ou chemin invalide. Les écritures sont autorisées uniquement lorsque le sandbox est READY." };
  const normalized = target.sandboxPath;
  if (isWriteForbidden(target.logicalPath)) return { error: `Création interdite dans ce dossier protégé: ${requestedPath}` };
  if (!resolveCurrentSandboxPath(requestedPath, normalized)) return { error: "Sandbox indisponible ou chemin modifié — création de dossier refusée." };
  await fs.promises.mkdir(normalized, { recursive: true });
  console.log(`[Codebase] Directory created: ${requestedPath}`);
  return { status: "success", path: requestedPath, message: `Directory ${requestedPath} created.` };
}