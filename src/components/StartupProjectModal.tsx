import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FolderOpen, Upload, ShieldAlert, Loader2,
  FolderX, FolderInput,
} from 'lucide-react';
import { ideApi } from '../services/ideApi';

function getElectronAPI(): { selectFolder: () => Promise<string | null> } | null {
  const w = window as any;
  return w.electronAPI?.selectFolder ? w.electronAPI : null;
}

export function StartupProjectModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState<string | null>(null);

  // Onglet "Ouvrir"
  const [inputPath, setInputPath] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/self-root/status')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.noProject || !data?.rootPath) {
          setCurrentPath(null);
          setIsOpen(true);
        } else {
          setCurrentPath(data.rootPath);
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
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/self-root/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: trimmed, userConfirmed: true }),
      });
      const data = await res.json();
      if (data.status === 'success') await activate(data.newRoot);
      else setError(data.error || 'Erreur lors du changement de répertoire');
    } catch (e: any) { setError(e.message || 'Erreur réseau'); }
    finally { setLoading(false); }
  }, [inputPath, activate]);

  const canBrowse = !!getElectronAPI() || typeof (window as any).showDirectoryPicker === 'function';

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[99999] flex items-center justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)' }}
      >
        <motion.div
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          className="w-full max-w-lg rounded-2xl p-6 shadow-2xl"
          style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'color-mix(in srgb, var(--accent-primary) 15%, transparent)' }}>
              <FolderOpen className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Workspace Jarvis-OS</h2>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Ouvrez un projet existant pour commencer.
              </p>
            </div>
          </div>

          {/* Avertissement aucun projet */}
          {!currentPath && (
            <div className="rounded-xl p-3 mb-4 flex items-center gap-2"
              style={{ backgroundColor: 'color-mix(in srgb, #f59e0b 8%, transparent)', border: '1px solid color-mix(in srgb, #f59e0b 30%, transparent)' }}>
              <FolderX className="w-4 h-4 flex-shrink-0" style={{ color: '#f59e0b' }} />
              <span className="text-[11px] font-medium" style={{ color: '#f59e0b' }}>
                Aucun projet actif — sélectionnez un projet pour continuer.
              </span>
            </div>
          )}

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
                  <button type="button" onClick={handleBrowse}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-semibold hover:opacity-80 flex-shrink-0"
                    style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)', color: 'var(--accent-primary)' }}>
                    <Upload className="w-3.5 h-3.5" />Parcourir
                  </button>
                )}
              </div>
            </div>

            {/* Erreur */}
            {error && (
              <div className="rounded-lg px-3 py-2 text-[11px] font-medium flex items-center gap-2"
                style={{ backgroundColor: 'color-mix(in srgb, #f87171 10%, transparent)', color: '#f87171' }}>
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Action */}
          <div className="flex justify-end">
            <motion.button
              type="button"
              onClick={handleOpenProject}
              disabled={loading || !inputPath.trim()}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white transition-all disabled:opacity-50"
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
