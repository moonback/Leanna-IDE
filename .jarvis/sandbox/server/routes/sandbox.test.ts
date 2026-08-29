import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'http';
import { createSandboxRouter } from './sandbox';

test('sandbox routes: GET /status returns sandbox status', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/sandbox', createSandboxRouter());

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/sandbox/status`);
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(body.status, 'success');
    assert.ok(typeof body.sandbox === 'object');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('sandbox routes: GET /diff returns diffs array', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/sandbox', createSandboxRouter());

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/sandbox/diff`);
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(body.status, 'success');
    assert.ok(Array.isArray(body.diffs));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('sandbox routes: verify-exit-code rejects invalid code', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/sandbox', createSandboxRouter());

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/sandbox/verify-exit-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '000000' }),
    });
    // If SANDBOX_EXIT_CODE is not configured in test env, returns 403
    assert.equal(res.status, 403);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
