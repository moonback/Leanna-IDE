import { Router, Request, Response } from 'express';
import { z } from 'zod';
import type { SkillManagerV2 } from '../runtime/compat/SkillManagerV2.js';
import {
  agentOrchestrator,
  agentMessageBus,
  agentRegistry,
  agentPersistence,
  COLLABORATION_PATTERNS,
  DELEGATION_MATRIX,
  STATIC_AGENT_REGISTRY,
  initializeToolAgentMapper,
  getPrimaryAgentForTool,
  getAllToolCategories,
  getToolsForAgent,
  getExplicitlyAttributedTools,
} from '../agents/index.js';
import { AgentPersistence } from '../agents/AgentPersistence.js';
import { agentEventStream } from '../agents/AgentEventStream.js';
import { leadOptionsShape } from '../agents/lead/types.js';

// ── Schémas de validation ────────────────────────────────────────────────────

const CollaborateSchema = z.object({
  patternName: z.string().min(1, "patternName requis"),
  context: z.object({
    title: z.string().min(1, "context.title requis"),
    description: z.string().min(1, "context.description requis"),
    files: z.array(z.string()).optional(),
    instructions: z.string().optional(),
  }),
});

const DelegateSchema = z.object({
  role: z.string().min(1, "role requis"),
  title: z.string().min(1, "title requis"),
  description: z.string().min(1, "description requis"),
  files: z.array(z.string()).optional(),
  instructions: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  timeoutMs: z.number().int().min(0).optional(),
});

// ── Sérialisation du détail d'une tâche (bornée : jamais de réponse géante) ──

const clip = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' ? (v.length > max ? `${v.slice(0, max)}…` : v) : undefined;
const clipList = (v: unknown, max = 200): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max) : [];

