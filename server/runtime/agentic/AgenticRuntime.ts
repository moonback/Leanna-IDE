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
import { AsyncLocalStorage } from "node:async_hooks";
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
import { parseFinalReport, noteItems, proposedDelegations } from "../../agents/FinalReportParser.js";
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
  type ExecutionTrace,
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
const VERIFY_TOOL_SET = new Set([...VERIFY_TOOLS, "verify_format", "verify_run_script", "quality_loop", "run_project_command"]);

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

const MAX_HISTORY_CHARS = 60_000;

/**
 * Nombre maximum d'étapes retenues dans un plan. Chaque étape coûte au moins un
 * tour LLM : un plan de 10 micro-étapes épuisait le budget d'itérations avant
 * l'écriture. Le modèle est invité à regrouper (lire + modifier = une étape).
 */
const MAX_PLAN_STEPS = 6;
const MAX_RESULT_CHARS = 4_000;

/**
 * Nombre maximum de relances forcées « produis le livrable » qu'un agent
 * capable d'écrire peut recevoir avant qu'on le laisse conclure. Évite une
 * boucle si le modèle refuse obstinément d'appeler un outil d'écriture.
 */
const Executor_MAX_FORCED_WRITE_NUDGES = 3;

/**
 * Nombre d'itérations CONSÉCUTIVES où l'agent appelle des outils (lecture,
 * raisonnement…) sans jamais écrire, au-delà duquel on force une consigne
 * d'écriture et le passage en phase « write ».
 *
 * Le garde `prematureNarration` existant ne couvre que le cas « l'agent conclut
 * SANS appeler d'outil » (`calls.length === 0`). Observé en prod : un agent
 * producteur d'artefact qui appelle `read_file_outline`/`read_project_file`/
 * `reasoning_think` à CHAQUE tour (`calls.length > 0`) échappait à ce garde et
 * explorait jusqu'au budget (8 itérations, 95s, 0 fichier). `reasoning_think`
 * étant classé « other », il ne consommait même pas le quota de lecture. Ce
 * second garde ferme ce trou en comptant les itérations improductives.
 */
const MAX_UNPRODUCTIVE_ITERATIONS = 4;

/**
 * Détecte un échec métier dans le RÉSULTAT d'un outil (le handler n'a pas levé
 * mais signale un échec). Reconnaît les conventions `{ error }`, `{ ok:false }`,
 * `{ success:false }`, `{ status:"failed"|"error" }`, `exitCode != 0`,
 * `statusCode >= 400`. Retourne un message lisible, ou `null` si succès.
 * Aligné sur `Executor.detectSkillFailure` pour un comportement cohérent.
 */
function detectResultError(result: unknown): string | null {
  if (result === null || result === undefined) return null;
  if (typeof result !== "object") return null;
  const r = result as Record<string, unknown>;

  if ("error" in r && r.error) {
    const base = typeof r.error === "string" ? r.error : "Erreur retournée par l'outil";
    const withAction = typeof r.action === "string" ? `${base} — ${r.action}` : base;
    return withFailureDetails(withAction, r);
  }
  if (r.ok === false || r.success === false) {
    const base =
      (typeof r.message === "string" && r.message) ||
      (typeof r.stderr === "string" && r.stderr) ||
      "L'outil a signalé un échec (ok/success = false).";
    return withFailureDetails(base, r);
  }
  if (typeof r.status === "string") {
    const s = r.status.toLowerCase();
    if (s === "failed" || s === "error" || s === "failure") {
      const base = (typeof r.message === "string" && r.message) || `L'outil a renvoyé status="${r.status}".`;
      return withFailureDetails(base, r);
    }
  }
  if (typeof r.exitCode === "number" && r.exitCode !== 0) {
    return `L'outil a terminé avec exitCode=${r.exitCode}.`;
  }
  if (typeof r.statusCode === "number" && r.statusCode >= 400) {
    return `L'outil a renvoyé un statut HTTP ${r.statusCode}.`;
  }
  return null;
}

