import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'http';
import systemRouter, { cpuPercent } from './system.js';

test('cpuPercent: calcule l\'occupation entre deux échantillons', () => {
  assert.equal(cpuPercent({ idle: 100, total: 200 }, { idle: 150, total: 400 }), 75);
  assert.equal(cpuPercent({ idle: 0, total: 0 }, { idle: 0, total: 0 }), 0);
  // Compteurs incohérents : borné à [0, 100]
  assert.equal(cpuPercent({ idle: 0, total: 100 }, { idle: 300, total: 200 }), 0);
});

test('system routes: GET /metrics renvoie CPU et mémoire', async () => {
  const app = express();
  app.use('/api/system', systemRouter);

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/system/metrics`);
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.ok(body.cpu.percent >= 0 && body.cpu.percent <= 100);
    assert.ok(body.cpu.cores >= 1);
    assert.ok(body.memory.totalMB > 0);
    assert.ok(body.memory.percent > 0 && body.memory.percent <= 100);
    assert.ok(body.process.rssMB > 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
