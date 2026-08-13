/**
 * QuitConfirmDialog — Modale de confirmation pour quitter l'application Electron.
 * Extraite de la UnifiedSidebar pour séparer les responsabilités.
 */

import { AnimatePresence, motion } from 'motion/react';
import { Power } from 'lucide-react';

interface QuitConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function QuitConfirmDialog({ open, onClose, onConfirm }: QuitConfirmDialogProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="quit-confirm"
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}
          onClick={onClose}
          role="presentation"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 14 }}
            transition={{ duration: 0.16 }}
            className="w-full max-w-sm overflow-hidden rounded-[28px] border shadow-[0_35px_90px_-35px_rgba(0,0,0,0.5)]"
            style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="quit-dialog-title"
            aria-describedby="quit-dialog-desc"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
            tabIndex={-1}
          >
            {/* Header */}
            <div className="border-b px-5 py-4" style={{ borderColor: 'var(--border-base)' }}>
              <div className="flex items-center gap-3">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: 'var(--accent-subtle)' }}
                >
                  <Power size={18} style={{ color: 'var(--accent-primary)' }} />
                </div>
                <div>
                  <p id="quit-dialog-title" className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Quitter Jarvis OS
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Confirmation avant fermeture de l'application.
                  </p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-5 py-5">
              <div
                className="mb-4 rounded-2xl border p-4"
                style={{ borderColor: 'rgba(251, 191, 36, 0.3)', backgroundColor: 'rgba(251, 191, 36, 0.08)' }}
              >
                <p className="text-sm font-medium" style={{ color: 'var(--color-warning)' }}>
                  Attention
                </p>
                <p id="quit-dialog-desc" className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Si vous fermez Jarvis OS maintenant, les modifications non enregistrées risquent d'être perdues.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-2xl border px-4 py-2 text-sm font-medium transition"
                  style={{
                    color: 'var(--text-primary)',
                    borderColor: 'var(--border-base)',
                    backgroundColor: 'var(--bg-secondary)',
                  }}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  className="rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_30px_-18px_rgba(220,38,38,0.9)] transition"
                  style={{ backgroundColor: 'var(--color-error)' }}
                >
                  Quitter
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
