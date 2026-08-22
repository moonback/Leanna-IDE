 import express from "express";
import path from "path";
import compression from "compression";
import { rateLimit } from "express-rate-limit";
// vite est importé dynamiquement en dev uniquement (voir plus bas)
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { SkillManager } from "./server/skills/SkillManager";
import { agentOrchestrator } from "./server/agents";
import { mcpBridge } from "./server/mcp";
import { buildSystemInstruction, type ProfileConfig } from "./server/prompts/systemInstruction";
import { loadScheduledTasks, stopAllScheduledTasks } from "./server/skills/automation";
import { loadWorkflows, stopAllWorkflowTimers } from "./server/skills/workflow";
import { startConversation, endConversation, saveMessage, getConversationMessages } from "./server/skills/history";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import { authenticateRequest, authenticateToken, createRateLimiter, resolveWorkspacePath } from "./server/security";
import { appendAuditEvent } from "./server/audit";
import { SELF_ROOT, JARVIS_APP_ROOT, CRITICAL_FILES, initSelfRoot, hasProject } from "./server/utils/selfRoot";
import { isSandboxActive, getSandboxRoot } from "./server/utils/sandbox";
import { subscribeToValidation } from "./server/utils/postEditValidator";

import { knowledgeGraph, projectIndexer, projectMemory, understandingEngine } from "./server/knowledge";

import { loadGeminiKeys, getGeminiKeys, addGeminiKey, removeGeminiKey, toggleGeminiKey, updateGeminiKeyLabel, withGeminiRetry, createGeminiClient, getNextGeminiKey } from "./server/utils/geminiKeyPool";
import { requestConfirmation } from "./server/utils/confirmationBridge";
import { encrypt } from "./server/utils/crypto";
import { setTextGenerationProfile } from "./server/utils/textGeneration";
import { estimateTokens, summarizeWithLLM } from "./server/utils/tokenOptimizer";

// Routeurs modulaires (refactorisation priorité #1)
import healthRouter from "./server/routes/health";
import knowledgeRouter from "./server/routes/knowledge";
import memoryRouter from "./server/routes/memory";

