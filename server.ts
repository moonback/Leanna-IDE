import express from "express";
import path from "path";
import { createRateLimitBundle, applyGlobalRateLimits, applyStaticAndCompression, type RateLimitDeps, } from "./server/config/rateLimits";
import { setupGracefulShutdown } from "./server/lifecycle";
// vite est importé dynamiquement en dev uniquement (voir plus bas)
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI } from "@google/genai";
import { SkillManager } from "./server/skills/SkillManager";
import { agentOrchestrator } from "./server/agents";
import { mcpBridge } from "./server/mcp";
import { type ProfileConfig } from "./server/prompts/systemInstruction";
import { loadScheduledTasks, stopAllScheduledTasks } from "./server/skills/automation";
import { loadWorkflows, stopAllWorkflowTimers } from "./server/skills/workflow";
import fs from "fs";
import { authenticateRequest, authenticateToken } from "./server/security";
import { SELF_ROOT, JARVIS_APP_ROOT, initSelfRoot, hasProject } from "./server/utils/selfRoot";
import { isSandboxActive, getSandboxRoot } from "./server/utils/sandbox";

import { knowledgeGraph, projectIndexer, projectMemory } from "./server/knowledge";

import { loadGeminiKeys, createGeminiClient } from "./server/utils/geminiKeyPool";
import { encrypt } from "./server/utils/crypto";
import { setTextGenerationProfile } from "./server/utils/textGeneration";

// Routeurs modulaires
import healthRouter from "./server/routes/health";
import { knowledgeRouter, memoryRouter, impactRouter, understandingRouter } from "./server/routes/knowledge";

// Sprint 1 — routeurs extraits de server.ts
import { createAgentBuilderRouter } from "./server/routes/agent-builder";
import { createAgentRegistrationRouter } from "./server/routes/agent-registration";
import { createCustomAgentsRouter } from "./server/routes/custom-agents-router";
import { createGeminiKeysRouter } from "./server/routes/gemini-keys";
import { createSandboxRouter, createVerifyExitCodeRouter } from "./server/routes/sandbox";
import { createCheckpointRouter } from "./server/routes/checkpoint";
import ideRouter from "./server/routes/ide";
import { createBrowserRouter } from "./server/routes/browser";
import { attachLiveWebSocket } from "./server/live/LiveSocketHandler";
import { createExportRouter } from "./server/routes/export";

import { createGithubRouter } from "./server/routes/github";
import { createAgentsRouter } from "./server/routes/agents";
import workflowsRouter from "./server/routes/workflows";
import { createCustomSkillsRouter } from "./server/routes/custom-skills";
import auditRouter from "./server/routes/audit";
import { createProfileRouter, createTokensRouter } from "./server/routes/profile";
import { createOpenRouterRouter } from "./server/routes/openrouter";
import { createTokensOptimizationRouter } from "./server/routes/tokens-optimization";
import { createSummarizeContextRouter } from "./server/routes/summarize-context";
import { createWorkspaceRouter } from "./server/routes/workspace";
import { createSelfRootRouter } from "./server/routes/self-root";
import safeguardsRouter from "./server/routes/safeguards";
import { createUploadDocumentRouter } from "./server/routes/upload-document";
import { createDocumentsRouter } from "./server/routes/documents";
import skillsRouter from "./server/routes/skills";
import mcpRouter from "./server/routes/mcp";
import { createTerminalRouter, setupTerminalWebSocket } from "./server/routes/terminal";
import memoriesRouter from "./server/routes/memories";
import conversationsRouter from "./server/routes/conversations";
import listsRouter from "./server/routes/lists";
import automationRouter from "./server/routes/automation";
import { createNotebooksRouter } from "./server/routes/notebooks";
import { createTTSRouter } from "./server/routes/tts";
import { notebookManager } from "./server/notebooks";
import { backupService } from "./server/notebooks/BackupService";
import { sourceProcessingQueue } from "./server/notebooks/ProcessingQueue";
import { chatResponseCache, ragSearchCache } from "./server/notebooks/ResponseCache";
import { sourceIngester } from "./server/notebooks/SourceIngester";

