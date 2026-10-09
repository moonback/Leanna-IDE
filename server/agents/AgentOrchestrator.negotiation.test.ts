/**
 * Tests — Routage dynamique de délégation (contract-net « en production »).
 *
 * Prouve que `AgentOrchestrator.delegateTask()` élit l'agent cible par
 * négociation contract-net quand aucun rôle n'est imposé (routage dynamique),
 * et conserve le routage statique quand un rôle est fourni. L'exécution réelle
 * est stubée (skill handler no-op) : on vérifie le ROUTAGE, pas l'exécution.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { AgentOrchestrator } from "./AgentOrchestrator.js";
import { contractNetNegotiator } from "./ContractNetNegotiator.js";
import type { NegotiationOutcome } from "./ContractNetNegotiator.js";

/**
 * Skill handler no-op : empêche l'exécuteur legacy de lever une erreur réelle.
 * `delegateTask` lance l'exécution en fire-and-forget ; on ne l'attend pas.
 */
const noopSkillHandler = async () => ({ ok: true });

describe("AgentOrchestrator — routage dynamique par contract-net", () => {
  let orchestrator: AgentOrchestrator;

  beforeEach(() => {
    orchestrator = new AgentOrchestrator();
    orchestrator.setSkillHandler(noopSkillHandler as never);
  });

  afterEach(() => {
    // Restaure la méthode mockée du singleton partagé entre les tests.
    (contractNetNegotiator.negotiate as unknown as { mock?: { restore(): void } }).mock?.restore();
  });

  it("élit le gagnant de la négociation quand aucun rôle n'est fourni", async (t) => {
    const outcome: NegotiationOutcome = {
      taskId: "negotiated",
      winner: "tester",
      winningScore: 0.9,
      bids: [{ role: "tester", skillMatch: 1, confidence: 0.5, loadPenalty: 0.1, score: 0.9, eligible: true }],
      awarded: true,
    };
    const negotiate = t.mock.method(contractNetNegotiator, "negotiate", async () => outcome);

    const task = await orchestrator.delegateTask({
      // Pas de `role` → routage dynamique.
      title: "Écrire des tests unitaires pour le module X",
      description: "Couvrir les cas limites avec des tests de non-régression",
    });

    assert.equal(negotiate.mock.calls.length, 1, "la négociation doit être déclenchée");
    assert.equal(task.role, "tester", "la tâche doit porter le rôle élu par la négociation");

    // Les capacités requises déduites doivent avoir été passées au négociateur.
    const negotiationArg = negotiate.mock.calls[0].arguments[0] as { requiredCapabilities: string[] };
    assert.ok(
      Array.isArray(negotiationArg.requiredCapabilities) && negotiationArg.requiredCapabilities.length > 0,
      "les capacités requises doivent être inférées et transmises"
    );
  });

  it("lève une erreur explicite si la négociation ne trouve aucun agent éligible", async (t) => {
    const outcome: NegotiationOutcome = {
      taskId: "no-winner",
      winner: null,
      winningScore: null,
      bids: [],
      awarded: false,
    };
    t.mock.method(contractNetNegotiator, "negotiate", async () => outcome);

    await assert.rejects(
      () =>
        orchestrator.delegateTask({
          title: "Tâche sans correspondant",
          description: "Aucun agent ne couvre ce besoin",
        }),
      /Aucun agent éligible/,
      "doit refuser plutôt que router au hasard"
    );
  });

  it("conserve le routage statique quand un rôle est explicitement fourni", async (t) => {
    const negotiate = t.mock.method(contractNetNegotiator, "negotiate", async () => {
      throw new Error("la négociation ne doit PAS être appelée quand un rôle est fourni");
    });

    const task = await orchestrator.delegateTask({
      role: "coder",
      title: "Implémenter la fonctionnalité",
      description: "Ajouter le composant demandé",
    });

    assert.equal(negotiate.mock.calls.length, 0, "pas de négociation en routage statique");
    assert.equal(task.role, "coder");
  });
});
