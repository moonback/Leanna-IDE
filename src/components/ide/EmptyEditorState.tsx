import React, {
  useState, useEffect, useMemo, useCallback, useRef,
} from 'react';
import {
  Plus, FolderOpen, FolderPlus, FileText, Clock,
  Search, KeyRound, AlertCircle,
  BookOpen, Sparkles, GitBranch, X,
  Keyboard, BrainCircuit, MessageSquare,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useWorkspaceState } from '../../hooks/useWorkspaceState.js';
import { useLiveAPIContext } from '../../context/LiveAPIContext.js';
import { useProfile } from '../../context/UserProfileContext.js';

// ─── Constantes ──────────────────────────────────────────────────────────

const MOD = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
  ? '⌘'
  : 'Ctrl';

const ENTRANCE_SPRING = { type: 'spring' as const, bounce: 0, duration: 0.4 };

const SHORTCUT_LIST = [
  {
    category: 'Général',
    items: [
      { label: 'Palette de commandes', key: `${MOD}+Shift+P` },
      { label: 'Ouvrir un fichier', key: `${MOD}+P` },
      { label: 'Nouveau fichier', key: `${MOD}+N` },
      { label: 'Nouveau dossier', key: `${MOD}+Shift+N` },
      { label: 'Assistant Leanna', key: `${MOD}+L` },
      { label: 'Paramètres', key: `${MOD}+,` },
    ],
  },
  {
    category: 'Éditeur & Code',
    items: [
      { label: 'Recherche dans le fichier', key: `${MOD}+F` },
      { label: 'Recherche globale', key: `${MOD}+Shift+F` },
      { label: 'Formater le document', key: 'Shift+Alt+F' },
      { label: 'Sauvegarder', key: `${MOD}+S` },
    ],
  },
  {
    category: 'Navigation',
    items: [
      { label: 'Explorateur de fichiers', key: `${MOD}+Shift+E` },
      { label: 'Contrôle de source / Git', key: `${MOD}+Shift+G` },
    ],
  },
];

// ─── Types ───────────────────────────────────────────────────────────────

export interface EmptyEditorStateProps {
  onOpenFile: (path: string) => void;
  onCreateFile: () => void;
  onCreateFolder: () => void;
  onShowSettings: (section?: string) => void;
  onOpenSearch?: () => void;
  onOpenChat?: () => void;
  onOpenNotebooks?: () => void;
}

interface RecentFile {
  path: string;
  language?: string;
  openedAt?: number;
}

interface GitStatusInfo {
  branch: string;
  summary: string;
  clean?: boolean;
}

// ─── Formatage temporel relatif ──────────────────────────────────────────

function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return 'À l’instant';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Il y a ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  return `Il y a ${diffDays} j`;
}

// ─── Hook animation lettre par lettre ────────────────────────────────────

function useTypewriter(text: string, active: boolean) {
  const [displayed, setDisplayed] = useState(text);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (!active) {
      setDisplayed(text);
      return;
    }

    let index = 0;
    setDisplayed('');
    intervalRef.current = setInterval(() => {
      index += 1;
      setDisplayed(text.slice(0, index));
      if (index >= text.length) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
      }
    }, 28);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active, text]);

  const isTyping = active && displayed.length < text.length;
  return { displayed, isTyping };
}

// ─── Hook pour les fichiers récents ─────────────────────────────────────

function useRecentFiles() {
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);

  const loadRecentFiles = useCallback(() => {
    try {
      const STORAGE_KEY = 'Leanna_recent_files';
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setRecentFiles(parsed.slice(0, 5));
        }
      } else {
        setRecentFiles([]);
      }
    } catch {
      setRecentFiles([]);
    }
  }, []);

  useEffect(() => {
    loadRecentFiles();
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'Leanna_recent_files') {
        loadRecentFiles();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [loadRecentFiles]);

  const clearRecent = useCallback(() => {
    try {
      localStorage.removeItem('Leanna_recent_files');
      setRecentFiles([]);
    } catch {
      // silent
    }
  }, []);

  return { recentFiles, clearRecent };
}

