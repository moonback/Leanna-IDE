import { Activity, CheckCircle2, Cpu, Timer } from 'lucide-react';
import type { RuntimeSnapshot } from './types.js';
import { fmt, fmtDuration, fmtUptime, failureColor } from './format.js';
import { Metric } from './cards.js';

// ═══════════════════════════════════════════════════════════════════════════════
// RuntimeHealthPanel — métriques runtime réelles (latence, fiabilité, mémoire).
// Source : /api/observability/runtime. Quand le runtime n'a produit aucune
// donnée, on affiche un état « indisponible » plutôt que des valeurs inventées.
// ═══════════════════════════════════════════════════════════════════════════════

export function RuntimeHealthPanel({ snapshot, available }: { snapshot: RuntimeSnapshot | null; available: boolean }) {
  if (!available || !snapshot) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--accent-subtle)' }}>
          <Activity className="h-6 w-6" style={{ color: 'var(--accent-secondary)' }} />
        </div>
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          Métriques runtime indisponibles
        </p>
        <p className="text-xs max-w-sm" style={{ color: 'var(--text-muted)' }}>
          Le runtime d'agents n'est pas encore démarré ou n'a produit aucune métrique.
          Ces valeurs reflètent l'état réel du runtime et n'apparaissent qu'une fois l'activité démarrée.
        </p>
      </div>
    );
  }

  const { tasks, tools, agents, memory } = snapshot;
  const taskTotal = tasks.completed + tasks.failed;
  const successRate = taskTotal > 0 ? tasks.completed / taskTotal : null;
  const memPct = memory.heapTotalMB > 0 ? Math.round((memory.heapUsedMB / memory.heapTotalMB) * 100) : 0;
  const noLatency = tools.latencySampleSize === 0;

  return (
    <div className="space-y-5">
      {/* Fiabilité des tâches */}
      <div className="rounded-xl border p-4 flex flex-col gap-3" style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--accent-secondary)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Fiabilité des tâches</span>
        </div>
        <div className="lea-stagger grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Metric
            label="Taux de succès"
            value={successRate === null ? '—' : `${Math.round(successRate * 100)}%`}
            color={successRate === null ? undefined : successRate >= 0.9 ? 'var(--color-success)' : successRate >= 0.7 ? 'var(--color-warning)' : 'var(--color-error)'}
          />
          <Metric label="Terminées" value={fmt(tasks.completed)} color="var(--color-success)" />
          <Metric label="Échouées" value={fmt(tasks.failed)} color={tasks.failed > 0 ? 'var(--color-error)' : undefined} />
          <Metric label="Durée moyenne" value={fmtDuration(tasks.avgDurationMs)} />
        </div>
      </div>

      {/* Latence des outils */}
      <div className="rounded-xl border p-4 flex flex-col gap-3" style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4" style={{ color: 'var(--accent-secondary)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Latence des outils</span>
          </div>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {noLatency ? 'aucun échantillon' : `${fmt(tools.latencySampleSize)} échantillons`}
          </span>
        </div>
        {noLatency ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Aucun appel d'outil enregistré pour l'instant — les percentiles s'afficheront dès la première exécution.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <Metric label="Moyenne" value={fmtDuration(tools.avgLatencyMs)} />
            <Metric label="p50" value={fmtDuration(tools.p50LatencyMs)} />
            <Metric label="p95" value={fmtDuration(tools.p95LatencyMs)} />
            <Metric label="p99" value={fmtDuration(tools.p99LatencyMs)} />
            <Metric
              label="Taux d'échec"
              value={`${Math.round(tools.failureRate * 100)}%`}
              color={failureColor(tools.failureRate)}
            />
          </div>
        )}
      </div>

      {/* Santé système */}
      <div className="rounded-xl border p-4 flex flex-col gap-3" style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}>
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4" style={{ color: 'var(--accent-secondary)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Santé système</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Metric label="Uptime" value={fmtUptime(snapshot.uptime)} />
          <Metric label="Agents actifs" value={fmt(agents.active)} />
          <Metric label="Appels d'outils" value={fmt(tools.totalCalls)} />
          <Metric
            label="Mémoire (heap)"
            value={`${memory.heapUsedMB} / ${memory.heapTotalMB} MB`}
            color={memPct >= 85 ? 'var(--color-error)' : memPct >= 70 ? 'var(--color-warning)' : undefined}
          />
        </div>
        {agents.busiest && (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Agent le plus sollicité : <strong style={{ color: 'var(--text-primary)' }}>{agents.busiest}</strong>
          </p>
        )}
      </div>
    </div>
  );
}
