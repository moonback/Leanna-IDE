/**
 * Routeur Express pour le custom-agents CRUD.
 * Regroupe les handlers existants (handleListAgents, handleCreateAgent, etc.)
 * en un seul routeur monté sur /api/custom-agents.
 * Extrait de server.ts (Sprint 1 — découpage).
 */

import { Router } from 'express';
import { getActiveProjectId } from '../utils/selfRoot.js';
import { dynamicAgentRegistry } from '../agents/DynamicAgentRegistry.js';
import { agentRegistry } from '../agents/AgentRegistry.js';
import {
  handleListAgents,
  handleCreateAgent,
  handleUpdateAgent,
  handleDeleteAgent,
  handleImportAgents,
} from './custom-agents.js';

export function createCustomAgentsRouter(): Router {
  const router = Router();

  router.use((_req, res, next) => {
    const projectId = getActiveProjectId();
    if (!projectId) return res.status(409).json({ error: 'Aucun workspace actif.' });
    if (!dynamicAgentRegistry.canAccessWorkspace(projectId)) {
      return res.status(409).json({ error: 'Le registre dynamique appartient à un autre workspace ; redémarrage requis.' });
    }
    if (agentRegistry.isReady && !agentRegistry.canAccessWorkspace(projectId)) {
      return res.status(409).json({ error: 'La flotte appartient à un autre workspace ; redémarrage requis.' });
    }
    next();
  });

  router.get('/',         handleListAgents);
  router.post('/',        handleCreateAgent);
  router.put('/:id',      handleUpdateAgent);
  router.delete('/:id',   handleDeleteAgent);
  router.post('/import',  handleImportAgents);

  return router;
}
