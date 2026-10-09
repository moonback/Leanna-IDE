import { useState, useEffect, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, Loader2, ChevronDown, Info, Copy, Check } from 'lucide-react';
import type { ActivityStep } from '../../hooks/useLiveAPI.js';
import { type Phase, PHASE_META } from './activityPhases.js';
import {
  type UiTransition, CatIcon, CAT_COLOR, CAT_LABEL,
  getCat, getStepStatus, stepDuration, msElapsed,
} from './activityTools.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TimelineSteps — rendu d'une étape d'outil (StepRow) et d'un groupe de phase
// repliable (PhaseSection) pour la timeline d'AgentProgressBar.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── StepRow ──────────────────────────────────────────────────────────────────

interface StepRowProps {
  step: ActivityStep;
  isLast: boolean;
  isExp: boolean;
  copiedId: string | null;
  copyFailedId: string | null;
  reduceMotion: boolean | null;
  uiSpring: UiTransition;
  onToggle: () => void;
  onCopy: (step: ActivityStep) => void | Promise<void>;
}

export const StepRow = memo(function StepRow({
  step, isLast, isExp, copiedId, copyFailedId, reduceMotion, uiSpring, onToggle, onCopy,
}: StepRowProps) {
  const status   = getStepStatus(step);
  const catColor = CAT_COLOR[getCat(step.tool)];
  const dur      = stepDuration(step);

  return (
    <div className="flex gap-1.5 min-h-[22px]">
      {/* Timeline dot + connector */}
      <div className="flex flex-col items-center flex-shrink-0 w-3 pt-[5px]">
        {status === 'running' ? (
          <Loader2 style={{ width: 9, height: 9, color: catColor }} className={reduceMotion ? '' : 'animate-spin'} />
        ) : status === 'done' ? (
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: catColor, opacity: 0.7 }} />
        ) : status === 'error' ? (
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-error)' }} />
        ) : (
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--border-base)' }} />
        )}
        {!isLast && (
          <div className="w-px flex-1 mt-0.5" style={{ backgroundColor: 'var(--border-base)', opacity: 0.35 }} />
        )}
      </div>

      {/* Content */}
      <motion.div
        className="flex-1 min-w-0 pb-1.5 cursor-pointer rounded px-1 -mx-1 hover:bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] transition-colors group"
        onClick={() => step.detail && onToggle()}
        onKeyDown={e => {
          if (step.detail && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onToggle();
          }
        }}
        tabIndex={step.detail ? 0 : -1}
        role={step.detail ? 'button' : undefined}
        aria-expanded={step.detail ? isExp : undefined}
        aria-label={step.detail ? `${step.label} — voir le détail` : undefined}
        whileTap={reduceMotion || !step.detail ? undefined : { scale: 0.99 }}
        style={status === 'error' ? {
          backgroundColor: 'color-mix(in srgb, var(--color-error) 7%, transparent)',
          boxShadow: 'inset 2px 0 0 var(--color-error)',
        } : undefined}
      >
        <div className="flex items-baseline gap-1.5 min-w-0">
          <CatIcon tool={step.tool} size={9} />
          <span
            className="text-sm flex-1 truncate leading-tight"
            style={{
              color: status === 'running' ? 'var(--text-primary)'
                : status === 'error' ? 'var(--color-error)'
                : 'var(--text-secondary)',
              fontWeight: status === 'running' || status === 'error' ? 600 : 400,
            }}
          >
            {step.label}
          </span>
          {dur
            ? <span className="text-xs tracking-wide tabular-nums font-mono flex-shrink-0" style={{ color: 'var(--text-dimmed)' }}>{dur}</span>
            : status === 'running'
              ? <span className="text-xs tracking-wide tabular-nums font-mono flex-shrink-0" style={{ color: catColor }}>{msElapsed(step.timestamp)}</span>
              : null
          }
          {step.detail && (
            <button
              onClick={e => { e.stopPropagation(); void onCopy(step); }}
              className="p-0.5 rounded flex-shrink-0 opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity"
              title={copyFailedId === step.id ? 'Échec de la copie' : 'Copier le détail'}
              aria-label={copyFailedId === step.id ? 'Échec de la copie du détail' : 'Copier le détail de l\'étape'}
              style={{ color: copiedId === step.id ? 'var(--color-success)' : copyFailedId === step.id ? 'var(--color-error)' : 'var(--text-dimmed)' }}
            >
              {copiedId === step.id
                ? <Check style={{ width: 9, height: 9 }} />
                : copyFailedId === step.id
                  ? <AlertCircle style={{ width: 9, height: 9 }} />
                  : <Copy style={{ width: 9, height: 9 }} />}
            </button>
          )}
          {step.detail && (
            <Info style={{ width: 8, height: 8, flexShrink: 0, color: 'var(--text-dimmed)' }} className="opacity-0 group-hover:opacity-60 transition-opacity" />
          )}
        </div>

        {/* Tool tag — only for non-trivial categories */}
        {getCat(step.tool) !== 'other' && (
          <span className="text-xs tracking-wide font-mono" style={{ color: catColor, opacity: 0.55 }}>
            {CAT_LABEL[getCat(step.tool)]}
          </span>
        )}

        {/* Detail expand */}
        <AnimatePresence>
          {isExp && step.detail && (
            <motion.div
              initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
              animate={reduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={uiSpring}
              className="overflow-hidden"
            >
              <pre
                className="mt-1 p-1.5 text-xs tracking-wide leading-relaxed whitespace-pre-wrap break-all font-mono rounded"
                style={{
                  color: 'var(--text-muted)',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-base)',
                }}
              >
                {step.detail}
              </pre>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
});

