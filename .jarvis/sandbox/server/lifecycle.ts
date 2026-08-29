import type { Server as HttpServer } from "http";
import type { WebSocketServer } from "ws";
import type { AgentRuntime } from "./runtime/AgentRuntime";
import type { Observability } from "./runtime/Observability";
import type { ProjectMemory } from "./knowledge/ProjectMemory";
import type { KnowledgeGraph } from "./knowledge/KnowledgeGraph";
import type { McpBridge } from "./mcp/McpBridge";

export interface GracefulShutdownDeps {
  server: HttpServer;
  wss: WebSocketServer;
  runtimeV2: AgentRuntime;
  observability: Observability;
  activeGeminiSessions: Set<{ close(): void }>;
  projectMemory: ProjectMemory;
  knowledgeGraph: KnowledgeGraph;
  mcpBridge: McpBridge;
  stopAllWorkflowTimers: () => void;
  stopAllScheduledTasks: () => void;
}

export type GracefulShutdownFn = (reason: string) => Promise<void>;

export function setupGracefulShutdown(deps: GracefulShutdownDeps): GracefulShutdownFn {
  let isShuttingDown = false;

  const gracefulShutdown: GracefulShutdownFn = async (reason: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[Lifecycle] Arrêt gracieux déclenché (${reason})...`);

    // 1. Fermer toutes les sessions Gemini actives
    for (const s of deps.activeGeminiSessions) {
      try { s.close(); } catch { /* ignore — déjà fermée */ }
    }
    deps.activeGeminiSessions.clear();
    console.log('[Lifecycle] Sessions Gemini Live fermées.');

    // 2. Fermer les WebSocket servers
    await Promise.all([
      new Promise<void>(resolve => deps.wss.close(() => resolve())),
    ]);
    console.log('[Lifecycle] WebSocket servers fermés.');

    // 3. Arrêter les timers (ordre indifférent, les deux sont indépendants)
    deps.stopAllWorkflowTimers();
    deps.stopAllScheduledTasks();

    // 3b. Arrêter les serveurs MCP
    await deps.mcpBridge.shutdown();
    console.log('[Lifecycle] Serveurs MCP déconnectés.');

    // 3c. Flush persistance : ProjectMemory et KnowledgeGraph
    try { deps.projectMemory.save(); console.log('[Lifecycle] ProjectMemory flushé.'); } catch {}
    try { (deps.knowledgeGraph as any).save?.(); console.log('[Lifecycle] KnowledgeGraph flushé.'); } catch {}

    // 3d. Arrêter le runtime V2
    try { await deps.runtimeV2.stop(); deps.observability.detach(); console.log('[Lifecycle] RuntimeV2 arrêté.'); } catch {}

    // 4. Fermer le serveur HTTP
    await new Promise<void>(resolve => deps.server.close(() => resolve()));
    console.log('[Lifecycle] Arrêt complet.');
  };

  // Signaux Unix (SIGTERM envoyé par nodemon/electron-reload, SIGINT par Ctrl+C)
  process.once('SIGTERM', () => void gracefulShutdown('SIGTERM'));
  process.once('SIGINT',  () => void gracefulShutdown('SIGINT'));
  // beforeExit se déclenche quand la boucle d'événements est vide
  // (utile sur Windows où les signaux sont limités)
  process.once('beforeExit', () => void gracefulShutdown('beforeExit'));

  // Exposer le shutdown sur le process pour que electron/main.cjs puisse l'appeler
  (process as any).__jarvisShutdown = gracefulShutdown;

  return gracefulShutdown;
}
