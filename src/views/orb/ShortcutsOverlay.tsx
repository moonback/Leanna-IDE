import { motion } from 'motion/react';
import { Keyboard, X } from 'lucide-react';

export const SHORTCUTS: Array<[string, string]> = [
  ['C', 'Connecter / déconnecter'],
  ['M', 'Couper / réactiver le micro'],
  ['S', 'Partager l\'écran'],
  ['A', 'Panneau d\'activité'],
  ['H', 'Historique de conversation'],
  ['T', 'Sous-titres en direct'],
  ['V', 'Changer d\'avatar (mascotte / orbe)'],
  ['/', 'Écrire un message'],
  ['?', 'Afficher cette aide'],
  ['Échap', 'Fermer les panneaux'],
];

/** Fenêtre modale listant les raccourcis clavier de la vue. */
export function ShortcutsOverlay({ onClose, reduceMotion }: { onClose: () => void; reduceMotion: boolean }) {
  return (
    <motion.div className="absolute inset-0 z-40 flex items-center justify-center p-4"
      style={{ backgroundColor: 'color-mix(in srgb, var(--bg-base) 60%, transparent)', backdropFilter: 'blur(6px)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div role="dialog" aria-modal="true" aria-label="Raccourcis clavier"
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 360, damping: 30 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-[var(--radius-xl,16px)] p-4"
        style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-base)', boxShadow: 'var(--shadow-lg, 0 20px 50px rgba(0,0,0,0.4))' }}>
        <div className="mb-3 flex items-center gap-2">
          <Keyboard className="h-4 w-4" style={{ color: 'var(--accent-primary)' }} />
          <span className="text-sm font-semibold">Raccourcis clavier</span>
          <button type="button" onClick={onClose} aria-label="Fermer" className="ml-auto rounded p-1 hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="flex flex-col gap-1.5">
          {SHORTCUTS.map(([k, label]) => (
            <li key={k} className="flex items-center justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
              {label}
              <kbd className="min-w-7 rounded-md px-1.5 py-0.5 text-center font-mono text-xs"
                style={{ backgroundColor: 'var(--bg-ctrl)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}>{k}</kbd>
            </li>
          ))}
        </ul>
      </motion.div>
    </motion.div>
  );
}
