/**
 * AgentFleetPanel — Tableau de bord de la flotte d'agents autonomes (Modal)
 *
 * Onglets :
 * - Flotte   : statut temps réel de chaque agent
 * - Bus      : messages inter-agents
 * - Métriques: taux de succès, dead-letter, subscriptions
 */
import { useState, useEffect, useCallback, useRef, useMemo, useSyncExternalStore } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Users, Radio, BarChart3, RefreshCw, Loader2, X,
  AlertTriangle, ArrowRight, Zap, FlaskConical, FileText,
  Shield, Eye, Building2, Mail, Inbox, Bell, BellOff, Clock,
  CheckCircle2, ChevronRight, Hourglass,
} from 'lucide-react';
import { useAgentNotifications } from '../../hooks/useAgentNotifications.js';
import { getAgentTasks, subscribe, type AgentTaskEntry } from '../../stores/agentActivityStore.js';
import { MissionDetail, formatMs } from './MissionDetail.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentStat {
  role: string;
  name: string;
  status: 'idle' | 'busy' | 'overloaded' | 'offline';
  isOnline: boolean;
  runningTasks: number;
  queuedTasks: number;
  delegatedSubTasks: number;
  delegationSuccess: number;
}

interface FleetStatus {
  initialized: boolean;
  summary?: { totalAgents: number; online: number; idle: number; busy: number; overloaded: number };
  agents?: AgentStat[];
  busMetrics?: BusMetrics;
  recommendation?: string;
  message?: string;
}

interface BusMetrics {
  totalMessages: number;
  successRate: number;
  successRatePercent?: number;
  byAgentRole: Record<string, number>;
  byMessageType: Record<string, number>;
  pendingRequests: number;
  activeSubscriptions: number;
  deadLetterQueue?: Record<string, number>;
}

interface BusMessage {
  id: string;
  type: string;
  from: string;
  to: string;
  priority: string;
  timestamp: string;
  summary: string;
  hasCorrelation: boolean;
  isAutonomous: boolean;
}

interface IncomingAgentEvent {
  type: 'agent_event';
  eventId?: number;
  event: string;
  taskId: string;
  role: string;
  title: string;
  status: string;
  agentName: string;
  detail?: string;
  timestamp: string;
  summary?: string;
  durationMs?: number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const ROLE_META: Record<string, { icon: any; color: string; label: string }> = {
  test:      { icon: FlaskConical, color: 'var(--color-success)', label: 'Tests' },
  docs:      { icon: FileText,     color: 'var(--color-info)', label: 'Docs' },
  refactor:  { icon: RefreshCw,    color: 'var(--color-warning)', label: 'Refactor' },
  security:  { icon: Shield,       color: 'var(--color-error)', label: 'Sécurité' },
  review:    { icon: Eye,          color: 'var(--color-accent-alt)', label: 'Review' },
  architect: { icon: Building2,    color: 'var(--color-warning)', label: 'Architect' },
};

const STATUS_LABEL: Record<AgentStat['status'], string> = {
  idle: 'Libre', busy: 'Occupé', overloaded: 'Surchargé', offline: 'Hors ligne',
};

const STATUS_COLOR: Record<AgentStat['status'], string> = {
  idle: 'var(--color-success)', busy: 'var(--color-warning)', overloaded: 'var(--color-error)', offline: 'var(--text-dimmed)',
};

const TYPE_LABEL: Record<string, string> = {
  task_request: 'Demande', task_response: 'Réponse', collaboration_request: 'Collaboration',
  status_query: 'État', status_response: 'État', broadcast: 'Diffusion', event: 'Événement',
};

const TYPE_COLOR: Record<string, string> = {
  task_request:          'var(--color-info)',
  task_response:         'var(--color-success)',
  collaboration_request: 'var(--color-warning)',
  status_query:          'var(--text-muted)',
  status_response:       'var(--text-muted)',
  broadcast:             'var(--color-warning)',
  event:                 'var(--color-accent-alt)',
};

function apiHeaders(): Record<string, string> {
  const token = localStorage.getItem('Leanna_api_token');
  return token ? { 'x-Leanna-token': token } : {};
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: apiHeaders() });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface AgentFleetPanelProps {
  /** Rendu en overlay modal centré. */
  inline?: boolean;
  /** Rendu en panneau latéral docké (comme le panneau Missions). */
  docked?: boolean;
  onClose?: () => void;
}

