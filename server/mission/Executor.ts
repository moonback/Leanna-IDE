import { Mission } from "./Mission.js";
import { randomUUID } from "node:crypto";
import { Planner } from "./Planner.js";
import { ReflectionEngine, type ReflectionInput } from "./Reflection.js";
import { SkillScorer } from "./SkillScorer.js";
import type { MissionStatePort } from "./LocalMissionStore.js";
import { AutonomyPolicy } from "./AutonomyPolicy.js";
import { EvidenceEngine, type EvidenceInput, type CheckResult } from "../core/EvidenceEngine.js";
import type { LeannaSupervisor, RunnerOutcome, RecoveryDecision } from "../core/LeannaSupervisor.js";
import type {  PlannedAction,  ReflectionResult,
  MissionConfig,
  MissionPlan,
  MissionState,
  Goal,
} from "./types.js";
import { DEFAULT_MISSION_CONFIG } from "./types.js";
import { telemetryService } from "../observability/TelemetryService.js";
import { runWithTelemetryContext } from "../utils/textGeneration.js";
import { learningEngine } from "../knowledge/LearningEngine.js";
import type { LearningResult } from "../knowledge/types.js";
import { strategyMemory } from "../knowledge/StrategyMemory.js";
import { playbookStore, type PlaybookMissionInput } from "../knowledge/PlaybookStore.js";
import { projectProfile } from "../knowledge/ProjectProfile.js";
import { selfEvaluationEngine, type SelfEvalMissionView } from "./SelfEvaluation.js";
import { missionEvolutionStore } from "../knowledge/MissionEvolution.js";
import { PlanEstimator } from "./PlanEstimator.js";
import { guardUntrustedContent } from "../utils/promptInjectionGuard.js";
import { supervisionEnabledFromEnv } from "../core/supervisionConfig.js";
import * as path from "node:path";
import { SELF_ROOT } from "../utils/selfRoot.js";

// Plafond de caractères appliqué à chaque résultat d'action quand il est résumé
// pour la preuve passée au vérificateur LLM. 300 (ancienne valeur codée en dur)
// coupait souvent le contexte au mauvais endroit — par ex. le résumé d'un
// typecheck en échec — et poussait le LLM à mal juger. 1200 laisse de la marge
// tout en bornant la taille de la preuve.
const SUMMARY_RESULT_MAX_CHARS = 1200;

/** Évite d'exposer des secrets ou des payloads volumineux dans la file d'approbation UI. */
function sanitizeApprovalArgs(value: unknown, depth = 0): unknown {
  if (depth > 3) return '[profondeur limitée]';
  if (typeof value === 'string') return value.length > 300 ? value.slice(0, 300) + '…' : value;
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 10).map((item) => sanitizeApprovalArgs(item, depth + 1));
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 20);
    return Object.fromEntries(entries.map(([key, item]) => {
      if (/(password|passwd|secret|token|api[_-]?key|authorization|credential|cookie)/i.test(key)) {
        return [key, '[masqué]'];
      }
      return [key, sanitizeApprovalArgs(item, depth + 1)];
    }));
  }
  return String(value);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Executor — Boucle plan → agir → vérifier → corriger
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * L'Executor coordonne l'exécution d'une mission complète.
 *
 * Boucle principale:
 *   1. Planner décompose l'objectif en sous-objectifs
 *   2. Pour chaque sous-objectif:
 *      a. Planner planifie les actions (skills scorés)
 *      b. Executor exécute chaque action via le SkillHandler
 *      c. Reflection évalue le résultat
 *      d. Si échec → retry / replan / escalate
 *   3. Quand tous les sous-objectifs sont complétés → mission terminée
 *
 * L'Executor est le composant central qui fait le lien entre
 * le Planner, le SkillScorer, le Reflection Engine et le SkillManager.
 */
export class Executor {
  private planner: Planner;
  private reflection: ReflectionEngine;
  private scorer: SkillScorer;
  private skillHandler: SkillHandlerFn | null = null;
  private config: MissionConfig;
  private eventEmitter: ExecutorEventEmitter | null = null;

  /** Fonction LLM pour générer les arguments d'un skill au moment de l'exécution. */
  private llmArgGen: LLMTextFn | null = null;

  /** Fonction LLM pour valider les critères de succès d'un objectif. */
  private llmVerify: LLMTextFn | null = null;

  /** Schémas des outils (name → { description, parameters }) pour la génération d'arguments. */
  private toolSchemas: Map<string, ToolSchema> = new Map();

  /** Store de persistance (optionnel) : local, Supabase, ou composite. */
  private store: MissionStatePort | null = null;

  /**
   * Moteur de preuve optionnel (audit, point 11). Quand branché ET activé, la
   * vérification d'objectif s'appuie sur une PREUVE factuelle (checks dérivés
   * des résultats de skills) plutôt que sur le seul verdict LLM — « la preuve
   * prime sur la narration ». Rétrocompatible : absent → vérification LLM/
   * heuristique d'origine.
   */
  private evidence: EvidenceEngine | null = null;

  /**
   * Active la vérification par preuve. Par défaut lu depuis
   * `LEANNA_MISSION_EVIDENCE` (true/1), surchargé par `setEvidenceEngine`.
   */
  private evidenceVerification = false;

  /**
   * Autorité de gouvernance optionnelle (audit, point 5 / unification). Quand
   * branchée ET activée, l'exécution d'une mission transite DANS la boucle du
   * `LeannaSupervisor` : l'Executor devient le `MissionRunner`, le Supervisor
   * possède l'état durable (`MissionLifecycleState`), les snapshots/rollbacks,
   * la preuve et les décisions de récupération. Rétrocompatible : absent →
   * exécution directe (chemin par défaut inchangé).
   */
  private supervisor: LeannaSupervisor | null = null;
  /** Pre-write checkpoint hooks scoped by mission ID. */
  private readonly supervisorWriteHooks = new Map<string, (toolName: string, args: Record<string, unknown>) => Promise<void>>();

  /**
   * Active le mode supervisé. Par défaut lu depuis `LEANNA_SUPERVISED`
   * (true/1), surchargé par `setSupervisor`.
   */
  private supervisedMode = false;

  /** Curseur d'autonomie (optionnel). */
  private autonomy: AutonomyPolicy | null = null;

  /** Approbations en attente : décision + contexte minimal pour l'interface opérateur. */
  private pendingApprovals: Map<string, {
    resolve: (approved: boolean) => void;
    timer: NodeJS.Timeout;
    missionId: string;
    goalId: string;
    skill: string;
    args: Record<string, unknown>;
    reason: string;
    requestedAt: string;
    timeoutAt: string;
  }> = new Map();

  /** Délai d'attente d'une approbation avant refus par défaut (ms). */
  private approvalTimeoutMs = 5 * 60 * 1000;

  /** Missions actives */
  private activeMissions: Map<string, Mission> = new Map();
  /**
   * File des missions réelles (hors dry-run) : une seule s'exécute à la fois,
   * pour que deux missions n'écrivent jamais en parallèle dans le workspace
   * (AUDIT-017). shortcut: file globale car un seul workspace est actif à la fois ; passer à une file par racine si plusieurs workspaces deviennent simultanés.
   */
  private writeQueue: Promise<unknown> = Promise.resolve();
  private queuedMissions = new Set<string>();
  private writeRunning = false;

  /** Missions complétées (historique, max 50) */
  private completedMissions: Mission[] = [];
  private static readonly MAX_COMPLETED = 50;

  /**
   * IDs des missions déjà finalisées. Garde-fou d'idempotence pour
   * `finalizeMission` (annulation/timeout + fin naturelle ne doivent pas
   * finaliser deux fois la même mission).
   */
  private finalizedMissions: Set<string> = new Set();

  /**
   * Contrôleurs d'annulation par mission. Le signal associé est transmis au
   * `skillHandler` à chaque action ; `cancelMission` et le watchdog de timeout
   * l'abandonnent pour interrompre un skill en cours. (Audit, point 4.)
   */
  private abortControllers: Map<string, AbortController> = new Map();

  /** Retourne (en le créant au besoin) le contrôleur d'annulation d'une mission. */
  private getAbortController(missionId: string): AbortController {
    let controller = this.abortControllers.get(missionId);
    if (!controller) {
      controller = new AbortController();
      this.abortControllers.set(missionId, controller);
    }
    return controller;
  }

  /** Abandonne le signal d'une mission (interrompt le skill en cours) et nettoie. */
  private abortMission(missionId: string, reason: string): void {
    const controller = this.abortControllers.get(missionId);
    if (controller && !controller.signal.aborted) {
      try { controller.abort(new Error(reason)); } catch { /* best-effort */ }
    }
    this.abortControllers.delete(missionId);
  }

  /** Promesses des missions lancées en arrière-plan, pour les appelants autonomes. */
  private readonly missionRuns = new Map<string, Promise<void>>();
  /** Candidate lessons/proposals; never auto-applied by mission finalization. */
  private readonly learningResults = new Map<string, LearningResult>();
  /** Self-critique evaluations per mission (plan vs execution vs result). */
  private readonly selfEvaluations = new Map<string, import("./SelfEvaluation.js").SelfEvaluation>();
  /**
   * Plan initial (objectifs, outils, estimation coût/durée/risque) par mission.
   * Auparavant transmis UNIQUEMENT via l'événement `mission_plan` : un panneau
   * ouvert après le lancement (ou rechargé) ne le revoyait jamais.
   */
  private readonly missionPlans = new Map<string, MissionPlan>();

  /**
   * Missions mises en pause par l'utilisateur.
   * L'exécution boucle sur un point de contrôle tant que l'ID est présent ici.
   */
  private pausedMissions: Set<string> = new Set();

  /** Intervalle de sondage de l'état de pause (ms). */
  private static readonly PAUSE_POLL_MS = 500;

  /**
   * Intervalle de sondage du watchdog de timeout global (ms). Le temps n'est
   * compté que lorsque la mission tourne réellement (pas en pause).
   */
  private static readonly WATCHDOG_POLL_MS = 1000;

  /**
   * Missions interrompues (crash/redémarrage) rechargées depuis le store mais
   * NON relancées : elles attendent une décision explicite de l'utilisateur
   * (réactiver ou effacer). Clé = missionId → état rechargé + titre.
   * Tant qu'une mission est ici, elle n'est ni active ni relancée.
   */
  private pendingResumes: Map<string, { state: MissionState; title: string }> = new Map();

  /** Skills disponibles mémorisés pour relancer une mission réactivée. */
  private resumeAvailableSkills: string[] = [];

  /**
   * Outils d'EXPLORATION (lecture seule) : utiles pour comprendre le contexte,
   * mais ne produisent aucun livrable. Une boucle qui les rejoue sans jamais
   * basculer vers une action de production est le symptôme du bug « mission
   * exploratoire sans artefact ».
   */
  private static readonly EXPLORATION_TOOLS = new Set<string>([
    "read_project_file", "list_project_files", "read_file_outline",
    "analyze_project_file", "search_in_files", "get_workspace_info",
    "knowledge_semantic_search", "knowledge_search_entities",
    "knowledge_build_context", "knowledge_impact_analyze",
  ]);

  /**
   * Outils de PRODUCTION (écriture) : produisent un artefact concret. Leur
   * présence (réussie) dans un objectif prouve qu'il a dépassé l'exploration.
   */
  private static readonly WRITE_TOOLS = [
    "write_project_file", "modify_project_file", "patch_project_file",
    "create_project_directory", "rename_project_file",
  ];

  /** Tools whose handlers mutate workspace paths and require a pre-write snapshot. */
  private static readonly CHECKPOINT_WRITE_TOOLS = new Set([
    "write_project_file", "modify_project_file", "apply_patch", "patch_project_file",
    "create_project_directory", "rename_project_file", "delete_project_file",
    "delete_project_folder",
  ]);

  /**
   * Nombre d'actions d'exploration consécutives (sans aucune écriture réussie)
   * au-delà duquel on force une replanification orientée « produire un artefact ».
   */
  private static readonly EXPLORATION_LOOP_THRESHOLD = 4;

  /**
   * Suivi anti-boucle par objectif. `explorationStreak` compte les actions
   * d'exploration enchaînées sans écriture ; `producedArtifact` passe à true dès
   * qu'un outil d'écriture réussit ; `forcedArtifact` évite de forcer deux fois.
   */
  private loopGuards: Map<string, {
    explorationStreak: number;
    producedArtifact: boolean;
    forcedArtifact: boolean;
  }> = new Map();

  /**
   * Outils de RECHERCHE WEB. Observé en prod : l'exécuteur relance la même
   * recherche quasi identique 6-8 fois (reformulations mineures), brûlant des
   * tokens sans progresser. On déduplique sur une signature normalisée de la
   * requête.
   */
  private static readonly WEB_SEARCH_TOOLS = new Set<string>([
    "browser_web_search", "browser_research", "web_search", "web_fetch",
  ]);

  /**
   * Nombre maximal d'exécutions d'une même recherche web (signature normalisée)
   * tolérées au sein d'une mission avant de refuser la répétition.
   */
  private static readonly WEB_SEARCH_MAX_REPEATS = 2;

  /**
   * Signatures de recherches web déjà effectuées, par mission :
   * `missionId → (signature → nombre d'exécutions)`. Permet de couper une
   * boucle de reformulations équivalentes.
   */
  private webSearchSignatures: Map<string, Map<string, number>> = new Map();

  /** Estimateur coût / durée / risque avant exécution. */
  private planEstimator!: PlanEstimator;

  constructor(config: Partial<MissionConfig> = {}) {
    this.config = { ...DEFAULT_MISSION_CONFIG, ...config };
    this.scorer = new SkillScorer();
    this.planner = new Planner(this.scorer);
    this.reflection = new ReflectionEngine();
    this.planEstimator = new PlanEstimator(this.scorer);
    // Vérification par preuve activable par défaut via l'environnement.
    const raw = (process.env.LEANNA_MISSION_EVIDENCE ?? "").toLowerCase().trim();
    this.evidenceVerification = raw === "true" || raw === "1";
    // Mode supervisé (couture Supervisor) activable par défaut via l'environnement.
    this.supervisedMode = supervisionEnabledFromEnv();
  }

  // ─── Configuration ────────────────────────────────────────────────────────

  /**
   * Injecte le handler de skills (connect au SkillManager).
   */
  setSkillHandler(handler: SkillHandlerFn): void {
    this.skillHandler = handler;
  }

  /**
   * Injecte la fonction LLM pour la décomposition.
   */
  setLLMDecompose(fn: (prompt: string) => Promise<string>): void {
    this.planner.setDecomposeFunction(fn);
  }

  /**
   * Injecte la fonction LLM pour la réflexion.
   */
  setLLMReflect(fn: (prompt: string) => Promise<string>): void {
    this.reflection.setReflectFunction(fn);
  }

