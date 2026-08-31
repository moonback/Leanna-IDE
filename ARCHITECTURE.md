# Architecture système

Le système **Leanna** repose sur une architecture hybride **Desktop / Web** orchestrée autour d'un processus central Node.js / Express intégrant un serveur de développement Vite (en mode middleware), un runtime d'outils pour l'IA, une gestion de bac à sable local (Sandbox) et une connexion temps réel WebSocket avec Google Gemini Live API.

```mermaid
flowchart TB
    subgraph Client ["Interface Utilisateur (Renderer / Desktop)"]
        UI["React 19 SPA<br/>(Monaco, Views, Panels)"]
        Preload["Electron Preload<br/>(contextBridge)"]
        LiveHook["useLiveAPI<br/>(Audio PCM / WebSocket)"]
    end

    subgraph ElectronMain ["Processus Electron Main"]
        MainWin["BrowserWindow & IPC Handlers"]
        TrayLog["File Logger & Desktop Capturer"]
    end

    subgraph BackendServer ["Serveur Backend (Node.js / Express)"]
        AuthMiddleware["Auth Gate & Rate Limiting<br/>(x-leanna-token)"]
        
        subgraph Routers ["Routeurs API REST"]
            IDERouter["/api/ide<br/>(Filesystem / Search)"]
            SandboxRouter["/api/sandbox<br/>(Isolation / Diffs)"]
            AgentsRouter["/api/agents & /api/v2/*<br/>(Orchestration / Fleet)"]
            NotebooksRouter["/api/notebooks<br/>(RAG / Sources)"]
            OtherRouters["/api/workflows, /api/mcp, /api/profile..."]
        end

        subgraph Sockets ["WebSockets (/live, /terminal, /sandbox-watch)"]
            LiveHandler["LiveSocketHandler<br/>(Gemini Live Bridge)"]
            TermHandler["Terminal WebSocket<br/>(PTY Shell)"]
            WatchHandler["Sandbox Watcher<br/>(FS Events)"]
        end

        subgraph CoreEngine ["Moteur Fondamental & Sécurité"]
            SelfRoot["Multi-Workspace & Path Security<br/>(SELF_ROOT & workspaces.json)"]
            SandboxEngine["Sandbox Mirror Manager<br/>(.Leanna/sandbox)"]
            SkillRuntime["SkillManagerV2 & ToolRegistry"]
            AgentBus["AgentMessageBus & Orchestrator"]
            Supervisor["Supervisor & PostEditValidator"]
        end
    end

    subgraph External ["Services Externes & Cloud"]
        GeminiAPI["Google Gemini Live API<br/>(Audio / Tools / Vision)"]
        SupabaseDB["Supabase Postgres<br/>(pgvector, Memories, History)"]
        OpenRouterAPI["OpenRouter API<br/>(LLMs alternatifs)"]
        MCPServers["Serveurs MCP Externes<br/>(stdio / SSE)"]
    end

    UI --> Preload
    Preload --> MainWin
    UI <--> LiveHook
    LiveHook <-->|WebSocket :4000/live| LiveHandler
    UI <-->|WebSocket :4000/terminal| TermHandler
    UI <-->|WebSocket :4000/sandbox-watch| WatchHandler
    UI -->|HTTP Fetch + x-leanna-token| AuthMiddleware

    AuthMiddleware --> Routers
    LiveHandler <--> GeminiAPI
    LiveHandler --> SkillRuntime
    SkillRuntime --> SelfRoot
    SkillRuntime --> SandboxEngine
    SkillRuntime --> AgentBus
    SkillRuntime --> MCPServers
    
    Routers --> CoreEngine
    CoreEngine --> SupabaseDB
    Routers --> OpenRouterAPI
```

---

## Vue d'ensemble

Leanna fonctionne selon les principes architecturaux suivants :

1. **Mode Multi-Workspace & Périmètre Self-Root** : L'IDE gère dynamiquement plusieurs dépôts externes tout en confinant rigoureusement toutes les compétences IA, explorateurs et opérations au projet actif (`SELF_ROOT`). Les dépôts sont persistés dans `.Leanna/workspaces.json` et les chemins candidats sont pré-validés (rejet des racines disques et dossiers système).
2. **Isolation par Sandbox** : Par défaut, toute écriture effectuée par l'utilisateur ou par l'IA est appliquée dans un dossier miroir `.Leanna/sandbox` du workspace actif. Les modifications ne sont reportées dans le projet principal qu'après validation TypeScript (`tsc --noEmit`) et approbation explicite (`sync` ou `accept-file`).
3. **Dialogue Multimodal Temps Réel** : L'interface échange des flux audio PCM 16kHz et des captures vidéo/écran directement avec l'API Gemini Live. Lorsque l'IA décide d'exécuter une action, elle invoque des outils (`functionDeclarations`) interceptés côté backend par le `LiveSocketHandler`.
4. **Coexistence Runtime V1 & V2** : Le système migre progressivement d'un `SkillManager` historique vers une architecture découplée `ToolRegistry` + `RuntimeV2` tout en conservant une compatibilité ascendante complète.

