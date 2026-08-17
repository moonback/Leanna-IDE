import React, { useState, useEffect, useRef, useMemo, useSyncExternalStore } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users, Bot, FlaskConical, FileText, RefreshCw, Shield, Eye,
  Building2, Loader2, CheckCircle2, XCircle, Clock,
  ChevronRight, Trash2, Code, GitBranch, Globe,
  Brain, Database, Target, Activity, ArrowRight, Compass,
} from 'lucide-react';
import { Panel } from '../ui/Panel';
import { IconButton } from '../ui/IconButton';
import { useProfile } from '../../context/UserProfileContext';
import type { AgentRole } from '../../context/UserProfileContext';
import {
  getToolActivities, getAgentTasks, subscribe,
  clearCompletedTools, clearCompletedTasks,
  type ToolActivityEntry, type AgentTaskEntry,
} from '../../stores/agentActivityStore';

// ═══════════════════════════════════════════════════════════════════════════════
// Agent Metadata
// ═══════════════════════════════════════════════════════════════════════════════

const ROLE_META: Record<string, {
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  color: string;
  label: string;
  description: string;
}> = {
  test:     { icon: FlaskConical, color: '#4ade80', label: 'Tests',        description: 'Tests unitaires & intégration' },
  docs:     { icon: FileText,     color: '#60a5fa', label: 'Docs',         description: 'Documentation technique' },
  refactor: { icon: RefreshCw,    color: '#fbbf24', label: 'Refactor',     description: 'Refactoring iso-fonctionnel' },
  security: { icon: Shield,       color: '#f87171', label: 'Sécurité',     description: 'Audit de vulnérabilités' },
  review:   { icon: Eye,          color: '#a78bfa', label: 'Review',       description: 'Code review & qualité' },
  architect:{ icon: Building2,    color: '#f97316', label: 'Architecture', description: 'Analyse architecturale' },
  code:     { icon: Code,         color: '#60a5fa', label: 'Code',         description: 'Lecture/écriture de fichiers' },
  files:    { icon: FileText,     color: '#4ade80', label: 'Fichiers',     description: 'Gestion de fichiers' },
  git:      { icon: GitBranch,    color: '#f472b6', label: 'Git',          description: 'Contrôle de version' },
  web:      { icon: Globe,        color: '#34d399', label: 'Web',          description: 'Navigation web' },
  memory:   { icon: Database,     color: '#a855f7', label: 'Mémoire',     description: 'Mémoire persistante' },
  reasoning:{ icon: Brain,        color: '#f97316', label: 'Raisonnement', description: 'Réflexion et planification' },
  mission:  { icon: Target,       color: '#38bdf8', label: 'Mission',     description: 'Mission autonome' },
};

function getRoleMeta(role: string) {
  return ROLE_META[role] ?? { icon: Bot, color: '#94a3b8', label: role, description: '' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Agent Roster Config (matches SettingsView roles)
// ═══════════════════════════════════════════════════════════════════════════════

const AGENT_ROSTER: { id: AgentRole; label: string; desc: string; icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>; color: string }[] = [
  { id: 'coder',     label: 'Coder',      desc: 'Modifications de fichiers',     icon: Code,        color: '#60a5fa' },
  { id: 'test',      label: 'Test',       desc: 'Tests unitaires & E2E',         icon: FlaskConical,color: '#4ade80' },
  { id: 'docs',      label: 'Docs',       desc: 'Documentation technique',       icon: FileText,    color: '#a78bfa' },
  { id: 'refactor',  label: 'Refactor',   desc: 'Refactoring du code',           icon: RefreshCw,   color: '#fbbf24' },
  { id: 'security',  label: 'Security',   desc: 'Audit de sécurité',             icon: Shield,      color: '#f87171' },
  { id: 'review',    label: 'Review',     desc: 'Revue de code',                 icon: Eye,         color: '#fb923c' },
  { id: 'architect', label: 'Architect',  desc: 'Architecture & coordination',   icon: Compass,     color: '#2dd4bf' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; bg: string; label: string; icon: React.ReactNode }> = {
    pending:   { color: 'var(--text-muted)', bg: 'rgba(113,113,122,0.15)', label: 'Attente', icon: <Clock size={9} /> },
    running:   { color: '#38bdf8', bg: 'rgba(56,189,248,0.15)', label: 'En cours', icon: <Loader2 size={9} className="animate-spin" /> },
    completed: { color: '#4ade80', bg: 'rgba(74,222,128,0.12)', label: 'OK', icon: <CheckCircle2 size={9} /> },
    failed:    { color: '#f87171', bg: 'rgba(248,113,113,0.12)', label: 'Erreur', icon: <XCircle size={9} /> },
    done:      { color: '#4ade80', bg: 'rgba(74,222,128,0.12)', label: 'OK', icon: <CheckCircle2 size={9} /> },
  };
  const c = config[status] ?? config.pending;
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-semibold uppercase tracking-wider"
      style={{ color: c.color, backgroundColor: c.bg }}>
      {c.icon}{c.label}
    </span>
  );
}

function formatDuration(ms?: number): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Elapsed time hook for running items */
function useElapsed(startTime: number, active: boolean): string {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, [active]);
  if (!active) return '';
  return formatDuration(now - startTime);
}

