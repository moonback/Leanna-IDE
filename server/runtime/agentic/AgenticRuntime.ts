/**
 * AgenticRuntime — La boucle agentique qui transforme Leanna en agent.
 *
 * Remplace le flux linéaire « User → Router → Agent → LLM → Response » par une
 * vraie boucle :
 *
 *   User → Intent/Task Analyzer → Planner → Execution Engine
 *          ┌──────────────────────────────────────────────┐
 *          │  Tool call → Observation → Reasoning →        │
 *          │  Next action → Verification                   │
 *          └──────────────────────────────────────────────┘
 *          → Finalizer → User
 *
 * Différence fondamentale avec l'ancien `AgentExecutor` : ici l'agent reçoit
 * RÉELLEMENT ses outils. On lit ses `capabilities` déclarées, on les résout
 * contre le `ToolRegistry`, on expose la liste au modèle, et on exécute chaque
 * appel via `registry.call()` (qui applique permissions, dry-run, timeout et
 * métriques). Les `capabilities` ne sont plus décoratives.
 *
 * Toute la boucle est bornée par un `AgentBudget` configurable :
 * maxIterations, maxToolCalls, maxExecutionTimeMs, maxRetries, maxCost.
 */

import { randomUUID } from "crypto";
import type { ToolRegistry } from "../ToolRegistry.js";
import type { EventBus } from "../EventBus.js";
import type { ToolDeclaration } from "../types.js";
import { getAgentDefinitionOrThrow, hasAgent } from "../../agents/roles.js";
import type { AgentDefinition } from "../../agents/types.js";
import { extractToolCalls } from "../../agents/ToolCallParser.js";
import { WorkspaceState, type VerificationRecord } from "../../agents/WorkspaceState.js";
import { AgentRepairLoop, type RepairDirective } from "../../agents/AgentRepairLoop.js";
import { generateText, type GenerateTextResult } from "../../utils/textGeneration.js";
import { createLogger } from "../../utils/logger.js";
import {
  resolveAgentTools,
  buildToolSection,
  buildBudgetSection,
  buildObservationHistory,
} from "./ToolPromptBuilder.js";
import { buildPhaseGuidance } from "../../agents/phasePrompts.js";
import {
  DEFAULT_AGENT_BUDGET,
  emptyBudgetUsage,
  normalizeBudget,
  type AgentBudget,
  type AgentError,
  type AgentPhase,
  type AgentResult,
  type AgentTask,
  type BudgetUsage,
  type FinalResult,
  type IAgentRuntime,
  type Observation,
  type Plan,
  type PlanStep,
  type Recovery,
  type ToolCallOutcome,
  type ToolKind,
  type Verification,
} from "./types.js";

const log = createLogger("AgenticRuntime");

/** Permissions à effet de bord : leur présence prouve qu'un fichier a été touché. */
const WRITE_TOOLS = new Set([
  "write_project_file",
  "modify_project_file",
  "patch_project_file",
  "apply_patch",
  "rename_project_file",
  "delete_project_file",
  "create_project_directory",
]);

/** Outils de vérification exécutables pour valider une étape. */
const VERIFY_TOOLS = ["verify_full", "verify_typecheck", "verify_lint", "verify_file"];
const VERIFY_TOOL_SET = new Set([...VERIFY_TOOLS, "verify_format", "quality_loop", "run_project_command"]);

/** Outils de lecture/exploration (comptabilisés en phase discovery). */
const READ_TOOLS = new Set([
  "read_project_file",
  "read_file_outline",
  "list_project_files",
  "search_in_files",
  "analyze_project_file",
  "knowledge_build_context",
  "knowledge_semantic_search",
  "knowledge_search_entities",
  "knowledge_impact_analyze",
  "knowledge_ast_callers",
  "knowledge_ast_callees",
  "knowledge_ast_call_chain",
  "knowledge_ast_file_inspect",
]);

/** Outils dont le résultat est mis en cache dans le contexte d'exécution. */
const CACHEABLE_TOOLS = new Set([
  "read_project_file",
  "read_file_outline",
  "list_project_files",
  "search_in_files",
  "analyze_project_file",
]);

/**
 * Lectures « structurelles » GRATUITES : elles cartographient l'arborescence
 * (pas le CONTENU d'un fichier) et ne doivent pas grever le quota d'exploration.
 * Lister les fichiers du projet est bon marché, souvent répété (une fois par
 * sous-dossier) et nécessaire pour localiser la cible AVANT toute lecture utile.
 * Les compter revenait à affamer le budget read avec de la navigation (4×
 * list_project_files = 4 lectures « perdues »). Ils restent mis en cache (dédup)
 * et exécutés, mais ni comptés ni gatés par `maxRead`.
 */
const FREE_READ_TOOLS = new Set(["list_project_files"]);

const MAX_HISTORY_CHARS = 60_000;
const MAX_RESULT_CHARS = 4_000;

/** Classe un outil par nature, pour la comptabilité séparée et la règle d'arrêt. */
function classifyTool(name: string): ToolKind {
  if (WRITE_TOOLS.has(name)) return "write";
  if (VERIFY_TOOL_SET.has(name)) return "verify";
  if (READ_TOOLS.has(name)) return "read";
  return "other";
}

/**
 * Signature du générateur de texte. En production c'est `generateText`
 * (Gemini/OpenRouter). Un modèle DÉTERMINISTE peut être injecté pour tester la
 * chaîne agentique complète sans réseau ni clés API (voir mission-harness).
 */
export type GenerateTextFn = typeof generateText;

export interface AgenticRuntimeDeps {
  registry: ToolRegistry;
  events?: EventBus;
  /** Budget par défaut (fusionné avec le budget de la tâche). */
  budget?: Partial<AgentBudget>;
  /**
   * Générateur de texte injectable. Défaut : `generateText` (provider réel).
   * Permet d'injecter un modèle déterministe pour les tests de bout en bout.
   */
  model?: GenerateTextFn;
}

export class AgenticRuntime implements IAgentRuntime {
  private readonly registry: ToolRegistry;
  private readonly events?: EventBus;
  private readonly defaultBudget: AgentBudget;
  private readonly model: GenerateTextFn;

  // État par exécution (reconstruit à chaque run pour rester réentrant).
  private session: RunSession | null = null;

  constructor(deps: AgenticRuntimeDeps) {
    this.registry = deps.registry;
    this.events = deps.events;
    this.defaultBudget = { ...DEFAULT_AGENT_BUDGET, ...deps.budget };
    this.model = deps.model ?? generateText;
  }