  /**
   * Injecte la fonction LLM utilisée pour générer les arguments d'un skill
   * au moment de l'exécution (quand le Planner n'a pas rempli action.args).
   */
  setLLMArgGen(fn: LLMTextFn): void {
    this.llmArgGen = fn;
  }

  /**
   * Injecte la fonction LLM utilisée pour valider les critères de succès
   * d'un objectif à partir des actions exécutées et de leurs résultats.
   */
  setLLMVerify(fn: LLMTextFn): void {
    this.llmVerify = fn;
  }

  /**
   * Enregistre les schémas des outils disponibles (name/description/parameters).
   * Utilisé pour générer des arguments valides via le LLM.
   */
  setToolSchemas(schemas: ToolSchema[]): void {
    this.toolSchemas.clear();
    for (const schema of schemas) {
      if (schema && schema.name) this.toolSchemas.set(schema.name, schema);
    }
  }

  /**
   * Injecte le store de persistance des missions (local, Supabase ou composite).
   */
  setStore(store: MissionStatePort): void {
    this.store = store;
  }

  /**
   * Branche le moteur de preuve et active la vérification par preuve (audit,
   * point 11). `enabled` par défaut `true` : fournir un moteur signifie qu'on
   * veut l'utiliser. Passer `false` branche le moteur sans l'activer.
   */
  setEvidenceEngine(engine: EvidenceEngine, enabled = true): void {
    this.evidence = engine;
    this.evidenceVerification = enabled;
  }

  /** Active/désactive la vérification par preuve à chaud (si un moteur est branché). */
  setEvidenceVerification(enabled: boolean): void {
    this.evidenceVerification = enabled;
  }

  /**
   * Branche l'autorité de gouvernance (`LeannaSupervisor`) et active le mode
   * supervisé (audit, point 5 / unification). `enabled` par défaut `true`.
   */
  setSupervisor(supervisor: LeannaSupervisor, enabled = true): void {
    this.supervisor = supervisor;
    this.supervisedMode = enabled;
  }

  /** Active/désactive le mode supervisé à chaud (si un Supervisor est branché). */
  setSupervisedMode(enabled: boolean): void {
    this.supervisedMode = enabled;
  }

  /**
   * Injecte le curseur d'autonomie (suggest/ask/auto + .leannaignore).
   */
  setAutonomyPolicy(policy: AutonomyPolicy): void {
    this.autonomy = policy;
  }

  /** Configure le délai d'attente d'une approbation (ms). */
  setApprovalTimeout(ms: number): void {
    if (Number.isFinite(ms) && ms > 0) this.approvalTimeoutMs = ms;
  }

  /**
   * Résout une demande d'approbation en attente (appelé depuis le frontend).
   * Retourne true si une demande correspondante existait.
   */
  resolveApproval(actionId: string, approved: boolean): boolean {
    const pending = this.pendingApprovals.get(actionId);
    if (!pending) return false;
    clearTimeout(pending.timer);
    this.pendingApprovals.delete(actionId);
    pending.resolve(approved);
    return true;
  }

  /** Liste historique des IDs, conservée pour compatibilité des scripts/API. */
  listPendingApprovals(): string[] {
    return Array.from(this.pendingApprovals.keys());
  }

  /** Détails minimaux des approbations pour le centre de pilotage. */
  listPendingApprovalDetails(): Array<{
    actionId: string;
    missionId: string;
    goalId: string;
    skill: string;
    args: Record<string, unknown>;
    reason: string;
    requestedAt: string;
    timeoutAt: string;
  }> {
    return Array.from(this.pendingApprovals.entries()).map(([actionId, pending]) => ({
      actionId,
      missionId: pending.missionId,
      goalId: pending.goalId,
      skill: pending.skill,
      args: sanitizeApprovalArgs(pending.args) as Record<string, unknown>,
      reason: pending.reason.slice(0, 500),
      requestedAt: pending.requestedAt,
      timeoutAt: pending.timeoutAt,
    }));
  }

  /**
   * Vérifie qu'une action appartient bien à une mission donnée.
   *
   * Correctif audit (point 8) : la route `approve` indexait l'approbation
   * uniquement par `actionId`, en ignorant le `:id` de mission de l'URL —
   * n'importe quel `actionId` était donc approuvable via n'importe quelle
   * mission. Ce contrôle permet à la route de refuser une approbation croisée.
   */
  actionBelongsToMission(missionId: string, actionId: string): boolean {
    const mission =
      this.activeMissions.get(missionId) ??
      this.completedMissions.find((m) => m.id === missionId);
    if (!mission) return false;
    return Object.values(mission.getState().goals).some((g) =>
      g.plannedActions.some((a) => a.id === actionId)
    );
  }

  /** Accès au curseur d'autonomie (pour lire/modifier le mode à chaud). */
  getAutonomyPolicy(): AutonomyPolicy | null {
    return this.autonomy;
  }

  /**
   * Configure l'émetteur d'événements pour le frontend.
   */
  setEventEmitter(emitter: ExecutorEventEmitter): void {
    this.eventEmitter = emitter;
  }

  /**
   * Accès au scorer (pour enregistrer les catégories de skills au démarrage).
   */
  getScorer(): SkillScorer {
    return this.scorer;
  }

  /**
   * Accès au reflection engine.
   */
  getReflection(): ReflectionEngine {
    return this.reflection;
  }

  // ─── Exécution de mission ─────────────────────────────────────────────────

  /**
   * Lance une mission complète.
   * Retourne la mission (l'exécution continue en arrière-plan).
   */
  async startMission(params: {
    title: string;
    description: string;
    priority?: "low" | "medium" | "high" | "critical";
    availableSkills: string[];
    budget?: { maxTokens?: number; maxCostUsd?: number };
    /** Exécuter la mission entière en simulation, sans effet de bord. */
    dryRun?: boolean;
  }): Promise<Mission> {
    if (!this.skillHandler) {
      throw new Error("SkillHandler not configured. Call setSkillHandler first.");
    }

    // Config spécifique à la mission : le dry-run peut être activé par mission.
    const missionConfig: MissionConfig = {
      ...this.config,
      dryRun: params.dryRun ?? this.config.dryRun,
    };

    const mission = new Mission(
      params.title,
      params.description,
      params.priority ?? "medium",
      missionConfig
    );

    if (missionConfig.dryRun) {
      console.log(`[Executor] 🧪 Mission "${params.title}" lancée en DRY-RUN (simulation, sans effet de bord).`);
      this.emit("mission_dryrun", { missionId: mission.id, title: params.title });
    }

    // Start OpenTelemetry trace for this mission
    telemetryService.startMissionTrace(mission.id, params.title);

    // Set up budget guardrails if provided
    if (params.budget) {
      telemetryService.setMissionBudget(mission.id, params.budget);
    }


    // Ferme la boucle d'apprentissage inter-missions (GAP-1) : amorcer le
    // SkillScorer avec la fiabilité durable des skills AVANT la planification,
    // pour qu'un outil historiquement défaillant soit d'emblée moins prioritaire.
    try {
      this.scorer.seedFromReliability(strategyMemory.getAllStats());
    } catch (err) {
      console.warn(`[Executor] Amorçage de fiabilité ignoré: ${(err as Error).message}`);
    }

    // Planification sous le contexte de télémétrie de la mission : ses appels
    // LLM sont attribués à la mission et soumis à son budget.
    const plan = await runWithTelemetryContext({ missionId: mission.id }, () =>
      this.preparePlan(mission, params.availableSkills)
    );
    this.missionPlans.set(mission.id, plan);

    this.activeMissions.set(mission.id, mission);
    await this.persist(mission);
    this.emit("mission_plan", {
      missionId: mission.id,
      title: params.title,
      plan,
    });
    this.emit("mission_started", { missionId: mission.id, title: params.title });

    this.launchMission(mission, params.availableSkills);
    return mission;
  }

  /**
   * Lance (ou relance) l'exécution d'une mission déjà enregistrée dans
   * `activeMissions`, avec TOUTE l'infrastructure d'exécution :
   *   - promesse observable enregistrée dans `missionRuns` (pour waitForMission) ;
   *   - watchdog de timeout global ;
   *   - nettoyage télémétrie en cas d'échec.
   *
   * Correctif audit (point 3) : factorisation commune à `startMission` et
   * `confirmResume`. Avant, une reprise appelait directement `executeMission`
   * sans watchdog, sans trace télémétrie, sans entrée `missionRuns` — donc
   * `waitForMission` rendait la main immédiatement et une mission reprise
   * n'avait ni timeout ni budget.
   */
  private launchMission(mission: Mission, availableSkills: string[]): void {
    // Lancer l'exécution en arrière-plan, tout en conservant une promesse
    // observable. Le runtime autonome doit attendre le résultat vérifié plutôt
    // que déclarer une mission réussie juste après sa création.
    //
    // Unification (audit, point 5) : en mode supervisé, l'exécution transite
    // DANS la boucle du Supervisor (état durable, snapshots, preuve, récupération).
    // Sinon, exécution directe (chemin par défaut inchangé).
    // Contexte de télémétrie isolé par mission (AsyncLocalStorage) : deux
    // missions concurrentes ne partagent plus un missionId global.
    const execute = () =>
      runWithTelemetryContext({ missionId: mission.id }, () =>
        this.supervisor && this.supervisedMode
          ? this.runSupervised(mission, availableSkills)
          : this.executeMission(mission, availableSkills)
      );

    // Une simulation n'écrit rien : elle part tout de suite. Une mission réelle
    // attend la fin de la précédente.
    let body: Promise<void>;
    if (mission.getConfig().dryRun) {
      body = execute();
    } else {
      if (this.writeRunning || this.queuedMissions.size > 0) {
        this.emit("mission_queued", { missionId: mission.id });
      }
      this.queuedMissions.add(mission.id);
      body = this.writeQueue.then(async (): Promise<void> => {
        this.queuedMissions.delete(mission.id);
        // Annulée pendant l'attente : ne pas la démarrer.
        if (mission.isCompleted()) return;
        this.writeRunning = true;
        try {
          return await execute();
        } finally {
          this.writeRunning = false;
        }
      });
      this.writeQueue = body.catch(() => undefined);
    }

    const run = body.catch((err) => {
      console.error(`[Executor] Mission ${mission.id} failed:`, err);
      telemetryService.endMissionTrace(mission.id, false);
      this.emit("mission_failed", { missionId: mission.id, error: String(err) });
    });
    this.missionRuns.set(mission.id, run);
    void run.finally(() => this.missionRuns.delete(mission.id));

    // Watchdog : arrêt forcé si la mission dépasse le timeout global configuré.
    //
    // Correctif audit (point 6) : le temps passé EN PAUSE ne compte PAS. Avant,
    // un unique setTimeout(timeoutMs) tuait une mission même pausée (le timer
    // tournait pendant la pause). On remplace par un sondage qui n'accumule le
    // temps que lorsque la mission tourne réellement : la pause étend d'autant
    // l'échéance.
    const timeoutMs = mission.getConfig().missionTimeoutMs;
    if (timeoutMs > 0) {
      let activeElapsedMs = 0;
      let lastTick = Date.now();
      const poll = Math.min(Executor.WATCHDOG_POLL_MS, timeoutMs);

      const watchdog = setInterval(() => {
        const now = Date.now();
        const delta = now - lastTick;
        lastTick = now;

        // Mission terminée ou disparue : plus rien à surveiller.
        if (mission.isCompleted() || !this.activeMissions.has(mission.id)) {
          clearInterval(watchdog);
          return;
        }

        // En pause ou en file d'attente : on ne consomme pas de budget de temps.
        if (this.pausedMissions.has(mission.id) || this.queuedMissions.has(mission.id)) {
          return;
        }

        activeElapsedMs += delta;
        if (activeElapsedMs >= timeoutMs) {
          clearInterval(watchdog);
          console.warn(`[Executor] ⏱️ Timeout global de mission atteint (${timeoutMs}ms de temps actif). Arrêt.`);
          // Correctif audit (point 4) : fermer la racine + tous les objectifs
          // non terminaux, pas seulement le sommet de la pile.
          mission.cancel("Timeout global de mission.");
          // Interrompre un skill en cours (AbortSignal).
          this.abortMission(mission.id, "Timeout global de mission.");
          this.finalizeMission(mission);
          telemetryService.endMissionTrace(mission.id, false);
          telemetryService.clearMissionBudget(mission.id);
          this.emit("mission_timeout", { missionId: mission.id });
        }
      }, poll);
      // Ne pas garder le process Node en vie uniquement pour ce timer.
      if (typeof watchdog.unref === "function") watchdog.unref();
      void run.finally(() => clearInterval(watchdog));
    }
  }

  /**
   * Exécute une mission SOUS GOUVERNANCE du `LeannaSupervisor` (unification,
   * audit §5 / point 11).
   *
   * L'Executor devient le `MissionRunner` : à chaque tentative gouvernée, il
   * exécute la boucle d'objectifs (`executeMission`) puis remonte un
   * `RunnerOutcome` dont le succès et la PREUVE dérivent de l'état FACTUEL des
   * objectifs (pas de la narration). Le Supervisor possède alors l'état durable
   * (`MissionLifecycleState`), les snapshots/rollbacks, le scellement de preuve
   * et la décision de récupération — fusionnant les deux machines d'états
   * (`GoalStatus` de l'Executor ↔ cycle de vie du core).
   *
   * Les fichiers planifiés (ciblés par le plan) sont transmis au Supervisor pour
   * un rollback fidèle entre tentatives.
   */
  private async runSupervised(mission: Mission, availableSkills: string[]): Promise<void> {
    const supervisor = this.supervisor!;

    // Resolve every planned path against the exact active workspace before the
    // initial snapshot; relative paths against process.cwd() are not safe here.
    const resolveWorkspaceTarget = (target: string): string => {
      if (!SELF_ROOT) throw new Error("Checkpoint refused: no active workspace.");
      const absolute = path.resolve(SELF_ROOT, target);
      const relative = path.relative(SELF_ROOT, absolute);
      if (!relative || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
        throw new Error("Checkpoint refused: target outside workspace (" + target + ").");
      }
      return absolute;
    };
    // Fichiers ciblés connus avant exécution (pour le snapshot/rollback).
    const plannedFiles = this.collectPlannedFiles(mission).map(resolveWorkspaceTarget);

    const runner: MissionRunner = async ({ signal, beforeToolCall }) => {
      if (beforeToolCall) this.supervisorWriteHooks.set(mission.id, beforeToolCall);
      // Relayer l'annulation du Supervisor au contrôleur réellement transmis
      // aux skills. Sans ce pont, son AbortSignal ne pouvait pas interrompre
      // l'action en cours dans l'Executor.
      const abortFromSupervisor = () => {
        mission.cancel("Annulation demandée par le Supervisor (timeout/arrêt).");
        this.abortMission(mission.id, "Annulation demandée par le Supervisor.");
      };
      if (signal?.aborted) abortFromSupervisor();
      else signal?.addEventListener("abort", abortFromSupervisor, { once: true });

      try {
        // Une tentative = une passe complète de la boucle d'objectifs. On réutilise
        // l'infrastructure existante (pause, anti-boucle, vérification par preuve).
        await this.executeMission(mission, availableSkills);
        const outcome = this.buildMissionOutcome(mission);
        // executeMission finalise la mission (retry/replan internes épuisés) : une
        // nouvelle tentative du Supervisor ne rejouerait rien → escalade honnête.
        if (!outcome.success && mission.isCompleted()) outcome.suggestedRecovery = "escalate";
        return outcome;
      } finally {
        signal?.removeEventListener("abort", abortFromSupervisor);
        this.supervisorWriteHooks.delete(mission.id);
      }
    };

    const result = await supervisor.runMission({
      missionId: mission.id,
      goal: mission.getState().title,
      runner,
      plannedFiles,
      resolveWriteTargets: (toolName, args) => {
        const targets: string[] = [];
        const singlePath = typeof args.path === "string" ? args.path : undefined;
        const pathTools = ["write_project_file", "modify_project_file", "apply_patch", "patch_project_file", "delete_project_file", "delete_project_folder", "create_project_directory"];
        if (pathTools.includes(toolName) && singlePath) targets.push(singlePath);
        if (toolName === "rename_project_file") {
          if (typeof args.oldPath === "string") targets.push(args.oldPath);
          if (typeof args.newPath === "string") targets.push(args.newPath);
        }
        if (targets.length === 0) throw new Error("Checkpoint refused: no write target for " + toolName + ".");
        return targets.map(resolveWorkspaceTarget);
      },
    });

    this.emit("mission_supervised", {
      missionId: mission.id,
      lifecycleState: result.finalState,
      attempts: result.attempts,
      evidencePassed: result.evidence?.passed,
    });
  }

