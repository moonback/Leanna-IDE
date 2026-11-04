import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { CheckpointManager, makeNodeFileGateway, type FileGateway } from "./CheckpointManager.js";

/** In-memory FileGateway for deterministic tests (no real disk for content). */
function memGateway(initial: Record<string, string> = {}): FileGateway & { store: Map<string, string> } {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    store,
    exists: (p) => store.has(p),
    read: (p) => {
      const v = store.get(p);
      if (v === undefined) throw new Error(`missing ${p}`);
      return v;
    },
    write: (p, content) => void store.set(p, content),
    remove: (p) => void store.delete(p),
  };
}

function cpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "leanna-cp-"));
}

test("rollback restores modified file content", () => {
  const gw = memGateway({ "a.ts": "original" });
  const mgr = new CheckpointManager({ gateway: gw, dirOverride: cpDir() });

  const cp = mgr.snapshot(["a.ts"]);
  gw.write("a.ts", "modified");
  assert.equal(gw.store.get("a.ts"), "modified");

  mgr.rollback(cp.id);
  assert.equal(gw.store.get("a.ts"), "original");
});

test("rollback deletes a file that did not exist at snapshot time", () => {
  const gw = memGateway({});
  const mgr = new CheckpointManager({ gateway: gw, dirOverride: cpDir() });

  const cp = mgr.snapshot(["new.ts"]); // file absent at snapshot
  gw.write("new.ts", "created during act");
  assert.equal(gw.exists("new.ts"), true);

  mgr.rollback(cp.id);
  assert.equal(gw.exists("new.ts"), false, "the created file is removed on rollback");
});

test("commit makes rollback impossible", () => {
  const gw = memGateway({ "a.ts": "v1" });
  const mgr = new CheckpointManager({ gateway: gw, dirOverride: cpDir() });

  const cp = mgr.snapshot(["a.ts"]);
  gw.write("a.ts", "v2");
  mgr.commit(cp.id);

  assert.throws(() => mgr.rollback(cp.id), /committé/);
  assert.equal(gw.store.get("a.ts"), "v2", "committed change is preserved");
});

test("changedFiles detects modifications and creations against the snapshot", () => {
  const gw = memGateway({ "a.ts": "one", "b.ts": "two" });
  const mgr = new CheckpointManager({ gateway: gw, dirOverride: cpDir() });

  const cp = mgr.snapshot(["a.ts", "b.ts", "c.ts"]);
  assert.deepEqual(mgr.changedFiles(cp.id), []);

  gw.write("a.ts", "one-modified"); // modification
  gw.write("c.ts", "created"); // creation of a file absent at snapshot
  const changed = mgr.changedFiles(cp.id).sort();
  assert.deepEqual(changed, ["a.ts", "c.ts"]);
});

test("rollback is idempotent", () => {
  const gw = memGateway({ "a.ts": "orig" });
  const mgr = new CheckpointManager({ gateway: gw, dirOverride: cpDir() });
  const cp = mgr.snapshot(["a.ts"]);
  gw.write("a.ts", "changed");
  mgr.rollback(cp.id);
  mgr.rollback(cp.id); // second call is a no-op
  assert.equal(gw.store.get("a.ts"), "orig");
});

test("checkpoints persist and hydrate from disk across instances", () => {
  const dir = cpDir();
  const gw = memGateway({ "a.ts": "disk-orig" });
  const mgr1 = new CheckpointManager({ gateway: gw, dirOverride: dir });
  const cp = mgr1.snapshot(["a.ts"], { missionId: "m1", label: "before-edit" });

  // Fresh manager sharing the same gateway hydrates the checkpoint from disk.
  const mgr2 = new CheckpointManager({ gateway: gw, dirOverride: dir });
  assert.ok(mgr2.get(cp.id));
  gw.write("a.ts", "edited");
  mgr2.rollback(cp.id);
  assert.equal(gw.store.get("a.ts"), "disk-orig");

  fs.rmSync(dir, { recursive: true, force: true });
});

test("captureFile journals a dynamically discovered existing file before its first write", () => {
  const gw = memGateway({ "planned.ts": "planned", "discovered.ts": "original-discovered" });
  const mgr = new CheckpointManager({ gateway: gw, dirOverride: cpDir() });
  const cp = mgr.snapshot(["planned.ts"]);
  assert.equal(mgr.captureFile(cp.id, "discovered.ts"), true);
  assert.equal(mgr.captureFile(cp.id, "discovered.ts"), false, "capture is idempotent");
  gw.write("discovered.ts", "changed");
  mgr.rollback(cp.id);
  assert.equal(gw.store.get("discovered.ts"), "original-discovered");
});

