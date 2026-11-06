import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'http';
import { createExportRouter } from './export.js';

test('export routes: POST /html returns standalone HTML', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/export', createExportRouter());

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/export/html`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        markdown: '# Mon Titre\n\nContenu généré.',
        title: 'Export Test',
      }),
    });

    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type')?.includes('text/html'));
    const body = await res.text();
    assert.ok(body.includes('<h1>Mon Titre</h1>'));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('export routes: POST /docx returns doc binary attachment', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/export', createExportRouter());

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/export/docx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        markdown: '# Mon Document Word\n\nParagraphe DOCX.',
        title: 'Docx Test',
      }),
    });

    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type')?.includes('application/msword'));
    const arrayBuffer = await res.arrayBuffer();
    assert.ok(arrayBuffer.byteLength > 100);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('export routes: POST /pdf returns 400 when markdown is missing', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/export', createExportRouter());

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/export/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 400);
    const body = await res.json() as any;
    assert.ok(body.error.includes('markdown'));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});


test('export routes: rejects invalid metadata and oversized markdown', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/export', createExportRouter());
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;
  try {
    const invalidTheme = await fetch(`http://127.0.0.1:${port}/api/export/html`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: '# Test', theme: 'unknown' }),
    });
    assert.equal(invalidTheme.status, 400);

    const invalidFilename = await fetch(`http://127.0.0.1:${port}/api/export/pdf`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: '# Test', filename: 'bad\\r\\nInjected: yes' }),
    });
    assert.equal(invalidFilename.status, 400);

    const oversized = await fetch(`http://127.0.0.1:${port}/api/export/html`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: 'x'.repeat(2 * 1024 * 1024 + 1) }),
    });
    assert.equal(oversized.status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('export routes: notebook export rejects unsupported formats and unsafe identifiers', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/export', createExportRouter());
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;
  try {
    const unsafeId = await fetch(`http://127.0.0.1:${port}/api/export/notebook/..%2Fsecret`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format: 'pdf' }),
    });
    assert.equal(unsafeId.status, 400);
    const badFormat = await fetch(`http://127.0.0.1:${port}/api/export/notebook/notebook_1`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format: 'exe' }),
    });
    assert.equal(badFormat.status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});


test('export routes: raw HTML in Markdown is escaped in standalone HTML', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/export', createExportRouter());
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/export/html`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: '<img src=x onerror=alert(1)>\\n\\n<script>alert(1)</script>' }),
    });
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.ok(!body.includes('<img src=x onerror=alert(1)>'));
    assert.ok(!body.includes('<script>alert(1)</script>'));
    assert.ok(body.includes('&lt;script&gt;'));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
