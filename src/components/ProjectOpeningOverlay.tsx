import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LoaderCircle, Check, X, Minus, Circle } from 'lucide-react';
import { useStartupTasks, type StartupTask } from '../hooks/useStartupTasks.js';

/** Délai avant fermeture auto une fois tout terminé (laisse voir le 100 %). */
const CLOSE_DELAY_MS = 900;
/** Sans aucune tâche détectée après la réponse serveur, on ferme au bout de ce délai. */
const NO_TASK_GRACE_MS = 2500;

function fraction(t: StartupTask): number {
  if (t.status === 'done' || t.status === 'skipped') return 1;
  if (t.status === 'running' && t.total && t.total > 0) return Math.min(1, (t.current ?? 0) / t.total);
  return 0;
}

function Icon({ status }: { status: StartupTask['status'] }) {
  if (status === 'running') return <LoaderCircle size={14} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />;
  if (status === 'done') return <Check size={14} style={{ color: 'var(--color-success)' }} />;
  if (status === 'error') return <X size={14} style={{ color: 'var(--color-error)' }} />;
  if (status === 'skipped') return <Minus size={14} style={{ color: 'var(--text-muted)' }} />;
  return <Circle size={12} style={{ color: 'var(--text-muted)' }} />;
}

/**
 * Overlay central affiché dès le clic sur « Ouvrir le projet » : suit les étapes
 * serveur (fermeture ancien projet, sandbox, MCP) puis l'indexation en arrière-plan,
 * et se ferme tout seul quand tout est terminé.
 */
