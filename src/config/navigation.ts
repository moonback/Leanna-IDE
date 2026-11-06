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
 * Déplacer une page (étape 3 : fusion des vues Pilotage) = modifier ici.
 */
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Milestone, FlaskConical, Network, HelpCircle, Gauge,
  Code2, Zap, NotebookPen, FileText, Github, BrainCircuit, History,
  Braces, BarChart2,
} from 'lucide-react';

export const ROUTES = {
  home: '/',
  ide: '/ide',
  settings: '/settings',
  // ── Pilotage hub (étape 3 : 6 vues fusionnées) ───────────────────────
  pilotage: '/pilotage',
  // Old individual routes — kept as aliases that redirect to /pilotage?tab=…
  missionControl:    '/mission-control',
  missionTimeline:   '/mission-timeline',
  missionSimulation: '/mission-simulation',
  agentSwarm:        '/agent-swarm',
  explainability:    '/explainability',
  autonomy:          '/autonomy',
  // ────────────────────────────────────────────────────────────────────
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
  | 'pilotage'
  | 'mission-control' | 'mission-timeline' | 'mission-simulation'
  | 'agent-swarm' | 'explainability' | 'autonomy'
  | 'ide' | 'automation' | 'notebooks' | 'documents' | 'github'
  | 'memories' | 'history' | 'lists'
  | 'observability';

export interface NavItem { id: string; path: string; label: string; icon: LucideIcon }
export interface NavGroup { id: string; label: string; items: NavItem[] }

export const NAV_ITEMS: Record<NavId, NavItem> = {
  // ── Pilotage hub ──────────────────────────────────────────────────────
  'pilotage':           { id: 'pilotage',           path: ROUTES.pilotage,          label: 'Pilotage',        icon: LayoutDashboard },
  // Individual nav items (still used by viewHeaderProps + deep-link redirects)
  'mission-control':    { id: 'mission-control',    path: ROUTES.missionControl,    label: 'Mission Control', icon: LayoutDashboard },
  'mission-timeline':   { id: 'mission-timeline',   path: ROUTES.missionTimeline,   label: 'Missions',        icon: Milestone },
  'mission-simulation': { id: 'mission-simulation', path: ROUTES.missionSimulation, label: 'Simulation',      icon: FlaskConical },
  'agent-swarm':        { id: 'agent-swarm',        path: ROUTES.agentSwarm,        label: 'Agent Swarm',     icon: Network },
  'explainability':     { id: 'explainability',     path: ROUTES.explainability,    label: 'Pourquoi ?',      icon: HelpCircle },
  'autonomy':           { id: 'autonomy',           path: ROUTES.autonomy,          label: 'Autonomie',       icon: Gauge },
  'ide':                { id: 'ide',                path: ROUTES.ide,               label: 'IDE',             icon: Code2 },
  'automation':         { id: 'automation',         path: ROUTES.automation,        label: 'Automatisations', icon: Zap },
  'notebooks':          { id: 'notebooks',          path: ROUTES.notebooks,         label: 'Notebooks',       icon: NotebookPen },
  'documents':          { id: 'documents',          path: ROUTES.documents,         label: 'Documents',       icon: FileText },
  'github':             { id: 'github',             path: ROUTES.github,            label: 'GitHub',          icon: Github },
  'memories':           { id: 'memories',           path: ROUTES.memories,          label: 'Mémoire',         icon: BrainCircuit },
  'history':            { id: 'history',            path: ROUTES.history,           label: 'Historique',      icon: History },
  // La page est une bibliothèque de snippets de code (≠ « listes ») ; Braces évite
  // la collision visuelle avec l'icône de l'IDE (Code2).
  'lists':              { id: 'lists',              path: ROUTES.lists,             label: 'Snippets',        icon: Braces },
  'observability':      { id: 'observability',      path: ROUTES.observability,     label: 'Observabilité',   icon: BarChart2 },
};

const pick = (...ids: NavId[]): NavItem[] => ids.map((id) => NAV_ITEMS[id]);

/**
 * Regroupement par intention.
 * « Pilotage » est maintenant une entrée unique qui pointe vers /pilotage
 * (la page à onglets fusionnée — étape 3).
 */
export const NAV_GROUPS: NavGroup[] = [
  { id: 'workspace', label: 'Workspace', items: pick('ide') },
  { id: 'orchestration', label: 'Pilotage & IA', items: pick('pilotage', 'agent-swarm', 'autonomy', 'explainability') },
  { id: 'library', label: 'Connaissances', items: pick('memories', 'notebooks', 'documents', 'lists', 'history') },
  { id: 'automation', label: 'Automatisation', items: pick('automation') },
  { id: 'system', label: 'Système', items: pick('observability') },
];

/** Titre + icône d'un <ViewHeader>, identiques au libellé de la sidebar. */
export function viewHeaderProps(id: NavId): { title: string; icon: LucideIcon } {
  const { label, icon } = NAV_ITEMS[id];
  return { title: label, icon };
}
