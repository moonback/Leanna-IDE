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
                <p className="text-xs py-1.5" style={{ color: 'var(--color-error, #ef4444)' }}>
                  {error}
                </p>
              )}

              {summary && (
                <div
                  className="text-xs leading-[1.7] space-y-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {summary.split('\n').map((line, i) => {
                    // Headers (### or ##)
                    if (line.startsWith('### ') || line.startsWith('## ')) {
                      const text = line.replace(/^#{2,3}\s*/, '');
                      return (
                        <p key={i} className="text-xs font-semibold mt-2 mb-0.5" style={{ color: 'var(--text-primary)' }}>
                          {text}
                        </p>
                      );
                    }

                    // Bold line (entire line is bold)
                    if (/^\*\*.+\*\*$/.test(line.trim())) {
                      const text = line.trim().replace(/^\*\*|\*\*$/g, '');
                      return (
                        <p key={i} className="text-xs font-semibold mt-1.5 mb-0.5" style={{ color: 'var(--text-primary)' }}>
                          {text}
                        </p>
                      );
                    }

                    // Inline bold + italic
                    let rendered = line
                      .replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--text-primary);font-weight:600">$1</strong>')
                      .replace(/\*(.*?)\*/g, '<em>$1</em>')
                      .replace(/`(.*?)`/g, '<code style="background:rgba(255,255,255,0.06);padding:1px 4px;border-radius:3px;font-size:10px;font-family:monospace">$1</code>');

                    // Bullet points
                    if (/^\s*[-•]\s/.test(line)) {
                      return (
                        <div key={i} className="flex gap-1.5 pl-1 my-0.5">
                          <span className="text-xs mt-px flex-shrink-0" style={{ color: 'var(--accent-primary)', opacity: 0.7 }}>•</span>
                          <p
                            className="flex-1"
                            dangerouslySetInnerHTML={{ __html: rendered.replace(/^\s*[-•]\s*/, '') }}
                          />
                        </div>
                      );
                    }

                    // Numbered lists
                    const numMatch = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
                    if (numMatch) {
                      const num = numMatch[1];
                      const rest = rendered.replace(/^\s*\d+[.)]\s*/, '');
                      return (
                        <div key={i} className="flex gap-1.5 pl-1 my-0.5">
                          <span className="text-xs font-medium mt-px flex-shrink-0 w-3 text-right" style={{ color: 'var(--accent-primary)', opacity: 0.7 }}>{num}.</span>
                          <p className="flex-1" dangerouslySetInnerHTML={{ __html: rest }} />
                        </div>
                      );
                    }

                    // Empty line → spacing
                    if (line.trim() === '') return <div key={i} className="h-1" />;

                    // Regular paragraph
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