  /**
   * Agrège l'état FACTUEL des objectifs d'une mission en `RunnerOutcome` pour le
   * Supervisor : succès ssi tous les sous-objectifs sont `completed` ; preuve
   * dérivée des actions (checks par skill via `detectSkillFailure`, fichiers
   * écrits, outils exécutés) ; décision de récupération suggérée en cas d'échec.
   */
  private buildMissionOutcome(mission: Mission): RunnerOutcome {
    const goals = Object.values(mission.getState().goals);
    const subGoals = goals.filter((g) => g.parentId !== null);
    const scope = subGoals.length > 0 ? subGoals : goals;

    const allCompleted =
      scope.length > 0 && scope.every((g) => g.status === "completed");
    const anyBlocked = scope.some((g) => g.status === "blocked");
    const anyFailed = scope.some((g) => g.status === "failed");

    // Preuve factuelle agrégée sur toutes les actions exécutées de la mission.
    const executed = goals.flatMap((g) => g.plannedActions).filter(
      (a) => a.status === "completed" || a.status === "failed"
    );
    const runtimeChecks: CheckResult[] = executed.map((a) => {
      const failure = Executor.detectSkillFailure(a.result);
      return {
        name: a.skillName,
        passed: a.status === "completed" && failure === null,
        details: failure ?? undefined,
      };
    });
    const filesModified = Array.from(
      new Set(
        executed
          .filter(
            (a) =>
              a.status === "completed" &&
              Executor.WRITE_TOOLS.includes(a.skillName) &&
              typeof (a.args as Record<string, unknown>)?.path === "string"
          )
          .map((a) => String((a.args as Record<string, unknown>).path))
      )
    );
    const toolsExecuted = executed.map((a) => a.skillName);

    // Décision de récupération suggérée (sinon le Supervisor décide seul) :
    //   - un objectif bloqué (escaladé) → escalate ;
    //   - un échec « simple » → replan (changer de stratégie au tour suivant).
    let suggestedRecovery: RecoveryDecision | undefined;
    if (!allCompleted) {
      if (anyBlocked) suggestedRecovery = "escalate";
      else if (anyFailed) suggestedRecovery = "replan";
    }

    return {
      success: allCompleted,
      touchedFiles: filesModified,
      evidence: { filesModified, toolsExecuted, runtimeChecks },
      suggestedRecovery,
      error: allCompleted ? undefined : "Objectifs non tous atteints.",
    };
  }

  /**
   * Liste des fichiers ciblés par le plan courant (args `path`/`file` des
   * actions planifiées), pour le snapshot/rollback du Supervisor.
   */
  private collectPlannedFiles(mission: Mission): string[] {
    const files = new Set<string>();
    for (const goal of Object.values(mission.getState().goals)) {
      for (const action of goal.plannedActions) {
        const args = action.args as Record<string, unknown> | undefined;
        for (const key of ["path", "file", "filePath"]) {
          const v = args?.[key];
          if (typeof v === "string" && v.trim()) files.add(v);
        }
      }
    }
    return Array.from(files);
  }

  /**
   * Attend la fin réelle d'une mission déjà lancée et retourne son état
   * terminal. C'est le contrat utilisé par l'autonomie pour fermer la boucle
   * exécution → vérification → réflexion avant de prendre la décision suivante.
   */
  async waitForMission(missionId: string): Promise<Mission | undefined> {
    await this.missionRuns.get(missionId);
    return this.activeMissions.get(missionId)
      ?? this.completedMissions.find((mission) => mission.id === missionId);
  }

  private async preparePlan(mission: Mission, availableSkills: string[]): Promise<MissionPlan> {
    const rootGoal = mission.rootGoal;
    const subGoals = await this.planner.decompose(mission, rootGoal.id, availableSkills);
    const objectives = subGoals.length > 0 ? subGoals.map((goal) => goal.title) : [rootGoal.title];
    const goals = subGoals.length > 0
      ? this.createSubGoals(mission, rootGoal.id, subGoals)
      : [rootGoal.id];
    const plannedActions: PlannedAction[] = [];

    for (const goalId of goals) {
      const actions = await this.planner.planActions(mission, goalId, availableSkills);
      mission.setPlanForGoal(goalId, actions);
      plannedActions.push(...actions);
    }

    const text = `${mission.getState().title} ${mission.getState().description}`;
    const targetedFiles = Array.from(new Set(
      text.match(/[\w./\\-]+\.(?:ts|tsx|js|jsx|json|css|md|html|sql|cjs|mjs)/gi) ?? []
    ));
    const tools = Array.from(new Set(plannedActions.map((action) => action.skillName)));

    // ── Estimation coût / durée / risque ─────────────────────────────────
    const state = mission.getState();
    const estimate = this.planEstimator.estimate({
      plannedActions,
      missionTitle: state.title,
      missionDescription: state.description,
      targetedFiles,
      maxRetries: this.config.maxRetries,
    });

    // ── Risques qualitatifs ───────────────────────────────────────────────
    const risks: string[] = [
      ...estimate.riskFactors,
      "Une action peut échouer et déclencher une replanification.",
      ...(targetedFiles.length === 0 ? ["Les fichiers ciblés seront confirmés pendant l'analyse."] : []),
      ...(plannedActions.length === 0 ? ["Aucun outil n'a encore atteint le score minimum."] : []),
    ];

    return {
      objectives,
      targetedFiles: targetedFiles.length > 0 ? targetedFiles : ["À déterminer pendant l'analyse"],
      tools: tools.length > 0 ? tools : ["Sélection automatique selon le contexte"],
      risks,
      estimatedTokens:      estimate.estimatedTokens,
      estimatedCostUsd:     estimate.estimatedCostUsd,
      estimatedDurationMs:  estimate.estimatedDurationMs,
      riskLevel:            estimate.riskLevel,
      estimationConfidence: estimate.estimationConfidence,
      stopConditions: [
        "Arrêt immédiat si un objectif critique échoue.",
        `Arrêt après ${this.config.maxRetries} échecs d'une même action.`,
        "Arrêt sur annulation explicite de l'utilisateur.",
      ],
    };
  }

  /** Plan initial d'une mission (actif ou historique en mémoire), s'il est connu. */
  getMissionPlan(missionId: string): MissionPlan | undefined {
    return this.missionPlans.get(missionId);
  }

  /** Libère les données annexes (plan, auto-évaluation, apprentissage) d'une mission. */
  private forgetMissionArtifacts(missionId: string): void {
    this.missionPlans.delete(missionId);
    this.selfEvaluations.delete(missionId);
    this.learningResults.delete(missionId);
  }

  /**
   * Récupère une mission active.
   */
  getMission(missionId: string): Mission | undefined {
    return this.activeMissions.get(missionId);
  }

  /**
   * Liste les missions actives.
   */
  listActiveMissions(): Mission[] {
    return Array.from(this.activeMissions.values());
  }

  /**
   * Liste les missions complétées (historique).
   */
  listCompletedMissions(): Mission[] {
    return [...this.completedMissions];
  }

  /** Returns post-mission learning proposals for review by the policy/UI. */
  getLearningResult(missionId: string): LearningResult | undefined {
    return this.learningResults.get(missionId);
  }

  /** Returns the self-critique evaluation for a finalized mission, if any. */
  getSelfEvaluation(missionId: string): import("./SelfEvaluation.js").SelfEvaluation | undefined {
    return this.selfEvaluations.get(missionId);
  }

  /**
   * Annule une mission active.
   */
  cancelMission(missionId: string): boolean {
    const mission = this.activeMissions.get(missionId);
    if (!mission) return false;

    // Correctif audit (point 4) : annuler la RACINE et tous les objectifs non
    // terminaux (pas seulement le sommet de la pile via completeActiveGoal).
    // La mission passe en "cancelled" ; sans ça elle restait "in_progress" et
    // la boucle executeMission la re-finalisait (doublon + mission_completed
    // émis après mission_cancelled).
    mission.cancel("Mission annulée par l'utilisateur.");

    // Interrompre un skill éventuellement en cours (AbortSignal).
    this.abortMission(missionId, "Mission annulée par l'utilisateur.");

    this.finalizeMission(mission);
    
    // End trace and clear telemetry
    telemetryService.endMissionTrace(missionId, false);
    telemetryService.clearMissionBudget(missionId);
    
    this.pausedMissions.delete(missionId);
    this.emit("mission_cancelled", { missionId });
    return true;
  }

  /**
   * Met en pause une mission active. L'exécution s'arrête au prochain point de
   * contrôle (entre deux actions/vagues) et reste suspendue jusqu'à reprise ou
   * annulation. Retourne false si la mission n'est pas active ou déjà en pause.
   */
  pauseMission(missionId: string): boolean {
    if (!this.activeMissions.has(missionId)) return false;
    if (this.pausedMissions.has(missionId)) return false;
    this.pausedMissions.add(missionId);
    this.emit("mission_paused", { missionId });
    return true;
  }

  /**
   * Reprend une mission mise en pause. Retourne false si elle n'était pas en pause.
   */
  resumeMission(missionId: string): boolean {
    if (!this.pausedMissions.has(missionId)) return false;
    this.pausedMissions.delete(missionId);
    this.emit("mission_resumed", { missionId });
    return true;
  }

  /** Indique si une mission est actuellement en pause. */
  isPaused(missionId: string): boolean {
    return this.pausedMissions.has(missionId);
  }

  /**
   * Ajoute un sous-objectif à une mission ACTIVE (audit, point 10 :
   * `mission_add_goal` était déclaré sans handler). Le sous-objectif est
   * rattaché à `parentId` (ou à l'objectif racine par défaut) et sera pris en
   * compte par l'ordonnancement par vagues au tour suivant.
   *
   * Retourne un résultat typé plutôt que de lever, pour que le skill/route
   * puisse répondre proprement (mission inconnue, limites atteintes, etc.).
   */
  addGoal(
    missionId: string,
    params: {
      title: string;
      description: string;
      successCriteria?: string[];
      priority?: "low" | "medium" | "high" | "critical";
      parentId?: string;
    }
  ): { ok: true; goalId: string } | { ok: false; error: string } {
    const mission = this.activeMissions.get(missionId);
    if (!mission) {
      return { ok: false, error: `Mission ${missionId} introuvable ou non active.` };
    }
    if (mission.isCompleted()) {
      return { ok: false, error: `Mission ${missionId} déjà terminée.` };
    }

    const parentId = params.parentId ?? mission.rootGoal.id;
    if (!mission.getGoal(parentId)) {
      return { ok: false, error: `Objectif parent ${parentId} introuvable dans la mission.` };
    }

    try {
      const goalId = mission.addSubGoal({
        parentId,
        title: params.title,
        description: params.description,
        successCriteria:
          params.successCriteria && params.successCriteria.length > 0
            ? params.successCriteria
            : [`Le sous-objectif "${params.title}" est atteint.`],
        priority: params.priority,
      });
      void this.persist(mission);
      this.emit("goal_added", { missionId, goalId, title: params.title, parentId });
      return { ok: true, goalId };
    } catch (err) {
      // addSubGoal lève sur dépassement de maxSubGoals / maxDepth.
      return { ok: false, error: (err as Error).message };
    }
  }

  /**
   * Supprime définitivement une mission.
   * - Si elle est active, elle est d'abord annulée.
   * - Elle est retirée de l'historique en mémoire, de la file de reprise ET du
   *   store persistant — pour qu'elle ne réapparaisse pas au redémarrage.
   * Retourne false uniquement si la mission est totalement inconnue.
   */
  deleteMission(missionId: string): boolean {
    const wasActive = this.activeMissions.has(missionId);
    if (wasActive) {
      // Annule proprement (finalise + émet mission_cancelled).
      this.cancelMission(missionId);
    }

    const beforeLen = this.completedMissions.length;
    this.completedMissions = this.completedMissions.filter((m) => m.id !== missionId);
    const removedFromHistory = this.completedMissions.length < beforeLen;

    this.pausedMissions.delete(missionId);
    this.forgetMissionArtifacts(missionId);

    // Retirer de la file des missions interrompues en attente de décision.
    // Sans ça, une mission « effacée » qui n'était présente QUE dans la file de
    // reprise (cas typique après une réouverture) n'était jamais réellement
    // supprimée : la méthode renvoyait false, le store persistant n'était pas
    // purgé, et la mission revenait au prochain démarrage via resumePending().
    const wasPendingResume = this.pendingResumes.delete(missionId);

    // Nettoyage du store persistant TOUJOURS tenté (indépendamment de la
    // présence en mémoire) : la source de la « résurrection » est la ligne
    // persistée, qu'il faut effacer même si la mission n'est plus en mémoire.
    if (this.store) {
      void this.store.delete(missionId);
    }

    const existed = wasActive || removedFromHistory || wasPendingResume;
    if (existed) {
      this.emit("mission_deleted", { missionId });
    }
    return existed;
  }

