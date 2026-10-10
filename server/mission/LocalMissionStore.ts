import fs from "node:fs";
import path from "node:path";
import type { MissionState } from "./types.js";
import { coreDir, writeJsonAtomic, readJson } from "../core/paths.js";

// ═══════════════════════════════════════════════════════════════════════════════
// LocalMissionStore — Persistance LOCALE des missions (disque .Leanna)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Contrat de persistance des `MissionState` de l'Executor.
 *
 * Historiquement l'Executor ne connaissait que `MissionStore` (Supabase), qui
 * est un no-op silencieux sans variables d'env — donc AUCUNE reprise après
 * crash hors Supabase (audit, points 5 & 7). Ce port permet de brancher aussi
 * un store local, toujours disponible.
 */
export interface MissionStatePort {
  isEnabled(): boolean;
  save(state: MissionState): Promise<void>;
  load(missionId: string): Promise<MissionState | null>;
  listByStatus(statuses: string[]): Promise<MissionState[]>;
  delete(missionId: string): Promise<void>;
}

/**
 * Store local écrivant chaque `MissionState` sous
 * `.Leanna/core/mission-runs/<id>.json` via `writeJsonAtomic`.
 *
 * - Toujours activé (`isEnabled()` → true) : aucune dépendance externe.
 * - Survit au redémarrage : `listByStatus` relit le répertoire au démarrage,
 *   ce qui permet à `resumePending` de proposer les missions interrompues même
 *   sans Supabase.
 * - Best-effort : une erreur d'E/S est journalisée mais n'interrompt jamais une
 *   mission.
 */
export class LocalMissionStore implements MissionStatePort {
  /** Répertoire override (tests) ; sinon `.Leanna/core/mission-runs`. */
  constructor(private readonly dirOverride?: string) {}

  private dir(): string {
    return this.dirOverride ?? coreDir("mission-runs");
  }

  private file(missionId: string): string {
    // Borne le nom de fichier pour empêcher toute traversée de chemin.
    const safe = missionId.replace(/[^a-zA-Z0-9_.-]/g, "_");
    return path.join(this.dir(), `${safe}.json`);
  }

  /** Le store local est toujours disponible. */
  isEnabled(): boolean {
    return true;
  }

  async save(state: MissionState): Promise<void> {
    try {
      writeJsonAtomic(this.file(state.id), state);
    } catch (err) {
      console.warn(
        `[LocalMissionStore] ⚠️ Persistance locale de ${state.id} échouée: ${(err as Error).message}`
      );
    }
  }

  async load(missionId: string): Promise<MissionState | null> {
    return readJson<MissionState | null>(this.file(missionId), null);
  }

  async listByStatus(statuses: string[]): Promise<MissionState[]> {
    const dir = this.dir();
    if (!fs.existsSync(dir)) return [];
    const wanted = new Set(statuses);
    const out: MissionState[] = [];
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      const state = readJson<MissionState | null>(path.join(dir, name), null);
      if (state && typeof state === "object" && wanted.has(state.status)) {
        out.push(state);
      }
    }
    // Les plus récemment mises à jour d'abord (comme le store Supabase).
    out.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    return out;
  }

  async delete(missionId: string): Promise<void> {
    try {
      fs.rmSync(this.file(missionId), { force: true });
    } catch {
      /* best-effort */
    }
  }
}

/**
 * Store composite : agrège plusieurs stores (ex. local + Supabase). Les
 * écritures sont diffusées à TOUS les stores actifs ; les lectures privilégient
 * le premier store qui répond.
 *
 * Objectif (audit, points 5 & 7) : garantir une reprise après crash via le
 * store local, tout en conservant la persistance Supabase quand elle est
 * configurée — sans que l'un bloque l'autre.
 */
export class CompositeMissionStore implements MissionStatePort {
  private readonly stores: MissionStatePort[];

  constructor(...stores: MissionStatePort[]) {
    this.stores = stores;
  }

  /** Actif si au moins un store sous-jacent l'est. */
  isEnabled(): boolean {
    return this.stores.some((s) => s.isEnabled());
  }

  /** Les stores effectivement actifs. */
  private active(): MissionStatePort[] {
    return this.stores.filter((s) => s.isEnabled());
  }

  async save(state: MissionState): Promise<void> {
    await Promise.all(this.active().map((s) => s.save(state)));
  }

  async load(missionId: string): Promise<MissionState | null> {
    for (const s of this.active()) {
      const found = await s.load(missionId);
      if (found) return found;
    }
    return null;
  }

  /**
   * Union des missions de tous les stores (dédupliquées par id, la version la
   * plus récente l'emporte).
   */
  async listByStatus(statuses: string[]): Promise<MissionState[]> {
    const byId = new Map<string, MissionState>();
    for (const s of this.active()) {
      for (const state of await s.listByStatus(statuses)) {
        const prev = byId.get(state.id);
        if (!prev || (state.updatedAt ?? "") > (prev.updatedAt ?? "")) {
          byId.set(state.id, state);
        }
      }
    }
    return Array.from(byId.values()).sort((a, b) =>
      (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")
    );
  }

  async delete(missionId: string): Promise<void> {
    await Promise.all(this.active().map((s) => s.delete(missionId)));
  }
}