// Charger les clés Gemini
loadGeminiKeys().catch(e => console.error('[GeminiKeyPool] Erreur au chargement initial:', e));

// ─── Notebooks Infrastructure ─────────────────────────────────────────────────

// Démarrer le service de backup automatique des notebooks
backupService.start();

// Configurer le handler de la queue de processing des sources
sourceProcessingQueue.setHandler(async (task, onProgress) => {
  const { notebookId, fileName, mimeType, buffer } = task.payload;
  onProgress(10);

  const source = await sourceIngester.ingestFromBuffer(
    Buffer.from(buffer),
    fileName,
    mimeType,
    notebookId
  );
  onProgress(70);

  notebookManager.addSource(notebookId, source);
  onProgress(90);

  // Invalider le cache pour ce notebook (nouvelles sources = réponses périmées)
  chatResponseCache.invalidateNotebook(notebookId);
  ragSearchCache.invalidateNotebook(notebookId);
  onProgress(100);

  return {
    sourceId: source.id,
    title: source.title,
    chunksCount: source.chunks.length,
    wordCount: source.wordCount,
  };
});

// ─── Gestionnaires d'erreurs globaux (Audit §1) ──────────────────────────────
process.on('unhandledRejection', (reason, _promise) => {
  console.error('[FATAL] Promesse non gérée:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[FATAL] Exception non rattrapée:', error);
  // Laisser le processus mourir après un court délai pour flusher les logs
  setTimeout(() => process.exit(1), 1000);
});

// ─── Séquence de démarrage async ──────────────────────────────────────────────
// IMPORTANT: loadWorkflows() DOIT être awaité avant ensureAuditWorkflow().
// Sans await, listWorkflows() retourne [] et ensureAuditWorkflow() crée un
// doublon en BDD à chaque redémarrage → timers multipliés côté serveur.
(async () => {
  try {
    // 0. Résoudre SELF_ROOT depuis la persistance (avant TOUT le reste)
    // Si aucun projet n'a été persisté, SELF_ROOT reste "" et les inits
    // projet-dépendantes sont sautées jusqu'à la sélection d'un projet.
    initSelfRoot();

    // 1. Tâches planifiées (indépendant)
    await loadScheduledTasks();

    // 2. Workflows depuis la BDD
    await loadWorkflows();

    // 3. Seulement après le chargement complet, vérifier/créer l'audit workflow
    const { ensureAuditWorkflow } = await import("./server/workflows/audit-workflow");
    await ensureAuditWorkflow();

    // 4. Restauration des tâches agents depuis Supabase (recovery crash)
    const { agentOrchestrator: orch, agentPersistence } = await import("./server/agents");
    if (agentPersistence.isAvailable) {
      orch.restoreFromPersistence().then(({ tasks, orchestrations }) => {
        if (tasks > 0 || orchestrations > 0) {
          console.log(`[AgentPersistence] ✅ Restauré: ${tasks} tâche(s), ${orchestrations} orchestration(s)`);
        }
      }).catch((e: Error) => {
        console.warn(`[AgentPersistence] Restauration échouée (non bloquant): ${e.message}`);
      });
    }

    // 5. Indexation du Knowledge Graph — seulement si un projet est actif
    if (hasProject()) {
      projectIndexer.scanAll().then(stats => {
        console.log(`[KnowledgeGraph] ✅ Projet indexé: ${stats.totalFiles} fichiers, ${stats.totalEntities} entités (${(stats.durationMs / 1000).toFixed(1)}s)`);
        // 5b. Activer l'indexation incrémentale via FileWatcher
        projectIndexer.startWatching();

        // 6. Extraction automatique des documents du workspace
        import("./server/knowledge/DocumentExtractor").then(({ documentExtractor }) => {
          documentExtractor.extractAll().then(docStats => {
            console.log(`[DocumentExtractor] ✅ ${docStats.totalExtracted} document(s) extrait(s), ${docStats.totalWords} mots, ${docStats.totalSections} sections (${(docStats.durationMs / 1000).toFixed(1)}s)`);
            // 6b. Activer l'extraction incrémentale
            documentExtractor.startWatching();
          }).catch(e => {
            console.error('[DocumentExtractor] ❌ Erreur extraction:', e.message);
          });
        });
      }).catch(e => {
        console.error('[KnowledgeGraph] ❌ Erreur indexation:', e.message);
      });
    } else {
      console.log('[KnowledgeGraph] ⏸️ Aucun projet actif — indexation différée.');
    }
  } catch (e) {
    console.error('[Startup] Erreur séquence de démarrage:', e);
  }
})();


