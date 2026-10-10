/**
 * Tests ContextResolver — données injectées dans le contexte et leur provenance.
 *
 * Complète attack-context-resolver.test.ts (C8/C10) en couvrant les valeurs
 * par défaut (provider, aiName, agents.enabled), le passage des outils (hors
 * type SystemPromptConfig) et le marquage `untrusted` des extraSections.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { ContextResolver } from "./ContextResolver.js";

test("resolve() — config vide : valeurs par défaut saines", () => {
  const r = new ContextResolver();
  const ctx = r.resolve({});
  assert.equal(ctx.mode, "full");
  assert.equal(ctx.taskType, "general");
  assert.equal(ctx.taskTypeInferred, true, "sans taskType ni mode ask, le type est déduit");
  assert.equal(ctx.provider, "gemini", "défaut historique : gemini");
  assert.equal(ctx.aiName, "Leanna");
  assert.equal(ctx.agents.enabled, true, "agents activés par défaut");
});

test("resolve() — provider explicite est préservé", () => {
  const r = new ContextResolver();
  assert.equal(r.resolve({ textProvider: "openrouter" }).provider, "openrouter");
  assert.equal(r.resolve({ textProvider: "gemini" }).provider, "gemini");
});

test("resolve() — taskType explicite n'est pas marqué inféré", () => {
  const r = new ContextResolver();
  const ctx = r.resolve({ taskType: "debugging" });
  assert.equal(ctx.taskType, "debugging");
  assert.equal(ctx.taskTypeInferred, false);
});

test("resolve() — mode ask déduit taskType document (sans effet de bord)", () => {
  const r = new ContextResolver();
  const ctx = r.resolve({ mode: "ask" });
  assert.equal(ctx.taskType, "document");
  assert.equal(ctx.taskTypeInferred, true);
});

test("resolve() — agents.enabled=false est respecté", () => {
  const r = new ContextResolver();
  assert.equal(r.resolve({ agents: { enabled: false } }).agents.enabled, false);
});

test("resolve() — rôles inconnus filtrés, rôles valides conservés (C10)", () => {
  const r = new ContextResolver();
  const ctx = r.resolve({
    agents: { enabled: true, allowedRoles: ["coder", "intrus" as any, "tester"] },
  });
  assert.deepEqual(ctx.agents.allowedRoles, ["coder", "tester"]);
});

test("resolve() — allowedRoles absent → undefined (aucune restriction)", () => {
  const r = new ContextResolver();
  assert.equal(r.resolve({ agents: { enabled: true } }).agents.allowedRoles, undefined);
});

test("resolve() — provenance des outils : passés via config.tools, défaut []", () => {
  const r = new ContextResolver();
  const empty = r.resolve({});
  assert.deepEqual(empty.tools.available, []);
  assert.deepEqual(empty.tools.enabled, []);

  // tools n'est pas dans SystemPromptConfig mais lu par le resolver.
  const withTools = r.resolve({ tools: { available: ["browser_navigate"], enabled: ["browser_navigate"] } } as any);
  assert.deepEqual(withTools.tools.available, ["browser_navigate"]);
});

test("resolve() — extraSections marquées 'untrusted' (données runtime hostiles)", () => {
  const r = new ContextResolver();
  const ctx = r.resolve({ extraSections: [{ id: "note", content: "contenu runtime" }] });
  assert.equal(ctx.extraSections?.length, 1);
  assert.equal(ctx.extraSections?.[0].authority, "untrusted");
  assert.equal(ctx.extraSections?.[0].id, "note");
});

test("resolve() — userName/userRole/workspace passés tels quels (données)", () => {
  const r = new ContextResolver();
  const ctx = r.resolve({ userName: "Mayss", userRole: "dev", workspace: "/w" });
  assert.equal(ctx.userName, "Mayss");
  assert.equal(ctx.userRole, "dev");
  assert.equal(ctx.workspace, "/w");
});
