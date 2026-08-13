import { useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, Zap, Check, Globe, BrainCircuit } from 'lucide-react';
import { useProfile } from '../../context/UserProfileContext';
import { OPENROUTER_MODELS } from '../settings/OpenRouterSection';
import type { AIProvider } from '../../context/UserProfileContext';

// ── Types ──────────────────────────────────────────────────────────────────

interface ModelPickerModalProps {
  onClose: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export const ModelPickerModal = memo(function ModelPickerModal({ onClose }: ModelPickerModalProps) {
  const { profile, setField, save } = useProfile();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>(profile.textProvider);
  const [selectedModel, setSelectedModel] = useState(profile.openrouterModel);

  const filteredModels = OPENROUTER_MODELS.filter(m =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.provider.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleConfirm = useCallback(() => {
    setField('textProvider', selectedProvider);
    if (selectedProvider === 'openrouter') {
      setField('openrouterModel', selectedModel);
    }
    save();
    onClose();
  }, [selectedProvider, selectedModel, setField, save, onClose]);

  const currentModelName = selectedProvider === 'openrouter'
    ? (OPENROUTER_MODELS.find(m => m.id === selectedModel)?.name || selectedModel.split('/').pop())
    : 'Gemini Live';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="model-picker-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-md max-h-[80vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--border-base)' }}>
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'color-mix(in srgb, var(--accent-primary) 12%, transparent)' }}
            >
              <BrainCircuit className="w-4.5 h-4.5" style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div>
              <h3 id="model-picker-title" className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Changer de modèle
              </h3>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                Actuel : {currentModelName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Provider Toggle */}
        <div className="px-5 pt-4 pb-2">
          <div className="grid grid-cols-2 gap-2">
            {([
              { id: 'gemini' as AIProvider, label: '🔮 Gemini', desc: 'Google AI (Live voice)' },
              { id: 'openrouter' as AIProvider, label: '🌐 OpenRouter', desc: 'Modèles gratuits' },
            ]).map(p => {
              const active = selectedProvider === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProvider(p.id)}
                  className="flex flex-col items-center p-3 rounded-xl text-xs font-semibold transition-all duration-200"
                  style={{
                    backgroundColor: active ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
                    border: `1.5px solid ${active ? 'var(--accent-primary)' : 'var(--border-base)'}`,
                    color: active ? 'var(--accent-primary)' : 'var(--text-muted)',
                    boxShadow: active ? '0 2px 8px color-mix(in srgb, var(--accent-primary) 15%, transparent)' : 'none',
                  }}
                >
                  <span className="text-base mb-0.5">{p.label}</span>
                  <span className="text-[9px] opacity-70 font-normal">{p.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Model List (OpenRouter) */}
        <AnimatePresence mode="wait">
          {selectedProvider === 'openrouter' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex-1 flex flex-col overflow-hidden px-5 pb-2"
            >
              {/* Search */}
              <div className="relative my-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--text-dimmed)' }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Rechercher un modèle..."
                  className="w-full rounded-lg pl-8 pr-3 py-2 text-[11px] outline-none transition-all duration-200"
                  style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
                  autoFocus
                />
              </div>

              {/* Models */}
              <div className="flex-1 overflow-y-auto max-h-[300px] space-y-1 pr-1 custom-scrollbar">
                {filteredModels.map(model => {
                  const active = selectedModel === model.id;
                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => setSelectedModel(model.id)}
                      className="flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-left transition-all duration-150"
                      style={{
                        backgroundColor: active ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
                        border: `1.5px solid ${active ? 'var(--accent-primary)' : 'transparent'}`,
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold truncate" style={{ color: active ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                            {model.name}
                          </span>
                          {model.free && (
                            <span
                              className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-bold"
                              style={{ backgroundColor: 'color-mix(in srgb, #4ade80 15%, transparent)', color: '#4ade80' }}
                            >
                              <Zap size={8} /> GRATUIT
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>{model.provider}</span>
                          <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>·</span>
                          <span className="text-[9px] truncate" style={{ color: 'var(--text-dimmed)' }}>{model.desc}</span>
                        </div>
                      </div>
                      {active && <Check size={14} style={{ color: 'var(--accent-primary)' }} />}
                    </button>
                  );
                })}
                {filteredModels.length === 0 && (
                  <div className="py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                    Aucun modèle trouvé
                  </div>
                )}
              </div>

              {/* Custom Model Input */}
              <div className="mt-2 pt-2 border-t" style={{ borderColor: 'var(--border-base)' }}>
                <label className="text-[9px] font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>
                  Ou ID personnalisé :
                </label>
                <input
                  type="text"
                  value={selectedModel}
                  onChange={e => setSelectedModel(e.target.value)}
                  placeholder="ex: anthropic/claude-sonnet-4"
                  className="w-full rounded-lg px-3 py-1.5 text-[10px] font-mono outline-none transition-all duration-200"
                  style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
                />
              </div>
            </motion.div>
          )}

          {selectedProvider === 'gemini' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-5 py-4"
            >
              <div className="rounded-xl p-4 text-center" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)' }}>
                <div className="text-2xl mb-2">🔮</div>
                <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Gemini 2.0 Flash (Live)</p>
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                  Supporte la voix en temps réel, le texte et l'analyse de code.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t" style={{ borderColor: 'var(--border-base)' }}>
          <p className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
            💡 La voix Live utilise toujours Gemini.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border px-3 py-1.5 text-xs font-medium transition hover:bg-white/10"
              style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition text-white"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              Appliquer
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
});