// ─── Hook Git réel ───────────────────────────────────────────────────────

function useGitInfo() {
  const [gitInfo, setGitInfo] = useState<GitStatusInfo | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchGit = async () => {
      try {
        const token = localStorage.getItem('Leanna_api_token');
        const headers: Record<string, string> = token ? { 'x-Leanna-token': token } : {};

        let res = await fetch('/api/git/status', { headers });
        if (!res.ok) {
          res = await fetch('/api/github/status', { headers });
        }

        if (!res.ok) {
          if (!cancelled) setGitInfo(null);
          return;
        }

        const data = await res.json();
        if (!cancelled && data && typeof data.branch === 'string' && data.branch) {
          const fileCount = Array.isArray(data.files) ? data.files.length : 0;
          setGitInfo({
            branch: data.branch,
            clean: Boolean(data.clean),
            summary: data.clean
              ? 'Dépôt propre'
              : `${fileCount} fichier${fileCount > 1 ? 's' : ''} modifié${fileCount > 1 ? 's' : ''}`,
          });
        }
      } catch {
        if (!cancelled) setGitInfo(null);
      }
    };

    void fetchGit();
    return () => {
      cancelled = true;
    };
  }, []);

  return gitInfo;
}

// ─── Hook piège de focus et touche Échap ────────────────────────────────

function useFocusTrap(isActive: boolean, onEscape?: () => void) {
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onEscape?.();
        return;
      }

      if (e.key === 'Tab') {
        const dialog = document.querySelector('[role="dialog"]') || document;
        const focusable = dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isActive, onEscape]);
}

// ─── Sous‑composants ────────────────────────────────────────────────────

const Kbd = React.memo(function Kbd({
  children,
  tone = 'default',
}: {
  children: React.ReactNode;
  tone?: 'default' | 'invert';
}) {
  if (tone === 'invert') {
    return (
      <span
        className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1.5 rounded text-xs font-mono font-semibold tracking-wide"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--primary) 18%, transparent)',
          color: 'var(--primary)',
        }}
      >
        {children}
      </span>
    );
  }
  return (
    <kbd
      className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1.5 text-xs font-mono font-semibold tracking-wide"
      style={{
        color: 'var(--text-muted)',
        backgroundColor: 'var(--surface-soft)',
        border: '1px solid var(--border)',
        borderRadius: '4px',
      }}
    >
      {children}
    </kbd>
  );
});

