import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { AgentStatusPill } from '../AgentStatusBar.js';

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
  /** Agent status pill (what Leanna is doing now). Default: shown. */
  showStatus?: boolean;
}

/**
 * En-tête unifié de toutes les pages (styles : .lea-header, styles/glass.css §6).
 *
 * Une seule ligne de hauteur fixe (--header-h) : icône · titre · badge ·
 * description | état agent · actions. La description est en ligne plutôt que
 * sur une seconde ligne, et l'état agent (ex-barre pleine largeur) vit ici.
 */
export function ViewHeader({ title, icon: Icon, description, badge, actions, showStatus = true }: ViewHeaderProps) {
  return (
    <header className="lea-header">
      <div className="lea-header__icon">
        <Icon aria-hidden="true" size={15} />
      </div>

      <div className="lea-header__main">
        <h1 className="lea-header__title">{title}</h1>
        {badge && <span className="lea-header__badge self-center">{badge}</span>}
        {description && <p className="lea-header__desc min-w-0">{description}</p>}
      </div>

      {showStatus && <AgentStatusPill />}

      {actions && (
        <>
          {showStatus && <span className="lea-header__sep" aria-hidden />}
          <div className="lea-header__actions">{actions}</div>
        </>
      )}
    </header>
  );
}
