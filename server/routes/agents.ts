import { Router, Request, Response } from 'express';
import type { SkillManagerV2 } from '../runtime/compat/SkillManagerV2';
import {
  agentOrchestrator,
  agentMessageBus,
  agentRegistry,
  agentPersistence,
  COLLABORATION_PATTERNS,
  DELEGATION_MATRIX,
} from '../agents';
import { AgentPersistence } from '../agents/AgentPersistence';

// Type compatible avec l'ancien SkillManager pour une migration progressive
type SkillManager = SkillManagerV2;

export function createAgentsRouter(skillManager: SkillManager): Router {
  const router = Router();

  // GET /api/agents/status
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const stats = agentOrchestrator.getStats();
      const declarations = skillManager.getToolDeclarations();
      const agentTools = declarations.filter((d: any) => d.name.startsWith('agent_'));
      res.json({
        registered: agentTools.length > 0,
        tools: agentTools.map((d: any) => d.name),
        stats,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/agents/tasks
  router.get('/tasks', async (_req: Request, res: Response) => {
    try {
      const result = await skillManager.handleToolCall('agent_list_tasks', {
        limit: 50,
      });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/agents/roles
  router.get('/roles', async (_req: Request, res: Response) => {
    try {
      const result = await skillManager.handleToolCall('agent_list_roles', {});
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Nouveaux endpoints autonomes ─────────────────────────────────────────

  /**
   * GET /api/agents/fleet
   * Statut de la flotte d'agents autonomes (registry + bus).
   */
  router.get('/fleet', (_req: Request, res: Response) => {
    try {
      res.json(agentOrchestrator.getFleetStatus());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * GET /api/agents/bus/metrics
   * Métriques du bus de messages inter-agents.
   */
  router.get('/bus/metrics', (_req: Request, res: Response) => {
    try {
      res.json(agentMessageBus.getMetrics());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * GET /api/agents/bus/history
   * Historique des messages échangés entre agents.
   */
  router.get('/bus/history', (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string ?? '50', 10), 200);
      res.json({ messages: agentMessageBus.getHistory(limit) });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * GET /api/agents/collaboration/patterns
   * Liste les patterns de collaboration disponibles.
   */
  router.get('/collaboration/patterns', (_req: Request, res: Response) => {
    res.json({ patterns: COLLABORATION_PATTERNS });
  });

  /**
   * GET /api/agents/collaboration/matrix
   * Matrice de délégation inter-agents.
   */
  router.get('/collaboration/matrix', (_req: Request, res: Response) => {
    res.json({ matrix: DELEGATION_MATRIX });
  });

  /**
   * POST /api/agents/collaborate
   * Lance une collaboration structurée selon un pattern prédéfini.
   * Body: { patternName, context: { title, description, files?, instructions? } }
   */
  router.post('/collaborate', async (req: Request, res: Response) => {
    try {
      const { patternName, context } = req.body as {
        patternName: string;
        context: {
          title: string;
          description: string;
          files?: string[];
          instructions?: string;
        };
      };

      if (!patternName || !context?.title || !context?.description) {
        return res.status(400).json({
          error: 'patternName, context.title et context.description sont requis',
        });
      }

      const plan = await agentOrchestrator.collaborateByPattern({ patternName, context });
      res.status(202).json({
        orchestrationId: plan.id,
        pattern: patternName,
        status: plan.status,
        tasks: plan.tasks.length,
        message: `Collaboration "${patternName}" démarrée`,
      });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  /**
   * POST /api/agents/delegate-autonomous
   * Délègue une tâche à un agent autonome (peut sous-déléguer automatiquement).
   * Body: { role, title, description, files?, instructions?, priority? }
   */
  router.post('/delegate-autonomous', async (req: Request, res: Response) => {
    try {
      const task = await agentOrchestrator.delegateAutonomously(req.body);
      res.status(202).json({
        taskId: task.id,
        role: task.role,
        status: task.status,
        message: `Tâche déléguée à l'agent autonome "${task.role}"`,
      });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  /**
   * GET /api/agents/:role/status
   * Statut d'un agent autonome spécifique.
   */
  router.get('/:role/status', (req: Request, res: Response) => {
    try {
      if (!agentRegistry.isReady) {
        return res.status(503).json({ error: 'Registry non initialisé' });
      }
      const agent = agentRegistry.getAgent(req.params.role as any);
      res.json(agent.getStats());
    } catch (e: any) {
      res.status(404).json({ error: e.message });
    }
  });

  /**
   * GET /api/agents/loop/config
   * Retourne la configuration de la boucle autonome par rôle.
   */
  router.get('/loop/config', (_req: Request, res: Response) => {
    res.json({
      description: "Configuration de la boucle Observe → Decide → Act par rôle",
      roles: {
        coder:     { maxIterations: 3, minConfidenceScore: 0.70, verifyFiles: true },
        architect: { maxIterations: 2, minConfidenceScore: 0.65, verifyFiles: true },
        refactor:  { maxIterations: 3, minConfidenceScore: 0.70, verifyFiles: true },
        test:      { maxIterations: 3, minConfidenceScore: 0.65, verifyFiles: true },
        docs:      { maxIterations: 2, minConfidenceScore: 0.55, verifyFiles: false },
        security:  { maxIterations: 1, minConfidenceScore: 0.50, verifyFiles: false },
        review:    { maxIterations: 1, minConfidenceScore: 0.50, verifyFiles: false },
      },
      signals: {
        retry:  "## RETRY — force une nouvelle itération",
        done:   "## TERMINÉ — force l'arrêt immédiat",
      },
    });
  });

  // ─── Persistance ──────────────────────────────────────────────────────────

  /**
   * GET /api/agents/persistence/status
   * État de la connexion Supabase pour la persistance des agents.
   */
  router.get('/persistence/status', (_req: Request, res: Response) => {
    res.json({
      available: agentPersistence.isAvailable,
      message: agentPersistence.isAvailable
        ? "Supabase connecté — persistance active"
        : "Supabase non configuré — mode mémoire uniquement (redémarrage perd les données)",
      hint: agentPersistence.isAvailable
        ? "Les tâches, orchestrations et messages sont persistés automatiquement."
        : "Configurez SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env pour activer la persistance.",
    });
  });

  /**
   * GET /api/agents/persistence/migration
   * Retourne le SQL de migration pour créer les tables Supabase.
   * À exécuter une seule fois dans le dashboard Supabase → SQL Editor.
   */
  router.get('/persistence/migration', (_req: Request, res: Response) => {
    const sql = AgentPersistence.getMigrationSQL();
    res.json({
      description: "SQL de migration pour créer les tables de persistance des agents",
      instructions: [
        "1. Ouvrez le dashboard Supabase → SQL Editor",
        "2. Copiez le contenu du champ 'sql' ci-dessous",
        "3. Exécutez-le une seule fois",
        "4. Les tables agent_tasks, agent_orchestrations et agent_messages seront créées",
      ],
      sql,
    });
  });

  /**
   * POST /api/agents/persistence/restore
   * Force une restauration depuis Supabase (normalement automatique au démarrage).
   */
  router.post('/persistence/restore', async (_req: Request, res: Response) => {
    try {
      if (!agentPersistence.isAvailable) {
        return res.status(503).json({ error: 'Supabase non configuré' });
      }
      const result = await agentOrchestrator.restoreFromPersistence();
      res.json({ success: true, ...result });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
