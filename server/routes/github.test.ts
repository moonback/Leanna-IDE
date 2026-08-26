import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'http';
import { createGithubRouter } from './github';

test('github routes: GET /issues validates missing params', async () => {
  const mockSkillManager: any = {
    handleToolCall: async () => ({ status: 'success' }),
  };

  const app = express();
  app.use(express.json());
  app.use('/api/github', createGithubRouter(mockSkillManager));

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/github/issues`);
    assert.equal(res.status, 400);
    const body = await res.json() as any;
    assert.ok(body.error.includes('owner'));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('github routes: GET /repos delegates to skillManager', async () => {
  let calledTool = '';
  const mockSkillManager: any = {
    handleToolCall: async (name: string) => {
      calledTool = name;
      return { repos: [{ name: 'jarvis-os' }] };
    },
  };

  const app = express();
  app.use(express.json());
  app.use('/api/github', createGithubRouter(mockSkillManager));

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/github/repos`);
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(calledTool, 'list_github_repos');
    assert.equal(body.repos[0].name, 'jarvis-os');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