  /**
   * Exécute un outil ponctuel via le ToolRegistry (permissions, dry-run,
   * timeout, métriques appliqués). Utilisé hors boucle par les appelants qui
   * ont besoin d'une vérification isolée (ex: AutonomousLoop.verifyFile).
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.registry.call(name, args);
  }

  // ─── run : orchestration complète ─────────────────────────────────────────

  async run(task: AgentTask): Promise<AgentResult> {
    const startedAt = Date.now();
    const taskId = task.id ?? randomUUID();
    // Le budget est normalisé : maxToolCalls = somme des quotas de phase absolus.
    const budget: AgentBudget = normalizeBudget({ ...this.defaultBudget, ...task.budget });

    if (!hasAgent(task.role)) {
      return this.failFast(task, taskId, startedAt, `Agent "${task.role}" introuvable`);
    }
    const agent = getAgentDefinitionOrThrow(task.role);
    const tools = resolveAgentTools(agent.capabilities, this.registry);

    // WorkspaceState : état authoritatif adressé par contenu (SHA-256). La
    // fonction de lecture passe par le ToolRegistry (read_project_file), comme
    // le fait le legacy executor.
    const workspace = new WorkspaceState(async (path: string) => {
      const res = (await this.registry.call("read_project_file", { path, full: true })) as
        | { content?: string; error?: string; status?: string }
        | undefined;
      if (!res || res.error || res.status === "failed" || typeof res.content !== "string") {
        throw new Error(res?.error ?? "Lecture du fichier impossible.");
      }
      return res.content;
    });

    const session: RunSession = {
      taskId,
      agent,
      tools,
      goalText: [task.goal, task.instructions].filter(Boolean).join(" "),
      observations: [],
      verifications: [],
      recoveries: [],
      filesModified: new Set<string>(),
      toolsExecuted: [],
      usage: emptyBudgetUsage(),
      budget,
      startedAt,
      pendingInstruction: undefined,
      replans: 0,
      phase: "discovery",
      readCache: new Map<string, unknown>(),
      readFilesSeen: new Set<string>(),
      workspace,
      repairLoops: new Map<string, AgentRepairLoop>(),
      blockedFiles: new Set<string>(),
      lastPatchByFile: new Map<string, string>(),
    };
    this.session = session;

    log.info(
      `[${taskId.slice(0, 8)}] ▶ ${agent.name} — objectif: "${truncate(task.goal, 120)}" | ` +
        `${tools.length} outil(s) réellement disponible(s) sur ${agent.capabilities.length} déclaré(s)`
    );

    let plan: Plan;
    try {
      // ── UNDERSTAND + PLAN ──
      plan = await this.plan(task);
      session.lastPlan = plan;
    } catch (err) {
      return this.finish(task, session, "failed", `Échec de la planification: ${(err as Error).message}`);
    }

    // ── Boucle ACT → OBSERVE → VERIFY → (NEXT | RECOVER) ──
    let stepIdx = 0;
    // Nombre de fois où l'on a refusé une clôture « sans écriture » pour relancer
    // l'agent vers l'action. Borné pour éviter une relance stérile indéfinie.
    let actionNudges = 0;
    // Relances « sans contexte » (l'agent conclut sans avoir rien lu). Bornées
    // séparément : elles ne doivent pas consommer les relances d'action, mais ne
    // doivent pas non plus boucler indéfiniment si l'agent n'explore jamais.
    let discoveryNudges = 0;
    while (stepIdx < plan.steps.length) {
      if (this.budgetExhausted(session)) {
        log.warn(`[${taskId.slice(0, 8)}] ⛔ Budget épuisé — arrêt de la boucle`);
        break;
      }

      // Transition de phase automatique : une fois le quota d'exploration
      // consommé, on force la phase WRITE pour que l'agent agisse.
      this.advancePhase(session);

      const step = plan.steps[stepIdx];
      step.status = "running";

      let observation: Observation;
      try {
        observation = await this.execute(task, step);
      } catch (err) {
        const recovery = await this.recover({
          phase: "act",
          message: (err as Error).message,
          cause: err,
        });
        session.recoveries.push(recovery);
        const advance = this.applyRecovery(session, plan, stepIdx, recovery);
        if (advance === "abort") break;
        if (advance === "next") stepIdx++;
        continue;
      }

      // ── VERIFY ──
      step.status = "verifying";
      const verification = await this.verify(step, observation);
      session.verifications.push(verification);

      if (verification.passed) {
        // ── Garde anti-enlisement : « conclut en texte sans jamais écrire » ──
        // Si le modèle rend une réponse finale (aucun tool_call) alors qu'une
        // écriture était ATTENDUE (le plan suggère un outil d'écriture), qu'AUCUN
        // fichier n'a encore été écrit, et qu'il reste du budget d'écriture, on
        // REFUSE cette clôture prématurée : on force la phase write et on injecte
        // une consigne impérative d'action. Sans ça, l'agent s'arrête en
        // discovery après avoir seulement lu (bug observé en production).
        if (
          observation.isFinal &&
          observation.toolOutcomes.length === 0 &&
          session.filesModified.size === 0 &&
          this.expectsWrites(session, plan) &&
          session.usage.writeCalls < session.budget.maxWrite &&
          actionNudges < AgenticRuntime.MAX_ACTION_NUDGES &&
          !this.budgetExhausted(session)
        ) {
          // Distingue DEUX enlisements différents :
          //  (a) l'agent n'a encore RIEN lu de concluant (filesRead === 0) : il
          //      ne peut pas écrire sans contexte. On le renvoie EXPLORER, et on
          //      ne consomme PAS de relance d'action (sinon on épuise les 2
          //      nudges avant même d'avoir le fichier — bug observé : relances
          //      1/2 et 2/2 brûlées en iter 2-3, le bon fichier lu seulement en
          //      iter 4, plus aucune garde ensuite).
          //  (b) l'agent a du contexte mais conclut sans écrire : on le pousse à
          //      AGIR et on décompte une relance (garde-fou borné).
          const hasContext = session.usage.filesRead > 0;
          if (!hasContext && discoveryNudges < AgenticRuntime.MAX_DISCOVERY_NUDGES) {
            discoveryNudges += 1;
            session.phase = "discovery";
            session.pendingInstruction =
              "Tu n'as pas encore lu le fichier cible. Localise-le d'abord " +
              "(list_project_files / search_in_files) puis lis-le (read_project_file) " +
              "AVANT de conclure. Ne termine pas sans avoir pris connaissance du contenu.";
            step.status = "running";
            log.info(
              `[${session.taskId.slice(0, 8)}] ⚠️ Clôture refusée (sans contexte ${discoveryNudges}/${AgenticRuntime.MAX_DISCOVERY_NUDGES}, hors quota d'action) : ` +
                `aucune lecture concluante — relance en phase discovery.`
            );
            continue;
          }

          actionNudges += 1;
          session.phase = "write";
          session.pendingInstruction =
            "Tu as suffisamment exploré mais tu n'as RIEN écrit. N'explique pas, AGIS : " +
            "applique la modification maintenant avec write_project_file / modify_project_file / " +
            "patch_project_file, puis vérifie avec verify_file. Ne termine pas sans avoir écrit.";
          step.status = "running";
          log.info(
            `[${session.taskId.slice(0, 8)}] ⚠️ Clôture refusée (relance ${actionNudges}/${AgenticRuntime.MAX_ACTION_NUDGES}) : ` +
              `réponse finale sans écriture alors qu'une modification est attendue — relance en phase write.`
          );
          continue; // reste sur la même étape, l'agent doit agir
        }

        step.status = "done";
        stepIdx++;
        // Si le modèle a produit une réponse finale, on peut clore tôt.
        if (observation.isFinal && this.allRemainingTrivial(plan, stepIdx)) break;
        continue;
      }

      // ── FAILURE → RECOVER ──
      step.status = "failed";

      // ── Garde anti-« vérifier dans le vide ». ──
      // Cas observé : une MODIFICATION est attendue, l'agent n'a RIEN écrit, mais
      // il a quand même émis des tool_calls (lectures, puis verify_file/
      // verify_typecheck qui échouent). Le step passe « failed » → recovery, et
      // l'agent s'enlise à re-vérifier un fichier jamais écrit, brûlant le quota
      // verify. Tant qu'il reste du budget d'écriture et des relances d'action,
      // on NE part PAS en recovery : on le renvoie ÉCRIRE (le vrai travail
      // manquant), au lieu de « réparer » une vérification sans objet.
      if (
        session.filesModified.size === 0 &&
        this.expectsWrites(session, plan) &&
        session.usage.writeCalls < session.budget.maxWrite &&
        actionNudges < AgenticRuntime.MAX_ACTION_NUDGES &&
        !this.budgetExhausted(session)
      ) {
        actionNudges += 1;
        session.phase = "write";
        session.pendingInstruction =
          "Tu n'as encore écrit AUCUN fichier alors qu'une modification est attendue. " +
          "Ne vérifie rien (il n'y a rien à vérifier) : APPLIQUE d'abord la modification " +
          "avec write_project_file / modify_project_file / patch_project_file sur le fichier " +
          "cible déjà lu, PUIS vérifie avec verify_file. N'émets pas verify_typecheck tant " +
          "que tu n'as rien écrit.";
        step.status = "running";
        log.info(
          `[${session.taskId.slice(0, 8)}] ⚠️ Recovery court-circuitée (relance ${actionNudges}/${AgenticRuntime.MAX_ACTION_NUDGES}) : ` +
            `vérification en échec sans aucune écriture — relance en phase write.`
        );
        continue; // reste sur la même étape, l'agent doit écrire
      }

      // Identifie le premier fichier écrit non vérifié pour piloter la réparation.
      const failedFile = this.firstUnverifiedWrite(session, observation);
      const recovery = await this.recover({
        phase: "verify",
        message: verification.issues.join("; ") || verification.summary,
        file: failedFile,
      });
      session.recoveries.push(recovery);
      const advance = this.applyRecovery(session, plan, stepIdx, recovery);
      if (advance === "abort") break;
      if (advance === "next") stepIdx++;
      // "retry"/"replan" → on reste sur la même étape (ou plan régénéré)
    }

    // ── COMPLETE ──
    const outcome = this.assessOutcome(session, plan);
    const success = outcome === "success" || outcome === "partial";
    return this.finish(task, session, outcome, undefined, success);
  }

  // ─── plan : UNDERSTAND + PLAN ───────────────────────────────────────────────

  async plan(task: AgentTask): Promise<Plan> {
    const session = this.requireSession();
    const { agent, tools } = session;

    const toolNames = tools.map((t) => t.name).join(", ") || "(aucun)";

    // ── GROUNDING : résout les chemins réels évoqués par l'objectif AVANT de
    // planifier. Sans ça, le LLM devine des chemins (ex. « EmptyEditorState »
    // → chemin inexistant), échoue à les lire, puis conclut sans écrire. En
    // injectant les fichiers réellement présents, le plan cible les bons
    // chemins et déclare les bons outils d'écriture. Best-effort, lecture seule,
    // ne consomme pas le budget d'exploration de la boucle.
    const groundedFiles = await this.groundCandidateFiles(task);

    const planPrompt = [
      `OBJECTIF UTILISATEUR : ${task.goal}`,
      task.instructions ? `INSTRUCTIONS : ${task.instructions}` : "",
      task.files?.length ? `FICHIERS DE CONTEXTE : ${task.files.join(", ")}` : "",
      groundedFiles.length
        ? `FICHIERS CANDIDATS (résolus automatiquement dans le projet — utilise ces chemins EXACTS, ne les devine pas) :\n${groundedFiles.map((f) => `  - ${f}`).join("\n")}`
        : "",
      `OUTILS QUE TU POURRAS UTILISER : ${toolNames}`,
      "",
      "Analyse l'intention puis produis un plan d'action minimal et vérifiable.",
      "Si l'objectif implique de MODIFIER du code, le plan DOIT inclure au moins",
      "une étape dont les suggestedTools contiennent un outil d'écriture",
      "(write_project_file / modify_project_file / patch_project_file).",
      this.isDesignTask(session)
        ? "TÂCHE DE DESIGN : le plan DOIT prévoir (a) une étape qui LIT le fichier " +
          "cible en entier (read_project_file, full:true), puis (b) une étape qui le " +
          "RÉÉCRIT intégralement via write_project_file. N'utilise pas patch/modify " +
          "sur du texte supposé."
        : "",
      "Réponds UNIQUEMENT avec un JSON strict de la forme :",
      JSON.stringify(
        {
          intent: "reformulation courte de l'intention",
          successCriteria: ["critère observable 1", "critère observable 2"],
          rationale: "pourquoi ce plan",
          steps: [
            { description: "étape 1", suggestedTools: ["outil_a"], verification: "comment vérifier" },
          ],
        },
        null,
        0
      ),
    ]
      .filter(Boolean)
      .join("\n");

    const response = await this.callLLM(agent, planPrompt);
    this.accountCost(session, response);

    const parsed = parseJsonObject(response.text);
    const rawSteps = Array.isArray(parsed?.steps) ? parsed!.steps : [];

    const steps: PlanStep[] = rawSteps
      .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === "object"))
      .map((s, i) => ({
        id: `step-${i + 1}`,
        description: typeof s.description === "string" ? s.description : `Étape ${i + 1}`,
        suggestedTools: Array.isArray(s.suggestedTools)
          ? (s.suggestedTools.filter((t) => typeof t === "string") as string[])
          : undefined,
        verification: typeof s.verification === "string" ? s.verification : undefined,
        status: "pending" as const,
      }));

    // Fallback : un plan à une seule étape reprenant l'objectif brut.
    const plan: Plan = {
      intent: typeof parsed?.intent === "string" ? parsed.intent : task.goal,
      successCriteria: Array.isArray(parsed?.successCriteria)
        ? (parsed!.successCriteria.filter((c) => typeof c === "string") as string[])
        : ["L'objectif est atteint et vérifié."],
      rationale: typeof parsed?.rationale === "string" ? parsed.rationale : "Plan direct.",
      steps: steps.length > 0 ? steps : [
        { id: "step-1", description: task.goal, status: "pending" },
      ],
    };

    log.info(
      `[${session.taskId.slice(0, 8)}] 🧭 Plan: "${truncate(plan.intent, 80)}" — ${plan.steps.length} étape(s)`
    );
    this.events?.emit({ type: "workflow:started", workflowId: session.taskId, name: plan.intent });
    return plan;
  }

  /**
   * GROUNDING du planificateur : à partir de l'objectif (+ fichiers de contexte
   * fournis), résout les CHEMINS RÉELS présents dans le projet, pour que le plan
   * cible des chemins exacts au lieu d'en inventer.
   *
   * Stratégie best-effort, lecture seule, 100 % tolérante aux erreurs :
   *   1. fichiers de contexte explicitement fournis dans la tâche (confiance max) ;
   *   2. identifiants « CamelCase » et noms de fichiers extraits de l'objectif,
   *      résolus via `knowledge_search_entities` (champ `file`) puis, en repli,
   *      via un `list_project_files` récursif filtré par nom de base.
   *
   * N'appelle PAS `invokeTool` (donc ne consomme aucun quota d'exploration) :
   * les appels passent directement par le registre. Toute exception est avalée.
   */
  private async groundCandidateFiles(task: AgentTask): Promise<string[]> {
    const found = new Set<string>();
    const MAX_FILES = 5;

    // Rejette les chemins NON ÉDITABLES / générés : artefacts de sortie
    // (graphify-out, dist, build, coverage), copies sandbox/VCS, dépendances,
    // et rapports Markdown générés. Sans ce filtre, `knowledge_search_entities`
    // peut renvoyer p.ex. `graphify-out/…/GRAPH_REPORT.md` comme « fichier » de
    // l'entité, gaspillant le quota de lecture sur du bruit (bug observé).
    const isNoise = (f: string): boolean =>
      /(^|\/)(\.Leanna|node_modules|\.git|dist|build|coverage|graphify-out|\.project-knowledge)(\/|$)/i.test(
        f.replace(/\\/g, "/")
      ) || /GRAPH_REPORT\.md$/i.test(f);
    const addCandidate = (f: unknown): void => {
      if (typeof f === "string" && f.trim() && !isNoise(f.trim())) found.add(f.trim());
    };

    // 1. Fichiers de contexte fournis par l'appelant.
    for (const f of task.files ?? []) addCandidate(f);

    const text = [task.goal, task.instructions].filter(Boolean).join(" ");

    // 2. Jetons candidats : noms de fichiers explicites (foo.tsx) + identifiants
    //    CamelCase (EmptyEditorState) de longueur ≥ 4.
    const tokens = new Set<string>();
    for (const m of text.matchAll(/\b([\w.-]+\.[a-z0-9]{1,5})\b/gi)) tokens.add(m[1]);
    for (const m of text.matchAll(/\b([A-Z][a-zA-Z0-9]{3,})\b/g)) tokens.add(m[1]);

    const callRegistry = async (name: string, args: Record<string, unknown>): Promise<any> => {
      try {
        return await this.registry.call(name, args, { agentId: task.role });
      } catch {
        return undefined;
      }
    };

    for (const token of tokens) {
      if (found.size >= MAX_FILES) break;

      // 2a. Entités de code (classes/fonctions/composants) → leur fichier.
      const ent = await callRegistry("knowledge_search_entities", { query: token });
      const entities = (ent && typeof ent === "object" && Array.isArray((ent as any).entities))
        ? (ent as any).entities as Array<{ file?: unknown }>
        : [];
      for (const e of entities) {
        addCandidate(e.file);
        if (found.size >= MAX_FILES) break;
      }
    }

    // 3. Repli : si rien n'a matché via le graphe, chercher les noms de fichiers
    //    explicites par nom de base dans l'arborescence.
    if (found.size === 0) {
      const listing = await callRegistry("list_project_files", { path: ".", recursive: true });
      const files: string[] =
        listing && typeof listing === "object" && Array.isArray((listing as any).files)
          ? ((listing as any).files as unknown[]).filter((f): f is string => typeof f === "string")
          : [];
      for (const token of tokens) {
        const base = token.toLowerCase();
        for (const f of files) {
          if (f.toLowerCase().includes(base)) {
            addCandidate(f);
            if (found.size >= MAX_FILES) break;
          }
        }
        if (found.size >= MAX_FILES) break;
      }
    }

    const result = [...found].slice(0, MAX_FILES);
    if (result.length > 0) {
      log.info(
        `[${task.id?.slice(0, 8) ?? "?"}] 📎 Grounding : ${result.length} fichier(s) candidat(s) injecté(s) dans le plan : ${result.join(", ")}`
      );
    }
    return result;
  }

