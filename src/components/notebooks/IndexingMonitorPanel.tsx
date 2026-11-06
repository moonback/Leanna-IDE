import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, CheckCircle2, Clock3, Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import { api, apiVoid } from './api/client.js';
import { NbButton } from './ui/primitives.js';
import { useToast } from '../ui/Toast.js';

type IndexingState = 'pending' | 'indexed' | 'partial' | 'failed' | 'unknown';
interface SourceIndexingItem {
  id: string;
  title: string;
  type: string;
  indexingStatus: IndexingState;
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
  sources: SourceIndexingItem[];
}

const STATUS_LABEL: Record<IndexingState, string> = {
  indexed: 'Indexée',
  pending: 'En cours',
  partial: 'Partielle',
  failed: 'En échec',
  unknown: 'Non vérifiée',
};

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export function IndexingMonitorPanel({ notebookId }: { notebookId: string }) {
  const { success, error: toastError } = useToast();
  const [snapshot, setSnapshot] = useState<IndexingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busySource, setBusySource] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await api<{ status: string; indexing: IndexingSnapshot }>(
        `/api/notebooks/${notebookId}/embeddings/indexing-status`
      );
      if (!response.indexing || !Array.isArray(response.indexing.sources)) {
        throw new Error('Réponse de supervision invalide.');
      }
      setSnapshot(response.indexing);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Impossible de charger la supervision.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [notebookId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { void load(true); }, 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  const retryOne = async (sourceId: string) => {
    setBusySource(sourceId);
    try {
      await apiVoid(`/api/notebooks/${notebookId}/embeddings/sources/${sourceId}/retry`, { method: 'POST' });
      success('Réindexation lancée');
      await load(true);
    } catch (error) {
      toastError(error instanceof Error ? error.message : 'Impossible de relancer cette source');
    } finally {
      setBusySource(null);
    }
  };

  const retryAll = async () => {
    setRetryingAll(true);
    try {
      const response = await api<{ queued?: number }>(`/api/notebooks/${notebookId}/embeddings/reindex`, { method: 'POST' });
      success(`${response.queued ?? 0} source(s) placée(s) en réindexation`);
      await load(true);
    } catch (error) {
      toastError(error instanceof Error ? error.message : 'Impossible de relancer l’indexation');
    } finally {
      setRetryingAll(false);
    }
  };

  const coverage = useMemo(() => snapshot && snapshot.total > 0
    ? Math.round((snapshot.indexed / snapshot.total) * 100) : 0, [snapshot]);

  if (loading) return <div className="flex h-full items-center justify-center gap-2 text-sm text-[var(--text-muted)]"><Loader2 className="h-4 w-4 animate-spin" />Chargement de la supervision…</div>;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]"><Activity className="h-4 w-4 text-[var(--notebook-accent)]" />Supervision de l’indexation</div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">État réel de l’indexation vectorielle des sources. L’extraction et le résumé ne sont pas encore instrumentés par étapes.</p>
        </div>
        <NbButton variant="ghost" size="sm" icon={RefreshCw} onClick={() => void load(true)} disabled={refreshing}>Actualiser</NbButton>
      </div>

      {loadError && <div role="alert" className="rounded-xl border border-[var(--notebook-border)] p-3 text-sm text-[var(--text-secondary)]"><p>{loadError}</p><button type="button" className="mt-2 text-xs font-medium text-[var(--notebook-accent)]" onClick={() => void load()}>Réessayer le chargement</button></div>}

      {snapshot && <>
        <div className="grid grid-cols-2 gap-2">
          {[
            ['Sources', snapshot.total, Activity],
            ['Indexées', snapshot.indexed, CheckCircle2],
            ['En cours', snapshot.pending, Clock3],
            ['En anomalie', snapshot.failed + snapshot.partial, AlertCircle],
          ].map(([label, value, Icon]) => {
            const Glyph = Icon as typeof Activity;
            return <div key={String(label)} className="rounded-xl border border-[var(--notebook-border)] bg-[var(--notebook-surface)] p-3">
              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]"><Glyph className="h-3.5 w-3.5" />{label}</div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-[var(--text-primary)]">{value as number}</div>
            </div>;
          })}
        </div>

        <section className="rounded-xl border border-[var(--notebook-border)] p-3">
          <div className="flex items-center justify-between text-xs"><span className="font-medium text-[var(--text-secondary)]">Couverture des sources indexées</span><strong className="tabular-nums text-[var(--text-primary)]">{coverage}%</strong></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--notebook-surface-muted)]"><div className="h-full rounded-full bg-[var(--notebook-accent)] transition-[width]" style={{ width: `${coverage}%` }} /></div>
          <p className="mt-2 text-[11px] text-[var(--text-muted)]">{snapshot.attempts} tentative(s) cumulée(s) · actualisation toutes les 5 secondes</p>
        </section>

        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Sources</h3>
          <NbButton variant="secondary" size="sm" icon={RotateCcw} onClick={retryAll} disabled={retryingAll || snapshot.total === 0}>
            {retryingAll ? 'Lancement…' : 'Tout réindexer'}
          </NbButton>
        </div>

        {snapshot.sources.length === 0 ? <p className="rounded-xl border border-dashed border-[var(--notebook-border)] p-5 text-center text-sm text-[var(--text-muted)]">Aucune source dans ce notebook.</p> : (
          <div className="space-y-2">
            {snapshot.sources.map(source => {
              const needsRetry = source.indexingStatus !== 'indexed';
              return <article key={source.id} className="rounded-xl border border-[var(--notebook-border)] bg-[var(--notebook-surface)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]" title={source.title}>{source.title}</p>
                    <p className="mt-1 text-[11px] text-[var(--text-muted)]">{source.type} · {STATUS_LABEL[source.indexingStatus] || STATUS_LABEL.unknown}</p>
                  </div>
                  {needsRetry && <NbButton variant="ghost" size="sm" icon={busySource === source.id ? Loader2 : RotateCcw} onClick={() => void retryOne(source.id)} disabled={busySource !== null || retryingAll}>{busySource === source.id ? 'Envoi…' : 'Réessayer'}</NbButton>}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)]">
                  <span>{source.indexingAttempts} tentative(s)</span>
                  <span>Dernière activité : {formatDate(source.indexingUpdatedAt)}</span>
                  {source.indexingNextRetryAt && <span>Prochaine reprise : {formatDate(source.indexingNextRetryAt)}</span>}
                </div>
                {source.indexingError && <p className="mt-2 break-words rounded-lg bg-[var(--notebook-surface-muted)] p-2 text-xs text-[var(--text-secondary)]">{source.indexingError}</p>}
              </article>;
            })}
          </div>
        )}
      </>}
    </div>
  );
}
