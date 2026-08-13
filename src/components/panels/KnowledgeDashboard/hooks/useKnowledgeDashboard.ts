// ═══════════════════════════════════════════════════════════════════════════════
// Hook useKnowledgeDashboard — fetch + auto-refresh configurable
// ═══════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DashboardPayload } from '../types';

interface UseKnowledgeDashboardOptions {
  /** Intervalle de rafraîchissement auto en ms (défaut: 15000, 0 = désactivé) */
  autoRefreshInterval?: number;
  /** Si true, charge immédiatement au montage (défaut: true) */
  immediate?: boolean;
  /** Callback optionnel sur erreur */
  onError?: (error: Error) => void;
  /** Callback optionnel sur succès */
  onSuccess?: (payload: DashboardPayload) => void;
}

interface UseKnowledgeDashboardReturn {
  payload: DashboardPayload | null;
  loading: boolean;
  error: Error | null;
  /** Déclenche un rechargement manuel */
  refresh: () => Promise<void>;
  /** Active/désactive l'auto-refresh */
  setAutoRefresh: (enabled: boolean) => void;
  /** Indique si l'auto-refresh est actif */
  autoRefresh: boolean;
  /** Timestamp du dernier chargement réussi */
  lastLoadedAt: number | null;
}

export function useKnowledgeDashboard(
  options: UseKnowledgeDashboardOptions = {}
): UseKnowledgeDashboardReturn {
  const {
    autoRefreshInterval = 15_000,
    immediate = true,
    onError,
    onSuccess,
  } = options;

  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(autoRefreshInterval > 0);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const fetchDashboard = useCallback(async () => {
    try {
      const token = localStorage.getItem('jarvis_api_token');
      const headers: Record<string, string> = token ? { 'x-jarvis-token': token } : {};
      const res = await fetch('/api/knowledge/dashboard', { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.status !== 'success') throw new Error(json.error || 'Erreur inconnue');

      if (!mountedRef.current) return;

      setPayload(json as DashboardPayload);
      setError(null);
      setLastLoadedAt(Date.now());
      onSuccess?.(json as DashboardPayload);
    } catch (e: any) {
      if (!mountedRef.current) return;
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      onError?.(err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [onError, onSuccess]);

  // Chargement initial
  useEffect(() => {
    if (immediate) {
      fetchDashboard();
    } else {
      setLoading(false);
    }
  }, [immediate, fetchDashboard]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh && autoRefreshInterval > 0) {
      intervalRef.current = setInterval(fetchDashboard, autoRefreshInterval);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, autoRefreshInterval, fetchDashboard]);

  // Nettoyage au démontage
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchDashboard();
  }, [fetchDashboard]);

  const toggleAutoRefresh = useCallback((enabled: boolean) => {
    setAutoRefresh(enabled);
  }, []);

  return {
    payload,
    loading,
    error,
    refresh,
    setAutoRefresh: toggleAutoRefresh,
    autoRefresh,
    lastLoadedAt,
  };
}