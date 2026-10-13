
/**
 * SourcesSummaryCard — Encart de résumé global des sources
 *
 * Affiche un résumé IA combinant toutes les sources du notebook.
 * Se met à jour automatiquement lorsqu'une nouvelle source est ajoutée.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  FileText,
  AlertCircle,
} from 'lucide-react';

import { safeMarkdownParse } from '../../utils/sanitizeMarkdownHtml.js';
import { NbBadge, NbIconButton } from './ui/primitives.js';

interface Props {
  notebookId: string;
  sourcesCount: number;

  /** Utilisé comme signal de rafraîchissement — change quand les sources changent */
  sourcesHash: string;
}

export function SourcesSummaryCard({
  notebookId,
  sourcesCount,
  sourcesHash,
}: Props) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const lastHashRef = useRef<string>('');

  const fetchSummary = useCallback(
    async (forceRefresh = false) => {
      if (sourcesCount === 0) {
        setSummary(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        if (forceRefresh) {
          const deleteRes = await fetch(
            `/api/notebooks/${notebookId}/sources-summary`,
            { method: 'DELETE' },
          );

          if (!deleteRes.ok) {
            throw new Error('Impossible de régénérer le résumé');
          }
        }

        const res = await fetch(
          `/api/notebooks/${notebookId}/sources-summary`,
        );

        if (!res.ok) {
          const data = await res.json().catch(() => ({
            error: 'Erreur inconnue',
          }));

          throw new Error(data.error || `HTTP ${res.status}`);
        }

        const data = await res.json();

        setSummary(data.summary);
        lastHashRef.current = sourcesHash;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Une erreur est survenue lors de la génération du résumé';

        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [notebookId, sourcesCount, sourcesHash],
  );

  useEffect(() => {
    if (sourcesCount === 0) {
      setSummary(null);
      return;
    }

    if (lastHashRef.current !== sourcesHash) {
      fetchSummary(lastHashRef.current !== '');
    }
  }, [sourcesHash, sourcesCount, fetchSummary]);

  if (sourcesCount === 0) {
    return null;
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.25,
        ease: 'easeOut',
      }}
      className="notebook-card group relative overflow-hidden"
    >
      {/* Accent lumineux supérieur */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--notebook-accent),transparent)] opacity-60"
      />

      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setCollapsed((value) => !value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setCollapsed((value) => !value);
          }
        }}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--notebook-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--notebook-accent)]"
        aria-expanded={!collapsed}
      >
        {/* Icône */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--notebook-accent-surface)] text-[var(--notebook-accent)]">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
        </div>

        {/* Titre */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="notebook-panel-title">
              Résumé IA
            </span>

            <NbBadge>
              {sourcesCount} source{sourcesCount > 1 ? 's' : ''}
            </NbBadge>
          </div>

          <p className="mt-0.5 truncate text-xs text-[var(--text-dimmed)]">
            Synthèse automatique de votre documentation
          </p>
        </div>

        {/* Actions */}
        <div
          className="flex shrink-0 items-center gap-1"
          onClick={(event) => event.stopPropagation()}
        >
          {loading && (
            <NbBadge tone="accent" icon={Loader2} className="mr-1 [&_svg]:animate-spin">
              Mise à jour
            </NbBadge>
          )}

          <NbIconButton
            icon={RefreshCw}
            size="sm"
            label="Régénérer le résumé"
            onClick={() => fetchSummary(true)}
            disabled={loading}
            className={loading ? '[&_svg]:animate-spin' : undefined}
          />

          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--notebook-surface-muted)] text-[var(--text-dimmed)]">
            {collapsed ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden />
            )}
          </div>
        </div>
      </div>

      {/* Contenu */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: {
                duration: 0.22,
                ease: 'easeOut',
              },
              opacity: {
                duration: 0.15,
              },
            }}
            className="overflow-hidden"
          >
            <div className="mx-4 border-t border-[var(--notebook-border)]" />

            <div className="px-4 pb-4 pt-3">
              {/* Génération initiale */}
              {loading && !summary && (
                <div className="flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-xl bg-[var(--notebook-surface-muted)]">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--notebook-accent-surface)] text-[var(--notebook-accent)]">
                    <Sparkles className="h-3.5 w-3.5 animate-pulse" aria-hidden />
                  </div>

                  <div className="text-center">
                    <p className="text-xs font-medium text-[var(--text-secondary)]">
                      Génération du résumé
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--text-dimmed)]">
                      Analyse de vos {sourcesCount} sources...
                    </p>
                  </div>
                </div>
              )}

              {/* Erreur */}
              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-[color-mix(in_srgb,var(--color-error)_20%,transparent)] bg-[var(--color-error-subtle)] px-3 py-2">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-error)]" aria-hidden />

                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[var(--color-error)]">
                      Impossible de générer le résumé
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
                      {error}
                    </p>
                  </div>
                </div>
              )}

              {/* Résumé */}
              {summary && (
                <div
                  className="sources-summary-content text-xs leading-[1.75] text-[var(--text-secondary)]"
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML sanitized with safeMarkdownParse
                  dangerouslySetInnerHTML={{
                    __html: safeMarkdownParse(summary),
                  }}
                />
              )}

              {/* État de mise à jour */}
              {loading && summary && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-3 flex items-center justify-center gap-1.5 border-t border-[var(--notebook-border)] pt-2"
                >
                  <Loader2 className="h-3 w-3 animate-spin text-[var(--notebook-accent)]" aria-hidden />

                  <span className="text-xs text-[var(--text-dimmed)]">
                    Actualisation du résumé...
                  </span>
                </motion.div>
              )}

              {/* Footer */}
              {!loading && summary && !error && (
                <div className="mt-3 flex items-center gap-1.5 border-t border-[var(--notebook-border)] pt-2 text-xs text-[var(--text-dimmed)]">
                  <FileText className="h-3 w-3" aria-hidden />

                  <span>
                    Résumé basé sur {sourcesCount} source
                    {sourcesCount > 1 ? 's' : ''}
                  </span>

                  <span className="ml-auto">
                    IA
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Styles du Markdown */}
      <style>{`
        .sources-summary-content p {
          margin: 0 0 0.65rem;
        }

        .sources-summary-content p:last-child {
          margin-bottom: 0;
        }

        .sources-summary-content h1,
        .sources-summary-content h2,
        .sources-summary-content h3,
        .sources-summary-content h4 {
          margin: 1rem 0 0.45rem;
          font-weight: 600;
          line-height: 1.35;
          color: var(--text-primary);
        }

        .sources-summary-content h1 {
          font-size: 0.9rem;
        }

        .sources-summary-content h2 {
          font-size: 0.82rem;
        }

        .sources-summary-content h3,
        .sources-summary-content h4 {
          font-size: 0.76rem;
        }

        .sources-summary-content h1:first-child,
        .sources-summary-content h2:first-child,
        .sources-summary-content h3:first-child {
          margin-top: 0;
        }

        .sources-summary-content ul,
        .sources-summary-content ol {
          margin: 0.4rem 0 0.75rem;
          padding-left: 1.2rem;
        }

        .sources-summary-content li {
          margin: 0.25rem 0;
          padding-left: 0.15rem;
        }

        .sources-summary-content strong {
          color: var(--text-primary);
          font-weight: 600;
        }

        .sources-summary-content em {
          color: var(--text-muted);
        }

        .sources-summary-content blockquote {
          margin: 0.7rem 0;
          padding: 0.55rem 0.75rem;
          border-left: 2px solid var(--notebook-accent);
          border-radius: 0 0.5rem 0.5rem 0;
          background: color-mix(
            in srgb,
            var(--notebook-accent) 5%,
            transparent
          );
          color: var(--text-muted);
        }

        .sources-summary-content code {
          padding: 0.12rem 0.3rem;
          border-radius: 0.3rem;
          background: color-mix(
            in srgb,
            var(--text-primary) 7%,
            transparent
          );
          font-family: var(--font-mono, monospace);
          font-size: 0.9em;
        }

        .sources-summary-content pre {
          margin: 0.7rem 0;
          padding: 0.75rem;
          overflow-x: auto;
          border-radius: 0.65rem;
          background: color-mix(
            in srgb,
            var(--notebook-canvas) 70%,
            var(--notebook-surface) 30%
          );
        }

        .sources-summary-content pre code {
          padding: 0;
          background: transparent;
        }

        .sources-summary-content a {
          color: var(--notebook-accent);
          text-decoration: none;
        }

        .sources-summary-content a:hover {
          text-decoration: underline;
        }

        .sources-summary-content hr {
          margin: 0.9rem 0;
          border: 0;
          border-top: 1px solid color-mix(
            in srgb,
            var(--text-primary) 7%,
            transparent
          );
        }

        .sources-summary-content table {
          width: 100%;
          margin: 0.75rem 0;
          border-collapse: collapse;
          font-size: 0.92em;
        }

        .sources-summary-content th,
        .sources-summary-content td {
          padding: 0.45rem 0.55rem;
          text-align: left;
          border-bottom: 1px solid color-mix(
            in srgb,
            var(--text-primary) 7%,
            transparent
          );
        }

        .sources-summary-content th {
          color: var(--text-primary);
          font-weight: 600;
        }
      `}</style>
    </motion.section>
  );
}

