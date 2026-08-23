/**
 * AgentRegistry — Registre global des agents autonomes actifs
 *
 * Gère le cycle de vie des instances AutonomousAgent et fournit
 * une interface unifiée pour :
 * - Lookup d'un agent par rôle
 * - Démarrage / arrêt d'agents
 * - Monitoring de l'état de santé de la flotte
 * - Sélection d'un agent disponible (load balancing)
 */
import type { AgentRole } from "./types";
import type { SkillHandler } from "./AgentExecutor";
import { AutonomousAgent } from "./AutonomousAgent";
import type { LoopConfig } from "./AutonomousLoop";
import { AgentExecutor } from "./AgentExecutor";
import { AgentMessageBus, agentMessageBus } from "./AgentMessageBus";
import { ProgressNotifier } from "./ProgressNotifier";
import { AGENT_REGISTRY } from "./roles";
import { createLogger } from "../utils/logger";

const log = createLogger("AgentRegistry");

// ═══════════════════════════════════════════════════════════════════════════════
// AgentRegistry
// ═══════════════════════════════════════════════════════════════════════════════

export class AgentRegistry {
  private agents: Map<AgentRole, AutonomousAgent> = new Map();
  private notifier: ProgressNotifier;
  private executor: AgentExecutor;
  private bus: AgentMessageBus;
  private initialized = false;

  constructor(bus: AgentMessageBus = agentMessageBus) {
    this.bus = bus;
    this.notifier = new ProgressNotifier();
    this.executor = new AgentExecutor(this.notifier);
  }

  // ─── Initialisation ────────────────────────────────────────────────────────

  /**
   * Initialise et démarre tous les agents.
   * Doit être appelé après la configuration du SkillHandler.
   */
  initialize(skillHandler: SkillHandler): void {
    if (this.initialized) {
      log.warn("AgentRegistry déjà initialisé — skip");
      return;
    }

    this.executor.setSkillHandler(skillHandler);

    // Config de boucle autonome par rôle (les agents read-only itèrent moins)
    const loopConfigByRole: Record<AgentRole, { maxIterations: number; minConfidenceScore: number }> = {
      // Code & Ingénierie logicielle
      coder:       { maxIterations: 3, minConfidenceScore: 0.70 }, // écriture & implémentation
      refactor:    { maxIterations: 3, minConfidenceScore: 0.70 }, // restructuration & non-régression
      debugger:    { maxIterations: 3, minConfidenceScore: 0.70 }, // diagnostic & patch
      reviewer:    { maxIterations: 1, minConfidenceScore: 0.50 }, // read-only audit
      tester:      { maxIterations: 3, minConfidenceScore: 0.65 }, // création & exécution de tests
      security:    { maxIterations: 1, minConfidenceScore: 0.50 }, // read-only sécurité
      architect:   { maxIterations: 2, minConfidenceScore: 0.65 }, // conception & structuration
      // Rédaction & Documentation
      writer:      { maxIterations: 3, minConfidenceScore: 0.65 },
      formatter:   { maxIterations: 2, minConfidenceScore: 0.60 },
      researcher:  { maxIterations: 1, minConfidenceScore: 0.50 }, // read-only recherche
      proofreader: { maxIterations: 2, minConfidenceScore: 0.65 },
      translator:  { maxIterations: 2, minConfidenceScore: 0.65 },
      summarizer:  { maxIterations: 2, minConfidenceScore: 0.60 },
      planner:     { maxIterations: 2, minConfidenceScore: 0.65 },
    };

    // Créer et démarrer un agent autonome pour chaque rôle défini
    for (const role of Object.keys(AGENT_REGISTRY) as AgentRole[]) {
      const loopConfig = loopConfigByRole[role] ?? {};
      const agent = new AutonomousAgent(role, this.executor, this.bus, loopConfig);
      this.agents.set(role, agent);
      agent.start();
    }

    this.initialized = true;
    log.info(
      `✅ AgentRegistry initialisé avec ${this.agents.size} agent(s): ${[...this.agents.keys()].join(", ")}`
    );
  }

  /**
   * Arrête tous les agents proprement.
   */
  shutdown(): void {
    for (const agent of this.agents.values()) {
      agent.stop();
    }
    this.agents.clear();
    this.initialized = false;
    log.info("AgentRegistry arrêté");
  }

  // ─── Accès aux agents ──────────────────────────────────────────────────────

  /**
   * Retourne l'agent pour un rôle donné.
   * @throws Si le registre n'est pas initialisé ou le rôle inconnu.
   */
  getAgent(role: AgentRole): AutonomousAgent {
    const agent = this.agents.get(role);
    if (!agent) {
      throw new Error(
        `Agent "${role}" introuvable dans le registre. Avez-vous appelé initialize() ?`
      );
    }
    return agent;
  }

  /**
   * Retourne tous les agents disponibles (non surchargés).
   */
  getAvailableAgents(): AutonomousAgent[] {
    return Array.from(this.agents.values()).filter((a) => a.isAvailable);
  }

  /**
   * Retourne l'agent le moins chargé pour un rôle donné.
   * Utile pour le load balancing si plusieurs instances existaient.
   */
  getLeastLoadedAgent(role: AgentRole): AutonomousAgent {
    return this.getAgent(role); // Extension future: plusieurs instances par rôle
  }

  /**
   * Vérifie si un agent est disponible.
   */
  isAgentAvailable(role: AgentRole): boolean {
    return this.agents.get(role)?.isAvailable ?? false;
  }

  // ─── Configuration ──────────────────────────────────────────────────────────

  /** Propage le ProgressCallback à tous les agents */
  setProgressCallback(callback: Parameters<ProgressNotifier["setProgressCallback"]>[0]): void {
    this.notifier.setProgressCallback(callback);
  }

  /** Propage l'EventBroadcaster à tous les agents */
  setEventBroadcaster(broadcaster: Parameters<ProgressNotifier["setEventBroadcaster"]>[0]): void {
    this.notifier.setEventBroadcaster(broadcaster);
  }

  // ─── Monitoring ────────────────────────────────────────────────────────────

  /** Snapshot d'état de la flotte d'agents */
  getFleetStatus(): {
    totalAgents: number;
    onlineAgents: number;
    idleAgents: number;
    busyAgents: number;
    overloadedAgents: number;
    agents: ReturnType<AutonomousAgent["getStats"]>[];
    busMetrics: ReturnType<AgentMessageBus["getMetrics"]>;
  } {
    const agentStats = Array.from(this.agents.values()).map((a) => a.getStats());

    return {
      totalAgents: agentStats.length,
      onlineAgents: agentStats.filter((a) => a.isOnline).length,
      idleAgents: agentStats.filter((a) => a.status === "idle").length,
      busyAgents: agentStats.filter((a) => a.status === "busy").length,
      overloadedAgents: agentStats.filter((a) => a.status === "overloaded").length,
      agents: agentStats,
      busMetrics: this.bus.getMetrics(),
    };
  }

  get isReady(): boolean {
    return this.initialized;
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const agentRegistry = new AgentRegistry(agentMessageBus);