  // ─── execute : ACT + OBSERVE RESULT (boucle d'outils interne) ───────────────

  async execute(task: AgentTask, step: PlanStep): Promise<Observation> {
    const session = this.requireSession();
    const { agent, tools, usage } = session;

    usage.iterations += 1;

    const iteration = usage.iterations;
    const systemPrompt = this.buildSystemPrompt(agent, tools, session);
    const designProtocol =
      this.isDesignTask(session) && tools.some((t) => t.name === "write_project_file")
        ? AgenticRuntime.DESIGN_WRITE_PROTOCOL
        : "";
    const stepPrompt = [
      `OBJECTIF GLOBAL : ${task.goal}`,
      `ÉTAPE COURANTE : ${step.description}`,
      step.suggestedTools?.length ? `OUTILS SUGGÉRÉS : ${step.suggestedTools.join(", ")}` : "",
      step.verification ? `VÉRIFICATION ATTENDUE : ${step.verification}` : "",
      designProtocol,
      session.pendingInstruction ? `CONSIGNE CORRECTIVE : ${session.pendingInstruction}` : "",
      buildObservationHistory(session.observations, MAX_HISTORY_CHARS),
      "",
      "Décide de la prochaine action : soit des tool_calls JSON, soit une réponse finale.",
    ]
      .filter(Boolean)
      .join("\n\n");

    session.pendingInstruction = undefined;

    const response = await this.callLLM(agent, stepPrompt, systemPrompt);
    this.accountCost(session, response);
    const text = response.text.trim();

    const calls = extractToolCalls(text);
    const toolOutcomes: ToolCallOutcome[] = [];

    // Déduplication INTRA-itération : un même outil de lecture appelé plusieurs
    // fois avec les MÊMES arguments dans le SEUL tour courant ne doit compter
    // que pour un (4× list_project_files identiques → 1). On s'appuie sur la
    // clé de cache ; le readCache (inter-itérations) gère déjà la dédup entre
    // tours, mais pas les doublons émis dans un même bloc de tool_calls.
    const seenReadKeys = new Set<string>();
    // Verrou anti-doublon de vérification : au plus UN verify_typecheck (et un
    // verify_full) exécuté par itération. Les relances successives dans un même
    // tour ne font qu'épuiser le quota sans information nouvelle.
    const verifyRunThisIteration = new Set<string>();

    for (const call of calls) {
      const kind = classifyTool(call.name);

      // ── Dédup intra-itération des lectures identiques. ──
      if (kind === "read") {
        const key = cacheKey(call.name, call.parameters);
        if (seenReadKeys.has(key)) {
          toolOutcomes.push({
            invocation: { name: call.name, parameters: call.parameters },
            success: true,
            result: session.readCache.get(key),
            durationMs: 0,
            cached: true,
          });
          continue;
        }
        seenReadKeys.add(key);
      }

      // ── Vérification GLOBALE avant toute écriture = inutile. ──
      // verify_typecheck / verify_full exécutent `tsc` sur tout le projet. Les
      // lancer alors qu'AUCUN fichier n'a été modifié (et qu'une écriture est
      // attendue) ne teste que l'état préexistant : si le projet a déjà une
      // erreur TS ailleurs, l'outil renvoie `failed`, ce qui envoie l'agent en
      // recovery pour un échec qui ne le concerne pas (enlisement observé :
      // verify 2/6 → 4/6 sans aucune écriture). On bloque et on redirige vers
      // l'écriture tant que rien n'a été produit.
      if (
        (call.name === "verify_typecheck" || call.name === "verify_full") &&
        session.filesModified.size === 0 &&
        this.expectsWrites(session, this.session?.lastPlan ?? { intent: "", steps: [], successCriteria: [], rationale: "" })
      ) {
        toolOutcomes.push({
          invocation: { name: call.name, parameters: call.parameters },
          success: false,
          error:
            `${call.name} est prématuré : aucun fichier n'a encore été modifié. ` +
            `Une vérification globale avant écriture ne teste que l'état préexistant du projet. ` +
            `Applique d'abord la modification (write_project_file / modify_project_file / patch_project_file), ` +
            `puis vérifie le fichier écrit avec verify_file.`,
          durationMs: 0,
        });
        session.pendingInstruction =
          "N'exécute pas de vérification globale (verify_typecheck) tant que tu n'as rien écrit. Écris d'abord.";
        continue;
      }

      // ── Verrou anti-doublon : un seul typecheck/verify_full par itération. ──
      if (call.name === "verify_typecheck" || call.name === "verify_full") {
        if (verifyRunThisIteration.has(call.name)) {
          toolOutcomes.push({
            invocation: { name: call.name, parameters: call.parameters },
            success: false,
            error:
              `${call.name} a déjà été exécuté dans cette itération. ` +
              `Une seule vérification globale par tour : agis sur le résultat précédent ` +
              `(corrige puis relance au tour suivant) au lieu de relancer immédiatement.`,
            durationMs: 0,
          });
          continue;
        }
        verifyRunThisIteration.add(call.name);
      }

      // Gate de budget SÉLECTIF par nature d'appel.
      // - read/other : bloqués dès que le budget non-critique est épuisé.
      // - write/verify : autorisés tant que le budget réservé aux actions
      //   critiques n'est pas dépassé (les corrections doivent pouvoir aboutir).
      const gate = this.admitCall(session, kind, call.name, call.parameters);
      if (!gate.allowed) {
        toolOutcomes.push({
          invocation: { name: call.name, parameters: call.parameters },
          success: false,
          error: gate.reason,
          durationMs: 0,
        });
        // Un refus de phase (discovery saturé) pousse vers l'écriture : on
        // n'interrompt pas la boucle, mais on injecte une consigne.
        session.pendingInstruction = gate.nudge ?? session.pendingInstruction;
        continue;
      }

      // Un agent ne peut appeler QUE les outils qu'il a réellement.
      if (!tools.some((t) => t.name === call.name)) {
        toolOutcomes.push({
          invocation: { name: call.name, parameters: call.parameters },
          success: false,
          error: `Outil "${call.name}" non autorisé pour l'agent ${agent.role}`,
          durationMs: 0,
        });
        continue;
      }

      const outcome = await this.invokeTool(session, call.name, call.parameters);
      toolOutcomes.push(outcome);

      // Transition de phase après une écriture réussie : on passe en VERIFY.
      if (kind === "write" && outcome.success && session.phase !== "recovery") {
        session.phase = "verify";
      }
    }

    const observation: Observation = {
      iteration,
      reasoning: text,
      toolOutcomes,
      isFinal: calls.length === 0,
    };
    session.observations.push(observation);

    // ── Diagnostic d'itération : pourquoi l'agent (n')écrit(-il pas) ? ──
    // Trace, à chaque tour : phase courante, outils émis (ou « réponse finale
    // sans action » = le modèle a conclu en texte sans tool_call), consommation
    // read/write/verify, et un extrait du raisonnement. Permet de distinguer
    // « n'a jamais tenté d'écrire » de « a tenté mais a été bloqué ».
    const u = session.usage;
    const callSummary =
      calls.length === 0
        ? "AUCUN tool_call → réponse finale (texte)"
        : calls
            .map((c, i) => {
              const o = toolOutcomes[i];
              // Aplatit le message sur une ligne avant de tronquer : certaines
              // erreurs (suggestions de chemins) sont multi-lignes et casseraient
              // la lisibilité du résumé d'itération.
              const flat = (o?.error ?? "").replace(/\s+/g, " ").trim();
              const verdict = o?.success === false ? `✗(${flat.slice(0, 60)})` : "✓";
              return `${classifyTool(c.name)}:${c.name}${verdict}`;
            })
            .join(", ");
    log.info(
      `[${session.taskId.slice(0, 8)}] 🔎 iter ${iteration} | phase=${session.phase} | ` +
        `budget read ${u.readCalls}/${session.budget.maxRead} write ${u.writeCalls}/${session.budget.maxWrite} ` +
        `verify ${u.verifyCalls}/${session.budget.maxVerify} | actions: ${callSummary}`
    );
    if (text.length > 0) {
      log.debug(`[${session.taskId.slice(0, 8)}] 💭 iter ${iteration} raisonnement: ${truncate(text, 300)}`);
    }

    return observation;
  }