  /**
   * Point de contrôle de pause : suspend l'exécution tant que la mission est en
   * pause. Se débloque à la reprise, à l'annulation, ou si la mission n'est plus
   * active. Ne fait rien si la mission n'est pas en pause.
   */
  private async waitIfPaused(missionId: string): Promise<void> {
    while (
      this.pausedMissions.has(missionId) &&
      this.activeMissions.has(missionId)
    ) {
      await new Promise((r) => setTimeout(r, Executor.PAUSE_POLL_MS));
    }
  }

  // ─── Boucle d'exécution ───────────────────────────────────────────────────

  private async executeMission(mission: Mission, availableSkills: string[]): Promise<void> {
    const rootGoal = mission.rootGoal;
    mission.pushGoal(rootGoal.id);

    console.log(`[Executor] ═══════════════════════════════════════════`);
    console.log(`[Executor] 🚀 Mission démarrée: "${mission.getState().title}"`);
    console.log(`[Executor] ═══════════════════════════════════════════`);

    // Les sous-objectifs ont déjà été créés lors de preparePlan.
    // On les récupère depuis l'état (sans les recréer).
    const subGoalIds = Object.values(mission.getState().goals)
      .filter((goal) => goal.parentId === rootGoal.id)
      .map((goal) => goal.id);

    if (subGoalIds.length === 0) {
      // Pas de décomposition → exécuter directement
      await this.executeGoalDirectly(mission, rootGoal.id, availableSkills);
    } else {
      // Ordonnancement par vagues : exécuter en parallèle les objectifs dont
      // toutes les dépendances (dependsOn) sont déjà complétées.
      await this.executeGoalsScheduled(mission, subGoalIds, availableSkills);
    }

    // Compléter la mission si pas déjà fait.
    if (!mission.isCompleted()) {
      const allGoals = Object.values(mission.getState().goals);
      const subGoals = allGoals.filter((g) => g.parentId !== null);
      const allCompleted =
        subGoals.length > 0 && subGoals.every((g) => g.status === "completed");

      // ── Correctif audit (point 2) : plus de « faux succès » ────────────────
      // Une mission n'est RÉUSSIE que si TOUS ses sous-objectifs sont
      // "completed". Un seul objectif échoué, bloqué ou annulé (même non
      // critique) rend la mission non réussie — sinon les stats, playbooks et le
      // profil projet apprenaient de faux succès.
      const failedOrBlocked = subGoals.filter(
        (g) => g.status === "failed" || g.status === "blocked"
      );
      const success = allCompleted;

      let summary: string;
      if (success) {
        summary = `Mission "${mission.getState().title}" complétée avec succès.`;
      } else if (failedOrBlocked.length > 0 && failedOrBlocked.length < subGoals.length) {
        // Succès partiel : certains objectifs ont abouti, d'autres non.
        summary =
          `Mission "${mission.getState().title}" partiellement réussie — ` +
          `${subGoals.length - failedOrBlocked.length}/${subGoals.length} objectif(s) atteint(s).`;
      } else {
        summary = `Mission "${mission.getState().title}" terminée avec des objectifs échoués.`;
      }

      // Fermer la RACINE explicitement : un sous-objectif bloqué (blockGoal ne
      // dépile pas) peut rester au sommet de la pile, et completeActiveGoal
      // le fermait à la place, laissant la mission finalisée en "in_progress".
      mission.completeGoal(rootGoal.id, {
        success,
        summary,
        lessonsLearned: this.extractLessons(mission),
      });
    }

    // Si la mission a déjà été finalisée entre-temps (annulation/timeout via
    // cancelMission/watchdog), ne pas la finaliser ni émettre une 2e fois.
    // Correctif audit (point 4) : évite le doublon et l'émission de
    // mission_completed après mission_cancelled.
    if (this.finalizedMissions.has(mission.id)) {
      return;
    }

    this.finalizeMission(mission);

    // End trace with success status
    const success = mission.status === "completed";
    telemetryService.endMissionTrace(mission.id, success);
    telemetryService.clearMissionBudget(mission.id);

    console.log(`[Executor] ✓ Mission terminée: ${mission.status}`);
    this.emit("mission_completed", {
      missionId: mission.id,
      success,
    });
  }

  /**
   * Exécute un objectif directement (planifie et exécute les actions).
   */
  private async executeGoalDirectly(
    mission: Mission,
    goalId: string,
    availableSkills: string[]
  ): Promise<void> {
    const goal = mission.getGoal(goalId);
    if (!goal) return;

    console.log(`[Executor] ── Objectif: "${goal.title}" ──`);

    // Planifier les actions
    let actions = goal.plannedActions.length > 0
      ? goal.plannedActions
      : await this.planner.planActions(mission, goalId, availableSkills);
    mission.setPlanForGoal(goalId, actions);

    if (actions.length === 0) {
      console.log(`[Executor]    Aucune action planifiée. Objectif marqué complété.`);
      mission.completeGoal(goalId, { success: true, summary: "Aucune action nécessaire." });
      return;
    }

    // Exécuter les actions une par une.
    // On lit systématiquement le plan VIVANT (mission.getGoal(...).plannedActions)
    // plutôt qu'une copie locale : une replanification remplace ce plan par de
    // nouvelles actions (nouveaux ids), et itérer sur l'ancienne référence
    // ferait planter startAction ("Action not found"). On avance donc via un
    // curseur sur le plan courant, réinitialisé après chaque replanification.
    let cursor = 0;
    // Garde-fou anti-boucle : borne le nombre total d'itérations pour éviter
    // qu'une replanification en boucle ne bloque indéfiniment l'objectif.
    let iterations = 0;
    const maxIterations = 100;

    // Suivi anti-boucle d'exploration pour cet objectif (réinitialisé à chaque
    // entrée dans la méthode : une reprise repart d'un compteur propre).
    this.loopGuards.set(goalId, { explorationStreak: 0, producedArtifact: false, forcedArtifact: false });

    while (iterations++ < maxIterations) {
      if (mission.isCompleted()) break;

      const livePlan = mission.getGoal(goalId)?.plannedActions ?? [];
      // Trouver la prochaine action à exécuter à partir du curseur.
      let action: PlannedAction | undefined;
      while (cursor < livePlan.length) {
        const candidate = livePlan[cursor];
        if (candidate.status === "pending") { action = candidate; break; }
        cursor++;
      }
      if (!action) break; // plus rien à exécuter

      // Point de contrôle : suspend si la mission est en pause.
      await this.waitIfPaused(mission.id);
      if (mission.isCompleted() || !this.activeMissions.has(mission.id)) break;

      const result = await this.executeAction(mission, goalId, action, availableSkills);

      // Persistance APRÈS CHAQUE ACTION (audit, point 7). Avant, l'état n'était
      // sauvegardé qu'au démarrage, après chaque vague et à la fin — donc un
      // crash en milieu d'objectif perdait toutes les actions de la vague en
      // cours. Best-effort, non bloquant.
      await this.persist(mission);

      // Une action RÉUSSIE est terminale : la réflexion ne peut pas la "défaire".
      // On ignore donc retry/replan/escalate/abort quand l'action a réussi
      // (le statut completed a déjà été posé par recordActionResult, qui mute
      // l'objet action de façon invisible pour l'inférence de types).
      const actionSucceeded = (mission.getGoal(goalId)?.plannedActions
        .find((a) => a.id === action.id)?.status) === "completed";

      // ── Détection de boucle d'exploration (Bug: mission sans livrable) ──────
      // On met à jour le suivi : une écriture réussie prouve qu'un artefact a été
      // produit ; une action d'exploration incrémente le streak ; toute autre
      // action réussie le remet à zéro (progrès non-exploratoire).
      const guard = this.loopGuards.get(goalId)!;
      const isExploration = Executor.EXPLORATION_TOOLS.has(action.skillName);
      const isWrite = Executor.WRITE_TOOLS.includes(action.skillName);
      if (actionSucceeded && isWrite) {
        guard.producedArtifact = true;
        guard.explorationStreak = 0;
      } else if (isExploration) {
        guard.explorationStreak++;
      } else if (actionSucceeded) {
        guard.explorationStreak = 0;
      }

      // Si l'objectif enchaîne les lectures sans jamais produire d'artefact, on
      // force UNE fois une replanification contrainte « produire un livrable ».
      // Cela casse la boucle plan→lire→lire→… observée par le Vérificateur.
      const goalWantsArtifact = this.goalExpectsArtifact(goal);
      if (
        !guard.forcedArtifact &&
        !guard.producedArtifact &&
        goalWantsArtifact &&
        guard.explorationStreak >= Executor.EXPLORATION_LOOP_THRESHOLD
      ) {
        guard.forcedArtifact = true;
        console.log(
          `[Executor]    🧭 Boucle d'exploration détectée (${guard.explorationStreak} lectures sans livrable) ` +
          `→ replanification contrainte « produire un artefact » pour "${goal.title}".`
        );
        this.emit("goal_loop_detected", {
          missionId: mission.id,
          goalId,
          explorationStreak: guard.explorationStreak,
          skill: action.skillName,
        });
        const forced = await this.planForcedArtifact(mission, goalId, availableSkills);
        if (forced.length > 0) {
          mission.setPlanForGoal(goalId, forced);
          cursor = 0;
          continue;
        }
        // Si aucun outil d'écriture n'est disponible, on ne boucle pas davantage.
      }

      // Décider de la suite selon la réflexion (uniquement en cas d'échec).
      if (!actionSucceeded && result.decision === "abort") {
        mission.completeGoal(goalId, {
          success: false,
          summary: `Abandonné: ${result.reasoning}`,
        });
        return;
      }

      if (!actionSucceeded && result.decision === "escalate") {
        // Marquer l'objectif comme bloqué et laisser le niveau supérieur gérer
        mission.blockGoal(goalId, result.reasoning);
        this.emit("goal_escalated", {
          missionId: mission.id,
          goalId,
          reason: result.reasoning,
        });
        return;
      }

      if (!actionSucceeded && result.decision === "replan") {
        // Replanifier avec les infos accumulées.
        console.log(`[Executor]    🔄 Replanification...`);
        const replanned = await this.planner.replan(
          mission,
          goalId,
          action,
          result.failure ?? "Erreur inconnue",
          availableSkills
        );
        // Remplace le plan vivant par les nouvelles actions et repart du début :
        // le curseur doit pointer sur le nouveau plan, pas sur l'ancien index.
        mission.setPlanForGoal(goalId, replanned);
        cursor = 0;
        continue;
      }

      // ── Retry (correctif audit, point 1) ────────────────────────────────────
      // `recordActionResult` a posé l'action en "failed". Pour la rejouer, il
      // faut explicitement la remettre en "pending" ET consommer une tentative
      // de l'objectif. `retryAction` renvoie false quand `maxAttempts` est
      // atteint : on bascule alors en replanification (dernier recours avant
      // escalade) au lieu de boucler indéfiniment sur une action morte.
      if (!actionSucceeded && result.decision === "retry") {
        const canRetry = mission.retryAction(action.id);
        if (canRetry) {
          const g = mission.getGoal(goalId);
          console.log(
            `[Executor]    🔁 Nouvelle tentative de "${action.skillName}" ` +
            `(tentative ${g?.attempts}/${g?.maxAttempts}).`
          );
          this.emit("action_retry", {
            missionId: mission.id,
            goalId,
            actionId: action.id,
            skill: action.skillName,
            attempt: g?.attempts ?? 0,
            maxAttempts: g?.maxAttempts ?? 0,
          });
          // L'action est de nouveau "pending" : ne pas avancer le curseur, elle
          // sera re-sélectionnée au prochain tour de boucle.
          continue;
        }

        // Budget de tentatives épuisé → replanifier une dernière fois.
        console.log(
          `[Executor]    ⛔ Tentatives épuisées pour "${action.skillName}" → replanification.`
        );
        this.emit("action_max_attempts", {
          missionId: mission.id,
          goalId,
          actionId: action.id,
          skill: action.skillName,
          maxAttempts: mission.getGoal(goalId)?.maxAttempts ?? 0,
        });
        const replanned = await this.planner.replan(
          mission,
          goalId,
          action,
          result.failure ?? "Tentatives épuisées",
          availableSkills
        );
        mission.setPlanForGoal(goalId, replanned);
        cursor = 0;
        continue;
      }

      // Aucune replanification / retry : avancer le curseur au-delà de l'action
      // courante (continue / action terminée).
      cursor++;
    }

    // Ne valider l'objectif qu'une fois toutes les actions traitées.
    const allDone = goal.plannedActions.every(
      (a) => a.status === "completed" || a.status === "cancelled" || a.status === "failed"
    );
    if (!allDone) return;

    // Valider l'objectif au regard de ses critères de succès (et non plus
    // dès qu'une seule action a réussi).
    const verdict = await this.verifyGoalCriteria(mission, goal);

    this.emit("goal_verified", {
      missionId: mission.id,
      goalId,
      passed: verdict.passed,
      unverified: verdict.unverified === true,
      reasoning: verdict.reasoning,
    });

    console.log(
      `[Executor]    ${verdict.passed ? "✓" : "✗"} Critères de "${goal.title}": ${verdict.reasoning}`
    );

    mission.completeGoal(goalId, {
      success: verdict.passed,
      summary: `Objectif "${goal.title}" ${verdict.passed ? "atteint" : verdict.unverified ? "non vérifié" : "non atteint"} — ${verdict.reasoning}`,
    });

    this.loopGuards.delete(goalId);
  }

  /**
   * Heuristique : l'objectif attend-il un livrable concret (fichier/document) ?
   * On s'appuie sur le vocabulaire du titre, de la description et des critères
   * de succès (plan, rapport, document, fichier, .md, écrire, générer, produire…).
   * Objectif purement analytique (ex. « comprendre l'architecture ») → false :
   * on ne force alors aucune écriture.
   */
  private goalExpectsArtifact(goal: Goal): boolean {
    const haystack = [
      goal.title,
      goal.description,
      ...(goal.successCriteria ?? []),
    ].join(" ").toLowerCase();
    return /\b(plan|rapport|report|document|documenter|fichier|écrire|ecrire|rédiger|rediger|générer|generer|produire|créer|creer|livrable|\.md|markdown|synth[èe]se)\b/.test(
      haystack
    );
  }

