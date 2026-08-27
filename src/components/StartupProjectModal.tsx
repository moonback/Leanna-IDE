import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  FolderOpen, Upload, ShieldAlert, Loader2,
  FolderX, FolderInput, Globe, X,
} from 'lucide-react';
import { ideApi } from '../services/ideApi';

function getElectronAPI(): { selectFolder: () => Promise<string | null> } | null {
  const w = window as any;
  return w.electronAPI?.selectFolder ? w.electronAPI : null;
}

// Springs explicites et cohérents avec le reste de l'app — voir §4 apple-design.
// Critically damped par défaut ; pas de rebond, car rien ici n'est piloté par un geste.
const MODAL_SPRING = { type: 'spring' as const, bounce: 0, duration: 0.35 };
const OVERLAY_FADE = { duration: 0.2 };
const INLINE_BANNER_TRANSITION = { duration: 0.15 };

export function StartupProjectModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState<string | null>(null);

  // Onglet "Ouvrir"
  const [inputPath, setInputPath] = useState('');
  const [inputSiteUrl, setInputSiteUrl] = useState('');
  const [siteUrlError, setSiteUrlError] = useState<string | null>(null);
  const [showSiteUrl, setShowSiteUrl] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    fetch('/api/self-root/status')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.noProject || !data?.rootPath) {
          setCurrentPath(null);
          setIsOpen(true);
        } else {
          setCurrentPath(data.rootPath);
          setInputSiteUrl(data.siteUrl ?? '');
          setIsOpen(false);
        }
      })
      .catch(() => setIsOpen(true));
  }, []);

  const activate = useCallback(async (newRoot: string) => {
    ideApi.invalidateCache();
    window.dispatchEvent(new CustomEvent('jarvis-sandbox-changed'));
    window.dispatchEvent(new CustomEvent('jarvis-workspace-changed', { detail: { workspace: newRoot } }));
    setIsOpen(false);
  }, []);

  const handleBrowse = async () => {
    const electronAPI = getElectronAPI();
    if (electronAPI) {
      const selected = await electronAPI.selectFolder();
      if (selected) { setInputPath(selected); setError(null); }
    } else {
      try {
        // @ts-ignore Web Directory Picker
        const handle = await window.showDirectoryPicker({ mode: 'read' });
        if (handle?.name) { setInputPath(handle.name); setError(null); }
      } catch { /* cancelled */ }
    }
  };

  const handleOpenProject = useCallback(async () => {
    const trimmed = inputPath.trim();
    if (!trimmed) return;

    // Valider l'URL si renseignée
    const urlTrimmed = inputSiteUrl.trim();
    if (urlTrimmed) {
      try { new URL(urlTrimmed); setSiteUrlError(null); }
      catch { setSiteUrlError("URL invalide — ex: https://mon-site.com"); return; }
    }

    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/self-root/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: trimmed, userConfirmed: true, siteUrl: urlTrimmed }),
      });
      const data = await res.json();
      if (data.status === 'success') await activate(data.newRoot);
      else setError(data.error || 'Erreur lors du changement de répertoire');
    } catch (e: any) { setError(e.message || 'Erreur réseau'); }
    finally { setLoading(false); }
  }, [inputPath, inputSiteUrl, activate]);

  const canBrowse = !!getElectronAPI() || typeof (window as any).showDirectoryPicker === 'function';

  if (!isOpen) return null;

  // Entrée/sortie de la carte modale : scale+translation en temps normal,
  // simple fondu si l'utilisateur a demandé une motion réduite (§14).
  const cardMotionProps = shouldReduceMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : {
        initial: { scale: 0.9, y: 20 },
        animate: { scale: 1, y: 0 },
        exit: { scale: 0.9, y: 20 },
      };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={OVERLAY_FADE}
        className="fixed inset-0 z-[99999] flex items-center justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)' }}
      >
        <motion.div
          {...cardMotionProps}
          transition={MODAL_SPRING}
          className="w-full max-w-lg rounded-2xl p-6 shadow-2xl"
          style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: 'color-mix(in srgb, var(--accent-primary) 15%, transparent)' }}>
                <FolderOpen className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
              </div>
              <div>
                <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Workspace</h2>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Ouvrez un projet existant pour commencer.
                </p>
              </div>
            </div>
            <motion.button
              type="button"
              onClick={() => window.close()}
              whileHover={shouldReduceMotion ? undefined : { opacity: 0.7 }}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.9 }}
              transition={{ duration: 0.1 }}
              className="flex items-center justify-center w-8 h-8 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)', color: 'var(--text-muted)' }}
              title="Quitter"
            >
              <X className="w-4 h-4" />
            </motion.button>
          </div>

          {/* Avertissement aucun projet */}
          <AnimatePresence>
            {!currentPath && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={INLINE_BANNER_TRANSITION}
                className="rounded-xl p-3 flex items-center gap-2 overflow-hidden"
                style={{ backgroundColor: 'color-mix(in srgb, #f59e0b 8%, transparent)', border: '1px solid color-mix(in srgb, #f59e0b 30%, transparent)' }}
              >
                <FolderX className="w-4 h-4 flex-shrink-0" style={{ color: '#f59e0b' }} />
                <span className="text-[11px] font-medium" style={{ color: '#f59e0b' }}>
                  Aucun projet actif — sélectionnez un projet pour continuer.
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Contenu ── */}
          <div className="space-y-3 mb-5">
            <div>
              <label className="text-[11px] font-medium block mb-1.5" style={{ color: 'var(--text-primary)' }}>
                Chemin du projet existant
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <FolderOpen className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-dimmed)' }} />
                  <input type="text" value={inputPath}
                    onChange={e => { setInputPath(e.target.value); setError(null); }}
                    onKeyDown={e => { if (e.key === 'Enter') handleOpenProject(); }}
                    placeholder="C:\Users\...\votre-projet"
                    className="w-full rounded-lg border pl-8 pr-3 py-2 text-[11px] font-mono focus:ring-1 focus:ring-[var(--accent-primary)]"
                    style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-base)', color: 'var(--text-primary)', outline: 'none' }}
                    autoFocus spellCheck={false} />
                </div>
                {canBrowse && (
                  <motion.button
                    type="button"
                    onClick={handleBrowse}
                    whileHover={shouldReduceMotion ? undefined : { opacity: 0.8 }}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
                    transition={{ duration: 0.1 }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-semibold flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-1"
                    style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)', color: 'var(--accent-primary)' }}
                  >
                    <Upload className="w-3.5 h-3.5" />Parcourir
                  </motion.button>
                )}
              </div>
            </div>

            {/* URL du site (optionnel) */}
            <AnimatePresence>
              {showSiteUrl ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={INLINE_BANNER_TRANSITION}
                >
                  <label className="text-[11px] font-medium block mb-1.5" style={{ color: 'var(--text-primary)' }}>
                    URL du site associé
                    <span className="ml-1.5 text-[10px] font-normal" style={{ color: 'var(--text-muted)' }}>(optionnel)</span>
                  </label>
                  <div className="relative">
                    <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-dimmed)' }} />
                    <input
                      type="url"
                      value={inputSiteUrl}
                      onChange={e => { setInputSiteUrl(e.target.value); setSiteUrlError(null); }}
                      onKeyDown={e => { if (e.key === 'Enter') handleOpenProject(); }}
                      placeholder="https://mon-site.com"
                      className="w-full rounded-lg border pl-8 pr-3 py-2 text-[11px] font-mono focus:ring-1 focus:ring-[var(--accent-primary)]"
                      style={{
                        backgroundColor: 'var(--bg-input)',
                        borderColor: siteUrlError ? '#f87171' : 'var(--border-base)',
                        color: 'var(--text-primary)',
                        outline: 'none',
                      }}
                      spellCheck={false}
                    />
                  </div>
                  <AnimatePresence>
                    {siteUrlError && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={INLINE_BANNER_TRANSITION}
                        className="mt-1 text-[10px] overflow-hidden"
                        style={{ color: '#f87171' }}
                      >
                        {siteUrlError}
                      </motion.p>
                    )}
                  </AnimatePresence>
                  <p className="mt-1 text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
                    L'assistant pourra consulter ce site pour répondre à vos questions.
                  </p>
                </motion.div>
              ) : (
                <motion.button
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={INLINE_BANNER_TRANSITION}
                  onClick={() => setShowSiteUrl(true)}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-1"
                  style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
                >
                  <Globe className="w-4 h-4" />
                  <span>URL du site associé (optionnel)</span>
                </motion.button>
              )}
            </AnimatePresence>

            {/* Erreur */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={INLINE_BANNER_TRANSITION}
                  className="rounded-lg px-3 py-2 text-[11px] font-medium flex items-center gap-2 overflow-hidden"
                  style={{ backgroundColor: 'color-mix(in srgb, #f87171 10%, transparent)', color: '#f87171' }}
                >
                  <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Action */}
          <div className="flex justify-end gap-3">
            <motion.button
              type="button"
              onClick={() => window.close()}
              whileHover={shouldReduceMotion ? undefined : { opacity: 0.8 }}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
              transition={{ duration: 0.1 }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-1"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
            >
              <X className="w-4 h-4" />
              Quitter
            </motion.button>
            <motion.button
              type="button"
              onClick={handleOpenProject}
              disabled={loading || !inputPath.trim()}
              whileHover={shouldReduceMotion ? undefined : { scale: 1.02 }}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
              transition={{ duration: 0.12 }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-1"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              {loading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <FolderInput className="w-4 h-4" />
              }
              Ouvrir le projet
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}