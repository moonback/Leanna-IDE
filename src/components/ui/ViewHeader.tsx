import React from 'react';
import type { LucideIcon } from 'lucide-react';
import '../../styles/ux-refinements.css';

interface ViewHeaderProps {
  /** Main title of the view */
  title: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Short description, inline after the title (hidden on narrow windows) */
  description?: string;
  /** Badge text next to the title */
  badge?: string;
  /** Actions rendered on the right side */
  actions?: React.ReactNode;
}

/**
 * En-tête partagé des vues.
 * Le titre conserve toujours la priorité ; la description et les éléments
 * secondaires se contractent avant les actions principales.
 */
export function ViewHeader({ title, icon: Icon, description, badge, actions }: ViewHeaderProps) {
  return (
    <header className="lea-header" aria-label={`En-tête de la page : ${title}`}>
      <div className="lea-header__icon" aria-hidden="true">
        <Icon size={15} />
      </div>

      <div className="lea-header__main">
        <h1 className="lea-header__title">{title}</h1>
        {badge && <span className="lea-header__badge self-center">{badge}</span>}
        {description && (
          <p className="lea-header__desc min-w-0" title={description}>
            {description}
          </p>
        )}
      </div>

      {actions && (
        <div className="lea-header__actions" role="group" aria-label={`Actions de ${title}`}>
          {actions}
        </div>
      )}
    </header>
  );
}
