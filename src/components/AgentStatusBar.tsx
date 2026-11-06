import { useReducedMotion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import {
  Brain, Cog, ShieldCheck, Gauge, CircleDot, AlertTriangle, Clock, CheckCircle2,
} from 'lucide-react';
import { useAgentStatus, type AgentState } from '../hooks/useAgentStatus.js';
import { ROUTES } from '../config/navigation.js';

/**
 * AgentStatusPill — ce que fait Leanna et pourquoi (task-ui.md §4).
 *
 * Auparavant une barre pleine largeur empilée au-dessus de chaque page ; c'est
 * désormais une pastille compacte dans l'en-tête unifié (<ViewHeader>), ce qui
 * rend une ligne entière à chaque page. Lecture seule, dérivée de
 * useAgentStatus ; clic → Mission Control. Masquée quand Leanna est inactive
 * ET hors ligne (rien à dire).
 */

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

export function AgentStatusPill() {
  const reduceMotion = useReducedMotion();
  const status = useAgentStatus();
  const navigate = useNavigate();

  if (!status.active && !status.connected) return null;

  const Icon = STATE_ICON[status.state];
  const spin = status.state === 'executing' && !reduceMotion;
  const pct = typeof status.progress === 'number' ? Math.round(status.progress * 100) : null;

  return (
    <button
      type="button"
      onClick={() => navigate(ROUTES.missionControl)}
      aria-label={`État de Leanna : ${status.label}. ${status.reason}. Ouvrir Mission Control.`}
      className="lea-status-pill min-w-0"
    >
      <span className="relative flex h-2 w-2 flex-shrink-0 items-center justify-center" aria-hidden>
        {status.active && !reduceMotion && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ backgroundColor: status.color }} />
        )}
        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: status.color }} />
      </span>
      <Icon size={13} style={{ color: status.color }} className={spin ? 'flex-shrink-0 animate-spin' : 'flex-shrink-0'} />
      <span className="flex-shrink-0 font-semibold" style={{ color: 'var(--text-primary)' }}>{status.label}</span>
      {status.reason && (
        <span className="lea-status-pill__reason min-w-0 truncate" style={{ color: 'var(--text-muted)' }}>{status.reason}</span>
      )}
      {pct !== null && (
        <span className="flex-shrink-0 tabular-nums" style={{ color: 'var(--text-dimmed)' }}>{pct}%</span>
      )}
      {!status.connected && (
        <span className="flex-shrink-0" style={{ color: 'var(--text-dimmed)' }}>hors ligne</span>
      )}
    </button>
  );
}
