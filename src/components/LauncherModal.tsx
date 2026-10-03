import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Code2, BookOpen, ArrowRight, Sparkles, FolderClock, FolderOpen, GitBranch, Loader2 } from 'lucide-react';
// @ts-ignore - Asset handled by bundler
import bgVideo from '../../assets/video.mp4';
import { ideApi } from '../services/ideApi.js';

/**
 * LauncherModal — écran de choix affiché au démarrage (après le splash).
 *
 * Permet de :
 *   - Reprendre directement le dernier projet s'il existe → active le workspace et navigue vers /ide
 *   - Ouvrir un autre projet ou créer un workspace → ouvre StartupProjectModal
 *   - Ouvrir un Notebook sans projet → active le mode sans workspace et navigue vers /notebooks
 *
 * Le choix est mémorisé pour la session (sessionStorage) afin de ne pas
 * réafficher l'écran à chaque navigation ou rechargement de route interne.
 */

/** Clé sessionStorage : le launcher a déjà été traité pour cette session. */
const LAUNCHER_DONE_KEY = 'Leanna-launcher-done';
/** Clé partagée avec StartupProjectModal — mode "sans projet" (pas de sélection de workspace). */
const NO_WORKSPACE_KEY = 'Leanna-no-workspace-mode';

const OVERLAY_FADE = { duration: 0.2 };
const CARD_SPRING = { type: 'spring' as const, bounce: 0, duration: 0.35 };

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

