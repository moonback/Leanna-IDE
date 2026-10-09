import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Mic, MicOff, Power, PhoneOff, Send, Sparkles, Loader2, Radio,
  MonitorUp, MonitorX, Target, Bot, Zap, CheckCircle2, XCircle, Activity,
  ChevronRight, Clock, Wrench, ListChecks, History, X,
} from 'lucide-react';
import { useLiveAPIContext } from '../context/LiveAPIContext.js';
import { useOrbState } from '../hooks/useOrbState.js';
import { useScreenShare } from '../context/ScreenShareContext.js';
import { useProfile } from '../context/UserProfileContext.js';
import {
  initActivityStore, destroyActivityStore, subscribe,
  getAgentTasks, getToolActivities, getAgentDisplayName,
  type AgentTaskEntry,
} from '../stores/agentActivityStore.js';

/**
 * OrbLiveView — Composant plein écran « présence vocale » (fenêtre Electron
 * dédiée /orb-live). Session live INDÉPENDANTE de la fenêtre principale.
 *
 * Mise en page :
 *   - Barre de titre draggable (identité, minuteur, statut, bascule Activité).
 *   - Scène centrale : orbe réactif à l'audio, visualiseur, contrôles, saisie.
 *   - Drawer « Activité » coulissant à droite — MASQUÉ PAR DÉFAUT, ouvert à la
 *     demande. Affiche missions, agents et outils avec une présentation soignée.
 *
 * Design : strictement aligné sur le design system (tokens CSS, rayons/ombres
 * standardisés, verre dépoli, focus visible, prefers-reduced-motion).
 */

// ─── Suivi des missions ────────────────────────────────────────────────────────

interface MissionEventLog {
  at: number;
  event: string;
  label: string;
  confidence?: number;
}

interface MissionActivity {
  missionId: string;
  title: string;
  status: 'in_progress' | 'completed' | 'failed';
  confidence: number;
  currentGoal?: string;
  lastAction?: string;
  startedAt: number;
  updatedAt: number;
  goalsCompleted: number;
  actionsCompleted: number;
  log: MissionEventLog[];
}

const MISSION_LOG_MAX = 12;

function useMissionActivity(): MissionActivity[] {
  const [missions, setMissions] = useState<MissionActivity[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!d || d.type !== 'mission_event') return;
      const now = Date.now();
      const pushLog = (m: MissionActivity, label: string, confidence?: number): MissionEventLog[] =>
        [...m.log, { at: now, event: d.event, label, confidence }].slice(-MISSION_LOG_MAX);

      setMissions(prev => {
        const existing = prev.find(m => m.missionId === d.missionId);
        switch (d.event) {
          case 'mission_started':
            if (existing) return prev;
            return [...prev, {
              missionId: d.missionId, title: d.title ?? 'Mission', status: 'in_progress', confidence: 0.5,
              startedAt: now, updatedAt: now, goalsCompleted: 0, actionsCompleted: 0,
              log: [{ at: now, event: d.event, label: 'Mission démarrée' }],
            }];
          case 'goal_started':
            return prev.map(m => m.missionId === d.missionId ? {
              ...m, currentGoal: d.goalTitle ?? d.goalId, updatedAt: now,
              log: pushLog(m, `Objectif : ${d.goalTitle ?? d.goalId}`),
            } : m);
          case 'goal_completed':
            return prev.map(m => m.missionId === d.missionId ? {
              ...m, goalsCompleted: m.goalsCompleted + 1, updatedAt: now,
              log: pushLog(m, `Objectif terminé : ${d.goalTitle ?? d.goalId ?? ''}`.trim()),
            } : m);
          case 'action_completed':
            return prev.map(m => m.missionId === d.missionId ? {
              ...m,
              confidence: d.confidence ?? m.confidence,
              lastAction: d.skill,
              actionsCompleted: m.actionsCompleted + 1,
              updatedAt: now,
              log: pushLog(m, d.skill ? `Action : ${d.skill}` : 'Action terminée', d.confidence),
            } : m);
          case 'mission_completed':
          case 'mission_cancelled':
          case 'mission_failed':
            return prev.map(m => m.missionId === d.missionId ? {
              ...m, status: d.success ? 'completed' : 'failed', updatedAt: now,
              log: pushLog(m, d.success ? 'Mission terminée' : 'Mission interrompue'),
            } : m);
          default:
            return prev;
        }
      });
    };
    window.addEventListener('Leanna-mission-event', handler);
    return () => window.removeEventListener('Leanna-mission-event', handler);
  }, []);

  return missions;
}

