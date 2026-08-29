import React, {
  useState, useEffect, useMemo, useCallback,
} from 'react';
import {
  Plus, FolderOpen, FileText,
  MessageSquare, Search, ChevronRight,
  Trash2, BookOpen,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useWorkspaceState } from '../../hooks/useWorkspaceState';
import { useLiveAPIContext } from '../../context/LiveAPIContext';
import { useProfile } from '../../context/UserProfileContext';
import { ShortcutsModal } from './ShortcutsModal';
import { SystemModal } from './SystemModal';
import { useTheme } from '../../context/ThemeContext';
// @ts-ignore — Vite handles image imports
import disconnectedBgDark from '../../../assets/images/disconnected-bg-dark.png';
// @ts-ignore
import disconnectedBgLight from '../../../assets/images/disconnected-bg-light.png';

// ─── Types ───────────────────────────────────────────────────────────────

interface RecentFile {
  path: string;
  language: string;
  openedAt: number;
}

interface GitInfo {
  branch: string;
  summary: string;
}

// ─── Constantes ──────────────────────────────────────────────────────────

const MOD = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
  ? '⌘'
  : 'Ctrl';

const MAX_RECENT_FILES = 5;
const ENTRANCE_SPRING = { type: 'spring' as const, bounce: 0, duration: 0.4 };

// ─── Validation des fichiers récents ────────────────────────────────────

function isValidRecentFiles(data: unknown): data is RecentFile[] {
  if (!Array.isArray(data)) return false;
  return data.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as RecentFile).path === 'string' &&
      typeof (item as RecentFile).language === 'string' &&
      typeof (item as RecentFile).openedAt === 'number'
  );
}

// ─── Sous‑composants (extraits et memoïsés) ────────────────────────────

const Kbd = React.memo(function Kbd({
  children,
  tone = 'default',
}: {
  children: React.ReactNode;
  tone?: 'default' | 'invert';
}) {
  if (tone === 'invert') {
    return (
      <span className="inline-flex items-center justify-center h-[19px] min-w-[19px] px-1.5 rounded text-xs font-mono font-semibold tracking-wide bg-white/15 text-white/85">
        {children}
      </span>
    );
  }
  return (
    <kbd
      className="inline-flex items-center justify-center h-[19px] min-w-[19px] px-1.5 text-xs font-mono font-semibold tracking-wide"
      style={{
        color: 'var(--text-dimmed)',
        backgroundColor: 'var(--bg-input)',
        border: '1px solid var(--border-base)',
        borderRadius: '4px',
      }}
    >
      {children}
    </kbd>
  );
});

const ActionCard = React.memo(function ActionCard({
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
    <button
      type="button"
      onClick={onClick}
      className="ai-interactive ai-card group relative flex items-start gap-3 p-4 text-left rounded-xl"
      style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)' }}
      aria-describedby={`action-desc-${title.replace(/\s/g, '')}`}
    >
      <div
        className="w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0"
        style={{ backgroundColor: 'var(--accent-subtle)' }}
      >
        <Icon size={15} style={{ color: 'var(--accent-primary)' }} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
          {title}
        </div>
        <div
          id={`action-desc-${title.replace(/\s/g, '')}`}
          className="text-sm mt-0.5 leading-snug"
          style={{ color: 'var(--text-muted)' }}
        >
          {description}
        </div>
      </div>

      {shortcut && (
        <div className="flex-shrink-0 mt-0.5">
          <Kbd>{shortcut}</Kbd>
        </div>
      )}
    </button>
  );
});

const QuickLink = React.memo(function QuickLink({
  label,
  onClick,
  shortcut,
}: {
  label: string;
  onClick: () => void;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ai-interactive ai-quicklink flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium"
      style={{ color: 'var(--text-dimmed)' }}
    >
      {label}
      {shortcut && <Kbd>{shortcut}</Kbd>}
    </button>
  );
});

// ─── Styles interactifs partagés ───────────────────────────────────────

