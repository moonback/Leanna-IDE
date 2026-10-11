/**
 * IdleAutonomyPanel — monitor & control the bounded idle-work subsystem.
 *
 * Phase 3 ("autonomie encadrée"): during calm periods Leanna runs READ-ONLY
 * diagnostics bounded by a per-hour budget, a kill switch and an audit trail.
 * This panel surfaces all three:
 *   - Budget meters (actions / tokens / cost per rolling hour).
 *   - Kill switch (pause/resume) with a clear active/paused state.
 *   - A readable, append-only audit trail of self-initiated actions.
 *
 * Observational + two controls (pause/resume). Styled with the IDE design
 * tokens (var(--*)) + lucide-react, matching AutonomyView's ControlCard look.
 */

import { useMemo } from 'react';
import {
  Power, PlayCircle, PauseCircle, Activity, Coins, Hash, Gauge,
  Loader2, CheckCircle2, XCircle, AlertTriangle, Eye, Rocket, SkipForward, RefreshCw,
} from 'lucide-react';
import { useIdleAutonomy } from '../../hooks/useIdleAutonomy.js';
import type { IdleAuditEntry, IdleAuditPhase, IdleBudgetSnapshot } from '../../services/ideApi.js';

export function IdleAutonomyPanel({ enabled = true }: { enabled?: boolean }) {
  const { budget, idleWired, audit, paused, loading, error, toggling, pause, resume, refresh } = useIdleAutonomy({ enabled });

  return (
    <div className="flex flex-col gap-4">
      {/* ── Kill switch + status ────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between gap-3 rounded-lg border p-3"
        style={{
          borderColor: paused
            ? 'color-mix(in srgb, var(--color-warning) 30%, transparent)'
            : 'color-mix(in srgb, var(--color-success) 25%, transparent)',
          backgroundColor: paused
            ? 'color-mix(in srgb, var(--color-warning) 8%, transparent)'
            : 'color-mix(in srgb, var(--color-success) 8%, transparent)',
        }}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <Power
            size={16}
            style={{ color: paused ? 'var(--color-warning)' : 'var(--color-success)' }}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {paused ? 'Travail autonome en pause' : 'Travail autonome actif'}
            </p>
            <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
              {idleWired
                ? paused
                  ? 'Aucune tâche en lecture seule ne sera lancée pendant les périodes calmes.'
                  : 'Diagnostics en lecture seule lancés pendant les périodes calmes, dans la limite du budget.'
                : 'Travail idle non activé (aucun runner câblé ou budget désactivé).'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void (paused ? resume() : pause())}
          disabled={toggling || !idleWired}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50"
          style={{
            color: paused ? 'var(--color-success)' : 'var(--color-warning)',
            backgroundColor: paused
              ? 'color-mix(in srgb, var(--color-success) 12%, transparent)'
              : 'color-mix(in srgb, var(--color-warning) 12%, transparent)',
            border: `1px solid ${paused
              ? 'color-mix(in srgb, var(--color-success) 30%, transparent)'
              : 'color-mix(in srgb, var(--color-warning) 30%, transparent)'}`,
          }}
          title={paused ? 'Reprendre le travail autonome' : 'Kill switch — mettre en pause'}
        >
          {toggling ? <Loader2 size={13} className="animate-spin" /> : paused ? <PlayCircle size={13} /> : <PauseCircle size={13} />}
          {paused ? 'Reprendre' : 'Mettre en pause'}
        </button>
      </div>

      {error && (
        <p className="text-xs" style={{ color: 'var(--color-error)' }}>
          Impossible de charger l'état du travail autonome : {error}
        </p>
      )}

      {/* ── Budget meters (consommation autonome GLOBALE) ──────────────── */}
      {budget && <BudgetMeters budget={budget} />}

      {/* ── Audit trail ────────────────────────────────────────────────── */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-secondary)' }}>
            Journal d'audit
          </h3>
          <button
            type="button"
            onClick={refresh}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs transition hover:opacity-80"
            style={{ color: 'var(--text-muted)' }}
            title="Rafraîchir"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : undefined} />
            Rafraîchir
          </button>
        </div>
        <AuditTrail entries={audit} loading={loading} />
      </div>
    </div>
  );
}

// ─── Budget meters ───────────────────────────────────────────────────────────

function BudgetMeters({ budget }: { budget: IdleBudgetSnapshot }) {
  const windowLabel = useMemo(() => {
    const minutes = Math.round(budget.windowMs / 60_000);
    return minutes >= 60 ? `${Math.round(minutes / 60)} h` : `${minutes} min`;
  }, [budget.windowMs]);

  return (
    <div>
      <h3 className="mb-0.5 text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-secondary)' }}>
        Budget autonomie (fenêtre glissante : {windowLabel})
      </h3>
      <p className="mb-2 text-[11px]" style={{ color: 'var(--text-dimmed)' }}>
        Consommation réelle de toute l'activité autonome (diagnostics en période calme
        + missions d'anticipation/exécutive), mesurée sur l'heure glissante.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Meter
          icon={Activity}
          label="Actions"
          used={budget.actions.used}
          max={budget.actions.max}
          format={(n) => String(n)}
        />
        <Meter
          icon={Hash}
          label="Tokens"
          used={budget.tokens.used}
          max={budget.tokens.max}
          format={formatCompact}
        />
        <Meter
          icon={Coins}
          label="Coût"
          used={budget.costUsd.used}
          max={budget.costUsd.max}
          format={(n) => `$${n.toFixed(n < 1 ? 4 : 2)}`}
        />
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-dimmed)' }}>
        <Gauge size={11} />
        Plafond par mission : {formatCompact(budget.perMission.maxTokens)} tokens · ${budget.perMission.maxCostUsd.toFixed(2)}
      </p>
    </div>
  );
}

