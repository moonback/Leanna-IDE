/**
 * BrowserTabStrip — barre d'onglets du navigateur intégré.
 *
 * Affiche un onglet par entrée (titre tronqué), met en évidence l'onglet actif,
 * permet de fermer un onglet (sauf s'il n'en reste qu'un) et d'en ouvrir un
 * nouveau. La barre n'est rendue que lorsqu'il y a au moins deux onglets ou que
 * le bouton « + » est utile — ici elle est toujours affichée pour exposer le +.
 */

import { Plus, X } from 'lucide-react';
import type { BrowserTab } from './useBrowserTabs.js';

interface BrowserTabStripProps {
  tabs: BrowserTab[];
  activeTabId: string;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onNewTab: () => void;
}

/** Dérive un libellé d'onglet lisible depuis le titre ou l'URL. */
function tabLabel(tab: BrowserTab): string {
  if (tab.title.trim()) return tab.title.trim();
  try {
    const u = new URL(tab.url);
    return u.hostname.replace(/^www\./, '') || tab.url;
  } catch {
    return tab.url || 'Nouvel onglet';
  }
}

export function BrowserTabStrip({ tabs, activeTabId, onActivate, onClose, onNewTab }: BrowserTabStripProps) {
  const multiple = tabs.length > 1;

  return (
    <div
      className="flex items-stretch gap-0.5 px-1 pt-1 overflow-x-auto flex-shrink-0"
      style={{ borderBottom: '1px solid var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
      role="tablist"
      aria-label="Onglets du navigateur"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        const label = tabLabel(tab);
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            tabIndex={0}
            onClick={() => onActivate(tab.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate(tab.id); }
            }}
            className="group flex items-center gap-1.5 px-2.5 py-1 rounded-t-md cursor-pointer transition max-w-[180px] min-w-[90px]"
            style={{
              backgroundColor: active ? 'var(--bg-active)' : 'transparent',
              borderBottom: active ? '2px solid var(--accent-primary)' : '2px solid transparent',
            }}
            title={tab.url || label}
          >
            <span
              className="text-xs truncate flex-1"
              style={{ color: active ? 'var(--text-primary)' : 'var(--text-muted)' }}
            >
              {label}
            </span>
            {multiple && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition hover:bg-[var(--bg-base)]"
                style={{ opacity: active ? 1 : undefined }}
                title="Fermer l'onglet"
                aria-label={`Fermer l'onglet ${label}`}
              >
                <X size={11} style={{ color: 'var(--text-muted)' }} />
              </button>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={onNewTab}
        className="flex items-center justify-center px-1.5 my-0.5 rounded transition hover:bg-[var(--bg-active)] flex-shrink-0"
        title="Nouvel onglet"
        aria-label="Ouvrir un nouvel onglet"
      >
        <Plus size={13} style={{ color: 'var(--text-muted)' }} />
      </button>
    </div>
  );
}
