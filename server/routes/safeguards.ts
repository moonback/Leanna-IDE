import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { SELF_ROOT, CRITICAL_FILES } from '../utils/selfRoot';

const router = Router();

interface CacheEntry {
  value: any;
  expiresAt: number;
}
const readCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 2000;

function cachedRead(configPath: string, fallback: any): any {
  const now = Date.now();
  const cached = readCache.get(configPath);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }
  let result: any;
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      result = JSON.parse(raw);
    } else {
      result = fallback;
    }
  } catch {
    result = fallback;
  }
  readCache.set(configPath, { value: result, expiresAt: now + CACHE_TTL_MS });
  return result;
}

function invalidateCache(configPath: string) {
  readCache.delete(configPath);
}

// GET /api/safeguards/config
router.get('/config', (_req: Request, res: Response) => {
  const configPath = path.join(SELF_ROOT, '.Leanna', 'safeguards.json');
  const defaultConfig = {
    autoCheckpoint: true,
    postEditValidation: true,
    criticalFileConfirm: true,
    autoRestart: true,
    criticalFiles: [...CRITICAL_FILES],
  };
  const config = cachedRead(configPath, defaultConfig);
  res.json({ config });
});

// POST /api/safeguards/config
router.post('/config', (req: Request, res: Response) => {
  const configDir = path.join(SELF_ROOT, '.Leanna');
  const configPath = path.join(configDir, 'safeguards.json');
  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(req.body, null, 2), 'utf-8');
    invalidateCache(configPath);
    res.json({ status: 'success' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/safeguards/checkpoints
router.get('/checkpoints', async (req: Request, res: Response) => {
  try {
    const { listCheckpoints } = await import('../utils/checkpoint');
    const count = parseInt(req.query.limit as string) || 5;
    const checkpoints = await listCheckpoints(count);
    res.json({ checkpoints });
  } catch (e: any) {
    res.json({ checkpoints: [] });
  }
});

// POST /api/safeguards/validate
router.post('/validate', async (_req: Request, res: Response) => {
  try {
    const { validateBuild } = await import('../utils/checkpoint');
    const result = await validateBuild();
    res.json({ success: result.valid, errors: result.errors });
  } catch (e: any) {
    res.json({ success: false, error: e.message });
  }
});

// POST /api/safeguards/rollback
router.post('/rollback', async (req: Request, res: Response) => {
  try {
    const { rollbackToCheckpoint } = await import('../utils/checkpoint');
    const { hash } = req.body as { hash?: string };
    if (!hash) return res.status(400).json({ error: 'hash est requis.' });
    const ok = await rollbackToCheckpoint(hash);
    res.json({ success: ok });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
