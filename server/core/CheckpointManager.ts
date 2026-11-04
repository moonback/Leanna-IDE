/**
 * core/CheckpointManager.ts — P0.4 : snapshot / commit / rollback.
 *
 * Manque critique identifié par l'audit (§7, marqué 🔴) : Leanna sait vérifier
 * et réparer, mais ne sait pas revenir à l'état d'AVANT une modification. Sans
 * rollback transactionnel, un échec de vérification laisse le workspace dans un
 * état intermédiaire.
 *
 * Cycle transactionnel visé (§7) :
 *   PREPARE → SNAPSHOT → ACT → VERIFY → COMMIT
 *                                     └→ ROLLBACK → RECOVER → RETRY
 *
 * Un checkpoint capture, pour chaque fichier concerné : existait-il, son
 * contenu, et son hash (SHA-256, réutilisé de WorkspaceState). `rollback()`
 * restaure EXACTEMENT cet état — y compris en supprimant un fichier qui
 * n'existait pas au moment du snapshot (création à annuler).
 *
 * L'accès disque est injectable (interface `FileGateway`) pour des tests
 * déterministes sans toucher au vrai système de fichiers.
 */

import { WorkspaceState } from "../agents/WorkspaceState.js";
import { coreDir, writeJsonAtomic, readJson } from "./paths.js";
import fs from "node:fs";
import path from "node:path";

/** Abstraction minimale du système de fichiers (injectable pour les tests). */
export interface FileGateway {
  exists(filePath: string): boolean;
  read(filePath: string): string;
  write(filePath: string, content: string): void;
  remove(filePath: string): void;
  /** Optional directory primitives used by recursive transactional snapshots. */
  isDirectory?(directoryPath: string): boolean;
  isSymbolicLink?(targetPath: string): boolean;
  listDirectory?(directoryPath: string): Array<{ path: string; kind: "file" | "directory" }>;
  makeDirectory?(directoryPath: string): void;
  removeDirectory?(directoryPath: string): void;
  rename?(sourcePath: string, destinationPath: string): void;
}

