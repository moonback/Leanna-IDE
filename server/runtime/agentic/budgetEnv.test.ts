/**
 * Tests — surcharge du budget agentique par variables d'environnement.
 *
 * Vérifie que `agentBudgetFromEnv` lit les quotas `LEANNA_AGENT_MAX_*`,
 * ignore les valeurs absentes/invalides, et que la fusion
 * défaut < env < explicite donne le budget attendu (maxToolCalls recalculé).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  agentBudgetFromEnv,
  normalizeBudget,
  DEFAULT_AGENT_BUDGET,
} from "./types.js";

describe("agentBudgetFromEnv", () => {
  it("retourne {} quand aucune variable n'est définie", () => {
    assert.deepEqual(agentBudgetFromEnv({}), {});
  });

  it("lit les quotas valides depuis l'environnement", () => {
    const env = {
      LEANNA_AGENT_MAX_READ: "5",
      LEANNA_AGENT_MAX_WRITE: "12",
      LEANNA_AGENT_MAX_ITERATIONS: "30",
      LEANNA_AGENT_MAX_EXEC_MS: "120000",
    } as NodeJS.ProcessEnv;
    const overrides = agentBudgetFromEnv(env);
    assert.equal(overrides.maxRead, 5);
    assert.equal(overrides.maxWrite, 12);
    assert.equal(overrides.maxIterations, 30);
    assert.equal(overrides.maxExecutionTimeMs, 120000);
    // Les quotas non fournis restent absents (→ garderont leur défaut).
    assert.equal(overrides.maxVerify, undefined);
  });

  it("ignore les valeurs invalides (vide, 0, négatif, non numérique)", () => {
    const env = {
      LEANNA_AGENT_MAX_READ: "",
      LEANNA_AGENT_MAX_WRITE: "0",
      LEANNA_AGENT_MAX_VERIFY: "-3",
      LEANNA_AGENT_MAX_PLAN: "abc",
    } as NodeJS.ProcessEnv;
    assert.deepEqual(agentBudgetFromEnv(env), {});
  });

  it("tronque les décimales en entier", () => {
    assert.equal(agentBudgetFromEnv({ LEANNA_AGENT_MAX_READ: "6.9" } as NodeJS.ProcessEnv).maxRead, 6);
  });

  it("fusion défaut < env : maxToolCalls recalculé comme somme des phases", () => {
    const env = { LEANNA_AGENT_MAX_READ: "4", LEANNA_AGENT_MAX_WRITE: "10" } as NodeJS.ProcessEnv;
    const merged = normalizeBudget({ ...DEFAULT_AGENT_BUDGET, ...agentBudgetFromEnv(env) });
    assert.equal(merged.maxRead, 4);
    assert.equal(merged.maxWrite, 10);
    // somme = read 4 + plan 3 + write 10 + verify 6 + recovery 4 = 27
    assert.equal(merged.maxToolCalls, 4 + 3 + 10 + 6 + 4);
  });

  it("une config explicite prime sur l'env (défaut < env < explicite)", () => {
    const env = { LEANNA_AGENT_MAX_READ: "4" } as NodeJS.ProcessEnv;
    const explicit = { maxRead: 2 };
    const merged = normalizeBudget({
      ...DEFAULT_AGENT_BUDGET,
      ...agentBudgetFromEnv(env),
      ...explicit,
    });
    assert.equal(merged.maxRead, 2, "la config explicite doit l'emporter sur l'env");
  });
});
