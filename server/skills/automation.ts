import { Skill, validateArgs } from "./base";
import { z } from "zod";
import {
  createWorkflow, executeWorkflow, deleteWorkflow, toggleWorkflow,
  listWorkflows, getWorkflow,
  createWorkflowSchema, runWorkflowSchema, deleteWorkflowSchema, toggleWorkflowSchema
} from "./workflow";

import {
  handleNavigate, handleClick, handleType, handleExtract,
  handleMusicSearch, handleSearch, handleSnapshot, handleInspect, handleClose
} from "./automationBrowser";

import {
  ScheduledTaskDefinition,
  getScheduledTasksSnapshot, getScheduledTask, loadScheduledTasks,
  pauseScheduledTask, resumeScheduledTask, runScheduledTaskNow,
  cancelScheduledTask, stopAllScheduledTasks, setSchedulerSkillHandler,
  handleScheduleTask, handleListScheduledTasks, handleCancelScheduledTask
} from "./automationScheduler";

// Re-exports publics pour garantir la compatibilité avec server.ts et les tests
export type { ScheduledTaskDefinition };
export {
  getScheduledTasksSnapshot, getScheduledTask, loadScheduledTasks,
  pauseScheduledTask, resumeScheduledTask, runScheduledTaskNow,
  cancelScheduledTask, stopAllScheduledTasks
};
export { getWorkflowsSnapshot, loadWorkflows as loadWorkflowsFromDb } from "./workflow";

const selectorSchema = z.string().min(1, "Sélecteur requis").trim();