export function LauncherModal() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const shouldReduceMotion = useReducedMotion();
  const [isOpen, setIsOpen] = useState(false);
  const [lastWorkspace, setLastWorkspace] = useState<WorkspaceItem | null>(null);
  const [isOpeningLast, setIsOpeningLast] = useState(false);

  useEffect(() => {
    // N'afficher qu'une seule fois par session, et uniquement au tout début
    // (route racine ou /ide, qui est la cible du redirect par défaut).
    if (sessionStorage.getItem(LAUNCHER_DONE_KEY) === '1') {
      setIsOpen(false);
      return;
    }
    if (pathname === '/' || pathname === '/ide') {
      setIsOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Récupérer le dernier projet enregistré
  useEffect(() => {
    const fetchRecent = async () => {
      try {
        const res = await fetch('/api/self-root/workspaces');
        if (res.ok) {
          const data = await res.json();
          if (data?.workspaces && data.workspaces.length > 0) {
            setLastWorkspace(data.workspaces[0]);
          }
        }
      } catch {
        /* silent */
      }
    };
    fetchRecent();
  }, []);

  // Permet de rouvrir le launcher à la demande depuis n'importe où
  useEffect(() => {
    const handleReopen = () => {
      setIsOpen(true);
      fetch('/api/self-root/workspaces')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.workspaces && data.workspaces.length > 0) {
            setLastWorkspace(data.workspaces[0]);
          }
        })
        .catch(() => {});
    };
    window.addEventListener('Leanna-open-launcher', handleReopen);
    return () => window.removeEventListener('Leanna-open-launcher', handleReopen);
  }, []);

  const openLastProject = useCallback(async () => {
    if (!lastWorkspace || isOpeningLast) return;
    setIsOpeningLast(true);
    try {
      const res = await fetch('/api/self-root/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: lastWorkspace.path,
          userConfirmed: true,
          siteUrl: lastWorkspace.siteUrl || '',
        }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        sessionStorage.setItem(LAUNCHER_DONE_KEY, '1');
        sessionStorage.removeItem(NO_WORKSPACE_KEY);
        ideApi.invalidateCache();
        window.dispatchEvent(new CustomEvent('Leanna-sandbox-changed'));
        window.dispatchEvent(
          new CustomEvent('Leanna-workspace-changed', {
            detail: { workspace: data.newRoot || lastWorkspace.path },
          }),
        );
        setIsOpen(false);
        navigate('/ide');
        return;
      }
    } catch (e) {
      console.error('Erreur lors de la réouverture du dernier projet:', e);
    } finally {
      setIsOpeningLast(false);
    }

    // Si la réouverture échoue, basculer sur le sélecteur
    openWorkspaceSwitcher();
  }, [lastWorkspace, isOpeningLast, navigate]);

  const openWorkspaceSwitcher = useCallback(() => {
    sessionStorage.setItem(LAUNCHER_DONE_KEY, '1');
    sessionStorage.removeItem(NO_WORKSPACE_KEY);
    setIsOpen(false);
    navigate('/ide');
    window.dispatchEvent(new CustomEvent('Leanna-open-workspace-switcher'));
  }, [navigate]);

  const openNotebooks = useCallback(() => {
    sessionStorage.setItem(LAUNCHER_DONE_KEY, '1');
    sessionStorage.setItem(NO_WORKSPACE_KEY, '1');
    window.dispatchEvent(new CustomEvent('Leanna-no-workspace-mode'));
    setIsOpen(false);
    navigate('/notebooks');
  }, [navigate]);

  if (!isOpen) return null;

  const cardMotionProps = shouldReduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { scale: 0.96, y: 12 }, animate: { scale: 1, y: 0 }, exit: { scale: 0.96, y: 12 } };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={OVERLAY_FADE}
        className="fixed inset-0 z-[100000] flex items-center justify-center p-3 overflow-hidden"
        style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      >
        {/* ── Vidéo de fond ── */}
        <video
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          src={bgVideo}
          autoPlay
          loop
          muted
          playsInline
          aria-hidden="true"
          style={{ zIndex: 0 }}
        />
        {/* Voile sombre + flou pour garder les cartes lisibles */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundColor: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            zIndex: 0,
          }}
        />

        <motion.div
          {...cardMotionProps}
          transition={CARD_SPRING}
          role="dialog"
          aria-modal="true"
          aria-labelledby="launcher-title"
          className="relative z-[1] w-[calc(100%-24px)] max-w-5xl rounded-2xl p-6 sm:p-8 shadow-2xl flex flex-col"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--bg-panel) 72%, transparent)',
            border: '1px solid color-mix(in srgb, #fff 14%, transparent)',
            backdropFilter: 'blur(24px) saturate(140%)',
            WebkitBackdropFilter: 'blur(24px) saturate(140%)',
            boxShadow: 'inset 0 1px 0 color-mix(in srgb, #fff 16%, transparent), 0 24px 80px rgba(0, 0, 0, 0.5)',
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--accent-primary) 14%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent-secondary) 30%, transparent)',
              }}
            >
              <Sparkles className="w-5 h-5" style={{ color: 'var(--accent-secondary)' }} />
            </div>
            <div>
              <p
                className="text-xs font-bold uppercase tracking-[0.16em] mb-1"
                style={{ color: 'var(--accent-primary)' }}
              >
                Bienvenue
              </p>
              <h2
                id="launcher-title"
                className="text-lg font-bold tracking-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                Que souhaitez-vous ouvrir ?
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Choisissez votre espace de travail pour commencer.
              </p>
            </div>
          </div>

          {/* Choix */}
          <div
            className={`grid gap-4 ${
              lastWorkspace ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'
            }`}
          >
            {lastWorkspace ? (
              <>
                {/* 1. Dernier projet */}
                <LauncherCard
                  highlight
                  icon={
                    isOpeningLast ? (
                      <Loader2 className="w-5 h-5 animate-spin text-[var(--accent-primary)]" />
                    ) : (
                      <FolderClock className="w-5 h-5 text-[var(--accent-primary)]" />
                    )
                  }
                  badge="Dernier ouvert"
                  title={lastWorkspace.name || 'Dernier projet'}
                  description={lastWorkspace.path}
                  extraMeta={
                    lastWorkspace.isGit && lastWorkspace.gitBranch ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[var(--accent-secondary)] mt-1.5 opacity-90">
                        <GitBranch className="w-3 h-3" />
                        {lastWorkspace.gitBranch}
                      </span>
                    ) : undefined
                  }
                  onClick={openLastProject}
                  reduceMotion={!!shouldReduceMotion}
                />

                {/* 2. Autre projet */}
                <LauncherCard
                  icon={<FolderOpen className="w-5 h-5" />}
                  title="Autre projet / Nouveau"
                  description="Parcourir un dossier local, cloner un dépôt Git ou connecter un FTP."
                  onClick={openWorkspaceSwitcher}
                  reduceMotion={!!shouldReduceMotion}
                />

                {/* 3. Notebooks */}
                <LauncherCard
                  icon={<BookOpen className="w-5 h-5" />}
                  title="Ouvrir un Notebook"
                  description="Sources, notes, chat documentaire et génération de contenu."
                  onClick={openNotebooks}
                  reduceMotion={!!shouldReduceMotion}
                />
              </>
            ) : (
              <>
                {/* Mode par défaut si aucun projet dans l'historique */}
                <LauncherCard
                  icon={<Code2 className="w-5 h-5" />}
                  title="Ouvrir l'IDE"
                  description="Éditeur de code, terminal, agents et outils de développement."
                  onClick={openWorkspaceSwitcher}
                  reduceMotion={!!shouldReduceMotion}
                />
                <LauncherCard
                  icon={<BookOpen className="w-5 h-5" />}
                  title="Ouvrir un Notebook"
                  description="Sources, notes, chat documentaire et génération de contenu."
                  onClick={openNotebooks}
                  reduceMotion={!!shouldReduceMotion}
                />
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function LauncherCard({
  icon,
  title,
  description,
  badge,
  extraMeta,
  highlight,
  onClick,
  reduceMotion,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
  extraMeta?: React.ReactNode;
  highlight?: boolean;
  onClick: () => void;
  reduceMotion: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={reduceMotion ? undefined : { y: -3 }}
      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
      className={`group relative flex flex-col items-start justify-between gap-3 p-5 rounded-xl border text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] ${
        highlight ? 'shadow-lg' : ''
      }`}
      style={{
        backgroundColor: highlight
          ? 'color-mix(in srgb, var(--accent-primary) 10%, var(--bg-secondary))'
          : 'var(--bg-secondary)',
        borderColor: highlight
          ? 'color-mix(in srgb, var(--accent-primary) 55%, var(--border-base))'
          : 'var(--border-base)',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-primary)';
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = highlight
          ? 'color-mix(in srgb, var(--accent-primary) 16%, var(--bg-secondary))'
          : 'color-mix(in srgb, var(--accent-primary) 8%, var(--bg-secondary))';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = highlight
          ? 'color-mix(in srgb, var(--accent-primary) 55%, var(--border-base))'
          : 'var(--border-base)';
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = highlight
          ? 'color-mix(in srgb, var(--accent-primary) 10%, var(--bg-secondary))'
          : 'var(--bg-secondary)';
      }}
    >
      <div className="w-full">
        <div className="flex items-center justify-between w-full mb-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              backgroundColor: highlight
                ? 'color-mix(in srgb, var(--accent-primary) 22%, transparent)'
                : 'color-mix(in srgb, var(--accent-primary) 14%, transparent)',
              color: 'var(--accent-secondary)',
              border: '1px solid color-mix(in srgb, var(--accent-secondary) 30%, transparent)',
            }}
          >
            {icon}
          </div>

          {badge && (
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border shadow-sm"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--accent-primary) 18%, transparent)',
                borderColor: 'color-mix(in srgb, var(--accent-primary) 40%, transparent)',
                color: 'var(--accent-primary)',
              }}
            >
              {badge}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }} title={title}>
            {title}
          </h3>
          <ArrowRight
            className="w-4 h-4 opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0 flex-shrink-0"
            style={{ color: 'var(--accent-primary)' }}
          />
        </div>

        <p
          className="text-xs mt-1 leading-relaxed line-clamp-2 break-all"
          style={{ color: 'var(--text-muted)' }}
          title={description}
        >
          {description}
        </p>

        {extraMeta}
      </div>
    </motion.button>
  );
}
