/**
 * AutonomousRuntime — Chef d'orchestre de l'Autonomous Core V2
 *
 * Assemble et coordonne tous les composants V2 dans une boucle persistante :
 *
 *   PerceptionLoop ──→ DecisionEngine ──→ MissionManager ──→ AgentOrchestrator
 *        ↑                                      ↓
 *   OpportunityDetector              ReflectionEngine
 *        ↓                                      ↓
 *   GoalManager ←─────────────────── GoalEvaluator
 *
 * Responsabilités :
 *   - Démarrer / arrêter tous les composants
 *   - Câbler les événements entre eux
 *   - Exposer un statut global et une API de contrôle
 *   - Broadcaster les événements vers le frontend (WebSocket)
 *   - Gérer le graceful shutdown
 */

import { createLogger } from "../utils/logger.js";
import { perceptionLoop } from "./PerceptionLoop.js";
import { decisionEngine } from "./DecisionEngine.js";
import { missionManager } from "./MissionManager.js";
import { reflectionEngine } from "./ReflectionEngine.js";
import { opportunityDetector } from "./OpportunityDetector.js";
import { goalManager } from "./GoalManager.js";
import { autonomyController } from "./AutonomyController.js";
import type {
  AutonomousState,
  AutonomousRuntimeStatus,
  AutonomyLevel,
  Goal,
  GoalCreateInput,
  Mission,
} from "./types.js";

const log = createLogger("AutonomousRuntime");

// ─── Configuration ────────────────────────────────────────────────────────────

/** Intervalle de nettoyage des missions anciennes (ms) */
const PRUNE_INTERVAL_MS = 60 * 60 * 1000; // 1h

// ═══════════════════════════════════════════════════════════════════════════════
// AUTONOMOUS RUNTIME
// ═══════════════════════════════════════════════════════════════════════════════

export type RuntimeBroadcaster = (event: object) => void;

export class AutonomousRuntime {
  private state: AutonomousState = "idle";
  private startedAt: string = "";
  private isRunning = false;

  // Unsub handles
  private unsubPerception: (() => void) | null = null;
  private unsubProposals: (() => void) | null = null;
  private unsubMissionCompletion: (() => void) | null = null;
  private unsubOpportunities: (() => void) | null = null;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;

  // Broadcaster WebSocket (injecté depuis server.ts)
  private broadcaster: RuntimeBroadcaster | null = null;

  // Counters
  private totalMissionsRun = 0;
  private totalMissionsSucceeded = 0;
  private totalMissionsFailed = 0;
  private lastEventAt: number | undefined;

  // ─── Cycle de vie ──────────────────────────────────────────────────────────

