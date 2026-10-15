import test from "node:test";
import assert from "node:assert/strict";
import { ToolRegistry } from "./ToolRegistry.js";
import { PermissionPolicy } from "./PermissionPolicy.js";

function fileRegistry() {
  const files = new Map<string, string>([["a.ts", "v1"]]);
  const registry = new ToolRegistry({ permissionPolicy: new PermissionPolicy({ mode: "off" }) });
  registry.register({
    declaration: { name: "read_project_file", description: "lit", parameters: { path: "string" } },
    handler: async (a) => ({ content: files.get(String(a.path)) ?? "" }),
    permissions: ["read"],
  });
  registry.register({
    declaration: { name: "modify_project_file", description: "écrit", parameters: { path: "string", content: "string" } },
    handler: async (a) => {
      files.set(String(a.path), String(a.content));
      return { ok: true };
    },
    permissions: ["write"],
  });
  registry.register({
    declaration: { name: "run_project_command", description: "exécute", parameters: { cmd: "string" } },
    handler: async () => {
      files.set("a.ts", "generated");
      return { ok: true };
    },
    permissions: ["exec"],
  });
  return registry;
}

const read = async (r: ToolRegistry) => ((await r.call("read_project_file", { path: "a.ts" })) as { content: string }).content;

test("a read right after a write observes the new content (read cache invalidated)", async () => {
  const registry = fileRegistry();
  assert.equal(await read(registry), "v1");
  await registry.call("modify_project_file", { path: "a.ts", content: "v2" });
  assert.equal(await read(registry), "v2");
});

test("an exec tool also invalidates the read cache", async () => {
  const registry = fileRegistry();
  assert.equal(await read(registry), "v1");
  await registry.call("run_project_command", { cmd: "codegen" });
  assert.equal(await read(registry), "generated");
});

test("repeated reads without a write are still served from the cache", async () => {
  const registry = fileRegistry();
  let runs = 0;
  registry.register({
    declaration: { name: "list_project_files", description: "liste", parameters: {} },
    handler: async () => ++runs,
    permissions: ["read"],
  });
  await registry.call("list_project_files", {});
  await registry.call("list_project_files", {});
  assert.equal(runs, 1);
});
