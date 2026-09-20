import React from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Heart,
  Moon,
  Pause,
  Play,
  Plus,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  useAutonomyTimeline,
  type AutonomyEvent,
  type AutonomyEventType,
} from '../hooks/useAutonomyTimeline.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (Number.isNaN(seconds)) return '';
  if (seconds < 5) return "à l'instant";
  if (seconds < 60) return `il y a ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `il y a ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  return `il y a ${hours}h`;
}

const EVENT_LABELS: Record<AutonomyEventType, string> = {
  'autonomy:heartbeat': 'Heartbeat',
  'autonomy:stateChanged': 'Changement d\'état',
  'autonomy:health': 'Santé',
  'autonomy:taskCreated': 'Tâche créée',
  'autonomy:taskStateChanged': 'Tâche mise à jour',
};

function eventIcon(event: AutonomyEventType) {
  switch (event) {
    case 'autonomy:heartbeat':
      return <Heart className="w-3.5 h-3.5 text-pink-500" />;
    case 'autonomy:stateChanged':
      return <Activity className="w-3.5 h-3.5 text-indigo-500" />;
    case 'autonomy:health':
      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
    case 'autonomy:taskCreated':
      return <Plus className="w-3.5 h-3.5 text-blue-500" />;
    case 'autonomy:taskStateChanged':
      return <CircleDot className="w-3.5 h-3.5 text-amber-500" />;
    default:
      return <CircleDot className="w-3.5 h-3.5 text-gray-400" />;
  }
}

function statusIcon(status: string) {
  switch (status) {
    case 'watching':
    case 'executing':
      return <Play className="w-3.5 h-3.5 text-emerald-500" />;
    case 'idle':
      return <Pause className="w-3.5 h-3.5 text-amber-500" />;
    case 'sleeping':
      return <Moon className="w-3.5 h-3.5 text-indigo-400" />;
    case 'error':
      return <AlertTriangle className="w-3.5 h-3.5 text-red-500" />;
    default:
      return <CircleDot className="w-3.5 h-3.5 text-gray-400" />;
  }
}

/** Résumé humain d'un événement à partir de son payload. */
function describeEvent(entry: AutonomyEvent): string {
  const p = entry.payload;
  switch (entry.event) {
    case 'autonomy:stateChanged':
      return `${String(p.from ?? '?')} → ${String(p.to ?? '?')}${p.reason ? ` — ${String(p.reason)}` : ''}`;
    case 'autonomy:health':
      return `${String(p.status ?? '?')}${p.reason ? ` — ${String(p.reason)}` : ''}`;
    case 'autonomy:heartbeat':
      return `${String(p.state ?? '?')}${p.reason ? ` — ${String(p.reason)}` : ''}`;
    case 'autonomy:taskCreated':
      return `${String(p.taskType ?? 'tâche')} (${String(p.taskId ?? '').slice(0, 8)})`;
    case 'autonomy:taskStateChanged':
      return `${String(p.taskType ?? 'tâche')}: ${String(p.from ?? '?')} → ${String(p.to ?? '?')}${
        p.error ? ` — ${String(p.error)}` : ''
      }`;
    default:
      return '';
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

interface AutonomyTimelineProps {
  /** Activer/désactiver la connexion WebSocket (par défaut activée). */
  enabled?: boolean;
  className?: string;
}

/**
 * Panneau read-only qui affiche l'état du runtime autonome et la timeline temps
 * réel des événements autonomy:*. Purement observationnel : il ne déclenche
 * aucune action et n'envoie rien au serveur.
 */
export function AutonomyTimeline({ enabled = true, className = '' }: AutonomyTimelineProps) {
  const { state, tasks, events, connection } = useAutonomyTimeline({ enabled });

  const runningTasks = tasks.filter((t) => t.status === 'running' || t.status === 'pending');

  return (
    <div className={`flex flex-col h-full min-h-0 ${className}`}>
      {/* Header : état + connexion */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100/80">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-500" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500">Autonomie</h2>
        </div>
        <div
          className="flex items-center gap-1 text-xs font-medium"
          title={`Connexion timeline : ${connection}`}
        >
          {connection === 'open' ? (
            <Wifi className="w-3.5 h-3.5 text-emerald-500" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-gray-400" />
          )}
          <span className={connection === 'open' ? 'text-emerald-600' : 'text-gray-400'}>
            {connection === 'open' ? 'En direct' : connection === 'connecting' ? 'Connexion…' : 'Hors ligne'}
          </span>
        </div>
      </div>

      {/* Résumé d'état */}
      <div className="px-4 py-3 border-b border-gray-100/80 grid grid-cols-3 gap-2">
        <StatCell
          label="Statut"
          icon={statusIcon(state?.status ?? 'starting')}
          value={state?.status ?? '—'}
        />
        <StatCell
          label="Santé"
          icon={
            state?.health === 'degraded' ? (
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            )
          }
          value={state?.health ?? '—'}
        />
        <StatCell
          label="Tâches actives"
          icon={<CircleDot className="w-3.5 h-3.5 text-blue-500" />}
          value={state ? String(state.activeTasks) : '—'}
        />
      </div>

      {/* Tâches en cours */}
      {runningTasks.length > 0 && (
        <div className="px-4 pt-3 pb-1 border-b border-gray-100/80">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1.5">
            En cours ({runningTasks.length})
          </p>
          <div className="space-y-1 max-h-28 overflow-y-auto scrollbar-thin pr-1">
            {runningTasks.slice(0, 20).map((task) => (
              <div key={task.id} className="flex items-center gap-2 text-xs px-2 py-1 rounded-lg bg-gray-50/70">
                <CircleDot className="w-3 h-3 text-blue-400 flex-shrink-0" />
                <span className="flex-1 min-w-0 truncate text-gray-700">{task.title}</span>
                <span className="text-gray-400 uppercase text-[10px] tracking-wide">{task.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline d'événements */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-2 py-2">
        {events.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8">
            <Moon className="w-6 h-6 text-gray-300 mb-2" />
            <p className="text-sm text-gray-400">Aucun événement pour l'instant</p>
            <p className="text-xs text-gray-300 mt-0.5">
              Les événements du runtime autonome apparaîtront ici en temps réel
            </p>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {events.map((entry) => (
              <li
                key={entry.id}
                className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50/80 transition-colors"
              >
                <span className="mt-0.5 flex-shrink-0">{eventIcon(entry.event)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-700">{EVENT_LABELS[entry.event]}</span>
                    <span className="text-[10px] text-gray-400">{timeAgo(entry.timestamp)}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{describeEvent(entry)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Derniers échecs */}
      {state && state.recentFailures.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-100/80">
          <p className="text-xs font-bold uppercase tracking-widest text-red-400 mb-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Échecs récents ({state.recentFailures.length})
          </p>
          <div className="space-y-0.5 max-h-20 overflow-y-auto scrollbar-thin pr-1">
            {state.recentFailures.slice(0, 5).map((failure, i) => (
              <p key={i} className="text-xs text-red-600 bg-red-50/60 px-2 py-1 rounded truncate">
                {failure}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCell({ label, icon, value }: { label: string; icon: React.ReactNode; value: string }) {
  return (
    <div className="px-2.5 py-2 rounded-xl bg-gray-50/70">
      <div className="flex items-center gap-1 text-gray-400 mb-0.5">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-sm font-bold text-gray-800 capitalize truncate">{value}</p>
    </div>
  );
}