/**
 * Enrichit un message d'échec générique avec les détails structurés joints par
 * les skills de vérification (`parsedErrors` de `verify_typecheck`/`verify_file`/
 * `verify_lint`, ou `output` brut tsc). Sans ça, un agent délégué ne recevait
 * que « Erreurs de typage détectées (code inconnu) » — inexploitable — et
 * bouclait sur l'échec du typecheck. Aligné sur `Executor.withFailureDetails`.
 */
function withFailureDetails(base: string, r: Record<string, unknown>): string {
  const MAX_LISTED = 20;

  const parsed = r.parsedErrors;
  if (Array.isArray(parsed) && parsed.length > 0) {
    const lines = parsed.slice(0, MAX_LISTED).map((e) => {
      const err = e as Record<string, unknown>;
      const file = typeof err.file === "string" ? err.file : "?";
      const line = err.line ?? "?";
      const col = err.column ?? err.col ?? "?";
      const code = typeof err.code === "string" ? err.code : "";
      const msg =
        typeof err.message === "string"
          ? err.message
          : typeof err.text === "string"
            ? err.text
            : "";
      const codePart = code ? ` ${code}` : "";
      return `  - ${file}:${line}:${col}${codePart} ${msg}`.trimEnd();
    });
    const extra =
      parsed.length > MAX_LISTED ? `\n  … et ${parsed.length - MAX_LISTED} autre(s).` : "";
    return `${base}\n${lines.join("\n")}${extra}`;
  }

  if (typeof r.output === "string" && r.output.trim()) {
    const out = r.output.trim();
    const MAX_OUTPUT = 1500;
    const clipped =
      out.length > MAX_OUTPUT ? `${out.slice(0, MAX_OUTPUT)}\n  … (sortie tronquée)` : out;
    return `${base}\n${clipped}`;
  }

  return base;
}

/** Classe un outil par nature, pour la comptabilité séparée et la règle d'arrêt. */
function classifyTool(name: string): ToolKind {
  if (WRITE_TOOLS.has(name)) return "write";
  if (VERIFY_TOOL_SET.has(name)) return "verify";
  if (READ_TOOLS.has(name)) return "read";
  return "other";
}

/**
 * Un agent est « producteur d'artefact » s'il dispose d'au moins un outil
 * d'écriture. Pour ces agents, une réponse purement narrative (0 tool_call,
 * 0 écriture) n'est PAS une complétion valide : la tâche attend un artefact.
 * Les agents purement analytiques (researcher, planner, summarizer…) n'ont
 * aucun outil d'écriture et conservent le droit de conclure en texte.
 */
function agentCanWrite(tools: readonly ToolDeclaration[]): boolean {
  return tools.some((t) => WRITE_TOOLS.has(t.name));
}

/**
 * Un agent peut-il invoquer un outil de vérification (verify_file, …) ?
 * Tous les rôles n'ont pas cette capacité (ex. `architect` ne l'a pas par
 * défaut) : la relance forcée vers l'écriture ne doit pas orienter l'agent
 * vers un outil absent de sa boîte à outils, sinon il tente un appel qui sera
 * refusé par la PermissionPolicy et gaspille son budget d'itérations.
 */