// ── Workspace helpers ─────────────────────────────────────────────────────────

/**
 * Reads the .env file and updates (or adds) a single key=value pair.
 * Preserves all existing comments and other keys.
 */
function updateEnvFile(key: string, value: string): void {
  const configBase = process.env.JARVIS_CONFIG_PATH || process.env.ELECTRON_APP_PATH || process.cwd();
  const envPath = path.join(configBase, ".env");
  const envLocalPath = path.join(configBase, ".env.local");
  // Prefer .env.local if it exists, else fall back to .env
  const targetPath = fs.existsSync(envLocalPath) ? envLocalPath : envPath;

  const SENSITIVE_ENV_KEYS = [
    'JARVIS_API_TOKEN',
    'GEMINI_API_KEY',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'OPENROUTER_API_KEY',
    'GITHUB_TOKEN'
  ];

  const fileValue = SENSITIVE_ENV_KEYS.includes(key) ? encrypt(value) : value;

  let content = "";
  try {
    content = fs.readFileSync(targetPath, "utf-8");
  } catch { /* file might not exist yet */ }

  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^(${escapedKey}\\s*=.*)$`, "m");
  const newLine = `${key}="${fileValue.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

  if (regex.test(content)) {
    content = content.replace(regex, newLine);
  } else {
    content = content.trimEnd() + `\n${newLine}\n`;
  }

  fs.writeFileSync(targetPath, content, "utf-8");
  // Hot-reload the env variable in the current process
  process.env[key] = value;
}


// Gemini client — uses key pool for rotation on 429 errors
function getGeminiAI(): GoogleGenAI {
  const client = createGeminiClient();
  if (!client) {
    throw new Error("Aucune clé Gemini API disponible. Configurez vos clés dans les paramètres.");
  }
  return client;
}
const skillManager = new SkillManager();

// ─── Nouveau Runtime v2 — Pont actif vers le ToolRegistry ───────────────────
// Le runtime V2 est maintenant connecté au SkillManager existant.
// Toutes les skills sont mirrorées dans le ToolRegistry pour les métriques
// et les nouvelles routes /api/v2/*.
import { createRuntime } from "./server/runtime";
import { Observability } from "./server/runtime/Observability";

const runtimeV2 = createRuntime({ enableMetrics: true, logLevel: "info" });
const observability = new Observability();
observability.attach(runtimeV2.events);

// Enregistrer les skills du SkillManager dans le ToolRegistry du runtime (mirror)
  // Cela se fait après l'init async du SkillManager
  setTimeout(() => {
    try {
      const declarations = skillManager.getToolDeclarations();
      // Créer un adaptateur léger qui route vers le SkillManager
      for (const decl of declarations) {
        if (!runtimeV2.tools.has(decl.name)) {
          // Convertir le schéma Zod en objet JSON Schema simple pour le runtime
          let parameters: Record<string, unknown> = {};
          if (decl.parameters && typeof decl.parameters === 'object') {
            // Si c'est un schéma Zod, essayer d'en extraire la structure
            if ('_def' in decl.parameters) {
              // C'est un schéma Zod - on utilise un objet vide comme fallback
              // Le vrai typage se fait côté SkillManager via validateArgs
              parameters = {};
            } else {
              parameters = decl.parameters as Record<string, unknown>;
            }
          }
          runtimeV2.tools.register({
            declaration: { name: decl.name, description: decl.description || '', parameters },
            handler: async (args) => skillManager.handleToolCall(decl.name, args),
            category: 'legacy',
            timeoutMs: 30_000,
          });
        }
      }
      console.log(`[RuntimeV2] ✅ ${runtimeV2.tools.size} outils mirrorés depuis SkillManager`);
    } catch (e: any) {
      console.warn(`[RuntimeV2] Mirror partiel: ${e.message}`);
    }
  }, 3000); // Attendre que le SkillManager ait fini son init async

