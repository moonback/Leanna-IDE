import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Code, GitBranch, Globe, Brain, Database,
  FileText, Search, Loader2, Target, Users, FlaskConical,
  RefreshCw, Shield, Eye, Building2,
} from 'lucide-react';
import type { ActivityStep } from '../../hooks/useLiveAPI';

// ── Agent Definitions (tool-based "virtual" agents) ────────────────────────

interface AgentDef {
  id: string;
  name: string;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>;
  color: string;
  tools: string[];
}

const TOOL_AGENTS: AgentDef[] = [
  {
    id: 'code',
    name: 'Code',
    icon: Code,
    color: '#60a5fa',
    tools: ['read_project_file', 'write_project_file', 'modify_project_file', 'patch_project_file', 'analyze_project_file', 'search_in_files', 'read_file_outline'],
  },
  {
    id: 'files',
    name: 'Fichiers',
    icon: FileText,
    color: '#4ade80',
    tools: ['list_project_files', 'create_project_directory', 'rename_project_file', 'delete_project_file', 'delete_project_folder', 'open_project_file', 'get_workspace_info'],
  },
  {
    id: 'git',
    name: 'Git',
    icon: GitBranch,
    color: '#f472b6',
    tools: ['git_status', 'git_diff', 'git_stage', 'git_unstage', 'git_commit', 'git_push', 'git_pull', 'git_branches', 'git_switch_branch', 'git_log'],
  },
  {
    id: 'web',
    name: 'Web',
    icon: Globe,
    color: '#34d399',
    tools: ['automation_navigate', 'automation_click', 'automation_type', 'automation_extract', 'automation_search', 'automation_snapshot'],
  },
  {
    id: 'memory',
    name: 'Mémoire',
    icon: Database,
    color: '#a855f7',
    tools: ['save_memory', 'search_memory', 'search_history', 'get_conversation_context'],
  },
  {
    id: 'reasoning',
    name: 'Raisonnement',
    icon: Brain,
    color: '#f97316',
    tools: ['reasoning_delegate_task', 'reasoning_think'],
  },
];

// ── Multi-role agents (from AgentOrchestrator) ─────────────────────────────

interface RoleAgentDef {
  id: string;
  name: string;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>;
  color: string;
}

const ROLE_AGENTS: Record<string, RoleAgentDef> = {
  test:     { id: 'role-test',     name: 'Tests',   icon: FlaskConical, color: '#4ade80' },
  docs:     { id: 'role-docs',     name: 'Docs',    icon: FileText,     color: '#60a5fa' },
  refactor: { id: 'role-refactor', name: 'Refactor', icon: RefreshCw,   color: '#fbbf24' },
  security: { id: 'role-security', name: 'Sécu',    icon: Shield,       color: '#f87171' },
  review:   { id: 'role-review',   name: 'Review',  icon: Eye,          color: '#a78bfa' },
  architect:{ id: 'role-architect', name: 'Archi',   icon: Building2,    color: '#f97316' },
};

function getAgentForTool(tool: string): AgentDef | null {
  return TOOL_AGENTS.find(a => a.tools.includes(tool)) || null;
}

// ── Component ──────────────────────────────────────────────────────────────

interface MultiAgentIndicatorProps {
  steps: ActivityStep[];
}

interface LiveAgent {
  id: string;
  name: string;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>;
  color: string;
  isActive: boolean;
  expiresAt: number;
}

/**
 * Shows which "agents" are currently active based on:
 * 1. Tools being used (code, git, etc.)
 * 2. Multi-role agents running tasks (test, docs, refactor, etc.)
 * 3. Missions in progress
 *
 * Uses a ticker interval to expire "recent" badges properly.
 */