function serializeTaskDetail(task: any) {
  const r = task.result;
  const ev = r?.evidence;
  return {
    id: task.id,
    orchestrationId: task.orchestrationId,
    role: task.role,
    title: task.title,
    description: clip(task.description, 8000),
    priority: task.priority,
    status: task.status,
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
    timeoutMs: task.timeoutMs,
    execution: task.execution ? {
      intent: clip(task.execution.intent, 500),
      successCriteria: clipList(task.execution.successCriteria, 20),
      steps: Array.isArray(task.execution.steps)
        ? task.execution.steps.slice(0, 20).map((s: any) => ({ description: clip(s.description, 400), status: s.status }))
        : [],
      budget: task.execution.budget,
      recoveries: task.execution.recoveries,
      replans: task.execution.replans,
    } : undefined,
    context: {
      files: clipList(task.context?.files),
      instructions: clip(task.context?.instructions, 4000),
      successCriteria: clipList(task.context?.successCriteria, 50),
      previousResultsCount: Array.isArray(task.context?.previousResults) ? task.context.previousResults.length : 0,
      observability: (() => {
        const value = task.context?.metadata?.contextObservability;
        if (!value || typeof value !== "object") return undefined;
        const v = value as Record<string, unknown>;
        const numberOrZero = (key: string) => typeof v[key] === "number" && Number.isFinite(v[key]) ? v[key] : 0;
        return {
          version: numberOrZero("version"),
          capturedAt: clip(v.capturedAt, 64),
          role: clip(v.role, 64),
          strategy: clip(v.strategy, 80),
          selectedFileCount: numberOrZero("selectedFileCount"),
          memoryChars: numberOrZero("memoryChars"),
          injectedMemoryChars: numberOrZero("injectedMemoryChars"),
          memoryBudgetChars: numberOrZero("memoryBudgetChars"),
          factsMatched: numberOrZero("factsMatched"),
          factsEligible: numberOrZero("factsEligible"),
          factsIncluded: numberOrZero("factsIncluded"),
          staleFactsExcluded: numberOrZero("staleFactsExcluded"),
          graphRelationsIncluded: numberOrZero("graphRelationsIncluded"),
          previousResultsIncluded: numberOrZero("previousResultsIncluded"),
          possibleConflicts: numberOrZero("possibleConflicts"),
        };
      })(),
    },
    result: r ? {
      success: Boolean(r.success),
      outcome: r.outcome,
      blockReason: r.blockReason,
      summary: clip(r.summary, 4000),
      details: clip(r.details, 20000),
      filesModified: clipList(r.filesModified),
      fileValidationErrors: Array.isArray(r.fileValidationErrors) ? r.fileValidationErrors.slice(0, 50) : [],
      suggestions: clipList(r.suggestions, 30),
      error: clip(r.error, 4000),
      durationMs: r.durationMs,
      delegatedSubTasks: clipList(r.delegatedSubTasks, 50),
      proposedDelegations: Array.isArray(r.proposedDelegations)
        ? r.proposedDelegations.slice(0, 10).map((d: any) => ({
          role: typeof d.role === 'string' ? d.role : undefined,
          reason: clip(d.reason, 1000),
          files: clipList(d.files, 50),
        }))
        : [],
      evidence: ev ? {
        filesRead: clipList(ev.filesRead),
        filesModified: clipList(ev.filesModified),
        toolsExecuted: clipList(ev.toolsExecuted),
        commandsExecuted: clipList(ev.commandsExecuted, 100),
        verification: {
          passed: Boolean(ev.verification?.passed),
          checks: clipList(ev.verification?.checks, 100),
          errors: clipList(ev.verification?.errors, 100),
        },
        regressions: clipList(ev.globalValidation?.regressions, 50),
      } : undefined,
    } : undefined,
  };
}

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

  // POST /api/agents/compose-swarm — Dynamic Agent Swarm (preview, read-only)
  router.post('/compose-swarm', async (req: Request, res: Response) => {
    const { objective, description, planned_skills, max_members } = req.body ?? {};
    if (typeof objective !== 'string' || !objective.trim()) {
      return res.status(400).json({ error: "Champ 'objective' (string) requis." });
    }
    try {
      const result = await skillManager.handleToolCall('agent_compose_swarm', {
        objective: objective.trim(),
        description: typeof description === 'string' ? description.trim() : undefined,
        planned_skills: Array.isArray(planned_skills) ? planned_skills : undefined,
        max_members: typeof max_members === 'number' ? max_members : undefined,
      });
      if (result && typeof result === 'object' && 'error' in result) {
        return res.status(400).json(result);
      }
      return res.json(result);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
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

  // GET /api/agents/tasks/:taskId — Détail complet d'une mission (lecture seule) :
  // brief, contexte, horodatages, résultat et preuves d'exécution. Utilisé par
  // le panneau Agents pour afficher ce qu'a réellement fait un agent.
  router.get('/tasks/:taskId', (req: Request, res: Response) => {
    const taskId = String(req.params.taskId || '').trim();
    if (!taskId) {
      return res.status(400).json({ error: "Paramètre 'taskId' requis." });
    }
    try {
      const task = agentOrchestrator.getTask(taskId);
      if (!task) {
        return res.status(404).json({ error: 'Tâche introuvable (purgée ou issue d’une session précédente).' });
      }
      return res.json({ task: serializeTaskDetail(task) });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // POST /api/agents/tasks/:taskId/cancel — Annule une tâche agent (pending ou running)
  router.post('/tasks/:taskId/cancel', (req: Request, res: Response) => {
    const taskId = String(req.params.taskId || '').trim();
    if (!taskId) {
      return res.status(400).json({ error: "Paramètre 'taskId' requis." });
    }
    try {
      const cancelled = agentOrchestrator.cancelTask(taskId);
      if (!cancelled) {
        return res.status(404).json({
          success: false,
          error: "Tâche introuvable ou déjà terminée.",
        });
      }
      return res.json({ success: true, message: `Tâche "${taskId}" annulée.` });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message });
    }
  });

  // POST /api/agents/tasks/delete — Supprime définitivement des tâches (purge mémoire + persistance)
  router.post('/tasks/delete', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const ids: unknown = body.taskIds;
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string') || ids.length === 0) {
      return res.status(400).json({ error: "Champ 'taskIds' (string[]) non vide requis." });
    }
    try {
      const deleted = await agentOrchestrator.deleteTasks(ids as string[]);
      return res.json({ success: true, deleted, requested: ids.length });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message });
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
      const parsed = CollaborateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Corps de requête invalide.',
          details: parsed.error.errors.map((e) => ({ field: e.path.join('.') || '(root)', message: e.message })),
        });
      }
      const { patternName, context } = parsed.data;

      const plan = await agentOrchestrator.collaborateByPattern({ patternName, context });
      return res.status(202).json({
        orchestrationId: plan.id,
        pattern: patternName,
        status: plan.status,
        tasks: plan.tasks.length,
        message: `Collaboration "${patternName}" démarrée`,
      });
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }
  });

  /**
   * POST /api/agents/delegate
   * Lance une délégation PROPOSÉE par un agent (bouton « Lancer » du détail de
   * mission). Avec un rôle : délégation directe via le runtime agentique ; sans
   * rôle : mise aux enchères (contract-net) parmi les agents compétents.
   * Body: { role?, title, description, files?, instructions?, priority? }
   */
  router.post('/delegate', async (req: Request, res: Response) => {
    try {
      const parsed = DelegateSchema.extend({ role: z.string().optional() }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Corps de requête invalide.',
          details: parsed.error.errors.map((e) => ({ field: e.path.join('.') || '(root)', message: e.message })),
        });
      }
      const { role, ...rest } = parsed.data;
      if (role) {
        const task = await agentOrchestrator.delegateTask({ ...rest, role });
        return res.status(202).json({ taskId: task.id, role: task.role, status: task.status });
      }
      const outcome = await agentOrchestrator.negotiateTask(rest);
      if (!outcome.awarded) {
        return res.status(409).json({ error: 'Aucun agent compétent disponible pour cette sous-tâche.' });
      }
      return res.status(202).json({ taskId: outcome.taskId, role: outcome.winner, status: 'pending' });
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }
  });

  /**
   * POST /api/agents/delegate-autonomous
   * Délègue une tâche à un agent autonome (peut sous-déléguer automatiquement).
   * Body: { role, title, description, files?, instructions?, priority? }
   */
  router.post('/delegate-autonomous', async (req: Request, res: Response) => {
    try {
      const parsed = DelegateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Corps de requête invalide.',
          details: parsed.error.errors.map((e) => ({ field: e.path.join('.') || '(root)', message: e.message })),
        });
      }
      const task = await agentOrchestrator.delegateAutonomously(parsed.data);
      return res.status(202).json({
        taskId: task.id,
        role: task.role,
        status: task.status,
        message: `Tâche déléguée à l'agent autonome "${task.role}"`,
      });
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }
  });

  // ── Agent Brain REST API ──────────────────────────────────────────────────

  const BrainPlanSchema = z.object({
    goal: z.string().min(1, "goal requis").trim(),
    contextFiles: z.array(z.string()).optional().default([]),
    instructions: z.string().optional(),
  });

  const BrainExecuteSchema = BrainPlanSchema.extend({
    maxCorrectionAttempts: z.number().int().min(0).max(5).optional().default(3),
    ...leadOptionsShape,
    preferences: z.object({
      visualValidation: z.boolean().optional(),
      skipTests: z.boolean().optional(),
      strictMode: z.boolean().optional(),
    }).optional(),
  });

  /**
   * POST /api/agents/brain/plan
   * Génère un plan dynamique (compréhension + décomposition en DAG) sans exécuter.
   * Body: { goal, contextFiles?, instructions? }
   */
  router.post('/brain/plan', async (req: Request, res: Response) => {
    try {
      const parsed = BrainPlanSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Corps de requête invalide.',
          details: parsed.error.errors.map((e) => ({ field: e.path.join('.') || '(root)', message: e.message })),
        });
      }
      const plan = await agentOrchestrator.brainPlan({ ...parsed.data, mode: 'plan_first' });
      return res.status(200).json({
        planId: plan.id,
        goal: plan.goal,
        understanding: plan.understanding,
        stages: plan.stages.map((s) => ({
          id: s.id,
          role: s.agentRole,
          title: s.title,
          reason: s.agentReason,
          tools: s.tools,
          skills: s.skills,
          dependsOn: s.dependsOn,
        })),
        estimatedDurationMs: plan.estimatedDurationMs,
        rationale: plan.architectureRationale,
        mermaid: plan.mermaid,
        createdAt: plan.createdAt,
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  /**
   * POST /api/agents/brain/execute
   * Exécute un objectif de bout en bout via l'Agent Brain.
   * Body: { goal, contextFiles?, instructions?, maxCorrectionAttempts?, preferences? }
   */
  router.post('/brain/execute', async (req: Request, res: Response) => {
    try {
      const parsed = BrainExecuteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Corps de requête invalide.',
          details: parsed.error.errors.map((e) => ({ field: e.path.join('.') || '(root)', message: e.message })),
        });
      }
      const result = await agentOrchestrator.brainExecute({ ...parsed.data, mode: 'auto' });
      return res.status(result.success ? 200 : 207).json({
        planId: result.planId,
        success: result.success,
        summary: result.summary,
        stagesExecuted: result.stages.map((s) => ({
          role: s.stage.agentRole,
          title: s.stage.title,
          status: s.stage.status,
          durationMs: s.durationMs,
        })),
        filesModified: result.filesModified,
        correctionsApplied: result.corrections.length,
        totalDurationMs: result.totalDurationMs,
        deliverables: result.deliverables,
        stopReason: result.stopReason,
        leadDecisions: result.leadDecisions,
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  /**
   * GET /api/agents/brain/status/:planId
   * État d'avancement d'un run Brain.
   */
  router.get('/brain/status/:planId', async (req: Request, res: Response) => {
    try {
      const brain = await agentOrchestrator.getBrain();
      const plan = brain.getPlan(req.params.planId);
      const result = brain.getResult(req.params.planId);
      if (!plan) {
        return res.status(404).json({ error: `Plan ${req.params.planId} introuvable.` });
      }
      return res.json({
        planId: plan.id,
        goal: plan.goal,
        status: plan.status,
        stages: plan.stages.map((s: any) => ({
          id: s.id, role: s.agentRole, title: s.title, status: s.status,
          durationMs: s.durationMs,
        })),
        result: result ? {
          success: result.success,
          summary: result.summary,
          filesModified: result.filesModified,
          totalDurationMs: result.totalDurationMs,
        } : null,
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  /**
   * GET /api/agents/events
   * Flux SSE des événements de progression des agents.
   */
  router.get('/events', (req: Request, res: Response) => {
    const rawCursor = req.get('Last-Event-ID') ?? req.query.lastEventId;
    const parsedCursor = typeof rawCursor === 'string' ? Number(rawCursor) : Number.NaN;
    const afterId = Number.isSafeInteger(parsedCursor) && parsedCursor >= 0 ? parsedCursor : undefined;

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write('retry: 5000\n\n');

    const keepAlive = setInterval(() => {
      if (!res.destroyed) res.write(': keep-alive\n\n');
    }, 15_000);
    const unsubscribe = agentEventStream.subscribe(({ id, event }) => {
      if (res.destroyed) return;
      res.write(`id: ${id}\nevent: agent_event\ndata: ${JSON.stringify(event)}\n\n`);
    }, afterId);

    res.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
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
      return res.json(agent.getStats());
    } catch (e: any) {
      return res.status(404).json({ error: e.message });
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
      return res.json({ success: true, ...result });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // ─── Tool-Agent Mapping (Spécialisation des compétences) ──────────────────

  /**
   * GET /api/agents/tool-mapping
   * Retourne le mapping complet outil → agent.
   * Utilisé par le frontend pour l'affichage des activités par agent.
   */
  router.get('/tool-mapping', (_req: Request, res: Response) => {
    try {
      // Initialiser le mapper si ce n'est pas déjà fait
      initializeToolAgentMapper();
      
      // Construire le mapping complet
      const toolMapping: Record<string, string> = {};
      const allTools = new Set<string>();

      // Source de vérité : outils RÉELLEMENT exécutables (ToolRegistry).
      // Sert à filtrer les attributions explicites fantômes (noms déclarés dans
      // SENSITIVE_TOOL_ATTRIBUTION mais sans outil enregistré) qui gonflaient le
      // total servi au renderer au-delà du nombre réel d'outils (cf. 228 vs 230).
      const executableTools = new Set(
        skillManager.getToolDeclarations().map((d: any) => d.name)
      );

      // Obtenir tous les agents et leurs outils. On n'injecte que les
      // capabilities qui correspondent à un outil réellement exécutable.
      const allAgents = Object.keys(STATIC_AGENT_REGISTRY);
      for (const role of allAgents) {
        const tools = getToolsForAgent(role);
        for (const tool of tools) {
          if (!executableTools.has(tool)) continue;
          if (!allTools.has(tool)) {
            allTools.add(tool);
            toolMapping[tool] = role;
          }
        }
      }
      
      // Inclure aussi les outils portant une attribution explicite du
      // ToolRegistry (source de vérité), même s'ils ne sont capability
      // d'aucun rôle. getPrimaryAgentForTool applique la priorité attribution.
      // On IGNORE les attributions dont l'outil n'est pas enregistré : le socle
      // sensible déclare statiquement des noms qui n'apparaissent que selon la
      // config active, et le mapping ne doit exposer que des outils réels.
      for (const tool of getExplicitlyAttributedTools()) {
        if (!executableTools.has(tool)) continue;
        if (!allTools.has(tool)) {
          allTools.add(tool);
        }
        toolMapping[tool] = getPrimaryAgentForTool(tool);
      }

      // Enfin, énumérer TOUS les outils exécutables du ToolRegistry pour que
      // l'attribution sémantique par catégorie (priorité 3) atteigne l'UI.
      // Sans cette passe, les outils non-capability tombaient sur 'system'
      // côté renderer faute d'être présents dans le mapping injecté.
      for (const tool of executableTools) {
        if (!allTools.has(tool)) {
          allTools.add(tool);
          toolMapping[tool] = getPrimaryAgentForTool(tool);
        }
      }
      
      return res.json({
        success: true,
        mapping: toolMapping,
        totalTools: Object.keys(toolMapping).length,
        totalAgents: allAgents.length,
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  /**
   * GET /api/agents/tool-mapping/primary
   * Retourne uniquement le mapping outil → agent principal (premier agent trouvé).
   * Format optimisé pour le frontend.
   */
  router.get('/tool-mapping/primary', (_req: Request, res: Response) => {
    try {
      initializeToolAgentMapper();
      
      // Obtenir le mapping principal
      const mapping: Record<string, string> = {};
      const allTools = new Set<string>();

      // Source de vérité : outils réellement exécutables (voir /tool-mapping).
      const executableTools = new Set(
        skillManager.getToolDeclarations().map((d: any) => d.name)
      );

      const allAgents = Object.keys(STATIC_AGENT_REGISTRY);
      for (const role of allAgents) {
        const tools = getToolsForAgent(role);
        for (const tool of tools) {
          if (!executableTools.has(tool)) continue;
          if (!allTools.has(tool)) {
            allTools.add(tool);
            mapping[tool] = getPrimaryAgentForTool(tool);
          }
        }
      }
      
      // Outils à attribution explicite (ToolRegistry) : priment et sont
      // exposés même sans rôle capability correspondant — mais UNIQUEMENT s'ils
      // sont réellement enregistrés (évite les noms fantômes du socle sensible).
      for (const tool of getExplicitlyAttributedTools()) {
        if (!executableTools.has(tool)) continue;
        allTools.add(tool);
        mapping[tool] = getPrimaryAgentForTool(tool);
      }

      // Énumérer TOUS les outils exécutables pour que l'attribution par
      // catégorie (priorité 3) soit servie au renderer plutôt que résolue
      // en 'system' faute de présence dans le mapping.
      for (const tool of executableTools) {
        if (!allTools.has(tool)) {
          allTools.add(tool);
          mapping[tool] = getPrimaryAgentForTool(tool);
        }
      }
      
      return res.json({
        success: true,
        mapping,
        totalTools: Object.keys(mapping).length,
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  /**
   * GET /api/agents/tool-categories
   * Retourne les catégories d'outils avec leurs rôles recommandés.
   */
  router.get('/tool-categories', (_req: Request, res: Response) => {
    try {
      const categories = getAllToolCategories();
      return res.json({
        success: true,
        categories,
        totalCategories: Object.keys(categories).length,
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  /**
   * GET /api/agents/:role/tools
   * Retourne tous les outils disponibles pour un rôle d'agent donné.
   */
  router.get('/:role/tools', (req: Request, res: Response) => {
    try {
      const role = req.params.role;
      const tools = getToolsForAgent(role);
      
      if (tools.length === 0) {
        return res.status(404).json({
          error: `Aucun outil trouvé pour le rôle "${role}"`,
          availableRoles: Object.keys(STATIC_AGENT_REGISTRY),
        });
      }
      
      return res.json({
        success: true,
        role,
        tools,
        count: tools.length,
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  return router;
}
