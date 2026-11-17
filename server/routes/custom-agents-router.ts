/**
 * Routeur Express pour le custom-agents CRUD.
 * Regroupe les handlers existants (handleListAgents, handleCreateAgent, etc.)
 * en un seul routeur monté sur /api/custom-agents.
 * Extrait de server.ts (Sprint 1 — découpage).
 */

import { Router } from 'express';
import { getActiveProjectId } from '../utils/selfRoot.js';
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
    if (!getActiveProjectId()) return res.status(409).json({ error: 'Aucun workspace actif.' });
    next();
  });

  router.get('/',         handleListAgents);
  router.post('/',        handleCreateAgent);
  router.put('/:id',      handleUpdateAgent);
  router.delete('/:id',   handleDeleteAgent);
  router.post('/import',  handleImportAgents);

  return router;
}
