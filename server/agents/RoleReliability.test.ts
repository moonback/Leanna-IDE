/**
 * Tests pour RoleReliability (Node test runner)
 *
 * Prouve que la confiance des bids vient d'un historique réel PAR RÔLE.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { StrategyMemory } from "../knowledge/StrategyMemory.js";
import { AgentMessageBus } from "./AgentMessageBus.js";
import { ContractNetNegotiator } from "./ContractNetNegotiator.js";
import { RoleReliability, NEUTRAL_CONFIDENCE } from "./RoleReliability.js";

describe("RoleReliability", () => {
  let memory: StrategyMemory;
  let reliability: RoleReliability;

  beforeEach(() => {
    memory = new StrategyMemory({ ephemeral: true });
    reliability = new RoleReliability(memory, () => 3);
  });

  it("retourne la confiance neutre sans historique", () => {
    assert.equal(reliability.getConfidence("coder"), NEUTRAL_CONFIDENCE);
    assert.equal(reliability.getRating("coder").reliable, false);
  });

  it("reste neutre tant que les preuves sont insuffisantes", () => {
    reliability.record("coder", false, 10);
    reliability.record("coder", false, 10);
    assert.equal(reliability.getConfidence("coder"), NEUTRAL_CONFIDENCE);
    assert.equal(reliability.getRating("coder").totalCalls, 2);
  });

  it("note plus haut un rôle fiable qu'un rôle qui échoue", () => {
    for (let i = 0; i < 6; i++) reliability.record("tester", true, 10);
    for (let i = 0; i < 6; i++) reliability.record("coder", false, 10);

    const good = reliability.getConfidence("tester");
    const bad = reliability.getConfidence("coder");
    assert.ok(good > NEUTRAL_CONFIDENCE, `tester=${good}`);
    assert.ok(bad < NEUTRAL_CONFIDENCE, `coder=${bad}`);
    assert.ok(good > bad);
  });

  it("borne la confiance entre 0.05 et 0.95 (jamais 0 ni 1)", () => {
    for (let i = 0; i < 50; i++) reliability.record("tester", true, 1);
    for (let i = 0; i < 50; i++) reliability.record("coder", false, 1);
    assert.ok(reliability.getConfidence("tester") <= 0.95);
    assert.ok(reliability.getConfidence("coder") >= 0.05);
  });

  it("isole les rôles des skills de StrategyMemory (préfixe agent_role:)", () => {
    memory.recordSkillOutcome("write_project_file", true, 5);
    reliability.record("coder", true, 5);
    const roles = reliability.listRatings().map((r) => r.role);
    assert.deepEqual(roles, ["coder"]);
  });

  it("ne lève jamais quand le store échoue (best-effort)", () => {
    const broken = {
      recordSkillOutcome() { throw new Error("disque plein"); },
      getSkillStats() { throw new Error("store corrompu"); },
      getAllStats() { throw new Error("store corrompu"); },
    } as unknown as StrategyMemory;
    const safe = new RoleReliability(broken, () => 3);

    assert.doesNotThrow(() => safe.record("coder", true, 1));
    assert.equal(safe.getConfidence("coder"), NEUTRAL_CONFIDENCE);
    assert.deepEqual(safe.listRatings(), []);
  });
});

describe("ContractNetNegotiator × RoleReliability", () => {
  it("abaisse le bid d'un rôle qui échoue à compétence égale", () => {
    const memory = new StrategyMemory({ ephemeral: true });
    const reliability = new RoleReliability(memory, () => 3);
    const negotiator = new ContractNetNegotiator(new AgentMessageBus(), { reliability });

    const task = {
      taskId: "t-1",
      title: "Implémenter",
      description: "…",
      requiredCapabilities: ["modify_project_file"],
    };

    const before = negotiator.buildAutoBid("coder", task)!;
    assert.equal(before.confidence, NEUTRAL_CONFIDENCE);

    for (let i = 0; i < 8; i++) reliability.record("coder", false, 10);
    const after = negotiator.buildAutoBid("coder", task)!;

    assert.ok(after.confidence < before.confidence, `${after.confidence} < ${before.confidence}`);
    assert.equal(negotiator.confidenceFor("coder"), after.confidence);
  });
});
