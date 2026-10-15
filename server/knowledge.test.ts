import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { knowledgeRouter } from './routes/knowledge/index.js';
import { getDocumentStore } from './knowledge/DocumentStore.js';
import { knowledgeGraph } from './knowledge/KnowledgeGraph.js';
import { projectMemory } from './knowledge/ProjectMemory.js';
import { astCallGraph } from './knowledge/ASTCallGraph.js';
import { setSelfRoot } from './utils/selfRoot.js';
import { setDocumentExtractionEnabled } from './knowledge/knowledgeSettings.js';
import type { FileNode } from './knowledge/types.js';

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

test('POST /api/knowledge/reindex also reindexes project documents', async () => {
  const root = path.join(process.cwd(), '.tmp-knowledge-reindex-docs');
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(path.join(root, '.Leanna'), { recursive: true });
  fs.writeFileSync(path.join(root, 'README.md'), '# Projet\n\nContenu documentaire pour la vérification du reindex.\n');
  setSelfRoot(root);
  // L'extraction documentaire est désactivée par défaut (opt-in par projet).
  setDocumentExtractionEnabled(true);

  const app = express();
  app.use(express.json());
  app.use('/api/knowledge', knowledgeRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as { port: number };

  try {
    const res = await fetch(`http://127.0.0.1:${address.port}/api/knowledge/reindex`, { method: 'POST' });
    assert.equal(res.status, 200);

    const data: any = await res.json();
    assert.equal(data.status, 'success');

    const store = getDocumentStore(root);
    const docs = store.getAllDocuments();
    assert.ok(docs.some((doc) => doc.fileName === 'README.md'));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('POST /api/knowledge/reindex indexes pdf files from workspace', async () => {
  const root = path.join(process.cwd(), '.tmp-knowledge-pdf-docs');
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(path.join(root, '.Leanna'), { recursive: true });

  const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n5 0 obj\n<< /Length 44 >>\nstream\nBT\n/F1 24 Tf\n100 700 Td\n(Hello World) Tj\nET\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000213 00000 n \n0000000299 00000 n \ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n393\n%%EOF');
  fs.writeFileSync(path.join(root, 'sample.pdf'), pdfBytes);
  setSelfRoot(root);
  // L'extraction documentaire est désactivée par défaut (opt-in par projet).
  setDocumentExtractionEnabled(true);

  const app = express();
  app.use(express.json());
  app.use('/api/knowledge', knowledgeRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as { port: number };

  try {
    const res = await fetch(`http://127.0.0.1:${address.port}/api/knowledge/reindex`, { method: 'POST' });
    assert.equal(res.status, 200);

    const store = getDocumentStore(root);
    const docs = store.getAllDocuments();
    assert.ok(docs.some((doc) => doc.fileName === 'sample.pdf'));
    const pdfDoc = docs.find((doc) => doc.fileName === 'sample.pdf');
    assert.ok(pdfDoc?.extractedText?.toLowerCase().includes('hello world'));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(root, { recursive: true, force: true });
  }
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
      language: 'typescript',
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

test('KnowledgeGraph résout les imports ESM ./x.js vers x.ts et remplit dependents', () => {
  // Racine temporaire hors du dépôt : update() persiste le graphe (écriture
  // débouncée) dans <SELF_ROOT>/.project-knowledge.json — ne jamais écraser
  // l'index réel du projet.
  setSelfRoot(fs.mkdtempSync(path.join(os.tmpdir(), 'leanna-kg-deps-')));

  const node = (p: string, imports: string[]): FileNode => ({
    path: p,
    name: path.posix.basename(p),
    extension: '.ts',
    size: 10,
    lines: 1,
    lastModified: new Date().toISOString(),
    imports,
    exports: [],
    entities: [],
    language: 'typescript',
  });

  knowledgeGraph.update([
    node('server/knowledge/a.ts', ['./types.js', '../utils/log', 'node:fs', 'express']),
    node('server/knowledge/types.ts', []),
    node('server/utils/log/index.ts', []),
  ]);

  assert.deepEqual(knowledgeGraph.getDependents('server/knowledge/types.ts'), ['server/knowledge/a.ts']);
  assert.deepEqual(knowledgeGraph.getDependents('server/utils/log/index.ts'), ['server/knowledge/a.ts']);
  // dependencies ne contient que les fichiers internes résolus (pas les paquets externes)
  assert.deepEqual(knowledgeGraph.getDependencies('server/knowledge/a.ts'), [
    'server/knowledge/types.ts',
    'server/utils/log/index.ts',
  ]);
  assert.deepEqual(knowledgeGraph.getDependencies('server/knowledge/types.ts'), []);
});
