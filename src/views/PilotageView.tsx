/**
 * PilotageView — page « Agents » (/pilotage) : pilotage des missions.
 *
 * Ancien hub à 6 onglets. Les onglets Tableau de bord, Simulation,
 * Agent Swarm, Autonomie et Pourquoi ? ont été retirés : seule la vue
 * Missions (MissionTimelineView) reste, donc plus de barre d'onglets.
 * Les anciens chemins (/mission-control, /agent-swarm, …) redirigent ici
 * (voir main.tsx).
 */

import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { ViewHeader } from '../components/ui/ViewHeader.js';
import { viewHeaderProps } from '../config/navigation.js';

const MissionTimelineView = lazy(() => import('./MissionTimelineView.js'));

function ViewLoading() {
  return (
    <div className="flex h-full items-center justify-center" style={{ color: 'var(--text-dimmed)' }}>
      <Loader2 size={20} className="animate-spin" />
    </div>
  );
}

export default function PilotageView() {
  return (
    <div className="flex h-full flex-col">
      <ViewHeader
        {...viewHeaderProps('pilotage')}
        description="Parcours chronologique et pilotage des missions en cours"
      />
      <div className="min-h-0 flex-1">
        <Suspense fallback={<ViewLoading />}>
          <MissionTimelineView embedded />
        </Suspense>
      </div>
    </div>
  );
}
