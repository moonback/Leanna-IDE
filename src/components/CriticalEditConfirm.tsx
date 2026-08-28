import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldAlert, Check, X, Clock } from 'lucide-react';

interface ConfirmRequest {
  requestId: string;
  filePath: string;
  operation: 'write' | 'modify' | 'patch' | 'delete' | 'rename';
  reason?: string;
  timeoutMs: number;
}

const OPERATION_LABELS: Record<string, string> = {
  write: 'Écriture',
  modify: 'Modification',
  patch: 'Patch',
  delete: 'Suppression',
  rename: 'Renommage',
};

interface Props {
  /** WebSocket send function */
  sendMessage: (data: any) => void;
}

/**
 * CriticalEditConfirm — Modale de confirmation quand l'IA veut modifier un fichier critique.
 * Écoute les events WebSocket 'confirm-critical-edit' et affiche une modale.
 */
export function CriticalEditConfirm({ sendMessage }: Props) {
  const [pending, setPending] = useState<ConfirmRequest | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);

  // Écoute l'event custom dispatché par le handler WebSocket
  useEffect(() => {
    function handleConfirmEvent(e: CustomEvent<ConfirmRequest>) {
      setPending(e.detail);
      setTimeLeft(Math.ceil(e.detail.timeoutMs / 1000));
    }

    window.addEventListener('jarvis-confirm-critical-edit', handleConfirmEvent as EventListener);
    return () => window.removeEventListener('jarvis-confirm-critical-edit', handleConfirmEvent as EventListener);
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!pending || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          // Auto-refus par timeout
          respond(false);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [pending, timeLeft]);

  const respond = useCallback((approved: boolean) => {
    if (!pending) return;
    sendMessage({
      type: 'confirm-response',
      requestId: pending.requestId,
      approved,
    });
    setPending(null);
  }, [pending, sendMessage]);

  return (
    <AnimatePresence>
      {pending && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="w-full max-w-md rounded-2xl p-6 shadow-2xl"
            style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: 'color-mix(in srgb, var(--color-warning) 15%, transparent)' }}>
                <ShieldAlert className="w-5 h-5" style={{ color: 'var(--color-warning)' }} />
              </div>
              <div>
                <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  Fichier critique
                </h3>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  L'IA demande à modifier un fichier protégé
                </p>
              </div>
            </div>

            {/* Details */}
            <div className="rounded-xl p-4 mb-4"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)' }}>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Opération</span>
                  <span className="text-xs font-semibold rounded-lg px-2 py-0.5"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--color-warning) 12%, transparent)',
                      color: 'var(--color-warning)',
                    }}>
                    {OPERATION_LABELS[pending.operation] || pending.operation}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Fichier</span>
                  <span className="text-xs font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {pending.filePath}
                  </span>
                </div>
                {pending.reason && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Détail</span>
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {pending.reason}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Timer */}
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-3.5 h-3.5" style={{ color: timeLeft <= 10 ? 'var(--color-error)' : 'var(--text-dimmed)' }} />
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: timeLeft <= 10 ? 'var(--color-error)' : 'var(--accent-primary)' }}
                  initial={{ width: '100%' }}
                  animate={{ width: `${(timeLeft / (pending.timeoutMs / 1000)) * 100}%` }}
                  transition={{ duration: 1, ease: 'linear' }}
                />
              </div>
              <span className="text-sm font-mono min-w-[2.5rem] text-right"
                style={{ color: timeLeft <= 10 ? 'var(--color-error)' : 'var(--text-dimmed)' }}>
                {timeLeft}s
              </span>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <motion.button
                type="button"
                onClick={() => respond(false)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-semibold transition-all"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-base)',
                  color: 'var(--text-primary)',
                }}
              >
                <X className="w-3.5 h-3.5" />
                Refuser
              </motion.button>
              <motion.button
                type="button"
                onClick={() => respond(true)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-semibold text-white transition-all"
                style={{
                  backgroundColor: 'var(--color-warning)',
                  boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
                }}
              >
                <Check className="w-3.5 h-3.5" />
                Autoriser
              </motion.button>
            </div>

            {/* Warning note */}
            <p className="text-xs text-center mt-3 leading-relaxed" style={{ color: 'var(--text-dimmed)' }}>
              Sans réponse, la modification sera automatiquement refusée après timeout.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
