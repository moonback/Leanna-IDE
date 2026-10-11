import type { RuntimeEvent } from "../runtime/types.js";

export interface Perception {
  event: RuntimeEvent;
  importance: number;
  novelty: number;
  requiresAttention: boolean;
  affectedResources: string[];
  possibleActions: Array<"observe" | "maintenance" | "mission">;
  reason: string;
}

/** Deterministic event classification; it deliberately never calls a model. */
export class PerceptionEngine {
  perceive(event: RuntimeEvent): Perception {
    switch (event.type) {
      case "task:failed":
        return this.result(event, .8, ["observe", "maintenance"], `Task ${event.taskId} failed.`);
      case "tool:permissionDenied":
        return this.result(event, .9, ["observe"], `Tool ${event.toolName} was denied by policy.`);
      case "workflow:completed":
        return this.result(event, event.success ? .2 : .75, event.success ? [] : ["observe", "maintenance"], `Workflow ${event.workflowId} ${event.success ? "completed" : "failed"}.`);
      case "autonomy:heartbeat":
        return this.result(event, event.attentionRequired ? .5 : .05, event.attentionRequired ? ["maintenance"] : [], event.reason);
      case "autonomy:health":
        return this.result(event, event.status === "healthy" ? .1 : .85, event.status === "healthy" ? [] : ["observe", "maintenance"], event.reason);
      case "fs:changed": {
        // Edits are routine context (observe), deletions are slightly more
        // notable. A large batch (e.g. a checkout) is worth a light look.
        const batch = event.batchSize ?? 1;
        const importance = event.change === "deleted" ? .4 : batch >= 20 ? .5 : .2;
        return this.result(event, importance, batch >= 20 ? ["observe"] : [], `File ${event.change}: ${event.path}${batch > 1 ? ` (+${batch - 1} more)` : ""}.`);
      }
      case "git:stateChanged": {
        // Divergence from the remote or a large uncommitted surface is worth
        // noticing; a clean, in-sync tree is routine.
        const diverged = (event.behind ?? 0) > 0 || (event.ahead ?? 0) > 5;
        const importance = diverged ? .55 : event.dirtyFiles > 20 ? .45 : .15;
        return this.result(event, importance, diverged ? ["observe"] : [], `Git: ${event.dirtyFiles} uncommitted file(s)${event.branch ? ` on ${event.branch}` : ""}${event.behind ? `, ${event.behind} behind` : ""}.`);
      }
      case "tests:completed": {
        // Red tests are a problem that needs attention and maintenance.
        const importance = event.failed > 0 ? Math.min(.95, .7 + Math.min(.25, event.failed * 0.03)) : .1;
        return this.result(event, importance, event.failed > 0 ? ["observe", "maintenance"] : [], event.failed > 0 ? `${event.failed} test(s) failing${event.suite ? ` in ${event.suite}` : ""}.` : "Test suite is green.");
      }
      case "schedule:due":
        return this.result(event, event.importance ?? .5, ["maintenance"], `Scheduled: ${event.label}.`);
      default:
        return this.result(event, .15, [], "Routine runtime event.");
    }
  }

  private result(event: RuntimeEvent, importance: number, possibleActions: Perception["possibleActions"], reason: string): Perception {
    return { event, importance, novelty: 1, requiresAttention: importance >= .5, affectedResources: this.resources(event), possibleActions, reason };
  }

  private resources(event: RuntimeEvent): string[] {
    if ("taskId" in event) return [event.taskId];
    if ("workflowId" in event) return [event.workflowId];
    if ("toolName" in event) return [event.toolName];
    if (event.type === "fs:changed") return [event.path];
    if (event.type === "schedule:due") return [event.scheduleId];
    if (event.type === "tests:completed" && event.suite) return [event.suite];
    return [];
  }
}
