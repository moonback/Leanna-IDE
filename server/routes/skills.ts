import { Router, Request, Response } from 'express';

const router = Router();

// GET /api/skills
router.get('/', (_req: Request, res: Response) => {
  res.json({
    skills: [
      { id: 'time', name: 'Time & Date', icon: 'Clock', status: 'active' },
      { id: 'weather', name: 'Weather', icon: 'CloudRain', status: 'active' },
      { id: 'github', name: 'GitHub', icon: 'Github', status: 'active' },
      { id: 'list', name: 'Lists', icon: 'List', status: 'active' },
      { id: 'memory', name: 'Long-term Memory (Supabase)', icon: 'Database', status: process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? 'authenticated' : 'requires_auth' },
      { id: 'automation', name: 'Automation (Puppeteer)', icon: 'Globe', status: 'active' },
      { id: 'system', name: 'OS Control (Electron/Node)', icon: 'Monitor', status: 'active' },
      { id: 'reasoning', name: 'Background Tasks (Gemini Pro)', icon: 'Blocks', status: 'active' },
      { id: 'codebase', name: 'Codebase Editor', icon: 'Code', status: 'active' },
      { id: 'security_audit', name: 'Autonomous Security Audit', icon: 'ShieldCheck', status: 'active' },
      { id: 'history', name: 'Conversation History (Supabase)', icon: 'History', status: process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? 'authenticated' : 'requires_auth' },
    ],
  });
});

export default router;
