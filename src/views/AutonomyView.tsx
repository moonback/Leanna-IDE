/**
 * AutonomyView — Runtime autonome (timeline temps réel)
 *
 * Vue en lecture seule qui affiche l'état du runtime autonome et la timeline
 * temps réel des événements autonomy:*, via le canal WebSocket dédié /autonomy.
 * Purement observationnel : aucune action n'est déclenchée depuis cette vue.
 */

import { Activity } from 'lucide-react';
import { ViewHeader } from '../components/ui/ViewHeader.js';
import { AutonomyTimeline } from '../components/AutonomyTimeline.js';

export default function AutonomyView() {
  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: 'var(--bg-base)' }}>
      <ViewHeader
        title="Autonomie"
        icon={Activity}
        description="Timeline temps réel du runtime autonome (lecture seule)"
        badge="En direct"
      />
      <div className="min-h-0 flex-1">
        <AutonomyTimeline className="h-full" />
      </div>
    </div>
  );
}
