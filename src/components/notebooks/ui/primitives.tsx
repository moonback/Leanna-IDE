/**
 * Primitives visuelles du module notebooks.
 *
 * Fines couches React au-dessus des classes `.notebook-*` de src/index.css,
 * pour que tous les panneaux partagent les mêmes boutons, en-têtes, champs,
 * cartes, badges, états vides et modales.
 *
 * Règles :
 *   - accent        : --notebook-accent / --notebook-accent-surface
 *   - états         : --color-error | warning | success | info (+ -subtle)
 *   - arrondis      : contrôles en pilule ou rounded-lg, cartes rounded-xl,
 *                     modales rounded-2xl, pastilles rounded-full
 */

import React, { forwardRef } from 'react';
import { clsx } from 'clsx';
import { Loader2, type LucideIcon } from 'lucide-react';
import { Modal, type ModalProps } from '../../ui/Modal.js';

// ─── Bouton ─────────────────────────────────────────────────────────────────────

export type NbButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type NbButtonSize = 'sm' | 'md';

const BUTTON_VARIANT: Record<NbButtonVariant, string> = {
  primary: 'notebook-primary-small',
  secondary: 'notebook-secondary-button',
  ghost: 'notebook-ghost-button',
  danger: 'notebook-danger-button',
};

export interface NbButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: NbButtonVariant;
  size?: NbButtonSize;
  /** Icône à gauche du libellé */
  icon?: LucideIcon;
  /** Affiche un spinner à la place de l'icône et désactive le bouton */
  loading?: boolean;
}

export const NbButton = forwardRef<HTMLButtonElement, NbButtonProps>(function NbButton(
  { variant = 'secondary', size = 'md', icon: Icon, loading = false, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  const iconClass = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(BUTTON_VARIANT[variant], size === 'sm' && 'notebook-btn-sm', className)}
      {...rest}
    >
      {loading ? (
        <Loader2 className={clsx(iconClass, 'animate-spin flex-shrink-0')} aria-hidden />
      ) : Icon ? (
        <Icon className={clsx(iconClass, 'flex-shrink-0')} aria-hidden />
      ) : null}
      {children}
    </button>
  );
});

// ─── Bouton icône ───────────────────────────────────────────────────────────────

export interface NbIconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  icon: LucideIcon;
  /** Libellé accessible, repris en infobulle native si `title` est absent */
  label: string;
  size?: 'sm' | 'md';
  tone?: 'default' | 'danger';
  active?: boolean;
}

export const NbIconButton = forwardRef<HTMLButtonElement, NbIconButtonProps>(function NbIconButton(
  { icon: Icon, label, size = 'md', tone = 'default', active, title, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={title ?? label}
      data-active={active ? 'true' : undefined}
      aria-pressed={active === undefined ? undefined : active}
      className={clsx(
        'notebook-icon-button',
        size === 'sm' && 'notebook-icon-button--sm',
        tone === 'danger' && 'notebook-icon-button--danger',
        className,
      )}
      {...rest}
    >
      <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden />
    </button>
  );
});

// ─── En-tête de panneau ─────────────────────────────────────────────────────────

export interface NbPanelHeaderProps {
  title: React.ReactNode;
  icon?: LucideIcon;
  /** Compteur affiché à côté du titre */
  count?: number;
  /** Actions alignées à droite */
  actions?: React.ReactNode;
  className?: string;
}

export function NbPanelHeader({ title, icon: Icon, count, actions, className }: NbPanelHeaderProps) {
  return (
    <div className={clsx('notebook-panel-header', className)}>
      <div className="flex min-w-0 items-center gap-2">
        {Icon && <Icon className="h-4 w-4 flex-shrink-0 text-[var(--notebook-accent)]" aria-hidden />}
        <h3 className="notebook-panel-title truncate">{title}</h3>
        {count !== undefined && count > 0 && <span className="notebook-count">{count}</span>}
      </div>
      {actions && <div className="notebook-actions">{actions}</div>}
    </div>
  );
}

// ─── Libellé de section ─────────────────────────────────────────────────────────

export function NbSectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx('notebook-eyebrow', className)}>{children}</div>;
}

// ─── Champs ─────────────────────────────────────────────────────────────────────

export const NbInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function NbInput({ className, ...rest }, ref) {
    return <input ref={ref} className={clsx('notebook-input', className)} {...rest} />;
  },
);

export const NbTextarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function NbTextarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={clsx('notebook-input resize-none', className)} {...rest} />;
  },
);

// ─── Badge ──────────────────────────────────────────────────────────────────────

export type NbTone = 'neutral' | 'accent' | 'success' | 'warning' | 'error' | 'info';

export function NbBadge({
  tone = 'neutral',
  icon: Icon,
  children,
  className,
}: {
  tone?: NbTone;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={clsx('notebook-badge', className)} data-tone={tone}>
      {Icon && <Icon className="h-3 w-3" aria-hidden />}
      {children}
    </span>
  );
}

// ─── État vide ──────────────────────────────────────────────────────────────────

export interface NbEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function NbEmptyState({ icon: Icon, title, description, action, className }: NbEmptyStateProps) {
  return (
    <div className={clsx('notebook-empty-state', className)}>
      <div className="notebook-empty-state-icon">
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
      {description && <p className="max-w-xs text-xs leading-relaxed text-[var(--text-muted)]">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

// ─── Modale ─────────────────────────────────────────────────────────────────────

/**
 * ui/Modal habillée aux couleurs des notebooks. Garde toutes les garanties de
 * ui/Modal (focus piégé, Échap, voile, portail, reduced-motion).
 */
function NbModalRoot({ className, ...props }: ModalProps) {
  return <Modal {...props} className={clsx('notebook-dialog', className)} />;
}

export const NbModal = Object.assign(NbModalRoot, {
  Header: Modal.Header,
  Body: Modal.Body,
  Footer: Modal.Footer,
});