const CompactActionCard = React.memo(function CompactActionCard({
  icon: Icon,
  title,
  description,
  shortcut,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  title: string;
  description: string;
  shortcut?: string;
  onClick?: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className={
        'ai-interactive ai-compact-card group relative flex flex-col items-center ' +
        'gap-2.5 p-4 text-center rounded-xl overflow-hidden cursor-pointer'
      }
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        minHeight: '104px',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
      aria-describedby={`action-desc-${title.replace(/\s/g, '')}`}
      whileHover={{
        y: -3,
        scale: 1.02,
        boxShadow: '0 10px 24px color-mix(in srgb, var(--primary) 14%, transparent)',
        borderColor: 'color-mix(in srgb, var(--primary) 35%, transparent)',
      }}
      whileTap={{ scale: 0.96 }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <div
        className="absolute inset-0 rounded-xl pointer-events-none opacity-0 group-hover:opacity-100"
        style={{
          background: 'radial-gradient(circle at center, color-mix(in srgb, var(--primary) 12%, transparent) 0%, transparent 70%)',
          transition: 'opacity 0.3s ease',
        }}
      />

      <div
        className="w-9 h-9 flex items-center justify-center rounded-xl flex-shrink-0 relative"
        style={{
          backgroundColor: 'var(--surface-soft)',
          border: '1px solid color-mix(in srgb, var(--primary) 12%, transparent)',
        }}
      >
        <Icon size={16} style={{ color: 'var(--primary)' }} />
      </div>

      <div className="flex flex-col items-center gap-1">
        <div
          className="text-sm font-semibold leading-tight group-hover:text-[var(--primary)] transition-colors"
          style={{ color: 'var(--text)' }}
        >
          {title}
        </div>
        <div
          id={`action-desc-${title.replace(/\s/g, '')}`}
          className="text-xs leading-snug"
          style={{ color: 'var(--text-muted)' }}
        >
          {description}
        </div>
      </div>

      {shortcut && (
        <div className="flex-shrink-0 mt-1">
          <Kbd>{shortcut}</Kbd>
        </div>
      )}
    </motion.button>
  );
});

const QuickLink = React.memo(function QuickLink({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ai-interactive ai-quicklink flex items-center gap-1 px-2 py-1 rounded text-sm font-medium cursor-pointer"
      style={{ color: 'var(--text-muted)' }}
    >
      {label}
    </button>
  );
});

// ─── Modal Raccourcis Autonome ──────────────────────────────────────────

const InternalShortcutsModal = React.memo(function InternalShortcutsModal({
  onClose,
}: {
  onClose: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(3px)',
      }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-modal-title"
        className="w-full max-w-lg rounded-2xl p-6 relative overflow-hidden shadow-2xl"
        style={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
        }}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 mb-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'var(--surface-soft)' }}
            >
              <Keyboard size={18} style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <h2 id="shortcuts-modal-title" className="text-base font-bold" style={{ color: 'var(--text)' }}>
                Raccourcis clavier
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Commandes rapides de l'éditeur
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors hover:bg-[var(--surface-soft)] cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {SHORTCUT_LIST.map(({ category, items }) => (
            <div key={category}>
              <p
                className="text-xs font-bold uppercase tracking-wider mb-2"
                style={{ color: 'var(--text-muted)' }}
              >
                {category}
              </p>
              <div className="space-y-1.5">
                {items.map(({ label, key }) => (
                  <div
                    key={label}
                    className="flex items-center justify-between px-3 py-2 rounded-lg"
                    style={{ backgroundColor: 'var(--surface-soft)' }}
                  >
                    <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
                      {label}
                    </span>
                    <Kbd>{key}</Kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
});

// ─── Modal Système Autonome ─────────────────────────────────────────────

const InternalSystemModal = React.memo(function InternalSystemModal({
  onClose,
  connected,
  aiName,
  gitInfo,
  workspacePath,
}: {
  onClose: () => void;
  connected: boolean;
  aiName: string;
  gitInfo: GitStatusInfo | null;
  workspacePath?: string;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(3px)',
      }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="system-modal-title"
        className="w-full max-w-md rounded-2xl p-6 relative overflow-hidden shadow-2xl"
        style={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
        }}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 mb-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'var(--surface-soft)' }}
            >
              <BrainCircuit size={18} style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <h2 id="system-modal-title" className="text-base font-bold" style={{ color: 'var(--text)' }}>
                Statut système
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                État des services et du workspace
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors hover:bg-[var(--surface-soft)] cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div
            className="flex items-center justify-between p-3 rounded-xl"
            style={{ backgroundColor: 'var(--surface-soft)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: connected ? 'var(--color-success, #22c55e)' : 'var(--text-muted)' }}
              />
              <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
                IA ({aiName})
              </span>
            </div>
            <span
              className="text-xs font-semibold"
              style={{ color: connected ? 'var(--color-success, #22c55e)' : 'var(--text-muted)' }}
            >
              {connected ? 'Connectée' : 'Déconnectée'}
            </span>
          </div>

          {gitInfo && (
            <div
              className="flex items-center justify-between p-3 rounded-xl"
              style={{ backgroundColor: 'var(--surface-soft)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-2">
                <GitBranch size={13} style={{ color: 'var(--primary)' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
                  Git
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono font-medium block" style={{ color: 'var(--text)' }}>
                  {gitInfo.branch}
                </span>
                <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                  {gitInfo.summary}
                </span>
              </div>
            </div>
          )}

          {workspacePath && (
            <div
              className="flex items-center justify-between p-3 rounded-xl"
              style={{ backgroundColor: 'var(--surface-soft)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-2">
                <FolderOpen size={13} style={{ color: 'var(--primary)' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
                  Workspace
                </span>
              </div>
              <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                {workspacePath.split(/[/\\]/).pop()}
              </span>
            </div>
          )}

          <div
            className="flex items-center justify-between p-3 rounded-xl"
            style={{ backgroundColor: 'var(--surface-soft)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-2">
              <MessageSquare size={13} style={{ color: 'var(--primary)' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
                Communication
              </span>
            </div>
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Live API WebSocket & REST
            </span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
});

// ─── Styles interactifs partagés ───────────────────────────────────────

const GlobalStyles = React.memo(function GlobalStyles() {
  return (
    <style>{`
      .ai-interactive {
        transition: all 150ms ease-out;
        outline: none;
      }
      .ai-interactive:active {
        transform: scale(0.985);
        transition-duration: 60ms;
      }
      .ai-interactive:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }

      .ai-compact-card:hover {
        border-color: var(--primary);
        box-shadow: 0 6px 16px color-mix(in srgb, var(--primary) 12%, transparent);
        transform: translateY(-1px);
      }

      .ai-hero:hover {
        box-shadow: 0 10px 28px color-mix(in srgb, var(--primary) 16%, transparent);
        transform: translateY(-1px);
      }

      .ai-hero:active {
        transform: translateY(0);
      }

      .ai-quicklink:hover {
        color: var(--primary);
        background-color: var(--surface-soft);
      }

      .ai-status-dot {
        animation: pulse 2s infinite;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }

      @keyframes blink-cursor {
        0%, 100% { opacity: 1; }
        50% { opacity: 0; }
      }

      @media (prefers-reduced-motion: reduce) {
        .ai-interactive:active { transform: none; }
        .ai-status-dot { animation: none; }
      }
    `}</style>
  );
});

// ─── Composant principal ────────────────────────────────────────────────

export const EmptyEditorState = React.memo(function EmptyEditorState({
  onOpenFile,
  onCreateFile,
  onCreateFolder,
  onShowSettings,
  onOpenSearch,
  onOpenChat,
  onOpenNotebooks,
}: EmptyEditorStateProps) {
  const ws = useWorkspaceState();
  const { connected, isBusy, connect, clearTranscript, clearActivity } = useLiveAPIContext();
  const { profile } = useProfile();
  const prefersReducedMotion = useReducedMotion();

  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSystem, setShowSystem] = useState(false);
  const [ctaHovered, setCtaHovered] = useState(false);
  const [geminiStatus, setGeminiStatus] = useState<'configured' | 'invalid' | 'unconfigured' | null>(null);

  const { recentFiles, clearRecent } = useRecentFiles();
  const gitInfo = useGitInfo();

  const closeModal = useCallback(() => {
    setShowShortcuts(false);
    setShowSystem(false);
  }, []);

  useFocusTrap(showShortcuts || showSystem, closeModal);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch('/api/tokens'), fetch('/api/gemini-keys')])
      .then(async ([tokensResponse, keysResponse]) => [
        await tokensResponse.json(),
        await keysResponse.json(),
      ])
      .then(([tokensData, keysData]) => {
        if (!cancelled && tokensData.status === 'success' && keysData.status === 'success') {
          const geminiToken = tokensData.tokens?.find((token: { key: string; valid: boolean | null }) => token.key === 'GEMINI_API_KEY');
          const hasActivePoolKey = keysData.keys?.some((key: { disabled: boolean }) => !key.disabled);
          setGeminiStatus(
            geminiToken?.valid === false
              ? 'invalid'
              : geminiToken?.configured === true || hasActivePoolKey === true
                ? 'configured'
                : 'unconfigured',
          );
        }
      })
      .catch(() => {
        if (!cancelled) setGeminiStatus(null);
      });
    return () => { cancelled = true; };
  }, []);

  const ctaText = connected
    ? 'Session vocale et texte en cours'
    : 'Parlez, écrivez ou demandez quelque chose à votre assistant IA';
  const { displayed: ctaDisplayed, isTyping: ctaIsTyping } = useTypewriter(ctaText, ctaHovered);

  const aiName = profile.aiName || 'Leanna';
  const userName = profile.userName || 'Utilisateur';

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 6) return 'Bonne nuit';
    if (hour < 12) return 'Bonjour';
    if (hour < 18) return 'Bon après-midi';
    return 'Bonsoir';
  }, []);

  const makeEntranceProps = useCallback(
    (delay = 0) =>
      prefersReducedMotion
        ? {
            initial: { opacity: 0 },
            animate: { opacity: 1 },
            transition: { duration: 0.15, delay },
          }
        : {
            initial: { opacity: 0, y: 10 },
            animate: { opacity: 1, y: 0 },
            transition: { ...ENTRANCE_SPRING, delay },
          },
    [prefersReducedMotion]
  );

  const handleConnect = useCallback(() => {
    if (!connected) {
      clearTranscript();
      clearActivity();
      connect([], 'full');
    }
    onOpenChat?.();
  }, [connected, connect, onOpenChat, clearTranscript, clearActivity]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key.toLowerCase() === 'n' && !e.shiftKey) {
        e.preventDefault();
        onCreateFile();
      } else if (e.key.toLowerCase() === 'n' && e.shiftKey) {
        e.preventDefault();
        onCreateFolder();
      } else if (e.key.toLowerCase() === 'p') {
        e.preventDefault();
        onOpenSearch?.();
      } else if (e.key === ',') {
        e.preventDefault();
        onShowSettings();
      } else if (e.key.toLowerCase() === 'l') {
        e.preventDefault();
        handleConnect();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCreateFile, onCreateFolder, onOpenSearch, onShowSettings, handleConnect]);

  return (
    <div
      className="flex flex-1 flex-col overflow-y-auto relative"
      style={{ backgroundColor: 'var(--bg)' }}
    >
      <GlobalStyles />

      {/* Fond subtil */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, var(--primary) 0%, var(--primary) 12%, transparent 30%)',
          opacity: 0.03,
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 100% 100% at 50% 0%, var(--primary) 0%, transparent 40%)',
          opacity: 0.05,
        }}
      />

      {/* Contenu */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-[960px]">
          {/* NIVEAU 1 : Header et statut */}
          <motion.div
            className="mb-2 flex items-baseline gap-4"
            {...makeEntranceProps(0)}
          >
            <div className="flex flex-col gap-0">
              <span
                className="text-sm font-normal"
                style={{ color: 'var(--text-secondary)' }}
              >
                {greeting}
              </span>
              <h1
                className="text-3xl sm:text-4xl font-semibold tracking-[-0.02em] leading-tight"
                style={{ color: 'var(--text)' }}
              >
                {userName}
              </h1>
            </div>

            <div className="flex-1" />
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0 ai-status-dot"
                style={{
                  backgroundColor: connected ? 'var(--color-success, #22c55e)' : 'var(--text-muted)',
                  boxShadow: connected ? '0 0 6px var(--color-success, #22c55e)' : undefined,
                }}
              />
              <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>
                {aiName}
              </span>
              <span>
                {connected ? 'Prête' : isBusy ? 'Connexion...' : 'En attente'}
              </span>
            </div>
          </motion.div>

          {/* NIVEAU 2 : Sous-titre */}
          <motion.div
            className="mb-6"
            {...makeEntranceProps(0.04)}
          >
            <h2
              className="text-base sm:text-lg font-normal"
              style={{ color: 'var(--text-secondary)' }}
            >
              Que souhaitez-vous explorer ou développer aujourd'hui ?
            </h2>
          </motion.div>

          {/* NIVEAU 3 : CTA Leanna */}
          <motion.button
            type="button"
            onClick={handleConnect}
            onMouseEnter={() => setCtaHovered(true)}
            onMouseLeave={() => setCtaHovered(false)}
            className="ai-interactive ai-hero group w-full mx-auto flex items-center gap-4 p-5 mb-5 text-left rounded-2xl cursor-pointer"
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid color-mix(in srgb, var(--accent-secondary) 55%, transparent)',
              minHeight: '100px',
              maxWidth: '640px',
              boxShadow: '0 8px 24px color-mix(in srgb, var(--primary) 14%, transparent)',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            {...makeEntranceProps(0.08)}
            aria-label={connected ? 'Ouvrir le chat' : `Démarrer avec ${aiName}`}
            whileHover={{
              scale: 1.015,
              boxShadow: '0 14px 32px color-mix(in srgb, var(--primary) 20%, transparent)',
              borderColor: 'var(--accent-hover)',
            }}
            whileTap={{ scale: 0.98 }}
          >
            <div
              className="w-11 h-11 flex items-center justify-center rounded-xl flex-shrink-0 relative"
              style={{
                backgroundColor: 'var(--surface-soft)',
                border: '1px solid color-mix(in srgb, var(--primary) 18%, transparent)',
              }}
            >
              <Sparkles size={20} style={{ color: 'var(--primary)' }} />
            </div>

            <div className="flex-1 min-w-0">
              <div
                className="text-base font-bold leading-tight"
                style={{ color: 'var(--text)' }}
              >
                {connected ? 'Ouvrir le chat' : `Démarrer avec ${aiName}`}
              </div>
              <div
                className="text-xs sm:text-sm mt-1 leading-snug"
                style={{ color: 'var(--text-muted)' }}
              >
                {ctaDisplayed}
                {ctaIsTyping && (
                  <span
                    style={{
                      display: 'inline-block',
                      width: '1px',
                      height: '0.9em',
                      backgroundColor: 'var(--text-muted)',
                      marginLeft: '1px',
                      verticalAlign: 'text-bottom',
                      animation: 'blink-cursor 0.6s step-end infinite',
                    }}
                  />
                )}
              </div>
            </div>

            <div>
              <Kbd>{MOD}+L</Kbd>
            </div>
          </motion.button>

          {/* NIVEAU 4 : Grille d'actions rapides */}
          <motion.div
            className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5"
            {...makeEntranceProps(0.12)}
          >
            <CompactActionCard
              icon={Plus}
              title="Nouveau fichier"
              description="Créer un fichier"
              shortcut={`${MOD}+N`}
              onClick={onCreateFile}
            />
            <CompactActionCard
              icon={FolderPlus}
              title="Nouveau dossier"
              description="Créer un dossier"
              shortcut={`${MOD}+Shift+N`}
              onClick={onCreateFolder}
            />
            <CompactActionCard
              icon={Search}
              title="Rechercher"
              description="Fichiers & code"
              shortcut={`${MOD}+P`}
              onClick={onOpenSearch}
            />
            <CompactActionCard
              icon={BookOpen}
              title="Notebooks"
              description="Documentation"
              onClick={onOpenNotebooks}
            />
          </motion.div>

          {/* NIVEAU 5 : Fichiers récents */}
          {recentFiles.length > 0 && (
            <motion.div
              className="w-full mb-6 rounded-xl p-3.5"
              style={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
              {...makeEntranceProps(0.15)}
            >
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  <Clock size={13} style={{ color: 'var(--primary)' }} />
                  <span>Fichiers récents</span>
                </div>
                <button
                  type="button"
                  onClick={clearRecent}
                  className="text-xs transition-colors hover:underline cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Effacer
                </button>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {recentFiles.map((file) => {
                  const normalized = file.path.replace(/\\/g, '/');
                  const parts = normalized.split('/');
                  const fileName = parts.pop() || normalized;
                  const dirPath = parts.join('/');
                  return (
                    <button
                      key={file.path}
                      type="button"
                      onClick={() => onOpenFile(file.path)}
                      className={
                        'w-full flex items-center justify-between py-2 px-2.5 rounded-lg ' +
                        'text-left transition-colors hover:bg-[var(--surface-soft)] group cursor-pointer'
                      }
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileText size={15} style={{ color: 'var(--primary)' }} className="flex-shrink-0" />
                        <div className="truncate flex items-baseline gap-2">
                          <span className="text-sm font-medium group-hover:text-[var(--primary)] transition-colors" style={{ color: 'var(--text)' }}>
                            {fileName}
                          </span>
                          {dirPath && (
                            <span className="text-xs truncate font-mono" style={{ color: 'var(--text-muted)' }}>
                              {dirPath}
                            </span>
                          )}
                        </div>
                      </div>
                      {file.openedAt && (
                        <span className="text-xs font-mono flex-shrink-0 ml-3" style={{ color: 'var(--text-muted)' }}>
                          {formatRelativeTime(file.openedAt)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* NIVEAU 6 : Barre d'info inférieure */}
          <motion.div
            className="flex flex-wrap items-center justify-between gap-3 mt-6 pt-4"
            style={{ borderTop: '1px solid var(--border)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25, duration: prefersReducedMotion ? 0.15 : 0.35 }}
          >
            {/* Workspace & Git info */}
            <div className="flex items-center gap-3 text-sm font-mono" style={{ color: 'var(--text-muted)' }}>
              {ws.workspace ? (
                <div className="flex items-center gap-1.5" title={ws.workspace.path}>
                  <FolderOpen size={13} />
                  <span>{ws.workspace.path.split(/[/\\]/).pop()}</span>
                </div>
              ) : (
                <span>Aucun espace ouvert</span>
              )}

              {gitInfo && (
                <>
                  <span>·</span>
                  <div
                    className="flex items-center gap-1.5"
                    title={gitInfo.summary}
                    style={{ color: gitInfo.clean ? 'var(--text-muted)' : 'var(--color-warning, #f59e0b)' }}
                  >
                    <GitBranch size={13} />
                    <span>{gitInfo.branch}</span>
                    {!gitInfo.clean && (
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: 'var(--color-warning, #f59e0b)' }}
                        title="Modifications non commitées"
                      />
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Quick links */}
            <div className="flex items-center gap-1">
              {geminiStatus !== 'configured' && (
                <>
                  <button
                    type="button"
                    onClick={() => onShowSettings('tokens-settings')}
                    className="ai-interactive flex items-center gap-1.5 rounded px-2 py-1 text-sm font-medium cursor-pointer"
                    style={{
                      color: geminiStatus === 'invalid' ? 'var(--color-error, #ef4444)' : 'var(--text-muted)',
                      backgroundColor: 'var(--surface-soft)',
                      border: '1px solid var(--border)',
                    }}
                    title={geminiStatus === 'invalid'
                      ? 'Clé API invalide. Cliquez pour configurer.'
                      : 'Configurer la clé API Gemini'}
                  >
                    {geminiStatus === 'invalid' ? <AlertCircle size={13} /> : <KeyRound size={13} />}
                    <span>
                      Gemini: {geminiStatus === null ? 'Vérification…'
                        : geminiStatus === 'invalid' ? 'Clé invalide' : 'Non configurée'}
                    </span>
                  </button>
                  <span style={{ color: 'var(--text-muted)' }}>·</span>
                </>
              )}
              <QuickLink label="Raccourcis" onClick={() => setShowShortcuts(true)} />
              <span style={{ color: 'var(--text-muted)' }}>·</span>
              <QuickLink label="Système" onClick={() => setShowSystem(true)} />
            </div>
          </motion.div>
        </div>
      </div>

      {/* Modales */}
      <AnimatePresence>
        {showShortcuts && <InternalShortcutsModal onClose={() => setShowShortcuts(false)} />}
        {showSystem && (
          <InternalSystemModal
            onClose={() => setShowSystem(false)}
            connected={connected}
            aiName={aiName}
            gitInfo={gitInfo}
            workspacePath={ws.workspace?.path}
          />
        )}
      </AnimatePresence>
    </div>
  );
});
