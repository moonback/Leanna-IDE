import { Router, Request, Response } from 'express';
import {
  projectDoctor,
  dailyBriefing,
  opportunityEngine,
  projectProfile,
} from '../../knowledge/index.js';

/**
 * Insights router — expose les moteurs d'intelligence projet (P0/P1) à l'UI
 * « Mission Control » : santé du projet (Project Doctor), briefing quotidien,
 * opportunités proactives et profil projet. Lecture seule, best-effort :
 * un moteur en échec (ex : projet non indexé) renvoie une 200 avec un payload
 * dégradé plutôt qu'une 500, pour que le tableau de bord reste affichable.
 */
const router = Router();

// GET /api/knowledge/doctor — diagnostic santé + missions d'amélioration
router.get('/doctor', (_req: Request, res: Response) => {
  try {
    const report = projectDoctor.diagnose();
    return res.json({ status: 'success', report });
  } catch (e: any) {
    return res.json({ status: 'degraded', report: null, error: e.message });
  }
});

// GET /api/knowledge/daily-briefing — digest matinal composé
router.get('/daily-briefing', (req: Request, res: Response) => {
  try {
    const includeHealth = req.query.includeHealth !== 'false';
    const maxMissions = Number(req.query.maxMissions) || 5;
    const report = dailyBriefing.generate({ includeHealth, maxMissions });
    return res.json({ status: 'success', report });
  } catch (e: any) {
    return res.json({ status: 'degraded', report: null, error: e.message });
  }
});

// GET /api/knowledge/opportunities — travail utile détecté proactivement
router.get('/opportunities', (req: Request, res: Response) => {
  try {
    const includeHealth = req.query.includeHealth !== 'false';
    const limit = Number(req.query.limit) || 15;
    const report = opportunityEngine.scan({ includeHealth, limit });
    return res.json({ status: 'success', report });
  } catch (e: any) {
    return res.json({ status: 'degraded', report: null, error: e.message });
  }
});

// GET /api/knowledge/profile — profil d'intelligence du projet
router.get('/profile', (_req: Request, res: Response) => {
  try {
    const profile = projectProfile.getProfile();
    return res.json({ status: 'success', profile });
  } catch (e: any) {
    return res.json({ status: 'degraded', profile: null, error: e.message });
  }
});

export default router;
