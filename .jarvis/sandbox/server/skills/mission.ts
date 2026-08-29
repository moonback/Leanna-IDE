import { Skill, validateArgs } from "./base";
import { z } from "zod";
import { Executor, reflectionEngine } from "../mission";

// ═══════════════════════════════════════════════════════════════════════════════
// Skill Mission — Interface IA ↔ Mission System
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Expose le Mission System à l'IA comme un skill invocable.
 * Permet à Gemini de:
 * - Créer des missions (objectifs de haut niveau)
 * - Consulter l'état d'une mission
 * - Lister les missions actives
 * - Annuler une mission
 *
 * Le système est conçu pour être utilisé quand une tâche est complexe
 * et nécessite une planification multi-étapes avec suivi.
 */

/** Instance globale de l'Executor (initialisée par le SkillManager) */
let executor: Executor | null = null;

/** Référence vers les skills disponibles (injectée au démarrage) */
let availableSkillNames: string[] = [];

/**
 * Configure l'executor du Mission System.
 * Appelé par le SkillManager au démarrage.
 */
export function initMissionSystem(exec: Executor, skills: string[]): void {
  executor = exec;
  availableSkillNames = skills;
  console.log(`[MissionSkill] ✓ Mission System initialisé (${skills.length} skills disponibles)`);
}

/**
 * Met à jour la liste des skills disponibles.
 */
export function updateMissionSkills(skills: string[]): void {
  availableSkillNames = skills;
}

