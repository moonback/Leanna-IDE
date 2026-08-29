import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { knowledgeRouter } from './routes/knowledge/index.js';

test('GET /api/knowledge/health returns knowledge system health structure', async () => {
  const app = express();
  app.use('/api/knowledge', knowledgeRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as { port: number };

  try {
    const res = await fetch(`http://127.0.0.1:${address.port}/api/knowledge/health`);
    assert.equal(res.status, 200);

    const data: any = await res.json();
    assert.equal(data.status, 'success');
    assert.ok(data.health);
    assert.ok(data.knowledgeGraph);
    assert.ok(data.dependencyGraph);
    assert.ok(data.projectMemory);
    assert.ok(data.workspace);
    assert.equal(typeof data.health.overall, 'string');
    assert.equal(typeof data.projectMemory.totalFacts, 'number');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
