/**
 * BarButton — bouton compact (32 px) pour les barres du shell v3 :
 * icône seule ou icône + libellé, état `pressed` pour les bascules.
 * Les styles sont dans src/styles/nebula-shell.css (`.nb-barbtn`).
 *
 * Icône seule : `label` est obligatoire et sert d'aria-label.
 *
 *   <BarButton icon={<PanelRight />} label="Rail droit" pressed={open} onClick={toggle} />
 *   <BarButton icon={<Search />} label="Rechercher" showLabel shortcut="Ctrl K" />
 */
import React, { forwardRef } from 'react';
import { clsx } from 'clsx';

export interface BarButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: React.ReactNode;
  label: string;
  showLabel?: boolean;
  shortcut?: string;
  pressed?: boolean;
  children?: React.ReactNode;
}

export const BarButton = forwardRef<HTMLButtonElement, BarButtonProps>(function BarButton(
  { icon, label, showLabel = false, shortcut, pressed, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      {...rest}
      aria-label={showLabel ? undefined : label}
      aria-pressed={pressed}
      className={clsx('nb-barbtn', showLabel && 'nb-barbtn--labeled', className)}
    >
      <span className="nb-barbtn__icon" aria-hidden="true">{icon}</span>
      {showLabel && <span className="nb-barbtn__label">{label}</span>}
      {children}
      {shortcut && <kbd className="nb-barbtn__kbd" aria-hidden="true">{shortcut}</kbd>}
    </button>
  );
});
