import { z } from "zod";
import { Skill, validateArgs } from "./base";
import {
  agentOrchestrator,
  agentMessageBus,
  COLLABORATION_PATTERNS,
  DELEGATION_MATRIX,
  listAgentDefinitions,
  delegateTaskSchema,
  orchestrateSchema,
  listAgentTasksSchema,
} from "../agents";
import type { AgentRole } from "../agents";

// ═══════════════════════════════════════════════════════════════════════════════
// Skill: Agents Multi-Rôles + Communication Autonome
// Permet à Leanna de déléguer, orchestrer, collaborer et monitorer les agents
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Schémas de validation ────────────────────────────────────────────────────

const collaborateSchema = z.object({
  patternName: z.enum(
    ["refactor-with-safety", "security-audit-full", "new-feature-complete"],
    {
      errorMap: () => ({
        message:
          "Pattern invalide. Utilise agent_list_collaboration_patterns pour voir les options.",
      }),
    }
  ),
  title: z.string().min(1, "Le titre est requis").trim(),
  description: z.string().min(1, "La description est requise").trim(),
  files: z.array(z.string()).optional().default([]),
  instructions: z.string().optional(),
});

// ─── Helper payload ───────────────────────────────────────────────────────────

function summarizePayload(payload: any): string {
  if (!payload || typeof payload !== "object") return String(payload);
  switch (payload.type) {
    case "task_request":
      return `task_request: "${payload.title}" → files: [${(payload.files ?? []).join(", ")}]`;
    case "task_response":
      return `task_response: ${payload.result?.success ? "✅" : "❌"} "${payload.result?.summary ?? ""}"`;
    case "collaboration_request":
      return `collaboration_request: "${payload.reason}"`;
    case "status_query":    return "status_query";
    case "status_response": return `status_response: ${payload.status} (${payload.currentTasks}/${payload.maxConcurrency})`;
    case "broadcast":       return `broadcast: "${payload.message}"`;
    case "event":           return `event: "${payload.eventType}"`;
    default:                return JSON.stringify(payload).slice(0, 100);
  }
}

