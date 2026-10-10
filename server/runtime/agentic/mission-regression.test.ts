/**
 * Tests de non-regression -- Phase 7 (Mission Codex)
 *
 * 12 scenarios critiques + CR-3 stall + CR-4 stuck.
 * Framework : node:test (meme runner que les tests existants).
 * Aucun reseau, aucune cle API : modele deterministe injecte.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "crypto";

import { ToolRegistry } from "../ToolRegistry.js";
import { PermissionPolicy } from "../PermissionPolicy.js";
import { EventBus } from "../EventBus.js";
import { dynamicAgentRegistry } from "../../agents/DynamicAgentRegistry.js";
import type { VerificationRecord } from "../../agents/WorkspaceState.js";
import { AgenticRuntime, type GenerateTextFn } from "./index.js";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

// -- Faux FS + ToolRegistry -------------------------------------------------

interface FakeFs {
  content: Map<string, string>;
  verifyOk: (path: string, content: string) => boolean;
  allowedPaths?: Set<string>;
}

function makeRegistry(fs: FakeFs) {
  const registry = new ToolRegistry({ permissionPolicy: new PermissionPolicy({ mode: "off" }) });

  registry.register({
    declaration: { name: "read_project_file", description: "lit", parameters: { path: "string" } },
    handler: async (a) => {
      const path = String(a.path);
      if (fs.allowedPaths && !fs.allowedPaths.has(path))
        return { error: `Chemin ${path} hors du perimetre autorise.` };
      const content = fs.content.get(path);
      if (content === undefined) return { error: `Fichier ${path} introuvable.` };
      return { content, status: "success" };
    },
    permissions: ["read"],
  });

  registry.register({
    declaration: { name: "search_in_files", description: "cherche", parameters: { query: "string" } },
    handler: async (a) => {
      const q = String(a.query ?? "");
      const matches = [...fs.content.entries()]
        .filter(([p]) => p.includes(q))
        .map(([p]) => ({ file: p, line: 1, snippet: "..." }));
      return { matches };
    },
    permissions: ["read"],
  });

  registry.register({
    declaration: { name: "modify_project_file", description: "modifie", parameters: { path: "string", content: "string" } },
    handler: async (a) => {
      const path = String(a.path);
      if (fs.allowedPaths && !fs.allowedPaths.has(path))
        return { error: `Ecriture refusee : ${path} hors perimetre.` };
      fs.content.set(path, String(a.content ?? ""));
      return { ok: true };
    },
    permissions: ["write"],
  });

  registry.register({
    declaration: { name: "verify_file", description: "verifie", parameters: { path: "string" } },
    handler: async (a) => {
      const path = String(a.path);
      const content = fs.content.get(path) ?? "";
      const h = sha(content);
      const ok = fs.verifyOk(path, content);
      const issues = ok ? [] : [{ type: "typecheck", file: path, line: 1, column: 1, severity: "error" as const, rule: "TS9999", message: "Verification echouee." }];
      const record: VerificationRecord = { file: path, contentHash: h, hashBefore: h, hashAfter: h, verifiedAt: new Date().toISOString(), ok, status: ok ? "success" : "failed", issues, allIssues: issues };
      return { status: ok ? "success" : "failed", ok, fileChanged: true, verificationRecord: record };
    },
    permissions: ["read"],
  });

  return { registry };
}

// -- Agents de test ----------------------------------------------------------

function registerAgent(role: string, caps?: string[]): void {
  dynamicAgentRegistry.registerAgent(
    {
      role, name: `Test ${role}`, description: "test",
      capabilities: caps ?? ["read_project_file", "search_in_files", "modify_project_file", "verify_file"],
      systemPrompt: "Agent de test.", maxConcurrency: 1, defaultTimeoutMs: 30_000,
    },
    true
  );
}

// -- Helpers LLM deterministe ------------------------------------------------

function reply(text: string): Awaited<ReturnType<GenerateTextFn>> {
  return { text, provider: "gemini", model: "fake", tokenUsage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 } };
}

const PLAN_JSON = JSON.stringify({
  intent: "Corriger le fichier cible",
  successCriteria: ["verify_file passe"],
  rationale: "Fix",
  steps: [{ description: "Corriger le fichier", suggestedTools: ["modify_project_file", "verify_file"], verification: "verify_file OK" }],
});
const FINAL_JSON = JSON.stringify({ summary: "Mission realisee", details: "Corrections appliquees.", deliverables: ["target.ts"], suggestions: [] });

const isPlanPrompt = (p: string) => /produis un plan|Analyse l'intention/i.test(p);
const isFinalPrompt = (p: string) => /synth[eè]se finale/i.test(p);
const toolCall = (name: string, params: Record<string, unknown>) =>
  JSON.stringify({ tool_calls: [{ name, parameters: params }] });

function scriptedModel(steps: string[], customPlan?: string): GenerateTextFn {
  let i = 0;
  const planJson = customPlan ?? (() => {
    const toolSteps = steps.filter((s) => s.includes("tool_calls"));
    const planSteps = (toolSteps.length > 0 ? toolSteps : [steps[0] || "action"]).map((_, idx) => ({
      description: `Etape ${idx + 1}`,
      suggestedTools: ["read_project_file", "search_in_files", "modify_project_file", "verify_file"],
      verification: "verify_file OK",
    }));
    return JSON.stringify({
      intent: "Corriger le fichier cible",
      successCriteria: ["verify_file passe"],
      rationale: "Plan d'action",
      steps: planSteps,
    });
  })();

  return (async (opts: { prompt: string }) => {
    if (isPlanPrompt(opts.prompt)) return reply(planJson);
    if (isFinalPrompt(opts.prompt)) return reply(FINAL_JSON);
    const next = i < steps.length ? steps[i] : "";
    i++;
    return reply(next);
  }) as GenerateTextFn;
}

// ===========================================================================
// Scenario 1 : Fichier absent du contexte initial, lu directement
// ===========================================================================

describe("Scenario 1 -- Fichier absent du contexte initial, lu directement", () => {
  beforeEach(() => registerAgent("s1_agent"));

  it("l'agent lit le fichier cible via read_project_file meme si non fourni dans task.files", async () => {
    const fs: FakeFs = { content: new Map([["target.ts", "const x: string = 1;"]]), verifyOk: (_p, c) => c.includes("number") };
    const { registry } = makeRegistry(fs);
    const model = scriptedModel([
      toolCall("read_project_file", { path: "target.ts" }),
      toolCall("modify_project_file", { path: "target.ts", content: "const x: number = 1;" }),
      "Termine.",
    ]);
    const runtime = new AgenticRuntime({ registry, events: new EventBus(), model });
    const result = await runtime.run({ role: "s1_agent", goal: "Corrige target.ts", id: "s1" });
    assert.ok(result.filesRead.includes("target.ts"), "target.ts doit etre lu meme sans task.files");
    assert.ok(result.filesModified.includes("target.ts"), "target.ts doit etre modifie");
  });
});

// ===========================================================================
// Scenario 2 : Resultats de recherche non pertinents
// ===========================================================================

describe("Scenario 2 -- Resultats de recherche non pertinents", () => {
  beforeEach(() => registerAgent("s2_agent"));

  it("la mission peut progresser meme si search_in_files renvoie zero resultat", async () => {
    const fs: FakeFs = { content: new Map([["target.ts", "const x: string = 1;"]]), verifyOk: (_p, c) => c.includes("number") };
    const { registry } = makeRegistry(fs);
    const model = scriptedModel([
      toolCall("search_in_files", { query: "aucun_resultat_xyz" }),
      toolCall("modify_project_file", { path: "target.ts", content: "const x: number = 1;" }),
      "Termine.",
    ]);
    const runtime = new AgenticRuntime({ registry, events: new EventBus(), model });
    const result = await runtime.run({ role: "s2_agent", goal: "Corrige target.ts", id: "s2" });
    assert.ok(result.toolsExecuted.includes("search_in_files"), "la recherche a ete executee");
    assert.ok(result.filesModified.includes("target.ts"), "la modification a eu lieu malgre la recherche vide");
  });
});

// ===========================================================================
// Scenario 3 : Contexte insuffisant -- lecture enrichissante
// ===========================================================================

describe("Scenario 3 -- Contexte insuffisant, lecture enrichissante", () => {
  beforeEach(() => registerAgent("s3_agent"));

  it("l'agent lit plusieurs fichiers avant d'ecrire pour enrichir son contexte", async () => {
    const fs: FakeFs = {
      content: new Map([["target.ts", "import { Dep } from './dep';\nconst x: string = 1;"], ["dep.ts", "export type Dep = { value: number };"]]),
      verifyOk: (_p, c) => c.includes("number"),
    };
    const { registry } = makeRegistry(fs);
    const model = scriptedModel([
      toolCall("read_project_file", { path: "dep.ts" }),
      toolCall("read_project_file", { path: "target.ts" }),
      toolCall("modify_project_file", { path: "target.ts", content: "const x: number = 1;" }),
      "Termine.",
    ]);
    const runtime = new AgenticRuntime({ registry, events: new EventBus(), model });
    const result = await runtime.run({ role: "s3_agent", goal: "Corrige target.ts", id: "s3" });
    assert.ok(result.filesRead.includes("dep.ts"), "la dependance doit avoir ete lue");
    assert.ok(result.filesRead.includes("target.ts"), "le fichier cible doit avoir ete lu");
    assert.ok(result.filesModified.includes("target.ts"), "le fichier cible doit avoir ete modifie");
  });
});

// ===========================================================================
// Scenario 4 : Ecriture reussit, fichier persiste et verifie
// ===========================================================================

describe("Scenario 4 -- Ecriture reussit, fichier persiste", () => {
  beforeEach(() => registerAgent("s4_agent"));

  it("outcome=success, filesModified, contenu persiste dans fs", async () => {
    const fs: FakeFs = { content: new Map([["src/comp.tsx", "const bad = 1;"]]), verifyOk: (_p, c) => c.includes("GOOD") };
    const { registry } = makeRegistry(fs);
    const model = scriptedModel([
      toolCall("modify_project_file", { path: "src/comp.tsx", content: "const GOOD = 1;" }),
      "Termine.",
    ]);
    const runtime = new AgenticRuntime({ registry, events: new EventBus(), model });
    const result = await runtime.run({ role: "s4_agent", goal: "Ameliore src/comp.tsx", id: "s4" });
    assert.equal(result.success, true, "la mission doit reussir");
    assert.equal(result.outcome, "success");
    assert.ok(result.filesModified.includes("src/comp.tsx"));
    assert.ok(fs.content.get("src/comp.tsx")?.includes("GOOD"), "contenu persiste");
    assert.ok(result.verifications.some((v) => v.passed), "verification passee");
  });
});

// ===========================================================================
// Scenario 5 : Ecriture echoue, erreur propagee
// ===========================================================================

describe("Scenario 5 -- Ecriture echoue, erreur propagee", () => {
  beforeEach(() => registerAgent("s5_agent"));

  it("outcome=failed quand l'outil retourne { error }, aucun fichier ne compte comme modifie", async () => {
    const policy = new PermissionPolicy({ mode: "off" });
    const registry = new ToolRegistry({ permissionPolicy: policy });
    registry.register({
      declaration: { name: "modify_project_file", description: "echoue", parameters: { path: "string" } },
      handler: async () => ({ error: "searchText introuvable dans le fichier." }),
      permissions: ["write"],
    });
    registry.register({
      declaration: { name: "read_project_file", description: "lit", parameters: { path: "string" } },
      handler: async () => ({ content: "original", status: "success" }),
      permissions: ["read"],
    });
    registry.register({
      declaration: { name: "verify_file", description: "verifie", parameters: { path: "string" } },
      handler: async () => ({ error: "Le fichier n'a pas ete modifie." }),
      permissions: ["read"],
    });
    registry.register({
      declaration: { name: "search_in_files", description: "cherche", parameters: { query: "string" } },
      handler: async () => ({ matches: [] }),
      permissions: ["read"],
    });

    const model = scriptedModel([toolCall("modify_project_file", { path: "target.ts" }), "Termine."]);
    const runtime = new AgenticRuntime({ registry, events: new EventBus(), model });
    const result = await runtime.run({ role: "s5_agent", goal: "Modifie target.ts", id: "s5" });

    assert.equal(result.success, false, "echec de l'outil ne peut pas etre un succes");
    assert.equal(result.filesModified.length, 0, "aucun fichier ne doit etre marque modifie");
    const hasWriteError = result.observations.some((o) =>
      o.toolOutcomes.some((t) => t.invocation.name === "modify_project_file" && !t.success)
    );
    assert.ok(hasWriteError, "l'erreur d'ecriture doit etre dans les observations");
  });
});

// ===========================================================================
// Scenario 6 : Meme patch repete -- stall/abort
// ===========================================================================

describe("Scenario 6 -- Meme patch repete, arret avant budget epuise", () => {
  beforeEach(() => registerAgent("s6_agent"));

  it("la boucle s'arrete avant d'epuiser le budget si le meme patch est repete", async () => {
    const fs: FakeFs = { content: new Map([["loop.ts", "original"]]), verifyOk: () => false };
    const { registry } = makeRegistry(fs);
    const samePatch = toolCall("modify_project_file", { path: "loop.ts", content: "same" });
    const model = scriptedModel(Array(20).fill(samePatch));
    const runtime = new AgenticRuntime({ registry, events: new EventBus(), model });
    const result = await runtime.run({ role: "s6_agent", goal: "Corrige loop.ts", id: "s6" });

    assert.equal(result.success, false, "boucle repetee ne peut pas etre un succes");
    assert.ok(["failed", "blocked"].includes(result.outcome), `outcome: ${result.outcome}`);
    assert.ok(result.budgetUsage.iterations <= 12, `trop d'iterations (${result.budgetUsage.iterations})`);
    assert.ok(
      result.recoveries.some((r) => r.strategy === "abort"),
      "au moins un abort (no-progress ou patch repete) doit apparaitre"
    );
  });
});

// ===========================================================================
// Scenario 7 : Budget epuise sans modification
// ===========================================================================

describe("Scenario 7 -- Budget epuise sans modification", () => {
  beforeEach(() => registerAgent("s7_agent"));

  it("outcome!=success, success=false, summary non trompeur", async () => {
    const fs: FakeFs = { content: new Map([["big.ts", "content"]]), verifyOk: () => false };
    const { registry } = makeRegistry(fs);
    const model = scriptedModel(Array(30).fill(toolCall("read_project_file", { path: "big.ts" })));
    const runtime = new AgenticRuntime({
      registry, events: new EventBus(), model,
      budget: { maxRead: 3, maxWrite: 2, maxVerify: 2, maxRecovery: 1, maxPlan: 1 },
    });
    const result = await runtime.run({ role: "s7_agent", goal: "Analyse big.ts", id: "s7" });

    assert.equal(result.success, false, "budget epuise => success=false");
    assert.ok(["no_change", "failed", "blocked", "partial"].includes(result.outcome), `outcome: ${result.outcome}`);
    assert.notEqual(result.final.summary, "Tache traitee.", "message generique interdit");
    assert.ok(result.final.summary.length > 0, "summary non vide");
  });
});

// ===========================================================================
// Scenario 8 : Fichier modifie, verification echoue
// ===========================================================================

describe("Scenario 8 -- Fichier modifie, verification echoue", () => {
  beforeEach(() => registerAgent("s8_agent"));

  it("success=false et outcome!=success si verify_file echoue apres ecriture", async () => {
    const fs: FakeFs = { content: new Map([["bad.ts", "original"]]), verifyOk: () => false };
    const { registry } = makeRegistry(fs);
    const model = scriptedModel([toolCall("modify_project_file", { path: "bad.ts", content: "wrong" }), "Termine."]);
    const runtime = new AgenticRuntime({ registry, events: new EventBus(), model });
    const result = await runtime.run({ role: "s8_agent", goal: "Corrige bad.ts", id: "s8" });

    assert.equal(result.success, false, "verification echouee => success=false");
    assert.notEqual(result.outcome, "success");
    assert.ok(result.filesModified.includes("bad.ts"), "modification effective tracee");
    assert.ok(result.verifications.some((v) => !v.passed), "au moins une verification echouee");
  });
});

// ===========================================================================
// Scenario 9 : Fichier modifie, verifications passent
// ===========================================================================

describe("Scenario 9 -- Fichier modifie, verifications passent", () => {
  beforeEach(() => registerAgent("s9_agent"));

  it("outcome=success, success=true, verification passee confirmee", async () => {
    const fs: FakeFs = { content: new Map([["ok.ts", "const x: string = 1;"]]), verifyOk: (_p, c) => c.includes("number") };
    const { registry } = makeRegistry(fs);
    const model = scriptedModel([toolCall("modify_project_file", { path: "ok.ts", content: "const x: number = 1;" }), "Termine."]);
    const runtime = new AgenticRuntime({ registry, events: new EventBus(), model });
    const result = await runtime.run({ role: "s9_agent", goal: "Corrige ok.ts", id: "s9" });

    assert.equal(result.success, true);
    assert.equal(result.outcome, "success");
    assert.ok(result.filesModified.includes("ok.ts"));
    assert.ok(result.verifications.every((v) => v.passed), "toutes les verifications passent");
    assert.ok(result.budgetUsage.verifyCalls >= 1, "verify_file appele");
  });
});

// ===========================================================================
// Scenario 10 : Chemin hors perimetre autorise
// ===========================================================================

describe("Scenario 10 -- Chemin hors perimetre autorise", () => {
  beforeEach(() => registerAgent("s10_agent"));

  it("l'ecriture hors perimetre retourne { error } et ne compte pas comme modification", async () => {
    const fs: FakeFs = {
      content: new Map([["allowed.ts", "ok"]]),
      verifyOk: () => true,
      allowedPaths: new Set(["allowed.ts"]),
    };
    const { registry } = makeRegistry(fs);
    const model = scriptedModel([toolCall("modify_project_file", { path: "secret.ts", content: "hacked" }), "Termine."]);
    const runtime = new AgenticRuntime({ registry, events: new EventBus(), model });
    const result = await runtime.run({ role: "s10_agent", goal: "Modifie secret.ts", id: "s10" });

    assert.equal(result.success, false, "ecriture hors perimetre => echec");
    assert.ok(!result.filesModified.includes("secret.ts"), "secret.ts ne doit pas etre dans filesModified");
    const hasOobError = result.observations.some((o) =>
      o.toolOutcomes.some((t) => !t.success && t.error?.toLowerCase().includes("perimetre"))
    );
    assert.ok(hasOobError, "erreur de perimetre dans les observations");
  });
});

// ===========================================================================
// Scenario 11 : Outil declare mais indisponible en execution
// ===========================================================================

describe("Scenario 11 -- Outil declare mais absent du registre", () => {
  beforeEach(() => {
    dynamicAgentRegistry.registerAgent(
      {
        role: "s11_agent", name: "Test s11_agent", description: "test",
        capabilities: ["read_project_file", "run_project_command", "modify_project_file", "verify_file"],
        systemPrompt: "Agent de test.", maxConcurrency: 1, defaultTimeoutMs: 30_000,
      },
      true
    );
  });

  it("l'outil non disponible donne une erreur gracieuse sans crash du runtime", async () => {
    const fs: FakeFs = { content: new Map([["target.ts", "original"]]), verifyOk: (_p, c) => c.includes("fixed") };
    const { registry } = makeRegistry(fs);
    const model = scriptedModel([
      toolCall("run_project_command", { command: "npm test" }),
      toolCall("modify_project_file", { path: "target.ts", content: "fixed" }),
      "Termine.",
    ]);
    const runtime = new AgenticRuntime({ registry, events: new EventBus(), model });
    const result = await runtime.run({ role: "s11_agent", goal: "Fix target.ts", id: "s11" });

    // run_project_command est declare par l'agent mais non present dans ce ToolRegistry : resolveAgentTools ne le retient pas.
    // L'appel est refuse (non autorise pour l'agent) -> error in outcomes.
    const hasUnavailableError = result.observations.some((o) =>
      o.toolOutcomes.some((t) => t.invocation.name === "run_project_command" && !t.success)
    );
    assert.ok(hasUnavailableError, "l'appel a run_project_command doit etre refuse gracieusement");
    // Le runtime retourne un resultat coherent sans crash.
    assert.ok(["success", "failed", "partial", "blocked", "no_change"].includes(result.outcome));
  });
});

// ===========================================================================
// Scenario 12 : Resultat final correspond au resultat reel
// ===========================================================================

describe("Scenario 12 -- Resultat final correspond au resultat reel", () => {
  beforeEach(() => registerAgent("s12_agent"));

  it("partial/failed => success=false, summary non trompeur (CR-1 + CR-2)", async () => {
    const fs: FakeFs = { content: new Map([["target.ts", "original"]]), verifyOk: () => false };
    const { registry } = makeRegistry(fs);
    const model = scriptedModel([toolCall("modify_project_file", { path: "target.ts", content: "wrong" }), "Termine."]);
    const runtime = new AgenticRuntime({ registry, events: new EventBus(), model });
    const result = await runtime.run({ role: "s12_agent", goal: "Fix target.ts", id: "s12a" });

    assert.equal(result.success, false, "verification KO => success=false (CR-1)");
    assert.notEqual(result.outcome, "success");
    assert.notEqual(result.final.summary, "Tache traitee.", "message generique interdit (CR-2)");
    assert.ok(result.filesModified.includes("target.ts"), "fichiers modifies traces");
    assert.ok(result.budgetUsage.writeCalls >= 1, "ecriture comptabilisee");
  });

  it("success=true seulement quand l'ecriture est verifiee", async () => {
    const fs: FakeFs = { content: new Map([["good.ts", "bad"]]), verifyOk: (_p, c) => c === "good" };
    const { registry } = makeRegistry(fs);
    const model = scriptedModel([toolCall("modify_project_file", { path: "good.ts", content: "good" }), "Termine."]);
    const runtime = new AgenticRuntime({ registry, events: new EventBus(), model });
    const result = await runtime.run({ role: "s12_agent", goal: "Fix good.ts", id: "s12b" });

    assert.equal(result.success, true, "ecriture + verification OK => success=true");
    assert.equal(result.outcome, "success");
  });

  it("no_change => success=false, summary non trompeur", async () => {
    const fs: FakeFs = { content: new Map(), verifyOk: () => true };
    const { registry } = makeRegistry(fs);
    const model = scriptedModel(["Aucune action necessaire."]);
    const runtime = new AgenticRuntime({ registry, events: new EventBus(), model });
    const result = await runtime.run({ role: "s12_agent", goal: "Analyse uniquement", id: "s12c" });

    assert.equal(result.success, false, "no_change ne peut pas etre success");
    assert.ok(["no_change", "failed", "partial"].includes(result.outcome), `outcome: ${result.outcome}`);
    assert.notEqual(result.final.summary, "Tache traitee.", "message generique interdit");
  });
});

// ===========================================================================
// CR-4 : Agent write-capable sans ecriture = failed (stuck detection)
// ===========================================================================

describe("CR-4 -- Lectures sans ecriture sur agent write-capable = failed", () => {
  beforeEach(() => registerAgent("cr4_agent"));

  it("des lectures sans ecriture = outcome failed, pas partial trompeur", async () => {
    const fs: FakeFs = { content: new Map([["t.ts", "x"]]), verifyOk: () => false };
    const { registry } = makeRegistry(fs);
    const model = scriptedModel([
      toolCall("search_in_files", { query: "t" }),
      toolCall("read_project_file", { path: "t.ts" }),
      "J'ai analyse mais je ne modifie rien.",
    ]);
    const runtime = new AgenticRuntime({ registry, events: new EventBus(), model });
    const result = await runtime.run({ role: "cr4_agent", goal: "Ameliore t.ts", id: "cr4" });

    assert.equal(result.success, false, "aucune ecriture avec mission de modification => echec");
    assert.equal(result.filesModified.length, 0, "filesModified vide");
    assert.notEqual(result.final.summary, "Tache traitee.", "message generique interdit");
  });
});

// ===========================================================================
// CR-3 : Stall detection
// ===========================================================================

describe("CR-3 -- Stall detection : iterations sans appel d'outil", () => {
  beforeEach(() => registerAgent("cr3_agent"));

  it("la boucle s'arrete apres MAX_STALL_ITERATIONS sans appel d'outil", async () => {
    const fs: FakeFs = { content: new Map([["f.ts", "x"]]), verifyOk: () => false };
    const { registry } = makeRegistry(fs);
    const model = scriptedModel(Array(10).fill("Je reflechis encore..."));
    const runtime = new AgenticRuntime({ registry, events: new EventBus(), model });
    const result = await runtime.run({ role: "cr3_agent", goal: "Fix f.ts", id: "cr3" });

    assert.equal(result.success, false, "stall => success=false");
    assert.ok(result.budgetUsage.iterations <= 6, `trop d'iterations de stall (${result.budgetUsage.iterations})`);
  });
});