/** Implémentation par défaut sur `node:fs`. */
export function makeNodeFileGateway(): FileGateway {
  return {
    exists: (p) => fs.existsSync(p),
    read: (p) => fs.readFileSync(p, "utf8"),
    write: (p, content) => {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, content, "utf8");
    },
    remove: (p) => fs.rmSync(p, { force: true }),
    isDirectory: (p) => fs.existsSync(p) && fs.lstatSync(p).isDirectory(),
    isSymbolicLink: (p) => fs.existsSync(p) && fs.lstatSync(p).isSymbolicLink(),
    listDirectory: (p) => fs.readdirSync(p, { withFileTypes: true }).map((entry) => {
      const childPath = path.join(p, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Lien symbolique non pris en charge dans un checkpoint récursif: ${childPath}`);
      if (entry.isDirectory()) return { path: childPath, kind: "directory" as const };
      if (entry.isFile()) return { path: childPath, kind: "file" as const };
      throw new Error(`Type de fichier non pris en charge dans un checkpoint récursif: ${childPath}`);
    }),
    makeDirectory: (p) => fs.mkdirSync(p, { recursive: true }),
    // Non-recursive by design: rollback must never erase files created after snapshot.
    removeDirectory: (p) => fs.rmdirSync(p),
    rename: (source, destination) => {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.renameSync(source, destination);
    },
  };
}

/** État capturé d'un fichier à l'instant du snapshot. */
export interface FileSnapshot {
  path: string;
  existed: boolean;
  /** Contenu au moment du snapshot (absent si le fichier n'existait pas). */
  content?: string;
  /** Hash SHA-256 du contenu (absent si le fichier n'existait pas). */
  hash?: string;
}

export interface DirectorySnapshot {
  path: string;
  existed: boolean;
}

export interface RenameSnapshot {
  sourcePath: string;
  destinationPath: string;
}

export type CheckpointStatus = "open" | "committed" | "rolledback";

/** Un checkpoint : ensemble de snapshots de fichiers + statut. */
export interface Checkpoint {
  id: string;
  missionId?: string;
  label?: string;
  createdAt: string;
  status: CheckpointStatus;
  files: FileSnapshot[];
  /** Directory structure, including empty directories and directories created during the attempt. */
  directories?: DirectorySnapshot[];
  /** Rename operations to reverse before restoring individual file snapshots. */
  renames?: RenameSnapshot[];
}

export class CheckpointManager {
  private readonly gateway: FileGateway;
  private readonly dir: string;
  private readonly checkpoints = new Map<string, Checkpoint>();

  constructor(options: { gateway?: FileGateway; dirOverride?: string } = {}) {
    this.gateway = options.gateway ?? makeNodeFileGateway();
    this.dir = options.dirOverride ?? coreDir("checkpoints");
    this.hydrate();
  }

  private hydrate(): void {
    try {
      if (!fs.existsSync(this.dir)) return;
      for (const name of fs.readdirSync(this.dir)) {
        if (!name.endsWith(".json")) continue;
        const cp = readJson<Checkpoint | null>(path.join(this.dir, name), null);
        if (cp) this.checkpoints.set(cp.id, cp);
      }
    } catch {
      /* best-effort */
    }
  }

  private file(id: string): string {
    const safe = id.replace(/[^a-zA-Z0-9_.-]/g, "_");
    return path.join(this.dir, `${safe}.json`);
  }

  private persist(cp: Checkpoint): void {
    this.checkpoints.set(cp.id, cp);
    writeJsonAtomic(this.file(cp.id), cp);
  }

  /**
   * PREPARE + SNAPSHOT : capture l'état courant des fichiers indiqués AVANT
   * toute modification. Retourne le checkpoint (statut "open").
   */
  snapshot(files: string[], meta: { missionId?: string; label?: string } = {}): Checkpoint {
    const unique = [...new Set(files.map((f) => f.replace(/\\/g, "/")))];
    const snapshots: FileSnapshot[] = unique.map((filePath) => {
      if (this.gateway.exists(filePath)) {
        const content = this.gateway.read(filePath);
        return { path: filePath, existed: true, content, hash: WorkspaceState.hash(content) };
      }
      return { path: filePath, existed: false };
    });

    const cp: Checkpoint = {
      id: `cp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      missionId: meta.missionId,
      label: meta.label,
      createdAt: new Date().toISOString(),
      status: "open",
      files: snapshots,
      directories: [],
      renames: [],
    };
    this.persist(cp);
    return cp;
  }

  /**
   * Capture récursivement un dossier avant une suppression ou un déplacement.
   * Les dossiers vides sont conservés et les liens symboliques refusés.
   */
  captureDirectory(id: string, directoryPath: string): void {
    this.requireOpen(id);
    const normalized = path.resolve(directoryPath);
    const isDirectory = this.gateway.isDirectory;
    const listDirectory = this.gateway.listDirectory;
    if (!isDirectory || !listDirectory || !this.gateway.makeDirectory || !this.gateway.removeDirectory) {
      throw new Error("Le FileGateway ne prend pas en charge les snapshots de dossiers.");
    }

    const directories = [...(cp.directories ?? [])];
    const knownDirectories = new Set(directories.map((entry) => entry.path));
    const addDirectory = (target: string, existed: boolean) => {
      const key = path.resolve(target);
      if (!knownDirectories.has(key)) {
        directories.push({ path: key, existed });
        knownDirectories.add(key);
      }
    };

    // Record missing ancestors too: mkdir({ recursive:true }) may create them.
    let cursor = normalized;
    while (!this.gateway.exists(cursor)) {
      addDirectory(cursor, false);
      const parent = path.dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }

    if (isDirectory(normalized)) {
      addDirectory(normalized, true);
      const visit = (current: string): void => {
        for (const entry of listDirectory(current)) {
          if (entry.kind === "directory") {
            addDirectory(entry.path, true);
            visit(entry.path);
          } else {
            this.captureFile(id, entry.path);
          }
        }
      };
      visit(normalized);
    } else if (this.gateway.exists(normalized)) {
      this.captureFile(id, normalized);
    }

    this.persist({ ...this.require(id), directories });
  }

  /**
   * Journalise un renommage/déplacement. Le rollback inverse le déplacement
   * avant de restaurer les contenus, ce qui couvre aussi les dossiers entiers.
   */
  captureRename(id: string, sourcePath: string, destinationPath: string): void {
    this.requireOpen(id);
    if (!this.gateway.rename) throw new Error("Le FileGateway ne prend pas en charge les renommages transactionnels.");
    const source = path.resolve(sourcePath);
    const destination = path.resolve(destinationPath);
    this.capturePath(id, source);
    this.capturePath(id, destination);
    const latest = this.require(id);
    const renames = [...(latest.renames ?? [])];
    if (!renames.some((entry) => entry.sourcePath === source && entry.destinationPath === destination)) {
      renames.push({ sourcePath: source, destinationPath: destination });
      this.persist({ ...latest, renames });
    }
  }

  /** Capture un chemin dont le type (fichier/dossier) est déterminé au runtime. */
  capturePath(id: string, targetPath: string): void {
    if (this.gateway.isSymbolicLink?.(targetPath)) {
      throw new Error(`Lien symbolique non pris en charge dans un checkpoint: ${targetPath}`);
    }
    if (this.gateway.isDirectory?.(targetPath)) {
      this.captureDirectory(id, targetPath);
    } else {
      this.captureFile(id, targetPath);
      // If the target is absent it may be a directory about to be created;
      // if it is an existing file, only missing parents can be created by writers.
      const missingRoot = this.gateway.exists(targetPath)
        ? path.dirname(path.resolve(targetPath))
        : path.resolve(targetPath);
      this.captureMissingDirectories(id, missingRoot);
    }
  }

  private captureMissingDirectories(id: string, targetPath: string): void {
    this.requireOpen(id);
    const directories = [...(cp.directories ?? [])];
    const known = new Set(directories.map((entry) => entry.path));
    let cursor = path.resolve(targetPath);
    while (!this.gateway.exists(cursor)) {
      if (!known.has(cursor)) {
        directories.push({ path: cursor, existed: false });
        known.add(cursor);
      }
      const parent = path.dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }
    this.persist({ ...this.require(id), directories });
  }

  /**
   * Capture un fichier découvert pendant l'exécution, immédiatement AVANT son
   * premier effet de bord. L'opération est idempotente pour un chemin déjà
   * présent dans le snapshot initial ou capturé par une autre étape.
   */
  captureFile(id: string, filePath: string): boolean {
    const cp = this.requireOpen(id);
    if (this.gateway.isSymbolicLink?.(filePath)) {
      throw new Error(`Lien symbolique non pris en charge dans un checkpoint: ${filePath}`);
    }
    const normalized = filePath.replace(/\\/g, "/");
    if (cp.files.some((entry) => entry.path === normalized)) return false;

    const snapshot: FileSnapshot = this.gateway.exists(normalized)
      ? (() => {
          const content = this.gateway.read(normalized);
          return { path: normalized, existed: true, content, hash: WorkspaceState.hash(content) };
        })()
      : { path: normalized, existed: false };

    this.persist({ ...cp, files: [...cp.files, snapshot] });
    return true;
  }

  /** COMMIT : fige le checkpoint. Un rollback devient alors impossible. */
  commit(id: string): void {
    const cp = this.require(id);
    if (cp.status !== "open") {
      throw new Error(`Checkpoint ${id} déjà ${cp.status} — commit impossible.`);
    }
    this.persist({ ...cp, status: "committed" });
  }

  /**
   * ROLLBACK : restaure l'état capturé. Pour chaque fichier :
   *   - existait → réécrit le contenu d'origine ;
   *   - n'existait pas → supprime (annule une création).
   * Refuse de rollback un checkpoint committé.
   */
  rollback(id: string): void {
    const cp = this.require(id);
    if (cp.status === "committed") {
      throw new Error(`Checkpoint ${id} committé — rollback interdit.`);
    }
    if (cp.status === "rolledback") return; // idempotent

    // Reverse structural moves first so source paths exist again before
    // their original file contents are restored.
    const failures: string[] = [];
    for (const rename of [...(cp.renames ?? [])].reverse()) {
      try {
        if (!this.gateway.exists(rename.sourcePath) && this.gateway.exists(rename.destinationPath)) {
          this.gateway.rename?.(rename.destinationPath, rename.sourcePath);
        }
      } catch (error) {
        failures.push(`${rename.destinationPath} → ${rename.sourcePath}: ${(error as Error).message}`);
      }
    }
    // Restore every file even if one filesystem operation fails.
    for (const snap of [...cp.files].reverse()) {
      try {
        if (snap.existed) {
          this.gateway.write(snap.path, snap.content ?? "");
        } else if (
          this.gateway.exists(snap.path) &&
          !(this.gateway.isDirectory?.(snap.path) ?? false)
        ) {
          // A path captured as absent may later become a directory. Its
          // DirectorySnapshot owns cleanup; never try to unlink it as a file.
          this.gateway.remove(snap.path);
        }
      } catch (error) {
        failures.push(`${snap.path}: ${(error as Error).message}`);
      }
    }
    const directoryFailures: string[] = [];
    const directorySnapshots = cp.directories ?? [];
    // Recreate directories that existed at snapshot time, shallowest first.
    for (const directory of directorySnapshots.filter((entry) => entry.existed).sort((a, b) => a.path.split(path.sep).length - b.path.split(path.sep).length)) {
      try { this.gateway.makeDirectory?.(directory.path); }
      catch (error) { directoryFailures.push(`${directory.path}: ${(error as Error).message}`); }
    }
    // Remove only newly-created empty directories, deepest first. Never recurse.
    for (const directory of directorySnapshots.filter((entry) => !entry.existed).sort((a, b) => b.path.split(path.sep).length - a.path.split(path.sep).length)) {
      try {
        if (this.gateway.exists(directory.path)) this.gateway.removeDirectory?.(directory.path);
      } catch (error) {
        directoryFailures.push(`${directory.path}: ${(error as Error).message}`);
      }
    }
    const allFailures = [...failures, ...directoryFailures];
    if (allFailures.length > 0) {
      throw new Error(`Rollback incomplet pour ${id} — ${allFailures.length} élément(s) non restauré(s): ${allFailures.join(" ; ")}`);
    }
    this.persist({ ...cp, status: "rolledback" });
  }

  /** Retourne un checkpoint connu (mémoire ou disque), ou undefined. */
  get(id: string): Checkpoint | undefined {
    return this.checkpoints.get(id);
  }

  /**
   * Indique si les fichiers d'un checkpoint ont changé depuis le snapshot
   * (comparaison de hash) — utile pour la phase VERIFY.
   */
  changedFiles(id: string): string[] {
    const cp = this.require(id);
    const changed: string[] = [];
    for (const snap of cp.files) {
      const nowExists = this.gateway.exists(snap.path);
      if (nowExists !== snap.existed) {
        changed.push(snap.path);
        continue;
      }
      if (nowExists) {
        if (this.gateway.isDirectory?.(snap.path)) {
          changed.push(snap.path);
          continue;
        }
        const hash = WorkspaceState.hash(this.gateway.read(snap.path));
        if (hash !== snap.hash) changed.push(snap.path);
      }
    }
    for (const directory of cp.directories ?? []) {
      const nowExists = this.gateway.exists(directory.path) && (this.gateway.isDirectory?.(directory.path) ?? true);
      if (nowExists !== directory.existed) changed.push(directory.path);
    }
    return [...new Set(changed)];
  }

  private requireOpen(id: string): Checkpoint {
    const cp = this.require(id);
    if (cp.status !== "open") throw new Error(`Checkpoint ${id} non ouvert — capture impossible.`);
    return cp;
  }

  private require(id: string): Checkpoint {
    const cp = this.checkpoints.get(id);
    if (!cp) throw new Error(`Checkpoint ${id} introuvable.`);
    return cp;
  }
}
