/**
 * Tests SystemPromptBuilder — ordre d'assemblage, conflits et reproductibilité.
 *
 * Complète les tests d'attaque (C2/C3/C4) en couvrant le comportement nominal
 * du pipeline complet : déterminisme du build, ordre des blocs rendus, présence
 * des garde-fous et stabilité du résultat d'un build à l'autre.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { SystemPromptBuilder } from "./SystemPromptBuilder.js";
import { RulePriority } from "./types/rules.js";

/** Un builder prêt à l'emploi (templates .md chargés via le résolveur par défaut). */
function builder(): SystemPromptBuilder {
  const b = new SystemPromptBuilder();
  b.loadTemplates();
  return b;
}

test("build() — reproductible : deux builds identiques produisent le même contenu", () => {
  const b = builder();
  const first = b.build({ mode: "full", taskType: "coding" });
  const second = b.build({ mode: "full", taskType: "coding" });
  assert.equal(first, second, "le build doit être déterministe pour une même config");
});

test("buildFull() — les règles sont triées par priorité croissante (P0 avant P7)", () => {
  const b = builder();
  const built = b.buildFull({ mode: "full", taskType: "coding" });
  const priorities = built.rules.map(r => r.priority);
  const sorted = [...priorities].sort((a, z) => a - z);
  assert.deepEqual(priorities, sorted, "les règles doivent être ordonnées par priorité");
});

test("buildFull() — un garde-fou P0 (SAFETY) est toujours présent", () => {
  const b = builder();
  const built = b.buildFull({ mode: "full", taskType: "coding" });
  assert.ok(
    built.rules.some(r => r.priority === RulePriority.SAFETY),
    "au moins une règle P0 doit survivre au pipeline",
  );
});

test("buildFull() — ordre des blocs : <policy> précède <instructions>", () => {
  const b = builder();
  const { content } = b.buildFull({ mode: "full", taskType: "coding" });
  const policyAt = content.indexOf("<policy>");
  const instrAt = content.indexOf("<instructions>");
  assert.ok(policyAt >= 0, "le bloc <policy> doit exister");
  if (instrAt >= 0) {
    assert.ok(policyAt < instrAt, "<policy> doit précéder <instructions>");
  }
});

test("buildFull() — le contenu runtime (extraSections) est confiné en dernier", () => {
  const b = builder();
  const { content } = b.buildFull({
    mode: "full",
    taskType: "coding",
    extraSections: [{ id: "runtime-note", content: "donnée arbitraire du runtime" }],
  });
  const policyAt = content.indexOf("<policy>");
  const untrustedAt = content.indexOf("<untrusted_context>");
  assert.ok(untrustedAt >= 0, "le contexte non fiable doit être présent");
  assert.ok(policyAt < untrustedAt, "les données runtime doivent venir après la politique");
});

test("buildFull() — métadonnées cohérentes avec les tableaux retournés", () => {
  const b = builder();
  const built = b.buildFull({ mode: "ask", taskType: "document" });
  assert.equal(built.metadata.ruleCount, built.rules.length);
  assert.equal(built.metadata.sectionCount, built.sections.length);
  assert.equal(built.metadata.conflictCount, built.conflicts.length);
  assert.equal(built.metadata.mode, "ask");
  assert.equal(built.metadata.taskType, "document");
});

test("buildFull() — le provider par défaut masque les directives spécifiques Gemini sur openrouter", () => {
  const b = builder();
  const gemini = b.buildFull({ mode: "full", taskType: "coding", textProvider: "gemini" });
  const openrouter = b.buildFull({ mode: "full", taskType: "coding", textProvider: "openrouter" });
  const hasGeminiSection = (built: typeof gemini) =>
    built.sections.some(s => s.id === "gemini-reasoning");
  assert.ok(hasGeminiSection(gemini), "la section gemini-reasoning doit apparaître sur gemini");
  assert.ok(!hasGeminiSection(openrouter), "elle doit être masquée sur openrouter");
});

test("build() — mode ask et mode full produisent des prompts différents", () => {
  const b = builder();
  const ask = b.build({ mode: "ask" });
  const full = b.build({ mode: "full" });
  assert.notEqual(ask, full, "les deux modes doivent diverger");
});

test("build() — la section Proactivité est chargée dans tous les modes (scope global)", () => {
  const b = builder();
  for (const mode of ["full", "ask"] as const) {
    const content = b.build({ mode, taskType: "coding" });
    assert.ok(content.includes("<initiative_levels>"), `section proactivité absente en mode ${mode}`);
    assert.ok(content.includes("<proactive_limits>"), `garde-fous de proactivité absents en mode ${mode}`);
  }
});
