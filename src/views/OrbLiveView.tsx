import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Mic, MicOff, Power, PhoneOff, Send, Sparkles, Loader2, Radio,
  MonitorUp, MonitorX, Keyboard, Target, Bot, Zap, CheckCircle2, XCircle, Activity,
  ChevronRight, Clock, Wrench, ListChecks, History,
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
 * Affiche : orb animé réactif à l'audio, contrôles (connexion, micro, partage
 * d'écran, mode Full/Ask), visualiseur audio, saisie texte, et un flux en
 * direct de l'ACTIVITÉ DES AGENTS & MISSIONS (missions en cours, tâches
 * d'agents, actions/outils récents) — alimenté par le même agentActivityStore
 * que l'IDE, via les événements émis par la session live de cette fenêtre.
 *
 * Design : conforme au design system (tokens CSS, rayons/ombres standardisés,
 * focus visible, prefers-reduced-motion).
 */

// ─── Suivi des missions (reprend la logique de AgentActivityOverlay) ───────────

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

// ─── Formatage de durée (ms → libellé compact) ─────────────────────────────────

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

// ─── Visualiseur audio ─────────────────────────────────────────────────────────

function AudioBars({ level, color, active, reduceMotion }: {
  level: number; color: string; active: boolean; reduceMotion: boolean;
}) {
  const weights = useMemo(() => [0.45, 0.7, 0.9, 1, 0.9, 0.7, 0.45], []);
  return (
    <div className="flex items-end justify-center gap-1" style={{ height: 28 }} aria-hidden>
      {weights.map((w, i) => {
        const target = active ? Math.max(0.12, Math.min(1, level * w * 2.4)) : 0.12;
        return (
          <motion.span
            key={i}
            className="w-1 rounded-full"
            style={{ backgroundColor: color, transformOrigin: 'bottom' }}
            animate={reduceMotion ? { height: 6 } : { height: 6 + target * 22 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
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
  const scale = 1 + Math.min(0.18, amp * 0.6);
  const glow = 0.35 + Math.min(0.5, amp * 1.2);
  const pulsing = status === 'online' || status === 'listening' || status === 'speaking' || status === 'busy';

  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="relative flex items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]"
      style={{ width: 200, height: 200, cursor: 'pointer' }}
      whileTap={reduceMotion ? undefined : { scale: 0.96 }}
      aria-label={status === 'idle' ? 'Connecter la présence vocale' : 'Déconnecter la présence vocale'}
    >
      {!reduceMotion && pulsing && (
        <>
          <motion.span className="absolute inset-0 rounded-full" style={{ backgroundColor: accentColor, opacity: 0.18 }}
            animate={{ scale: [1, 1.35, 1], opacity: [0.18, 0, 0.18] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }} />
          <motion.span className="absolute inset-0 rounded-full" style={{ backgroundColor: accentColor, opacity: 0.12 }}
            animate={{ scale: [1, 1.6, 1], opacity: [0.12, 0, 0.12] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut', delay: 0.6 }} />
        </>
      )}
      <motion.span
        className="relative flex items-center justify-center rounded-full"
        style={{
          width: 160, height: 160,
          background: `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${accentColor} 85%, white), ${accentColor} 60%, color-mix(in srgb, ${accentColor} 50%, black))`,
          boxShadow: `0 0 ${40 + amp * 120}px color-mix(in srgb, ${accentColor} ${Math.round(glow * 100)}%, transparent), inset 0 2px 20px color-mix(in srgb, white 25%, transparent)`,
        }}
        animate={reduceMotion ? undefined : { scale }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}
      >
        <span className="absolute rounded-full" style={{ width: 60, height: 60, top: 26, left: 36, background: 'radial-gradient(circle, color-mix(in srgb, white 55%, transparent), transparent 70%)' }} aria-hidden />
        {muted && (
          <span className="absolute bottom-2.5 right-2.5 flex h-7 w-7 items-center justify-center rounded-full shadow-sm"
            style={{ backgroundColor: 'var(--color-warning)', color: 'var(--bg-base)' }} title="Micro coupé">
            <MicOff className="h-3.5 w-3.5" />
          </span>
        )}
      </motion.span>
    </motion.button>
  );
}

// ─── Bouton rond ────────────────────────────────────────────────────────────────

function CircleButton({ onClick, disabled, active, title, label, children, reduceMotion }: {
  onClick: () => void; disabled?: boolean; active?: boolean; title: string; label: string; children: React.ReactNode; reduceMotion: boolean;
}) {
  return (
    <motion.button
      type="button" onClick={onClick} disabled={disabled}
      whileTap={reduceMotion || disabled ? undefined : { scale: 0.94 }}
      title={title} aria-label={label} aria-pressed={active}
      className="flex h-11 w-11 items-center justify-center rounded-xl transition-all disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
      style={{
        backgroundColor: active ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
        color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
        border: `1px solid ${active ? 'var(--accent-primary)' : 'var(--border-base)'}`,
      }}
    >
      {children}
    </motion.button>
  );
}

// ─── Statut d'une tâche d'agent → couleur sémantique ───────────────────────────

function statusColor(status: AgentTaskEntry['status']): string {
  switch (status) {
    case 'completed': return 'var(--color-success)';
    case 'failed': return 'var(--color-error)';
    case 'cancelled': return 'var(--text-dimmed)';
    default: return 'var(--accent-primary)';
  }
}

// ─── Vue principale ────────────────────────────────────────────────────────────

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

  // Suivi détaillé : cartes dépliées (agents / missions) et nombre d'outils affichés.
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

  // Agents actifs d'abord, puis récents (terminés) ; outils les plus récents en tête.
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

  // Compteurs d'en-tête détaillés.
  const runningAgentsCount = useMemo(
    () => sortedAgents.filter(a => a.status === 'running' || a.status === 'pending').length,
    [sortedAgents],
  );
  const runningToolsCount = useMemo(
    () => toolActivities.filter(t => t.status === 'running').length,
    [toolActivities],
  );

  const hasActivity = sortedAgents.length > 0 || recentTools.length > 0 || activeMissions.length > 0;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      {/* Barre de titre (draggable Electron) */}
      <div className="flex flex-shrink-0 items-center justify-between px-4 py-2.5"
        style={{ borderBottom: '1px solid var(--border-base)', backgroundColor: 'var(--bg-panel)', ['WebkitAppRegion' as any]: 'drag' }}>
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md" style={{ backgroundColor: 'var(--accent-subtle)' }}>
            <Radio className="h-3.5 w-3.5" style={{ color: 'var(--accent-primary)' }} />
          </span>
          <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>{profile.aiName || 'Leanna'}</span>
          <span className="text-xs font-medium uppercase tracking-[0.18em]" style={{ color: 'var(--text-dimmed)' }}>Présence vocale</span>
        </div>
        <div className="flex items-center gap-2" style={{ ['WebkitAppRegion' as any]: 'no-drag' }}>
          {connected && <span className="font-mono text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>{elapsedLabel}</span>}
          <span className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{
              backgroundColor: connected ? 'var(--color-success-subtle)' : connecting ? 'var(--color-warning-subtle)' : 'var(--bg-secondary)',
              color: connected ? 'var(--color-success)' : connecting ? 'var(--color-warning)' : 'var(--text-dimmed)',
            }}>
            <motion.span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'currentColor' }}
              animate={reduceMotion || !(connected || connecting) ? {} : { opacity: [1, 0.3, 1] }} transition={{ duration: 1.4, repeat: Infinity }} />
            {orb.statusLabel}
          </span>
        </div>
      </div>

      {/* Zone orb */}
      <div className="flex flex-shrink-0 flex-col items-center justify-center gap-5 px-6 pt-6 pb-4">
        <Orb amp={orb.amp} accentColor={orb.accentColor} status={orb.status} muted={muted} onClick={handleToggleConnection} reduceMotion={reduceMotion} />

        <div className="flex flex-col items-center gap-2">
          <AudioBars level={vizLevel} color={orb.accentColor} active={connected} reduceMotion={reduceMotion} />
          <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
            {!connected ? 'Clique sur l\'orbe ou « Connecter » pour démarrer'
              : orb.isSpeaking ? `${profile.aiName || 'Leanna'} répond…`
              : muted ? 'Micro coupé'
              : orb.isListening ? 'À l\'écoute…' : 'En ligne'}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <motion.button
            type="button" onClick={handleToggleConnection} whileTap={reduceMotion ? undefined : { scale: 0.96 }} disabled={connecting}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            style={{
              backgroundColor: connected ? 'color-mix(in srgb, var(--color-error) 14%, transparent)' : 'var(--accent-primary)',
              color: connected ? 'var(--color-error)' : '#fff',
              border: connected ? '1px solid color-mix(in srgb, var(--color-error) 40%, transparent)' : '1px solid transparent',
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

          <div className="flex items-center rounded-xl p-0.5" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)' }}>
            {(['full', 'ask'] as const).map(m => (
              <button key={m} type="button" onClick={() => handleSelectMode(m)}
                title={m === 'full' ? 'Mode Full — agit directement' : 'Mode Ask — demande avant d\'agir'}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                style={{ backgroundColor: mode === m ? 'var(--accent-primary)' : 'transparent', color: mode === m ? '#fff' : 'var(--text-muted)' }}>
                {m === 'full' ? 'Full' : 'Ask'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Panneau Activité des agents & missions */}
      <div className="flex min-h-0 flex-1 flex-col" style={{ borderTop: '1px solid var(--border-base)', backgroundColor: 'var(--bg-secondary)' }}>
        <div className="flex flex-shrink-0 items-center gap-1.5 px-4 py-1.5" style={{ borderBottom: '1px solid var(--border-base)' }}>
          <Activity className="h-3.5 w-3.5" style={{ color: 'var(--accent-primary)' }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>Activité</span>
          <div className="ml-auto flex items-center gap-2.5">
            {activeMissions.length > 0 && (
              <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--accent-primary)' }} title="Missions en cours">
                <Target className="h-3 w-3" />{activeMissions.length}
              </span>
            )}
            {runningAgentsCount > 0 && (
              <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--color-accent-alt)' }} title="Agents actifs">
                <Bot className="h-3 w-3" />{runningAgentsCount}
              </span>
            )}
            {runningToolsCount > 0 && (
              <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--color-success)' }} title="Outils en exécution">
                <Wrench className="h-3 w-3" />{runningToolsCount}
              </span>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto custom-scrollbar px-4 py-3">
          {!hasActivity ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center text-xs" style={{ color: 'var(--text-dimmed)' }}>
              <Sparkles className="h-4 w-4" />
              {connected ? 'Aucune action en cours. Demande une tâche à l\'assistant.' : 'Connecte-toi pour suivre les actions des agents et missions.'}
            </div>
          ) : (
            <>
              {/* Missions */}
              {activeMissions.length > 0 && (
                <section className="flex flex-col gap-1.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>Missions</h3>
                  {activeMissions.map(m => {
                    const isOpen = !!expanded[`mission:${m.missionId}`];
                    return (
                    <div key={m.missionId} className="rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }}>
                      <div className="flex items-center gap-2">
                        <Target className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--accent-primary)' }} />
                        <span className="flex-1 truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{m.title}</span>
                        <span className="font-mono text-xs font-bold"
                          style={{ color: m.confidence >= 0.7 ? 'var(--color-success)' : m.confidence >= 0.4 ? 'var(--color-warning)' : 'var(--color-error)' }}>
                          {Math.round(m.confidence * 100)}%
                        </span>
                      </div>

                      {/* Métriques : objectifs, actions, durée écoulée */}
                      <div className="mt-1.5 ml-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--text-dimmed)' }}>
                        <span className="flex items-center gap-1" title="Objectifs terminés">
                          <ListChecks className="h-3 w-3" />{m.goalsCompleted} obj.
                        </span>
                        <span className="flex items-center gap-1" title="Actions terminées">
                          <Zap className="h-3 w-3" />{m.actionsCompleted} act.
                        </span>
                        <span className="flex items-center gap-1" title="Durée depuis le démarrage">
                          <Clock className="h-3 w-3" />{formatDuration(m.updatedAt - m.startedAt)}
                        </span>
                      </div>

                      {m.currentGoal && (
                        <div className="mt-1 ml-5 flex items-center gap-1.5">
                          <Loader2 className="h-2.5 w-2.5 animate-spin" style={{ color: 'var(--accent-primary)' }} />
                          <span className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>{m.currentGoal}</span>
                        </div>
                      )}
                      {m.lastAction && (
                        <div className="mt-0.5 ml-5 flex items-center gap-1.5">
                          <Zap className="h-2.5 w-2.5" style={{ color: 'var(--text-dimmed)' }} />
                          <span className="truncate font-mono text-xs" style={{ color: 'var(--text-dimmed)' }}>{m.lastAction}</span>
                        </div>
                      )}

                      {/* Historique déroulant des événements de la mission */}
                      {m.log.length > 0 && (
                        <>
                          <button type="button" onClick={() => toggleExpanded(`mission:${m.missionId}`)}
                            className="mt-1.5 ml-5 flex items-center gap-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)] rounded"
                            style={{ color: 'var(--text-muted)' }} aria-expanded={isOpen}>
                            <ChevronRight className="h-3 w-3 transition-transform" style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }} />
                            <History className="h-3 w-3" />
                            {isOpen ? 'Masquer l\'historique' : `Historique (${m.log.length})`}
                          </button>
                          {isOpen && (
                            <ol className="mt-1 ml-5 flex flex-col gap-1 border-l pl-3" style={{ borderColor: 'var(--border-base)' }}>
                              {[...m.log].reverse().map((ev, i) => (
                                <li key={i} className="flex items-start gap-1.5 text-xs">
                                  <span className="font-mono tabular-nums" style={{ color: 'var(--text-dimmed)' }}>{formatClock(ev.at)}</span>
                                  <span className="flex-1" style={{ color: 'var(--text-muted)' }}>{ev.label}</span>
                                  {typeof ev.confidence === 'number' && (
                                    <span className="font-mono" style={{ color: 'var(--text-dimmed)' }}>{Math.round(ev.confidence * 100)}%</span>
                                  )}
                                </li>
                              ))}
                            </ol>
                          )}
                        </>
                      )}
                    </div>
                    );
                  })}
                </section>
              )}

              {/* Agents */}
              {sortedAgents.length > 0 && (
                <section className="flex flex-col gap-1.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>Agents</h3>
                  <AnimatePresence initial={false}>
                    {sortedAgents.map(task => {
                      const active = task.status === 'running' || task.status === 'pending';
                      const isOpen = !!expanded[`agent:${task.id}`];
                      const hasMoreSteps = task.steps.length > 1;
                      return (
                        <motion.div key={task.id} initial={reduceMotion ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                          className="rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }}>
                          <div className="flex items-center gap-2">
                            {active ? <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin" style={{ color: statusColor(task.status) }} />
                              : task.status === 'completed' ? <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--color-success)' }} />
                              : <XCircle className="h-3.5 w-3.5 flex-shrink-0" style={{ color: statusColor(task.status) }} />}
                            <span className="flex-1 truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{task.agentName}</span>
                            {task.durationMs != null && (
                              <span className="flex items-center gap-1 font-mono text-xs tabular-nums" style={{ color: 'var(--text-dimmed)' }} title="Durée">
                                <Clock className="h-3 w-3" />{formatDuration(task.durationMs)}
                              </span>
                            )}
                            <span className="rounded px-1.5 py-0.5 text-xs font-semibold"
                              style={{ backgroundColor: 'color-mix(in srgb, ' + statusColor(task.status) + ' 14%, transparent)', color: statusColor(task.status) }}>
                              {task.status}
                            </span>
                          </div>

                          {/* Rôle technique + titre de la tâche */}
                          <div className="mt-0.5 ml-5 flex items-center gap-1.5">
                            {task.role && (
                              <span className="rounded px-1 py-px font-mono text-[10px] uppercase tracking-wide" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-dimmed)' }}>
                                {task.role}
                              </span>
                            )}
                            <span className="flex-1 truncate text-xs" style={{ color: 'var(--text-muted)' }}>{task.title}</span>
                          </div>

                          {task.progress && (
                            <div className="mt-1 ml-5">
                              <div className="flex items-center justify-between">
                                <span className="truncate text-xs" style={{ color: 'var(--text-dimmed)' }}>{task.progress.label}</span>
                                <span className="ml-2 font-mono text-xs tabular-nums" style={{ color: 'var(--text-dimmed)' }}>
                                  {task.progress.current}/{task.progress.total}
                                </span>
                              </div>
                              <div className="mt-0.5 h-1 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--border-base)' }}>
                                <motion.div className="h-full rounded-full" style={{ backgroundColor: 'var(--color-accent-alt)' }}
                                  animate={{ width: `${Math.round(task.progress.current / Math.max(1, task.progress.total) * 100)}%` }} />
                              </div>
                            </div>
                          )}

                          {/* Résumé (si terminé) */}
                          {task.summary && (
                            <p className="mt-1 ml-5 text-xs" style={{ color: 'var(--text-muted)' }}>{task.summary}</p>
                          )}

                          {/* Dernière étape + historique dépliable */}
                          {task.steps.length > 0 && (
                            <>
                              <div className="mt-0.5 ml-5 flex items-center gap-1.5">
                                <Zap className="h-2.5 w-2.5 flex-shrink-0" style={{ color: 'var(--text-dimmed)' }} />
                                <span className="flex-1 truncate text-xs" style={{ color: 'var(--text-dimmed)' }}>
                                  {task.steps[task.steps.length - 1]}
                                </span>
                              </div>
                              {hasMoreSteps && (
                                <button type="button" onClick={() => toggleExpanded(`agent:${task.id}`)}
                                  className="mt-1 ml-5 flex items-center gap-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)] rounded"
                                  style={{ color: 'var(--text-muted)' }} aria-expanded={isOpen}>
                                  <ChevronRight className="h-3 w-3 transition-transform" style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }} />
                                  <History className="h-3 w-3" />
                                  {isOpen ? 'Masquer les étapes' : `Toutes les étapes (${task.steps.length})`}
                                </button>
                              )}
                              {isOpen && hasMoreSteps && (
                                <ol className="mt-1 ml-5 flex flex-col gap-1 border-l pl-3" style={{ borderColor: 'var(--border-base)' }}>
                                  {task.steps.map((step, i) => (
                                    <li key={i} className="flex items-start gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                                      <span className="font-mono tabular-nums" style={{ color: 'var(--text-dimmed)' }}>{(i + 1).toString().padStart(2, '0')}</span>
                                      <span className="flex-1">{step}</span>
                                    </li>
                                  ))}
                                </ol>
                              )}
                            </>
                          )}
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </section>
              )}

              {/* Actions / outils récents */}
              {recentTools.length > 0 && (
                <section className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>Actions récentes</h3>
                    <span className="font-mono text-xs" style={{ color: 'var(--text-dimmed)' }}>{allToolsReversed.length}</span>
                  </div>
                  <AnimatePresence initial={false}>
                    {recentTools.map(tool => {
                      const isOpen = !!expanded[`tool:${tool.id}`];
                      const durationMs = tool.endTimestamp ? tool.endTimestamp - tool.timestamp : undefined;
                      const hasDetails = !!(tool.result || (tool.args && Object.keys(tool.args).length > 0));
                      return (
                      <motion.div key={tool.id} initial={reduceMotion ? false : { opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}
                        className="rounded-md px-2.5 py-1.5" style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }}>
                        <div className="flex items-center gap-2">
                          {tool.status === 'running'
                            ? <Loader2 className="h-3 w-3 flex-shrink-0 animate-spin" style={{ color: 'var(--accent-primary)' }} />
                            : <CheckCircle2 className="h-3 w-3 flex-shrink-0" style={{ color: 'var(--color-success)' }} />}
                          <span className="flex-1 truncate font-mono text-xs" style={{ color: 'var(--text-secondary)' }} title={tool.tool}>{tool.label}</span>
                          <span className="rounded px-1 py-px text-[10px] font-medium" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-dimmed)' }} title="Agent attribué">
                            {getAgentDisplayName(tool.agentId)}
                          </span>
                          {tool.status === 'done' && durationMs != null && (
                            <span className="font-mono text-xs tabular-nums" style={{ color: 'var(--text-dimmed)' }}>
                              {formatDuration(durationMs)}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 ml-5 flex items-center gap-2">
                          <span className="font-mono text-[10px] tabular-nums" style={{ color: 'var(--text-dimmed)' }}>{formatClock(tool.timestamp)}</span>
                          {hasDetails && (
                            <button type="button" onClick={() => toggleExpanded(`tool:${tool.id}`)}
                              className="flex items-center gap-0.5 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)] rounded"
                              style={{ color: 'var(--text-muted)' }} aria-expanded={isOpen}>
                              <ChevronRight className="h-2.5 w-2.5 transition-transform" style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }} />
                              {isOpen ? 'Masquer' : 'Détails'}
                            </button>
                          )}
                        </div>
                        {isOpen && hasDetails && (
                          <div className="mt-1 ml-5 flex flex-col gap-1">
                            {tool.args && Object.keys(tool.args).length > 0 && (
                              <pre className="max-h-24 overflow-auto rounded px-2 py-1 font-mono text-[10px] leading-snug custom-scrollbar"
                                style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-muted)', border: '1px solid var(--border-base)' }}>
                                {safeStringify(tool.args)}
                              </pre>
                            )}
                            {tool.result && (
                              <div className="rounded px-2 py-1 text-[11px] leading-snug" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-muted)', border: '1px solid var(--border-base)' }}>
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
                      className="mt-0.5 self-start text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)] rounded"
                      style={{ color: 'var(--accent-primary)' }}>
                      {showAllTools ? 'Réduire' : `Voir plus (${allToolsReversed.length - recentTools.length})`}
                    </button>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </div>

      {/* Saisie texte */}
      <div className="flex flex-shrink-0 items-center gap-2 px-4 py-3" style={{ borderTop: '1px solid var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
        <div className="relative flex flex-1 items-center">
          <input
            type="text" value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSend(); } else if (e.key === 'Escape') { setDraft(''); } }}
            placeholder={connected ? 'Demande une action…  (Entrée pour envoyer)' : 'Connecte-toi pour écrire…'}
            disabled={!connected}
            className="w-full rounded-xl px-3 py-2.5 pr-9 text-sm outline-none transition-all disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
          />
          <Keyboard className="absolute right-3 h-3.5 w-3.5 opacity-40" style={{ color: 'var(--text-muted)' }} aria-hidden />
        </div>
        <motion.button
          type="button" onClick={handleSend} whileTap={reduceMotion ? undefined : { scale: 0.95 }}
          disabled={!connected || !draft.trim()} title="Envoyer" aria-label="Envoyer le message"
          className="flex h-11 w-11 items-center justify-center rounded-xl shadow-sm transition-all disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
          style={{ backgroundColor: 'var(--accent-primary)', color: '#fff' }}>
          <Send className="h-4 w-4" />
        </motion.button>
      </div>
    </div>
  );
}