---

## Frontend

L'interface utilisateur est développée en **React 19** avec **TypeScript** et stylisée via **TailwindCSS v4** et **Vanilla CSS** (`src/index.css`, `src/DESIGN_TOKENS.md`).

### Architecture Frontend
* **Point d'entrée** (`src/main.tsx`) : Configure le routage avec React Router v7, le thème (clair/sombre/accent), et applique un intercepteur global sur `window.fetch` avec :
  - Injection automatique du jeton d'authentification `x-leanna-token` depuis `localStorage`.
  - Déduplication des requêtes `GET` idempotentes en vol.
  - **Circuit Breaker** réseau : bloque temporairement les requêtes pendant 8 secondes après 12 échecs consécutifs pour éviter les erreurs `ENOBUFS` / `ECONNREFUSED`.
* **Gestion d'état** : Stores locaux légers, contextes React dédiés (`UserProfileContext`, `LiveAPIContext`, `ScreenShareContext`) et hooks spécialisés (`useLiveAPI`, `useTerminal`, `useSandboxDiff`).
* **Composants majeurs** :
  - `IdeView` (`src/views/IdeView.tsx`) : Environnement de travail avec Monaco Editor, arborescence virtuelle, onglets et panneaux latéraux rétractables.
  - `UnifiedSidebar` : Barre latérale unique supportant les contextes `global` et `ide`.
  - `Panels` (`src/components/panels/`) : Panneaux spécialisés pour le Terminal, le Navigateur webview, les Métriques d'agents, la Flotte d'agents, les Tâches planifiées, les Workflows, les MCP et l'Audit.
  - `StartupProjectModal` : Modale de démarrage permettant de sélectionner ou changer le projet cible géré par `SELF_ROOT`.

---

## Electron (Desktop)

En mode Desktop, Leanna encapsule l'application dans **Electron 43** :

* **Processus Main** (`electron/main.cjs`) :
  - Démarre le splash screen (`electron/splash.html`) visible pendant au moins 5 secondes.
  - En mode packagé (`isPackaged = true`), démarre automatiquement le serveur backend embarqué via `require('dist/server.cjs')`.
  - Configure les répertoires persistants dans `app.getPath('userData')` (`.env`, logs, profils).
  - Fournit des gestionnaires IPC sécurisés.
  - Implémente un **Graceful Shutdown** complet sur l'événement `before-quit` pour libérer les sockets, tuer les sous-processus PTY/MCP sur Windows (`taskkill /T /F`) et fermer proprement les sessions actives.
* **Processus Preload** (`electron/preload.cjs`) :
  - `nodeIntegration: false` et `contextIsolation: true` sont obligatoires.
  - Expose l'objet `window.electronAPI` via `contextBridge.exposeInMainWorld`.
* **IPC Channels enregistrés** :
  - `electron/folder-contents` : lecture des dossiers locaux.
  - `electron/create-file` / `electron/create-folder` : création d'éléments.
  - `electron/delete-path` : suppression de fichiers ou dossiers.
  - `electron/open-path` / `electron/open-external` : ouverture shell native.
  - `electron/get-project-root` : racine courante de l'exécutable.
  - `electron/select-folder` : dialogue natif de sélection de répertoire.
  - `electron/get-screen-sources` : capture des flux d'écrans/fenêtres pour le partage multimodal.
  - `electron/quit` : fermeture propre de l'application.

---

## Backend / API

Le serveur backend repose sur **Express 4** (`server.ts` et `server-bootstrap.ts`) et est articulé en couches fonctionnelles modulaires :

```text
server/
├── routes/             # Contrôleurs et points d'accès HTTP REST
├── live/               # Sessions Gemini Live WebSocket et dispatch d'outils
├── runtime/            # Runtime V2, registre d'outils, observabilité
├── agents/             # Flotte d'agents, bus de communication, matrice de délégation
├── autonomy/           # Superviseur anti-boucles de régression
├── knowledge/          # Knowledge Graph, WorkspaceIndexer et mémoire projet
├── notebooks/          # Moteur RAG, découpage, extraction et file de traitement
├── mcp/                # Bridge de protocoles MCP
└── utils/              # SelfRoot, Sandbox, Checkpoint Git, Cryptographie, RateLimiting
```

