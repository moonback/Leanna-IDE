import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, FileText, Terminal, FlaskConical } from 'lucide-react';

// Suggestions de départ — chips contextuelles affichées au-dessus du champ
// quand le chat est connecté et vide. Envoient directement une invite ;
// l'assistant reçoit déjà le contexte éditeur (fichier ouvert, sélection).
export const SUGGESTION_CHIPS: { label: string; prompt: string; icon: typeof FileText }[] = [
  { label: 'Expliquer ce fichier', prompt: 'Explique le fichier actuellement ouvert.', icon: FileText },
  { label: "Corriger l'erreur du terminal", prompt: 'Analyse la dernière erreur du terminal et propose un correctif.', icon: Terminal },
  { label: 'Résumer le projet', prompt: 'Donne-moi un résumé de la structure et du rôle de ce projet.', icon: Sparkles },
  { label: 'Écrire des tests', prompt: 'Propose des tests pour le fichier actuellement ouvert.', icon: FlaskConical },
];

export interface SuggestionChipsProps {
  visible: boolean;
  onSend: (prompt: string) => void;
}

/** Grille 2×2 de suggestions contextuelles affichée quand le chat est vide. */
export function SuggestionChips({ visible, onSend }: SuggestionChipsProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="mb-2.5"
        >
          <div
            className="flex items-center gap-1.5 mb-2 px-0.5 text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--accent-primary)', opacity: 0.75 }}
          >
            <Sparkles size={9} />
            Suggestions
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {SUGGESTION_CHIPS.map((chip, i) => (
              <motion.button
                key={chip.label}
                type="button"
                onClick={() => onSend(chip.prompt)}
                title={chip.prompt}
                aria-label={chip.label}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16, delay: i * 0.05, ease: 'easeOut' }}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.97 }}
                className="group/chip flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-left
                           transition-[background-color,border-color,box-shadow] duration-200
                           hover:shadow-[0_2px_12px_var(--accent-glow)]"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--accent-primary) 5%, var(--bg-surface))',
                  border: '1px solid var(--border-base)',
                  color: 'var(--text-secondary)',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--accent-subtle)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'color-mix(in srgb, var(--accent-primary) 40%, transparent)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'color-mix(in srgb, var(--accent-primary) 5%, var(--bg-surface))';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-base)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
                }}
              >
                <span
                  className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md transition-colors duration-200
                             group-hover/chip:bg-[color-mix(in_srgb,var(--accent-primary)_22%,transparent)]"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--accent-primary) 13%, transparent)' }}
                >
                  <chip.icon size={11} style={{ color: 'var(--accent-primary)' }} />
                </span>
                <span className="truncate leading-tight">{chip.label}</span>
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
