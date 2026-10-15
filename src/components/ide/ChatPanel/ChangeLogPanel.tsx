import { useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { History, X, FileCode, ExternalLink, Trash2 } from 'lucide-react';
import type { ChangeLogEntry } from './useChangeLog.js';

// ─── Panneau « Modifications appliquées » (feature #9) ───────────────────────
//
// Liste rétractable des fichiers créés/modifiés et appliqués depuis le début de
// la conversation (données fournies par useChangeLog). Chaque entrée permet
// d'ouvrir le fichier dans l'éditeur ou de la retirer du journal.

export interface ChangeLogPanelProps {
  entries: ChangeLogEntry[];
  open: boolean;
  reduceMotion?: boolean;
  onClose: () => void;
  onClear: () => void;
  onRemove: (path: string) => void;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} j`;
}

export function ChangeLogPanel({
  entries, open, reduceMotion = false, onClose, onClear, onRemove,
}: ChangeLogPanelProps) {
  const openFile = useCallback((path: string) => {
    window.dispatchEvent(new CustomEvent('Leanna-action', { detail: { type: 'open-file', path } }));
  }, []);

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={{ duration: reduceMotion ? 0.12 : 0.22 }}
          className="flex-shrink-0 overflow-hidden"
          style={{ borderBottom: '1px solid var(--border-base)', backgroundColor: 'var(--bg-secondary)' }}
          aria-label="Modifications appliquées"
        >
          {/* En-tête */}
          <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid var(--border-base)' }}>
            <History size={13} style={{ color: 'var(--accent-primary)' }} />
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
              Modifications appliquées
            </span>
            <span
              className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1.5 rounded-full text-xs font-semibold"
              style={{ backgroundColor: 'color-mix(in srgb, var(--accent-primary) 18%, transparent)', color: 'var(--accent-primary)' }}
            >
              {entries.length}
            </span>
            {entries.length > 0 && (
              <button
                type="button"
                onClick={onClear}
                className="ml-auto text-xs transition-colors hover:text-[var(--color-error)]"
                style={{ color: 'var(--text-muted)' }}
              >
                Tout effacer
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className={`${entries.length > 0 ? '' : 'ml-auto'} p-1 rounded-md transition-colors hover:bg-[var(--bg-active)]`}
              title="Fermer le journal"
              aria-label="Fermer le journal des modifications"
            >
              <X size={13} style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>

          {/* Liste */}
          {entries.length === 0 ? (
            <p className="px-3 py-4 text-xs text-center" style={{ color: 'var(--text-dimmed)' }}>
              Aucune modification appliquée pour l'instant. Les fichiers que vous
              validez depuis le chat apparaîtront ici.
            </p>
          ) : (
            <ul className="m-0 p-0 list-none" style={{ maxHeight: '220px', overflowY: 'auto' }}>
              <AnimatePresence initial={false}>
                {entries.map((entry) => {
                  const name = entry.path.split(/[/\\]/).pop() || entry.path;
                  return (
                    <motion.li
                      key={entry.path}
                      layout={!reduceMotion}
                      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                      transition={{ duration: reduceMotion ? 0.12 : 0.18 }}
                      className="group flex items-center gap-2 px-3 py-2"
                      style={{ borderBottom: '1px solid color-mix(in srgb, var(--border-base) 60%, transparent)' }}
                    >
                      <FileCode size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      <button
                        type="button"
                        onClick={() => openFile(entry.path)}
                        className="min-w-0 flex-1 text-left"
                        title={`Ouvrir ${entry.path}`}
                      >
                        <span className="block text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          {name}
                        </span>
                        <span className="block text-xs font-mono truncate" style={{ color: 'var(--text-dimmed)' }}>
                          {entry.path}
                        </span>
                      </button>
                      <span className="flex items-center gap-1.5 text-xs font-mono flex-shrink-0">
                        {entry.added > 0 && <span style={{ color: 'var(--color-success)' }}>+{entry.added}</span>}
                        {entry.removed > 0 && <span style={{ color: 'var(--color-error)' }}>-{entry.removed}</span>}
                      </span>
                      {entry.count > 1 && (
                        <span
                          className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0"
                          style={{ color: 'var(--text-muted)', backgroundColor: 'color-mix(in srgb, var(--text-muted) 12%, transparent)' }}
                          title={`${entry.count} applications`}
                        >
                          ×{entry.count}
                        </span>
                      )}
                      <span className="text-xs tabular-nums flex-shrink-0 hidden sm:inline" style={{ color: 'var(--text-dimmed)' }}>
                        {relativeTime(entry.lastAt)}
                      </span>
                      <button
                        type="button"
                        onClick={() => openFile(entry.path)}
                        className="p-1 rounded-md transition-colors hover:bg-[var(--bg-active)] flex-shrink-0"
                        title="Ouvrir le fichier"
                        aria-label={`Ouvrir ${name}`}
                      >
                        <ExternalLink size={12} style={{ color: 'var(--text-muted)' }} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemove(entry.path)}
                        className="p-1 rounded-md transition-colors opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-active)] flex-shrink-0"
                        title="Retirer du journal"
                        aria-label={`Retirer ${name} du journal`}
                      >
                        <Trash2 size={12} style={{ color: 'var(--text-muted)' }} />
                      </button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