/** Format tool args for display */
function formatArgs(args: any): string {
  if (!args) return '';
  if (typeof args === 'string') return args.slice(0, 80);
  const keys = Object.keys(args);
  if (keys.length === 0) return '';
  const priority = ['path', 'file', 'relativePath', 'command', 'query', 'content', 'message'];
  for (const key of priority) {
    if (args[key]) {
      const val = String(args[key]);
      return val.length > 60 ? val.slice(0, 57) + '…' : val;
    }
  }
  const firstVal = String(args[keys[0]]);
  return firstVal.length > 60 ? firstVal.slice(0, 57) + '…' : firstVal;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════

interface AgentPanelProps {
  inline?: boolean;
  onClose?: () => void;
}

export function AgentPanel({ inline = false, onClose }: AgentPanelProps) {
  // Subscribe to the global store — re-renders on every change
  const toolActivities = useSyncExternalStore(subscribe, getToolActivities);
  const delegatedTasks = useSyncExternalStore(subscribe, getAgentTasks);
  const { profile } = useProfile();

  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [tab, setTab] = useState<'roster' | 'live' | 'delegated'>('roster');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-switch to delegated tab when agents arrive
  const hasAgents = delegatedTasks.some(t => t.status === 'running' || t.status === 'pending');
  useEffect(() => {
    if (hasAgents) setTab('delegated');
  }, [hasAgents]);

  // Group tool activities by agent
  const groupedActivities = useMemo(() => {
    const groups = new Map<string, ToolActivityEntry[]>();
    for (const activity of toolActivities) {
      const list = groups.get(activity.agentId) || [];
      list.push(activity);
      groups.set(activity.agentId, list);
    }
    return groups;
  }, [toolActivities]);

  // Determine which roles are currently active (running tasks)
  const activeRoles = useMemo(() => {
    const roles = new Set<string>();
    for (const task of delegatedTasks) {
      if (task.status === 'running' || task.status === 'pending') {
        roles.add(task.role);
      }
    }
    for (const [agentId, activities] of groupedActivities) {
      if (activities.some(a => a.status === 'running')) {
        roles.add(agentId);
      }
    }
    return roles;
  }, [delegatedTasks, groupedActivities]);

  // Stats
  const liveRunning = toolActivities.filter(a => a.status === 'running').length;
  const delegatedRunning = delegatedTasks.filter(t => t.status === 'running' || t.status === 'pending').length;
  const delegatedDone = delegatedTasks.filter(t => t.status === 'completed').length;
  const delegatedFailed = delegatedTasks.filter(t => t.status === 'failed').length;
  const totalDone = toolActivities.filter(a => a.status === 'done').length;

  const allowedCount = profile.agents.allowedRoles.length;
  const totalAgents = AGENT_ROSTER.length;

  const content = (
    <div className="flex flex-col h-full">
      {/* Tab switcher + stats bar */}
      <div className="flex flex-col flex-shrink-0" style={{ borderBottom: '1px solid var(--border-base)' }}>
        <div className="flex items-center gap-1 px-3 py-2">
          <TabBtn active={tab === 'roster'} onClick={() => setTab('roster')} count={allowedCount}>
            <Users size={10} /> Roster
          </TabBtn>
          <TabBtn active={tab === 'live'} onClick={() => setTab('live')} count={liveRunning}>
            <Activity size={10} /> Activité
          </TabBtn>
          <TabBtn active={tab === 'delegated'} onClick={() => setTab('delegated')} count={delegatedRunning}>
            <Bot size={10} /> Tâches
          </TabBtn>
          <div className="flex-1" />
          {tab !== 'roster' && (
            <IconButton
              variant="default"
              icon={<Trash2 className="w-3 h-3" />}
              onClick={tab === 'live' ? clearCompletedTools : clearCompletedTasks}
              tooltip="Effacer terminés"
              aria-label="Effacer terminés"
              className="p-1 rounded"
            />
          )}
        </div>
        {/* Quick stats */}
        <div className="flex items-center gap-3 px-3 pb-2">
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px]"
            style={{ backgroundColor: 'color-mix(in srgb, var(--accent-primary) 12%, transparent)', color: 'var(--accent-primary)' }}>
            <Users size={8} />
            <span className="font-bold">{allowedCount}</span>
            <span className="opacity-70">/{totalAgents} dispo</span>
          </div>
          <StatPill icon={<Loader2 size={8} className="animate-spin" />} value={liveRunning + delegatedRunning} label="actifs" color="#38bdf8" />
          <StatPill icon={<CheckCircle2 size={8} />} value={totalDone + delegatedDone} label="terminés" color="#4ade80" />
          {delegatedFailed > 0 && <StatPill icon={<XCircle size={8} />} value={delegatedFailed} label="erreurs" color="#f87171" />}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5 custom-scrollbar">
        {tab === 'roster' ? (
          <RosterTab allowedRoles={profile.agents.allowedRoles} activeRoles={activeRoles} />
        ) : tab === 'live' ? (
          <LiveTab groupedActivities={groupedActivities} expanded={expandedTask} onToggle={id => setExpandedTask(prev => prev === id ? null : id)} />
        ) : (
          <DelegatedTab tasks={delegatedTasks} expanded={expandedTask} onToggle={id => setExpandedTask(prev => prev === id ? null : id)} />
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );

  if (inline) {
    return (
      <motion.div
        className="fixed inset-0 z-[9995] flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
        <motion.div
          className="relative flex flex-col w-full max-w-lg overflow-hidden"
          style={{
            maxHeight: '75vh',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-base)',
            borderRadius: 'var(--radius-xl)',
            boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
          }}
          initial={{ scale: 0.95, y: 12, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.95, y: 12, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal header */}
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-base)' }}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ backgroundColor: 'var(--accent-subtle)' }}>
                <Users size={14} style={{ color: 'var(--accent-primary)' }} />
              </div>
              <div>
                <h2 className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>Agents</h2>
                <span className="text-[9px] font-mono" style={{ color: 'var(--text-dimmed)' }}>
                  {liveRunning + delegatedRunning} actifs
                </span>
              </div>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-md transition-colors hover:bg-white/10"
                style={{ color: 'var(--text-muted)' }}
                aria-label="Fermer"
              >
                <XCircle size={16} />
              </button>
            )}
          </div>
          {content}
        </motion.div>
      </motion.div>
    );
  }

  return (
    <Panel title="Agents" icon={<Users className="w-4 h-4" />}
      actions={<span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-dimmed)' }}>
        {liveRunning + delegatedRunning} actifs
      </span>}>
      {content}
    </Panel>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════════