export function MultiAgentIndicator({ steps }: MultiAgentIndicatorProps) {
  const [roleAgents, setRoleAgents] = useState<Map<string, { name: string; role: string; expiresAt: number }>>(new Map());
  const [activeMissions, setActiveMissions] = useState<Map<string, { title: string; expiresAt: number }>>(new Map());
  const [tick, setTick] = useState(0);

  // ── Ticker: force re-render every 2s to expire stale badges ──────────────
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 2000);
    return () => clearInterval(interval);
  }, []);

  // ── Listen for multi-role agent events ───────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;

      const taskId = detail.taskId as string;
      const role = detail.role as string;
      const agentName = detail.agentName as string;

      if (detail.event === 'task_started' || detail.status === 'running' || detail.status === 'pending') {
        setRoleAgents(prev => {
          const next = new Map(prev);
          next.set(taskId, { name: agentName, role, expiresAt: Date.now() + 120_000 }); // 2 min TTL
          return next;
        });
      } else if (detail.event === 'task_completed' || detail.event === 'task_failed') {
        // Keep for 5s then remove
        setRoleAgents(prev => {
          const next = new Map(prev);
          next.set(taskId, { name: agentName, role, expiresAt: Date.now() + 5000 });
          return next;
        });
      }
    };

    window.addEventListener('jarvis-agent-event', handler);
    return () => window.removeEventListener('jarvis-agent-event', handler);
  }, []);

  // ── Listen for mission events ────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.type !== 'mission_event') return;

      const missionId = detail.missionId as string;

      if (detail.event === 'mission_started') {
        setActiveMissions(prev => {
          const next = new Map(prev);
          next.set(missionId, { title: detail.title ?? 'Mission', expiresAt: Date.now() + 600_000 }); // 10 min TTL
          return next;
        });
      } else if (detail.event === 'mission_completed' || detail.event === 'mission_cancelled' || detail.event === 'mission_failed') {
        setActiveMissions(prev => {
          const next = new Map(prev);
          next.set(missionId, { title: detail.title ?? 'Mission', expiresAt: Date.now() + 5000 });
          return next;
        });
      }
    };

    window.addEventListener('jarvis-mission-event', handler);
    return () => window.removeEventListener('jarvis-mission-event', handler);
  }, []);

  // ── Compute visible badges ───────────────────────────────────────────────
  const now = Date.now();

  // Tool-based agents
  const toolAgents = useMemo(() => {
    const running = steps.filter(s => s.status === 'running');
    const agentSet = new Set<string>();
    const result: LiveAgent[] = [];

    for (const step of running) {
      const agent = getAgentForTool(step.tool);
      if (agent && !agentSet.has(agent.id)) {
        agentSet.add(agent.id);
        result.push({ ...agent, isActive: true, expiresAt: Infinity });
      }
    }

    // Recently used (last 5s)
    const recent = steps.filter(s => s.status === 'done' && (now - s.timestamp.getTime()) < 5000);
    for (const step of recent) {
      const agent = getAgentForTool(step.tool);
      if (agent && !agentSet.has(agent.id)) {
        agentSet.add(agent.id);
        result.push({ ...agent, isActive: false, expiresAt: step.timestamp.getTime() + 5000 });
      }
    }

    return result;
  }, [steps, tick]); // tick ensures re-evaluation every 2s

  // Role-based agents (filter expired)
  const roleAgentBadges = useMemo((): LiveAgent[] => {
    const result: LiveAgent[] = [];
    const seenRoles = new Set<string>();

    for (const [taskId, entry] of roleAgents) {
      if (entry.expiresAt < now) continue;
      if (seenRoles.has(entry.role)) continue;
      seenRoles.add(entry.role);

      const def = ROLE_AGENTS[entry.role];
      if (def) {
        result.push({
          ...def,
          name: entry.name || def.name,
          isActive: entry.expiresAt > now + 5000, // If TTL > 5s, it's still running
          expiresAt: entry.expiresAt,
        });
      }
    }
    return result;
  }, [roleAgents, tick]);

  // Mission badges (filter expired)
  const missionBadges = useMemo((): LiveAgent[] => {
    const result: LiveAgent[] = [];
    for (const [missionId, entry] of activeMissions) {
      if (entry.expiresAt < now) continue;
      result.push({
        id: `mission-${missionId}`,
        name: entry.title.length > 12 ? entry.title.slice(0, 12) + '…' : entry.title,
        icon: Target,
        color: '#38bdf8',
        isActive: entry.expiresAt > now + 5000,
        expiresAt: entry.expiresAt,
      });
    }
    return result;
  }, [activeMissions, tick]);

  // Clean up expired entries periodically
  useEffect(() => {
    setRoleAgents(prev => {
      const next = new Map(prev);
      let changed = false;
      for (const [k, v] of next) {
        if (v.expiresAt < now) { next.delete(k); changed = true; }
      }
      return changed ? next : prev;
    });
    setActiveMissions(prev => {
      const next = new Map(prev);
      let changed = false;
      for (const [k, v] of next) {
        if (v.expiresAt < now) { next.delete(k); changed = true; }
      }
      return changed ? next : prev;
    });
  }, [tick]);

  const allVisible = [...missionBadges, ...roleAgentBadges, ...toolAgents];

  if (allVisible.length === 0) return null;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <AnimatePresence mode="popLayout">
        {allVisible.map((agent) => {
          const Icon = agent.icon;
          return (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, scale: 0.8, width: 0 }}
              animate={{ opacity: 1, scale: 1, width: 'auto' }}
              exit={{ opacity: 0, scale: 0.8, width: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-md overflow-hidden"
              style={{
                backgroundColor: `${agent.color}12`,
                border: `1px solid ${agent.color}${agent.isActive ? '35' : '18'}`,
              }}
              title={`${agent.name} ${agent.isActive ? '(actif)' : '(récent)'}`}
            >
              {agent.isActive ? (
                <Loader2 size={9} className="animate-spin" style={{ color: agent.color }} />
              ) : (
                <Icon size={9} style={{ color: agent.color, opacity: 0.7 }} />
              )}
              <span
                className="text-[8px] font-semibold uppercase whitespace-nowrap"
                style={{ color: agent.color, opacity: agent.isActive ? 1 : 0.6 }}
              >
                {agent.name}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
