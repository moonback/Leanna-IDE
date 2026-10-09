import { memo } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { CheckCircle2, AlertCircle, Loader2, Brain } from 'lucide-react';
import type { ReasoningState } from '../../hooks/useLiveAPI.js';

// ═══════════════════════════════════════════════════════════════════════════════
// ReasoningPanel — panneau du cycle de raisonnement (Chain/Tree of Thought),
// affiché en bas de la barre d'activité quand une stratégie est active ou a
// produit des étapes.
// ═══════════════════════════════════════════════════════════════════════════════

const COMPLEXITY_LABEL: Record<string, { label: string; color: string }> = {
  simple:   { label: 'Direct',           color: 'var(--text-muted)' },
  moderate: { label: 'Chain of Thought', color: 'var(--accent-secondary)' },
  complex:  { label: 'CoT complet',      color: 'var(--color-accent-alt)' },
  critical: { label: 'Tree-of-Thought',  color: 'var(--color-warning)' },
};

export const ReasoningPanel = memo(function ReasoningPanel({ reasoning }: { reasoning?: ReasoningState }) {
  const reduceMotion = useReducedMotion();

  if (!reasoning || (!reasoning.active && !reasoning.steps?.length)) return null;

  const meta = reasoning.complexity ? COMPLEXITY_LABEL[reasoning.complexity] : null;
  const steps = reasoning.steps ?? [];
  const doneCount = steps.filter(s => s.status === 'done').length;
  const total = reasoning.totalSteps ?? steps.length;
  const progress = total > 0 ? Math.min(100, Math.round((doneCount / total) * 100)) : reasoning.active ? 18 : 100;
  const statusLabel = reasoning.active ? 'En cours' : reasoning.cached ? 'Instantané' : 'Terminé';
  const statusColor = reasoning.active ? 'var(--color-warning)' : 'var(--color-success)';
  const streamPreview = reasoning.streamText?.trim();

  return (
    <div
      className="border-t px-3 py-2.5"
      style={{ borderColor: 'color-mix(in srgb, var(--color-accent-alt) 18%, transparent)', backgroundColor: 'color-mix(in srgb, var(--color-accent-alt) 4%, transparent)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <motion.div
          animate={reasoning.active && !reduceMotion ? { rotate: 360 } : {}}
          transition={reasoning.active && !reduceMotion ? { duration: 2, repeat: Infinity, ease: 'linear' } : {}}
        >
          <Brain style={{ width: 14, height: 14, color: 'var(--color-accent-alt)' }} />
        </motion.div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm tracking-wide font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {reasoning.strategyLabel ?? 'Raisonnement'}
            </span>
            <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: statusColor }}>
              {statusLabel}
            </span>
          </div>
          <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
            {reasoning.announcement ?? (reasoning.active ? 'Analyse des options en cours…' : 'Analyse terminée')}
          </div>
        </div>
        {meta && (
          <span
            className="text-xs tracking-wide px-1 py-px rounded font-mono"
            style={{
              backgroundColor: 'color-mix(in srgb, ' + meta.color + ' 14%, transparent)',
              color: meta.color,
              border: '1px solid color-mix(in srgb, ' + meta.color + ' 25%, transparent)'
            }}
          >
            {meta.label}
          </span>
        )}
        <span className="text-xs tracking-wide tabular-nums font-mono" style={{ color: 'var(--text-secondary)' }}>
          {total > 0 ? `${doneCount}/${total}` : `${progress}%`}
        </span>
      </div>

      <div className="mt-2 h-1 overflow-hidden rounded-full" style={{ backgroundColor: 'color-mix(in srgb, var(--text-muted) 18%, transparent)' }}>
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: reduceMotion ? 0.1 : 0.45, ease: 'easeOut' }}
          style={{ backgroundColor: statusColor }}
        />
      </div>

      {streamPreview && (
        <div className="mt-2 max-h-16 overflow-hidden rounded-md px-2 py-1.5 text-xs leading-relaxed font-mono" style={{ color: 'var(--text-secondary)', backgroundColor: 'color-mix(in srgb, var(--bg-base) 45%, transparent)', border: '1px solid color-mix(in srgb, var(--border-base) 60%, transparent)' }}>
          {streamPreview.slice(-420)}{reasoning.active ? ' ▍' : ''}
        </div>
      )}

      {/* Steps */}
      {steps.length > 0 && (
        <div className="pt-2 space-y-0.5">
          {steps.map((step) => {
            const isRun = step.status === 'running';
            const isDone = step.status === 'done';
            const isFail = step.status === 'failed';
            const color = isRun ? 'var(--color-accent-alt)' : isDone ? 'var(--color-success)' : isFail ? 'var(--color-error)' : 'var(--text-muted)';
            return (
              <div key={step.index} className="flex items-baseline gap-2">
                {isRun
                  ? <Loader2 style={{ width: 9, height: 9, color, flexShrink: 0 }} className={reduceMotion ? '' : 'animate-spin mt-px'} />
                  : isDone
                    ? <CheckCircle2 style={{ width: 9, height: 9, color, flexShrink: 0 }} className="mt-px" />
                    : isFail
                      ? <AlertCircle style={{ width: 9, height: 9, color, flexShrink: 0 }} className="mt-px" />
                      : <div className="w-1 h-1 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: color }} />
                }
                <span
                  className="text-sm tracking-wide leading-snug truncate"
                  style={{ color: isRun ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: isRun ? 600 : 400 }}
                >
                  {step.label}
                </span>
                {step.durationMs !== undefined && (
                  <span className="text-xs tracking-wide tabular-nums font-mono flex-shrink-0" style={{ color: 'var(--text-dimmed)' }}>
                    {step.durationMs < 1000 ? `${step.durationMs}ms` : `${(step.durationMs / 1000).toFixed(1)}s`}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {reasoning.active && steps.length === 0 && (
        <div className="flex items-center gap-1.5 pt-2">
          {reduceMotion ? (
            [0, 1, 2].map(i => (
              <div key={`dot-${i}`} className="w-1 h-1 rounded-full" style={{ backgroundColor: 'var(--color-accent-alt)', opacity: 0.6 }} />
            ))
          ) : (
            [0, 1, 2].map(i => (
              <motion.div
                key={`dot-${i}`}
                className="w-1 h-1 rounded-full"
                style={{ backgroundColor: 'var(--color-accent-alt)' }}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.18 }}
              />
            ))
          )}
          <span className="text-xs tracking-wide" style={{ color: 'var(--text-dimmed)' }}>Analyse…</span>
        </div>
      )}
    </div>
  );
});