function StatPill({ icon, value, label, color }: { icon: React.ReactNode; value: number; label: string; color: string }) {
  if (value === 0) return null;
  return (
    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px]"
      style={{ backgroundColor: `${color}12`, color }}>
      {icon}
      <span className="font-bold">{value}</span>
      <span className="opacity-70">{label}</span>
    </div>
  );
}

function TabBtn({ active, onClick, count, children }: { active: boolean; onClick: () => void; count: number; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors"
      style={{
        color: active ? 'var(--accent-primary)' : 'var(--text-dimmed)',
        backgroundColor: active ? 'var(--accent-subtle)' : 'transparent',
      }}>
      {children}
      {count > 0 && (
        <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold"
          style={{ backgroundColor: active ? 'var(--accent-primary)' : 'var(--text-dimmed)', color: 'var(--bg-panel)' }}>
          {count}
        </span>
      )}
    </button>
  );
}

// ── Roster Tab: Available agents and their status ────────────────────────

function RosterTab({ allowedRoles, activeRoles }: { allowedRoles: AgentRole[]; activeRoles: Set<string> }) {
  return (
    <div className="space-y-1.5">
      {AGENT_ROSTER.map(agent => {
        const isAllowed = allowedRoles.includes(agent.id);
        const isActive = activeRoles.has(agent.id);
        const Icon = agent.icon;

        return (
          <motion.div
            key={agent.id}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-colors"
            style={{
              backgroundColor: isActive ? `${agent.color}10` : 'var(--bg-input)',
              border: `1px solid ${isActive ? `${agent.color}40` : isAllowed ? 'var(--border-base)' : 'transparent'}`,
              opacity: isAllowed ? 1 : 0.45,
            }}
          >
            {/* Icon */}
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 relative"
              style={{ backgroundColor: `${agent.color}18` }}
            >
              <Icon size={14} style={{ color: agent.color }} />
              {isActive && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
                  style={{ backgroundColor: '#4ade80', borderColor: 'var(--bg-panel)' }} />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold" style={{ color: isAllowed ? 'var(--text-primary)' : 'var(--text-dimmed)' }}>
                  {agent.label}
                </span>
                {isActive && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-wider"
                    style={{ backgroundColor: 'rgba(56,189,248,0.12)', color: '#38bdf8' }}>
                    <Loader2 size={7} className="animate-spin" /> en cours
                  </span>
                )}
              </div>
              <p className="text-[9px] mt-0.5 truncate" style={{ color: 'var(--text-dimmed)' }}>
                {agent.desc}
              </p>
            </div>

            {/* Status */}
            <div className="flex-shrink-0">
              {isAllowed ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-semibold"
                  style={{ backgroundColor: 'rgba(74,222,128,0.1)', color: '#4ade80' }}>
                  <CheckCircle2 size={9} /> Disponible
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-semibold"
                  style={{ backgroundColor: 'rgba(113,113,122,0.1)', color: 'var(--text-dimmed)' }}>
                  <XCircle size={9} /> Désactivé
                </span>
              )}
            </div>
          </motion.div>
        );
      })}

      {/* Footer hint */}
      <p className="text-center text-[9px] pt-3 pb-1" style={{ color: 'var(--text-dimmed)' }}>
        Gérez les agents dans <span className="font-semibold" style={{ color: 'var(--text-muted)' }}>Paramètres → Agents</span>
      </p>
    </div>
  );
}