  private async invokeTool(
    session: RunSession,
    name: string,
    parameters: Record<string, unknown>
  ): Promise<ToolCallOutcome> {
    const kind = classifyTool(name);

    // ── Cache de contexte : évite les search→read→search redondants. ──
    // Un read identique déjà effectué dans ce run est resservi sans nouvel appel
    // ni consommation de budget.
    if (CACHEABLE_TOOLS.has(name)) {
      const key = cacheKey(name, parameters);
      if (session.readCache.has(key)) {
        return {
          invocation: { name, parameters },
          success: true,
          result: session.readCache.get(key),
          durationMs: 0,
          cached: true,
        };
      }
    }

    const start = Date.now();
    // Les lectures structurelles gratuites (list_project_files) sont exécutées
    // et tracées, mais NON facturées au quota d'exploration.
    const billable = !FREE_READ_TOOLS.has(name);
    if (billable) this.countCall(session, kind);
    session.toolsExecuted.push(name);
    this.events?.emit({ type: "tool:called", toolName: name, agentId: session.agent.role });

    try {
      const result = await this.registry.call(name, parameters, { agentId: session.agent.role });
      const durationMs = Date.now() - start;

      // ── Échec APPLICATIF : le handler a RÉSOLU (pas throw) mais signale une
      // erreur via `{ error }` ou `{ status: "failed" }` (ex. refus sandbox,
      // searchText introuvable, fichier protégé). Le ToolRegistry métré ces
      // retours comme `success:true`, mais pour la boucle agentique ce sont des
      // ÉCHECS d'outil. On NE compte PAS un fichier « modifié » dans ce cas :
      // sinon une écriture refusée serait comptabilisée à tort (faux positif).
      const appError = toolResultError(result);
      if (appError) {
        // Bug A — Une LECTURE qui échoue applicativement (ex. "Fichier
        // introuvable." quand la cible n'est pas encore matérialisée dans le
        // sandbox) ne doit PAS consommer le quota d'exploration : sinon l'agent
        // s'auto-affame (budget read épuisé par des lectures ratées) et ne peut
        // plus relire une fois la cible disponible. On rembourse le compteur
        // facturé en amont par countCall(). Les écritures/vérifications ratées
        // restent comptées (une tentative d'action consomme son quota réservé).
        if (kind === "read" && billable) this.refundCall(session, kind);
        // Chemin deviné → on rend l'échec ACTIONNABLE en proposant les vrais
        // chemins candidats de l'inventaire (sinon l'agent continue de deviner).
        // UNIQUEMENT pour les lectures : suggérer un chemin sur un write/delete
        // qui échoue encouragerait l'agent à RÉESSAYER une écriture destructrice
        // sur un vrai chemin (ex. delete_project_file). Les écritures ratées ne
        // reçoivent donc pas de suggestion.
        const suggestion =
          kind === "read"
            ? await this.suggestPathAlternatives(session, parameters, appError)
            : undefined;
        return {
          invocation: { name, parameters },
          success: false,
          error: suggestion ? `${appError}${suggestion}` : appError,
          result: clampResult(result),
          durationMs,
        };
      }

      // ── Écriture CONFIRMÉE : enregistrée immédiatement (transactionnel). ──
      // La preuve d'écriture est capturée dès le retour du handler, AVANT tout
      // contrôle de budget ultérieur. Une limite atteinte plus tard n'annule
      // jamais une modification déjà émise et réussie. On relit puis on hashe
      // le fichier dans le WorkspaceState (chaîne WRITE → observe → hash).
      if (kind === "write") {
        const path = extractPath(parameters);
        if (path) {
          session.filesModified.add(path);
          session.usage.filesModified = session.filesModified.size;
          try {
            await session.workspace.reread(path, "write");
          } catch {
            session.workspace.markError(path, "Relecture post-écriture impossible.");
          }
          // Mémorise le patch pour la détection de patch identique répété.
          session.lastPatchByFile.set(normPath(path), JSON.stringify(parameters));
        }
      }

      // Comptabilité des fichiers lus distincts + mise en cache.
      if (kind === "read") {
        const path = extractPath(parameters);
        // Relecture de VÉRIFICATION : relire un fichier DÉJÀ MODIFIÉ dans ce run
        // n'est pas de la découverte — c'est confirmer son propre travail. On ne
        // facture pas ce type de lecture au quota d'exploration : sinon, avec un
        // budget read serré, l'agent qui a tout dépensé en découverte ne peut
        // plus relire après écriture pour se vérifier (impasse observée).
        if (path && session.filesModified.has(path)) {
          if (billable) this.refundCall(session, kind);
        } else if (path && !session.readFilesSeen.has(path)) {
          session.readFilesSeen.add(path);
          session.usage.filesRead = session.readFilesSeen.size;
        }
      }
      if (CACHEABLE_TOOLS.has(name)) {
        session.readCache.set(cacheKey(name, parameters), clampResult(result));
      }

      return {
        invocation: { name, parameters },
        success: true,
        result: clampResult(result),
        durationMs,
      };
    } catch (err) {
      // Bug A (symétrie exception) : une LECTURE qui échoue en LEVANT une
      // exception (ex. search_in_files → ENOENT scandir) ne doit pas davantage
      // grever le quota d'exploration qu'une lecture échouée applicativement.
      // Même remboursement que la branche appError pour ne pas auto-affamer.
      if (kind === "read" && billable) this.refundCall(session, kind);
      const message = (err as Error).message;
      // Suggestion de chemins réservée aux lectures (cf. branche appError).
      const suggestion =
        kind === "read"
          ? await this.suggestPathAlternatives(session, parameters, message)
          : undefined;
      return {
        invocation: { name, parameters },
        success: false,
        error: suggestion ? `${message}${suggestion}` : message,
        durationMs: Date.now() - start,
      };
    }
  }

