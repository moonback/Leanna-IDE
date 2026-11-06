import { Router, type Request, type Response } from 'express';
import { DEFAULT_ROXANE_CONFIG, normalizeRoxaneConfig, type DebateRunRequest } from '../debate/types.js';
import { runDebate } from '../debate/DebateOrchestrator.js';

export function createDebateRouter(
  getProfile: () => Record<string, any>,
  setProfile: (profile: any) => void,
  saveProfile: (profile: any) => void,
): Router {
  const router = Router();

  router.get('/config', (_req: Request, res: Response) => {
    const profile = getProfile();
    res.json({ config: normalizeRoxaneConfig(profile.roxane ?? DEFAULT_ROXANE_CONFIG) });
  });

  router.put('/config', (req: Request, res: Response) => {
    const current = getProfile();
    const config = normalizeRoxaneConfig(req.body);
    const next = { ...current, roxane: config };
    setProfile(next);
    saveProfile(next);
    console.info('[Roxane][Config] Configuration mise à jour', {
      enabled: config.enabled, provider: config.provider, model: config.model,
      voice: config.voice, maxRounds: config.maxRounds,
    });
    res.json({ success: true, config });
  });

  router.post('/run', async (req: Request, res: Response) => {
    const body = req.body as DebateRunRequest;
    if (!body || typeof body.topic !== 'string' || !body.topic.trim()) {
      res.status(400).json({ error: 'Le sujet du débat est obligatoire.' });
      return;
    }
    try {
      console.info('[Roxane][Debate] Démarrage', { topicLength: body.topic.length, contextLength: typeof body.context === 'string' ? body.context.length : 0 });
      const result = await runDebate(getProfile(), body);
      console.info('[Roxane][Debate] Terminé', { id: result.id, turns: result.turns.length, durationMs: result.durationMs });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Roxane][Debate] Échec', message);
      res.status(502).json({ error: message });
    }
  });

  return router;
}
