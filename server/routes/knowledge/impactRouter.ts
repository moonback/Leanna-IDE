import { Router, Request, Response } from 'express';
import { impactAnalyzer, codeMap } from '../../knowledge/index.js';

const router = Router();

// POST /api/knowledge/impact/analyze
router.post('/impact/analyze', (req: Request, res: Response) => {
  try {
    const { files, mode, minScore, includeTests, onlyInPaths } = req.body as {
      files?: string | string[];
      mode?: 'quick' | 'standard' | 'deep' | 'reverse';
      minScore?: number;
      includeTests?: boolean;
      onlyInPaths?: string[];
    };
    if (!files || (Array.isArray(files) && files.length === 0)) {
      return res.status(400).json({ error: 'Le paramètre files (string ou string[]) est requis.' });
    }
    const report = impactAnalyzer.analyze(files, {
      mode: mode || 'standard',
      minScore,
      includeTests,
      onlyInPaths,
    });
    return res.json({ status: 'success', report });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/knowledge/impact/quick
router.post('/impact/quick', (req: Request, res: Response) => {
  try {
    const { file } = req.body as { file?: string };
    if (!file) {
      return res.status(400).json({ error: 'Le paramètre file est requis.' });
    }
    const report = impactAnalyzer.quickAnalyze(file);
    return res.json({ status: 'success', report });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/knowledge/impact/deep
router.post('/impact/deep', (req: Request, res: Response) => {
  try {
    const { files } = req.body as { files?: string | string[] };
    if (!files || (Array.isArray(files) && files.length === 0)) {
      return res.status(400).json({ error: 'Le paramètre files est requis.' });
    }
    const report = impactAnalyzer.deepAnalyze(files);
    return res.json({ status: 'success', report });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/knowledge/impact/reverse
router.post('/impact/reverse', (req: Request, res: Response) => {
  try {
    const { file } = req.body as { file?: string };
    if (!file) {
      return res.status(400).json({ error: 'Le paramètre file est requis.' });
    }
    const report = impactAnalyzer.reverseAnalyze(file);
    return res.json({ status: 'success', report });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── Cartographie vivante du code ────────────────────────────────────────────

// GET /api/knowledge/code-map/stats
router.get('/code-map/stats', (_req: Request, res: Response) => {
  try {
    codeMap.ensureFresh();
    return res.json({ status: 'success', stats: codeMap.getStats() });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/knowledge/code-map/graph?prefix=server/knowledge&maxNodes=500&files=false
router.get('/code-map/graph', (req: Request, res: Response) => {
  try {
    const prefix = typeof req.query.prefix === 'string' ? req.query.prefix : undefined;
    const maxNodes = Math.min(5000, Math.max(1, Number(req.query.maxNodes) || 2000));
    const includeFiles = req.query.files !== 'false';
    return res.json({ status: 'success', ...codeMap.toJSON({ pathPrefix: prefix, maxNodes, includeFiles }) });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/knowledge/code-map/symbol?q=getUser&limit=5
router.get('/code-map/symbol', (req: Request, res: Response) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) return res.status(400).json({ error: 'Le paramètre q est requis.' });
    const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 5));
    const exact = codeMap.resolveRef(q);
    const ids = exact.length ? exact : codeMap.findSymbols(q, { limit }).map((n) => n.id);
    return res.json({ status: 'success', results: ids.slice(0, limit).map((id) => codeMap.describe(id)) });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/knowledge/code-map/impact  { targets: string[], depth?: number }
router.post('/code-map/impact', (req: Request, res: Response) => {
  try {
    const { targets, depth } = req.body as { targets?: string | string[]; depth?: number };
    const list = (Array.isArray(targets) ? targets : targets ? [targets] : []).filter((t) => typeof t === 'string' && t.trim());
    if (list.length === 0) {
      return res.status(400).json({ error: 'Le paramètre targets (string ou string[]) est requis.' });
    }
    const report = codeMap.analyzeImpact(list, { maxDepth: depth });
    return res.json({ status: 'success', report });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
