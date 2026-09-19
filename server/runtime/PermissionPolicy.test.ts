/**
 * Tests du modèle de permissions par skill appliqué au runtime.
 *
 * Couvre :
 *   - PermissionPolicy.evaluate/enforce (modes enforce/audit/off)
 *   - fromEnv (Leanna_PERMISSION_MODE / Leanna_GRANTED_PERMISSIONS)
 *   - Application au runtime via ToolRegistry.call
 *   - Propagation des permissions déclarées via SkillAdapter
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  PermissionPolicy,
  PermissionDeniedError,
  ALL_PERMISSIONS,
} from "./PermissionPolicy.js";
import { ToolRegistry } from "./ToolRegistry.js";
import { adaptSkill } from "./compat/SkillAdapter.js";
import { normalizePermissions } from "./types.js";
import type { LegacySkill } from "./compat/SkillAdapter.js";

// ═══════════════════════════════════════════════════════════════════════════════
// normalizePermissions
// ═══════════════════════════════════════════════════════════════════════════════

describe("normalizePermissions", () => {
  it("mappe execute → exec et dédoublonne", () => {
    assert.deepEqual(normalizePermissions(["execute", "exec", "read"]), ["read", "exec"]);
  });

  it("retourne un tableau vide pour undefined", () => {
    assert.deepEqual(normalizePermissions(undefined), []);
  });

  it("trie selon l'ordre canonique", () => {
    assert.deepEqual(
      normalizePermissions(["dangerous", "write", "read", "network"]),
      ["read", "write", "network", "dangerous"]
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PermissionPolicy
// ═══════════════════════════════════════════════════════════════════════════════

describe("PermissionPolicy", () => {
  it("autorise quand toutes les permissions requises sont accordées", () => {
    const policy = new PermissionPolicy({ mode: "enforce", granted: ["read", "write"] });
    const decision = policy.evaluate("write_file", ["write"]);
    assert.equal(decision.allowed, true);
    assert.deepEqual(decision.missing, []);
  });

  it("refuse en mode enforce quand une permission manque", () => {
    const policy = new PermissionPolicy({ mode: "enforce", granted: ["read"] });
    const decision = policy.evaluate("write_file", ["write"]);
    assert.equal(decision.allowed, false);
    assert.deepEqual(decision.missing, ["write"]);
  });

  it("laisse passer mais journalise en mode audit", () => {
    const policy = new PermissionPolicy({ mode: "audit", granted: ["read"] });
    const decision = policy.enforce("write_file", ["write"]);
    assert.equal(decision.allowed, true);
    assert.deepEqual(decision.missing, ["write"]);
    assert.equal(policy.getDenials().length, 1);
  });

  it("ne vérifie rien en mode off", () => {
    const policy = new PermissionPolicy({ mode: "off", granted: [] });
    const decision = policy.evaluate("exec_cmd", ["exec"]);
    assert.equal(decision.allowed, true);
  });

  it("autorise un outil sans permission déclarée", () => {
    const policy = new PermissionPolicy({ mode: "enforce", granted: [] });
    assert.equal(policy.evaluate("noop", []).allowed, true);
    assert.equal(policy.evaluate("noop", undefined).allowed, true);
  });

  it("normalise execute vers exec lors de l'évaluation", () => {
    const policy = new PermissionPolicy({ mode: "enforce", granted: ["exec"] });
    assert.equal(policy.evaluate("legacy", ["execute"]).allowed, true);
  });

  it("grant/revoke modifie le jeu accordé", () => {
    const policy = new PermissionPolicy({ mode: "enforce", granted: ["read"] });
    assert.equal(policy.evaluate("t", ["network"]).allowed, false);
    policy.grant("network");
    assert.equal(policy.evaluate("t", ["network"]).allowed, true);
    policy.revoke("network");
    assert.equal(policy.evaluate("t", ["network"]).allowed, false);
  });

  it("fromEnv lit le mode et les permissions accordées", () => {
    const policy = PermissionPolicy.fromEnv({
      Leanna_PERMISSION_MODE: "enforce",
      Leanna_GRANTED_PERMISSIONS: "read, network",
    } as NodeJS.ProcessEnv);
    assert.equal(policy.getMode(), "enforce");
    assert.deepEqual(policy.getGranted(), ["read", "network"]);
  });

  it("fromEnv accorde toutes les permissions par défaut", () => {
    const policy = PermissionPolicy.fromEnv({} as NodeJS.ProcessEnv);
    assert.equal(policy.getMode(), "enforce");
    assert.deepEqual(policy.getGranted(), normalizePermissions([...ALL_PERMISSIONS]));
  });

  it("fromEnv retombe sur enforce pour un mode invalide", () => {
    const policy = PermissionPolicy.fromEnv({ Leanna_PERMISSION_MODE: "banana" } as NodeJS.ProcessEnv);
    assert.equal(policy.getMode(), "enforce");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ToolRegistry — application au runtime
// ═══════════════════════════════════════════════════════════════════════════════

describe("ToolRegistry + PermissionPolicy", () => {
  function makeRegistry(policy: PermissionPolicy): ToolRegistry {
    const registry = new ToolRegistry({ permissionPolicy: policy, enableMetrics: false });
    registry.register({
      declaration: { name: "read_thing", description: "", parameters: {} },
      handler: async () => "read-ok",
      permissions: ["read"],
    });
    registry.register({
      declaration: { name: "write_thing", description: "", parameters: {} },
      handler: async () => "write-ok",
      permissions: ["write"],
    });
    return registry;
  }

  it("exécute un outil dont la permission est accordée", async () => {
    const registry = makeRegistry(new PermissionPolicy({ mode: "enforce", granted: ["read"] }));
    assert.equal(await registry.call("read_thing", {}), "read-ok");
  });

  it("refuse au runtime un outil dont la permission manque", async () => {
    const registry = makeRegistry(new PermissionPolicy({ mode: "enforce", granted: ["read"] }));
    await assert.rejects(
      () => registry.call("write_thing", {}),
      (err: unknown) => err instanceof PermissionDeniedError && err.missing.includes("write")
    );
  });

  it("applique la politique indépendamment des callerPermissions", async () => {
    // Même si l'appelant prétend avoir "write", la politique runtime prime.
    const registry = makeRegistry(new PermissionPolicy({ mode: "enforce", granted: ["read"] }));
    await assert.rejects(
      () => registry.call("write_thing", {}, { callerPermissions: ["write"] }),
      (err: unknown) => err instanceof PermissionDeniedError
    );
  });

  it("laisse tout passer en mode off", async () => {
    const registry = makeRegistry(new PermissionPolicy({ mode: "off", granted: [] }));
    assert.equal(await registry.call("write_thing", {}), "write-ok");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SkillAdapter — propagation des permissions déclarées
// ═══════════════════════════════════════════════════════════════════════════════

describe("SkillAdapter — permissions déclarées", () => {
  it("utilise les permissions par outil déclarées sur le skill", () => {
    const skill: LegacySkill = {
      name: "demo",
      permissions: ["read"],
      toolPermissions: { danger: ["write", "exec"] },
      declarations: [
        { name: "peek", description: "", parameters: {} },
        { name: "danger", description: "", parameters: {} },
      ],
      handleToolCall: async () => null,
    };

    const defs = adaptSkill(skill);
    const peek = defs.find((d) => d.declaration.name === "peek")!;
    const danger = defs.find((d) => d.declaration.name === "danger")!;

    assert.deepEqual(peek.permissions, ["read"]);
    assert.deepEqual(danger.permissions, ["write", "exec"]);
  });

  it("privilégie la permission déclarée sur la déclaration d'outil", () => {
    const skill: LegacySkill = {
      name: "demo2",
      permissions: ["read"],
      declarations: [{ name: "special", description: "", parameters: {}, permissions: ["network"] }],
      handleToolCall: async () => null,
    };
    const [def] = adaptSkill(skill);
    assert.deepEqual(def.permissions, ["network"]);
  });

  it("retombe sur l'inférence par nom quand rien n'est déclaré", () => {
    const skill: LegacySkill = {
      name: "misc",
      declarations: [{ name: "read_config", description: "", parameters: {} }],
      handleToolCall: async () => null,
    };
    const [def] = adaptSkill(skill);
    assert.ok(def.permissions?.includes("read"));
  });
});