function InteractiveFeedbackStyles() {
  return (
    <style>{`
      .ai-interactive {
        transition: transform 100ms ease-out, border-color 150ms ease-out,
          box-shadow 150ms ease-out, background-color 150ms ease-out, color 150ms ease-out;
        outline: none;
      }
      .ai-interactive:active {
        transform: scale(0.985);
        transition-duration: 60ms;
      }
      .ai-interactive:focus-visible {
        outline: 2px solid var(--accent-primary);
        outline-offset: 2px;
      }

      .ai-card:hover {
        border-color: var(--border-strong);
        box-shadow: var(--shadow-sm);
      }
      .ai-hero:hover {
        filter: brightness(1.06);
      }
      .ai-hero:active {
        filter: brightness(1.02);
      }

      .ai-recent-row:hover {
        background-color: var(--ctrl-hover);
      }
      .ai-recent-row:hover .ai-recent-chevron,
      .ai-recent-row:hover .ai-recent-lang {
        opacity: 1;
      }

      .ai-quicklink:hover {
        color: var(--accent-primary);
        background-color: var(--ctrl-hover);
      }

      .ai-clear-btn:hover {
        color: var(--text-muted);
        background-color: var(--ctrl-hover);
      }

      @media (prefers-reduced-motion: reduce) {
        .ai-interactive:active,
        .ai-recent-row:active { transform: none; }
      }
    `}</style>
  );
}

// ─── Hook personnalisé pour les fichiers récents ───────────────────────

function useRecentFiles(): [
  RecentFile[],
  (files: RecentFile[]) => void,
  () => void,
  (path: string) => void
] {
  const [files, setFiles] = useState<RecentFile[]>([]);

  // Chargement initial
  useEffect(() => {
    try {
      const stored = localStorage.getItem('jarvis_recent_files');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (isValidRecentFiles(parsed)) {
          setFiles(parsed.slice(0, MAX_RECENT_FILES));
        }
      }
    } catch {
      // Données invalides, on ignore
    }
  }, []);

  const updateFiles = useCallback((newFiles: RecentFile[]) => {
    const sliced = newFiles.slice(0, MAX_RECENT_FILES);
    setFiles(sliced);
    localStorage.setItem('jarvis_recent_files', JSON.stringify(sliced));
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
    localStorage.removeItem('jarvis_recent_files');
  }, []);

  const removeFile = useCallback((path: string) => {
    setFiles((prev) => {
      const updated = prev.filter((f) => f.path !== path);
      localStorage.setItem('jarvis_recent_files', JSON.stringify(updated));
      return updated;
    });
  }, []);

  return [files, updateFiles, clearFiles, removeFile];
}

function useGitInfo() {
  return null; // À remplacer par une vraie implémentation
}

// ─── Hook de piège de focus (pour les modales) ─────────────────────────

function useFocusTrap(isActive: boolean) {
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const focusable = document.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0] as HTMLElement;
        const last = focusable[focusable.length - 1] as HTMLElement;

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isActive]);
}

// ─── Composant principal ────────────────────────────────────────────────

