import { useCallback, useEffect, useRef, useState } from 'react';
import {
  autonomyApi,
  type IdleBudgetSnapshot,
  type IdleAuditEntry,
} from '../services/ideApi.js';

export interface UseIdleAutonomyOptions {
  /** Enable polling. Defaults to true. */
  enabled?: boolean;
  /** Poll interval in ms. Defaults to 5000. */
  intervalMs?: number;
  /** Max audit entries to request. Defaults to 100. */
  auditLimit?: number;
}

export interface UseIdleAutonomyResult {
  /**
   * GLOBAL rolling-hour budget across all autonomous activity (idle +
   * anticipation/executive missions). May be non-null even when the idle loop
   * itself is not wired (it then shows real consumption against the env
   * ceilings). `null` only on fetch failure before the first success.
   */
  budget: IdleBudgetSnapshot | null;
  /**
   * True when the idle loop is actually wired on the server (a runner is
   * supplied and the budget is enabled). Drives the kill-switch availability,
   * independently of the global budget above.
   */
  idleWired: boolean;
  /** Audit trail, newest first (reversed from the server's oldest-first order). */
  audit: IdleAuditEntry[];
  /** Kill-switch state. */
  paused: boolean;
  /** True while the first fetch is in flight. */
  loading: boolean;
  /** Last fetch error message, if any. */
  error: string | null;
  /** True while a pause/resume request is in flight. */
  toggling: boolean;
  /** Pause the idle loop (kill switch). Optimistic + refetch. */
  pause: () => Promise<void>;
  /** Resume the idle loop. Optimistic + refetch. */
  resume: () => Promise<void>;
  /** Force an immediate refresh. */
  refresh: () => void;
}

/**
 * Polls the /api/autonomy idle endpoints (budget, audit, paused) and exposes
 * the kill-switch controls. Plain fetch + interval, matching the IDE's hook
 * conventions (no React Query/SWR). Safe against unmount and overlapping polls.
 */
export function useIdleAutonomy({
  enabled = true,
  intervalMs = 5000,
  auditLimit = 100,
}: UseIdleAutonomyOptions = {}): UseIdleAutonomyResult {
  const [budget, setBudget] = useState<IdleBudgetSnapshot | null>(null);
  const [idleWired, setIdleWired] = useState(false);
  const [audit, setAudit] = useState<IdleAuditEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const tickRef = useRef(0);

  const load = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const [budgetRes, idleBudgetRes, auditRes, pausedRes] = await Promise.all([
        // Budget GLOBAL : reflète toute l'activité autonome (idle + missions
        // d'anticipation/executive), pas seulement les diagnostics idle.
        autonomyApi.getAutonomyBudget(),
        // Budget idle "brut" : sert UNIQUEMENT à savoir si la boucle idle est
        // câblée côté serveur (null = non câblée). Le journal d'audit et le
        // kill switch restent spécifiques à la boucle idle (ses contrôles).
        autonomyApi.getIdleBudget(),
        autonomyApi.getIdleAudit(auditLimit),
        autonomyApi.getIdlePaused(),
      ]);
      if (!mountedRef.current) return;
      setBudget(budgetRes);
      setIdleWired(idleBudgetRes !== null);
      // Server returns oldest-first; show newest-first in the UI.
      setAudit([...auditRes].reverse());
      setPaused(pausedRes);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mountedRef.current) setLoading(false);
      inFlightRef.current = false;
    }
  }, [auditLimit]);

  const refresh = useCallback(() => { void load(); }, [load]);

  const pause = useCallback(async () => {
    setToggling(true);
    setPaused(true); // optimistic
    try {
      const next = await autonomyApi.pauseIdle('operator (UI)');
      if (mountedRef.current) setPaused(next);
    } catch {
      if (mountedRef.current) setPaused(false); // rollback
    } finally {
      if (mountedRef.current) setToggling(false);
      void load();
    }
  }, [load]);

  const resume = useCallback(async () => {
    setToggling(true);
    setPaused(false); // optimistic
    try {
      const next = await autonomyApi.resumeIdle('operator (UI)');
      if (mountedRef.current) setPaused(next);
    } catch {
      if (mountedRef.current) setPaused(true); // rollback
    } finally {
      if (mountedRef.current) setToggling(false);
      void load();
    }
  }, [load]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      setLoading(false);
      return () => { mountedRef.current = false; };
    }
    void load();
    const id = window.setInterval(() => {
      tickRef.current++;
      void load();
    }, Math.max(1000, intervalMs));
    return () => {
      mountedRef.current = false;
      window.clearInterval(id);
    };
  }, [enabled, intervalMs, load]);

  return { budget, idleWired, audit, paused, loading, error, toggling, pause, resume, refresh };
}
