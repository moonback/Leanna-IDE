import { Router, Request, Response } from 'express';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { readAuditEntries, analyzeAuditLog } from '../audit';
import { SELF_ROOT } from '../utils/selfRoot';
import { isSandboxActive, getSandboxRoot } from '../utils/sandbox';

const router = Router();

// GET /api/audit
router.get('/', async (_req: Request, res: Response) => {
  console.log('[Audit] Request received');
  try {
    const platform   = os.platform();
    const release    = os.release();
    const arch       = os.arch();
    const cpus       = os.cpus().length;
    const totalMB    = Math.round(os.totalmem() / 1024 / 1024);
    const freeMB     = Math.round(os.freemem() / 1024 / 1024);
    const uptime     = Math.round(os.uptime() / 3600);
    const nodeVer    = process.version;
    const projectRoot = isSandboxActive() ? getSandboxRoot() : SELF_ROOT;

    const geminiOk      = !!process.env.GEMINI_API_KEY;
    const supabaseOk    = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
    const openrouterOk  = !!process.env.OPENROUTER_API_KEY;

    const allSkills = [
      'time', 'weather', 'github', 'list', 'memory',
      'automation', 'system', 'reasoning', 'codebase', 'history',
    ];
    const activeSkills = allSkills.filter(id => {
      if (id === 'memory') return supabaseOk;
      return true;
    });

    const report = {
      platform,
      release,
      arch,
      cpus,
      totalMemoryMB: totalMB,
      freeMemoryMB: freeMB,
      uptimeHours: uptime,
      nodeVersion: nodeVer,
      activeSkills,
      supabaseOk,
      geminiOk,
      openrouterOk,
      projectRoot,
      generatedAt: new Date().toISOString(),
    };

    console.log('[Audit] Report generated successfully');
    res.json({ status: 'ok', report });
  } catch (e: any) {
    console.error('[Audit] Error:', e);
    res.status(500).json({ status: 'error', error: e.message || 'Unknown error' });
  }
});

// GET /api/audit/logs
router.get('/logs', async (_req: Request, res: Response) => {
  try {
    const logPath = path.join(SELF_ROOT, '.jarvis-audit.log');
    const entries = await readAuditEntries(logPath, 20);
    res.json({ status: 'ok', entries });
  } catch (e: any) {
    console.error('[Audit] Failed to read logs:', e);
    res.status(500).json({ status: 'error', error: e.message || 'Unknown error' });
  }
});

// GET /api/audit/analysis
router.get('/analysis', (_req: Request, res: Response) => {
  const logPath = path.join(SELF_ROOT, '.jarvis-audit.log');
  const analysis = analyzeAuditLog(logPath);
  res.json({ status: 'success', analysis });
});

export default router;