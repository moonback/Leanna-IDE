/**
 * Tooltip — Composant tooltip unifié avec positionnement intelligent,
 * raccourci clavier optionnel et accessibilité.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';

export interface TooltipProps {
  /** Contenu du tooltip */
  content: string;
  /** Raccourci clavier optionnel */
  shortcut?: string;
  /** Position préférée */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Délai d'apparition en ms */
  delay?: number;
  /** Enfants (trigger) */
  children: React.ReactNode;
  /** Désactiver le tooltip */
  disabled?: boolean;
}

export function Tooltip({
  content,
  shortcut,
  position = 'top',
  delay = 400,
  children,
  disabled = false,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const show = useCallback(() => {
    if (disabled) return;
    timerRef.current = setTimeout(() => setVisible(true), delay);
  }, [delay, disabled]);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const positionStyles: Record<string, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  const arrowStyles: Record<string, string> = {
    top: 'top-full left-1/2 -translate-x-1/2 -mt-[3px] rotate-45',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 -mb-[3px] rotate-45',
    left: 'left-full top-1/2 -translate-y-1/2 -ml-[3px] rotate-45',
    right: 'right-full top-1/2 -translate-y-1/2 -mr-[3px] rotate-45',
  };

  return (
    <div
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      <AnimatePresence>
        {visible && (
          <motion.div
            role="tooltip"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            className={clsx(
              'absolute z-[200] pointer-events-none',
              'whitespace-nowrap px-2.5 py-1.5 rounded-lg',
              'text-[11px] font-medium',
              'shadow-lg',
              'flex items-center gap-2',
              positionStyles[position],
            )}
            style={{
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-base)',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <span>{content}</span>
            {shortcut && (
              <kbd
                className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold"
                style={{
                  backgroundColor: 'var(--bg-input)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border-base)',
                }}
              >
                {shortcut}
              </kbd>
            )}
            <span
              className={clsx('absolute w-[6px] h-[6px]', arrowStyles[position])}
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderRight: '1px solid var(--border-base)',
                borderBottom: '1px solid var(--border-base)',
              }}
              aria-hidden
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
