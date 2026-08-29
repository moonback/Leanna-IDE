import { Router, Request, Response } from 'express';
import { mcpBridge } from '../mcp/index.js';

const router = Router();

// GET /api/mcp/status
router.get('/status', (_req: Request, res: Response) => {
  try {
    const statuses = mcpBridge.getServersStatus();
    const connected = statuses.filter((s: any) => s.status === 'connected').length;
    const total = statuses.length;
    res.json({ status: 'success', connected, total, ok: connected > 0 || total === 0 });
  } catch {
    res.json({ status: 'success', connected: 0, total: 0, ok: true });
  }
});

// GET /api/mcp/servers
router.get('/servers', async (_req: Request, res: Response) => {
  try {
    const statuses = mcpBridge.getServersStatus();
    res.json({ status: 'success', servers: statuses });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/mcp/servers/:id
router.get('/servers/:id', async (req: Request, res: Response) => {
  const serverStatus = mcpBridge.getServerStatus(req.params.id);
  if (!serverStatus) return res.status(404).json({ error: 'Serveur MCP non trouvé' });
  res.json({ status: 'success', server: serverStatus });
});

// POST /api/mcp/servers
router.post('/servers', async (req: Request, res: Response) => {
  try {
    const { id, name, transport, command, args, url, env, disabled, description, autoApprove } = req.body;
    if (!id || !name || !transport) return res.status(400).json({ error: 'id, name et transport sont requis' });
    if (transport === 'stdio' && !command) return res.status(400).json({ error: 'command est requis pour le transport stdio' });
    if (transport === 'sse' && !url) return res.status(400).json({ error: 'url est requis pour le transport sse' });
    await mcpBridge.addServer(id, { name, transport, command, args, url, env, disabled, description, autoApprove });
    const serverStatus = mcpBridge.getServerStatus(id);
    res.json({ status: 'success', server: serverStatus });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/mcp/servers/:id
router.put('/servers/:id', async (req: Request, res: Response) => {
  try {
    const { name, transport, command, args, url, env, disabled, description, autoApprove } = req.body;
    await mcpBridge.updateServer(req.params.id, { name, transport, command, args, url, env, disabled, description, autoApprove });
    const serverStatus = mcpBridge.getServerStatus(req.params.id);
    res.json({ status: 'success', server: serverStatus });
  } catch (e: any) {
    res.status(e.message.includes('non trouvé') ? 404 : 500).json({ error: e.message });
  }
});

// DELETE /api/mcp/servers/:id
router.delete('/servers/:id', async (req: Request, res: Response) => {
  try {
    await mcpBridge.removeServer(req.params.id);
    res.json({ status: 'success', message: `Serveur "${req.params.id}" supprimé` });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/mcp/servers/:id/toggle
router.post('/servers/:id/toggle', async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled (boolean) requis' });
    await mcpBridge.toggleServer(req.params.id, enabled);
    const serverStatus = mcpBridge.getServerStatus(req.params.id);
    res.json({ status: 'success', server: serverStatus });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/mcp/servers/:id/reconnect
router.post('/servers/:id/reconnect', async (req: Request, res: Response) => {
  try {
    await mcpBridge.reconnectServer(req.params.id);
    const serverStatus = mcpBridge.getServerStatus(req.params.id);
    res.json({ status: 'success', server: serverStatus });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/mcp/tools
router.get('/tools', async (_req: Request, res: Response) => {
  try {
    const tools = mcpBridge.getAllTools();
    res.json({ status: 'success', tools });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/mcp/tools/call
router.post('/tools/call', async (req: Request, res: Response) => {
  try {
    const { tool, arguments: args } = req.body;
    if (!tool) return res.status(400).json({ error: 'tool (string) requis' });
    const result = await mcpBridge.callTool(tool, args || {});
    res.json({ status: 'success', ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/mcp/metrics
router.get('/metrics', (_req: Request, res: Response) => {
  try {
    const metrics = mcpBridge.getMetrics();
    const summary = mcpBridge.getMetricsSummary();
    res.json({ status: 'success', metrics, summary });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
