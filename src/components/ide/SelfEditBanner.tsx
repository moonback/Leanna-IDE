import React from 'react';
import { AlertTriangle, RotateCcw, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SelfEditBannerProps {
  /** Le fichier en cours d'édition par l'IA */
  editingFile: string | null;
  /** Si le fichier est marqué "critique" */
  isCritical?: boolean;
  /** Callback pour déclencher un rollback */
  onRollback?: () => void;
  /** Callback pour valider le changement */
  onAccept?: () => void;
}

/**
 * Bandeau discret affiché quand l'IA modifie un fichier actuellement ouvert.
 * Évite la confusion "pourquoi mon fichier bouge tout seul" et offre un rollback rapide.
 */
export const SelfEditBanner = React.memo(function SelfEditBanner({
  editingFile,
  isCritical = false,
  onRollback,
  onAccept,
}: SelfEditBannerProps) {
  return (
    <AnimatePresence>
      {editingFile && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="overflow-hidden"
        >
          <div
            className="flex items-center gap-2.5 px-3.5 py-2 text-[11px] border-b"
            style={{
              borderColor: isCritical ? 'rgba(239,68,68,0.3)' : 'rgba(168,85,247,0.2)',
              backgroundColor: isCritical ? 'rgba(239,68,68,0.06)' : 'rgba(168,85,247,0.04)',
            }}
          >
            <AlertTriangle
              size={13}
              style={{ color: isCritical ? '#f87171' : '#a855f7', flexShrink: 0 }}
            />
            <span style={{ color: 'var(--text-primary)' }} className="flex-1 truncate">
              <span className="font-medium">Auto-modification</span>
              {' — '}
              <span className="font-mono opacity-80">{editingFile}</span>
              {isCritical && (
                <span className="ml-1.5 text-[9px] px-1 py-0.5 rounded font-semibold" style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
                  CRITIQUE
                </span>
              )}
            </span>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              {onRollback && (
                <button
                  onClick={onRollback}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors hover:bg-white/10"
                  style={{ color: '#fbbf24' }}
                  title="Annuler ce changement"
                >
                  <RotateCcw size={11} />
                  Rollback
                </button>
              )}
              {onAccept && (
                <button
                  onClick={onAccept}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors hover:bg-white/10"
                  style={{ color: '#4ade80' }}
                  title="Accepter le changement"
                >
                  <CheckCircle2 size={11} />
                  OK
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
