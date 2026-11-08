import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Activity, Bot, CheckCircle2, CircleAlert, Clock3, GitBranch, Loader2, Radio, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { getAgentTasks, subscribe, type AgentTaskEntry } from '../../stores/agentActivityStore.js';
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
}

const STATUS_LABEL: Record<string, string> = {
  idle: 'Disponible', busy: 'En activité', overloaded: 'Surchargé', offline: 'Hors ligne',
};
const STATUS_COLOR: Record<string, string> = {
  idle: 'var(--color-success, #22c55e)',
  busy: 'var(--accent-primary)',
  overloaded: 'var(--color-error, #ef4444)',
  offline: 'var(--text-dimmed)',
};
const TERMINAL = new Set(['completed', 'failed', 'incomplete', 'cancelled']);

function apiHeaders(): Record<string, string> {
  const token = localStorage.getItem('Leanna_api_token');
  return token ? { 'x-leanna-token': token } : {};
}
async function fetchJSON<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: apiHeaders() });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

/** Supervision visuelle alimentée par le registre, le bus et le store de missions réels. */
export const DashboardAgentNetwork = React.memo(function DashboardAgentNetwork({
  activity, reasoningActive, isBusy,
}: DashboardAgentNetworkProps) {
  const reduce = !!useReducedMotion();
  const tasks = useSyncExternalStore(subscribe, getAgentTasks);
  const [fleet, setFleet] = useState<FleetResponse | null>(null);
  const [messages, setMessages] = useState<BusMessage[]>([]);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshError, setRefreshError] = useState(false);

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

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 8000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const agents = useMemo(() => {
    const registered = fleet?.agents ?? [];
    if (registered.length) return registered;
    // Le store peut connaître des rôles ayant émis des événements même si le registre est indisponible.
    const roles = [...new Set(tasks.map(task => task.role))].filter(Boolean);
    return roles.map(role => ({
      role,
      name: tasks.find(task => task.role === role)?.agentName ?? role,
      status: tasks.some(task => task.role === role && task.status === 'running') ? 'busy' : 'offline',
      isOnline: false, runningTasks: tasks.filter(task => task.role === role && task.status === 'running').length,
      queuedTasks: tasks.filter(task => task.role === role && task.status === 'pending').length,
      delegatedSubTasks: 0, delegationSuccess: 0,
    }));
  }, [fleet, tasks]);

  const visibleAgents = agents.slice(0, 12);
  const selectedAgent = agents.find(agent => agent.role === selectedRole) ?? null;
  const selectedTasks = useMemo(() => selectedRole
    ? tasks.filter(task => task.role === selectedRole).slice(-6).reverse()
    : [], [tasks, selectedRole]);
  const delegations = useMemo(() => {
    const counts = new Map<string, { from: string; to: string; count: number; latest: string }>();
    for (const message of messages) {
      const from = message.from;
      const to = message.to;
      if (!from || !to || from === to || !agents.some(agent => agent.role === from) || !agents.some(agent => agent.role === to)) continue;
      const key = `${from}->${to}`;
      const current = counts.get(key);
      if (current) { current.count++; if (message.timestamp > current.latest) current.latest = message.timestamp; }
      else counts.set(key, { from, to, count: 1, latest: message.timestamp });
    }
    return [...counts.values()];
  }, [messages, agents]);

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    const radiusX = 225, radiusY = 112;
    visibleAgents.forEach((agent, index) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * index) / Math.max(visibleAgents.length, 1);
      map.set(agent.role, { x: 300 + Math.cos(angle) * radiusX, y: 165 + Math.sin(angle) * radiusY });
    });
    return map;
  }, [visibleAgents]);

  const failedTasks = tasks.filter(task => task.status === 'failed' || task.status === 'incomplete').length;
  const runningTasks = tasks.filter(task => task.status === 'running').length;
  const totalMessages = messages.length;

  return (
    <section className="mt-4 overflow-hidden rounded-xl border p-3"
      style={{ borderColor: 'var(--border-base)', backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 66%, transparent)' }}
      aria-label="Supervision multi-agents en temps réel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
            <Activity size={13} style={{ color: 'var(--accent-primary)' }} /> Réseau multi-agents
          </div>
          <p className="mt-0.5 text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
            Agents du registre · missions du store · délégations observées sur le bus
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
          <span className="rounded-full px-2 py-1" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}>{agents.length} agents</span>
          <span style={{ color: 'var(--color-success, #22c55e)' }}>{runningTasks} actifs</span>
          <span style={{ color: failedTasks ? 'var(--color-error)' : 'var(--text-dimmed)' }}>{failedTasks} alertes</span>
          <span style={{ color: 'var(--text-dimmed)' }}>{totalMessages} messages · {activity.length} outils Live</span>
        </div>
      </div>

      <div className="relative mx-auto h-[285px] max-w-[760px] sm:h-[330px]" role="group" aria-label="Agents sélectionnables et délégations observées">
        <svg viewBox="0 0 600 330" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <defs>
            <radialGradient id="leanna-agent-core"><stop offset="0%" stopColor="var(--accent-primary)" stopOpacity=".28"/><stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0"/></radialGradient>
          </defs>
          <circle cx="300" cy="165" r="82" fill="url(#leanna-agent-core)"/>
          {delegations.map((edge, index) => {
            const from = positions.get(edge.from), to = positions.get(edge.to);
            if (!from || !to) return null;
            return <g key={`${edge.from}-${edge.to}`}>
              <path d={`M ${from.x} ${from.y} Q 300 165 ${to.x} ${to.y}`} fill="none"
                stroke="var(--accent-primary)" strokeOpacity=".48" strokeWidth={Math.min(3, 1 + edge.count * .35)} strokeDasharray="5 5"/>
              {!reduce && <motion.circle r="3" fill="var(--accent-primary)"
                animate={{ cx: [from.x, 300, to.x], cy: [from.y, 165, to.y], opacity: [.15, .95, .15] }}
                transition={{ duration: 2.5 + index * .2, repeat: Infinity, ease: 'linear' }}/>}
            </g>;
          })}
          {visibleAgents.map(agent => {
            const point = positions.get(agent.role)!;
            const color = STATUS_COLOR[agent.status] ?? STATUS_COLOR.offline;
            const selected = selectedRole === agent.role;
            return <g key={agent.role}>
              <circle cx={point.x} cy={point.y} r={selected ? 27 : agent.status === 'busy' ? 23 : 19}
                fill={color} fillOpacity=".12" stroke={color} strokeOpacity={selected ? 1 : .55} strokeWidth={selected ? 2.5 : 1.3}/>
              <circle cx={point.x} cy={point.y} r="4" fill={color}/>
            </g>;
          })}
          <circle cx="300" cy="165" r="43" fill="var(--bg-panel)" stroke="var(--accent-primary)" strokeWidth="1.5"/>
          <circle cx="300" cy="165" r="34" fill="var(--accent-subtle)"/>
        </svg>
        <div className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center text-center">
          <motion.div animate={reduce || !isBusy ? undefined : { scale: [1, 1.12, 1] }} transition={{ duration: 1.6, repeat: Infinity }}>
            <Bot size={24} style={{ color: 'var(--accent-primary)' }}/>
          </motion.div>
          <span className="mt-1 text-[9px] font-bold tracking-widest" style={{ color: 'var(--text-primary)' }}>LEANNA CORE</span>
          <span className="text-[8px]" style={{ color: isBusy ? 'var(--accent-primary)' : 'var(--text-dimmed)' }}>{isBusy || runningTasks ? 'ORCHESTRATION ACTIVE' : 'SUPERVISION'}</span>
        </div>
        {visibleAgents.map(agent => {
          const point = positions.get(agent.role)!;
          const selected = selectedRole === agent.role;
          const color = STATUS_COLOR[agent.status] ?? STATUS_COLOR.offline;
          return <button key={agent.role} type="button" onClick={() => setSelectedRole(current => current === agent.role ? null : agent.role)}
            aria-pressed={selected}
            className="absolute z-20 flex w-[104px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 rounded-lg border px-1.5 py-1.5 text-center shadow-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ left: `${point.x / 6}%`, top: `${point.y / 3.3}%`, borderColor: selected ? 'var(--accent-primary)' : 'var(--border-base)', background: selected ? 'var(--accent-subtle)' : 'var(--bg-panel)' }}>
            <span className="flex max-w-full items-center gap-1">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }}/>
              <span className="truncate text-[10px] font-semibold" style={{ color: 'var(--text-primary)' }}>{agent.name}</span>
            </span>
            <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>{STATUS_LABEL[agent.status] ?? agent.status}</span>
            <span className="font-mono text-[9px]" style={{ color }}>{agent.runningTasks} en cours · {agent.queuedTasks} attente</span>
          </button>;
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
        <span className="flex items-center gap-1"><Radio size={11}/> {fleet?.initialized ? 'Registre connecté' : loading ? 'Connexion au registre…' : 'Données partielles / registre indisponible'}</span>
        <span className="flex items-center gap-1"><GitBranch size={11}/> {delegations.length} relation(s) de délégation observée(s)</span>
        {refreshError && <span className="flex items-center gap-1" style={{ color: 'var(--color-error)' }}><CircleAlert size={11}/> Actualisation impossible</span>}
      </div>

      <AnimatePresence mode="wait">
        {selectedAgent && (
          <motion.div key={selectedAgent.role} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            className="mt-3 rounded-lg border p-3" style={{ borderColor: 'var(--border-base)', background: 'var(--bg-panel)' }}>
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  <Bot size={13} style={{ color: 'var(--accent-primary)' }}/>{selectedAgent.name}
                  <span className="rounded px-1.5 py-0.5 text-[9px] font-normal" style={{ color: STATUS_COLOR[selectedAgent.status] ?? 'var(--text-muted)', background: 'var(--accent-subtle)' }}>{STATUS_LABEL[selectedAgent.status] ?? selectedAgent.status}</span>
                </div>
                <div className="mt-0.5 text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Rôle : {selectedAgent.role} · {selectedAgent.delegatedSubTasks} sous-tâches déléguées · {selectedAgent.delegationSuccess} réussies</div>
              </div>
              <button type="button" onClick={() => setSelectedRole(null)} aria-label="Fermer le détail" className="rounded p-1" style={{ color: 'var(--text-muted)' }}><X size={14}/></button>
            </div>
            <div className="mb-2 flex flex-wrap gap-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>
              <span>{selectedAgent.runningTasks} mission(s) active(s)</span><span>{selectedAgent.queuedTasks} en attente</span>
              <span>{messages.filter(message => message.from === selectedAgent.role || message.to === selectedAgent.role).length} échanges récents</span>
            </div>
            {selectedTasks.length ? <ul className="space-y-1.5">
              {selectedTasks.map(task => <li key={task.id} className="flex items-start gap-2 text-xs">
                {task.status === 'running' ? <Loader2 size={12} className="mt-0.5 shrink-0" style={{ color: 'var(--accent-primary)' }}/> : TERMINAL.has(task.status) ? <CheckCircle2 size={12} className="mt-0.5 shrink-0" style={{ color: task.status === 'failed' || task.status === 'incomplete' ? 'var(--color-error)' : 'var(--color-success)' }}/> : <Clock3 size={12} className="mt-0.5 shrink-0" style={{ color: 'var(--text-muted)' }}/>}
                <span className="min-w-0 flex-1" style={{ color: 'var(--text-primary)' }}>{task.title}</span>
                <span className="shrink-0 text-[10px]" style={{ color: 'var(--text-dimmed)' }}>{task.status}</span>
              </li>)}
            </ul> : <p className="text-[11px]" style={{ color: 'var(--text-dimmed)' }}>Aucune mission récente attribuée à cet agent.</p>}
            {delegations.some(edge => edge.from === selectedAgent.role || edge.to === selectedAgent.role) && (
              <div className="mt-2 border-t pt-2" style={{ borderColor: 'var(--border-base)' }}>
                <div className="mb-1 text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>Relations observées</div>
                {delegations.filter(edge => edge.from === selectedAgent.role || edge.to === selectedAgent.role).slice(0, 5).map(edge => (
                  <div key={`${edge.from}->${edge.to}`} className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    <GitBranch size={10}/>{edge.from} → {edge.to}<span className="ml-auto font-mono">{edge.count} msg</span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {agents.length === 0 && <p className="mt-2 text-center text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Aucun agent exposé pour le moment. Les nœuds apparaîtront après initialisation du registre.</p>}
      {agents.length > 12 && <p className="mt-2 text-center text-[10px]" style={{ color: 'var(--text-dimmed)' }}>12 agents affichés sur {agents.length} ; les détails restent accessibles dans le panneau Flotte.</p>}
      {reasoningActive && <div className="mt-2 flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--accent-primary)' }}><Activity size={11}/> Raisonnement Live détecté</div>}
    </section>
  );
});