### Middlewares & Sécurité HTTP
1. **Rate Limiting** (`server/config/rateLimits.ts`) :
   - `strictLimiter` (10 000 req / 15 min en prod) sur l'ensemble de `/api`.
   - `pollingLimiter` (30 000 req / min en prod) sur `/api/ide`, `/api/sandbox`, `/api/knowledge`.
   - `authLimiter` (150 req / 5 min) sur les routes d'authentification.
   - `notebookChatLimiter` (30 req / min) et `notebookEmbeddingLimiter` (50 req / 5 min).
   - Les requêtes issues de la boucle locale (`127.0.0.1`, `::1`) ou en mode `dev` bypassent ces limites via `skipForLocal`.
2. **Authentification** (`server/security.ts`) :
   - Vérifie la présence du token configuré dans `Leanna_API_TOKEN` via l'en-tête `x-leanna-token` ou le cookie `Leanna_token`.
   - Appliqué à l'ensemble des routes `/api/*` (hors `/api/health`).
3. **Protection Réseau** :
   - Par défaut, le serveur écoute uniquement sur `127.0.0.1`. L'écoute sur `0.0.0.0` sans `Leanna_API_TOKEN` provoque un arrêt immédiat du serveur par sécurité (`process.exit(1)`).

---

## Base de données & Persistance

L'application utilise une architecture de persistance hybride (fichiers locaux + Supabase Postgres) :

### Persistance locale (fichiers JSON / NDJSON)
* `.env` / `.env.local` : Configuration chiffrée (AES-256-CBC via `server/utils/crypto.ts` pour les clés sensibles).
* `.Leanna-profile.json` : Profil utilisateur et préférences d'assistant (chargé et surveillé en temps réel via `fs.watchFile`).
* `.gemini-keys.json` : Pool de clés Google Gemini avec priorités, compteurs d'usage et état d'activation.
* `.Leanna-audit.log` : Journal d'audit au format NDJSON consignant les actions système et modifications de code.

### Persistance Cloud (Supabase Postgres)
Lorsque `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont renseignés, les tables suivantes sont exploitées :

| Table | Rôle | Schéma clé |
| :--- | :--- | :--- |
| `memories` | Mémoires à long terme avec recherche vectorielle | `id (uuid)`, `content (text)`, `tags (text[])`, `embedding (vector(768))`, `updated_at` |
| `conversations` | Sessions de discussion et résumés | `id (uuid)`, `title (text)`, `summary (text)`, `started_at`, `ended_at`, `message_count` |
| `conversation_messages` | Messages individuels des conversations | `id (uuid)`, `conversation_id (uuid)`, `role (text)`, `content (text)`, `created_at` |
| `workflows` | Pipelines de tâches et exécutions planifiées | `id (uuid)`, `name (text)`, `steps (jsonb)`, `schedule (text)`, `enabled (boolean)`, `last_run_status` |
| `scheduled_tasks` | Tâches d'automatisation récurrentes | `id (uuid)`, `name (text)`, `action_name (text)`, `args (jsonb)`, `interval_expression (text)` |
| `custom_skills` | Compétences dynamiques créées par l'utilisateur | `id (uuid)`, `name (text)`, `parameters (jsonb)`, `instruction (text)`, `enabled (boolean)` |
| `agent_tasks` | Tâches de la flotte d'agents autonomes | `id (text)`, `orchestration_id`, `role`, `status`, `result (jsonb)`, `context_files` |
| `agent_orchestrations`| Plans d'orchestration multi-agents | `id (text)`, `title`, `status`, `dependencies (jsonb)` |
| `agent_messages` | Historique des messages du bus inter-agents | `id (text)`, `from_role`, `to_role`, `type`, `payload (jsonb)` |

---

## Services externes

| Service | Rôle | Intégration | Configuration |
| :--- | :--- | :--- | :--- |
| **Google Gemini Live API** | Modèle LLM multimodal temps réel (voix, vision, outils) | `@google/genai` (modèle `gemini-3.1-flash-live-preview`) | `GEMINI_API_KEY` ou `.gemini-keys.json` |
| **Supabase** | Base de données relationnelle, pgvector et RLS | `@supabase/supabase-js` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| **OpenRouter** | Passerelle vers modèles LLM alternatifs | Requêtes HTTP REST (`https://openrouter.ai/api/v1`) | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` |
| **GitHub API** | Gestion des dépôts, issues, pull requests | Requêtes HTTP REST (`https://api.github.com`) | `GITHUB_TOKEN` |

