import React from 'react';
import { KnowledgeHealthDashboard } from '../knowledge/KnowledgeHealthDashboard';

export function KnowledgeHealthSection() {
  return (
    <div className="space-y-6">
      <div className="border-b pb-4" style={{ borderColor: 'var(--border-base)' }}>
        <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
          Knowledge System & Graphe de Connaissances
        </h2>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          Supervisez l'état d'indexation du codebase, la santé de la mémoire projet, l'analyse des dépendances et les métriques temps réel.
        </p>
      </div>

      <KnowledgeHealthDashboard />
    </div>
  );
}
