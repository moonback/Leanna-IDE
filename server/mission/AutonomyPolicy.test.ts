import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AutonomyPolicy } from "./AutonomyPolicy.js";

// AUDIT-011 : la racine et .leannaignore suivent le projet actif.
test("AutonomyPolicy: .leannaignore du projet actif appliqué après changement de projet", () => {
  const projectA = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-a-"));
  const projectB = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-b-"));
  fs.writeFileSync(path.join(projectB, ".leannaignore"), "infra/\n");

  let root = "";
  const policy = new AutonomyPolicy({ mode: "auto", workspaceRoot: () => root });
  policy.setToolPermissions([{ name: "write_file", permissions: ["write"] }]);
  const write = () => policy.decide("write_file", { path: "infra/main.tf" }).decision;

  assert.equal(write(), "allow", "sans projet : aucun motif lu dans le dossier courant");
  root = projectA;
  assert.equal(write(), "allow");
  root = projectB;
  assert.equal(write(), "ask", "motif du nouveau projet appliqué");

  // Modification du fichier prise en compte sans redémarrage.
  fs.writeFileSync(path.join(projectB, ".leannaignore"), "docs/\n");
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(path.join(projectB, ".leannaignore"), later, later);
  assert.equal(write(), "allow");
});