  /**
   * Construit un plan FORCÉ orienté production d'artefact, utilisé pour sortir
   * d'une boucle d'exploration. On privilégie un outil d'écriture disponible et
   * on pose son `rationale` de sorte que la génération d'arguments (generateArgs)
   * sache qu'elle doit produire un fichier livrable concret.
   *
   * Retourne un plan vide si aucun outil d'écriture n'est disponible (dans ce
   * cas, l'appelant renonce à forcer et laisse le flux normal se poursuivre).
   */
  private async planForcedArtifact(
    mission: Mission,
    goalId: string,
    availableSkills: string[]
  ): Promise<PlannedAction[]> {
    const goal = mission.getGoal(goalId);
    if (!goal) return [];

    const writeTool = Executor.WRITE_TOOLS.find((t) => availableSkills.includes(t));
    if (!writeTool) return [];

    // Trace la décision pour l'observabilité et pour nourrir generateArgs.
    mission.addHypothesis(
      `Objectif "${goal.title}" bloqué en exploration : forcer la production d'un livrable ` +
      `concret via ${writeTool} (ex. un fichier Markdown récapitulant le résultat).`
    );

    return [
      {
        id: randomUUID(),
        skillName: writeTool,
        args: {},
        rationale:
          "ARTEFACT REQUIS : l'objectif est resté en exploration (lectures répétées) sans " +
          "produire de livrable. Écrire MAINTENANT un fichier concret qui matérialise le " +
          "résultat attendu (ex. un document Markdown : plan, rapport ou synthèse). Le " +
          "contenu doit refléter les critères de succès de l'objectif.",
        score: 100,
        order: 1,
        status: "pending" as const,
      },
    ];
  }

  /**
   * Détecte les cycles dans le graphe de dépendances `dependsOn` restreint à
   * `goalIds`. Retourne l'ensemble des objectifs impliqués dans au moins un
   * cycle. Parcours DFS avec coloriage (0=non vu, 1=en cours, 2=terminé).
   */
  private detectDependencyCycles(mission: Mission, goalIds: string[]): Set<string> {
    const inCycle = new Set<string>();
    const state = new Map<string, 0 | 1 | 2>();

    const visit = (id: string, path: string[]): void => {
      const s = state.get(id) ?? 0;
      if (s === 2) return;
      if (s === 1) {
        const idx = path.indexOf(id);
        if (idx >= 0) for (const pid of path.slice(idx)) inCycle.add(pid);
        return;
      }
      state.set(id, 1);
      path.push(id);
      const goal = mission.getGoal(id);
      for (const dep of goal?.dependsOn ?? []) {
        if (goalIds.includes(dep)) visit(dep, path);
      }
      path.pop();
      state.set(id, 2);
    };

    for (const id of goalIds) visit(id, []);
    return inCycle;
  }

  /**
   * Ordonnance les sous-objectifs par vagues selon leurs dépendances.
   * Chaque vague exécute EN PARALLÈLE tous les objectifs dont les dépendances
   * (dependsOn) sont déjà complétées. S'arrête si un objectif critique échoue.
   */
  private async executeGoalsScheduled(
    mission: Mission,
    goalIds: string[],
    availableSkills: string[]
  ): Promise<void> {
    const maxConcurrency = Math.max(1, this.config.maxConcurrentGoals ?? 3);
    // Ne garder que les objectifs non terminaux (utile pour les missions reprises).
    const remaining = new Set(
      goalIds.filter((id) => {
        const g = mission.getGoal(id);
        return g && g.status !== "completed" && g.status !== "cancelled";
      })
    );
    let criticalFailure = false;

    // Détection proactive des cycles de dépendances `dependsOn`. Sans ça, des
    // objectifs mutuellement dépendants ne deviennent jamais exécutables et la
    // boucle se termine en les marquant tous bloqués sans raison précise.
    const cycles = this.detectDependencyCycles(mission, [...remaining]);
    if (cycles.size > 0) {
      console.warn(`[Executor] ⚠️ Cycle(s) de dépendances détecté(s): ${[...cycles].join(", ")}`);
      for (const id of cycles) {
        mission.blockGoal(id, "Dépendance circulaire détectée.");
        remaining.delete(id);
        this.emit("goal_blocked", {
          missionId: mission.id,
          goalId: id,
          reason: "Dépendance circulaire détectée.",
        });
      }
    }

    const isDone = (id: string): boolean => {
      const g = mission.getGoal(id);
      return !!g && (g.status === "completed" || g.status === "failed" || g.status === "cancelled");
    };
    const isCompleted = (id: string): boolean =>
      mission.getGoal(id)?.status === "completed";

    while (remaining.size > 0 && !mission.isCompleted() && !criticalFailure) {
      // Point de contrôle : suspend au début de chaque vague si en pause.
      await this.waitIfPaused(mission.id);
      if (mission.isCompleted() || !this.activeMissions.has(mission.id)) break;

      // Sélectionner les objectifs exécutables : dépendances toutes complétées.
      const runnable: string[] = [];
      for (const id of remaining) {
        const goal = mission.getGoal(id);
        if (!goal) { remaining.delete(id); continue; }
        if (goal.status === "cancelled") { remaining.delete(id); continue; }

        const deps = (goal.dependsOn ?? []).filter((d) => goalIds.includes(d));
        const depsSatisfied = deps.every((d) => isCompleted(d));
        // Si une dépendance a échoué, l'objectif ne pourra jamais démarrer.
        const depFailed = deps.some((d) => {
          const dg = mission.getGoal(d);
          return dg && (dg.status === "failed" || dg.status === "cancelled");
        });

        if (depFailed) {
          mission.blockGoal(id, "Dépendance échouée ou annulée.");
          remaining.delete(id);
          this.emit("goal_blocked", { missionId: mission.id, goalId: id, reason: "Dépendance échouée." });
          continue;
        }
        if (depsSatisfied) runnable.push(id);
      }

      if (runnable.length === 0) {
        // Aucun objectif exécutable alors qu'il en reste : cycle ou blocage.
        console.warn(`[Executor] ⚠️ Aucun objectif exécutable (dépendances circulaires ?). Objectifs restants marqués bloqués.`);
        for (const id of remaining) {
          mission.blockGoal(id, "Dépendances non satisfaites (cycle ou blocage).");
        }
        break;
      }

      // Limiter la concurrence de la vague.
      const wave = runnable.slice(0, maxConcurrency);
      console.log(`[Executor] ▶ Vague de ${wave.length} objectif(s) en parallèle.`);

      await Promise.all(
        wave.map(async (goalId) => {
          const goal = mission.getGoal(goalId);
          if (!goal) return;
          mission.pushGoal(goalId);
          this.emit("goal_started", { missionId: mission.id, goalId, title: goal.title });
          await this.executeGoalDirectly(mission, goalId, availableSkills);
          remaining.delete(goalId);

          // Correctif audit (point 9) : un objectif critique BLOQUÉ (escaladé)
          // doit arrêter la mission au même titre qu'un échec — c'est cohérent
          // avec le calcul de succès final qui compte "blocked" comme non réussi.
          if (
            (goal.status === "failed" || goal.status === "blocked") &&
            goal.priority === "critical"
          ) {
            console.log(
              `[Executor] ❌ Objectif critique ${goal.status === "blocked" ? "bloqué" : "échoué"}: ` +
              `"${goal.title}". Arrêt de la mission.`
            );
            criticalFailure = true;
          }
        })
      );

      // Sécurité : retirer de `remaining` tout ce qui est terminé.
      for (const id of [...remaining]) {
        if (isDone(id)) remaining.delete(id);
      }

      // Persister l'avancement après chaque vague (si un store est branché).
      await this.persist(mission);
    }

    if (criticalFailure && !mission.isCompleted()) {
      mission.completeGoal(mission.rootGoal.id, {
        success: false,
        summary: "Arrêt : un objectif critique a échoué.",
      });
    }
  }

  /**
   * Exécute une action unique et effectue la réflexion.
   */
  private async executeAction(
    mission: Mission,
    goalId: string,
    action: PlannedAction,
    _availableSkills: string[]
  ): Promise<ReflectionResult> {
    const goal = mission.getGoal(goalId)!;
    const startTime = Date.now();

    mission.startAction(action.id);
    this.emit("action_started", {
      missionId: mission.id,
      goalId,
      actionId: action.id,
      skill: action.skillName,
    });

    console.log(`[Executor]    ▶ ${action.skillName} (score: ${action.score})`);

    // Check budget before executing action
    const budgetStatus = telemetryService.checkBudget(mission.id);
    if (budgetStatus.exceeded) {
      console.warn(`[Executor] ⚠️ Budget exceeded for mission ${mission.id}: ${budgetStatus.reason}`);
      mission.recordActionResult(action.id, { error: budgetStatus.reason }, false);
      
      return {
        actionId: action.id,
        timestamp: new Date().toISOString(),
        observation: `Budget exceeded: ${budgetStatus.reason}`,
        success: null,
        failure: budgetStatus.reason || "Budget limit reached",
        hypothesis: null,
        confidence: 0,
        decision: "abort",
        reasoning: "Mission budget exceeded, stopping execution to prevent cost overrun.",
      };
    }

    let success = false;
    let result: unknown = undefined;
    let error: string | undefined = undefined;

    // Générer les arguments du skill au moment de l'exécution si le Planner
    // ne les a pas remplis (ils sont vides par défaut). On utilise le LLM avec
    // le schéma de l'outil, le contexte de l'objectif et les résultats déjà obtenus.
    if (this.needsArgs(action)) {
      let argGenError: string | null = null;
      try {
        action.args = await this.generateArgs(mission, goal, action);
      } catch (err) {
        argGenError = (err as Error).message;
        console.warn(
          `[Executor]    ⚠️ Génération d'arguments échouée pour ${action.skillName}: ${argGenError}`
        );
      }

      // Fail-fast : si l'outil exige des arguments mais que la génération a
      // échoué (JSON LLM invalide) ou n'a rien produit, NE PAS exécuter l'outil
      // avec des args vides/undefined. On l'a déjà payé en coûts (ex. embedding
      // Gemini sur une query vide → 400). On enregistre un échec explicite et on
      // laisse la boucle de réflexion décider (retry/replan).
      const stillMissingArgs = !action.args || Object.keys(action.args).length === 0;
      if (this.schemaRequiresArgs(action.skillName) && (argGenError || stillMissingArgs)) {
        const reason =
          `Arguments requis non disponibles pour ${action.skillName} ` +
          `(génération LLM ${argGenError ? `échouée: ${argGenError}` : "sans objet JSON exploitable"}).`;
        console.log(`[Executor]    ✗ ${action.skillName} ignoré: ${reason}`);
        mission.recordActionResult(action.id, { error: reason }, false);
        this.scorer.recordUsage(action.skillName, false, Date.now() - startTime);
        try { strategyMemory.recordSkillOutcome(action.skillName, false, Date.now() - startTime); } catch { /* best-effort */ }
        this.emit("action_completed", {
          missionId: mission.id,
          goalId,
          actionId: action.id,
          skill: action.skillName,
          success: false,
          error: reason,
          durationMs: Date.now() - startTime,
        });
        return this.createDefaultReflection(action.id, false);
      }

      // Validation structurelle des arguments produits par le LLM contre le
      // schéma de l'outil. Évite d'exécuter un skill avec un JSON invalide
      // (champ requis manquant, type incorrect, champ inconnu) qui échouerait
      // côté handler après avoir déjà consommé des tokens.
      if (action.args && Object.keys(action.args).length > 0) {
        const check = this.validateArgs(action.skillName, action.args);
        if (!check.valid) {
          const reason = `Arguments invalides pour ${action.skillName}: ${check.errors.join(" ; ")}`;
          console.log(`[Executor]    ✗ ${reason}`);
          mission.recordActionResult(action.id, { error: reason }, false);
          this.scorer.recordUsage(action.skillName, false, Date.now() - startTime);
          try { strategyMemory.recordSkillOutcome(action.skillName, false, Date.now() - startTime); } catch { /* best-effort */ }
          this.emit("action_completed", {
            missionId: mission.id,
            goalId,
            actionId: action.id,
            skill: action.skillName,
            success: false,
            error: reason,
            durationMs: Date.now() - startTime,
          });
          return this.createDefaultReflection(action.id, false);
        }
      }
    }

    // Curseur d'autonomie : décider si l'action peut s'exécuter, doit être
    // approuvée, ou est refusée (mode suggest/ask/auto + .leannaignore).
    if (this.autonomy) {
      const verdict = this.autonomy.decide(action.skillName, action.args);
      let allowed = verdict.decision === "allow";

      if (verdict.decision === "deny") {
        console.log(`[Executor]    ⛔ ${action.skillName} refusé: ${verdict.reason}`);
        mission.recordActionResult(action.id, { error: verdict.reason }, false);
        this.emit("action_denied", {
          missionId: mission.id,
          goalId,
          actionId: action.id,
          skill: action.skillName,
          reason: verdict.reason,
        });
        return this.createDefaultReflection(action.id, false);
      }

      if (verdict.decision === "ask") {
        console.log(`[Executor]    ⏸️ ${action.skillName} en attente d'approbation: ${verdict.reason}`);
        allowed = await this.requestApproval(mission, goalId, action, verdict.reason);
        if (!allowed) {
          const reason = "Action refusée ou non approuvée dans le délai imparti.";
          mission.recordActionResult(action.id, { error: reason }, false);
          this.emit("action_denied", {
            missionId: mission.id,
            goalId,
            actionId: action.id,
            skill: action.skillName,
            reason,
          });
          return this.createDefaultReflection(action.id, false);
        }
      }
    }

    // ── Garde anti-boucle de recherche web ──────────────────────────────────
    // Refuse une recherche web dont la signature normalisée a déjà été exécutée
    // au-delà du seuil toléré dans cette mission. Évite de relancer la même
    // requête reformulée en boucle (symptôme observé en prod) ; pousse l'agent
    // à exploiter les résultats déjà obtenus ou à changer d'approche.
    if (Executor.WEB_SEARCH_TOOLS.has(action.skillName)) {
      const signature = Executor.webSearchSignature(action.args);
      if (signature) {
        let perMission = this.webSearchSignatures.get(mission.id);
        if (!perMission) {
          perMission = new Map<string, number>();
          this.webSearchSignatures.set(mission.id, perMission);
        }
        const seen = perMission.get(signature) ?? 0;
        if (seen >= Executor.WEB_SEARCH_MAX_REPEATS) {
          const reason =
            `Recherche web redondante refusée : requête équivalente déjà exécutée ` +
            `${seen} fois dans cette mission. Exploiter les résultats précédents ou ` +
            `changer d'approche plutôt que de reformuler la même recherche.`;
          console.log(`[Executor]    ⛔ ${action.skillName} ignoré: ${reason}`);
          mission.recordActionResult(action.id, { error: reason }, false);
          this.scorer.recordUsage(action.skillName, false, Date.now() - startTime);
          try { strategyMemory.recordSkillOutcome(action.skillName, false, Date.now() - startTime); } catch { /* best-effort */ }
          this.emit("action_completed", {
            missionId: mission.id,
            goalId,
            actionId: action.id,
            skill: action.skillName,
            success: false,
            error: reason,
            durationMs: Date.now() - startTime,
          });
          return this.createDefaultReflection(action.id, false);
        }
        perMission.set(signature, seen + 1);
      }
    }

    try {
      const dryRun = mission.getConfig().dryRun;
      const signal = this.getAbortController(mission.id).signal;
      result = await this.skillHandler!(action.skillName, action.args, {
        dryRun,
        signal,
        beforeExecute: this.supervisorWriteHooks.has(mission.id)
          ? async (toolName, args) => {
              // Read-only tools must not be asked for write targets.
              if (!Executor.CHECKPOINT_WRITE_TOOLS.has(toolName)) return;
              const hook = this.supervisorWriteHooks.get(mission.id);
              if (!hook) throw new Error("Checkpoint hook indisponible : écriture supervisée bloquée.");
              await hook(toolName, args);
            }
          : undefined,
        // Une action planifiée = une étape : sa reprise après crash est
        // dédoublonnée (ou bloquée si son effet est incertain) par le ledger.
        idempotencyScope: { missionId: mission.id, stepId: action.id },
      });
      const failure = Executor.detectSkillFailure(result);
      success = failure === null;
      if (!success) {
        error = failure ?? "Erreur retournée par le skill";
        console.log(`[Executor]    ✗ ${action.skillName} échoué (result): ${error}`);
      } else {
        console.log(`[Executor]    ✓ ${action.skillName} réussi`);
      }
    } catch (err: any) {
      error = err.message ?? String(err);
      console.log(`[Executor]    ✗ ${action.skillName} échoué: ${error}`);
    }

    const durationMs = Date.now() - startTime;

    // Enregistrer le résultat (avec sa durée, exposée ensuite par l'API).
    mission.recordActionResult(action.id, result, success, durationMs);
    this.scorer.recordUsage(action.skillName, success, durationMs);
    // Persistance durable de la fiabilité du skill (GAP-1) : alimente la mémoire
    // de stratégie lue par les missions futures. Best-effort, jamais bloquant.
    try {
      strategyMemory.recordSkillOutcome(action.skillName, success, durationMs);
    } catch { /* la fiabilité durable est best-effort */ }

    // Réflexion
    const reflectionInput: ReflectionInput = {
      actionId: action.id,
      actionName: action.skillName,
      skillName: action.skillName,
      goalTitle: goal.title,
      success,
      result,
      error,
      attemptCount: goal.attempts + 1,
      maxAttempts: goal.maxAttempts,
      previousConfidence: mission.getMetrics().averageConfidence,
      previousErrors: mission.getContext().errors.map((e) => e.error),
    };

    const reflection = this.config.enableReflection
      ? await this.reflection.reflect(reflectionInput)
      : this.createDefaultReflection(action.id, success);

    mission.recordReflection(reflection);

    this.emit("action_completed", {
      missionId: mission.id,
      goalId,
      actionId: action.id,
      skill: action.skillName,
      success,
      confidence: reflection.confidence,
      decision: reflection.decision,
      durationMs,
    });

    return reflection;
  }

