import test from "node:test";
import assert from "node:assert/strict";
import {
  finalizeMissionSkill,
  setFinalizeMissionEvidenceProvider,
} from "./finalizeMission.js";

const args = {
  mission_id: "mission-123",
  title: "Validation",
  summary: "Les contrôles ont été exécutés.",
  files_changed: ["src/example.ts"],
  verification: { integrity: true, compilation: true, tests: true, behavior: true },
};

async function callFinalize(input = args) {
  return finalizeMissionSkill.handleToolCall!("finalize_mission", input);
}

test("finalize_mission refuses to close when no runtime evidence provider is wired", async () => {
  setFinalizeMissionEvidenceProvider(null);
  const result = await callFinalize();
  assert.equal((result as any).ok, false);
  assert.equal((result as any).code, "EVIDENCE_PROVIDER_UNAVAILABLE");
});

test("finalize_mission refuses model-declared success when persisted evidence is missing", async () => {
  setFinalizeMissionEvidenceProvider(async () => null);
  const result = await callFinalize();
  assert.equal((result as any).ok, false);
  assert.equal((result as any).code, "EVIDENCE_NOT_FOUND");
});

test("finalize_mission refuses a failed evidence level even when the model claims success", async () => {
  setFinalizeMissionEvidenceProvider(async (missionId) => ({
    missionId,
    integrity: true,
    compilation: true,
    tests: false,
    behavior: true,
    source: "evidence-engine",
  }));
  const result = await callFinalize();
  assert.equal((result as any).ok, false);
  assert.deepEqual((result as any).failedLevels, ["tests"]);
});

test("finalize_mission accepts only matching, complete persisted runtime evidence", async () => {
  setFinalizeMissionEvidenceProvider(async (missionId) => ({
    missionId,
    integrity: true,
    compilation: true,
    tests: true,
    behavior: true,
    source: "evidence-engine",
  }));
  const result = await callFinalize();
  assert.equal((result as any).ok, true);
  assert.equal((result as any).mission_id, "mission-123");
  assert.equal((result as any).verification.source, "evidence-engine");
});

test("finalize_mission refuses evidence belonging to another mission", async () => {
  setFinalizeMissionEvidenceProvider(async () => ({
    missionId: "different-mission",
    integrity: true,
    compilation: true,
    tests: true,
    behavior: true,
    source: "evidence-engine",
  }));
  const result = await callFinalize();
  assert.equal((result as any).ok, false);
  assert.equal((result as any).code, "EVIDENCE_NOT_FOUND");
});

test.after(() => setFinalizeMissionEvidenceProvider(null));
