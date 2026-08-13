/**
 * Global store for agent/tool activity — persists even when AgentPanel is unmounted.
 * This ensures no events are lost when the panel is closed.
 */

export interface ToolActivityEntry {
  id: string;
  tool: string;
  label: string;
  agentId: string;
  status: 'running' | 'done';
  timestamp: number;
  endTimestamp?: number;
  args?: any;
  result?: string;
}

export interface AgentTaskEntry {
  id: string;
  role: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  agentName: string;
  detail?: string;
  summary?: string;
  timestamp: number;
  durationMs?: number;
  steps: string[];
}

type Listener = () => void;

const MAX_TOOL_ACTIVITIES = 80;
const STALE_THRESHOLD_MS = 60000;

let toolActivities: ToolActivityEntry[] = [];
let agentTasks: AgentTaskEntry[] = [];
let listeners: Listener[] = [];
let initialized = false;

function notify() {
  for (const fn of listeners) fn();
}

// ─── Tool Activity ───────────────────────────────────────────────────────────

function getAgentForTool(tool: string): string {
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
  return TOOL_TO_AGENT[tool] ?? 'code';
}

function formatToolLabel(tool: string): string {
  return tool
    .replace(/_/g, ' ')
    .replace(/^(read|write|modify|patch|list|create|delete|rename|get|search|run|verify|save|analyze|open)/, (m) => m + ':')
    .replace(/project file/, 'fichier')
    .replace(/project files/, 'fichiers');
}

function mapStatus(status: string): AgentTaskEntry['status'] {
  if (status === 'running' || status === 'pending' || status === 'completed' || status === 'failed' || status === 'cancelled') {
    return status;
  }
  return 'pending';
}

function handleToolStart(e: Event) {
  const detail = (e as CustomEvent).detail;
  if (!detail?.tool) return;
  const agentId = getAgentForTool(detail.tool);
  const id = `${detail.tool}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  toolActivities = [...toolActivities.slice(-(MAX_TOOL_ACTIVITIES - 1)), {
    id,
    tool: detail.tool,
    label: formatToolLabel(detail.tool),
    agentId,
    status: 'running',
    timestamp: Date.now(),
    args: detail.args,
  }];
  notify();
}

function handleToolDone(e: Event) {
  const detail = (e as CustomEvent).detail;
  if (!detail?.tool) return;
  const idx = [...toolActivities].reverse().findIndex(a => a.tool === detail.tool && a.status === 'running');
  if (idx === -1) return;
  const realIdx = toolActivities.length - 1 - idx;
  toolActivities = [...toolActivities];
  toolActivities[realIdx] = {
    ...toolActivities[realIdx],
    status: 'done',
    endTimestamp: Date.now(),
    result: detail.info || detail.result,
  };
  notify();
}

function handleAgentEvent(e: Event) {
  const detail = (e as CustomEvent).detail;
  if (!detail || detail.type !== 'agent_event') return;

  const existing = agentTasks.find(t => t.id === detail.taskId);
  if (existing) {
    agentTasks = agentTasks.map(t => t.id === detail.taskId ? {
      ...t,
      status: mapStatus(detail.status),
      detail: detail.detail || t.detail,
      summary: detail.summary || t.summary,
      durationMs: detail.durationMs || t.durationMs,
      steps: detail.detail && !t.steps.includes(detail.detail)
        ? [...t.steps, detail.detail]
        : t.steps,
    } : t);
  } else {
    agentTasks = [...agentTasks, {
      id: detail.taskId,
      role: detail.role,
      title: detail.title,
      status: mapStatus(detail.status),
      agentName: detail.agentName,
      detail: detail.detail,
      summary: detail.summary,
      timestamp: detail.timestamp ? new Date(detail.timestamp).getTime() : Date.now(),
      durationMs: detail.durationMs,
      steps: detail.detail ? [detail.detail] : [],
    }];
  }
  notify();
}

// ─── Cleanup (called periodically) ──────────────────────────────────────────

function cleanup() {
  const now = Date.now();
  const beforeLen = toolActivities.length;
  toolActivities = toolActivities.filter(a =>
    a.status === 'running' || (now - a.timestamp) < STALE_THRESHOLD_MS
  );
  if (toolActivities.length !== beforeLen) notify();
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function initActivityStore() {
  if (initialized) return;
  initialized = true;
  window.addEventListener('jarvis-tool-start', handleToolStart);
  window.addEventListener('jarvis-tool-done', handleToolDone);
  window.addEventListener('jarvis-agent-event', handleAgentEvent);
  // Cleanup every 3s
  setInterval(cleanup, 3000);
}

export function getToolActivities(): ToolActivityEntry[] {
  return toolActivities;
}

export function getAgentTasks(): AgentTaskEntry[] {
  return agentTasks;
}

export function clearCompletedTools() {
  toolActivities = toolActivities.filter(a => a.status === 'running');
  notify();
}

export function clearCompletedTasks() {
  agentTasks = agentTasks.filter(t => t.status === 'running' || t.status === 'pending');
  notify();
}

export function subscribe(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter(l => l !== fn);
  };
}