export const automationSkill: Skill = {
    name: "automation",
    declarations: [
        {
            name: "automation_navigate",
            description: "Ouvre le navigateur et navigue vers une URL. Retourne le titre et le texte de la page.",
            parameters: {
                type: "OBJECT",
                properties: {
                    url: { type: "STRING", description: "L'URL à visiter" }
                },
                required: ["url"]
            }
        },
        {
            name: "automation_click",
            description: "Clique sur un élément de la page actuelle (sélecteur CSS) et attend un peu.",
            parameters: {
                type: "OBJECT",
                properties: {
                    selector: { type: "STRING", description: "Le sélecteur CSS de l'élément à cliquer" }
                },
                required: ["selector"]
            }
        },
        {
            name: "automation_type",
            description: "Saisit du texte dans un champ de formulaire de la page actuelle.",
            parameters: {
                type: "OBJECT",
                properties: {
                    selector: { type: "STRING", description: "Le sélecteur CSS du champ texte" },
                    text: { type: "STRING", description: "Le texte à taper" },
                    pressEnter: { type: "BOOLEAN", description: "Appuyer sur Entrée après la saisie ?" }
                },
                required: ["selector", "text"]
            }
        },
        {
            name: "automation_extract",
            description: "Extrait le contenu texte de la page actuelle, ou d'un sélecteur spécifique.",
            parameters: {
                type: "OBJECT",
                properties: {
                    selector: { type: "STRING", description: "Optionnel. Le sélecteur CSS. Par défaut, extrait tout le body." }
                }
            }
        },
        {
            name: "automation_music_search",
            description: "Recherche d'informations sur un artiste/album/chanson via recherche web avec focus sur la musique.",
            parameters: {
                type: "OBJECT",
                properties: {
                    query: { type: "STRING", description: "L'artiste, chanson ou album à rechercher" }
                },
                required: ["query"]
            }
        },
        {
            name: "automation_search",
            description: "Effectue une recherche web générale (DuckDuckGo) et retourne les premiers résultats.",
            parameters: {
                type: "OBJECT",
                properties: {
                    query: { type: "STRING", description: "La requête de recherche" }
                },
                required: ["query"]
            }
        },
        {
            name: "automation_snapshot",
            description: "Retourne un instantané HTML compact des éléments interactifs de la page actuelle (inputs, boutons, selects) avec leurs sélecteurs CSS utilisables. À utiliser AVANT automation_type ou automation_click sur un nouveau site pour obtenir les vrais sélecteurs.",
            parameters: {
                type: "OBJECT",
                properties: {}
            }
        },
        {
            name: "automation_inspect",
            description: "Inspecte la page actuelle pour lister les éléments cliquables (boutons, liens) et les champs de formulaire disponibles.",
            parameters: {
                type: "OBJECT",
                properties: {
                    type: { type: "STRING", description: "Type d'éléments à inspecter: 'buttons', 'inputs', 'links' ou 'all'" }
                }
            }
        },
        {
            name: "automation_close",
            description: "Ferme le navigateur automatisé.",
            parameters: { type: "OBJECT", properties: {} }
        },
        {
            name: "automation_schedule_task",
            description: "Planifie une tâche d'automatisation en arrière-plan et l'exécute périodiquement.",
            parameters: {
                type: "OBJECT",
                properties: {
                    name: { type: "STRING", description: "Nom de la tâche planifiée" },
                    description: { type: "STRING", description: "Description courte de la tâche" },
                    actionName: { type: "STRING", description: "Nom de l'action d'automatisation à exécuter (ex: automation_search, automation_navigate, automation_extract)" },
                    args: { type: "OBJECT", description: "Arguments passés à l'action" },
                    intervalSeconds: { type: "NUMBER", description: "Intervalle en secondes" },
                    intervalMinutes: { type: "NUMBER", description: "Intervalle en minutes" },
                    intervalHours: { type: "NUMBER", description: "Intervalle en heures" },
                    interval: { type: "STRING", description: "Intervalle au format 30s, 5m ou 1h" }
                },
                required: ["name", "actionName"]
            }
        },
        {
            name: "automation_list_scheduled_tasks",
            description: "Liste les tâches d'automatisation planifiées actuellement actives.",
            parameters: { type: "OBJECT", properties: {} }
        },
        {
            name: "automation_cancel_scheduled_task",
            description: "Annule une tâche planifiée précédemment enregistrée.",
            parameters: {
                type: "OBJECT",
                properties: {
                    taskId: { type: "STRING", description: "Identifiant de la tâche à annuler" }
                },
                required: ["taskId"]
            }
        },
        // ── Workflow (chaînes d'actions) ───────────────────────────────────────
        {
            name: "workflow_create",
            description: "Crée un workflow (chaîne d'actions/pipeline). Enchaîne plusieurs skills séquentiellement avec passage de résultats entre étapes via des templates ({{prev.result}}, {{steps.ID.result}}). Peut être planifié avec un intervalle.",
            parameters: {
                type: "OBJECT",
                properties: {
                    name: { type: "STRING", description: "Nom du workflow" },
                    description: { type: "STRING", description: "Description du workflow" },
                    steps: {
                        type: "ARRAY",
                        description: "Liste ordonnée des étapes du workflow",
                        items: {
                            type: "OBJECT",
                            properties: {
                                id: { type: "STRING", description: "Identifiant unique de l'étape (utilisé pour référencer ses résultats)" },
                                action: { type: "STRING", description: "Nom de l'action/skill à exécuter (ex: github_list_prs, memory_store, automation_search)" },
                                args: { type: "OBJECT", description: "Arguments pour l'action. Supporte {{prev.result}}, {{steps.STEP_ID.result}}" },
                                label: { type: "STRING", description: "Nom lisible de l'étape (optionnel)" },
                                condition: { type: "STRING", description: "Condition JS pour exécuter l'étape (ex: prev.status === 'success')" },
                                onError: { type: "STRING", description: "Comportement en cas d'échec: 'stop' (défaut), 'skip', 'retry'" },
                                maxRetries: { type: "NUMBER", description: "Nombre max de tentatives si onError='retry' (défaut: 2)" }
                            },
                            required: ["id", "action"]
                        }
                    },
                    schedule: { type: "STRING", description: "Intervalle de planification (ex: '24h', '30m', '1h'). Omis = exécution manuelle uniquement." }
                },
                required: ["name", "steps"]
            }
        },
        {
            name: "workflow_run",
            description: "Exécute immédiatement un workflow existant et retourne les résultats de chaque étape.",
            parameters: {
                type: "OBJECT",
                properties: {
                    workflowId: { type: "STRING", description: "ID du workflow à exécuter" }
                },
                required: ["workflowId"]
            }
        },
        {
            name: "workflow_list",
            description: "Liste tous les workflows enregistrés avec leur statut et historique d'exécution.",
            parameters: { type: "OBJECT", properties: {} }
        },
        {
            name: "workflow_delete",
            description: "Supprime un workflow et annule sa planification éventuelle.",
            parameters: {
                type: "OBJECT",
                properties: {
                    workflowId: { type: "STRING", description: "ID du workflow à supprimer" }
                },
                required: ["workflowId"]
            }
        },
        {
            name: "workflow_toggle",
            description: "Active ou désactive un workflow planifié.",
            parameters: {
                type: "OBJECT",
                properties: {
                    workflowId: { type: "STRING", description: "ID du workflow" },
                    enabled: { type: "BOOLEAN", description: "true pour activer, false pour désactiver" }
                },
                required: ["workflowId", "enabled"]
            }
        },
    ],
    inputSchemas: {
        "automation_navigate": z.object({
            url: z.string().url("URL invalide").trim()
        }),
        "automation_click": z.object({
            selector: selectorSchema
        }),
        "automation_type": z.object({
            selector: selectorSchema,
            text: z.string().min(1, "Texte requis"),
            pressEnter: z.boolean().optional().default(false)
        }),
        "automation_extract": z.object({
            selector: z.string().trim().optional().default('body')
        }),
        "automation_music_search": z.object({
            query: z.string().min(1, "Requête requise").trim()
        }),
        "automation_search": z.object({
            query: z.string().min(1, "Requête requise").trim()
        }),
        "automation_snapshot": z.object({}),
        "automation_inspect": z.object({
            type: z.enum(['buttons', 'inputs', 'links', 'all']).optional().default('all')
        }),
        "automation_close": z.object({}),
        "automation_schedule_task": z.object({
            name: z.string().min(1, "Nom requis").trim(),
            description: z.string().optional().default('Tâche planifiée'),
            actionName: z.string().min(1, "Action requise"),
            args: z.record(z.unknown()).optional().default({}),
            intervalSeconds: z.number().int().positive().optional(),
            intervalMinutes: z.number().int().positive().optional(),
            intervalHours: z.number().int().positive().optional(),
            interval: z.string().trim().optional()
        }).refine(args => args.intervalSeconds || args.intervalMinutes || args.intervalHours || args.interval, {
            message: "Un intervalle est requis"
        }),
        "automation_list_scheduled_tasks": z.object({}),
        "automation_cancel_scheduled_task": z.object({
            taskId: z.string().min(1, "ID requis")
        }),
        // Workflow schemas
        "workflow_create": createWorkflowSchema,
        "workflow_run": runWorkflowSchema,
        "workflow_list": z.object({}),
        "workflow_delete": deleteWorkflowSchema,
        "workflow_toggle": toggleWorkflowSchema,
    },

    handleToolCall: async (name, args) => {
        try {
            if (name === "automation_navigate") {
                const validated = validateArgs(automationSkill.inputSchemas!["automation_navigate"], args);
                return await handleNavigate(validated);
            }

            if (name === "automation_click") {
                const validated = validateArgs(automationSkill.inputSchemas!["automation_click"], args);
                return await handleClick(validated);
            }

            if (name === "automation_type") {
                const validated = validateArgs(automationSkill.inputSchemas!["automation_type"], args);
                return await handleType(validated);
            }

            if (name === "automation_extract") {
                const validated = validateArgs(automationSkill.inputSchemas!["automation_extract"], args);
                return await handleExtract(validated);
            }

            if (name === "automation_music_search") {
                const validated = validateArgs(automationSkill.inputSchemas!["automation_music_search"], args);
                return await handleMusicSearch(validated);
            }

            if (name === "automation_search") {
                const validated = validateArgs(automationSkill.inputSchemas!["automation_search"], args);
                return await handleSearch(validated);
            }

            if (name === "automation_snapshot") {
                validateArgs(automationSkill.inputSchemas!["automation_snapshot"], args);
                return await handleSnapshot();
            }

            if (name === "automation_inspect") {
                const validated = validateArgs(automationSkill.inputSchemas!["automation_inspect"], args);
                return await handleInspect(validated);
            }

            if (name === "automation_close") {
                validateArgs(automationSkill.inputSchemas!["automation_close"], args);
                return await handleClose();
            }

            if (name === "automation_schedule_task") {
                const validated = validateArgs(automationSkill.inputSchemas!["automation_schedule_task"], args);
                return await handleScheduleTask(validated);
            }

            if (name === "automation_list_scheduled_tasks") {
                validateArgs(automationSkill.inputSchemas!["automation_list_scheduled_tasks"], args);
                return await handleListScheduledTasks();
            }

            if (name === "automation_cancel_scheduled_task") {
                const validated = validateArgs(automationSkill.inputSchemas!["automation_cancel_scheduled_task"], args);
                return await handleCancelScheduledTask(validated);
            }

            // ── Workflow handlers ──────────────────────────────────────────────
            if (name === "workflow_create") {
                const validated = validateArgs(automationSkill.inputSchemas!["workflow_create"], args);
                const workflow = await createWorkflow(validated);
                return {
                    status: "success",
                    workflowId: workflow.id,
                    name: workflow.name,
                    stepsCount: workflow.steps.length,
                    scheduled: workflow.schedule || null,
                    message: `Workflow "${workflow.name}" créé avec ${workflow.steps.length} étape(s).${workflow.schedule ? ` Planifié toutes les ${workflow.schedule}.` : ""}`
                };
            }

            if (name === "workflow_run") {
                const validated = validateArgs(automationSkill.inputSchemas!["workflow_run"], args);
                const wf = getWorkflow(validated.workflowId);
                if (!wf) {
                    return { error: `Workflow ${validated.workflowId} introuvable.` };
                }
                const result = await executeWorkflow(wf);
                return {
                    status: "success",
                    result
                };
            }

            if (name === "workflow_list") {
                validateArgs(automationSkill.inputSchemas!["workflow_list"], args);
                const allWorkflows = listWorkflows();
                return {
                    status: "success",
                    count: allWorkflows.length,
                    workflows: allWorkflows.map(wf => ({
                        id: wf.id,
                        name: wf.name,
                        description: wf.description,
                        stepsCount: wf.steps.length,
                        schedule: wf.schedule || null,
                        enabled: wf.enabled,
                        lastRunAt: wf.lastRunAt ? new Date(wf.lastRunAt).toISOString() : null,
                        lastRunStatus: wf.lastRunStatus || null,
                    }))
                };
            }

            if (name === "workflow_delete") {
                const validated = validateArgs(automationSkill.inputSchemas!["workflow_delete"], args);
                const deleted = await deleteWorkflow(validated.workflowId);
                return {
                    status: deleted ? "success" : "not_found",
                    message: deleted ? `Workflow ${validated.workflowId} supprimé.` : `Workflow ${validated.workflowId} introuvable.`
                };
            }

            if (name === "workflow_toggle") {
                const validated = validateArgs(automationSkill.inputSchemas!["workflow_toggle"], args);
                const updated = await toggleWorkflow(validated.workflowId, validated.enabled);
                if (!updated) {
                    return { error: `Workflow ${validated.workflowId} introuvable.` };
                }
                return {
                    status: "success",
                    enabled: updated.enabled,
                    message: `Workflow "${updated.name}" ${updated.enabled ? "activé" : "désactivé"}.`
                };
            }

            return { error: `Outil inconnu: ${name}` };
        } catch (e: any) {
            console.error("[Automation] Erreur:", e);
            return { error: `Erreur d'automatisation: ${e.message}` };
        }
    }
};

// Enregistrement du skill handler pour le planificateur de tâches
setSchedulerSkillHandler((name, args) => automationSkill.handleToolCall(name, args));