  /** Incrémente les compteurs séparés (lecture / écriture / vérification / autre). */
  private countCall(session: RunSession, kind: ToolKind): void {
    const u = session.usage;
    u.toolCalls += 1;
    if (kind === "read") u.readCalls += 1;
    else if (kind === "write") u.writeCalls += 1;
    else if (kind === "verify") u.verifyCalls += 1;
    else u.otherCalls += 1;
  }

  /**
   * Rembourse un appel facturé par countCall() lorsque l'outil a échoué
   * applicativement et qu'il ne doit pas grever le quota de sa phase (ex. une
   * lecture « Fichier introuvable »). Symétrique strict de countCall(), borné à
   * zéro pour ne jamais produire de compteur négatif.
   */
  private refundCall(session: RunSession, kind: ToolKind): void {
    const u = session.usage;
    u.toolCalls = Math.max(0, u.toolCalls - 1);
    if (kind === "read") u.readCalls = Math.max(0, u.readCalls - 1);
    else if (kind === "write") u.writeCalls = Math.max(0, u.writeCalls - 1);
    else if (kind === "verify") u.verifyCalls = Math.max(0, u.verifyCalls - 1);
    else u.otherCalls = Math.max(0, u.otherCalls - 1);
  }

  /**
   * Sur une erreur « fichier introuvable », propose les chemins RÉELS les plus
   * proches issus de l'inventaire du projet (match par nom de fichier, puis par
   * radical). L'inventaire est chargé une seule fois par run, directement via le
   * registre : aucun quota d'exploration consommé. Best-effort, ne lève jamais.
   * Retourne un suffixe à ajouter au message d'erreur, ou undefined.
   */
  private async suggestPathAlternatives(
    session: RunSession,
    parameters: Record<string, unknown>,
    error: string
  ): Promise<string | undefined> {
    if (!/introuvable|not found|ENOENT/i.test(error)) return undefined;
    const requested = extractPath(parameters);
    if (!requested) return undefined;

    if (!session.fileInventory) {
      try {
        const listing = (await this.registry.call(
          "list_project_files",
          { path: ".", recursive: true },
          { agentId: session.agent.role }
        )) as { files?: unknown } | undefined;
        session.fileInventory = Array.isArray(listing?.files)
          ? listing!.files
              .filter((f): f is string => typeof f === "string")
              .map((f) => f.replace(/\\/g, "/"))
              // Exclut les copies internes (sandbox, VCS, deps) : sinon chaque
              // fichier réapparaît sous `.Leanna/sandbox/...`, polluant les
              // suggestions avec des chemins non éditables par l'agent.
              .filter((f) => !/(^|\/)(\.Leanna|node_modules|\.git)(\/|$)/.test(f))
          : [];
      } catch {
        session.fileInventory = [];
      }
    }
    const inventory = session.fileInventory;
    if (inventory.length === 0) return undefined;

    const base = (requested.replace(/\\/g, "/").split("/").pop() ?? requested).toLowerCase();
    const stem = base.replace(/\.[a-z0-9]+$/i, "");
    const byName = (f: string) => (f.split("/").pop() ?? f).toLowerCase();

    let candidates = inventory.filter((f) => byName(f) === base);
    if (candidates.length === 0 && stem.length >= 4) {
      candidates = inventory.filter((f) => byName(f).includes(stem));
    }
    candidates = candidates.sort((a, b) => a.length - b.length).slice(0, 5);

    if (candidates.length === 0) {
      return `\n  → Aucun fichier nommé "${base}" dans le projet. Vérifie le nom exact ou cherche-le avec search_in_files.`;
    }
    return (
      `\n  → Chemins réels candidats :\n` +
      candidates.map((c) => `     - ${c}`).join("\n") +
      `\n  → Réessaie sur UN de ces chemins EXACTS (ne devine pas).`
    );
  }

  /** Premier fichier écrit dans l'observation qui n'est pas vérifié dans le WorkspaceState. */
  private firstUnverifiedWrite(session: RunSession, observation: Observation): string | undefined {
    for (const o of observation.toolOutcomes) {
      if (o.success && WRITE_TOOLS.has(o.invocation.name)) {
        const path = extractPath(o.invocation.parameters);
        if (!path) continue;
        const state = session.workspace.get(path);
        if (!state || state.status !== "verified" || state.verifiedHash !== state.contentHash) {
          return path;
        }
      }
    }
    return undefined;
  }

  // ─── verify : VERIFICATION ──────────────────────────────────────────────────

  async verify(step: PlanStep, observation: Observation): Promise<Verification> {
    const session = this.requireSession();
    const checks: string[] = [];
    const issues: string[] = [];

    // 1. Une action ayant échoué invalide l'étape.
    const failed = observation.toolOutcomes.filter((o) => !o.success);
    for (const f of failed) {
      issues.push(`${f.invocation.name}: ${f.error ?? "échec"}`);
    }
    checks.push(`${observation.toolOutcomes.length} action(s), ${failed.length} en échec`);

    // 2. Vérification HASHÉE par fichier écrit dans ce tour.
    //    Chaîne : WRITE → observe/hash (déjà fait) → verify_file → VerificationRecord
    //    → workspace.recordVerification → HASH MATCH ? On NE JETTE PAS le record.
    const writtenPaths = [
      ...new Set(
        observation.toolOutcomes
          .filter((o) => o.success && WRITE_TOOLS.has(o.invocation.name))
          .map((o) => extractPath(o.invocation.parameters))
          .filter((p): p is string => Boolean(p))
      ),
    ];

    const hasVerifyFile = session.tools.some((d) => d.name === "verify_file");
    for (const path of writtenPaths) {
      if (!hasVerifyFile) {
        checks.push(`écriture ${path} (verify_file indisponible pour cet agent)`);
        continue;
      }
      // Invariant WorkspaceState : le fichier doit être relu AVANT la
      // vérification. On relit d'abord, PUIS on lance verify_file : ainsi le
      // `contentHash` du workspace et le `hashAfter` du record proviennent du
      // même état de fichier. (Auparavant le reread se faisait APRÈS verify_file,
      // introduisant une 3ᵉ lecture disque distincte : si le watcher sandbox
      // resynchronisait le fichier entre les deux lectures, les hash divergeaient
      // → `recordVerification` concluait `stale` et une écriture pourtant correcte
      // et vérifiée était rejetée. Bug observé en production.)
      await session.workspace.reread(path, "read").catch(() => undefined);
      const res = await this.invokeTool(session, "verify_file", { path });
      const record = extractVerificationRecord(res.result);
      if (record) {
        try {
          session.workspace.recordVerification(path, record);
        } catch (e) {
          session.workspace.markError(path, (e as Error).message);
        }
      } else {
        session.workspace.markError(path, "verify_file n'a pas retourné de preuve hashée.");
      }

      const state = session.workspace.get(path);
      const verified =
        Boolean(record) &&
        state?.status === "verified" &&
        state.verifiedHash === state.contentHash;

      checks.push(
        `verify_file ${path}: ${verified ? "VÉRIFIÉ (hash match)" : "NON vérifié"} ` +
          `[before=${record?.hashBefore.slice(0, 8) ?? "?"} after=${record?.hashAfter.slice(0, 8) ?? "?"}]`
      );
      if (!verified) {
        issues.push(`${path}: vérification hashée non concluante (${state?.status ?? "état absent"})`);
      }
    }

    // 3. Réponse finale sans action : acceptée seulement si rien n'a été écrit.
    if (observation.isFinal && observation.toolOutcomes.length === 0) {
      checks.push("réponse finale sans action");
    }

    const passed = issues.length === 0;
    return {
      passed,
      checks,
      issues,
      summary: passed
        ? `Étape "${truncate(step.description, 60)}" validée`
        : `Étape "${truncate(step.description, 60)}" en échec: ${issues.slice(0, 2).join("; ")}`,
    };
  }

  // ─── recover : branche FAILURE ──────────────────────────────────────────────

