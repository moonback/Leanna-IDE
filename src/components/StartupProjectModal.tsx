import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  FolderOpen, Upload, ShieldAlert, Loader2,
  FolderInput, Globe, X, Plus, Trash2, GitBranch,
  CheckCircle2, AlertCircle, ShieldCheck, ArrowRight, Clock,
  Github, Terminal, FolderDown, Settings,
  FolderClock, Layers, Search, GitFork, BookOpen, Power,
} from 'lucide-react';
import { ideApi } from '../services/ideApi.js';
import { useToast } from '../components/ui/Toast.js';
import { QuitConfirmDialog } from './sidebar/QuitConfirmDialog.js';
// @ts-ignore - Asset handled by bundler
import logo from '../../assets/images/icon-sombre.png';

/** Clé sessionStorage pour le mode "sans projet" */
const NO_WORKSPACE_KEY = 'Leanna-no-workspace-mode';
/** Clé sessionStorage : le launcher a déjà été traité pour cette session */
const LAUNCHER_DONE_KEY = 'Leanna-launcher-done';
/** Clé sessionStorage : la réouverture automatique du dernier projet a déjà été tentée pour cette session */
const AUTO_REOPEN_KEY = 'Leanna-auto-reopen-done';

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

/** API Electron exposant quit() (fenêtre desktop uniquement). */
function getElectronQuitAPI(): { quit: () => void } | null {
  const w = window as any;
  return typeof w.electronAPI?.quit === 'function' ? w.electronAPI : null;
}

const MODAL_SPRING = { type: 'spring' as const, bounce: 0, duration: 0.35 };
const OVERLAY_FADE = { duration: 0.2 };

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 60) return minutes <= 1 ? "À l'instant" : `Il y a ${minutes} min`;
    if (hours < 24) return `Il y a ${hours}h`;
    if (days < 7) return `Il y a ${days}j`;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  } catch {
    return '—';
  }
}

