import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users, Bot, FlaskConical, FileText, RefreshCw, Shield, Eye,
  Building2, Loader2, CheckCircle2, XCircle, Clock, ChevronDown,
  ChevronRight, Trash2, Code, GitBranch, Terminal, Globe,
  Brain, Database, Zap, Target,
} from 'lucide-react';
import { Panel } from '../ui/Panel';
import { IconButton } from '../ui/IconButton';
import type { ActivityStep } from '../../hooks/useLiveAPI';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface AgentEvent {
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

interface AgentTaskEntry {
  id: string;
  role: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  agentName: string;
  detail?: string;
  summary?: string;
  timestamp: Date;
  durationMs?: number;
}

// Tool activity grouped by virtual agent
interface ToolActivity {
  id: string;
  tool: string;
  label: string;
  agentId: string;
  status: 'running' | 'done';
  timestamp: Date;
  args?: any;
}

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
  // Virtual agents for tool groups
  code:     { icon: Code,         color: '#60a5fa', label: 'Code',         description: 'Lecture/écriture de fichiers' },
  files:    { icon: FileText,     color: '#4ade80', label: 'Fichiers',     description: 'Gestion de fichiers' },
  git:      { icon: GitBranch,    color: '#f472b6', label: 'Git',          description: 'Contrôle de version' },
  terminal: { icon: Terminal,     color: '#fbbf24', label: 'Terminal',     description: 'Commandes système' },
  web:      { icon: Globe,        color: '#34d399', label: 'Web',          description: 'Navigation web' },
  memory:   { icon: Database,     color: '#a855f7', label: 'Mémoire',     description: 'Mémoire persistante' },
  reasoning:{ icon: Brain,        color: '#f97316', label: 'Raisonnement', description: 'Réflexion et planification' },
  mission:  { icon: Target,       color: '#38bdf8', label: 'Mission',     description: 'Mission autonome' },
};

function getRoleMeta(role: string) {
  return ROLE_META[role] ?? { icon: Bot, color: '#94a3b8', label: role, description: '' };
}

// Tool → Agent mapping
const TOOL_TO_AGENT: Record<string, string> = {
  read_project_file: 'code', write_project_file: 'code', modify_project_file: 'code',
  patch_project_file: 'code', analyze_project_file: 'code', search_in_files: 'code',
  read_file_outline: 'code', open_project_file: 'code',
  list_project_files: 'files', create_project_directory: 'files',
  rename_project_file: 'files', delete_project_file: 'files', get_workspace_info: 'files',
  git_status: 'git', git_diff: 'git', git_stage: 'git', git_unstage: 'git',
  git_commit: 'git', git_push: 'git', git_pull: 'git', git_branches: 'git',
  git_switch_branch: 'git', git_log: 'git',
  system_execute_command: 'terminal', system_open: 'terminal', system_notify: 'terminal',
  automation_navigate: 'web', automation_click: 'web', automation_type: 'web',
  automation_extract: 'web', automation_search: 'web', automation_snapshot: 'web',
  save_memory: 'memory', search_memory: 'memory', search_history: 'memory',
  get_conversation_context: 'memory',
  reasoning_delegate_task: 'reasoning', reasoning_think: 'reasoning',
  reasoning_list_strategies: 'reasoning',
  mission_create: 'mission', mission_status: 'mission', mission_list: 'mission',
  agent_delegate: 'reasoning', agent_orchestrate: 'reasoning',
};

function getAgentForTool(tool: string): string {
  return TOOL_TO_AGENT[tool] ?? 'code';
}

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
  return `${(ms / 1000).toFixed(1)}s`;
}

