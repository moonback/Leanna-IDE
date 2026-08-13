import { Router, Request, Response } from 'express';
import { SkillManager } from '../skills/SkillManager';
import { gitStatusCache } from '../skills/git';

export function createGitRouter(skillManager: SkillManager): Router {
  const router = Router();

  // GET /api/git/status
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const result = await skillManager.handleToolCall('git_status', {});
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/git/cache-stats
  router.get('/cache-stats', async (_req: Request, res: Response) => {
    try {
      res.json({
        status: 'success',
        ttl_ms: gitStatusCache.TTL_MS,
        ...gitStatusCache.getStats(),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/git/diff
  router.get('/diff', async (req: Request, res: Response) => {
    try {
      const { file, staged } = req.query as { file?: string; staged?: string };
      const result = await skillManager.handleToolCall('git_diff', {
        file: file || undefined,
        staged: staged === 'true',
      });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/git/stage
  router.post('/stage', async (req: Request, res: Response) => {
    try {
      const { files } = req.body as { files?: string[] };
      const result = await skillManager.handleToolCall('git_stage', { files: files || ['.'] });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/git/unstage
  router.post('/unstage', async (req: Request, res: Response) => {
    try {
      const { files } = req.body as { files?: string[] };
      const result = await skillManager.handleToolCall('git_unstage', { files: files || [] });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/git/commit
  router.post('/commit', async (req: Request, res: Response) => {
    try {
      const { message } = req.body as { message?: string };
      if (!message?.trim()) return res.status(400).json({ error: 'Le message du commit est requis.' });
      const result = await skillManager.handleToolCall('git_commit', { message });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/git/push
  router.post('/push', async (req: Request, res: Response) => {
    try {
      const { remote, branch } = req.body as { remote?: string; branch?: string };
      const result = await skillManager.handleToolCall('git_push', { remote, branch });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/git/pull
  router.post('/pull', async (req: Request, res: Response) => {
    try {
      const { remote, branch } = req.body as { remote?: string; branch?: string };
      const result = await skillManager.handleToolCall('git_pull', { remote, branch });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/git/branches
  router.get('/branches', async (_req: Request, res: Response) => {
    try {
      const result = await skillManager.handleToolCall('git_branches', {});
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/git/switch
  router.post('/switch', async (req: Request, res: Response) => {
    try {
      const { branch, create } = req.body as { branch?: string; create?: boolean };
      if (!branch?.trim()) return res.status(400).json({ error: 'Le nom de la branche est requis.' });
      const result = await skillManager.handleToolCall('git_switch_branch', { branch, create });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/git/log
  router.get('/log', async (req: Request, res: Response) => {
    try {
      const count = req.query.count ? Number(req.query.count) : 15;
      const result = await skillManager.handleToolCall('git_log', { count });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}