---

## Sécurité & Garde-fous

Leanna met en œuvre plusieurs couches défensives pour encadrer la modification du code source :

```mermaid
flowchart TD
    Req[Modification de code demandée par l'IA] --> CheckLimit{Vérification Rate Limit<br/>30 écritures / min}
    CheckLimit -- Échec --> Block1[Rejet de la modification]
    CheckLimit -- OK --> PathNorm[Normalisation du chemin<br/>normalizeSelfPath]
    
    PathNorm --> CheckScope{Dans SELF_ROOT ?}
    CheckScope -- Non --> Block2[Rejet : Sortie de périmètre 403]
    CheckScope -- Oui --> CheckForbidden{Fichier interdit ?<br/>.git/config, node_modules...}
    
    CheckForbidden -- Oui --> Block3[Rejet : Cible protégée]
    CheckForbidden -- Non --> CheckCritical{Fichier critique ?<br/>server.ts, .env...}
    
    CheckCritical -- Oui --> AskUser[Confirmation UI via WebSocket<br/>confirmationBridge]
    AskUser -- Refus / Timeout 30s --> Block4[Annulation utilisateur]
    AskUser -- Approuvé --> Checkpoint[Création Checkpoint Git automatique]
    CheckCritical -- Non --> Checkpoint
    
    Checkpoint --> WriteTarget{Mode Sandbox actif ?}
    WriteTarget -- Oui --> WriteSB[Écriture dans .Leanna/sandbox]
    WriteTarget -- Non --> WriteMain[Écriture dans SELF_ROOT]
    
    WriteSB --> AuditLog[Journalisation Audit NDJSON]
    WriteMain --> AuditLog
    AuditLog --> PostValidator[PostEditValidator : Exécution tsc --noEmit]
    PostValidator --> SupervisorCheck{Erreurs détectées ?}
    SupervisorCheck -- Oui --> InjectCorrection[Injection consigne de correction à l'IA]
    SupervisorCheck -- Non --> End[Modification terminée]
```

1. **Path Traversal & Symlink Escapes** : Résolution centralisée dans `server/utils/selfRoot.ts` et `server/security.ts`. Les chemins sortant de `SELF_ROOT` ou contenant des symlinks externes sont immédiatement rejetés.
2. **Fichiers critiques protégés** : Toute modification de `server.ts`, `server/security.ts`, `server/utils/selfRoot.ts`, `electron/main.cjs`, `electron/preload.cjs`, `.env`, `.env.local` nécessite une confirmation explicite de l'utilisateur via une modale bloquante avec timeout de 30 secondes.
3. **Superviseur anti-régression** (`server/autonomy/Supervisor.ts`) : Analyse les erreurs TypeScript retournées après chaque édition. Si un fichier subit 3 échecs consécutifs, l'écriture sur ce fichier est verrouillée pour éviter les boucles infinies de correction.
4. **Prompt Injection Guard** (`server/utils/promptInjectionGuard.ts`) : Filtre les entrées suspectes pouvant tenter de détourner les instructions système.
5. **Isolation Electron** : `nodeIntegration: false`, `contextIsolation: true` et filtrage strict des canaux IPC.

---

## Décisions d'architecture

* **Intégration Vite en mode Middleware dans Express** :
  > Décision : Démarrer Vite au sein du serveur Express via `vite.createServer({ server: { middlewareMode: true, hmr: { server } } })` plutôt que comme deux processus HTTP distincts.
  > Problème résolu : Évite les problèmes de proxy croisé, les boucles TCP infinies (`ENOBUFS`) et permet d'unifier l'écoute sur un port unique (4000) pour l'API, le HMR et les WebSockets.
* **Système de miroir Sandbox fichier par fichier** :
  > Décision : Conserver le projet original intact et dupliquer les fichiers modifiés dans `.Leanna/sandbox`.
  > Problème résolu : Permet à l'IA de proposer des refactorisations massives sans risque de casser l'application en cours d'exécution avant validation de l'utilisateur.
* **Rotation dynamique des clés Gemini** (`server/utils/geminiKeyPool.ts`) :
  > Décision : Mettre en place un pool multi-clés surveillant les statuts d'erreur HTTP 429 / RESOURCE_EXHAUSTED.
  > Problème résolu : Assure la continuité de service des agents et de l'assistant vocal lors des sessions intensives de programmation assistée.
