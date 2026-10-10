/**
 * Tests du routage contract-net dans AgentOrchestrator (Node test runner)
 *
 * Bus réel + AutonomousAgent réels + moteur d'exécution factice : on prouve
 * l'attribution dynamique, les replis, les modes off/shadow/on, la réservation
 * de capacité et l'alimentation des notes par rôle.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { StrategyMemory } from "../knowledge/StrategyMemory.js";
import { AgentMessageBus } from "./AgentMessageBus.js";
import { ContractNetNegotiator } from "./ContractNetNegotiator.js";
import { AutonomousAgent } from "./AutonomousAgent.js";
import { RoleReliability } from "./RoleReliability.js";
import { AgentOrchestrator } from "./AgentOrchestrator.js";
import type { AgentRole, AgentTask } from "./types.js";

/** Moteur factice : exécute en différé, compte les tâches en cours par rôle. */
class FakeEngine {
  busy = new Set<string>();
  executed: Array<{ id: string; role: string }> = [];
  failRoles = new Set<string>();
  private running = new Map<string, number>();

  getRunningCount(role: string): number {
    return this.busy.has(role) ? 99 : this.running.get(role) ?? 0;
  }

  cancel(): boolean {
    return false;
  }

  async execute(task: AgentTask): Promise<void> {
    this.running.set(task.role, (this.running.get(task.role) ?? 0) + 1);
    task.status = "running";
    task.startedAt = new Date().toISOString();
    this.executed.push({ id: task.id, role: task.role });
    await new Promise((r) => setTimeout(r, 5));
    const ok = !this.failRoles.has(task.role);
    task.status = ok ? "completed" : "failed";
    task.result = { success: ok, outcome: ok ? "success" : "failed", summary: "fake", durationMs: 5 };
    task.completedAt = new Date().toISOString();
    this.running.set(task.role, Math.max(0, (this.running.get(task.role) ?? 1) - 1));
  }
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor: délai dépassé");
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe("AgentOrchestrator × contract-net", () => {
  let bus: AgentMessageBus;
  let negotiator: ContractNetNegotiator;
  let reliability: RoleReliability;
  let orchestrator: AgentOrchestrator;
  let engine: FakeEngine;
  let agents: AutonomousAgent[] = [];
  let savedMode: string | undefined;

  const startAgents = (roles: AgentRole[]) => {
    const noopRunner = { execute: async () => {} };
    agents = roles.map((r) => new AutonomousAgent(r, noopRunner as never, bus, { maxIterations: 1 }, negotiator));
    for (const a of agents) a.start();
    negotiator.setExpectedBiddersProvider(() => roles);
  };

  beforeEach(() => {
    savedMode = process.env.LEANNA_CONTRACT_NET;
    delete process.env.LEANNA_CONTRACT_NET; // défaut : on
    bus = new AgentMessageBus();
    reliability = new RoleReliability(new StrategyMemory({ ephemeral: true }), () => 1);
    negotiator = new ContractNetNegotiator(bus, { biddingWindowMs: 40, reliability });
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

  it("negotiateTask : le gagnant exécute et la tâche est suivie jusqu'à completed", async () => {
    startAgents(["tester", "writer", "researcher"]);

    const result = await orchestrator.negotiateTask({
      title: "Écrire des tests unitaires",
      description: "Couvrir le module de paiement",
      requiredCapabilities: ["verify_full", "run_project_command"],
    });

    assert.equal(result.winner, "tester");
    assert.equal(result.awarded, true);
    const task = orchestrator.getTask(result.taskId)!;
    assert.equal(task.role, "tester");
    await waitFor(() => orchestrator.getTask(result.taskId)!.status === "completed");

    const meta = task.context.metadata as Record<string, any>;
    assert.equal(meta.assignment.via, "contract-net");
    assert.equal(meta.negotiated, true);
    // La note du rôle est alimentée par l'issue de la tâche.
    await waitFor(() => reliability.getRating("tester").totalCalls === 1);
  });

  it("negotiateTask sans gagnant : tâche incomplete consultable, winner=null", async () => {
    startAgents(["writer"]);

    const result = await orchestrator.negotiateTask({
      title: "Tâche obscure",
      description: "Aucun agent capable",
      requiredCapabilities: ["verify_full"],
    });

    assert.equal(result.winner, null);
    assert.equal(result.awarded, false);
    assert.equal(orchestrator.getTask(result.taskId)?.status, "incomplete");
    assert.equal(engine.executed.length, 0);
  });

  it("passe au candidat suivant quand le premier n'a plus de place", async () => {
    startAgents(["tester", "coder"]);
    const request = {
      title: "Vérifier le projet",
      description: "Lancer la vérification complète",
      requiredCapabilities: ["verify_full", "run_project_command"],
    };

    const first = await orchestrator.resolveRole(request);
    assert.equal(first.via, "contract-net");
    orchestrator.releaseRoleReservation(first.role);

    engine.busy.add(first.role); // le premier gagnant est désormais plein
    const second = await orchestrator.resolveRole(request);
    orchestrator.releaseRoleReservation(second.role);

    assert.equal(second.via, "contract-net");
    assert.notEqual(second.role, first.role);
  });

  it("se replie sur le rôle préféré, et compte le repli, sans offre éligible", async () => {
    startAgents(["writer"]);

    const assignment = await orchestrator.resolveRole({
      title: "Vérifier",
      description: "Lancer la vérification",
      requiredCapabilities: ["verify_full"],
      preferredRole: "coder",
    });

    assert.equal(assignment.role, "coder");
    assert.equal(assignment.via, "fallback");
    assert.equal(negotiator.getStats().fallbacks, 1);
  });

  it("se replie sur le rôle par défaut sans rôle préféré", async () => {
    startAgents(["writer"]);
    const assignment = await orchestrator.resolveRole({
      title: "Vérifier",
      description: "Lancer la vérification",
      requiredCapabilities: ["verify_full"],
    });
    assert.equal(assignment.role, "planner");
    assert.equal(assignment.via, "fallback");
  });

  it("mode shadow : l'enchère est observée mais le rôle statique est conservé", async () => {
    process.env.LEANNA_CONTRACT_NET = "shadow";
    startAgents(["tester", "writer"]);

    const assignment = await orchestrator.resolveRole({
      title: "Écrire des tests",
      description: "Tests unitaires",
      requiredCapabilities: ["verify_full", "run_project_command"],
      preferredRole: "writer",
    });

    assert.equal(assignment.via, "shadow");
    assert.equal(assignment.role, "writer", "le rôle statique est conservé");
    assert.equal(assignment.shadowWinner, "tester");
    assert.equal(negotiator.getStats().auctions, 1);
    assert.equal(negotiator.getStats().fallbacks, 0);
  });

  it("mode off : routage statique, aucune enchère", async () => {
    process.env.LEANNA_CONTRACT_NET = "off";
    startAgents(["tester"]);

    const assignment = await orchestrator.resolveRole({
      title: "Tests",
      description: "Tests unitaires",
      preferredRole: "coder",
    });

    assert.equal(assignment.via, "static");
    assert.equal(assignment.role, "coder");
    assert.equal(negotiator.getStats().auctions, 0);
  });

  it("saute l'enchère immédiatement quand aucun agent n'est en ligne", async () => {
    negotiator.setExpectedBiddersProvider(() => []);
    const startedAt = Date.now();

    const assignment = await orchestrator.resolveRole({
      title: "Tâche",
      description: "Description",
      preferredRole: "coder",
    });

    assert.equal(assignment.via, "fallback");
    assert.equal(assignment.role, "coder");
    assert.equal(negotiator.getStats().auctions, 0);
    assert.ok(Date.now() - startedAt < 30, "aucune attente de fenêtre d'enchères");
  });

  it("réserve la place du rôle : deux résolutions parallèles ne visent pas un rôle plein", async () => {
    startAgents(["architect"]); // maxConcurrency = 1
    const request = {
      title: "Impact",
      description: "Analyse d'impact",
      requiredCapabilities: ["knowledge_impact_analyze"],
      preferredRole: "planner" as AgentRole,
    };

    const [a, b] = await Promise.all([orchestrator.resolveRole(request), orchestrator.resolveRole(request)]);
    const via = [a.via, b.via].sort();

    assert.deepEqual(via, ["contract-net", "fallback"], "une seule place pour architect");
    for (const x of [a, b]) if (x.reserved) orchestrator.releaseRoleReservation(x.role);
  });

  it("delegateTask avec negotiate : le rôle préféré du Brain est battu au-delà de la marge", async () => {
    startAgents(["tester", "writer"]);

    const task = await orchestrator.delegateTask({
      preferredRole: "writer",
      negotiate: { requiredCapabilities: ["verify_full", "run_project_command"] },
      title: "Exécuter la suite de tests",
      description: "Lancer et corriger les tests",
    });

    assert.equal(task.role, "tester");
    assert.equal((task.context.metadata as any).assignment.preferredRole, "writer");
    await waitFor(() => task.status === "completed");
  });

  it("delegateTask sans negotiate reste statique (aucune enchère)", async () => {
    startAgents(["tester"]);

    const task = await orchestrator.delegateTask({
      role: "coder",
      title: "Implémenter",
      description: "Une fonction",
    });

    assert.equal(task.role, "coder");
    assert.equal(task.context.metadata, undefined);
    assert.equal(negotiator.getStats().auctions, 0);
    await waitFor(() => task.status === "completed");
    await waitFor(() => reliability.getRating("coder").totalCalls === 1);
  });

  it("delegateTask exige un rôle ou negotiate", async () => {
    await assert.rejects(
      () => orchestrator.delegateTask({ title: "x", description: "y" }),
      /role/i
    );
  });

  it("orchestrate : une tâche sans rôle est attribuée par enchère au lancement (après ses dépendances)", async () => {
    startAgents(["tester", "writer", "researcher"]);

    const plan = await orchestrator.orchestrate({
      title: "Plan mixte",
      description: "Rôle fixe puis rôle automatique",
      tasks: [
        { id: "impl", role: "coder", title: "Implémenter", description: "Une fonction" },
        {
          id: "qa",
          // pas de rôle : attribué par enchère
          requiredCapabilities: ["verify_full", "run_project_command"],
          title: "Vérifier",
          description: "Lancer la suite de tests",
          dependsOn: ["impl"],
        },
      ],
    });

    const qa = plan.tasks[1];
    assert.equal(qa.role, "unassigned", "rôle provisoire tant que la tâche n'a pas démarré");

    await waitFor(() => plan.status === "completed", 5000);

    assert.equal(plan.tasks[0].role, "coder", "le rôle explicite est respecté");
    assert.equal(qa.role, "tester", "le rôle omis est attribué par enchère");
    assert.equal(qa.status, "completed");
    assert.equal((qa.context.metadata as any).assignment.via, "contract-net");
    assert.ok(qa.timeoutMs && qa.timeoutMs > 0, "timeout fixé à l'attribution");
    assert.equal(qa.context.previousResults?.length, 1, "le résultat de la dépendance est injecté");
    // Les deux rôles alimentent leur note.
    await waitFor(() => reliability.getRating("tester").totalCalls === 1 && reliability.getRating("coder").totalCalls === 1);
  });

  it("orchestrate : sans agent en ligne, la tâche sans rôle se replie sur le rôle par défaut", async () => {
    negotiator.setExpectedBiddersProvider(() => []);

    const plan = await orchestrator.orchestrate({
      title: "Plan",
      description: "Sans flotte",
      tasks: [{ title: "Tâche libre", description: "Faire quelque chose" }],
    });

    await waitFor(() => plan.status === "completed", 5000);
    assert.equal(plan.tasks[0].role, "planner");
    assert.equal((plan.tasks[0].context.metadata as any).assignment.via, "fallback");
  });

  it("orchestrate : un rôle explicite inconnu est toujours rejeté immédiatement", async () => {
    await assert.rejects(
      () =>
        orchestrator.orchestrate({
          title: "Plan",
          description: "Rôle inconnu",
          tasks: [{ role: "role-qui-n-existe-pas", title: "T", description: "D" }],
        }),
      /introuvable|inconnu|not found/i
    );
  });

  it("orchestrate : l'attribution est faite à la volée, deux tâches parallèles sans rôle se répartissent", async () => {
    startAgents(["architect", "researcher"]); // architect: 1 place ; researcher: 2 places
    const plan = await orchestrator.orchestrate({
      title: "Parallèle",
      description: "Deux analyses",
      tasks: [
        { title: "Analyse A", description: "Impact A", requiredCapabilities: ["knowledge_impact_analyze"] },
        { title: "Analyse B", description: "Impact B", requiredCapabilities: ["knowledge_impact_analyze"] },
      ],
    });

    await waitFor(() => plan.status === "completed", 5000);
    const roles = plan.tasks.map((t) => t.role);
    assert.ok(roles.every((r) => r !== "unassigned"));
    assert.ok(roles.every((r) => ["architect", "researcher", "planner"].includes(r)), `rôles: ${roles}`);
  });

  it("les échecs d'un rôle abaissent sa note", async () => {
    engine.failRoles.add("coder");
    for (let i = 0; i < 4; i++) {
      const task = await orchestrator.delegateTask({ role: "coder", title: `t${i}`, description: "d" });
      await waitFor(() => task.status === "failed");
    }
    await waitFor(() => reliability.getRating("coder").totalCalls === 4);
    assert.ok(reliability.getConfidence("coder") < 0.5);
  });
});
