import { motion, AnimatePresence } from 'motion/react';
import type { TranscriptEntry } from '../../hooks/useTranscript.js';

/** Sous-titres en direct : dernier message de la conversation sous la mascotte. */
export function LiveCaption({ entry, aiName, reduceMotion }: {
  entry: TranscriptEntry | undefined; aiName: string; reduceMotion: boolean;
}) {
  const text = entry?.pending === 'image' ? 'Génération d\'image en cours…' : entry?.text.trim();
  return (
    <div className="flex min-h-[64px] w-full max-w-xl items-start justify-center" aria-live="polite">
      <AnimatePresence mode="wait">
        {entry && text && (
          <motion.div key={entry.id}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, filter: 'blur(4px)' }}
            transition={{ duration: 0.25 }}
            className="rounded-2xl px-4 py-2.5 text-center text-sm leading-relaxed backdrop-blur-md"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--bg-panel) 70%, transparent)',
              border: '1px solid var(--border-base)',
              color: 'var(--text-secondary)',
            }}>
            <span className="mr-1.5 text-xs font-semibold uppercase tracking-wider"
              style={{ color: entry.role === 'assistant' ? 'var(--accent-primary)' : 'var(--color-accent-alt)' }}>
              {entry.role === 'assistant' ? aiName : 'Toi'}
            </span>
            <span className="line-clamp-3">{text.length > 280 ? `…${text.slice(-280)}` : text}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