export const agentsSkill: Skill = {
  name: "agents",
  declarations: [
    // ─── Outils existants ─────────────────────────────────────────────────────
    {
      name: "agent_delegate",
      description:
        "Délègue une tâche à UN agent spécialisé (test, docs, refactor, security, review, architect). " +
        "La tâche s'exécute en arrière-plan. Utilise \`agent_status\` avec le taskId retourné pour suivre la progression. " +
        "Pour plusieurs rôles simultanés, utilise agent_orchestrate. " +
        "Délégations automatiques recommandées : refactor terminé → test ; nouveau module → docs ; changement sensible → security.",
      parameters: {
        type: "OBJECT",
        properties: {
          role:        { type: "STRING", description: "Rôle UNIQUE parmi : test, docs, refactor, security, review, architect. Une seule valeur, jamais une liste." },
          title:       { type: "STRING", description: "Titre court de la tâche" },
          description: { type: "STRING", description: "Description détaillée" },
          files:       { type: "ARRAY", items: { type: "STRING" }, description: "Fichiers pertinents (optionnel)" },
          instructions:{ type: "STRING", description: "Instructions supplémentaires (optionnel)" },
          priority:    { type: "STRING", description: "Priorité : low, medium (défaut), high, critical" },
        },
        required: ["role", "title", "description"],
      },
    },
    {
      name: "agent_orchestrate",
      description:
        "Orchestre plusieurs agents en parallèle ou en séquence avec dépendances. " +
        "Chaque tâche dans la liste doit avoir un rôle UNIQUE ('docs', 'refactor', etc.) — jamais plusieurs rôles combinés dans une même tâche. " +
        "Pour des workflows prédéfinis, préfère agent_collaborate. " +
        "Retourne un orchestrationId : utilise agent_status avec cet ID pour suivre l'avancement global.",
      parameters: {
        type: "OBJECT",
        properties: {
          title:       { type: "STRING", description: "Titre du plan" },
          description: { type: "STRING", description: "Objectif global" },
          tasks: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                role:         { type: "STRING", description: "Rôle : test, docs, refactor, security, review ou architect. Alias contrôlés : analyse, analyze, audit, investigation, diagnostic → review." },
                title:        { type: "STRING", description: "Titre de la sous-tâche" },
                description:  { type: "STRING", description: "Description détaillée" },
                files:        { type: "ARRAY", items: { type: "STRING" }, description: "Fichiers pertinents" },
                instructions: { type: "STRING", description: "Instructions supplémentaires" },
                priority:     { type: "STRING", description: "Priorité" },
                dependsOn:    { type: "ARRAY", items: { type: "STRING" }, description: "IDs des tâches prérequises" },
              },
              required: ["role", "title", "description"],
            },
            description: "Liste des tâches",
          },
        },
        required: ["title", "description", "tasks"],
      },
    },
    {
      name: "agent_status",
      description:
        "Consulte le statut d'une tâche ou d'une orchestration par son ID. " +
        "Utilise agent_status pour toute question de progression, d'état, d'avancement ou de suivi avant de lancer de nouvelles délégations. " +
        "Accepte indifféremment un taskId (retourné par agent_delegate) ou un orchestrationId (retourné par agent_orchestrate / agent_collaborate). " +
        "C'est la seule commande correcte pour interroger l'état d'une exécution en cours.",
      parameters: {
        type: "OBJECT",
        properties: { taskId: { type: "STRING", description: "ID de la tâche ou orchestration" } },
        required: ["taskId"],
      },
    },
    {
      name: "agent_list_tasks",
      description: "Liste les tâches déléguées avec filtres optionnels.",
      parameters: {
        type: "OBJECT",
        properties: {
          role:   { type: "STRING", description: "Filtrer par rôle (optionnel)" },
          status: { type: "STRING", description: "Filtrer par statut : pending, running, completed, failed, cancelled" },
          limit:  { type: "NUMBER", description: "Nombre max (défaut: 20)" },
        },
        required: [],
      },
    },
    {
      name: "agent_list_roles",
      description: "Liste tous les agents disponibles avec leurs capacités.",
      parameters: { type: "OBJECT", properties: {}, required: [] },
    },
    {
      name: "agent_cancel",
      description: "Annule une tâche en attente (statut 'pending').",
      parameters: {
        type: "OBJECT",
        properties: { taskId: { type: "STRING", description: "ID de la tâche à annuler" } },
        required: ["taskId"],
      },
    },
    {
      name: "agent_stats",
      description: "Statistiques globales : tâches par statut, par rôle, orchestrations actives.",
      parameters: { type: "OBJECT", properties: {}, required: [] },
    },

    // ─── Nouveaux outils autonomes ────────────────────────────────────────────
    {
      name: "agent_collaborate",
      description:
        "Lance une collaboration structurée entre agents selon un pattern prédéfini. " +
        "Les agents communiquent entre eux via le bus de messages et se délèguent des " +
        "sous-tâches de manière autonome. " +
        "Patterns disponibles : " +
        "'refactor-with-safety' (test→refactor→test→review), " +
        "'security-audit-full' (security→refactor→test→security), " +
        "'new-feature-complete' (architect→refactor→test+docs→review). " +
        "Utilise agent_list_collaboration_patterns pour voir les détails.",
      parameters: {
        type: "OBJECT",
        properties: {
          patternName: {
            type: "STRING",
            description:
              "Pattern : 'refactor-with-safety', 'security-audit-full', 'new-feature-complete'",
          },
          title:       { type: "STRING", description: "Titre court de l'objectif" },
          description: { type: "STRING", description: "Description détaillée partagée avec tous les agents" },
          files:       { type: "ARRAY", items: { type: "STRING" }, description: "Fichiers concernés (optionnel)" },
          instructions:{ type: "STRING", description: "Instructions supplémentaires pour tous les agents (optionnel)" },
        },
        required: ["patternName", "title", "description"],
      },
    },
    {
      name: "agent_fleet_status",
      description:
        "État de santé de la flotte d'agents autonomes : agents en ligne, occupés, " +
        "surchargés ; métriques du bus de messages. À utiliser avant de déléguer " +
        "pour vérifier la disponibilité.",
      parameters: { type: "OBJECT", properties: {}, required: [] },
    },
    {
      name: "agent_list_collaboration_patterns",
      description:
        "Liste les patterns de collaboration disponibles avec leur description, " +
        "participants et étapes. À utiliser avant agent_collaborate.",
      parameters: { type: "OBJECT", properties: {}, required: [] },
    },
    {
      name: "agent_delegation_matrix",
      description:
        "Affiche la matrice de délégation autonome : quels agents peuvent confier " +
        "des sous-tâches à quels autres agents, et pour quels types de travaux.",
      parameters: { type: "OBJECT", properties: {}, required: [] },
    },
    {
      name: "agent_bus_metrics",
      description:
        "Métriques du bus de messages inter-agents : messages échangés, taux de succès, " +
        "répartition par type et par agent. Pour diagnostiquer la communication entre agents.",
      parameters: { type: "OBJECT", properties: {}, required: [] },
    },
    {
      name: "agent_message_history",
      description:
        "Historique des messages récents échangés entre agents : qui a délégué quoi " +
        "à qui, quand, et avec quelle priorité. Pour tracer les délégations autonomes.",
      parameters: {
        type: "OBJECT",
        properties: {
          limit: { type: "NUMBER", description: "Nombre de messages (défaut: 20, max: 100)" },
        },
        required: [],
      },
    },
  ],

  inputSchemas: {
    agent_delegate:                   delegateTaskSchema,
    agent_orchestrate:                orchestrateSchema,
    agent_status:                     z.object({ taskId: z.string().min(1) }),
    agent_list_tasks:                 listAgentTasksSchema,
    agent_list_roles:                 z.object({}),
    agent_cancel:                     z.object({ taskId: z.string().min(1) }),
    agent_stats:                      z.object({}),
    agent_collaborate:                collaborateSchema,
    agent_fleet_status:               z.object({}),
    agent_list_collaboration_patterns:z.object({}),
    agent_delegation_matrix:          z.object({}),
    agent_bus_metrics:                z.object({}),
    agent_message_history:            z.object({
      limit: z.number().int().min(1).max(100).optional().default(20),
    }),
  },

  async handleToolCall(name: string, args: any): Promise<any> {
    console.log(`[AgentsSkill] 🔧 ${name} — ${JSON.stringify(args).slice(0, 120)}`);

    switch (name) {

      // ── Outils existants ─────────────────────────────────────────────────

      case "agent_delegate": {
        const v = validateArgs(delegateTaskSchema, args);
        const task = await agentOrchestrator.delegateTask({
          role: v.role as AgentRole, title: v.title!, description: v.description!,
          files: v.files, instructions: v.instructions,
          priority: v.priority, timeoutMs: v.timeoutMs,
        });
        console.log(`[AgentsSkill]   ✓ Tâche créée: ${task.id}`);
        return {
          success: true,
          message: `Tâche déléguée à l'agent "${v.role}".`,
          taskId: task.id, role: task.role, title: task.title, status: task.status,
          hint: `Utilise agent_status avec "${task.id}" pour suivre la progression.`,
        };
      }

      case "agent_orchestrate": {
        const v = validateArgs(orchestrateSchema, args);
        const plan = await agentOrchestrator.orchestrate({
          title: v.title!, description: v.description!,
          tasks: v.tasks!.map((t) => ({
            role: t.role as AgentRole, title: t.title!, description: t.description!,
            files: t.files, instructions: t.instructions,
            priority: t.priority, dependsOn: t.dependsOn,
          })),
        });
        console.log(`[AgentsSkill]   ✓ Orchestration: ${plan.id} (${plan.tasks.length} tâches)`);
        return {
          success: true,
          message: `Orchestration "${v.title}" lancée avec ${v.tasks.length} tâche(s).`,
          orchestrationId: plan.id, taskCount: plan.tasks.length,
          tasks: plan.tasks.map((t) => ({ id: t.id, role: t.role, title: t.title, status: t.status })),
          hint: `Utilise agent_status avec "${plan.id}" pour suivre l'orchestration.`,
        };
      }

      case "agent_status": {
        const { taskId } = validateArgs(z.object({ taskId: z.string().min(1) }), args);
        const task = agentOrchestrator.getTask(taskId);
        if (task) {
          return {
            type: "task", id: task.id, role: task.role, title: task.title,
            status: task.status, priority: task.priority,
            createdAt: task.createdAt, startedAt: task.startedAt, completedAt: task.completedAt,
            result: task.result ?? null,
          };
        }
        const orch = agentOrchestrator.getOrchestration(taskId);
        if (orch) {
          return {
            type: "orchestration", id: orch.id, title: orch.title,
            status: orch.status, createdAt: orch.createdAt, completedAt: orch.completedAt,
            tasks: orch.tasks.map((t) => ({
              id: t.id, role: t.role, title: t.title, status: t.status,
              result: t.result ? { success: t.result.success, summary: t.result.summary } : null,
            })),
          };
        }
        throw new Error(`Aucune tâche ou orchestration trouvée avec l'ID "${taskId}".`);
      }

      case "agent_list_tasks": {
        const v = validateArgs(listAgentTasksSchema, args);
        const tasks = agentOrchestrator.listTasks({ ...v, role: v.role as AgentRole | undefined });
        return {
          count: tasks.length,
          tasks: tasks.map((t) => ({
            id: t.id, role: t.role, title: t.title,
            status: t.status, priority: t.priority,
            createdAt: t.createdAt, completedAt: t.completedAt,
            hasResult: !!t.result,
            delegatedSubTasks: t.result?.delegatedSubTasks ?? [],
          })),
        };
      }

      case "agent_list_roles": {
        const agents = listAgentDefinitions();
        return {
          count: agents.length,
          agents: agents.map((a) => ({
            role: a.role, name: a.name, description: a.description,
            capabilities: a.capabilities,
            maxConcurrency: a.maxConcurrency, defaultTimeoutMs: a.defaultTimeoutMs,
          })),
        };
      }

      case "agent_cancel": {
        const { taskId } = validateArgs(z.object({ taskId: z.string().min(1) }), args);
        const ok = agentOrchestrator.cancelTask(taskId);
        if (!ok) throw new Error(`Impossible d'annuler "${taskId}" — inexistante ou non-pending.`);
        return { success: true, message: `Tâche "${taskId}" annulée.` };
      }

      case "agent_stats": {
        const stats = agentOrchestrator.getStats();
        console.log(`[AgentsSkill]   Total: ${stats.totalTasks} | Running: ${stats.byStatus.running} | Done: ${stats.byStatus.completed}`);
        return stats;
      }

      // ── Nouveaux outils autonomes ────────────────────────────────────────

      case "agent_collaborate": {
        const v = validateArgs(collaborateSchema, args);
        const pattern = COLLABORATION_PATTERNS.find((p) => p.name === v.patternName)!;
        console.log(`[AgentsSkill]   Pattern: "${pattern.name}" — agents: ${pattern.participants.join(", ")}`);

        const plan = await agentOrchestrator.collaborateByPattern({
          patternName: v.patternName,
          context: {
            title: v.title, description: v.description,
            files: v.files, instructions: v.instructions,
          },
        });

        console.log(`[AgentsSkill]   ✓ Collaboration: ${plan.id} (${plan.tasks.length} étapes)`);
        return {
          success: true,
          message:
            `Collaboration "${pattern.name}" lancée pour "${v.title}". ` +
            `${plan.tasks.length} étape(s) avec les agents : ${pattern.participants.join(", ")}.`,
          orchestrationId: plan.id,
          patternName: pattern.name,
          patternDescription: pattern.description,
          participants: pattern.participants,
          taskCount: plan.tasks.length,
          steps: plan.tasks.map((t, i) => ({
            step: i + 1, id: t.id, agent: t.role, title: t.title, status: t.status,
          })),
          hint: `Utilise agent_status avec "${plan.id}" pour suivre la progression.`,
        };
      }

      case "agent_fleet_status": {
        const fleet = agentOrchestrator.getFleetStatus() as any;
        if (!fleet?.initialized) {
          return {
            initialized: false,
            message: "Flotte non initialisée — elle démarre à la première délégation.",
            hint: "Lance agent_delegate ou agent_collaborate pour démarrer.",
          };
        }
        console.log(`[AgentsSkill]   Flotte: ${fleet.onlineAgents}/${fleet.totalAgents} en ligne`);
        return {
          initialized: true,
          summary: {
            totalAgents: fleet.totalAgents,
            online: fleet.onlineAgents,
            idle: fleet.idleAgents,
            busy: fleet.busyAgents,
            overloaded: fleet.overloadedAgents,
          },
          agents: fleet.agents,
          busMetrics: fleet.busMetrics,
          recommendation:
            fleet.overloadedAgents > 0
              ? `⚠️ ${fleet.overloadedAgents} agent(s) surchargé(s) — attends avant de déléguer davantage.`
              : fleet.idleAgents === fleet.totalAgents
              ? "✅ Tous les agents sont disponibles."
              : `✅ ${fleet.idleAgents} agent(s) libre(s) sur ${fleet.totalAgents}.`,
        };
      }

      case "agent_list_collaboration_patterns": {
        return {
          count: COLLABORATION_PATTERNS.length,
          patterns: COLLABORATION_PATTERNS.map((p) => ({
            name: p.name,
            description: p.description,
            participants: p.participants,
            stepCount: p.workflow.length,
            workflow: p.workflow.map((s) => ({
              step: s.step, agent: s.agent, action: s.action,
              dependsOn: s.dependsOn ?? [],
            })),
          })),
          usage: "Utilise agent_collaborate avec le champ 'name' du pattern souhaité.",
        };
      }

      case "agent_delegation_matrix": {
        const entries = Object.entries(DELEGATION_MATRIX).map(([from, targets]) => ({
          agent: from,
          canDelegateTo: targets.map((t) => ({
            targetAgent: t.targetRole,
            taskTypes: t.taskTypes,
            reason: t.reason,
          })),
        }));
        return {
          description:
            "Délégations autonomes déclenchées automatiquement quand un agent " +
            "inclut un bloc ## DÉLÉGATION dans sa sortie.",
          matrix: entries,
          totalPaths: entries.reduce((acc, e) => acc + e.canDelegateTo.length, 0),
        };
      }

      case "agent_bus_metrics": {
        const m = agentMessageBus.getMetrics();
        return {
          ...m,
          successRatePercent: Math.round(m.successRate * 100),
          status:
            m.successRate >= 0.95 ? "✅ Excellent" :
            m.successRate >= 0.80 ? "⚠️ Dégradé"  : "❌ Problèmes détectés",
          interpretation: {
            totalMessages: `${m.totalMessages} message(s) depuis le démarrage`,
            pendingRequests:
              m.pendingRequests > 0
                ? `${m.pendingRequests} requête(s) en attente de réponse`
                : "Aucune requête en attente",
            activeSubscriptions: `${m.activeSubscriptions} subscription(s) actives`,
          },
        };
      }

      case "agent_message_history": {
        const { limit } = validateArgs(
          z.object({ limit: z.number().int().min(1).max(100).optional().default(20) }),
          args
        );
        const messages = agentMessageBus.getHistory(limit);
        return {
          count: messages.length,
          messages: messages.map((m) => ({
            id: m.id.slice(0, 8),
            type: m.type,
            from: m.from,
            to: m.to,
            priority: m.priority,
            timestamp: m.timestamp,
            summary: summarizePayload(m.payload),
            hasCorrelation: !!m.correlationId,
            isAutonomous: m.metadata?.autonomous === true,
          })),
          hint:
            messages.length === 0
              ? "Aucun message. Lance agent_collaborate pour voir le bus en action."
              : `${messages.length} message(s). Les 'isAutonomous: true' sont des délégations entre agents.`,
        };
      }

      default:
        throw new Error(`Outil inconnu: ${name}`);
    }
  },
};
