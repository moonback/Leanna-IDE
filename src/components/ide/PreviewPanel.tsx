import React from 'react';
import { MonitorSmartphone, RefreshCw, ExternalLink, X } from 'lucide-react';

interface PreviewPanelProps {
  previewUrl: string | null;
  previewKey: number;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  onRefresh: () => void;
  onOpenExternal: () => void;
  onClose: () => void;
}

export const PreviewPanel = React.memo(function PreviewPanel({
  previewUrl,
  previewKey,
  iframeRef,
  onRefresh,
  onOpenExternal,
  onClose,
}: PreviewPanelProps) {
  return (
    <div
      className="flex flex-col border-l"
      style={{ width: '50%', minWidth: '300px', borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
      role="region"
      aria-label="Prévisualisation"
    >
      <div
        className="flex items-center gap-2 px-2 py-1 border-b flex-shrink-0"
        style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
      >
        <MonitorSmartphone size={13} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
        <span className="text-xs font-medium truncate flex-1" style={{ color: 'var(--text-muted)' }}>
          {previewUrl ?? 'En attente du serveur de développement…'}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {previewUrl && (
            <>
              <button
                onClick={onRefresh}
                className="rounded p-1 hover:bg-white/10"
                title="Recharger la prévisualisation"
                aria-label="Recharger la prévisualisation"
              >
                <RefreshCw size={12} style={{ color: 'var(--text-muted)' }} />
              </button>
              <button
                onClick={onOpenExternal}
                className="rounded p-1 hover:bg-white/10"
                title="Ouvrir dans un nouvel onglet"
                aria-label="Ouvrir dans un nouvel onglet"
              >
                <ExternalLink size={12} style={{ color: 'var(--text-muted)' }} />
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-white/10"
            title="Fermer la prévisualisation"
            aria-label="Fermer la prévisualisation"
          >
            <X size={12} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      </div>

      <div className="flex-1 relative" style={{ backgroundColor: '#fff' }}>
        {previewUrl ? (
          <iframe
            key={previewKey}
            ref={iframeRef}
            src={previewUrl}
            title="Prévisualisation de l'application"
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-pointer-lock"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
            <MonitorSmartphone size={40} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Lance <code className="font-mono text-xs px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-input)' }}>
                npm run dev
              </code> dans le terminal pour voir la prévisualisation ici automatiquement.
            </p>
          </div>
        )}
      </div>
    </div>
  );
});