  async recover(error: AgentError): Promise<Recovery> {
    const session = this.requireSession();
    const { budget, usage } = session;
    session.phase = "recovery";

    // 1. Budget de récupération épuisé → arrêt (les réserves verify ne sont pas
    //    consommées par la recovery ; voir admitCall).
    if (usage.recoveryCalls >= budget.maxRecovery) {
      const canReplan = usage.iterations < budget.maxIterations - 1 && session.replans < 1;
      if (canReplan) {
        session.replans += 1;
        return {
          strategy: "replan",
          instruction: `Le plan a échoué (${error.message}). Reconsidère l'approche complètement.`,
          reason: "Budget de récupération épuisé, une replanification reste possible.",
        };
      }
      return {
        strategy: "abort",
        instruction: "",
        reason: `Budget de récupération épuisé (${usage.recoveryCalls}/${budget.maxRecovery}).`,
      };
    }

    // 2. Politique de réparation DÉTERMINISTE par fichier (AgentRepairLoop) :
    //    détecte patch identique répété, absence de progrès, régression.
    const file = error.file;
    if (file) {
      const directive = this.assessRepair(session, file, error);
      usage.recoveryCalls += 1;
      switch (directive.action) {
        case "stop":
          session.blockedFiles.add(normPath(file));
          return {
            strategy: "abort",
            instruction: directive.requiredAction,
            reason: directive.reason,
          };
        case "change_strategy":
          return {
            strategy: "replan",
            instruction: directive.requiredAction,
            reason: directive.reason,
          };
        case "continue":
        default:
          return {
            strategy: "retry",
            instruction: directive.requiredAction,
            reason: directive.reason,
          };
      }
    }

    // 3. Erreur sans fichier identifié (plan/act générique) : retry borné.
    usage.recoveryCalls += 1;
    return {
      strategy: "retry",
      instruction:
        `L'action précédente a échoué : ${error.message}. ` +
        `Analyse la cause exacte et corrige avant de réessayer ` +
        `(récupération ${usage.recoveryCalls}/${budget.maxRecovery}).`,
      reason: "Erreur récupérable sans fichier ciblé.",
    };
  }

  /**
   * Applique AgentRepairLoop pour un fichier : construit les issues à partir de
   * l'état WorkspaceState + de l'erreur, et laisse la politique décider
   * continue / change_strategy / stop (patch identique, stall, régression).
   */
  private assessRepair(session: RunSession, file: string, error: AgentError): RepairDirective {
    const key = normPath(file);
    const loop = session.repairLoops.get(key) ?? new AgentRepairLoop();
    session.repairLoops.set(key, loop);
    const state = session.workspace.get(file);
    const issues = state?.verification?.allIssues?.length
      ? state.verification.allIssues
      : [
          {
            type: "execution",
            file: key,
            line: null,
            column: null,
            severity: "error" as const,
            rule: "tool-result",
            message: error.message || "Écriture ou vérification non confirmée.",
          },
        ];
    return loop.assess({
      issues,
      record: state?.verification,
      currentHash: state?.contentHash,
      currentVersion: state?.version,
      patch: session.lastPatchByFile.get(key),
    });
  }

  // ─── finalize : COMPLETE ────────────────────────────────────────────────────

  async finalize(task: AgentTask): Promise<FinalResult> {
    const session = this.requireSession();
    const { agent } = session;

    const finalPrompt = [
      `OBJECTIF : ${task.goal}`,
      `FICHIERS MODIFIÉS : ${[...session.filesModified].join(", ") || "aucun"}`,
      `OUTILS EXÉCUTÉS : ${[...new Set(session.toolsExecuted)].join(", ") || "aucun"}`,
      buildObservationHistory(session.observations, 20_000),
      "",
      "Produis une synthèse finale en JSON strict :",
      JSON.stringify({ summary: "", details: "", deliverables: [], suggestions: [] }, null, 0),
    ]
      .filter(Boolean)
      .join("\n\n");

    let final: FinalResult = {
      summary: "Tâche traitée.",
      details: "",
      deliverables: [...session.filesModified],
      suggestions: [],
    };

    try {
      const response = await this.callLLM(agent, finalPrompt);
      this.accountCost(session, response);
      const parsed = parseJsonObject(response.text);
      if (parsed) {
        final = {
          summary: typeof parsed.summary === "string" ? parsed.summary : final.summary,
          details: typeof parsed.details === "string" ? parsed.details : response.text.trim(),
          deliverables: Array.isArray(parsed.deliverables)
            ? (parsed.deliverables.filter((d) => typeof d === "string") as string[])
            : final.deliverables,
          suggestions: Array.isArray(parsed.suggestions)
            ? (parsed.suggestions.filter((s) => typeof s === "string") as string[])
            : [],
        };
      } else {
        final.details = response.text.trim();
      }
    } catch (err) {
      log.warn(`[${session.taskId.slice(0, 8)}] Synthèse finale dégradée: ${(err as Error).message}`);
    }
    return final;
  }

  // ─── Helpers internes ───────────────────────────────────────────────────────

  private buildSystemPrompt(agent: AgentDefinition, tools: ToolDeclaration[], session: RunSession): string {
    // Guidage contextuel par phase (plan/act/verify/recover) : recentre l'agent
    // sur l'intention de la phase COURANTE au lieu de rappeler tout le contrat
    // à chaque tour. Vide si la phase n'est pas outillée → comportement inchangé.
    const phaseGuidance = buildPhaseGuidance(session.phase);
    return [
      agent.systemPrompt,
      "",
      buildToolSection(tools),
      "",
      buildBudgetSection(session.budget, session.usage, session.phase),
      ...(phaseGuidance ? ["", phaseGuidance] : []),
    ].join("\n");
  }

  private async callLLM(
    agent: AgentDefinition,
    prompt: string,
    systemPrompt?: string
  ): Promise<GenerateTextResult> {
    return this.model({
      prompt,
      systemPrompt: systemPrompt ?? agent.systemPrompt,
      temperature: 0.3,
      thinkingBudget: 0,
      maxOutputTokens: 16_384,
    });
  }

  private accountCost(session: RunSession, response: GenerateTextResult): void {
    const usage = response.tokenUsage;
    const cost = usage ? usage.totalTokens / 1000 : 1; // ~1 unité si non renseigné
    session.usage.cost += cost;
  }

  /**
   * Épuisement du budget contrôlant l'ARRÊT de la boucle (niveau itération).
   * Les limites de temps, itérations et coût sont dures. Le budget d'outils ne
   * stoppe la boucle que si TOUS les quotas de phase restants sont à zéro —
   * sinon on laisse la boucle tourner pour permettre écritures/vérifications.
   */
  private budgetExhausted(session: RunSession): boolean {
    const { budget, usage, startedAt } = session;
    usage.elapsedMs = Date.now() - startedAt;
    if (usage.iterations >= budget.maxIterations) return true;
    if (usage.elapsedMs >= budget.maxExecutionTimeMs) return true;
    if (usage.cost >= budget.maxCost) return true;
    // Reste-t-il un quota exploitable dans une phase quelconque ?
    const writeLeft = budget.maxWrite - usage.writeCalls;
    const verifyLeft = budget.maxVerify - usage.verifyCalls;
    const recoveryLeft = budget.maxRecovery - usage.recoveryCalls;
    const readLeft = budget.maxRead - usage.readCalls;
    if (writeLeft <= 0 && verifyLeft <= 0 && recoveryLeft <= 0 && readLeft <= 0) return true;
    return false;
  }

  /**
   * Règle d'arrêt intelligente basée sur les quotas ABSOLUS par phase.
   * Les quotas write/verify/recovery sont RÉSERVÉS : ils ne peuvent jamais être
   * consommés par la lecture. C'est ce qui garantit qu'après la découverte,
   * l'agent dispose toujours des appels nécessaires pour écrire ET vérifier.
   */
  private admitCall(
    session: RunSession,
    kind: ToolKind,
    name?: string,
    parameters?: Record<string, unknown>
  ): { allowed: boolean; reason: string; nudge?: string } {
    const { budget, usage } = session;

    // Limites dures non liées aux outils.
    usage.elapsedMs = Date.now() - session.startedAt;
    if (usage.elapsedMs >= budget.maxExecutionTimeMs) {
      return { allowed: false, reason: "Budget temps épuisé." };
    }
    if (usage.cost >= budget.maxCost) {
      return { allowed: false, reason: "Budget de coût épuisé." };
    }

    // Un read déjà en cache (relecture identique inter-itérations) est resservi
    // sans coût : il ne doit jamais être refusé pour quota épuisé.
    if (name && parameters && CACHEABLE_TOOLS.has(name) && session.readCache.has(cacheKey(name, parameters))) {
      return { allowed: true, reason: "" };
    }

    // Lectures structurelles gratuites (list_project_files) : jamais gatées.
    if (name && FREE_READ_TOOLS.has(name)) {
      return { allowed: true, reason: "" };
    }

    // Chaque nature d'appel est plafonnée par SON quota de phase absolu, jamais
    // par le total : le total est la somme, mais les réserves sont étanches.
    switch (kind) {
      case "write":
        return usage.writeCalls < budget.maxWrite
          ? { allowed: true, reason: "" }
          : { allowed: false, reason: `Quota d'écriture épuisé (${usage.writeCalls}/${budget.maxWrite}).` };
      case "verify":
        return usage.verifyCalls < budget.maxVerify
          ? { allowed: true, reason: "" }
          : { allowed: false, reason: `Quota de vérification épuisé (${usage.verifyCalls}/${budget.maxVerify}).` };
      case "read":
        return usage.readCalls < budget.maxRead && usage.filesRead < budget.maxFilesRead
          ? { allowed: true, reason: "" }
          : {
              allowed: false,
              reason: `Quota d'exploration épuisé (${usage.readCalls}/${budget.maxRead}).`,
              nudge:
                "Le quota d'exploration est atteint. Arrête de lire/chercher et PASSE À L'ACTION : " +
                "applique les modifications (write_project_file / modify_project_file / patch_project_file), " +
                "puis vérifie (verify_file / verify_typecheck).",
            };
      case "other":
      default:
        // Les appels « autres » (ex: planification, run_project_command hors
        // verify) puisent dans le quota de planification résiduel.
        return usage.otherCalls < budget.maxPlan
          ? { allowed: true, reason: "" }
          : { allowed: false, reason: `Quota d'appels divers épuisé (${usage.otherCalls}/${budget.maxPlan}).` };
    }
  }