runtimeV2.start().then(() => {
  console.log(`[RuntimeV2] ✅ Runtime démarré — ${runtimeV2.listAgents().length} agents, EventBus actif`);
}).catch((e: Error) => {
  console.warn(`[RuntimeV2] Démarrage échoué (non bloquant): ${e.message}`);
});


// ── Registre des lectures de page browser en attente ─────────────────────────
// browser_read_content insère une promesse ici ; POST /api/browser/content-result
// la résout quand le BrowserPanel a exécuté le JS dans la webview.
const browserReadPending = new Map<string, {
  resolve: (text: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}>();

// ── Registre des actions browser en attente (click, type, snapshot, inspect) ─
// Réutilise le même pattern que browserReadPending mais pour les interactions
// qui nécessitent un retour structuré vers le skill. POST /api/browser/action-result
const browserActionPending = new Map<string, {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}>();
const apiToken = process.env.JARVIS_API_TOKEN;

function getDefaultWorkspaceRoot(): string {
  return SELF_ROOT;
}

// In-memory profile store (persisted to a local JSON file in production)
function getProfilePath(): string {
  // Le profil est toujours dans le dossier de l'app Jarvis, pas le projet actif
  return path.join(JARVIS_APP_ROOT, ".jarvis-profile.json");
}

function loadProfile(): ProfileConfig {
  try {
    const profilePath = getProfilePath();
    if (fs.existsSync(profilePath)) {
      return JSON.parse(fs.readFileSync(profilePath, "utf-8"));
    }
  } catch { /* ignore */ }
  return {};
}

function saveProfile(profile: ProfileConfig): void {
  try { 
    const profilePath = getProfilePath();
    fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2)); 
  }
  catch (e) { console.error("[Profile] Failed to save:", e); }
}

let currentProfile: ProfileConfig = loadProfile();
setTextGenerationProfile(currentProfile);

// ── File watcher : recharger le profil quand le fichier est modifié à la main ──
try {
  const profilePath = getProfilePath();
  fs.watchFile(profilePath, { interval: 2000 }, () => {
    try {
      const reloaded = loadProfile();
      currentProfile = reloaded;
      setTextGenerationProfile(currentProfile);
      console.log(`[Profile] ♻️ Rechargé depuis le disque (keys: ${Object.keys(reloaded).join(', ')})`);
    } catch (e) {
      console.warn(`[Profile] Erreur lors du rechargement:`, (e as Error).message);
    }
  });
} catch { /* non bloquant */ }

// Wire checkpoint git guard avec le profil courant
import("./server/utils/checkpoint").then(({ setCheckpointProfileGetter }) => {
  setCheckpointProfileGetter(() => currentProfile);
}).catch(() => {});

/**
 * Retourne la racine de l'application Electron packagée, ou le CWD en dev.
 * En production (app packagée), main.cjs définit ELECTRON_APP_PATH = app.getAppPath()
 * AVANT d'appeler require(server.cjs). Cela permet de résoudre dist/ et node_modules/
 * correctement depuis l'ASAR, peu importe le CWD du process.
 */
