/**
 * MissionsTab — Flux en temps réel des missions autonomes
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Rocket, Loader2, CheckCircle2, XCircle, Clock,
  StopCircle, ChevronDown, ChevronRight, AlertTriangle,
  RefreshCw, Bot, FileText,
} from 'lucide-react';
import { autonomousApi } from '../../../services/autonomousApi.js';
import type { Mission, MissionStatus } from '../../../services/autonomousApi.js';

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<MissionStatus, { icon: React.ReactNode; color: string; bg: string; label: string }> = {
  pending:    { icon: <Clock size={12} />,      color: 'text-gray-400',   bg: 'bg-gray-800/40',   label: 'En attente' },
  running:    { icon: <Loader2 size={12} className="animate-spin" />, color: 'text-blue-400', bg: 'bg-blue-900/20', label: 'En cours' },
  verifying:  { icon: <Loader2 size={12} className="animate-spin" />, color: 'text-cyan-400', bg: 'bg-cyan-900/20', label: 'Vérification' },
  completed:  { icon: <CheckCircle2 size={12} />, color: 'text-green-400', bg: 'bg-green-900/20', label: 'Complétée' },
  failed:     { icon: <XCircle size={12} />,    color: 'text-red-400',    bg: 'bg-red-900/20',    label: 'Échouée' },
  cancelled:  { icon: <StopCircle size={12} />, color: 'text-yellow-400', bg: 'bg-yellow-900/20', label: 'Annulée' },
};

// ─── Mission card ─────────────────────────────────────────────────────────────

function MissionCard({ mission, onRefresh }: { mission: Mission; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const cfg = STATUS_CONFIG[mission.status] ?? STATUS_CONFIG.pending;
  const isActive = mission.status === 'pending' || mission.status === 'running' || mission.status === 'verifying';

  const duration = mission.durationMs
    ? mission.durationMs < 60000
      ? `${(mission.durationMs / 1000).toFixed(1)}s`
      : `${Math.floor(mission.durationMs / 60000)}m ${Math.round((mission.durationMs % 60000) / 1000)}s`
    : null;

  const handleCancel = async () => {
    if (!window.confirm('Annuler cette mission ?')) return;
    setCancelling(true);
    try {
      await autonomousApi.cancelMission(mission.id);
      onRefresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className={`rounded-xl border overflow-hidden transition-all ${isActive ? 'border-blue-800/50' : ''}`} style={{ borderColor: isActive ? undefined : 'var(--border-base)', backgroundColor: 'var(--bg-secondary)' }}>
      {/* Header */}
      <div
        className="flex items-start gap-2 px-3 py-2.5 cursor-pointer hover:bg-white/5"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="mt-0.5">
          {expanded ? <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <span className="text-sm font-medium leading-snug" style={{ color: 'var(--text-primary)' }}>
              {mission.title}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
              {cfg.icon} {cfg.label}
            </span>
            {mission.agents.length > 0 && (
              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                <Bot size={11} />{mission.agents.slice(0, 2).join(', ')}{mission.agents.length > 2 ? `+${mission.agents.length - 2}` : ''}
              </span>
            )}
            {duration && (
              <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                <Clock size={11} /> {duration}
              </span>
            )}
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {new Date(mission.createdAt).toLocaleTimeString()}
            </span>
          </div>
        </div>

        {/* Cancel */}
        {isActive && (
          <button
            onClick={(e) => { e.stopPropagation(); handleCancel(); }}
            disabled={cancelling}
            className="p-1.5 rounded hover:bg-red-900/30 transition-colors"
            title="Annuler"
          >
            {cancelling ? <Loader2 size={13} className="animate-spin text-red-400" /> : <StopCircle size={13} className="text-red-400" />}
          </button>
        )}
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="px-4 pb-3 flex flex-col gap-2 text-xs border-t" style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}>

          {/* Result */}
          {mission.result && (
            <div className={`mt-2 p-2 rounded-lg ${mission.result.success ? 'bg-green-900/15' : 'bg-red-900/15'}`}>
              <p style={{ color: 'var(--text-secondary)' }}>{mission.result.summary}</p>
              {mission.result.error && (
                <p className="text-red-400 mt-1 flex items-start gap-1">
                  <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                  {mission.result.error}
                </p>
              )}
              {mission.result.filesModified && mission.result.filesModified.length > 0 && (
                <div className="mt-1 flex items-center gap-1">
                  <FileText size={11} />
                  <span>{mission.result.filesModified.slice(0, 3).join(', ')}{mission.result.filesModified.length > 3 ? ` +${mission.result.filesModified.length - 3}` : ''}</span>
                </div>
              )}
            </div>
          )}

          {/* Lessons */}
          {mission.lessonsLearned && mission.lessonsLearned.length > 0 && (
            <div>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Leçons :</span>
              <ul className="mt-1 ml-3 list-disc space-y-0.5">
                {mission.lessonsLearned.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            </div>
          )}

          {/* Files */}
          {mission.files.length > 0 && (
            <div className="flex items-start gap-1">
              <FileText size={11} className="mt-0.5" />
              <span>{mission.files.slice(0, 4).join(', ')}{mission.files.length > 4 ? ` +${mission.files.length - 4}` : ''}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function MissionsTab() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<MissionStatus | 'all'>('all');
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await autonomousApi.listMissions(50);
      setMissions(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Poll faster when there are active missions
    const tick = () => {
      const hasActive = missions.some(m => ['pending', 'running', 'verifying'].includes(m.status));
      clearInterval(intervalRef.current!);
      intervalRef.current = setInterval(load, hasActive ? 2000 : 8000);
    };
    tick();
    return () => clearInterval(intervalRef.current!);
  }, [load, missions.length]);

  const filtered = filter === 'all' ? missions : missions.filter((m) => m.status === filter);
  const activeCounts = {
    running: missions.filter(m => ['pending', 'running', 'verifying'].includes(m.status)).length,
    completed: missions.filter(m => m.status === 'completed').length,
    failed: missions.filter(m => m.status === 'failed').length,
  };

  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-red-400 bg-red-900/20 border border-red-800/40 text-xs">
          <AlertTriangle size={13} /> {error}
        </div>
      )}

      {/* Active indicator */}
      {activeCounts.running > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-900/20 border border-blue-800/40 text-xs text-blue-300">
          <Loader2 size={12} className="animate-spin" />
          {activeCounts.running} mission(s) en cours…
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-1 flex-wrap">
        {([
          { key: 'all', label: `Toutes (${missions.length})` },
          { key: 'running', label: `Actives (${activeCounts.running})` },
          { key: 'completed', label: `Complétées (${activeCounts.completed})` },
          { key: 'failed', label: `Échouées (${activeCounts.failed})` },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key as MissionStatus | 'all')}
            className={`px-2.5 py-1 rounded-full text-xs transition-colors ${filter === key ? 'text-white font-medium' : 'hover:bg-white/10'}`}
            style={filter === key ? { backgroundColor: 'var(--accent)' } : { color: 'var(--text-muted)' }}
          >
            {label}
          </button>
        ))}
        <button onClick={load} className="ml-auto p-1 hover:bg-white/10 rounded" title="Rafraîchir">
          <RefreshCw size={13} style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-24 gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <Loader2 size={14} className="animate-spin" /> Chargement…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-28 gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <Rocket size={24} className="opacity-30" />
          <span>{filter === 'all' ? 'Aucune mission lancée pour le moment.' : `Aucune mission ${filter}.`}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((m) => (
            <MissionCard key={m.id} mission={m} onRefresh={load} />
          ))}
        </div>
      )}
    </div>
  );
}