// ─── Helpers de formatage ──────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m${rem.toString().padStart(2, '0')}s`;
}

function formatClock(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

/** Sérialise les arguments d'un outil de façon sûre (tronqué, sans planter sur les cycles). */
function safeStringify(value: unknown): string {
  try {
    const json = JSON.stringify(value, null, 2);
    return json.length > 600 ? json.slice(0, 600) + '\n…' : json;
  } catch {
    return String(value);
  }
}

function statusColor(status: AgentTaskEntry['status']): string {
  switch (status) {
    case 'completed': return 'var(--color-success)';
    case 'failed': return 'var(--color-error)';
    case 'cancelled': return 'var(--text-dimmed)';
    default: return 'var(--accent-primary)';
  }
}

const STATUS_LABEL_FR: Record<AgentTaskEntry['status'], string> = {
  pending: 'En attente',
  running: 'En cours',
  completed: 'Terminé',
  failed: 'Échoué',
  cancelled: 'Annulé',
};

// ─── Visualiseur audio ─────────────────────────────────────────────────────────

function AudioBars({ level, color, active, reduceMotion }: {
  level: number; color: string; active: boolean; reduceMotion: boolean;
}) {
  const weights = useMemo(() => [0.35, 0.55, 0.78, 0.95, 1, 0.95, 0.78, 0.55, 0.35], []);
  return (
    <div className="flex items-end justify-center gap-[3px]" style={{ height: 24 }} aria-hidden>
      {weights.map((w, i) => {
        const target = active ? Math.max(0.1, Math.min(1, level * w * 2.4)) : 0.1;
        return (
          <motion.span
            key={i}
            className="w-[3px] rounded-full"
            style={{ backgroundColor: color, transformOrigin: 'bottom', opacity: active ? 0.9 : 0.4 }}
            animate={reduceMotion ? { height: 5 } : { height: 4 + target * 20 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          />
        );
      })}
    </div>
  );
}

// ─── Orb visuel ─────────────────────────────────────────────────────────────────

function Orb({ amp, accentColor, status, muted, onClick, reduceMotion }: {
  amp: number; accentColor: string; status: string; muted: boolean; onClick: () => void; reduceMotion: boolean;
}) {
  const scale = 1 + Math.min(0.16, amp * 0.55);
  const glow = 0.3 + Math.min(0.5, amp * 1.2);
  const pulsing = status === 'online' || status === 'listening' || status === 'speaking' || status === 'busy';

  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="group relative flex items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--bg-base)]"
      style={{ width: 220, height: 220, cursor: 'pointer' }}
      whileTap={reduceMotion ? undefined : { scale: 0.97 }}
      aria-label={status === 'idle' ? 'Connecter la présence vocale' : 'Déconnecter la présence vocale'}
    >
      {/* Anneau orbital statique */}
      <span className="absolute inset-3 rounded-full" style={{ border: `1px solid color-mix(in srgb, ${accentColor} 22%, transparent)` }} aria-hidden />

      {/* Ondes de pulsation */}
      {!reduceMotion && pulsing && (
        <>
          <motion.span className="absolute inset-0 rounded-full" style={{ backgroundColor: accentColor, opacity: 0.16 }}
            animate={{ scale: [1, 1.3, 1], opacity: [0.16, 0, 0.16] }} transition={{ duration: 2.6, repeat: Infinity, ease: 'easeOut' }} />
          <motion.span className="absolute inset-0 rounded-full" style={{ backgroundColor: accentColor, opacity: 0.1 }}
            animate={{ scale: [1, 1.55, 1], opacity: [0.1, 0, 0.1] }} transition={{ duration: 2.6, repeat: Infinity, ease: 'easeOut', delay: 0.7 }} />
        </>
      )}

      <motion.span
        className="relative flex items-center justify-center rounded-full"
        style={{
          width: 168, height: 168,
          background: `radial-gradient(circle at 34% 28%, color-mix(in srgb, ${accentColor} 88%, white), ${accentColor} 58%, color-mix(in srgb, ${accentColor} 45%, black))`,
          boxShadow: `0 0 ${44 + amp * 120}px color-mix(in srgb, ${accentColor} ${Math.round(glow * 100)}%, transparent), inset 0 2px 24px color-mix(in srgb, white 28%, transparent), inset 0 -8px 24px color-mix(in srgb, black 22%, transparent)`,
        }}
        animate={reduceMotion ? undefined : { scale }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}
      >
        {/* Reflet lumineux */}
        <span className="absolute rounded-full" style={{ width: 64, height: 64, top: 26, left: 38, background: 'radial-gradient(circle, color-mix(in srgb, white 58%, transparent), transparent 70%)' }} aria-hidden />
        {muted && (
          <span className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full shadow-md"
            style={{ backgroundColor: 'var(--color-warning)', color: 'var(--bg-base)', border: '2px solid var(--bg-base)' }} title="Micro coupé">
            <MicOff className="h-4 w-4" />
          </span>
        )}
      </motion.span>
    </motion.button>
  );
}

// ─── Bouton rond (contrôles) ─────────────────────────────────────────────────────

function CircleButton({ onClick, disabled, active, title, label, children, reduceMotion }: {
  onClick: () => void; disabled?: boolean; active?: boolean; title: string; label: string; children: React.ReactNode; reduceMotion: boolean;
}) {
  return (
    <motion.button
      type="button" onClick={onClick} disabled={disabled}
      whileTap={reduceMotion || disabled ? undefined : { scale: 0.93 }}
      title={title} aria-label={label} aria-pressed={active}
      className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-lg)] transition-all duration-150 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
      style={{
        backgroundColor: active ? 'var(--accent-subtle)' : 'var(--bg-ctrl)',
        color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
        border: `1px solid ${active ? 'color-mix(in srgb, var(--accent-primary) 55%, transparent)' : 'var(--border-base)'}`,
        boxShadow: active ? 'var(--shadow-xs)' : 'none',
      }}
    >
      {children}
    </motion.button>
  );
}

