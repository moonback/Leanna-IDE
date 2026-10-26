import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontMatter } from "./loader.js";

test("parseFrontMatter() — conserve le statut reference sans activer implicitement un scope", () => {
  const parsed = parseFrontMatter(
    "<!-- category: system, status: reference, priority: 13 -->\nRéférence consolidée.",
  );

  assert.equal(parsed.status, "reference");
  assert.equal(parsed.category, "system");
  assert.equal(parsed.priority, 13);
  assert.equal(parsed.content, "Référence consolidée.");
  assert.equal(parsed.scope, undefined);
});

test("parseFrontMatter() — continue de parser les métadonnées normales", () => {
  const parsed = parseFrontMatter(
    "<!-- category: system, scope: full coding, priority: 70, requires: safety.core authority.workspace -->\nContenu actif.",
  );

  assert.equal(parsed.status, undefined);
  assert.deepEqual(parsed.scope, ["full", "coding"]);
  assert.equal(parsed.priority, 70);
  assert.deepEqual(parsed.requires, ["safety.core", "authority.workspace"]);
  assert.equal(parsed.content, "Contenu actif.");
});
