import { Router, type Request, type Response } from 'express';
import { DEFAULT_ROXANE_CONFIG, normalizeRoxaneConfig, type DebateRunRequest } from '../debate/types.js';
import { runDebate, synthesizeLiveDebate } from '../debate/DebateOrchestrator.js';
import { persistLiveDebate } from '../debate/DebatePersistence.js';

export function createDebateRouter(
  getProfile: () => Record<string, any>,
  setProfile: (profile: any) => void,
  saveProfile: (profile: any) => void,
  handleToolCall?: (name: string, args: any) => Promise<any>,
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

  router.post('/synthesize-live', async (req: Request, res: Response) => {
    const topic = typeof req.body?.topic === 'string' ? req.body.topic.trim().slice(0, 3000) : '';
    const turns = Array.isArray(req.body?.turns) ? req.body.turns.slice(0, 32) : [];
    if (!topic || turns.length === 0) {
      res.status(400).json({ error: 'Sujet et transcription du débat requis.' });
      return;
    }
    const safeTurns = turns.flatMap((turn: any) => {
      if (!['leanna', 'roxane', 'user'].includes(turn?.speaker) || typeof turn?.text !== 'string') return [];
      return [{ speaker: turn.speaker, text: turn.text.slice(0, 5000) }];
    });
    try {
      const synthesis = await synthesizeLiveDebate(getProfile(), topic, safeTurns);
      let historyId: string | null = null;
      try { historyId = await persistLiveDebate(topic, safeTurns, synthesis); }
      catch (persistError) { console.error('[Roxane][Persistence] Échec non bloquant', persistError); }
      res.json({ success: true, synthesis, historyId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Roxane][Synthesis] Échec', message);
      res.status(502).json({ error: 'La synthèse du débat a échoué.' });
    }
  });

  router.post('/decisions/create-missions', async (req: Request, res: Response) => {
    if (req.body?.approved !== true) {
      res.status(400).json({ error: 'Une validation explicite est obligatoire avant de créer des missions.' });
      return;
    }
    if (!handleToolCall) {
      res.status(503).json({ error: 'Le Mission System n’est pas disponible.' });
      return;
    }
    const tasks = Array.isArray(req.body?.tasks) ? req.body.tasks.slice(0, 5) : [];
    if (tasks.length === 0) {
      res.status(400).json({ error: 'Ajoute au moins une tâche validée.' });
      return;
    }
    const created: Array<{ title: string; missionId?: string }> = [];
    const failed: Array<{ title: string; error: string }> = [];
    for (const raw of tasks) {
      const title = typeof raw?.title === 'string' ? raw.title.trim().slice(0, 160) : '';
      const description = typeof raw?.description === 'string' ? raw.description.trim().slice(0, 4000) : '';
      const priority = ['low', 'medium', 'high', 'critical'].includes(raw?.priority) ? raw.priority : 'medium';
      if (!title || !description) { failed.push({ title: title || '(sans titre)', error: 'Titre et description obligatoires.' }); continue; }
      try {
        const result = await handleToolCall('mission_create', { title, description, priority, dryRun: false });
        if (result && typeof result === 'object' && result.missionId) {
          created.push({ title, missionId: String(result.missionId) });
        } else {
          failed.push({ title, error: String(result?.error || 'Mission non créée.') });
        }
      } catch (error) {
        failed.push({ title, error: error instanceof Error ? error.message : String(error) });
      }
    }
    res.json({ success: failed.length === 0, created, failed });
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
