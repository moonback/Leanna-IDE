import { Mission } from "./Mission.js";
import { Planner } from "./Planner.js";
import { ReflectionEngine, type ReflectionInput } from "./Reflection.js";
import { SkillScorer } from "./SkillScorer.js";
import type {  PlannedAction,  ReflectionResult,
  MissionConfig,
  MissionPlan,
} from "./types.js";
import { DEFAULT_MISSION_CONFIG } from "./types.js";

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

  /** Missions actives */
  private activeMissions: Map<string, Mission> = new Map();

  /** Missions complétées (historique, max 50) */
  private completedMissions: Mission[] = [];
  private static readonly MAX_COMPLETED = 50;

  constructor(config: Partial<MissionConfig> = {}) {
    this.config = { ...DEFAULT_MISSION_CONFIG, ...config };
    this.scorer = new SkillScorer();
    this.planner = new Planner(this.scorer);
    this.reflection = new ReflectionEngine();
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
  }): Promise<Mission> {
    if (!this.skillHandler) {
      throw new Error("SkillHandler not configured. Call setSkillHandler first.");
    }

    const mission = new Mission(
      params.title,
      params.description,
      params.priority ?? "medium",
      this.config
    );

    const plan = await this.preparePlan(mission, params.availableSkills);

    this.activeMissions.set(mission.id, mission);
    this.emit("mission_plan", {
      missionId: mission.id,
      title: params.title,
      plan,
    });
    this.emit("mission_started", { missionId: mission.id, title: params.title });

    // Lancer l'exécution en arrière-plan
    this.executeMission(mission, params.availableSkills).catch((err) => {
      console.error(`[Executor] Mission ${mission.id} failed:`, err);
      this.emit("mission_failed", { missionId: mission.id, error: String(err) });
    });

    return mission;
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
    const risks = [
      "Une action peut échouer et déclencher une replanification.",
      ...(targetedFiles.length === 0 ? ["Les fichiers ciblés seront confirmés pendant l'analyse."] : []),
      ...(plannedActions.length === 0 ? ["Aucun outil n'a encore atteint le score minimum."] : []),
    ];

    return {
      objectives,
      targetedFiles: targetedFiles.length > 0 ? targetedFiles : ["À déterminer pendant l'analyse"],
      tools: tools.length > 0 ? tools : ["Sélection automatique selon le contexte"],
      risks,
      estimatedTokens: 1200 + plannedActions.length * 800,
      stopConditions: [
        "Arrêt immédiat si un objectif critique échoue.",
        `Arrêt après ${this.config.maxRetries} échecs d'une même action.`,
        "Arrêt sur annulation explicite de l'utilisateur.",
      ],
    };
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

  /**
   * Annule une mission active.
   */
  cancelMission(missionId: string): boolean {
    const mission = this.activeMissions.get(missionId);
    if (!mission) return false;

    mission.completeActiveGoal({
      success: false,
      summary: "Mission annulée par l'utilisateur.",
    });

    this.finalizeMission(mission);
    this.emit("mission_cancelled", { missionId });
    return true;
  }

  // ─── Boucle d'exécution ───────────────────────────────────────────────────

  private async executeMission(mission: Mission, availableSkills: string[]): Promise<void> {
    const rootGoal = mission.rootGoal;
    mission.pushGoal(rootGoal.id);

    console.log(`[Executor] ═══════════════════════════════════════════`);
    console.log(`[Executor] 🚀 Mission démarrée: "${mission.getState().title}"`);
    console.log(`[Executor] ═══════════════════════════════════════════`);

    // Le plan a été préparé avant l'événement mission_started.
    const subGoals = Object.values(mission.getState().goals).filter(
      (goal) => goal.parentId === rootGoal.id
    );

    if (subGoals.length === 0) {
      // Pas de décomposition → exécuter directement
      await this.executeGoalDirectly(mission, rootGoal.id, availableSkills);
    } else {
      // Créer les sous-objectifs dans la mission
      const goalIds = this.createSubGoals(mission, rootGoal.id, subGoals);

      // Exécuter chaque sous-objectif séquentiellement
      for (const goalId of goalIds) {
        if (mission.isCompleted()) break;

        const goal = mission.getGoal(goalId);
        if (!goal || goal.status === "cancelled") continue;

        mission.pushGoal(goalId);
        this.emit("goal_started", { missionId: mission.id, goalId, title: goal.title });

        await this.executeGoalDirectly(mission, goalId, availableSkills);

        // Vérifier si on doit s'arrêter
        if (goal.status === "failed" && goal.priority === "critical") {
          console.log(`[Executor] ❌ Objectif critique échoué. Arrêt de la mission.`);
          mission.completeActiveGoal({
            success: false,
            summary: `Objectif critique échoué: "${goal.title}"`,
          });
          break;
        }
      }
    }

    // Compléter la mission si pas déjà fait
    if (!mission.isCompleted()) {
      const allGoals = Object.values(mission.getState().goals);
      const allSuccess = allGoals
        .filter((g) => g.parentId !== null)
        .every((g) => g.status === "completed");

      mission.completeActiveGoal({
        success: allSuccess,
        summary: allSuccess
          ? `Mission "${mission.getState().title}" complétée avec succès.`
          : `Mission terminée avec des objectifs échoués.`,
        lessonsLearned: this.extractLessons(mission),
      });
    }

    this.finalizeMission(mission);
    console.log(`[Executor] ✓ Mission terminée: ${mission.status}`);
    this.emit("mission_completed", {
      missionId: mission.id,
      success: mission.status === "completed",
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
    mission.setPlan(actions);

    if (actions.length === 0) {
      console.log(`[Executor]    Aucune action planifiée. Objectif marqué complété.`);
      mission.completeActiveGoal({ success: true, summary: "Aucune action nécessaire." });
      return;
    }

    // Exécuter les actions une par une
    for (const action of actions) {
      if (mission.isCompleted()) break;
      if (action.status !== "pending") continue;

      const result = await this.executeAction(mission, goalId, action, availableSkills);

      // Décider de la suite selon la réflexion
      if (result.decision === "abort") {
        mission.completeActiveGoal({
          success: false,
          summary: `Abandonné: ${result.reasoning}`,
        });
        return;
      }

      if (result.decision === "escalate") {
        // Marquer l'objectif comme bloqué et laisser le niveau supérieur gérer
        mission.blockGoal(goalId, result.reasoning);
        this.emit("goal_escalated", {
          missionId: mission.id,
          goalId,
          reason: result.reasoning,
        });
        return;
      }

      if (result.decision === "replan") {
        // Replanifier avec les infos accumulées
        console.log(`[Executor]    🔄 Replanification...`);
        actions = await this.planner.replan(
          mission,
          goalId,
          action,
          result.failure ?? "Erreur inconnue",
          availableSkills
        );
        mission.setPlan(actions);
        // La boucle for reprendra avec les nouvelles actions
      }
    }

    // Vérifier si l'objectif est complété
    const allDone = goal.plannedActions.every(
      (a) => a.status === "completed" || a.status === "cancelled"
    );
    const anySuccess = goal.plannedActions.some((a) => a.status === "completed");

    if (allDone || anySuccess) {
      mission.completeActiveGoal({
        success: anySuccess,
        summary: `Objectif "${goal.title}" ${anySuccess ? "complété" : "partiellement échoué"}.`,
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
    availableSkills: string[]
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

    let success = false;
    let result: unknown = undefined;
    let error: string | undefined = undefined;

    try {
      result = await this.skillHandler!(action.skillName, action.args);
      success = !!(
        result === null ||
        result === undefined ||
        (typeof result !== "object") ||
        (typeof result === "object" && !("error" in result))
      );
      if (!success) {
        error = (result as any)?.error ?? "Erreur retournée par le skill";
        console.log(`[Executor]    ✗ ${action.skillName} échoué (result.error): ${error}`);
      } else {
        console.log(`[Executor]    ✓ ${action.skillName} réussi`);
      }
    } catch (err: any) {
      error = err.message ?? String(err);
      console.log(`[Executor]    ✗ ${action.skillName} échoué: ${error}`);
    }

    const durationMs = Date.now() - startTime;

    // Enregistrer le résultat
    mission.recordActionResult(action.id, result, success);
    this.scorer.recordUsage(action.skillName, success, durationMs);

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

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private createSubGoals(mission: Mission, parentId: string, plans: Array<{ title: string; description: string; successCriteria: string[]; priority: string }>): string[] {
    const ids: string[] = [];

    for (const plan of plans) {
      const id = mission.addSubGoal({
        parentId,
        title: plan.title,
        description: plan.description,
        successCriteria: plan.successCriteria,
        priority: plan.priority,
      });
      ids.push(id);
    }

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

  private finalizeMission(mission: Mission): void {
    this.activeMissions.delete(mission.id);
    this.completedMissions.push(mission);
    if (this.completedMissions.length > Executor.MAX_COMPLETED) {
      this.completedMissions.shift();
    }
  }

  private emit(event: string, data: Record<string, unknown>): void {
    if (this.eventEmitter) {
      this.eventEmitter(event, data);
    }
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

/** Handler pour exécuter un skill */
export type SkillHandlerFn = (name: string, args: any) => Promise<any>;

/** Émetteur d'événements pour le frontend */
export type ExecutorEventEmitter = (event: string, data: Record<string, unknown>) => void;
