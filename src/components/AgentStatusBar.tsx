import { motion, useReducedMotion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import {
  Brain, Cog, ShieldCheck, Gauge, CircleDot, AlertTriangle, Clock, CheckCircle2,
  Power, Loader2, Play,
} from 'lucide-react';
import { useAgentStatus, type AgentState } from '../hooks/useAgentStatus.js';
import { useSafeguardsConfig } from '../hooks/useSafeguardsConfig.js';
import { useIdleAutonomy } from '../hooks/useIdleAutonomy.js';

/**
 * AgentStatusBar — persistent global strip (task-ui.md §4). Shows WHAT Leanna is
 * doing and WHY, across every screen, plus the current autonomy level and a
 * one-click kill-switch. The status zone navigates to the dashboard; the
 * right-hand controls act independently.
 * Hidden only when truly idle + disconnected *and* autonomy is not wired.
 */

const AUTONOMY_LABELS: Record<string, string> = {
  manual: 'Manuel',
  semi: 'Semi-autonome',
  autonomous: 'Autonome',
};

const STATE_ICON: Record<AgentState, React.FC<{ size?: number; style?: React.CSSProperties; className?: string }>> = {
  idle: CircleDot,
  thinking: Brain,
  planning: Gauge,
  executing: Cog,
  verifying: ShieldCheck,
  blocked: AlertTriangle,
  waiting: Clock,
  completed: CheckCircle2,
};

export function AgentStatusBar() {
  const reduceMotion = useReducedMotion();
  const status = useAgentStatus();
  const navigate = useNavigate();
  const { config: safeguards } = useSafeguardsConfig();
  // Lightweight polling for the global strip: we only need paused/idleWired here,
  // so keep the interval relaxed and the audit buffer minimal.
  const idle = useIdleAutonomy({ intervalMs: 15_000, auditLimit: 1 });

  const level = safeguards.autonomyLevel ?? 'manual';

  // Keep it quiet when there is nothing to say *and* no autonomy to control.
  if (!status.active && !status.connected && !idle.idleWired) return null;

  const Icon = STATE_ICON[status.state];
  const spin = status.state === 'executing' && !reduceMotion;

  return (
    <div
      className="flex w-full items-center gap-2.5 border-b px-4 py-1.5 lg:px-6"
      style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-base)' }}
    >
      {/* Status zone — click to open the dashboard */}
      <button
        type="button"
        onClick={() => navigate('/mission-control')}
        aria-label={`État de Leanna : ${status.label}. ${status.reason}. Ouvrir le tableau de bord.`}
        className="group flex min-w-0 flex-1 items-center gap-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
      >
        {/* Pulsing status dot */}
        <span className="relative flex h-2.5 w-2.5 flex-shrink-0 items-center justify-center" aria-hidden>
          {status.active && !reduceMotion && (
            <motion.span
              className="absolute inline-flex h-full w-full rounded-full"
              style={{ backgroundColor: status.color }}
              animate={{ opacity: [0.6, 0, 0.6], scale: [1, 2.2, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: status.color }} />
        </span>

        {/* State icon + label */}
        <span className="flex flex-shrink-0 items-center gap-1.5">
          <Icon size={13} style={{ color: status.color }} className={spin ? 'animate-spin' : undefined} />
          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{status.label}</span>
        </span>

        {/* Reason — the "pourquoi" */}
        <span className="min-w-0 flex-1 truncate text-xs" style={{ color: 'var(--text-muted)' }}>
          {status.reason}
        </span>

        {/* Optional step progress */}
        {typeof status.progress === 'number' && (
          <span className="flex flex-shrink-0 items-center gap-1.5">
            <span className="hidden h-1 w-20 overflow-hidden rounded-full sm:block" style={{ backgroundColor: 'var(--bg-input)' }}>
              <span className="block h-full rounded-full" style={{ width: `${Math.round(status.progress * 100)}%`, backgroundColor: status.color }} />
            </span>
            <span className="text-xs tabular-nums" style={{ color: 'var(--text-dimmed)' }}>{Math.round(status.progress * 100)}%</span>
          </span>
        )}

        {!status.connected && (
          <span className="flex-shrink-0 text-xs" style={{ color: 'var(--text-dimmed)' }}>hors ligne</span>
        )}
      </button>

      {/* Autonomy controls — level + kill-switch, independent of the status zone */}
      <div className="flex flex-shrink-0 items-center gap-2">
        {/* Current autonomy level — click to open the autonomy centre */}
        <button
          type="button"
          onClick={() => navigate('/autonomy')}
          title="Niveau d'autonomie — ouvrir le centre d'autonomie"
          className="hidden items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] sm:flex"
          style={{ color: 'var(--text-secondary)' }}
        >
          <Gauge size={12} style={{ color: 'var(--accent-primary)' }} />
          {AUTONOMY_LABELS[level] ?? level}
        </button>

        {/* Kill-switch — only when the idle autonomy loop is wired */}
        {idle.idleWired && (
          <KillSwitch paused={idle.paused} toggling={idle.toggling} onPause={idle.pause} onResume={idle.resume} />
        )}
      </div>
    </div>
  );
}

/** One-click kill-switch for the idle autonomy loop. */
function KillSwitch({ paused, toggling, onPause, onResume }: {
  paused: boolean; toggling: boolean; onPause: () => void; onResume: () => void;
}) {
  const color = paused ? 'var(--color-warning)' : 'var(--color-error)';
  const label = paused ? 'Reprendre l\u2019autonomie' : 'Suspendre l\u2019autonomie (kill-switch)';
  return (
    <button
      type="button"
      onClick={() => (paused ? onResume() : onPause())}
      disabled={toggling}
      aria-label={label}
      title={label}
      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:opacity-60"
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
      }}
    >
      {toggling ? (
        <Loader2 size={12} className="animate-spin" />
      ) : paused ? (
        <Play size={12} />
      ) : (
        <Power size={12} />
      )}
      <span className="hidden md:inline">{paused ? 'Reprendre' : 'Suspendre'}</span>
    </button>
  );
}
