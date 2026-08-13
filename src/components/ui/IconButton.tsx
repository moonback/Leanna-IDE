import React, { useState } from 'react';
import { cva } from 'cva';
import { clsx } from 'clsx';

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------
const iconButtonVariants = cva({
  base: [
    'relative',
    'p-3',
    'rounded-full',
    'flex items-center justify-center',
    'transition-all duration-200 ease-out',
    'cursor-pointer select-none',
    'hover:scale-110',
    'focus-visible:outline-2 focus-visible:outline-offset-2',
    'focus-visible:outline-[var(--accent-primary)]',
    'focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/30',
    'disabled:opacity-40 disabled:cursor-not-allowed',
  ],
  variants: {
    variant: {
      /** Icône neutre */
      default: [
        'text-[var(--ctrl-icon)]',
        'hover:bg-[var(--ctrl-hover)]',
        'hover:text-[var(--ctrl-icon-hover)]',
        'active:scale-95',
      ],
      /** Toggled / accent */
      active: [
        'bg-[var(--btn-active-bg)]',
        'text-[var(--btn-active-text)]',
        'ring-1 ring-[var(--accent-primary)]/20',
        'hover:opacity-90',
        'active:scale-95',
      ],
      /** Toggled avec halo lumineux (premium) */
      'active-glow': [
        'bg-[var(--btn-active-bg)]',
        'text-[var(--btn-active-text)]',
        '-translate-y-[1px]',
        'active:scale-95',
      ],
      /** Destructif — rouge */
      danger: [
        'bg-[rgba(239,68,68,0.10)]',
        'text-[#ef4444]',
        'ring-1 ring-red-500/20',
        'hover:bg-[rgba(239,68,68,0.18)]',
        'active:scale-95',
      ],
      /** Bouton principal mis en avant */
      primary: [
        'p-3.5',
        'rounded-full',
        'bg-[var(--btn-active-bg)]',
        'text-[var(--btn-active-text)]',
        'hover:opacity-90',
        'active:scale-95',
      ],
      /** Bouton principal destructif (déconnexion) */
      'primary-danger': [
        'p-3.5',
        'rounded-2xl',
        'bg-[rgba(239,68,68,0.12)]',
        'text-[#ef4444]',
        'ring-1 ring-red-500/20',
        'hover:bg-[rgba(239,68,68,0.18)]',
        'active:scale-95',
      ],
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type IconButtonVariant = 'default' | 'active' | 'active-glow' | 'danger' | 'primary' | 'primary-danger';

export type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: React.ReactNode;
  tooltip?: string;
  variant?: IconButtonVariant;
  /** Afficher un raccourci clavier dans le tooltip */
  shortcut?: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function IconButton({
  icon,
  tooltip,
  shortcut,
  variant = 'default',
  className,
  ...props
}: IconButtonProps) {
  const [visible, setVisible] = useState(false);

  // Style spécial pour le halo "active-glow"
  const glowStyle: React.CSSProperties | undefined =
    variant === 'active-glow'
      ? {
          boxShadow:
            '0 0 0 4px rgba(56, 189, 248, 0.12), 0 8px 16px rgba(56, 189, 248, 0.2)',
        }
      : variant === 'primary'
        ? {
            boxShadow:
              '0 4px 14px rgba(59,130,246,.2), inset 0 1px 0 rgba(255,255,255,.15)',
          }
        : variant === 'primary-danger'
          ? {
              boxShadow:
                '0 4px 14px rgba(239,68,68,.15), inset 0 1px 0 rgba(255,255,255,.1)',
            }
          : undefined;

  return (
    <button
      type="button"
      className={clsx(
        iconButtonVariants({ variant: variant as any }),
        className,
      )}
      style={glowStyle}
      onMouseEnter={() => tooltip && setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => tooltip && setVisible(true)}
      onBlur={() => setVisible(false)}
      aria-label={props['aria-label'] || tooltip}
      {...props}
    >
      {icon}

      {/* Tooltip amélioré avec raccourci clavier */}
      {tooltip && visible && (
        <span
          role="tooltip"
          className={clsx(
            'pointer-events-none',
            'absolute -top-11 left-1/2 -translate-x-1/2',
            'whitespace-nowrap',
            'px-3 py-1.5 rounded-lg',
            'text-[11px] font-medium tracking-wide',
            'bg-[#1e1e24]/95 text-white backdrop-blur-sm',
            'shadow-xl',
            'animate-fade-in',
            'z-50',
            'flex items-center gap-2',
          )}
        >
          <span>{tooltip}</span>
          {shortcut && (
            <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-[9px] font-mono font-bold tracking-wider">
              {shortcut}
            </kbd>
          )}
          {/* flèche */}
          <span
            className="absolute left-1/2 -translate-x-1/2 -bottom-[4px] w-2 h-2 rotate-45 bg-[#1e1e24]/95"
            aria-hidden
          />
        </span>
      )}
    </button>
  );
}
