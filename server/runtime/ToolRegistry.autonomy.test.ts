import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ToolRegistry, AutonomyDeniedError } from "./ToolRegistry.js";
import { PermissionPolicy } from "./PermissionPolicy.js";
import { AutonomyPolicy, type AutonomyMode } from "../mission/AutonomyPolicy.js";
import { handleConfirmationResponse } from "../utils/confirmationBridge.js";

// AUDIT-012 : le curseur d'autonomie s'applique à tous les appels du registre
// (voix/chat avec contexte, agents sans contexte), pas seulement aux missions.
const root = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-autonomy-"));

function setup(mode: AutonomyMode) {
  const calls: string[] = [];
  const registry = new ToolRegistry({ permissionPolicy: new PermissionPolicy({ mode: "enforce" }) });
  registry.register({
    declaration: { name: "write_file", description: "écrit", parameters: {} },
    handler: async () => { calls.push("write_file"); return { ok: true }; },
    permissions: ["write"],
  });
  registry.register({
    declaration: { name: "read_file", description: "lit", parameters: {} },
    handler: async () => { calls.push("read_file"); return { ok: true }; },
    permissions: ["read"],
  });
  registry.setAutonomyPolicy(new AutonomyPolicy({ mode, workspaceRoot: root }));
  return { registry, calls };
}

const approving = (requests: any[]) => ({
  emitToClient: (d: any) => { requests.push(d); handleConfirmationResponse(d.requestId, true); },
});

test("suggest : écriture refusée pour un agent et pour la voix, lecture autorisée", async () => {
  const { registry, calls } = setup("suggest");
  await assert.rejects(registry.call("write_file", {}, { agentId: "coder" }), AutonomyDeniedError);
  await assert.rejects(registry.call("write_file", {}, { context: approving([]) }), AutonomyDeniedError);
  await registry.call("read_file", {});
  assert.deepEqual(calls, ["read_file"]);
});

test("ask : sans canal d'approbation refus, avec canal approbation puis exécution", async () => {
  const { registry, calls } = setup("ask");
  await assert.rejects(registry.call("write_file", {}), /Aucun canal d'approbation/);
  const requests: any[] = [];
  await registry.call("write_file", {}, { context: approving(requests) });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].operation, "tool-call");
  assert.deepEqual(calls, ["write_file"]);
});

test("autonomyApproved (Executor) et dry-run ne redemandent pas", async () => {
  const { registry, calls } = setup("ask");
  await registry.call("write_file", {}, { autonomyApproved: true });
  const simulated = await registry.call("write_file", {}, { dryRun: true });
  assert.ok(simulated, "la simulation doit répondre");
  assert.deepEqual(calls, ["write_file"]);
});