// ── Live Tab: Tool activity grouped by agent ─────────────────────────────

function LiveTab({ groupedActivities, expanded, onToggle }: {
  groupedActivities: Map<string, ToolActivityEntry[]>;
  expanded: string | null;
  onToggle: (id: string) => void;
}) {
  if (groupedActivities.size === 0) {
    return <EmptyState message="Aucune activité en cours" sub="Les outils utilisés apparaîtront ici en temps réel" />;
  }

  return (
    <AnimatePresence initial={false}>
      {[...groupedActivities.entries()].map(([agentId, activities]) => (
        <AgentGroupCard key={agentId} agentId={agentId} activities={activities}
          expanded={expanded === agentId} onToggle={() => onToggle(agentId)} />
      ))}
    </AnimatePresence>
  );
}

function AgentGroupCard({ agentId, activities, expanded, onToggle }: {
  agentId: string;
  activities: ToolActivityEntry[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const meta = getRoleMeta(agentId);
  const Icon = meta.icon;
  const running = activities.filter(a => a.status === 'running');
  const done = activities.filter(a => a.status === 'done');
  const isActive = running.length > 0;
  const lastActivity = activities[activities.length - 1];
  const progress = activities.length > 0 ? (done.length / activities.length) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="rounded-lg overflow-hidden"
      style={{
        backgroundColor: isActive ? `${meta.color}08` : 'var(--bg-input)',
        border: `1px solid ${isActive ? `${meta.color}30` : 'var(--border-base)'}`,
      }}>
      {/* Header */}
      <button className="w-full flex items-center gap-2 px-2.5 py-2 text-left cursor-pointer hover:bg-white/5 transition"
        onClick={onToggle}>
        <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 relative"
          style={{ backgroundColor: `${meta.color}18` }}>
          {isActive ? (
            <Loader2 size={13} className="animate-spin" style={{ color: meta.color }} />
          ) : (
            <Icon size={13} style={{ color: meta.color }} />
          )}
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold"
            style={{ backgroundColor: meta.color, color: '#000' }}>
            {activities.length}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold" style={{ color: meta.color }}>{meta.label}</span>
            <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
              {done.length}/{activities.length} terminé{done.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="text-[9px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {lastActivity?.label}
            {lastActivity?.args && (
              <span className="ml-1 opacity-60">→ {formatArgs(lastActivity.args)}</span>
            )}
          </div>
        </div>
        {isActive && <RunningElapsed startTime={running[0].timestamp} />}
        <motion.div animate={{ rotate: expanded ? 90 : 0 }} className="flex-shrink-0">
          <ChevronRight size={10} style={{ color: 'var(--text-dimmed)' }} />
        </motion.div>
      </button>

      {/* Progress bar */}
      {activities.length > 1 && (
        <div className="px-2.5 pb-1">
          <div className="h-0.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-base)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: meta.color }}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      )}

      {/* Expanded: action list */}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-2 pb-2 space-y-0.5 pt-1" style={{ borderTop: '1px solid var(--border-base)' }}>
              <div className="px-2 py-1 mb-1">
                <p className="text-[9px] italic" style={{ color: 'var(--text-dimmed)' }}>{meta.description}</p>
              </div>
              {activities.slice(-15).map(activity => (
                <ToolActivityRow key={activity.id} activity={activity} color={meta.color} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ToolActivityRow({ activity, color }: { activity: ToolActivityEntry; color: string }) {
  const elapsed = activity.endTimestamp
    ? formatDuration(activity.endTimestamp - activity.timestamp)
    : '';

  return (
    <div className="flex items-start gap-1.5 px-2 py-1.5 rounded hover:bg-white/5 group">
      <div className="flex-shrink-0 mt-0.5">
        {activity.status === 'running' ?
          <Loader2 size={9} className="animate-spin" style={{ color }} /> :
          <CheckCircle2 size={9} style={{ color: '#4ade80' }} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-mono font-medium truncate" style={{ color: 'var(--text-muted)' }}>
            {activity.label}
          </span>
          {elapsed && (
            <span className="text-[8px] font-mono flex-shrink-0" style={{ color: 'var(--text-dimmed)' }}>
              {elapsed}
            </span>
          )}
        </div>
        {activity.args && (
          <div className="text-[8px] font-mono truncate mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ color: 'var(--text-dimmed)' }}>
            <ArrowRight size={7} className="inline mr-0.5" />
            {formatArgs(activity.args)}
          </div>
        )}
      </div>
      <span className="text-[8px] font-mono flex-shrink-0" style={{ color: 'var(--text-dimmed)' }}>
        {timeLabel(activity.timestamp)}
      </span>
    </div>
  );
}

function RunningElapsed({ startTime }: { startTime: number }) {
  const elapsed = useElapsed(startTime, true);
  return (
    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-md flex-shrink-0"
      style={{ backgroundColor: 'rgba(56,189,248,0.1)', color: '#38bdf8' }}>
      ⏱ {elapsed || '0s'}
    </span>
  );
}

// ── Delegated Tab: Multi-role agent tasks ────────────────────────────────

function DelegatedTab({ tasks, expanded, onToggle }: {
  tasks: AgentTaskEntry[];
  expanded: string | null;
  onToggle: (id: string) => void;
}) {
  if (tasks.length === 0) {
    return <EmptyState message="Aucun agent déclenché" sub="Les agents multi-rôles s'activent quand Leanna délègue une tâche complexe (test, docs, refactor, security, review, architect)" />;
  }

  return (
    <AnimatePresence initial={false}>
      {tasks.map(task => (
        <DelegatedTaskCard key={task.id} task={task}
          expanded={expanded === task.id}
          onToggle={() => onToggle(task.id)} />
      ))}
    </AnimatePresence>
  );
}

function DelegatedTaskCard({ task, expanded, onToggle }: {
  task: AgentTaskEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const meta = getRoleMeta(task.role);
  const Icon = meta.icon;
  const isRunning = task.status === 'running';

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.15 }}
      className="rounded-lg overflow-hidden"
      style={{
        backgroundColor: isRunning ? `${meta.color}08` : 'var(--bg-input)',
        border: `1px solid ${isRunning ? `${meta.color}30` : 'var(--border-base)'}`,
      }}>
      <button className="w-full flex items-center gap-2 px-2.5 py-2.5 text-left cursor-pointer hover:bg-white/5 transition"
        onClick={onToggle}>
        <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${meta.color}18` }}>
          {isRunning ? <Loader2 size={13} className="animate-spin" style={{ color: meta.color }} /> :
            <Icon size={13} style={{ color: meta.color }} />}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-semibold truncate block" style={{ color: 'var(--text-primary)' }}>
            {task.title}
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[9px] font-medium" style={{ color: meta.color }}>{task.agentName}</span>
            <span className="text-[8px] opacity-50">•</span>
            <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>{timeLabel(task.timestamp)}</span>
            {task.durationMs ? (
              <>
                <span className="text-[8px] opacity-50">•</span>
                <span className="text-[9px] font-mono" style={{ color: 'var(--text-dimmed)' }}>{formatDuration(task.durationMs)}</span>
              </>
            ) : null}
            {task.steps.length > 0 && (
              <>
                <span className="text-[8px] opacity-50">•</span>
                <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>{task.steps.length} étape{task.steps.length > 1 ? 's' : ''}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isRunning && <RunningElapsed startTime={task.timestamp} />}
          <StatusBadge status={task.status} />
        </div>
        <motion.div animate={{ rotate: expanded ? 90 : 0 }} className="flex-shrink-0">
          <ChevronRight size={10} style={{ color: 'var(--text-dimmed)' }} />
        </motion.div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-3 py-2.5 space-y-2"
              style={{ borderTop: '1px solid var(--border-base)' }}>
              {/* Role description */}
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ backgroundColor: `${meta.color}08` }}>
                <Icon size={10} style={{ color: meta.color }} />
                <span className="text-[9px]" style={{ color: meta.color }}>{meta.description}</span>
              </div>

              {/* Steps timeline */}
              {task.steps.length > 0 && (
                <div className="space-y-0.5 ml-1">
                  <p className="text-[9px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Étapes :</p>
                  {task.steps.map((step, i) => (
                    <div key={i} className="flex items-start gap-1.5 pl-2" style={{ borderLeft: `2px solid ${meta.color}30` }}>
                      <span className="text-[8px] font-mono flex-shrink-0 mt-0.5" style={{ color: meta.color }}>{i + 1}.</span>
                      <span className="text-[9px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>{step}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Detail */}
              {task.detail && task.steps.length === 0 && (
                <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>{task.detail}</p>
              )}

              {/* Summary */}
              {task.summary && (
                <div className="px-2 py-1.5 rounded-md" style={{ backgroundColor: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.15)' }}>
                  <p className="text-[9px] font-semibold mb-0.5" style={{ color: '#4ade80' }}>Résumé</p>
                  <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>{task.summary}</p>
                </div>
              )}

              {/* Empty state */}
              {!task.detail && !task.summary && task.steps.length === 0 && (
                <p className="text-[10px] italic" style={{ color: 'var(--text-dimmed)' }}>
                  {isRunning
                    ? 'Exécution en cours… Les étapes apparaîtront au fur et à mesure.'
                    : 'Aucun détail disponible.'}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Empty State ──────────────────────────────────────────────────────────

function EmptyState({ message, sub }: { message: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-input)' }}>
        <Users size={18} style={{ color: 'var(--text-dimmed)' }} />
      </div>
      <div className="text-center px-4">
        <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>{message}</p>
        <p className="text-[9px] mt-1 leading-relaxed" style={{ color: 'var(--text-dimmed)' }}>{sub}</p>
      </div>
    </div>
  );
}
