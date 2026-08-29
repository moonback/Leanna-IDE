import { Router, Request, Response } from 'express';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { readAuditEntries, analyzeAuditLog } from '../audit.js';
import { SELF_ROOT } from '../utils/selfRoot.js';
import { isSandboxActive, getSandboxRoot } from '../utils/sandbox.js';
import { getLogEntries, type LogLevel } from '../utils/logger.js';

const AGENT_LOG_MODULE = /^(Agent|Orchestrator|TaskScheduler|FileWriter|DelegationParser|Autonomous)/;

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
    const logPath = path.join(SELF_ROOT, '.Leanna-audit.log');
    const entries = await readAuditEntries(logPath, 20);
    res.json({ status: 'ok', entries });
  } catch (e: any) {
    console.error('[Audit] Failed to read logs:', e);
    res.status(500).json({ status: 'error', error: e.message || 'Unknown error' });
  }
});

// GET /api/audit/runtime-logs
// Expose uniquement l'historique assaini du logger de la session courante.
router.get('/runtime-logs', (req: Request, res: Response) => {
  const scope = req.query.scope === 'assistant' || req.query.scope === 'agents'
    ? req.query.scope
    : 'all';
  const level = typeof req.query.level === 'string' && ['debug', 'info', 'warn', 'error'].includes(req.query.level)
    ? req.query.level as LogLevel
    : undefined;
  const module = typeof req.query.module === 'string' && /^[A-Za-z0-9:_-]{1,120}$/.test(req.query.module)
    ? req.query.module
    : undefined;
  const requestedLimit = Number(req.query.limit);
  const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 100)) : 50;

  const entries = getLogEntries({ level, module, limit: 1_000 })
    .filter((entry) => scope === 'all' || (scope === 'assistant'
      ? entry.module === 'Assistant'
      : AGENT_LOG_MODULE.test(entry.module)))
    .slice(0, limit);

  res.set('Cache-Control', 'no-store');
  res.json({ status: 'ok', scope, entries });
});

// GET /api/audit/analysis
router.get('/analysis', (_req: Request, res: Response) => {
  const logPath = path.join(SELF_ROOT, '.Leanna-audit.log');
  const analysis = analyzeAuditLog(logPath);
  res.json({ status: 'success', analysis });
});

export default router;