interface EmptyEditorStateProps {
  onOpenFile: (path: string) => void;
  onCreateFile: () => void;
  onCreateFolder: () => void;
  onShowSettings: () => void;
  onOpenSearch?: () => void;
  onOpenChat?: () => void;
  onOpenNotebooks?: () => void;
}

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
  const { connected, isBusy, connect } = useLiveAPIContext();
  const { profile } = useProfile();
  const { theme } = useTheme();
  const prefersReducedMotion = useReducedMotion();

  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSystem, setShowSystem] = useState(false);
  const [loadingFile, setLoadingFile] = useState<string | null>(null);

  const [recentFiles, setRecentFiles, clearRecentFiles, removeRecentFile] = useRecentFiles();
  const gitInfo = useGitInfo();

  // Piège de focus pour les modales
  useFocusTrap(showShortcuts || showSystem);

  const aiName = profile.aiName || 'Leanna';

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 6) return 'Bonne nuit';
    if (hour < 12) return 'Bonjour';
    if (hour < 18) return 'Bon après-midi';
    return 'Bonsoir';
  }, []);

  // Fond selon le thème (memoïsation)
  const disconnectedBg = useMemo(
    () => (theme === 'dark' ? disconnectedBgDark : disconnectedBgLight),
    [theme]
  );

  // Props d’entrée avec spring ou fondu selon la motion réduite
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

  // Raccourcis clavier (stabilisés)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        onCreateFile();
      }
      if (e.key === ',') {
        e.preventDefault();
        onShowSettings();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCreateFile, onShowSettings]);

  // Ouverture d’un fichier récent avec gestion d’erreur et chargement
  const handleOpenRecent = useCallback(
    async (filePath: string) => {
      if (loadingFile) return; // Évite les doubles clics
      setLoadingFile(filePath);
      try {
        const token = localStorage.getItem('jarvis_api_token');
        const headers: Record<string, string> = token ? { 'x-jarvis-token': token } : {};
        const response = await fetch(
          `/api/ide/file?${new URLSearchParams({ path: filePath })}`,
          { headers }
        );
        if (!response.ok) {
          // Fichier introuvable ou erreur, on le retire de la liste
          removeRecentFile(filePath);
          // On pourrait notifier l’utilisateur ici
          console.warn(`Fichier ${filePath} introuvable (${response.status})`);
          return;
        }
        onOpenFile(filePath);
      } catch (error) {
        // Erreur réseau, on garde le fichier mais on affiche une notification
        console.error('Erreur lors de l’ouverture du fichier :', error);
        // On peut aussi tenter l’ouverture locale
        onOpenFile(filePath);
      } finally {
        setLoadingFile(null);
      }
    },
    [loadingFile, removeRecentFile, onOpenFile]
  );

  const handleConnect = useCallback(() => {
    if (!connected) connect([], 'full');
    onOpenChat?.();
  }, [connected, connect, onOpenChat]);

  return (
    <div
      className="flex flex-1 flex-col overflow-y-auto relative"
      style={{ backgroundColor: 'var(--bg-base)' }}
    >
      <InteractiveFeedbackStyles />

      {/* ── Fond subtil ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `url(${disconnectedBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          opacity: 0.8,
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 100% 100% at 20% 0%, transparent 0%, var(--bg-base) 100%)',
        }}
      />

      {/* ── Contenu ── */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-[940px]">
          {/* ── Header : Salutation + statut ── */}
          <motion.div className="mb-9 flex items-center justify-between gap-4" {...makeEntranceProps(0)}>
            <h1
              className="text-2xl sm:text-[28px] font-semibold tracking-[-0.025em] leading-tight"
              style={{ color: 'var(--text-primary)' }}
            >
              {profile.userName ? `${greeting}, ${profile.userName}` : greeting}
            </h1>

            <span
              className="hidden sm:inline-flex items-center gap-2 flex-shrink-0 rounded-full pl-2 pr-3 py-1 text-xs font-medium"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)', color: 'var(--text-secondary)' }}
              aria-live="polite"
            >
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: connected ? 'var(--color-success)' : 'var(--text-dimmed)' }}
              />
              {aiName} {connected ? 'connectée' : isBusy ? 'en cours de connexion' : 'en attente'}
            </span>
          </motion.div>

          {/* ── CTA principal : Chat IA ── */}
          <motion.button
            type="button"
            onClick={handleConnect}
            className="ai-interactive ai-hero group w-full flex items-center gap-4 p-5 mb-3 text-left rounded-2xl"
            style={{ backgroundColor: 'var(--accent-primary)', border: 'none' }}
            {...makeEntranceProps(0.06)}
            aria-label={connected ? 'Ouvrir le chat' : `Démarrer avec ${aiName}`}
          >
            <div
              className="w-11 h-11 flex items-center justify-center rounded-xl flex-shrink-0"
              style={{ backgroundColor: 'rgba(255,255,255,0.16)' }}
            >
              <MessageSquare size={19} style={{ color: '#fff' }} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-semibold leading-tight" style={{ color: '#fff' }}>
                {connected ? 'Ouvrir le chat' : `Démarrer avec ${aiName}`}
              </div>
              <div className="text-sm mt-0.5 leading-snug" style={{ color: 'rgba(255,255,255,0.72)' }}>
                {connected ? 'Session vocale et texte en cours' : 'Session vocale et texte, prête en un instant'}
              </div>
            </div>

            <Kbd tone="invert">{MOD}+L</Kbd>
          </motion.button>

          {/* ── Actions secondaires ── */}
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-10"
            {...makeEntranceProps(0.11)}
          >
            <ActionCard
              icon={Plus}
              title="Nouveau fichier"
              description="Créer dans le projet actif"
              shortcut={`${MOD}+N`}
              onClick={onCreateFile}
            />
            <ActionCard
              icon={Search}
              title="Rechercher"
              description="Fichiers, symboles, texte"
              shortcut={`${MOD}+P`}
              onClick={onOpenSearch}
            />
            <ActionCard
              icon={BookOpen}
              title="Notebooks"
              description="Sources, résumés, podcasts"
              onClick={onOpenNotebooks}
            />
          </motion.div>

          {/* ── Fichiers récents ── */}
          {recentFiles.length > 0 && (
            <motion.div {...makeEntranceProps(0.17)}>
              <div className="flex items-center justify-between mb-3">
                <h2
                  className="text-xs font-semibold uppercase tracking-[0.08em]"
                  style={{ color: 'var(--text-dimmed)' }}
                >
                  Fichiers récents
                </h2>
                <button
                  onClick={clearRecentFiles}
                  className="ai-interactive ai-clear-btn flex items-center gap-1 text-sm px-2 py-1 rounded-md"
                  style={{ color: 'var(--text-dimmed)' }}
                  aria-label="Effacer la liste des fichiers récents"
                >
                  <Trash2 size={12} />
                  Effacer
                </button>
              </div>

              <div
                className="rounded-xl overflow-hidden"
                style={{ border: '1px solid var(--border-base)', backgroundColor: 'var(--bg-secondary)' }}
                role="list"
              >
                {recentFiles.map(({ path, language }, index) => {
                  const fileName = path.split(/[/\\]/).pop() || path;
                  const dirPath = path.split(/[/\\]/).slice(-3, -1).join('/');
                  const isDisabled = loadingFile === path;
                  return (
                    <button
                      key={path}
                      onClick={() => handleOpenRecent(path)}
                      disabled={isDisabled}
                      className="ai-interactive ai-recent-row w-full flex items-center gap-3 px-4 py-2.5 text-left group"
                      style={{
                        borderTop: index > 0 ? '1px solid var(--border-base)' : undefined,
                        opacity: isDisabled ? 0.6 : 1,
                      }}
                      role="listitem"
                      aria-label={`Ouvrir ${fileName} (${path})`}
                    >
                      <FileText size={13} style={{ color: 'var(--text-dimmed)' }} className="flex-shrink-0" />
                      <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {fileName}
                      </span>
                      <span className="text-sm font-mono truncate" style={{ color: 'var(--text-dimmed)' }}>
                        {dirPath}
                      </span>
                      {language && (
                        <span
                          className="ai-recent-lang ml-auto text-xs font-mono px-1.5 py-0.5 rounded opacity-0 transition-opacity flex-shrink-0"
                          style={{
                            backgroundColor: 'var(--bg-input)',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {language}
                        </span>
                      )}
                      <ChevronRight
                        size={12}
                        className="ai-recent-chevron flex-shrink-0 opacity-0 transition-opacity"
                        style={{ color: 'var(--text-dimmed)' }}
                      />
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ── Barre d'info bas ── */}
          <motion.div
            className="flex items-center justify-between mt-11 pt-5"
            style={{ borderTop: '1px solid var(--border-base)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: prefersReducedMotion ? 0.15 : 0.4 }}
          >
            {/* Workspace info */}
            <div className="flex items-center gap-1.5 text-sm font-mono" style={{ color: 'var(--text-dimmed)' }}>
              {ws.workspace ? (
                <>
                  <FolderOpen size={11} />
                  {ws.workspace.path.split(/[/\\]/).pop()}
                </>
              ) : (
                <span>Aucun espace de travail ouvert</span>
              )}
            </div>

            {/* Quick links */}
            <div className="flex items-center gap-1">
              <QuickLink label="Raccourcis" onClick={() => setShowShortcuts(true)} />
              <QuickLink label="Système" onClick={() => setShowSystem(true)} />
              <QuickLink label="Réglages" onClick={onShowSettings} shortcut={`${MOD}+,`} />
            </div>
          </motion.div>
        </div>
      </div>

      {/* Modales */}
      <AnimatePresence>
        {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
        {showSystem && (
          <SystemModal
            onClose={() => setShowSystem(false)}
            connected={connected}
            profile={profile}
            gitInfo={gitInfo}
            workspace={ws.workspace}
          />
        )}
      </AnimatePresence>
    </div>
  );
});