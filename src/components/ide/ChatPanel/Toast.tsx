import { memo, useEffect } from 'react';
import { motion } from 'motion/react';

export interface ToastProps {
  message: string;
  icon?: React.ReactNode;
  onDone: () => void;
}

/** Notification éphémère centrée en bas de l'écran (auto-disparition ~2.2s). */
export const Toast = memo(function Toast({ message, icon, onDone }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{ duration: 0.18 }}
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[99999] flex items-center gap-2.5
                 px-4 py-2.5 rounded-full text-sm font-medium shadow-lg pointer-events-none"
      role="status"
      aria-live="polite"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--bg-panel) 88%, transparent)',
        border: '1px solid var(--border-base)',
        color: 'var(--text-primary)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05), 0 0 20px var(--accent-glow)',
        backdropFilter: 'blur(20px)',
      }}
    >
      {icon}
      {message}
    </motion.div>
  );
});
