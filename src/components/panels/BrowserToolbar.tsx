import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  Clock,
  ExternalLink,
  Globe,
  History,
  Home,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { BrowserProfileSwitcher } from './BrowserProfileSwitcher.js';
import { BrowserExtensionsMenu } from './BrowserExtensionsMenu.js';
import type { BrowserHistoryEntry } from './useBrowserHistory.js';
import type { BrowserProfile } from './useBrowserProfiles.js';
import type { BrowserExtensionInfo } from '../../types/electron.js';

interface BrowserToolbarProps {
  pageTitle: string;
  assistantNavActive: boolean;
  currentUrl: string;
  inputValue: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  onClose: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  onInputChange: (value: string) => void;
  onInputKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onRefresh: () => void;
  onHome: () => void;
  onOpenExternal: () => void;
  /** Ouvre un nouvel onglet. */
  onNewTab: () => void;
  /** Fournit les suggestions d'autocomplétion pour une saisie. */
  getSuggestions: (query: string) => BrowserHistoryEntry[];
  /** Navigue vers l'URL d'une suggestion sélectionnée. */
  onSelectSuggestion: (url: string) => void;
  /** Efface l'intégralité de l'historique de navigation. */
  onClearHistory: () => void;
  /** Profils de navigation disponibles. */
  profiles: BrowserProfile[];
  /** Profil actuellement actif. */
  activeProfile: BrowserProfile;
  /** Bascule vers un autre profil (remonte le webview). */
  onSwitchProfile: (id: string) => void;
  /** Crée un nouveau profil isolé. */
  onCreateProfile: (name: string) => BrowserProfile;
  /** Renomme un profil existant. */
  onRenameProfile: (id: string, name: string) => void;
  /** Supprime un profil (sauf le profil par défaut). */
  onDeleteProfile: (id: string) => void;
  /** true si les extensions Chromium sont disponibles (Electron). */
  extensionsSupported: boolean;
  /** Extensions chargées pour le profil actif. */
  extensions: BrowserExtensionInfo[];
  /** Opération d'extension en cours. */
  extensionsLoading: boolean;
  /** Dernière erreur d'extension (ou null). */
  extensionsError: string | null;
  /** Charge une extension décompressée (sélecteur de dossier). */
  onLoadExtension: () => void;
  /** Retire une extension par identifiant. */
  onRemoveExtension: (id: string) => void;
}

/** Retire le protocole et le www. pour un affichage plus lisible. */
function prettifyUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/^www\./, '');
}

