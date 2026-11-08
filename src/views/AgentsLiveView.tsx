import { useEffect } from 'react';
import { DashboardAgentNetwork } from '../components/ide/DashboardAgentNetwork.js';
import { useAgentEventStream } from '../hooks/useAgentEventStream.js';
import {
  initActivityStore,
  destroyActivityStore,
  syncActiveTasksFromServer,
} from '../stores/agentActivityStore.js';

/**
 * AgentsLiveView — Fenêtre dédiée « Réseau multi-agents » (/agents-live).
 *
 * Surface détachée destinée à un second écran. Elle reproduit l'initialisation
 * du suivi d'agents de l'IDE (store d'activité + flux SSE serveur) de façon
 * INDÉPENDANTE de la fenêtre principale : les données proviennent du serveur
 * partagé (/api/agents/*), donc les deux fenêtres restent synchronisées.
 *
 * Aucune sidebar ni Layout global — uniquement le panneau réseau plein écran.
 */
export default function AgentsLiveView() {
  // Store d'activité : écoute les événements agents/outils de CETTE fenêtre.
  useEffect(() => {
    initActivityStore();
    return () => destroyActivityStore();
  }, []);

  // Flux SSE serveur : alimente le store en événements d'agents en temps réel.
  useAgentEventStream();

  // Restaure les tâches actives côté serveur au premier montage.
  useEffect(() => { void syncActiveTasksFromServer(); }, []);

  return (
    <div className="h-screen w-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      <DashboardAgentNetwork activity={[]} reasoningActive={false} isBusy={false} standalone />
    </div>
  );
}
