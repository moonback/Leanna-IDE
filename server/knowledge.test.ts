import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { knowledgeRouter } from './routes/knowledge/index.js';
import { getDocumentStore } from './knowledge/DocumentStore.js';
import { knowledgeGraph } from './knowledge/KnowledgeGraph.js';
import { projectMemory } from './knowledge/ProjectMemory.js';
import { astCallGraph } from './knowledge/ASTCallGraph.js';
import { setSelfRoot } from './utils/selfRoot.js';

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

test('getDocumentStore isolates documents per active workspace', () => {
  const rootA = path.join(process.cwd(), '.tmp-docstore-a');
  const rootB = path.join(process.cwd(), '.tmp-docstore-b');

  const storeA = getDocumentStore(rootA);
  const storeB = getDocumentStore(rootB);

  assert.notStrictEqual(storeA, storeB);
  assert.notEqual(storeA['filePath'], storeB['filePath']);
});

test('switching workspace clears knowledge graph and project memory data', () => {
  const rootA = path.join(process.cwd(), '.tmp-knowledge-a');
  const rootB = path.join(process.cwd(), '.tmp-knowledge-b');

  fs.mkdirSync(rootA, { recursive: true });
  fs.mkdirSync(rootB, { recursive: true });
  fs.mkdirSync(path.join(rootA, '.Leanna'), { recursive: true });
  fs.mkdirSync(path.join(rootB, '.Leanna'), { recursive: true });

  knowledgeGraph.update([
    {
      path: 'src/test.ts',
      name: 'test.ts',
      extension: '.ts',
      size: 42,
      lines: 10,
      lastModified: new Date().toISOString(),
      imports: [],
      exports: [],
      entities: [],
      dependencies: [],
      dependents: [],
    },
  ]);
  projectMemory.addFact({
    content: 'Architecture du test A',
    category: 'architecture',
    tags: ['test-a'],
    sourceFile: 'src/test.ts',
    confidence: 0.9,
    isStructural: true,
  });

  setSelfRoot(rootB);

  assert.equal(knowledgeGraph.getStats().totalFiles, 0);
  assert.equal(projectMemory.getAllFacts().length, 0);
  assert.equal(astCallGraph.getStats().totalNodes, 0);

  fs.rmSync(rootA, { recursive: true, force: true });
  fs.rmSync(rootB, { recursive: true, force: true });
});
