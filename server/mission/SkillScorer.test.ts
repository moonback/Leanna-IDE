import test from "node:test";
import assert from "node:assert/strict";
import { SkillScorer, type ScoringContext } from "./SkillScorer.js";

function ctx(partial: Partial<ScoringContext>): ScoringContext {
  return {
    goalTitle: "",
    goalDescription: "",
    successCriteria: [],
    previousErrors: [],
    previousActions: [],
    relevantFiles: [],
    averageConfidence: 0.5,
    ...partial,
  };
}

test("verify_typecheck is neutralized for a documentation goal (no code context)", () => {
  const scorer = new SkillScorer();
  const score = scorer.scoreSkill(
    "verify_typecheck",
    ctx({
      goalTitle: "Auditer le README.md",
      goalDescription: "Vérifier les sections et la clarté du README du projet.",
      successCriteria: ["Rapport d'audit produit"],
      relevantFiles: ["README.md"],
    })
  );
  // La pertinence doit être nulle → l'outil ne sera pas sélectionné hors contexte code.
  assert.equal(score.breakdown.relevance, 0, "verify_typecheck non pertinent pour un objectif documentaire");
});

test("verify_typecheck stays relevant for a code goal (code vocabulary)", () => {
  const scorer = new SkillScorer();
  const score = scorer.scoreSkill(
    "verify_typecheck",
    ctx({
      goalTitle: "Corriger les erreurs TypeScript",
      goalDescription: "Lancer le typecheck et corriger la compilation du module.",
      successCriteria: ["Compilation réussie"],
    })
  );
  assert.ok(score.breakdown.relevance > 0, "verify_typecheck pertinent quand l'objectif porte sur du code");
});

test("verify_typecheck stays relevant when a code file is in scope", () => {
  const scorer = new SkillScorer();
  const score = scorer.scoreSkill(
    "verify_typecheck",
    ctx({
      goalTitle: "Vérifier le résultat",
      goalDescription: "Contrôler l'état après modification.",
      relevantFiles: ["server/mission/Executor.ts"],
    })
  );
  assert.ok(score.breakdown.relevance > 0, "un fichier .ts en scope suffit à justifier le typecheck");
});

test("a read tool is unaffected by the code-check guard on a doc goal", () => {
  const scorer = new SkillScorer();
  const score = scorer.scoreSkill(
    "read_project_file",
    ctx({
      goalTitle: "Auditer le README.md",
      goalDescription: "Lire et analyser le README du projet.",
      relevantFiles: ["README.md"],
    })
  );
  assert.ok(score.breakdown.relevance > 0, "les outils de lecture restent pertinents pour un objectif documentaire");
});
