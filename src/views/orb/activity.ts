import type { AgentTaskEntry } from '../../stores/agentActivityStore.js';

/**
 * Types et helpers partagés par les composants du suivi d'activité de l'Orb
 * (missions, agents, outils). Centralisés ici pour garder les composants
 * de présentation courts et cohérents.
 */

// ─── Missions ────────────────────────────────────────────────────────────────

export interface MissionEventLog {
  at: number;
  event: string;
  label: string;
  confidence?: number;
}

export interface MissionActivity {
  missionId: string;
  title: string;
  status: 'in_progress' | 'completed' | 'failed';
  confidence: number;
  currentGoal?: string;
  lastAction?: string;
  startedAt: number;
  updatedAt: number;
  goalsCompleted: number;
  actionsCompleted: number;
  log: MissionEventLog[];
}

// ─── Formatage ───────────────────────────────────────────────────────────────

/** ms → libellé compact (ex: 850ms, 4.2s, 1m05s). */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m${rem.toString().padStart(2, '0')}s`;
}

/** timestamp → heure locale HH:MM:SS. */
export function formatClock(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

/** Sérialise les arguments d'un outil de façon sûre (tronqué, sans planter sur les cycles). */
export function safeStringify(value: unknown): string {
  try {
    const json = JSON.stringify(value, null, 2);
    return json.length > 600 ? json.slice(0, 600) + '\n…' : json;
  } catch {
    return String(value);
  }
}

/** Couleur sémantique du statut d'une tâche d'agent. */
export function statusColor(status: AgentTaskEntry['status']): string {
  switch (status) {
    case 'completed': return 'var(--color-success)';
    case 'failed': return 'var(--color-error)';
    case 'incomplete': return 'var(--color-warning)';
    case 'cancelled': return 'var(--text-dimmed)';
    default: return 'var(--accent-primary)';
  }
}

/** Libellé FR court du statut d'une tâche. */
export const STATUS_LABEL_FR: Record<AgentTaskEntry['status'], string> = {
  pending: 'En attente',
  running: 'En cours',
  completed: 'Terminé',
  incomplete: 'Incomplet',
  failed: 'Échoué',
  cancelled: 'Annulé',
};
