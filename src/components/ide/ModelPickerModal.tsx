import { useState, useCallback, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Zap, Check, BrainCircuit, X, Image as ImageIcon, BookOpen, MessageSquare } from 'lucide-react';
import { useProfile } from '../../context/UserProfileContext.js';
import { OPENROUTER_MODELS, OPENROUTER_IMAGE_MODELS } from '../settings/OpenRouterSection.js';
import type { AIProvider } from '../../context/UserProfileContext.js';
import { Modal } from '../ui/Modal.js';
import { Button } from '../ui/Button.js';
import { useToast } from '../ui/Toast.js';

interface ModelPickerModalProps {
  onClose: () => void;
  /** Rendu en panneau latéral docké (sans le chrome Modal). */
  docked?: boolean;
}

type PickerTab = 'text' | 'image' | 'notebook';

export const ModelPickerModal = memo(function ModelPickerModal({ onClose, docked = false }: ModelPickerModalProps) {
  const { profile, applyAndSave } = useProfile();
  const { error: toastError } = useToast();
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const handleClose = useCallback(() => {
    if (!savingRef.current) onClose();
  }, [onClose]);
  const [activeTab, setActiveTab] = useState<PickerTab>('text');

  // ── État Texte / Chat ─────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>(profile.textProvider);
  const [selectedModel, setSelectedModel] = useState(profile.openrouterModel);

  // ── État Image ────────────────────────────────────────────────────────────
  const [imageSearch, setImageSearch] = useState('');
  const [selectedImageModel, setSelectedImageModel] = useState(profile.openrouterImageModel);

  // ── État Notebook ─────────────────────────────────────────────────────────
  const [notebookSearch, setNotebookSearch] = useState('');
  const [selectedNotebookModel, setSelectedNotebookModel] = useState(profile.notebookModel);

  const filteredModels = OPENROUTER_MODELS.filter(m =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.provider.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredImageModels = OPENROUTER_IMAGE_MODELS.filter(m =>
    m.name.toLowerCase().includes(imageSearch.toLowerCase()) ||
    m.id.toLowerCase().includes(imageSearch.toLowerCase())
  );

  const filteredNotebookModels = OPENROUTER_MODELS.filter(m =>
    m.name.toLowerCase().includes(notebookSearch.toLowerCase()) ||
    m.provider.toLowerCase().includes(notebookSearch.toLowerCase()) ||
    m.id.toLowerCase().includes(notebookSearch.toLowerCase())
  );

  const handleConfirm = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const patch: Partial<typeof profile> = {
      // Texte / Chat
      textProvider: selectedProvider,
      // Image
      openrouterImageModel: selectedImageModel,
      // Notebook ('' = utiliser le provider de texte actif)
      notebookModel: selectedNotebookModel,
    };
    if (selectedProvider === 'openrouter') {
      patch.openrouterModel = selectedModel;
    }
    try {
      // Ne fermer qu'après confirmation de la synchronisation serveur.
      await applyAndSave(patch);
      window.dispatchEvent(new CustomEvent('Leanna-settings-saved', { detail: { requiresReconnect: true } }));
      onClose();
    } catch {
      toastError('Échec de l’enregistrement du modèle. La fenêtre reste ouverte pour réessayer.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [profile, selectedProvider, selectedModel, selectedImageModel, selectedNotebookModel, applyAndSave, onClose, toastError]);

  const currentModelName = selectedProvider === 'openrouter'
    ? (OPENROUTER_MODELS.find(m => m.id === selectedModel)?.name || selectedModel.split('/').pop())
    : 'Gemini Live';

  const headerContent = (
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: 'color-mix(in srgb, var(--accent-primary) 12%, transparent)' }}
          >
            <BrainCircuit className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
          </div>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Changer de modèle
            </h3>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Texte : {currentModelName}
            </p>
          </div>
        </div>
  );

  // ── Sélecteur d'onglets (Texte / Image / Notebook) ──────────────────────────
  const tabBar = (
    <div className="mb-4 grid grid-cols-3 gap-1 p-1 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)' }}>
      {([
        { id: 'text' as PickerTab, label: 'Texte / Chat', icon: MessageSquare },
        { id: 'image' as PickerTab, label: 'Image', icon: ImageIcon },
        { id: 'notebook' as PickerTab, label: 'Notebook', icon: BookOpen },
      ]).map(t => {
        const active = activeTab === t.id;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-semibold transition-all duration-150"
            style={{
              backgroundColor: active ? 'var(--accent-subtle)' : 'transparent',
              color: active ? 'var(--accent-primary)' : 'var(--text-muted)',
              border: `1px solid ${active ? 'var(--accent-primary)' : 'transparent'}`,
            }}
          >
            <Icon size={13} />
            <span className="truncate">{t.label}</span>
          </button>
        );
      })}
    </div>
  );

  // ── Liste de modèles réutilisable (texte / notebook) ────────────────────────
  const renderModelList = (
    models: typeof OPENROUTER_MODELS,
    current: string,
    onPick: (id: string) => void,
  ) => (
    <div className="overflow-y-auto max-h-52 space-y-1 pr-1 custom-scrollbar">
      {models.map(model => {
        const active = current === model.id;
        return (
          <button
            key={model.id}
            type="button"
            onClick={() => onPick(model.id)}
            className="flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-left transition-all duration-150"
            style={{
              backgroundColor: active ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
              border: `1.5px solid ${active ? 'var(--accent-primary)' : 'transparent'}`,
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold truncate" style={{ color: active ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                  {model.name}
                </span>
                {model.free && (
                  <span
                    className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-bold"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--color-success) 15%, transparent)', color: 'var(--color-success)' }}
                  >
                    <Zap size={8} /> GRATUIT
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>{model.provider}</span>
                <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>·</span>
                <span className="text-xs truncate" style={{ color: 'var(--text-dimmed)' }}>{model.desc}</span>
              </div>
            </div>
            {active && <Check size={14} style={{ color: 'var(--accent-primary)' }} />}
          </button>
        );
      })}
      {models.length === 0 && (
        <div className="py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
          Aucun modèle trouvé
        </div>
      )}
    </div>
  );

  // ── Onglet Texte / Chat ─────────────────────────────────────────────────────
  const textTab = (
    <>
      {/* Provider Toggle */}
      <div className="mb-4">
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
                <span className="text-xs opacity-70 font-normal">{p.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {selectedProvider === 'openrouter' && (
          <motion.div
            key="openrouter"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-col gap-2"
          >
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--text-dimmed)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Rechercher un modèle..."
                className="w-full rounded-lg pl-8 pr-3 py-2 text-xs outline-none transition-all duration-200"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
                autoFocus
                aria-label="Rechercher un modèle"
              />
            </div>

            {renderModelList(filteredModels, selectedModel, setSelectedModel)}

            {/* Custom ID */}
            <div className="pt-2 border-t" style={{ borderColor: 'var(--border-base)' }}>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>
                Ou ID personnalisé :
              </label>
              <input
                type="text"
                value={selectedModel}
                onChange={e => setSelectedModel(e.target.value)}
                placeholder="ex: anthropic/claude-sonnet-4"
                className="w-full rounded-lg px-3 py-1.5 text-sm font-mono outline-none transition-all duration-200"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
                aria-label="ID de modèle personnalisé"
              />
            </div>
          </motion.div>
        )}

        {selectedProvider === 'gemini' && (
          <motion.div key="gemini" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="rounded-xl p-4 text-center" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)' }}>
              <div className="text-2xl mb-2">🔮</div>
              <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Gemini 2.0 Flash (Live)</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                Supporte la voix en temps réel, le texte et l'analyse de code.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  // ── Onglet Image ────────────────────────────────────────────────────────────
  const imageTab = (
    <div className="flex flex-col gap-2">
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Modèle OpenRouter pour la génération d'images et d'infographies.
      </p>
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--text-dimmed)' }} />
        <input
          type="text"
          value={imageSearch}
          onChange={e => setImageSearch(e.target.value)}
          placeholder="Rechercher un modèle image..."
          className="w-full rounded-lg pl-8 pr-3 py-2 text-xs outline-none transition-all duration-200"
          style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
          aria-label="Rechercher un modèle image"
        />
      </div>

      <div className="overflow-y-auto max-h-52 space-y-1 pr-1 custom-scrollbar">
        {filteredImageModels.map(model => {
          const active = selectedImageModel === model.id;
          return (
            <button
              key={model.id}
              type="button"
              onClick={() => setSelectedImageModel(model.id)}
              className="flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-left transition-all duration-150"
              style={{
                backgroundColor: active ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
                border: `1.5px solid ${active ? 'var(--accent-primary)' : 'transparent'}`,
              }}
            >
              <div className="flex-1 min-w-0">
                <span className="text-xs font-semibold truncate block" style={{ color: active ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                  {model.name}
                </span>
                <span className="text-xs truncate block mt-0.5" style={{ color: 'var(--text-dimmed)' }}>{model.desc}</span>
              </div>
              {active && <Check size={14} style={{ color: 'var(--accent-primary)' }} />}
            </button>
          );
        })}
        {filteredImageModels.length === 0 && (
          <div className="py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            Aucun modèle trouvé
          </div>
        )}
      </div>

      {/* Custom ID */}
      <div className="pt-2 border-t" style={{ borderColor: 'var(--border-base)' }}>
        <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>
          Ou ID personnalisé :
        </label>
        <input
          type="text"
          value={selectedImageModel}
          onChange={e => setSelectedImageModel(e.target.value)}
          placeholder="ex: google/gemini-3.6-flash-image"
          className="w-full rounded-lg px-3 py-1.5 text-sm font-mono outline-none transition-all duration-200"
          style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
          aria-label="ID de modèle image personnalisé"
        />
      </div>
    </div>
  );

  // ── Onglet Notebook ─────────────────────────────────────────────────────────
  const notebookTab = (
    <div className="flex flex-col gap-2">
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Modèle pour la génération de documents dans les notebooks.
      </p>

      {/* Option Auto (= provider de texte actif) */}
      <button
        type="button"
        onClick={() => setSelectedNotebookModel('')}
        className="flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-left transition-all duration-150"
        style={{
          backgroundColor: !selectedNotebookModel ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
          border: `1.5px solid ${!selectedNotebookModel ? 'var(--accent-primary)' : 'transparent'}`,
        }}
      >
        <div className="flex-1 min-w-0">
          <span className="text-xs font-semibold truncate block" style={{ color: !selectedNotebookModel ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
            Auto (provider de texte actif)
          </span>
          <span className="text-xs truncate block mt-0.5" style={{ color: 'var(--text-dimmed)' }}>
            Utilise le modèle de texte / chat sélectionné.
          </span>
        </div>
        {!selectedNotebookModel && <Check size={14} style={{ color: 'var(--accent-primary)' }} />}
      </button>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--text-dimmed)' }} />
        <input
          type="text"
          value={notebookSearch}
          onChange={e => setNotebookSearch(e.target.value)}
          placeholder="Rechercher un modèle notebook..."
          className="w-full rounded-lg pl-8 pr-3 py-2 text-xs outline-none transition-all duration-200"
          style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
          aria-label="Rechercher un modèle notebook"
        />
      </div>

      {renderModelList(filteredNotebookModels, selectedNotebookModel, setSelectedNotebookModel)}

      {/* Custom ID */}
      <div className="pt-2 border-t" style={{ borderColor: 'var(--border-base)' }}>
        <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>
          Ou ID personnalisé :
        </label>
        <input
          type="text"
          value={selectedNotebookModel}
          onChange={e => setSelectedNotebookModel(e.target.value)}
          placeholder="Laisser vide = Auto"
          className="w-full rounded-lg px-3 py-1.5 text-sm font-mono outline-none transition-all duration-200"
          style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
          aria-label="ID de modèle notebook personnalisé"
        />
      </div>
    </div>
  );

  const bodyContent = (
    <>
      {tabBar}
      {activeTab === 'text' && textTab}
      {activeTab === 'image' && imageTab}
      {activeTab === 'notebook' && notebookTab}
    </>
  );

  const footerHint = (
        <p className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
          💡 La voix Live utilise toujours Gemini.
        </p>
  );

  const footerActions = (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={saving}>Annuler</Button>
          <Button variant="primary" size="sm" onClick={handleConfirm} disabled={saving}>{saving ? "Enregistrement…" : "Appliquer"}</Button>
        </div>
  );

  // ── Rendu docké (panneau latéral, sans chrome Modal) ────────────────────────
  if (docked) {
    return (
      <div className="flex flex-col h-full">
        <div
          className="flex items-center justify-between gap-2 px-3 py-2 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border-base)' }}
        >
          {headerContent}
          {onClose && (
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="w-6 h-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-active)] flex-shrink-0"
              style={{ color: 'var(--text-muted)' }}
              aria-label="Fermer"
            >
              <X size={15} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 px-3 py-3">
          {bodyContent}
        </div>

        <div
          className="flex flex-col gap-2 px-3 py-2 flex-shrink-0"
          style={{ borderTop: '1px solid var(--border-base)' }}
        >
          {footerHint}
          {footerActions}
        </div>
      </div>
    );
  }

  return (
    <Modal open onClose={handleClose} size="md" tone="default">
      <Modal.Header>
        {headerContent}
      </Modal.Header>

      <Modal.Body>
        {bodyContent}
      </Modal.Body>

      <Modal.Footer align="between">
        {footerHint}
        {footerActions}
      </Modal.Footer>
    </Modal>
  );
});
