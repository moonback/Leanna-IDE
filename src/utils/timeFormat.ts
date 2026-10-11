/**
 * Formatteurs de temps partagés entre les vues pilotage et les panneaux IDE.
 *
 * Centralise des helpers purs qui étaient dupliqués dans MissionPanel,
 * AgentPanel et MissionTimelineView.
 */

/**
 * Durée lisible à partir d'un nombre de millisecondes.
 * `< 1s` → ms, `< 1min` → s (1 décimale), au-delà → `Xm Ys`.
 * Retourne '' pour une valeur absente ou nulle.
 */
export function formatDuration(ms?: number): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

/** Durée lisible entre deux timestamps ISO. Retourne '—' si l'un manque ou si l'intervalle est invalide. */
export function humanDuration(startAt?: string, endAt?: string): string {
  if (!startAt || !endAt) return '—';
  try {
    const ms = new Date(endAt).getTime() - new Date(startAt).getTime();
    if (!Number.isFinite(ms) || ms < 0) return '—';
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem ? `${m}m ${rem}s` : `${m}m`;
  } catch { return '—'; }
}

/** Heure (HH:MM:SS, UTC) extraite d'un timestamp ISO. Retourne '' si absent/invalide. */
export function timeOf(at?: string): string {
  if (!at) return '';
  try { return new Date(at).toISOString().slice(11, 19); } catch { return ''; }
}