test("captureFile journals a dynamically discovered new file so rollback removes it", () => {
  const gw = memGateway();
  const mgr = new CheckpointManager({ gateway: gw, dirOverride: cpDir() });
  const cp = mgr.snapshot([]);
  mgr.captureFile(cp.id, "created-later.ts");
  gw.write("created-later.ts", "created");
  mgr.rollback(cp.id);
  assert.equal(gw.exists("created-later.ts"), false);
});

test("captureFile refuses to mutate a committed checkpoint", () => {
  const mgr = new CheckpointManager({ gateway: memGateway(), dirOverride: cpDir() });
  const cp = mgr.snapshot([]);
  mgr.commit(cp.id);
  assert.throws(() => mgr.captureFile(cp.id, "late.ts"), /non ouvert/);
});

test("rollback restores unaffected files even when one file write fails, then can be retried", () => {
  const gw = memGateway({ "a.ts": "a0", "b.ts": "b0" });
  const originalWrite = gw.write;
  let failOnce = true;
  gw.write = (filePath, content) => {
    if (filePath === "b.ts" && failOnce) {
      failOnce = false;
      throw new Error("file is temporarily locked");
    }
    originalWrite(filePath, content);
  };
  const mgr = new CheckpointManager({ gateway: gw, dirOverride: cpDir() });
  const cp = mgr.snapshot(["a.ts", "b.ts"]);
  gw.write = originalWrite;
  gw.write("a.ts", "a1");
  gw.write("b.ts", "b1");

  // Restore order is reversed: b fails, but a must still be restored.
  gw.write = (filePath, content) => {
    if (filePath === "b.ts" && failOnce) {
      failOnce = false;
      throw new Error("file is temporarily locked");
    }
    originalWrite(filePath, content);
  };
  assert.throws(() => mgr.rollback(cp.id), /Rollback incomplet/);
  assert.equal(gw.store.get("a.ts"), "a0");
  assert.equal(gw.store.get("b.ts"), "b1");
  assert.equal(mgr.get(cp.id)?.status, "open");

  gw.write = originalWrite;
  mgr.rollback(cp.id);
  assert.equal(gw.store.get("b.ts"), "b0");
  assert.equal(mgr.get(cp.id)?.status, "rolledback");
});


test("recursive directory snapshot restores nested files and empty directories", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-workspace-"));
  const folder = path.join(workspace, "src", "feature");
  fs.mkdirSync(path.join(folder, "empty"), { recursive: true });
  fs.writeFileSync(path.join(folder, "index.ts"), "export const before = true;", "utf8");
  const mgr = new CheckpointManager({ gateway: makeNodeFileGateway(), dirOverride: cpDir() });
  const cp = mgr.snapshot([]);
  mgr.capturePath(cp.id, folder);

  fs.rmSync(folder, { recursive: true, force: true });
  assert.equal(fs.existsSync(folder), false);
  mgr.rollback(cp.id);

  assert.equal(fs.readFileSync(path.join(folder, "index.ts"), "utf8"), "export const before = true;");
  assert.equal(fs.statSync(path.join(folder, "empty")).isDirectory(), true);
  assert.deepEqual(mgr.changedFiles(cp.id), []);
  fs.rmSync(workspace, { recursive: true, force: true });
});

test("rollback removes newly-created empty directories but never recursively deletes unexpected files", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-workspace-"));
  const newFolder = path.join(workspace, "new", "nested");
  const mgr = new CheckpointManager({ gateway: makeNodeFileGateway(), dirOverride: cpDir() });
  const cp = mgr.snapshot([]);
  mgr.capturePath(cp.id, newFolder);
  fs.mkdirSync(newFolder, { recursive: true });
  fs.writeFileSync(path.join(newFolder, "untracked.txt"), "keep me", "utf8");

  assert.throws(() => mgr.rollback(cp.id), /Rollback incomplet/);
  assert.equal(fs.readFileSync(path.join(newFolder, "untracked.txt"), "utf8"), "keep me");
  assert.equal(mgr.get(cp.id)?.status, "open");
  fs.rmSync(workspace, { recursive: true, force: true });
});


test("rollback removes a newly-created empty directory", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-workspace-"));
  const newFolder = path.join(workspace, "new", "nested");
  const mgr = new CheckpointManager({ gateway: makeNodeFileGateway(), dirOverride: cpDir() });
  const cp = mgr.snapshot([]);
  mgr.capturePath(cp.id, newFolder);
  fs.mkdirSync(newFolder, { recursive: true });

  mgr.rollback(cp.id);
  assert.equal(fs.existsSync(newFolder), false);
  assert.equal(fs.existsSync(path.join(workspace, "new")), false);
  assert.deepEqual(mgr.changedFiles(cp.id), []);
  fs.rmSync(workspace, { recursive: true, force: true });
});


