import { test } from "node:test";
import assert from "node:assert/strict";
import { Planner } from "./Planner.js";
import { SkillScorer } from "./SkillScorer.js";
import { Mission } from "./Mission.js";
import { DEFAULT_MISSION_CONFIG } from "./types.js";
import { StrategyMemory } from "../knowledge/StrategyMemory.js";

/**
 * R2-R3 + GAP-1: dynamic replanning must consult durable skill reliability, so a
 * tool that failed across prior missions is dropped on replan even without a
 * re-observed failure in the current mission — while never removing every tool.
 */

function createTestStrategy() {
  return new StrategyMemory({ ephemeral: true });
}

test("replan drops a durably-failing tool while keeping at least one option", async () => {
  const strategy = createTestStrategy();
  // Record enough failures to flag "unreliable_tool" as durably failing.
  for (let i = 0; i < 5; i++) strategy.recordSkillOutcome("unreliable_tool", false, 100);

  const planner = new Planner(new SkillScorer(), strategy);
  const mission = new Mission("t", "corriger le bug", "high", {
    ...DEFAULT_MISSION_CONFIG,
    minSkillScore: 0,
  });
  const goalId = mission.rootGoal.id;

  const available = ["reliable_tool", "unreliable_tool"];
  const failed = { id: "a", skillName: "reliable_tool", args: {}, rationale: "", score: 40, order: 1, status: "failed" as const };

  const actions = await planner.replan(mission, goalId, failed, "boom", available);
  const usedSkills = new Set(actions.map((a) => a.skillName));
  assert.equal(usedSkills.has("unreliable_tool"), false, "durably-failing tool must be excluded on replan");
  assert.ok(usedSkills.has("reliable_tool"), "keep exactly the non-durable fallback when all other tools are excluded");
});


test("replan excludes the just-failed skill immediately when an alternative exists", async () => {
  const strategy = createTestStrategy();
  const planner = new Planner(new SkillScorer(), strategy);
  const mission = new Mission("t", "corriger le bug", "high", {
    ...DEFAULT_MISSION_CONFIG,
    minSkillScore: 0,
  });
  const goalId = mission.rootGoal.id;
  const failed = {
    id: "failed-action",
    skillName: "failed_tool",
    args: {},
    rationale: "previous strategy",
    score: 40,
    order: 1,
    status: "failed" as const,
  };

  const actions = await planner.replan(
    mission,
    goalId,
    failed,
    "outil indisponible",
    ["failed_tool", "alternative_tool"],
  );

  assert.ok(actions.length > 0, "an alternative should produce a replacement plan");
  assert.ok(
    actions.every((action) => action.skillName !== "failed_tool"),
    "the first replan must not immediately select the tool that just failed",
  );
});

test("replan never removes every tool (keeps availability if all are failing)", async () => {
  const strategy = createTestStrategy();
  for (let i = 0; i < 5; i++) strategy.recordSkillOutcome("only_tool", false, 100);

  const planner = new Planner(new SkillScorer(), strategy);
  const mission = new Mission("t", "corriger le bug", "high", { ...DEFAULT_MISSION_CONFIG, minSkillScore: 0 });
  const goalId = mission.rootGoal.id;
  const failed = { id: "a", skillName: "only_tool", args: {}, rationale: "", score: 40, order: 1, status: "failed" as const };

  const actions = await planner.replan(mission, goalId, failed, "boom", ["only_tool"]);
  // With every available tool failing, preserve the last viable option instead
  // of returning an empty plan solely because reliability filtering removed it.
  assert.ok(
    actions.some((action) => action.skillName === "only_tool"),
    "the only available tool must remain selectable when no alternative exists",
  );
});
