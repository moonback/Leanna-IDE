/**
 * SourcesSummaryCard — Encart de résumé global des sources
 *
 * Affiche un résumé IA combinant toutes les sources du notebook.
 * Se met à jour automatiquement lorsqu'une nouvelle source est ajoutée.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, RefreshCw, Loader2, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { sanitizeMarkdownHtml, safeMarkdownParse } from '../../utils/sanitizeMarkdownHtml';

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

  useEffect(() => {
    if (sourcesCount === 0) {
      setSummary(null);
      return;
    }
    if (lastHashRef.current !== sourcesHash) {
      fetchSummary(lastHashRef.current !== '');
    }
  }, [sourcesHash, sourcesCount, fetchSummary]);

  if (sourcesCount === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="rounded-xl overflow-hidden"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--bg-panel) 85%, var(--accent-primary) 15%)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2.5 px-3.5 py-2.5 cursor-pointer select-none transition-colors hover:bg-white/5"
        onClick={() => setCollapsed(!collapsed)}
      >
        <Sparkles className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--accent-primary)', opacity: 0.8 }} />
        <p className="flex-1 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          Résumé • {sourcesCount} source{sourcesCount > 1 ? 's' : ''}
        </p>

        <div className="flex items-center gap-0.5">
          {loading && (
            <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--accent-primary)' }} />
          )}
          <button
            onClick={(e) => { e.stopPropagation(); fetchSummary(true); }}
            disabled={loading}
            className="p-1 rounded-md transition-colors hover:bg-white/10 disabled:opacity-30"
            title="Regénérer"
          >
            <RefreshCw className="w-3 h-3" style={{ color: 'var(--text-dimmed)' }} />
          </button>
          {collapsed ? (
            <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--text-dimmed)' }} />
          ) : (
            <ChevronUp className="w-3.5 h-3.5" style={{ color: 'var(--text-dimmed)' }} />
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
            <div className="px-3.5 pb-3.5 pt-0.5">
              {loading && !summary && (
                <div className="flex items-center gap-2 py-3 justify-center">
                  <Sparkles className="w-3.5 h-3.5 animate-pulse" style={{ color: 'var(--accent-primary)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Génération en cours...
                  </span>
                </div>
              )}

              {error && (
                <p className="text-xs py-1.5" style={{ color: 'var(--color-error)' }}>
                  {error}
                </p>
              )}

              {summary && (
                <div
                  className="text-xs leading-[1.7] space-y-1"
                  style={{ color: 'var(--text-secondary)' }}
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML sanitized with safeMarkdownParse
                  dangerouslySetInnerHTML={{ __html: safeMarkdownParse(summary) }}
                />
              )}

              {loading && summary && (
                <div className="flex items-center gap-1 mt-2 pt-1.5">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" style={{ color: 'var(--accent-primary)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
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
