import test from "node:test";
import assert from "node:assert/strict";
import { Mission } from "./Mission.js";

test("supervised retry reopens stale goals and actions while preserving the plan", () => {
  const mission = new Mission("recover", "exercise supervised recovery");
  const goalId = mission.addSubGoal({
    parentId: mission.rootGoal.id,
    title: "write output",
    description: "write and verify output",
    successCriteria: ["output exists"],
  });
  const action = {
    id: "action-1",
    skillName: "write_project_file",
    args: { path: "out.txt" },
    rationale: "create output",
    score: 1,
    order: 0,
    status: "pending" as const,
  };
  mission.setPlanForGoal(goalId, [action]);
  mission.pushGoal(goalId);
  mission.startAction(action.id);
  mission.recordActionResult(action.id, { error: "failed" }, false);
  mission.completeGoal(goalId, { success: false, summary: "attempt failed" });
  mission.completeGoal(mission.rootGoal.id, { success: false, summary: "mission failed" });

  mission.resetForSupervisedAttempt();

  const state = mission.getState();
  assert.equal(state.status, "pending");
  assert.equal(state.activeGoalId, null);
  assert.deepEqual(state.goalStack, []);
  assert.equal(mission.getGoal(goalId)?.status, "pending");
  assert.equal(mission.getGoal(goalId)?.result, undefined);
  assert.equal(mission.getGoal(goalId)?.plannedActions[0].status, "pending");
  assert.equal(mission.getGoal(goalId)?.plannedActions[0].result, undefined);
  assert.equal(mission.getGoal(goalId)?.plannedActions[0].skillName, "write_project_file");
});

test("cancelled missions cannot be reopened by supervised recovery", () => {
  const mission = new Mission("cancel", "must stay cancelled");
  mission.cancel("operator requested stop");
  assert.throws(() => mission.resetForSupervisedAttempt(), /cancelled mission cannot be retried/i);
  assert.equal(mission.status, "cancelled");
});