function getElectronAppRoot(): string {
  return process.env.ELECTRON_APP_PATH?.trim() || process.cwd();
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.VITE_SERVER_PORT) || 5000;

  // --- Rate limiters, middlewares, fichiers statiques — extraits dans server/config/rateLimits.ts ---
  const isDev = process.env.NODE_ENV !== 'production';
  const rateLimitDeps: RateLimitDeps = {
    isDev,
    getDefaultWorkspaceRoot,
    getElectronAppRoot,
  };
  const rateBundle = createRateLimitBundle(rateLimitDeps);
  applyGlobalRateLimits(app, rateBundle, rateLimitDeps);

  // Dynamic workspace: returns sandbox root when sandbox mode is active,
  // otherwise returns the main repo root. This affects the file explorer,
  // file read/write API routes, terminal cwd, and search.
  function getWorkspaceRoot(): string {
    if (isSandboxActive()) {
      return getSandboxRoot();
    }
    return getDefaultWorkspaceRoot();
  }

  applyStaticAndCompression(app, { ...rateLimitDeps, getWorkspaceRoot });

  function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
    const authResult = authenticateRequest(req, { apiToken });
    if (!authResult.ok) {
      res.status(authResult.status || 401).json({ error: authResult.error || 'Unauthorized' });
      return;
    }
    if (apiToken) {
      res.cookie('jarvis_token', apiToken, {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        path: '/'
      });
    }
    next();
  }

  // API Routes — désormais modularisées dans server/routes/*
  app.use("/api", healthRouter);

  // BUGFIX (sécurité critique) : jusqu'ici `requireAuth` n'était appliqué qu'à
  // une poignée de routes /api/ide/* et /api/upload-document. Toutes les

  // autres routes (gestion des clés Gemini, tokens, workspace, git, github,
  // workflows, mémoires, conversations...) étaient accessibles sans aucune
  // authentification même lorsque JARVIS_API_TOKEN est configuré, en
  // contradiction avec API_DOCS.md. On applique désormais l'authentification
  // à toutes les routes /api/* (sauf /api/health, déjà traitée ci-dessus).
  app.use("/api", requireAuth);

  // ── Routeurs modulaires (refactorisation priorité #1) ────────────────────
  // Montés APRÈS requireAuth mais AVANT les routes inline legacy.
  // Express matche en ordre d'enregistrement : ces routeurs gagnent.
  // IMPORTANT : chaque routeur est monté sur SON préfixe dédié.
  //   - Routeurs dont les routes internes incluent déjà le nom (/profile, /workspace...) restent sur "/api"
  //   - Routeurs dont les routes internes sont génériques (/status, /, /config...) requièrent "/api/<prefix>"
  app.use("/api/audit", auditRouter);
  app.use("/api/automation", automationRouter);
  app.use("/api/workflows", workflowsRouter);
  app.use("/api/custom-skills", createCustomSkillsRouter(skillManager));
  // Git désactivé — toutes les routes retournent 404
  // app.use("/api/git", createGitRouter(skillManager, () => currentProfile));
  app.use("/api/git", (_req, res) => {
    res.status(404).json({ status: "disabled", error: "Git est entièrement désactivé." });
  });
  app.use("/api/github", createGithubRouter(skillManager));
  app.use("/api/agents", createAgentsRouter(skillManager));

  // ─── Routes Runtime V2 (nouveau système, coexistence) ────────────────────
  const { createAgentsRouterV2 } = await import("./server/runtime/routes/agents");
  const { createMetricsRouter } = await import("./server/runtime/routes/metrics");
  app.use("/api/v2/agents", createAgentsRouterV2(runtimeV2));
  app.use("/api/v2/metrics", createMetricsRouter(runtimeV2));

  app.use("/api", createProfileRouter(() => currentProfile, (p) => { currentProfile = p; setTextGenerationProfile(p); }, saveProfile, getWorkspaceRoot, updateEnvFile));
  app.use("/api", createTokensRouter(updateEnvFile, async () => { await loadGeminiKeys(); }));
  app.use("/api/openrouter", createOpenRouterRouter(() => currentProfile));
  app.use("/api/tokens", createTokensOptimizationRouter(() => currentProfile, getWorkspaceRoot));
  app.use("/api/tokens", createSummarizeContextRouter());
  app.use("/api", createWorkspaceRouter(getWorkspaceRoot));
  app.use("/api/self-root", createSelfRootRouter(() => wss));
  app.use("/api/safeguards", safeguardsRouter);

  app.use("/api/upload-document", createUploadDocumentRouter(() => currentProfile));
  app.use("/api/documents", createDocumentsRouter(() => currentProfile));
  app.use("/api/skills", skillsRouter);
  app.use("/api/mcp", mcpRouter);
  app.use("/api/memories", memoriesRouter);
  app.use("/api/conversations", conversationsRouter);
  app.use("/api/lists", listsRouter);
  app.use("/api/terminal", createTerminalRouter({ apiToken }));
  app.use("/api/knowledge", knowledgeRouter);
  app.use("/api/knowledge", memoryRouter);
  app.use("/api/knowledge", impactRouter);
  app.use("/api/knowledge", understandingRouter);

  app.use("/api/notebooks/:id/chat", rateBundle.notebookChatLimiter);
  app.use("/api/notebooks/:id/embeddings/reindex", rateBundle.notebookEmbeddingLimiter);
  app.use("/api/notebooks/:id/sources/upload", rateBundle.notebookEmbeddingLimiter);

  app.use("/api/notebooks", createNotebooksRouter());
  app.use("/api/tts", createTTSRouter());

  // ── Sprint 1 — routeurs extraits ──────────────────────────────────────────
  app.use("/api/agent-builder", createAgentBuilderRouter());
  app.use("/api/agent-registration", createAgentRegistrationRouter());
  app.use("/api/custom-agents", createCustomAgentsRouter());
  app.use("/api/gemini-keys", createGeminiKeysRouter());
  app.use("/api/sandbox", createSandboxRouter());
  app.use("/api/checkpoint", createCheckpointRouter());
  app.use("/api/ide", ideRouter);
  app.use("/api/browser", createBrowserRouter(browserReadPending, browserActionPending));
  app.use("/api/export", createExportRouter());
  app.use("/api", createVerifyExitCodeRouter());

  // ── Fin routeurs extraits Sprint 1 ──────────────────────────────────────



  // ── Global error handler — DOIT être enregistré APRÈS les routes mais
  //     AVANT les middlewares statiques (Vite, dist).                             
  //     Permet d'avoir une stacktrace détaillée en console sur les 500.         
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) return;
    const status = err.status || err.statusCode || 500;
    const msg = err.message || String(err);
    console.error(`[HTTP ${status}] ${msg}`);
    if (err.stack) console.error(err.stack);
    res.status(status).json({
      error: status === 500 ? "Erreur interne du serveur." : msg,
      ...(process.env.NODE_ENV !== "production" ? { details: msg, stack: err.stack?.split("\n").slice(0, 6) } : {}),
    });
  });

  // HTTP server
  // BUGFIX : écouter sur 0.0.0.0 exposait le serveur (et donc le terminal
  // shell, les outils fichiers/git/system, les clés API) à tout le réseau
  // local par défaut. On se limite désormais à la boucle locale, sauf si
  // l'utilisateur exporte explicitement JARVIS_LISTEN_HOST (ex: pour un accès
  // LAN volontaire, à combiner impérativement avec JARVIS_API_TOKEN).
  const listenHost = process.env.JARVIS_LISTEN_HOST?.trim() || "127.0.0.1";
  if (!apiToken) {
    console.warn(
      "\n[Security] ⚠️  AVERTISSEMENT SÉCURITÉ : Aucun JARVIS_API_TOKEN n'est configuré dans .env.\n" +
      "          Les endpoints API (/api/*) et WebSocket (/live, /sandbox-watch) ne sont pas protégés par jeton.\n" +
      "          Pour restreindre l'accès, définissez JARVIS_API_TOKEN=<votre_jeton_secret> dans votre .env.\n"
    );
  }
  if (listenHost === "0.0.0.0" && !apiToken) {
    console.error("[Security] ❌ REFUS DE DÉMARRAGE — JARVIS_LISTEN_HOST=0.0.0.0 exposé sans JARVIS_API_TOKEN. Définissez JARVIS_API_TOKEN dans .env pour sécuriser l'accès.");
    process.exit(1);
  }

  // ── Sandbox — activé SEULEMENT si un projet est sélectionné ──────────────
  // Sans projet actif, le sandbox est inutilisable (pas de SELF_ROOT).
  // Il sera initialisé automatiquement lors du setSelfRoot() côté /api/self-root/change.
  if (hasProject()) {
    try {
      const sandboxModule = await import("./server/utils/sandbox");
      const sandboxWatcherModule = await import("./server/utils/sandboxWatcher");
      const sandboxRoot = sandboxModule.getSandboxRoot();
      if (fs.existsSync(sandboxRoot)) {
        sandboxWatcherModule.startWatching();
        sandboxModule.activateSandbox();
        console.log("[Sandbox] Mode sandbox READY (dossier existant) + watcher démarré.");
      } else {
        await sandboxModule.initSandbox();
        sandboxWatcherModule.startWatching();
        sandboxModule.activateSandbox();
        console.log("[Sandbox] Mode sandbox initialisé et READY par défaut + watcher démarré.");
      }
    } catch (e: any) {
      console.error("[Sandbox] Erreur lors de l'activation par défaut:", e.message);
      if (e.stack) console.error(e.stack);
    }
  } else {
    console.log("[Sandbox] ⏸️ Aucun projet actif — sandbox différé à la sélection d'un projet.");
  }

  const server = app.listen(PORT, listenHost, () => {
    console.log(`Server running on http://${listenHost}:${PORT}`);
  });

  // Gestion explicite des erreurs d'écoute TCP (port occupé, droits insuffisants, etc.)
  // Plutôt qu'un stacktrace illisible "Error: listen EADDRINUSE :::5000", on donne
  // un diagnostic ACTIONNABLE à l'utilisateur.
  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `\n[PORT] ❌ Le port ${PORT} est déjà utilisé par un autre processus.\n` +
        `     → Cause fréquente : un ancien "npm run dev" est toujours en cours (tuez-le),\n` +
        `        ou bien vous avez lancé "vite dev" À LA MAIN (interdit — ce projet intègre\n` +
        `        Vite DANS server.ts : utilisez UNIQUEMENT "npm run dev").\n` +
        `     → Sous Windows : exécutez  netstat -ano | findstr :${PORT}  puis taskkill /PID <id> /F\n` +
        `     → Ou bien exportez VITE_SERVER_PORT=<autre_port> dans .env pour changer.\n`
      );
      process.exit(1);
    }
    if (err.code === "EACCES") {
      console.error(
        `[PORT] ❌ Droits insuffisants pour écouter sur ${listenHost}:${PORT}.\n` +
        `     → Sous Linux/Mac : utilisez VITE_SERVER_PORT >= 1024 ou lancez avec sudo.\n`
      );
      process.exit(1);
    }
    console.error("[SERVER] Erreur au démarrage :", err.message);
    process.exit(1);
  });

  // Vite middleware for development (import dynamique pour éviter le crash en production)
  // NOTE: Le serveur HTTP est créé AVANT Vite pour pouvoir passer `server` à
  // hmr.server — cela attache le WebSocket HMR au même port (5000) au lieu
  // d'un port secondaire, évitant les erreurs « WebSocket connection failed ».
  // IMPORTANT : server.proxy est explicitement écrasé à {} en mode middleware.
  //   Sans ça, vite.config.ts définit un proxy "/api → localhost:<PORT>" qui,
  //   en mode middleware, recevrait les requêtes /api non matéchées par Express
  //   et renverrait une requête à lui-même → BOUCLE TCP infinie → ENOBUFS.
  let vite: any = null;
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server },
        proxy: {},
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // En production, dist/ est à la racine de l'app (getElectronAppRoot()/dist/).
    // Utiliser process.cwd() serait non fiable dans le paquet Electron (CWD variable).
    const distPath = path.join(getElectronAppRoot(), 'dist');
    console.log('[Server] Mode production — dist path:', distPath);
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // WebSocket server for Live API
  const wss = new WebSocketServer({ noServer: true });

  // WebSocket server for Sandbox file watching (real-time)
  const sandboxWss = new WebSocketServer({ noServer: true });

  // WebSocket server for Terminal (PTY-like)
  const terminalWss = new WebSocketServer({ noServer: true });
  setupTerminalWebSocket(terminalWss, apiToken);

  // ── Agent Orchestrator: broadcaster d'événements vers les clients WebSocket ──
  agentOrchestrator.setEventBroadcaster((event) => {
    const payload = JSON.stringify(event);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try { client.send(payload); } catch { /* ignore */ }
      }
    }
  });

  // ── Mission System: broadcaster d'événements missions vers les clients WebSocket ──
  // registerDynSkills est asynchrone, on utilise un intervalle pour connecter dès que prêt
  const missionBroadcasterInterval = setInterval(() => {
    if (skillManager.missionExecutor) {
      clearInterval(missionBroadcasterInterval);
      skillManager.missionExecutor.setEventEmitter((event, data) => {
        const payload = JSON.stringify({ type: 'mission_event', event, ...data, timestamp: new Date().toISOString() });
        for (const client of wss.clients) {
          if (client.readyState === WebSocket.OPEN) {
            try { client.send(payload); } catch { /* ignore */ }
          }
        }
      });
      console.log(`[Server] ✓ Mission System broadcaster connecté au WebSocket.`);
    }
  }, 500);

  // ── Lifecycle: suivi des sessions Gemini actives ─────────────────────────
  // Permet à gracefulShutdown() de fermer toutes les sessions ouvertes
  // lors d'un hot-reload ou d'une fermeture Electron propre.
  const activeGeminiSessions = new Set<any>();

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url!, `http://${request.headers.host}`);
    const pathname = url.pathname;

    // Sécurité : on exige le même jeton que pour les routes /api (passé en
    // query string car les navigateurs ne permettent pas d'en-têtes
    // personnalisés lors d'un upgrade WebSocket).
    if (pathname === '/live' || pathname === '/sandbox-watch') {
      const cookieHeader = request.headers.cookie || '';
      const cookies: Record<string, string> = {};
      cookieHeader.split(';').forEach(c => {
        const parts = c.split('=');
        if (parts.length >= 2) {
          cookies[parts[0].trim()] = decodeURIComponent(parts.slice(1).join('='));
        }
      });

      const token = cookies['jarvis_token'] || url.searchParams.get('token');
      const authResult = authenticateToken(token, apiToken);
      if (!authResult.ok) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
    }

    if (pathname === '/live') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else if (pathname === '/sandbox-watch') {
      sandboxWss.handleUpgrade(request, socket, head, (ws) => {
        sandboxWss.emit('connection', ws, request);
      });
    } else if (pathname === '/terminal') {
      terminalWss.handleUpgrade(request, socket, head, (ws) => {
        terminalWss.emit('connection', ws, request);
      });
    } else {
      // In dev, Vite's own upgrade listener (registered via hmr.server)
      // handles the HMR WebSocket — just return and let it process.
      // In production, no other WS paths are expected so destroy.
      if (!vite) {
        socket.destroy();
      }
    }
  });

  // ── WebSocket Gemini Live + Sandbox Watcher ─────────────────────────────
  // Toute la logique WebSocket est extraite dans server/live/LiveSocketHandler.ts
  // (Sprint 1 — découpage de server.ts).
  attachLiveWebSocket(wss, sandboxWss, {
    skillManager,
    getCurrentProfile: () => currentProfile,
    getWorkspaceRoot,
    createGeminiAI: getGeminiAI,
    activeGeminiSessions,
    browserReadPending,
    browserActionPending,
  });

  // ── Graceful shutdown — extrait dans server/lifecycle.ts ────────────────
  setupGracefulShutdown({
    server,
    wss,
    runtimeV2,
    observability,
    activeGeminiSessions,
    projectMemory,
    knowledgeGraph,
    mcpBridge,
    stopAllWorkflowTimers,
    stopAllScheduledTasks,
  });
}

startServer();