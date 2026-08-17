/**
 * Routes API pour la persistance des agents personnalisés dans .jarvis/custom-agents.json
 */

import type { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { SELF_ROOT } from "../utils/selfRoot";

function getAgentsFilePath(): string {
  return path.join(SELF_ROOT, ".jarvis", "custom-agents.json");
}

function ensureDir() {
  const dir = path.join(SELF_ROOT, ".jarvis");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readAgents(): any[] {
  const filePath = getAgentsFilePath();
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeAgents(agents: any[]) {
  ensureDir();
  fs.writeFileSync(getAgentsFilePath(), JSON.stringify(agents, null, 2), "utf-8");
}

/** GET /api/custom-agents — Liste tous les agents */
export function handleListAgents(_req: Request, res: Response) {
  try {
    const agents = readAgents();
    res.json({ success: true, agents });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

/** POST /api/custom-agents — Créer un nouvel agent */
export function handleCreateAgent(req: Request, res: Response) {
  try {
    const draft = req.body;
    if (!draft?.name || !draft?.role) {
      return res.status(400).json({ error: "name et role sont requis" });
    }
    const agents = readAgents();
    const now = new Date().toISOString();
    const agent = {
      ...draft,
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: now,
      updatedAt: now,
    };
    agents.push(agent);
    writeAgents(agents);
    res.json({ success: true, agent });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

/** PUT /api/custom-agents/:id — Mettre à jour un agent */
export function handleUpdateAgent(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const updates = req.body;
    const agents = readAgents();
    const idx = agents.findIndex((a: any) => a.id === id);
    if (idx === -1) return res.status(404).json({ error: "Agent non trouvé" });

    agents[idx] = { ...agents[idx], ...updates, updatedAt: new Date().toISOString() };
    writeAgents(agents);
    res.json({ success: true, agent: agents[idx] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

/** DELETE /api/custom-agents/:id — Supprimer un agent */
export function handleDeleteAgent(req: Request, res: Response) {
  try {
    const { id } = req.params;
    let agents = readAgents();
    const before = agents.length;
    agents = agents.filter((a: any) => a.id !== id);
    if (agents.length === before) return res.status(404).json({ error: "Agent non trouvé" });

    writeAgents(agents);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

/** POST /api/custom-agents/import — Importer des agents depuis JSON */
export function handleImportAgents(req: Request, res: Response) {
  try {
    const imported = req.body?.agents;
    if (!Array.isArray(imported)) return res.status(400).json({ error: "Format invalide, attendu { agents: [...] }" });

    const agents = readAgents();
    let count = 0;
    const now = new Date().toISOString();
    for (const item of imported) {
      if (item?.name && item?.role) {
        agents.push({
          ...item,
          id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${count}`,
          createdAt: now,
          updatedAt: now,
        });
        count++;
      }
    }
    writeAgents(agents);
    res.json({ success: true, count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
