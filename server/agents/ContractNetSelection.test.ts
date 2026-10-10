/**
 * Tests du contract-net en mode SÉLECTION (Node test runner)
 *
 * Couvre : sélection sans attribution, clôture anticipée (bids + refus),
 * marge de préférence du rôle imposé par le Brain, classement des candidats
 * et métriques.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { StrategyMemory } from "../knowledge/StrategyMemory.js";
import { AgentMessageBus } from "./AgentMessageBus.js";
import { ContractNetNegotiator, type NegotiationTask } from "./ContractNetNegotiator.js";
import { AutonomousAgent } from "./AutonomousAgent.js";
import { RoleReliability } from "./RoleReliability.js";
import type { AgentRole, AgentTask } from "./types.js";
import type { AgentTaskRunner } from "./AgentTaskRunner.js";
import type { AgentMessage } from "./AgentCommunication.js";

const stubRunner: AgentTaskRunner = {
  async execute(task: AgentTask): Promise<void> {
    task.status = "completed";
    task.result = { success: true, outcome: "success", summary: "stub", durationMs: 0 };
  },
};

function makeTask(overrides: Partial<NegotiationTask> = {}): NegotiationTask {
  return {
    taskId: "sel-task",
    title: "Tâche",
    description: "Description",
    requiredCapabilities: ["verify_full", "run_project_command"],
    ...overrides,
  };
}

describe("ContractNetNegotiator — mode sélection", () => {
  let bus: AgentMessageBus;
  let negotiator: ContractNetNegotiator;

  beforeEach(() => {
    bus = new AgentMessageBus();
    // Fiabilité isolée (mémoire éphémère) : aucun accès disque dans ces tests.
    const reliability = new RoleReliability(new StrategyMemory({ ephemeral: true }), () => 3);
    negotiator = new ContractNetNegotiator(bus, { biddingWindowMs: 25, reliability });
  });

  it("n'attribue pas (aucun task_request publié) avec { award: false }", async () => {
    const received: AgentMessage[] = [];
    bus.subscribe("tester", "task_request", async (msg) => {
      received.push(msg);
    });

    const task = makeTask();
    const promise = negotiator.negotiate(task, "architect", { award: false });
    negotiator.submitBid(task.taskId, { role: "tester", skillMatch: 1, confidence: 0.5, loadPenalty: 0 });
    const outcome = await promise;

    assert.equal(outcome.winner, "tester");
    assert.equal(outcome.awarded, false);
    assert.equal(received.length, 0, "aucun task_request ne doit être publié en mode sélection");
  });

  it("classe les candidats éligibles, gagnant en tête", async () => {
    const task = makeTask();
    const promise = negotiator.negotiate(task, "architect", { award: false });
    negotiator.submitBid(task.taskId, { role: "coder", skillMatch: 0.5, confidence: 0.5, loadPenalty: 0 });
    negotiator.submitBid(task.taskId, { role: "tester", skillMatch: 1, confidence: 0.5, loadPenalty: 0 });
    negotiator.submitBid(task.taskId, { role: "writer", skillMatch: 0, confidence: 1, loadPenalty: 0 });
    const outcome = await promise;

    assert.deepEqual(outcome.ranked.map((b) => b.role), ["tester", "coder"]);
    assert.equal(outcome.winner, "tester");
  });

  it("le rôle préféré garde la tâche si l'écart de score est dans la marge", async () => {
    const task = makeTask({ preferredRole: "coder" });
    const promise = negotiator.negotiate(task, "architect", { award: false });
    // coder : 0.6*0.8 + 0.25*0.5 = 0.605 ; tester : 0.6*0.9 + 0.25*0.5 = 0.665 → écart 0.06
    negotiator.submitBid(task.taskId, { role: "coder", skillMatch: 0.8, confidence: 0.5, loadPenalty: 0 });
    negotiator.submitBid(task.taskId, { role: "tester", skillMatch: 0.9, confidence: 0.5, loadPenalty: 0 });
    const outcome = await promise;

    assert.equal(outcome.winner, "coder");
    assert.equal(outcome.preferredKept, true);
    assert.equal(outcome.ranked[0].role, "coder");
  });

  it("le rôle préféré perd la tâche si battu au-delà de la marge", async () => {
    const task = makeTask({ preferredRole: "coder" });
    const promise = negotiator.negotiate(task, "architect", { award: false });
    // coder : 0.6*0.5 + 0.125 = 0.425 ; tester : 0.6*1 + 0.125 = 0.725 → écart 0.30
    negotiator.submitBid(task.taskId, { role: "coder", skillMatch: 0.5, confidence: 0.5, loadPenalty: 0 });
    negotiator.submitBid(task.taskId, { role: "tester", skillMatch: 1, confidence: 0.5, loadPenalty: 0 });
    const outcome = await promise;

    assert.equal(outcome.winner, "tester");
    assert.equal(outcome.preferredKept, false);
    assert.equal(negotiator.getStats().switched, 1);
  });

  it("respecte une marge explicite par tâche (switchMargin)", async () => {
    const task = makeTask({ preferredRole: "coder", switchMargin: 0.02 });
    const promise = negotiator.negotiate(task, "architect", { award: false });
    negotiator.submitBid(task.taskId, { role: "coder", skillMatch: 0.8, confidence: 0.5, loadPenalty: 0 });
    negotiator.submitBid(task.taskId, { role: "tester", skillMatch: 0.9, confidence: 0.5, loadPenalty: 0 });
    const outcome = await promise;

    assert.equal(outcome.winner, "tester", "écart 0.06 > marge 0.02");
  });

  it("le rôle préféré sans bid éligible ne bloque pas le meilleur candidat", async () => {
    const task = makeTask({ preferredRole: "writer" });
    const promise = negotiator.negotiate(task, "architect", { award: false });
    negotiator.submitBid(task.taskId, { role: "writer", skillMatch: 0, confidence: 1, loadPenalty: 0 });
    negotiator.submitBid(task.taskId, { role: "tester", skillMatch: 1, confidence: 0.5, loadPenalty: 0 });
    const outcome = await promise;

    assert.equal(outcome.winner, "tester");
    assert.equal(outcome.preferredKept, false);
  });

  it("ferme l'enchère dès que tous les rôles attendus ont répondu (bid + refus)", async () => {
    // Fenêtre très longue : si la clôture anticipée échoue, le test dépasse le plafond.
    const slow = new ContractNetNegotiator(bus, {
      biddingWindowMs: 3000,
      reliability: new RoleReliability(new StrategyMemory({ ephemeral: true }), () => 3),
    });
    slow.setExpectedBiddersProvider(() => ["coder", "tester"] as AgentRole[]);

    const task = makeTask();
    const startedAt = Date.now();
    const promise = slow.negotiate(task, "architect", { award: false });
    slow.submitBid(task.taskId, { role: "tester", skillMatch: 1, confidence: 0.5, loadPenalty: 0 });
    slow.declineBid(task.taskId, "coder");
    const outcome = await promise;

    assert.equal(outcome.closedEarly, true);
    assert.equal(outcome.winner, "tester");
    assert.ok(Date.now() - startedAt < 1000, `clôture trop lente: ${Date.now() - startedAt}ms`);
  });

  it("n'attend pas l'initiateur quand il figure dans les rôles attendus", async () => {
    const slow = new ContractNetNegotiator(bus, {
      biddingWindowMs: 3000,
      reliability: new RoleReliability(new StrategyMemory({ ephemeral: true }), () => 3),
    });
    // 'architect' est l'émetteur : le bus ne lui diffuse pas l'appel d'offres.
    slow.setExpectedBiddersProvider(() => ["architect", "tester"] as AgentRole[]);

    const task = makeTask();
    const promise = slow.negotiate(task, "architect", { award: false });
    slow.submitBid(task.taskId, { role: "tester", skillMatch: 1, confidence: 0.5, loadPenalty: 0 });
    const outcome = await promise;

    assert.equal(outcome.closedEarly, true);
  });

  it("garde la fenêtre complète quand un rôle attendu ne répond jamais", async () => {
    const quick = new ContractNetNegotiator(bus, {
      biddingWindowMs: 60,
      reliability: new RoleReliability(new StrategyMemory({ ephemeral: true }), () => 3),
    });
    quick.setExpectedBiddersProvider(() => ["coder", "tester"] as AgentRole[]);

    const task = makeTask();
    const promise = quick.negotiate(task, "architect", { award: false });
    quick.submitBid(task.taskId, { role: "tester", skillMatch: 1, confidence: 0.5, loadPenalty: 0 });
    const outcome = await promise;

    assert.equal(outcome.closedEarly, false);
    assert.equal(outcome.winner, "tester", "le bid reçu reste utilisé à l'expiration");
    assert.ok(outcome.durationMs >= 50);
  });

  it("tient des métriques d'enchères et de replis", async () => {
    const t1 = makeTask({ taskId: "m1" });
    const p1 = negotiator.negotiate(t1, "architect", { award: false });
    negotiator.submitBid(t1.taskId, { role: "tester", skillMatch: 1, confidence: 0.5, loadPenalty: 0 });
    await p1;

    await negotiator.negotiate(makeTask({ taskId: "m2" }), "architect", { award: false });
    negotiator.recordFallback();

    const stats = negotiator.getStats();
    assert.equal(stats.auctions, 2);
    assert.equal(stats.withWinner, 1);
    assert.equal(stats.noWinner, 1);
    assert.equal(stats.fallbacks, 1);
    assert.deepEqual(stats.winsByRole, { tester: 1 });
    assert.ok(stats.avgDurationMs > 0);

    negotiator.resetStats();
    assert.equal(negotiator.getStats().auctions, 0);
  });
});

describe("ContractNetNegotiator — clôture anticipée avec de vrais agents", () => {
  let agents: AutonomousAgent[] = [];

  afterEach(() => {
    for (const a of agents) a.stop();
    agents = [];
  });

  it("se résout en quelques ms avec 6 agents au lieu d'attendre la fenêtre", async () => {
    const bus = new AgentMessageBus();
    const negotiator = new ContractNetNegotiator(bus, {
      biddingWindowMs: 3000,
      reliability: new RoleReliability(new StrategyMemory({ ephemeral: true }), () => 3),
    });
    const roles: AgentRole[] = ["tester", "coder", "writer", "researcher", "reviewer", "architect"];
    agents = roles.map((r) => new AutonomousAgent(r, stubRunner, bus, { maxIterations: 1 }, negotiator));
    for (const a of agents) a.start();
    negotiator.setExpectedBiddersProvider(() => roles);

    const outcome = await negotiator.negotiate(
      makeTask({ taskId: "fast-1", requiredCapabilities: ["verify_full", "run_project_command"] }),
      undefined,
      { award: false }
    );

    // tester et coder couvrent tous deux les capacités demandées : l'un des deux gagne.
    assert.ok(["tester", "coder"].includes(outcome.winner ?? ""), `gagnant: ${outcome.winner}`);
    assert.ok(!outcome.bids.some((b) => b.role === "writer"), "writer ne couvre rien : refus, pas de bid");
    assert.equal(outcome.closedEarly, true);
    assert.ok(outcome.durationMs < 500, `durée ${outcome.durationMs}ms (fenêtre 3000ms)`);
  });

  it("abaisse le rang d'un rôle dont la fiabilité chute (bid réel des agents)", async () => {
    const bus = new AgentMessageBus();
    const reliability = new RoleReliability(new StrategyMemory({ ephemeral: true }), () => 3);
    const negotiator = new ContractNetNegotiator(bus, { biddingWindowMs: 3000, reliability });
    const roles: AgentRole[] = ["tester", "reviewer"];
    agents = roles.map((r) => new AutonomousAgent(r, stubRunner, bus, { maxIterations: 1 }, negotiator));
    for (const a of agents) a.start();
    negotiator.setExpectedBiddersProvider(() => roles);

    // Capacité partagée → compétences égales, la fiabilité tranche.
    // tester et reviewer possèdent tous deux verify_full (roles.ts).
    for (let i = 0; i < 8; i++) reliability.record("tester", false, 5);
    for (let i = 0; i < 8; i++) reliability.record("reviewer", true, 5);

    const outcome = await negotiator.negotiate(
      makeTask({ taskId: "rel-1", requiredCapabilities: ["verify_full"] }),
      undefined,
      { award: false }
    );
    assert.equal(outcome.winner, "reviewer");
  });
});
