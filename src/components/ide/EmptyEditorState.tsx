import React, {
  useState, useEffect, useMemo, useRef, useCallback,
} from 'react';
import {
  Plus, X, FolderOpen, FileText,
  MessageSquare, FolderPlus,
  Code2, GitBranch, BrainCircuit,
  Search, ChevronRight, Trash2,
  Command, BookOpen, Sparkles, Zap,
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

// ─── Utilitaires ─────────────────────────────────────────────────────────

const MOD = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
  ? '⌘'
  : 'Ctrl';

// Spring de base (critically damped — pas de rebond) pour toute animation
// d'apparition non pilotée par un geste. Voir §4 apple-design.
const ENTRANCE_SPRING = { type: 'spring' as const, bounce: 0, duration: 0.4 };

// ─── Feedback interactif partagé (press + focus-visible) ─────────────────
// Centralise les états :hover / :active / :focus-visible en CSS plutôt que
// de dupliquer la logique dans des handlers onMouseEnter/onMouseLeave — une
// seule source de vérité, et ça couvre aussi le clavier et le tactile.

function InteractiveFeedbackStyles() {
  return (
    <style>{`
      .ai-interactive {
        transition: transform 100ms ease-out, border-color 150ms ease-out,
          box-shadow 150ms ease-out, background-color 150ms ease-out, color 150ms ease-out;
        outline: none;
      }
      .ai-interactive:active {
        transform: scale(0.97);
        transition-duration: 60ms;
      }
      .ai-interactive:focus-visible {
        outline: 2px solid var(--accent-primary);
        outline-offset: 2px;
      }

      .ai-card:not(.ai-card-primary):hover {
        border-color: var(--border-strong);
        box-shadow: var(--shadow-sm);
      }
      .ai-card-primary:hover {
        filter: brightness(1.08);
      }
      .ai-card-primary:active {
        filter: brightness(1.02);
      }

      .ai-recent-row:hover {
        background-color: var(--ctrl-hover);
      }
      .ai-recent-row:hover .ai-recent-chevron,
      .ai-recent-row:hover .ai-recent-lang {
        opacity: 1;
      }
      .ai-recent-row:active {
        transform: scale(0.99);
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
        .ai-interactive:active { transform: none; }
        .ai-recent-row:active { transform: none; }
      }
    `}</style>
  );
}

// ─── Composant Kbd ──────────────────────────────────────────────────────

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1.5 text-[9px] font-mono font-semibold tracking-wide"
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
}

// ─── Hooks personnalisés ────────────────────────────────────────────────

function useRecentFiles(): [RecentFile[], (files: RecentFile[]) => void, () => void] {
  const [files, setFiles] = useState<RecentFile[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('jarvis_recent_files');
      if (stored) {
        const parsed = JSON.parse(stored) as RecentFile[];
        setFiles(parsed.slice(0, 5));
      }
    } catch { /* ignore */ }
  }, []);

  const updateFiles = useCallback((newFiles: RecentFile[]) => {
    setFiles(newFiles.slice(0, 5));
    localStorage.setItem('jarvis_recent_files', JSON.stringify(newFiles));
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
    localStorage.removeItem('jarvis_recent_files');
  }, []);

  return [files, updateFiles, clearFiles];
}

