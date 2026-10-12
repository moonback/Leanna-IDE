/**
 * PilotageView — Hub « Pilotage » (étape 3 de l'audit).
 *
 * Fusionne les 6 vues de pilotage en une seule page à onglets :
 *   tableau-de-bord  → MissionControlView
 *   missions         → MissionTimelineView
 *   simulation       → MissionSimulationView
 *   swarm            → AgentSwarmView
 *   autonomie        → AutonomyView
 *   pourquoi         → ExplainabilityView
 *
 * Navigation :
 *   - ?tab=<valeur>  → onglet initial (deep-link depuis les redirects des
 *                      anciens chemins dans main.tsx)
 *   - Chaque changement d'onglet met à jour l'URL sans recharger la page.
 *   - Les vues sont chargées à la demande (lazy) via React.Suspense.
 *
 * Les 6 vues reçoivent `embedded={true}` pour ne pas afficher leur propre
 * ViewHeader — c'est PilotageView qui fournit le header partagé.
 */

import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  LayoutDashboard, Milestone, FlaskConical, Network,
  HelpCircle, Gauge, Loader2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Tabs } from '../components/ui/Tabs.js';
import { ViewHeader } from '../components/ui/ViewHeader.js';

// ─── Lazy sub-views ───────────────────────────────────────────────────────────

const MissionControlView   = lazy(() => import('./MissionControlView.js'));
const MissionTimelineView  = lazy(() => import('./MissionTimelineView.js'));
const MissionSimulationView = lazy(() => import('./MissionSimulationView.js'));
const AgentSwarmView       = lazy(() => import('./AgentSwarmView.js'));
const AutonomyView         = lazy(() => import('./AutonomyView.js'));
const ExplainabilityView   = lazy(() => import('./ExplainabilityView.js'));

// ─── Tab definitions ─────────────────────────────────────────────────────────

export type PilotageTab =
  | 'tableau-de-bord'
  | 'missions'
  | 'simulation'
  | 'swarm'
  | 'autonomie'
  | 'pourquoi';

const DEFAULT_TAB: PilotageTab = 'tableau-de-bord';

const TABS: Array<{
  value: PilotageTab;
  label: string;
  icon: LucideIcon;
  description: string;
}> = [
  {
    value: 'tableau-de-bord',
    label: 'Tableau de bord',
    icon: LayoutDashboard,
    description: 'Santé du projet, insights et opportunités en un coup d\'œil',
  },
  {
    value: 'missions',
    label: 'Missions',
    icon: Milestone,
    description: 'Parcours chronologique et pilotage des missions en cours',
  },
  {
    value: 'simulation',
    label: 'Simulation',
    icon: FlaskConical,
    description: 'Dry-run avant exécution : coût, risque, fichiers impactés',
  },
  {
    value: 'swarm',
    label: 'Agent Swarm',
    icon: Network,
    description: 'Composition dynamique d\'une équipe d\'agents pour un objectif',
  },
  {
    value: 'autonomie',
    label: 'Autonomie',
    icon: Gauge,
    description: 'Niveau d\'autonomie, approbations et garde-fous en temps réel',
  },
  {
    value: 'pourquoi',
    label: 'Pourquoi ?',
    icon: HelpCircle,
    description: 'Facteurs décisionnels et probabilité de succès d\'un objectif',
  },
];

// ─── Loading fallback ─────────────────────────────────────────────────────────

function TabLoading() {
  return (
    <div className="flex h-full items-center justify-center" style={{ color: 'var(--text-dimmed)' }}>
      <Loader2 size={20} className="animate-spin" />
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PilotageView() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read initial tab from ?tab= (deep-link from old routes redirect)
  const rawTab = searchParams.get('tab') as PilotageTab | null;
  const validTabs = TABS.map((t) => t.value);
  const initialTab: PilotageTab =
    rawTab && validTabs.includes(rawTab) ? rawTab : DEFAULT_TAB;

  const [activeTab, setActiveTab] = useState<PilotageTab>(initialTab);

  // Sync ?tab= when the user changes tabs (enables browser back/forward)
  const handleTabChange = useCallback(
    (value: string) => {
      const tab = value as PilotageTab;
      setActiveTab(tab);
      setSearchParams(
        tab === DEFAULT_TAB ? {} : { tab },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // If the URL's ?tab= changes externally (e.g. navigate(-1)), sync state
  useEffect(() => {
    const urlTab = searchParams.get('tab') as PilotageTab | null;
    const resolved = urlTab && validTabs.includes(urlTab) ? urlTab : DEFAULT_TAB;
    if (resolved !== activeTab) setActiveTab(resolved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const currentTabMeta = TABS.find((t) => t.value === activeTab) ?? TABS[0];
  const Icon = currentTabMeta.icon;

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: 'var(--bg-base)' }}>
      {/* ── Shared header ────────────────────────────────────────────────── */}
      <ViewHeader
        title="Pilotage"
        icon={Icon}
        description={currentTabMeta.description}
        badge="Mission Control"
      />

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        variant="underline"
        className="flex min-h-0 flex-1 flex-col"
      >
        <Tabs.List
          aria-label="Vues Pilotage"
          className="flex-shrink-0 overflow-x-auto px-4 lg:px-6"
        >
          {TABS.map(({ value, label, icon: TabIcon }) => (
            <Tabs.Tab
              key={value}
              value={value}
              icon={<TabIcon size={13} />}
            >
              {label}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        {/* ── Panels — keepMounted so state survives tab switches ───────── */}
        <div className="min-h-0 flex-1">
          <Tabs.Panel value="tableau-de-bord" keepMounted className="h-full">
            <Suspense fallback={<TabLoading />}>
              <MissionControlView embedded />
            </Suspense>
          </Tabs.Panel>

          <Tabs.Panel value="missions" keepMounted className="h-full">
            <Suspense fallback={<TabLoading />}>
              <MissionTimelineView embedded />
            </Suspense>
          </Tabs.Panel>

          <Tabs.Panel value="simulation" className="h-full">
            <Suspense fallback={<TabLoading />}>
              <MissionSimulationView embedded />
            </Suspense>
          </Tabs.Panel>

          <Tabs.Panel value="swarm" className="h-full">
            <Suspense fallback={<TabLoading />}>
              <AgentSwarmView embedded />
            </Suspense>
          </Tabs.Panel>

          <Tabs.Panel value="autonomie" keepMounted className="h-full">
            <Suspense fallback={<TabLoading />}>
              <AutonomyView embedded />
            </Suspense>
          </Tabs.Panel>

          <Tabs.Panel value="pourquoi" className="h-full">
            <Suspense fallback={<TabLoading />}>
              <ExplainabilityView embedded />
            </Suspense>
          </Tabs.Panel>
        </div>
      </Tabs>
    </div>
  );
}
