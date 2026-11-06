/**
 * ConfirmDialog — Generic reusable confirmation modal.
 * Reuses the shared Modal primitive for focus management, Escape handling,
 * scroll locking, backdrop safety and focus restoration.
 */
import React, { createContext, useCallback, useContext, useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { Modal } from './Modal.js';

// ── Types ──────────────────────────────────────────────────────────────────

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger' | 'warning';
}

interface ConfirmDialogContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmDialogContext = createContext<ConfirmDialogContextValue>({
  confirm: async () => false,
});

interface ConfirmDialogState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: 'default' | 'danger' | 'warning';
  resolve: (value: boolean) => void;
}

function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmDialogState>({
    open: false,
    title: 'Confirmer',
    message: '',
    confirmLabel: 'Confirmer',
    cancelLabel: 'Annuler',
    variant: 'default',
    resolve: () => {},
  });

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setState({
        open: true,
        title: options.title ?? 'Confirmer',
        message: options.message,
        confirmLabel: options.confirmLabel ?? 'Confirmer',
        cancelLabel: options.cancelLabel ?? 'Annuler',
        variant: options.variant ?? 'default',
        resolve,
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    state.resolve(true);
    setState((previous) => ({ ...previous, open: false }));
  }, [state.resolve]);

  const handleCancel = useCallback(() => {
    state.resolve(false);
    setState((previous) => ({ ...previous, open: false }));
  }, [state.resolve]);

  const isDanger = state.variant === 'danger';
  const isWarning = state.variant === 'warning';
  const iconColor = isDanger
    ? 'var(--color-error)'
    : isWarning
      ? 'var(--color-warning)'
      : 'var(--accent-primary)';
  const confirmColor = iconColor;
  const confirmBg = `color-mix(in srgb, ${confirmColor} 15%, transparent)`;
  const confirmBorder = `color-mix(in srgb, ${confirmColor} 30%, transparent)`;

  return (
    <ConfirmDialogContext.Provider value={{ confirm }}>
      {children}
      <Modal
        open={state.open}
        onClose={handleCancel}
        title={state.title}
        size="sm"
        tone={state.variant === 'default' ? 'default' : state.variant}
        aria-describedby="confirm-dialog-message"
      >
        <Modal.Body>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex-shrink-0" aria-hidden="true">
              {isDanger || isWarning
                ? <AlertTriangle size={20} style={{ color: iconColor }} />
                : <Check size={20} style={{ color: iconColor }} />}
            </div>
            <p
              id="confirm-dialog-message"
              className="whitespace-pre-line text-sm"
              style={{ color: 'var(--text-secondary)' }}
            >
              {state.message}
            </p>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-base)',
              color: 'var(--text-muted)',
            }}
          >
            {state.cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            style={{
              backgroundColor: confirmBg,
              border: `1px solid ${confirmBorder}`,
              color: confirmColor,
            }}
          >
            {state.confirmLabel}
          </button>
        </Modal.Footer>
      </Modal>
    </ConfirmDialogContext.Provider>
  );
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useConfirm() {
  return useContext(ConfirmDialogContext);
}

export { ConfirmDialogProvider };
export type { ConfirmOptions };
