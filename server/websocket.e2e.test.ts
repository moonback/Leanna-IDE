import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import path from 'path';
import { setSelfRoot, SELF_ROOT } from './utils/selfRoot.js';
import { authenticateToken } from './security.js';
import { createTerminalRouter, setupTerminalWebSocket } from './routes/terminal.js';
import { attachLiveWebSocket, type LiveSocketDeps } from './live/LiveSocketHandler.js';

{
  const __filename = fileURLToPath(import.meta.url);
  const __dirname_local = path.dirname(__filename);
  setSelfRoot(path.resolve(__dirname_local, '..'));
}

function waitForWsOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once('open', resolve);
    ws.once('error', reject);
  });
}

function waitForWsMessage(ws: WebSocket, timeoutMs = 4000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for WebSocket message after ${timeoutMs}ms`));
    }, timeoutMs);

    ws.once('message', (data) => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(data.toString('utf8'));
        resolve(parsed);
      } catch (err) {
        resolve(data.toString('utf8'));
      }
    });
  });
}

// ─── Tests Routeur REST Terminal ─────────────────────────────────────────────

test('terminal REST: GET /terminal/config returns environment configuration', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', createTerminalRouter());

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/terminal/config`);
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.ok(body.shell, 'shell should be defined');
    assert.ok(body.cwd, 'cwd should be defined');
    assert.ok(body.platform, 'platform should be defined');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('terminal REST: GET /terminal/sessions and POST /terminal/close', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', createTerminalRouter());

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;

  try {
    const sessionsRes = await fetch(`http://127.0.0.1:${port}/api/terminal/sessions`);
    assert.equal(sessionsRes.status, 200);
    const sessionsBody = await sessionsRes.json() as any;
    assert.equal(typeof sessionsBody.count, 'number');
    assert.ok(Array.isArray(sessionsBody.sessions));

    const closeRes = await fetch(`http://127.0.0.1:${port}/api/terminal/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(closeRes.status, 200);
    const closeBody = await closeRes.json() as any;
    assert.equal(closeBody.success, true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// ─── Tests WebSocket Terminal ────────────────────────────────────────────────

test('terminal WebSocket: connects, receives welcome message, accepts input & resize', async () => {
  const server = http.createServer();
  const terminalWss = new WebSocketServer({ noServer: true });
  setupTerminalWebSocket(terminalWss, undefined);

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url!, `http://${request.headers.host}`);
    if (url.pathname === '/terminal') {
      terminalWss.handleUpgrade(request, socket, head, (ws) => {
        terminalWss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;

  const ws = new WebSocket(`ws://127.0.0.1:${port}/terminal`);

  try {
    await waitForWsOpen(ws);
    assert.equal(ws.readyState, WebSocket.OPEN);

    // Recevoir le message de bienvenue
    const welcome = await waitForWsMessage(ws, 5000);
    assert.equal(welcome.type, 'output');
    assert.ok(welcome.data.includes('Leanna Terminal') || welcome.data.includes('Working directory'));

    // Envoyer un redimensionnement
    ws.send(JSON.stringify({
      type: 'resize',
      data: { cols: 120, rows: 40 },
    }));

    // Envoyer une commande
    ws.send(JSON.stringify({
      type: 'input',
      data: 'echo "hello_terminal_e2e"',
    }));

    // Recevoir la sortie de la commande
    const output = await waitForWsMessage(ws, 5000);
    assert.equal(output.type, 'output');
    assert.ok(typeof output.data === 'string');
  } finally {
    ws.close();
    await new Promise<void>((resolve) => {
      terminalWss.close(() => server.close(() => resolve()));
    });
  }
});

test('terminal WebSocket: rejects unauthorized connection when token is required and invalid', async () => {
  const server = http.createServer();
  const terminalWss = new WebSocketServer({ noServer: true });
  setupTerminalWebSocket(terminalWss, 'secret-super-token');

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url!, `http://${request.headers.host}`);
    if (url.pathname === '/terminal') {
      terminalWss.handleUpgrade(request, socket, head, (ws) => {
        terminalWss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;

  const ws = new WebSocket(`ws://127.0.0.1:${port}/terminal?token=bad-token`);

  try {
    const closeEvent = await new Promise<{ code: number; reason: string }>((resolve) => {
      ws.on('close', (code, reason) => {
        resolve({ code, reason: reason.toString() });
      });
    });

    assert.equal(closeEvent.code, 1008);
    assert.equal(closeEvent.reason, 'Unauthorized');
  } finally {
    await new Promise<void>((resolve) => {
      terminalWss.close(() => server.close(() => resolve()));
    });
  }
});

// ─── Tests WebSocket /live et /sandbox-watch Handshake & Upgrade ──────────────

test('live & sandbox WebSocket: upgrade auth verification (unauthorized vs authorized)', async () => {
  const server = http.createServer();
  const liveWss = new WebSocketServer({ noServer: true });
  const sandboxWss = new WebSocketServer({ noServer: true });

  const apiToken = 'live-token-secret';

  const mockDeps: LiveSocketDeps = {
    skillManager: {
      getToolDeclarations: () => [],
      handleToolCall: async () => ({ success: true }),
      missionExecutor: null,
    } as any,
    getCurrentProfile: () => ({
      aiName: 'Leanna',
      aiVoice: 'Aoede',
      userName: 'Dev',
      userRole: 'Developer',
      language: 'fr',
      responseStyle: 'Direct',
    }),
    getWorkspaceRoot: () => SELF_ROOT,
    createGeminiAI: () => ({} as any),
    activeGeminiSessions: new Set(),
    browserReadPending: new Map(),
    browserActionPending: new Map(),
  };

  attachLiveWebSocket(liveWss, sandboxWss, mockDeps);

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url!, `http://${request.headers.host}`);
    const pathname = url.pathname;

    if (pathname === '/live' || pathname === '/sandbox-watch') {
      const token = url.searchParams.get('token');
      const authResult = authenticateToken(token, apiToken);
      if (!authResult.ok) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
    }

    if (pathname === '/live') {
      liveWss.handleUpgrade(request, socket, head, (ws) => {
        liveWss.emit('connection', ws, request);
      });
    } else if (pathname === '/sandbox-watch') {
      sandboxWss.handleUpgrade(request, socket, head, (ws) => {
        sandboxWss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;

  // 1. Connexion /live sans token -> Doit être rejetée (401 / erreur de handshake)
  const badLiveWs = new WebSocket(`ws://127.0.0.1:${port}/live`);
  const liveRejected = await new Promise<boolean>((resolve) => {
    badLiveWs.on('error', () => resolve(true));
    badLiveWs.on('open', () => resolve(false));
  });
  assert.equal(liveRejected, true, 'Live WS connection without token should be rejected');

  // 2. Connexion /live avec token valide -> Doit réussir
  const goodLiveWs = new WebSocket(`ws://127.0.0.1:${port}/live?token=${apiToken}`);
  await waitForWsOpen(goodLiveWs);
  assert.equal(goodLiveWs.readyState, WebSocket.OPEN);
  goodLiveWs.close();

  // 3. Connexion /sandbox-watch avec token valide -> Doit réussir
  const sandboxWs = new WebSocket(`ws://127.0.0.1:${port}/sandbox-watch?token=${apiToken}`);
  await waitForWsOpen(sandboxWs);
  assert.equal(sandboxWs.readyState, WebSocket.OPEN);
  sandboxWs.close();

  await new Promise<void>((resolve) => {
    liveWss.close(() => {
      sandboxWss.close(() => {
        server.close(() => resolve());
      });
    });
  });
});
