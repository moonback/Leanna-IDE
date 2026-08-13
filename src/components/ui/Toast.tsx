import React, {
  createContext, useCallback, useContext,
  useMemo, useRef, useState,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toast:   (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error:   (message: string) => void;
  warning: (message: string) => void;
  info:    (message: string) => void;
}

// ─── Config ───────────────────────────────────────────────────────────────────
const ICONS: Record<ToastType, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  success: CheckCircle,
  error:   XCircle,
  warning: AlertTriangle,
  info:    Info,
};

const COLORS: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', icon: 'var(--color-success)' },
  error:   { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)',  icon: 'var(--color-error)'   },
  warning: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', icon: 'var(--color-warning)' },
  info:    { bg: 'rgba(14,165,233,0.12)', border: 'rgba(14,165,233,0.3)', icon: 'var(--color-info)'    },
};

const AUTO_DISMISS_MS = 4000;

const ToastContext = createContext<ToastContextValue>({
  toast: () => {}, success: () => {}, error: () => {}, warning: () => {}, info: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Keep timers in a ref — never causes re-renders
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // dismiss is stable — no deps that change
  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  // toast is stable — dismiss is stable, timers is a ref
  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts(prev => {
      // cap at 5 visible toasts
      const next = prev.length >= 5 ? prev.slice(1) : prev;
      return [...next, { id, type, message }];
    });
    timers.current[id] = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
  }, [dismiss]);

  // Memoize context value so consumers don't re-render when ToastProvider re-renders
  const value = useMemo<ToastContextValue>(() => ({
    toast,
    success: (m) => toast(m, 'success'),
    error:   (m) => toast(m, 'error'),
    warning: (m) => toast(m, 'warning'),
    info:    (m) => toast(m, 'info'),
  }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
        aria-live="assertive"
        aria-atomic="false"
      >
        <AnimatePresence initial={false}>
          {toasts.map(t => {
            const c    = COLORS[t.type];
            const Icon = ICONS[t.type];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, x: 40, scale: 0.96 }}
                animate={{ opacity: 1, x: 0,  scale: 1    }}
                exit={{    opacity: 0, x: 40, scale: 0.96 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl backdrop-blur-xl shadow-xl"
                style={{
                  backgroundColor: c.bg,
                  border: `1px solid ${c.border}`,
                  minWidth: 260,
                  maxWidth: 320,
                }}
                role="alert"
              >
                <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: c.icon }} />
                <p className="text-sm flex-1 leading-snug" style={{ color: 'var(--text-primary)' }}>
                  {t.message}
                </p>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  className="flex-shrink-0 mt-0.5 rounded p-0.5 opacity-40 hover:opacity-100 transition-opacity"
                  aria-label="Dismiss"
                >
                  <X className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
