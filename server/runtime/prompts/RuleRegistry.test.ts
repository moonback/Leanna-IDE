/**
 * Tests RuleRegistry — règles dupliquées, obsolètes ou non chargées.
 *
 * Complète attack-rule-tamper.test.ts (C2 : immutabilité après seal) en
 * couvrant le stockage, le refus de doublon, les lectures filtrées (byPriority,
 * byScope), et override/unregister sur règles mutables.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { RuleRegistry } from "./RuleRegistry.js";
import { RulePriority, type PromptRule } from "./types/rules.js";

function rule(partial: Partial<PromptRule> & { id: string }): PromptRule {
  return { priority: RulePriority.TOOLS, scope: ["global"], content: partial.id, ...partial };
}

test("register() — stocke et expose la règle", () => {
  const reg = new RuleRegistry();
  reg.register(rule({ id: "a" }));
  assert.equal(reg.has("a"), true);
  assert.equal(reg.get("a")?.id, "a");
  assert.equal(reg.size, 1);
});

test("register() — refuse un ID dupliqué (bug de configuration)", () => {
  const reg = new RuleRegistry();
  reg.register(rule({ id: "dup" }));
  assert.throws(() => reg.register(rule({ id: "dup" })), /dupliquée/i);
});

test("registerAll() — enregistre plusieurs règles", () => {
  const reg = new RuleRegistry();
  reg.registerAll([rule({ id: "a" }), rule({ id: "b" })]);
  assert.deepEqual(reg.all().map(r => r.id).sort(), ["a", "b"]);
});

test("byPriority() — filtre par priorité numérique", () => {
  const reg = new RuleRegistry();
  reg.registerAll([
    rule({ id: "p0", priority: RulePriority.SAFETY }),
    rule({ id: "p7", priority: RulePriority.STYLE }),
    rule({ id: "p0b", priority: RulePriority.SAFETY }),
  ]);
  assert.deepEqual(reg.byPriority(RulePriority.SAFETY).map(r => r.id).sort(), ["p0", "p0b"]);
  assert.deepEqual(reg.byPriority(RulePriority.STYLE).map(r => r.id), ["p7"]);
});

test("byScope() — filtre par scope déclaré", () => {
  const reg = new RuleRegistry();
  reg.registerAll([
    rule({ id: "g", scope: ["global"] }),
    rule({ id: "c", scope: ["coding"] }),
    rule({ id: "both", scope: ["global", "coding"] }),
  ]);
  assert.deepEqual(reg.byScope("coding").map(r => r.id).sort(), ["both", "c"]);
});

test("override() — remplace une règle mutable (registre non scellé)", () => {
  const reg = new RuleRegistry();
  reg.register(rule({ id: "x", content: "ancien" }));
  reg.override(rule({ id: "x", content: "nouveau" }));
  assert.equal(reg.get("x")?.content, "nouveau");
  assert.equal(reg.size, 1);
});

test("unregister() — supprime une règle mutable et renvoie true/false", () => {
  const reg = new RuleRegistry();
  reg.register(rule({ id: "x" }));
  assert.equal(reg.unregister("x"), true);
  assert.equal(reg.has("x"), false);
  assert.equal(reg.unregister("absente"), false, "supprimer une règle absente renvoie false");
});

test("get()/has() — règle non chargée renvoie undefined/false", () => {
  const reg = new RuleRegistry();
  assert.equal(reg.get("fantome"), undefined);
  assert.equal(reg.has("fantome"), false);
});

test("seal() — après scellement, une règle immuable ne peut être ni override ni supprimée", () => {
  const reg = new RuleRegistry();
  reg.register(rule({ id: "safety.core", priority: RulePriority.SAFETY, immutable: true }));
  reg.register(rule({ id: "ext", immutable: false }));
  reg.seal();
  assert.equal(reg.isSealed, true);
  assert.throws(() => reg.override(rule({ id: "safety.core", immutable: true })), /immuable/i);
  assert.throws(() => reg.unregister("safety.core"), /immuable/i);
  // Une règle mutable reste modifiable après seal.
  assert.doesNotThrow(() => reg.override(rule({ id: "ext", content: "maj" })));
  assert.equal(reg.unregister("ext"), true);
});
