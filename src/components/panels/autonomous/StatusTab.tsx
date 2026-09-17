/**
 * StatusTab — Statut global du runtime, niveau d'autonomie, diagnostics
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Activity, Zap, Brain, Eye, Cpu, CheckCircle2,
  XCircle, Loader2, RefreshCw, Play, Square,
  AlertTriangle, Clock, Target, Rocket,
} from 'lucide-react';
import { autonomousApi } from '../../../services/autonomousApi.js';
import type { RuntimeStatus, Diagnostics, AutonomyLevel } from '../../../services/autonomousApi.js';

// ─── Autonomy level labels ────────────────────────────────────────────────────

const LEVEL_LABELS: Record<AutonomyLevel, string> = {
  0: 'Chat uniquement',
  1: 'Suggestions',
  2: 'Lecture autonome',
  3: 'Analyse autonome',
  4: 'Sandbox',
  5: 'Tests & validation',
  6: 'Corrections autonomes',
  7: 'Actions externes',
  8: 'Missions longues',
};

const LEVEL_COLORS: Record<AutonomyLevel, string> = {
  0: 'text-gray-400',
  1: 'text-blue-400',
  2: 'text-blue-400',
  3: 'text-cyan-400',
  4: 'text-yellow-400',
  5: 'text-yellow-400',
  6: 'text-green-400',
  7: 'text-orange-400',
  8: 'text-red-400',
};

const STATE_ICONS: Record<string, React.ReactNode> = {
  idle:         <Clock size={14} className="text-gray-400" />,
  observing:    <Eye size={14} className="text-blue-400" />,
  understanding:<Brain size={14} className="text-purple-400" />,
  planning:     <Cpu size={14} className="text-yellow-400" />,
  executing:    <Zap size={14} className="text-green-400" />,
  verifying:    <CheckCircle2 size={14} className="text-cyan-400" />,
  reflecting:   <Brain size={14} className="text-indigo-400" />,
  learning:     <Activity size={14} className="text-pink-400" />,
  waiting:      <Clock size={14} className="text-gray-400" />,
};

// ─── Component ────────────────────────────────────────────────────────────────

export function StatusTab() {
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [s, d] = await Promise.all([
        autonomousApi.getStatus(),
        autonomousApi.getDiagnostics(),
      ]);
      setStatus(s);
      setDiag(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const handleLevel = async (level: AutonomyLevel) => {
    if (changing) return;
    setChanging(true);
    try {
      await autonomousApi.setLevel(level);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChanging(false);
    }
  };

  const handleStartStop = async () => {
    if (changing) return;
    setChanging(true);
    try {
      if (status?.state === 'idle') {
        await autonomousApi.start();
      } else {
        await autonomousApi.stop();
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChanging(false);
    }
  };

  const handleScan = async () => {
    try {
      const result = await autonomousApi.scan();
      alert(`Scan terminé — ${result.count} opportunité(s) détectée(s)`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
        <Loader2 size={16} className="animate-spin" /> Chargement…
      </div>
    );
  }

  const isRunning = status && status.state !== 'idle';
  const level = (status?.autonomyLevel ?? 6) as AutonomyLevel;

  return (
    <div className="flex flex-col gap-4 p-3 text-sm">

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-red-400 bg-red-900/20 border border-red-800/40">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* ── Runtime state ──────────────────────────────────────────────── */}
      <div className="rounded-xl border p-3 flex flex-col gap-3" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-secondary)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-medium" style={{ color: 'var(--text-primary)' }}>
            <Activity size={15} className={isRunning ? 'text-green-400' : 'text-gray-500'} />
            Autonomous Core V2
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="p-1 rounded hover:bg-white/10 transition-colors"
              title="Rafraîchir"
            >
              <RefreshCw size={13} style={{ color: 'var(--text-muted)' }} />
            </button>
            <button
              onClick={handleStartStop}
              disabled={changing}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isRunning ? 'bg-red-900/30 text-red-400 hover:bg-red-900/50' : 'bg-green-900/30 text-green-400 hover:bg-green-900/50'}`}
            >
              {changing ? (
                <Loader2 size={12} className="animate-spin" />
              ) : isRunning ? (
                <Square size={12} />
              ) : (
                <Play size={12} />
              )}
              {isRunning ? 'Arrêter' : 'Démarrer'}
            </button>
          </div>
        </div>

        {/* State + uptime */}
        <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          <div className="flex items-center gap-1.5">
            {STATE_ICONS[status?.state ?? 'idle']}
            <span className="capitalize">{status?.state ?? '—'}</span>
          </div>
          {isRunning && status?.uptime != null && (
            <span>
              Uptime: {Math.floor(status.uptime / 60000)}m {Math.floor((status.uptime % 60000) / 1000)}s
            </span>
          )}
        </div>

        {/* Counters */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Objectifs actifs', value: status?.activeGoals ?? 0, icon: <Target size={13} className="text-blue-400" /> },
            { label: 'Missions actives', value: status?.activeMissions ?? 0, icon: <Rocket size={13} className="text-yellow-400" /> },
            { label: 'Missions totales', value: status?.totalMissionsRun ?? 0, icon: <CheckCircle2 size={13} className="text-green-400" /> },
          ].map(({ label, value, icon }) => (
            <div key={label} className="rounded-lg p-2 flex flex-col items-center gap-1" style={{ backgroundColor: 'var(--bg-base)' }}>
              {icon}
              <span className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{value}</span>
              <span className="text-xs text-center leading-tight" style={{ color: 'var(--text-muted)' }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Success rate */}
        {(status?.totalMissionsRun ?? 0) > 0 && (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <CheckCircle2 size={12} className="text-green-400" />
            <span>
              Taux de succès:{' '}
              <span className="text-green-400 font-medium">
                {Math.round(((status?.totalMissionsSucceeded ?? 0) / (status?.totalMissionsRun ?? 1)) * 100)}%
              </span>
            </span>
            <XCircle size={12} className="text-red-400 ml-2" />
            <span>{status?.totalMissionsFailed ?? 0} échec(s)</span>
          </div>
        )}
      </div>

      {/* ── Autonomy level ─────────────────────────────────────────────── */}
      <div className="rounded-xl border p-3 flex flex-col gap-3" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-secondary)' }}>
        <div className="flex items-center justify-between">
          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Niveau d'autonomie</span>
          <span className={`text-xs font-semibold ${LEVEL_COLORS[level]}`}>
            L{level} — {LEVEL_LABELS[level]}
          </span>
        </div>
        <div className="flex gap-1">
          {(Array.from({ length: 9 }, (_, i) => i) as AutonomyLevel[]).map((l) => (
            <button
              key={l}
              onClick={() => handleLevel(l)}
              disabled={changing}
              title={`L${l} — ${LEVEL_LABELS[l]}`}
              className={`flex-1 h-7 rounded text-xs font-bold transition-all ${
                l === level
                  ? `${LEVEL_COLORS[l]} border border-current bg-white/10`
                  : 'text-gray-600 hover:text-gray-400 border border-transparent hover:border-gray-600'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {LEVEL_LABELS[level]}
        </p>
      </div>

      {/* ── Diagnostics ───────────────────────────────────────────────── */}
      {diag && (
        <div className="rounded-xl border p-3 flex flex-col gap-2" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-secondary)' }}>
          <span className="font-medium text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Diagnostics</span>
          {[
            { label: 'Perception', value: diag.perception.running ? '🟢 Actif' : '⚫ Inactif', sub: `${diag.perception.totalEventsProduced} événements produits` },
            { label: 'Opportunités', value: diag.opportunities.running ? '🟢 Actif' : '⚫ Inactif', sub: diag.opportunities.lastScanAt ? `Dernier scan: ${new Date(diag.opportunities.lastScanAt).toLocaleTimeString()}` : 'Jamais scanné' },
            { label: 'Permissions', value: `${diag.autonomy.allowedTools} outils autorisés`, sub: `${diag.autonomy.blockedTools} bloqués — ${diag.autonomy.recentDenials} refus dernière heure` },
            { label: 'Objectifs', value: `${diag.goals.active} actifs / ${diag.goals.total} total`, sub: `${diag.goals.due} éligibles maintenant` },
            { label: 'Missions', value: `${diag.missions.active} actives`, sub: `${diag.missions.completed} complétées, ${diag.missions.failed} échouées` },
          ].map(({ label, value, sub }) => (
            <div key={label} className="flex items-start justify-between gap-2">
              <span style={{ color: 'var(--text-muted)' }}>{label}</span>
              <div className="text-right">
                <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{value}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{sub}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Actions ───────────────────────────────────────────────────── */}
      <button
        onClick={handleScan}
        className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors hover:opacity-80"
        style={{ backgroundColor: 'var(--accent)', color: 'white' }}
      >
        <RefreshCw size={13} />
        Scanner les opportunités maintenant
      </button>
    </div>
  );
}
