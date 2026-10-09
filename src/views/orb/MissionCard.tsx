import { motion } from 'motion/react';
import { Target, Zap, Clock, ListChecks, Loader2, ChevronRight, History } from 'lucide-react';
import { StatPill } from './StatPill.js';
import { formatDuration, formatClock, type MissionActivity } from './activity.js';

/**
 * Carte de mission — présentation minimaliste : titre, confiance (barre + %),
 * compteurs objectifs/actions/durée, objectif courant, et journal dépliable.
 */
export function MissionCard({ m, isOpen, onToggle }: { m: MissionActivity; isOpen: boolean; onToggle: () => void }) {
  const confColor = m.confidence >= 0.7 ? 'var(--color-success)' : m.confidence >= 0.4 ? 'var(--color-warning)' : 'var(--color-error)';
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)]" style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }}>
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Target className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--accent-primary)' }} />
          <span className="flex-1 truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{m.title}</span>
          <span className="font-mono text-xs font-semibold" style={{ color: confColor }}>{Math.round(m.confidence * 100)}%</span>
        </div>

        {/* Barre de confiance */}
        <div className="mt-2 h-[3px] overflow-hidden rounded-full" style={{ backgroundColor: 'var(--border-base)' }}>
          <motion.div className="h-full rounded-full" style={{ backgroundColor: confColor }}
            animate={{ width: `${Math.round(m.confidence * 100)}%` }} transition={{ type: 'spring', stiffness: 180, damping: 24 }} />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatPill icon={<ListChecks className="h-3 w-3" />} value={m.goalsCompleted} label="Objectifs terminés" color="var(--text-dimmed)" />
          <StatPill icon={<Zap className="h-3 w-3" />} value={m.actionsCompleted} label="Actions terminées" color="var(--text-dimmed)" />
          <StatPill icon={<Clock className="h-3 w-3" />} value={formatDuration(m.updatedAt - m.startedAt)} label="Durée" color="var(--text-dimmed)" />
        </div>

        {m.currentGoal && (
          <div className="mt-2 flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <Loader2 className="h-3 w-3 flex-shrink-0 animate-spin" style={{ color: 'var(--accent-primary)' }} />
            <span className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>{m.currentGoal}</span>
          </div>
        )}

        {m.log.length > 0 && (
          <button type="button" onClick={onToggle}
            className="mt-2 flex items-center gap-1 rounded-[var(--radius-sm)] text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)]"
            style={{ color: 'var(--text-muted)' }} aria-expanded={isOpen}>
            <ChevronRight className="h-3 w-3 transition-transform" style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }} />
            <History className="h-3 w-3" />
            {isOpen ? 'Masquer l\'historique' : `Historique (${m.log.length})`}
          </button>
        )}
      </div>

      {isOpen && m.log.length > 0 && (
        <ol className="flex flex-col gap-1.5 px-3 pb-3 pt-2.5" style={{ borderTop: '1px solid var(--border-base)' }}>
          {[...m.log].reverse().map((ev, i) => (
            <li key={i} className="flex items-start gap-2 text-xs">
              <span className="font-mono tabular-nums" style={{ color: 'var(--text-dimmed)' }}>{formatClock(ev.at)}</span>
              <span className="flex-1" style={{ color: 'var(--text-muted)' }}>{ev.label}</span>
              {typeof ev.confidence === 'number' && (
                <span className="font-mono font-semibold" style={{ color: 'var(--text-dimmed)' }}>{Math.round(ev.confidence * 100)}%</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