  /**
   * Applique la décision de récupération et indique comment avancer :
   *  - "abort" : arrêter la boucle
   *  - "next"  : passer à l'étape suivante (skip)
   *  - "stay"  : rester sur l'étape courante (retry/replan)
   */
  private applyRecovery(
    session: RunSession,
    plan: Plan,
    stepIdx: number,
    recovery: Recovery
  ): "abort" | "next" | "stay" {
    switch (recovery.strategy) {
      case "abort":
        return "abort";
      case "skip":
        plan.steps[stepIdx].status = "skipped";
        session.pendingInstruction = recovery.instruction;
        return "next";
      case "replan": {
        // Regénère les étapes restantes en une seule étape corrective.
        session.pendingInstruction = recovery.instruction;
        plan.steps.splice(stepIdx, plan.steps.length - stepIdx, {
          id: `step-replan-${stepIdx + 1}`,
          description: recovery.instruction,
          status: "pending",
        });
        return "stay";
      }
      case "retry":
      default:
        session.pendingInstruction = recovery.instruction;
        return "stay";
    }
  }

  /** Nombre de lectures jugé suffisant pour disposer d'un contexte minimal. */
  private static readonly DISCOVERY_ENOUGH_READS = 3;

  /** Nombre maximum de relances « agis au lieu de conclure » par mission. */
  private static readonly MAX_ACTION_NUDGES = 2;

  /**
   * Nombre maximum de relances « explore avant de conclure » quand l'agent
   * tente de terminer sans avoir rien lu. Séparé de MAX_ACTION_NUDGES pour ne
   * pas épuiser les relances d'action avant d'avoir le moindre contexte, mais
   * borné pour ne pas boucler si l'agent n'explore jamais.
   */
  private static readonly MAX_DISCOVERY_NUDGES = 2;

  /**
   * Fait avancer la phase courante selon la consommation du budget.
   * discovery → write dès qu'un CONTEXTE MINIMAL est acquis (assez de lectures
   * ET au moins un fichier réellement lu), à défaut à saturation du quota, ou
   * dès qu'une écriture a eu lieu. En recovery, la phase est pilotée par recover().
   *
   * Historiquement, la bascule n'avait lieu qu'à saturation (readCalls >= maxRead).
   * Conséquence observée : l'agent restait en `discovery`, enchaînait des lectures
   * puis concluait en texte sans jamais écrire. On bascule donc plus tôt pour
   * pousser vers l'action dès que le contexte est raisonnablement établi.
   */
  private advancePhase(session: RunSession): void {
    if (session.phase === "recovery" || session.phase === "verify") return;
    if (session.phase !== "discovery") return;
    const { budget, usage } = session;
    const enoughContext =
      usage.readCalls >= AgenticRuntime.DISCOVERY_ENOUGH_READS && usage.filesRead >= 1;
    if (usage.readCalls >= budget.maxRead || usage.writeCalls > 0 || enoughContext) {
      session.phase = "write";
    }
  }

  private allRemainingTrivial(plan: Plan, fromIdx: number): boolean {
    return plan.steps.slice(fromIdx).every((s) => s.status === "done" || s.status === "skipped");
  }

  /**
   * Le plan comportait-il au moins une étape dont les outils suggérés sont des
   * outils d'écriture ? Signal FAIBLE : il dépend entièrement de ce que le LLM
   * a bien voulu déclarer dans `suggestedTools`.
   */
  private planExpectedWrites(plan: Plan): boolean {
    return plan.steps.some((s) =>
      (s.suggestedTools ?? []).some((t) => WRITE_TOOLS.has(t))
    );
  }

  /**
   * Mots-clés d'objectif impliquant une MODIFICATION (frontière de mot en tête
   * pour éviter les faux positifs ; radicaux volontairement ouverts à droite
   * pour couvrir les conjugaisons : implémente/implémenter, corrige/corriger…).
   */
  private static readonly CHANGE_INTENT_RE =
    /\b(ajout|add|implement|implément|créer|creer|crée|cree|écri|ecri|develop|développ|feature|corrig|fix|répar|repar|refactor|optimi|amélior|amelior|modif|remplac|replace|renomm|rename|supprim|delete|design|style|redesign|refont|refond)/i;

  /**
   * Mots-clés d'objectif impliquant une refonte VISUELLE / de DESIGN. Pour ces
   * tâches, un search/replace sur du texte SUPPOSÉ est fragile (l'agent devine
   * le markup/classes existants et échoue en silence). On impose donc le
   * protocole « lire le fichier EN ENTIER → réécrire via write_project_file ».
   */
  private static readonly DESIGN_INTENT_RE =
    /\b(design|style|styl|redesign|refont|refond|refonte|ui|ux|th[eè]me|theme|mise en page|layout|maquette|visuel|apparence|look|charte|palette|couleur|color)/i;

  /** La mission est-elle une tâche de design / refonte visuelle ? */
  private isDesignTask(session: RunSession): boolean {
    return AgenticRuntime.DESIGN_INTENT_RE.test(session.goalText);
  }

  /**
   * Consigne impérative pour les tâches de design : interdit le patch/replace
   * « à l'aveugle » sur du contenu supposé et impose lecture intégrale puis
   * réécriture complète. Injectée dans le prompt d'étape et le prompt de plan.
   */
  private static readonly DESIGN_WRITE_PROTOCOL =
    "TÂCHE DE DESIGN — PROTOCOLE OBLIGATOIRE : " +
    "1) lis le fichier cible EN ENTIER avec read_project_file (full:true) pour connaître " +
    "le contenu RÉEL (markup, classes, styles) ; " +
    "2) réécris-le INTÉGRALEMENT avec write_project_file en repartant du contenu lu. " +
    "N'utilise PAS patch_project_file / modify_project_file sur du texte supposé : " +
    "un search/replace sur un fragment deviné échoue en silence sur du design.";

  /**
   * Une MODIFICATION était-elle attendue pour cette mission ? Combine deux
   * signaux pour ne pas dépendre du seul plan LLM (bug observé : plan à 1 étape
   * sans outil d'écriture → mission d'implémentation déclarée `success` sans
   * aucune écriture) :
   *   1. le plan déclare explicitement un outil d'écriture (signal fort si
   *      présent), OU
   *   2. l'agent DISPOSE réellement d'outils d'écriture ET l'objectif exprime
   *      une intention de changement.
   *
   * Reste faux pour les tâches d'analyse pure (agent sans outil d'écriture, ou
   * objectif purement exploratoire) : « 0 fichier » y est un résultat légitime.
   */
  private expectsWrites(session: RunSession, plan: Plan): boolean {
    if (this.planExpectedWrites(plan)) return true;
    const agentCanWrite = session.tools.some((t) => WRITE_TOOLS.has(t.name));
    if (!agentCanWrite) return false;
    return AgenticRuntime.CHANGE_INTENT_RE.test(session.goalText);
  }

  private assessOutcome(session: RunSession, plan: Plan): import("./types.js").AgentOutcome {
    const anyFailedStep = plan.steps.some((s) => s.status === "failed");
    const wroteSomething = session.filesModified.size > 0;
    const anyToolError = session.observations.some((o) => o.toolOutcomes.some((t) => !t.success));

    // Aucune écriture ni aucun outil exécuté : rien n'a bougé.
    if (!wroteSomething && session.toolsExecuted.length === 0) return "no_change";

    // Tâche d'IMPLÉMENTATION sans aucune écriture : échec honnête, pas « partiel ».
    // Si le plan attendait une écriture (un outil d'écriture figurait dans les
    // outils suggérés d'au moins une étape) mais que l'agent a terminé sans
    // écrire le moindre fichier, ce n'est PAS un demi-succès : on renvoie
    // `no_change` (→ success:false), ce qui déclenche la récupération/
    // replanification au lieu de laisser croire à une réussite partielle.
    if (!wroteSomething && this.expectsWrites(session, plan)) return "no_change";

    // La VÉRIFICATION hashée est l'arbitre, pas le simple fait d'avoir écrit.
    // On consulte le WorkspaceState : chaque fichier modifié doit être "verified"
    // avec un hash courant concordant, sinon la mission n'est pas un succès.
    const report = session.workspace.completionReport(session.filesModified);
    const allWritesVerified = wroteSomething && report.passed;

    // Un fichier bloqué par la politique de réparation (no-progress / patch répété)
    // signale un échec de progression explicite.
    if (session.blockedFiles.size > 0 && !allWritesVerified) return "failed";

    if (allWritesVerified && !anyFailedStep) return "success";

    // Des écritures existent mais la vérification n'aboutit pas.
    if (wroteSomething && !allWritesVerified) {
      return this.budgetExhausted(session) ? "blocked" : "failed";
    }

    if (anyFailedStep && !wroteSomething) return "failed";
    if (anyFailedStep || anyToolError) return "partial";
    return "success";
  }

  /**
   * Construit un message de diagnostic lisible pour un run non réussi, à partir
   * des sources déjà présentes dans la session : le rapport de complétion hashé
   * du WorkspaceState (cause la plus précise), puis les issues de vérification,
   * enfin un repli générique par outcome. Garantit un `error` jamais vide quand
   * la mission échoue, sans inventer de cause.
   */
  private diagnoseFailure(
    session: RunSession,
    outcome: import("./types.js").AgentOutcome
  ): string | undefined {
    // 1. Rapport de complétion : pourquoi les écritures ne sont pas « verified ».
    if (session.filesModified.size > 0) {
      const report = session.workspace.completionReport(session.filesModified);
      if (!report.passed && report.errors.length > 0) {
        return report.errors.slice(0, 5).join(" ; ");
      }
    }

    // 2. Dernières issues de vérification observées.
    const issues = session.verifications.flatMap((v) => v.issues).filter(Boolean);
    if (issues.length > 0) {
      return [...new Set(issues)].slice(0, 5).join(" ; ");
    }

    // 3. Fichiers explicitement bloqués par la politique de réparation.
    if (session.blockedFiles.size > 0) {
      return `Progression bloquée sur : ${[...session.blockedFiles].join(", ")}`;
    }

    // 4. Repli par outcome (jamais vide pour un échec).
    switch (outcome) {
      case "no_change":
        return "Aucune modification produite alors qu'une écriture était attendue.";
      case "blocked":
        return "Mission bloquée : budget épuisé avant une vérification concluante.";
      case "failed":
        return "La mission a échoué sans diagnostic détaillé.";
      case "partial":
        return "Mission partiellement aboutie (certaines actions ont échoué).";
      default:
        return undefined;
    }
  }