test("rollback reverses a directory move before restoring nested file snapshots", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-workspace-"));
  const source = path.join(workspace, "src", "feature");
  const destination = path.join(workspace, "archive", "feature");
  fs.mkdirSync(path.join(source, "empty"), { recursive: true });
  fs.writeFileSync(path.join(source, "index.ts"), "export const moved = true;", "utf8");

  const mgr = new CheckpointManager({ gateway: makeNodeFileGateway(), dirOverride: cpDir() });
  const cp = mgr.snapshot([]);
  mgr.captureRename(cp.id, source, destination);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.renameSync(source, destination);

  mgr.rollback(cp.id);
  assert.equal(fs.readFileSync(path.join(source, "index.ts"), "utf8"), "export const moved = true;");
  assert.equal(fs.statSync(path.join(source, "empty")).isDirectory(), true);
  assert.equal(fs.existsSync(destination), false);
  assert.deepEqual(mgr.changedFiles(cp.id), []);
  fs.rmSync(workspace, { recursive: true, force: true });
});

test("rollback reverses a file rename and restores a pre-existing destination", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-workspace-"));
  const source = path.join(workspace, "before.txt");
  const destination = path.join(workspace, "after.txt");
  fs.writeFileSync(source, "source-original", "utf8");
  fs.writeFileSync(destination, "destination-original", "utf8");

  const mgr = new CheckpointManager({ gateway: makeNodeFileGateway(), dirOverride: cpDir() });
  const cp = mgr.snapshot([]);
  mgr.captureRename(cp.id, source, destination);
  fs.renameSync(source, destination);

  mgr.rollback(cp.id);
  assert.equal(fs.readFileSync(source, "utf8"), "source-original");
  assert.equal(fs.readFileSync(destination, "utf8"), "destination-original");
  assert.deepEqual(mgr.changedFiles(cp.id), []);
  fs.rmSync(workspace, { recursive: true, force: true });
});


test("rollback removes files and subdirectories created after a directory move", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-workspace-"));
  const source = path.join(workspace, "src", "feature");
  const destination = path.join(workspace, "archive", "feature");
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, "original.ts"), "original", "utf8");

  const mgr = new CheckpointManager({ gateway: makeNodeFileGateway(), dirOverride: cpDir() });
  const cp = mgr.snapshot([]);
  mgr.captureRename(cp.id, source, destination);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.renameSync(source, destination);

  const movedFile = path.join(destination, "original.ts");
  mgr.capturePath(cp.id, movedFile);
  fs.writeFileSync(movedFile, "modified after move", "utf8");

  const addedFile = path.join(destination, "added.ts");
  const addedDirectory = path.join(destination, "generated");
  mgr.capturePath(cp.id, addedFile);
  fs.writeFileSync(addedFile, "generated", "utf8");
  mgr.capturePath(cp.id, addedDirectory);
  fs.mkdirSync(addedDirectory, { recursive: true });
  const nestedFile = path.join(addedDirectory, "nested.ts");
  mgr.capturePath(cp.id, nestedFile);
  fs.writeFileSync(nestedFile, "nested", "utf8");

  mgr.rollback(cp.id);
  assert.equal(fs.readFileSync(path.join(source, "original.ts"), "utf8"), "original");
  assert.equal(fs.existsSync(path.join(source, "added.ts")), false);
  assert.equal(fs.existsSync(path.join(source, "generated")), false);
  assert.equal(fs.existsSync(destination), false);
  assert.deepEqual(mgr.changedFiles(cp.id), []);
  fs.rmSync(workspace, { recursive: true, force: true });
});


test("recursive snapshots fail closed on symbolic links", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-workspace-"));
  const outside = path.join(workspace, "outside.txt");
  const link = path.join(workspace, "link.txt");
  fs.writeFileSync(outside, "outside", "utf8");
  fs.symlinkSync(outside, link);

  const mgr = new CheckpointManager({ gateway: makeNodeFileGateway(), dirOverride: cpDir() });
  const cp = mgr.snapshot([]);
  assert.throws(() => mgr.capturePath(cp.id, link), /Lien symbolique/);
  assert.equal(fs.readFileSync(outside, "utf8"), "outside");
  fs.rmSync(workspace, { recursive: true, force: true });
});
