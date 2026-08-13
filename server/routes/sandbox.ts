import { Router, Request, Response } from 'express';
import { activateSandbox, deactivateSandbox, discardSandbox, initSandbox, getSandboxDiff, getSandboxStatus } from '../utils/sandbox';
import { startWatching } from '../utils/sandboxWatcher';

const router = Router();

// GET /api/sandbox/status
router.get('/status', async (req: Request, res: Response) => {
  try {
    res.json({ status: 'success', sandbox: getSandboxStatus() });
  } catch (e: any) {
    res.status(500).json({ status: 'error', error: e.message });
  }
});

// GET /api/sandbox/diff
router.get('/diff', async (req: Request, res: Response) => {
  try {
    const diff = await getSandboxDiff();
    res.json({ status: 'success', diff });
  } catch (e: any) {
    res.status(500).json({ status: 'error', error: e.message });
  }
});

// POST /api/sandbox/init
router.post('/init', async (req: Request, res: Response) => {
  try {
    const result = await initSandbox();
    startWatching();
    activateSandbox();
    res.json({ status: 'success', ...result, sandbox: getSandboxStatus() });
  } catch (e: any) {
    res.status(500).json({ status: 'error', error: e.message });
  }
});

// POST /api/sandbox/activate
router.post('/activate', async (req: Request, res: Response) => {
  try {
    startWatching();
    activateSandbox();
    res.json({ status: 'success', sandbox: getSandboxStatus() });
  } catch (e: any) {
    res.status(500).json({ status: 'error', error: e.message });
  }
});

// POST /api/sandbox/deactivate
router.post('/deactivate', async (req: Request, res: Response) => {
  try {
    deactivateSandbox();
    res.json({ status: 'success' });
  } catch (e: any) {
    res.status(500).json({ status: 'error', error: e.message });
  }
});

// POST /api/sandbox/discard
router.post('/discard', async (req: Request, res: Response) => {
  try {
    await discardSandbox();
    res.json({ status: 'success' });
  } catch (e: any) {
    res.status(500).json({ status: 'error', error: e.message });
  }
});

export default router;