  // ─── Génération d'arguments ────────────────────────────────────────────────

  /** Une action a besoin d'arguments si le Planner ne les a pas remplis. */
  private needsArgs(action: PlannedAction): boolean {
    if (!this.llmArgGen) return false;
    const schema = this.toolSchemas.get(action.skillName);
    // Outil sans paramètres : rien à générer.
    if (schema && !this.schemaHasProperties(schema)) return false;
    return !action.args || Object.keys(action.args).length === 0;
  }

  private schemaHasProperties(schema: ToolSchema): boolean {
    const params = schema.parameters as any;
    if (!params || typeof params !== "object") return false;
    const props = params.properties;
    return !!props && typeof props === "object" && Object.keys(props).length > 0;
  }

  /**
   * Vrai si l'outil déclare au moins un paramètre `required` dans son schéma.
   * Sert au fail-fast : un outil sans paramètre obligatoire peut légitimement
   * s'exécuter avec des args vides, mais un outil à paramètre requis ne doit
   * jamais être appelé quand la génération d'arguments a échoué.
   */
  private schemaRequiresArgs(skillName: string): boolean {
    const schema = this.toolSchemas.get(skillName);
    const params = schema?.parameters as any;
    if (!params || typeof params !== "object") return false;
    return Array.isArray(params.required) && params.required.length > 0;
  }

