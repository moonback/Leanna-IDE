import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Activity, Bot, Check, CheckCircle2, CircleAlert, Clock3, ExternalLink, GitBranch, LayoutGrid, ListFilter, Loader2, Maximize2, Minimize2, Network, Orbit, Pause, Play, Radio, Zap } from 'lucide-react';
import { AnimatePresence, motion, useAnimationFrame, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from 'motion/react';
import { getAgentTasks, subscribe, type AgentTaskEntry } from '../../stores/agentActivityStore.js';
import { createPortal } from 'react-dom';
import { Modal } from '../ui/index.js';
import type { ActivityStep } from '../../hooks/useActivity.js';

interface AgentStat {
  role: string;
  name: string;
  status: 'idle' | 'busy' | 'overloaded' | 'offline' | string;
  isOnline: boolean;
  runningTasks: number;
  queuedTasks: number;
  delegatedSubTasks: number;
  delegationSuccess: number;
}
interface FleetResponse {
  initialized?: boolean;
  agents?: AgentStat[];
  totalAgents?: number;
  onlineAgents?: number;
  idleAgents?: number;
  busyAgents?: number;
  overloadedAgents?: number;
}
interface BusMessage {
  id: string;
  type: string;
  from: string;
  to: string;
  timestamp: string;
  summary?: string;
  isAutonomous?: boolean;
}
interface DashboardAgentNetworkProps {
  activity: ActivityStep[];
  reasoningActive: boolean;
  isBusy: boolean;
  /** Vrai lorsque le panneau est rendu dans sa fenêtre détachée (/agents-live). */
  standalone?: boolean;
}
type Tab = 'network' | 'activity' | 'delegations';

/** Ouvre le réseau multi-agents dans une fenêtre dédiée (second écran).
 *  En Electron : vraie BrowserWindow via IPC ; en web : repli sur un onglet. */
function openDetachedAgentNetwork(): void {
  const api = (window as unknown as { electronAPI?: { openAgentNetworkWindow?: () => Promise<unknown> } }).electronAPI;
  if (api?.openAgentNetworkWindow) {
    void api.openAgentNetworkWindow();
  } else {
    window.open('/agents-live', '_blank', 'noopener,noreferrer,width=1100,height=760');
  }
}

const STATUS_LABEL: Record<string, string> = {
  idle: 'Disponible', busy: 'En exécution', overloaded: 'Surchargé', offline: 'Hors ligne',
};
const STATUS_COLOR: Record<string, string> = {
  idle: 'var(--color-success, #22c55e)',
  busy: 'var(--accent-primary)',
  overloaded: 'var(--color-error, #ef4444)',
  offline: 'var(--text-dimmed)',
};
const TASK_LABEL: Record<string, string> = {
  pending: 'En attente', running: 'En cours', completed: 'Terminée', incomplete: 'Incomplète', failed: 'Échec', cancelled: 'Annulée',
};
const TERMINAL = new Set(['completed', 'failed', 'incomplete', 'cancelled']);
const MAX_NODES = 12;
const CX = 450, CY = 180;

function apiHeaders(): Record<string, string> {
  const token = localStorage.getItem('Leanna_api_token');
  return token ? { 'x-leanna-token': token } : {};
}
async function fetchJSON<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: apiHeaders() });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}
function timeAgo(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`;
}

/** Grille 4 colonnes × 3 rangées de part et d'autre du cœur (coordonnées viewBox 900×360). */
function agentSlot(index: number): { x: number; y: number } {
  const side = index % 2 ? 1 : -1;
  const slot = Math.floor(index / 2);
  return { x: CX + side * (slot < 3 ? 215 : 385), y: 60 + [1, 0, 2][slot % 3] * 120 };
}

type View = 'orbit' | 'grid';
type Filter = 'all' | 'active' | 'idle' | 'offline';
const FILTER_LABEL: Record<Filter, string> = { all: 'Tous les agents', active: 'En exécution / file', idle: 'Disponibles', offline: 'Hors ligne' };
const RX = 330, RY = 118;

interface NodeProps {
  agent: AgentStat;
  current?: AgentTaskEntry;
  selected: boolean;
  dimmed: boolean;
  reduce: boolean;
  onSelect: (role: string) => void;
  onHover: (role: string | null) => void;
}

/** Contenu d'une carte agent, commun aux vues orbite et grille. */
function AgentCardBody({ agent, current, reduce }: Pick<NodeProps, 'agent' | 'current' | 'reduce'>) {
  const busy = agent.runningTasks > 0;
  const color = STATUS_COLOR[agent.status] ?? STATUS_COLOR.offline;
  const pct = current?.progress?.total ? Math.round((current.progress.current / current.progress.total) * 100) : null;
  return <>
    {busy && !reduce && <motion.span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-lg border"
      style={{ borderColor: color }} animate={{ opacity: [.8, 0], scale: [1, 1.18] }} transition={{ duration: 1.4, repeat: Infinity }}/>}
    <span className="flex max-w-full items-center gap-1">
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        {busy && !reduce && <span className="absolute inline-flex h-full w-full animate-ping rounded-full" style={{ background: color }}/>}
        <span className="relative h-1.5 w-1.5 rounded-full" style={{ background: color }}/>
      </span>
      <span className="truncate text-[10px] font-semibold" style={{ color: 'var(--text-primary)' }}>{agent.name}</span>
    </span>
    {current ? <>
      <span className="w-full truncate text-[9px]" style={{ color }} title={current.title}>{current.progress?.label || current.title}</span>
      <span className="h-1 w-full overflow-hidden rounded-full" style={{ background: 'var(--border-base)' }}>
        {pct === null
          ? <motion.span className="block h-full w-1/3 rounded-full" style={{ background: color }} animate={reduce ? undefined : { x: ['-100%', '300%'] }} transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}/>
          : <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color }}/>}
      </span>
    </> : <>
      <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>{STATUS_LABEL[agent.status] ?? agent.status}</span>
      <span className="font-mono text-[9px]" style={{ color }}>{agent.runningTasks} en cours · {agent.queuedTasks} attente</span>
    </>}
  </>;
}

const NODE_CLASS = 'absolute flex w-[112px] cursor-pointer flex-col items-center gap-1 rounded-lg border px-2 py-2 text-center hover:brightness-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
function nodeLook(agent: AgentStat, selected: boolean): React.CSSProperties {
  const busy = agent.runningTasks > 0;
  const color = STATUS_COLOR[agent.status] ?? STATUS_COLOR.offline;
  return {
    borderColor: selected || busy ? color : 'var(--border-base)',
    background: selected ? 'var(--accent-subtle)' : 'color-mix(in srgb, var(--bg-panel) 88%, transparent)', backdropFilter: 'blur(8px)',
    boxShadow: busy || agent.status === 'overloaded' ? `0 0 18px color-mix(in srgb, ${color} 50%, transparent), 0 10px 20px rgba(0,0,0,.35)` : '0 6px 14px rgba(0,0,0,.28)',
    transition: 'border-color .5s, box-shadow .5s, background-color .3s, opacity .3s',
  };
}
function nodeA11y(agent: AgentStat, current: AgentTaskEntry | undefined) {
  return `${agent.name} — ${STATUS_LABEL[agent.status] ?? agent.status}${current ? ` : ${current.title}` : ''}. Ouvrir le détail`;
}

/** Nœud en orbite 3D : position, profondeur (échelle, opacité, z-index) dérivées de l'angle sans re-render React. */
function OrbitNode({ angle, index, count, ...props }: NodeProps & { angle: MotionValue<number>; index: number; count: number }) {
  const offset = (2 * Math.PI * index) / count;
  const sin = useTransform(angle, a => Math.sin(a + offset));
  const left = useTransform(angle, a => `${(CX + Math.cos(a + offset) * RX) / 9}%`);
  const top = useTransform(sin, s => `${(CY + s * RY) / 3.6}%`);
  const scale = useTransform(sin, s => 0.72 + ((s + 1) / 2) * 0.36);
  const zIndex = useTransform(sin, s => Math.round((s + 1) * 10) + 10);
  const depthOpacity = useTransform(sin, s => 0.5 + ((s + 1) / 2) * 0.5);
  const { agent, current, selected, dimmed, reduce, onSelect, onHover } = props;
  return <motion.button type="button" onClick={() => onSelect(agent.role)} aria-label={nodeA11y(agent, current)}
    onPointerEnter={() => onHover(agent.role)} onPointerLeave={() => onHover(null)} onFocus={() => onHover(agent.role)} onBlur={() => onHover(null)}
    className={NODE_CLASS} style={{ ...nodeLook(agent, selected), left, top, scale, zIndex, x: '-50%', y: '-50%', opacity: dimmed ? 0.25 : depthOpacity }}>
    <AgentCardBody agent={agent} current={current} reduce={reduce}/>
  </motion.button>;
}

/** Faisceau cœur → nœud en orbite, recalculé à chaque image via les motion values. */
function OrbitLink({ angle, index, count, busy, highlighted, reduce }: { angle: MotionValue<number>; index: number; count: number; busy: boolean; highlighted: boolean; reduce: boolean }) {
  const offset = (2 * Math.PI * index) / count;
  const x2 = useTransform(angle, a => CX + Math.cos(a + offset) * RX);
  const y2 = useTransform(angle, a => CY + Math.sin(a + offset) * RY);
  const active = busy || highlighted;
  return <motion.line x1={CX} y1={CY} x2={x2} y2={y2} vectorEffect="non-scaling-stroke"
    stroke={active ? 'var(--accent-primary)' : 'var(--border-base)'} strokeOpacity={active ? .9 : .45} strokeWidth={busy ? 2 : highlighted ? 1.6 : 1}
    strokeDasharray={busy ? '6 6' : undefined} className={busy && !reduce ? 'dash-flow' : undefined}/>;
}

/** Supervision visuelle alimentée par le registre, le bus et le store de missions temps réel. */
export const DashboardAgentNetwork = React.memo(function DashboardAgentNetwork({
  activity, reasoningActive, isBusy, standalone = false,
}: DashboardAgentNetworkProps) {
  const reduce = !!useReducedMotion();
  const tasks = useSyncExternalStore(subscribe, getAgentTasks);
  const [fleet, setFleet] = useState<FleetResponse | null>(null);
  const [messages, setMessages] = useState<BusMessage[]>([]);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshError, setRefreshError] = useState(false);
  const [tab, setTab] = useState<Tab>('network');
  const [focus, setFocus] = useState(false);
  const [view, setView] = useState<View>('orbit');
  const [filter, setFilter] = useState<Filter>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [hoverRole, setHoverRole] = useState<string | null>(null);
  const [userPaused, setUserPaused] = useState(false);
  const [pingKey, setPingKey] = useState(0);
  const filterRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (event: PointerEvent) => { if (!filterRef.current?.contains(event.target as Node)) setFilterOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setFilterOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [filterOpen]);

  // Orbite : l'angle avance image par image ; pause au survol, au focus, en modale, à la demande ou si mouvement réduit.
  const angle = useMotionValue(0);
  const pausedRef = useRef(false);
  pausedRef.current = reduce || userPaused || !!hoverRole || !!selectedRole || view !== 'orbit' || tab !== 'network';
  useAnimationFrame((_, delta) => { if (!pausedRef.current) angle.set(angle.get() + delta * 0.00011); });

  const refresh = useCallback(async () => {
    try {
      const [fleetData, busData] = await Promise.all([
        fetchJSON<FleetResponse>('/api/agents/fleet'),
        fetchJSON<{ messages?: BusMessage[] }>('/api/agents/bus/history?limit=100'),
      ]);
      setFleet(fleetData);
      setMessages(busData.messages ?? []);
      setRefreshError(false);
    } catch {
      setRefreshError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const anyRunning = tasks.some(task => task.status === 'running');
  useEffect(() => {
    void refresh();
    // Pendant une exécution, on resserre la cadence pour suivre le bus de délégation.
    const timer = window.setInterval(() => { void refresh(); }, anyRunning ? 3000 : 8000);
    return () => window.clearInterval(timer);
  }, [refresh, anyRunning]);

  // Vue focus = plein écran réel du document (les modales restent visibles par-dessus).
  // Échap est capté par le navigateur pour sortir du plein écran : on se resynchronise sur fullscreenchange.
  useEffect(() => {
    if (!focus) return;
    const root = document.documentElement;
    if (!document.fullscreenElement && root.requestFullscreen) root.requestFullscreen().catch(() => { /* refusé : reste en surcouche plein fenêtre */ });
    const onChange = () => { if (!document.fullscreenElement) setFocus(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.fullscreenElement) setFocus(false); };
    document.addEventListener('fullscreenchange', onChange);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      window.removeEventListener('keydown', onKey);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, [focus]);

  // Le registre est rafraîchi par polling ; le store reçoit les événements WebSocket instantanément.
  // On fusionne les deux pour qu'un agent passe « En exécution » dès que sa mission démarre.
  const agents = useMemo(() => {
    const registered = fleet?.agents ?? [];
    const base: AgentStat[] = registered.length ? registered : [...new Set(tasks.map(task => task.role))].filter(Boolean).map(role => ({
      role, name: tasks.find(task => task.role === role)?.agentName ?? role, status: 'offline', isOnline: false,
      runningTasks: 0, queuedTasks: 0, delegatedSubTasks: 0, delegationSuccess: 0,
    }));
    return base.map(agent => {
      const own = tasks.filter(task => task.role === agent.role);
      const running = own.filter(task => task.status === 'running').length;
      const queued = own.filter(task => task.status === 'pending').length;
      return {
        ...agent,
        runningTasks: Math.max(agent.runningTasks, running),
        queuedTasks: Math.max(agent.queuedTasks, queued),
        status: running && agent.status !== 'overloaded' ? 'busy' : agent.status,
      };
    });
  }, [fleet, tasks]);

  // Les agents actifs sont toujours visibles ; le reste complète dans l'ordre du registre.
  const filteredAgents = useMemo(() => agents.filter(agent =>
    filter === 'all' ? true
      : filter === 'active' ? agent.runningTasks > 0 || agent.queuedTasks > 0
      : filter === 'idle' ? agent.status === 'idle' && agent.runningTasks === 0
      : agent.status === 'offline'), [agents, filter]);
  const visibleAgents = useMemo(() => {
    const active = new Set(filteredAgents.filter(agent => agent.runningTasks > 0 || agent.queuedTasks > 0 || agent.role === selectedRole).slice(0, MAX_NODES).map(agent => agent.role));
    for (const agent of filteredAgents) { if (active.size >= MAX_NODES) break; active.add(agent.role); }
    return filteredAgents.filter(agent => active.has(agent.role));
  }, [filteredAgents, selectedRole]);

  const positions = useMemo(() => new Map(visibleAgents.map((agent, index) => [agent.role, agentSlot(index)])), [visibleAgents]);
  const runningTaskByRole = useMemo(() => {
    const map = new Map<string, (typeof tasks)[number]>();
    for (const task of tasks) if (task.status === 'running') map.set(task.role, task);
    return map;
  }, [tasks]);

  const selectedAgent = agents.find(agent => agent.role === selectedRole) ?? null;
  const selectedTasks = useMemo(() => selectedRole ? tasks.filter(task => task.role === selectedRole).slice(-6).reverse() : [], [tasks, selectedRole]);
  const delegations = useMemo(() => {
    const counts = new Map<string, { from: string; to: string; count: number; latest: string }>();
    for (const message of messages) {
      const { from, to } = message;
      if (!from || !to || from === to || !agents.some(agent => agent.role === from) || !agents.some(agent => agent.role === to)) continue;
      const key = `${from}->${to}`;
      const current = counts.get(key);
      if (current) { current.count++; if (message.timestamp > current.latest) current.latest = message.timestamp; }
      else counts.set(key, { from, to, count: 1, latest: message.timestamp });
    }
    return [...counts.values()].sort((a, b) => b.count - a.count);
  }, [messages, agents]);

  const failedTasks = tasks.filter(task => task.status === 'failed' || task.status === 'incomplete').length;
  const runningTasks = tasks.filter(task => task.status === 'running').length;
  const orchestrating = isBusy || runningTasks > 0;
  const nameOf = (role: string) => agents.find(agent => agent.role === role)?.name ?? role;
  // Survol d'un agent : ses partenaires de délégation restent nets, le reste s'estompe.
  const linked = useMemo(() => {
    if (!hoverRole) return null;
    const set = new Set([hoverRole]);
    for (const edge of delegations) { if (edge.from === hoverRole) set.add(edge.to); if (edge.to === hoverRole) set.add(edge.from); }
    return set;
  }, [hoverRole, delegations]);
  const selectAgent = useCallback((role: string) => setSelectedRole(value => value === role ? null : role), []);
  const ping = () => { setPingKey(key => key + 1); void refresh(); };

  // Parallaxe 3D : la scène s'incline légèrement en suivant le pointeur.
  const tiltX = useMotionValue(0), tiltY = useMotionValue(0);
  const rotateX = useSpring(tiltX, { stiffness: 120, damping: 18 });
  const rotateY = useSpring(tiltY, { stiffness: 120, damping: 18 });
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (reduce) return;
    const rect = event.currentTarget.getBoundingClientRect();
    tiltY.set(((event.clientX - rect.left) / rect.width - 0.5) * 8);
    tiltX.set(-((event.clientY - rect.top) / rect.height - 0.5) * 6);
  };
  const resetTilt = () => { tiltX.set(0); tiltY.set(0); };

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'network', label: 'Réseau 3D', count: visibleAgents.length },
    { id: 'activity', label: 'Activité', count: runningTasks },
    { id: 'delegations', label: 'Délégations', count: delegations.length },
  ];

  const content = (
    <section className={
      standalone ? 'relative flex h-full min-h-0 flex-col overflow-hidden border-0 p-4 sm:p-6'
        : focus ? 'fixed inset-0 z-[80] flex flex-col overflow-hidden border-0 p-4 sm:p-6'
        : 'relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl border p-2'}
      style={{ borderColor: orchestrating ? 'color-mix(in srgb, var(--accent-primary) 55%, var(--border-base))' : 'var(--border-base)',
        backgroundColor: focus || standalone ? 'var(--bg)' : 'color-mix(in srgb, var(--bg-secondary) 66%, transparent)', backdropFilter: 'blur(12px)',
        boxShadow: orchestrating ? '0 0 24px color-mix(in srgb, var(--accent-primary) 18%, transparent)' : undefined, transition: 'border-color .5s, box-shadow .5s' }}
      role={focus ? 'dialog' : undefined} aria-modal={focus || undefined}
      aria-label="Supervision multi-agents en temps réel">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1.5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
            <Activity size={13} style={{ color: 'var(--accent-primary)' }} /> Réseau multi-agents
            {orchestrating && <span className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] normal-case tracking-normal" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}>
              <Loader2 size={9} className={reduce ? undefined : 'animate-spin'}/> {runningTasks || 1} en exécution
            </span>}
          </div>
          <p className="mt-0.5 text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Registre · missions temps réel · délégations observées sur le bus</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
          <span className="rounded-full px-2 py-1" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}>{agents.length} agents</span>
          <span style={{ color: failedTasks ? 'var(--color-error)' : 'var(--text-dimmed)' }}>{failedTasks} alertes</span>
          <span style={{ color: 'var(--text-dimmed)' }}>{messages.length} messages · {activity.length} outils Live</span>
          {!standalone && (
            <button type="button" onClick={openDetachedAgentNetwork}
              aria-label="Détacher le réseau dans une fenêtre dédiée (second écran)" title="Détacher sur un second écran"
              className="rounded-md border p-1 focus-visible:outline focus-visible:outline-2"
              style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}>
              <ExternalLink size={12}/>
            </button>
          )}
          {!standalone && (
            <button type="button" onClick={() => setFocus(value => !value)} aria-pressed={focus}
              aria-label={focus ? 'Quitter le plein écran (Échap)' : 'Afficher le réseau en plein écran'} title={focus ? 'Quitter le plein écran (Échap)' : 'Plein écran'}
              className="rounded-md border p-1 focus-visible:outline focus-visible:outline-2"
              style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}>
              {focus ? <Minimize2 size={12}/> : <Maximize2 size={12}/>}
            </button>
          )}
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-end justify-between gap-2 border-b" style={{ borderColor: 'var(--border-base)' }}>
      <div role="tablist" aria-label="Vues du réseau" className="flex gap-1">
        {tabs.map(item => {
          const active = tab === item.id;
          return <button key={item.id} type="button" role="tab" aria-selected={active} id={`agent-tab-${item.id}`} aria-controls={`agent-panel-${item.id}`}
            onClick={() => setTab(item.id)}
            className="relative flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium focus-visible:outline focus-visible:outline-2"
            style={{ color: active ? 'var(--text-primary)' : 'var(--text-muted)' }}>
            {item.label}
            <span className="rounded-full px-1.5 font-mono text-[9px]" style={{ background: active ? 'var(--accent-subtle)' : 'transparent', color: active ? 'var(--accent-primary)' : 'var(--text-dimmed)' }}>{item.count}</span>
            {active && <motion.span layoutId="agent-tab-underline" className="absolute inset-x-1 -bottom-px h-0.5 rounded-full" style={{ background: 'var(--accent-primary)' }}/>}
          </button>;
        })}
      </div>
      {tab === 'network' && (
        <div className="mb-1 flex items-center gap-1" role="toolbar" aria-label="Contrôles du réseau">
          <div className="flex rounded-md border p-0.5" style={{ borderColor: 'var(--border-base)' }} role="group" aria-label="Disposition">
            {([['orbit', 'Orbite', Orbit], ['grid', 'Grille', LayoutGrid]] as const).map(([id, label, Icon]) => (
              <button key={id} type="button" onClick={() => setView(id)} aria-pressed={view === id} title={label}
                className="relative flex items-center gap-1 rounded px-1.5 py-1 text-[10px] focus-visible:outline focus-visible:outline-2"
                style={{ color: view === id ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
                {view === id && <motion.span layoutId="agent-view-pill" className="absolute inset-0 rounded" style={{ background: 'var(--accent-subtle)' }}/>}
                <Icon size={11} className="relative"/><span className="relative hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
          <div ref={filterRef} className="relative">
            <button type="button" onClick={() => setFilterOpen(value => !value)} aria-haspopup="menu" aria-expanded={filterOpen}
              title="Filtrer les agents" className="flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] focus-visible:outline focus-visible:outline-2"
              style={{ borderColor: filter !== 'all' ? 'var(--accent-primary)' : 'var(--border-base)', color: filter !== 'all' ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
              <ListFilter size={11}/> <span className="hidden sm:inline">{filter === 'all' ? 'Filtrer' : FILTER_LABEL[filter]}</span>
            </button>
            <AnimatePresence>
              {filterOpen && (
                <motion.div role="menu" aria-label="Filtrer les agents"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, rotateX: -20 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: .14 }} style={{ transformOrigin: 'top right', background: 'var(--bg-panel)', borderColor: 'var(--border-base)', boxShadow: '0 18px 40px rgba(0,0,0,.4)' }}
                  className="absolute right-0 top-full z-50 mt-1 w-48 rounded-xl border p-1">
                  {(Object.keys(FILTER_LABEL) as Filter[]).map(id => {
                    const count = id === 'all' ? agents.length : agents.filter(agent => id === 'active' ? agent.runningTasks > 0 || agent.queuedTasks > 0 : id === 'idle' ? agent.status === 'idle' && agent.runningTasks === 0 : agent.status === 'offline').length;
                    return <button key={id} type="button" role="menuitemradio" aria-checked={filter === id}
                      onClick={() => { setFilter(id); setFilterOpen(false); }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-[var(--accent-subtle)]"
                      style={{ color: 'var(--text-primary)' }}>
                      <Check size={12} style={{ color: 'var(--accent-primary)', opacity: filter === id ? 1 : 0 }}/>{FILTER_LABEL[id]}
                      <span className="ml-auto font-mono text-[10px]" style={{ color: 'var(--text-dimmed)' }}>{count}</span>
                    </button>;
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {view !== 'grid' && !reduce && (
            <button type="button" onClick={() => setUserPaused(value => !value)} aria-pressed={userPaused}
              aria-label={userPaused ? 'Reprendre la rotation' : 'Mettre la rotation en pause'} title={userPaused ? 'Reprendre la rotation' : 'Pause'}
              className="rounded-md border p-1 focus-visible:outline focus-visible:outline-2" style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}>
              {userPaused ? <Play size={11}/> : <Pause size={11}/>}
            </button>
          )}
          <motion.button type="button" onClick={ping} whileTap={reduce ? undefined : { scale: .9 }}
            aria-label="Sonder les agents (actualise le registre)" title="Sonder les agents"
            className="flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] focus-visible:outline focus-visible:outline-2"
            style={{ borderColor: 'var(--border-base)', color: 'var(--accent-primary)' }}>
            <Zap size={11}/> <span className="hidden sm:inline">Sonder</span>
          </motion.button>
        </div>
      )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {tab === 'network' && (
          <motion.div key="network" id="agent-panel-network" role="tabpanel" aria-labelledby="agent-tab-network"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .15 }}
            className="flex min-h-0 flex-1 flex-col">
            <div className={`relative mx-auto w-full ${focus || standalone ? 'min-h-0 flex-1 max-w-none' : 'h-[250px] max-w-[900px] sm:h-[285px] xl:h-auto xl:min-h-[230px] xl:flex-1'}`}
              style={{ perspective: 1100 }} onPointerMove={onPointerMove} onPointerLeave={resetTilt}
              role="group" aria-label="Agents sélectionnables et délégations observées">
              <motion.div className="absolute inset-0" style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}>
                {/* Sol holographique incliné : grille + orbites, purement décoratif. */}
                <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-[150%] w-[110%]"
                  style={{ transform: 'translate(-50%, -38%) rotateX(68deg)', transformOrigin: 'center',
                    backgroundImage: 'linear-gradient(color-mix(in srgb, var(--accent-primary) 14%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--accent-primary) 14%, transparent) 1px, transparent 1px)',
                    backgroundSize: '44px 44px',
                    maskImage: 'radial-gradient(ellipse at center, black 20%, transparent 68%)', WebkitMaskImage: 'radial-gradient(ellipse at center, black 20%, transparent 68%)' }}>
                  {[0.32, 0.55, 0.8].map((size, index) => (
                    <motion.div key={size} className="absolute left-1/2 top-1/2 rounded-full border"
                      style={{ width: `${size * 100}%`, height: `${size * 100}%`, x: '-50%', y: '-50%', borderColor: 'color-mix(in srgb, var(--accent-primary) 30%, transparent)', borderStyle: index === 1 ? 'dashed' : 'solid' }}
                      animate={reduce ? undefined : { rotate: index % 2 ? -360 : 360 }} transition={{ duration: 40 + index * 20, repeat: Infinity, ease: 'linear' }}/>
                  ))}
                </div>

                {/* preserveAspectRatio="none" : l'SVG suit exactement les positions en % des cartes HTML. */}
                <svg viewBox="0 0 900 360" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
                  <defs>
                    <radialGradient id="leanna-agent-core"><stop offset="0%" stopColor="var(--accent-primary)" stopOpacity=".35"/><stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0"/></radialGradient>
                  </defs>
                  <circle cx={CX} cy={CY} r={orchestrating ? 110 : 90} fill="url(#leanna-agent-core)" style={{ transition: 'r .6s' }}/>
                  {view === 'orbit' && <ellipse cx={CX} cy={CY} rx={RX} ry={RY} fill="none" stroke="var(--accent-primary)" strokeOpacity=".22" strokeDasharray="3 7" vectorEffect="non-scaling-stroke"/>}
                  {view === 'orbit' && visibleAgents.map((agent, index) => (
                    <OrbitLink key={`orbit-${agent.role}`} angle={angle} index={index} count={visibleAgents.length}
                      busy={agent.runningTasks > 0} highlighted={hoverRole === agent.role} reduce={reduce}/>
                  ))}
                  {/* Liens cœur → agents : discrets au repos, faisceau animé pendant l'exécution. */}
                  {view === 'grid' && visibleAgents.map((agent, index) => {
                    const point = positions.get(agent.role)!;
                    const busy = agent.runningTasks > 0;
                    const path = `M ${CX} ${CY} L ${point.x} ${point.y}`;
                    const lit = busy || hoverRole === agent.role;
                    return <g key={`core-${agent.role}`} style={{ opacity: linked && !linked.has(agent.role) ? .25 : 1, transition: 'opacity .3s' }}>
                      <path d={path} stroke={lit ? 'var(--accent-primary)' : 'var(--border-base)'} strokeOpacity={lit ? .9 : .5} strokeWidth={busy ? 2 : 1} fill="none"
                        vectorEffect="non-scaling-stroke" strokeDasharray={busy ? '6 6' : undefined}>
                        {busy && !reduce && <animate attributeName="stroke-dashoffset" from="24" to="0" dur=".8s" repeatCount="indefinite"/>}
                      </path>
                      {busy && !reduce && [0, 1, 2].map(dot => (
                        <circle key={dot} r="3.2" fill="var(--accent-primary)">
                          <animateMotion dur="1.6s" begin={`${dot * .53 + index * .07}s`} repeatCount="indefinite" path={path}/>
                          <animate attributeName="opacity" values="0;1;0" dur="1.6s" begin={`${dot * .53 + index * .07}s`} repeatCount="indefinite"/>
                        </circle>
                      ))}
                    </g>;
                  })}
                  {view === 'grid' && delegations.map((edge, index) => {
                    const from = positions.get(edge.from), to = positions.get(edge.to);
                    if (!from || !to) return null;
                    const path = `M ${from.x} ${from.y} Q ${CX} ${CY - 40} ${to.x} ${to.y}`;
                    const lit = !!hoverRole && (edge.from === hoverRole || edge.to === hoverRole);
                    return <g key={`${edge.from}-${edge.to}`} style={{ opacity: hoverRole && !lit ? .2 : 1, transition: 'opacity .3s' }}>
                      <path d={path} fill="none" stroke="var(--color-success, #22c55e)" strokeOpacity={lit ? .95 : .5} strokeWidth={Math.min(3, 1 + edge.count * .35) + (lit ? 1 : 0)} strokeDasharray="4 6" vectorEffect="non-scaling-stroke"/>
                      {!reduce && <circle r="2.6" fill="var(--color-success, #22c55e)"><animateMotion dur={`${2.4 + index * .2}s`} repeatCount="indefinite" path={path}/></circle>}
                    </g>;
                  })}
                </svg>

                {/* Cœur Leanna flottant avec anneaux en rotation 3D. */}
                <motion.div className="absolute inset-0 z-10 m-auto h-24 w-24"
                  style={{ transformStyle: 'preserve-3d', translateZ: 40 }}
                  animate={reduce ? undefined : { y: [0, -6, 0] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}>
                  {[{ rx: 70, dur: 6 }, { rx: -60, dur: 9 }].map((ring, index) => (
                    <motion.div key={index} aria-hidden="true" className="absolute inset-[-14px] rounded-full border"
                      style={{ borderColor: 'color-mix(in srgb, var(--accent-primary) 60%, transparent)', rotateX: ring.rx, borderTopColor: 'transparent' }}
                      animate={reduce ? undefined : { rotateZ: index ? -360 : 360 }} transition={{ duration: orchestrating ? ring.dur / 2 : ring.dur, repeat: Infinity, ease: 'linear' }}/>
                  ))}
                  <div className="absolute inset-0 flex flex-col items-center justify-center rounded-full border text-center"
                    style={{ borderColor: 'var(--accent-primary)', background: 'radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--accent-primary) 35%, var(--bg-panel)), var(--bg-panel) 70%)',
                      boxShadow: `0 0 ${orchestrating ? 34 : 18}px color-mix(in srgb, var(--accent-primary) ${orchestrating ? 55 : 30}%, transparent), inset 0 0 18px color-mix(in srgb, var(--accent-primary) 25%, transparent)` }}>
                    <motion.div animate={reduce || !orchestrating ? undefined : { scale: [1, 1.15, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>
                      <Bot size={22} style={{ color: 'var(--accent-primary)' }}/>
                    </motion.div>
                    <span className="mt-0.5 text-[8px] font-bold tracking-widest" style={{ color: 'var(--text-primary)' }}>LEANNA CORE</span>
                    <span className="text-[7px]" style={{ color: orchestrating ? 'var(--accent-primary)' : 'var(--text-dimmed)' }}>{orchestrating ? 'ORCHESTRATION' : 'SUPERVISION'}</span>
                  </div>
                </motion.div>

                {/* Onde de sondage : part du cœur à chaque actualisation demandée. */}
                <AnimatePresence>
                  {pingKey > 0 && !reduce && (
                    <motion.span key={pingKey} aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 m-auto h-24 w-24 rounded-full border-2"
                      style={{ borderColor: 'var(--accent-primary)' }}
                      initial={{ scale: 1, opacity: .8 }} animate={{ scale: 9, opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 1.4, ease: 'easeOut' }}/>
                  )}
                </AnimatePresence>

                {view === 'orbit' ? visibleAgents.map((agent, index) => (
                  <OrbitNode key={agent.role} angle={angle} index={index} count={visibleAgents.length}
                    agent={agent} current={runningTaskByRole.get(agent.role)} selected={selectedRole === agent.role}
                    dimmed={!!linked && !linked.has(agent.role)} reduce={reduce} onSelect={selectAgent} onHover={setHoverRole}/>
                )) : visibleAgents.map(agent => {
                  const point = positions.get(agent.role)!;
                  const busy = agent.runningTasks > 0;
                  const current = runningTaskByRole.get(agent.role);
                  return <motion.button key={agent.role} type="button" onClick={() => selectAgent(agent.role)} aria-label={nodeA11y(agent, current)}
                    onPointerEnter={() => setHoverRole(agent.role)} onPointerLeave={() => setHoverRole(null)} onFocus={() => setHoverRole(agent.role)} onBlur={() => setHoverRole(null)}
                    initial={false}
                    animate={{ left: `${point.x / 9}%`, top: `${point.y / 3.6}%`, scale: busy ? 1.06 : 1, opacity: linked && !linked.has(agent.role) ? .25 : 1 }}
                    whileHover={reduce ? undefined : { scale: 1.08, z: 30 }}
                    transition={{ type: 'spring', stiffness: 220, damping: 24 }}
                    className={`${NODE_CLASS} z-20`}
                    style={{ ...nodeLook(agent, selectedRole === agent.role), x: '-50%', y: '-50%', translateZ: busy ? 24 : 8 }}>
                    <AgentCardBody agent={agent} current={current} reduce={reduce}/>
                  </motion.button>;
                })}
                {visibleAgents.length === 0 && agents.length > 0 && (
                  <p className="absolute inset-x-0 bottom-2 z-20 text-center text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Aucun agent pour le filtre « {FILTER_LABEL[filter]} ». <button type="button" className="underline" onClick={() => setFilter('all')}>Tout afficher</button>
                  </p>
                )}
              </motion.div>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
              <span className="flex items-center gap-1"><Radio size={11}/> {fleet?.initialized ? 'Registre connecté' : loading ? 'Connexion au registre…' : 'Données partielles / registre indisponible'}</span>
              {agents.length > MAX_NODES && <span>{visibleAgents.length} agents affichés sur {agents.length} (les agents actifs sont toujours visibles)</span>}
              <span className="flex items-center gap-1"><GitBranch size={11}/> {delegations.length} relation(s) de délégation</span>
              {refreshError && <span className="flex items-center gap-1" style={{ color: 'var(--color-error)' }}><CircleAlert size={11}/> Actualisation impossible</span>}
            </div>
          </motion.div>
        )}

        {tab === 'activity' && (
          <motion.div key="activity" id="agent-panel-activity" role="tabpanel" aria-labelledby="agent-tab-activity"
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .15 }}
            className={`overflow-auto pr-1 ${focus ? 'min-h-0 flex-1' : 'max-h-[300px] xl:max-h-none xl:min-h-0 xl:flex-1'}`}>
            {tasks.length ? <ul className="space-y-1.5" aria-live="polite">
              {tasks.slice(-30).reverse().map(task => {
                const pct = task.progress?.total ? Math.round((task.progress.current / task.progress.total) * 100) : null;
                const failed = task.status === 'failed' || task.status === 'incomplete';
                return <motion.li key={task.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                  className="rounded-lg border px-2.5 py-2" style={{ borderColor: task.status === 'running' ? 'var(--accent-primary)' : 'var(--border-base)', background: 'var(--bg-panel)' }}>
                  <div className="flex items-start gap-2 text-xs">
                    {task.status === 'running' ? <Loader2 size={12} className={`mt-0.5 shrink-0 ${reduce ? '' : 'animate-spin'}`} style={{ color: 'var(--accent-primary)' }}/>
                      : TERMINAL.has(task.status) ? <CheckCircle2 size={12} className="mt-0.5 shrink-0" style={{ color: failed ? 'var(--color-error)' : 'var(--color-success)' }}/>
                      : <Clock3 size={12} className="mt-0.5 shrink-0" style={{ color: 'var(--text-muted)' }}/>}
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setSelectedRole(task.role); setTab('network'); }}>
                      <span className="block truncate" style={{ color: 'var(--text-primary)' }}>{task.title}</span>
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{task.agentName} · {task.progress?.label ?? task.detail ?? TASK_LABEL[task.status] ?? task.status}</span>
                    </button>
                    <span className="shrink-0 font-mono text-[10px]" style={{ color: 'var(--text-dimmed)' }}>{timeAgo(task.timestamp)}</span>
                  </div>
                  {task.status === 'running' && pct !== null && <div className="mt-1.5 h-1 overflow-hidden rounded-full" style={{ background: 'var(--border-base)' }}>
                    <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: 'var(--accent-primary)' }}/>
                  </div>}
                </motion.li>;
              })}
            </ul> : <p className="py-8 text-center text-[11px]" style={{ color: 'var(--text-dimmed)' }}>Aucune mission pour l'instant. Les exécutions d'agents apparaîtront ici en direct.</p>}
          </motion.div>
        )}

        {tab === 'delegations' && (
          <motion.div key="delegations" id="agent-panel-delegations" role="tabpanel" aria-labelledby="agent-tab-delegations"
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .15 }}
            className={`grid gap-3 overflow-auto pr-1 md:grid-cols-2 ${focus ? 'min-h-0 flex-1' : 'max-h-[300px] xl:max-h-none xl:min-h-0 xl:flex-1'}`}>
            <div>
              <div className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}><Network size={11}/> Relations</div>
              {delegations.length ? <ul className="space-y-1">
                {delegations.map(edge => {
                  const max = delegations[0].count;
                  return <li key={`${edge.from}->${edge.to}`} className="rounded-md px-2 py-1.5 text-[11px]" style={{ background: 'var(--bg-panel)', color: 'var(--text-secondary)' }}>
                    <div className="flex items-center gap-1"><span className="truncate">{nameOf(edge.from)}</span><span style={{ color: 'var(--accent-primary)' }}>→</span><span className="truncate">{nameOf(edge.to)}</span><span className="ml-auto font-mono text-[10px]">{edge.count}</span></div>
                    <div className="mt-1 h-0.5 rounded-full" style={{ width: `${(edge.count / max) * 100}%`, background: 'var(--color-success, #22c55e)' }}/>
                  </li>;
                })}
              </ul> : <p className="text-[11px]" style={{ color: 'var(--text-dimmed)' }}>Aucune délégation observée entre agents.</p>}
            </div>
            <div>
              <div className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}><Radio size={11}/> Bus de messages</div>
              {messages.length ? <ul className="space-y-1">
                {messages.slice(-20).reverse().map(message => (
                  <li key={message.id} className="rounded-md px-2 py-1.5 text-[10px]" style={{ background: 'var(--bg-panel)' }}>
                    <div className="flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                      <span className="truncate">{nameOf(message.from)} → {nameOf(message.to)}</span>
                      <span className="ml-auto shrink-0 font-mono" style={{ color: 'var(--text-dimmed)' }}>{message.type}</span>
                    </div>
                    {message.summary && <div className="truncate" style={{ color: 'var(--text-dimmed)' }}>{message.summary}</div>}
                  </li>
                ))}
              </ul> : <p className="text-[11px]" style={{ color: 'var(--text-dimmed)' }}>Le bus n'a encore transporté aucun message.</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Modal open={!!selectedAgent} onClose={() => setSelectedRole(null)} title={selectedAgent?.name ?? 'Agent'} size="md">
        {selectedAgent && (
          <Modal.Body>
            <div className="mb-3">
              <span className="rounded px-1.5 py-0.5 text-[11px]" style={{ color: STATUS_COLOR[selectedAgent.status] ?? 'var(--text-muted)', background: 'var(--accent-subtle)' }}>{STATUS_LABEL[selectedAgent.status] ?? selectedAgent.status}</span>
              <div className="mt-1.5 text-xs" style={{ color: 'var(--text-dimmed)' }}>Rôle : {selectedAgent.role} · {selectedAgent.delegatedSubTasks} sous-tâches déléguées · {selectedAgent.delegationSuccess} réussies</div>
            </div>
            <div className="mb-2 flex flex-wrap gap-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>
              <span>{selectedAgent.runningTasks} mission(s) active(s)</span><span>{selectedAgent.queuedTasks} en attente</span>
              <span>{messages.filter(message => message.from === selectedAgent.role || message.to === selectedAgent.role).length} échanges récents</span>
            </div>
            {selectedTasks.length ? <ul className="space-y-1.5">
              {selectedTasks.map(task => <li key={task.id} className="flex items-start gap-2 text-xs">
                {task.status === 'running' ? <Loader2 size={12} className="mt-0.5 shrink-0 animate-spin" style={{ color: 'var(--accent-primary)' }}/> : TERMINAL.has(task.status) ? <CheckCircle2 size={12} className="mt-0.5 shrink-0" style={{ color: task.status === 'failed' || task.status === 'incomplete' ? 'var(--color-error)' : 'var(--color-success)' }}/> : <Clock3 size={12} className="mt-0.5 shrink-0" style={{ color: 'var(--text-muted)' }}/>}
                <span className="min-w-0 flex-1" style={{ color: 'var(--text-primary)' }}>{task.title}</span>
                <span className="shrink-0 text-[10px]" style={{ color: 'var(--text-dimmed)' }}>{TASK_LABEL[task.status] ?? task.status}</span>
              </li>)}
            </ul> : <p className="text-[11px]" style={{ color: 'var(--text-dimmed)' }}>Aucune mission récente attribuée à cet agent.</p>}
          </Modal.Body>
        )}
      </Modal>
      {agents.length === 0 && <p className="mt-2 text-center text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Aucun agent exposé pour le moment. Les nœuds apparaîtront après initialisation du registre.</p>}
      {reasoningActive && <div className="mt-2 flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--accent-primary)' }}><Activity size={11}/> Raisonnement Live détecté</div>}
    </section>
  );
  // Portail : un ancêtre en perspective/transform confinerait le « fixed » à la carte du dashboard.
  return focus ? createPortal(content, document.body) : content;
});
