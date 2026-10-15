/**
 * GlowCard — carte en verre Nebula (design system v3).
 *
 * Variantes de matière : glass 1 (panneau), 2 (carte, défaut), 3 (popover).
 * `color` teinte le halo (token CSS, ex. agentColor('coder')).
 * `active` garde le halo allumé (agent ou mission sélectionnés).
 * Avec `onClick`, la carte devient un vrai bouton accessible (role, tabIndex,
 * Entrée/Espace).
 *
 *   <GlowCard color={agentColor('architect')} active>…</GlowCard>
 */
import React from 'react';
import { clsx } from 'clsx';

export interface GlowCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'color'> {
  glass?: 1 | 2 | 3;
  color?: string;
  active?: boolean;
}

export function GlowCard({ glass = 2, color, active = false, onClick, onKeyDown, className, style, children, ...rest }: GlowCardProps) {
  const interactive = typeof onClick === 'function';
  return (
    <div
      {...rest}
      className={clsx(`nb-glass-${glass}`, 'nb-card', interactive && 'nb-card--interactive', className)}
      style={{ ...(color ? { '--nb-card-color': color } : null), ...style } as React.CSSProperties}
      data-active={active || undefined}
      onClick={onClick}
      role={interactive ? (rest.role ?? 'button') : rest.role}
      tabIndex={interactive ? (rest.tabIndex ?? 0) : rest.tabIndex}
      onKeyDown={interactive ? (e) => {
        onKeyDown?.(e);
        if (!e.defaultPrevented && e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          (e.currentTarget as HTMLDivElement).click();
        }
      } : onKeyDown}
    >
      {children}
    </div>
  );
}
