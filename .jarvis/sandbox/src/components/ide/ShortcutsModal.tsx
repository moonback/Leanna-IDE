import React from 'react';
import { X, Keyboard } from 'lucide-react';
import { motion } from 'motion/react';

interface ShortcutsModalProps {
  onClose: () => void;
}

export function ShortcutsModal({ onClose }: ShortcutsModalProps) {
  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <motion.div
        className="relative w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl flex flex-col"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-base)' }}
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-base)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(14,165,233,0.12)' }}>
              <Keyboard className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Raccourcis clavier</h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Commandes rapides de l'éditeur</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition" style={{ color: 'var(--text-muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {[
            { category: 'Général', items: [
              { label: 'Palette de commandes', key: 'Ctrl+Shift+P' },
              { label: 'Ouvrir un fichier', key: 'Ctrl+P' },
              { label: 'Sauvegarder', key: 'Ctrl+S' },
              { label: 'Fermer l\'onglet', key: 'Ctrl+W' },
            ]},
            { category: 'Éditeur', items: [
              { label: 'Recherche dans le fichier', key: 'Ctrl+F' },
              { label: 'Recherche globale', key: 'Ctrl+Shift+F' },
              { label: 'Formater le document', key: 'Shift+Alt+F' },
              { label: 'Aller à la ligne', key: 'Ctrl+G' },
            ]},
            { category: 'Panneaux', items: [
              { label: 'Explorateur', key: 'Ctrl+Shift+E' },
              { label: 'Contrôle de source', key: 'Ctrl+Shift+G' },
            ]},
            { category: 'Self-IDE (Auto-modification)', items: [
              { label: 'Créer un checkpoint', key: 'Ctrl+Shift+K' },
              { label: 'Lancer la validation (tsc)', key: 'Ctrl+Shift+B' },
              { label: 'Voir les checkpoints', key: 'Ctrl+Shift+H' },
              { label: 'Rollback dernier checkpoint', key: 'Ctrl+Shift+Z' },
            ]},
          ].map(({ category, items }) => (
            <div key={category} className="mb-4 last:mb-0">
              <p className="text-sm font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-dimmed)' }}>{category}</p>
              <div className="space-y-1">
                {items.map(({ label, key }) => (
                  <div key={label} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                    <span className="text-xs" style={{ color: 'var(--text-primary)' }}>{label}</span>
                    <kbd className="px-2 py-0.5 rounded text-sm font-mono font-medium" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border-base)' }}>
                      {key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
