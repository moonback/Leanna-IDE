import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { X, Save, Map, WrapText, AlignJustify, Eye, Code, Sparkles, Globe, MoreHorizontal } from 'lucide-react';
import { FileIcon } from './FileIcon.js';
import { fileName } from '../../utils/fileUtils.js';
import type { OpenFile } from '../../types/ide.js';

// Helper to extract hostname from URL for display
function getHostnameDisplay(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

type EditorTabsProps = {
  openFiles: OpenFile[];
  activePath: string | null;
  showMinimap: boolean;
  wordWrap: boolean;
  activeFileDirty: boolean;
  markdownPreview: boolean;
  htmlPreview: boolean;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onSave: () => void;
  onFormat: () => void;
  onToggleMinimap: () => void;
  onToggleWordWrap: () => void;
  onToggleMarkdownPreview: () => void;
  onToggleHtmlPreview: () => void;
  onOpenTemplates?: () => void;
};

export function EditorTabs({
  openFiles,
  activePath,
  showMinimap,
  wordWrap,
  activeFileDirty,
  markdownPreview,
  htmlPreview,
  onSelectTab,
  onCloseTab,
  onSave,
  onFormat,
  onToggleMinimap,
  onToggleWordWrap,
  onToggleMarkdownPreview,
  onToggleHtmlPreview,
  onOpenTemplates,
}: EditorTabsProps) {
  const [showMore, setShowMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const [morePosition, setMorePosition] = useState({ top: 0, right: 8 });

  const updateMorePosition = useCallback(() => {
    const anchor = moreButtonRef.current?.getBoundingClientRect();
    if (!anchor) return;
    // Le menu est rendu dans document.body : il échappe aux overflow:hidden
    // de la scène IDE et reste ancré au bouton même après un redimensionnement.
    setMorePosition({
      top: Math.round(anchor.bottom + 6),
      right: Math.max(8, Math.round(window.innerWidth - anchor.right)),
    });
  }, []);
  const closeMore = useCallback(() => {
    setShowMore(false);
    moreButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!showMore) return;
    updateMorePosition();
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!moreRef.current?.contains(event.target) && !moreMenuRef.current?.contains(event.target)) {
        setShowMore(false);
      }
    };
    const onViewportChange = () => updateMorePosition();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMore();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [showMore, closeMore, updateMorePosition]);

  if (openFiles.length === 0) return null;

  const isMarkdownFile = activePath?.toLowerCase().endsWith('.md') ?? false;
  const isHtmlFile = activePath?.toLowerCase().endsWith('.html') ?? false;
  const iconButton = 'w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--bg-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]';

  return (
    <div
      className="flex items-center justify-between border-b select-none min-w-0"
      style={{
        height: '35px',
        minHeight: '35px',
        borderColor: 'var(--border-base)',
        backgroundColor: 'var(--bg-sidebar)',
      }}
    >
      {/* Onglets : zone scrollable indépendante de la barre d'actions */}
      <div className="flex flex-1 h-full min-w-0 overflow-x-auto overflow-y-hidden custom-scrollbar" role="group" aria-label="Fichiers ouverts">
        {openFiles.map((file) => {
          const isActive = activePath === file.path;
          const isBrowserTab = file.type === 'browser';
          const displayName = isBrowserTab && file.browserUrl
            ? getHostnameDisplay(file.browserUrl)
            : fileName(file.path);

          return (
            <div
              key={file.path}
              role="group"
              aria-label={`Onglet ${displayName}${isActive ? ", actif" : ""}`}
              aria-current={isActive ? "page" : undefined}
              tabIndex={0}
              className="group flex items-center gap-2 h-full px-3 sm:px-4 text-sm cursor-pointer relative border-r transition-colors duration-150"
              style={{
                borderColor: 'var(--border-base)',
                backgroundColor: isActive ? 'var(--bg-base)' : 'transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                minWidth: '112px',
                maxWidth: '180px',
              }}
              onClick={() => onSelectTab(file.path)}
              onKeyDown={(event) => {
                // Le bouton de fermeture est un contrôle enfant indépendant :
                // son Entrée/Espace ne doit pas aussi sélectionner l'onglet.
                if (event.target !== event.currentTarget) return;
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectTab(file.path);
                }
              }}
            >
              {isActive && (
                <motion.div
                  layoutId="active-tab-indicator"
                  className="absolute top-0 left-0 right-0 h-0.5"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <div className="flex-shrink-0 opacity-80 group-hover:opacity-100">
                {isBrowserTab ? (
                  <Globe size={13} style={{ color: 'var(--accent-primary)' }} />
                ) : (
                  <FileIcon filePath={file.path} />
                )}
              </div>
              <span className="flex-1 truncate font-medium">{displayName}</span>
              <div className="flex items-center justify-center w-4 h-4 relative">
                {file.dirty && (
                  <div
                    className="w-1.5 h-1.5 rounded-full transition-opacity group-hover:opacity-0"
                    style={{ backgroundColor: 'var(--accent-primary)' }}
                  />
                )}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseTab(file.path);
                  }}
                  className="absolute inset-0 flex items-center justify-center rounded p-0.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-[var(--bg-hover)] transition-opacity focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)]"
                  aria-label={`Fermer ${displayName}`}
                  tabIndex={isActive ? 0 : -1}
                >
                  <X size={10.5} style={{ color: 'var(--text-muted)' }} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions essentielles visibles ; réglages secondaires dans le menu « Plus ». */}
      <div className="relative flex items-center gap-0.5 px-1.5 h-full flex-shrink-0 border-l" style={{ borderColor: 'var(--border-base)' }} ref={moreRef}>
        {isMarkdownFile && (
          <button
            type="button"
            onClick={onToggleMarkdownPreview}
            className={iconButton}
            aria-label={markdownPreview ? 'Voir le texte brut' : 'Prévisualiser le Markdown'}
            aria-pressed={markdownPreview}
          >
            {markdownPreview
              ? <Code size={13} style={{ color: 'var(--accent-primary)' }} />
              : <Eye size={13} style={{ color: 'var(--text-muted)' }} />
            }
          </button>
        )}

        {isHtmlFile && (
          <button
            type="button"
            onClick={onToggleHtmlPreview}
            className={iconButton}
            aria-label={htmlPreview ? 'Fermer la prévisualisation HTML' : 'Prévisualiser le HTML'}
            aria-pressed={htmlPreview}
          >
            <Globe size={13} style={{ color: htmlPreview ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
          </button>
        )}

        <button
          type="button"
          onClick={onSave}
          disabled={!activeFileDirty}
          className={iconButton + ' disabled:opacity-30'}
          aria-label="Enregistrer le fichier"
        >
          <Save size={13} style={{ color: activeFileDirty ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
        </button>

        <button
          ref={moreButtonRef}
          type="button"
          onClick={() => {
            if (!showMore) updateMorePosition();
            setShowMore((value) => !value);
          }}
          className={iconButton}
          aria-label="Autres options de l'éditeur"
          aria-controls="editor-tabs-more-options"
          aria-expanded={showMore}
        >
          <MoreHorizontal size={15} style={{ color: showMore ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
        </button>

        {showMore && createPortal(
          <div
            ref={moreMenuRef}
            id="editor-tabs-more-options"
            role="group"
            aria-label="Options de l'éditeur"
            className="glass-float fixed z-[10000] min-w-[240px] max-w-[min(320px,calc(100vw-16px))] p-1.5 shadow-xl"
            style={{ top: morePosition.top, right: morePosition.right }}
          >
            <button
              type="button"
              aria-pressed={showMinimap}
              onClick={() => { onToggleMinimap(); closeMore(); }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-[var(--bg-hover)]"
              style={{ color: 'var(--text-primary)' }}
            >
              <Map size={14} style={{ color: showMinimap ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
              <span className="flex-1">Minimap</span>
              <span style={{ color: 'var(--text-muted)' }}>{showMinimap ? 'Activée' : 'Désactivée'}</span>
            </button>
            <button
              type="button"
              aria-pressed={wordWrap}
              onClick={() => { onToggleWordWrap(); closeMore(); }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-[var(--bg-hover)]"
              style={{ color: 'var(--text-primary)' }}
            >
              <WrapText size={14} style={{ color: wordWrap ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
              <span className="flex-1">Retour automatique à la ligne</span>
              <span style={{ color: 'var(--text-muted)' }}>{wordWrap ? 'Activé' : 'Désactivé'}</span>
            </button>
            <div className="my-1 h-px" style={{ background: 'var(--border-base)' }} />
            <button
              type="button"
              onClick={() => { onFormat(); closeMore(); }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-[var(--bg-hover)]"
              style={{ color: 'var(--text-primary)' }}
            >
              <AlignJustify size={14} style={{ color: 'var(--text-muted)' }} />
              <span className="flex-1">Formater le document</span>
              <kbd className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Shift+Alt+F</kbd>
            </button>
            {onOpenTemplates && (
              <button
                type="button"
                onClick={() => { onOpenTemplates(); closeMore(); }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-[var(--bg-hover)]"
                style={{ color: 'var(--text-primary)' }}
              >
                <Sparkles size={14} style={{ color: 'var(--accent-primary)' }} />
                <span className="flex-1">Bibliothèque de modèles</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
