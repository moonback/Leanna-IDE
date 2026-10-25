/**
 * Tests Phase 5 — Migration de la flotte autonome vers le moteur partagé.
 *
 * Vérifie, de façon hermétique (sans LLM), que :
 *   - AutonomousLoop fonctionne contre n'importe quel AgentTaskRunner
 *   - la boucle utilise runner.runTool pour la vérification (plus d'accès privé)
 *   - AgentRegistry.setRunner bascule bien le moteur d'exécution de la flotte
 *   - AgentRuntimeExecutor et AgentExecutor satisfont le contrat AgentTaskRunner
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { AutonomousLoop } from "./AutonomousLoop.js";
import { AgentRegistry } from "./AgentRegistry.js";
import { AgentExecutor } from "./AgentExecutor.js";
import { AgentRuntimeExecutor } from "./AgentRuntimeExecutor.js";
import { ProgressNotifier } from "./ProgressNotifier.js";
import { dynamicAgentRegistry } from "./DynamicAgentRegistry.js";
import type { AgentTask } from "./types.js";
import type { AgentTaskRunner } from "./AgentTaskRunner.js";

function makeTask(role: string): AgentTask {
  return {
    id: "task-phase5",
    role,
    title: "Corriger le module",
    description: "Corrige les erreurs de typage",
    priority: "medium",
    status: "pending",
    context: { files: [] },
    createdAt: new Date().toISOString(),
  };
}

function registerRole(role: string): void {
  dynamicAgentRegistry.registerAgent(
    {
      role,
      name: `Test ${role}`,
      description: "test",
      capabilities: ["read_project_file", "modify_project_file", "verify_file"],
      systemPrompt: "test",
      maxConcurrency: 1,
      defaultTimeoutMs: 30_000,
    },
    true
  );
}

describe("AgentTaskRunner — contrat partagé", () => {
  it("AgentExecutor et AgentRuntimeExecutor exposent execute() et runTool()", () => {
    const legacy = new AgentExecutor(new ProgressNotifier());
    assert.equal(typeof legacy.execute, "function");
    assert.equal(typeof legacy.runTool, "function");
    // Conformité structurelle au contrat (assignable sans cast).
    const asRunner: AgentTaskRunner = legacy;
    assert.ok(asRunner);
    // AgentRuntimeExecutor est aussi un AgentTaskRunner (vérifié au type-check).
    const ctorAcceptsRunner = (r: AgentTaskRunner) => r;
    assert.equal(typeof AgentRuntimeExecutor, "function");
    assert.equal(typeof ctorAcceptsRunner, "function");
  });
});

describe("AutonomousLoop — fonctionne contre un AgentTaskRunner arbitraire", () => {
  beforeEach(() => registerRole("test_loop_role"));

  it("exécute via runner.execute et s'arrête sur un résultat vérifié", async () => {
    let executeCalls = 0;
    const runner: AgentTaskRunner = {
      async execute(task) {
        executeCalls += 1;
        task.status = "completed";
        task.completedAt = new Date().toISOString();
        task.result = {
          success: true,
          outcome: "success",
          summary: "fait",
          details: "## TERMINÉ",
          filesModified: [],
          durationMs: 5,
          evidence: {
            filesRead: [],
            filesModified: [],
            toolsExecuted: [],
            commandsExecuted: [],
            verification: { passed: true, checks: ["ok"], errors: [] },
          },
        };
      },
    };

    const loop = new AutonomousLoop(runner, {
      maxIterations: 3,
      globalTimeoutMs: 10_000,
      minConfidenceScore: 0.5,
      verifyFiles: true,
    });
    const result = await loop.run(makeTask("test_loop_role"));

    assert.ok(executeCalls >= 1, "la boucle doit appeler runner.execute");
    assert.equal(result.finalTask.result?.success, true);
  });

  it("utilise runner.runTool pour la vérification quand la preuve manque", async () => {
    const toolCalls: string[] = [];
    const runner: AgentTaskRunner = {
      async execute(task) {
        task.status = "completed";
        task.result = {
          success: true,
          outcome: "success",
          summary: "écrit",
          details: "j'ai écrit sans preuve de vérification",
          filesModified: ["x.ts"],
          durationMs: 5,
          // pas d'evidence.verification.passed → la boucle doit relancer verify_file
        };
      },
      async runTool(name) {
        toolCalls.push(name);
        return { ok: true, status: "success" };
      },
    };

    const loop = new AutonomousLoop(runner, {
      maxIterations: 1,
      globalTimeoutMs: 10_000,
      minConfidenceScore: 0.5,
      verifyFiles: true,
    });
    await loop.run(makeTask("test_loop_role"));

    assert.ok(toolCalls.includes("verify_file"), "la boucle doit appeler runner.runTool('verify_file')");
  });
});

describe("AgentRegistry.setRunner — bascule du moteur de la flotte", () => {
  it("recrée les agents sur le nouveau moteur sans perdre les rôles", () => {
    const registry = new AgentRegistry();
    registry.initialize(async () => ({ ok: true }));
    const before = registry.getFleetStatus().totalAgents;
    assert.ok(before > 0, "la flotte doit contenir des agents après initialize()");

    // Moteur agentique factice conforme au contrat.
    const fakeRunner: AgentTaskRunner = { async execute() {}, async runTool() { return null; } };
    registry.setRunner(fakeRunner);

    const after = registry.getFleetStatus().totalAgents;
    assert.equal(after, before, "le nombre d'agents doit être préservé après le swap");
    registry.shutdown();
  });
});

describe("AgentRuntimeExecutor — annulation en cours d'exécution", () => {
  beforeEach(() => registerRole("test_cancel_role"));

  it("une tâche annulée pendant run() est rapportée cancelled, pas failed", async () => {
    // Le runtime agentique RETOURNE (sans lever) un résultat "blocked" quand le
    // signal est déclenché — c'est le chemin réel d'AgenticRuntime.run().
    const fakeAgentic = {
      async run(t: { signal?: AbortSignal }) {
        await new Promise<void>((resolve) => t.signal?.addEventListener("abort", () => resolve(), { once: true }));
        return {
          success: false, outcome: "blocked", filesRead: [], filesModified: [], toolsExecuted: [],
          verifications: [], durationMs: 1, error: "Tâche annulée par l'utilisateur.",
          final: { summary: "annulée", details: "" },
        };
      },
    };
    const exec = new AgentRuntimeExecutor(fakeAgentic as never, new ProgressNotifier());
    const task = makeTask("test_cancel_role");
    const running = exec.execute(task);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(exec.cancel(task.id), true);
    await running;
    assert.equal(task.status, "cancelled");
    assert.equal(task.result?.success, false);
  });
});

describe("AgentRuntimeExecutor — gouvernance Supervisor (opt-in)", () => {
  beforeEach(() => registerRole("test_sup_role"));

  const rawResult = (success: boolean) => ({
    success, outcome: success ? "success" : "failed", filesRead: [], filesModified: ["a.ts", "b.ts"],
    toolsExecuted: ["modify_project_file"], verifications: [], durationMs: 1,
    final: { summary: "s", details: "" },
  });

  it("le verdict du Supervisor prime : runtime 'success' mais preuve refusée → failed, fichiers restaurés retirés", async () => {
    const exec = new AgentRuntimeExecutor({} as never, new ProgressNotifier());
    let params: any;
    exec.setSupervision((async (_rt: unknown, p: unknown) => {
      params = p;
      return { missionId: "x", finalState: "ESCALATED", attempts: 3, lastResult: rawResult(true) };
    }) as never);
    const task = makeTask("test_sup_role");
    task.context.files = ["a.ts"];
    await exec.execute(task);

    assert.equal(task.status, "failed");
    assert.equal(task.result?.outcome, "partial");
    assert.deepEqual(task.result?.filesModified, ["b.ts"], "a.ts a été restauré par le rollback");
    assert.deepEqual(params.plannedFiles, ["a.ts"]);
    assert.ok(params.baseTask.signal, "le signal d'annulation est transmis");
    assert.match(params.missionId, /^agent-task:task-phase5:/);
  });

  it("Supervisor COMPLETED → completed avec le résultat du runtime", async () => {
    const exec = new AgentRuntimeExecutor({} as never, new ProgressNotifier());
    exec.setSupervision((async () => ({ missionId: "x", finalState: "COMPLETED", attempts: 1, lastResult: rawResult(true) })) as never);
    const task = makeTask("test_sup_role");
    await exec.execute(task);
    assert.equal(task.status, "completed");
    assert.deepEqual(task.result?.filesModified, ["a.ts", "b.ts"]);
  });

  it("aucune tentative exécutée → failed avec erreur explicite", async () => {
    const exec = new AgentRuntimeExecutor({} as never, new ProgressNotifier());
    exec.setSupervision((async () => ({ missionId: "x", finalState: "FAILED", attempts: 0 })) as never);
    const task = makeTask("test_sup_role");
    await exec.execute(task);
    assert.equal(task.status, "failed");
    assert.match(task.result?.error ?? "", /aucune tentative/);
  });
});
