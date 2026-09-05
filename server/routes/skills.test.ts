import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'http';
import skillsRouter from './skills.js';

test('skills routes: GET / returns skills list', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/skills', skillsRouter);

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/skills`);
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.ok(Array.isArray(body.skills));
    assert.ok(body.skills.length > 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('skills routes: GET / returns skills with required properties', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/skills', skillsRouter);

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/skills`);
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    
    // Vérifier que chaque skill a les propriétés requises
    for (const skill of body.skills) {
      assert.ok(skill.id, 'Skill should have an id');
      assert.ok(skill.name, 'Skill should have a name');
      assert.ok(skill.icon, 'Skill should have an icon');
      assert.ok(skill.status, 'Skill should have a status');
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('skills routes: GET / includes core skills', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/skills', skillsRouter);

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/skills`);
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    
    const skillIds = body.skills.map((s: any) => s.id);
    
    // Vérifier que les skills de base sont présents
    assert.ok(skillIds.includes('time'), 'Should include time skill');
    assert.ok(skillIds.includes('github'), 'Should include github skill');
    assert.ok(skillIds.includes('memory'), 'Should include memory skill');
    assert.ok(skillIds.includes('automation'), 'Should include automation skill');
    assert.ok(skillIds.includes('codebase'), 'Should include codebase skill');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('skills routes: GET / sets memory status based on Supabase config', async () => {
  // Sauvegarder les valeurs d'origine
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  // Test sans Supabase
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  const app = express();
  app.use(express.json());
  app.use('/api/skills', skillsRouter);

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/skills`);
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    
    const memorySkill = body.skills.find((s: any) => s.id === 'memory');
    assert.ok(memorySkill);
    assert.equal(memorySkill.status, 'requires_auth');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    
    // Restaurer les valeurs d'origine
    if (originalUrl) process.env.SUPABASE_URL = originalUrl;
    if (originalKey) process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

test('skills routes: GET / sets memory status to authenticated when Supabase configured', async () => {
  // Configurer Supabase pour ce test
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

  const app = express();
  app.use(express.json());
  app.use('/api/skills', skillsRouter);

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/skills`);
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    
    const memorySkill = body.skills.find((s: any) => s.id === 'memory');
    assert.ok(memorySkill);
    assert.equal(memorySkill.status, 'authenticated');
    
    const historySkill = body.skills.find((s: any) => s.id === 'history');
    assert.ok(historySkill);
    assert.equal(historySkill.status, 'authenticated');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    
    // Restaurer les valeurs d'origine
    if (originalUrl) {
      process.env.SUPABASE_URL = originalUrl;
    } else {
      delete process.env.SUPABASE_URL;
    }
    if (originalKey) {
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    } else {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    }
  }
});
