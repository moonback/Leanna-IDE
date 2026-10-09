import { memo } from 'react';
import {
  FileText, FilePen, Search, Trash2, Globe, Brain, Users,
  Database, LayoutGrid, Terminal,
} from 'lucide-react';
import type { ActivityStep } from '../../hooks/useLiveAPI.js';

// ═══════════════════════════════════════════════════════════════════════════════
// activityTools — catégorisation, libellés, couleurs et durées partagés par la
// barre d'activité (AgentProgressBar) et ses sous-composants (TimelineSteps).
// Source unique : un seul endroit à faire évoluer quand un outil est ajouté.
// ═══════════════════════════════════════════════════════════════════════════════

export type StepStatus = 'running' | 'done' | 'error' | 'pending';
export type ToolCategory =
  | 'file-read' | 'file-write' | 'file-delete' | 'search' | 'web'
  | 'agent' | 'reasoning' | 'memory' | 'system' | 'other';

// ─── Durées ─────────────────────────────────────────────────────────────────

export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s`;
}

export function msElapsed(ts: Date): string {
  const d = ts instanceof Date ? ts : new Date(ts);
  return formatMs(Date.now() - d.getTime());
}

function msBetween(a: Date, b: Date): string {
  return formatMs(new Date(b).getTime() - new Date(a).getTime());
}

export function stepDuration(step: ActivityStep): string | null {
  if (!step.endTimestamp) return null;
  return msBetween(new Date(step.timestamp), new Date(step.endTimestamp));
}

export function getStepStatus(step: ActivityStep): StepStatus {
  if (step.status === 'running') return 'running';
  if (step.status === 'done') return 'done';
  if (step.status === 'error') return 'error';
  return 'pending';
}

// ─── Catégorisation ───────────────────────────────────────────────────────────

const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  read_project_file: 'file-read',  list_project_files: 'file-read',
  analyze_project_file: 'file-read', open_project_file: 'file-read',
  write_project_file: 'file-write', modify_project_file: 'file-write',
  create_project_directory: 'file-write', rename_project_file: 'file-write',
  patch_project_file: 'file-write',
  delete_project_file: 'file-delete',
  delete_project_folder: 'file-delete',
  search_in_files: 'search', automation_search: 'search',
  automation_navigate: 'web', automation_snapshot: 'web',
  automation_click: 'web', automation_type: 'web', automation_extract: 'web',
  agent_delegate: 'agent', agent_negotiate: 'agent', agent_orchestrate: 'agent', agent_status: 'agent',
  agent_list_tasks: 'agent', agent_list_roles: 'agent',
  agent_cancel: 'agent', agent_stats: 'agent',
  reasoning_think: 'reasoning', reasoning_delegate_task: 'reasoning',
  reasoning_list_strategies: 'reasoning',
  save_memory: 'memory', search_memory: 'memory',
  get_workspace_info: 'system', generate_codebase_markdown: 'system',
  open_ide: 'system',
  create_rich_document: 'other',
};

export function getCat(tool: string): ToolCategory {
  return TOOL_CATEGORIES[tool] ?? 'other';
}

export const CAT_COLOR: Record<ToolCategory, string> = {
  'file-read':   'var(--accent-primary)',
  'file-write':  'var(--color-success)',
  'file-delete': 'var(--color-error)',
  'search':      'var(--color-warning)',
  'web':         'var(--accent-secondary)',
  'agent':       'var(--color-accent-alt)',
  'reasoning':   'var(--accent-primary)',
  'memory':      'var(--accent-secondary)',
  'system':      'var(--text-muted)',
  'other':       'var(--text-dimmed)',
};

export const CAT_LABEL: Record<ToolCategory, string> = {
  'file-read': 'lecture', 'file-write': 'écriture', 'file-delete': 'suppression',
  'search': 'recherche', 'web': 'web', 'agent': 'agent',
  'reasoning': 'raisonnement', 'memory': 'mémoire', 'system': 'système', 'other': 'outil',
};

const TOOL_LABEL: Record<string, string> = {
  read_project_file: 'lecture', write_project_file: 'écriture',
  modify_project_file: 'modification', patch_project_file: 'patch',
  list_project_files: 'liste fichiers', search_in_files: 'recherche',
  delete_project_file: 'suppression', delete_project_folder: 'suppression dossier', analyze_project_file: 'analyse',
  open_project_file: 'ouverture', create_project_directory: 'dossier',
  rename_project_file: 'renommage', agent_delegate: 'délégation',
  agent_negotiate: 'enchère', agent_orchestrate: 'orchestration', agent_status: 'statut agent',
  reasoning_think: 'raisonnement', save_memory: 'mémoire+',
  search_memory: 'recherche mémoire', automation_search: 'recherche web',
  automation_navigate: 'navigation', automation_snapshot: 'capture',
  automation_click: 'clic', automation_type: 'saisie',
  get_workspace_info: 'workspace', open_ide: 'IDE',
  create_rich_document: 'document riche',
};

export function toolLabel(tool: string): string {
  return TOOL_LABEL[tool] ?? tool.replace(/_/g, ' ').toLowerCase();
}

// ─── Micro-icône de catégorie ──────────────────────────────────────────────────

export const CatIcon = memo(function CatIcon({ tool, size = 10 }: { tool: string; size?: number }) {
  const cat = getCat(tool);
  const s = { color: CAT_COLOR[cat], width: size, height: size, flexShrink: 0 as const };
  switch (cat) {
    case 'file-read':   return <FileText style={s} />;
    case 'file-write':  return <FilePen style={s} />;
    case 'file-delete': return <Trash2 style={s} />;
    case 'search':      return <Search style={s} />;
    case 'web':         return <Globe style={s} />;
    case 'agent':       return <Users style={s} />;
    case 'reasoning':   return <Brain style={s} />;
    case 'memory':      return <Database style={s} />;
    case 'system':      return <LayoutGrid style={s} />;
    default:            return <Terminal style={s} />;
  }
});

// ─── Transition partagée (UI pilotée par l'état) ───────────────────────────────

export type UiTransition =
  | { duration: number; ease: 'linear' }
  | { type: 'spring'; bounce: number; duration: number };
