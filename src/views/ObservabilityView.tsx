/**
 * ObservabilityView — Cost & Token Dashboard
 *
 * Affiche :
 * - Vue d'ensemble (tokens totaux, coût total, appels LLM)
 * - Consommation par modèle (tableau + barres)
 * - Consommation par agent/rôle
 * - Top missions par coût
 * - Santé & fiabilité : métriques runtime réelles (latence, taux de succès)
 * - Budget guardrails : configuration et statut
 * - Historique des 100 derniers appels modèle
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  RefreshCw, DollarSign, Cpu, Zap,
  Clock, TrendingUp, Shield, Info, Activity, Database,
} from 'lucide-react';
import { ViewHeader } from '../components/ui/ViewHeader.js';
import { useToast } from '../components/ui/Toast.js';
import type { Dashboard, UsageRecord, RuntimeSnapshot, HealthInfo } from '../components/observability/types.js';
import { fmt, fmtCost, timeAgo } from '../components/observability/format.js';
import { StatCard, BarRow } from '../components/observability/cards.js';
import { RuntimeHealthPanel } from '../components/observability/RuntimeHealthPanel.js';
import { BudgetPanel } from '../components/observability/BudgetPanel.js';
import { viewHeaderProps } from '../config/navigation.js';

// ─── Main View ───────────────────────────────────────────────────────────────

export default function ObservabilityView() {
  const { error: toastError } = useToast();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [runtime, setRuntime] = useState<{ available: boolean; snapshot: RuntimeSnapshot | null }>({ available: false, snapshot: null });
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'health' | 'usage' | 'budget'>('overview');
  const [period, setPeriod] = useState<'day' | 'hour'>('day');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const [dashRes, usageRes, runtimeRes, healthRes] = await Promise.all([
        fetch(`/api/observability/dashboard?period=${period}`),
        fetch('/api/observability/usage?limit=100'),
        fetch('/api/observability/runtime'),
        fetch('/api/observability/health'),
      ]);
      if (dashRes.ok) {
        const data = await dashRes.json();
        if (data.success) setDashboard(data.dashboard);
      }
      if (usageRes.ok) {
        const data = await usageRes.json();
        if (data.success) setRecords(data.records.reverse());
      }
      if (runtimeRes.ok) {
        const data = await runtimeRes.json();
        if (data.success) setRuntime({ available: !!data.available, snapshot: data.snapshot ?? null });
      }
      if (healthRes.ok) {
        const data = await healthRes.json();
        if (data.success) setHealth({ status: data.status, telemetry: data.telemetry });
      }
    } catch {
      toastError('Impossible de charger les données d\'observabilité.');
    } finally {
      setLoading(false);
    }
  }, [toastError, period]);

  useEffect(() => {
    fetchDashboard();
    intervalRef.current = setInterval(fetchDashboard, 15_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchDashboard]);

  const maxModelCost = dashboard?.byModel[0]?.cost ?? 1;
  const maxAgentCost = dashboard?.byAgent[0]?.cost ?? 1;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ViewHeader
        {...viewHeaderProps('observability')}
        description="Coûts, tokens et traces OpenTelemetry en temps réel"
        badge="V1.1"
        actions={
          <div className="flex items-center gap-2">
            {/* Statut de persistance Supabase (depuis /health) */}
            {health && (
              <span
                className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
                style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}
                title={health.telemetry.supabaseConnected ? 'Télémétrie persistée dans Supabase' : 'Supabase non configuré : télémétrie en mémoire uniquement'}
              >
                <Database
                  className="h-3.5 w-3.5"
                  style={{ color: health.telemetry.supabaseConnected ? 'var(--color-success)' : 'var(--text-dimmed)' }}
                />
                {health.telemetry.supabaseConnected ? 'Supabase' : 'En mémoire'}
              </span>
            )}
            {/* Period toggle */}
            <div className="flex rounded-lg overflow-hidden border text-xs" style={{ borderColor: 'var(--border-base)' }}>
              {(['day', 'hour'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className="px-3 py-1.5 font-medium transition-colors"
                  style={{
                    backgroundColor: period === p ? 'var(--accent-subtle)' : 'var(--bg-panel)',
                    color: period === p ? 'var(--accent-secondary)' : 'var(--text-muted)',
                  }}
                >
                  {p === 'day' ? '24h' : '1h'}
                </button>
              ))}
            </div>
            <button
              onClick={fetchDashboard}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--bg-secondary)]"
              style={{ borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Actualiser
            </button>
          </div>
        }
      />

      {/* Tabs */}
      <div
        className="flex border-b"
        style={{ borderColor: 'var(--border-base)' }}
      >
        {([
          { key: 'overview', label: 'Vue d\'ensemble', icon: TrendingUp },
          { key: 'health', label: 'Santé & Fiabilité', icon: Activity },
          { key: 'usage', label: 'Historique', icon: Clock },
          { key: 'budget', label: 'Budget Guardrails', icon: Shield },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors"
            style={{
              borderBottomColor: tab === key ? 'var(--accent-secondary)' : 'transparent',
              color: tab === key ? 'var(--accent-secondary)' : 'var(--text-muted)',
            }}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">

        {loading && (
          <div className="flex items-center justify-center h-40">
            <RefreshCw className="h-6 w-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        )}

        {!loading && tab === 'overview' && (
          <>
            {/* Overview cards */}
            <div className="lea-stagger grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard
                icon={Zap}
                label="Tokens totaux"
                value={fmt(dashboard?.overview.totalTokens ?? 0)}
                sub={period === 'day' ? 'dernières 24h' : 'dernière heure'}
              />
              <StatCard
                icon={DollarSign}
                label="Coût total"
                value={fmtCost(dashboard?.overview.totalCost ?? 0)}
                accent
                sub={dashboard?.overview.avgCostPerCall
                  ? `${fmtCost(dashboard.overview.avgCostPerCall)} / appel`
                  : 'USD'}
              />
              <StatCard
                icon={Cpu}
                label="Appels LLM"
                value={fmt(dashboard?.overview.totalCalls ?? 0)}
                sub={dashboard?.overview.avgTokensPerCall
                  ? `${fmt(dashboard.overview.avgTokensPerCall)} tokens / appel`
                  : 'model calls'}
              />
            </div>

            {/* By model */}
            {(dashboard?.byModel.length ?? 0) > 0 && (
              <div
                className="rounded-xl border p-4 flex flex-col gap-3"
                style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}
              >
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4" style={{ color: 'var(--accent-secondary)' }} />
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Par modèle
                  </span>
                </div>
                <div className="flex flex-col gap-3">
                  {dashboard!.byModel.map(m => (
                    <BarRow
                      key={m.model}
                      label={m.model}
                      tokens={m.tokens}
                      cost={m.cost}
                      calls={m.calls}
                      maxCost={maxModelCost}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* By agent */}
            {(dashboard?.byAgent.length ?? 0) > 0 && (
              <div
                className="rounded-xl border p-4 flex flex-col gap-3"
                style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}
              >
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4" style={{ color: 'var(--accent-secondary)' }} />
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Par agent
                  </span>
                </div>
                <div className="flex flex-col gap-3">
                  {dashboard!.byAgent.map(a => (
                    <BarRow
                      key={a.role}
                      label={a.role}
                      tokens={a.tokens}
                      cost={a.cost}
                      calls={a.calls}
                      maxCost={maxAgentCost}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Top missions */}
            {(dashboard?.byMission.length ?? 0) > 0 && (
              <div
                className="rounded-xl border p-4 flex flex-col gap-3"
                style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}
              >
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" style={{ color: 'var(--accent-secondary)' }} />
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Top missions par coût
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {dashboard!.byMission.slice(0, 10).map(m => (
                    <div key={m.missionId} className="flex items-center justify-between text-xs">
                      <span className="font-mono truncate max-w-[200px]" style={{ color: 'var(--text-muted)' }}>
                        {m.missionId.slice(0, 18)}…
                      </span>
                      <div className="flex gap-3 shrink-0">
                        <span style={{ color: 'var(--text-primary)' }}>{fmt(m.tokens)} tok</span>
                        <span className="font-medium" style={{ color: 'var(--accent-secondary)' }}>
                          {fmtCost(m.cost)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!dashboard || (dashboard.overview.totalCalls === 0) ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full"
                  style={{ backgroundColor: 'var(--accent-subtle)' }}
                >
                  <Info className="h-6 w-6" style={{ color: 'var(--accent-secondary)' }} />
                </div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  Aucune donnée pour le moment
                </p>
                <p className="text-xs max-w-xs" style={{ color: 'var(--text-muted)' }}>
                  Les coûts et tokens apparaîtront ici dès qu'un appel LLM sera effectué via le système d'agents ou les missions.
                </p>
              </div>
            ) : null}
          </>
        )}

        {/* Santé & fiabilité tab (métriques runtime réelles) */}
        {!loading && tab === 'health' && (
          <RuntimeHealthPanel snapshot={runtime.snapshot} available={runtime.available} />
        )}

        {/* Usage history tab */}
        {!loading && tab === 'usage' && (
          <div
            className="rounded-xl border overflow-hidden"
            style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}
          >
            <table className="w-full text-xs">
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                  <th className="px-3 py-2 text-left font-medium">Heure</th>
                  <th className="px-3 py-2 text-left font-medium">Modèle</th>
                  <th className="px-3 py-2 text-left font-medium">Agent</th>
                  <th className="px-3 py-2 text-right font-medium">Tokens in</th>
                  <th className="px-3 py-2 text-right font-medium">Tokens out</th>
                  <th className="px-3 py-2 text-right font-medium">Coût</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center" style={{ color: 'var(--text-muted)' }}>
                      Aucun enregistrement
                    </td>
                  </tr>
                )}
                {records.map(r => (
                  <tr
                    key={r.id}
                    className="border-t transition-colors hover:bg-[var(--bg-secondary)]"
                    style={{ borderColor: 'var(--border-base)' }}
                  >
                    <td className="px-3 py-1.5 tabular-nums" style={{ color: 'var(--text-muted)' }}>
                      {timeAgo(r.timestamp)}
                    </td>
                    <td className="px-3 py-1.5 font-mono max-w-[180px] truncate" style={{ color: 'var(--text-primary)' }}>
                      {r.model}
                    </td>
                    <td className="px-3 py-1.5" style={{ color: 'var(--text-muted)' }}>
                      {r.agentRole ?? '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>
                      {fmt(r.inputTokens)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>
                      {fmt(r.outputTokens)}
                    </td>
                    <td
                      className="px-3 py-1.5 text-right font-medium tabular-nums"
                      style={{ color: 'var(--accent-secondary)' }}
                    >
                      {fmtCost(r.costUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Budget tab */}
        {!loading && tab === 'budget' && <BudgetPanel />}
      </div>
    </div>
  );
}
