import { motion } from 'motion/react';
import { Loader2, CheckCircle2, XCircle, Clock, Zap, ChevronRight, History } from 'lucide-react';
import { formatDuration, statusColor, STATUS_LABEL_FR } from './activity.js';
import type { AgentTaskEntry } from '../../stores/agentActivityStore.js';

/**
 * Carte d'agent — présentation minimaliste : nom, statut, durée, rôle technique,
 * titre, progression, résumé, dernière étape et historique dépliable.
 */
export function AgentCard({ task, isOpen, onToggle, reduceMotion }: {
  task: AgentTaskEntry; isOpen: boolean; onToggle: () => void; reduceMotion: boolean;
}) {
  const active = task.status === 'running' || task.status === 'pending';
  const hasMoreSteps = task.steps.length > 1;
  const color = statusColor(task.status);

  return (
    <motion.div initial={reduceMotion ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-[var(--radius-lg)]" style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }}>
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          {active ? <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin" style={{ color }} />
            : task.status === 'completed' ? <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--color-success)' }} />
            : <XCircle className="h-3.5 w-3.5 flex-shrink-0" style={{ color }} />}
          <span className="flex-1 truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{task.agentName}</span>
          {task.durationMs != null && (
            <span className="flex items-center gap-1 font-mono text-xs tabular-nums" style={{ color: 'var(--text-dimmed)' }} title="Durée">
              <Clock className="h-3 w-3" />{formatDuration(task.durationMs)}
            </span>
          )}
          <span className="rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide"
            style={{ backgroundColor: 'color-mix(in srgb, ' + color + ' 14%, transparent)', color }}>
            {STATUS_LABEL_FR[task.status]}
          </span>
        </div>

        <div className="mt-1.5 flex items-center gap-1.5">
          {task.role && (
            <span className="rounded-[var(--radius-xs)] px-1.5 py-px font-mono text-xs uppercase tracking-wide" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-dimmed)' }}>
              {task.role}
            </span>
          )}
          <span className="flex-1 truncate text-xs" style={{ color: 'var(--text-muted)' }}>{task.title}</span>
        </div>

        {task.progress && (
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-dimmed)' }}>
              <span className="truncate">{task.progress.label}</span>
              <span className="ml-2 font-mono tabular-nums">{task.progress.current}/{task.progress.total}</span>
            </div>
            <div className="mt-1 h-[3px] overflow-hidden rounded-full" style={{ backgroundColor: 'var(--border-base)' }}>
              <motion.div className="h-full rounded-full" style={{ backgroundColor: 'var(--color-accent-alt)' }}
                animate={{ width: `${Math.round(task.progress.current / Math.max(1, task.progress.total) * 100)}%` }} />
            </div>
          </div>
        )}

        {task.summary && <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>{task.summary}</p>}

        {task.steps.length > 0 && (
          <>
            <div className="mt-2 flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <Zap className="h-3 w-3 flex-shrink-0" style={{ color: 'var(--text-dimmed)' }} />
              <span className="flex-1 truncate text-xs" style={{ color: 'var(--text-muted)' }}>{task.steps[task.steps.length - 1]}</span>
            </div>
            {hasMoreSteps && (
              <button type="button" onClick={onToggle}
                className="mt-2 flex items-center gap-1 rounded-[var(--radius-sm)] text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)]"
                style={{ color: 'var(--text-muted)' }} aria-expanded={isOpen}>
                <ChevronRight className="h-3 w-3 transition-transform" style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }} />
                <History className="h-3 w-3" />
                {isOpen ? 'Masquer les étapes' : `Toutes les étapes (${task.steps.length})`}
              </button>
            )}
          </>
        )}
      </div>

      {isOpen && hasMoreSteps && (
        <ol className="flex flex-col gap-1.5 px-3 pb-3 pt-2.5" style={{ borderTop: '1px solid var(--border-base)' }}>
          {task.steps.map((step, i) => (
            <li key={i} className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span className="font-mono tabular-nums" style={{ color: 'var(--text-dimmed)' }}>{(i + 1).toString().padStart(2, '0')}</span>
              <span className="flex-1">{step}</span>
            </li>
          ))}
        </ol>
      )}
    </motion.div>
  );
}