function Meter({
  icon: Icon, label, used, max, format,
}: {
  icon: React.FC<{ size?: number; style?: React.CSSProperties }>;
  label: string;
  used: number;
  max: number;
  format: (n: number) => string;
}) {
  const ratio = max > 0 ? Math.min(1, used / max) : 0;
  const pct = Math.round(ratio * 100);
  const disabled = max <= 0;
  // Colour shifts green → warning → error as the ceiling approaches.
  const barColor = disabled
    ? 'var(--text-dimmed)'
    : ratio >= 0.9 ? 'var(--color-error)' : ratio >= 0.7 ? 'var(--color-warning)' : 'var(--color-success)';

  return (
    <div
      className="rounded-lg border p-2.5"
      style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-input)' }}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          <Icon size={12} style={{ color: 'var(--accent-primary)' }} />
          {label}
        </span>
        <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
          {disabled ? 'désactivé' : `${pct}%`}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-base)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
      </div>
      <p className="mt-1.5 text-xs tabular-nums" style={{ color: 'var(--text-primary)' }}>
        {format(used)} <span style={{ color: 'var(--text-dimmed)' }}>/ {format(max)}</span>
      </p>
    </div>
  );
}

// ─── Audit trail ─────────────────────────────────────────────────────────────

const PHASE_META: Record<IdleAuditPhase, { icon: React.FC<{ size?: number; style?: React.CSSProperties }>; color: string; label: string }> = {
  considered: { icon: Eye, color: 'var(--text-muted)', label: 'Envisagé' },
  skipped: { icon: SkipForward, color: 'var(--text-muted)', label: 'Ignoré' },
  started: { icon: Rocket, color: 'var(--accent-primary)', label: 'Lancé' },
  completed: { icon: CheckCircle2, color: 'var(--color-success)', label: 'Terminé' },
  error: { icon: XCircle, color: 'var(--color-error)', label: 'Erreur' },
};

function AuditTrail({ entries, loading }: { entries: IdleAuditEntry[]; loading: boolean }) {
  if (entries.length === 0) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-xs"
        style={{ borderColor: 'var(--border-base)', color: 'var(--text-dimmed)' }}
      >
        {loading ? <Loader2 size={13} className="animate-spin" /> : <Activity size={13} />}
        {loading ? 'Chargement du journal…' : "Aucune action autonome enregistrée pour l'instant."}
      </div>
    );
  }

  return (
    <ul
      className="max-h-80 space-y-1 overflow-y-auto rounded-lg border p-1.5"
      style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-base)' }}
    >
      {entries.map((entry, i) => (
        <AuditRow key={`${entry.ts}-${entry.runId ?? i}`} entry={entry} />
      ))}
    </ul>
  );
}

function AuditRow({ entry }: { entry: IdleAuditEntry }) {
  const meta = PHASE_META[entry.phase] ?? PHASE_META.considered;
  const Icon = meta.icon;
  const time = useMemo(() => {
    const d = new Date(entry.ts);
    return Number.isNaN(d.getTime()) ? entry.ts : d.toLocaleTimeString();
  }, [entry.ts]);

  const outcomeColor =
    entry.outcome === 'success' ? 'var(--color-success)'
      : entry.outcome === 'error' || entry.outcome === 'failed' ? 'var(--color-error)'
        : entry.outcome === 'blocked' ? 'var(--color-warning)'
          : 'var(--text-dimmed)';

  return (
    <li
      className="flex items-start gap-2 rounded-md px-2 py-1.5"
      style={{ backgroundColor: 'var(--bg-panel)' }}
    >
      <Icon size={13} style={{ color: meta.color, marginTop: 1, flexShrink: 0 }} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium" style={{ color: meta.color }}>{meta.label}</span>
          <span className="truncate text-xs" style={{ color: 'var(--text-dimmed)' }}>{entry.action}</span>
          {entry.dryRun && (
            <span
              className="rounded px-1 py-0.5 text-[10px] font-medium leading-none"
              style={{ color: 'var(--color-info)', backgroundColor: 'color-mix(in srgb, var(--color-info) 12%, transparent)' }}
              title="Simulation sans effet de bord"
            >
              lecture seule
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{entry.message}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]" style={{ color: 'var(--text-dimmed)' }}>
          <span className="tabular-nums">{time}</span>
          {entry.outcome && <span style={{ color: outcomeColor }}>{entry.outcome}</span>}
          {typeof entry.tokens === 'number' && entry.tokens > 0 && <span>{formatCompact(entry.tokens)} tokens</span>}
          {typeof entry.costUsd === 'number' && entry.costUsd > 0 && <span>${entry.costUsd.toFixed(4)}</span>}
          {entry.budget?.actions && <span title="Actions utilisées / plafond horaire">act {entry.budget.actions}</span>}
        </div>
        {entry.phase === 'error' && (
          <p className="mt-0.5 flex items-start gap-1 text-[11px]" style={{ color: 'var(--color-error)' }}>
            <AlertTriangle size={10} style={{ marginTop: 2, flexShrink: 0 }} />
            {entry.detail ?? entry.message}
          </p>
        )}
      </div>
    </li>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Compact number formatting: 1200 → "1.2k", 2_000_000 → "2M". */
function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return String(Math.round(n));
}