// Autonomy Engine — Superviseur de boucle d'autonomie
import { supervisor } from "./server/autonomy";
import impactRouter from "./server/routes/impact";
import understandingRouter from "./server/routes/understanding";
import { createGithubRouter } from "./server/routes/github";
import { createAgentsRouter } from "./server/routes/agents";
import workflowsRouter from "./server/routes/workflows";
import customSkillsRouter from "./server/routes/custom-skills";
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
process.on('unhandledRejection', (reason, promise) => {
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
import { adaptAllSkills } from "./server/runtime/compat/SkillAdapter";
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
        runtimeV2.tools.register({
          declaration: { name: decl.name, description: decl.description || '', parameters: decl.parameters || {} },
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

const ideLimiter = createRateLimiter(120, 60_000);

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

// ── Tool token estimation helpers ──────────────────────────────────────────
function estimateToolTokens(declaration: any): number {
  let tokens = 0;
  // Name + description
  tokens += Math.ceil((declaration.name?.length || 0) / 4);
  tokens += Math.ceil((declaration.description?.length || 0) / 4);
  // Parameters
  if (declaration.parameters?.properties) {
    for (const [key, val] of Object.entries(declaration.parameters.properties)) {
      tokens += Math.ceil((key.length + ((val as any)?.description?.length || 0)) / 4);
    }
  }
  return tokens + 20; // overhead per tool
}

function estimateToolTokens_total(declarations: any[]): number {
  return declarations.reduce((sum, d) => sum + estimateToolTokens(d), 0);
}

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

  // --- Rate limiters ciblés (évite 429 sur polling UI fréquent) ---
  // App desktop locale : limiteur désactivé en dev / localhost pour éviter
  // les 429 intempestifs liés à HMR, React StrictMode, et polling.
  const isDev = process.env.NODE_ENV !== 'production';
  const skipForLocal = (req: any): boolean => {
    if (isDev) return true;
    const ip = req.ip || req.socket?.remoteAddress || '';
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  };

  // Global strict: endpoints sensibles (agents, tokens, missions, écritures...)
  const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDev ? 1_000_000 : 10_000, // relaxé ×20 pour éviter les faux positifs en usage intensif
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipForLocal,
    message: { error: "Trop de requêtes, veuillez réessayer plus tard." }
  });

  // Polling (lecture UI fréquente): /api/ide/tree, /api/sandbox/status, etc.
  // Frontend peut appeler ces GET plusieurs fois par seconde.
  const pollingLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: isDev ? 1_000_000 : 30_000, // 500/s — relaxé ×25
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipForLocal,
    message: { error: "Trop de requêtes polling." },
  });

  // Auth endpoints — VRAIMENT sensible aux brute-force, mais exclus profile qui
  // est un simple sync de préférences et est appelé à chaque chargement.
  const authLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: isDev ? 1_000_000 : 150, // ×5 vs précédent, car les tokens courts sont validés
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipForLocal,
    message: { error: "Trop de tentatives d'authentification." },
  });

  // Appliquer le polling limiter sur les GET /api/ide/* et /api/sandbox/*,
  // le strict limiter sur les méthodes d'écriture (POST/PUT/DELETE/PATCH),
  // et le strict limiter sur toutes les autres routes /api/*.
  app.use("/api/ide", (req, res, next) => {
    if (req.method === "GET") return pollingLimiter(req, res, next);
    return strictLimiter(req, res, next);
  });
  app.use("/api/sandbox", (req, res, next) => {
    if (req.method === "GET") return pollingLimiter(req, res, next);
    return strictLimiter(req, res, next);
  });

  app.use("/api/safeguards", (req, res, next) => {
    if (req.method === "GET") return pollingLimiter(req, res, next);
    return strictLimiter(req, res, next);
  });
  app.use("/api/knowledge", (req, res, next) => {
    if (req.method === "GET") return pollingLimiter(req, res, next);
    return strictLimiter(req, res, next);
  });
  app.use(/^\/api\/(auth|login|token)/, authLimiter);
  app.use("/api", strictLimiter);

  // Dynamic workspace: returns sandbox root when sandbox mode is active,
  // otherwise returns the main repo root. This affects the file explorer,
  // file read/write API routes, terminal cwd, and search.
  function getWorkspaceRoot(): string {
    if (isSandboxActive()) {
      return getSandboxRoot();
    }
    return getDefaultWorkspaceRoot();
  }

  app.use(express.json({ limit: '50mb' }));

  // Compression des réponses API IDE pour améliorer les performances
  app.use('/api/ide', compression());

  // Sert les fichiers Monaco localement pour éviter le CDN (nécessaire sous Electron).
  // Utilise getElectronAppRoot() pour résoudre node_modules/ correctement dans le paquet ASAR.
  const monacoPath = path.join(getElectronAppRoot(), 'node_modules', 'monaco-editor');
  app.use('/monaco-editor', express.static(monacoPath));

  // ── Workspace Preview — sert les fichiers HTML/CSS/JS du workspace dans le navigateur intégré.
  // La route est intentionnellement AVANT requireAuth car le webview Electron
  // ne peut pas transmettre de cookie de session lors du chargement d'une page.
  // Pour limiter la surface d'attaque, seul localhost peut accéder à cette route.
  app.use('/workspace-preview', (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || '';
    const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    if (!isLocal) return res.status(403).json({ error: 'Accès interdit depuis un hôte distant.' });
    next();
  }, (req, res, next) => {
    // req.path est déjà décodé par express et commence par "/"
    const root = getWorkspaceRoot();
    const resolved = resolveWorkspacePath(req.path, root);
    if (!resolved) return res.status(403).json({ error: 'Chemin non autorisé.' });
    // express.static appelé dynamiquement avec le root courant (sandbox ou workspace normal)
    express.static(root, { dotfiles: 'ignore' })(req, res, next);
  }, (_req, res) => {
    res.status(404).send('Fichier introuvable.');
  });

  function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const authResult = authenticateRequest(req, { apiToken });
    if (!authResult.ok) {
      return res.status(authResult.status || 401).json({ error: authResult.error || 'Unauthorized' });
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

  function enforceRateLimit(limiters: { check: (key: string) => boolean }, key: string, res: express.Response) {
    if (!limiters.check(key)) {
      res.status(429).json({ error: 'Too many requests' });
      return false;
    }
    return true;
  }

  function resolveRequestedPath(reqPath: string | undefined) {
    if (typeof reqPath !== 'string' || !reqPath.trim()) {
      return null;
    }
    return resolveWorkspacePath(reqPath, getWorkspaceRoot());
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
  app.use("/api/custom-skills", customSkillsRouter);
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
  app.use("/api/knowledge", knowledgeRouter);
  app.use("/api/knowledge", memoryRouter);
  app.use("/api/knowledge", impactRouter);
  app.use("/api/knowledge", understandingRouter);

  // Rate limiter spécifique pour les notebooks (chat/embedding = coûteux en API)
  const notebookChatLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: isDev ? 1_000_000 : 30, // 30 requêtes chat/min en production
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipForLocal,
    keyGenerator: (req) => `nb-chat-${req.ip}`,
    message: { error: "Trop de requêtes chat. Veuillez ralentir." },
  });

  const notebookEmbeddingLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: isDev ? 1_000_000 : 50, // 50 requêtes embedding/5min en production
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipForLocal,
    keyGenerator: (req) => `nb-emb-${req.ip}`,
    message: { error: "Trop de requêtes d'embedding. Veuillez patienter." },
  });

  // Appliquer les limiteurs ciblés sur les routes coûteuses
  app.use("/api/notebooks/:id/chat", notebookChatLimiter);
  app.use("/api/notebooks/:id/embeddings/reindex", notebookEmbeddingLimiter);
  app.use("/api/notebooks/:id/sources/upload", notebookEmbeddingLimiter);

  app.use("/api/notebooks", createNotebooksRouter());
  app.use("/api/tts", createTTSRouter());
  // ── Fin routeurs modulaires ───────────────────────────────────────────────

  // ── Agent Builder: génération IA d'agents personnalisés ───────────────────
  app.post("/api/agent-builder/generate", requireAuth, async (req, res) => {
    const { handleGenerateAgent } = await import("./server/routes/generate-agent");
    return handleGenerateAgent(req, res);
  });

  // ── Custom Agents: CRUD persisté dans .jarvis/custom-agents.json ──────────
  app.get("/api/custom-agents", requireAuth, async (req, res) => {
    const { handleListAgents } = await import("./server/routes/custom-agents");
    return handleListAgents(req, res);
  });
  app.post("/api/custom-agents", requireAuth, async (req, res) => {
    const { handleCreateAgent } = await import("./server/routes/custom-agents");
    return handleCreateAgent(req, res);
  });
  app.put("/api/custom-agents/:id", requireAuth, async (req, res) => {
    const { handleUpdateAgent } = await import("./server/routes/custom-agents");
    return handleUpdateAgent(req, res);
  });
  app.delete("/api/custom-agents/:id", requireAuth, async (req, res) => {
    const { handleDeleteAgent } = await import("./server/routes/custom-agents");
    return handleDeleteAgent(req, res);
  });
  app.post("/api/custom-agents/import", requireAuth, async (req, res) => {
    const { handleImportAgents } = await import("./server/routes/custom-agents");
    return handleImportAgents(req, res);
  });

  // ── Gemini Key Pool (liste de clés avec rotation) ──────────────────────────

  app.get("/api/gemini-keys", (_req, res) => {
    try {
      const keys = getGeminiKeys();
      res.json({ status: 'success', keys });
    } catch (e: any) {
      res.status(500).json({ status: 'error', error: e.message });
    }
  });

  app.post("/api/gemini-keys", (req, res) => {
    const { key, label } = req.body as { key?: string; label?: string };
    if (!key || typeof key !== 'string' || !key.trim()) {
      return res.status(400).json({ status: 'error', error: 'La clé API est requise.' });
    }
    try {
      addGeminiKey(key.trim(), label?.trim() || undefined);
      res.json({ status: 'success', keys: getGeminiKeys() });
    } catch (e: any) {
      res.status(400).json({ status: 'error', error: e.message });
    }
  });

  app.delete("/api/gemini-keys/:index", (req, res) => {
    const index = parseInt(req.params.index, 10);
    if (isNaN(index)) {
      return res.status(400).json({ status: 'error', error: 'Index invalide.' });
    }
    try {
      removeGeminiKey(index);
      res.json({ status: 'success', keys: getGeminiKeys() });
    } catch (e: any) {
      res.status(400).json({ status: 'error', error: e.message });
    }
  });

  app.patch("/api/gemini-keys/:index/toggle", (req, res) => {
    const index = parseInt(req.params.index, 10);
    if (isNaN(index)) {
      return res.status(400).json({ status: 'error', error: 'Index invalide.' });
    }
    try {
      const enabled = toggleGeminiKey(index);
      res.json({ status: 'success', enabled, keys: getGeminiKeys() });
    } catch (e: any) {
      res.status(400).json({ status: 'error', error: e.message });
    }
  });

  app.patch("/api/gemini-keys/:index/label", (req, res) => {
    const index = parseInt(req.params.index, 10);
    const { label } = req.body as { label?: string };
    if (isNaN(index)) {
      return res.status(400).json({ status: 'error', error: 'Index invalide.' });
    }
    if (!label || typeof label !== 'string') {
      return res.status(400).json({ status: 'error', error: 'Le label est requis.' });
    }
    try {
      updateGeminiKeyLabel(index, label.trim());
      res.json({ status: 'success', keys: getGeminiKeys() });
    } catch (e: any) {
      res.status(400).json({ status: 'error', error: e.message });
    }
  });

  // ── Sandbox (workspace isolé) ──────────────────────────────────────────────

  // GET /api/sandbox/status — état du sandbox
  app.get("/api/sandbox/status", requireAuth, async (_req, res) => {
    try {
      const { getSandboxStatus } = await import("./server/utils/sandbox");
      res.json({ status: "success", sandbox: getSandboxStatus() });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/sandbox/init — initialiser ou rafraîchir le sandbox
  app.post("/api/sandbox/init", requireAuth, async (_req, res) => {
    try {
      const { initSandbox } = await import("./server/utils/sandbox");
      const result = await initSandbox();
      res.json({ status: "success", ...result });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/sandbox/activate — activer le mode sandbox
  app.post("/api/sandbox/activate", requireAuth, async (_req, res) => {
    try {
      const { activateSandbox, isSandboxActive, getSandboxRoot } = await import("./server/utils/sandbox");
      const { startWatching } = await import("./server/utils/sandboxWatcher");
      activateSandbox();
      startWatching();
      res.json({ status: "success", active: true, path: getSandboxRoot() });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/verify-exit-code — vérifier le code de sécurité (sans désactiver le sandbox)
  app.post("/api/verify-exit-code", requireAuth, (req, res) => {
    const { code } = req.body || {};
    const exitCode = process.env.SANDBOX_EXIT_CODE;

    if (!exitCode || exitCode.length !== 6) {
      return res.status(403).json({ status: "error", error: "Code non configuré" });
    }
    if (!code || code !== exitCode) {
      return res.status(403).json({ status: "error", error: "Code incorrect" });
    }
    res.json({ status: "success" });
  });

  // POST /api/sandbox/deactivate — désactiver le mode sandbox (code de sécurité requis)
  app.post("/api/sandbox/deactivate", requireAuth, async (req, res) => {
    try {
      const { code } = req.body || {};
      const exitCode = process.env.SANDBOX_EXIT_CODE;

      // Vérifier que le code de sécurité est configuré
      if (!exitCode || exitCode.length !== 6) {
        return res.status(403).json({
          status: "error",
          error: "SANDBOX_EXIT_CODE non configuré ou invalide dans .env (6 chiffres requis)",
        });
      }

      // Vérifier le code fourni
      if (!code || code !== exitCode) {
        return res.status(403).json({
          status: "error",
          error: "Code de sécurité incorrect. 6 chiffres requis pour désactiver le sandbox.",
        });
      }

      const { deactivateSandbox } = await import("./server/utils/sandbox");
      const { stopWatching } = await import("./server/utils/sandboxWatcher");
      deactivateSandbox();
      stopWatching();
      res.json({ status: "success", active: false });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/sandbox/validate — valider le sandbox (tsc) et retourner erreurs détaillées
  app.post("/api/sandbox/validate", requireAuth, async (_req, res) => {
    try {
      const { validateSandbox, isSandboxActive } = await import("./server/utils/sandbox");
      if (!isSandboxActive()) {
        return res.status(400).json({ status: "error", error: "Sandbox inactif. Activez-le d'abord via /api/sandbox/activate." });
      }
      const validation = await validateSandbox();
      res.json({
        status: validation.valid ? "success" : "validation_failed",
        valid: validation.valid,
        errorCount: validation.errorCount,
        warningCount: validation.warningCount,
        diagnostics: validation.diagnostics, // liste plate structurée {file, line, column, code, severity, message, raw}
        errorsByFile: validation.errorsByFile, // groupement par fichier pour l'UI
        exitCode: validation.exitCode,
        stdout: validation.stdout,
        stderr: validation.stderr,
        signal: validation.signal,
        timedOut: validation.timedOut,
        globalDiagnostics: validation.globalDiagnostics,
        rawOutput: validation.rawOutput,       // sortie brute complète sans troncature
      });
    } catch (e: any) {
      res.status(500).json({ status: "error", error: e.message || "Erreur interne pendant la validation" });
    }
  });

  // POST /api/sandbox/sync — synchroniser sandbox → repo principal
  app.post("/api/sandbox/sync", requireAuth, async (_req, res) => {
    try {
      const { syncToMain, validateSandbox } = await import("./server/utils/sandbox");
      // Valider avant de sync
      const validation = await validateSandbox();
      // Ne bloquer que s'il y a de vraies erreurs TypeScript détectées.
      // Si tsc échoue sans produire d'erreurs parsables (ex: config invalide),
      // on laisse passer la sync plutôt que de bloquer l'utilisateur.
      if (!validation.valid && validation.errorCount > 0) {
        return res.json({
          status: "validation_failed",
          valid: false,
          errorCount: validation.errorCount,
          warningCount: validation.warningCount,
          diagnostics: validation.diagnostics,
          errorsByFile: validation.errorsByFile,
          exitCode: validation.exitCode,
          stdout: validation.stdout,
          stderr: validation.stderr,
          signal: validation.signal,
          timedOut: validation.timedOut,
          globalDiagnostics: validation.globalDiagnostics,
          rawOutput: validation.rawOutput,
          errors: validation.rawOutput, // compatibilité historique (chaîne brute)
        });
      }
      const result = await syncToMain();
      res.json({ status: "success", ...result });
    } catch (e: any) {
      res.status(500).json({ status: "error", error: e.message });
    }
  });

  // POST /api/sandbox/accept-file — accepter un seul fichier (sandbox → principal)
  app.post("/api/sandbox/accept-file", requireAuth, async (req, res) => {
    try {
      const filePath = req.body?.path;
      if (!filePath) return res.status(400).json({ error: 'path requis' });
      const { acceptFile, validateSandbox, isSandboxActive } = await import("./server/utils/sandbox");
      const result = await acceptFile(filePath);
      // Validation complémentaire : après accept, indiquer l'état du sandbox
      let postValidation = null;
      if (isSandboxActive()) {
        try { postValidation = await validateSandbox(); } catch { /* ignore */ }
      }
      res.json({
        status: result.applied ? "success" : "not_found",
        ...result,
        postValidation: postValidation ? {
          valid: postValidation.valid,
          errorCount: postValidation.errorCount,
          warningCount: postValidation.warningCount,
          diagnostics: postValidation.diagnostics,
          errorsByFile: postValidation.errorsByFile,
          rawOutput: postValidation.rawOutput,
        } : undefined,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/sandbox/reject-file — rejeter un seul fichier (restaurer l'original)
  app.post("/api/sandbox/reject-file", requireAuth, async (req, res) => {
    try {
      const filePath = req.body?.path;
      if (!filePath) return res.status(400).json({ error: 'path requis' });
      const { rejectFile, validateSandbox, isSandboxActive } = await import("./server/utils/sandbox");
      const result = await rejectFile(filePath);
      let postValidation = null;
      if (isSandboxActive()) {
        try { postValidation = await validateSandbox(); } catch { /* ignore */ }
      }
      res.json({
        status: result.reverted ? "success" : "not_found",
        ...result,
        postValidation: postValidation ? {
          valid: postValidation.valid,
          errorCount: postValidation.errorCount,
          warningCount: postValidation.warningCount,
          diagnostics: postValidation.diagnostics,
          errorsByFile: postValidation.errorsByFile,
          rawOutput: postValidation.rawOutput,
        } : undefined,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/sandbox/discard — abandonner les modifications du sandbox
    app.post("/api/sandbox/discard", requireAuth, async (_req, res) => {
      try {
        const { discardSandbox } = await import("./server/utils/sandbox");
        await discardSandbox();
        res.json({ status: "success" });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // POST /api/sandbox/reset — réinitialiser le sandbox (écraser avec copie fraîche du code source)
      app.post("/api/sandbox/reset", requireAuth, async (req, res) => {
        try {
          const { code } = req.body || {};
          const exitCode = process.env.SANDBOX_EXIT_CODE;

          // Vérifier que le code de sécurité est configuré
          if (!exitCode || exitCode.length !== 6) {
            return res.status(403).json({
              status: "error",
              error: "SANDBOX_EXIT_CODE non configuré ou invalide dans .env (6 chiffres requis)",
            });
          }

          // Vérifier le code fourni
          if (!code || code !== exitCode) {
            return res.status(403).json({
              status: "error",
              error: "Code de sécurité incorrect. 6 chiffres requis pour réinitialiser le sandbox.",
            });
          }

          const { resetSandbox } = await import("./server/utils/sandbox");
          const { appendAuditEvent } = await import("./server/audit");
          const result = await resetSandbox();
          await appendAuditEvent({
            action: "sandbox.reset",
            target: "sandbox",
            details: JSON.stringify({ filesCopied: result.filesCopied }),
          });
          res.json({ status: "success", ...result });
        } catch (e: any) {
          await import("./server/audit").then(({ appendAuditEvent }) =>
            appendAuditEvent({
              action: "sandbox.reset",
              target: "sandbox",
              details: JSON.stringify({ error: e.message }),
            })
          );
          res.status(500).json({ error: e.message });
        }
      });

      // GET /api/sandbox/diff — diff entre sandbox et principal
  app.get("/api/sandbox/diff", requireAuth, async (_req, res) => {
    try {
      const { getSandboxDiff } = await import("./server/utils/sandbox");
      const diffs = await getSandboxDiff();
      res.json({ status: "success", diffs });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/sandbox/file-diff?path=relative/path — contenu avant/après pour un fichier
  app.get("/api/sandbox/file-diff", requireAuth, async (req, res) => {
    try {
      const filePath = typeof req.query.path === 'string' ? req.query.path : '';
      if (!filePath) return res.status(400).json({ error: 'path requis' });

      // Fichiers binaires — pas de diff texte possible
      const ext = filePath.split('.').pop()?.toLowerCase() || '';
      const binaryExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'pdf', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'mp3', 'mp4', 'wav', 'ogg', 'zip', 'tar', 'gz']);
      if (binaryExts.has(ext)) {
        return res.json({
          status: 'success',
          path: filePath,
          binary: true,
          original: null,
          modified: '[Fichier binaire — aperçu non disponible]',
        });
      }

      const { getSandboxRoot } = await import("./server/utils/sandbox");
      const sandboxFile = path.join(getSandboxRoot(), filePath);
      const mainFile = path.join(SELF_ROOT, filePath);

      let sandboxContent: string | null = null;
      let mainContent: string | null = null;

      try { sandboxContent = await fs.promises.readFile(sandboxFile, 'utf-8'); } catch { /* n'existe pas */ }
      try { mainContent = await fs.promises.readFile(mainFile, 'utf-8'); } catch { /* n'existe pas */ }

      res.json({
        status: 'success',
        path: filePath,
        original: mainContent,
        modified: sandboxContent,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/workspace est désactivé — le workspace ne peut plus être changé.
  app.post("/api/workspace", (_req, res) => {
    res.status(403).json({
      error: "Jarvis-OS est un IDE auto-référentiel. Le workspace est verrouillé sur son propre code source.",
      workspace: SELF_ROOT,
    });
  });

  // ── Checkpoints (Phase 2 — garde-fous auto-modification) ─────────────────
  app.post("/api/checkpoint/create", requireAuth, async (req, res) => {
    try {
      const { createCheckpoint } = await import("./server/utils/checkpoint");
      const reason = (req.body as any)?.reason || "checkpoint manuel";
      const hash = await createCheckpoint(reason);
      res.json({ success: true, hash, message: hash ? `Checkpoint créé: ${hash.slice(0, 8)}` : "Rien à sauvegarder." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/checkpoint/rollback", requireAuth, async (req, res) => {
    try {
      const { rollbackToCheckpoint } = await import("./server/utils/checkpoint");
      const { hash } = req.body as { hash?: string };
      if (!hash) return res.status(400).json({ error: "hash est requis." });
      const ok = await rollbackToCheckpoint(hash);
      res.json({ success: ok });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/checkpoint/list", requireAuth, async (_req, res) => {
    try {
      const { listCheckpoints } = await import("./server/utils/checkpoint");
      const checkpoints = await listCheckpoints();
      res.json({ checkpoints });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/checkpoint/validate", requireAuth, async (_req, res) => {
    try {
      const { validateBuild } = await import("./server/utils/checkpoint");
      const result = await validateBuild();
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/ide/tree", requireAuth, async (req, res) => {
    try {
      const clientIp = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] || req.ip || 'unknown';
      if (!enforceRateLimit(ideLimiter, clientIp, res)) return;

      // Aucun projet sélectionné → retourner un arbre vide (pas d'erreur 500)
      if (!hasProject()) {
        return res.json({ path: null, entries: [], noProject: true });
      }

      const root = getWorkspaceRoot();
      const walk = (current: string, rel = '.') : any[] => {
        const entries = fs.readdirSync(current, { withFileTypes: true });
        return entries
          .filter(entry => !['node_modules', '.git', 'dist', 'build', 'out'].includes(entry.name))
          .sort((a, b) => {
            // 1.3 Dossiers avant fichiers, puis tri alphabétique
            if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
          })
          .map(entry => {
            const entryPath = path.join(current, entry.name);
            const entryRel = path.relative(root, entryPath).replace(/\\/g, '/');
            if (entry.isDirectory()) {
              return { name: entry.name, path: entryRel === '' ? '.' : entryRel, type: 'directory', children: walk(entryPath, entryRel) };
            }
            return { name: entry.name, path: entryRel === '' ? '.' : entryRel, type: 'file' };
          });
      };
      res.json({ path: root, entries: walk(root) });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/ide/file", requireAuth, async (req, res) => {
    const clientIp = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] || req.ip || 'unknown';
    if (!enforceRateLimit(ideLimiter, clientIp, res)) return;
    const requestedPath = typeof req.query.path === 'string' ? req.query.path : '';
    if (!requestedPath) return res.status(400).json({ error: 'Le chemin du fichier est requis.' });

    const resolved = resolveRequestedPath(requestedPath);
    if (!resolved || !resolved.ok) {
      const errorResult = resolved as { status: number; error: string };
      return res.status(errorResult.status || 403).json({ error: errorResult.error || 'Chemin hors du workspace.' });
    }
    const absolutePath = resolved.absolutePath;

    try {
      const stat = await fs.promises.stat(absolutePath);
      if (!stat.isFile()) return res.status(404).json({ error: 'Fichier introuvable.' });
    } catch {
      return res.status(404).json({ error: 'Fichier introuvable.' });
    }

    // Fichiers binaires — retourner un placeholder au lieu de lire en UTF-8
    const ext = requestedPath.split('.').pop()?.toLowerCase() || '';
    const binaryExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'pdf', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'mp3', 'mp4', 'wav', 'ogg', 'zip', 'tar', 'gz']);
    if (binaryExts.has(ext)) {
      return res.json({ path: requestedPath, content: '', binary: true });
    }

    res.json({ path: requestedPath, content: await fs.promises.readFile(absolutePath, 'utf-8') });
  });

  // GET /api/ide/file-raw — Servir un fichier binaire brut (images PNG, JPG, etc.)
  app.get("/api/ide/file-raw", requireAuth, async (req, res) => {
    const requestedPath = typeof req.query.path === 'string' ? req.query.path : '';
    if (!requestedPath) return res.status(400).json({ error: 'Le chemin du fichier est requis.' });

    const resolved = resolveRequestedPath(requestedPath);
    if (!resolved || !resolved.ok) {
      const errorResult = resolved as { status: number; error: string };
      return res.status(errorResult.status || 403).json({ error: errorResult.error || 'Chemin hors du workspace.' });
    }
    const absolutePath = resolved.absolutePath;

    try {
      const stat = await fs.promises.stat(absolutePath);
      if (!stat.isFile()) return res.status(404).json({ error: 'Fichier introuvable.' });
    } catch {
      return res.status(404).json({ error: 'Fichier introuvable.' });
    }

    const ext = requestedPath.split('.').pop()?.toLowerCase() || '';
    const mimeTypes: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
      bmp: 'image/bmp', ico: 'image/x-icon',
    };
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(await fs.promises.readFile(absolutePath));
  });

  app.post("/api/ide/file", requireAuth, async (req, res) => {
    const clientIp = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] || req.ip || 'unknown';
    if (!enforceRateLimit(ideLimiter, clientIp, res)) return;
    const { path: requestedPath, content } = req.body as { path?: string; content?: string };
    if (!requestedPath) return res.status(400).json({ error: 'Le chemin du fichier est requis.' });

    const resolved = resolveRequestedPath(requestedPath);
    if (!resolved || !resolved.ok) {
      const errorResult = resolved as { status: number; error: string };
      return res.status(errorResult.status || 403).json({ error: errorResult.error || 'Chemin hors du workspace.' });
    }
    const absolutePath = resolved.absolutePath;

    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.promises.writeFile(absolutePath, content || '', 'utf-8');
    // Track modified files in sandbox mode
    if (isSandboxActive()) {
      const { markFileModified } = await import("./server/utils/sandbox");
      markFileModified(requestedPath);
    }
    await appendAuditEvent({ action: 'write_file', target: requestedPath, details: 'updated via IDE', actor: 'user' });
    res.json({ status: 'success', path: requestedPath, sandbox: isSandboxActive() });
  });

  app.post("/api/ide/create-file", requireAuth, async (req, res) => {
    const clientIp = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] || req.ip || 'unknown';
    if (!enforceRateLimit(ideLimiter, clientIp, res)) return;
    const { path: requestedPath } = req.body as { path?: string };
    if (!requestedPath) return res.status(400).json({ error: 'Le chemin du fichier est requis.' });

    const resolved = resolveRequestedPath(requestedPath);
    if (!resolved || !resolved.ok) {
      const errorResult = resolved as { status: number; error: string };
      return res.status(errorResult.status || 403).json({ error: errorResult.error || 'Chemin hors du workspace.' });
    }
    const absolutePath = resolved.absolutePath;

    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.promises.writeFile(absolutePath, '', 'utf-8');
    await appendAuditEvent({ action: 'create_file', target: requestedPath, details: 'created via IDE', actor: 'user' });
    res.json({ status: 'success', path: requestedPath });
  });

  app.post("/api/ide/create-directory", requireAuth, async (req, res) => {
    const clientIp = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] || req.ip || 'unknown';
    if (!enforceRateLimit(ideLimiter, clientIp, res)) return;
    const { path: requestedPath } = req.body as { path?: string };
    if (!requestedPath) return res.status(400).json({ error: 'Le chemin du dossier est requis.' });

    const resolved = resolveRequestedPath(requestedPath);
    if (!resolved || !resolved.ok) {
      const errorResult = resolved as { status: number; error: string };
      return res.status(errorResult.status || 403).json({ error: errorResult.error || 'Chemin hors du workspace.' });
    }
    const absolutePath = resolved.absolutePath;

    await fs.promises.mkdir(absolutePath, { recursive: true });
    await appendAuditEvent({ action: 'create_directory', target: requestedPath, details: 'created via IDE', actor: 'user' });
    res.json({ status: 'success', path: requestedPath });
  });

  // ── IDE: rename / move ───────────────────────────────────────────────────
  app.post("/api/ide/rename", requireAuth, async (req, res) => {
    const clientIp = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] || req.ip || 'unknown';
    if (!enforceRateLimit(ideLimiter, clientIp, res)) return;

    const { oldPath, newPath } = req.body as { oldPath?: string; newPath?: string };
    if (!oldPath || !newPath) return res.status(400).json({ error: 'oldPath et newPath sont requis.' });

    const resolvedOld = resolveRequestedPath(oldPath);
    const resolvedNew = resolveRequestedPath(newPath);
    if (!resolvedOld || !resolvedOld.ok) return res.status(403).json({ error: 'Chemin source hors du workspace.' });
    if (!resolvedNew || !resolvedNew.ok) return res.status(403).json({ error: 'Chemin destination hors du workspace.' });

    if (!fs.existsSync(resolvedOld.absolutePath)) return res.status(404).json({ error: 'Source introuvable.' });
    if (fs.existsSync(resolvedNew.absolutePath))  return res.status(409).json({ error: 'Un fichier existe déjà à la destination.' });

    // Créer les dossiers parents de la destination si nécessaire
    await fs.promises.mkdir(path.dirname(resolvedNew.absolutePath), { recursive: true });
    await fs.promises.rename(resolvedOld.absolutePath, resolvedNew.absolutePath);
    await appendAuditEvent({ action: 'rename', target: oldPath, details: `→ ${newPath}`, actor: 'user' });
    res.json({ status: 'success', oldPath, newPath });
  });

  // ── IDE: copy ────────────────────────────────────────────────────────────
  app.post("/api/ide/copy", requireAuth, async (req, res) => {
    const clientIp = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] || req.ip || 'unknown';
    if (!enforceRateLimit(ideLimiter, clientIp, res)) return;

    const { srcPath, destPath } = req.body as { srcPath?: string; destPath?: string };
    if (!srcPath || !destPath) return res.status(400).json({ error: 'srcPath et destPath sont requis.' });

    const resolvedSrc  = resolveRequestedPath(srcPath);
    const resolvedDest = resolveRequestedPath(destPath);
    if (!resolvedSrc  || !resolvedSrc.ok)  return res.status(403).json({ error: 'Chemin source hors du workspace.' });
    if (!resolvedDest || !resolvedDest.ok) return res.status(403).json({ error: 'Chemin destination hors du workspace.' });

    if (!fs.existsSync(resolvedSrc.absolutePath)) return res.status(404).json({ error: 'Source introuvable.' });

    // Generate a unique destination path if it already exists
    let finalDest = resolvedDest.absolutePath;
    if (fs.existsSync(finalDest)) {
      const ext  = path.extname(finalDest);
      const base = finalDest.slice(0, finalDest.length - ext.length);
      let i = 1;
      while (fs.existsSync(`${base}_copy${i > 1 ? i : ''}${ext}`)) i++;
      finalDest = `${base}_copy${i > 1 ? i : ''}${ext}`;
    }

    await fs.promises.mkdir(path.dirname(finalDest), { recursive: true });

    // Recursive copy helper
    const copyRecursive = async (src: string, dest: string) => {
      const stat = await fs.promises.stat(src);
      if (stat.isDirectory()) {
        await fs.promises.mkdir(dest, { recursive: true });
        const entries = await fs.promises.readdir(src);
        for (const entry of entries) {
          await copyRecursive(path.join(src, entry), path.join(dest, entry));
        }
      } else {
        await fs.promises.copyFile(src, dest);
      }
    };

    await copyRecursive(resolvedSrc.absolutePath, finalDest);
    const finalRelative = path.relative(resolvedSrc.absolutePath.replace(path.basename(resolvedSrc.absolutePath), ''), finalDest);
    await appendAuditEvent({ action: 'copy', target: srcPath, details: `→ ${destPath}`, actor: 'user' });
    res.json({ status: 'success', srcPath, destPath: finalRelative });
  });

  // ── IDE: search ──────────────────────────────────────────────────────────
  app.post("/api/ide/search", requireAuth, async (req, res) => {
    const clientIp = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] || req.ip || 'unknown';
    if (!enforceRateLimit(ideLimiter, clientIp, res)) return;

    const { query, caseSensitive, regex, filePattern } = req.body as {
      query?: string;
      caseSensitive?: boolean;
      regex?: boolean;
      filePattern?: string;
    };

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query string is required' });
    }

    try {
      const results: Array<{ file: string; line: number; column: number; preview: string }> = [];
      
      // Simple file-by-file search implementation
      const searchDir = (dir: string, relativePath = '.') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (['node_modules', '.git', 'dist', 'build', 'out', '.next', '.vscode'].includes(entry.name)) {
            continue;
          }
          
          const fullPath = path.join(dir, entry.name);
          const relPath = path.relative(getWorkspaceRoot(), fullPath).replace(/\\/g, '/');
          
          if (entry.isDirectory()) {
            searchDir(fullPath, relPath);
          } else if (entry.isFile()) {
            // Skip binary files, images, etc.
            const ext = path.extname(entry.name).toLowerCase();
            if (['.exe', '.dll', '.so', '.dylib', '.jpg', '.jpeg', '.png', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.eot'].includes(ext)) {
              continue;
            }
            
            // Apply file pattern filter if specified
            if (filePattern && !entry.name.includes(filePattern)) {
              continue;
            }
            
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const lines = content.split('\n');
              
              for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                const line = lines[lineNum];
                let searchText = line;
                let searchQuery = query;
                
                if (!caseSensitive) {
                  searchText = line.toLowerCase();
                  searchQuery = query.toLowerCase();
                }
                
                let matches: RegExpMatchArray[] = [];
                
                if (regex) {
                  try {
                    const flags = caseSensitive ? 'g' : 'gi';
                    const regexObj = new RegExp(query, flags);
                    let match;
                    while ((match = regexObj.exec(line)) !== null) {
                      matches.push(match);
                      if (!regexObj.global) break;
                    }
                  } catch (e) {
                    // Invalid regex, fallback to text search
                    const index = searchText.indexOf(searchQuery);
                    if (index !== -1) {
                      matches.push([searchQuery] as any);
                      matches[0].index = index;
                    }
                  }
                } else {
                  let startIndex = 0;
                  let index;
                  while ((index = searchText.indexOf(searchQuery, startIndex)) !== -1) {
                    matches.push([searchQuery] as any);
                    matches[matches.length - 1].index = index;
                    startIndex = index + searchQuery.length;
                  }
                }
                
                for (const match of matches) {
                  results.push({
                    file: relPath,
                    line: lineNum + 1,
                    column: (match.index ?? 0) + 1,
                    preview: line,
                  });
                  
                  // Limit results to prevent overwhelming
                  if (results.length >= 1000) {
                    return res.json({ results: results.slice(0, 1000), truncated: true });
                  }
                }
              }
            } catch (e) {
              // Skip files that can't be read as UTF-8
              continue;
            }
          }
        }
      };
      
      searchDir(getWorkspaceRoot());
      res.json({ results });
      
    } catch (error: any) {
      console.error('Search error:', error);
      res.status(500).json({ error: error.message || 'Search failed' });
    }
  });

  app.delete("/api/ide/file", requireAuth, async (req, res) => {
    const clientIp = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] || req.ip || 'unknown';
    if (!enforceRateLimit(ideLimiter, clientIp, res)) return;
    const requestedPath = typeof req.query.path === 'string' ? req.query.path : '';
    if (!requestedPath) return res.status(400).json({ error: 'Le chemin du fichier est requis.' });

    const resolved = resolveRequestedPath(requestedPath);
    if (!resolved || !resolved.ok) {
      const errorResult = resolved as { status: number; error: string };
      return res.status(errorResult.status || 403).json({ error: errorResult.error || 'Chemin hors du workspace.' });
    }
    const absolutePath = resolved.absolutePath;

    if (!fs.existsSync(absolutePath)) return res.status(404).json({ error: 'Fichier introuvable.' });
    fs.rmSync(absolutePath, { recursive: true, force: true });
    await appendAuditEvent({ action: 'delete_file', target: requestedPath, details: 'deleted via IDE', actor: 'user' });
    res.json({ status: 'success', path: requestedPath });
  });

  // ── Browser: canal retour webview → skill ───────────────────────────────
  // Le BrowserPanel (frontend) appelle POST /api/browser/content-result après
  // avoir exécuté du JS dans la webview. Le skill browser_read_content attend
  // ce résultat via une promesse stockée dans browserReadPending.
  app.post("/api/browser/content-result", requireAuth, (req, res) => {
    const { requestId, result, error } = req.body as {
      requestId?: string;
      result?: string | null;
      error?: string | null;
    };
    if (!requestId) return res.status(400).json({ error: 'requestId manquant.' });

    const pending = browserReadPending.get(requestId);
    if (!pending) {
      return res.json({ status: 'ignored' });
    }
    browserReadPending.delete(requestId);
    clearTimeout(pending.timer);

    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(result ?? '');
    }
    res.json({ status: 'ok' });
  });

  // ── Browser: canal retour actions interactives ──────────────────────────
  // click / type / snapshot / inspect → POST /api/browser/action-result
  app.post("/api/browser/action-result", requireAuth, (req, res) => {
    const { requestId, result, error } = req.body as {
      requestId?: string;
      result?: any;
      error?: string | null;
    };
    if (!requestId) return res.status(400).json({ error: 'requestId manquant.' });

    const pending = browserActionPending.get(requestId);
    if (!pending) {
      return res.json({ status: 'ignored' });
    }
    browserActionPending.delete(requestId);
    clearTimeout(pending.timer);

    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(result);
    }
    res.json({ status: 'ok' });
  });

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
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // WebSocket server for Live API
  const wss = new WebSocketServer({ noServer: true });


  // WebSocket server for Sandbox file watching (real-time)
  const sandboxWss = new WebSocketServer({ noServer: true });

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
    } else {
      // In dev, Vite's own upgrade listener (registered via hmr.server)
      // handles the HMR WebSocket — just return and let it process.
      // In production, no other WS paths are expected so destroy.
      if (!vite) {
        socket.destroy();
      }
    }
  });

  // ── Sandbox Watcher WebSocket ────────────────────────────────────────────
  sandboxWss.on("connection", async (clientWs) => {
    const { addWatchClient, startWatching } = await import("./server/utils/sandboxWatcher");
    console.log("[SandboxWatch] Client connecté");
    addWatchClient(clientWs);
    // Démarrer la surveillance si le sandbox est actif
    if (isSandboxActive()) {
      startWatching();
    }
  });

  wss.on("connection", async (clientWs, req) => {
    console.log("Client connected to WebSocket");

    const unsubscribeValidation = subscribeToValidation((data) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        try {
          clientWs.send(JSON.stringify(data));
        } catch {
          /* ignore */
        }
      }
    });

    clientWs.on("close", () => {
      unsubscribeValidation();
    });

    const urlParams = new URLSearchParams(req.url?.split('?')[1] || '');
    const clientConvId = urlParams.get('conversation_id');

    // ── Persistent conversation tracking ────────────────────────────────────
    let conversationId: string | null = null;
    let assistantBuffer = "";
    let assistantFlushTimer: ReturnType<typeof setTimeout> | null = null;
    let conversationReady: Promise<void> | null = null;
    let lastErrorMessage: string | null = null;
    let lastServerMessage: LiveServerMessage | null = null;

    // ── Busy-state tracking : notification d'occupation pendant les tâches ──
    // Référence mutable partagée avec handleToolCall (évite le problème de closure).
    // activeDescription contient la description de la tâche en cours, ou null si disponible.
    const busyStateRef = { activeDescription: null as string | null };
    const getBusyDescription = () => busyStateRef.activeDescription;

    // ── Conversation Context Monitor (Optimisation Leanna #5) ───────────────
    // Surveille en continu la taille du contexte réinjecté et alerte avant overflow
    const CONTEXT_WINDOW_TOKENS = 1_000_000; // Gemini 2.5 Flash: 1M tokens
    const SAFE_BUDGET_TOKENS = Math.floor(CONTEXT_WINDOW_TOKENS * 0.85); // 850k = sécurité
    const WARNING_THRESHOLD = Math.floor(CONTEXT_WINDOW_TOKENS * 0.60);  // 600k = premier avertissement
    const CRITICAL_THRESHOLD = Math.floor(CONTEXT_WINDOW_TOKENS * 0.85); // 850k = critique (proche overflow)

    const conversationCtx = {
              totalPromptTokens: 0,
              totalCompletionTokens: 0,
              maxPromptTokensInTurn: 0,
              turns: 0,
              warningsIssued: new Set<string>(),
              lastAlertLevel: '' as '' | 'warn' | 'critical',
              // Garde-fous anti-boucle pour auto-résumé
              lastAutoSummarizeAt: 0,
              autoSummarizeCount: 0,
            };

        // Déclaration de la fonction d'auto-résumé (sera initialisée après la connexion Gemini)
                let autoSummarizeContext: (() => Promise<void>) | null = null;

                const resolveContextLevel = (percent: number): 'ok' | 'warn' | 'critical' => {
      if (percent >= 85) return 'critical';
      if (percent >= 60) return 'warn';
      return 'ok';
    };

    const sendContextSize = (
      currentSize: number,
      opts?: { turns?: number; suggestion?: string; level?: 'ok' | 'warn' | 'critical' },
    ) => {
      const percent = Math.round((currentSize / CONTEXT_WINDOW_TOKENS) * 100);
      const level = opts?.level ?? resolveContextLevel(percent);
      try {
        clientWs.send(JSON.stringify({
          context_size: {
            currentSize,
            maxSize: CONTEXT_WINDOW_TOKENS,
            percent,
            level,
            turns: opts?.turns ?? conversationCtx.turns,
            suggestion: opts?.suggestion,
          },
        }));
      } catch {}
    };

    const monitorConversationContext = (prompt: number, completion: number, total: number) => {
          conversationCtx.totalPromptTokens += prompt;
          conversationCtx.totalCompletionTokens += completion;
          conversationCtx.maxPromptTokensInTurn = Math.max(conversationCtx.maxPromptTokensInTurn, prompt);
          conversationCtx.turns++;

          const cumulative = conversationCtx.totalPromptTokens + conversationCtx.totalCompletionTokens;
          const currentPct = (cumulative / CONTEXT_WINDOW_TOKENS) * 100;
          const turnPct = (prompt / CONTEXT_WINDOW_TOKENS) * 100;

          const baseLog =
            `[ContextMonitor] 🔄 Tour ${conversationCtx.turns}: prompt=${prompt} (${turnPct.toFixed(1)}%)` +
            ` | cumulatif=${cumulative}/${CONTEXT_WINDOW_TOKENS} (${currentPct.toFixed(1)}%)`;

          if (cumulative >= CRITICAL_THRESHOLD && !conversationCtx.warningsIssued.has('critical')) {
            conversationCtx.warningsIssued.add('critical');
            conversationCtx.lastAlertLevel = 'critical';
            console.warn(
              `[ContextMonitor] 🔴 CRITIQUE: contexte à ${currentPct.toFixed(1)}% ! ` +
              `Risque d'overflow Gemini. Recommandation: démarrer une nouvelle session ou résumer la conversation.`
            );
            sendContextSize(cumulative, {
              level: 'critical',
              turns: conversationCtx.turns,
              suggestion: "Contexte proche de la limite. Démarrer une nouvelle conversation ou demander un résumé.",
            });
            try {
              clientWs.send(JSON.stringify({
                context_alert: {
                  level: 'critical',
                  used_tokens: cumulative,
                  max_tokens: CONTEXT_WINDOW_TOKENS,
                  percent: Math.round(currentPct),
                  suggestion: "Contexte proche de la limite. Démarrer une nouvelle conversation ou demander un résumé.",
                  turns: conversationCtx.turns,
                }
              }));
            } catch {}

            // Déclencher l'auto-résumé si conditions réunies
            autoSummarizeContext?.();
          } else if (cumulative >= WARNING_THRESHOLD && !conversationCtx.warningsIssued.has('warn')) {
        conversationCtx.warningsIssued.add('warn');
        conversationCtx.lastAlertLevel = 'warn';
        console.warn(
          `[ContextMonitor] 🟠 AVERTISSEMENT: contexte à ${currentPct.toFixed(1)}% de la fenêtre. ` +
          `Garder un œil sur la croissance du prompt.`
        );
        sendContextSize(cumulative, {
          level: 'warn',
          turns: conversationCtx.turns,
          suggestion: "Conversation longue. Envisager un résumé ou knowledge_memory_add.",
        });
        try {
          clientWs.send(JSON.stringify({
            context_alert: {
              level: 'warn',
              used_tokens: cumulative,
              max_tokens: CONTEXT_WINDOW_TOKENS,
              percent: Math.round(currentPct),
              suggestion: "Conversation longue. Envisager un résumé ou knowledge_memory_add.",
              turns: conversationCtx.turns,
            }
          }));
        } catch {}
                      } else {
                        console.log(baseLog);
                      }

                      sendContextSize(cumulative, { turns: conversationCtx.turns });
                    };

                    const flushAssistantBuffer = async () => {
      if (conversationReady) await conversationReady;
      if (assistantBuffer.trim() && conversationId) {
        const text = assistantBuffer.trim();
        assistantBuffer = "";
        saveMessage("assistant", text, conversationId).catch(e =>
          console.error("[History] Erreur flush assistant:", e)
        );
      }
    };

    // Start a new conversation session or resume existing one
    if (clientConvId) {
      conversationId = clientConvId;
      conversationReady = Promise.resolve();
      console.log(`[History] Conversation reprise: ${conversationId}`);
    } else if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      conversationReady = startConversation()
        .then(id => {
          conversationId = id;
          console.log(`[History] Conversation prête: ${id}`);
          try { clientWs.send(JSON.stringify({ conversation_id: id })); } catch {}
        })
        .catch(e => console.error("[History] Erreur démarrage conversation:", e));
    }

    // ── Résumé de contexte pour reprise après overflow ────────────────────────
    // Si le client reconnecte après un context_overflow, il peut fournir
    // un indicateur via context_resume. Le serveur chargera alors le résumé
    // de la conversation depuis Supabase et l'injectera comme contexte initial.
    const isContextResume = urlParams.get('context_resume') === '1';
    let contextResumeSummary = '';
    if (isContextResume && clientConvId && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        const { data } = await supabase.from('conversations').select('summary').eq('id', clientConvId).single();
        if (data?.summary) {
          contextResumeSummary = data.summary;
          console.log(`[ContextResume] 📋 Résumé trouvé pour conversation ${clientConvId} (${contextResumeSummary.length} chars)`);
        } else {
          // Pas de résumé en BDD, en générer un à partir des derniers messages
          const messages = await getConversationMessages(clientConvId, 100);
          if (messages.length >= 4) {
            const chatMsgs = messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
            const { summary } = await summarizeWithLLM(chatMsgs);
            contextResumeSummary = summary;
            console.log(`[ContextResume] 🧠 Résumé généré à la volée (${summary.length} chars, ${messages.length} messages)`);
          }
        }
      } catch (e) {
        console.warn('[ContextResume] Erreur chargement résumé:', e);
      }
    }

    try {
      const requestedSkills = urlParams.get('skills')?.split(',') || undefined;
      const sessionMode = (urlParams.get('mode') as 'ask' | 'full') || currentProfile.mode || 'full';
      const initialQuery = urlParams.get('q') || urlParams.get('query') || '';
      const declarations = skillManager.getToolDeclarations(requestedSkills);

      // ── Optimisation Leanna #1 : Injection Dynamique des Outils ──
      // Tier 1 COMPACT (outils essentiels ultra-légers, ~15 outils)
      // Tier 2 (pertinence sémantique ≥ seuil, via initialQuery)
      // Tier 3 (sur demande via request_tools)
      // Gain estimé: ~9000 tokens vs chargement complet.
      const TIER1_CORE_TOOLS = new Set([
        'read_file_outline', 'read_project_file', 'list_project_files',
        'modify_project_file', 'patch_project_file', 'write_project_file',
        'rename_project_file', 'delete_project_file', 'create_project_directory',
        'search_in_files',
        'open_project_file', 'open_ide', 'get_workspace_info',
        'analyze_project_file', 'get_workspace_info',
        'save_memory', 'search_memory',
        'knowledge_build_context', 'knowledge_semantic_search',
        'knowledge_memory_search',
        'get_current_time',
        'automation_search',
        'browser_navigate', 'browser_search', 'browser_open', 'browser_read_content',
        'reasoning_think',
        'agent_orchestrate', 'agent_status',
        'knowledge_search_entities', 'knowledge_status',
        'knowledge_memory_add', 'knowledge_memory_list',
        'knowledge_impact_analyze', 'knowledge_reindex',
      ]);

      // Outils Knowledge autorisés en demande via request_tools (tier2 supplémentaire)
      const TIER2_KNOWLEDGE_EXTRA = new Set([
        'knowledge_search_entities', 'knowledge_status',
        'knowledge_memory_add', 'knowledge_memory_list',
        'knowledge_impact_analyze', 'knowledge_reindex',
      ]);

      // In ask mode, more restrictive
      const ASK_MODE_ALLOWED_TOOLS = new Set([
        'list_project_files', 'read_project_file', 'read_file_outline', 'search_in_files',
        'analyze_project_file', 'get_workspace_info', 'open_project_file', 'open_ide',
        'save_memory', 'search_memory',
        // Knowledge System (lecture seule, compatible ask mode)
        'knowledge_build_context', 'knowledge_semantic_search',
        'knowledge_memory_search', 'knowledge_memory_list',
        'knowledge_search_entities', 'knowledge_status',
        'get_current_time', 'get_weather', 'get_github_user',
        'list_list_all', 'list_get',
        'system_info',
        'search_history', 'list_conversations', 'get_conversation_messages',
        'write_project_file',
        'automation_search',
        'automation_list_scheduled_tasks',
        // + Agents
  'agent_delegate',
  'agent_orchestrate',
  'agent_status',
  'agent_list_tasks',
  'agent_list_roles',
  'agent_cancel',
  'agent_stats',
      ]);

      let filteredDeclarations: typeof declarations;
      let scoringInfo: { always: string[]; dynamic: string[]; scored: { name: string; score: number }[] } | null = null;

      if (sessionMode === 'ask') {
        filteredDeclarations = declarations.filter(d =>
    ASK_MODE_ALLOWED_TOOLS.has(d.name) || (d as any)._mcpServerId
  );
      } else {
        // ── Mode full : Chargement dynamique par pertinence (Optimisation Leanna) ──
        const useDynamicRelevance = process.env.FORCE_TIERED_TOOLS !== 'false';

        if (useDynamicRelevance) {
          // Utiliser le nouveau classifieur de pertinence si query disponible
          if (initialQuery.trim().length > 0) {
            const rel = skillManager.getRelevantToolDeclarations(initialQuery, requestedSkills);
            filteredDeclarations = rel.declarations;
            scoringInfo = {
              always: rel.alwaysLoaded,
              dynamic: rel.dynamicallyLoaded,
              scored: rel.scoredSkills,
            };
          } else {
            // Sans query : Tier 1 ultra-compact + request_tools
            filteredDeclarations = declarations.filter(d => TIER1_CORE_TOOLS.has(d.name));
            filteredDeclarations.push({
              name: 'request_tools',
              description: `Demande le chargement d'outils supplémentaires. Catégories: "git", "github", "automation", "lists", "weather", "reasoning", "history", "system", "knowledge", "verify", "guidelines", "selfImprovement", "all". Les outils sont réellement chargés en mémoire et deviennent disponibles immédiatement. Exemple: pour commit/push → category:"git" ; pour consulter météo → category:"weather".`,
              parameters: {
                type: 'OBJECT',
                properties: {
                  category: {
                    type: 'STRING',
                    description: 'Catégorie d\'outils à charger: "git", "github", "automation", "lists", "weather", "reasoning", "history", "system", "knowledge", "verify", "guidelines", "selfImprovement", "all"',
                  },
                },
                required: ['category'],
              },
            } as any);
            scoringInfo = {
              always: Array.from(TIER1_CORE_TOOLS),
              dynamic: [],
              scored: [],
            };
          }
        } else {
          // Mode full standard : tous les outils chargés immédiatement
          filteredDeclarations = declarations;
        }
      }

      // ── Filtrage des outils d'écriture et agents selon la config ──
      const agentsConfig = currentProfile.agents;
      const agentsEnabled = agentsConfig?.enabled !== false; // activé par défaut

      if (agentsEnabled) {
        // Agents actifs : l'assistant PEUT écrire directement ET déléguer aux agents
        // Les outils d'écriture restent disponibles pour permettre les opérations
        // de fichiers directes (créer dossiers, déplacer fichiers, modifications simples)
      } else {
        // Agents désactivés : retirer les outils agents, garder les outils d'écriture directe
        const AGENT_TOOLS = new Set([
          'agent_delegate',
          'agent_orchestrate',
          'agent_status',
          'agent_list_tasks',
          'agent_list_roles',
          'agent_cancel',
          'agent_stats',
        ]);
        filteredDeclarations = filteredDeclarations.filter(d => !AGENT_TOOLS.has(d.name));
      }

      // ── Filtrage Git — toujours désactivé ──
      filteredDeclarations = filteredDeclarations.filter(d => !d.name.startsWith('git_'));

      // ── Filtrage Reasoning si désactivé ──
      if (currentProfile.reasoningEnabled === false) {
        filteredDeclarations = filteredDeclarations.filter(d => !d.name.startsWith('reasoning_'));
      }

      const tools = filteredDeclarations.length > 0 ? [{ functionDeclarations: filteredDeclarations }] : undefined;

      // Log tool loading
      console.log(`[TokenOptimizer] 🔧 Outils chargés: ${filteredDeclarations.length}/${declarations.length} (mode: ${sessionMode}${requestedSkills ? ', skills: ' + requestedSkills.join(',') : ''}, agents: ${agentsEnabled ? 'ON' : 'OFF'}, git: OFF)`);
      console.log(`[TokenOptimizer]    Outils: ${filteredDeclarations.map(d => d.name).join(', ')}`);

      if (scoringInfo && scoringInfo.scored.length > 0) {
        const topSkills = scoringInfo.scored.filter(s => s.score > 0).slice(0, 5);
        if (topSkills.length > 0) {
          console.log(`[TokenOptimizer] 🎯 Pertinence (top): ${topSkills.map(s => `${s.name}=${s.score}`).join(', ')}`);
        }
        if (scoringInfo.dynamic.length > 0) {
          console.log(`[TokenOptimizer] ⚡ Skills dynamiques chargés: ${scoringInfo.dynamic.join(', ')}`);
        }
      }
      
      // Vérifier que les outils agents sont bien inclus
      const agentTools = filteredDeclarations.filter(d => d.name.startsWith('agent_'));
      if (agentTools.length > 0) {
        console.log(`[TokenOptimizer] 🤖 Outils agents disponibles: ${agentTools.map(d => d.name).join(', ')}`);
      } else {
        const hasRequestTools = filteredDeclarations.some(d => d.name === 'request_tools');
        if (hasRequestTools) {
          console.info(`[TokenOptimizer] ℹ️  Aucun outil agent dans le tier actif — accessible via request_tools (catégorie: "knowledge" pour agent_* via system skills, ou activer skill "agents").`);
        } else {
          console.warn(`[TokenOptimizer] ⚠️  AUCUN outil agent trouvé et request_tools absent ! Vérifier enregistrement skill "agents".`);
        }
      }

      const toolTokensEstimate = filteredDeclarations.reduce((sum, d) => {
        const descTokens = estimateToolTokens(d);
        return sum + descTokens;
      }, 0);
      const tokensEconomises = estimateToolTokens_total(skillManager.getToolDeclarations()) - toolTokensEstimate;
      console.log(`[TokenOptimizer]    Tokens outils estimés: ~${toolTokensEstimate} (économie: ~${tokensEconomises} tokens)`);
      if (tokensEconomises > 5000) {
        console.log(`[TokenOptimizer]    ✅ Gain token substantiel (${Math.round(tokensEconomises / 1000)}k tokens économisés sur les déclarations)`);
      }


      // ── Build dynamic system instruction from profile ────────────────────
      let systemText = buildSystemInstruction({
        ...currentProfile,
        workspace: getWorkspaceRoot(),
        mode: sessionMode,
      });
      const voiceName  = currentProfile.aiVoice || "Aoede";

      // ── Hyperparameters from profile ────────────────────────────────────
      const temperature      = currentProfile.temperature ?? 0.9;
      const topP             = currentProfile.topP ?? 0.95;

      // ── Token optimization logs ─────────────────────────────────────────
      const systemTokensEst = Math.ceil((systemText.split(/\s+/).length * 1.3 + systemText.length / 4) / 2);
      console.log(`[TokenOptimizer] ═══════════════════════════════════════════`);
      console.log(`[TokenOptimizer] 📊 Nouvelle session Gemini Live`);
      console.log(`[TokenOptimizer]    Mode: ${sessionMode} | Compact: ${!!(currentProfile as any).compactPrompt}`);
      console.log(`[TokenOptimizer]    System prompt: ~${systemTokensEst} tokens (${systemText.length} chars)`);
      console.log(`[TokenOptimizer]    Temperature: ${temperature} | TopP: ${topP}`);
      console.log(`[TokenOptimizer] ═══════════════════════════════════════════`);

      // RAG: Récupération du contexte récent (mémoires) pour l'injecter dans le prompt
      let memoryContext = "";
      // Token optimization: limiter les mémoires et conversations selon le budget
      const memoryBudgetTokens = 2000; // Budget tokens pour la mémoire
      const knowledgeBudgetTokens = 3000; // Budget tokens pour le contexte Knowledge
      const notebookBudgetTokens = 15_000; // Budget tokens pour le contexte notebooks (≈60k chars)
      const maxMemories = currentProfile.temperature !== undefined && currentProfile.temperature < 0.5 ? 5 : 10;
      const maxConversations = 3;
      // Hard cap absolu sur le prompt système final (base + tous contextes) avant envoi à Gemini.
      // Une session démarre avec ce prompt injecté à CHAQUE tour 0 : si on dépasse ~60k tokens,
      // la facturation/quota explose dès l'ouverture d'une session (260k → quota immédiat).
      const INITIAL_PROMPT_MAX_TOKENS = 60_000;
      const INITIAL_PROMPT_MAX_CHARS = INITIAL_PROMPT_MAX_TOKENS * 4;

      if ((!requestedSkills || requestedSkills.includes("memory")) && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        try {
          const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
          // On récupère les dernières mémoires pour le contexte initial (limité par budget)
          const { data } = await supabase
            .from('memories')
            .select('content')
            .order('created_at', { ascending: false })
            .limit(maxMemories);
            
          if (data && data.length > 0) {
            // Optimisation : tronquer les mémoires trop longues et respecter le budget
            let usedTokens = 0;
            const optimizedMemories: string[] = [];
            for (const m of data) {
              const content = m.content.length > 200 ? m.content.slice(0, 200) + '…' : m.content;
              const estimated = Math.ceil(content.length / 4);
              if (usedTokens + estimated > memoryBudgetTokens) break;
              optimizedMemories.push(content);
              usedTokens += estimated;
            }

            if (optimizedMemories.length > 0) {
              memoryContext = "\n\n[Mémoire contextuelle]\n" + 
                              optimizedMemories.map(m => "• " + m).join("\n");
              console.log(`[RAG] Injecté ${optimizedMemories.length}/${data.length} mémoires (${usedTokens} tokens estimés).`);
            }
          } else {
            console.log(`[RAG] Aucune mémoire trouvée pour l'injection.`);
          }

          // Injecter un résumé compact des conversations récentes si la session ne vient pas juste de commencer
          const isNewSession = !clientConvId;
          if (!isNewSession && (!requestedSkills || requestedSkills.includes("history"))) {
            const { data: recentConvs } = await supabase
              .from('conversations')
              .select('title, summary, started_at, message_count')
              .order('started_at', { ascending: false })
              .limit(maxConversations);

            if (recentConvs && recentConvs.length > 0) {
              // Optimisation : format compact, résumé tronqué
              memoryContext += "\n\n[Conversations récentes]\n" +
                recentConvs.map(c => {
                  const title = (c.title || 'Sans titre').slice(0, 50);
                  const summary = c.summary ? c.summary.slice(0, 100) : '';
                  return `• ${title} (${c.message_count}msg)${summary ? ' — ' + summary : ''}`;
                }).join("\n");
              console.log(`[RAG] Injecté ${recentConvs.length} conversations récentes (compact).`);
            }
          }
        } catch(e) {
          console.error("[RAG] Erreur lors de la récupération du contexte mémoire", e);
        }
      }

      // ── Knowledge System — Injection proactive du contexte projet ────────
      // Injecte un résumé compact de la mémoire projet et du graphe de connaissances
      // dans le prompt système pour que l'assistant ait immédiatement conscience du projet.
      let knowledgeContext = "";
      try {
        if (knowledgeGraph.isInitialized()) {
          const kgSummary = knowledgeGraph.toContextSummary();
          const pmSummary = projectMemory.toContextSummary(8);
          
          knowledgeContext = "\n\n[Knowledge System — Contexte Projet]\n" + kgSummary;
          if (pmSummary) {
            knowledgeContext += "\n" + pmSummary;
          }

          // Si une query initiale est fournie, enrichir avec un contexte ciblé
          if (initialQuery && initialQuery.length > 5) {
            try {
              const ctx = understandingEngine.buildContext(initialQuery, { 
                strategy: 'minimal', 
                detail: 'compact',
                maxFiles: 4,
                maxFacts: 5 
              });
              if (ctx.systemPromptInject) {
                knowledgeContext += "\n\n" + ctx.systemPromptInject;
                console.log(`[Knowledge] 🧠 Contexte proactif injecté pour query="${initialQuery.slice(0, 50)}…" (confiance: ${ctx.score.confidence}%)`);
              }
            } catch (e) {
              console.debug(`[Knowledge] Contexte proactif non disponible: ${(e as Error).message}`);
            }
          }

          let kTokens = Math.ceil(knowledgeContext.length / 4);
          if (kTokens > knowledgeBudgetTokens) {
            const maxChars = knowledgeBudgetTokens * 4;
            knowledgeContext = knowledgeContext.slice(0, maxChars) + "\n…[tronqué — budget Knowledge atteint]";
            kTokens = knowledgeBudgetTokens;
            console.warn(`[Knowledge] ⚠️ Contexte projet tronqué à ~${kTokens} tokens (dépassement du budget ${knowledgeBudgetTokens})`);
          }
          console.log(`[Knowledge] ✅ Contexte projet injecté: ~${kTokens} tokens (${knowledgeGraph.getStats().totalFiles} fichiers, ${projectMemory.size} faits)`);
        } else {
          console.log(`[Knowledge] ⏸️ KnowledgeGraph non initialisé — pas d'injection`);
        }
      } catch (e) {
        console.debug(`[Knowledge] Module indisponible: ${(e as Error).message}`);
      }

      // ── Notebooks — Injection budgetée du contenu des notebooks ──────────
      // Stratégie anti-bloat : résumés d'abord, limites par source/par notebook,
      // et budget global notebookBudgetTokens (~15k tokens = 60k chars).
      // Avant : dump rawText de TOUTES les sources → 253k tokens (97% du prompt).
      let notebookContext = "";
      let notebookUsedChars = 0;
      const NOTEBOOK_HEADER_CHARS = 120;
      const MAX_SOURCES_PER_NOTEBOOK = 5;
      const MAX_NOTEBOOKS_TOTAL = 5;
      const MAX_CHARS_PER_SOURCE = 5_000; // ≈1250 tokens max par source
      const notebookBudgetChars = notebookBudgetTokens * 4;
      try {
        const allNotebooks = notebookManager.getAllNotebooks();
        if (allNotebooks.length > 0) {
          const sections: string[] = [];
          let notebooksSkipped = 0;
          let sourcesSkippedTotal = 0;
          let sourcesTruncated = 0;
          const selectedNotebooks = allNotebooks.slice(0, MAX_NOTEBOOKS_TOTAL);
          notebooksSkipped = allNotebooks.length - selectedNotebooks.length;

          for (const nb of selectedNotebooks) {
            if (notebookUsedChars + NOTEBOOK_HEADER_CHARS > notebookBudgetChars) {
              notebooksSkipped += selectedNotebooks.length - selectedNotebooks.indexOf(nb);
              break;
            }
            if (!nb.sources || nb.sources.length === 0) continue;

            const sourcesToUse = nb.sources.slice(0, MAX_SOURCES_PER_NOTEBOOK);
            sourcesSkippedTotal += nb.sources.length - sourcesToUse.length;

            const sourceTexts: string[] = [];
            let headerLen = 0;
            const nbHeader = `## 📓 Notebook : ${nb.title || 'Sans titre'}\n\n`;
            headerLen += nbHeader.length;

            for (const s of sourcesToUse) {
              const title = (s.title || s.origin || "Source").slice(0, 120);
              // Privilégier le summary (plus compact) plutôt que rawText intégral
              const raw = s.summary && s.summary.length > 50
                ? s.summary
                : (s.rawText || s.summary || "");
              const maxCharsForSource = Math.max(
                200,
                Math.min(MAX_CHARS_PER_SOURCE, notebookBudgetChars - notebookUsedChars - headerLen - 50)
              );
              let text: string;
              if (raw.length > maxCharsForSource) {
                text = raw.slice(0, maxCharsForSource) + "\n…[tronqué]";
                sourcesTruncated++;
              } else {
                text = raw;
              }
              const block = `### ${title}\n${text}`;
              if (notebookUsedChars + headerLen + block.length + 20 > notebookBudgetChars) {
                sourcesSkippedTotal += sourcesToUse.length - sourcesToUse.indexOf(s);
                break;
              }
              sourceTexts.push(block);
            }

            if (sourceTexts.length > 0) {
              sections.push(nbHeader + sourceTexts.join("\n\n"));
              notebookUsedChars += headerLen + sourceTexts.reduce((sum, t) => sum + t.length + 2, 0);
            }
          }

          if (sections.length > 0) {
            let body = sections.join("\n\n---\n\n");
            const prefix = "\n\n[Notebooks — Sources sélectionnées]\n\n";
            let suffix = "";
            const noteParts: string[] = [];
            if (notebooksSkipped > 0) noteParts.push(`${notebooksSkipped} notebook(s) omis`);
            if (sourcesSkippedTotal > 0) noteParts.push(`${sourcesSkippedTotal} source(s) omise(s)`);
            if (sourcesTruncated > 0) noteParts.push(`${sourcesTruncated} source(s) tronquée(s)`);
            if (noteParts.length > 0) suffix = `\n\n[_Note: ${noteParts.join(', ')}. Utilisez les outils notebooks pour accéder au contenu complet._]`;
            notebookContext = prefix + body + suffix;
            notebookUsedChars += prefix.length + suffix.length;
            const nbTokens = Math.ceil(notebookContext.length / 4);
            console.log(
              `[Notebooks] 📓 Contexte notebooks injecté: ~${nbTokens} tokens ` +
              `(${selectedNotebooks.length - notebooksSkipped}/${allNotebooks.length} notebook(s), ` +
              `${sections.reduce((sum, sec) => sum + (sec.match(/### /g) || []).length, 0)} source(s) traîtées)` +
              (noteParts.length > 0 ? ` — ${noteParts.join(', ')}` : '')
            );
          }
        }
      } catch (e) {
        console.debug(`[Notebooks] Module indisponible: ${(e as Error).message}`);
      }

      // ── Log token budget summary ────────────────────────────────────────
      const memoryTokensEst = Math.ceil((memoryContext.split(/\s+/).length * 1.3 + memoryContext.length / 4) / 2);
      const knowledgeTokensEst = Math.ceil(knowledgeContext.length / 4);
      const notebookTokensEst = Math.ceil(notebookContext.length / 4);
      const totalPromptTokens = systemTokensEst + memoryTokensEst + knowledgeTokensEst + notebookTokensEst;
      console.log(`[TokenOptimizer] 🧠 Contexte mémoire: ~${memoryTokensEst} tokens (${memoryContext.length} chars)`);
      console.log(`[TokenOptimizer] 🧠 Contexte Knowledge: ~${knowledgeTokensEst} tokens (${knowledgeContext.length} chars)`);
      console.log(`[TokenOptimizer] 📓 Contexte Notebooks: ~${notebookTokensEst} tokens (${notebookContext.length} chars)`);
      console.log(`[TokenOptimizer] 📦 Total prompt injecté: ~${totalPromptTokens} tokens`);
      console.log(`[TokenOptimizer]    Budget mémoire: ${memoryBudgetTokens} | Max mémoires: ${maxMemories} | Max convs: ${maxConversations}`);
      if (memoryTokensEst === 0) {
        console.log(`[TokenOptimizer]    ℹ️  Aucun contexte mémoire injecté`);
      }
      console.log(`[TokenOptimizer] ───────────────────────────────────────────`);

      // ── Hard cap final sur le prompt système avant envoi ────────────────
      // Défense en profondeur : même si les budgets par composant sont respectés,
      // le systemText de base peut être énorme (SystemPromptBuilder, tool schemas...).
      // On tronque d'abord les contextes ajoutés par ordre de priorité décroissante :
      // systemText (préserve) → memoryContext → knowledgeContext → notebookContext.
      // Objectif : < INITIAL_PROMPT_MAX_TOKENS tokens (~240k chars) SURTOUT pour
      // ne pas flamber le quota dès tour 0 (le bug original = 260k tokens au démarrage).
      const buildCombined = () => systemText + memoryContext + knowledgeContext + notebookContext;
      let combinedChars = buildCombined().length;
      const combinedTokensEst = Math.ceil(combinedChars / 4);
      if (combinedTokensEst > INITIAL_PROMPT_MAX_TOKENS) {
        console.warn(
          `[TokenOptimizer] 🔴 DÉPASSEMENT CAP FINAL: ~${combinedTokensEst} tokens > ${INITIAL_PROMPT_MAX_TOKENS} max. ` +
          `Tronction contextes (notebooks → knowledge → mémoire)…`
        );
        const targetChars = INITIAL_PROMPT_MAX_CHARS - 200; // marge pour suffixe d'avertissement
        const baseLen = systemText.length;
        // Priorité 1 : réduire notebookContext
        if (notebookContext && combinedChars > targetChars) {
          const allowance = Math.max(0, targetChars - baseLen - memoryContext.length - knowledgeContext.length);
          if (allowance <= 0) {
            notebookContext = "";
          } else if (notebookContext.length > allowance) {
            notebookContext = notebookContext.slice(0, allowance) + "\n…[tronqué — budget global atteint]";
          }
          combinedChars = buildCombined().length;
        }
        // Priorité 2 : réduire knowledgeContext
        if (knowledgeContext && combinedChars > targetChars) {
          const allowance = Math.max(0, targetChars - baseLen - memoryContext.length - notebookContext.length);
          if (allowance <= 0) {
            knowledgeContext = "";
          } else if (knowledgeContext.length > allowance) {
            knowledgeContext = knowledgeContext.slice(0, allowance) + "\n…[tronqué — budget global atteint]";
          }
          combinedChars = buildCombined().length;
        }
        // Priorité 3 : réduire memoryContext
        if (memoryContext && combinedChars > targetChars) {
          const allowance = Math.max(0, targetChars - baseLen - knowledgeContext.length - notebookContext.length);
          if (allowance <= 0) {
            memoryContext = "";
          } else if (memoryContext.length > allowance) {
            memoryContext = memoryContext.slice(0, allowance) + "\n…[tronqué — budget global atteint]";
          }
          combinedChars = buildCombined().length;
        }
        // Dernier filet : tronquage brutal du combiné si systemText de base est trop gros
        if (combinedChars > INITIAL_PROMPT_MAX_CHARS) {
          const overflowMsg = "\n\n[_AVERTISSEMENT: Prompt système tronqué par hard-cap. Certaines instructions sont manquantes._]";
          // On réinjecte via les variables : tronquer systemText (on garde le début car les contextes étaient déjà vides)
          const leftoverForBase = INITIAL_PROMPT_MAX_CHARS - overflowMsg.length - memoryContext.length - knowledgeContext.length - notebookContext.length;
          if (leftoverForBase > 1000) {
            systemText = systemText.slice(0, leftoverForBase) + "\n…[tronqué — cap absolu]" + overflowMsg;
          } else {
            systemText = systemText.slice(0, INITIAL_PROMPT_MAX_CHARS - overflowMsg.length) + overflowMsg;
          }
          console.error(
            `[TokenOptimizer] ☠️ TRONQUAGE BRUTAL APPLIQUÉ. systemText tronqué à ${systemText.length} chars. ` +
            `Final combiné ≈ ${buildCombined().length} chars.`
          );
        }
        const finalTokens = Math.ceil(buildCombined().length / 4);
        console.log(`[TokenOptimizer] ✅ Après hard-cap: ~${finalTokens} tokens (${buildCombined().length} chars)`);
      }

            // Handler pour GoAway (expiration de session) - redémarre la session automatiquement
            let goAwayHandled = false; // Flag pour distinguer fermeture GoAway d'une erreur dans onclose
            let clientWsClosing = false; // Éviter double close sur clientWs
            const handleGoAway = (goAway: any) => {
              // GoAway indique que Gemini va fermer cette session dans quelques secondes
              // (durée de vie max ~10-15 min). C'est la cause principale des "coupures"
              // au milieu d'une phrase. On notifie le client immédiatement avec le
              // contexte restant pour qu'il puisse reconnecter sans perte.
              goAwayHandled = true;
              const timeToExpiry = goAway?.timeLeft ?? goAway?.timeLeftMs ?? 'inconnu';
              console.info(
                `[Gemini Live] 🔄 GoAway reçu — session expire dans ${timeToExpiry}ms. ` +
                `Turns: ${conversationCtx.turns}, tokens cumulatifs: ` +
                `${conversationCtx.totalPromptTokens + conversationCtx.totalCompletionTokens}. ` +
                `Le client va reconnecter automatiquement.`
              );
              // Flush le buffer assistant avant fermeture pour ne pas perdre le texte en cours
              flushAssistantBuffer().catch(() => {});
              clientWs.send(JSON.stringify({
                type: 'session_restart',
                reason: 'goaway',
                detail: goAway,
                conversation_id: conversationId, // permet au client de reprendre avec le bon ID
                turns_completed: conversationCtx.turns,
              }));
              // Fermer la session actuelle pour forcer une reconnexion propre côté client
              try { session.close(); } catch {}
              // IMPORTANT : fermer aussi la WebSocket client après un court délai
              // pour que le client reçoive onclose et déclenche sa reconnexion.
              // Sans ça, la WS reste ouverte et la reconnexion n'a jamais lieu.
              if (!clientWsClosing && clientWs.readyState === WebSocket.OPEN) {
                clientWsClosing = true;
                setTimeout(() => {
                  try {
                    if (clientWs.readyState === WebSocket.OPEN) {
                      clientWs.close(1000, 'goaway_restart');
                    }
                  } catch {}
                }, 200);
              }
            };

            const session = await getGeminiAI().live.connect({
              model: "gemini-3.1-flash-live-preview",
              config: {
                responseModalities: [Modality.AUDIO],
                temperature,
                topP,
                speechConfig: {
                  voiceConfig: { prebuiltVoiceConfig: { voiceName } },
                },
                systemInstruction: {
                  parts: [{ text: systemText + memoryContext + knowledgeContext + notebookContext }]
                },
                tools: tools,
                // Enable audio transcriptions for persistent history
                inputAudioTranscription: {},
                outputAudioTranscription: {},
              },
              callbacks: {
                onmessage: (message: LiveServerMessage) => {
                  lastServerMessage = message;
                  if (message.goAway) {
                    console.warn("[Gemini Live] ⚠️ Message GoAway reçu du serveur:", message.goAway);
                    // Proactive session restart on GoAway (session lifetime expiry)
                    handleGoAway(message.goAway);
                  }
                  const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                  if (audio) {
                    clientWs.send(JSON.stringify({ audio }));
                  }
                  // Send text transcript chunks to the client
                  const textPart = message.serverContent?.modelTurn?.parts?.find(p => p.text);
                  if (textPart?.text) {
                    clientWs.send(JSON.stringify({ text: textPart.text }));
                    // Buffer assistant text for persistence
                    assistantBuffer += textPart.text;
                    if (assistantFlushTimer) clearTimeout(assistantFlushTimer);
                    assistantFlushTimer = setTimeout(flushAssistantBuffer, 2000);
                  }

            // ── Capture audio transcriptions for history ──────────────────────
            const inputTranscription = (message.serverContent as any)?.inputTranscription?.text;
            if (inputTranscription) {
              clientWs.send(JSON.stringify({ user_text: inputTranscription }));
              // Persist transcribed user speech
              (async () => {
                if (conversationReady) await conversationReady;
                if (conversationId) {
                  saveMessage("user", inputTranscription, conversationId).catch(e =>
                    console.error("[History] Erreur sauvegarde transcription user:", e)
                  );
                }
              })();
            }

            const outputTranscription = (message.serverContent as any)?.outputTranscription?.text;
            if (outputTranscription) {
              clientWs.send(JSON.stringify({ text: outputTranscription }));
              // Buffer output transcription for persistence
              assistantBuffer += outputTranscription;
              if (assistantFlushTimer) clearTimeout(assistantFlushTimer);
              assistantFlushTimer = setTimeout(flushAssistantBuffer, 2000);
            }
            if (message.serverContent?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
            if (message.toolCall) {
              handleToolCall(message.toolCall, session, clientWs, sessionMode, busyStateRef, voiceName).catch(e =>
                console.error("[handleToolCall] Erreur non catchée — sendToolResponse manqué:", e)
              );
            }

            // ── Token usage metadata ────────────────────────────────────────
            const usageMetadata = (message as any).usageMetadata;
            if (usageMetadata) {
              const promptTokens = usageMetadata.promptTokenCount ?? 0;
              const completionTokens = usageMetadata.candidatesTokenCount ?? usageMetadata.responseTokenCount ?? 0;
              const totalTokens = usageMetadata.totalTokenCount ?? 0;

              // ── Monitoring contexte conversation (Optimisation Leanna #5) ──
              monitorConversationContext(promptTokens, completionTokens, totalTokens);

              console.log(`[TokenOptimizer] 📈 Gemini usage reçu: prompt=${promptTokens} completion=${completionTokens} total=${totalTokens}`);

              const cumulative = conversationCtx.totalPromptTokens + conversationCtx.totalCompletionTokens;
              clientWs.send(JSON.stringify({
                token_usage: {
                  promptTokens,
                  completionTokens,
                  totalTokens,
                  session: {
                    total_prompt_tokens: conversationCtx.totalPromptTokens,
                    total_completion_tokens: conversationCtx.totalCompletionTokens,
                    session_total: cumulative,
                    context_window: CONTEXT_WINDOW_TOKENS,
                    context_percent: Math.round((cumulative / CONTEXT_WINDOW_TOKENS) * 100),
                    turns: conversationCtx.turns,
                    alert_level: conversationCtx.lastAlertLevel,
                  },
                },
              }));
            }
          },
          onclose: (e: any) => {
            let closeReason = 'unknown';
            let closeDetail = '';

            const closeCode = e?.code;
            const closeReasonText = e?.reason;

            // ── GoAway déjà traité : fermeture intentionnelle, pas une erreur ──
            if (goAwayHandled) {
              closeReason = 'session_expired_goaway';
              closeDetail = 'Fermeture normale suite à GoAway — le client reconnecte automatiquement';
              console.info(`[Gemini Live] ✅ Session fermée proprement après GoAway (code: ${closeCode})`);
            } else if (lastErrorMessage) {
              closeDetail = lastErrorMessage;
              if (lastErrorMessage.toLowerCase().includes("quota") || lastErrorMessage.toLowerCase().includes("resourceexhausted") || lastErrorMessage.includes("429")) {
                closeReason = 'quota_gemini';
              } else if (lastErrorMessage.toLowerCase().includes("context") || lastErrorMessage.toLowerCase().includes("limit") || lastErrorMessage.toLowerCase().includes("token")) {
                closeReason = 'context_too_long';
              } else {
                closeReason = 'generation_error';
              }
            } else if (closeCode === 1008 || closeReasonText?.toLowerCase().includes("limit") || closeReasonText?.toLowerCase().includes("token")) {
              closeReason = 'context_too_long';
              closeDetail = closeReasonText || `Close code ${closeCode}`;
            } else if (lastServerMessage?.goAway) {
              // GoAway reçu mais handleGoAway n'a pas été appelé (race condition) — toujours pas une erreur
              closeReason = 'session_expired_goaway';
              closeDetail = JSON.stringify(lastServerMessage.goAway);
              console.info(`[Gemini Live] ✅ Session fermée par le serveur (GoAway latent, code: ${closeCode})`);
              // Race condition : handleGoAway n'a pas envoyé session_restart → le faire ici
              if (!goAwayHandled) {
                clientWs.send(JSON.stringify({
                  type: 'session_restart',
                  reason: 'goaway',
                  detail: lastServerMessage.goAway,
                  conversation_id: conversationId,
                  turns_completed: conversationCtx.turns,
                }));
              }
            } else if (closeCode === 1011) {
              closeReason = 'generation_error';
              closeDetail = closeReasonText || `Close code ${closeCode}`;
            } else if (closeCode === 1000 || closeCode === 1001 || closeCode === 1005) {
              closeReason = 'client_initiated';
              closeDetail = 'Fermeture propre de la session ou deconnexion client';
            } else {
              closeDetail = closeReasonText || `Close code ${closeCode}`;
            }

            // Ne pas logger comme erreur critique si c'est un GoAway (événement normal du lifecycle)
            if (closeReason === 'session_expired_goaway') {
              console.info("[Gemini Live] 🔄 Session terminée normalement (GoAway lifecycle)", {
                reason: closeReason,
                turns: conversationCtx.turns,
                total_tokens: conversationCtx.totalPromptTokens + conversationCtx.totalCompletionTokens,
              });
            } else {
              console.error("[Gemini Live] ❌ Session fermee prematurement !", {
                reason: closeReason,
                detail: closeDetail,
                closeCode,
                closeReasonText,
                toolCount: filteredDeclarations.length,
                systemPromptLength: (systemText + memoryContext + knowledgeContext + notebookContext).length,
                estimatedTotalTokens: toolTokensEstimate + systemTokensEst + memoryTokensEst + knowledgeTokensEst + notebookTokensEst,
                context_monitor: {
                  turns: conversationCtx.turns,
                  total_prompt: conversationCtx.totalPromptTokens,
                  total_completion: conversationCtx.totalCompletionTokens,
                  max_turn_prompt: conversationCtx.maxPromptTokensInTurn,
                  last_alert: conversationCtx.lastAlertLevel || 'aucun',
                  budget_pct: Math.round(((conversationCtx.totalPromptTokens + conversationCtx.totalCompletionTokens) / CONTEXT_WINDOW_TOKENS) * 100),
                },
              });
            }

            // Pour les GoAway, le message session_restart a déjà été envoyé par handleGoAway.
            // On n'envoie le message 'closed' que pour les fermetures non-GoAway (erreurs réelles).
            if (closeReason !== 'session_expired_goaway') {
              // ── Auto-restart sur context_too_long : résumer et relancer ──────
              if (closeReason === 'context_too_long' && conversationId) {
                console.info('[ContextOverflow] 🔄 Dépassement token détecté — génération du résumé pour redémarrage automatique…');
                // Générer un résumé de la conversation en background et notifier le client
                (async () => {
                  try {
                    const messages = await getConversationMessages(conversationId!, 200);
                    if (messages.length >= 4) {
                      const chatMessages = messages.map(m => ({
                        role: m.role as 'user' | 'assistant',
                        content: m.content,
                      }));
                      const { summary, method } = await summarizeWithLLM(chatMessages);
                      console.info(`[ContextOverflow] ✅ Résumé généré (${method}) — ${summary.length} chars, ${messages.length} messages condensés`);
                      clientWs.send(JSON.stringify({
                        type: 'session_restart',
                        reason: 'context_overflow',
                        conversation_id: conversationId,
                        turns_completed: conversationCtx.turns,
                        summary,
                        summaryMethod: method,
                        messagesSummarized: messages.length,
                      }));
                    } else {
                      // Conversation trop courte pour résumer — restart simple
                      clientWs.send(JSON.stringify({
                        type: 'session_restart',
                        reason: 'context_overflow',
                        conversation_id: conversationId,
                        turns_completed: conversationCtx.turns,
                        summary: '',
                        summaryMethod: 'none',
                        messagesSummarized: 0,
                      }));
                    }
                  } catch (e) {
                    console.error('[ContextOverflow] Erreur résumé:', e);
                    // Envoyer quand même un restart sans résumé
                    clientWs.send(JSON.stringify({
                      type: 'session_restart',
                      reason: 'context_overflow',
                      conversation_id: conversationId,
                      turns_completed: conversationCtx.turns,
                      summary: '',
                      summaryMethod: 'error',
                      messagesSummarized: 0,
                    }));
                  } finally {
                    // IMPORTANT : fermer clientWs après session_restart pour
                    // déclencher la reconnexion côté client.
                    if (!clientWsClosing && clientWs.readyState === WebSocket.OPEN) {
                      clientWsClosing = true;
                      setTimeout(() => {
                        try {
                          if (clientWs.readyState === WebSocket.OPEN) {
                            clientWs.close(1000, 'context_overflow_restart');
                          }
                        } catch {}
                      }, 200);
                    }
                  }
                })();
              } else {
                clientWs.send(JSON.stringify({
                  closed: true,
                  reason: 'gemini_session_closed',
                  geminiReason: closeReason,
                  geminiDetail: closeDetail
                }));
              }
            }

            // ── Fermer clientWs après GoAway pour déclencher reconnexion ────────
            // handleGoAway a déjà programmé une fermeture, mais en cas de race
            // (GoAway latent) ou si le timeout a échoué, on reprogramme ici.
            if (closeReason === 'session_expired_goaway') {
              if (!clientWsClosing && clientWs.readyState === WebSocket.OPEN) {
                clientWsClosing = true;
                setTimeout(() => {
                  try {
                    if (clientWs.readyState === WebSocket.OPEN) {
                      clientWs.close(1000, 'session_restart_goaway');
                    }
                  } catch {}
                }, 300);
              }
            }
          },
          onerror: (err: any) => {
            lastErrorMessage = err?.message || String(err);
            console.error("[Gemini Live] ❌ Erreur session:", err?.message || err, JSON.stringify(err));
            clientWs.send(JSON.stringify({ error: err?.message || String(err) }));
          }
        },
      });

      console.log("[Gemini Live] Session connected successfully");

      // ── Injection du résumé de contexte pour reprise après overflow ─────────
      if (contextResumeSummary) {
        const resumeText =
          `[CONTEXTE DE LA CONVERSATION PRÉCÉDENTE — Résumé automatique après dépassement de tokens]\n\n` +
          `${contextResumeSummary}\n\n` +
          `La conversation précédente a été interrompue car la fenêtre de contexte était saturée. ` +
          `Continue la conversation en tenant compte de ce résumé. L'utilisateur est au courant du redémarrage.`;
        session.sendClientContent({
          turns: [{ role: 'user', parts: [{ text: resumeText }] }],
        });
        const resumeTokens = estimateTokens(resumeText);
        console.log(`[ContextResume] ✅ Résumé injecté dans la nouvelle session (${resumeTokens} tokens)`);
        // Informer le client que la reprise est effective
        clientWs.send(JSON.stringify({
          type: 'context_resumed',
          conversation_id: conversationId,
          summaryTokens: resumeTokens,
          summaryLength: contextResumeSummary.length,
        }));
      }

      const initialPromptSize = estimateTokens(systemText + memoryContext + knowledgeContext + notebookContext + (contextResumeSummary ? contextResumeSummary : ''));
      sendContextSize(initialPromptSize, { turns: 0 });
      console.log(
              `[ContextMonitor] 📦 Prompt initial: ~${initialPromptSize} tokens ` +
              `(${Math.round((initialPromptSize / CONTEXT_WINDOW_TOKENS) * 100)}% de la fenêtre)`,
            );

            // ── Auto-résumé du contexte au seuil critique ─────────────────────────────
                        const AUTO_SUMMARIZE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
                        const MAX_AUTO_SUMMARIZES_PER_SESSION = 3;
                        const MIN_MESSAGES_FOR_AUTO_SUMMARIZE = 8;

                        const buildAutoSummarizeContext = () => {
                          autoSummarizeContext = async () => {
                if (!conversationId) {
                  console.log('[AutoSummarize] Pas de conversation active');
                  return;
                }

                const now = Date.now();
                if (now - conversationCtx.lastAutoSummarizeAt < AUTO_SUMMARIZE_COOLDOWN_MS) {
                  console.log('[AutoSummarize] Cooldown actif, skip');
                  return;
                }
                if (conversationCtx.autoSummarizeCount >= MAX_AUTO_SUMMARIZES_PER_SESSION) {
                  console.log('[AutoSummarize] Limite de résumés auto atteinte pour cette session');
                  return;
                }

                // Récupérer les messages pour vérifier le nombre minimum
                const messages = await getConversationMessages(conversationId, 200);
                if (messages.length < MIN_MESSAGES_FOR_AUTO_SUMMARIZE) {
                  console.log('[AutoSummarize] Conversation trop courte pour auto-résumé');
                  return;
                }

                console.log('[AutoSummarize] 🚀 Déclenchement auto-résumé...');
                clientWs.send(JSON.stringify({ type: 'context_summarize_progress', status: 'running', auto: true }));

                try {
                  const tokensBefore = conversationCtx.totalPromptTokens + conversationCtx.totalCompletionTokens;
                  const minKeep = 4;
                  const keptMessages = messages.slice(-minKeep);
                  const toSummarize = messages.slice(0, -minKeep);

                  const chatMessages = toSummarize.map(m => ({
                    role: m.role as 'user' | 'assistant',
                    content: m.content,
                  }));

                  const { summary, method } = await summarizeWithLLM(chatMessages);

                  const summaryText =
                    `[CONTEXTE COMPACTÉ (AUTO) — ${toSummarize.length} messages résumés par IA]\n\n` +
                    `${summary}\n\n` +
                    `Continue la conversation en tenant compte de ce résumé. Les détails des messages précédents sont condensés ci-dessus.`;

                  session.sendClientContent({
                    turns: [{ role: 'user', parts: [{ text: summaryText }] }],
                  });

                  const summaryTokens = estimateTokens(summaryText);
                  const keptTokens = keptMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
                  const baseTokens = estimateTokens(systemText + memoryContext + knowledgeContext + notebookContext);
                  const newSize = summaryTokens + keptTokens + baseTokens;

                  conversationCtx.totalPromptTokens = Math.floor(newSize * 0.7);
                  conversationCtx.totalCompletionTokens = Math.floor(newSize * 0.3);
                  conversationCtx.warningsIssued.clear();
                  conversationCtx.lastAlertLevel = '';
                  conversationCtx.lastAutoSummarizeAt = now;
                  conversationCtx.autoSummarizeCount++;

                  const newPercent = Math.round((newSize / CONTEXT_WINDOW_TOKENS) * 100);
                  sendContextSize(newSize, {
                    turns: conversationCtx.turns,
                    level: resolveContextLevel(newPercent),
                  });

                  // Persister le résumé
                  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
                    try {
                      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
                      await supabase.from('conversations').update({ summary }).eq('id', conversationId);
                    } catch (e) {
                      console.warn('[AutoSummarize] Erreur sauvegarde résumé:', e);
                    }
                  }

                  console.log(
                    `[AutoSummarize] ✅ ${toSummarize.length} messages résumés (${method}) — ` +
                    `${tokensBefore} → ${newSize} tokens (−${Math.max(0, tokensBefore - newSize)})`
                  );

                  clientWs.send(JSON.stringify({
                    type: 'context_summarized',
                    status: 'success',
                    auto: true,
                    method,
                    tokensBefore,
                    tokensAfter: newSize,
                    tokensSaved: Math.max(0, tokensBefore - newSize),
                    messagesSummarized: toSummarize.length,
                    summaryPreview: summary.slice(0, 200),
                  }));
                } catch (e) {
                  console.error('[AutoSummarize] Erreur:', e);
                  clientWs.send(JSON.stringify({
                    type: 'context_summarized',
                    status: 'error',
                    auto: true,
                    error: (e as Error).message || 'Erreur lors de l\'auto-résumé.',
                  }));
                }
              };
            };

            buildAutoSummarizeContext();

            clientWs.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.audio) {
            session.sendRealtimeInput({
              audio: { data: msg.audio, mimeType: "audio/pcm;rate=16000" },
            });
          }
          if (msg.video) {
            console.log('[WS] Received video frame from client');
            session.sendRealtimeInput({
              video: { data: msg.video.data, mimeType: msg.video.mimeType },
            });
          }
          // ── Résumé de contexte côté client (fallback context_overflow) ───────────────
          // Le client envoie ce message après reconnexion si Supabase n'a pas pu
          // injecter le résumé automatiquement (via context_resume=1).
          if (msg.type === 'context_resume_summary' && msg.summary) {
            if (!contextResumeSummary) {
              // Pas encore injecté côté serveur → injecter maintenant
              const resumeText =
                `[CONTEXTE DE LA CONVERSATION PRÉCÉDENTE — Résumé automatique après dépassement de tokens]\n\n` +
                `${msg.summary}\n\n` +
                `La conversation précédente a été interrompue car la fenêtre de contexte était saturée. ` +
                `Continue la conversation en tenant compte de ce résumé. L'utilisateur est au courant du redémarrage.`;
              try {
                session.sendClientContent({
                  turns: [{ role: 'user', parts: [{ text: resumeText }] }],
                });
                console.info(`[ContextResume] 📋 Résumé injecté via fallback client (${msg.summary.length} chars)`);
                clientWs.send(JSON.stringify({ type: 'context_resume_ack', injected: true }));
              } catch (e) {
                console.error('[ContextResume] Erreur injection résumé fallback:', e);
              }
            } else {
              console.info('[ContextResume] Résumé déjà injecté côté serveur — message client ignoré');
            }
          }
          if (msg.text) {
             // ── Notification d'occupation : prévenir l'utilisateur si une tâche est active ──
             if (getBusyDescription()) {
               clientWs.send(JSON.stringify({
                 text: `Je suis actuellement en train de ${getBusyDescription()}. Je m'occupe de ta demande dès que j'ai terminé.`,
               }));
             }
             // Send user message to Gemini
             session.sendClientContent({
                 turns: [
                   { role: 'user', parts: [{ text: msg.text }] }
                 ]
             });
             // Persist user message to conversation history
             (async () => {
               if (conversationReady) await conversationReady;
               if (conversationId) {
                 flushAssistantBuffer();
                 saveMessage("user", msg.text, conversationId).catch(e =>
                   console.error("[History] Erreur sauvegarde msg user:", e)
                 );
               }
             })();
          }
          // ── Document context injection into live session ───────────────────
          if (msg.type === 'document_context' && msg.summary && msg.fileName) {
            console.log(`[Live] Injecting document context: ${msg.fileName}`);
            session.sendClientContent({
              turns: [
                {
                  role: 'user',
                  parts: [{
                    text: `[DOCUMENT UPLOADÉ] L'utilisateur vient d'uploader un document "${msg.fileName}". Voici l'analyse:\n\n${msg.summary}\n\nTu peux maintenant répondre aux questions de l'utilisateur sur ce document.`
                  }]
                }
              ]
            });
            // Notify client that context was injected
            clientWs.send(JSON.stringify({
              type: 'document_context_ack',
              fileName: msg.fileName,
            }));
          }
          // ── Résumé IA du contexte conversationnel ────────────────────────
          if (msg.type === 'summarize_context') {
            (async () => {
              try {
                clientWs.send(JSON.stringify({ type: 'context_summarize_progress', status: 'running' }));

                if (!conversationId) {
                  clientWs.send(JSON.stringify({
                    type: 'context_summarized',
                    status: 'error',
                    error: 'Aucune conversation active.',
                  }));
                  return;
                }

                const messages = await getConversationMessages(conversationId, 200);
                if (messages.length < 4) {
                  clientWs.send(JSON.stringify({
                    type: 'context_summarized',
                    status: 'error',
                    error: 'Conversation trop courte pour résumer (minimum 4 messages).',
                  }));
                  return;
                }

                const tokensBefore = conversationCtx.totalPromptTokens + conversationCtx.totalCompletionTokens;
                const minKeep = 4;
                const keptMessages = messages.slice(-minKeep);
                const toSummarize = messages.slice(0, -minKeep);

                const chatMessages = toSummarize.map(m => ({
                  role: m.role as 'user' | 'assistant',
                  content: m.content,
                }));

                const { summary, method } = await summarizeWithLLM(chatMessages);

                const summaryText =
                  `[CONTEXTE COMPACTÉ — ${toSummarize.length} messages résumés par IA]\n\n` +
                  `${summary}\n\n` +
                  `Continue la conversation en tenant compte de ce résumé. Les détails des messages précédents sont condensés ci-dessus.`;

                session.sendClientContent({
                  turns: [{ role: 'user', parts: [{ text: summaryText }] }],
                });

                const summaryTokens = estimateTokens(summaryText);
                const keptTokens = keptMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
                const baseTokens = estimateTokens(systemText + memoryContext + knowledgeContext + notebookContext);
                const newSize = summaryTokens + keptTokens + baseTokens;

                conversationCtx.totalPromptTokens = Math.floor(newSize * 0.7);
                conversationCtx.totalCompletionTokens = Math.floor(newSize * 0.3);
                conversationCtx.warningsIssued.clear();
                conversationCtx.lastAlertLevel = '';

                const newPercent = Math.round((newSize / CONTEXT_WINDOW_TOKENS) * 100);
                sendContextSize(newSize, {
                  turns: conversationCtx.turns,
                  level: resolveContextLevel(newPercent),
                });

                // Persister le résumé sur la conversation
                if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
                  try {
                    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
                    await supabase.from('conversations').update({ summary }).eq('id', conversationId);
                  } catch (e) {
                    console.warn('[ContextSummarize] Erreur sauvegarde résumé:', e);
                  }
                }

                console.log(
                  `[ContextSummarize] ✅ ${toSummarize.length} messages résumés (${method}) — ` +
                  `${tokensBefore} → ${newSize} tokens (−${Math.max(0, tokensBefore - newSize)})`,
                );

                clientWs.send(JSON.stringify({
                  type: 'context_summarized',
                  status: 'success',
                  method,
                  tokensBefore,
                  tokensAfter: newSize,
                  tokensSaved: Math.max(0, tokensBefore - newSize),
                  messagesSummarized: toSummarize.length,
                  summaryPreview: summary.slice(0, 200),
                }));
              } catch (e) {
                console.error('[ContextSummarize] Erreur:', e);
                clientWs.send(JSON.stringify({
                  type: 'context_summarized',
                  status: 'error',
                  error: (e as Error).message || 'Erreur lors du résumé.',
                }));
              }
            })();
          }
          // ── Confirmation interactive (fichiers critiques) ──────────────
          if (msg.type === 'confirm-response' && msg.requestId) {
            import("./server/utils/confirmationBridge").then(({ handleConfirmationResponse }) => {
              handleConfirmationResponse(msg.requestId, msg.approved === true);
            });
          }
        } catch (e) {
          console.error("Error parsing message from client:", e);
        }
      });

      // ── Lifecycle: suivre la session pour le graceful shutdown ────────────
      activeGeminiSessions.add(session);

      // ── SUPERVISOR: Configurer l'injecteur de session ──
      supervisor.reset();
      supervisor.setSessionInjector((message: string) => {
        try {
          session.sendClientContent({
            turns: [{ role: 'user', parts: [{ text: message }] }]
          });
        } catch (e) {
          console.error('[Supervisor] Injection dans session échouée:', e);
        }
      });

      clientWs.on("close", () => {
        console.log("Client disconnected");
        activeGeminiSessions.delete(session);
        // Flush remaining assistant buffer and end conversation
        flushAssistantBuffer();
        if (conversationId) {
          endConversation(conversationId).catch(e =>
            console.error("[History] Erreur fin conversation:", e)
          );
        }
        try { session.close(); } catch { /* session déjà fermée */ }
      });

    } catch (err) {
      console.error("Failed to connect to Gemini Live:", err);
      clientWs.send(JSON.stringify({ error: "Failed to connect to Gemini Live" }));
    }
  });

  async function handleToolCall(toolCall: any, session: any, clientWs: WebSocket, mode: 'ask' | 'full' = 'full', busyStateRef?: { activeDescription: string | null }, voiceName: string = 'Aoede') {
     const functionResponses: any[] = [];

     // Tools that modify files (blocked in ask mode unless writing a .md file)
     const WRITE_TOOLS = new Set([
       'write_project_file', 'modify_project_file', 'patch_project_file', 'rename_project_file',
       'delete_project_file', 'create_project_directory',
     ]);

     const context = {
         voiceName,
         reasoningVoiceEnabled: currentProfile.reasoningVoiceEnabled !== false,
         notifyLiveAPI: (message: string) => {
             try {
                session.sendClientContent({
                    turns: [
                      { role: 'user', parts: [{ text: `[BACKGROUND TASK UPDATE] ${message}` }] }
                    ]
                });
             } catch (e) {
                console.error("Failed to notify Live API:", e);
             }
         },
         emitIdeAction: (action: any) => {
             try {
                clientWs.send(JSON.stringify({ type: 'ide-action', action }));
             } catch (e) {
                console.error("Failed to emit IDE action:", e);
             }
         },
         emitToClient: (data: any) => {
             try {
                clientWs.send(JSON.stringify(data));
             } catch (e) {
                console.error("Failed to emit to client:", e);
             }
         },
         browserReadPending,
         browserActionPending,
     };

     // Signal au client que l'assistant est occupée (traitement d'outils)
     try { clientWs.send(JSON.stringify({ busy: true })); } catch {}
     // Mettre à jour la description de la tâche active pour les notifications d'occupation
     if (busyStateRef) {
       const firstCallName = toolCall.functionCalls?.[0]?.name ?? "traitement d'outils";
       busyStateRef.activeDescription = `l'exécution de l'outil "${firstCallName}"`;
     }

     for (const call of toolCall.functionCalls) {
        try {
            // ── Ask mode guard: block write operations (except .md creation) ──
            if (mode === 'ask' && WRITE_TOOLS.has(call.name)) {
              const filePath = (call.args?.path || call.args?.newPath || '') as string;
              const isAllowed = call.name === 'write_project_file' && filePath.endsWith('.md');
              if (!isAllowed) {
                functionResponses.push({
                  id: call.id,
                  name: call.name,
                  response: { error: "Mode Ask actif : modification de fichiers interdite. Seule la creation de fichiers .md est autorisee. Demande a l'utilisateur de basculer en mode Full." }
                });
                clientWs.send(JSON.stringify({ tool_used: call.name, info: '[BLOQUÉ - Mode Ask]' }));
                continue;
              }
            }

            // Notify client that the tool is starting
            clientWs.send(JSON.stringify({ tool_start: call.name, args: call.args }));

            // ── Supervisor guard: block writes to files in a correction loop ──
            if (WRITE_TOOLS.has(call.name)) {
              const blockedPath = (call.args?.path || call.args?.newPath || '') as string;
              if (blockedPath && supervisor.isFileBlocked(blockedPath)) {
                functionResponses.push({
                  id: call.id,
                  name: call.name,
                  response: { error: `[SUPERVISOR] Écriture bloquée sur "${blockedPath}". Ce fichier est en boucle de correction. Adopte une approche fondamentalement différente ou passe à une autre tâche.` }
                });
                clientWs.send(JSON.stringify({ tool_used: call.name, info: `[BLOQUÉ - Boucle Supervisor: ${blockedPath}]` }));
                continue;
              }
            }

            // ── Handle meta-tool: request_tools (tier 2 loading) ──
            if (call.name === 'request_tools') {
              const category = String(call.args?.category || '').trim().toLowerCase();

              // Charger réellement les skills correspondants via le SkillManager
              const { loaded, tools: loadedToolNames } = await skillManager.discoverAndLoad(category);

              if (loaded.length > 0 || category === 'all') {
                console.log(`[TokenOptimizer] 🔌 Chargement tier 2: "${category}" (${loadedToolNames.length} outils, skills: ${loaded.join(', ')})`);
                // Informer l'IA des nouveaux outils disponibles via sendClientContent
                // (la session Gemini Live ne permet pas d'ajouter des déclarations d'outils mid-session,
                // donc on injecte la liste textuellement dans le contexte)
                try {
                  session.sendClientContent({
                    turns: [
                      {
                        role: 'user',
                        parts: [{
                          text: `[SYSTEM] Outils "${category}" chargés en mémoire (${loadedToolNames.length} outils). Tu peux maintenant utiliser ces outils: ${loadedToolNames.join(', ')}. Ces outils sont disponibles — appelle-les directement quand besoin.`
                        }]
                      }
                    ]
                  });
                } catch (e) {
                  console.warn(`[request_tools] sendClientContent échoué:`, e);
                }
                functionResponses.push({
                  id: call.id,
                  name: call.name,
                  response: {
                    status: 'success',
                    loaded: category,
                    skills: loaded,
                    tools: loadedToolNames,
                    message: `Outils "${category}" chargés et disponibles: ${loadedToolNames.join(', ')}. Tu peux maintenant les utiliser directement.`,
                  }
                });
                clientWs.send(JSON.stringify({ tool_used: call.name, info: `[Chargé: ${category} — ${loadedToolNames.length} outils]` }));
              } else {
                functionResponses.push({
                  id: call.id,
                  name: call.name,
                  response: { error: `Catégorie inconnue ou déjà chargée: "${category}". Catégories valides: git, github, automation, lists, weather, reasoning, history, system, knowledge, verify, guidelines, selfImprovement, all` }
                });
              }
              continue;
            }

            // ── Agent role guard: block delegation to unauthorized roles ──
            if (call.name === 'agent_delegate' && agentsConfig?.enabled !== false && agentsConfig?.allowedRoles?.length) {
              const requestedRole = String(call.args?.role || '').toLowerCase();
              if (!agentsConfig.allowedRoles.includes(requestedRole as any)) {
                functionResponses.push({
                  id: call.id,
                  name: call.name,
                  response: { error: `Rôle "${requestedRole}" non autorisé. Rôles disponibles: ${agentsConfig.allowedRoles.join(', ')}. Adapte ta stratégie ou demande à l'utilisateur d'activer ce rôle.` }
                });
                clientWs.send(JSON.stringify({ tool_used: call.name, info: `[BLOQUÉ - Rôle "${requestedRole}" désactivé]` }));
                continue;
              }
            }

            // ── Git guard: toujours bloqué — git désactivé ──
            if (call.name.startsWith('git_')) {
              functionResponses.push({
                id: call.id,
                name: call.name,
                response: { error: "Git est entièrement désactivé." }
              });
              clientWs.send(JSON.stringify({ tool_used: call.name, info: '[BLOQUÉ - Git désactivé]' }));
              continue;
            }

            // ── Reasoning guard: block reasoning tools when reasoningEnabled === false ──
            if (call.name.startsWith('reasoning_') && currentProfile.reasoningEnabled === false) {
              functionResponses.push({
                id: call.id,
                name: call.name,
                response: { error: "Le raisonnement structuré est désactivé (reasoningEnabled: false dans le profil). Réponds directement sans utiliser d'outil de raisonnement." }
              });
              clientWs.send(JSON.stringify({ tool_used: call.name, info: '[BLOQUÉ - Raisonnement désactivé]' }));
              continue;
            }

            const response = await skillManager.handleToolCall(call.name, call.args, context);
            const success = !(response && (response as any).error && !(response as any).status);
            try { skillManager.recordToolUsage(call.name, success); } catch {}

            // Toujours pusher la réponse de l'outil en premier
            functionResponses.push({
               id: call.id,
               name: call.name,
               response: response
            });
            clientWs.send(JSON.stringify({ tool_used: call.name, info: JSON.stringify(call.args) }));

            // ── Auto-verify après écriture de fichier (côté serveur, obligatoire) ──
            const WRITE_TOOLS_VERIFY = ['write_project_file', 'modify_project_file', 'patch_project_file', 'rename_project_file'];
            const VERIFY_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
            const verifyPath = call.name === 'rename_project_file' ? call.args?.newPath : call.args?.path;
            const verifyExt = verifyPath ? path.extname(verifyPath).toLowerCase() : '';
            if (WRITE_TOOLS_VERIFY.includes(call.name) && verifyPath && VERIFY_EXTENSIONS.has(verifyExt)) {
              try {
                const verifyResult = await skillManager.handleToolCall('verify_file', { path: verifyPath }, context);
                functionResponses.push({
                  id: `${call.id}_verify`,
                  name: 'verify_file',
                  response: verifyResult
                });
                clientWs.send(JSON.stringify({ tool_used: 'verify_file', info: JSON.stringify({ path: verifyPath }) }));

                // ── SUPERVISOR: Évaluation et injection corrective ──
                const evaluation = supervisor.evaluateVerifyResult(verifyPath, verifyResult);
                if (evaluation.needsCorrection && evaluation.directive) {
                  // Injecter la directive APRÈS l'envoi des tool responses
                  // pour que le modèle reçoive d'abord le résultat, puis l'instruction
                  setTimeout(() => {
                    try {
                      session.sendClientContent({
                        turns: [{
                          role: 'user',
                          parts: [{ text: evaluation.directive! }]
                        }]
                      });
                      clientWs.send(JSON.stringify({
                        supervisor_action: 'correction_injected',
                        file: verifyPath,
                        attempt: supervisor.getStats().totalCorrections
                      }));
                    } catch (e) {
                      console.error('[Supervisor] Injection échouée:', e);
                    }
                  }, 100);
                }
              } catch (verifyErr: any) {
                console.error(`[Auto-verify] Erreur verify_file pour ${verifyPath}:`, verifyErr);
                functionResponses.push({
                  id: `${call.id}_verify`,
                  name: 'verify_file',
                  response: { error: `Auto-verify échoué: ${verifyErr.message}` }
                });
              }
            }
        } catch (e: any) {
            console.error(`Error executing tool ${call.name}:`, e);
            functionResponses.push({
               id: call.id,
               name: call.name,
               response: { error: e.message }
            });
        }
     }

     // Signal au client que l'assistant a terminé le traitement
     try { clientWs.send(JSON.stringify({ busy: false })); } catch {}
     // Libérer la description de la tâche active
     if (busyStateRef) busyStateRef.activeDescription = null;
     
     if (functionResponses.length > 0) {
        session.sendToolResponse({ functionResponses });
     }
  }

  // ── Graceful shutdown ────────────────────────────────────────────────────
  // Centralise l'arrêt propre de toutes les ressources pour éviter, après
  // plusieurs hot-reloads en développement :
  //   - MaxListenersExceededWarning (handlers WS qui s'accumulent)
  //   - "WebSocket already closed" (sessions déjà fermées)
  //   - Sessions Gemini Live multiples actives simultanément
  //
  // Ordre d'arrêt (inverse du démarrage) :
  //   1. Sessions Gemini Live (libère les ressources API en premier)
  //   2. WebSocket servers (coupe les connexions clientes)
  //   3. Timers scheduledTasks + workflow (plus d'exécutions parasites)
  //   4. Serveur HTTP (libère le port)
  let isShuttingDown = false;
  async function gracefulShutdown(reason: string): Promise<void> {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[Lifecycle] Arrêt gracieux déclenché (${reason})...`);

    // 1. Fermer toutes les sessions Gemini actives
    for (const s of activeGeminiSessions) {
      try { s.close(); } catch { /* ignore — déjà fermée */ }
    }
    activeGeminiSessions.clear();
    console.log('[Lifecycle] Sessions Gemini Live fermées.');

    // 2. Fermer les WebSocket servers
    await Promise.all([
      new Promise<void>(resolve => wss.close(() => resolve())),
    ]);
    console.log('[Lifecycle] WebSocket servers fermés.');

    // 3. Arrêter les timers (ordre indifférent, les deux sont indépendants)
    stopAllWorkflowTimers();
    stopAllScheduledTasks();

    // 3b. Arrêter les serveurs MCP
    await mcpBridge.shutdown();
    console.log('[Lifecycle] Serveurs MCP déconnectés.');

    // 3c. Flush persistance : ProjectMemory et KnowledgeGraph
    try { projectMemory.save(); console.log('[Lifecycle] ProjectMemory flushé.'); } catch {}
    try { (knowledgeGraph as any).save?.(); console.log('[Lifecycle] KnowledgeGraph flushé.'); } catch {}

    // 3d. Arrêter le runtime V2
    try { await runtimeV2.stop(); observability.detach(); console.log('[Lifecycle] RuntimeV2 arrêté.'); } catch {}

    // 4. Fermer le serveur HTTP
    await new Promise<void>(resolve => server.close(() => resolve()));
    console.log('[Lifecycle] Arrêt complet.');
  }

  // Signaux Unix (SIGTERM envoyé par nodemon/electron-reload, SIGINT par Ctrl+C)
  process.once('SIGTERM', () => void gracefulShutdown('SIGTERM'));
  process.once('SIGINT',  () => void gracefulShutdown('SIGINT'));
  // beforeExit se déclenche quand la boucle d'événements est vide
  // (utile sur Windows où les signaux sont limités)
  process.once('beforeExit', () => void gracefulShutdown('beforeExit'));

  // Exposer le shutdown sur le process pour que electron/main.cjs puisse l'appeler
  (process as any).__jarvisShutdown = gracefulShutdown;
}

startServer();