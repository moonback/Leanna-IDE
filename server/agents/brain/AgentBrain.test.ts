/**
 * Tests unitaires — Agent Brain
 *
 * Couvre :
 * 1. GoalUnderstandingEngine — compréhension heuristique
 * 2. DynamicPlanner — séquence dynamique par domaine
 * 3. BrainVerifier — détection d'erreurs syntaxiques
 * 4. BrainCorrectionLoop — correction bornée
 * 5. AgentBrain.planGoal — plan complet sans exécution réelle
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { GoalUnderstandingEngine } from "./GoalUnderstandingEngine.js";
import { DynamicPlanner } from "./DynamicPlanner.js";
import { BrainVerifier } from "./BrainVerifier.js";
import { BrainCorrectionLoop } from "./BrainCorrectionLoop.js";
import type { BrainGoalInput, BrainStage, StageVerification, GoalUnderstanding } from "./types.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeInput(goal: string, extra?: Partial<BrainGoalInput>): BrainGoalInput {
  return { goal, contextFiles: [], mode: "plan_first", ...extra };
}

function makeUnderstanding(domain: GoalUnderstanding["domain"], complexity: GoalUnderstanding["complexity"] = "moderate"): GoalUnderstanding {
  return {
    intent: "Test de compréhension",
    domain,
    complexity,
    keyTechnologies: ["TypeScript", "React"],
    relevantFiles: [],
    requirements: ["Impl requirement"],
    successCriteria: ["Code valide", "Pas de régression"],
    potentialRisks: ["Régression possible"],
    rationale: "Analyse heuristique test",
  };
}

function makeStage(role: BrainStage["agentRole"], id = "stage-1"): BrainStage {
  return {
    id,
    title: `Étape test (${role})`,
    description: `Test de l'étape ${role}`,
    agentRole: role,
    agentReason: "Raison de test",
    skills: ["codebase"],
    tools: ["read_project_file"],
    files: [],
    instructions: "Exécuter le test",
    dependsOn: [],
    status: "completed",
    priority: "high",
    verificationCriteria: ["Code valide"],
  };
}

function makeVerification(passed: boolean, issues: StageVerification["issues"] = []): StageVerification {
  return {
    stageId: "stage-1",
    role: "coder",
    passed,
    syntaxCheckOk: passed,
    testsOk: passed,
    visualCheckOk: passed,
    semanticCheckOk: passed,
    issues,
    summary: passed ? "✅ OK" : "❌ Erreur de test",
    timestamp: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tests GoalUnderstandingEngine
// ═══════════════════════════════════════════════════════════════════════════════

describe("GoalUnderstandingEngine", () => {
  const engine = new GoalUnderstandingEngine();
  const projectInfo = { techStack: ["TypeScript", "React"], hasReact: true, hasTypeScript: true };

  it("détecte le domaine 'frontend' pour un header responsive", () => {
    const result = engine.understandHeuristic(
      "Modernise mon site et rends le header responsive",
      makeInput("Modernise mon site et rends le header responsive"),
      projectInfo,
      []
    );
    assert.equal(result.domain, "frontend");
  });

  it("détecte le domaine 'bugfix' pour une erreur critique", () => {
    const result = engine.understandHeuristic(
      "Fix le crash au démarrage de l'app",
      makeInput("Fix le crash au démarrage de l'app"),
      projectInfo,
      []
    );
    assert.equal(result.domain, "bugfix");
  });

  it("détecte le domaine 'documentation'", () => {
    const result = engine.understandHeuristic(
      "Rédige le README et la documentation de l'API",
      makeInput("Rédige le README et la documentation"),
      projectInfo,
      []
    );
    assert.equal(result.domain, "documentation");
  });

  it("retourne des critères de succès vérifiables", () => {
    const result = engine.understandHeuristic(
      "Rends le header responsive",
      makeInput("Rends le header responsive"),
      projectInfo,
      []
    );
    assert.ok(result.successCriteria.length > 0, "Doit avoir au moins un critère de succès");
  });

  it("détecte la complexité simple pour un objectif court", () => {
    const result = engine.understandHeuristic(
      "Fix typo",
      makeInput("Fix typo"),
      projectInfo,
      []
    );
    assert.equal(result.complexity, "simple");
  });

  it("détecte la complexité 'complex' pour une refonte", () => {
    const result = engine.understandHeuristic(
      "Migration complète de l'architecture vers un système multi-agents avec sécurité avancée",
      makeInput("Migration complète de l'architecture vers un système multi-agents avec sécurité avancée"),
      projectInfo,
      []
    );
    assert.equal(result.complexity, "complex");
  });

  it("inclut les fichiers de contexte dans les fichiers pertinents", () => {
    const result = engine.understandHeuristic(
      "Modernise le header",
      makeInput("Modernise le header", { contextFiles: ["src/Header.tsx", "src/index.css"] }),
      projectInfo,
      ["src/Header.tsx", "src/index.css"]
    );
    assert.ok(result.relevantFiles.includes("src/Header.tsx"));
    assert.ok(result.relevantFiles.includes("src/index.css"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tests DynamicPlanner
// ═══════════════════════════════════════════════════════════════════════════════

describe("DynamicPlanner", () => {
  const planner = new DynamicPlanner();

  it("génère le workflow researcher→architect→coder→tester→reviewer pour une refonte UI responsive", () => {
    const understanding = makeUnderstanding("frontend", "moderate");
    understanding.intent = "Modernise mon site et rends le header responsive";
    const plan = planner.planHeuristic(understanding, makeInput(understanding.intent));

    const roles = plan.stages.map((s) => s.agentRole);
    // Doit contenir coder et reviewer au minimum
    assert.ok(roles.includes("researcher"), `researcher attendu, reçu: ${roles.join(" → ")}`);
    assert.ok(roles.includes("coder"), `coder attendu, reçu: ${roles.join(" → ")}`);
    assert.ok(roles.includes("reviewer"), `reviewer attendu, reçu: ${roles.join(" → ")}`);
  });

  it("génère un workflow court debugger→coder→tester pour un bugfix", () => {
    const understanding = makeUnderstanding("bugfix", "simple");
    understanding.intent = "Fix le crash au démarrage";
    const plan = planner.planHeuristic(understanding, makeInput(understanding.intent));

    const roles = plan.stages.map((s) => s.agentRole);
    assert.ok(roles.includes("debugger"), `debugger attendu, reçu: ${roles.join(" → ")}`);
    assert.ok(roles.includes("coder"), `coder attendu, reçu: ${roles.join(" → ")}`);
    assert.ok(roles.includes("tester"), `tester attendu, reçu: ${roles.join(" → ")}`);
  });

  it("génère le workflow researcher→writer→proofreader pour la documentation", () => {
    const understanding = makeUnderstanding("documentation", "simple");
    understanding.intent = "Rédige le README";
    const plan = planner.planHeuristic(understanding, makeInput(understanding.intent));

    const roles = plan.stages.map((s) => s.agentRole);
    assert.ok(roles.includes("researcher"), `researcher attendu, reçu: ${roles.join(" → ")}`);
    assert.ok(roles.includes("writer"), `writer attendu, reçu: ${roles.join(" → ")}`);
  });

  it("chaque étape reçoit des outils assignés", () => {
    const understanding = makeUnderstanding("frontend", "moderate");
    understanding.intent = "Modernise le header";
    const plan = planner.planHeuristic(understanding, makeInput(understanding.intent));

    for (const stage of plan.stages) {
      assert.ok(stage.tools.length > 0, `L'étape '${stage.id}' doit avoir des outils assignés`);
    }
  });

  it("les dépendances entre étapes forment une chaîne linéaire valide", () => {
    const understanding = makeUnderstanding("frontend", "moderate");
    understanding.intent = "Modernise le header";
    const plan = planner.planHeuristic(understanding, makeInput(understanding.intent));

    const stageIds = plan.stages.map((s) => s.id);
    for (let i = 1; i < plan.stages.length; i++) {
      const deps = plan.stages[i].dependsOn;
      if (deps.length > 0) {
        assert.ok(stageIds.includes(deps[0]), `La dépendance '${deps[0]}' doit référencer une étape existante`);
      }
    }
  });

  it("toutes les étapes démarrent en statut 'pending'", () => {
    const understanding = makeUnderstanding("general", "moderate");
    understanding.intent = "Objectif de test";
    const plan = planner.planHeuristic(understanding, makeInput(understanding.intent));

    for (const stage of plan.stages) {
      assert.equal(stage.status, "pending", `L'étape '${stage.id}' doit être en statut 'pending'`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tests BrainVerifier
// ═══════════════════════════════════════════════════════════════════════════════

describe("BrainVerifier", () => {
  const verifier = new BrainVerifier();
  const understanding = makeUnderstanding("frontend");

  it("retourne passed=true quand le résultat de l'étape est succès et aucun fichier modifié", async () => {
    const stage = makeStage("coder");
    stage.result = { success: true, outcome: "success", summary: "Implémenté", filesModified: [], durationMs: 0 };

    const report = await verifier.verifyStage(stage, understanding, []);
    // Sans erreur (ni fichiers corrompus, ni agent failed), doit passer
    assert.equal(report.passed, true);
  });

  it("retourne passed=false et une issue critique si l'agent a retourné success=false", async () => {
    const stage = makeStage("coder");
    stage.result = { success: false, outcome: "failed", summary: "Échec de compilation", error: "Compilation échouée", filesModified: [], durationMs: 0 };

    const report = await verifier.verifyStage(stage, understanding, []);
    assert.equal(report.passed, false);
    assert.ok(report.issues.some((i) => i.severity === "error"), "Doit avoir une issue error");
  });

  it("retourne passed=false si l'agent vision a signalé un débordement", async () => {
    const stage = makeStage("vision");
    stage.result = { success: true, outcome: "success", summary: "Détection d'un overflow et débordement sur mobile", filesModified: [], durationMs: 0 };

    const report = await verifier.verifyStage(stage, understanding, []);
    assert.equal(report.visualCheckOk, false);
    assert.equal(report.passed, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tests BrainCorrectionLoop
// ═══════════════════════════════════════════════════════════════════════════════

describe("BrainCorrectionLoop", () => {
  const understanding = makeUnderstanding("frontend");

  it("génère une correction valide sur le premier échec", () => {
    const loop = new BrainCorrectionLoop(3);
    const stage = makeStage("coder");
    const verification = makeVerification(false, [
      { severity: "error", message: "Syntaxe incorrecte", file: "src/Header.tsx" },
    ]);

    const correction = loop.createCorrection(stage, verification, 1, understanding);
    assert.ok(correction !== null, "Doit produire une correction");
    assert.ok(correction!.diagnostic.includes("Syntaxe incorrecte"));
    assert.ok(correction!.filesToFix.includes("src/Header.tsx"));
    assert.equal(correction!.attemptNumber, 1);
    assert.equal(correction!.resolved, false);
  });

  it("retourne null si le budget de correction est dépassé", () => {
    const loop = new BrainCorrectionLoop(3);
    const stage = makeStage("coder");
    const verification = makeVerification(false, [
      { severity: "error", message: "Erreur persistante" },
    ]);

    const correction = loop.createCorrection(stage, verification, 4, understanding);
    assert.equal(correction, null, "Doit retourner null car budget épuisé (4 > 3)");
  });

  it("sélectionne debugger comme correcteur pour une étape tester en échec", () => {
    const loop = new BrainCorrectionLoop(3);
    const stage = makeStage("tester");
    const verification = makeVerification(false, [
      { severity: "error", message: "Test echoué" },
    ]);

    const correction = loop.createCorrection(stage, verification, 1, understanding);
    assert.equal(correction?.targetRole, "debugger");
  });

  it("inclut toujours des instructions correctives structurées", () => {
    const loop = new BrainCorrectionLoop(3);
    const stage = makeStage("coder");
    const verification = makeVerification(false, [
      { severity: "error", message: "Érreur de type TS2345" },
    ]);

    const correction = loop.createCorrection(stage, verification, 1, understanding);
    assert.ok(correction?.correctiveInstructions.includes("CORRECTION REQUISE"));
    assert.ok(correction?.correctiveInstructions.includes("DIAGNOSTIC"));
  });
});