function getWorkspaceColor(name: string): string {
  const colors = [
    'from-blue-500 to-indigo-600',
    'from-violet-500 to-purple-600',
    'from-emerald-500 to-teal-600',
    'from-orange-500 to-amber-600',
    'from-rose-500 to-pink-600',
    'from-cyan-500 to-sky-600',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function getWorkspaceInitials(name: string): string {
  return name.split(/[\s\-_]/).map(p => p[0]).slice(0, 2).join('').toUpperCase() || name.slice(0, 2).toUpperCase();
}

type TabId = 'recent' | 'open' | 'clone';

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ElementType;
  description: string;
}

const TABS: TabDef[] = [
  { id: 'recent',  label: 'Récents',  icon: FolderClock, description: 'Vos projets précédents' },
  { id: 'open',    label: 'Ouvrir',   icon: FolderOpen,  description: 'Dossier local' },
  { id: 'clone',   label: 'Cloner',   icon: Github,      description: 'Dépôt distant' },
];

export function StartupProjectModal() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('open');

  const [inputPath, setInputPath] = useState('');
  const [inputSiteUrl, setInputSiteUrl] = useState('');
  const [siteUrlError, setSiteUrlError] = useState<string | null>(null);
  const [showSiteUrl, setShowSiteUrl] = useState(false);
  const [pathValidation, setPathValidation] = useState<{
    valid?: boolean; error?: string; isGit?: boolean; gitBranch?: string;
  } | null>(null);
  const [validatingPath, setValidatingPath] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [cloneUrl, setCloneUrl] = useState('');
  const [cloneTargetDir, setCloneTargetDir] = useState('');
  const [cloneUrlError, setCloneUrlError] = useState<string | null>(null);
  const [cloneStatus, setCloneStatus] = useState<'idle' | 'cloning' | 'done' | 'error'>('idle');
  const [cloneLogs, setCloneLogs] = useState<Array<{ level: string; message: string }>>([]);
  const cloneLogsEndRef = useRef<HTMLDivElement>(null);
  const cloneAbortRef = useRef<(() => void) | null>(null);
  const returningFromSettingsRef = useRef(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forceSelection, setForceSelection] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const { error: toastError } = useToast();
  const shouldReduceMotion = useReducedMotion();

  // Reprise automatique du dernier projet (compte à rebours annulable)
  const [lastWorkspace, setLastWorkspace] = useState<WorkspaceItem | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isOpeningLast, setIsOpeningLast] = useState(false);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Annule le compte à rebours de reprise automatique du dernier projet. */
  const cancelAutoReopen = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdown(null);
    sessionStorage.setItem(AUTO_REOPEN_KEY, '1');
  }, []);

  const fetchWorkspaces = useCallback(async () => {
    try {
      const res = await fetch('/api/self-root/workspaces');
      if (res.ok) {
        const data = await res.json();
        const list: WorkspaceItem[] = data.workspaces || [];
        setWorkspaces(list);
        setLastWorkspace(list.length > 0 ? list[0] : null);
        if (data.activeRoot) {
          setCurrentPath(data.activeRoot);
          if (data.siteUrl) setInputSiteUrl(data.siteUrl);
        } else {
          setCurrentPath(null);
        }
        return data;
      }
    } catch { /* ignore */ }
    return null;
  }, []);

  const checkProjectStatus = useCallback(async () => {
    setLoading(true);
    try {
      const wsData = await fetchWorkspaces();
      if (!wsData?.activeRoot) {
        // Mode "sans projet" explicitement choisi (ex: Notebooks) → ne pas afficher
        if (sessionStorage.getItem(NO_WORKSPACE_KEY) === '1') { setIsOpen(false); return; }
        // Écran de démarrage : aucun projet actif → on propose la sélection.
        // Affiché uniquement sur l'accueil ou l'IDE (pas sur /settings, /notebooks, etc.)
        if (pathname === '/' || pathname === '/ide') {
          setIsOpen(true);
          const hasRecents = (wsData?.workspaces?.length ?? 0) > 0;
          setActiveTab(hasRecents ? 'recent' : 'open');
        } else {
          setIsOpen(false);
        }
      }
    } catch {
      setIsOpen(true);
      toastError('Impossible de vérifier le statut du projet');
    } finally {
      setLoading(false);
    }
  }, [fetchWorkspaces, toastError, pathname]);

  useEffect(() => { checkProjectStatus(); }, [checkProjectStatus]);

  useEffect(() => {
    if (pathname !== '/settings' && returningFromSettingsRef.current) {
      returningFromSettingsRef.current = false;
      setIsOpen(true);
    }
  }, [pathname]);

  useEffect(() => {
    if (workspaces.length > 0 && activeTab === 'open' && !inputPath) {
      setActiveTab('recent');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaces.length]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || cloneStatus === 'cloning' || loading || forceSelection) return;
      handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, cloneStatus, loading, currentPath, forceSelection]);

  useEffect(() => {
    const handleOpenModal = async (e: Event) => {
      // Ouverture explicite → on annule toute reprise automatique en attente.
      cancelAutoReopen();
      await new Promise(resolve => setTimeout(resolve, 100));
      const data = await fetchWorkspaces();
      const detail = (e as CustomEvent).detail || {};
      const forced = !!detail.force;
      const tab = detail.tab as TabId | undefined;
      setForceSelection(forced);
      if (tab) setActiveTab(tab);
      else if ((data?.workspaces?.length ?? 0) > 0) setActiveTab('recent');
      else setActiveTab('open');
      setIsOpen(true);
      setError(null);
    };
    // Rétro-compat : certains écrans (Notebooks) dispatchent encore "Leanna-open-launcher".
    const handleOpenLauncher = () => {
      sessionStorage.removeItem(NO_WORKSPACE_KEY);
      void handleOpenModal(new CustomEvent('Leanna-open-launcher', { detail: {} }));
    };
    const handleNoWorkspaceMode = () => setIsOpen(false);
    window.addEventListener('Leanna-open-workspace-switcher', handleOpenModal);
    window.addEventListener('Leanna-open-launcher', handleOpenLauncher);
    window.addEventListener('Leanna-no-workspace-mode', handleNoWorkspaceMode);
    return () => {
      window.removeEventListener('Leanna-open-workspace-switcher', handleOpenModal);
      window.removeEventListener('Leanna-open-launcher', handleOpenLauncher);
      window.removeEventListener('Leanna-no-workspace-mode', handleNoWorkspaceMode);
    };
  }, [fetchWorkspaces, cancelAutoReopen]);

  useEffect(() => {
    if (!inputPath.trim()) { setPathValidation(null); return; }
    const timer = setTimeout(async () => {
      setValidatingPath(true);
      try {
        const res = await fetch('/api/self-root/workspaces/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: inputPath.trim() }),
        });
        setPathValidation(await res.json());
      } catch {
        setPathValidation({ valid: false, error: 'Impossible de valider le chemin' });
      } finally {
        setValidatingPath(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [inputPath]);

  useEffect(() => {
    if (cloneStatus === 'cloning') {
      cloneLogsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [cloneLogs, cloneStatus]);

  // Reprise automatique du dernier projet avec compte à rebours annulable.
  useEffect(() => {
    if (!isOpen || forceSelection || isOpeningLast) return;
    if (currentPath || !lastWorkspace) return;
    if (sessionStorage.getItem(AUTO_REOPEN_KEY) === '1') return;
    if (cloneStatus !== 'idle') return;

    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(interval);
          countdownTimerRef.current = null;
          sessionStorage.setItem(AUTO_REOPEN_KEY, '1');
          void openWorkspaceItem(lastWorkspace, { silent: true }).finally(() => setCountdown(null));
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    countdownTimerRef.current = interval;

    return () => {
      clearInterval(interval);
      countdownTimerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, forceSelection, isOpeningLast, currentPath, lastWorkspace]);

  const activate = useCallback(async (newRoot: string) => {
    sessionStorage.removeItem(NO_WORKSPACE_KEY);
    sessionStorage.setItem(LAUNCHER_DONE_KEY, '1');
    ideApi.invalidateCache();
    window.dispatchEvent(new CustomEvent('Leanna-sandbox-changed'));
    window.dispatchEvent(new CustomEvent('Leanna-workspace-changed', { detail: { workspace: newRoot } }));
    setCurrentPath(newRoot);
    setForceSelection(false);
    setIsOpen(false);
  }, []);

  /** Ouvre un workspace de l'historique (chemin + éventuelle URL de site). */
  const openWorkspaceItem = useCallback(async (ws: WorkspaceItem, options?: { silent?: boolean }): Promise<boolean> => {
    try {
      setIsOpeningLast(true);
      const res = await fetch('/api/self-root/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: ws.path, userConfirmed: true, siteUrl: ws.siteUrl || '' }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        await activate(data.newRoot || ws.path);
        navigate('/ide');
        return true;
      }
      if (!options?.silent) setError(data.error || "Erreur lors de l'ouverture du projet");
    } catch (e: any) {
      if (!options?.silent) setError(e?.message || 'Erreur réseau');
    } finally {
      setIsOpeningLast(false);
    }
    return false;
  }, [activate, navigate]);

  /** Ouvre l'espace Notebooks (mode sans workspace). */
  const openNotebooks = useCallback(() => {
    cancelAutoReopen();
    sessionStorage.setItem(LAUNCHER_DONE_KEY, '1');
    sessionStorage.setItem(NO_WORKSPACE_KEY, '1');
    window.dispatchEvent(new CustomEvent('Leanna-no-workspace-mode'));
    setIsOpen(false);
    navigate('/notebooks');
  }, [cancelAutoReopen, navigate]);

  const validateCloneUrl = (url: string): string | null => {
    if (!url.trim()) return null;
    if (!/^https?:\/\//i.test(url) && !/^git@/i.test(url))
      return 'URL invalide — ex: https://github.com/user/repo';
    return null;
  };

  const handleClone = useCallback(async () => {
    cancelAutoReopen();
    const urlErr = validateCloneUrl(cloneUrl);
    if (urlErr) { setCloneUrlError(urlErr); return; }
    if (!cloneUrl.trim()) { setCloneUrlError("L'URL du dépôt est requise."); return; }
    setCloneUrlError(null);
    setCloneStatus('cloning');
    setCloneLogs([]);
    const body: Record<string, string> = { url: cloneUrl.trim() };
    if (cloneTargetDir.trim()) body.targetDir = cloneTargetDir.trim();
    let aborted = false;
    const controller = new AbortController();
    cloneAbortRef.current = () => { aborted = true; controller.abort(); };
    try {
      const res = await fetch('/api/self-root/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => 'Erreur réseau');
        setCloneStatus('error');
        setCloneLogs(prev => [...prev, { level: 'error', message: txt }]);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done || aborted) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const dataLine = part.split('\n').find(l => l.startsWith('data:'));
          if (!dataLine) continue;
          try {
            const event = JSON.parse(dataLine.slice(5).trim());
            if (event.type === 'log') {
              setCloneLogs(prev => [...prev, { level: event.level ?? 'info', message: event.message ?? '' }]);
            } else if (event.type === 'done') {
              setCloneStatus('done');
              await activate(event.newRoot);
              await fetchWorkspaces();
            } else if (event.type === 'error') {
              setCloneStatus('error');
              setCloneLogs(prev => [...prev, { level: 'error', message: event.error ?? 'Erreur inconnue' }]);
            }
          } catch { /* SSE malformée */ }
        }
      }
    } catch (err: any) {
      if (!aborted) {
        setCloneStatus('error');
        setCloneLogs(prev => [...prev, { level: 'error', message: err.message || 'Erreur réseau' }]);
      }
    } finally {
      cloneAbortRef.current = null;
    }
  }, [cloneUrl, cloneTargetDir, activate, fetchWorkspaces, cancelAutoReopen]);

  const handleCancelClone = () => { cloneAbortRef.current?.(); setCloneStatus('idle'); setCloneLogs([]); };

  const handleBrowse = async () => {
    cancelAutoReopen();
    const api = getElectronAPI();
    if (api) {
      const selected = await api.selectFolder();
      if (selected) { setInputPath(selected); setError(null); }
    } else {
      try {
        // @ts-ignore
        const handle = await window.showDirectoryPicker({ mode: 'read' });
        if (handle?.name) { setInputPath(handle.name); setError(null); }
      } catch { /* cancelled */ }
    }
  };

  const handleCreateEmptyWorkspace = useCallback(async () => {
    cancelAutoReopen();
    const api = getElectronAPI();
    let selectedPath: string | null = null;
    if (api) {
      selectedPath = await api.selectFolder();
    } else {
      try {
        // @ts-ignore
        const handle = await window.showDirectoryPicker({ mode: 'read' });
        selectedPath = handle?.name ?? null;
      } catch { /* cancelled */ }
    }
    if (!selectedPath) return;
    setLoading(true); setError(null);
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
  }, [activate, cancelAutoReopen]);

  const handleOpenProject = useCallback(async (targetPath?: string, siteUrl?: string) => {
    cancelAutoReopen();
    const pathToOpen = (targetPath || inputPath).trim();
    if (!pathToOpen) return;
    const urlTrimmed = (siteUrl !== undefined ? siteUrl : inputSiteUrl).trim();
    if (urlTrimmed) {
      try { new URL(urlTrimmed); setSiteUrlError(null); }
      catch { setSiteUrlError('URL invalide — ex: https://mon-site.com'); return; }
    }
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/self-root/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pathToOpen, userConfirmed: true, siteUrl: urlTrimmed }),
      });
      const data = await res.json();
      if (data.status === 'success') await activate(data.newRoot);
      else setError(data.error || 'Erreur lors du changement de répertoire');
    } catch (e: any) {
      setError(e.message || 'Erreur réseau');
    } finally {
      setLoading(false);
    }
  }, [inputPath, inputSiteUrl, activate, cancelAutoReopen]);

  const handleDeleteWorkspace = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/self-root/workspaces/${id}`, { method: 'DELETE' });
      if (res.ok) setWorkspaces(prev => prev.filter(w => w.id !== id));
    } catch { /* ignore */ }
  };

  const handleClose = () => {
    cancelAutoReopen();
    sessionStorage.setItem(LAUNCHER_DONE_KEY, '1');
    if (currentPath || sessionStorage.getItem(NO_WORKSPACE_KEY) === '1') setIsOpen(false);
    else window.close();
  };

  const handleOpenSettings = () => {
    cancelAutoReopen();
    returningFromSettingsRef.current = true;
    setIsOpen(false);
    navigate('/settings');
  };

  /** Rouvre / rentre dans le projet actuellement actif (sans re-sélection). */
  const handleReopenActive = () => {
    if (!currentPath) return;
    cancelAutoReopen();
    sessionStorage.setItem(LAUNCHER_DONE_KEY, '1');
    sessionStorage.removeItem(NO_WORKSPACE_KEY);
    setIsOpen(false);
    navigate('/ide');
  };

  /** Confirme et quitte l'application Electron (fenêtre desktop uniquement). */
  const handleQuitConfirm = () => {
    setShowQuitConfirm(false);
    const api = getElectronQuitAPI();
    if (api) api.quit();
    else window.close();
  };

  const canBrowse = !!getElectronAPI() || typeof (window as any).showDirectoryPicker === 'function';
  const canQuit = !!getElectronQuitAPI();
  const filteredWorkspaces = workspaces.filter(ws =>
    !searchQuery || ws.name.toLowerCase().includes(searchQuery.toLowerCase()) || ws.path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  const cardMotionProps = shouldReduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { scale: 0.97, y: 20, opacity: 0 }, animate: { scale: 1, y: 0, opacity: 1 }, exit: { scale: 0.97, y: 20, opacity: 0 } };

  const visibleTabs = workspaces.length > 0 ? TABS : TABS.filter(t => t.id !== 'recent');

  return (
    <AnimatePresence>
      <motion.div
        key="workspace-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={OVERLAY_FADE}
        className="fixed inset-0 flex items-center justify-center p-4 overflow-hidden"
        style={{ zIndex: 'var(--z-modal)', backgroundColor: 'rgba(4, 6, 10, 0.88)', backdropFilter: 'blur(20px)' }}
        onClick={!forceSelection ? handleClose : undefined}
      >
        {/* Atmospheric glows */}
        {!shouldReduceMotion && (
          <>
            <motion.div
              animate={{ x: [-30, 30, -30], y: [-20, 20, -20], opacity: [0.15, 0.28, 0.15] }}
              transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -top-60 -left-40 w-[45rem] h-[45rem] rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, var(--accent-primary) 0%, transparent 65%)', filter: 'blur(80px)' }}
            />
            <motion.div
              animate={{ x: [20, -20, 20], y: [15, -15, 15], opacity: [0.1, 0.2, 0.1] }}
              transition={{ duration: 17, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -bottom-60 -right-40 w-[50rem] h-[50rem] rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, var(--accent-secondary) 0%, transparent 65%)', filter: 'blur(90px)' }}
            />
          </>
        )}

        {/* Modal */}
        <motion.div
          {...cardMotionProps}
          transition={MODAL_SPRING}
          role="dialog"
          aria-modal="true"
          aria-labelledby="workspace-modal-title"
          onClick={e => e.stopPropagation()}
          className="relative z-10 flex w-full max-w-5xl rounded-3xl overflow-hidden border"
          style={{
            height: 'min(680px, calc(100vh - 40px))',
            backgroundColor: 'color-mix(in srgb, var(--bg-panel) 92%, transparent)',
            borderColor: 'color-mix(in srgb, var(--accent-primary) 18%, rgba(255,255,255,0.08))',
            boxShadow: '0 40px 120px -20px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.1), 0 0 60px -20px color-mix(in srgb, var(--accent-primary) 12%, transparent)',
          }}
        >
          {/* Top gradient line */}
          <div
            className="absolute top-0 left-0 right-0 h-px pointer-events-none z-20"
            style={{ background: 'linear-gradient(90deg, transparent, var(--accent-primary) 30%, var(--accent-secondary) 70%, transparent)' }}
          />

          {/* ── LEFT SIDEBAR ── */}
          <div
            className="w-64 flex-shrink-0 flex flex-col border-r"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 80%, transparent)',
              borderColor: 'color-mix(in srgb, var(--border-base) 60%, transparent)',
            }}
          >
            {/* Brand */}
            <div className="flex items-center gap-3 px-5 py-5 border-b flex-shrink-0"
              style={{ borderColor: 'color-mix(in srgb, var(--border-base) 50%, transparent)' }}>
              <motion.div
                whileHover={shouldReduceMotion ? undefined : { rotate: 8, scale: 1.08 }}
                transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                className="relative w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent-primary) 25%, transparent), color-mix(in srgb, var(--accent-secondary) 15%, transparent))',
                  border: '1px solid color-mix(in srgb, var(--accent-primary) 40%, transparent)',
                  boxShadow: '0 4px 16px -4px color-mix(in srgb, var(--accent-primary) 30%, transparent)',
                }}
              >
                <img src={logo} alt="Leanna" className="w-10 h-10 object-contain" draggable={false} />
              </motion.div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] leading-none mb-1" style={{ color: 'var(--accent-primary)' }}>
                  Workspace
                </p>
                <h2 id="workspace-modal-title" className="text-sm font-black tracking-tight leading-none" style={{ color: 'var(--text-primary)' }}>
                  Leanna IDE
                </h2>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-3 px-2" style={{ color: 'var(--text-dimmed)' }}>
                Ouvrir un projet
              </p>
              {visibleTabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <motion.button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      cancelAutoReopen();
                      setActiveTab(tab.id);
                      if (tab.id === 'clone') { setCloneStatus('idle'); setCloneLogs([]); setCloneUrlError(null); }
                    }}
                    whileHover={shouldReduceMotion ? undefined : { x: 2 }}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
                    className="relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors"
                    style={{ color: active ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                  >
                    {active && (
                      <motion.div
                        layoutId="tab-bg"
                        className="absolute inset-0 rounded-xl"
                        style={{
                          backgroundColor: 'color-mix(in srgb, var(--accent-primary) 10%, var(--bg-panel))',
                          border: '1px solid color-mix(in srgb, var(--accent-primary) 30%, transparent)',
                        }}
                        transition={{ type: 'spring', stiffness: 450, damping: 36 }}
                      />
                    )}
                    <div
                      className="relative z-10 w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
                      style={{
                        backgroundColor: active ? 'color-mix(in srgb, var(--accent-primary) 18%, transparent)' : 'var(--bg-input)',
                        color: active ? 'var(--accent-primary)' : 'var(--text-muted)',
                      }}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="relative z-10 min-w-0">
                      <p className="text-xs font-semibold leading-none mb-0.5">{tab.label}</p>
                      <p className="text-[10px] leading-none" style={{ color: active ? 'color-mix(in srgb, var(--accent-primary) 70%, var(--text-muted))' : 'var(--text-dimmed)' }}>
                        {tab.description}
                      </p>
                    </div>
                    {active && (
                      <div
                        className="absolute right-2.5 z-10 w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: 'var(--accent-primary)' }}
                      />
                    )}
                  </motion.button>
                );
              })}
            </div>

            {/* Sidebar footer */}
            <div className="flex-shrink-0 border-t px-3 py-3 space-y-1"
              style={{ borderColor: 'color-mix(in srgb, var(--border-base) 50%, transparent)' }}>
              {currentPath && (
                <motion.button
                  type="button"
                  onClick={handleReopenActive}
                  whileHover={shouldReduceMotion ? undefined : { x: 2 }}
                  whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
                  title="Rouvrir le projet actif"
                  className="group w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl mb-1 text-left transition-colors"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--color-success) 8%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--color-success) 20%, transparent)',
                  }}
                >
                  <div className="relative flex-shrink-0">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-success)' }} />
                    {!shouldReduceMotion && (
                      <motion.div
                        className="absolute inset-0 rounded-full"
                        style={{ backgroundColor: 'var(--color-success)' }}
                        animate={{ scale: [1, 2.2, 1], opacity: [0.6, 0, 0.6] }}
                        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-medium leading-none mb-0.5" style={{ color: 'var(--color-success)' }}>Projet actif · rouvrir</p>
                    <p className="text-xs font-semibold truncate leading-none" style={{ color: 'var(--text-primary)' }}>
                      {currentPath.split(/[\\/]/).pop()}
                    </p>
                  </div>
                  <div
                    className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center transition-all group-hover:translate-x-0.5"
                    style={{ color: 'var(--color-success)' }}
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </motion.button>
              )}
              {/* Espace Notebooks (mode sans projet) */}
              <motion.button
                type="button"
                onClick={openNotebooks}
                whileHover={shouldReduceMotion ? undefined : { x: 2 }}
                whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors mb-1 hover:bg-[var(--bg-hover)]"
                style={{ color: 'var(--text-secondary)' }}
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--accent-secondary) 15%, transparent)',
                    color: 'var(--accent-secondary)',
                  }}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold leading-none mb-0.5">Notebooks</p>
                  <p className="text-[10px] leading-none" style={{ color: 'var(--text-dimmed)' }}>
                    Chat & sources, sans projet
                  </p>
                </div>
              </motion.button>
              <div className="flex items-center gap-1">
                <motion.button
                  type="button"
                  onClick={handleOpenSettings}
                  whileHover={shouldReduceMotion ? undefined : { opacity: 0.8 }}
                  whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
                  className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--bg-hover)]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <Settings className="w-3.5 h-3.5" />
                  Paramètres
                </motion.button>
                {canQuit && (
                  <motion.button
                    type="button"
                    onClick={() => setShowQuitConfirm(true)}
                    whileHover={shouldReduceMotion ? undefined : { opacity: 0.9 }}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
                    className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
                    style={{ color: '#f87171' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(239,68,68,0.12)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
                    title="Quitter l'application"
                  >
                    <Power className="w-4 h-4" />
                  </motion.button>
                )}
                
              </div>
            </div>
          </div>

          {/* ── RIGHT CONTENT PANEL ── */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Panel header */}
            <div
              className="flex items-center justify-between px-7 py-5 flex-shrink-0 border-b"
              style={{ borderColor: 'color-mix(in srgb, var(--border-base) 50%, transparent)' }}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                >
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-1" style={{ color: 'var(--accent-primary)' }}>
                    {activeTab === 'recent' ? `${workspaces.length} workspace${workspaces.length !== 1 ? 's' : ''}` :
                     activeTab === 'open'   ? 'Parcourir le système' :
                     'Intégration Git'}
                  </p>
                  <h3 className="text-lg font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>
                    {activeTab === 'recent' ? 'Projets récents' :
                     activeTab === 'open'   ? 'Ouvrir un dossier' :
                     'Cloner un dépôt'}
                  </h3>
                </motion.div>
              </AnimatePresence>
              {countdown !== null && lastWorkspace ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl border"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
                    borderColor: 'color-mix(in srgb, var(--accent-primary) 30%, transparent)',
                  }}
                >
                  <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: 'var(--accent-primary)' }}>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Reprise de <strong className="font-semibold truncate max-w-[120px]">{lastWorkspace.name}</strong> dans
                    <strong className="font-mono text-xs">{countdown}s</strong>
                  </span>
                  <button
                    type="button"
                    onClick={cancelAutoReopen}
                    className="px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors"
                    style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
                  >
                    Annuler
                  </button>
                </motion.div>
              ) : (
                <span
                  className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full border"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--color-success) 10%, transparent)',
                    borderColor: 'color-mix(in srgb, var(--color-success) 25%, transparent)',
                    color: 'var(--color-success)',
                  }}
                >
                  <ShieldCheck className="w-3 h-3" />
                  Périmètre sécurisé
                </span>
              )}
            </div>

            {/* Tab content */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              <AnimatePresence mode="wait">

                {/* RECENT */}
                {activeTab === 'recent' && (
                  <motion.div
                    key="recent"
                    initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -12 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col h-full"
                  >
                    <div className="px-6 pt-5 pb-3 flex-shrink-0">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-dimmed)' }} />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          placeholder="Rechercher un projet…"
                          className="w-full rounded-xl border pl-9 pr-3 py-2.5 text-xs focus:ring-1 focus:ring-[var(--accent-primary)] outline-none transition-all"
                          style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}
                        />
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto px-6 pb-5 space-y-2">
                      {filteredWorkspaces.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                            style={{ backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 80%, transparent)', border: '1px solid var(--border-base)' }}>
                            <FolderOpen className="w-6 h-6" style={{ color: 'var(--text-dimmed)' }} />
                          </div>
                          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                            {searchQuery ? 'Aucun résultat' : 'Aucun projet récent'}
                          </p>
                          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                            {searchQuery ? "Essayez d'autres mots-clés" : 'Ouvrez un dossier pour commencer'}
                          </p>
                          {!searchQuery && (
                            <button type="button" onClick={() => setActiveTab('open')}
                              className="px-4 py-2 rounded-xl text-xs font-semibold text-white"
                              style={{ backgroundColor: 'var(--accent-primary)' }}>
                              Ouvrir un dossier
                            </button>
                          )}
                        </div>
                      ) : (
                        filteredWorkspaces.map((ws, i) => {
                          const isActive = currentPath && ws.path.toLowerCase() === currentPath.toLowerCase();
                          const colorClass = getWorkspaceColor(ws.name);
                          const initials = getWorkspaceInitials(ws.name);
                          return (
                            <motion.div
                              key={ws.id}
                              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.2, delay: i * 0.04 }}
                              onClick={() => handleOpenProject(ws.path, ws.siteUrl)}
                              className="group relative flex items-center gap-4 p-4 rounded-2xl border cursor-pointer transition-all"
                              style={{
                                backgroundColor: isActive ? 'color-mix(in srgb, var(--accent-primary) 6%, var(--bg-secondary))' : 'var(--bg-secondary)',
                                borderColor: isActive ? 'color-mix(in srgb, var(--accent-primary) 40%, transparent)' : 'var(--border-base)',
                              }}
                            >
                              {/* Hover gradient overlay */}
                              <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                                style={{
                                  background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent-primary) 3%, transparent), transparent)',
                                  border: '1px solid color-mix(in srgb, var(--accent-primary) 20%, transparent)',
                                }}
                              />
                              {/* Avatar */}
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-xs font-black bg-gradient-to-br ${colorClass} shadow-lg`}>
                                {initials}
                              </div>
                              {/* Info */}
                              <div className="min-w-0 flex-1 relative z-10">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{ws.name}</span>
                                  {isActive && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0"
                                      style={{ backgroundColor: 'color-mix(in srgb, var(--color-success) 15%, transparent)', color: 'var(--color-success)' }}>
                                      Actif
                                    </span>
                                  )}
                                  {ws.isGit && (
                                    <span className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-md flex-shrink-0"
                                      style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)', color: 'var(--text-muted)' }}>
                                      <GitBranch className="w-2.5 h-2.5" />
                                      {ws.gitBranch || 'main'}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] font-mono truncate" style={{ color: 'var(--text-dimmed)' }}>{ws.path}</p>
                              </div>
                              {/* Actions */}
                              <div className="flex items-center gap-2 flex-shrink-0 relative z-10">
                                <span className="text-[10px] items-center gap-1 hidden sm:flex" style={{ color: 'var(--text-dimmed)' }}>
                                  <Clock className="w-3 h-3" />{formatDate(ws.lastOpened)}
                                </span>
                                <button type="button" onClick={e => handleDeleteWorkspace(e, ws.id)}
                                  className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                  style={{ color: 'var(--text-dimmed)' }}
                                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#f87171'; (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(239,68,68,0.12)'; }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-dimmed)'; (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
                                  title="Retirer de l'historique">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                                <div className="p-1.5 rounded-lg opacity-60 group-hover:opacity-100 transition-all group-hover:translate-x-0.5"
                                  style={{ color: 'var(--accent-primary)' }}>
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </div>
                              </div>
                            </motion.div>
                          );
                        })
                      )}
                    </div>
                  </motion.div>
                )}

                {/* OPEN */}
                {activeTab === 'open' && (
                  <motion.div
                    key="open"
                    initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -12 }}
                    transition={{ duration: 0.2 }}
                    className="px-7 py-6 space-y-5"
                  >
                    <div>
                      <label className="text-xs font-semibold block mb-2" style={{ color: 'var(--text-secondary)' }}>
                        Chemin du dossier
                      </label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-dimmed)' }} />
                          {validatingPath && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin pointer-events-none" style={{ color: 'var(--accent-primary)' }} />}
                          {!validatingPath && pathValidation?.valid === true && <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none text-emerald-400" />}
                          {!validatingPath && pathValidation?.valid === false && <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none text-red-400" />}
                          <input
                            type="text"
                            value={inputPath}
                            onChange={e => { setInputPath(e.target.value); setError(null); }}
                            onKeyDown={e => { if (e.key === 'Enter') handleOpenProject(); }}
                            placeholder="C:\Users\...\mon-projet"
                            className="w-full rounded-xl border pl-10 pr-10 py-3 text-xs font-mono focus:ring-1 focus:ring-[var(--accent-primary)] outline-none transition-all"
                            style={{
                              backgroundColor: 'var(--bg-input)',
                              borderColor: pathValidation?.valid === false ? 'var(--color-error)' : pathValidation?.valid === true ? 'rgba(52,211,153,0.4)' : 'var(--border-base)',
                              color: 'var(--text-primary)',
                            }}
                            autoFocus
                            spellCheck={false}
                          />
                        </div>
                        {canBrowse && (
                          <motion.button
                            type="button"
                            onClick={handleBrowse}
                            whileHover={shouldReduceMotion ? undefined : { scale: 1.02 }}
                            whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                            className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold flex-shrink-0 transition-all"
                            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)', color: 'var(--accent-primary)' }}
                          >
                            <Upload className="w-3.5 h-3.5" />
                            Parcourir
                          </motion.button>
                        )}
                      </div>
                      <AnimatePresence>
                        {pathValidation && !validatingPath && (
                          <motion.div
                            initial={{ opacity: 0, y: -4, height: 0 }}
                            animate={{ opacity: 1, y: 0, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className={`flex items-center gap-2 mt-2.5 px-3 py-2 rounded-lg text-xs font-medium ${pathValidation.valid ? 'text-emerald-400' : 'text-red-400'}`}
                            style={{ border: `1px solid ${pathValidation.valid ? 'rgba(52,211,153,0.2)' : 'rgba(239,68,68,0.2)'}`, backgroundColor: pathValidation.valid ? 'rgba(52,211,153,0.05)' : 'rgba(239,68,68,0.05)' }}
                          >
                            {pathValidation.valid ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                                <span>Dépôt valide{pathValidation.isGit && ` · branche ${pathValidation.gitBranch || 'main'}`}</span>
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

                    {/* Site URL */}
                    <div>
                      <AnimatePresence>
                        {showSiteUrl ? (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.18 }}
                          >
                            <label className="text-xs font-semibold block mb-2" style={{ color: 'var(--text-secondary)' }}>
                              URL du site associé <span className="font-normal" style={{ color: 'var(--text-muted)' }}>(optionnel)</span>
                            </label>
                            <div className="relative">
                              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-dimmed)' }} />
                              <input
                                type="url"
                                value={inputSiteUrl}
                                onChange={e => { setInputSiteUrl(e.target.value); setSiteUrlError(null); }}
                                placeholder="https://mon-site.com"
                                className="w-full rounded-xl border pl-10 pr-3 py-3 text-xs font-mono focus:ring-1 focus:ring-[var(--accent-primary)] outline-none transition-all"
                                style={{ backgroundColor: 'var(--bg-input)', borderColor: siteUrlError ? 'var(--color-error)' : 'var(--border-base)', color: 'var(--text-primary)' }}
                                spellCheck={false}
                              />
                            </div>
                            {siteUrlError && <p className="mt-1.5 text-xs text-red-400">{siteUrlError}</p>}
                          </motion.div>
                        ) : (
                          <button type="button" onClick={() => setShowSiteUrl(true)}
                            className="flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-70"
                            style={{ color: 'var(--accent-primary)' }}>
                            <Globe className="w-3.5 h-3.5" />
                            + Associer une URL de site ou de documentation
                          </button>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Divider */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border-base)' }} />
                      <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-dimmed)' }}>ou</span>
                      <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border-base)' }} />
                    </div>

                    {/* New workspace */}
                    {canBrowse && (
                      <motion.button
                        type="button"
                        onClick={handleCreateEmptyWorkspace}
                        disabled={loading}
                        whileHover={shouldReduceMotion ? undefined : { scale: 1.01 }}
                        whileTap={shouldReduceMotion ? undefined : { scale: 0.99 }}
                        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                        style={{
                          backgroundColor: 'var(--bg-secondary)',
                          border: '1px dashed color-mix(in srgb, var(--border-base) 80%, var(--accent-primary))',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)' }}>
                          <Plus className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                        </div>
                        <div className="text-left">
                          <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Nouveau projet vide</p>
                          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Sélectionner un dossier existant</p>
                        </div>
                      </motion.button>
                    )}
                  </motion.div>
                )}

                {/* CLONE */}
                {activeTab === 'clone' && (
                  <motion.div
                    key="clone"
                    initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -12 }}
                    transition={{ duration: 0.2 }}
                    className="px-7 py-6 space-y-5"
                  >
                    <div>
                      <label className="text-xs font-semibold block mb-2" style={{ color: 'var(--text-secondary)' }}>
                        URL du dépôt Git
                      </label>
                      <div className="relative">
                        <Github className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-dimmed)' }} />
                        <input
                          type="url"
                          value={cloneUrl}
                          onChange={e => { setCloneUrl(e.target.value); setCloneUrlError(null); }}
                          onKeyDown={e => { if (e.key === 'Enter' && cloneStatus === 'idle') handleClone(); }}
                          placeholder="https://github.com/user/repository.git"
                          disabled={cloneStatus === 'cloning'}
                          className="w-full rounded-xl border pl-10 pr-3 py-3 text-xs font-mono focus:ring-1 focus:ring-[var(--accent-primary)] outline-none disabled:opacity-50 transition-all"
                          style={{ backgroundColor: 'var(--bg-input)', borderColor: cloneUrlError ? 'var(--color-error)' : 'var(--border-base)', color: 'var(--text-primary)' }}
                          autoFocus
                          spellCheck={false}
                        />
                      </div>
                      {cloneUrlError && (
                        <p className="mt-2 text-xs text-red-400 flex items-center gap-1.5">
                          <AlertCircle className="w-3 h-3 flex-shrink-0" />{cloneUrlError}
                        </p>
                      )}
                    </div>

                    {cloneStatus === 'idle' && (
                      <div>
                        <label className="text-xs font-semibold block mb-2" style={{ color: 'var(--text-secondary)' }}>
                          Dossier de destination{' '}
                          <span className="font-normal" style={{ color: 'var(--text-muted)' }}>(optionnel — défaut: ~/Documents/Leanna-Projects)</span>
                        </label>
                        <div className="relative">
                          <FolderDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-dimmed)' }} />
                          <input
                            type="text"
                            value={cloneTargetDir}
                            onChange={e => setCloneTargetDir(e.target.value)}
                            placeholder="C:\Users\...\mes-projets"
                            className="w-full rounded-xl border pl-10 pr-3 py-3 text-xs font-mono focus:ring-1 focus:ring-[var(--accent-primary)] outline-none transition-all"
                            style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}
                            spellCheck={false}
                          />
                        </div>
                      </div>
                    )}

                    {/* Terminal log */}
                    {(cloneStatus !== 'idle' || cloneLogs.length > 0) && (
                      <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border-base)' }}>
                        <div className="flex items-center gap-2 px-4 py-2 border-b"
                          style={{ backgroundColor: 'rgba(0,0,0,0.4)', borderColor: 'rgba(255,255,255,0.05)' }}>
                          <div className="flex gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                            <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                          </div>
                          <Terminal className="w-3 h-3 ml-1" style={{ color: 'rgba(255,255,255,0.3)' }} />
                          <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>git clone</span>
                          <div className="ml-auto flex items-center gap-1.5">
                            {cloneStatus === 'cloning' && <><Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--accent-primary)' }} /><span className="text-[10px]" style={{ color: 'var(--accent-primary)' }}>En cours…</span></>}
                            {cloneStatus === 'done' && <><CheckCircle2 className="w-3 h-3 text-emerald-400" /><span className="text-[10px] text-emerald-400">Terminé</span></>}
                            {cloneStatus === 'error' && <><AlertCircle className="w-3 h-3 text-red-400" /><span className="text-[10px] text-red-400">Erreur</span></>}
                          </div>
                        </div>
                        <div className="max-h-44 overflow-y-auto p-4 space-y-0.5 font-mono text-xs leading-relaxed" style={{ backgroundColor: '#080a0f' }}>
                          {cloneLogs.map((log, i) => (
                            <div key={i} className={log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-yellow-400' : 'text-emerald-300/80'}>
                              {log.level !== 'info' && <span className="opacity-50 mr-2">[{log.level}]</span>}
                              {log.message}
                            </div>
                          ))}
                          <div ref={cloneLogsEndRef} />
                        </div>
                      </div>
                    )}

                    {/* Empty hint */}
                    {cloneStatus === 'idle' && cloneLogs.length === 0 && (
                      <div
                        className="flex items-start gap-4 p-4 rounded-2xl border"
                        style={{
                          backgroundColor: 'color-mix(in srgb, var(--accent-primary) 4%, var(--bg-secondary))',
                          borderColor: 'color-mix(in srgb, var(--accent-primary) 15%, transparent)',
                        }}
                      >
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: 'color-mix(in srgb, var(--accent-primary) 15%, transparent)' }}>
                          <GitFork className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                        </div>
                        <div>
                          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                            Cloner depuis GitHub, GitLab ou autre
                          </p>
                          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                            Le dépôt sera téléchargé et chargé automatiquement comme workspace actif.
                          </p>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

              </AnimatePresence>
            </div>

            {/* ── FOOTER ── */}
            <div
              className="flex items-center justify-between gap-4 px-7 py-4 flex-shrink-0 border-t"
              style={{ borderColor: 'color-mix(in srgb, var(--border-base) 50%, transparent)' }}
            >
              <span className="flex items-center gap-2 text-xs min-w-0" style={{ color: 'var(--text-dimmed)' }}>
                <Layers className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'color-mix(in srgb, var(--accent-primary) 60%, var(--text-dimmed))' }} />
                <span className="truncate">
                  {currentPath ? (
                    <>Actif :<span className="font-mono font-medium ml-1" style={{ color: 'var(--text-secondary)' }}>{currentPath.split(/[\\/]/).pop()}</span></>
                  ) : 'Aucun projet sélectionné'}
                </span>
              </span>

              <div className="flex items-center gap-2 flex-shrink-0">
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400"
                      style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
                    >
                      <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="max-w-[200px] truncate">{error}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {activeTab === 'open' && (
                  <motion.button
                    type="button"
                    onClick={() => handleOpenProject()}
                    disabled={loading || !inputPath.trim() || pathValidation?.valid === false}
                    whileHover={shouldReduceMotion ? undefined : { scale: 1.03 }}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-50 transition-all"
                    style={{
                      background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary, var(--accent-primary)))',
                      boxShadow: '0 4px 16px -4px color-mix(in srgb, var(--accent-primary) 50%, transparent)',
                    }}
                  >
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderInput className="w-3.5 h-3.5" />}
                    Ouvrir le projet
                  </motion.button>
                )}

                {activeTab === 'clone' && cloneStatus === 'idle' && (
                  <motion.button
                    type="button"
                    onClick={handleClone}
                    disabled={!cloneUrl.trim()}
                    whileHover={shouldReduceMotion ? undefined : { scale: 1.03 }}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-50 transition-all"
                    style={{
                      background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary, var(--accent-primary)))',
                      boxShadow: '0 4px 16px -4px color-mix(in srgb, var(--accent-primary) 50%, transparent)',
                    }}
                  >
                    <Github className="w-3.5 h-3.5" />
                    Cloner et ouvrir
                  </motion.button>
                )}

                {activeTab === 'clone' && cloneStatus === 'cloning' && (
                  <motion.button
                    type="button"
                    onClick={handleCancelClone}
                    whileHover={shouldReduceMotion ? undefined : { scale: 1.02 }}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold transition-all"
                    style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
                  >
                    <X className="w-3.5 h-3.5" />
                    Annuler
                  </motion.button>
                )}

                {activeTab === 'clone' && cloneStatus === 'error' && (
                  <motion.button
                    type="button"
                    onClick={() => { setCloneStatus('idle'); setCloneLogs([]); }}
                    whileHover={shouldReduceMotion ? undefined : { scale: 1.02 }}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold transition-all"
                    style={{ border: '1px solid var(--color-error)', color: 'var(--color-error)', backgroundColor: 'rgba(239,68,68,0.05)' }}
                  >
                    <Github className="w-3.5 h-3.5" />
                    Réessayer
                  </motion.button>
                )}

                {activeTab === 'recent' && !currentPath && (
                  <motion.button
                    type="button"
                    onClick={handleCreateEmptyWorkspace}
                    disabled={loading}
                    whileHover={shouldReduceMotion ? undefined : { scale: 1.03 }}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-50 transition-all"
                    style={{
                      background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary, var(--accent-primary)))',
                      boxShadow: '0 4px 16px -4px color-mix(in srgb, var(--accent-primary) 50%, transparent)',
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Nouveau projet
                  </motion.button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Confirmation avant de quitter l'application Electron */}
      <QuitConfirmDialog
        open={showQuitConfirm}
        onClose={() => setShowQuitConfirm(false)}
        onConfirm={handleQuitConfirm}
      />
    </AnimatePresence>
  );
}
