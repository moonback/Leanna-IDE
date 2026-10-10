/**
 * Tests ConflictResolver — conflits multiples, dépendances en cascade et
 * égalités de priorité.
 *
 * Complète attack-conflict-resolver.test.ts (C5) en couvrant la phase 2
 * (requires manquants → élimination en cascade), les conflits multiples
 * simultanés et le journal de conflits produit.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { ConflictResolver } from "./ConflictResolver.js";
import { RulePriority, type PromptRule } from "./types/rules.js";

function rule(partial: Partial<PromptRule> & { id: string }): PromptRule {
  return { priority: RulePriority.TOOLS, scope: ["global"], content: partial.id, ...partial };
}

test("resolve() — sans conflit, toutes les règles survivent", () => {
  const r = new ConflictResolver();
  const out = r.resolve([rule({ id: "a" }), rule({ id: "b" }), rule({ id: "c" })]);
  assert.deepEqual(out.rules.map(x => x.id).sort(), ["a", "b", "c"]);
  assert.equal(out.conflicts.length, 0);
});

test("resolve() — priorité plus forte gagne et le conflit est journalisé", () => {
  const r = new ConflictResolver();
  const strong = rule({ id: "strong", priority: RulePriority.SAFETY, conflictsWith: ["weak"] });
  const weak = rule({ id: "weak", priority: RulePriority.STYLE, conflictsWith: ["strong"] });
  const out = r.resolve([weak, strong]);
  assert.ok(out.rules.some(x => x.id === "strong"));
  assert.ok(!out.rules.some(x => x.id === "weak"));
  const conflict = out.conflicts.find(c => c.winner === "strong");
  assert.ok(conflict, "le conflit gagné par strong doit être journalisé");
  assert.match(conflict!.reason, /Priorité/);
});

test("resolve() — phase 2 : une règle dont le requires a été éliminé est retirée en cascade", () => {
  const r = new ConflictResolver();
  // base perd un conflit contre killer ; dependent requiert base → doit tomber aussi.
  const killer = rule({ id: "killer", priority: RulePriority.SAFETY, conflictsWith: ["base"] });
  const base = rule({ id: "base", priority: RulePriority.STYLE, conflictsWith: ["killer"] });
  const dependent = rule({ id: "dependent", requires: ["base"] });

  const out = r.resolve([killer, base, dependent]);
  const survivors = out.rules.map(x => x.id).sort();
  assert.deepEqual(survivors, ["killer"], "base éliminé par conflit, dependent par dépendance manquante");

  const depConflict = out.conflicts.find(c => c.ruleA === "dependent");
  assert.ok(depConflict, "un conflit de dépendance manquante doit être journalisé");
  assert.equal(depConflict!.winner, undefined, "une dépendance manquante n'a pas de gagnant");
  assert.match(depConflict!.reason, /Dépendance manquante/);
});

test("resolve() — requires manquant dès le départ élimine la règle", () => {
  const r = new ConflictResolver();
  const out = r.resolve([rule({ id: "orphan", requires: ["jamais-présent"] })]);
  assert.equal(out.rules.length, 0);
  assert.ok(out.conflicts.some(c => c.ruleA === "orphan" && c.winner === undefined));
});

test("resolve() — conflits multiples : une règle forte en élimine plusieurs", () => {
  const r = new ConflictResolver();
  const boss = rule({ id: "boss", priority: RulePriority.SAFETY, conflictsWith: ["x", "y"] });
  const x = rule({ id: "x", priority: RulePriority.TOOLS, conflictsWith: ["boss"] });
  const y = rule({ id: "y", priority: RulePriority.TOOLS, conflictsWith: ["boss"] });
  const out = r.resolve([x, y, boss]);
  assert.deepEqual(out.rules.map(z => z.id), ["boss"]);
  assert.ok(out.conflicts.length >= 2);
});

test("resolve() — déterministe : même entrée dans un ordre différent, même issue", () => {
  const r = new ConflictResolver();
  const a = rule({ id: "a", conflictsWith: ["b"], restrictiveness: 3 });
  const b = rule({ id: "b", conflictsWith: ["a"], restrictiveness: 1 });
  const first = r.resolve([a, b]).rules.map(x => x.id).sort();
  const second = r.resolve([b, a]).rules.map(x => x.id).sort();
  assert.deepEqual(first, second);
  assert.deepEqual(first, ["a"], "le plus restrictif survit");
});
