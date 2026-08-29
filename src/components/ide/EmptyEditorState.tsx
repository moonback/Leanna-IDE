import React, {
  useState, useEffect, useMemo, useCallback,
} from 'react';
import {
  Plus, FolderOpen, FileText,
  MessageSquare, Search, ChevronRight,
  Trash2, BookOpen, Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useWorkspaceState } from '../../hooks/useWorkspaceState';
import { useLiveAPIContext } from '../../context/LiveAPIContext';
import { useProfile } from '../../context/UserProfileContext';
import { ShortcutsModal } from './ShortcutsModal';
import { SystemModal } from './SystemModal';
import { useTheme } from '../../context/ThemeContext';

// ─── Types ───────────────────────────────────────────────────────────────

interface RecentFile {
  path: string;
  language: string;
  openedAt: number;
}

// ─── Constantes ──────────────────────────────────────────────────────────

const MOD = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
  ? '⌘'
  : 'Ctrl';

const MAX_RECENT_FILES = 3;
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
      <span className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1.5 rounded text-xs font-mono font-semibold tracking-wide bg-white/15 text-white/85">
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
    <button
      type="button"
      onClick={onClick}
      className="ai-interactive ai-compact-card group relative flex flex-col items-center gap-2 p-4 text-center rounded-xl"
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        minHeight: '80px',
      }}
      aria-describedby={`action-desc-${title.replace(/\s/g, '')}`}
    >
      <div
        className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0"
        style={{ backgroundColor: 'var(--surface-soft)' }}
      >
        <Icon size={14} style={{ color: 'var(--primary)' }} />
      </div>

      <div className="flex flex-col items-center gap-0.5">
        <div className="text-sm font-semibold leading-tight" style={{ color: 'var(--text)' }}>
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
    </button>
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
      className="ai-interactive ai-quicklink flex items-center gap-1 px-2 py-1 rounded text-sm font-medium"
      style={{ color: 'var(--text-muted)' }}
    >
      {label}
    </button>
  );
});

// ─── Styles interactifs partagés ───────────────────────────────────────

