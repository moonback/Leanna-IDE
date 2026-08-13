import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, X, ArrowRight } from 'lucide-react';

const CHANGELOG_KEY = 'jarvis_changelog_v0.2_selfide';

/**
 * ChangelogBanner — Bandeau discret annonçant le nouveau positionnement produit.
 * "Jarvis ne gère plus que son propre code." Affiché une seule fois.
 */
export function ChangelogBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(CHANGELOG_KEY);
    if (!seen) {
      // Petit délai pour ne pas gêner le chargement initial
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(CHANGELOG_KEY, 'true');
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: 20, x: '-50%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="fixed bottom-5 left-1/2 z-[9998] flex items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl"
          style={{
            backgroundColor: 'var(--bg-panel)',
            border: '1px solid color-mix(in srgb, #10b981 30%, var(--border-base))',
            backdropFilter: 'blur(12px)',
            maxWidth: '90vw',
          }}
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'color-mix(in srgb, #10b981 15%, transparent)' }}>
            <Shield className="w-4 h-4" style={{ color: '#10b981' }} />
          </div>

          <div className="min-w-0">
            <p className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              Nouveau : IDE auto-référentiel
            </p>
            <p className="text-[10.5px] leading-snug" style={{ color: 'var(--text-muted)' }}>
              Jarvis ne gère désormais que son propre code source. Chaque modification est protégée par un checkpoint.
            </p>
          </div>

          <button
            type="button"
            onClick={dismiss}
            className="flex items-center gap-1 flex-shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition-colors"
            style={{ backgroundColor: 'color-mix(in srgb, #10b981 12%, transparent)', color: '#10b981' }}
          >
            Compris
            <ArrowRight className="w-3 h-3" />
          </button>

          <button
            type="button"
            onClick={dismiss}
            className="p-1 rounded-md transition-colors hover:bg-[color-mix(in_srgb,var(--text-muted)_10%,transparent)]"
            aria-label="Fermer"
          >
            <X className="w-3.5 h-3.5" style={{ color: 'var(--text-dimmed)' }} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
