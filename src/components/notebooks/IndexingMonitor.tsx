import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, Loader2, RefreshCw, RotateCcw, XCircle } from 'lucide-react';
import { api, apiVoid } from './api/client.js';
import { NbButton } from './ui/primitives.js';

type IndexState = 'indexed' | 'pending' | 'partial' | 'failed' | 'unknown';
interface IndexSource {
  id: string;
  title: string;
  type: string;
  indexingStatus: IndexState;
  indexingError?: string;
  indexingUpdatedAt?: string;
  indexingAttempts: number;
  indexingNextRetryAt?: string;
}
interface IndexingSnapshot {
  total: number;
  indexed: number;
  pending: number;
  partial: number;
  failed: number;
  attempts: number;
  sources: IndexSource[];
}

const statusMeta: Record<IndexState, { label: string; icon: typeof CheckCircle2; className: string }> = {
  indexed: { label: 'Indexée', icon: CheckCircle2, className: 'text-emerald-500' },
  pending: { label: 'En attente', icon: Clock3, className: 'text-amber-500' },
  partial: { label: 'Partielle', icon: AlertCircle, className: 'text-amber-500' },
  failed: { label: 'Échec', icon: XCircle, className: 'text-red-500' },
  unknown: { label: 'Non vérifiée', icon: Clock3, className: 'text-[var(--text-muted)]' },
};

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export function IndexingMonitor({ notebookId }: { notebookId: string }) {
  const [snapshot, setSnapshot] = useState<IndexingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busySource, setBusySource] = useState<string | null>(null);
  const [reindexing, setReindexing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const result = await api<{ status: string; indexing: IndexingSnapshot }>(
        `/api/notebooks/${notebookId}/embeddings/indexing-status`,
      );
      setSnapshot(result.indexing);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de récupérer le statut d’indexation.');
    } finally {
      setLoading(false);
      if (!quiet) setRefreshing(false);
    }
  }, [notebookId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(true); }, 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const retrySource = async (sourceId: string) => {
    setBusySource(sourceId);
    try {
      await apiVoid(`/api/notebooks/${notebookId}/embeddings/sources/${sourceId}/retry`, { method: 'POST' });
      await refresh(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'La relance a échoué.');
    } finally {
      setBusySource(null);
    }
  };

  const reindexAll = async () => {
    setReindexing(true);
    try {
      const result = await api<{ queued?: number }>(`/api/notebooks/${notebookId}/embeddings/reindex`, { method: 'POST' });
      setError(result.queued === 0 ? 'Aucune source à réindexer.' : `${result.queued ?? 0} source(s) placée(s) en réindexation.`);
      await refresh(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'La réindexation a échoué.');
    } finally {
      setReindexing(false);
    }
  };

  const percentage = snapshot && snapshot.total > 0
    ? Math.round((snapshot.indexed / snapshot.total) * 100)
    : 0;

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Supervision de l’indexation">
      <header className="notebook-panel-header flex-shrink-0">
        <div className="min-w-0">
          <h2 className="notebook-panel-title">Indexation</h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">État réel des embeddings par source</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => void refresh()} disabled={refreshing} aria-label="Actualiser les statuts" className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--notebook-surface-muted)] disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {error && <div role="alert" className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-500">{error}</div>}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--text-muted)]"><Loader2 className="h-4 w-4 animate-spin" /> Chargement des statuts…</div>
        ) : snapshot ? (
          <>
            <div className="rounded-xl border border-[var(--notebook-border)] bg-[var(--notebook-surface)] p-4">
              <div className="flex items-end justify-between gap-3">
                <div><p className="text-xs text-[var(--text-muted)]">Sources indexées</p><p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text-primary)]">{snapshot.indexed}<span className="text-sm font-normal text-[var(--text-muted)]"> / {snapshot.total}</span></p></div>
                <span className="text-sm font-semibold tabular-nums text-[var(--text-secondary)]">{percentage}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--notebook-surface-muted)]"><div className="h-full rounded-full bg-[var(--notebook-accent)] transition-all" style={{ width: `${percentage}%` }} /></div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div><p className="text-lg font-semibold tabular-nums text-amber-500">{snapshot.pending}</p><p className="text-[10px] text-[var(--text-muted)]">En attente</p></div>
                <div><p className="text-lg font-semibold tabular-nums text-amber-500">{snapshot.partial}</p><p className="text-[10px] text-[var(--text-muted)]">Partielles</p></div>
                <div><p className="text-lg font-semibold tabular-nums text-red-500">{snapshot.failed}</p><p className="text-[10px] text-[var(--text-muted)]">En échec</p></div>
              </div>
              <p className="mt-3 text-[10px] text-[var(--text-muted)]">Tentatives cumulées : {snapshot.attempts}</p>
            </div>

            <NbButton variant="secondary" size="sm" icon={RotateCcw} onClick={reindexAll} disabled={reindexing || snapshot.total === 0}>
              {reindexing ? 'Mise en file…' : 'Réindexer toutes les sources'}
            </NbButton>

            <div className="space-y-2">
              <div className="flex items-center justify-between"><h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Détail des sources</h3><span className="text-[10px] text-[var(--text-muted)]">Actualisation · 5 s</span></div>
              {snapshot.sources.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[var(--notebook-border)] px-3 py-6 text-center text-xs text-[var(--text-muted)]">Aucune source dans ce notebook.</p>
              ) : snapshot.sources.map(source => {
                const meta = statusMeta[source.indexingStatus] || statusMeta.unknown;
                const StatusIcon = meta.icon;
                const retryable = source.indexingStatus !== 'indexed'; // Inclut les sources historiques sans statut (unknown).
                return (
                  <article key={source.id} className="rounded-lg border border-[var(--notebook-border)] bg-[var(--notebook-surface)] p-3">
                    <div className="flex items-start gap-2">
                      <StatusIcon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${meta.className}`} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-[var(--text-primary)]" title={source.title}>{source.title}</p>
                        <p className={`mt-1 text-[11px] ${meta.className}`}>{meta.label} · {source.type} · {source.indexingAttempts} tentative(s)</p>
                      </div>
                      {retryable && <button type="button" onClick={() => void retrySource(source.id)} disabled={busySource === source.id} className="flex-shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-[var(--notebook-accent)] hover:bg-[var(--notebook-surface-muted)] disabled:opacity-50">{busySource === source.id ? 'Relance…' : 'Réessayer'}</button>}
                    </div>
                    {source.indexingError && <p className="mt-2 break-words text-[11px] text-red-500">{source.indexingError}</p>}
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[var(--text-muted)]">
                      <span>Dernière mise à jour : {formatDate(source.indexingUpdatedAt)}</span>
                      {source.indexingNextRetryAt && <span>Prochaine tentative : {formatDate(source.indexingNextRetryAt)}</span>}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        ) : <p className="py-8 text-center text-xs text-[var(--text-muted)]">Aucune donnée de supervision disponible.</p>}
      </div>
    </section>
  );
}
