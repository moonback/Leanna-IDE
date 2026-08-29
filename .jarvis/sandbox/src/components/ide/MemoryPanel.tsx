/**
 * MemoryPanel — Wrapper du MemoriesView pour affichage inline dans l'IDE.
 * Prend toute la largeur et hauteur disponibles.
 * Le bouton fermer est en overlay sur le header du MemoriesView.
 */
import { lazy, Suspense } from 'react';
import { X } from 'lucide-react';

const MemoriesView = lazy(() => import('../../views/MemoriesView'));

interface MemoryPanelProps {
  onClose: () => void;
}

export function MemoryPanel({ onClose }: MemoryPanelProps) {
  return (
    <div className="relative flex flex-col h-full w-full overflow-hidden" style={{ backgroundColor: 'var(--bg-base)' }}>
      {/* Bouton fermer en overlay */}
      <button
        onClick={onClose}
        className="absolute top-3 right-4 z-10 flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-[var(--ctrl-hover)] border"
        style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
        title="Fermer"
      >
        <X className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
      </button>

      {/* MemoriesView prend tout l'espace */}
      <div className="flex-1 min-h-0 w-full overflow-hidden">
        <Suspense fallback={
          <div className="flex flex-1 items-center justify-center h-full">
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Chargement des mémoires…</div>
          </div>
        }>
          <MemoriesView />
        </Suspense>
      </div>
    </div>
  );
}
