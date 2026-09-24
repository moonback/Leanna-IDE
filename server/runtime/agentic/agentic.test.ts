/**
 * Tests du runtime agentique — se concentrent sur la mécanique déterministe et
 * hermétique (sans appel LLM réel) :
 *   - résolution des outils réellement accordés à un agent (le correctif clé)
 *   - construction du prompt outillé
 *   - historique d'observations borné
 *   - budgets par défaut
 *
 * Les phases plan()/execute()/finalize() appellent un vrai provider LLM et ne
 * sont donc pas testées ici (elles nécessitent un réseau + clés API).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ToolRegistry } from "../ToolRegistry.js";
import { PermissionPolicy } from "../PermissionPolicy.js";
import {
  resolveAgentTools,
  buildToolSection,
  buildBudgetSection,
  buildObservationHistory,
  DEFAULT_AGENT_BUDGET,
  createAgentRuntime,
  type Observation,
} from "./index.js";
import { emptyBudgetUsage, DEFAULT_PHASE_ALLOCATION } from "./types.js";
import { AgentRuntime as DIRuntime } from "../AgentRuntime.js";

function makeRegistry(): ToolRegistry {
  const registry = new ToolRegistry({
    // mode "off" : aucune permission n'est refusée pendant les tests
    permissionPolicy: new PermissionPolicy({ mode: "off" }),
  });
  registry.register({
    declaration: {
      name: "write_project_file",
      description: "Écrit un fichier",
      parameters: { path: "string", content: "string" },
    },
    handler: async () => ({ written: true }),
    permissions: ["write"],
  });
  registry.register({
    declaration: {
      name: "read_project_file",
      description: "Lit un fichier",
      parameters: { path: "string" },
    },
    handler: async () => ({ content: "hello" }),
    permissions: ["read"],
  });
  return registry;
}

describe("resolveAgentTools — donne à l'agent ses outils réels", () => {
  it("résout uniquement les capabilities présentes dans le registre", () => {
    const registry = makeRegistry();
    const tools = resolveAgentTools(
      ["write_project_file", "read_project_file", "outil_inexistant"],
      registry
    );
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, ["read_project_file", "write_project_file"]);
  });

  it("retourne une liste vide si aucune capability n'est déclarée (fail-safe)", () => {
    const registry = makeRegistry();
    assert.deepEqual(resolveAgentTools([], registry), []);
  });

  it("ignore une capability déclarée mais absente du registre", () => {
    const registry = makeRegistry();
    const tools = resolveAgentTools(["delete_project_file"], registry);
    assert.equal(tools.length, 0);
  });
});

describe("buildToolSection — expose explicitement les outils au modèle", () => {
  it("liste les outils et le protocole tool_calls", () => {
    const registry = makeRegistry();
    const tools = resolveAgentTools(["write_project_file"], registry);
    const section = buildToolSection(tools);
    assert.match(section, /write_project_file/);
    assert.match(section, /tool_calls/);
  });

  it("indique clairement l'absence d'outils", () => {
    const section = buildToolSection([]);
    assert.match(section, /aucun/i);
  });
});

describe("buildObservationHistory — historique borné", () => {
  it("rend les actions et respecte la borne de caractères", () => {
    const observations: Observation[] = [
      {
        iteration: 1,
        reasoning: "je lis le fichier",
        toolOutcomes: [
          {
            invocation: { name: "read_project_file", parameters: { path: "a.ts" } },
            success: true,
            result: "contenu",
            durationMs: 5,
          },
        ],
        isFinal: false,
      },
    ];
    const history = buildObservationHistory(observations, 10_000);
    assert.match(history, /read_project_file/);
    assert.match(history, /Tour 1/);

    const tiny = buildObservationHistory(observations, 50);
    assert.ok(tiny.length <= 200, "l'historique doit rester borné");
  });

  it("retourne une chaîne vide sans observation", () => {
    assert.equal(buildObservationHistory([], 1000), "");
  });
});

describe("DEFAULT_AGENT_BUDGET — gardes-fous", () => {
  it("expose les limites configurables", () => {
    assert.equal(DEFAULT_AGENT_BUDGET.maxIterations, 20);
    assert.equal(typeof DEFAULT_AGENT_BUDGET.maxToolCalls, "number");
    assert.equal(typeof DEFAULT_AGENT_BUDGET.maxReadCalls, "number");
    assert.equal(typeof DEFAULT_AGENT_BUDGET.maxFilesRead, "number");
    assert.equal(typeof DEFAULT_AGENT_BUDGET.maxExecutionTimeMs, "number");
    assert.equal(typeof DEFAULT_AGENT_BUDGET.maxRetries, "number");
    assert.equal(DEFAULT_AGENT_BUDGET.maxCost, Infinity);
  });

  it("expose la répartition par phase (règle d'arrêt)", () => {
    const p = DEFAULT_AGENT_BUDGET.phases;
    assert.equal(p.discoveryMax, 0.3);
    assert.equal(p.planMax, 0.1);
    assert.equal(p.writeMin, 0.3);
    assert.equal(p.verifyMin, 0.2);
    assert.equal(p.recoveryMin, 0.1);
    // La somme des minima réservés reste ≤ 1.
    assert.ok(p.writeMin + p.verifyMin + p.recoveryMin <= 1);
  });
});

describe("emptyBudgetUsage — compteurs séparés", () => {
  it("initialise tous les compteurs à zéro", () => {
    const u = emptyBudgetUsage();
    assert.equal(u.toolCalls, 0);
    assert.equal(u.readCalls, 0);
    assert.equal(u.writeCalls, 0);
    assert.equal(u.verifyCalls, 0);
    assert.equal(u.otherCalls, 0);
    assert.equal(u.filesRead, 0);
    assert.equal(u.filesModified, 0);
    assert.equal(u.cost, 0);
  });
});

describe("buildBudgetSection — surface la phase et la règle d'arrêt", () => {
  it("affiche la phase, les compteurs séparés et la consigne d'arrêt", () => {
    const usage = emptyBudgetUsage();
    usage.toolCalls = 9;
    usage.readCalls = 9;
    const section = buildBudgetSection(DEFAULT_AGENT_BUDGET, usage, "discovery");
    assert.match(section, /DISCOVERY/);
    assert.match(section, /lecture: 9/);
    assert.match(section, /RÈGLE D'ARRÊT/);
    // Le plafond d'exploration affiché = floor(maxToolCalls * discoveryMax).
    const cap = Math.floor(DEFAULT_AGENT_BUDGET.maxToolCalls * DEFAULT_PHASE_ALLOCATION.discoveryMax);
    assert.match(section, new RegExp(`exploration ${cap}`));
  });
});

describe("createAgentRuntime — branchement sur un runtime DI", () => {
  it("réutilise le ToolRegistry et l'EventBus du runtime", () => {
    const di = new DIRuntime();
    const agentic = createAgentRuntime(di, { budget: { maxIterations: 3 } });
    assert.ok(agentic, "le runtime agentique doit être créé");
  });

  it("échoue proprement (outcome=failed) pour un rôle inconnu, sans appeler le LLM", async () => {
    const di = new DIRuntime();
    const agentic = createAgentRuntime(di);
    const result = await agentic.run({ role: "role_inexistant_xyz", goal: "test" });
    assert.equal(result.success, false);
    assert.equal(result.outcome, "failed");
    assert.match(result.error ?? "", /introuvable/);
  });
});
