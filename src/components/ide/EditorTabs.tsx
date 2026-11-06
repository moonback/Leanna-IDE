import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X, Save, Map, WrapText, AlignJustify, Eye, Code, Sparkles, Globe, MoreHorizontal } from 'lucide-react';
import { FileIcon } from './FileIcon.js';
import { fileName } from '../../utils/fileUtils.js';
import type { OpenFile } from '../../types/ide.js';

// Helper to extract hostname from URL for display
function getHostnameDisplay(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\\./, '');
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

  useEffect(() => {
    if (!showMore) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !moreRef.current?.contains(event.target)) setShowMore(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowMore(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showMore]);

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
          const tabTitle = isBrowserTab && file.browserUrl ? file.browserUrl : file.path;

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
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectTab(file.path);
                }
              }}
              title={tabTitle}
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
                  title="Fermer (Ctrl+W)"
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
            title={markdownPreview ? 'Voir le texte brut' : 'Prévisualiser le Markdown'}
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
            title={htmlPreview ? 'Fermer la prévisualisation HTML' : 'Prévisualiser le HTML'}
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
          title="Enregistrer le fichier (Ctrl+S)"
          aria-label="Enregistrer le fichier"
        >
          <Save size={13} style={{ color: activeFileDirty ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
        </button>

        <button
          type="button"
          onClick={() => setShowMore((value) => !value)}
          className={iconButton}
          title="Autres options de l'éditeur"
          aria-label="Autres options de l'éditeur"
          aria-controls="editor-tabs-more-options"
          aria-expanded={showMore}
        >
          <MoreHorizontal size={15} style={{ color: showMore ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
        </button>

        {showMore && (
          <div
            id="editor-tabs-more-options"
            role="group"
            aria-label="Options de l'éditeur"
            className="glass-float absolute right-1 top-[calc(100%+6px)] z-[var(--z-popover)] min-w-[220px] p-1.5 shadow-xl"
          >
            <button
              type="button"
              aria-pressed={showMinimap}
              onClick={() => { onToggleMinimap(); setShowMore(false); }}
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
              onClick={() => { onToggleWordWrap(); setShowMore(false); }}
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
              onClick={() => { onFormat(); setShowMore(false); }}
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
                onClick={() => { onOpenTemplates(); setShowMore(false); }}
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
