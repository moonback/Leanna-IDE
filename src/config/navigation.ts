/**
 * navigation.ts — SOURCE UNIQUE de la navigation de Leanna.
 *
 * Avant : libellés, icônes et chemins étaient dupliqués entre la sidebar,
 * les titres de page (ViewHeader), main.tsx et les `navigate('/…')` épars,
 * et divergeaient (ex. sidebar « Listes » → page « Snippets », « Documents »
 * → « Knowledge System », icône « Missions » identique à « Historique »).
 *
 * Maintenant : tout passe par ce fichier.
 *  - `ROUTES`            chemins (à utiliser dans navigate() et <Route>)
 *  - `NAV_ITEMS`         libellé + icône de chaque destination
 *  - `NAV_GROUPS`        regroupement affiché dans la GlobalSidebar
 *  - `viewHeaderProps()` titre + icône d'un <ViewHeader> (cohérents avec la sidebar)
 *
 * Déplacer une page = modifier ici.
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
} as const;

export type NavId =
  | 'ide' | 'automation' | 'notebooks' | 'documents' | 'github'
  | 'memories' | 'history' | 'lists'
  | 'observability';

export interface NavItem { id: string; path: string; label: string; icon: LucideIcon }
export interface NavGroup { id: string; label: string; items: NavItem[] }

/** Page affichée DANS l'IDE (zone d'édition, comme Knowledge) — lue par IdeView via `?page=`. */
export const inIde = (id: NavId) => `${ROUTES.ide}?page=${id}`;

export const NAV_ITEMS: Record<NavId, NavItem> = {
  'ide':                { id: 'ide',                path: ROUTES.ide,               label: 'IDE',             icon: Code2 },
  'automation':         { id: 'automation',         path: inIde('automation'),      label: 'Automatisations', icon: Zap },
  'notebooks':          { id: 'notebooks',          path: inIde('notebooks'),       label: 'Notebooks',       icon: NotebookPen },
  'documents':          { id: 'documents',          path: inIde('documents'),       label: 'Documents',       icon: FileText },
  'github':             { id: 'github',             path: ROUTES.github,            label: 'GitHub',          icon: Github },
  'memories':           { id: 'memories',           path: inIde('memories'),        label: 'Mémoire',         icon: BrainCircuit },
  'history':            { id: 'history',            path: inIde('history'),         label: 'Historique',      icon: History },

  'lists':              { id: 'lists',              path: inIde('lists'),           label: 'Snippets',        icon: Braces },
  'observability':      { id: 'observability',      path: inIde('observability'),   label: 'Observabilité',   icon: BarChart2 },
};

const pick = (...ids: NavId[]): NavItem[] => ids.map((id) => NAV_ITEMS[id]);

/** Regroupement par intention. */
export const NAV_GROUPS: NavGroup[] = [
  // Espace de travail principal, sans en-tête de groupe.
  { id: 'workspace', label: '', items: pick('ide') },
  { id: 'library', label: 'Connaissances', items: pick('memories', 'notebooks', 'documents', 'lists', 'history') },
  // Ex-groupes « Automatisation » et « Système » à un seul item : fusionnés.
  { id: 'operations', label: 'Opérations', items: pick('automation', 'observability') },
];

/** Titre + icône d'un <ViewHeader>, identiques au libellé de la sidebar. */
export function viewHeaderProps(id: NavId): { title: string; icon: LucideIcon } {
  const { label, icon } = NAV_ITEMS[id];
  return { title: label, icon };
}
