/**
 * useShellData — sources de données réelles du shell v3 (TopBar, RightRail,
 * BottomBar). Aucune valeur inventée : sans réponse du serveur, les hooks
 * renvoient `null` et l'UI affiche un état vide explicite.
 *
 * Le sondage est suspendu quand la fenêtre est masquée (budget CPU du plan §7).
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  initActivityStore, destroyActivityStore, subscribe, getAgentTasks, type AgentTaskEntry,
} from '../stores/agentActivityStore.js';

function authHeaders(): Record<string, string> {
  try {
    const token = localStorage.getItem('Leanna_api_token');
    return token ? { 'x-Leanna-token': token } : {};
  } catch {
    return {};
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: authHeaders(), cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

/** Appelle `fn` immédiatement puis toutes les `ms`, seulement fenêtre visible. */
export function useVisiblePolling(fn: () => void, ms: number): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      fnRef.current();
      timer = setInterval(() => fnRef.current(), ms);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => (document.visibilityState === 'hidden' ? stop() : start());
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [ms]);
}

// ── Agents ─────────────────────────────────────────────────────────────────

const LIVE_TASK = new Set<AgentTaskEntry['status']>(['running', 'pending']);

export interface AgentActivitySummary {
  /** Tâches en cours ou en attente, les plus récentes d'abord. */
  live: AgentTaskEntry[];
  /** Nombre de rôles distincts actuellement actifs. */
  activeRoles: number;
}

export function summarizeAgentTasks(tasks: AgentTaskEntry[]): AgentActivitySummary {
  const live = tasks.filter(t => LIVE_TASK.has(t.status)).sort((a, b) => b.timestamp - a.timestamp);
  return { live, activeRoles: new Set(live.map(t => t.role)).size };
}

export function useAgentActivity(): AgentActivitySummary {
  useEffect(() => {
    initActivityStore();
    return () => destroyActivityStore();
  }, []);
  const tasks = useSyncExternalStore(subscribe, getAgentTasks, getAgentTasks);
  // Recalcul à chaque rendu : la liste est courte (tâches vivantes uniquement).
  return summarizeAgentTasks(tasks);
}

// ── Missions ───────────────────────────────────────────────────────────────

export interface ShellMission {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'paused' | 'blocked';
  /** 0–100, null si la mission n'a pas encore de plan d'objectifs. */
  progress: number | null;
}

const LIVE_MISSION = new Set(['pending', 'in_progress', 'paused', 'blocked']);

interface RawMission {
  id?: string;
  title?: string;
  status?: string;
  paused?: boolean;
  goals?: { status?: string }[];
}

export function toShellMissions(raw: RawMission[]): ShellMission[] {
  return raw
    .map(m => {
      const status = m.paused && m.status === 'in_progress' ? 'paused' : (m.status ?? 'pending');
      const goals = Array.isArray(m.goals) ? m.goals : [];
      const done = goals.filter(g => g.status === 'completed').length;
      return {
        id: String(m.id ?? ''),
        title: m.title ?? 'Mission',
        status: status as ShellMission['status'],
        progress: goals.length > 0 ? Math.round((done / goals.length) * 100) : null,
      };
    })
    .filter(m => m.id && LIVE_MISSION.has(m.status));
}

export function useLiveMissions(): { missions: ShellMission[] | null; refresh: () => void } {
  const [missions, setMissions] = useState<ShellMission[] | null>(null);
  const refresh = useCallback(() => {
    getJson<{ missions?: RawMission[] }>('/api/missions')
      .then(data => setMissions(toShellMissions(Array.isArray(data.missions) ? data.missions : [])))
      .catch(() => setMissions(prev => prev ?? null));
  }, []);

  useVisiblePolling(refresh, 15_000);

  // Rafraîchissement immédiat (regroupé) sur les événements de mission temps réel.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const onEvent = () => {
      if (t) clearTimeout(t);
      t = setTimeout(refresh, 400);
    };
    window.addEventListener('Leanna-mission-event', onEvent);
    return () => {
      if (t) clearTimeout(t);
      window.removeEventListener('Leanna-mission-event', onEvent);
    };
  }, [refresh]);

  return { missions, refresh };
}

// ── Système ────────────────────────────────────────────────────────────────

export interface SystemMetrics {
  cpu: { percent: number; cores: number };
  memory: { totalMB: number; usedMB: number; percent: number };
  process: { rssMB: number; uptimeSeconds: number };
}

/** Métriques machine, ou null si indisponibles. */
export function useSystemMetrics(): SystemMetrics | null {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const poll = useCallback(() => {
    getJson<SystemMetrics>('/api/system/metrics')
      .then(setMetrics)
      .catch(() => setMetrics(null));
  }, []);
  useVisiblePolling(poll, 5_000);
  return metrics;
}

/**
 * Joignabilité du backend via GET /api/health (non authentifié).
 * null tant que le premier appel n'a pas répondu ; false après deux échecs
 * consécutifs (même tolérance que ConnectionBanner).
 */
export function useBackendOnline(): boolean | null {
  const [online, setOnline] = useState<boolean | null>(null);
  const fails = useRef(0);
  const poll = useCallback(() => {
    fetch('/api/health', { cache: 'no-store' })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        fails.current = 0;
        setOnline(true);
      })
      .catch(() => {
        fails.current += 1;
        if (fails.current >= 2) setOnline(false);
      });
  }, []);
  useVisiblePolling(poll, 15_000);
  return online;
}

// ── Git & workspace ────────────────────────────────────────────────────────

export interface GitSummary { branch: string; changes: number }

export function useGitSummary(): GitSummary | null {
  const [git, setGit] = useState<GitSummary | null>(null);
  const poll = useCallback(() => {
    getJson<{ branch?: string; files?: unknown[] }>('/api/git/status')
      .then(d => setGit({ branch: d.branch || 'HEAD détachée', changes: Array.isArray(d.files) ? d.files.length : 0 }))
      .catch(() => setGit(null));
  }, []);
  useVisiblePolling(poll, 30_000);
  return git;
}

/** Nom court du dossier de workspace ouvert, ou null. */
export function useWorkspaceName(): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    const load = () => {
      getJson<{ workspace?: string; exists?: boolean }>('/api/workspace')
        .then(d => setName(d.workspace && d.exists !== false ? basename(d.workspace) : null))
        .catch(() => setName(null));
    };
    load();
    const onChanged = (e: Event) => {
      const ws = (e as CustomEvent).detail?.workspace;
      if (!ws) setName(null);
      else setTimeout(load, 150);
    };
    window.addEventListener('Leanna-workspace-changed', onChanged);
    return () => window.removeEventListener('Leanna-workspace-changed', onChanged);
  }, []);
  return name;
}

export function basename(path: string): string {
  const parts = path.replace(/[\\/]+$/, '').split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
