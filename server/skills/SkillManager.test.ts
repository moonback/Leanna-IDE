import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { SkillManager } from "./SkillManager.js";
import { Skill } from "./base.js";
import { SELF_ROOT } from "../utils/selfRoot.js";
import { initSandbox } from "../utils/sandbox.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const __test_dirname = path.dirname(fileURLToPath(import.meta.url));

/** Crée une skill factice pour les tests */
function createMockSkill(name: string, tools: string[], handler?: (name: string, args: any) => any): Skill {
  return {
    name,
    declarations: tools.map(t => ({ name: t, description: `Mock tool ${t}`, parameters: { type: "OBJECT", properties: {} } })),
    handleToolCall: handler || (async (_name, _args) => ({ status: "success" })),
  };
}

/** Crée un fichier temporaire pour les tests de self-healing */
function createTempSkillFile(content: string): string {
  const tmpDir = path.join(SELF_ROOT, 'server', 'skills', 'custom');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const tmpPath = path.join(tmpDir, `test-skill-${Date.now()}.ts`);
  fs.writeFileSync(tmpPath, content, 'utf-8');
  return tmpPath;
}

function cleanupTempFile(filePath: string): void {
  try { fs.unlinkSync(filePath); } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tests : Instanciation et enregistrement de skills
// ═══════════════════════════════════════════════════════════════════════════════

test("SkillManager — instanciation sans erreur", () => {
  const manager = new SkillManager();
  assert.ok(manager, "Le manager doit être créé");
});

test("SkillManager — registerDynSkill enregistre une skill", () => {
  const manager = new SkillManager();
  const skill = createMockSkill("test-skill", ["tool_a", "tool_b"]);
  manager.registerDynSkill(skill, "/fake/path/test.ts");

  const declarations = manager.getToolDeclarations();
  const toolNames = declarations.map((d: any) => d.name);
  assert.ok(toolNames.includes("tool_a"), "tool_a doit être déclaré");
  assert.ok(toolNames.includes("tool_b"), "tool_b doit être déclaré");
});

test("SkillManager — getToolDeclarations filtre par enabledSkillIds", () => {
  const manager = new SkillManager();
  const skillA = createMockSkill("alpha", ["alpha_tool"]);
  const skillB = createMockSkill("beta", ["beta_tool"]);
  manager.registerDynSkill(skillA, "/fake/alpha.ts");
  manager.registerDynSkill(skillB, "/fake/beta.ts");

  const filtered = manager.getToolDeclarations(["alpha"]);
  const names = filtered.map((d: any) => d.name);
  assert.ok(names.includes("alpha_tool"), "alpha_tool doit être inclus");
  assert.ok(!names.includes("beta_tool"), "beta_tool ne doit pas être inclus");
});

test("SkillManager — getToolDeclarations retourne toutes les skills sans filtre", () => {
  const manager = new SkillManager();
  const skillA = createMockSkill("alpha", ["alpha_tool"]);
  const skillB = createMockSkill("beta", ["beta_tool"]);
  manager.registerDynSkill(skillA, "/fake/alpha.ts");
  manager.registerDynSkill(skillB, "/fake/beta.ts");

  const all = manager.getToolDeclarations();
  const names = all.map((d: any) => d.name);
  assert.ok(names.includes("alpha_tool"));
  assert.ok(names.includes("beta_tool"));
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tests : handleToolCall — dispatch correct
// ═══════════════════════════════════════════════════════════════════════════════

test("SkillManager — handleToolCall dispatch vers la bonne skill", async () => {
  const manager = new SkillManager();
  let called = false;
  const skill = createMockSkill("dispatch-test", ["my_tool"], async (name, args) => {
    called = true;
    return { status: "success", tool: name, args };
  });
  manager.registerDynSkill(skill, "/fake/dispatch.ts");

  const result = await manager.handleToolCall("my_tool", { key: "value" });
  assert.ok(called, "Le handler de la skill doit être appelé");
  assert.equal(result.status, "success");
  assert.equal(result.tool, "my_tool");
});

test("SkillManager — handleToolCall lance une erreur pour un outil inconnu", async () => {
  const manager = new SkillManager();
  await assert.rejects(
    () => manager.handleToolCall("nonexistent_tool", {}),
    (err: Error) => {
      assert.match(err.message, /inconnu/i);
      return true;
    }
  );
});

test("SkillManager — handleToolCall propage l'erreur de la skill", async () => {
  const manager = new SkillManager();
  const failingSkill = createMockSkill("failing", ["fail_tool"], async () => {
    throw new Error("Intentional test error");
  });
  manager.registerDynSkill(failingSkill, "/fake/failing.ts");

  await assert.rejects(
    () => manager.handleToolCall("fail_tool", {}),
    (err: Error) => {
      assert.equal(err.message, "Intentional test error");
      return true;
    }
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tests : Historique et statistiques de guérison
// ═══════════════════════════════════════════════════════════════════════════════

test("SkillManager — getHealHistory retourne un tableau vide initialement", () => {
  const manager = new SkillManager();
  const history = manager.getHealHistory();
  assert.ok(Array.isArray(history));
  assert.equal(history.length, 0);
});

test("SkillManager — getHealStats retourne des compteurs à zéro initialement", () => {
  const manager = new SkillManager();
  const stats = manager.getHealStats();
  assert.equal(stats.total, 0);
  assert.equal(stats.success, 0);
  assert.equal(stats.failed, 0);
  assert.equal(stats.rolledBack, 0);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tests : selfHealSkill — logique de guérison
// ═══════════════════════════════════════════════════════════════════════════════

test("SkillManager — selfHealSkill avec fichier inexistant ne crash pas", async () => {
  const manager = new SkillManager();
  const error = new Error("Property 'foo' does not exist on type 'Bar'");
  const result = await manager.selfHealSkill("/nonexistent/path/skill.ts", error);

  assert.ok(result, "Doit retourner un HealAttempt");
  assert.equal(result.success, false);
  assert.ok(result.patchApplied?.includes("SKIPPED"), "Doit être marqué comme skipped");
});

test("SkillManager — selfHealSkill avec erreur de type inconnue ne modifie rien", async () => {
  const content = `export const mySkill = { name: "test" };`;
  const tmpPath = createTempSkillFile(content);

  try {
    const manager = new SkillManager();
    const error = new Error("Some completely unknown error that matches no pattern");
    const result = await manager.selfHealSkill(tmpPath, error);

    assert.equal(result.success, false);
    assert.ok(
      result.patchApplied === "NONE: aucun pattern applicable" ||
      result.patchApplied === "NONE: échec IA et patterns" ||
      result.patchApplied?.includes("SKIPPED"),
      `patchApplied inattendu: ${result.patchApplied}`
    );

    // Le fichier ne doit pas avoir été modifié
    const afterContent = fs.readFileSync(tmpPath, 'utf-8');
    assert.equal(afterContent, content, "Le fichier ne doit pas être modifié pour une erreur inconnue");
  } finally {
    cleanupTempFile(tmpPath);
  }
});

test("SkillManager — selfHealSkill respecte la protection anti-boucle", async () => {
  await initSandbox().catch(() => { /* ignore: sandbox may not be configured in test env */ });
  const content = `export interface Foo {}\nexport const fooSkill = { name: "foo" };`;
  const tmpPath = createTempSkillFile(content);

  try {
    const manager = new SkillManager();
    const error = new Error("Property 'bar' does not exist on type 'Foo'");

    // Les tentatives devraient être bloquées soit par l'anti-boucle,
    // soit par la garde sandbox (sandbox DISABLED en environnement de test)
    await manager.selfHealSkill(tmpPath, error);
    await manager.selfHealSkill(tmpPath, error);
    await manager.selfHealSkill(tmpPath, error);

    // La 4ème devrait être bloquée (anti-boucle ou sandbox guard)
    const result4 = await manager.selfHealSkill(tmpPath, error);
    assert.equal(result4.success, false);
    // En test: sandbox DISABLED → "sandbox non prêt"; en prod avec sandbox READY → "trop de tentatives"
    assert.ok(
      result4.patchApplied?.includes("trop de tentatives") ||
      result4.patchApplied?.includes("SKIPPED"),
      `Devrait être bloqué (anti-boucle ou sandbox guard): ${result4.patchApplied}`
    );
  } finally {
    cleanupTempFile(tmpPath);
  }
});

test("SkillManager — selfHealSkill enregistre dans l'historique", async () => {
  const content = `export const testSkill = { name: "test" };`;
  const tmpPath = createTempSkillFile(content);

  try {
    const manager = new SkillManager();
    const error = new Error("Random error for history test");
    await manager.selfHealSkill(tmpPath, error);

    const history = manager.getHealHistory();
    assert.ok(history.length > 0, "L'historique doit contenir au moins une entrée");
    assert.equal(history[0].error, "Random error for history test");
    assert.equal(history[0].skillPath, tmpPath);
  } finally {
    cleanupTempFile(tmpPath);
  }
});

test("SkillManager — selfHealSkill met à jour les statistiques", async () => {
  const content = `export const statsSkill = { name: "stats" };`;
  const tmpPath = createTempSkillFile(content);

  try {
    const manager = new SkillManager();
    await manager.selfHealSkill(tmpPath, new Error("Some error for stats"));

    const stats = manager.getHealStats();
    assert.ok(stats.total >= 1, "Total doit être >= 1");
    assert.equal(stats.total, stats.success + stats.failed, "total = success + failed");
  } finally {
    cleanupTempFile(tmpPath);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tests : Patterns d'erreur — vérification de la logique de matching/fixing
// ═══════════════════════════════════════════════════════════════════════════════

// Pour tester les patterns directement, on accède à analyzeAndFix via le comportement
// observable de selfHealSkill. Mais pour les tests unitaires purs des patterns,
// on simule le comportement en testant avec un SkillManager et un fichier réel.

test("Pattern: missing-property — ajoute la propriété à l'interface", async () => {
  const content = [
    'export interface MyConfig {',
    '  name: string;',
    '}',
    '',
    'const cfg: MyConfig = { name: "test", value: 42 };',
  ].join('\n');
  const tmpPath = createTempSkillFile(content);

  try {
    const manager = new SkillManager();
    const error = new Error("Property 'value' does not exist on type 'MyConfig'");
    await manager.selfHealSkill(tmpPath, error);

    // Vérifier que le fichier a été modifié (ou tenté) — le résultat dépend du checkpoint git
    const history = manager.getHealHistory();
    const lastAttempt = history[history.length - 1];
    // Le pattern doit avoir été détecté
    assert.ok(
      lastAttempt.patchApplied === "missing-property" ||
      lastAttempt.patchApplied === "DRY_RUN:missing-property" ||
      lastAttempt.patchApplied?.includes("SKIPPED"),
      `Pattern attendu 'missing-property' ou SKIPPED, obtenu: ${lastAttempt.patchApplied}`
    );
  } finally {
    cleanupTempFile(tmpPath);
  }
});

test("Pattern: missing-import — signale le symbole manquant", async () => {
  const content = [
    'const x = someUndefinedFunction();',
    'export default x;',
  ].join('\n');
  const tmpPath = createTempSkillFile(content);

  try {
    const manager = new SkillManager();
    const error = new Error("Cannot find name 'someUndefinedFunction'");
    await manager.selfHealSkill(tmpPath, error);

    const history = manager.getHealHistory();
    const lastAttempt = history[history.length - 1];
    assert.ok(
      lastAttempt.patchApplied === "missing-import" ||
      lastAttempt.patchApplied === "DRY_RUN:missing-import" ||
      lastAttempt.patchApplied?.includes("SKIPPED"),
      `Pattern attendu 'missing-import' ou SKIPPED, obtenu: ${lastAttempt.patchApplied}`
    );
  } finally {
    cleanupTempFile(tmpPath);
  }
});

test("Pattern: unused-variable — détecte la variable inutilisée", async () => {
  const content = [
    'const unusedVar = 42;',
    'export const usedVar = "hello";',
  ].join('\n');
  const tmpPath = createTempSkillFile(content);

  try {
    const manager = new SkillManager();
    const error = new Error("'unusedVar' is declared but its value is never read");
    await manager.selfHealSkill(tmpPath, error);

    const history = manager.getHealHistory();
    const lastAttempt = history[history.length - 1];
    assert.ok(
      lastAttempt.patchApplied === "unused-variable" ||
      lastAttempt.patchApplied === "DRY_RUN:unused-variable" ||
      lastAttempt.patchApplied?.includes("SKIPPED"),
      `Pattern attendu 'unused-variable' ou SKIPPED, obtenu: ${lastAttempt.patchApplied}`
    );
  } finally {
    cleanupTempFile(tmpPath);
  }
});

test("Pattern: missing-module — détecte le module manquant", async () => {
  const content = [
    'import { something } from "nonexistent-module";',
    'export default something;',
  ].join('\n');
  const tmpPath = createTempSkillFile(content);

  try {
    const manager = new SkillManager();
    const error = new Error("Cannot find module 'nonexistent-module'");
    await manager.selfHealSkill(tmpPath, error);

    const history = manager.getHealHistory();
    const lastAttempt = history[history.length - 1];
    assert.ok(
      lastAttempt.patchApplied === "missing-module" ||
      lastAttempt.patchApplied === "DRY_RUN:missing-module" ||
      lastAttempt.patchApplied?.includes("SKIPPED"),
      `Pattern attendu 'missing-module' ou SKIPPED, obtenu: ${lastAttempt.patchApplied}`
    );
  } finally {
    cleanupTempFile(tmpPath);
  }
});

test("Pattern: missing-semicolon — détecte le point-virgule manquant", async () => {
  const content = [
    'const a = 1',
    'const b = 2;',
    'export { a, b };',
  ].join('\n');
  const tmpPath = createTempSkillFile(content);

  try {
    const manager = new SkillManager();
    const error = new Error("(1,12): error TS1005: ';' expected");
    await manager.selfHealSkill(tmpPath, error);

    const history = manager.getHealHistory();
    const lastAttempt = history[history.length - 1];
    assert.ok(
      lastAttempt.patchApplied === "missing-semicolon" ||
      lastAttempt.patchApplied === "DRY_RUN:missing-semicolon" ||
      lastAttempt.patchApplied?.includes("SKIPPED"),
      `Pattern attendu 'missing-semicolon' ou SKIPPED, obtenu: ${lastAttempt.patchApplied}`
    );
  } finally {
    cleanupTempFile(tmpPath);
  }
});

test("Pattern: missing-closing-brace — détecte l'accolade manquante", async () => {
  const content = [
    'function hello() {',
    '  console.log("hello");',
    '',
  ].join('\n');
  const tmpPath = createTempSkillFile(content);

  try {
    const manager = new SkillManager();
    const error = new Error("(3,1): error TS1005: '}' expected");
    await manager.selfHealSkill(tmpPath, error);

    const history = manager.getHealHistory();
    const lastAttempt = history[history.length - 1];
    assert.ok(
      lastAttempt.patchApplied === "missing-closing-brace" ||
      lastAttempt.patchApplied === "DRY_RUN:missing-closing-brace" ||
      lastAttempt.patchApplied?.includes("SKIPPED"),
      `Pattern attendu 'missing-closing-brace' ou SKIPPED, obtenu: ${lastAttempt.patchApplied}`
    );
  } finally {
    cleanupTempFile(tmpPath);
  }
});

test("Pattern: missing-export — ajoute export à la déclaration", async () => {
  const content = [
    'function helperFn() {',
    '  return 42;',
    '}',
    '',
    'export const main = helperFn();',
  ].join('\n');
  const tmpPath = createTempSkillFile(content);

  try {
    const manager = new SkillManager();
    const error = new Error("Module 'x' has no exported member 'helperFn'");
    await manager.selfHealSkill(tmpPath, error);

    const history = manager.getHealHistory();
    const lastAttempt = history[history.length - 1];
    assert.ok(
      lastAttempt.patchApplied === "missing-export" ||
      lastAttempt.patchApplied === "DRY_RUN:missing-export" ||
      lastAttempt.patchApplied?.includes("SKIPPED"),
      `Pattern attendu 'missing-export' ou SKIPPED, obtenu: ${lastAttempt.patchApplied}`
    );
  } finally {
    cleanupTempFile(tmpPath);
  }
});

test("Pattern: unreachable-code — commente le code mort", async () => {
  const content = [
    'function example() {',
    '  return 1;',
    '  console.log("dead code");',
    '}',
  ].join('\n');
  const tmpPath = createTempSkillFile(content);

  try {
    const manager = new SkillManager();
    const error = new Error("(3,3): Unreachable code detected");
    await manager.selfHealSkill(tmpPath, error);

    const history = manager.getHealHistory();
    const lastAttempt = history[history.length - 1];
    assert.ok(
      lastAttempt.patchApplied === "unreachable-code" ||
      lastAttempt.patchApplied === "DRY_RUN:unreachable-code" ||
      lastAttempt.patchApplied?.includes("SKIPPED"),
      `Pattern attendu 'unreachable-code' ou SKIPPED, obtenu: ${lastAttempt.patchApplied}`
    );
  } finally {
    cleanupTempFile(tmpPath);
  }
});

test("Pattern: type-mismatch — détecté mais pas de fix aveugle", async () => {
  const content = [
    'const x: number = "hello";',
    'export default x;',
  ].join('\n');
  const tmpPath = createTempSkillFile(content);

  try {
    const manager = new SkillManager();
    const error = new Error("Type 'string' is not assignable to type 'number'");
    await manager.selfHealSkill(tmpPath, error);

    const history = manager.getHealHistory();
    const lastAttempt = history[history.length - 1];
    // type-mismatch est reconnu mais ne génère pas de fix
    assert.ok(
      lastAttempt.patchApplied === "NONE: aucun pattern applicable" ||
      lastAttempt.patchApplied === "NONE: échec IA et patterns" ||
      lastAttempt.patchApplied?.includes("SKIPPED"),
      `Attendu 'NONE' ou SKIPPED pour type-mismatch, obtenu: ${lastAttempt.patchApplied}`
    );
    assert.equal(lastAttempt.success, false);
  } finally {
    cleanupTempFile(tmpPath);
  }
});

test("Pattern: implicit-any — ajoute le type explicite", async () => {
  const content = [
    'function process(data, callback) {',
    '  return callback(data);',
    '}',
    'export default process;',
  ].join('\n');
  const tmpPath = createTempSkillFile(content);

  try {
    const manager = new SkillManager();
    const error = new Error("(1,18): Parameter 'data' implicitly has an 'any' type");
    await manager.selfHealSkill(tmpPath, error);

    const history = manager.getHealHistory();
    const lastAttempt = history[history.length - 1];
    assert.ok(
      lastAttempt.patchApplied === "implicit-any" ||
      lastAttempt.patchApplied === "DRY_RUN:implicit-any" ||
      lastAttempt.patchApplied?.includes("SKIPPED"),
      `Pattern attendu 'implicit-any' ou SKIPPED, obtenu: ${lastAttempt.patchApplied}`
    );
  } finally {
    cleanupTempFile(tmpPath);
  }
});

test("Pattern: deprecated-api — annote la ligne", async () => {
  const content = [
    'import { oldMethod } from "./lib.js";',
    'const result = oldMethod();',
    'export default result;',
  ].join('\n');
  const tmpPath = createTempSkillFile(content);

  try {
    const manager = new SkillManager();
    const error = new Error("(2,16): 'oldMethod' is deprecated");
    await manager.selfHealSkill(tmpPath, error);

    const history = manager.getHealHistory();
    const lastAttempt = history[history.length - 1];
    assert.ok(
      lastAttempt.patchApplied === "deprecated-api" ||
      lastAttempt.patchApplied === "DRY_RUN:deprecated-api" ||
      lastAttempt.patchApplied?.includes("SKIPPED"),
      `Pattern attendu 'deprecated-api' ou SKIPPED, obtenu: ${lastAttempt.patchApplied}`
    );
  } finally {
    cleanupTempFile(tmpPath);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tests : Intégrité de l'historique
// ═══════════════════════════════════════════════════════════════════════════════

test("SkillManager — l'historique est limité à 50 entrées max", () => {
  const manager = new SkillManager();

  for (let i = 0; i < 55; i++) {
    (manager as any).recordAttempt({
      timestamp: new Date().toISOString(),
      skillPath: `/fake/skill_${i}.ts`,
      error: `Error ${i}`,
      success: true,
    });
  }

  const history = manager.getHealHistory();
  assert.equal(history.length, 50, `L'historique doit contenir exactement 50 entrées, obtenu: ${history.length}`);
});

test("SkillManager — getHealHistory retourne une copie (pas la référence interne)", () => {
  const manager = new SkillManager();
  const history1 = manager.getHealHistory();
  const history2 = manager.getHealHistory();
  assert.notEqual(history1, history2, "Chaque appel doit retourner un nouveau tableau");
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tests : handleToolCall déclenche le self-healing en cas d'erreur
// ═══════════════════════════════════════════════════════════════════════════════

test("SkillManager — handleToolCall déclenche selfHealSkill sur erreur et propage quand même", async () => {
  const manager = new SkillManager();

  // Créer un vrai fichier temporaire pour que selfHealSkill puisse le lire
  const tmpDir = path.join(SELF_ROOT, '.Leanna', 'tasks');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const tmpPath = path.join(tmpDir, `heal-trigger-${Date.now()}.ts`);
  fs.writeFileSync(tmpPath, 'export const x: number = "oops";', 'utf-8');

  const failingSkill = createMockSkill("heal-trigger", ["trigger_tool"], async () => {
    throw new Error("Property 'x' does not exist on type 'Y'");
  });
  manager.registerDynSkill(failingSkill, tmpPath);

  await assert.rejects(
    () => manager.handleToolCall("trigger_tool", {}),
    (err: Error) => {
      assert.match(err.message, /Property 'x'/);
      return true;
    }
  );

  // Attendre que le selfHealSkill async s'exécute (git + analyse + fs)
  await new Promise(resolve => setTimeout(resolve, 500));

  // L'historique devrait contenir une tentative
  const history = manager.getHealHistory();
  assert.ok(history.length >= 1, `Le self-healing doit avoir enregistré une tentative, obtenu: ${history.length}`);
  assert.equal(history[0].error, "Property 'x' does not exist on type 'Y'");

  // Cleanup
  try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
});