// ─── Cartes du drawer d'activité ─────────────────────────────────────────────────

function StatPill({ icon, value, label, color }: { icon: React.ReactNode; value: number | string; label: string; color: string }) {
  return (
    <span className="flex items-center gap-1 text-xs font-medium" style={{ color }} title={label}>
      {icon}{value}
    </span>
  );
}

function MissionCard({ m, isOpen, onToggle }: { m: MissionActivity; isOpen: boolean; onToggle: () => void }) {
  const confColor = m.confidence >= 0.7 ? 'var(--color-success)' : m.confidence >= 0.4 ? 'var(--color-warning)' : 'var(--color-error)';
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)]" style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)', boxShadow: 'var(--shadow-xs)' }}>
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-[var(--radius-sm)]" style={{ backgroundColor: 'var(--accent-subtle)' }}>
            <Target className="h-3.5 w-3.5" style={{ color: 'var(--accent-primary)' }} />
          </span>
          <span className="flex-1 truncate text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{m.title}</span>
          <span className="font-mono text-xs font-bold" style={{ color: confColor }}>{Math.round(m.confidence * 100)}%</span>
        </div>

        {/* Barre de confiance */}
        <div className="mt-2 h-1 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--border-base)' }}>
          <motion.div className="h-full rounded-full" style={{ backgroundColor: confColor }}
            animate={{ width: `${Math.round(m.confidence * 100)}%` }} transition={{ type: 'spring', stiffness: 180, damping: 24 }} />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatPill icon={<ListChecks className="h-3 w-3" />} value={m.goalsCompleted} label="Objectifs terminés" color="var(--text-dimmed)" />
          <StatPill icon={<Zap className="h-3 w-3" />} value={m.actionsCompleted} label="Actions terminées" color="var(--text-dimmed)" />
          <StatPill icon={<Clock className="h-3 w-3" />} value={formatDuration(m.updatedAt - m.startedAt)} label="Durée" color="var(--text-dimmed)" />
        </div>

        {m.currentGoal && (
          <div className="mt-2 flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <Loader2 className="h-3 w-3 flex-shrink-0 animate-spin" style={{ color: 'var(--accent-primary)' }} />
            <span className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>{m.currentGoal}</span>
          </div>
        )}

        {m.log.length > 0 && (
          <button type="button" onClick={onToggle}
            className="mt-2 flex items-center gap-1 rounded-[var(--radius-sm)] text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)]"
            style={{ color: 'var(--text-muted)' }} aria-expanded={isOpen}>
            <ChevronRight className="h-3 w-3 transition-transform" style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }} />
            <History className="h-3 w-3" />
            {isOpen ? 'Masquer l\'historique' : `Historique (${m.log.length})`}
          </button>
        )}
      </div>

      {isOpen && m.log.length > 0 && (
        <ol className="flex flex-col gap-1.5 px-3 pb-3" style={{ borderTop: '1px solid var(--border-base)', paddingTop: 10 }}>
          {[...m.log].reverse().map((ev, i) => (
            <li key={i} className="flex items-start gap-2 text-xs">
              <span className="font-mono tabular-nums" style={{ color: 'var(--text-dimmed)' }}>{formatClock(ev.at)}</span>
              <span className="flex-1" style={{ color: 'var(--text-muted)' }}>{ev.label}</span>
              {typeof ev.confidence === 'number' && (
                <span className="font-mono font-semibold" style={{ color: 'var(--text-dimmed)' }}>{Math.round(ev.confidence * 100)}%</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function AgentCard({ task, isOpen, onToggle, reduceMotion }: { task: AgentTaskEntry; isOpen: boolean; onToggle: () => void; reduceMotion: boolean }) {
  const active = task.status === 'running' || task.status === 'pending';
  const hasMoreSteps = task.steps.length > 1;
  const color = statusColor(task.status);
  return (
    <motion.div initial={reduceMotion ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-[var(--radius-lg)]" style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)', boxShadow: 'var(--shadow-xs)' }}>
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-[var(--radius-sm)]" style={{ backgroundColor: 'color-mix(in srgb, ' + color + ' 14%, transparent)' }}>
            {active ? <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color }} />
              : task.status === 'completed' ? <CheckCircle2 className="h-3.5 w-3.5" style={{ color: 'var(--color-success)' }} />
              : <XCircle className="h-3.5 w-3.5" style={{ color }} />}
          </span>
          <span className="flex-1 truncate text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{task.agentName}</span>
          {task.durationMs != null && (
            <span className="flex items-center gap-1 font-mono text-xs tabular-nums" style={{ color: 'var(--text-dimmed)' }} title="Durée">
              <Clock className="h-3 w-3" />{formatDuration(task.durationMs)}
            </span>
          )}
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{ backgroundColor: 'color-mix(in srgb, ' + color + ' 14%, transparent)', color }}>
            {STATUS_LABEL_FR[task.status]}
          </span>
        </div>

        <div className="mt-1.5 flex items-center gap-1.5">
          {task.role && (
            <span className="rounded-[var(--radius-xs)] px-1.5 py-px font-mono text-[10px] uppercase tracking-wide" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-dimmed)' }}>
              {task.role}
            </span>
          )}
          <span className="flex-1 truncate text-xs" style={{ color: 'var(--text-muted)' }}>{task.title}</span>
        </div>

        {task.progress && (
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-dimmed)' }}>
              <span className="truncate">{task.progress.label}</span>
              <span className="ml-2 font-mono tabular-nums">{task.progress.current}/{task.progress.total}</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--border-base)' }}>
              <motion.div className="h-full rounded-full" style={{ backgroundColor: 'var(--color-accent-alt)' }}
                animate={{ width: `${Math.round(task.progress.current / Math.max(1, task.progress.total) * 100)}%` }} />
            </div>
          </div>
        )}

        {task.summary && <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>{task.summary}</p>}

        {task.steps.length > 0 && (
          <>
            <div className="mt-2 flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <Zap className="h-3 w-3 flex-shrink-0" style={{ color: 'var(--text-dimmed)' }} />
              <span className="flex-1 truncate text-xs" style={{ color: 'var(--text-muted)' }}>{task.steps[task.steps.length - 1]}</span>
            </div>
            {hasMoreSteps && (
              <button type="button" onClick={onToggle}
                className="mt-2 flex items-center gap-1 rounded-[var(--radius-sm)] text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)]"
                style={{ color: 'var(--text-muted)' }} aria-expanded={isOpen}>
                <ChevronRight className="h-3 w-3 transition-transform" style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }} />
                <History className="h-3 w-3" />
                {isOpen ? 'Masquer les étapes' : `Toutes les étapes (${task.steps.length})`}
              </button>
            )}
          </>
        )}
      </div>

      {isOpen && hasMoreSteps && (
        <ol className="flex flex-col gap-1.5 px-3 pb-3" style={{ borderTop: '1px solid var(--border-base)', paddingTop: 10 }}>
          {task.steps.map((step, i) => (
            <li key={i} className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span className="font-mono tabular-nums" style={{ color: 'var(--text-dimmed)' }}>{(i + 1).toString().padStart(2, '0')}</span>
              <span className="flex-1">{step}</span>
            </li>
          ))}
        </ol>
      )}
    </motion.div>
  );
}

