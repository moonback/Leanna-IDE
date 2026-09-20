/**
 * AutonomyView — Runtime autonome (timeline temps réel)
 *
 * Vue en lecture seule qui affiche l'état du runtime autonome et la timeline
 * temps réel des événements autonomy:*, via le canal WebSocket dédié /autonomy.
 * Purement observationnel : aucune action n'est déclenchée depuis cette vue.
 *
 * Design : s'aligne sur les autres vues (ViewHeader + tokens sémantiques) pour
 * un rendu cohérent sur tous les thèmes.
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

      {/* Zone de contenu : panneau contraint et centré, cohérent avec les autres vues */}
      <div className="min-h-0 flex-1 overflow-hidden px-4 py-4 lg:px-6">
        <div
          className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col overflow-hidden rounded-lg border shadow-sm"
          style={{
            borderColor: 'var(--border-base)',
            backgroundColor: 'var(--bg-panel)',
          }}
        >
          <AutonomyTimeline className="h-full" />
        </div>
      </div>
    </div>
  );
}