function useGitInfo() {
  return null;
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
  const disconnectedBg = theme === 'dark' ? disconnectedBgDark : disconnectedBgLight;
  const prefersReducedMotion = useReducedMotion();

  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSystem, setShowSystem] = useState(false);

  const [recentFiles, setRecentFiles, clearRecentFiles] = useRecentFiles();
  const gitInfo = useGitInfo();

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 6) return 'Bonne nuit';
    if (hour < 12) return 'Bonjour';
    if (hour < 18) return 'Bon après-midi';
    return 'Bonsoir';
  }, []);

  // Transition d'entrée : spring critically-damped, ou simple fondu si
  // l'utilisateur a demandé une motion réduite (§14 apple-design).
  const makeEntranceProps = useCallback(
    (delay = 0) => (
      prefersReducedMotion
        ? {
            initial: { opacity: 0 },
            animate: { opacity: 1 },
            transition: { duration: 0.15, delay },
          }
        : {
            initial: { opacity: 0, y: 12 },
            animate: { opacity: 1, y: 0 },
            transition: { ...ENTRANCE_SPRING, delay },
          }
    ),
    [prefersReducedMotion]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key.toLowerCase() === 'n') { e.preventDefault(); onCreateFile(); }
      if (e.key === ',') { e.preventDefault(); onShowSettings(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCreateFile, onShowSettings]);

  const handleOpenRecent = useCallback(
    async (filePath: string) => {
      try {
        const token = localStorage.getItem('jarvis_api_token');
        const headers: Record<string, string> = token ? { 'x-jarvis-token': token } : {};
        const response = await fetch(
          `/api/ide/file?${new URLSearchParams({ path: filePath })}`,
          { headers }
        );
        if (!response.ok) {
          const updated = recentFiles.filter((f) => f.path !== filePath);
          setRecentFiles(updated);
          return;
        }
        onOpenFile(filePath);
      } catch {
        onOpenFile(filePath);
      }
    },
    [recentFiles, setRecentFiles, onOpenFile]
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
          opacity: 0.22,
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: theme === 'dark'
            ? 'radial-gradient(ellipse 70% 55% at 50% 30%, transparent 0%, var(--bg-base) 100%)'
            : 'radial-gradient(ellipse 70% 55% at 50% 30%, transparent 0%, var(--bg-base) 100%)',
        }}
      />

      {/* ── Contenu ── */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-[940px]">

          {/* ── Header : Salutation ── */}
          <motion.div className="mb-10" {...makeEntranceProps(0)}>
            <h1
              className="text-[28px] sm:text-[34px] font-semibold tracking-[-0.025em] leading-tight"
              style={{ color: 'var(--text-primary)' }}
            >
              {profile.userName ? `${greeting}, ${profile.userName}` : greeting}
            </h1>
            <p className="mt-2 text-[14px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {connected
                ? <><span style={{ color: 'var(--color-success)' }}>●</span> {profile.aiName || 'Leanna'} est connectée et prête.</>
                : <><span style={{ color: 'var(--text-dimmed)' }}>○</span> {profile.aiName || 'Leanna'} est en attente de connexion.</>
              }
            </p>
          </motion.div>

          {/* ── Actions principales — grille 2×2 ── */}
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10"
            {...makeEntranceProps(0.08)}
          >
            {/* Chat IA */}
            <ActionCard
              icon={MessageSquare}
              title={connected ? 'Ouvrir le chat' : 'Connecter l\'IA'}
              description={connected ? 'Session vocale et texte' : 'Démarrer une session avec ' + (profile.aiName || 'l\'agent')}
              shortcut={`${MOD}+L`}
              onClick={handleConnect}
              primary
            />

            {/* Nouveau fichier */}
            <ActionCard
              icon={Plus}
              title="Nouveau fichier"
              description="Créer dans le projet actif"
              shortcut={`${MOD}+N`}
              onClick={onCreateFile}
            />

            {/* Recherche */}
            <ActionCard
              icon={Search}
              title="Rechercher"
              description="Fichiers, symboles, texte"
              shortcut={`${MOD}+P`}
              onClick={onOpenSearch}
            />

            {/* Notebooks */}
            <ActionCard
              icon={BookOpen}
              title="Notebooks"
              description="Sources, résumés, podcasts"
              onClick={onOpenNotebooks}
            />
          </motion.div>

          {/* ── Fichiers récents ── */}
          {recentFiles.length > 0 && (
            <motion.div {...makeEntranceProps(0.16)}>
              <div className="flex items-center justify-between mb-3">
                <h2
                  className="text-[11px] font-semibold uppercase tracking-[0.08em]"
                  style={{ color: 'var(--text-dimmed)' }}
                >
                  Fichiers récents
                </h2>
                <button
                  onClick={clearRecentFiles}
                  className="ai-interactive ai-clear-btn flex items-center gap-1 text-[10px] px-2 py-1 rounded-md"
                  style={{ color: 'var(--text-dimmed)' }}
                >
                  <Trash2 size={9} />
                  Effacer
                </button>
              </div>

              <div
                className="rounded-xl overflow-hidden"
                style={{ border: '1px solid var(--border-base)', backgroundColor: 'var(--bg-secondary)' }}
              >
                {recentFiles.map(({ path, language }, index) => {
                  const fileName = path.split(/[/\\]/).pop() || path;
                  const dirPath = path.split(/[/\\]/).slice(-3, -1).join('/');
                  return (
                    <button
                      key={path}
                      onClick={() => handleOpenRecent(path)}
                      className="ai-interactive ai-recent-row w-full flex items-center gap-3 px-4 py-2.5 text-left group"
                      style={{
                        borderTop: index > 0 ? '1px solid var(--border-base)' : undefined,
                      }}
                    >
                      <FileText size={13} style={{ color: 'var(--text-dimmed)' }} className="flex-shrink-0" />
                      <span className="text-[12px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {fileName}
                      </span>
                      <span className="text-[10px] font-mono truncate" style={{ color: 'var(--text-dimmed)' }}>
                        {dirPath}
                      </span>
                      {language && (
                        <span
                          className="ai-recent-lang ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded opacity-0 transition-opacity flex-shrink-0"
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
            className="flex items-center justify-between mt-10 pt-6"
            style={{ borderTop: '1px solid var(--border-base)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: prefersReducedMotion ? 0.15 : 0.4 }}
          >
            {/* Workspace info */}
            <div className="flex items-center gap-3 text-[10.5px] font-mono" style={{ color: 'var(--text-dimmed)' }}>
              {ws.workspace && (
                <span className="flex items-center gap-1.5">
                  <FolderOpen size={11} />
                  {ws.workspace.path.split(/[/\\]/).pop()}
                </span>
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

// ─── ActionCard ─────────────────────────────────────────────────────────

interface ActionCardProps {
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  title: string;
  description: string;
  shortcut?: string;
  onClick?: () => void;
  primary?: boolean;
}

function ActionCard({ icon: Icon, title, description, shortcut, onClick, primary }: ActionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`ai-interactive ai-card${primary ? ' ai-card-primary' : ''} group relative flex items-start gap-3.5 p-4 text-left rounded-xl`}
      style={{
        backgroundColor: primary ? 'var(--accent-primary)' : 'var(--bg-secondary)',
        border: primary ? 'none' : '1px solid var(--border-base)',
      }}
    >
      <div
        className="w-9 h-9 flex items-center justify-center rounded-lg flex-shrink-0"
        style={{
          backgroundColor: primary ? 'rgba(255,255,255,0.15)' : 'var(--accent-subtle)',
        }}
      >
        <Icon
          size={16}
          style={{ color: primary ? '#ffffff' : 'var(--accent-primary)' }}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div
          className="text-[12.5px] font-semibold leading-tight"
          style={{ color: primary ? '#ffffff' : 'var(--text-primary)' }}
        >
          {title}
        </div>
        <div
          className="text-[10.5px] mt-0.5 leading-snug"
          style={{ color: primary ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)' }}
        >
          {description}
        </div>
      </div>

      {shortcut && (
        <div className="flex-shrink-0 mt-0.5">
          {primary ? (
            <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-white/15 text-white/80">
              {shortcut}
            </span>
          ) : (
            <Kbd>{shortcut}</Kbd>
          )}
        </div>
      )}
    </button>
  );
}

// ─── QuickLink ──────────────────────────────────────────────────────────

function QuickLink({ label, onClick, shortcut }: { label: string; onClick: () => void; shortcut?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ai-interactive ai-quicklink flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-medium"
      style={{ color: 'var(--text-dimmed)' }}
    >
      {label}
      {shortcut && <Kbd>{shortcut}</Kbd>}
    </button>
  );
}