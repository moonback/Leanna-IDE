import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Wrench, ShieldCheck, CornerDownRight, ArrowRight, type LucideIcon } from 'lucide-react';
import type { SuggestionKind, SuggestionSet } from './proactiveSuggestions.js';

const KIND_ICON: Record<SuggestionKind, LucideIcon> = {
  start: Sparkles,
  fix: Wrench,
  verify: ShieldCheck,
  reply: CornerDownRight,
  followup: ArrowRight,
};

/** Couleur d'accent par nature de suggestion (une erreur doit se voir). */
const KIND_ACCENT: Record<SuggestionKind, string> = {
  start: 'var(--accent-primary)',
  fix: 'var(--color-error)',
  verify: 'var(--color-success)',
  reply: 'var(--accent-primary)',
  followup: 'var(--accent-primary)',
};

export interface SuggestionChipsProps {
  visible: boolean;
  suggestions: SuggestionSet;
  onSend: (prompt: string) => void;
}

/**
 * Suggestions proactives affichées au-dessus du champ : amorces quand le chat
 * est vide, puis prochaines étapes déduites du contexte (erreurs, fichiers
 * modifiés, question en attente).
 */
export function SuggestionChips({ visible, suggestions, onSend }: SuggestionChipsProps) {
  const { title, items } = suggestions;
  const isStart = items.every(i => i.kind === 'start');

  return (
    <AnimatePresence>
      {visible && items.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="mb-2.5"
          role="group"
          aria-label={title}
        >
          <div
            className="flex items-center gap-1.5 mb-2 px-0.5 text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--accent-primary)', opacity: 0.8 }}
          >
            <Sparkles size={10} aria-hidden="true" />
            {title}
          </div>

          <div className={isStart ? 'grid grid-cols-2 gap-1.5' : 'flex flex-wrap gap-1.5'}>
            {items.map((chip, i) => {
              const Icon = KIND_ICON[chip.kind];
              const accent = KIND_ACCENT[chip.kind];
              return (
                <motion.button
                  key={chip.id}
                  type="button"
                  onClick={() => onSend(chip.prompt)}
                  title={chip.prompt}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.16, delay: i * 0.05, ease: 'easeOut' }}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.97 }}
                  className={`lea-chip group/chip flex items-center gap-2 text-xs font-medium text-left
                              focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/50
                              ${isStart ? 'px-2.5 py-1.5 rounded-lg' : 'pl-1.5 pr-3 py-1 rounded-full max-w-full'}`}
                  style={{ '--chip-accent': accent } as React.CSSProperties}
                >
                  <span
                    className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md"
                    style={{ backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)` }}
                    aria-hidden="true"
                  >
                    <Icon size={11} style={{ color: accent }} />
                  </span>
                  <span className="truncate leading-tight">{chip.label}</span>
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
