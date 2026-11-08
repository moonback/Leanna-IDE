import test from "node:test";
import assert from "node:assert/strict";
import { ContextIntelligenceEngine } from "./ContextIntelligenceEngine.js";
import type { ProjectFact } from "./types.js";
function fact(overrides: Partial<ProjectFact> = {}): ProjectFact {
  return { id: "f1", content: "Le module auth utilise le middleware de session sécurisé",
    category: "architecture", tags: ["auth"], createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z", confidence: 0.9, usageCount: 2,
    sourceFile: "server/auth.ts", ...overrides };
}
test("demotes facts whose source disappeared to verification", () => {
  const report = new ContextIntelligenceEngine().assess({ facts: [fact()], workspaceFiles: new Set() });
  assert.equal(report.assessments[0].decision, "verify");
});
test("detects near-duplicates and proposes merging the lower-ranked fact", () => {
  const report = new ContextIntelligenceEngine().assess({ facts: [
    fact({ id: "strong", confidence: 0.95, usageCount: 8 }),
    fact({ id: "weak", content: "Le module auth utilise le middleware sécurisé de session", confidence: 0.6, usageCount: 0 }),
  ], workspaceFiles: new Set(["server/auth.ts"]) });
  assert.equal(report.assessments.find((x) => x.factId === "weak")?.decision, "merge");
  assert.equal(report.assessments.find((x) => x.factId === "weak")?.duplicateOf, "strong");
});
test("rejects learning from success claims without verifier evidence", () => {
  const report = new ContextIntelligenceEngine().assess({ facts: [], workspaceFiles: new Set(["src/a.ts"]),
    missions: [{ missionId: "m1", overallSuccess: true, verificationPassed: false, evidenceIds: [],
      summary: "La mission affirme avoir corrigé le problème et terminé le travail.", relatedFiles: ["src/a.ts"] }] });
  assert.equal(report.learningCandidates.length, 0);
});
test("creates reviewable learning candidates only from verified outcomes", () => {
  const report = new ContextIntelligenceEngine().assess({ facts: [], workspaceFiles: new Set(["src/a.ts"]),
    missions: [{ missionId: "m2", overallSuccess: true, verificationPassed: true, evidenceIds: ["sha256:abc"],
      summary: "Le correctif du parseur est validé par les tests ciblés et le typecheck.", relatedFiles: ["src/a.ts", "src/deleted.ts"] }] });
  assert.equal(report.learningCandidates.length, 1);
  assert.deepEqual(report.learningCandidates[0].sourceFiles, ["src/a.ts"]);
  assert.equal(report.learningCandidates[0].requiresHumanReview, true);
});
test("marks old unused facts for refresh rather than automatic deletion", () => {
  const report = new ContextIntelligenceEngine().assess({ facts: [fact({ sourceFile: undefined, usageCount: 0, isStructural: false })],
    workspaceFiles: new Set() }, { now: Date.parse("2026-11-08T00:00:00.000Z"), staleAfterMs: 1000 });
  assert.equal(report.assessments[0].decision, "refresh");
  assert.equal(report.counts.discard, 0);
});

test("prefers a duplicate whose source still exists over a stale source", () => {
  const report = new ContextIntelligenceEngine().assess({ facts: [
    fact({ id: "stale", confidence: 1, usageCount: 20, sourceFile: "server/removed.ts" }),
    fact({ id: "current", confidence: 0.5, usageCount: 0, sourceFile: "server/auth.ts",
      createdAt: "2026-11-07T00:00:00.000Z", updatedAt: "2026-11-07T00:00:00.000Z" }),
  ], workspaceFiles: new Set(["server/auth.ts"]) }, { now: Date.parse("2026-11-08T00:00:00.000Z") });
  assert.equal(report.assessments.find((x) => x.factId === "current")?.decision, "transmit");
  assert.equal(report.assessments.find((x) => x.factId === "stale")?.decision, "merge");
  assert.equal(report.assessments.find((x) => x.factId === "stale")?.duplicateOf, "current");
});
