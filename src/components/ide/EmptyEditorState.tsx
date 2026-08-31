import React, {
  useState, useEffect, useMemo, useCallback,
} from 'react';
import {
  Plus, FolderOpen, FileText,
  MessageSquare, Search, ChevronRight,
  Trash2, BookOpen, Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useWorkspaceState } from '../../hooks/useWorkspaceState.js';
import { useLiveAPIContext } from '../../context/LiveAPIContext.js';
import { useProfile } from '../../context/UserProfileContext.js';
import { ShortcutsModal } from './ShortcutsModal.js';
import { SystemModal } from './SystemModal.js';
import { useTheme } from '../../context/ThemeContext.js';

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

const MAX_RECENT_FILES = 2;
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
    <motion.button
      type="button"
      onClick={onClick}
      className="ai-interactive ai-compact-card group relative flex flex-col items-center gap-3 p-5 text-center rounded-xl"
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        minHeight: '96px',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
      aria-describedby={`action-desc-${title.replace(/\s/g, '')}`}
      whileHover={{
        y: -4,
        scale: 1.02,
        boxShadow: '0 8px 20px rgba(0, 194, 255, 0.1)',
        borderColor: 'rgba(0, 194, 255, 0.3)',
      }}
      whileTap={{ scale: 0.95 }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {/* Hover glow effect */}
      <div
        className="absolute inset-0 rounded-xl pointer-events-none opacity-0 group-hover:opacity-100"
        style={{
          background: 'radial-gradient(circle at center, rgba(0, 194, 255, 0.1) 0%, transparent 70%)',
          transition: 'opacity 0.3s ease',
        }}
      />

      <motion.div
        className="w-8 h-8 flex items-center justify-center rounded-xl flex-shrink-0 relative"
        style={{
          backgroundColor: 'var(--surface-soft)',
          border: '1px solid rgba(0, 194, 255, 0.1)',
        }}
        whileHover={{ scale: 1.1, rotate: 5 }}
        transition={{ duration: 0.2 }}
      >
        <Icon size={16} style={{ color: 'var(--primary)' }} />
        {/* Icon glow on hover */}
        <div
          className="absolute inset-0 rounded-xl pointer-events-none opacity-0 group-hover:opacity-100"
          style={{
            boxShadow: 'inset 0 0 8px rgba(0, 194, 255, 0.2)',
            transition: 'opacity 0.3s ease',
          }}
        />
      </motion.div>

      <div className="flex flex-col items-center gap-1">
        <motion.div
          className="text-sm font-semibold leading-tight"
          style={{ color: 'var(--text)' }}
          whileHover={{ color: 'var(--primary)' }}
          transition={{ duration: 0.2 }}
        >
          {title}
        </motion.div>
        <div
          id={`action-desc-${title.replace(/\s/g, '')}`}
          className="text-xs leading-snug"
          style={{ color: 'var(--text-muted)' }}
        >
          {description}
        </div>
      </div>

      {shortcut && (
        <motion.div
          className="flex-shrink-0 mt-2"
          initial={{ opacity: 0, scale: 0.8 }}
          whileHover={{ scale: 1.05 }}
          transition={{ duration: 0.2 }}
        >
          <Kbd>{shortcut}</Kbd>
        </motion.div>
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

          {/* ── NIVEAU 3 : CTA principal - Plus grand et centré avec identité IA ── */}
          <motion.button
            type="button"
            onClick={handleConnect}
            className="ai-interactive ai-hero group w-full mx-auto flex items-center gap-4 p-6 mb-5 text-left rounded-[22px]"
            style={{
              backgroundColor: 'var(--surface)',
              border: '2px solid var(--primary)',
              height: '112px',
              minHeight: '112px',
              maxWidth: '600px',
              boxShadow: '0 8px 24px rgba(0, 194, 255, 0.12)',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            {...makeEntranceProps(0.08)}
            aria-label={connected ? 'Ouvrir le chat' : `Démarrer avec ${aiName}`}
            whileHover={{
              scale: 1.02,
              boxShadow: '0 12px 32px rgba(0, 194, 255, 0.18)',
              borderColor: 'var(--accent-hover)',
            }}
            whileTap={{ scale: 0.98 }}
          >
            {/* Gradient background overlay for depth */}
            <div
              className="absolute inset-0 rounded-[20px] pointer-events-none"
              style={{
                background: 'linear-gradient(135deg, rgba(0, 194, 255, 0.05) 0%, rgba(255, 140, 0, 0.03) 100%)',
              }}
            />

            <div
              className="w-12 h-12 flex items-center justify-center rounded-xl flex-shrink-0 relative"
              style={{
                backgroundColor: 'var(--surface-soft)',
                border: '1px solid rgba(0, 194, 255, 0.15)',
              }}
            >
              {/* Animated icon container */}
              <motion.div
                animate={{ rotate: [0, 10, -5, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Sparkles size={20} style={{ color: 'var(--primary)' }} />
              </motion.div>
              {/* Subtle glow effect */}
              <div
                className="absolute inset-0 rounded-xl pointer-events-none"
                style={{
                  boxShadow: 'inset 0 0 12px rgba(0, 194, 255, 0.1)',
                }}
              />
            </div>

            <div className="flex-1 min-w-0">
              <motion.div
                className="text-[17px] font-bold leading-tight"
                style={{ color: 'var(--text)' }}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1, duration: 0.3 }}
              >
                {connected ? 'Ouvrir le chat' : `Démarrer avec ${aiName}`}
              </motion.div>
              <motion.div
                className="text-sm mt-1 leading-snug"
                style={{ color: 'var(--text-muted)' }}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15, duration: 0.3 }}
              >
                {connected ? 'Session vocale et texte en cours' : 'Parlez, écrivez ou demandez quelque chose à votre assistant IA'}
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 500, damping: 25 }}
            >
              <Kbd>{MOD}+L</Kbd>
            </motion.div>
          </motion.button>

          {/* ── NIVEAU 4 : Actions secondaires compactes ── */}
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5"
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
                <motion.button
                  onClick={clearRecentFiles}
                  className="ai-interactive ai-clear-btn flex items-center gap-1 text-sm px-2 py-1 rounded-md"
                  style={{ color: 'var(--text-muted)' }}
                  aria-label="Effacer la liste des fichiers récents"
                  whileHover={{ scale: 1.05, color: 'var(--primary)' }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                >
                  <Trash2 size={12} />
                  Effacer
                </motion.button>
              </div>

              <div
                className="rounded-xl overflow-hidden"
                style={{
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--surface)',
                  boxShadow: '0 2px 8px rgba(0, 194, 255, 0.03)',
                }}
                role="list"
              >
                {recentFiles.map(({ path, language }, index) => {
                  const fileName = path.split(/[/\\]/).pop() || path;
                  const dirPath = path.split(/[/\\]/).slice(-3, -1).join('/');
                  const isDisabled = loadingFile === path;
                  const fileExtension = fileName.split('.').pop()?.toLowerCase();
                  
                  // Map common extensions to specific icons (simplified for now)
                  const getFileIconColor = () => {
                    if (['js', 'ts', 'jsx', 'tsx'].includes(fileExtension || '')) return '#f7df1e';
                    if (['html', 'xml'].includes(fileExtension || '')) return '#e34f26';
                    if (['css', 'scss'].includes(fileExtension || '')) return '#1572b6';
                    if (['py'].includes(fileExtension || '')) return '#3572a5';
                    if (['json'].includes(fileExtension || '')) return '#2b91af';
                    if (['md'].includes(fileExtension || '')) return '#087fbd';
                    return 'var(--text-muted)';
                  };

                  return (
                    <motion.button
                      key={path}
                      onClick={() => handleOpenRecent(path)}
                      disabled={isDisabled}
                      className="ai-interactive ai-recent-row w-full flex items-center gap-3 px-5 py-3 text-left group"
                      style={{
                        borderTop: index > 0 ? '1px solid var(--border)' : undefined,
                        opacity: isDisabled ? 0.6 : 1,
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      }}
                      role="listitem"
                      aria-label={`Ouvrir ${fileName} (${path})`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05, duration: 0.3 }}
                      whileHover={{
                        x: 4,
                        backgroundColor: 'rgba(0, 194, 255, 0.02)',
                      }}
                    >
                      <motion.div
                        className="w-6 h-6 flex items-center justify-center rounded-md flex-shrink-0"
                        style={{
                          backgroundColor: 'var(--surface-soft)',
                          border: '1px solid rgba(0, 194, 255, 0.1)',
                        }}
                        whileHover={{ scale: 1.1 }}
                        transition={{ duration: 0.2 }}
                      >
                        <FileText size={14} style={{ color: getFileIconColor() }} />
                      </motion.div>
                      
                      <div className="flex-1 min-w-0 flex flex-col">
                        <span className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                          {fileName}
                        </span>
                        <span className="text-xs font-mono truncate" style={{ color: 'var(--text-muted)' }}>
                          {dirPath}
                        </span>
                      </div>
                      
                      {language && (
                        <span
                          className="ai-recent-lang ml-auto text-xs font-mono px-2 py-0.5 rounded-full opacity-0 transition-opacity flex-shrink-0"
                          style={{
                            backgroundColor: 'var(--surface-soft)',
                            color: 'var(--primary)',
                            border: '1px solid rgba(0, 194, 255, 0.15)',
                          }}
                        >
                          {language}
                        </span>
                      )}
                      
                      <motion.div
                        className="flex-shrink-0 opacity-0 transition-opacity"
                        style={{ color: 'var(--text-muted)' }}
                        whileHover={{ opacity: 1, x: 4 }}
                      >
                        <ChevronRight size={12} />
                      </motion.div>
                    </motion.button>
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
