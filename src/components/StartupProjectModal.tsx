import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  FolderOpen, Upload, ShieldAlert, Loader2,
  FolderInput, Globe, X, Plus, Trash2, GitBranch,
  CheckCircle2, AlertCircle, ShieldCheck, ArrowRight, Clock,
} from 'lucide-react';
import { ideApi } from '../services/ideApi.js';
import { useToast } from '../components/ui/Toast.js';

interface WorkspaceItem {
  id: string;
  name: string;
  path: string;
  siteUrl?: string;
  lastOpened: string;
  createdAt: string;
  isGit: boolean;
  gitBranch?: string;
}

function getElectronAPI(): { selectFolder: () => Promise<string | null> } | null {
  const w = window as any;
  return w.electronAPI?.selectFolder ? w.electronAPI : null;
}

const MODAL_SPRING = { type: 'spring' as const, bounce: 0, duration: 0.35 };
const OVERLAY_FADE = { duration: 0.2 };
const INLINE_BANNER_TRANSITION = { duration: 0.15 };

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function StartupProjectModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [activeTab, setActiveTab] = useState<'recent' | 'open' | 'new'>('recent');

  // Onglet "Ouvrir"
  const [inputPath, setInputPath] = useState('');
  const [inputSiteUrl, setInputSiteUrl] = useState('');
  const [siteUrlError, setSiteUrlError] = useState<string | null>(null);
  const [showSiteUrl, setShowSiteUrl] = useState(false);
  const [pathValidation, setPathValidation] = useState<{
    valid?: boolean;
    error?: string;
    isGit?: boolean;
    gitBranch?: string;
  } | null>(null);
  const [validatingPath, setValidatingPath] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { error: toastError } = useToast();

  const shouldReduceMotion = useReducedMotion();

  const fetchWorkspaces = useCallback(async () => {
    try {
      const res = await fetch('/api/self-root/workspaces');
      if (res.ok) {
        const data = await res.json();
        setWorkspaces(data.workspaces || []);
        if (data.activeRoot) {
          setCurrentPath(data.activeRoot);
          if (data.siteUrl) setInputSiteUrl(data.siteUrl);
        } else {
          setCurrentPath(null);
        }
        return data;
      }
    } catch {
      /* ignore */
    }
    return null;
  }, []);

  const checkProjectStatus = useCallback(async () => {
    setLoading(true);
    try {
      const wsData = await fetchWorkspaces();
      if (!wsData?.activeRoot) {
        setIsOpen(true);
        if ((wsData?.workspaces?.length ?? 0) > 0) {
          setActiveTab('recent');
        } else {
          setActiveTab('open');
        }
      }
    } catch {
      setIsOpen(true);
      toastError('Impossible de vérifier le statut du projet');
    } finally {
      setLoading(false);
    }
  }, [fetchWorkspaces, toastError]);

  useEffect(() => {
    checkProjectStatus();
  }, [checkProjectStatus]);

  // Écouteur global pour ouvrir le switcher depuis n'importe où dans l'application
  useEffect(() => {
    const handleOpenModal = () => {
      fetchWorkspaces();
      setIsOpen(true);
      setError(null);
    };
    window.addEventListener('Leanna-open-workspace-switcher', handleOpenModal);
    return () => {
      window.removeEventListener('Leanna-open-workspace-switcher', handleOpenModal);
    };
  }, [fetchWorkspaces]);

  // Validation de chemin en direct
  useEffect(() => {
    if (!inputPath.trim()) {
      setPathValidation(null);
      return;
    }
    const timer = setTimeout(async () => {
      setValidatingPath(true);
      try {
        const res = await fetch('/api/self-root/workspaces/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: inputPath.trim() }),
        });
        const data = await res.json();
        setPathValidation(data);
      } catch {
        setPathValidation({ valid: false, error: 'Impossible de valider le chemin' });
      } finally {
        setValidatingPath(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [inputPath]);

  const activate = useCallback(async (newRoot: string) => {
    ideApi.invalidateCache();
    window.dispatchEvent(new CustomEvent('Leanna-sandbox-changed'));
    window.dispatchEvent(new CustomEvent('Leanna-workspace-changed', { detail: { workspace: newRoot } }));
    setCurrentPath(newRoot);
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

  const handleCreateEmptyWorkspace = useCallback(async () => {
    const electronAPI = getElectronAPI();
    let selectedPath: string | null = null;

    if (electronAPI) {
      selectedPath = await electronAPI.selectFolder();
    } else {
      try {
        // @ts-ignore Web Directory Picker
        const handle = await window.showDirectoryPicker({ mode: 'read' });
        selectedPath = handle?.name ?? null;
      } catch { /* cancelled */ }
    }

    if (selectedPath) {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/self-root/change', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: selectedPath, userConfirmed: true, siteUrl: '' }),
        });
        const data = await res.json();
        if (data.status === 'success') await activate(data.newRoot);
        else setError(data.error || 'Erreur lors de la création du workspace');
      } catch (e: any) {
        setError(e.message || 'Erreur réseau');
      } finally {
        setLoading(false);
      }
    }
  }, [activate, setLoading, setError]);

  const handleOpenProject = useCallback(async (targetPath?: string, siteUrl?: string) => {
    const pathToOpen = (targetPath || inputPath).trim();
    if (!pathToOpen) return;

    const urlTrimmed = (siteUrl !== undefined ? siteUrl : inputSiteUrl).trim();
    if (urlTrimmed) {
      try { new URL(urlTrimmed); setSiteUrlError(null); }
      catch { setSiteUrlError("URL invalide — ex: https://mon-site.com"); return; }
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/self-root/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pathToOpen, userConfirmed: true, siteUrl: urlTrimmed }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        await activate(data.newRoot);
      } else {
        setError(data.error || 'Erreur lors du changement de répertoire');
      }
    } catch (e: any) {
      setError(e.message || 'Erreur réseau');
    } finally {
      setLoading(false);
    }
  }, [inputPath, inputSiteUrl, activate]);

  const handleDeleteWorkspace = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/self-root/workspaces/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setWorkspaces(prev => prev.filter(w => w.id !== id));
      }
    } catch {
      /* ignore */
    }
  };

  const handleClose = () => {
    if (currentPath) {
      setIsOpen(false);
    } else {
      window.close();
    }
  };

  const canBrowse = !!getElectronAPI() || typeof (window as any).showDirectoryPicker === 'function';

  if (!isOpen) return null;

  const cardMotionProps = shouldReduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { scale: 0.95, y: 15 }, animate: { scale: 1, y: 0 }, exit: { scale: 0.95, y: 15 } };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={OVERLAY_FADE}
        className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
        style={{ backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
      >
        <motion.div
          {...cardMotionProps}
          transition={MODAL_SPRING}
          className="w-full max-w-xl rounded-2xl p-6 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: 'color-mix(in srgb, var(--accent-primary) 15%, transparent)' }}
              >
                <FolderOpen className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                    Multi-Workspace
                  </h2>
                  <span
                    className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--color-success) 12%, transparent)',
                      color: 'var(--color-success)',
                    }}
                  >
                    <ShieldCheck className="w-3 h-3" />
                    Périmètre sécurisé
                  </span>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Sélectionnez un dépôt ou ouvrez un dossier externe en mode isolé.
                </p>
              </div>
            </div>
            <motion.button
              type="button"
              onClick={handleClose}
              whileHover={shouldReduceMotion ? undefined : { opacity: 0.7 }}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.9 }}
              className="flex items-center justify-center w-8 h-8 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)', color: 'var(--text-muted)' }}
              title={currentPath ? "Fermer" : "Quitter"}
            >
              <X className="w-4 h-4" />
            </motion.button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 p-1 rounded-xl mb-4 flex-shrink-0" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <button
              type="button"
              onClick={() => setActiveTab('recent')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'recent' ? 'shadow-sm' : 'opacity-70 hover:opacity-100'
              }`}
              style={{
                backgroundColor: activeTab === 'recent' ? 'var(--bg-panel)' : 'transparent',
                color: activeTab === 'recent' ? 'var(--accent-primary)' : 'var(--text-secondary)',
              }}
            >
              Dépôts récents ({workspaces.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('open')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'open' ? 'shadow-sm' : 'opacity-70 hover:opacity-100'
              }`}
              style={{
                backgroundColor: activeTab === 'open' ? 'var(--bg-panel)' : 'transparent',
                color: activeTab === 'open' ? 'var(--accent-primary)' : 'var(--text-secondary)',
              }}
            >
              Ouvrir un dépôt externe
            </button>
          </div>

          {/* ── Tab Content ── */}
          <div className="flex-1 overflow-y-auto pr-1 space-y-3 min-h-[220px]">
            {activeTab === 'recent' && (
              <div className="space-y-2">
                {workspaces.length === 0 ? (
                  <div className="text-center py-8 rounded-xl border border-dashed" style={{ borderColor: 'var(--border-base)' }}>
                    <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Aucun workspace enregistré pour le moment.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('open')}
                      className="mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                      style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
                    >
                      Ouvrir un dossier externe
                    </button>
                  </div>
                ) : (
                  workspaces.map((ws) => {
                    const isActive = currentPath && ws.path.toLowerCase() === currentPath.toLowerCase();
                    return (
                      <motion.div
                        key={ws.id}
                        onClick={() => handleOpenProject(ws.path, ws.siteUrl)}
                        whileHover={shouldReduceMotion ? undefined : { x: 2 }}
                        className="group flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer"
                        style={{
                          backgroundColor: isActive
                            ? 'color-mix(in srgb, var(--accent-primary) 8%, var(--bg-secondary))'
                            : 'var(--bg-secondary)',
                          borderColor: isActive ? 'var(--accent-primary)' : 'var(--border-base)',
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{
                              backgroundColor: isActive
                                ? 'color-mix(in srgb, var(--accent-primary) 20%, transparent)'
                                : 'var(--bg-input)',
                              color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)',
                            }}
                          >
                            <FolderOpen className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                                {ws.name}
                              </span>
                              {isActive && (
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.2 rounded"
                                  style={{
                                    backgroundColor: 'color-mix(in srgb, var(--color-success) 15%, transparent)',
                                    color: 'var(--color-success)',
                                  }}
                                >
                                  Actif
                                </span>
                              )}
                              {ws.isGit && (
                                <span
                                  className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.2 rounded"
                                  style={{
                                    backgroundColor: 'var(--bg-panel)',
                                    border: '1px solid var(--border-base)',
                                    color: 'var(--text-secondary)',
                                  }}
                                >
                                  <GitBranch className="w-2.5 h-2.5" />
                                  {ws.gitBranch || 'git'}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] font-mono truncate" style={{ color: 'var(--text-dimmed)' }}>
                              {ws.path}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pl-2 flex-shrink-0">
                          <span className="text-[10px] flex items-center gap-1 opacity-60 hidden sm:flex" style={{ color: 'var(--text-muted)' }}>
                            <Clock className="w-3 h-3" />
                            {formatDate(ws.lastOpened)}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteWorkspace(e, ws.id)}
                            className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400 transition-all"
                            style={{ color: 'var(--text-muted)' }}
                            title="Retirer de l'historique"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <div className="p-1.5 rounded-lg text-primary opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all">
                            <ArrowRight className="w-3.5 h-3.5" />
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            )}

            {activeTab === 'open' && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-primary)' }}>
                    Chemin du dossier externe
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <FolderOpen
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
                        style={{ color: 'var(--text-dimmed)' }}
                      />
                      <input
                        type="text"
                        value={inputPath}
                        onChange={(e) => {
                          setInputPath(e.target.value);
                          setError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleOpenProject();
                        }}
                        placeholder="C:\Users\...\mon-projet"
                        className="w-full rounded-lg border pl-8 pr-3 py-2 text-xs font-mono focus:ring-1 focus:ring-[var(--accent-primary)]"
                        style={{
                          backgroundColor: 'var(--bg-input)',
                          borderColor: pathValidation?.valid === false ? 'var(--color-error)' : 'var(--border-base)',
                          color: 'var(--text-primary)',
                          outline: 'none',
                        }}
                        autoFocus
                        spellCheck={false}
                      />
                    </div>
                    {canBrowse && (
                      <motion.button
                        type="button"
                        onClick={handleBrowse}
                        whileHover={shouldReduceMotion ? undefined : { opacity: 0.8 }}
                        whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold flex-shrink-0"
                        style={{
                          backgroundColor: 'var(--bg-secondary)',
                          border: '1px solid var(--border-base)',
                          color: 'var(--accent-primary)',
                        }}
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Parcourir
                      </motion.button>
                    )}
                  </div>

                  {/* Validation status pill */}
                  <AnimatePresence>
                    {validatingPath && (
                      <div className="flex items-center gap-1.5 mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Vérification de la sécurité du chemin…</span>
                      </div>
                    )}
                    {pathValidation && !validatingPath && (
                      <motion.div
                        initial={{ opacity: 0, y: -2 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex items-center gap-2 mt-2 p-2 rounded-lg text-xs font-medium ${
                          pathValidation.valid ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'
                        }`}
                      >
                        {pathValidation.valid ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>
                              Dépôt valide
                              {pathValidation.isGit && ` • Branche Git: ${pathValidation.gitBranch || 'défaut'}`}
                            </span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>{pathValidation.error || 'Chemin non autorisé ou inexistant'}</span>
                          </>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* URL Optionnelle */}
                <div>
                  <AnimatePresence>
                    {showSiteUrl ? (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={INLINE_BANNER_TRANSITION}
                      >
                        <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-primary)' }}>
                          URL du site associé <span className="text-[11px] font-normal" style={{ color: 'var(--text-muted)' }}>(optionnel)</span>
                        </label>
                        <div className="relative">
                          <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-dimmed)' }} />
                          <input
                            type="url"
                            value={inputSiteUrl}
                            onChange={(e) => {
                              setInputSiteUrl(e.target.value);
                              setSiteUrlError(null);
                            }}
                            placeholder="https://mon-site.com"
                            className="w-full rounded-lg border pl-8 pr-3 py-2 text-xs font-mono focus:ring-1 focus:ring-[var(--accent-primary)]"
                            style={{
                              backgroundColor: 'var(--bg-input)',
                              borderColor: siteUrlError ? 'var(--color-error)' : 'var(--border-base)',
                              color: 'var(--text-primary)',
                              outline: 'none',
                            }}
                            spellCheck={false}
                          />
                        </div>
                        {siteUrlError && <p className="mt-1 text-xs text-red-400">{siteUrlError}</p>}
                      </motion.div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowSiteUrl(true)}
                        className="flex items-center gap-1.5 text-xs font-medium transition-colors hover:opacity-80"
                        style={{ color: 'var(--accent-primary)' }}
                      >
                        <Globe className="w-3.5 h-3.5" />
                        + Associer une URL de site ou documentation
                      </button>
                    )}
                  </AnimatePresence>
                </div>

                {/* Créer un nouveau workspace vide */}
                {canBrowse && (
                  <div className="pt-2 border-t" style={{ borderColor: 'var(--border-base)' }}>
                    <button
                      type="button"
                      onClick={handleCreateEmptyWorkspace}
                      disabled={loading}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all hover:opacity-90"
                      style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Créer un nouveau workspace vide
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Message d'erreur global */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-lg px-3 py-2 text-xs font-medium flex items-center gap-2 bg-red-500/10 text-red-400 border border-red-500/20"
                >
                  <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer Action */}
          <div className="flex items-center justify-between pt-4 mt-2 border-t flex-shrink-0" style={{ borderColor: 'var(--border-base)' }}>
            <span className="text-[11px]" style={{ color: 'var(--text-dimmed)' }}>
              {currentPath ? `Actif: ${currentPath.split(/[\\/]/).pop()}` : 'Aucun projet sélectionné'}
            </span>

            <div className="flex items-center gap-2">
              {currentPath && (
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 rounded-xl text-xs font-semibold transition-colors"
                  style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
                >
                  Fermer
                </button>
              )}
              {activeTab === 'open' && (
                <motion.button
                  type="button"
                  onClick={() => handleOpenProject()}
                  disabled={loading || !inputPath.trim() || pathValidation?.valid === false}
                  whileHover={shouldReduceMotion ? undefined : { scale: 1.02 }}
                  whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-50 transition-all shadow-md"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderInput className="w-3.5 h-3.5" />}
                  Ouvrir et verrouiller
                </motion.button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}