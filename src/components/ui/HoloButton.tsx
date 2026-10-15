/**
 * HoloButton — bouton holographique Nebula (pods d'action, CTA du cockpit).
 *
 * Complète <Button> (actions courantes) pour les actions « signature » du
 * pilotage d'agents. `color` teinte le néon ; `pressed` en fait un bouton
 * bascule (aria-pressed).
 *
 *   <HoloButton icon={<Play />} color="var(--nb-cyan)">Exécuter</HoloButton>
 */
import React, { forwardRef } from 'react';
import { clsx } from 'clsx';

export interface HoloButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  color?: string;
  size?: 'md' | 'lg';
  icon?: React.ReactNode;
  pressed?: boolean;
}

export const HoloButton = forwardRef<HTMLButtonElement, HoloButtonProps>(function HoloButton(
  { color, size = 'md', icon, pressed, className, style, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      {...rest}
      aria-pressed={pressed}
      className={clsx('nb-holo', size === 'lg' && 'nb-holo--lg', className)}
      style={{ ...(color ? { '--nb-holo-color': color } : null), ...style } as React.CSSProperties}
    >
      {icon && <span className="inline-flex shrink-0" aria-hidden="true">{icon}</span>}
      {children}
    </button>
  );
});
