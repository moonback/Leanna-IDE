import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { LoaderCircle, Check, X, Minus, Circle, ListChecks } from 'lucide-react';
import type { StartupTask } from '../../hooks/useStartupTasks.js';

const GROUP_LABELS: Record<StartupTask['group'], string> = {
  knowledge: 'Knowledge Graph',
  documents: 'Documents',
  agents: 'Agents',
  workflows: 'Workflows',
  system: 'Système',
};
const GROUP_ORDER: StartupTask['group'][] = ['knowledge', 'documents', 'agents', 'workflows', 'system'];

/** Durée d'affichage de la pastille après la fin des tâches. */
const LINGER_MS = 6000;

function fraction(t: StartupTask): number {
  if (t.status === 'done' || t.status === 'skipped') return 1;
  if (t.status === 'running' && t.total && t.total > 0) {
    return Math.min(1, (t.current ?? 0) / t.total);
  }
  return 0;
}

function formatDuration(t: StartupTask): string | null {
  if (!t.startedAt || !t.endedAt) return null;
  const ms = t.endedAt - t.startedAt;
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function StatusIcon({ status }: { status: StartupTask['status'] }) {
  switch (status) {
    case 'running':
      return <LoaderCircle size={13} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />;
    case 'done':
      return <Check size={13} style={{ color: 'var(--color-success)' }} />;
    case 'error':
      return <X size={13} style={{ color: 'var(--color-error)' }} />;
    case 'skipped':
      return <Minus size={13} style={{ color: 'var(--text-muted)' }} />;
    default:
      return <Circle size={11} style={{ color: 'var(--text-muted)' }} />;
  }
}

interface Props {
  tasks: StartupTask[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Classe de style partagée des pastilles de la barre de statut. */
  pillClassName: string;
}

/**
 * Pastille « tâches de démarrage » : visible tant que des tâches tournent (et
 * quelques secondes après), ou à la demande via le menu Outils. Un clic ouvre
 * la liste détaillée avec la progression de chaque tâche.
 */
export function StartupTasksPill({ tasks, open, onOpenChange, pillClassName }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  const running = tasks.filter(t => t.status === 'running');
  const failed = tasks.filter(t => t.status === 'error');
  const counted = tasks.filter(t => t.status !== 'skipped');
  const doneCount = counted.filter(t => t.status === 'done').length;
  const percent = counted.length
    ? Math.round((counted.reduce((sum, t) => sum + fraction(t), 0) / counted.length) * 100)
    : 0;

  // Maintient la pastille visible LINGER_MS après la dernière tâche terminée.
  const [lingering, setLingering] = useState(false);
  const wasRunning = useRef(false);
  useEffect(() => {
    if (running.length > 0) {
      wasRunning.current = true;
      setLingering(true);
      return;
    }
    if (!wasRunning.current) return;
    wasRunning.current = false;
    const timer = setTimeout(() => setLingering(false), LINGER_MS);
    return () => clearTimeout(timer);
  }, [running.length]);

  // Position de la liste : ancrée au-dessus de la pastille (coordonnées viewport).
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = rootRef.current?.getBoundingClientRect();
      if (!r) return;
      setAnchor({
        left: Math.max(8, Math.min(r.left, window.innerWidth - 360 - 8)),
        bottom: window.innerHeight - r.top + 8,
      });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  // Fermeture au clic extérieur / Échap.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      // La liste est dans un portail : elle n'est plus enfant de rootRef.
      if (rootRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  const grouped = useMemo(
    () =>
      GROUP_ORDER
        .map(group => ({ group, items: tasks.filter(t => t.group === group) }))
        .filter(g => g.items.length > 0),
    [tasks],
  );

  const visible = open || running.length > 0 || failed.length > 0 || lingering;
  if (!visible || tasks.length === 0) return null;

  const busy = running.length > 0;
  const color = failed.length > 0 && !busy
    ? 'var(--color-error)'
    : busy ? 'var(--accent-primary)' : 'var(--color-success)';
  const summary = busy
    ? `Démarrage ${percent}%`
    : failed.length > 0
      ? `${failed.length} erreur${failed.length > 1 ? 's' : ''}`
      : 'Prêt';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={pillClassName}
        style={{ color }}
        onClick={() => onOpenChange(!open)}
        title="Tâches de démarrage du projet"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {busy
          ? <LoaderCircle size={12} className="animate-spin" />
          : failed.length > 0 ? <X size={12} /> : <Check size={12} />}
        <span className="tabular-nums">{summary}</span>
      </button>

      {/* Portail sur <body> : le contexte d'empilement de la barre de statut
          faisait passer la liste derrière le contenu de la page. */}
      {createPortal(
      <AnimatePresence>
        {open && anchor && (
          <motion.div
            ref={popoverRef}
            role="dialog"
            aria-label="Tâches de démarrage"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.15 }}
            className="fixed w-[360px] max-h-[420px] overflow-y-auto rounded-lg border shadow-xl"
            style={{
              left: anchor.left,
              bottom: anchor.bottom,
              zIndex: 10001,
              // Fond opaque : --bg-secondary est translucide et laissait voir la page derrière.
              backgroundColor: 'var(--bg-base, #0b1117)',
              backdropFilter: 'blur(12px)',
              borderColor: 'var(--border-base)',
              color: 'var(--text-secondary)',
            }}
          >
            <div
              className="sticky top-0 flex items-center gap-2 px-3 py-2 text-xs font-semibold border-b"
              style={{ backgroundColor: 'var(--bg-base, #0b1117)', borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}
            >
              <ListChecks size={13} style={{ color: 'var(--accent-primary)' }} />
              <span>Tâches de démarrage</span>
              <span className="ml-auto tabular-nums font-normal" style={{ color: 'var(--text-muted)' }}>
                {doneCount} / {counted.length}
              </span>
            </div>
            <div className="h-0.5 w-full" style={{ backgroundColor: 'var(--bg-hover)' }}>
              <motion.div
                className="h-full"
                style={{ backgroundColor: color }}
                animate={{ width: `${percent}%` }}
                transition={{ type: 'spring', stiffness: 80, damping: 18 }}
              />
            </div>
            {busy && (
              <div
                className="flex items-center gap-2 px-3 py-1.5 text-xs border-b"
                style={{ borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}
              >
                <LoaderCircle size={12} className="animate-spin flex-shrink-0" style={{ color: 'var(--accent-primary)' }} />
                <span className="truncate">
                  En cours : {running.map(t => t.label).join(', ')}
                </span>
              </div>
            )}

            {grouped.map(({ group, items }) => (
              <div key={group} className="px-3 py-2">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  {GROUP_LABELS[group]}
                </div>
                <ul className="flex flex-col gap-1.5">
                  {items.map(t => {
                    const pct = Math.round(fraction(t) * 100);
                    const duration = formatDuration(t);
                    return (
                      <li key={t.id} className="text-xs">
                        <div className="flex items-center gap-2">
                          <span className="flex w-4 justify-center flex-shrink-0"><StatusIcon status={t.status} /></span>
                          <span
                            className="truncate"
                            style={{ color: t.status === 'skipped' ? 'var(--text-muted)' : 'var(--text-primary)' }}
                          >
                            {t.label}
                          </span>
                          <span className="ml-auto flex-shrink-0 tabular-nums" style={{ color: 'var(--text-muted)' }}>
                            {t.status === 'running' && t.total
                              ? `${t.current ?? 0} / ${t.total}`
                              : duration ?? ''}
                          </span>
                        </div>
                        {t.status === 'running' && t.total ? (
                          <div className="ml-6 mt-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-hover)' }}>
                            <div
                              className="h-full rounded-full transition-[width] duration-150"
                              style={{ width: `${Math.max(2, pct)}%`, backgroundColor: 'var(--accent-primary)' }}
                            />
                          </div>
                        ) : null}
                        {(t.error || t.detail) && (
                          <div
                            className="ml-6 mt-0.5 truncate"
                            title={t.error ?? t.detail}
                            style={{ color: t.error ? 'var(--color-error)' : 'var(--text-muted)' }}
                          >
                            {t.error ?? t.detail}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>,
      document.body,
      )}
    </div>
  );
}
