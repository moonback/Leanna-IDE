/**
 * Index des tests pour les vues dashboard
 * 
 * Ce fichier exporte tous les fichiers de test des dashboards pour une exécution centralisée
 */

export * from './SystemDashboardView.test';
export * from './MissionDashboardView.test';
export * from './AgentDashboardView.test';
export * from './WorkspaceDashboardView.test';

// Ré-export des composants pour les tests
export { SystemDashboardView } from '../../src/views/SystemDashboardView';
export type { SystemDashboardViewProps } from '../../src/views/SystemDashboardView';

export { MissionDashboardView } from '../../src/views/MissionDashboardView';
export type { MissionDashboardViewProps } from '../../src/views/MissionDashboardView';

export { AgentDashboardView } from '../../src/views/AgentDashboardView';
export type { AgentDashboardViewProps } from '../../src/views/AgentDashboardView';

export { WorkspaceDashboardView } from '../../src/views/WorkspaceDashboardView';
export type { WorkspaceDashboardViewProps } from '../../src/views/WorkspaceDashboardView';
