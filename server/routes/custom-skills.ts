import { Router, Request, Response } from 'express';

const router = Router();

// POST /api/custom-skills
router.post('/', async (req: Request, res: Response) => {
  try {
    const { getAllCustomSkills, createCustomSkill, updateCustomSkill, deleteCustomSkill, invalidateCustomSkillsCache } = await import('../skills/customSkills');
    const { action, ...payload } = req.body;

    switch (action) {
      case 'list': {
        const skills = await getAllCustomSkills();
        return res.json({ skills });
      }
      case 'create': {
        const skill = await createCustomSkill({
          name: payload.name,
          description: payload.description ?? '',
          parameters: payload.parameters ?? [],
          instruction: payload.instruction ?? '',
          category: payload.category ?? 'custom',
          enabled: true,
          icon: payload.icon ?? 'Sparkles',
        });
        invalidateCustomSkillsCache();
        return res.json(skill);
      }
      case 'update': {
        const { id, ...updates } = payload;
        if (!id) return res.status(400).json({ error: 'ID requis' });
        const updated = await updateCustomSkill(id, updates);
        invalidateCustomSkillsCache();
        return res.json(updated);
      }
      case 'delete': {
        if (!payload.id) return res.status(400).json({ error: 'ID requis' });
        await deleteCustomSkill(payload.id);
        invalidateCustomSkillsCache();
        return res.json({ success: true });
      }
      default:
        return res.status(400).json({ error: `Action inconnue: ${action}` });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;