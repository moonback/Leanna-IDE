/**
 * AgentFleetPanel — Tableau de bord de la flotte d'agents autonomes
 *
 * Onglets :
 * - Flotte  : statut temps réel de chaque agent (idle/busy/overloaded)
 * - Bus     : historique des messages inter-agents (délégations autonomes)
 * - Métriques : taux de succès, dead-letter queue, subscriptions actives
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users, Radio, BarChart3, RefreshCw, Loader2,
  Clock, AlertTriangle,
  ArrowRight, Zap, FlaskConical, FileText,
  Shield, Eye, Building2, Mail, Inbox, Bell, BellOff,
} from 'lucide-react';
import { Panel } from '../ui/Panel';
import { IconButton } from '../ui/IconButton';
import { useAgentNotifications } from '../../hooks/useAgentNotifications';

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

// ─── Événement agent reçu via WebSocket ───────────────────────────────────────
interface IncomingAgentEvent {
  type: 'agent_event';
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
  test:      { icon: FlaskConical, color: '#4ade80', label: 'Tests' },
  docs:      { icon: FileText,     color: '#60a5fa', label: 'Docs' },
  refactor:  { icon: RefreshCw,    color: '#fbbf24', label: 'Refactor' },
  security:  { icon: Shield,       color: '#f87171', label: 'Sécurité' },
  review:    { icon: Eye,          color: '#a78bfa', label: 'Review' },
  architect: { icon: Building2,    color: '#f97316', label: 'Architect' },
};

const TYPE_COLOR: Record<string, string> = {
  task_request:          '#60a5fa',
  task_response:         '#4ade80',
  collaboration_request: '#f97316',
  status_query:          '#94a3b8',
  status_response:       '#94a3b8',
  broadcast:             '#fbbf24',
  event:                 '#a78bfa',
};

function apiHeaders(): Record<string, string> {
  const token = localStorage.getItem('jarvis_api_token');
  return token ? { 'x-jarvis-token': token } : {};
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: apiHeaders() });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// ─── Sub-composants ───────────────────────────────────────────────────────────

function StatusDot({ status }: { status: AgentStat['status'] }) {
  const colors: Record<string, string> = {
    idle:       '#4ade80',
    busy:       '#fbbf24',
    overloaded: '#f87171',
    offline:    '#475569',
  };
  const pulse = status === 'busy' || status === 'overloaded';
  return (
    <span
      className={`w-2 h-2 rounded-full flex-shrink-0 ${pulse ? 'animate-pulse' : ''}`}
      style={{ backgroundColor: colors[status] ?? '#475569' }}
    />
  );
}

function AgentCard({ agent }: { agent: AgentStat }) {
  const meta = ROLE_META[agent.role] ?? { icon: Users, color: '#94a3b8', label: agent.role };
  const Icon = meta.icon;
  const isActive = agent.status === 'busy' || agent.status === 'overloaded';

  return (
    <div
      className="rounded-lg px-3 py-2.5 flex items-center gap-2.5"
      style={{
        backgroundColor: isActive ? `${meta.color}0d` : 'var(--bg-input)',
        border: `1px solid ${isActive ? `${meta.color}30` : 'var(--border-base)'}`,
      }}
    >
      <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${meta.color}18` }}>
        {isActive
          ? <Loader2 size={13} className="animate-spin" style={{ color: meta.color }} />
          : <Icon size={13} style={{ color: meta.color }} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold" style={{ color: 'var(--text-primary)' }}>
            {meta.label}
          </span>
          <StatusDot status={agent.status} />
          <span className="text-[9px] capitalize" style={{ color: 'var(--text-dimmed)' }}>
            {agent.status}
          </span>
        </div>
        <div className="text-[9px] mt-0.5 flex gap-2" style={{ color: 'var(--text-muted)' }}>
          {agent.runningTasks > 0 && <span>{agent.runningTasks} en cours</span>}
          {agent.queuedTasks > 0 && <span>{agent.queuedTasks} en queue</span>}
          {agent.delegationSuccess > 0 && (
            <span style={{ color: '#4ade80' }}>✓ {agent.delegationSuccess} délég.</span>
          )}
        </div>
      </div>
    </div>
  );
}

function BusMessageRow({ msg }: { msg: BusMessage }) {
  const color = TYPE_COLOR[msg.type] ?? '#94a3b8';
  const time = new Date(msg.timestamp).toLocaleTimeString('fr-FR', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  return (
    <div className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-white/5 transition">
      <span className="text-[8px] font-mono mt-0.5 w-12 flex-shrink-0" style={{ color: 'var(--text-dimmed)' }}>
        {time}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[9px] font-semibold" style={{ color }}>{msg.type}</span>
          <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
            {msg.from}
          </span>
          <ArrowRight size={8} style={{ color: 'var(--text-dimmed)' }} />
          <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{msg.to}</span>
          {msg.isAutonomous && (
            <span className="text-[8px] px-1 rounded" style={{ backgroundColor: '#f9731620', color: '#f97316' }}>
              auto
            </span>
          )}
        </div>
        <p className="text-[9px] truncate mt-0.5" style={{ color: 'var(--text-dimmed)' }}>
          {msg.summary}
        </p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface AgentFleetPanelProps {
  inline?: boolean;
}

export function AgentFleetPanel({ inline = false }: AgentFleetPanelProps) {
  const [tab, setTab] = useState<'fleet' | 'bus' | 'metrics'>('fleet');
  const [fleet, setFleet] = useState<FleetStatus | null>(null);
  const [messages, setMessages] = useState<BusMessage[]>([]);
  const [metrics, setMetrics] = useState<BusMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const busRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Hook de notifications automatiques (modèle push) ─────────────────────────
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

  // ── Fetch complet (réconciliation) ──────────────────────────────────────────
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

  // ── Mise à jour directe depuis les événements WebSocket ────────────────────
  // Met à jour le statut d'un agent SANS faire de fetch HTTP → temps réel immédiat
  useEffect(() => {
    // ── Handler unifié : task events + bus messages ──────────────────────────
    const handleAgentEvent = (e: Event) => {
      const ev = (e as CustomEvent<IncomingAgentEvent>).detail;
      if (!ev || ev.type !== 'agent_event') return;

      // ── Détecter un message de bus (format "bus:type:from:to:auto|manual") ──
      if (ev.detail?.startsWith('bus:')) {
        const parts = ev.detail.split(':');
        // parts = ['bus', msgType, fromRole, toRole, 'auto'|'manual']
        const msgType   = parts[1] ?? 'event';
        const fromRole  = parts[2] ?? ev.role;
        const toRole    = parts[3] ?? '?';
        const isAuto    = parts[4] === 'auto';

        // Filtrer les broadcasts légers (status_query, broadcast) pour ne pas spammer
        if (msgType === 'status_query' || msgType === 'broadcast') return;

        const busMsg: BusMessage = {
          id: `bus-${ev.taskId.slice(0, 8)}`,
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
          // Dédupliquer par id
          if (prev.some(m => m.id === busMsg.id)) return prev;
          return [...prev.slice(-99), busMsg];
        });
        return; // pas besoin de mettre à jour le statut agent pour les messages de bus
      }

      // ── Événement de tâche réel ───────────────────────────────────────────
      const newStatus: AgentStat['status'] =
        ev.event === 'task_started'   ? 'busy' :
        ev.event === 'task_completed' ? 'idle' :
        ev.event === 'task_failed'    ? 'idle' :
        ev.event === 'task_progress'  ? 'busy' : 'idle';

      setFleet(prev => {
        if (!prev?.agents) return prev;
        const agents = prev.agents.map(a => {
          if (a.role !== ev.role) return a;
          const runningDelta =
            ev.event === 'task_started'   ?  1 :
            ev.event === 'task_completed' ? -1 :
            ev.event === 'task_failed'    ? -1 : 0;
          return {
            ...a,
            status: newStatus,
            runningTasks: Math.max(0, a.runningTasks + runningDelta),
            delegationSuccess: ev.event === 'task_completed'
              ? a.delegationSuccess + 1
              : a.delegationSuccess,
          };
        });
        const online     = agents.filter(a => a.isOnline).length;
        const idle       = agents.filter(a => a.status === 'idle').length;
        const busy       = agents.filter(a => a.status === 'busy').length;
        const overloaded = agents.filter(a => a.status === 'overloaded').length;
        return {
          ...prev,
          agents,
          summary: prev.summary
            ? { ...prev.summary, online, idle, busy, overloaded }
            : prev.summary,
        };
      });

      // Ajouter un événement synthétique dans l'onglet bus
      const syntheticEvent: BusMessage = {
        id: `ev-${ev.taskId.slice(0, 8)}-${ev.event}`,
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

      // Rafraîchir métriques après un changement de statut (différé pour éviter les rafales)
      setTimeout(() => {
        fetchJSON<BusMetrics>('/api/agents/bus/metrics')
          .then(setMetrics)
          .catch(() => {});
      }, 400);
    };

    window.addEventListener('jarvis-agent-event', handleAgentEvent);
    return () => {
      window.removeEventListener('jarvis-agent-event', handleAgentEvent);
    };
  }, []);

  // ── Polling de réconciliation (30s — juste pour corriger les dérives) ───────
  useEffect(() => {
    refresh(); // chargement initial
    intervalRef.current = setInterval(refresh, 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [refresh]);

  // ── Scroll bus vers le bas à chaque nouveau message ─────────────────────────
  useEffect(() => {
    if (tab === 'bus' && busRef.current) {
      busRef.current.scrollTop = busRef.current.scrollHeight;
    }
  }, [messages, tab]);

  const totalActive = (fleet?.summary?.busy ?? 0) + (fleet?.summary?.overloaded ?? 0);
  const deadLetterCount = Object.values(metrics?.deadLetterQueue ?? {}).reduce((a, b) => a + b, 0);
  // Indicateur de chargement initial (avant le premier fetch)
  const isFirstLoad = loading && fleet === null;

  const content = (
    <div className="flex flex-col h-full">
      {/* Header tabs */}
      <div className="flex items-center gap-1 px-3 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-base)' }}>
        {([
          { id: 'fleet',   label: 'Flotte',    icon: Users,    badge: fleet?.summary?.online },
          { id: 'bus',     label: 'Bus',        icon: Radio,    badge: messages.length },
          { id: 'metrics', label: 'Métriques',  icon: BarChart3, badge: deadLetterCount > 0 ? deadLetterCount : undefined },
        ] as const).map(({ id, label, icon: Icon, badge }) => (
          <button key={id} onClick={() => setTab(id)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors"
            style={{
              color: tab === id ? 'var(--accent-primary)' : 'var(--text-dimmed)',
              backgroundColor: tab === id ? 'var(--accent-subtle)' : 'transparent',
            }}>
            <Icon size={10} />
            {label}
            {badge !== undefined && badge > 0 && (
              <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold"
                style={{ backgroundColor: tab === id ? 'var(--accent-primary)' : 'var(--text-dimmed)', color: 'var(--bg-panel)' }}>
                {badge}
              </span>
            )}
          </button>
        ))}
        <div className="flex-1" />
        <IconButton
          variant="default"
          icon={notificationsEnabled ? <Bell size={11} /> : <BellOff size={11} />}
          onClick={handleToggleNotifications}
          tooltip={notificationsEnabled ? 'Désactiver les notifications' : 'Activer les notifications'}
          aria-label="Notifications de tâches"
          className="p-1 rounded"
          style={{ color: notificationsEnabled ? '#4ade80' : '#94a3b8' }}
        />
        <IconButton variant="default" icon={loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          onClick={refresh} tooltip="Rafraîchir" aria-label="Rafraîchir" className="p-1 rounded" />
      </div>

      {/* Error */}
      {error && (
        <div className="mx-3 mt-2 px-2 py-1.5 rounded text-[10px] flex items-center gap-1.5"
          style={{ backgroundColor: '#f8717120', color: '#f87171' }}>
          <AlertTriangle size={10} /> {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar" ref={tab === 'bus' ? busRef : undefined}>
        <AnimatePresence mode="wait">
          {tab === 'fleet' && (
            <motion.div key="fleet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="px-2 py-2 space-y-1.5">
              {isFirstLoad ? (
                <LoadingState />
              ) : !fleet?.initialized || !fleet?.summary ? (
                <EmptyFleet message={fleet?.message} />
              ) : (
                <>
                  <SummaryRow summary={fleet.summary} recommendation={fleet.recommendation} />
                  {(fleet.agents ?? []).map(a => <AgentCard key={a.role} agent={a} />)}
                </>
              )}
            </motion.div>
          )}
          {tab === 'bus' && (
            <motion.div key="bus" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="px-1 py-1.5">
              {isFirstLoad ? (
                <LoadingState />
              ) : messages.length === 0 ? (
                <EmptyBus />
              ) : (
                messages.map(m => <BusMessageRow key={m.id} msg={m} />)
              )}
            </motion.div>
          )}
          {tab === 'metrics' && (
            <motion.div key="metrics" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="px-3 py-3 space-y-4">
              {isFirstLoad ? <LoadingState /> : metrics ? <MetricsView metrics={metrics} /> : <EmptyMetrics />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  if (inline) return content;

  return (
    <Panel title="Flotte d'agents" icon={<Users className="w-4 h-4" />}
      actions={
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded"
          style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-dimmed)' }}>
          {totalActive} actifs
        </span>
      }>
      {content}
    </Panel>
  );
}

// ─── Vues secondaires ─────────────────────────────────────────────────────────

function SummaryRow({ summary, recommendation }: {
  summary: NonNullable<FleetStatus['summary']>;
  recommendation?: string;
}) {
  return (
    <div className="rounded-lg px-3 py-2 mb-1" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
          {summary.online}/{summary.totalAgents} agents en ligne
        </span>
        <div className="flex gap-2 text-[9px]">
          {summary.idle > 0 && <Pill label={`${summary.idle} libres`} color="#4ade80" />}
          {summary.busy > 0 && <Pill label={`${summary.busy} occupés`} color="#fbbf24" />}
          {summary.overloaded > 0 && <Pill label={`${summary.overloaded} surchargés`} color="#f87171" />}
        </div>
      </div>
      {recommendation && (
        <p className="text-[9px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {recommendation}
        </p>
      )}
    </div>
  );
}

function MetricsView({ metrics }: { metrics: BusMetrics }) {
  const rate = metrics.successRatePercent ?? Math.round((metrics.successRate ?? 1) * 100);
  const rateColor = rate >= 95 ? '#4ade80' : rate >= 80 ? '#fbbf24' : '#f87171';
  const deadLetterEntries = Object.entries(metrics.deadLetterQueue ?? {});

  return (
    <>
      {/* Taux de succès */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
            Taux de succès
          </span>
          <span className="text-[11px] font-bold font-mono" style={{ color: rateColor }}>{rate}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-input)' }}>
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, rate)}%`, backgroundColor: rateColor }} />
        </div>
      </div>

      {/* Compteurs clés */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Messages total', value: metrics.totalMessages, icon: Mail },
          { label: 'Subscriptions', value: metrics.activeSubscriptions, icon: Radio },
          { label: 'Requêtes en attente', value: metrics.pendingRequests, icon: Clock },
          { label: 'Dead-letter queue', value: deadLetterEntries.reduce((a, [, v]) => a + v, 0), icon: Inbox, warn: true },
        ].map(({ label, value, icon: Icon, warn }) => (
          <div key={label} className="rounded-md px-2.5 py-2"
            style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)' }}>
            <div className="flex items-center gap-1.5 mb-0.5">
              <Icon size={9} style={{ color: warn && value > 0 ? '#f87171' : 'var(--text-dimmed)' }} />
              <span className="text-[8px]" style={{ color: 'var(--text-dimmed)' }}>{label}</span>
            </div>
            <span className="text-[13px] font-bold font-mono"
              style={{ color: warn && value > 0 ? '#f87171' : 'var(--text-primary)' }}>
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* Dead-letter par rôle */}
      {deadLetterEntries.length > 0 && (
        <div>
          <p className="text-[9px] font-semibold mb-1.5" style={{ color: '#f87171' }}>
            ⚠️ Messages non délivrés (agent non abonné)
          </p>
          {deadLetterEntries.map(([role, count]) => (
            <div key={role} className="flex items-center justify-between px-2 py-1 rounded text-[9px]"
              style={{ backgroundColor: '#f8717110' }}>
              <span style={{ color: 'var(--text-muted)' }}>{role}</span>
              <span className="font-mono font-bold" style={{ color: '#f87171' }}>{count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Messages par type */}
      {Object.keys(metrics.byMessageType).length > 0 && (
        <div>
          <p className="text-[9px] font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            Répartition par type
          </p>
          <div className="space-y-1">
            {Object.entries(metrics.byMessageType).map(([type, count]) => (
              <div key={type} className="flex items-center gap-2 text-[9px]">
                <span className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: TYPE_COLOR[type] ?? '#94a3b8' }} />
                <span className="flex-1" style={{ color: 'var(--text-muted)' }}>{type}</span>
                <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{count}</span>
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
    <span className="px-1.5 py-0.5 rounded-full text-[8px] font-semibold"
      style={{ backgroundColor: `${color}20`, color }}>
      {label}
    </span>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3">
      <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Chargement...</p>
    </div>
  );
}

function EmptyFleet({ message }: { message?: string }) {  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3 px-4 text-center">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-input)' }}>
        <Zap size={18} style={{ color: 'var(--text-dimmed)' }} />
      </div>
      <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
        Flotte non initialisée
      </p>
      <p className="text-[9px] leading-relaxed" style={{ color: 'var(--text-dimmed)' }}>
        {message ?? 'Lance une tâche avec agent_delegate ou agent_collaborate pour démarrer.'}
      </p>
    </div>
  );
}

function EmptyBus() {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3 px-4 text-center">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-input)' }}>
        <Radio size={18} style={{ color: 'var(--text-dimmed)' }} />
      </div>
      <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Aucun message inter-agents</p>
      <p className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
        Les délégations autonomes apparaîtront ici en temps réel.
      </p>
    </div>
  );
}

function EmptyMetrics() {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2">
      <BarChart3 size={20} style={{ color: 'var(--text-dimmed)' }} />
      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Aucune donnée disponible</p>
    </div>
  );
}