  private async finish(
    task: AgentTask,
    session: RunSession,
    outcome: import("./types.js").AgentOutcome,
    error?: string,
    successOverride?: boolean
  ): Promise<AgentResult> {
    const final = error ? emptyFinal(error) : await this.finalize(task);
    session.usage.elapsedMs = Date.now() - session.startedAt;
    const success = successOverride ?? (outcome === "success" || outcome === "partial");

    // Bug C — Diagnostic non vide pour un échec issu de la terminaison NORMALE
    // de la boucle. Historiquement `finish` n'était appelé avec un `error`
    // explicite que pour un échec de planification ou un fail-fast ; un outcome
    // `failed`/`blocked` dérivé de la vérification hashée laissait `error`
    // undefined → ProgressNotifier affichait « échouée: » (message vide). On
    // agrège ici la vraie cause (issues de vérification, fichiers bloqués) pour
    // la rendre exploitable côté UI/logs, SANS court-circuiter `finalize()`.
    const resolvedError = error ?? (success ? undefined : this.diagnoseFailure(session, outcome));

    const result: AgentResult = {
      taskId: session.taskId,
      role: session.agent.role,
      goal: task.goal,
      success,
      outcome,
      plan: session.lastPlan ?? { intent: task.goal, steps: [], successCriteria: [], rationale: "" },
      observations: session.observations,
      verifications: session.verifications,
      recoveries: session.recoveries,
      filesRead: [...session.readFilesSeen],
      filesModified: [...session.filesModified],
      toolsExecuted: [...new Set(session.toolsExecuted)],
      final,
      budgetUsage: session.usage,
      durationMs: session.usage.elapsedMs,
      error: resolvedError,
    };

    this.events?.emit({ type: "workflow:completed", workflowId: session.taskId, success });
    log.info(
      `[${session.taskId.slice(0, 8)}] ${success ? "✅" : "❌"} ${session.agent.name} — ` +
        `outcome=${outcome} | ${result.filesModified.length} fichier(s) | ` +
        `${session.usage.toolCalls} appel(s) outil | ${session.usage.iterations} itération(s) | ` +
        `${(result.durationMs / 1000).toFixed(1)}s`
    );
    this.session = null;
    return result;
  }

  private failFast(
    task: AgentTask,
    taskId: string,
    startedAt: number,
    error: string
  ): AgentResult {
    log.error(`[${taskId.slice(0, 8)}] ${error}`);
    return {
      taskId,
      role: task.role,
      goal: task.goal,
      success: false,
      outcome: "failed",
      plan: { intent: task.goal, steps: [], successCriteria: [], rationale: "" },
      observations: [],
      verifications: [],
      recoveries: [],
      filesRead: [],
      filesModified: [],
      toolsExecuted: [],
      final: emptyFinal(error),
      budgetUsage: { ...emptyBudgetUsage(), elapsedMs: Date.now() - startedAt },
      durationMs: Date.now() - startedAt,
      error,
    };
  }

  private requireSession(): RunSession {
    if (!this.session) {
      throw new Error("AgenticRuntime: aucune session active. Appelez run() (les phases ne sont pas réentrantes hors run).");
    }
    return this.session;
  }

  /**
   * Amorce une session sans appeler le LLM. RÉSERVÉ AUX TESTS : permet de
   * valider les phases déterministes (verify/recover, budget, WorkspaceState,
   * AgentRepairLoop) de façon hermétique, sans réseau ni clés API.
   */
  _seedSessionForTest(task: AgentTask): RunSession {
    const budget = normalizeBudget({ ...this.defaultBudget, ...task.budget });
    const agent = getAgentDefinitionOrThrow(task.role);
    const tools = resolveAgentTools(agent.capabilities, this.registry);
    const workspace = new WorkspaceState(async (path: string) => {
      const res = (await this.registry.call("read_project_file", { path, full: true })) as
        | { content?: string } | undefined;
      if (typeof res?.content !== "string") throw new Error("read failed");
      return res.content;
    });
    const session: RunSession = {
      taskId: task.id ?? "test-task",
      agent,
      tools,
      goalText: [task.goal, task.instructions].filter(Boolean).join(" "),
      observations: [],
      verifications: [],
      recoveries: [],
      filesModified: new Set(),
      toolsExecuted: [],
      usage: emptyBudgetUsage(),
      budget,
      startedAt: Date.now(),
      replans: 0,
      phase: "discovery",
      readCache: new Map(),
      readFilesSeen: new Set(),
      workspace,
      repairLoops: new Map(),
      blockedFiles: new Set(),
      lastPatchByFile: new Map(),
    };
    this.session = session;
    return session;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// État interne d'une exécution
// ═══════════════════════════════════════════════════════════════════════════

interface RunSession {
  taskId: string;
  agent: AgentDefinition;
  tools: ToolDeclaration[];
  /** Objectif en langage naturel (goal + instructions) — sert au signal d'écriture. */
  goalText: string;
  /** Inventaire des fichiers du projet, chargé à la demande (suggestions de chemins). */
  fileInventory?: string[];
  observations: Observation[];
  verifications: Verification[];
  recoveries: Recovery[];
  filesModified: Set<string>;
  toolsExecuted: string[];
  usage: BudgetUsage;
  budget: AgentBudget;
  startedAt: number;
  pendingInstruction?: string;
  replans: number;
  lastPlan?: Plan;
  /** Phase courante de la boucle (règle d'arrêt intelligente). */
  phase: AgentPhase;
  /** Cache des résultats d'outils de lecture (clé = nom+params). */
  readCache: Map<string, unknown>;
  /** Fichiers déjà lus (déduplication du compteur filesRead). */
  readFilesSeen: Set<string>;
  /** État authoritatif adressé par contenu (hash before/after, vérification). */
  workspace: WorkspaceState;
  /** Politique de réparation bornée par fichier (progrès / stall / stop). */
  repairLoops: Map<string, AgentRepairLoop>;
  /** Fichiers bloqués par le diagnostic de non-progression. */
  blockedFiles: Set<string>;
  /** Dernier patch appliqué par fichier (détection de patch identique répété). */
  lastPatchByFile: Map<string, string>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Utilitaires purs
// ═══════════════════════════════════════════════════════════════════════════

function emptyFinal(error: string): FinalResult {
  return { summary: error, details: error, deliverables: [], suggestions: [] };
}

function clampResult(result: unknown): unknown {
  if (typeof result === "string") {
    return result.length > MAX_RESULT_CHARS ? `${result.slice(0, MAX_RESULT_CHARS)}…` : result;
  }
  return result;
}

/** Clé de cache stable pour un appel d'outil de lecture. */
function cacheKey(name: string, parameters: Record<string, unknown>): string {
  let params: string;
  try {
    params = JSON.stringify(parameters, Object.keys(parameters).sort());
  } catch {
    params = String(parameters);
  }
  return `${name}:${params}`;
}

/** Extrait un chemin de fichier des paramètres d'un appel d'outil. */
function extractPath(parameters: Record<string, unknown>): string | undefined {
  if (typeof parameters.path === "string") return parameters.path;
  if (typeof parameters.file === "string") return parameters.file;
  if (typeof parameters.filePath === "string") return parameters.filePath;
  return undefined;
}

/** Normalise un chemin (slashes, préfixe ./) pour servir de clé stable. */
function normPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * Détecte un échec APPLICATIF dans le résultat d'un outil : les handlers de skill
 * signalent une erreur en RÉSOLVANT avec `{ error: "..." }` ou
 * `{ status: "failed" }` plutôt qu'en levant une exception (ces retours sont
 * métrés `success:true` par le ToolRegistry). Retourne le message d'erreur si
 * c'en est un, sinon `undefined`. Utilisé pour ne pas comptabiliser une écriture
 * qui a en réalité échoué (refus sandbox, searchText introuvable, fichier
 * protégé…).
 */
function toolResultError(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const r = result as { error?: unknown; status?: unknown; ok?: unknown };
  if (typeof r.error === "string" && r.error.trim().length > 0) return r.error;
  if (r.status === "failed" || r.status === "error") {
    return typeof r.error === "string" ? r.error : `statut d'outil "${String(r.status)}"`;
  }
  return undefined;
}

/** Type guard : le résultat de verify_file contient-il un VerificationRecord ? */
function extractVerificationRecord(result: unknown): VerificationRecord | null {
  if (!result || typeof result !== "object") return null;
  const record = (result as { verificationRecord?: unknown }).verificationRecord as
    | Partial<VerificationRecord>
    | undefined;
  if (
    record &&
    typeof record.contentHash === "string" &&
    typeof record.hashBefore === "string" &&
    typeof record.hashAfter === "string" &&
    typeof record.ok === "boolean" &&
    ["success", "failed", "stale"].includes(record.status ?? "")
  ) {
    return record as VerificationRecord;
  }
  return null;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/** Extrait le premier objet JSON valide d'un texte (tolérant aux fences ```json). */
function parseJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\" && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}