// ─── Vue principale ────────────────────────────────────────────────────────────

const ACTIVITY_PANEL_KEY = 'Leanna_orb_activity_open';

export default function OrbLiveView() {
  const reduceMotion = useReducedMotion() ?? false;
  const { profile } = useProfile();
  const orb = useOrbState();
  const { status, connect, disconnect, muted, toggleMute, sendTextMessage } = useLiveAPIContext();
  const { isSharing, toggleScreenShare } = useScreenShare();

  // Store d'activité : écoute les événements agents/outils de CETTE fenêtre.
  useEffect(() => {
    initActivityStore();
    return () => destroyActivityStore();
  }, []);

  const agentTasks = useSyncExternalStore(subscribe, getAgentTasks, getAgentTasks);
  const toolActivities = useSyncExternalStore(subscribe, getToolActivities, getToolActivities);
  const missions = useMissionActivity();

  const [mode, setMode] = useState<'full' | 'ask'>(() => {
    try { return (localStorage.getItem('Leanna_mode') as 'full' | 'ask') || 'full'; } catch { return 'full'; }
  });
  const [draft, setDraft] = useState('');
  const [elapsed, setElapsed] = useState(0);

  // Drawer d'activité — MASQUÉ PAR DÉFAUT (restauré depuis localStorage si l'utilisateur l'avait ouvert).
  const [activityOpen, setActivityOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(ACTIVITY_PANEL_KEY) === '1'; } catch { return false; }
  });
  const toggleActivity = useCallback(() => {
    setActivityOpen(prev => {
      const next = !prev;
      try { localStorage.setItem(ACTIVITY_PANEL_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Expansion des cartes + nombre d'outils affichés.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showAllTools, setShowAllTools] = useState(false);
  const toggleExpanded = useCallback((id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const connected = status === 'connected';
  const connecting = status === 'connecting';

  useEffect(() => {
    if (!connected) { setElapsed(0); return; }
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [connected]);

  const elapsedLabel = useMemo(() => {
    const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const s = (elapsed % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }, [elapsed]);

  const handleToggleConnection = useCallback(() => {
    if (connected) disconnect();
    else if (!connecting) connect([], mode);
  }, [connected, connecting, disconnect, connect, mode]);

  const handleSelectMode = useCallback((next: 'full' | 'ask') => {
    setMode(next);
    try { localStorage.setItem('Leanna_mode', next); } catch { /* ignore */ }
  }, []);

  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text || !connected) return;
    sendTextMessage(text);
    setDraft('');
  }, [draft, connected, sendTextMessage]);

  const vizLevel = orb.isSpeaking ? orb.outputLevel : orb.inputLevel;

  // Données dérivées.
  const sortedAgents = useMemo(() => {
    const rank: Record<string, number> = { running: 0, pending: 1, failed: 2, completed: 3, cancelled: 4 };
    return [...agentTasks].sort((a, b) => (rank[a.status] - rank[b.status]) || (b.timestamp - a.timestamp));
  }, [agentTasks]);
  const allToolsReversed = useMemo(() => [...toolActivities].reverse(), [toolActivities]);
  const recentTools = useMemo(
    () => (showAllTools ? allToolsReversed.slice(0, 30) : allToolsReversed.slice(0, 8)),
    [allToolsReversed, showAllTools],
  );
  const activeMissions = useMemo(() => missions.filter(m => m.status === 'in_progress'), [missions]);

  const runningAgentsCount = useMemo(
    () => sortedAgents.filter(a => a.status === 'running' || a.status === 'pending').length,
    [sortedAgents],
  );
  const runningToolsCount = useMemo(() => toolActivities.filter(t => t.status === 'running').length, [toolActivities]);

  const hasActivity = sortedAgents.length > 0 || recentTools.length > 0 || activeMissions.length > 0;
  // Badge sur le bouton bascule : nombre total d'éléments « vivants ».
  const liveCount = activeMissions.length + runningAgentsCount + runningToolsCount;

  const subtitle = !connected
    ? 'Clique sur l\'orbe ou « Connecter » pour démarrer'
    : orb.isSpeaking ? `${profile.aiName || 'Leanna'} répond…`
    : muted ? 'Micro coupé'
    : orb.isListening ? 'À l\'écoute…' : 'En ligne';

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      {/* Colonne principale */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barre de titre (draggable Electron) */}
        <header className="flex flex-shrink-0 items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--border-base)', backgroundColor: 'var(--bg-sidebar)', ['WebkitAppRegion' as any]: 'drag' }}>
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)]" style={{ backgroundColor: 'var(--accent-subtle)' }}>
              <Radio className="h-4 w-4" style={{ color: 'var(--accent-primary)' }} />
            </span>
            <div className="flex flex-col leading-none">
              <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>{profile.aiName || 'Leanna'}</span>
              <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.2em]" style={{ color: 'var(--text-dimmed)' }}>Présence vocale</span>
            </div>
          </div>

          <div className="flex items-center gap-2" style={{ ['WebkitAppRegion' as any]: 'no-drag' }}>
            {connected && <span className="font-mono text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>{elapsedLabel}</span>}
            <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{
                backgroundColor: connected ? 'var(--color-success-subtle)' : connecting ? 'var(--color-warning-subtle)' : 'var(--bg-secondary)',
                color: connected ? 'var(--color-success)' : connecting ? 'var(--color-warning)' : 'var(--text-dimmed)',
              }}>
              <motion.span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'currentColor' }}
                animate={reduceMotion || !(connected || connecting) ? {} : { opacity: [1, 0.3, 1] }} transition={{ duration: 1.4, repeat: Infinity }} />
              {orb.statusLabel}
            </span>

            {/* Bascule du drawer d'activité */}
            <button type="button" onClick={toggleActivity} title="Afficher / masquer l'activité" aria-label="Basculer le panneau d'activité" aria-pressed={activityOpen}
              className="relative flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
              style={{
                backgroundColor: activityOpen ? 'var(--accent-subtle)' : 'transparent',
                color: activityOpen ? 'var(--accent-primary)' : 'var(--text-muted)',
                border: `1px solid ${activityOpen ? 'color-mix(in srgb, var(--accent-primary) 45%, transparent)' : 'var(--border-base)'}`,
              }}>
              <Activity className="h-4 w-4" />
              {!activityOpen && liveCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold"
                  style={{ backgroundColor: 'var(--accent-primary)', color: '#fff', boxShadow: '0 0 0 2px var(--bg-sidebar)' }}>
                  {liveCount}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Scène centrale */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-7 px-6 py-6">
          <Orb amp={orb.amp} accentColor={orb.accentColor} status={orb.status} muted={muted} onClick={handleToggleConnection} reduceMotion={reduceMotion} />

          <div className="flex flex-col items-center gap-2.5">
            <AudioBars level={vizLevel} color={orb.accentColor} active={connected} reduceMotion={reduceMotion} />
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{subtitle}</span>
          </div>

          {/* Contrôles */}
          <div className="flex items-center gap-3">
            <motion.button
              type="button" onClick={handleToggleConnection} whileTap={reduceMotion ? undefined : { scale: 0.97 }} disabled={connecting}
              className="flex items-center gap-2 rounded-[var(--radius-lg)] px-5 py-3 text-sm font-semibold transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
              style={{
                backgroundColor: connected ? 'color-mix(in srgb, var(--color-error) 14%, transparent)' : 'var(--accent-primary)',
                color: connected ? 'var(--color-error)' : '#fff',
                border: connected ? '1px solid color-mix(in srgb, var(--color-error) 40%, transparent)' : '1px solid transparent',
                boxShadow: connected ? 'none' : 'var(--shadow-sm)',
              }}>
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : connected ? <PhoneOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
              {connecting ? 'Connexion…' : connected ? 'Déconnecter' : 'Connecter'}
            </motion.button>

            <CircleButton onClick={toggleMute} disabled={!connected} active={!muted && connected}
              title={muted ? 'Réactiver le micro' : 'Couper le micro'} label={muted ? 'Réactiver le micro' : 'Couper le micro'} reduceMotion={reduceMotion}>
              {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </CircleButton>

            <CircleButton onClick={toggleScreenShare} active={isSharing}
              title={isSharing ? 'Arrêter le partage d\'écran' : 'Partager l\'écran'} label={isSharing ? 'Arrêter le partage d\'écran' : 'Partager l\'écran'} reduceMotion={reduceMotion}>
              {isSharing ? <MonitorX className="h-4 w-4" /> : <MonitorUp className="h-4 w-4" />}
            </CircleButton>

            <div className="flex items-center rounded-[var(--radius-lg)] p-1" style={{ backgroundColor: 'var(--bg-ctrl)', border: '1px solid var(--border-base)' }}>
              {(['full', 'ask'] as const).map(m => (
                <button key={m} type="button" onClick={() => handleSelectMode(m)}
                  title={m === 'full' ? 'Mode Full — agit directement' : 'Mode Ask — demande avant d\'agir'}
                  className="rounded-[var(--radius-md)] px-3.5 py-1.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                  style={{ backgroundColor: mode === m ? 'var(--accent-primary)' : 'transparent', color: mode === m ? '#fff' : 'var(--text-muted)' }}>
                  {m === 'full' ? 'Full' : 'Ask'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Saisie texte */}
        <div className="flex flex-shrink-0 items-center gap-2.5 px-5 py-4" style={{ borderTop: '1px solid var(--border-base)', backgroundColor: 'var(--bg-sidebar)' }}>
          <div className="relative flex flex-1 items-center">
            <input
              type="text" value={draft} onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSend(); } else if (e.key === 'Escape') { setDraft(''); } }}
              placeholder={connected ? 'Demande une action…  (Entrée pour envoyer)' : 'Connecte-toi pour écrire…'}
              disabled={!connected}
              className="w-full rounded-[var(--radius-lg)] px-4 py-3 text-sm outline-none transition-all disabled:opacity-50 focus:ring-2 focus:ring-[var(--accent-primary)]"
              style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
            />
          </div>
          <motion.button
            type="button" onClick={handleSend} whileTap={reduceMotion ? undefined : { scale: 0.95 }}
            disabled={!connected || !draft.trim()} title="Envoyer" aria-label="Envoyer le message"
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[var(--radius-lg)] transition-all disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            style={{ backgroundColor: 'var(--accent-primary)', color: '#fff', boxShadow: 'var(--shadow-sm)' }}>
            <Send className="h-4 w-4" />
          </motion.button>
        </div>
      </div>

      {/* ───────────── Drawer d'activité (masqué par défaut) ───────────── */}
      <AnimatePresence>
        {activityOpen && (
          <motion.aside
            key="activity-drawer"
            initial={reduceMotion ? { opacity: 0 } : { x: 360, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { x: 360, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className="flex h-full w-[340px] flex-shrink-0 flex-col"
            style={{ borderLeft: '1px solid var(--border-base)', backgroundColor: 'var(--bg-secondary)' }}
            aria-label="Activité des agents et missions"
          >
            {/* En-tête du drawer */}
            <div className="flex flex-shrink-0 items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border-base)', backgroundColor: 'var(--bg-sidebar)' }}>
              <Activity className="h-4 w-4" style={{ color: 'var(--accent-primary)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Activité</span>
              <div className="ml-auto flex items-center gap-2.5">
                {activeMissions.length > 0 && <StatPill icon={<Target className="h-3 w-3" />} value={activeMissions.length} label="Missions en cours" color="var(--accent-primary)" />}
                {runningAgentsCount > 0 && <StatPill icon={<Bot className="h-3 w-3" />} value={runningAgentsCount} label="Agents actifs" color="var(--color-accent-alt)" />}
                {runningToolsCount > 0 && <StatPill icon={<Wrench className="h-3 w-3" />} value={runningToolsCount} label="Outils en exécution" color="var(--color-success)" />}
                <button type="button" onClick={toggleActivity} title="Fermer" aria-label="Fermer le panneau d'activité"
                  className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                  style={{ color: 'var(--text-muted)' }}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Contenu */}
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto custom-scrollbar px-4 py-4">
              {!hasActivity ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center" style={{ color: 'var(--text-dimmed)' }}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }}>
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <p className="max-w-[220px] text-xs leading-relaxed">
                    {connected ? 'Aucune action en cours. Demande une tâche à l\'assistant.' : 'Connecte-toi pour suivre les actions des agents et missions.'}
                  </p>
                </div>
              ) : (
                <>
                  {activeMissions.length > 0 && (
                    <section className="flex flex-col gap-2">
                      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
                        <Target className="h-3 w-3" />Missions
                      </h3>
                      {activeMissions.map(m => (
                        <MissionCard key={m.missionId} m={m} isOpen={!!expanded[`mission:${m.missionId}`]} onToggle={() => toggleExpanded(`mission:${m.missionId}`)} />
                      ))}
                    </section>
                  )}

                  {sortedAgents.length > 0 && (
                    <section className="flex flex-col gap-2">
                      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
                        <Bot className="h-3 w-3" />Agents
                      </h3>
                      <AnimatePresence initial={false}>
                        {sortedAgents.map(task => (
                          <AgentCard key={task.id} task={task} isOpen={!!expanded[`agent:${task.id}`]} onToggle={() => toggleExpanded(`agent:${task.id}`)} reduceMotion={reduceMotion} />
                        ))}
                      </AnimatePresence>
                    </section>
                  )}

                  {recentTools.length > 0 && (
                    <section className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
                          <Wrench className="h-3 w-3" />Actions récentes
                        </h3>
                        <span className="font-mono text-[11px]" style={{ color: 'var(--text-dimmed)' }}>{allToolsReversed.length}</span>
                      </div>
                      <AnimatePresence initial={false}>
                        {recentTools.map(tool => {
                          const isOpen = !!expanded[`tool:${tool.id}`];
                          const durationMs = tool.endTimestamp ? tool.endTimestamp - tool.timestamp : undefined;
                          const hasDetails = !!(tool.result || (tool.args && Object.keys(tool.args).length > 0));
                          return (
                            <motion.div key={tool.id} initial={reduceMotion ? false : { opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}
                              className="rounded-[var(--radius-md)] px-2.5 py-2" style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }}>
                              <div className="flex items-center gap-2">
                                {tool.status === 'running'
                                  ? <Loader2 className="h-3 w-3 flex-shrink-0 animate-spin" style={{ color: 'var(--accent-primary)' }} />
                                  : <CheckCircle2 className="h-3 w-3 flex-shrink-0" style={{ color: 'var(--color-success)' }} />}
                                <span className="flex-1 truncate font-mono text-xs" style={{ color: 'var(--text-secondary)' }} title={tool.tool}>{tool.label}</span>
                                <span className="rounded-full px-1.5 py-px text-[10px] font-medium" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-dimmed)' }} title="Agent attribué">
                                  {getAgentDisplayName(tool.agentId)}
                                </span>
                                {tool.status === 'done' && durationMs != null && (
                                  <span className="font-mono text-xs tabular-nums" style={{ color: 'var(--text-dimmed)' }}>{formatDuration(durationMs)}</span>
                                )}
                              </div>
                              <div className="mt-1 flex items-center gap-2 pl-5">
                                <span className="font-mono text-[10px] tabular-nums" style={{ color: 'var(--text-dimmed)' }}>{formatClock(tool.timestamp)}</span>
                                {hasDetails && (
                                  <button type="button" onClick={() => toggleExpanded(`tool:${tool.id}`)}
                                    className="flex items-center gap-0.5 rounded text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)]"
                                    style={{ color: 'var(--text-muted)' }} aria-expanded={isOpen}>
                                    <ChevronRight className="h-2.5 w-2.5 transition-transform" style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }} />
                                    {isOpen ? 'Masquer' : 'Détails'}
                                  </button>
                                )}
                              </div>
                              {isOpen && hasDetails && (
                                <div className="mt-1.5 flex flex-col gap-1.5 pl-5">
                                  {tool.args && Object.keys(tool.args).length > 0 && (
                                    <pre className="max-h-24 overflow-auto rounded-[var(--radius-sm)] px-2 py-1.5 font-mono text-[10px] leading-snug custom-scrollbar"
                                      style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-muted)', border: '1px solid var(--border-base)' }}>
                                      {safeStringify(tool.args)}
                                    </pre>
                                  )}
                                  {tool.result && (
                                    <div className="rounded-[var(--radius-sm)] px-2 py-1.5 text-[11px] leading-snug" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-muted)', border: '1px solid var(--border-base)' }}>
                                      {tool.result.length > 300 ? tool.result.slice(0, 300) + '…' : tool.result}
                                    </div>
                                  )}
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                      {allToolsReversed.length > 8 && (
                        <button type="button" onClick={() => setShowAllTools(v => !v)}
                          className="self-start rounded text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)]"
                          style={{ color: 'var(--accent-primary)' }}>
                          {showAllTools ? 'Réduire' : `Voir plus (${allToolsReversed.length - recentTools.length})`}
                        </button>
                      )}
                    </section>
                  )}
                </>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
