import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "http";
import { createBackupRouter } from "./backupRouter.js";

async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use("/api/notebooks", createBackupRouter());
  const server: Server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Adresse de test indisponible.");
  try {
    await run(`http://127.0.0.1:${address.port}/api/notebooks`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("backup API: refuse les identifiants de restauration contenant un chemin", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/backup/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ backupId: "../outside", notebookId: "notebook-1" }),
    });
    assert.equal(response.status, 400);
    const payload = await response.json() as { status: string; error: string };
    assert.equal(payload.status, "error");
    assert.match(payload.error, /backupId/);
  });
});

test("backup API: refuse les identifiants de notebook mal typés", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/backup/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ backupId: "backup-123", notebookId: 42 }),
    });
    assert.equal(response.status, 400);
  });
});

test("backup API: valide les bornes de configuration avant mutation", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/backup/config`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxBackups: 0 }),
    });
    assert.equal(response.status, 400);
    const payload = await response.json() as { status: string };
    assert.equal(payload.status, "error");
  });
});

test("backup API: refuse les propriétés inconnues et les patchs vides", async () => {
  await withServer(async (baseUrl) => {
    for (const body of [{}, { enabled: true, backupDir: "/tmp/outside" }]) {
      const response = await fetch(`${baseUrl}/backup/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
    }
  });
});
