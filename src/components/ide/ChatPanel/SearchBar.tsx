import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';

export interface SearchBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  /** Nombre de messages correspondants. */
  matchCount: number;
  /** Index (1-based) de la correspondance courante, 0 si aucune. */
  currentMatch: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

/** Barre de recherche dans la conversation (filtre + navigation). */
export function SearchBar({
  query, onQueryChange, matchCount, currentMatch, onNext, onPrev, onClose,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) onPrev(); else onNext();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, height: 0 }}
      animate={{ opacity: 1, y: 0, height: 'auto' }}
      exit={{ opacity: 0, y: -8, height: 0 }}
      transition={{ duration: 0.16 }}
      className="px-3 py-2 flex-shrink-0 overflow-hidden"
      style={{ borderBottom: '1px solid var(--border-base)' }}
    >
      <div
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--bg-input) 55%, transparent)',
          border: '1px solid var(--border-base)',
        }}
      >
        <Search size={13} style={{ color: 'var(--text-dimmed)' }} className="flex-shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Rechercher dans la conversation…"
          className="flex-1 bg-transparent text-sm outline-none min-w-0 placeholder:text-[var(--text-dimmed)]"
          style={{ color: 'var(--text-primary)' }}
          aria-label="Rechercher dans la conversation"
        />

        {query.length > 0 && (
          <span className="text-xs font-mono flex-shrink-0" style={{ color: matchCount > 0 ? 'var(--text-muted)' : 'var(--color-warning)' }}>
            {matchCount > 0 ? `${currentMatch}/${matchCount}` : 'aucun'}
          </span>
        )}

        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            type="button"
            onClick={onPrev}
            disabled={matchCount === 0}
            className="p-1 rounded transition-colors hover:bg-[var(--bg-active)] disabled:opacity-30"
            title="Correspondance précédente (⇧Enter)"
            aria-label="Correspondance précédente"
          >
            <ChevronUp size={13} style={{ color: 'var(--text-muted)' }} />
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={matchCount === 0}
            className="p-1 rounded transition-colors hover:bg-[var(--bg-active)] disabled:opacity-30"
            title="Correspondance suivante (Enter)"
            aria-label="Correspondance suivante"
          >
            <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded transition-colors hover:bg-[var(--bg-active)]"
            title="Fermer la recherche (Échap)"
            aria-label="Fermer la recherche"
          >
            <X size={13} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
