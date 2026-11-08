/**
 * navigation.ts — source unique de la navigation de Leanna.
 *
 * ROUTES       chemins canoniques des vues
 * NAV_ITEMS    libellés et icônes des destinations
 * NAV_GROUPS   regroupement affiché dans la navigation globale
 * viewHeaderProps() titre et icône cohérents avec la navigation
 */
import type { LucideIcon } from 'lucide-react';
import {
  Code2, Zap, NotebookPen, FileText, Github, BrainCircuit, History,
  Braces, BarChart2,
} from 'lucide-react';

export const ROUTES = {
  home: '/',
  ide: '/ide',
  settings: '/settings',
  automation: '/automation',
  notebooks: '/notebooks',
  documents: '/documents',
  github: '/github',
  memories: '/memories',
  history: '/history',
  lists: '/lists',
  observability: '/observability',
  contextIntelligence: '/context-intelligence',
} as const;

export type NavId =
  | 'ide' | 'automation' | 'notebooks' | 'documents' | 'github'
  | 'memories' | 'history' | 'lists'
  | 'observability' | 'contextIntelligence';

export interface NavItem { id: string; path: string; label: string; icon: LucideIcon }
export interface NavGroup { id: string; label: string; items: NavItem[] }

/** Page affichée dans l'IDE via ?page=<id>. */
export const inIde = (id: NavId) => `${ROUTES.ide}?page=${id}`;

export const NAV_ITEMS: Record<NavId, NavItem> = {
  ide:           { id: 'ide',           path: ROUTES.ide,          label: 'IDE',             icon: Code2 },
  automation:    { id: 'automation',    path: inIde('automation'), label: 'Automatisations', icon: Zap },
  notebooks:     { id: 'notebooks',     path: inIde('notebooks'),  label: 'Notebooks',       icon: NotebookPen },
  documents:     { id: 'documents',     path: inIde('documents'),  label: 'Documents',       icon: FileText },
  github:        { id: 'github',        path: ROUTES.github,       label: 'GitHub',          icon: Github },
  memories:      { id: 'memories',      path: inIde('memories'),   label: 'Mémoire',         icon: BrainCircuit },
  history:       { id: 'history',       path: inIde('history'),    label: 'Historique',      icon: History },
  lists:         { id: 'lists',         path: inIde('lists'),      label: 'Snippets',        icon: Braces },
  observability: { id: 'observability', path: inIde('observability'), label: 'Observabilité', icon: BarChart2 },
  contextIntelligence: { id: 'contextIntelligence', path: inIde('contextIntelligence'), label: 'Intelligence du contexte', icon: BrainCircuit },
};

const pick = (...ids: NavId[]): NavItem[] => ids.map((id) => NAV_ITEMS[id]);

/**
 * Regroupement par intention.
 * Chaque destination déclarée est accessible depuis la navigation globale.
 */
export const NAV_GROUPS: NavGroup[] = [
  { id: 'workspace', label: '', items: pick('ide') },
  { id: 'library', label: 'Connaissances', items: pick('memories', 'notebooks', 'documents', 'lists', 'history') },
  { id: 'operations', label: 'Opérations', items: pick('automation', 'observability', 'contextIntelligence') },
  { id: 'integrations', label: 'Intégrations', items: pick('github') },
];

/** Titre + icône d'un ViewHeader, identiques au libellé de la sidebar. */
export function viewHeaderProps(id: NavId): { title: string; icon: LucideIcon } {
  const { label, icon } = NAV_ITEMS[id];
  return { title: label, icon };
}