  /**
   * Initialise et démarre tous les composants de l'Autonomous Core V2.
   * Idempotent — retourne false si déjà actif.
   */
  async start(): Promise<boolean> {
    if (this.isRunning) {
      log.debug("AutonomousRuntime déjà actif");
      return false;
    }

    log.info("🧠 AutonomousRuntime V2 — démarrage…");
    this.startedAt = new Date().toISOString();
    this.setState("observing");

    // 1. Charger / initialiser les objectifs
    goalManager.load();
    goalManager.ensureDefaultGoals();
    const activeGoals = goalManager.getActiveGoals();
    log.info(`🎯 ${activeGoals.length} objectif(s) actif(s) chargé(s)`);

    // 2. Câbler les broadcasters
    this._wireBroadcasters();

    // 3. Câbler les callbacks DecisionEngine ↔ MissionManager
    missionManager.setDecisionEngineCallbacks(
      (goalId) => decisionEngine.missionStarted(goalId),
      (goalId) => decisionEngine.missionFinished(goalId)
    );

    // 4. Abonnement aux PerceptionEvents → DecisionEngine
    this.unsubPerception = perceptionLoop.onEvent(async (event) => {
      this.lastEventAt = event.timestamp;
      this.setState("understanding");

      const goals = goalManager.getDueGoals();
      if (goals.length === 0) {
        this.setState("waiting");
        return;
      }

      this.setState("planning");
      await decisionEngine.decide(event, goals);
      this.setState("observing");
    });

    // 5. Abonnement aux DecisionProposals → MissionManager
    this.unsubProposals = decisionEngine.onProposal(async (proposal) => {
      this.setState("executing");
      const mission = await missionManager.execute(proposal);
      if (mission) {
        this.totalMissionsRun++;
        log.info(`🚀 Mission lancée: "${mission.title}"`);
        this._broadcast({ type: "autonomous_core_event", event: "mission_launched", missionId: mission.id, title: mission.title });
      }
      this.setState("observing");
    });

    // 6. Abonnement aux completions → ReflectionEngine
    this.unsubMissionCompletion = missionManager.onCompletion(async (mission) => {
      if (mission.result?.success) {
        this.totalMissionsSucceeded++;
      } else {
        this.totalMissionsFailed++;
      }

      this.setState("reflecting");
      await reflectionEngine.reflect(mission);
      this.setState("learning");
      // Retour en observation après réflexion
      this.setState("observing");
    });

    // 7. Abonnement aux opportunités → création de goals si pertinent
    this.unsubOpportunities = opportunityDetector.onOpportunities((opportunities) => {
      const highPrio = opportunities.filter((o) => o.score >= 0.7);
      if (highPrio.length > 0) {
        log.info(`💡 ${highPrio.length} opportunité(s) haute priorité → potentiels nouveaux goals`);
        this._broadcast({ type: "autonomous_core_event", event: "opportunities_detected", count: highPrio.length, opportunities: highPrio.slice(0, 3) });
      }
    });

    // 8. Démarrer les sous-systèmes
    perceptionLoop.start();
    opportunityDetector.start();

    // 9. Timer de nettoyage
    this.pruneTimer = setInterval(() => {
      missionManager.pruneOldMissions();
    }, PRUNE_INTERVAL_MS);

    this.isRunning = true;
    this.setState("observing");

    log.info(
      `✅ AutonomousRuntime V2 actif — niveau autonomie: ${autonomyController.getLevel()} ` +
        `(${autonomyController.getLevelLabel()})`
    );

    this._broadcast({
      type: "autonomous_core_event",
      event: "runtime_started",
      autonomyLevel: autonomyController.getLevel(),
      activeGoals: activeGoals.length,
      startedAt: this.startedAt,
    });

    return true;
  }

  /**
   * Arrête proprement tous les composants.
   */
  stop(): void {
    if (!this.isRunning) return;

    log.info("🛑 AutonomousRuntime V2 — arrêt…");

    this.unsubPerception?.();
    this.unsubProposals?.();
    this.unsubMissionCompletion?.();
    this.unsubOpportunities?.();

    perceptionLoop.stop();
    opportunityDetector.stop();

    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }

    // Sauvegarder l'état des goals
    goalManager.save();

    this.isRunning = false;
    this.setState("idle");

