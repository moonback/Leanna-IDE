/**
 * BrowserTabStrip — barre d'onglets du navigateur intégré.
 *
 * Affiche un onglet par page ouverte (titre ou URL), met en évidence l'onglet
 * actif, et propose fermeture par onglet + bouton « nouvel onglet ».
 */

import { Globe, Loader2, Plus, X } from 'lucide-react';

export interface TabStripItem {
  id: string;
  title: string;
  url: string;
  loading: boolean;
  faviconUrl?: string | null;
}

interface BrowserTabStripProps {
  tabs: TabStripItem[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNewTab: () => void;
}

/** Libellé lisible d'un onglet : titre, sinon domaine, sinon « Nouvel onglet ». */
function tabLabel(item: TabStripItem): string {
  if (item.title.trim()) return item.title.trim();
  try {
    const host = new URL(item.url).hostname.replace(/^www\./, '');
    if (host) return host;
  } catch {
    /* url non valide */
  }
  return 'Nouvel onglet';
}

export function BrowserTabStrip({ tabs, activeTabId, onSelect, onClose, onNewTab }: BrowserTabStripProps) {
  return (
    <div
      className="flex items-stretch gap-0.5 px-1.5 pt-1.5 flex-shrink-0 overflow-x-auto"
      style={{ borderBottom: '1px solid var(--border-base)' }}
      role="tablist"
      aria-label="Onglets du navigateur"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            tabIndex={0}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(tab.id); } }}
            onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onClose(tab.id); } }}
            className="group flex items-center gap-1.5 min-w-[110px] max-w-[200px] px-2 py-1 rounded-t-md cursor-pointer transition"
            style={{
              backgroundColor: active ? 'var(--bg-panel)' : 'transparent',
              borderTop: active ? '1px solid var(--border-base)' : '1px solid transparent',
              borderLeft: active ? '1px solid var(--border-base)' : '1px solid transparent',
              borderRight: active ? '1px solid var(--border-base)' : '1px solid transparent',
            }}
            title={tab.url || tabLabel(tab)}
          >
            {tab.loading ? (
              <Loader2 size={11} className="animate-spin" style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            ) : tab.faviconUrl ? (
              <img
                src={tab.faviconUrl}
                alt=""
                width={13}
                height={13}
                style={{ flexShrink: 0, borderRadius: 2 }}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <Globe size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            )}
            <span
              className="text-xs truncate flex-1"
              style={{ color: active ? 'var(--text-primary)' : 'var(--text-muted)' }}
            >
              {tabLabel(tab)}
            </span>
            {tabs.length > 1 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-active)] transition flex-shrink-0"
                title="Fermer l'onglet"
                aria-label={`Fermer l'onglet ${tabLabel(tab)}`}
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
        className="flex items-center justify-center p-1 ml-0.5 rounded hover:bg-[var(--bg-active)] transition flex-shrink-0 self-center"
        title="Nouvel onglet"
        aria-label="Nouvel onglet"
      >
        <Plus size={13} style={{ color: 'var(--text-muted)' }} />
      </button>
    </div>
  );
}
