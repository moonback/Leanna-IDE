/**
 * SourcesSummaryCard — Encart de résumé global des sources
 *
 * Affiche un résumé IA combinant toutes les sources du notebook.
 * Se met à jour automatiquement lorsqu'une nouvelle source est ajoutée.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, RefreshCw, Loader2, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

interface Props {
  notebookId: string;
  sourcesCount: number;
  /** Utilisé comme signal de rafraîchissement — change quand les sources changent */
  sourcesHash: string;
}

export function SourcesSummaryCard({ notebookId, sourcesCount, sourcesHash }: Props) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const lastHashRef = useRef<string>('');

  const fetchSummary = useCallback(async (forceRefresh = false) => {
    if (sourcesCount === 0) {
      setSummary(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Si on force le refresh, invalider le cache côté serveur d'abord
      if (forceRefresh) {
        await fetch(`/api/notebooks/${notebookId}/sources-summary`, { method: 'DELETE' });
      }

      const res = await fetch(`/api/notebooks/${notebookId}/sources-summary`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'Erreur' }));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSummary(data.summary);
      lastHashRef.current = sourcesHash;
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [notebookId, sourcesCount, sourcesHash]);

  // Auto-fetch au montage et quand les sources changent
  useEffect(() => {
    if (sourcesCount === 0) {
      setSummary(null);
      return;
    }
    // Si le hash a changé (nouvelle source ajoutée/supprimée), refresh
    if (lastHashRef.current !== sourcesHash) {
      fetchSummary(lastHashRef.current !== ''); // force si pas premier chargement
    }
  }, [sourcesHash, sourcesCount, fetchSummary]);

  // Ne rien afficher s'il n'y a pas de sources
  if (sourcesCount === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-panel)',
        borderColor: 'var(--accent-primary)',
        borderWidth: '1px',
        boxShadow: '0 0 12px rgba(var(--accent-primary-rgb, 99, 102, 241), 0.08)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none"
        onClick={() => setCollapsed(!collapsed)}
        style={{ backgroundColor: 'rgba(var(--accent-primary-rgb, 99, 102, 241), 0.05)' }}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: 'var(--accent-subtle)' }}
        >
          <BookOpen className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
            Résumé des sources
          </p>
          <p className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
            Synthèse auto-générée • {sourcesCount} source{sourcesCount > 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex items-center gap-1">
          {loading && (
            <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--accent-primary)' }} />
          )}
          <button
            onClick={(e) => { e.stopPropagation(); fetchSummary(true); }}
            disabled={loading}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/10 disabled:opacity-40"
            title="Regénérer le résumé"
          >
            <RefreshCw className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
          </button>
          {collapsed ? (
            <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          ) : (
            <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          )}
        </div>
      </div>

      {/* Content */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1">
              {loading && !summary && (
                <div className="flex items-center gap-2 py-4 justify-center">
                  <Sparkles className="w-4 h-4 animate-pulse" style={{ color: 'var(--accent-primary)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Génération du résumé en cours...
                  </span>
                </div>
              )}

              {error && (
                <p className="text-xs py-2" style={{ color: 'var(--color-error, #ef4444)' }}>
                  Erreur : {error}
                </p>
              )}

              {summary && (
                <div
                  className="text-[11px] leading-relaxed prose prose-sm max-w-none"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {/* Render markdown-lite: bold, bullets, etc. */}
                  {summary.split('\n').map((line, i) => {
                    // Bold text
                    const rendered = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

                    if (line.startsWith('- ') || line.startsWith('• ')) {
                      return (
                        <p
                          key={i}
                          className="pl-3 my-0.5 relative before:content-['•'] before:absolute before:left-0 before:text-[var(--accent-primary)]"
                          dangerouslySetInnerHTML={{ __html: rendered.replace(/^[-•]\s*/, '') }}
                        />
                      );
                    }
                    if (line.trim() === '') return <div key={i} className="h-2" />;
                    return (
                      <p
                        key={i}
                        className="my-0.5"
                        dangerouslySetInnerHTML={{ __html: rendered }}
                      />
                    );
                  })}
                </div>
              )}

              {loading && summary && (
                <div className="flex items-center gap-1 mt-2 pt-2 border-t" style={{ borderColor: 'var(--border-base)' }}>
                  <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--accent-primary)' }} />
                  <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
                    Mise à jour...
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