function timeLabel(d: Date): string {
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════

interface AgentPanelProps {
  inline?: boolean;
}

export function AgentPanel({ inline = false }: AgentPanelProps) {
  const [delegatedTasks, setDelegatedTasks] = useState<AgentTaskEntry[]>([]);
  const [toolActivities, setToolActivities] = useState<ToolActivity[]>([]);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [tab, setTab] = useState<'live' | 'delegated'>('live');
  const [tick, setTick] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Ticker for stale cleanup
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 2000);
    return () => clearInterval(interval);
  }, []);

  // Listen for delegated agent events (multi-role)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<AgentEvent>).detail;
      if (!detail || detail.type !== 'agent_event') return;

      setDelegatedTasks(prev => {
        const existing = prev.find(t => t.id === detail.taskId);
        if (existing) {
          return prev.map(t => t.id === detail.taskId ? {
            ...t,
            status: mapStatus(detail.status),
            detail: detail.detail || t.detail,
            summary: detail.summary || t.summary,
            durationMs: detail.durationMs || t.durationMs,
          } : t);
        }
        return [...prev, {
          id: detail.taskId,
          role: detail.role,
          title: detail.title,
          status: mapStatus(detail.status),
          agentName: detail.agentName,
          detail: detail.detail,
          summary: detail.summary,
          timestamp: new Date(detail.timestamp),
          durationMs: detail.durationMs,
        }];
      });

      // Auto-switch to delegated tab when agent task arrives
      setTab('delegated');
    };

    window.addEventListener('jarvis-agent-event', handler);
    return () => window.removeEventListener('jarvis-agent-event', handler);
  }, []);

  // Listen for tool_start / tool_used via custom events from useLiveAPI
  useEffect(() => {
    const startHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.tool) return;
      const agentId = getAgentForTool(detail.tool);
      const id = `${detail.tool}-${Date.now()}`;
      setToolActivities(prev => [...prev.slice(-50), {
        id,
        tool: detail.tool,
        label: formatToolLabel(detail.tool),
        agentId,
        status: 'running',
        timestamp: new Date(),
        args: detail.args,
      }]);
    };

    const doneHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.tool) return;
      setToolActivities(prev => {
        // Find last running entry for this tool and mark done
        const idx = [...prev].reverse().findIndex(a => a.tool === detail.tool && a.status === 'running');
        if (idx === -1) return prev;
        const realIdx = prev.length - 1 - idx;
        const updated = [...prev];
        updated[realIdx] = { ...updated[realIdx], status: 'done' };
        return updated;
      });
    };

    window.addEventListener('jarvis-tool-start', startHandler);
    window.addEventListener('jarvis-tool-done', doneHandler);
    return () => {
      window.removeEventListener('jarvis-tool-start', startHandler);
      window.removeEventListener('jarvis-tool-done', doneHandler);
    };
  }, []);

  // Clean up old tool activities (> 30s)
  useEffect(() => {
    const now = Date.now();
    setToolActivities(prev => {
      const cleaned = prev.filter(a => a.status === 'running' || (now - a.timestamp.getTime()) < 30000);
      return cleaned.length !== prev.length ? cleaned : prev;
    });
  }, [tick]);

  // Group tool activities by agent
  const groupedActivities = useMemo(() => {
    const groups = new Map<string, ToolActivity[]>();
    for (const activity of toolActivities) {
      const list = groups.get(activity.agentId) || [];
      list.push(activity);
      groups.set(activity.agentId, list);
    }
    return groups;
  }, [toolActivities]);

  // Stats
  const liveRunning = toolActivities.filter(a => a.status === 'running').length;
  const delegatedRunning = delegatedTasks.filter(t => t.status === 'running' || t.status === 'pending').length;
  const delegatedDone = delegatedTasks.filter(t => t.status === 'completed').length;
  const delegatedFailed = delegatedTasks.filter(t => t.status === 'failed').length;

  const clearDelegated = useCallback(() => {
    setDelegatedTasks(prev => prev.filter(t => t.status === 'running' || t.status === 'pending'));
  }, []);

  const clearLive = useCallback(() => {
    setToolActivities(prev => prev.filter(a => a.status === 'running'));
  }, []);

  const content = (
    <div className="flex flex-col h-full">
      {/* Tab switcher */}
      <div className="flex items-center gap-1 px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-base)' }}>
        <TabBtn active={tab === 'live'} onClick={() => setTab('live')} count={liveRunning}>
          Activité
        </TabBtn>
        <TabBtn active={tab === 'delegated'} onClick={() => setTab('delegated')} count={delegatedRunning}>
          Agents
        </TabBtn>
        <div className="flex-1" />
        <IconButton
          variant="default"
          icon={<Trash2 className="w-3 h-3" />}
          onClick={tab === 'live' ? clearLive : clearDelegated}
          tooltip="Effacer terminés"
          aria-label="Effacer terminés"
          className="p-1 rounded"
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1 custom-scrollbar">
        {tab === 'live' ? (
          <LiveTab groupedActivities={groupedActivities} expanded={expandedTask} onToggle={id => setExpandedTask(prev => prev === id ? null : id)} />
        ) : (
          <DelegatedTab tasks={delegatedTasks} expanded={expandedTask} onToggle={id => setExpandedTask(prev => prev === id ? null : id)} />
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );

  if (inline) return content;

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

// ── Live Tab: Tool activity grouped by agent ─────────────────────────────

function LiveTab({ groupedActivities, expanded, onToggle }: {
  groupedActivities: Map<string, ToolActivity[]>;
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
  activities: ToolActivity[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const meta = getRoleMeta(agentId);
  const Icon = meta.icon;
  const running = activities.filter(a => a.status === 'running');
  const isActive = running.length > 0;
  const lastActivity = activities[activities.length - 1];

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
        <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${meta.color}18` }}>
          {isActive ? (
            <Loader2 size={12} className="animate-spin" style={{ color: meta.color }} />
          ) : (
            <Icon size={12} style={{ color: meta.color }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold" style={{ color: meta.color }}>{meta.label}</span>
            <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
              {activities.length} action{activities.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="text-[9px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {lastActivity?.label}
          </div>
        </div>
        {isActive && <StatusBadge status="running" />}
        <motion.div animate={{ rotate: expanded ? 90 : 0 }} className="flex-shrink-0">
          <ChevronRight size={10} style={{ color: 'var(--text-dimmed)' }} />
        </motion.div>
      </button>

      {/* Expanded: action list */}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-2 pb-2 space-y-0.5" style={{ borderTop: '1px solid var(--border-base)' }}>
              {activities.slice(-10).map(activity => (
                <div key={activity.id} className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white/5">
                  <div className="flex-shrink-0">
                    {activity.status === 'running' ?
                      <Loader2 size={9} className="animate-spin" style={{ color: meta.color }} /> :
                      <CheckCircle2 size={9} style={{ color: '#4ade80' }} />}
                  </div>
                  <span className="text-[9px] font-mono flex-1 truncate" style={{ color: 'var(--text-muted)' }}>
                    {activity.label}
                  </span>
                  <span className="text-[8px] font-mono" style={{ color: 'var(--text-dimmed)' }}>
                    {timeLabel(activity.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
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
      <button className="w-full flex items-center gap-2 px-2.5 py-2 text-left cursor-pointer hover:bg-white/5 transition"
        onClick={onToggle}>
        <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${meta.color}18` }}>
          {isRunning ? <Loader2 size={12} className="animate-spin" style={{ color: meta.color }} /> :
            <Icon size={12} style={{ color: meta.color }} />}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-semibold truncate block" style={{ color: 'var(--text-primary)' }}>
            {task.title}
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[9px]" style={{ color: meta.color }}>{task.agentName}</span>
            <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>{timeLabel(task.timestamp)}</span>
            {task.durationMs ? <span className="text-[9px] font-mono" style={{ color: 'var(--text-dimmed)' }}>{formatDuration(task.durationMs)}</span> : null}
          </div>
        </div>
        <StatusBadge status={task.status} />
        <motion.div animate={{ rotate: expanded ? 90 : 0 }} className="flex-shrink-0">
          <ChevronRight size={10} style={{ color: 'var(--text-dimmed)' }} />
        </motion.div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-3 py-2 text-[10px] leading-relaxed"
              style={{ color: 'var(--text-secondary)', borderTop: '1px solid var(--border-base)' }}>
              {task.detail && (
                <p className="mb-1" style={{ color: 'var(--text-muted)' }}>{task.detail}</p>
              )}
              {task.summary && (
                <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{task.summary}</p>
              )}
              {!task.detail && !task.summary && (
                <p className="italic" style={{ color: 'var(--text-dimmed)' }}>
                  {task.status === 'running' || task.status === 'pending'
                    ? 'Exécution en cours... Le résumé apparaîtra à la fin.'
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

// ── Helpers ──────────────────────────────────────────────────────────────

function formatToolLabel(tool: string): string {
  return tool
    .replace(/_/g, ' ')
    .replace(/^(read|write|modify|patch|list|create|delete|rename|get|search|run|verify|save)/, (m) => m + ':')
    .replace(/project file/, 'fichier')
    .replace(/project files/, 'fichiers');
}

function mapStatus(status: string): AgentTaskEntry['status'] {
  if (status === 'running' || status === 'pending' || status === 'completed' || status === 'failed' || status === 'cancelled') {
    return status;
  }
  return 'pending';
}
