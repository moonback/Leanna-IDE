/**
 * toolCategories — Source unique de vérité pour la catégorisation des outils.
 *
 * Regroupe la table outil→catégorie, les couleurs, libellés et icônes partagés
 * entre les composants de transparence (AgentProgressBar, ToolCallCard, …).
 * Éviter la duplication de ces tables prévient toute divergence visuelle quand
 * un nouvel outil est ajouté.
 *
 * Convention : les libellés (CAT_LABEL) sont en minuscules. Les consommateurs
 * qui veulent une capitale l'appliquent au rendu.
 */

import { memo } from 'react';
import {
  FileText, FilePen, Search, Trash2, Globe, Brain, Users,
  Database, LayoutGrid, Terminal,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type ToolCategory =
  | 'file-read' | 'file-write' | 'file-delete' | 'search' | 'web'
  | 'agent' | 'reasoning' | 'memory' | 'system' | 'other';

/** Table outil → catégorie (union des besoins de tous les consommateurs). */
export const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  // Lecture / analyse de fichiers
  read_project_file: 'file-read', list_project_files: 'file-read',
  analyze_project_file: 'file-read', open_project_file: 'file-read',
  read_file_outline: 'file-read',
  // Écriture / création
  write_project_file: 'file-write', modify_project_file: 'file-write',
  create_project_directory: 'file-write', rename_project_file: 'file-write',
  patch_project_file: 'file-write',
  // Suppression
  delete_project_file: 'file-delete', delete_project_folder: 'file-delete',
  // Recherche
  search_in_files: 'search', automation_search: 'search',
  // Web / navigateur
  automation_navigate: 'web', automation_snapshot: 'web',
  automation_click: 'web', automation_type: 'web', automation_extract: 'web',
  browser_navigate: 'web', browser_read_content: 'web', browser_search: 'web',
  // Agents
  agent_delegate: 'agent', agent_orchestrate: 'agent', agent_status: 'agent',
  agent_list_tasks: 'agent', agent_list_roles: 'agent',
  agent_cancel: 'agent', agent_stats: 'agent',
  // Raisonnement
  reasoning_think: 'reasoning', reasoning_delegate_task: 'reasoning',
  reasoning_list_strategies: 'reasoning',
  // Mémoire / connaissances
  save_memory: 'memory', search_memory: 'memory',
  knowledge_semantic_search: 'memory', knowledge_build_context: 'memory',
  // Système
  get_workspace_info: 'system', generate_codebase_markdown: 'system',
  open_ide: 'system',
  // Autres
  create_rich_document: 'other',
};

/** Retourne la catégorie d'un outil (fallback 'other'). */
export function getCat(tool: string): ToolCategory {
  return TOOL_CATEGORIES[tool] ?? 'other';
}

/** Couleur (token CSS) associée à chaque catégorie. */
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

/** Libellé (minuscule) de chaque catégorie. */
export const CAT_LABEL: Record<ToolCategory, string> = {
  'file-read': 'lecture', 'file-write': 'écriture', 'file-delete': 'suppression',
  'search': 'recherche', 'web': 'web', 'agent': 'agent',
  'reasoning': 'raisonnement', 'memory': 'mémoire', 'system': 'système', 'other': 'outil',
};

/** Icône (composant lucide) associée à chaque catégorie. */
export const CAT_ICON: Record<ToolCategory, LucideIcon> = {
  'file-read': FileText, 'file-write': FilePen, 'file-delete': Trash2,
  'search': Search, 'web': Globe, 'agent': Users, 'reasoning': Brain,
  'memory': Database, 'system': LayoutGrid, 'other': Terminal,
};

/**
 * Micro-icône catégorisée pour un outil donné. Rendu compact, réutilisé par les
 * timelines d'activité (AgentProgressBar) et cartes d'appel d'outil.
 */
export const CatIcon = memo(function CatIcon({ tool, size = 10 }: { tool: string; size?: number }) {
  const cat = getCat(tool);
  const Icon = CAT_ICON[cat];
  return <Icon style={{ color: CAT_COLOR[cat], width: size, height: size, flexShrink: 0 }} />;
});
