/**
 * QuitConfirmDialog — Modale de confirmation pour quitter l'application Electron.
 * Extraite de la UnifiedSidebar pour séparer les responsabilités.
 * Améliorations : design moderne, meilleure accessibilité, code plus propre.
 */

import { AnimatePresence, motion } from 'motion/react';
import { Power } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface QuitConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function QuitConfirmDialog({ open, onClose, onConfirm }: QuitConfirmDialogProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // Focus sur le bouton "Quitter" à l'ouverture
  useEffect(() => {
    if (open && confirmButtonRef.current) {
      // Petit délai pour que la modale soit visible
      const timer = setTimeout(() => confirmButtonRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  return (
    <AnimatePresence mode="wait">
      {open && (
        <motion.div
          key="quit-confirm-overlay"
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
          role="presentation"
          // Utilisation de classes Tailwind + variables CSS pour le fond
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.45)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          <motion.div
            key="quit-confirm-dialog"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{
              duration: 0.2,
              ease: [0.32, 0.72, 0, 1], // ease-out cubic
            }}
            className="relative w-full max-w-sm overflow-hidden rounded-3xl border shadow-2xl"
            style={{
              backgroundColor: 'var(--bg-panel)',
              borderColor: 'var(--border-base)',
              boxShadow: '0 40px 90px -30px rgba(0,0,0,0.6)',
            }}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="quit-dialog-title"
            aria-describedby="quit-dialog-desc"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
            tabIndex={-1}
          >
            {/* Header */}
            <div className="border-b px-6 py-5" style={{ borderColor: 'var(--border-base)' }}>
              <div className="flex items-center gap-4">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                  style={{
                    backgroundColor: 'var(--accent-subtle)',
                  }}
                >
                  <Power size={20} className="text-accent-primary" style={{ color: 'var(--accent-primary)' }} />
                </div>
                <div className="min-w-0">
                  <p id="quit-dialog-title" className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Quitter Jarvis OS
                  </p>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Confirmez la fermeture de l'application
                  </p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-6">
              {/* Carte d'avertissement */}
              <div
                className="mb-6 rounded-2xl border p-5"
                style={{
                  borderColor: 'rgba(251, 191, 36, 0.35)',
                  backgroundColor: 'rgba(251, 191, 36, 0.1)',
                }}
              >
                <p className="text-sm font-medium" style={{ color: 'var(--color-warning)' }}>
                  ⚠️ Attention
                </p>
                <p id="quit-dialog-desc" className="mt-1.5 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Les modifications non enregistrées dans les fichiers ouverts pourraient être perdues.
                  <br />
                  <span className="text-xs opacity-80">Voulez-vous vraiment quitter ?</span>
                </p>
              </div>

              {/* Actions */}
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-2xl border px-5 py-2.5 text-sm font-medium transition-all duration-150 hover:opacity-80 active:scale-[0.98]"
                  style={{
                    color: 'var(--text-primary)',
                    borderColor: 'var(--border-base)',
                    backgroundColor: 'var(--bg-secondary)',
                  }}
                >
                  Annuler
                </button>
                <button
                  ref={confirmButtonRef}
                  type="button"
                  onClick={onConfirm}
                  className="rounded-2xl px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition-all duration-150 hover:opacity-90 active:scale-[0.98]"
                  style={{
                    backgroundColor: 'var(--color-error)',
                    boxShadow: '0 12px 30px -18px rgba(220, 38, 38, 0.7)',
                  }}
                >
                  Quitter
                </button>
              </div>
            </div>

            {/* Petit indicateur visuel en bas (optionnel) */}
            <div
              className="h-1 w-1/3 mx-auto rounded-full mb-3"
              style={{ backgroundColor: 'var(--border-base)', opacity: 0.3 }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}