export function AgentFleetPanel({ inline = false, docked = false, onClose }: AgentFleetPanelProps) {
  const [tab, setTab] = useState<'fleet' | 'bus' | 'metrics'>('fleet');
  const [fleet, setFleet] = useState<FleetStatus | null>(null);
  const [messages, setMessages] = useState<BusMessage[]>([]);
  const [metrics, setMetrics] = useState<BusMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const busRef = useRef<HTMLDivElement>(null);
  const processedEventIds = useRef<Set<string>>(new Set());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prefersReducedMotion = useReducedMotion();

  // Transition des onglets : simple fondu, neutralisé si mouvement réduit.
  const tabFade = prefersReducedMotion
    ? { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 1 } }
    : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };

  const { permission, requestPermission } = useAgentNotifications({
    notifyOnComplete: notificationsEnabled,
    notifyOnFailed: notificationsEnabled,
    notifyOnStart: false,
  });

  const handleToggleNotifications = useCallback(() => {
    if (!notificationsEnabled && permission !== 'granted') {
      requestPermission().then(p => {
        if (p === 'granted') setNotificationsEnabled(true);
      });
    } else {
      setNotificationsEnabled(prev => !prev);
    }
  }, [notificationsEnabled, permission, requestPermission]);

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fleetData, msgData, metricsData] = await Promise.all([
        fetchJSON<FleetStatus>('/api/agents/fleet'),
        fetchJSON<{ messages: BusMessage[] }>('/api/agents/bus/history?limit=50'),
        fetchJSON<BusMetrics>('/api/agents/bus/metrics'),
      ]);
      setFleet(fleetData);
      setMessages(msgData.messages ?? []);
      setMetrics(metricsData);
    } catch (e: any) {
      setError(e.message ?? 'Erreur réseau');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── WebSocket events ────────────────────────────────────────────────────────
  useEffect(() => {
    const handleAgentEvent = (e: Event) => {
      const ev = (e as CustomEvent<IncomingAgentEvent>).detail;
      if (!ev || ev.type !== 'agent_event') return;
      const eventKey = ev.eventId !== undefined ? `event:${ev.eventId}` : `${ev.taskId}:${ev.event}:${ev.timestamp}`;
      if (processedEventIds.current.has(eventKey)) return;
      processedEventIds.current.add(eventKey);
      if (processedEventIds.current.size > 1000) {
        const oldest = processedEventIds.current.values().next().value;
        if (oldest) processedEventIds.current.delete(oldest);
      }

      if (ev.detail?.startsWith('bus:')) {
        const parts = ev.detail.split(':');
        const msgType = parts[1] ?? 'event';
        const fromRole = parts[2] ?? ev.role;
        const toRole = parts[3] ?? '?';
        const isAuto = parts[4] === 'auto';
        if (msgType === 'status_query' || msgType === 'broadcast') return;

        const busMsg: BusMessage = {
          id: `bus-${ev.taskId}`,
          type: msgType,
          from: fromRole,
          to: toRole,
          priority: 'medium',
          timestamp: ev.timestamp,
          summary: ev.title.replace('[bus] ', ''),
          hasCorrelation: false,
          isAutonomous: isAuto,
        };
        setMessages(prev => {
          if (prev.some(m => m.id === busMsg.id)) return prev;
          return [...prev.slice(-99), busMsg];
        });
        return;
      }

      setFleet(prev => {
        if (!prev?.agents) return prev;
        const agents = prev.agents.map(a => {
          if (a.role !== ev.role) return a;
          const started = ev.event === 'task_started';
          const terminal = ev.event === 'task_completed' || ev.event === 'task_failed' || ev.event === 'task_cancelled';
          const runningTasks = Math.max(0, a.runningTasks + (started ? 1 : terminal ? -1 : 0));
          // One task finishing must not mark an agent idle while other work remains.
          const status: AgentStat['status'] = !a.isOnline
            ? 'offline'
            : runningTasks > 0
              ? (a.status === 'overloaded' ? 'overloaded' : 'busy')
              : 'idle';
          return {
            ...a,
            status,
            runningTasks,
            delegationSuccess: ev.event === 'task_completed' ? a.delegationSuccess + 1 : a.delegationSuccess,
          };
        });
        const online = agents.filter(a => a.isOnline).length;
        const idle = agents.filter(a => a.status === 'idle').length;
        const busy = agents.filter(a => a.status === 'busy').length;
        const overloaded = agents.filter(a => a.status === 'overloaded').length;
        return { ...prev, agents, summary: prev.summary ? { ...prev.summary, online, idle, busy, overloaded } : prev.summary };
      });

      const syntheticEvent: BusMessage = {
        id: `ev-${ev.taskId}-${ev.event}-${ev.timestamp}`,
        type: 'event',
        from: ev.role,
        to: 'orchestrator',
        priority: 'medium',
        timestamp: ev.timestamp,
        summary: `${ev.agentName}: ${ev.event.replace('task_', '')} — ${ev.title}${ev.durationMs ? ` (${(ev.durationMs / 1000).toFixed(1)}s)` : ''}`,
        hasCorrelation: false,
        isAutonomous: false,
      };
      setMessages(prev => {
        if (prev.some(m => m.id === syntheticEvent.id)) return prev;
        return [...prev.slice(-99), syntheticEvent];
      });

      setTimeout(() => {
        fetchJSON<BusMetrics>('/api/agents/bus/metrics').then(setMetrics).catch((err) => {
          console.debug('[AgentFleetPanel] Failed to fetch bus metrics:', err);
        });
      }, 400);
    };

    window.addEventListener('Leanna-agent-event', handleAgentEvent);
    return () => window.removeEventListener('Leanna-agent-event', handleAgentEvent);
  }, []);

  // ── Polling ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [refresh]);

  useEffect(() => {
    if (tab === 'bus' && busRef.current) {
      busRef.current.scrollTop = busRef.current.scrollHeight;
    }
  }, [messages, tab]);

  // Missions connues localement (temps réel) : rattachées à chaque agent
  const tasks = useSyncExternalStore(subscribe, getAgentTasks);
  const missionsByRole = useMemo(() => {
    const m = new Map<string, AgentTaskEntry[]>();
    for (const t of tasks) {
      if (t.status !== 'running' && t.status !== 'pending') continue;
      const list = m.get(t.role) ?? [];
      list.push(t);
      m.set(t.role, list);
    }
    for (const list of m.values()) list.sort((a, b) => (a.status === b.status ? a.timestamp - b.timestamp : a.status === 'running' ? -1 : 1));
    return m;
  }, [tasks]);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);
  const [busFilter, setBusFilter] = useState<string>('all');

  const totalActive = (fleet?.summary?.busy ?? 0) + (fleet?.summary?.overloaded ?? 0);
  const deadLetterCount = Object.values(metrics?.deadLetterQueue ?? {}).reduce((a, b) => a + b, 0);
  const isFirstLoad = loading && fleet === null;

  const tabs = [
    { id: 'fleet' as const, label: 'Flotte', icon: Users, badge: fleet?.summary?.online },
    { id: 'bus' as const, label: 'Bus', icon: Radio, badge: messages.length > 0 ? messages.length : undefined },
    { id: 'metrics' as const, label: 'Stats', icon: BarChart3, badge: deadLetterCount > 0 ? deadLetterCount : undefined },
  ];

  const panelContent = (
    <div className="flex flex-col h-full min-h-0">
      {/* Tabs */}
      <div className="flex items-center gap-1 px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-base)' }}>
        {tabs.map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            role="tab"
            aria-selected={tab === id}
            className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:text-[var(--text-primary)]"
            style={{ color: tab === id ? 'var(--accent-primary)' : 'var(--text-dimmed)' }}
          >
            {tab === id && (
              <motion.span
                layoutId="fleet-tab"
                className="absolute inset-0 rounded-lg"
                style={{ backgroundColor: 'var(--accent-subtle)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent-primary) 25%, transparent)' }}
                transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
            <Icon size={11} className="relative" />
            <span className="relative">{label}</span>
            {badge !== undefined && badge > 0 && (
              <span
                className="relative min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-xs font-bold tabular-nums"
                style={{ backgroundColor: tab === id ? 'var(--accent-primary)' : 'var(--border-base)', color: tab === id ? 'white' : 'var(--text-muted)' }}
              >
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={handleToggleNotifications}
          className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] transition"
          title={notificationsEnabled ? 'Désactiver notifications' : 'Activer notifications'}
        >
          {notificationsEnabled
            ? <Bell size={11} style={{ color: 'var(--color-success)' }} />
            : <BellOff size={11} style={{ color: 'var(--text-dimmed)' }} />}
        </button>
        <button
          onClick={refresh}
          className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] transition"
          title="Rafraîchir"
        >
          {loading ? <Loader2 size={11} className="animate-spin" style={{ color: 'var(--accent-primary)' }} /> : <RefreshCw size={11} style={{ color: 'var(--text-muted)' }} />}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-3 mt-2 px-3 py-2 rounded-lg text-xs flex items-center gap-2"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-error) 20%, transparent)', color: 'var(--color-error)' }}>
          <AlertTriangle size={11} />
          <span>{error}</span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0" ref={tab === 'bus' ? busRef : undefined}>
        <AnimatePresence mode="wait">
          {tab === 'fleet' && (
            <motion.div key="fleet" {...tabFade} className="p-3 space-y-2">
              {isFirstLoad ? <LoadingState /> : !fleet?.initialized || !fleet?.summary ? (
                <EmptyState icon={Zap} title="Flotte non initialisée" sub={fleet?.message ?? 'Lancez une tâche pour démarrer la flotte.'} />
              ) : (
                <>
                  <FleetSummary summary={fleet.summary} recommendation={fleet.recommendation} />
                  <div className="grid grid-cols-1 gap-1.5">
                    {(fleet.agents ?? []).map(a => (
                      <AgentCard
                        key={a.role}
                        agent={a}
                        missions={missionsByRole.get(a.role) ?? []}
                        expanded={expandedRole === a.role}
                        onToggle={() => setExpandedRole(r => (r === a.role ? null : a.role))}
                      />
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          )}
          {tab === 'bus' && (
            <motion.div key="bus" {...tabFade} className="p-2 space-y-0.5">
              {isFirstLoad ? <LoadingState /> : messages.length === 0 ? (
                <EmptyState icon={Radio} title="Aucun message" sub="Les communications inter-agents apparaîtront ici." />
              ) : (
                <>
                  <BusFilters messages={messages} value={busFilter} onChange={setBusFilter} />
                  {messages
                    .filter(m => busFilter === 'all' || m.type === busFilter)
                    .slice(-40)
                    .map(m => <BusMessageRow key={m.id} msg={m} />)}
                </>
              )}
            </motion.div>
          )}
          {tab === 'metrics' && (
            <motion.div key="metrics" {...tabFade} className="p-3 space-y-4">
              {isFirstLoad ? <LoadingState /> : metrics ? <MetricsView metrics={metrics} /> : (
                <EmptyState icon={BarChart3} title="Aucune donnée" sub="Les métriques apparaîtront après la première tâche." />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  // ── Render: docké (panneau latéral) ─────────────────────────────────────────
  if (docked) {
    return (
      <div className="flex flex-col h-full">
        <div
          className="flex items-center justify-between px-3 py-2 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border-base)' }}
        >
          <div className="flex items-center gap-2">
            <Users size={14} style={{ color: 'var(--accent-primary)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Flotte d'Agents</span>
            <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-dimmed)' }}>
              {totalActive > 0 ? `${totalActive} actif${totalActive > 1 ? 's' : ''}` : 'au repos'}
            </span>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-active)]"
              style={{ color: 'var(--text-muted)' }}
              aria-label="Fermer"
            >
              <X size={15} />
            </button>
          )}
        </div>
        {panelContent}
      </div>
    );
  }

  // ── Render: Modal (inline) or Panel ─────────────────────────────────────────
  if (inline) {
    return (
      <motion.div
        className="fixed inset-0 flex items-center justify-center"
        style={{ zIndex: 'var(--z-modal)' as any }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
        <motion.div
          className="relative flex flex-col w-full max-w-xl overflow-hidden"
          style={{
            maxHeight: '80vh',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-base)',
            borderRadius: '16px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
          }}
          initial={prefersReducedMotion ? { opacity: 0 } : { scale: 0.95, y: 12, opacity: 0 }}
          animate={prefersReducedMotion ? { opacity: 1 } : { scale: 1, y: 0, opacity: 1 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { scale: 0.95, y: 12, opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.15 : 0.2, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-base)' }}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-subtle)' }}>
                <Users size={15} style={{ color: 'var(--accent-primary)' }} />
              </div>
              <div>
                <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Flotte d'Agents</h2>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {totalActive > 0 ? `${totalActive} agent${totalActive > 1 ? 's' : ''} actif${totalActive > 1 ? 's' : ''}` : 'Tous au repos'}
                </span>
              </div>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-lg transition hover:bg-[var(--bg-active)]"
                style={{ color: 'var(--text-muted)' }}
                aria-label="Fermer"
              >
                <X size={15} />
              </button>
            )}
          </div>
          {panelContent}
        </motion.div>
      </motion.div>
    );
  }

  return panelContent;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FleetSummary({ summary, recommendation }: {
  summary: NonNullable<FleetStatus['summary']>;
  recommendation?: string;
}) {
  return (
    <div className="rounded-xl px-3.5 py-3" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {summary.online}/{summary.totalAgents} en ligne
        </span>
        <div className="flex gap-1.5">
          {summary.idle > 0 && <Pill label={`${summary.idle} libres`} color="var(--color-success)" />}
          {summary.busy > 0 && <Pill label={`${summary.busy} occupés`} color="var(--color-warning)" />}
          {summary.overloaded > 0 && <Pill label={`${summary.overloaded} surchargés`} color="var(--color-error)" />}
        </div>
      </div>
      {/* Répartition de la flotte */}
      {summary.totalAgents > 0 && (
        <div className="mb-2 flex h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-input)' }} aria-hidden="true">
          {([
            [summary.busy, STATUS_COLOR.busy],
            [summary.overloaded, STATUS_COLOR.overloaded],
            [summary.idle, STATUS_COLOR.idle],
          ] as const).map(([n, c], i) => n > 0 && (
            <motion.span
              key={i}
              className="h-full"
              style={{ backgroundColor: c }}
              initial={false}
              animate={{ width: `${(n / summary.totalAgents) * 100}%` }}
              transition={{ type: 'spring', stiffness: 180, damping: 26 }}
            />
          ))}
        </div>
      )}
      {recommendation && (
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{recommendation}</p>
      )}
    </div>
  );
}

/** Chrono d'une mission en cours (mise à jour chaque seconde). */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono tabular-nums">{formatMs(now - since)}</span>;
}

function AgentCard({ agent, missions, expanded, onToggle }: {
  agent: AgentStat;
  missions: AgentTaskEntry[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const meta = ROLE_META[agent.role] ?? { icon: Users, color: 'var(--text-muted)', label: agent.role };
  const Icon = meta.icon;
  const isActive = agent.status === 'busy' || agent.status === 'overloaded';
  const current = missions.find(m => m.status === 'running');
  const queued = missions.filter(m => m.status === 'pending');
  const load = agent.runningTasks + agent.queuedTasks;
  const progressPct = current?.progress && current.progress.total > 0
    ? Math.min(100, (current.progress.current / current.progress.total) * 100)
    : null;
  const hasMission = !!current || queued.length > 0;

  return (
    <div
      className={`lea-fleet-card overflow-hidden rounded-xl transition-colors${current ? ' lea-glow-border' : ''}`}
      style={{
        ['--mission-color' as string]: meta.color,
        backgroundColor: isActive ? `color-mix(in srgb, ${meta.color} 6%, var(--bg-input))` : 'var(--bg-input)',
        border: `1px solid ${isActive ? `color-mix(in srgb, ${meta.color} 25%, transparent)` : 'var(--border-base)'}`,
        opacity: agent.status === 'offline' ? 0.55 : 1,
      }}
    >
      <div
        role={hasMission ? 'button' : undefined}
        tabIndex={hasMission ? 0 : undefined}
        aria-expanded={hasMission ? expanded : undefined}
        onClick={hasMission ? onToggle : undefined}
        onKeyDown={hasMission ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } } : undefined}
        className={`flex items-center gap-3 px-3 py-2.5${hasMission ? ' cursor-pointer hover:bg-[var(--bg-hover)]' : ''}`}
      >
        <div className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `color-mix(in srgb, ${meta.color} 15%, transparent)` }}>
          {isActive
            ? <Loader2 size={15} className="animate-spin" style={{ color: meta.color }} />
            : <Icon size={15} style={{ color: meta.color }} />}
          <span className="absolute -bottom-0.5 -right-0.5"><StatusDot status={agent.status} /></span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{meta.label}</span>
            <span className="rounded-full px-1.5 text-xs font-medium" style={{ color: STATUS_COLOR[agent.status], backgroundColor: `color-mix(in srgb, ${STATUS_COLOR[agent.status]} 12%, transparent)` }}>
              {STATUS_LABEL[agent.status] ?? agent.status}
            </span>
          </div>

          {/* Mission en cours : titre + chrono */}
          {current ? (
            <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs" style={{ color: meta.color }} title={current.title}>
              <span className="truncate">▸ {current.title}</span>
              <span className="flex-shrink-0" style={{ color: 'var(--text-dimmed)' }}><Elapsed since={current.timestamp} /></span>
            </p>
          ) : (
            <div className="mt-0.5 flex gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
              {agent.queuedTasks > 0 && <span className="flex items-center gap-1"><Clock size={9} />{agent.queuedTasks} en file</span>}
              {agent.delegationSuccess > 0 && <span className="flex items-center gap-1" style={{ color: 'var(--color-success)' }}><CheckCircle2 size={9} />{agent.delegationSuccess} réussie{agent.delegationSuccess > 1 ? 's' : ''}</span>}
              {agent.delegatedSubTasks > 0 && <span className="flex items-center gap-1"><ArrowRight size={9} />{agent.delegatedSubTasks} déléguée{agent.delegatedSubTasks > 1 ? 's' : ''}</span>}
              {agent.queuedTasks === 0 && agent.delegationSuccess === 0 && agent.delegatedSubTasks === 0 && <span style={{ color: 'var(--text-dimmed)' }}>Disponible</span>}
            </div>
          )}

          {/* Progression chiffrée de la mission, si l'agent la publie */}
          {current?.progress && progressPct !== null && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--border-base)' }}>
                <motion.div className="h-full rounded-full" style={{ backgroundColor: meta.color }} initial={false} animate={{ width: `${progressPct}%` }} transition={{ duration: 0.3 }} />
              </div>
              <span className="text-xs font-mono tabular-nums" style={{ color: 'var(--text-dimmed)' }}>
                {current.progress.current}/{current.progress.total}
              </span>
            </div>
          )}
        </div>

        {/* Charge : missions en cours + en file */}
        <div className="flex flex-shrink-0 flex-col items-end gap-1" title={`${agent.runningTasks} en cours · ${agent.queuedTasks} en file`}>
          <span className="text-xs font-mono tabular-nums" style={{ color: load > 0 ? 'var(--text-secondary)' : 'var(--text-dimmed)' }}>
            {agent.runningTasks}<span style={{ color: 'var(--text-dimmed)' }}>+{agent.queuedTasks}</span>
          </span>
          <span className="flex gap-0.5" aria-hidden="true">
            {Array.from({ length: 4 }, (_, i) => (
              <span key={i} className="h-1 w-2 rounded-sm" style={{
                backgroundColor: i < Math.min(4, load)
                  ? (agent.status === 'overloaded' ? 'var(--color-error)' : meta.color)
                  : 'var(--border-base)',
              }} />
            ))}
          </span>
        </div>

        {hasMission && (
          <ChevronRight size={12} className="flex-shrink-0 transition-transform" style={{ color: 'var(--text-dimmed)', transform: expanded ? 'rotate(90deg)' : 'none' }} />
        )}
      </div>

      {/* Détail de la mission en cours + file d'attente */}
      <AnimatePresence initial={false}>
        {expanded && hasMission && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-2.5 px-3 pb-3 pt-2" style={{ borderTop: '1px solid var(--border-base)' }}>
              {current && (
                <>
                  {current.steps.length > 0 && (
                    <ol className="lea-steps m-0 list-none p-0" aria-label="Étapes">
                      {current.steps.slice(-6).map((step, i, arr) => (
                        <li key={i} className="lea-step" data-live={i === arr.length - 1 ? 'true' : undefined}>
                          <span className="lea-step__dot" aria-hidden="true" />
                          <span className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{step}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                  <MissionDetail taskId={current.id} status={current.status} color={meta.color} fallbackSummary={current.detail} />
                </>
              )}
              {queued.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
                    File d'attente ({queued.length})
                  </p>
                  <ol className="m-0 list-none space-y-1 p-0">
                    {queued.map((q, i) => (
                      <li key={q.id} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                        <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-xs font-mono" style={{ backgroundColor: 'var(--bg-hover)' }}>{i + 1}</span>
                        <Hourglass size={10} style={{ flexShrink: 0 }} />
                        <span className="truncate" title={q.title}>{q.title}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatusDot({ status }: { status: AgentStat['status'] }) {
  return (
    <span
      className={`block w-2.5 h-2.5 rounded-full flex-shrink-0 ${status === 'busy' || status === 'overloaded' ? 'animate-pulse' : ''}`}
      style={{ backgroundColor: STATUS_COLOR[status] ?? 'var(--text-dimmed)', boxShadow: '0 0 0 2px var(--bg-panel)' }}
    />
  );
}

function BusMessageRow({ msg }: { msg: BusMessage }) {
  const color = TYPE_COLOR[msg.type] ?? 'var(--text-muted)';
  const time = new Date(msg.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="flex items-start gap-2 px-2.5 py-2 rounded-lg hover:bg-[var(--bg-hover)] transition">
      <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)` }}>
        <Radio size={9} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold" style={{ color }}>{TYPE_LABEL[msg.type] ?? msg.type.replace(/_/g, ' ')}</span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{msg.from}</span>
          <ArrowRight size={8} style={{ color: 'var(--text-dimmed)' }} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{msg.to}</span>
          {msg.isAutonomous && (
            <span className="text-xs font-bold px-1 py-0.5 rounded uppercase"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-warning) 12%, transparent)', color: 'var(--color-warning)' }}>auto</span>
          )}
        </div>
        <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-dimmed)' }}>{msg.summary}</p>
      </div>
      <span className="text-xs font-mono flex-shrink-0 mt-0.5" style={{ color: 'var(--text-dimmed)' }}>{time}</span>
    </div>
  );
}

/** Filtres par type de message (avec compteurs). */
function BusFilters({ messages, value, onChange }: { messages: BusMessage[]; value: string; onChange: (v: string) => void }) {
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const msg of messages) m.set(msg.type, (m.get(msg.type) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [messages]);
  if (counts.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-1 px-1 pb-2" role="group" aria-label="Filtrer les messages">
      {[['all', messages.length] as [string, number], ...counts].map(([type, n]) => (
        <button
          key={type}
          type="button"
          onClick={() => onChange(type)}
          aria-pressed={value === type}
          className="lea-agent-chip inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
          data-active={value === type ? 'true' : undefined}
          style={{ ['--chip' as string]: type === 'all' ? 'var(--text-secondary)' : TYPE_COLOR[type] ?? 'var(--text-muted)' }}
        >
          {type === 'all' ? 'Tous' : TYPE_LABEL[type] ?? type.replace(/_/g, ' ')}
          <span className="tabular-nums opacity-70">{n}</span>
        </button>
      ))}
    </div>
  );
}

function MetricsView({ metrics }: { metrics: BusMetrics }) {
  const rate = metrics.successRatePercent ?? Math.round((metrics.successRate ?? 1) * 100);
  const rateColor = rate >= 95 ? 'var(--color-success)' : rate >= 80 ? 'var(--color-warning)' : 'var(--color-error)';
  const deadLetterEntries = Object.entries(metrics.deadLetterQueue ?? {});

  return (
    <>
      {/* Success rate */}
      <div className="rounded-xl p-3.5" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Taux de succès</span>
          <span className="text-base font-bold font-mono" style={{ color: rateColor }}>{rate}%</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-input)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: rateColor }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, rate)}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Key metrics grid */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Messages', value: metrics.totalMessages, icon: Mail, color: 'var(--color-info)' },
          { label: 'Subscriptions', value: metrics.activeSubscriptions, icon: Radio, color: 'var(--color-accent-alt)' },
          { label: 'En attente', value: metrics.pendingRequests, icon: Clock, color: 'var(--color-warning)' },
          { label: 'Dead-letter', value: deadLetterEntries.reduce((a, [, v]) => a + v, 0), icon: Inbox, color: 'var(--color-error)' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl px-3 py-2.5" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)' }}>
            <div className="flex items-center gap-1.5 mb-1">
              <Icon size={10} style={{ color: value > 0 ? color : 'var(--text-dimmed)' }} />
              <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>{label}</span>
            </div>
            <span className="text-base font-bold font-mono" style={{ color: value > 0 ? color : 'var(--text-primary)' }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Dead-letter detail */}
      {deadLetterEntries.length > 0 && (
        <div className="rounded-xl p-3" style={{ backgroundColor: 'color-mix(in srgb, var(--color-error) 5%, transparent)', border: '1px solid color-mix(in srgb, var(--color-error) 15%, transparent)' }}>
          <p className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--color-error)' }}><AlertTriangle size={12} /> Messages non délivrés</p>
          {deadLetterEntries.map(([role, count]) => (
            <div key={role} className="flex items-center justify-between py-1 text-xs">
              <span style={{ color: 'var(--text-muted)' }}>{role}</span>
              <span className="font-mono font-bold" style={{ color: 'var(--color-error)' }}>{count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Message type distribution */}
      {Object.keys(metrics.byMessageType).length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Par type</p>
          <div className="space-y-1">
            {Object.entries(metrics.byMessageType).map(([type, count]) => (
              <div key={type} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: TYPE_COLOR[type] ?? 'var(--text-muted)' }} />
                <span className="flex-1" style={{ color: 'var(--text-muted)' }}>{type.replace(/_/g, ' ')}</span>
                <span className="font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span className="px-1.5 py-0.5 rounded-full text-xs font-bold"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>
      {label}
    </span>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Chargement…</p>
    </div>
  );
}

function EmptyState({ icon: Icon, title, sub }: { icon: any; title: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 px-6 text-center">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-input)' }}>
        <Icon size={18} style={{ color: 'var(--text-dimmed)' }} />
      </div>
      <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>{title}</p>
      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-dimmed)' }}>{sub}</p>
    </div>
  );
}