function GlobalStyles() {
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
        box-shadow: 0 4px 12px rgba(21, 159, 227, 0.1);
        transform: translateY(-1px);
      }

      .ai-hero:hover {
        box-shadow: 0 8px 24px rgba(21, 159, 227, 0.15);
        transform: translateY(-1px);
      }

      .ai-hero:active {
        transform: translateY(0);
      }

      .ai-recent-row:hover {
        background-color: var(--surface-soft);
      }

      .ai-recent-row:hover .ai-recent-chevron,
      .ai-recent-row:hover .ai-recent-lang {
        opacity: 1;
      }

      .ai-quicklink:hover {
        color: var(--primary);
        background-color: var(--surface-soft);
      }

      .ai-clear-btn:hover {
        color: var(--text-muted);
        background-color: var(--surface-soft);
      }

      .ai-status-dot {
        animation: pulse 2s infinite;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }

      @media (prefers-reduced-motion: reduce) {
        .ai-interactive:active,
        .ai-recent-row:active { transform: none; }
        .ai-status-dot { animation: none; }
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
      const stored = localStorage.getItem('Leanna_recent_files');
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
    localStorage.setItem('Leanna_recent_files', JSON.stringify(sliced));
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
    localStorage.removeItem('Leanna_recent_files');
  }, []);

  const removeFile = useCallback((path: string) => {
    setFiles((prev) => {
      const updated = prev.filter((f) => f.path !== path);
      localStorage.setItem('Leanna_recent_files', JSON.stringify(updated));
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
  const userName = profile.userName || 'Utilisateur';

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 6) return 'Bonne nuit';
    if (hour < 12) return 'Bonjour';
    if (hour < 18) return 'Bon après-midi';
    return 'Bonsoir';
  }, []);

  // Props d'entrée avec spring ou fondu selon la motion réduite
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
      if (e.key.toLowerCase() === 'l') {
        e.preventDefault();
        handleConnect();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCreateFile, onShowSettings]);

  // Ouverture d'un fichier récent avec gestion d'erreur et chargement
  const handleOpenRecent = useCallback(
    async (filePath: string) => {
      if (loadingFile) return; // Évite les doubles clics
      setLoadingFile(filePath);
      try {
        const token = localStorage.getItem('Leanna_api_token');
        const headers: Record<string, string> = token ? { 'x-Leanna-token': token } : {};
        const response = await fetch(
          `/api/ide/file?${new URLSearchParams({ path: filePath })}`,
          { headers }
        );
        if (!response.ok) {
          // Fichier introuvable ou erreur, on le retire de la liste
          removeRecentFile(filePath);
          console.warn(`Fichier ${filePath} introuvable (${response.status})`);
          return;
        }
        onOpenFile(filePath);
      } catch (error) {
        console.error('Erreur lors de l\'ouverture du fichier :', error);
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
      style={{ backgroundColor: 'var(--bg)' }}
    >
      <GlobalStyles />

      {/* ── Fond subtil : dégradé bleu très léger en haut seulement ── */}
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

      {/* ── Contenu ── */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-[1000px]">
          {/* ── NIVEAU 1 : Header avec salutation premium ── */}
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
                className="text-4xl sm:text-5xl font-semibold tracking-[-0.02em] leading-tight"
                style={{ color: 'var(--text)' }}
              >
                {userName}
              </h1>
            </div>

            {/* ── NIVEAU 1 : Statut Leanna discret ── */}
            <div className="flex-1" />
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              <span 
                className="w-1.5 h-1.5 rounded-full flex-shrink-0 ai-status-dot"
                style={{
                  backgroundColor: connected ? 'var(--primary)' : 'var(--text-muted)',
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

          {/* ── NIVEAU 2 : Sous-titre principal ── */}
          <motion.div 
            className="mb-8"
            {...makeEntranceProps(0.04)}
          >
            <h2 
              className="text-lg sm:text-xl font-normal"
              style={{ color: 'var(--text-secondary)' }}
            >
              Que souhaitez-vous faire aujourd'hui ?
            </h2>
          </motion.div>

          {/* ── NIVEAU 3 : CTA principal compact premium ── */}
          <motion.button
            type="button"
            onClick={handleConnect}
            className="ai-interactive ai-hero group w-full flex items-center gap-4 p-5 mb-10 text-left rounded-[20px]"
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              height: '96px',
              minHeight: '96px',
            }}
            {...makeEntranceProps(0.08)}
            aria-label={connected ? 'Ouvrir le chat' : `Démarrer avec ${aiName}`}
          >
            <div
              className="w-10 h-10 flex items-center justify-center rounded-xl flex-shrink-0"
              style={{ backgroundColor: 'var(--surface-soft)' }}
            >
              <Sparkles size={18} style={{ color: 'var(--primary)' }} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-semibold leading-tight" style={{ color: 'var(--text)' }}>
                {connected ? 'Ouvrir le chat' : `Démarrer avec ${aiName}`}
              </div>
              <div className="text-sm mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>
                {connected ? 'Session vocale et texte en cours' : 'Parlez, écrivez ou demandez quelque chose à Leanna'}
              </div>
            </div>

            <Kbd>{MOD}+L</Kbd>
          </motion.button>

          {/* ── NIVEAU 4 : Actions secondaires compactes ── */}
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-12"
            {...makeEntranceProps(0.12)}
          >
            <CompactActionCard
              icon={Plus}
              title="Nouveau fichier"
              description="Ctrl+N"
              onClick={onCreateFile}
            />
            <CompactActionCard
              icon={Search}
              title="Rechercher"
              description="Ctrl+P"
              onClick={onOpenSearch}
            />
            <CompactActionCard
              icon={BookOpen}
              title="Notebooks"
              description="Sources et résumés"
              onClick={onOpenNotebooks}
            />
          </motion.div>

          {/* ── Fichiers récents (NIVEAU 4-5) ── */}
          {recentFiles.length > 0 && (
            <motion.div {...makeEntranceProps(0.16)}>
              <div className="flex items-center justify-between mb-4">
                <h2
                  className="text-xs font-semibold uppercase tracking-[0.08em]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Fichiers récents
                </h2>
                <button
                  onClick={clearRecentFiles}
                  className="ai-interactive ai-clear-btn flex items-center gap-1 text-sm px-2 py-1 rounded-md"
                  style={{ color: 'var(--text-muted)' }}
                  aria-label="Effacer la liste des fichiers récents"
                >
                  <Trash2 size={12} />
                  Effacer
                </button>
              </div>

              <div
                className="rounded-xl overflow-hidden"
                style={{ border: '1px solid var(--border)', backgroundColor: 'var(--surface)' }}
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
                        borderTop: index > 0 ? '1px solid var(--border)' : undefined,
                        opacity: isDisabled ? 0.6 : 1,
                      }}
                      role="listitem"
                      aria-label={`Ouvrir ${fileName} (${path})`}
                    >
                      <FileText size={13} style={{ color: 'var(--text-muted)' }} className="flex-shrink-0" />
                      <span className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                        {fileName}
                      </span>
                      <span className="text-sm font-mono truncate" style={{ color: 'var(--text-muted)' }}>
                        {dirPath}
                      </span>
                      {language && (
                        <span
                          className="ai-recent-lang ml-auto text-xs font-mono px-1.5 py-0.5 rounded opacity-0 transition-opacity flex-shrink-0"
                          style={{
                            backgroundColor: 'var(--surface-soft)',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {language}
                        </span>
                      )}
                      <ChevronRight
                        size={12}
                        className="ai-recent-chevron flex-shrink-0 opacity-0 transition-opacity"
                        style={{ color: 'var(--text-muted)' }}
                      />
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ── NIVEAU 5 : Barre d'info bas ── */}
          <motion.div
            className="flex items-center justify-between mt-8 pt-6"
            style={{ borderTop: '1px solid var(--border)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: prefersReducedMotion ? 0.15 : 0.4 }}
          >
            {/* Workspace info */}
            <div className="flex items-center gap-1.5 text-sm font-mono" style={{ color: 'var(--text-muted)' }}>
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
              <span style={{ color: 'var(--text-muted)' }}>·</span>
              <QuickLink label="Système" onClick={() => setShowSystem(true)} />
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