export const missionSkill: Skill = {
  name: "mission",
  declarations: [
    {
      name: "mission_create",
      description: `Crée une nouvelle mission autonome. Utilise cet outil quand l'utilisateur demande une tâche complexe qui nécessite plusieurs étapes (créer une fonctionnalité, corriger un bug complexe, refactorer un module, etc.). La mission sera automatiquement décomposée en sous-objectifs, planifiée et exécutée avec vérification continue. NE PAS utiliser pour des questions simples ou des commandes en une étape.`,
      parameters: {
        type: "OBJECT",
        properties: {
          title: {
            type: "STRING",
            description: "Titre court de la mission (ex: 'Ajouter l'authentification JWT')",
          },
          description: {
            type: "STRING",
            description: "Description détaillée de ce qui doit être accompli, incluant le contexte et les contraintes",
          },
          priority: {
            type: "STRING",
            description: "Priorité: low, medium, high, critical",
            enum: ["low", "medium", "high", "critical"],
          },
        },
        required: ["title", "description"],
      },
    },
    {
      name: "mission_status",
      description: "Consulte l'état détaillé d'une mission en cours: progression, objectif actif, confiance, erreurs.",
      parameters: {
        type: "OBJECT",
        properties: {
          missionId: {
            type: "STRING",
            description: "ID de la mission à consulter",
          },
        },
        required: ["missionId"],
      },
    },
    {
      name: "mission_list",
      description: "Liste toutes les missions actives et récemment complétées.",
      parameters: {
        type: "OBJECT",
        properties: {},
      },
    },
    {
      name: "mission_cancel",
      description: "Annule une mission en cours.",
      parameters: {
        type: "OBJECT",
        properties: {
          missionId: {
            type: "STRING",
            description: "ID de la mission à annuler",
          },
        },
        required: ["missionId"],
      },
    },
    {
      name: "mission_reflect",
      description:
        "Génère un bilan complet de mission : leçons apprises, échecs, succès, tendance de confiance, boucles détectées. " +
        "Enregistre automatiquement les leçons importantes en mémoire projet (`knowledge_memory_add`). " +
        "À appeler à la fin d'une mission ou quand tu veux capitaliser sur ce qui s'est passé. " +
        "Si missionId est fourni, inclut le contexte de la mission dans le rapport.",
      parameters: {
        type: "OBJECT",
        properties: {
          missionId: {
            type: "STRING",
            description: "ID de la mission à analyser (optionnel — analyse le ReflectionEngine global si omis)",
          },
        },
      },
    },
  ],
  inputSchemas: {
    mission_create: z.object({
      title: z.string().min(1).trim(),
      description: z.string().min(1).trim(),
      priority: z.enum(["low", "medium", "high", "critical"]).optional().default("medium"),
    }),
    mission_status: z.object({
      missionId: z.string().min(1),
    }),
    mission_list: z.object({}),
    mission_cancel: z.object({
      missionId: z.string().min(1),
    }),
    mission_reflect: z.object({
      missionId: z.string().optional(),
    }),
  },

  handleToolCall: async (name: string, args: any) => {
    if (!executor) {
      return {
        error: "Mission System non initialisé. Le serveur doit être redémarré.",
      };
    }

    switch (name) {
      case "mission_create": {
        const { title, description, priority } = validateArgs(
          missionSkill.inputSchemas!["mission_create"],
          args
        );

        const mission = await executor.startMission({
          title,
          description,
          priority,
          availableSkills: availableSkillNames,
        });

        return {
          missionId: mission.id,
          title: mission.getState().title,
          status: mission.status,
          message: `Mission créée et lancée. L'exécution est en cours en arrière-plan. Utilise mission_status pour suivre la progression.`,
          summary: mission.toContextSummary(),
        };
      }

      case "mission_status": {
        const { missionId } = validateArgs(
          missionSkill.inputSchemas!["mission_status"],
          args
        );

        const mission = executor.getMission(missionId);
        if (!mission) {
          // Chercher dans les complétées
          const completed = executor
            .listCompletedMissions()
            .find((m) => m.id === missionId);
          if (completed) {
            return {
              missionId,
              status: completed.status,
              summary: completed.toContextSummary(),
              metrics: completed.getMetrics(),
              completed: true,
            };
          }
          return { error: `Mission ${missionId} non trouvée.` };
        }

        return {
          missionId,
          status: mission.status,
          summary: mission.toContextSummary(),
          metrics: mission.getMetrics(),
          context: {
            errors: mission.getContext().errors.slice(-5),
            decisions: mission.getContext().decisions.slice(-5),
            hypotheses: mission.getContext().hypotheses.slice(-3),
          },
          activeGoal: mission.activeGoal
            ? {
                title: mission.activeGoal.title,
                status: mission.activeGoal.status,
                actions: mission.activeGoal.plannedActions.map((a) => ({
                  skill: a.skillName,
                  status: a.status,
                  score: a.score,
                })),
              }
            : null,
        };
      }

      case "mission_list": {
        const active = executor.listActiveMissions().map((m) => ({
          id: m.id,
          title: m.getState().title,
          status: m.status,
          priority: m.getState().priority,
          progress: m.toContextSummary(),
        }));

        const completed = executor
          .listCompletedMissions()
          .slice(-10)
          .map((m) => ({
            id: m.id,
            title: m.getState().title,
            status: m.status,
            completedAt: m.getState().completedAt,
          }));

        return {
          active,
          completed,
          total: active.length + completed.length,
        };
      }

      case "mission_cancel": {
        const { missionId } = validateArgs(
          missionSkill.inputSchemas!["mission_cancel"],
          args
        );

        const success = executor.cancelMission(missionId);
        return {
          success,
          message: success
            ? `Mission ${missionId} annulée.`
            : `Mission ${missionId} non trouvée ou déjà terminée.`,
        };
      }

      case "mission_reflect": {
        const { missionId } = validateArgs(
          missionSkill.inputSchemas!["mission_reflect"],
          args
        );

        // Récupère l'état de la mission si un ID est fourni
        let missionState: import("../mission/types").MissionState | undefined;
        if (missionId) {
          const mission =
            executor.getMission(missionId) ??
            executor.listCompletedMissions().find((m) => m.id === missionId);
          if (mission) {
            missionState = mission.getState();
            // Attache le moteur de réflexion à cette mission pour le rapport
            reflectionEngine.attachToMission(missionId);
          }
        }

        const summary = reflectionEngine.generateSummary(missionState);

        return {
          totalReflections: summary.totalReflections,
          successRate:
            summary.totalReflections > 0
              ? `${Math.round((summary.successfulActions / summary.totalReflections) * 100)}%`
              : "N/A",
          confidence: summary.confidence,
          loopsDetected: summary.loopsDetected.length,
          currentRisks: summary.currentRisks,
          lessonsCount: summary.lessons.length,
          lessons: summary.lessons.slice(0, 5).map((l) => ({
            type: l.type,
            description: l.description,
            recommendation: l.recommendation,
            importance: Math.round(l.importance * 100),
          })),
          markdownReport: summary.markdownReport,
          message:
            summary.lessons.length > 0
              ? `${summary.lessons.length} leçon(s) sauvegardée(s) en mémoire projet.`
              : "Aucune leçon significative extraite pour le moment.",
        };
      }

      default:
        throw new Error(`Outil mission inconnu: ${name}`);
    }
  },
};
