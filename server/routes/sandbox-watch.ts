import { WebSocketServer, WebSocket } from 'ws';
import { addWatchClient, startWatching, stopWatching, getWatchClientCount } from '../utils/sandboxWatcher';
import { authenticateToken } from '../security';
import { isSandboxActive } from '../utils/sandbox';

let sandboxWss: WebSocketServer | null = null;

export function initSandboxWatchWSS(): WebSocketServer {
  sandboxWss = new WebSocketServer({ noServer: true });
  
  sandboxWss.on('connection', async (clientWs, req) => {
    const { addWatchClient, startWatching } = await import('../utils/sandboxWatcher');
    console.log('[SandboxWatch] Client connecté');
    addWatchClient(clientWs);
    // Démarrer la surveillance si le sandbox est actif
    if (isSandboxActive()) {
      startWatching();
    }
  });

  return sandboxWss;
}

export function getSandboxWSS(): WebSocketServer | null {
  return sandboxWss;
}

// WebSocket upgrade handler for /sandbox-watch
export function handleSandboxWatchUpgrade(
  request: any,
  socket: any,
  head: any,
  apiToken: string | undefined
): boolean {
  const url = new URL(request.url!, `http://${request.headers.host}`);
  const pathname = url.pathname;

  if (pathname !== '/sandbox-watch') {
    return false;
  }

  const cookieHeader = request.headers.cookie || '';
  const cookies: Record<string, string> = {};
  cookieHeader.split(';').forEach(c => {
    const parts = c.split('=');
    if (parts.length >= 2) {
      cookies[parts[0].trim()] = decodeURIComponent(parts.slice(1).join('='));
    }
  });

  const token = cookies['Leanna_token'] || url.searchParams.get('token');
  const authResult = authenticateToken(token, apiToken);
  if (!authResult.ok) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return true;
  }

  if (sandboxWss) {
    sandboxWss.handleUpgrade(request, socket, head, (ws) => {
      sandboxWss!.emit('connection', ws, request);
    });
  }
  return true;
}

export { addWatchClient, startWatching, stopWatching, getWatchClientCount };