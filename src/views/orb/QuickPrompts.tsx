import { motion } from 'motion/react';
import { Zap } from 'lucide-react';

export const QUICK_PROMPTS = [
  'Où en sont mes missions ?',
  'Résume ce que tu viens de faire',
  'Analyse mon écran',
  'Aide-moi à déboguer',
  'Propose la prochaine étape',
];

/** Suggestions rapides cliquables au-dessus de la zone de saisie. */
export function QuickPrompts({ onPick, disabled, reduceMotion }: {
  onPick: (text: string) => void; disabled: boolean; reduceMotion: boolean;
}) {
  return (
    <div className="flex w-full gap-2 overflow-x-auto pb-1 custom-scrollbar" role="list" aria-label="Suggestions rapides">
      {QUICK_PROMPTS.map((p, i) => (
        <motion.button key={p} type="button" role="listitem" disabled={disabled} onClick={() => onPick(p)}
          initial={reduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04 }}
          whileHover={reduceMotion || disabled ? undefined : { y: -2 }}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
          style={{ backgroundColor: 'var(--bg-ctrl)', border: '1px solid var(--border-base)', color: 'var(--text-secondary)' }}>
          <Zap className="h-3 w-3" style={{ color: 'var(--accent-primary)' }} />{p}
        </motion.button>
      ))}
    </div>
  );
}
