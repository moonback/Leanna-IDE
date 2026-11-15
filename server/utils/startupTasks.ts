/**
 * startupTasks — registre des tâches d'arrière-plan lancées à l'ouverture d'un
 * projet (chargement du graphe, indexation, extraction documentaire, watchers,
 * workflows…).
 *
 * Chaque changement d'état est diffusé en WebSocket (`startup_task`) et le
 * snapshot complet est exposé via GET /api/startup/tasks pour les clients qui
 * se connectent après coup. Aucune dépendance vers les modules métier : le
 * registre ne fait que mémoriser et diffuser.
 */

import { broadcastServerEvent } from "./knowledgeBroadcaster.js";

export type StartupTaskStatus = "pending" | "running" | "done" | "error" | "skipped";

export interface StartupTask {
  id: string;
  label: string;
  /** Regroupement visuel dans l'UI. */
  group: "knowledge" | "documents" | "agents" | "workflows" | "system";
  status: StartupTaskStatus;
  current?: number;
  total?: number;
  /** Détail court (fichier en cours, résumé final…). */
  detail?: string;
  error?: string;
  startedAt?: number;
  endedAt?: number;
}

const tasks = new Map<string, StartupTask>();
const lastEmit = new Map<string, number>();
const EMIT_INTERVAL_MS = 150;

function emit(task: StartupTask): void {
  broadcastServerEvent({ type: "startup_task", task });
}

function upsert(id: string, patch: Partial<StartupTask>): StartupTask {
  const prev = tasks.get(id);
  const next: StartupTask = {
    id,
    label: prev?.label ?? patch.label ?? id,
    group: prev?.group ?? patch.group ?? "system",
    status: prev?.status ?? "pending",
    ...prev,
    ...patch,
  };
  tasks.set(id, next);
  emit(next);
  return next;
}

/** Démarre (ou redémarre) une tâche : réinitialise compteurs, erreur et horodatage. */
export function startTask(
  id: string,
  label: string,
  group: StartupTask["group"] = "system",
  detail?: string,
): void {
  upsert(id, {
    label,
    group,
    status: "running",
    current: undefined,
    total: undefined,
    detail,
    error: undefined,
    startedAt: Date.now(),
    endedAt: undefined,
  });
}

export function updateTask(
  id: string,
  patch: { current?: number; total?: number; detail?: string },
): void {
  const prev = tasks.get(id);
  if (!prev || prev.status !== "running") return;

  // Le scan émet un événement par fichier : on mémorise toujours la valeur,
  // mais on ne diffuse qu'au plus toutes les 150 ms (le premier et le dernier
  // palier passent toujours).
  const now = Date.now();
  const merged: StartupTask = { ...prev, ...patch };
  tasks.set(id, merged);
  const last = lastEmit.get(id) ?? 0;
  const isLast = merged.total !== undefined && merged.current === merged.total;
  if (now - last >= EMIT_INTERVAL_MS || isLast) {
    lastEmit.set(id, now);
    emit(merged);
  }
}

export function finishTask(id: string, detail?: string): void {
  const prev = tasks.get(id);
  upsert(id, {
    status: "done",
    detail: detail ?? prev?.detail,
    // Une tâche terminée affiche une barre pleine.
    current: prev?.total ?? prev?.current,
    endedAt: Date.now(),
  });
}

export function failTask(id: string, error: unknown): void {
  upsert(id, {
    status: "error",
    error: error instanceof Error ? error.message : String(error),
    endedAt: Date.now(),
  });
}

export function skipTask(
  id: string,
  label: string,
  group: StartupTask["group"],
  reason: string,
): void {
  upsert(id, { label, group, status: "skipped", detail: reason, endedAt: Date.now() });
}

export function getStartupTasks(): StartupTask[] {
  return [...tasks.values()];
}
