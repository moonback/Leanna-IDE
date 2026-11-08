import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setSelfRoot, resetSelfRoot, getActiveProjectId } from "../utils/selfRoot.js";
import { fetchStartupMemories, fetchStartupConversations } from "./startupMemory.js";
import { ProjectMemory } from "../knowledge/ProjectMemory.js";

function tempProject(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `leanna-${name}-`));
  fs.writeFileSync(path.join(root, "package.json"), "{}");
  test.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

/** Faux client Supabase : applique réellement les filtres .eq / .in sur des lignes en mémoire. */
function fakeSupabase(rows: Record<string, Array<Record<string, any>>>) {
  return {
    from(table: string) {
      let result = [...(rows[table] ?? [])];
      const q: any = {
        select: () => q,
        order: () => q,
        limit: (n: number) => { result = result.slice(0, n); return q; },
        eq: (col: string, v: unknown) => { result = result.filter((r) => r[col] === v); return q; },
        in: (col: string, vs: unknown[]) => { result = result.filter((r) => vs.includes(r[col])); return q; },
        then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: result }).then(ok, ko),
      };
      return q;
    },
  };
}

test("seule la mémoire du workspace actif est injectée, y compris après un changement de workspace", async () => {
  const voxme = tempProject("voxme");
  const leanna = tempProject("leanna-ide");

  setSelfRoot(voxme);
  const voxmeId = getActiveProjectId();
  setSelfRoot(leanna);
  const leannaId = getActiveProjectId();
  assert.notEqual(voxmeId, leannaId);

  const supabase = fakeSupabase({
    memories: [
      { content: "voxme: secret A", project_id: voxmeId },
      { content: "leanna: fait B", project_id: leannaId },
      { content: "global: préférence", project_id: "" },
    ],
    conversations: [
      { title: "conv voxme", project_id: voxmeId },
      { title: "conv leanna", project_id: leannaId },
    ],
  });

  // Projet B actif : rien de A.
  assert.deepEqual(await fetchStartupMemories(supabase, 10), ["leanna: fait B", "global: préférence"]);
  assert.deepEqual((await fetchStartupConversations(supabase, 10)).map((c) => c.title), ["conv leanna"]);

  // Changement de workspace vers A : rien de B.
  setSelfRoot(voxme);
  assert.deepEqual(await fetchStartupMemories(supabase, 10), ["voxme: secret A", "global: préférence"]);
  assert.deepEqual((await fetchStartupConversations(supabase, 10)).map((c) => c.title), ["conv voxme"]);

  // Aucun projet actif : mémoires globales seulement.
  resetSelfRoot();
  assert.deepEqual(await fetchStartupMemories(supabase, 10), ["global: préférence"]);
});

test("ProjectMemory.toContextSummary suit le workspace actif", () => {
  const a = tempProject("pm-a");
  const b = tempProject("pm-b");
  const pm = new ProjectMemory();

  setSelfRoot(a);
  pm.addFact({ content: "Fait exclusif au projet A voxme", category: "decision", tags: [], confidence: 0.9 });
  pm.save();
  assert.match(pm.toContextSummary(), /projet A voxme/);

  // Changement de workspace sans load() explicite : le résumé ne doit plus contenir A.
  setSelfRoot(b);
  assert.doesNotMatch(pm.toContextSummary(), /projet A voxme/);

  setSelfRoot(a);
  assert.match(pm.toContextSummary(), /projet A voxme/);
  resetSelfRoot();
});
