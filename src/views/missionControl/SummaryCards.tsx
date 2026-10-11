/**
 * Cartes de synthèse (Row 0) du tableau de bord — point d'entrée cliquable vers
 * les vues détaillées (Missions, Observabilité, Centre d'autonomie).
 *
 * Extrait de MissionControlView pour garder la vue d'accueil lisible.
 */
import { Milestone, BarChart2, Gauge, ChevronRight, ShieldQuestion } from 'lucide-react';
import { fmt, fmtCost } from '../../components/observability/format.js';

export interface MissionSummaryItem { id: string; title: string; status: string; paused: boolean }
export interface CostSummary { totalCost: number; totalTokens: number; totalCalls: number }

/** Statuts terminaux : une mission dans un de ces états n'est plus active. */
export const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

const AUTONOMY_LABELS: Record<string, string> = {
  manual: 'Manuel',
  semi: 'Semi-autonome',
  autonomous: 'Autonome',
};

/** Carte de synthèse cliquable : en-tête + valeur mise en avant + navigation. */
function SummaryCard({ icon: Icon, title, onOpen, children }: {
  icon: React.FC<{ size?: number; style?: React.CSSProperties }>;
  title: string; onOpen: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col gap-2 rounded-lg border p-4 text-left shadow-sm transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
      style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon size={14} style={{ color: 'var(--accent-primary)' }} />
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-primary)' }}>{title}</h2>
        </div>
        <ChevronRight size={14} style={{ color: 'var(--text-dimmed)' }} className="transition-transform group-hover:translate-x-0.5" />
      </div>
      {children}
    </button>
  );
}

export function MissionsSummaryCard({ missions, onOpen }: { missions: MissionSummaryItem[] | null; onOpen: () => void }) {
  const active = missions?.filter((m) => !TERMINAL_STATUSES.has(m.status)) ?? [];
  const paused = active.filter((m) => m.paused).length;
  const running = active.length - paused;
  return (
    <SummaryCard icon={Milestone} title="Missions" onOpen={onOpen}>
      {missions === null ? (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Chargement…</p>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{active.length}</span>
            <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>active(s)</span>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {running} en cours{paused ? ` · ${paused} en pause` : ''}
            {missions.length ? ` · ${missions.length} au total` : ' · aucune mission'}
          </p>
        </>
      )}
    </SummaryCard>
  );
}

export function CostSummaryCard({ cost, onOpen }: { cost: CostSummary | null; onOpen: () => void }) {
  return (
    <SummaryCard icon={BarChart2} title="Coûts & tokens · 24 h" onOpen={onOpen}>
      {cost === null ? (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Chargement…</p>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{fmtCost(cost.totalCost)}</span>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {fmt(cost.totalTokens)} tokens · {fmt(cost.totalCalls)} appel(s)
          </p>
        </>
      )}
    </SummaryCard>
  );
}

export function AutonomySummaryCard({ level, pendingApprovals, health, onOpen }: {
  level: string; pendingApprovals: number; health?: 'healthy' | 'degraded'; onOpen: () => void;
}) {
  const hasPending = pendingApprovals > 0;
  return (
    <SummaryCard icon={Gauge} title="Autonomie" onOpen={onOpen}>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{AUTONOMY_LABELS[level] ?? level}</span>
      </div>
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        {hasPending ? (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium" style={{ backgroundColor: 'color-mix(in srgb, var(--color-warning) 14%, transparent)', color: 'var(--color-warning)' }}>
            <ShieldQuestion size={11} /> {pendingApprovals} à valider
          </span>
        ) : (
          <span>Aucune approbation en attente</span>
        )}
        {health && <span>· santé {health === 'healthy' ? 'saine' : 'dégradée'}</span>}
      </div>
    </SummaryCard>
  );
}