  /**
   * Valide les arguments produits par le LLM contre le schéma JSON de l'outil :
   * champs requis présents, pas de champ inconnu, types cohérents. Retourne la
   * liste des erreurs (vide = valide). Sans schéma/propriétés, on considère valide.
   */
  private validateArgs(
    skillName: string,
    args: Record<string, unknown>
  ): { valid: boolean; errors: string[] } {
    const schema = this.toolSchemas.get(skillName);
    const params = schema?.parameters as
      | { type?: string; properties?: Record<string, { type?: string }>; required?: string[] }
      | undefined;
    if (!params?.properties) return { valid: true, errors: [] };

    const errors: string[] = [];
    const required = Array.isArray(params.required) ? params.required : [];
    for (const req of required) {
      if (args[req] === undefined || args[req] === null || args[req] === "") {
        errors.push(`Champ requis manquant: "${req}"`);
      }
    }
    for (const [key, value] of Object.entries(args)) {
      if (!(key in params.properties)) {
        errors.push(`Champ inconnu: "${key}"`);
        continue;
      }
      const expected = params.properties[key]?.type;
      if (expected && !this.matchesJsonType(value, expected)) {
        errors.push(`Type invalide pour "${key}": attendu ${expected}, reçu ${typeof value}`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  /** Vérifie qu'une valeur correspond à un type JSON Schema élémentaire. */
  private matchesJsonType(value: unknown, expected: string): boolean {
    switch (expected) {
      case "string":  return typeof value === "string";
      case "number":  return typeof value === "number" && Number.isFinite(value);
      case "integer": return Number.isInteger(value as number);
      case "boolean": return typeof value === "boolean";
      case "array":   return Array.isArray(value);
      case "object":  return typeof value === "object" && value !== null && !Array.isArray(value);
      case "null":    return value === null;
      default:        return true;
    }
  }

  /**
   * Génère les arguments d'un skill via le LLM, en s'appuyant sur:
   *   - le schéma de paramètres de l'outil
   *   - le but courant (titre, description, critères)
   *   - les fichiers pertinents et les résultats des actions déjà exécutées
   */
  private async generateArgs(
    mission: Mission,
    goal: Goal,
    action: PlannedAction
  ): Promise<Record<string, unknown>> {
    if (!this.llmArgGen) return action.args ?? {};

    const schema = this.toolSchemas.get(action.skillName);
    const context = mission.getContext();

    const previousResults = goal.plannedActions
      .filter((a) => a.status === "completed" && a.id !== action.id)
      .slice(-3)
      .map((a) => ({
        skill: a.skillName,
        result: this.summarizeResult(a.result),
      }));

    // En mode « artefact forcé », on injecte une consigne supplémentaire pour
    // que l'écriture produise un livrable complet et autoportant (pas un
    // squelette vide), avec un nom de fichier par défaut si besoin.
    const forcedArtifact = this.loopGuards.get(goal.id)?.forcedArtifact === true;
    const artifactInstruction = forcedArtifact && Executor.WRITE_TOOLS.includes(action.skillName)
      ? `\nCONSIGNE PRIORITAIRE (ARTEFACT) :\n` +
        `- Cet appel DOIT produire un livrable concret et complet qui satisfait les critères de succès.\n` +
        `- Rédige un contenu réel et détaillé (pas de placeholder), au format Markdown si pertinent.\n` +
        `- Si aucun chemin n'est évident, utilise un nom de fichier explicite à la racine du projet ` +
        `(ex. "OPTIMIZATION_PLAN.md" pour un plan d'optimisation, sinon un nom dérivé de l'objectif).\n`
      : "";

    const prompt = `Tu génères les ARGUMENTS d'un outil pour accomplir une étape précise.

OUTIL: ${action.skillName}
DESCRIPTION: ${schema?.description ?? "(non documentée)"}
SCHÉMA DES PARAMÈTRES (JSON Schema):
${JSON.stringify(schema?.parameters ?? {}, null, 2)}

OBJECTIF COURANT: ${goal.title}
DÉTAIL: ${goal.description}
CRITÈRES DE SUCCÈS:
${goal.successCriteria.map((c) => `  - ${c}`).join("\n")}
JUSTIFICATION DE CET OUTIL: ${action.rationale}

CONTEXTE:
- Fichiers pertinents: ${context.relevantFiles.slice(0, 10).join(", ") || "aucun"}
- Mission: ${mission.getState().title} — ${mission.getState().description}
- Résultats précédents: ${previousResults.length > 0 ? JSON.stringify(previousResults) : "aucun"}
${artifactInstruction}
INSTRUCTIONS:
- Retourne UNIQUEMENT un objet JSON correspondant au schéma des paramètres.
- N'invente pas de champs absents du schéma.
- Si un paramètre est optionnel et inutile, ne l'inclus pas.
- Réponds STRICTEMENT en JSON, sans texte autour.

JSON:`;

    const raw = await this.withTimeout(this.llmArgGen(prompt), 20_000, "arg-gen");
    const args = this.parseJsonObject(raw);
    console.log(
      `[Executor]    🧩 Arguments générés pour ${action.skillName}: ${JSON.stringify(args).slice(0, 200)}`
    );
    return args;
  }

  // ─── Validation par critères de succès ──────────────────────────────────────

  /**
   * Valide qu'un objectif est réellement atteint au regard de ses
   * successCriteria, à partir des actions exécutées et de leurs résultats.
   * Utilise le LLM si disponible, sinon une heuristique conservatrice.
   */
  private async verifyGoalCriteria(mission: Mission, goal: Goal): Promise<{
    passed: boolean;
    reasoning: string;
    /** Vrai quand rien ne prouve l'atteinte de l'objectif (AUDIT-013). */
    unverified?: boolean;
  }> {
    const executed = goal.plannedActions.filter(
      (a) => a.status === "completed" || a.status === "failed"
    );
    const allSuccess =
      executed.length > 0 && executed.every((a) => a.status === "completed");

    // ── Vérification par PREUVE (audit, point 11) ───────────────────────────
    // Quand le moteur de preuve est branché et activé, on juge l'objectif sur
    // des FAITS (checks dérivés des résultats de skills, fichiers écrits) plutôt
    // que sur une narration LLM. La preuve prime : un seul check factuel échoué
    // interdit le succès. On ne retombe sur le LLM/heuristique QUE lorsqu'aucun
    // fait exploitable n'existe (objectif purement analytique sans check).
    // En mode supervisé, le Supervisor juge la mission sur ces mêmes faits : les
    // objectifs doivent l'être aussi, sinon une mission "completed" peut voir
    // ses fichiers restaurés par un Supervisor qui refuse la preuve (F-07).
    const supervised = this.supervisor !== null && this.supervisedMode;
    if (supervised && !this.evidence) this.evidence = new EvidenceEngine();
    if (this.evidence && (this.evidenceVerification || supervised)) {
      const verdict = this.verifyByEvidence(mission, goal, executed);
      if (verdict) return verdict;
    }

    // Sans critères explicites : TOUTES les actions doivent avoir réussi
    // (une seule réussite ne prouve pas l'objectif, AUDIT-013).
    if (!goal.successCriteria || goal.successCriteria.length === 0) {
      return {
        passed: allSuccess,
        reasoning: allSuccess
          ? "Aucun critère explicite ; toutes les actions ont réussi."
          : "Aucun critère explicite et au moins une action a échoué.",
      };
    }

    // Sans LLM : validation conservatrice — toutes les actions doivent réussir.
    if (!this.llmVerify) {
      return {
        passed: allSuccess,
        reasoning: allSuccess
          ? "Toutes les actions planifiées ont réussi (validation heuristique)."
          : "Certaines actions ont échoué ; critères non confirmés (validation heuristique).",
      };
    }

    const actionsSummary = executed.map((a) => ({
      skill: a.skillName,
      status: a.status,
      result: this.summarizeResult(a.result),
    }));

    const prompt = `Tu es un vérificateur qualité. Évalue si l'objectif est atteint au vu des preuves.

OBJECTIF: ${goal.title}
DÉTAIL: ${goal.description}
CRITÈRES DE SUCCÈS:
${goal.successCriteria.map((c) => `  - ${c}`).join("\n")}

ACTIONS EXÉCUTÉES ET RÉSULTATS:
${JSON.stringify(actionsSummary, null, 2)}

INSTRUCTIONS:
- Juge uniquement à partir des preuves ci-dessus.
- "passed": true UNIQUEMENT si les preuves montrent que les critères sont satisfaits.
- En cas de doute ou d'information manquante, "passed" doit être false.
- Réponds STRICTEMENT en JSON: {"passed": true|false, "reasoning": "..."}

JSON:`;

    try {
      const raw = await this.withTimeout(this.llmVerify(prompt), 20_000, "verify");
      const parsed = this.parseJsonObject(raw);
      const passed = parsed.passed === true;
      const reasoning =
        typeof parsed.reasoning === "string" ? parsed.reasoning : "Vérification LLM effectuée.";

      // Un verdict négatif n'est plus converti en succès : si les actions ont
      // toutes réussi mais que les critères ne sont pas confirmés, l'objectif
      // est « non vérifié » — jamais « atteint » (AUDIT-013).
      if (!passed && allSuccess) {
        return { passed: false, unverified: true, reasoning: `Actions réussies mais critères non confirmés. (${reasoning})` };
      }

      return { passed, reasoning };
    } catch (err) {
      console.warn(
        `[Executor]    ⚠️ Vérification des critères échouée, repli heuristique: ${(err as Error).message}`
      );
      return {
        passed: allSuccess,
        reasoning: "Vérification LLM indisponible ; repli sur le succès de toutes les actions.",
      };
    }
  }

  /**
   * Vérifie un objectif à partir d'une PREUVE factuelle (audit, point 11).
   *
   * Construit un `EvidenceInput` depuis les actions exécutées :
   *   - chaque action devient un `runtimeCheck` dont `passed` dérive de
   *     `detectSkillFailure` (le même détecteur factuel utilisé à l'exécution),
   *     et non de la narration ;
   *   - les fichiers écrits (outils d'écriture) alimentent `filesModified` ;
   *   - les outils exécutés sont tracés.
   * Le bundle est scellé par l'`EvidenceEngine`, qui calcule un verdict
   * déterministe (`passed`) et une confiance bornée.
   *
   * Retourne `null` quand aucun fait exploitable n'existe (aucune action
   * terminée) : l'appelant retombe alors sur la vérification LLM/heuristique.
   */
  private verifyByEvidence(
    mission: Mission,
    goal: Goal,
    executed: PlannedAction[]
  ): { passed: boolean; reasoning: string } | null {
    if (!this.evidence) return null;
    if (executed.length === 0) return null;

    const runtimeChecks: CheckResult[] = executed.map((a) => {
      const failure = Executor.detectSkillFailure(a.result);
      return {
        name: `${a.skillName}`,
        passed: a.status === "completed" && failure === null,
        details: failure ?? undefined,
      };
    });

    // Fichiers réellement visés par une écriture réussie (preuve d'artefact).
    const filesModified = Array.from(
      new Set(
        executed
          .filter(
            (a) =>
              a.status === "completed" &&
              Executor.WRITE_TOOLS.includes(a.skillName) &&
              typeof (a.args as Record<string, unknown>)?.path === "string"
          )
          .map((a) => String((a.args as Record<string, unknown>).path))
      )
    );

    // ── Objectif à livrable sans écriture = ÉCHEC factuel ───────────────────
    // Observé en prod : un objectif « produire un rapport » était validé sur de
    // simples lectures (verify_file/list/search) alors qu'aucun fichier n'était
    // produit. Si l'objectif attend un artefact concret et qu'AUCUNE écriture
    // n'a réussi, on ajoute un contrôle factuel échoué : la preuve ne peut pas
    // établir le succès sans livrable.
    if (this.goalExpectsArtifact(goal) && filesModified.length === 0) {
      runtimeChecks.push({
        name: "artefact-produit",
        passed: false,
        details:
          "L'objectif attend un livrable concret (fichier/document) mais aucune écriture n'a abouti.",
      });
    }

    const toolsExecuted = executed.map((a) => a.skillName);

    const input: EvidenceInput = {
      missionId: mission.id,
      goal: goal.title,
      filesModified,
      toolsExecuted,
      runtimeChecks,
    };

    const bundle = this.evidence.record(input);

    this.emit("goal_evidence", {
      missionId: mission.id,
      goalId: goal.id,
      passed: bundle.passed,
      confidence: bundle.confidence,
      checks: runtimeChecks.length,
      failedChecks: runtimeChecks.filter((c) => !c.passed).length,
    });

    const failed = runtimeChecks.filter((c) => !c.passed);
    const reasoning = bundle.passed
      ? `Preuve: ${runtimeChecks.length} contrôle(s) factuel(s) passé(s) (confiance ${(bundle.confidence * 100).toFixed(0)}%).`
      : `Preuve: ${failed.length}/${runtimeChecks.length} contrôle(s) en échec — ${failed
          .map((c) => `${c.name}${c.details ? ` (${c.details})` : ""}`)
          .slice(0, 3)
          .join("; ")}.`;

    return { passed: bundle.passed, reasoning };
  }

  private summarizeResult(result: unknown): string {
    if (result === null || result === undefined) return "ok (vide)";
    let text: string;
    if (typeof result === "string") text = result;
    else {
      try { text = JSON.stringify(result); } catch { text = String(result); }
    }
    // Résumé injecté dans les prompts LLM : donnée non fiable (AUDIT-006).
    return guardUntrustedContent(text.slice(0, SUMMARY_RESULT_MAX_CHARS), "mission_action").text;
  }

  /**
   * Détecte un échec de skill à partir de son résultat.
   *
   * Historiquement, un skill n'était considéré en échec que s'il renvoyait une
   * clé `error` à la racine. Or de nombreux skills de vérification
   * (`verify_typecheck`, `verify_file`, `verify_lint`…) signalent leur échec
   * via `ok: false` ou `status: "failed"` SANS clé `error`. Résultat : une
   * compilation TypeScript en échec était loggée « ✓ réussi » puis contredite
   * par le vérificateur LLM (qui lisait `status: failed` dans la preuve),
   * faisant échouer toute la mission de façon incohérente.
   *
   * On reconnaît désormais explicitement ces conventions d'échec. Un résultat
   * qui ne déclare aucun de ces champs reste considéré comme un succès
   * (comportement permissif inchangé pour les skills « best-effort »).
   *
   * @returns `null` si succès, sinon un message d'échec lisible.
   */
  /**
   * Enrichit un message d'échec générique avec les détails structurés que
   * certains skills de vérification joignent au résultat (`parsedErrors` de
   * `verify_typecheck`/`verify_file`/`verify_lint`, ou `output` brut tsc).
   *
   * Sans ça, l'agent ne recevait que « Erreurs de typage détectées (code
   * inconnu) » — un message inexploitable qui provoquait des boucles d'échec
   * du typecheck : impossible de corriger des erreurs qu'on ne voit pas. On
   * expose désormais fichier/ligne/message pour chaque erreur détectée.
   */
  private static withFailureDetails(
    base: string,
    r: Record<string, unknown>,
  ): string {
    // Nombre d'erreurs détaillées listées pour ne pas noyer la preuve.
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
        parsed.length > MAX_LISTED
          ? `\n  … et ${parsed.length - MAX_LISTED} autre(s).`
          : "";
      return `${base}\n${lines.join("\n")}${extra}`;
    }

    // Pas d'erreurs structurées : retomber sur la sortie brute tronquée.
    if (typeof r.output === "string" && r.output.trim()) {
      const out = r.output.trim();
      const MAX_OUTPUT = 1500;
      const clipped =
        out.length > MAX_OUTPUT
          ? `${out.slice(0, MAX_OUTPUT)}\n  … (sortie tronquée)`
          : out;
      return `${base}\n${clipped}`;
    }

    return base;
  }

  /**
   * Construit une signature normalisée d'une requête de recherche web afin de
   * reconnaître des reformulations équivalentes : minuscules, accents retirés,
   * ponctuation supprimée, mots dédupliqués et triés, mots vides courts écartés.
   * Deux requêtes ne différant que par l'ordre des mots-clés ou une virgule
   * produisent la même signature.
   *
   * @returns la signature, ou `null` si aucune requête exploitable.
   */
  private static webSearchSignature(args: unknown): string | null {
    if (!args || typeof args !== "object") return null;
    const a = args as Record<string, unknown>;
    const raw = a.query ?? a.q ?? a.search ?? a.url;
    if (typeof raw !== "string" || !raw.trim()) return null;

    const tokens = raw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // accents
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ") // ponctuation → espace
      .split(/\s+/)
      .filter((w) => w.length > 2); // écarte les mots vides courts

    const unique = Array.from(new Set(tokens)).sort();
    return unique.length > 0 ? unique.join(" ") : null;
  }

  static detectSkillFailure(result: unknown): string | null {
    if (result === null || result === undefined) return null;
    if (typeof result !== "object") return null;
    const r = result as Record<string, unknown>;

    // 1. Clé d'erreur explicite (convention historique).
    if ("error" in r && r.error) {
      return typeof r.error === "string" ? r.error : "Erreur retournée par le skill";
    }

    // 2. Drapeau booléen de succès explicitement faux.
    if (r.ok === false || r.success === false) {
      const base =
        (typeof r.message === "string" && r.message) ||
        (typeof r.stderr === "string" && r.stderr) ||
        "Le skill a signalé un échec (ok/success = false).";
      return Executor.withFailureDetails(base, r);
    }

    // 3. Champ `status` explicitement en échec.
    if (typeof r.status === "string") {
      const s = r.status.toLowerCase();
      if (s === "failed" || s === "error" || s === "failure") {
        const base =
          (typeof r.message === "string" && r.message) ||
          `Le skill a renvoyé status="${r.status}".`;
        return Executor.withFailureDetails(base, r);
      }
    }

    // 4. Codes d'échec process (exitCode non nul, status HTTP >= 400).
    if (typeof r.exitCode === "number" && r.exitCode !== 0) {
      return `Le skill a terminé avec exitCode=${r.exitCode}.`;
    }
    if (typeof r.statusCode === "number" && r.statusCode >= 400) {
      return `Le skill a renvoyé un statut HTTP ${r.statusCode}.`;
    }

    return null;
  }

  private parseJsonObject(raw: string): Record<string, unknown> {
    const trimmed = raw.trim();
    // 1. Essayer le parse direct
    try {
      const direct = JSON.parse(trimmed);
      if (typeof direct === "object" && direct !== null && !Array.isArray(direct)) {
        return direct as Record<string, unknown>;
      }
    } catch {
      // Continuer avec l'extraction
    }

    // 2. Extraire depuis un bloc de code markdown ```json ... ```
    const mdMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (mdMatch && mdMatch[1]) {
      try {
        const mdParsed = JSON.parse(mdMatch[1].trim());
        if (typeof mdParsed === "object" && mdParsed !== null && !Array.isArray(mdParsed)) {
          return mdParsed as Record<string, unknown>;
        }
      } catch {
        // Fallback sur le parcours de balanced braces
      }
    }

    // 3. Trouver le premier '{' et équilibrer les accolades
    const start = trimmed.indexOf("{");
    if (start === -1) throw new Error("Aucun objet JSON trouvé dans la réponse LLM");

    let depth = 0;
    let inString = false;
    let escape = false;
    let jsonEnd = -1;

    for (let i = start; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\" && inString) {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) {
            jsonEnd = i + 1;
            break;
          }
        }
      }
    }

    if (jsonEnd === -1) {
      throw new Error("Objet JSON malformé ou non fermé dans la réponse LLM");
    }

    const candidate = trimmed.slice(start, jsonEnd);
    const parsed = JSON.parse(candidate);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("La réponse LLM n'est pas un objet JSON");
    }
    return parsed as Record<string, unknown>;
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timeoutId: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`LLM ${label} timeout (${ms}ms)`)), ms);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private createSubGoals(
    mission: Mission,
    parentId: string,
    plans: Array<{ title: string; description: string; successCriteria: string[]; priority: string; dependsOn?: string[] }>
  ): string[] {
    const ids: string[] = [];
    // 1re passe : créer tous les objectifs et mémoriser le mapping titre → id.
    const titleToId = new Map<string, string>();

    // Plafonnement par `maxSubGoals` (audit, point 12). Sans ça, un LLM qui
    // renvoie plus de 10 sous-objectifs faisait lever `addSubGoal` au 11e et
    // plantait tout `startMission`. On tronque proprement et on le signale.
    const maxSubGoals = mission.getConfig().maxSubGoals;
    let effectivePlans = plans;
    if (plans.length > maxSubGoals) {
      console.warn(
        `[Executor] ⚠️ ${plans.length} sous-objectifs proposés > maxSubGoals (${maxSubGoals}). ` +
        `Troncature aux ${maxSubGoals} premiers.`
      );
      this.emit("plan_truncated", {
        missionId: mission.id,
        proposed: plans.length,
        kept: maxSubGoals,
      });
      effectivePlans = plans.slice(0, maxSubGoals);
    }

    for (const plan of effectivePlans) {
      const id = mission.addSubGoal({
        parentId,
        title: plan.title,
        description: plan.description,
        successCriteria: plan.successCriteria,
        priority: plan.priority as import("./types.js").GoalPriority,
      });
      ids.push(id);
      // Dépendances par titre : conserver la PREMIÈRE occurrence d'un titre.
      // Avant, un titre dupliqué écrasait le mapping — les `dependsOn` pointaient
      // alors tous vers le dernier homonyme. On garde le premier et on avertit.
      const key = plan.title.trim().toLowerCase();
      if (titleToId.has(key)) {
        console.warn(
          `[Executor] ⚠️ Titre de sous-objectif en double: "${plan.title}". ` +
          `Les dépendances par titre résoudront vers la 1re occurrence.`
        );
      } else {
        titleToId.set(key, id);
      }
    }

    // 2e passe : résoudre les dépendances (exprimées par titre) en IDs de goals.
    // Les dépendances non résolues (titre inconnu) sont signalées explicitement
    // au lieu d'être silencieusement supprimées. On itère sur les plans
    // RÉELLEMENT créés (effectivePlans) pour rester aligné avec `ids`.
    effectivePlans.forEach((plan, index) => {
      const deps = plan.dependsOn ?? [];
      if (deps.length === 0) return;
      const goal = mission.getGoal(ids[index]);
      if (!goal) return;

      const resolved: string[] = [];
      const unresolved: string[] = [];
      for (const d of deps) {
        const id = titleToId.get(String(d).trim().toLowerCase());
        if (id && id !== ids[index]) resolved.push(id);
        else if (!id) unresolved.push(String(d));
      }
      goal.dependsOn = resolved;
      if (unresolved.length > 0) {
        console.warn(
          `[Executor] ⚠️ Dépendances non résolues pour "${plan.title}": ${unresolved.join(", ")}`
        );
        this.emit("goal_unresolved_deps", {
          missionId: mission.id,
          goalId: ids[index],
          unresolved,
        });
      }
    });

    return ids;
  }

  private createDefaultReflection(actionId: string, success: boolean): ReflectionResult {
    return {
      actionId,
      timestamp: new Date().toISOString(),
      observation: success ? "Action réussie" : "Action échouée",
      success: success ? "OK" : null,
      failure: success ? null : "Échec",
      hypothesis: null,
      confidence: success ? 0.7 : 0.3,
      decision: success ? "continue" : "retry",
      reasoning: success ? "Succès, on continue." : "Échec, on retente.",
    };
  }

  private extractLessons(mission: Mission): string[] {
    const lessons: string[] = [];
    const context = mission.getContext();

    // Leçons des erreurs répétées
    const errorCounts = new Map<string, number>();
    for (const err of context.errors) {
      errorCounts.set(err.action, (errorCounts.get(err.action) || 0) + 1);
    }
    for (const [action, count] of errorCounts) {
      if (count >= 2) {
        lessons.push(`Le skill "${action}" a tendance à échouer (${count}x). Envisager une alternative.`);
      }
    }

    // Leçons des hypothèses validées
    if (context.hypotheses.length > 0) {
      lessons.push(`Hypothèses explorées: ${context.hypotheses.slice(-3).join("; ")}`);
    }

    return lessons;
  }

  /**
   * Finalise une mission (une seule fois).
   *
   * Correctif audit (point 4) : rendu IDEMPOTENT. L'annulation/timeout et la fin
   * naturelle de `executeMission` pouvaient tous deux appeler cette méthode pour
   * la même mission → doublon dans `completedMissions`, double apprentissage et
   * `mission_completed` émis après `mission_cancelled`. Le garde `finalized`
   * garantit qu'une mission n'est finalisée qu'une fois.
   */
  private finalizeMission(mission: Mission): void {
    if (this.finalizedMissions.has(mission.id)) return;
    this.finalizedMissions.add(mission.id);

    // Libérer le contrôleur d'annulation (plus de skill à interrompre).
    this.abortControllers.delete(mission.id);
    // Libérer le suivi anti-boucle des recherches web de cette mission.
    this.webSearchSignatures.delete(mission.id);

    this.activeMissions.delete(mission.id);
    this.completedMissions.push(mission);
    if (this.completedMissions.length > Executor.MAX_COMPLETED) {
      const evicted = this.completedMissions.shift();
      if (evicted) this.forgetMissionArtifacts(evicted.id);
    }
    // Persistance finale (statut terminal).
    void this.persist(mission);
    this.proposeLearning(mission);
    this.proposePlaybook(mission);
    this.updateProjectProfile(mission);
    this.selfCritique(mission);
    this.recordEvolution(mission);
  }

  /**
   * Self-Critique (task.md §10): compare plan vs execution vs result, score the
   * run, and surface "next time start with X". Best-effort; emits an event for
   * the UI. Does not mutate the mission.
   */
  private selfCritique(mission: Mission): void {
    try {
      const evaluation = selfEvaluationEngine.evaluate(mission.getState() as unknown as SelfEvalMissionView);
      this.selfEvaluations.set(mission.id, evaluation);
      this.emit("mission_self_critique", {
        missionId: mission.id,
        overall: evaluation.overall,
        scores: evaluation.scores,
        nextTimeStartWith: evaluation.nextTimeStartWith,
      });
    } catch (error) {
      this.emit("mission_self_critique_failed", { missionId: mission.id, error: String(error) });
    }
  }

  /**
   * Mission Evolution (task.md §6): record which APPROACH (ordered successful
   * skills) worked or failed for this problem CLASS, so a future similar mission
   * auto-selects the winning approach instead of repeating a failing one. Learns
   * from both success and failure. Best-effort.
   */
  private recordEvolution(mission: Mission): void {
    try {
      const state = mission.getState();
      const signature = problemSignature(state.title, state.context.errors.map((e) => e.error));
      const steps = Object.values(state.goals)
        .filter((g) => g.parentId !== null || Object.values(state.goals).length === 1)
        .flatMap((g) => [...g.plannedActions].sort((a, b) => a.order - b.order))
        .filter((a) => a.status === "completed" || a.status === "failed")
        .map((a) => a.skillName)
        .filter(Boolean);
      if (steps.length === 0) return;
      missionEvolutionStore.recordOutcome({ signature, steps, success: mission.status === "completed" });
    } catch {
      /* evolution learning is best-effort */
    }
  }

  /**
   * Keep the per-project intelligence profile current (task.md §4, P0): record
   * the terminal outcome and refresh detected stack / effective-vs-failing
   * strategies / learned playbooks so the next mission on this project starts
   * informed. Best-effort — never affects an already terminal mission.
   */
  private updateProjectProfile(mission: Mission): void {
    try {
      projectProfile.recordMissionOutcome(mission.status === "completed");
      // Re-aggregate reliability/playbook/knowledge signals (cheap, in-memory reads).
      projectProfile.refresh();
    } catch {
      /* profile maintenance is best-effort */
    }
  }

  /**
   * Learn a reusable Playbook from a *successful* mission (task.md §3, P0).
   * Complements proposeLearning: LearningEngine stores prose lessons, this stores
   * a replayable ordered skill sequence keyed by a stable trigger signature so
   * Leanna can later say « j'ai déjà résolu N problèmes similaires » and reuse
   * the strategy. Guarded and best-effort — never flips a terminal mission.
   */
  private proposePlaybook(mission: Mission): void {
    try {
      if (mission.status !== "completed") return;
      const state = mission.getState();
      const input: PlaybookMissionInput = {
        id: mission.id,
        title: state.title,
        status: state.status,
        goals: Object.fromEntries(
          Object.entries(state.goals).map(([id, goal]) => [id, {
            status: goal.status,
            dependsOn: goal.dependsOn,
            completedAt: goal.completedAt,
            parentId: goal.parentId,
            plannedActions: goal.plannedActions.map((action) => ({
              skillName: action.skillName,
              order: action.order,
              status: action.status,
            })),
          }]),
        ),
        errors: state.context.errors.map((error) => ({ action: error.action, error: error.error })),
        relevantFiles: state.context.relevantFiles,
      };
      const playbook = playbookStore.learnFromMission(input);
      if (playbook) {
        this.emit("mission_playbook_learned", {
          missionId: mission.id,
          playbookId: playbook.id,
          triggerSignature: playbook.triggerSignature,
          steps: playbook.steps.length,
          timesLearned: playbook.timesLearned,
        });
      }
    } catch (error) {
      // Playbook learning must never turn an already terminal mission into a failure.
      this.emit("mission_playbook_failed", { missionId: mission.id, error: String(error) });
    }
  }

  /**
   * Close reflection → learning without allowing the learning engine to mutate
   * the workspace or policy. Applying a proposal remains an explicit human or
   * policy decision in a later step.
   */
  private proposeLearning(mission: Mission): void {
    try {
      const state = mission.getState();
      const actions = Object.values(state.goals).flatMap((goal) => goal.plannedActions.map((action) => ({
        actionId: action.id,
        actionName: action.skillName,
        skillName: action.skillName,
        success: action.status === "completed",
        errorMessage: action.status === "failed" ? String(action.result ?? "Action failed") : undefined,
        goalId: goal.id,
      })));
      const learning = learningEngine.learnFromMission({
        missionId: mission.id,
        missionTitle: state.title,
        overallSuccess: mission.status === "completed",
        touchedFiles: state.context.relevantFiles,
        actions,
        errors: state.context.errors.map((error) => ({ message: error.error, action: error.action })),
        decisions: state.context.decisions.map((decision) => ({ what: decision.what, why: decision.why })),
      }, { applyAutoImprovements: false });
      this.learningResults.set(mission.id, learning);
      this.emit("mission_learning_completed", {
        missionId: mission.id,
        lessons: learning.lessons.length,
        candidateProposals: learning.candidateImprovements?.length ?? 0,
      });
    } catch (error) {
      // Learning must never turn an already terminal mission into a failure.
      this.emit("mission_learning_failed", { missionId: mission.id, error: String(error) });
    }
  }

  /**
   * Émet une demande d'approbation et attend sa résolution.
   * Résout `false` (refus) si le délai expire sans réponse.
   */
  private requestApproval(
    mission: Mission,
    goalId: string,
    action: PlannedAction,
    reason: string
  ): Promise<boolean> {
    this.emit("approval_required", {
      missionId: mission.id,
      goalId,
      actionId: action.id,
      skill: action.skillName,
      args: action.args,
      reason,
      timeoutMs: this.approvalTimeoutMs,
    });

    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingApprovals.delete(action.id);
        console.log(`[Executor]    ⌛ Approbation expirée pour ${action.skillName} — refus par défaut.`);
        this.emit("approval_timeout", {
          missionId: mission.id,
          goalId,
          actionId: action.id,
          skill: action.skillName,
        });
        resolve(false);
      }, this.approvalTimeoutMs);

      this.pendingApprovals.set(action.id, {
        resolve,
        timer,
        missionId: mission.id,
        goalId,
        skill: action.skillName,
        args: action.args ?? {},
        reason,
        requestedAt: new Date().toISOString(),
        timeoutAt: new Date(Date.now() + this.approvalTimeoutMs).toISOString(),
      });
    });
  }

  /** Sauvegarde l'état courant de la mission (no-op si aucun store branché). */
  private async persist(mission: Mission): Promise<void> {
    if (!this.store) return;
    try {
      await this.store.save(mission.toJSON());
    } catch (err) {
      console.warn(`[Executor] ⚠️ Persistance mission ${mission.id} échouée: ${(err as Error).message}`);
    }
  }

  /**
   * Détecte les missions interrompues (statut pending/in_progress) persistées
   * dans le store, SANS les relancer automatiquement.
   *
   * Au lieu de reprendre l'exécution d'office, chaque mission interrompue est
   * mise « en attente de décision » : l'utilisateur devra explicitement choisir
   * de la **réactiver** ou de l'**effacer** (via `confirmResume`). On émet un
   * événement `mission_resume_pending` par mission pour que l'UI présente le
   * choix.
   *
   * Cette méthode ne doit être appelée que lorsqu'un workspace est connecté
   * (l'appelant garde cette responsabilité). Elle est idempotente : une mission
   * déjà active ou déjà en attente n'est pas re-proposée.
   *
   * Ne fait rien si aucun store n'est branché ou si le SkillHandler manque.
   * Retourne le nombre de missions mises en attente de décision.
   */
  async resumePending(availableSkills: string[]): Promise<number> {
    if (!this.store || !this.store.isEnabled()) return 0;
    if (!this.skillHandler) {
      console.warn(`[Executor] resumePending appelé sans SkillHandler configuré.`);
      return 0;
    }

    // Mémoriser les skills pour pouvoir relancer une mission réactivée plus tard.
    this.resumeAvailableSkills = availableSkills;

    const states = await this.store.listByStatus(["pending", "in_progress"]);
    if (states.length === 0) return 0;

    let proposed = 0;
    for (const state of states) {
      // Ne pas re-proposer une mission déjà active ou déjà en attente de décision.
      if (this.activeMissions.has(state.id)) continue;
      if (this.pendingResumes.has(state.id)) continue;

      this.pendingResumes.set(state.id, { state, title: state.title });

      console.log(
        `[Executor] ⏸️ Mission interrompue détectée "${state.title}" (${state.id}) — ` +
          `en attente de décision utilisateur (réactiver / effacer).`
      );
      this.emit("mission_resume_pending", {
        missionId: state.id,
        title: state.title,
        priority: state.priority,
        status: state.status,
        updatedAt: state.updatedAt,
      });
      proposed++;
    }

    if (proposed > 0) {
      console.log(`[Executor] ⏸️ ${proposed} mission(s) interrompue(s) en attente de décision.`);
    }
    return proposed;
  }

  /**
   * Liste les missions interrompues en attente de décision utilisateur.
   * Utilisé par l'UI (fetch initial) pour reconstituer les cartes de décision.
   */
  listPendingResumes(): Array<{ missionId: string; title: string; priority: string; status: string; updatedAt: string }> {
    return Array.from(this.pendingResumes.values()).map(({ state }) => ({
      missionId: state.id,
      title: state.title,
      priority: state.priority,
      status: state.status,
      updatedAt: state.updatedAt,
    }));
  }

  /**
   * Applique la décision de l'utilisateur sur une mission interrompue :
   *   - `reactivate` : recharge la mission et relance son exécution en arrière-plan ;
   *   - `delete`     : efface la mission du store et l'abandonne définitivement.
   *
   * Retourne false si aucune mission en attente ne correspond à `missionId`.
   */
  confirmResume(missionId: string, decision: "reactivate" | "delete"): boolean {
    const pending = this.pendingResumes.get(missionId);
    if (!pending) return false;

    this.pendingResumes.delete(missionId);

    if (decision === "delete") {
      console.log(`[Executor] 🗑️ Mission interrompue "${pending.title}" (${missionId}) effacée sur demande.`);
      if (this.store) void this.store.delete(missionId);
      this.emit("mission_deleted", { missionId });
      return true;
    }

    // reactivate
    if (!this.skillHandler) {
      console.warn(`[Executor] Réactivation impossible: SkillHandler non configuré.`);
      return false;
    }
    // Garde-fou : si déjà active (double-clic), ne pas relancer deux fois.
    if (this.activeMissions.has(missionId)) return true;

    // Correctif audit (point 3) : `fromJSON` restaure la config persistée
    // (dryRun, timeout, maxRetries…). Une mission dry-run reprise reste donc en
    // dry-run au lieu de retomber silencieusement à `false`.
    const mission = Mission.fromJSON(pending.state);
    // Autoriser une nouvelle finalisation si la mission avait été finalisée
    // dans une session précédente (le garde est en mémoire, pas persisté).
    this.finalizedMissions.delete(mission.id);
    this.activeMissions.set(mission.id, mission);

    const dryRun = mission.getConfig().dryRun;
    console.log(
      `[Executor] ♻️ Reprise de la mission "${pending.title}" (${missionId})` +
      `${dryRun ? " [DRY-RUN]" : ""}.`
    );

    // Rétablir l'infrastructure d'observabilité comme pour un démarrage normal.
    telemetryService.startMissionTrace(mission.id, pending.title);

    this.emit("mission_resumed", { missionId: mission.id, title: pending.title });

    // Correctif audit (point 3) : passer par launchMission → la reprise obtient
    // watchdog, trace télémétrie et entrée missionRuns (waitForMission fonctionne).
    this.launchMission(mission, this.resumeAvailableSkills);
    return true;
  }

  private emit(event: string, data: Record<string, unknown>): void {
    if (this.eventEmitter) {
      this.eventEmitter(event, data);
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Stable problem-class signature from a mission title + known errors. Resource-
 * independent (no paths/ids) so repeated instances of the same problem class
 * share one signature — the key philosophy used by PlaybookStore triggers and
 * exploited by MissionEvolutionStore to compare approaches across missions.
 */
function problemSignature(title: string, errors: string[]): string {
  const normErr = errors.map((e) =>
    e.toLowerCase()
      .replace(/[a-z]:\\[^:\s"']+/g, "<path>")
      .replace(/\/[^:\s"']{10,}/g, "<path>")
      .replace(/\d+/g, "<n>")
      .trim(),
  );
  const fam =
    normErr.find((e) => /ts<n>|typescript|type/.test(e)) ? "ts-error"
      : normErr.find((e) => /test|assert|expect/.test(e)) ? "test-failure"
        : normErr.find((e) => /lint|eslint/.test(e)) ? "lint-error"
          : normErr.length > 0 ? "error"
            : "objective";
  const t = title.toLowerCase();
  const kw =
    /perf|optimi/.test(t) ? "perf"
      : /refactor|clean/.test(t) ? "refactor"
        : /test/.test(t) ? "test"
          : /secur|sécur/.test(t) ? "security"
            : /doc/.test(t) ? "docs"
              : /fix|bug|corrige|erreur|error/.test(t) ? "fix"
                : "generic";
  return `${fam}:${kw}`;
}

// ─── Types ──────────────────────────────────────────────────────────────────

/** Options d'exécution transmises au handler de skill. */
export interface SkillHandlerOptions {
  /** Exécuter en simulation (dry-run), sans effet de bord. */
  dryRun?: boolean;
  /**
   * Signal d'annulation : passe à `aborted` quand la mission est annulée ou
   * atteint son timeout global. Un skill qui le respecte peut interrompre une
   * opération longue (fetch, shell…) au lieu de la mener à terme. (Audit, point 4.)
   */
  signal?: AbortSignal;
  /** Étape de mission (clé d'idempotence) transmise au ToolRegistry. */
  idempotencyScope?: { missionId: string; stepId: string };
  /** Called by ToolRegistry after guards and immediately before a side effect. */
  beforeExecute?: (toolName: string, args: Record<string, unknown>) => Promise<void>;
}

/** Handler pour exécuter un skill */
export type SkillHandlerFn = (
  name: string,
  args: any,
  options?: SkillHandlerOptions
) => Promise<any>;

/** Émetteur d'événements pour le frontend */
export type ExecutorEventEmitter = (event: string, data: Record<string, unknown>) => void;

/** Fonction LLM générique: prompt → texte. */
export type LLMTextFn = (prompt: string) => Promise<string>;

/** Schéma d'un outil, utilisé pour générer les arguments. */
export interface ToolSchema {
  name: string;
  description?: string;
  parameters?: unknown;
}
