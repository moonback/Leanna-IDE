/**
 * Tests de non-régression UnderstandingEngine.
 * Exécution : npm test -- --test-name-pattern="UnderstandingEngine"
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { UnderstandingEngine, type KnowledgeHealth } from "./UnderstandingEngine.js";
import type { ContextBatch, UnderstandingScore } from "./types.js";

const batch: ContextBatch = {
  query: "inspecter un fichier",
  files: [{
    filePath: "src/example.ts",
    relevance: 0.9,
    reason: "fichier pertinent",
    relevantSections: [],
  }],
  facts: [],
  quality: { totalFiles: 1, averageConfidence: 0.9, sufficient: true },
};

const health: KnowledgeHealth = {
  initialized: true,
  fileCount: 1,
  entityCount: 0,
  exportCount: 0,
  importCount: 0,
  cycleCount: 0,
  factCount: 0,
  criticalModuleCount: 0,
  freshness: 1,
  warnings: [],
};

function scoreWith(options: { maxFiles: number; maxFacts: number; existingContext?: unknown }): UnderstandingScore {
  const engine = new UnderstandingEngine();
  const internal = engine as unknown as {
    computeUnderstandingScore: (
      query: string,
      context: ContextBatch,
      knowledgeHealth: KnowledgeHealth,
      opts: { maxFiles: number; maxFacts: number; existingContext?: unknown },
    ) => UnderstandingScore;
  };
  return internal.computeUnderstandingScore("inspecter un fichier", batch, health, options);
}

describe("UnderstandingEngine.computeUnderstandingScore", () => {
  it("tolère existingContext absent et classe les fichiers comme non lus", () => {
    const score = scoreWith({ maxFiles: 6, maxFacts: 7 });

    assert.deepEqual(score.unreadFiles, ["src/example.ts"]);
  });

  it("ignore les entrées invalides et normalise les chemins déjà lus", () => {
    const score = scoreWith({
      maxFiles: 6,
      maxFacts: 7,
      existingContext: [null, 42, "./src/example.ts"],
    });

    assert.deepEqual(score.unreadFiles, []);
  });
});
