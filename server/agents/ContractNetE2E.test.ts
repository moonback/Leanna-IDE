/**
 * Test d'intégration bout-en-bout du contract-net en production.
 *
 * AgentBrain (réel) → AgentOrchestrator (réel) → ContractNetNegotiator (réel) →
 * AgentMessageBus (réel) → AutonomousAgent (réels). Seul le moteur d'exécution
 * des tâches est factice. On vérifie : attribution dynamique, suivi, repli,
 * modes off/shadow, apprentissage des notes par rôle et observabilité.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { StrategyMemory } from "../knowledge/StrategyMemory.js";
import { AgentMessageBus } from "./AgentMessageBus.js";
import { ContractNetNegotiator } from "./ContractNetNegotiator.js";
import { AutonomousAgent } from "./AutonomousAgent.js";
import { RoleReliability } from "./RoleReliability.js";
import { AgentOrchestrator } from "./AgentOrchestrator.js";
import { AgentBrain } from "./brain/AgentBrain.js";
import type { AgentRole, AgentTask } from "./types.js";
import type { BrainGoalInput, BrainPlan, BrainStage, GoalUnderstanding } from "./brain/types.js";

class FakeEngine {
  executed: Array<{ role: string; title: string }> = [];
  failRoles = new Set<string>();
  private running = new Map<string, number>();

  getRunningCount(role: string): number {
    return this.running.get(role) ?? 0;
  }
  cancel(): boolean {
    return false;
  }
  async execute(task: AgentTask): Promise<void> {
    this.running.set(task.role, (this.running.get(task.role) ?? 0) + 1);
    task.status = "running";
    task.startedAt = new Date().toISOString();
    this.executed.push({ role: task.role, title: task.title });
    await new Promise((r) => setTimeout(r, 3));
    const ok = !this.failRoles.has(task.role);
    task.status = ok ? "completed" : "failed";
    task.result = {
      success: ok,
      outcome: ok ? "success" : "failed",
      summary: "fake",
      error: ok ? undefined : "échec simulé",
      filesModified: [],
      durationMs: 3,
    };
    task.completedAt = new Date().toISOString();
    this.running.set(task.role, Math.max(0, (this.running.get(task.role) ?? 1) - 1));
  }
}

const understanding: GoalUnderstanding = {
  intent: "Vérifier le projet",
  domain: "backend",
  complexity: "moderate",
  keyTechnologies: ["TypeScript"],
  relevantFiles: [],
  requirements: ["Tests verts"],
  successCriteria: ["Tests verts"],
  potentialRisks: [],
  rationale: "test e2e",
};

function stage(id: string, role: AgentRole, dependsOn: string[] = []): BrainStage {
  return {
    id,
    title: `Vérifier ${id}`,
    description: `Lancer la vérification complète (${id})`,
    agentRole: role,
    agentReason: "test",
    skills: [],
    tools: ["verify_full", "run_project_command"],
    files: [],
    instructions: "Lancer les tests",
    dependsOn,
    status: "pending",
    priority: "high",
  };
}

function planOf(stages: BrainStage[]): BrainPlan {
  return {
    id: "plan-e2e",
    goal: "Vérifier le projet",
    understanding,
    stages,
    estimatedDurationMs: 1000,
    architectureRationale: "e2e",
    createdAt: new Date().toISOString(),
    status: "planned",
  };
}

const input: BrainGoalInput = {
  goal: "Vérifier le projet",
  contextFiles: [],
  mode: "auto",
  maxCorrectionAttempts: 0,
  maxReplans: 0,
};

describe("Contract-net — intégration de bout en bout", () => {
  let bus: AgentMessageBus;
  let negotiator: ContractNetNegotiator;
  let reliability: RoleReliability;
  let orchestrator: AgentOrchestrator;
  let engine: FakeEngine;
  let agents: AutonomousAgent[] = [];
  let savedMode: string | undefined;

  const startFleet = (roles: AgentRole[]) => {
    const noop = { execute: async () => {} };
    agents = roles.map((r) => new AutonomousAgent(r, noop as never, bus, { maxIterations: 1 }, negotiator));
    for (const a of agents) a.start();
    negotiator.setExpectedBiddersProvider(() => roles);
  };

  const brainFor = (plan: BrainPlan) =>
    new AgentBrain(orchestrator, {
      understandingEngine: { understand: async () => understanding },
      planner: { plan: async () => JSON.parse(JSON.stringify(plan)) as BrainPlan },
    });

  beforeEach(() => {
    savedMode = process.env.LEANNA_CONTRACT_NET;
    delete process.env.LEANNA_CONTRACT_NET;
    bus = new AgentMessageBus();
    reliability = new RoleReliability(new StrategyMemory({ ephemeral: true }), () => 3);
    negotiator = new ContractNetNegotiator(bus, { biddingWindowMs: 50, reliability });
    orchestrator = new AgentOrchestrator({ negotiator, reliability });
    engine = new FakeEngine();
    (orchestrator as any).executor = engine;
    (orchestrator as any).scheduler.setRunner(engine);
  });

  afterEach(() => {
    for (const a of agents) a.stop();
    agents = [];
    if (savedMode === undefined) delete process.env.LEANNA_CONTRACT_NET;
    else process.env.LEANNA_CONTRACT_NET = savedMode;
  });

  it("réaffecte les étapes du Brain au rôle le mieux noté, puis apprend de leurs issues", async () => {
    startFleet(["coder", "tester"]);
    // Historique : coder échoue sans cesse, tester réussit.
    for (let i = 0; i < 8; i++) reliability.record("coder", false, 10);
    for (let i = 0; i < 8; i++) reliability.record("tester", true, 10);

    const plan = planOf([stage("a", "coder"), stage("b", "coder", ["a"])]);
    const result = await brainFor(plan).executeGoal(input);

    assert.equal(result.success, true);
    for (const s of result.stages) {
      assert.equal(s.stage.agentRole, "coder", "rôle planifié conservé");
      assert.equal(s.stage.assignedRole, "tester", "réaffecté au mieux noté");
      assert.equal(s.stage.assignedVia, "contract-net");
    }
    assert.deepEqual(engine.executed.map((e) => e.role), ["tester", "tester"]);

    // Les issues alimentent la note du rôle qui a travaillé (8 + 2 tâches).
    assert.equal(reliability.getRating("tester").totalCalls, 10);
    assert.equal(reliability.getRating("coder").totalCalls, 8);

    // Observabilité.
    const status = orchestrator.getContractNetStatus();
    assert.equal(status.mode, "on");
    assert.equal(status.stats.auctions, 2);
    assert.equal(status.stats.switched, 2);
    assert.equal(status.stats.winsByRole.tester, 2);
    assert.ok(status.roleRatings.some((r) => r.role === "tester" && r.reliable));
    const fleet = orchestrator.getFleetStatus() as any;
    assert.equal(fleet.contractNet.stats.auctions, 2);
  });

  it("garde le rôle planifié quand il n'est pas nettement battu (marge de préférence)", async () => {
    startFleet(["coder", "tester"]); // aucun historique : scores égaux
    const plan = planOf([stage("a", "coder")]);

    const result = await brainFor(plan).executeGoal(input);

    assert.equal(result.stages[0].stage.assignedRole, "coder");
    assert.equal(engine.executed[0].role, "coder");
    assert.equal(negotiator.getStats().switched, 0, "aucun changement de rôle sans écart net");
  });

  it("une dégradation de coder déplace les étapes suivantes vers un autre rôle", async () => {
    startFleet(["coder", "tester"]);
    engine.failRoles.add("coder");

    // Missions successives (une étape chacune), rôle planifié = coder. Chaque échec
    // abaisse sa note ; la marge de préférence retarde le basculement, puis l'enchère
    // finit par confier la tâche à un rôle plus fiable.
    for (let i = 0; i < 14; i++) {
      await brainFor(planOf([stage(`m${i}`, "coder")])).executeGoal(input);
    }

    const roles = engine.executed.map((e) => e.role);
    assert.equal(roles[0], "coder", "au départ, le rôle planifié garde la tâche");
    assert.ok(roles.includes("tester"), `une mission doit finir par basculer sur tester: ${roles}`);
    assert.equal(roles[roles.length - 1], "tester", "une fois la fiabilité dégradée, tester garde la main");
    assert.ok(reliability.getConfidence("coder") < 0.3, "la note de coder reflète ses échecs");
  });

  it("se replie sur le rôle planifié (compté) quand aucune offre n'est éligible", async () => {
    startFleet(["writer"]); // writer n'a pas verify_full
    const result = await brainFor(planOf([stage("a", "coder")])).executeGoal(input);

    assert.equal(result.stages[0].stage.assignedRole, "coder");
    assert.equal(result.stages[0].stage.assignedVia, "fallback");
    assert.equal(negotiator.getStats().fallbacks, 1);
  });

  it("mode off : aucun appel d'offres, rôles planifiés", async () => {
    process.env.LEANNA_CONTRACT_NET = "off";
    startFleet(["coder", "tester"]);
    for (let i = 0; i < 8; i++) reliability.record("coder", false, 10);

    const result = await brainFor(planOf([stage("a", "coder")])).executeGoal(input);

    assert.equal(result.stages[0].stage.assignedRole, "coder");
    assert.equal(result.stages[0].stage.assignedVia, "static");
    assert.equal(negotiator.getStats().auctions, 0);
  });

  it("mode shadow : l'enchère est observée mais n'altère pas le rôle", async () => {
    process.env.LEANNA_CONTRACT_NET = "shadow";
    startFleet(["coder", "tester"]);
    for (let i = 0; i < 8; i++) reliability.record("coder", false, 10);
    for (let i = 0; i < 8; i++) reliability.record("tester", true, 10);

    const result = await brainFor(planOf([stage("a", "coder")])).executeGoal(input);

    assert.equal(result.stages[0].stage.assignedRole, "coder");
    assert.equal(result.stages[0].stage.assignedVia, "shadow");
    assert.equal(negotiator.getStats().auctions, 1);
    assert.equal(negotiator.getStats().winsByRole.tester, 1, "le gagnant virtuel est tester");
  });
});
