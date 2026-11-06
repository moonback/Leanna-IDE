import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { getActiveProjectId } from '../utils/selfRoot.js';
import { invalidateMemoryCache } from '../skills/memory.js';

const router = Router();

// Isolation projet alignée sur le skill memory et HierarchicalMemoryService :
// projet actif + mémoires globales héritées (project_id = '').

// GET /api/memories
router.get('/', async (req: Request, res: Response) => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const limit = Math.min(Number(req.query.limit) || 20, 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const projectId = getActiveProjectId();
    let query = supabase
      .from('memories')
      .select('id, content, tags, created_at, updated_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (projectId) query = query.in('project_id', [projectId, '']);
    const { data, error, count } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ memories: data, total: count ?? data?.length ?? 0 });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// DELETE /api/memories/all — vide uniquement les mémoires du projet actif.
router.delete('/all', async (_req: Request, res: Response) => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }
  const projectId = getActiveProjectId();
  if (!projectId) {
    // Même garde-fou que HierarchicalMemoryService.clear('longterm').
    return res.status(400).json({ error: 'Aucun projet actif : refus de vider la mémoire de tous les projets.' });
  }
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase.from('memories').delete().eq('project_id', projectId).select('id');
    if (error) return res.status(500).json({ error: error.message });
    invalidateMemoryCache();
    return res.json({ status: 'success', deleted: data?.length ?? 0 });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// DELETE /api/memories/:id
router.delete('/:id', async (req: Request, res: Response) => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const projectId = getActiveProjectId();
    let query = supabase.from('memories').delete().eq('id', req.params.id);
    if (projectId) query = query.in('project_id', [projectId, '']);
    const { data, error } = await query.select('id');
    if (error) return res.status(500).json({ error: error.message });
    if (!data || data.length === 0) return res.status(404).json({ error: 'Mémoire introuvable dans le projet actif' });
    invalidateMemoryCache();
    return res.json({ success: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