// ─── PhaseSection ─────────────────────────────────────────────────────────────

interface PhaseSectionProps {
  phase: Phase;
  steps: ActivityStep[];
  expandedStepId: string | null;
  copiedId: string | null;
  copyFailedId: string | null;
  reduceMotion: boolean | null;
  uiSpring: UiTransition;
  onToggleStep: (id: string) => void;
  onCopy: (step: ActivityStep) => void | Promise<void>;
}

export const PhaseSection = memo(function PhaseSection({
  phase, steps, expandedStepId, copiedId, copyFailedId, reduceMotion, uiSpring, onToggleStep, onCopy,
}: PhaseSectionProps) {
  const meta = PHASE_META[phase];
  const Icon = meta.icon;
  const running = steps.some(s => s.status === 'running');
  const errored = steps.some(s => s.status === 'error');
  const doneCount = steps.filter(s => s.status === 'done').length;

  // Repliée par défaut, SAUF si la phase travaille ou a échoué : on ne masque
  // jamais le travail en direct ni une erreur. L'utilisateur peut forcer l'état
  // à la main — on cesse alors de suivre automatiquement l'activité.
  const [open, setOpen] = useState(running || errored);
  const userToggled = useRef(false);
  useEffect(() => {
    if (!userToggled.current) setOpen(running || errored);
  }, [running, errored]);

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => { userToggled.current = true; setOpen(v => !v); }}
        className="flex items-center gap-1.5 w-full px-1 py-1 text-left rounded hover:bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] transition-colors"
        aria-expanded={open}
      >
        <Icon style={{ width: 11, height: 11, color: meta.color, flexShrink: 0 }} />
        <span className="text-xs font-semibold tracking-wide flex-1" style={{ color: 'var(--text-secondary)' }}>
          {meta.label}
        </span>
        {running ? (
          <Loader2 style={{ width: 9, height: 9, color: meta.color }} className={reduceMotion ? '' : 'animate-spin'} />
        ) : errored ? (
          <AlertCircle style={{ width: 9, height: 9, color: 'var(--color-error)' }} />
        ) : (
          <CheckCircle2 style={{ width: 9, height: 9, color: 'var(--color-success)' }} />
        )}
        <span className="text-xs font-mono tabular-nums" style={{ color: 'var(--text-dimmed)' }}>
          {doneCount}/{steps.length}
        </span>
        <ChevronDown
          style={{
            width: 10, height: 10, color: 'var(--text-dimmed)', flexShrink: 0,
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
          }}
          className="transition-transform duration-150"
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={uiSpring}
            className="overflow-hidden pl-1"
          >
            {steps.map((step, i) => (
              <StepRow
                key={step.id}
                step={step}
                isLast={i === steps.length - 1}
                isExp={expandedStepId === step.id}
                copiedId={copiedId}
                copyFailedId={copyFailedId}
                reduceMotion={reduceMotion}
                uiSpring={uiSpring}
                onToggle={() => onToggleStep(step.id)}
                onCopy={onCopy}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

// ─── FilterChip ───────────────────────────────────────────────────────────────

export const FilterChip = memo(function FilterChip({
  label, count, active, color = 'var(--text-muted)', onClick,
}: {
  label: string; count: number; active: boolean; color?: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="flex items-center gap-1 px-1.5 py-px rounded text-xs tracking-wide font-mono whitespace-nowrap flex-shrink-0 transition-colors"
      style={{
        color: active ? color : 'var(--text-muted)',
        backgroundColor: active
          ? 'color-mix(in srgb, ' + color + ' 14%, transparent)'
          : 'transparent',
        border: '1px solid ' + (active
          ? 'color-mix(in srgb, ' + color + ' 35%, transparent)'
          : 'var(--border-base)'),
      }}
    >
      <span>{label}</span>
      <span className="tabular-nums" style={{ opacity: 0.7 }}>{count}</span>
    </button>
  );
});
