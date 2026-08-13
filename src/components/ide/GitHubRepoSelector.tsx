import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GitBranch, ArrowUp, ArrowDown, RefreshCw, CheckCircle2, AlertCircle, Loader2, Cloud } from 'lucide-react';
import { motion } from 'motion/react';

interface RepoSyncStatusProps {
  /** Compact mode (pour sidebar) vs expanded (pour panneau) */
  compact?: boolean;
}

interface GitStatus {
  branch: string;
  clean: boolean;
  ahead: number;
  behind: number;
  lastCommit: string;
  lastCommitDate: string;
}

/**
 * RepoSyncStatus — Indicateur de sync du repo Jarvis-OS (auto-référentiel).
 * Remplace l'ancien GitHubRepoSelector (clone multi-repos supprimé).
 * Affiche : branche courante, ahead/behind, boutons push/pull.
 */
export const GitHubRepoSelector = React.memo(function RepoSyncStatus({ compact = false }: RepoSyncStatusProps) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<'push' | 'pull' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/self-root/status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStatus({
        branch: data.gitBranch || 'main',
        clean: data.gitStatus === 'clean',
        ahead: data.aheadBehind?.ahead || 0,
        behind: data.aheadBehind?.behind || 0,
        lastCommit: data.lastCommit || '—',
        lastCommitDate: data.lastCommitDate || '—',
      });
    } catch (e: any) {
      setError(e.message || 'Erreur');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchStatus();
    // Refresh every 30s
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handlePush = useCallback(async () => {
    setSyncing('push');
    setError(null);
    try {
      const res = await fetch('/api/git/push', { method: 'POST' });
      const data = await res.json();
      if (data.error) setError(data.error);
      else await fetchStatus();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSyncing(null);
    }
  }, [fetchStatus]);

  const handlePull = useCallback(async () => {
    setSyncing('pull');
    setError(null);
    try {
      const res = await fetch('/api/git/pull', { method: 'POST' });
      const data = await res.json();
      if (data.error) setError(data.error);
      else await fetchStatus();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSyncing(null);
    }
  }, [fetchStatus]);

  if (loading && !status) {
    return (
      <div className="flex items-center gap-2 px-3 py-2" style={{ color: 'var(--text-dimmed)' }}>
        <Loader2 size={12} className="animate-spin" />
        <span className="text-[10px]">Chargement git…</span>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex items-center gap-2 px-3 py-2" style={{ color: 'var(--text-dimmed)' }}>
        <AlertCircle size={12} />
        <span className="text-[10px]">{error || 'Git indisponible'}</span>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
        style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <GitBranch size={11} style={{ color: '#f472b6' }} />
        <span className="text-[10px] font-medium" style={{ color: 'var(--text-primary)' }}>
          {status.branch}
        </span>
        {(status.ahead > 0 || status.behind > 0) && (
          <span className="text-[9px] font-mono" style={{ color: 'var(--text-dimmed)' }}>
            {status.ahead > 0 && <span style={{ color: '#4ade80' }}>↑{status.ahead}</span>}
            {status.behind > 0 && <span style={{ color: '#f59e0b' }}> ↓{status.behind}</span>}
          </span>
        )}
        <span className="w-1.5 h-1.5 rounded-full" style={{
          backgroundColor: status.clean ? '#4ade80' : '#f59e0b'
        }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 p-3 rounded-xl"
      style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: 'rgba(244,114,182,0.12)' }}>
            <GitBranch size={13} style={{ color: '#f472b6' }} />
          </div>
          <div>
            <p className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              {status.branch}
            </p>
            <p className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
              {status.clean ? 'Propre' : 'Modifications non commitées'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={fetchStatus}
          className="p-1.5 rounded-md transition-colors hover:bg-[color-mix(in_srgb,var(--text-muted)_10%,transparent)]"
          title="Rafraîchir"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* Status indicators */}
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1 text-[10px]"
          style={{ color: status.clean ? '#4ade80' : '#f59e0b' }}>
          {status.clean ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
          {status.clean ? 'Clean' : 'Dirty'}
        </span>
        {status.ahead > 0 && (
          <span className="flex items-center gap-1 text-[10px]" style={{ color: '#4ade80' }}>
            <ArrowUp size={11} /> {status.ahead} ahead
          </span>
        )}
        {status.behind > 0 && (
          <span className="flex items-center gap-1 text-[10px]" style={{ color: '#f59e0b' }}>
            <ArrowDown size={11} /> {status.behind} behind
          </span>
        )}
        {status.ahead === 0 && status.behind === 0 && (
          <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
            <Cloud size={11} /> À jour
          </span>
        )}
      </div>

      {/* Last commit */}
      <div className="text-[9px] px-2 py-1.5 rounded-lg" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-muted)' }}>
        <span className="font-mono">{status.lastCommit}</span>
        <span className="ml-2 opacity-60">{status.lastCommitDate}</span>
      </div>

      {/* Push/Pull actions */}
      <div className="flex gap-2">
        <motion.button
          type="button"
          onClick={handlePull}
          disabled={syncing !== null || status.behind === 0}
          whileTap={{ scale: 0.96 }}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-semibold transition-all disabled:opacity-40"
          style={{
            backgroundColor: status.behind > 0 ? 'color-mix(in srgb, #f59e0b 12%, transparent)' : 'var(--bg-base)',
            border: `1px solid ${status.behind > 0 ? 'color-mix(in srgb, #f59e0b 30%, transparent)' : 'var(--border-base)'}`,
            color: status.behind > 0 ? '#fbbf24' : 'var(--text-muted)',
          }}
        >
          {syncing === 'pull' ? <Loader2 size={11} className="animate-spin" /> : <ArrowDown size={11} />}
          Pull
        </motion.button>
        <motion.button
          type="button"
          onClick={handlePush}
          disabled={syncing !== null || status.ahead === 0}
          whileTap={{ scale: 0.96 }}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-semibold transition-all disabled:opacity-40"
          style={{
            backgroundColor: status.ahead > 0 ? 'color-mix(in srgb, #4ade80 12%, transparent)' : 'var(--bg-base)',
            border: `1px solid ${status.ahead > 0 ? 'color-mix(in srgb, #4ade80 30%, transparent)' : 'var(--border-base)'}`,
            color: status.ahead > 0 ? '#4ade80' : 'var(--text-muted)',
          }}
        >
          {syncing === 'push' ? <Loader2 size={11} className="animate-spin" /> : <ArrowUp size={11} />}
          Push
        </motion.button>
      </div>

      {/* Error */}
      {error && (
        <p className="text-[10px] px-2 py-1.5 rounded-lg"
          style={{ backgroundColor: 'color-mix(in srgb, #ef4444 8%, transparent)', color: '#f87171' }}>
          {error}
        </p>
      )}
    </div>
  );
});
