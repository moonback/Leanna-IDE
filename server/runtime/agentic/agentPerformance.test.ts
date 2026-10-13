/**
 * Tests de non-régression des correctifs de performance des agents :
 *   - isolation des sessions entre exécutions concurrentes (AsyncLocalStorage) ;
 *   - fidélité de l'historique (contenu lu et diagnostics non tronqués) ;
 *   - extraction des tool_calls préfixés / en bloc ```json / volumineux ;
 *   - invalidation du cache de lecture après écriture ;
 *   - finalisation directe depuis le contrat XML <result> (sans appel LLM).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "crypto";

import { ToolRegistry } from "../ToolRegistry.js";
import { PermissionPolicy } from "../PermissionPolicy.js";
import { EventBus } from "../EventBus.js";
import { dynamicAgentRegistry } from "../../agents/DynamicAgentRegistry.js";
import { extractToolCalls } from "../../agents/ToolCallParser.js";
import { parseFinalReport, noteItems, proposedDelegations } from "../../agents/FinalReportParser.js";
import { ResultParser } from "../../agents/ResultParser.js";
import { AgenticRuntime, type GenerateTextFn } from "./AgenticRuntime.js";
import { buildObservationHistory, renderResultForModel } from "./ToolPromptBuilder.js";
import type { Observation } from "./types.js";
import type { VerificationRecord } from "../../agents/WorkspaceState.js";

// ── Outils simulés ───────────────────────────────────────────────────────────

function makeRegistry(files: Map<string, string>, readLog: string[] = []): ToolRegistry {
  const registry = new ToolRegistry({ permissionPolicy: new PermissionPolicy({ mode: "off" }) });
  registry.register({
    declaration: { name: "read_project_file", description: "lit", parameters: { path: "string" } },
    handler: async (a) => {
      readLog.push(String(a.path));
      return { content: files.get(String(a.path)) ?? "", status: "success" };
    },
    permissions: ["read"],
  });
  registry.register({
    declaration: { name: "modify_project_file", description: "modifie", parameters: { path: "string", content: "string" } },
    handler: async (a) => {
      files.set(String(a.path), String(a.content ?? ""));
      return { ok: true };
    },
    permissions: ["write"],
  });
  registry.register({
    declaration: { name: "verify_file", description: "vérifie", parameters: { path: "string" } },
    handler: async (a) => {
      const path = String(a.path);
      const h = createHash("sha256").update(files.get(path) ?? "").digest("hex");
      const verificationRecord: VerificationRecord = {
        file: path, contentHash: h, hashBefore: h, hashAfter: h, verifiedAt: new Date().toISOString(),
        ok: true, status: "success", issues: [], allIssues: [],
      };
      return { status: "success", ok: true, fileChanged: true, verificationRecord };
    },
    permissions: ["read"],
  });
  return registry;
}

function registerAgent(role: string): void {
  dynamicAgentRegistry.registerAgent(
    {
      role,
      name: `Agent ${role}`,
      description: "test",
      capabilities: ["read_project_file", "modify_project_file", "verify_file"],
      systemPrompt: `IDENTITÉ:${role}`,
      maxConcurrency: 2,
      defaultTimeoutMs: 30_000,
    },
    true
  );
}

function reply(text: string): Awaited<ReturnType<GenerateTextFn>> {
  return { text, provider: "gemini", model: "fake", tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PLAN = JSON.stringify({
  intent: "écrire",
  successCriteria: ["fichier écrit"],
  rationale: "r",
  steps: [
    { description: "écrire le fichier", suggestedTools: ["modify_project_file"] },
    { description: "rendre le rapport final" },
  ],
});

const finalXml = (file: string) =>
  `<result status="success" files_modified="${file}">\n<summary>Fichier ${file} écrit.</summary>\n` +
  `<deliverable>ok</deliverable>\n<notes>\n- Preuve : écriture confirmée\n- Relire ${file}\n</notes>\n</result>`;

// ═══════════════════════════════════════════════════════════════════════════

describe("AgenticRuntime — isolation des sessions concurrentes", () => {
  it("deux run() parallèles gardent chacun leur agent, leurs fichiers et leur résultat", async () => {
    registerAgent("perf_alpha");
    registerAgent("perf_beta");
    const files = new Map<string, string>();
    const mismatches: string[] = [];
    let finalCalls = 0;

    const model: GenerateTextFn = (async (opts: { prompt: string; systemPrompt?: string }) => {
      const who = /goal-(alpha|beta)/.exec(opts.prompt)?.[1] ?? "?";
      // Le prompt système doit TOUJOURS être celui de l'agent de la tâche.
      if (opts.systemPrompt && !opts.systemPrompt.includes(`IDENTITÉ:perf_${who}`)) {
        mismatches.push(`${who} a reçu le prompt système d'un autre agent`);
      }
      // Entrelace volontairement les deux exécutions.
      await sleep(who === "alpha" ? 15 : 5);
      if (/Analyse l'intention/.test(opts.prompt)) return reply(PLAN);
      if (/synthèse finale/i.test(opts.prompt)) {
        finalCalls++;
        return reply("{}");
      }
      const file = `${who}.ts`;
      if (opts.prompt.includes("modify_project_file(")) return reply(finalXml(file));
      return reply(JSON.stringify({ tool_calls: [{ name: "modify_project_file", parameters: { path: file, content: who } }] }));
    }) as GenerateTextFn;

    const runtime = new AgenticRuntime({ registry: makeRegistry(files), events: new EventBus(), model });
    const traces: string[][] = [];
    const [a, b] = await Promise.all([
      runtime.run({
        role: "perf_alpha", goal: "goal-alpha", id: "task-alpha",
        onTrace: (t) => traces.push(t.steps.map((s) => s.status)),
      }),
      runtime.run({ role: "perf_beta", goal: "goal-beta", id: "task-beta" }),
    ]);

    assert.deepEqual(mismatches, []);
    assert.equal(a.role, "perf_alpha");
    assert.equal(b.role, "perf_beta");
    assert.deepEqual(a.filesModified, ["alpha.ts"]);
    assert.deepEqual(b.filesModified, ["beta.ts"]);
    assert.equal(a.success, true, a.error);
    assert.equal(b.success, true, b.error);
    // Finalisation lue depuis le contrat XML : aucun appel LLM de synthèse.
    assert.equal(finalCalls, 0);
    // Trace en direct : plan publié puis étapes cochées au fil de l'eau.
    assert.deepEqual(traces[0], ["pending", "pending"]);
    assert.deepEqual(traces.at(-1), ["done", "done"]);
    assert.equal(a.final.summary, "Fichier alpha.ts écrit.");
    assert.deepEqual(a.final.suggestions, ["Preuve : écriture confirmée", "Relire alpha.ts"]);
  });
});

describe("AgenticRuntime — cache de lecture invalidé après écriture", () => {
  it("relire un fichier modifié renvoie le nouveau contenu", async () => {
    registerAgent("perf_cache");
    const files = new Map([["c.ts", "ANCIEN"]]);
    const readLog: string[] = [];
    let turn = 0;
    let secondRead = "";

    // Plan à 4 étapes : lire → écrire → relire → conclure.
    const plan4 = JSON.stringify({
      intent: "i", successCriteria: ["c"], rationale: "r",
      steps: [1, 2, 3, 4].map((n) => ({ description: `étape ${n}` })),
    });
    const model: GenerateTextFn = (async (opts: { prompt: string }) => {
      if (/Analyse l'intention/.test(opts.prompt)) return reply(plan4);
      turn++;
      if (turn === 1) return reply(JSON.stringify({ tool_calls: [{ name: "read_project_file", parameters: { path: "c.ts" } }] }));
      if (turn === 2) return reply(JSON.stringify({ tool_calls: [{ name: "modify_project_file", parameters: { path: "c.ts", content: "NOUVEAU" } }] }));
      if (turn === 3) return reply(JSON.stringify({ tool_calls: [{ name: "read_project_file", parameters: { path: "c.ts" } }] }));
      secondRead = opts.prompt;
      return reply(finalXml("c.ts"));
    }) as GenerateTextFn;

    const runtime = new AgenticRuntime({ registry: makeRegistry(files, readLog), events: new EventBus(), model });
    const res = await runtime.run({ role: "perf_cache", goal: "g", id: "task-cache" });
    const reread = res.observations[2]?.toolOutcomes[0];
    assert.equal(reread?.invocation.name, "read_project_file");
    assert.notEqual(reread?.cached, true, "la relecture après écriture ne doit pas venir du cache");
    assert.equal(readLog.filter((p) => p === "c.ts").length, 2, "les deux lectures atteignent le handler");
    assert.match(secondRead, /NOUVEAU/);
    assert.match(secondRead, /PLAN \(étape 4\/4\)/);
  });
});

describe("buildObservationHistory — fidélité des tours récents", () => {
  const big = "x".repeat(5_000) + "FIN_DU_FICHIER";
  const obs = (iteration: number, result: unknown): Observation => ({
    iteration,
    reasoning: "",
    isFinal: false,
    toolOutcomes: [{ invocation: { name: "read_project_file", parameters: { path: "f.ts" } }, success: true, result, durationMs: 1 }],
  });

  it("le dernier tour expose le contenu lu au-delà de 500 caractères", () => {
    const history = buildObservationHistory([obs(1, { content: big })], 60_000);
    assert.match(history, /FIN_DU_FICHIER/);
  });

  it("les tours anciens restent compacts et les plus anciens sont omis en premier", () => {
    const many = Array.from({ length: 6 }, (_, i) => obs(i + 1, { content: big }));
    const history = buildObservationHistory(many, 12_000);
    assert.ok(history.length < 14_000, `historique borné (${history.length})`);
    assert.match(history, /Tour 6/);
  });

  it("les diagnostics structurés passent avant stdout, qui est omis", () => {
    const rendered = renderResultForModel(
      { stdout: "bruit ".repeat(500), status: "failed", parsedErrors: [{ file: "a.ts", line: 3, message: "TS2322" }] },
      400
    );
    assert.match(rendered, /TS2322/);
    assert.doesNotMatch(rendered, /bruit/);
  });
});

describe("extractToolCalls — formats tolérés", () => {
  const longContent = "y".repeat(6_000);
  const payload = JSON.stringify({ tool_calls: [{ name: "write_project_file", parameters: { path: "a.md", content: longContent } }] });

  it("bloc ```json avec un contenu de plus de 2 000 caractères", () => {
    const calls = extractToolCalls("```json\n" + payload + "\n```");
    assert.equal(calls.length, 1);
    assert.equal((calls[0].parameters.content as string).length, 6_000);
  });

  it("JSON précédé d'une ligne « Pensée : … »", () => {
    const calls = extractToolCalls(`Pensée : j'écris le fichier.\n${payload}`);
    assert.equal(calls[0]?.name, "write_project_file");
  });
});

describe("FinalReportParser — contrat XML", () => {
  const text =
    "brouillon\n" + finalXml("x.ts").replace('status="success"', 'status="failed"') +
    "\n\n## Délégation\n- CIBLE: tester\n- RAISON: couvrir x.ts par des tests\n- FICHIERS: x.ts\n";

  it("parse statut, résumé, notes et fichiers", () => {
    const report = parseFinalReport(text);
    assert.equal(report?.status, "failed");
    assert.equal(report?.summary, "Fichier x.ts écrit.");
    assert.deepEqual(report?.filesModified, ["x.ts"]);
    assert.deepEqual(noteItems(report!.notes), ["Preuve : écriture confirmée", "Relire x.ts"]);
  });

  it("extrait les blocs ## Délégation en délégations structurées", () => {
    assert.deepEqual(proposedDelegations(text, "coder"), [
      { role: "tester", reason: "couvrir x.ts par des tests", files: ["x.ts"] },
    ]);
  });

  it("ResultParser (legacy) lit le contrat XML", () => {
    const parser = new ResultParser();
    assert.equal(parser.extractSummary(text), "Fichier x.ts écrit.");
    assert.match(parser.detectFailure(text) ?? "", /échec/);
  });

  it("retourne null sans bloc <result>", () => {
    assert.equal(parseFinalReport("## Résumé\nrien"), null);
  });
});