export function ProjectOpeningOverlay() {
  const allTasks = useStartupTasks();
  const [visible, setVisible] = useState(false);
  const [label, setLabel] = useState<string | undefined>();
  const [openedAt, setOpenedAt] = useState(0);
  const [requestDone, setRequestDone] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [graceElapsed, setGraceElapsed] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    setVisible(false);
  }, []);

  useEffect(() => {
    const onBegin = (e: Event) => {
      const d = (e as CustomEvent).detail as { label?: string; at: number };
      if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
      setLabel(d?.label);
      // Marge de 1 s : tolère un léger décalage d'horloge client/serveur.
      setOpenedAt((d?.at ?? Date.now()) - 1000);
      setRequestDone(false);
      setRequestError(null);
      setGraceElapsed(false);
      setVisible(true);
    };
    const onEnd = (e: Event) => {
      const d = (e as CustomEvent).detail as { ok: boolean; error?: string };
      setRequestDone(true);
      if (!d?.ok) setRequestError(d?.error || "Erreur lors de l'ouverture du projet");
    };
    window.addEventListener('Leanna-project-opening', onBegin);
    window.addEventListener('Leanna-project-opened', onEnd);
    return () => {
      window.removeEventListener('Leanna-project-opening', onBegin);
      window.removeEventListener('Leanna-project-opened', onEnd);
    };
  }, []);

  // Seules les tâches lancées depuis le clic comptent (pas celles du boot).
  const tasks = useMemo(
    () => allTasks
      .filter(t => (t.startedAt ?? 0) >= openedAt || (t.status === 'skipped' && (t.endedAt ?? 0) >= openedAt))
      .sort((a, b) => (a.startedAt ?? a.endedAt ?? 0) - (b.startedAt ?? b.endedAt ?? 0)),
    [allTasks, openedAt],
  );

  const running = tasks.some(t => t.status === 'running');
  const failed = tasks.filter(t => t.status === 'error');
  const counted = tasks.filter(t => t.status !== 'skipped');
  const percent = counted.length
    ? Math.round((counted.reduce((s, t) => s + fraction(t), 0) / counted.length) * 100)
    : 0;

  useEffect(() => {
    if (!visible || !requestDone || tasks.length > 0) return;
    const t = setTimeout(() => setGraceElapsed(true), NO_TASK_GRACE_MS);
    return () => clearTimeout(t);
  }, [visible, requestDone, tasks.length]);

  const finished = visible && requestDone && !running && (tasks.length > 0 || graceElapsed);
  const hasError = !!requestError || failed.length > 0;

  // Fermeture automatique si tout s'est bien passé ; les erreurs restent affichées.
  useEffect(() => {
    if (!finished || hasError) return;
    closeTimer.current = setTimeout(close, CLOSE_DELAY_MS);
    return () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  }, [finished, hasError, close]);

  // Monotone : de nouvelles tâches qui apparaissent ne doivent pas faire reculer la barre.
  const maxPercent = useRef(0);
  if (!visible) maxPercent.current = 0;
  maxPercent.current = Math.max(maxPercent.current, percent);
  const shownPercent = finished && !hasError ? 100 : maxPercent.current;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="project-opening"
          role="dialog"
          aria-modal="true"
          aria-label="Ouverture du projet"
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 10000, backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            className="w-[460px] max-w-[92vw] rounded-2xl border p-6 shadow-2xl"
            style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-base)' }}
            initial={{ scale: 0.96, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 8 }}
          >
            <div className="flex items-center gap-3">
              {hasError
                ? <X size={20} style={{ color: 'var(--color-error)' }} />
                : finished
                  ? <Check size={20} style={{ color: 'var(--color-success)' }} />
                  : <LoaderCircle size={20} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />}
              <div className="min-w-0">
                <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                  {hasError ? "Échec de l'ouverture" : finished ? 'Projet prêt' : 'Ouverture du projet…'}
                </h2>
                {label && (
                  <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }} title={label}>{label}</p>
                )}
              </div>
              <span className="ml-auto text-sm font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                {shownPercent}%
              </span>
            </div>

            <div
              className="mt-4 h-2 w-full overflow-hidden rounded-full"
              style={{ backgroundColor: 'var(--bg-hover)' }}
              role="progressbar"
              aria-valuenow={shownPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progression de l'ouverture du projet"
            >
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: hasError ? 'var(--color-error)' : 'var(--accent-primary)' }}
                animate={{ width: `${Math.max(3, shownPercent)}%` }}
                transition={{ type: 'spring', stiffness: 80, damping: 18 }}
              />
            </div>

            <ul className="mt-4 flex max-h-[240px] flex-col gap-2 overflow-y-auto">
              {tasks.length === 0 && !requestError && (
                <li className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <LoaderCircle size={13} className="animate-spin" /> Connexion au serveur…
                </li>
              )}
              {tasks.map(t => (
                <li key={t.id} className="text-xs">
                  <div className="flex items-center gap-2">
                    <span className="flex w-4 justify-center flex-shrink-0"><Icon status={t.status} /></span>
                    <span className="truncate" style={{ color: t.status === 'skipped' ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                      {t.label}
                    </span>
                    {t.status === 'running' && t.total ? (
                      <span className="ml-auto tabular-nums" style={{ color: 'var(--text-muted)' }}>
                        {t.current ?? 0} / {t.total}
                      </span>
                    ) : null}
                  </div>
                  {t.status === 'running' && t.total ? (
                    <div className="ml-6 mt-1 h-1 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-hover)' }}>
                      <div
                        className="h-full rounded-full transition-[width] duration-150"
                        style={{ width: `${Math.max(2, Math.round(fraction(t) * 100))}%`, backgroundColor: 'var(--accent-primary)' }}
                      />
                    </div>
                  ) : null}
                  {(t.error || t.detail) && (
                    <div className="ml-6 mt-0.5 truncate" title={t.error ?? t.detail}
                      style={{ color: t.error ? 'var(--color-error)' : 'var(--text-muted)' }}>
                      {t.error ?? t.detail}
                    </div>
                  )}
                </li>
              ))}
              {requestError && (
                <li className="text-xs" style={{ color: 'var(--color-error)' }}>{requestError}</li>
              )}
            </ul>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={close}
                className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--bg-hover)]"
                style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}
              >
                {finished ? 'Fermer' : 'Continuer en arrière-plan'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