function agentCanVerify(tools: readonly ToolDeclaration[]): boolean {
  return tools.some((t) => VERIFY_TOOL_SET.has(t.name));
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

  /**
   * Session de l'exécution COURANTE, isolée par contexte asynchrone.
   *
   * Le runtime est un singleton partagé par l'orchestrateur, et le scheduler
   * lance les tâches prêtes EN PARALLÈLE (`Promise.allSettled`). Avec un simple
   * champ d'instance, la tâche B écrasait la session de la tâche A pendant ses
   * `await` : A planifiait/agissait avec l'agent et les outils de B, puis
   * échouait sur « aucune session active » quand B se terminait.
   * `AsyncLocalStorage` donne à chaque `run()` sa propre session.
   */
  private readonly sessionScope = new AsyncLocalStorage<RunSession>();
  /** Session amorcée hors `run()` — réservé à `_seedSessionForTest`. */
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
    if (!hasAgent(task.role)) {
      return this.failFast(task, task.id ?? randomUUID(), startedAt, `Agent "${task.role}" introuvable`);
    }
    const session = this.createSession(task, startedAt);
    return this.sessionScope.run(session, () => this.runSession(task, session));
  }

  /** Construit l'état d'exécution d'une tâche (agent, outils, budget, workspace). */
  private createSession(task: AgentTask, startedAt: number): RunSession {
    const taskId = task.id ?? randomUUID();
    // Le budget est normalisé : maxToolCalls = somme des quotas de phase absolus.
    const budget: AgentBudget = normalizeBudget({ ...this.defaultBudget, ...task.budget });
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
    return session;
  }

  private async runSession(task: AgentTask, session: RunSession): Promise<AgentResult> {
    const { taskId, agent, tools } = session;
    log.info(
      `[${taskId.slice(0, 8)}] ▶ ${agent.name} — objectif: "${truncate(task.goal, 120)}" | ` +
        `${tools.length} outil(s) réellement disponible(s) sur ${agent.capabilities.length} déclaré(s)`
    );

    // Annulation précoce : si le signal est déjà déclenché, inutile de planifier.
    if (task.signal?.aborted) {
      return this.finish(task, session, "blocked", "Tâche annulée avant la planification.");
    }

    let plan: Plan;
    try {
      // ── UNDERSTAND + PLAN ──
      task.onProgress?.("planning");
      // La planification est un unique appel LLM : on le borne par un mur
      // temporel dur (dérivé du budget), sinon un provider lent/suspendu peut
      // bloquer la tâche indéfiniment sur « Planification ».
      plan = await this.withPlanningGuard(session, task.signal, () => this.plan(task));
      session.lastPlan = plan;
      this.emitTrace(task, session);
    } catch (err) {
      const aborted = task.signal?.aborted || (err as Error).name === "AbortError";
      return this.finish(
        task,
        session,
        aborted ? "blocked" : "failed",
        aborted ? "Tâche annulée pendant la planification." : `Échec de la planification: ${(err as Error).message}`,
      );
    }

    // ── Boucle ACT → OBSERVE → VERIFY → (NEXT | RECOVER) ──
    task.onProgress?.("acting");
    let stepIdx = 0;
    let verifyingAnnounced = false;
    while (stepIdx < plan.steps.length) {
      if (task.signal?.aborted) {
        log.warn(`[${taskId.slice(0, 8)}] 🛑 Annulation demandée — arrêt de la boucle`);
        return this.finish(task, session, "blocked", "Tâche annulée par l'utilisateur.");
      }
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
      if (!verifyingAnnounced) {
        task.onProgress?.("verifying");
        verifyingAnnounced = true;
      }
      const verification = await this.verify(step, observation);
      session.verifications.push(verification);

      if (verification.passed) {
        step.status = "done";
        this.emitTrace(task, session);
        stepIdx++;
        // Si le modèle a produit une réponse finale, on peut clore tôt.
        if (observation.isFinal && this.allRemainingTrivial(plan, stepIdx)) break;
        continue;
      }

      // ── FAILURE → RECOVER ──
      step.status = "failed";
      this.emitTrace(task, session);
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
    task.onProgress?.("finalizing");
    const outcome = this.assessOutcome(session, plan);
    // Seul un outcome "success" est un succès : un "partial" garde au moins une
    // étape ou un outil en échec (ex. typecheck rouge) et ne doit ni marquer la
    // tâche "completed" ni débloquer les tâches qui en dépendent.
    const success = outcome === "success";

    // ── Récapitulatif diagnostique (audit) ─────────────────────────────────
    // Rend explicite, en fin de run, pourquoi un agent producteur a pu finir
    // sans livrable. Cas typique observé : des écritures ONT été tentées mais
    // ont toutes échoué (soft errors) → filesModified vide → outcome=partial.
    const writeAttempts = session.observations
      .flatMap((o) => o.toolOutcomes)
      .filter((t) => WRITE_TOOLS.has(t.invocation.name));
    const failedWrites = writeAttempts.filter((t) => !t.success);
    if (agentCanWrite(session.tools) && session.filesModified.size === 0) {
      if (writeAttempts.length > 0) {
        const reasons = Array.from(
          new Set(failedWrites.map((t) => truncate(t.error ?? "raison inconnue", 120)))
        ).slice(0, 3);
        log.warn(
          `[${session.taskId.slice(0, 8)}] ⚠️ Aucun livrable écrit malgré ${writeAttempts.length} tentative(s) d'écriture ` +
            `(${failedWrites.length} en échec). Raisons: ${reasons.join(" | ") || "n/a"}`
        );
      } else {
        log.warn(
          `[${session.taskId.slice(0, 8)}] ⚠️ Aucun livrable écrit et AUCUNE tentative d'écriture ` +
            `(l'agent n'a jamais appelé write_project_file/modify_project_file).`
        );
      }
    }

    return this.finish(task, session, outcome, undefined, success);
  }

  /**
   * Borne la phase de planification par un mur temporel dur et par le signal
   * d'annulation. Sans cela, `plan()` (un unique appel LLM sans timeout propre)
   * peut suspendre la tâche indéfiniment — la cause racine du blocage sur
   * « 1/5 Planification ». La fenêtre est dérivée du budget : au plus la moitié
   * du temps d'exécution, plafonnée à 90s, avec un plancher de 30s.
   */
  private async withPlanningGuard<T>(
    session: RunSession,
    signal: AbortSignal | undefined,
    fn: () => Promise<T>,
  ): Promise<T> {
    const windowMs = Math.min(90_000, Math.max(30_000, Math.floor(session.budget.maxExecutionTimeMs / 2)));
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;

    const guard = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Planification interrompue après ${Math.round(windowMs / 1000)}s (timeout).`)),
        windowMs,
      );
      if (signal) {
        if (signal.aborted) {
          const e = new Error("Planification annulée.");
          e.name = "AbortError";
          reject(e);
          return;
        }
        onAbort = () => {
          const e = new Error("Planification annulée.");
          e.name = "AbortError";
          reject(e);
        };
        signal.addEventListener("abort", onAbort, { once: true });
      }
    });

    try {
      return await Promise.race([fn(), guard]);
    } finally {
      if (timer) clearTimeout(timer);
      if (signal && onAbort) signal.removeEventListener("abort", onAbort);
    }
  }

  // ─── plan : UNDERSTAND + PLAN ───────────────────────────────────────────────

  async plan(task: AgentTask): Promise<Plan> {
    const session = this.requireSession();
    const { agent, tools } = session;

    const toolNames = tools.map((t) => t.name).join(", ") || "(aucun)";
    const planPrompt = [
      `OBJECTIF UTILISATEUR : ${task.goal}`,
      task.instructions ? `INSTRUCTIONS : ${task.instructions}` : "",
      task.files?.length ? `FICHIERS DE CONTEXTE : ${task.files.join(", ")}` : "",
      `OUTILS QUE TU POURRAS UTILISER : ${toolNames}`,
      "",
      "Analyse l'intention puis produis un plan d'action minimal et vérifiable.",
      "RÈGLES DU PLAN :",
      `- ${MAX_PLAN_STEPS} étapes au maximum ; chaque étape = un tour d'exécution qui peut enchaîner plusieurs outils (ex. lire puis modifier).`,
      "- Ne cite que des outils de la liste ci-dessus.",
      agentCanWrite(tools)
        ? "- Tu es producteur d'artefact : le plan DOIT contenir une étape d'écriture puis une étape de vérification."
        : "- Tu es en lecture seule : la dernière étape produit la réponse finale (analyse, rapport, recommandations).",
      "- Les critères de succès sont OBSERVABLES (fichier écrit, typecheck à 0 erreur, test vert…), jamais « c'est fait ».",
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
      .slice(0, MAX_PLAN_STEPS)
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

  // ─── execute : ACT + OBSERVE RESULT (boucle d'outils interne) ───────────────

  async execute(task: AgentTask, step: PlanStep): Promise<Observation> {
    const session = this.requireSession();
    const { agent, tools, usage } = session;

    usage.iterations += 1;

    const iteration = usage.iterations;
    const systemPrompt = this.buildSystemPrompt(agent, tools, session);
    const stepPrompt = [
      `OBJECTIF GLOBAL : ${task.goal}`,
      task.instructions ? `INSTRUCTIONS : ${task.instructions}` : "",
      task.files?.length ? `FICHIERS DE CONTEXTE : ${task.files.join(", ")}` : "",
      session.lastPlan ? renderPlanProgress(session.lastPlan, step) : "",
      `ÉTAPE COURANTE : ${step.description}`,
      step.suggestedTools?.length ? `OUTILS SUGGÉRÉS : ${step.suggestedTools.join(", ")}` : "",
      step.verification ? `VÉRIFICATION ATTENDUE : ${step.verification}` : "",
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

    for (const call of calls) {
      const kind = classifyTool(call.name);

      // Gate de budget SÉLECTIF par nature d'appel.
      // - read/other : bloqués dès que le budget non-critique est épuisé.
      // - write/verify : autorisés tant que le budget réservé aux actions
      //   critiques n'est pas dépassé (les corrections doivent pouvoir aboutir).
      const gate = this.admitCall(session, kind);
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

    // ── Garde anti « narration sans action » ──
    // Un agent producteur d'artefact qui CONCLUT (aucun nouvel appel d'outil)
    // sans avoir produit le MOINDRE livrable (aucune écriture confirmée) n'a pas
    // « terminé » : il a rendu sa réponse en prose au lieu de persister un
    // fichier. On refuse ce faux final et on le relance vers l'écriture.
    //
    // Correctif (observé en prod) : la condition précédente exigeait AUSSI
    // `toolsExecuted.length === 0`, donc un agent qui avait lu/cherché (8 appels
    // de lecture) mais jamais écrit passait entre les mailles → outcome=partial,
    // 0 fichier, livrable perdu. On ne regarde plus que les ÉCRITURES réelles.
    // Garde-fou : la relance est bornée (MAX_FORCED_WRITE_NUDGES) pour qu'un
    // modèle qui refuse obstinément d'écrire ne boucle pas jusqu'au budget.
    const noArtifactYet = session.filesModified.size === 0;
    const nudges = session.forcedWriteNudges ?? 0;
    const prematureNarration =
      calls.length === 0 &&
      noArtifactYet &&
      agentCanWrite(tools) &&
      nudges < Executor_MAX_FORCED_WRITE_NUDGES;

    if (prematureNarration) {
      session.forcedWriteNudges = nudges + 1;
      // N'oriente vers verify_file que si l'agent dispose réellement d'un outil
      // de vérification. Sinon, l'instruction le pousserait vers un appel refusé
      // par la PermissionPolicy (observé sur l'agent Architecte, sans verify_file).
      const verifyHint = agentCanVerify(tools)
        ? " puis vérifie le résultat avec verify_file."
        : " Ne tente aucune vérification : conclus dès que le fichier est écrit.";
      session.pendingInstruction =
        "Tu as conclu sans produire de LIVRABLE : aucun fichier n'a été écrit. " +
        "Ne décris pas le document — ÉCRIS-LE maintenant via un tool_calls JSON " +
        "(write_project_file pour créer, ou modify_project_file si le fichier existe). " +
        "Choisis un chemin de sortie explicite (ex. docs/<sujet>.md) si aucun n'est fourni," +
        verifyHint +
        " Une réponse finale sans écriture de fichier est un ÉCHEC.";
      log.warn(
        `[${session.taskId.slice(0, 8)}] ⚠️ ${agent.name} — conclusion sans livrable écrit ` +
          `(itération ${iteration}, relance ${session.forcedWriteNudges}/${Executor_MAX_FORCED_WRITE_NUDGES}) → relance forcée vers l'écriture`
      );
    }

    // ── Garde anti-boucle d'EXPLORATION (appels d'outils sans écriture) ──
    // Complète `prematureNarration` : ce dernier ne mord que si l'agent conclut
    // sans aucun appel (`calls.length === 0`). Ici on traite l'agent qui appelle
    // des outils à chaque tour (lecture, reasoning_think…) sans jamais écrire.
    // On compte les itérations improductives consécutives ; au seuil, on force
    // une consigne d'écriture et le passage en phase « write ».
    const wroteThisIteration = toolOutcomes.some(
      (o) => o.success && WRITE_TOOLS.has(o.invocation.name)
    );
    if (wroteThisIteration || session.filesModified.size > 0) {
      session.unproductiveStreak = 0;
      session.explorationNudged = false;
    } else if (calls.length > 0) {
      session.unproductiveStreak = (session.unproductiveStreak ?? 0) + 1;
    }

    if (
      agentCanWrite(tools) &&
      session.filesModified.size === 0 &&
      !session.explorationNudged &&
      (session.unproductiveStreak ?? 0) >= MAX_UNPRODUCTIVE_ITERATIONS
    ) {
      session.explorationNudged = true;
      session.phase = "write";
      const verifyHint = agentCanVerify(tools)
        ? " puis vérifie avec verify_file / verify_typecheck."
        : " Ne tente aucune vérification : conclus dès que le fichier est écrit.";
      session.pendingInstruction =
        `Tu explores depuis ${session.unproductiveStreak} itérations sans produire de LIVRABLE. ` +
        "Arrête de lire/analyser/raisonner et ÉCRIS maintenant le résultat via un tool_calls JSON " +
        "(write_project_file pour créer, ou modify_project_file si le fichier existe). " +
        "Choisis un chemin de sortie explicite (ex. docs/<sujet>.md) si aucun n'est fourni," +
        verifyHint;
      log.warn(
        `[${session.taskId.slice(0, 8)}] 🧭 ${agent.name} — boucle d'exploration détectée ` +
          `(${session.unproductiveStreak} itérations d'outils sans écriture) → consigne d'écriture forcée (itération ${iteration})`
      );
    }

    const observation: Observation = {
      iteration,
      reasoning: text,
      toolOutcomes,
      // Narration prématurée : NON finale → la boucle poursuit et re-sollicite.
      isFinal: calls.length === 0 && !prematureNarration,
    };
    session.observations.push(observation);
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
    this.countCall(session, kind);
    session.toolsExecuted.push(name);
    this.events?.emit({ type: "tool:called", toolName: name, agentId: session.agent.role });

    try {
      // Étape d'idempotence = itération : un appel à effet de bord dupliqué
      // dans le même tour est dédoublonné, une ré-exécution volontaire dans un
      // tour suivant (réparation, nouveau test) s'exécute réellement.
      const result = await this.registry.call(name, parameters, {
        agentId: session.agent.role,
        idempotencyScope: { missionId: session.taskId, stepId: `iter-${session.usage.iterations}` },
      });
      const durationMs = Date.now() - start;

      // ── Détection d'échec « soft » AVANT toute comptabilité (audit) ────────
      // Un handler peut RÉUSSIR l'appel (pas d'exception) tout en signalant un
      // échec métier via { error } / { ok:false } / { status:"failed" }. C'est
      // précisément le cas des écritures refusées (« Fichier introuvable »,
      // sandbox non prêt, fichier critique bloqué). On DOIT le détecter avant
      // d'ajouter le fichier à filesModified, sinon une écriture ratée est
      // comptée comme un livrable et l'outcome devient trompeur.
      const softError = detectResultError(result);
      if (softError) {
        log.warn(
          `[${session.taskId.slice(0, 8)}]    ✗ ${name} (${kind}) a échoué: ${truncate(softError, 180)}`
        );
        return {
          invocation: { name, parameters },
          success: false,
          error: softError,
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
        invalidateReadCache(session.readCache, name, path);
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
        log.info(`[${session.taskId.slice(0, 8)}]    ✓ ${name} → ${extractPath(parameters) ?? "?"} (${durationMs}ms)`);
      } else {
        log.info(`[${session.taskId.slice(0, 8)}]    ✓ ${name} (${kind}, ${durationMs}ms)`);
      }

      // Comptabilité des fichiers lus distincts + mise en cache.
      if (kind === "read") {
        const path = extractPath(parameters);
        if (path && !session.readFilesSeen.has(path)) {
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
      log.warn(
        `[${session.taskId.slice(0, 8)}]    ✗ ${name} (${kind}) exception: ${truncate((err as Error).message, 160)}`
      );
      return {
        invocation: { name, parameters },
        success: false,
        error: (err as Error).message,
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
      const res = await this.invokeTool(session, "verify_file", { path });
      const record = extractVerificationRecord(res.result);
      if (record) {
        // Le fichier doit être relu avant recordVerification (invariant WorkspaceState).
        await session.workspace.reread(path, "read").catch(() => undefined);
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

    // 3. Réponse sans action.
    //    - Agent NON producteur d'artefact (analytique) OU travail déjà produit
    //      en amont → une conclusion textuelle est légitime.
    //    - Agent producteur d'artefact n'ayant encore RIEN fait → la narration
    //      prématurée est un échec d'étape : on force la récupération (nudge
    //      d'écriture) au lieu de valider une tâche qui ne modifie rien.
    if (observation.toolOutcomes.length === 0) {
      const nothingDoneYet =
        session.filesModified.size === 0 && session.toolsExecuted.length === 0;
      const prematureNarration = nothingDoneYet && agentCanWrite(session.tools);

      if (prematureNarration) {
        issues.push(
          "Réponse narrative sans aucune action : l'agent doit produire un artefact " +
            "(écriture de fichier) avant de conclure."
        );
      } else if (observation.isFinal) {
        checks.push("réponse finale sans action");
      }
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

    // Chemin rapide : l'agent a déjà rendu son rapport final au contrat XML
    // (<result><summary>…). On l'exploite directement au lieu de payer un appel
    // LLM supplémentaire (latence + coût) pour re-synthétiser la mission.
    const lastFinal = [...session.observations].reverse().find((o) => o.isFinal);
    const report = lastFinal ? parseFinalReport(lastFinal.reasoning) : null;
    if (report) {
      return {
        summary: report.summary,
        details: [report.deliverable, report.notes].filter(Boolean).join("\n\n"),
        // Les livrables PROUVÉS (écritures confirmées) priment sur la déclaration.
        deliverables: session.filesModified.size > 0 ? [...session.filesModified] : report.filesModified,
        suggestions: noteItems(report.notes).slice(0, 8),
        delegations: proposedDelegations(lastFinal!.reasoning, agent.role),
      };
    }

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

  /** Publie un instantané plan + budget vers l'appelant (UI en direct). */
  private emitTrace(task: AgentTask, session: RunSession): void {
    if (!task.onTrace || !session.lastPlan) return;
    try {
      task.onTrace(buildExecutionTrace(session.lastPlan, session));
    } catch (err) {
      log.debug(`onTrace a levé : ${(err as Error).message}`);
    }
  }

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
    kind: ToolKind
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

  /**
   * Fait avancer la phase courante selon la consommation du budget.
   * discovery → write dès que le quota de découverte est atteint (ou qu'une
   * écriture a déjà eu lieu). En recovery, la phase est pilotée par recover().
   */
  private advancePhase(session: RunSession): void {
    if (session.phase === "recovery" || session.phase === "verify") return;
    const { budget, usage } = session;
    if (session.phase === "discovery" && (usage.readCalls >= budget.maxRead || usage.writeCalls > 0)) {
      session.phase = "write";
    }
  }

  private allRemainingTrivial(plan: Plan, fromIdx: number): boolean {
    return plan.steps.slice(fromIdx).every((s) => s.status === "done" || s.status === "skipped");
  }

  private assessOutcome(session: RunSession, plan: Plan): import("./types.js").AgentOutcome {
    const anyFailedStep = plan.steps.some((s) => s.status === "failed");
    const wroteSomething = session.filesModified.size > 0;
    const anyToolError = session.observations.some((o) => o.toolOutcomes.some((t) => !t.success));

    // Aucune écriture ni aucun outil exécuté : rien n'a bougé.
    if (!wroteSomething && session.toolsExecuted.length === 0) return "no_change";

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

  private async finish(
    task: AgentTask,
    session: RunSession,
    outcome: import("./types.js").AgentOutcome,
    error?: string,
    successOverride?: boolean
  ): Promise<AgentResult> {
    const final = error ? emptyFinal(error) : await this.finalize(task);
    session.usage.elapsedMs = Date.now() - session.startedAt;
    const success = successOverride ?? outcome === "success";

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
      error,
    };

    this.events?.emit({ type: "workflow:completed", workflowId: session.taskId, success });
    log.info(
      `[${session.taskId.slice(0, 8)}] ${success ? "✅" : "❌"} ${session.agent.name} — ` +
        `outcome=${outcome} | ${result.filesModified.length} fichier(s) | ` +
        `${session.usage.toolCalls} appel(s) outil | ${session.usage.iterations} itération(s) | ` +
        `${(result.durationMs / 1000).toFixed(1)}s`
    );
    if (this.session === session) this.session = null;
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
    const session = this.sessionScope.getStore() ?? this.session;
    if (!session) {
      throw new Error("AgenticRuntime: aucune session active. Appelez run() (les phases ne sont pas réentrantes hors run).");
    }
    return session;
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
  /** Nombre de relances forcées « produis le livrable » déjà injectées (borné). */
  forcedWriteNudges?: number;
  /**
   * Itérations consécutives avec appels d'outils mais SANS écriture. Remis à
   * zéro dès qu'un fichier est écrit. Alimente le garde anti-boucle d'exploration
   * (MAX_UNPRODUCTIVE_ITERATIONS).
   */
  unproductiveStreak?: number;
  /** Vrai une fois la consigne anti-exploration injectée (évite de spammer). */
  explorationNudged?: boolean;
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

/**
 * Invalide le cache de lecture après une écriture réussie. Sans cela, relire un
 * fichier qu'on vient de modifier resservait l'ANCIEN contenu : l'agent
 * vérifiait ou re-patchait une version périmée (searchText introuvable, boucle
 * de réparation). Les entrées du fichier écrit et toutes les recherches /
 * listings (potentiellement périmés) sont retirées ; un renommage ou une
 * écriture sans chemin identifiable vide tout le cache.
 */
function invalidateReadCache(cache: Map<string, unknown>, toolName: string, path: string | undefined): void {
  if (!path || toolName === "rename_project_file" || toolName === "delete_project_file") {
    cache.clear();
    return;
  }
  const variants = new Set([path, normPath(path), `./${normPath(path)}`].map((p) => JSON.stringify(p)));
  for (const key of [...cache.keys()]) {
    const toolPart = key.slice(0, key.indexOf(":"));
    if (toolPart === "search_in_files" || toolPart === "list_project_files") {
      cache.delete(key);
      continue;
    }
    for (const v of variants) {
      if (key.includes(v)) {
        cache.delete(key);
        break;
      }
    }
  }
}

function buildExecutionTrace(plan: Plan, session: RunSession): ExecutionTrace {
  const { usage, budget } = session;
  return {
    intent: plan.intent,
    successCriteria: [...plan.successCriteria],
    steps: plan.steps.map((s) => ({ description: s.description, status: s.status })),
    budget: {
      iterations: usage.iterations,
      maxIterations: budget.maxIterations,
      toolCalls: usage.toolCalls,
      maxToolCalls: budget.maxToolCalls,
      readCalls: usage.readCalls,
      writeCalls: usage.writeCalls,
      verifyCalls: usage.verifyCalls,
      recoveryCalls: usage.recoveryCalls,
    },
    recoveries: session.recoveries.length,
    replans: session.replans,
  };
}

/**
 * Vue compacte du plan pour le tour courant : l'agent sait où il en est, ce qui
 * reste à faire et quels critères prouveront la réussite — sans quoi chaque
 * tour ne voyait que l'étape isolée et perdait le fil sur les missions longues.
 */
function renderPlanProgress(plan: Plan, current: PlanStep): string {
  const marks: Record<PlanStep["status"], string> = {
    pending: "[ ]",
    running: "[▶]",
    verifying: "[▶]",
    done: "[x]",
    failed: "[!]",
    skipped: "[-]",
  };
  const lines = plan.steps.map((s) => `${s.id === current.id ? marks.running : marks[s.status] ?? "[ ]"} ${truncate(s.description, 140)}`);
  const idx = plan.steps.findIndex((s) => s.id === current.id) + 1;
  return [
    `PLAN (étape ${idx}/${plan.steps.length}) :`,
    ...lines,
    plan.successCriteria.length ? `CRITÈRES DE SUCCÈS : ${plan.successCriteria.map((c) => truncate(c, 120)).join(" | ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
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


