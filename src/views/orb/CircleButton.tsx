import { motion } from 'motion/react';
import type { ReactNode } from 'react';

/** Bouton de contrôle rond (micro, partage d'écran…), aligné sur le design system. */
export function CircleButton({ onClick, disabled, active, title, label, children, reduceMotion }: {
  onClick: () => void; disabled?: boolean; active?: boolean; title: string; label: string; children: ReactNode; reduceMotion: boolean;
}) {
  return (
    <motion.button
      type="button" onClick={onClick} disabled={disabled}
      whileTap={reduceMotion || disabled ? undefined : { scale: 0.93 }}
      title={title} aria-label={label} aria-pressed={active}
      className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-lg)] transition-all duration-150 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
      style={{
        backgroundColor: active ? 'var(--accent-subtle)' : 'var(--bg-ctrl)',
        color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
        border: `1px solid ${active ? 'color-mix(in srgb, var(--accent-primary) 55%, transparent)' : 'var(--border-base)'}`,
      }}
    >
      {children}
    </motion.button>
  );
}