    this._broadcast({ type: "autonomous_core_event", event: "runtime_stopped" });
    log.info("🛑 AutonomousRuntime V2 arrêté");
  }

  get running(): boolean {
    return this.isRunning;
  }

  // ─── API publique ─────────────────────────────────────────────────────────

  /**
   * Configure le broadcaster WebSocket pour le frontend.
   * Doit être appelé avant start().
   */
  setBroadcaster(broadcaster: RuntimeBroadcaster): void {
    this.broadcaster = broadcaster;
    missionManager.setBroadcaster(broadcaster);
    reflectionEngine.setBroadcaster(broadcaster);
  }

  /**
   * Retourne le statut complet du runtime.
   */
  getStatus(): AutonomousRuntimeStatus {
    const missionStats = missionManager.getStats();
    return {
      state: this.state,
      autonomyLevel: autonomyController.getLevel(),
      activeGoals: goalManager.getActiveGoals().length,
      activeMissions: missionStats.active,
      totalMissionsRun: this.totalMissionsRun,
      totalMissionsSucceeded: this.totalMissionsSucceeded,
      totalMissionsFailed: this.totalMissionsFailed,
      lastEventAt: this.lastEventAt,
      lastMissionAt: missionManager.listMissions(1)[0]?.createdAt,
      uptime: this.isRunning ? Date.now() - new Date(this.startedAt).getTime() : 0,
      startedAt: this.startedAt,
    };
  }

  // ─── Contrôle du niveau d'autonomie ──────────────────────────────────────

  setAutonomyLevel(level: AutonomyLevel): void {
    autonomyController.setLevel(level);
    this._broadcast({
      type: "autonomous_core_event",
      event: "autonomy_level_changed",
      level,
      label: autonomyController.getLevelLabel(),
    });
    log.info(`🔐 Niveau d'autonomie → ${level} (${autonomyController.getLevelLabel()})`);
  }

  getAutonomyLevel(): AutonomyLevel {
    return autonomyController.getLevel();
  }

  // ─── Gestion des objectifs ────────────────────────────────────────────────

  createGoal(input: GoalCreateInput): Goal {
    const goal = goalManager.create(input);
    perceptionLoop.emit("goal.added", { goalId: goal.id, title: goal.title });
    this._broadcast({ type: "autonomous_core_event", event: "goal_created", goalId: goal.id, title: goal.title });
    return goal;
  }

  listGoals(): Goal[] {
    return goalManager.list();
  }

  getGoal(id: string): Goal | undefined {
    return goalManager.get(id);
  }

  pauseGoal(id: string): boolean {
    return goalManager.setStatus(id, "paused");
  }

  resumeGoal(id: string): boolean {
    return goalManager.setStatus(id, "active");
  }

  deleteGoal(id: string): boolean {
    return goalManager.delete(id);
  }

  // ─── Missions ────────────────────────────────────────────────────────────

  listMissions(limit = 20): Mission[] {
    return missionManager.listMissions(limit);
  }

  getMission(id: string): Mission | undefined {
    return missionManager.getMission(id);
  }

  cancelMission(id: string): boolean {
    return missionManager.cancel(id);
  }

  /**
   * Déclenche manuellement une perception event (utile pour les routes API).
   */
  triggerPerception(type: import("./types.js").PerceptionEventType, payload?: Record<string, unknown>, files?: string[]): void {
    perceptionLoop.emit(type, payload, files);
  }

  // ─── Scan d'opportunités ─────────────────────────────────────────────────

  async scanOpportunities() {
    return opportunityDetector.scanAndDispatch();
  }

  // ─── Diagnostics ─────────────────────────────────────────────────────────

  getDiagnostics() {
    return {
      runtime: this.getStatus(),
      autonomy: autonomyController.getStats(),
      perception: perceptionLoop.getStats(),
      missions: missionManager.getStats(),
      opportunities: opportunityDetector.getStats(),
      goals: {
        total: goalManager.size,
        active: goalManager.getActiveGoals().length,
        due: goalManager.getDueGoals().length,
      },
    };
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private setState(state: AutonomousState): void {
    if (this.state === state) return;
    const prev = this.state;
    this.state = state;
    log.debug(`State: ${prev} → ${state}`);
  }

  private _wireBroadcasters(): void {
    // Les sous-composants ont leurs propres broadcasters configurés via setBroadcaster()
    // Les events qu'ils émettent passent déjà par this.broadcaster (injecté)
    // Rien d'additionnel à câbler ici — la méthode existe pour extension future
  }

  private _broadcast(event: object): void {
    if (!this.broadcaster) return;
    try {
      this.broadcaster(event);
    } catch {
      // Non bloquant
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

/** Instance singleton partagée de l'AutonomousRuntime V2. */
export const autonomousRuntime = new AutonomousRuntime();
