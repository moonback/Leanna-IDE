/**
 * Tests PolicyValidator — configurations invalides et démarrage sécurisé.
 *
 * Complète attack-policy-validator.test.ts (codes critiques) en couvrant les
 * codes d'avertissement, le mode "warn" non bloquant, et le fail-closed du
 * mode "strict" (throw sur problème critique).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { PolicyValidator } from "./PolicyValidator.js";
import { RulePriority, type PromptRule } from "./types/rules.js";
import type { PromptSection } from "./types/builder.js";

function rule(partial: Partial<PromptRule> & { id: string }): PromptRule {
  return { priority: RulePriority.TOOLS, scope: ["global"], content: partial.id, ...partial };
}

/** Un socle minimal valide : un P0 et un P1 immuables, aucun conflit. */
function baselineRules(): PromptRule[] {
  return [
    rule({ id: "safety.core", priority: RulePriority.SAFETY, immutable: true }),
    rule({ id: "authority.core", priority: RulePriority.AUTHORITY, immutable: true }),
  ];
}

function codes(result: { issues: { code: string }[] }): string[] {
  return result.issues.map(i => i.code);
}

test("validate() — socle minimal valide : ok=true, aucun critique", () => {
  const v = new PolicyValidator();
  const result = v.validate({ rules: baselineRules(), sections: [] });
  assert.equal(result.ok, true);
  assert.equal(result.critical.length, 0);
});

test("validate() — conflictsWith vers un ID inconnu → warning UNKNOWN_CONFLICTS_WITH", () => {
  const v = new PolicyValidator();
  const rules = [...baselineRules(), rule({ id: "x", conflictsWith: ["inexistant"] })];
  const result = v.validate({ rules, sections: [] });
  assert.ok(codes(result).includes("UNKNOWN_CONFLICTS_WITH"));
  assert.equal(result.ok, true, "un conflit vers un ID inconnu reste non bloquant (warning)");
});

test("validate() — garde-fou P0/P1 non immuable → warning MUTABLE_GUARDRAIL", () => {
  const v = new PolicyValidator();
  const rules = [
    rule({ id: "safety.core", priority: RulePriority.SAFETY }), // pas d'immutable
    rule({ id: "authority.core", priority: RulePriority.AUTHORITY, immutable: true }),
  ];
  const result = v.validate({ rules, sections: [] });
  assert.ok(codes(result).includes("MUTABLE_GUARDRAIL"));
});

test("validate() — section.requires vers une règle inconnue → warning SECTION_UNKNOWN_REQUIRES", () => {
  const v = new PolicyValidator();
  const sections: PromptSection[] = [{ id: "s", content: "x", requires: ["regle.absente"] }];
  const result = v.validate({ rules: baselineRules(), sections });
  assert.ok(codes(result).includes("SECTION_UNKNOWN_REQUIRES"));
});

test("validate() — section critique absente → critique MISSING_CRITICAL_SECTION, ok=false", () => {
  const v = new PolicyValidator();
  const result = v.validate({
    rules: baselineRules(),
    sections: [{ id: "base", content: "x" }],
    criticalSectionIds: ["base", "safety"], // "safety" manquante
  });
  assert.ok(codes(result).includes("MISSING_CRITICAL_SECTION"));
  assert.equal(result.ok, false);
});

test("assert() — mode warn ne lève jamais, même avec un problème critique", () => {
  const v = new PolicyValidator();
  // Aucun P0/P1 → MISSING_P0 + MISSING_P1 (critiques).
  assert.doesNotThrow(() => v.assert({ rules: [], sections: [] }, "warn"));
});

test("assert() — mode strict lève (fail-closed) sur problème critique", () => {
  const v = new PolicyValidator();
  assert.throws(
    () => v.assert({ rules: [], sections: [] }, "strict"),
    /fail-closed/i,
    "le mode strict doit refuser une politique sans garde-fou",
  );
});

test("assert() — mode strict ne lève pas quand la politique est saine", () => {
  const v = new PolicyValidator();
  assert.doesNotThrow(() =>
    v.assert({ rules: baselineRules(), sections: [{ id: "base", content: "x" }], criticalSectionIds: ["base"] }, "strict"),
  );
});