export function BrowserToolbar({
  pageTitle,
  assistantNavActive,
  currentUrl,
  inputValue,
  loading,
  canGoBack,
  canGoForward,
  onClose,
  inputRef,
  onInputChange,
  onInputKeyDown,
  onGoBack,
  onGoForward,
  onRefresh,
  onHome,
  onOpenExternal,
  onNewTab,
  getSuggestions,
  onSelectSuggestion,
  onClearHistory,
  profiles,
  activeProfile,
  onSwitchProfile,
  onCreateProfile,
  onRenameProfile,
  onDeleteProfile,
  extensionsSupported,
  extensions,
  extensionsLoading,
  extensionsError,
  onLoadExtension,
  onRemoveExtension,
}: BrowserToolbarProps) {
  const secure = currentUrl.startsWith('https://');

  const [focused, setFocused] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Suggestions recalculées à chaque frappe. On n'affiche pas de suggestion
  // identique à la saisie exacte (évite une entrée redondante).
  const suggestions = useMemo(() => {
    if (!focused) return [];
    const list = getSuggestions(inputValue);
    return list.filter(s => s.url !== inputValue.trim());
  }, [focused, inputValue, getSuggestions]);

  const open = focused && suggestions.length > 0;

  // Réinitialiser le surlignage quand la liste change ou se ferme.
  useEffect(() => {
    setHighlightIndex(-1);
  }, [inputValue, focused]);

  // Fermer le menu si on clique en dehors.
  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  const commitSuggestion = (entry: BrowserHistoryEntry) => {
    onInputChange(entry.url);
    setFocused(false);
    setHighlightIndex(-1);
    onSelectSuggestion(entry.url);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (open) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlightIndex(i => (i + 1) % suggestions.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlightIndex(i => (i <= 0 ? suggestions.length - 1 : i - 1));
        return;
      }
      if (event.key === 'Enter' && highlightIndex >= 0) {
        event.preventDefault();
        commitSuggestion(suggestions[highlightIndex]);
        return;
      }
      if (event.key === 'Escape') {
        // Première échappée : fermer juste le menu, sans réinitialiser l'URL.
        event.preventDefault();
        event.stopPropagation();
        setFocused(false);
        setHighlightIndex(-1);
        return;
      }
    }
    // Sinon, déléguer au panel (Enter = naviguer, Escape = restaurer l'URL).
    onInputKeyDown(event);
  };

  return (
    <div className="flex flex-col gap-1.5 px-2 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-base)' }}>
      <div className="flex items-center justify-between gap-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Globe size={13} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
          <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }} title={pageTitle || 'Navigateur'}>
            {pageTitle || 'Navigateur'}
          </span>
          {assistantNavActive && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium" style={{
              backgroundColor: 'color-mix(in srgb, var(--color-accent-alt) 15%, transparent)',
              color: 'var(--color-accent-alt)',
              border: '1px solid color-mix(in srgb, var(--color-accent-alt) 30%, transparent)',
            }}>
              <Bot size={10} />
              Leanna
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <BrowserExtensionsMenu
            supported={extensionsSupported}
            extensions={extensions}
            loading={extensionsLoading}
            error={extensionsError}
            onLoadExtension={onLoadExtension}
            onRemoveExtension={onRemoveExtension}
          />
          <BrowserProfileSwitcher
            profiles={profiles}
            activeProfile={activeProfile}
            onSwitchProfile={onSwitchProfile}
            onCreateProfile={onCreateProfile}
            onRenameProfile={onRenameProfile}
            onDeleteProfile={onDeleteProfile}
          />
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-[var(--bg-active)] transition" title="Fermer le navigateur" aria-label="Fermer le navigateur">
            <X size={13} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <ToolbarButton label="Page précédente" onClick={onGoBack} disabled={!canGoBack}><ArrowLeft size={13} /></ToolbarButton>
        <ToolbarButton label="Page suivante" onClick={onGoForward} disabled={!canGoForward}><ArrowRight size={13} /></ToolbarButton>
        <ToolbarButton label={loading ? 'Arrêter le chargement' : 'Actualiser'} onClick={onRefresh}>
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        </ToolbarButton>
        <ToolbarButton label="Page d'accueil" onClick={onHome}><Home size={13} /></ToolbarButton>
        <ToolbarButton label="Nouvel onglet" onClick={onNewTab}><Plus size={13} /></ToolbarButton>
        <ToolbarButton label="Ouvrir dans une nouvelle fenêtre" onClick={onOpenExternal}><ExternalLink size={13} /></ToolbarButton>

        <div ref={containerRef} className="relative flex flex-1 min-w-0">
          <div className="flex flex-1 items-center gap-1 min-w-0 rounded-lg px-2 py-1" style={{
            backgroundColor: 'var(--bg-input, var(--bg-secondary))',
            border: `1px solid ${assistantNavActive ? 'rgba(139,92,246,0.5)' : 'var(--border-base)'}`,
            transition: 'border-color 0.2s',
          }}>
            {secure ? (
              <Lock size={11} style={{ color: 'var(--color-success)', flexShrink: 0 }} aria-label="Connexion sécurisée (HTTPS)" />
            ) : (
              <AlertTriangle size={11} style={{ color: 'var(--color-warning)', flexShrink: 0 }} aria-label="Connexion non sécurisée (HTTP)" />
            )}
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={event => onInputChange(event.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setFocused(true)}
              className="flex-1 bg-transparent outline-none text-sm min-w-0"
              style={{ color: 'var(--text-primary)' }}
              placeholder="Entrez une URL ou une recherche…"
              aria-label="Barre d'adresse"
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls="browser-url-suggestions"
              role="combobox"
              spellCheck={false}
            />
          </div>

          {open && (
            <ul
              id="browser-url-suggestions"
              role="listbox"
              className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg overflow-hidden shadow-lg"
              style={{
                backgroundColor: 'var(--bg-panel, var(--bg-secondary))',
                border: '1px solid var(--border-base)',
                maxHeight: '320px',
                overflowY: 'auto',
              }}
            >
              {suggestions.map((entry, index) => {
                const active = index === highlightIndex;
                return (
                  <li
                    key={entry.url}
                    role="option"
                    aria-selected={active}
                    // onMouseDown plutôt que onClick : évite que le blur de
                    // l'input ne ferme le menu avant que la sélection s'exécute.
                    onMouseDown={e => { e.preventDefault(); commitSuggestion(entry); }}
                    onMouseEnter={() => setHighlightIndex(index)}
                    className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer transition"
                    style={{ backgroundColor: active ? 'var(--bg-active)' : 'transparent' }}
                  >
                    {entry.visitCount > 1
                      ? <History size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      : <Clock size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                    <div className="flex flex-col min-w-0 flex-1">
                      {entry.title && (
                        <span className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          {entry.title}
                        </span>
                      )}
                      <span className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                        {prettifyUrl(entry.url)}
                      </span>
                    </div>
                  </li>
                );
              })}
              <li
                role="option"
                aria-selected={false}
                onMouseDown={e => { e.preventDefault(); onClearHistory(); setFocused(false); }}
                className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer transition hover:bg-[var(--bg-active)]"
                style={{ borderTop: '1px solid var(--border-base)' }}
              >
                <Trash2 size={12} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Effacer l'historique de navigation</span>
              </li>
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="p-1.5 rounded transition hover:bg-[var(--bg-active)] disabled:opacity-30" title={label} aria-label={label}>
      <span style={{ color: 'var(--text-muted)' }}>{children}</span>
    </button>
  );
}
