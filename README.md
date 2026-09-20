# Leanna — AI Operating System

Leanna est un environnement de développement augmenté par IA, conçu pour les développeurs qui veulent déléguer des tâches complexes à une IA multimodale en temps réel. Il intègre un éditeur de code (Monaco), un terminal interactif, un système d'agents autonomes avec un **cerveau central dynamique (Agent Brain)**, et une interaction vocale via l'API Gemini Live — le tout dans une application web ou desktop (Electron).

Il s'adresse aux développeurs solo et aux petites équipes qui souhaitent un assistant IA local, sécurisé, capable de lire, écrire et exécuter du code dans leur propre workspace, sans envoyer leurs fichiers vers des services tiers non contrôlés.

![Build](https://img.shields.io/badge/build-passing-brightgreen) ![Version](https://img.shields.io/badge/version-1.1.0-blue) ![License](https://img.shields.io/badge/license-BUSL--1.1-orange) ![Node](https://img.shields.io/badge/node-%3E%3D20-green) ![Electron](https://img.shields.io/badge/electron-43-blueviolet)

---

## Stack technique

| Technologie | Rôle | Version |
|---|---|---|
| React | UI frontend | ^19.0.1 |
| React Router DOM | Routage frontend | ^7.18.1 |
| Vite | Bundler / dev server | ^6.2.3 |
| TypeScript | Langage principal (front + back) | ^5.0.0 |
| TailwindCSS | Styles utilitaires | ^4.1.14 |
| Express | Serveur HTTP / API REST | ^4.21.2 |
| Node.js | Runtime backend | ≥ 20 |
| tsx | Dev runner TypeScript ESM | ^4.23.1 |
| esbuild | Build serveur (CJS bundle) | ^0.25.0 |
| WebSocket (`ws`) | Temps réel (Gemini Live, terminal, sandbox) | ^8.21.0 |
| Electron | Application desktop (Windows) | ^43.1.0 |
| Monaco Editor | Éditeur de code intégré | ^0.53.0 |
| Google GenAI | Modèles Gemini (texte + voix) | ^2.4.0 |
| Supabase | Base de données PostgreSQL + pgvector | ^2.110.2 |
| Redis | Cache (optionnel, rate limits / sessions) | ^6.2.1 |
| Zod | Validation de schémas | ^3.25.76 |
| Puppeteer | Automatisation navigateur | ^25.3.0 |
| Recharts | Graphiques / dashboards | 3.10.1 |
| Motion | Animations UI | ^12.23.24 |
| Lucide React | Icônes | ^0.546.0 |
| Mermaid | Diagrammes dans notebooks | ^11.4.1 |
| Marked | Rendu Markdown | 15.0.12 |
| Tree-sitter | Parsing AST (TypeScript, JavaScript) | ^0.27.0 |
| pdf-parse | Extraction de documents PDF | ^2.4.5 |
| basic-ftp | Connexions FTP | 6.2.1 |
| grammy | Framework Bot Telegram (Long Polling) | ^1.46.0 |
| PM2 | Superviseur de process (production) | 7.x |
| express-rate-limit | Rate limiting API | ^8.6.0 |
| Multer | Upload de fichiers | ^2.2.0 |
| Compression | Compression gzip/brotli | ^1.8.1 |

---

## Fonctionnalités principales

### 🧠 Agent Brain — Cerveau Central Leanna *(nouveau)*

L'**Agent Brain** est la couche cognitive supérieure de Leanna. Il transforme un objectif utilisateur de haut niveau en un graphe d'exécution dynamique, sans aucun workflow codé en dur.

```
Utilisateur
    ↓ « Modernise mon site et rends le header responsive »
Agent Brain
    ├─ 1. Compréhension de l'objectif  (intention, stack, critères de succès)
    ├─ 2. Décomposition dynamique      (graphe DAG de sous-objectifs)
    ├─ 3. Choix des agents             (Researcher → Architect → Coder → Vision → Tester → Reviewer)
    ├─ 4. Choix des skills & outils    (allocation ciblée par étape)
    ├─ 5. Exécution orchestrée         (suivi temps réel dans l'interface)
    ├─ 6. Vérification multi-niveaux   (syntaxe, tests, visuel, sémantique)
    └─ 7. Correction autonome          (boucle auto-réparation bornée)
          ↓
    Résultat final avec rapport complet
```

**Déclenchement vocal ou textuel :**
```
« Modernise mon site et rends le header responsive »
→ agent_brain est appelé automatiquement
→ Le Brain analyse, planifie, exécute et valide sans workflow figé
```

**Modes :**
- `plan_first` : génère et affiche le plan pour approbation avant exécution
- `auto` : exécution complète de bout en bout

**API REST :**
```
POST /api/agents/brain/plan      # Visualiser le plan sans l'exécuter
POST /api/agents/brain/execute   # Exécution complète Brain
GET  /api/agents/brain/status/:id # Suivi d'avancement
```

### 📱 Bot Telegram — Contrôle Mobile Distant *(nouveau)*

Leanna intègre un service de bot Telegram natif (via `grammy` en mode Long Polling), vous permettant de piloter votre OS IA à distance depuis votre smartphone, sans ouvrir aucun port réseau.

```
Smartphone (Telegram)
      ↓ « /agent analyse les performances de la base de données »
Bot Telegram Leanna (Polling local)
      ├─ 1. Contrôle de sécurité (Liste blanche d'IDs autorisés)
      ├─ 2. Routage de la commande vers l'Agent Orchestrator
      ├─ 3. Exécution de la tâche en tâche de fond dans le workspace
      └─ 4. Notification proactive du résultat sur votre téléphone 🔔
```

- **Chat IA contextuel** : Échangez avec Leanna en langage naturel (avec l'historique et le contexte du projet actif).
- **Commandes intégrées** :
  - `/status` : État du système, projet actif, moteur IA, mémoire et uptime.
  - `/agent <tâche>` : Lancement d'une mission autonome par les agents.
  - `/tasks [statut]` : Liste des tâches agents, filtrable par statut (`pending`, `running`, `completed`, `incomplete`, `failed`, `cancelled`).
  - `/task <id>` : Détail complet d'une tâche (statut, priorité, timestamps, résumé, fichiers modifiés, erreurs).
  - `/cancel <id>` : Annulation d'une tâche agent en cours.
  - `/cmd <commande>` : Exécution sécurisée d'une commande dans le terminal du projet.
  - `/ls [dossier]` : Liste le contenu d'un dossier du projet actif.
  - `/read <chemin>` : Affiche le contenu d'un fichier (les gros fichiers > 64 Ko sont envoyés en pièce jointe).
  - `/project [chemin]` : Affiche le projet actif et les workspaces connus, ou bascule vers un autre projet.
  - `/clear` : Réinitialisation de la mémoire conversationnelle Telegram.
  - `/help` : Guide complet des commandes.
- **Sécurité renforcée** : Seuls les identifiants configurés dans la liste blanche (User IDs / usernames) sont autorisés. Les commandes `/read` et `/ls` sont protégées contre le _path traversal_ (aucun accès hors du projet actif), et `/cmd` filtre les commandes destructrices.
- **Notifications d'agents** : Réception automatique d'un ping Telegram lorsqu'un agent termine ou échoue une tâche.
- **Outils Telegram pour l'IA** : Leanna peut elle-même envoyer des messages, photos, documents ou fichiers du workspace via des skills dédiés (`telegram_notify`, `telegram_send_message`, `telegram_send_photo`, `telegram_send_document`, `telegram_send_from_workspace`, `telegram_broadcast`, `telegram_get_status`, `telegram_list_users`, `telegram_get_chat_info`).
- **Interface dédiée dans l'IDE** : Onglet Paramètres > Bot Telegram pour gérer le token, démarrer/arrêter le bot, et tester la liaison.

---

### Utilisateur
- **Interaction vocale en temps réel** via Gemini Live API (WebSocket `/live`) avec choix de voix
- **Éditeur de code Monaco** avec coloration syntaxique, multi-onglets, et arborescence de fichiers
- **Terminal interactif** intégré dans l'interface
- **Agent Brain** : cerveau central qui décompose et exécute des objectifs complexes dynamiquement *(nouveau)*
- **Agents autonomes** : délégation de tâches à des agents spécialisés (coder, architect, refactor, tester, debugger, reviewer, researcher, vision, security, writer, planner…)
- **Orchestration multi-agents** avec gestion des dépendances (DAG) et collaboration par patterns
- **Boucle d'auto-correction** : les agents détectent et réparent leurs propres erreurs de façon autonome
- **Runtime V2 (SkillManagerV2)** : nouvelle génération du moteur de skills avec `ToolRegistry`, `StateMachine`, `WorkflowEngine`, `Observability`, `PromptRegistry`, et agents spécialisés formatter/planner/proofreader/researcher/summarizer/translator/writer
- **Système de Missions (long-running)** : tâches longues persistées avec Planner + Executor + Reflection + SkillScorer
- **Supervision autonome (SmartSkills + Supervisor)** : boucle d'autonomie avec scoring de compétences et auto-adaptation
- **Sandbox sécurisé** : toutes les modifications de l'IA sont isolées et soumises à validation avant application
- **Partage d'écran et webcam** vers le modèle Gemini pour interaction visuelle
- **Notebooks RAG** : ingestion de documents (PDF, texte), chat contextuel avec recherche sémantique, **diagrammes Mermaid**, **aperçu slides**, **audio TTS**, **génération de contenu**
- **Historique des conversations** persisté dans Supabase avec recherche full-text
- **Mémoire hiérarchique** : court-terme (session), moyen-terme (projet), long-terme (Supabase pgvector)
- **Listes intelligentes** créées et gérées par l'IA
- **Workflows automatisés** planifiables (ex : toutes les 24h, 30m…) avec builder visuel
- **Tâches planifiées** (automation) avec intervalles configurables
- **Intégration GitHub** : statut Git, commits, push, issues, PRs depuis l'interface
- **Contrôle à distance via Telegram** : chat IA, lancement et suivi d'agents (`/tasks`, `/task`, `/cancel`), exploration du projet (`/ls`, `/read`, `/project`), exécution de commandes et alertes sur smartphone *(nouveau)*
- **Gestion de documents** : upload de PDF/DOCX, extraction et indexation
- **Thème dark/light** et couleur d'accent personnalisable
- **Panel PM2 intégré** : monitoring en temps réel des process (status, CPU, RAM, uptime, restart), actions (start/stop/restart/reload/flush), logs des apps supervisées *(nouveau)*
- **Checkpoints Git automatiques** : sauvegarde avant modification critique, rollback en 1 clic
- **Palette de commandes** (Ctrl+K) avec accès rapide à toutes les fonctionnalités
- **Global Search** : recherche full-text dans le workspace avec virtualisation

### Administrateur / Développeur
- **Knowledge Graph** du workspace : indexation incrémentielle des fichiers, entités, dépendances (AST Call Graph, Dependency Graph, Impact Analyzer)
- **Custom Skills** : création d'outils IA personnalisés via une interface dédiée
- **Marketplace de skills et d'agents** : catalogue extensible (`marketplace-installs.json`)
- **Rotation de clés Gemini** : pool de clés avec failover automatique sur erreur 429
- **MCP (Model Context Protocol)** : intégration de serveurs MCP externes avec `McpBridge` et `McpClient`
- **Audit log** : traçabilité de toutes les opérations sur les fichiers (workflow d'audit automatique)
- **Export** de conversations et données (PDF, DOCX, HTML)
- **FTP** : connexion à des serveurs FTP distants depuis l'IA
- **OpenRouter** : support de modèles alternatifs (GPT-4o-mini, etc.)
- **Text-to-Speech** intégré pour les réponses vocales
- **Checkpoint Git** : sauvegarde automatique avant chaque modification critique
- **Safeguards module** : garde-fous configurables contre actions dangereuses
- **Modèle de permissions par skill** : chaque skill/outil déclare les permissions requises (`read` / `write` / `network` / `exec`), appliquées au runtime par le `ToolRegistry` (modes `enforce` / `audit` / `off`) *(nouveau)*
- **Dry-run global** : exécution d'une mission complète en simulation, sans effet de bord (aucune écriture, exécution shell ou mutation réseau) — les lectures/analyses s'exécutent normalement *(nouveau)*
- **Token optimization** : résumé automatique du contexte pour éviter l'overflow de tokens
- **Sandbox Watch** : suivi en temps réel des modifications du sandbox avec diff viewer
- **Hierarchical Memory Engine** : moteur de mémoire hiérarchisé avec service dédié
- **Serveur de métriques V2** : observabilité du Runtime V2 (`/api/v2/metrics`)

---

## Architecture des Agents

Leanna dispose d'un système multi-agents complet organisé en 4 couches :

```
┌──────────────────────────────────────────────────┐
│              Agent Brain (nouveau)               │
│   Compréhension → Décomposition → Planif.       │
│   → Sélection agents/skills/outils              │
│   → Exécution → Vérification → Correction       │
└────────────────────┬─────────────────────────────┘
                     │ orchestre dynamiquement
┌────────────────────▼─────────────────────────────┐
│           AgentOrchestrator                      │
│   delegateTask · orchestrate · brainPlan        │
│   collaborateByPattern · brainExecute           │
└────────────────────┬─────────────────────────────┘
                     │ utilise
┌────────────────────▼─────────────────────────────┐
│     Runtime V2 · SkillManagerV2 (nouveau)        │
│  ToolRegistry · StateMachine · WorkflowEngine   │
│  Observability · PromptRegistry · 8 agents V2   │
└────────────────────┬─────────────────────────────┘
                     │ exécute via
┌────────────────────▼─────────────────────────────┐
│       Agents spécialisés (15 rôles + 8 V2)       │
│                                                  │
│  Code & Ingénierie    │  Rédaction & Docs        │
│  ─────────────────    │  ──────────────────      │
│  coder                │  writer + V2             │
│  refactor             │  formatter + V2          │
│  debugger             │  researcher + V2         │
│  reviewer             │  proofreader + V2        │
│  tester               │  translator + V2         │
│  security             │  summarizer + V2         │
│  architect            │  planner + V2            │
│  vision               │                          │
└──────────────────────────────────────────────────┘
```

**Délégation dynamique** (via matrice de délégation) : `coder` → `tester` → `reviewer` ; `planner` → `coder, researcher, writer` ; etc.

---

## Prérequis

| Élément | Version minimale |
|---|---|
| Node.js | 20.x |
| npm | 10.x |
| Git | 2.x |
| PM2 (optionnel, supervision) | 7.x |
| Compte Google AI Studio | Pour obtenir `GEMINI_API_KEY` |
| Compte Supabase (optionnel) | Pour la persistance (mémoire, historique, workflows) |
| Compte OpenRouter (optionnel) | Pour les modèles alternatifs |
| Compte GitHub (optionnel) | Pour les fonctionnalités Git/GitHub |

> ⚠️ **Windows uniquement** pour le build Electron (NSIS installer). Le serveur web fonctionne sur Linux/macOS.

---

## Installation

### 1. Cloner le dépôt

```bash
git clone https://github.com/<owner>/leanna.git
cd leanna
```

### 2. Installer les dépendances

```bash
npm install
```

### 3. Configurer les variables d'environnement

```bash
cp .env.example .env
```

Ouvrez `.env` et renseignez au minimum `GEMINI_API_KEY` (obligatoire). Les autres variables sont optionnelles au premier démarrage — un token API sera généré automatiquement si `Leanna_API_TOKEN` est vide.

### 4. Lancer en mode développement

```bash
npm run dev
```

L'application est disponible sur `http://127.0.0.1:4000`.

### 5. (Optionnel) Lancer en mode desktop Electron

```bash
npm run desktop
```

---

## Configuration

Toutes les variables sont lues depuis `.env` (ou `.env.local` s'il existe, avec priorité). Les valeurs sensibles sont chiffrées au repos dans le fichier.

| Variable | Description | Exemple | Obligatoire |
|---|---|---|---|
| `GEMINI_API_KEY` | Clé API Google Gemini | `AIza...` | ✅ |
| `Leanna_API_TOKEN` | Token d'authentification pour l'API et les WebSockets. Auto-généré si vide. | `abc123...` | ✅ (auto) |
| `Leanna_MASTER_KEY` | Clé de chiffrement des données sensibles (base64, 32 octets). Auto-générée si vide. | `base64string==` | ✅ (auto) |
| `SUPABASE_URL` | URL du projet Supabase | `https://xyz.supabase.co` | ❌ |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service Supabase (accès total) | `eyJ...` | ❌ |
| `OPENROUTER_API_KEY` | Clé API OpenRouter | `sk-or-...` | ❌ |
| `OPENROUTER_FREE_API_KEY` | Clé API OpenRouter (tier gratuit) | `sk-or-...` | ❌ |
| `OPENROUTER_MODEL` | Modèle par défaut OpenRouter | `openai/gpt-4o-mini` | ❌ |
| `OPENROUTER_REFERER` | Referer HTTP pour OpenRouter | `http://localhost:4000` | ❌ |
| `OPENROUTER_TITLE` | Titre app pour OpenRouter | `Leanna` | ❌ |
| `GITHUB_TOKEN` | Token GitHub (scope: repo, notifications) | `ghp_...` | ❌ |
| `APP_URL` | URL publique de l'application | `http://localhost:4000` | ❌ |
| `VITE_SERVER_PORT` | Port du serveur (défaut: 4000) | `4000` | ❌ |
| `ENABLE_CHAIN_OF_THOUGHT` | Active l'affichage de la chaîne de pensée | `true` | ❌ |
| `FORCE_TIERED_TOOLS` | Force le mode outils par tiers | `true` | ❌ |
| `SELF_HEAL_READONLY` | Mode auto-correction lecture seule | `false` | ❌ |
| `Leanna_PERMISSION_MODE` | Application des permissions par skill : `enforce` (refuse), `audit` (journalise), `off` (désactive) | `enforce` | ❌ |
| `Leanna_GRANTED_PERMISSIONS` | Permissions accordées globalement au runtime (CSV). Toutes par défaut. | `read,write,network` | ❌ |
| `Leanna_DRY_RUN` | Active la simulation globale au démarrage (aucun effet de bord réel) | `false` | ❌ |
| `SANDBOX_EXIT_CODE` | Code à 6 chiffres pour sortir du sandbox | `123456` | ❌ |
| `TELEGRAM_BOT_TOKEN` | Token d'API Bot Telegram (obtenu auprès de @BotFather) | `123456:ABC...` | ❌ |
| `ALLOW_FTP_PRIVATE_IPS` | Autorise les connexions FTP vers IPs privées | `false` | ❌ |
| `Leanna_LISTEN_HOST` | Interface d'écoute du serveur | `127.0.0.1` | ❌ |
| `NODE_ENV` | Environnement d'exécution | `development` | ❌ |
| `REDIS_URL` | URL de connexion Redis (pour rate limits partagés) | `redis://localhost:6379` | ❌ |

---

## Runtime autonome 24/7

Leanna inclut une fondation d’autonomie **événementielle**, pas une boucle `while(true)` qui interroge un modèle. `LeannaCore` reçoit les événements du `EventBus` existant, les classe localement, crée au besoin une tâche `maintenance`/`reactive` dédupliquée et laisse le heartbeat passer en `watching`, `idle` puis `sleeping` lorsque rien ne requiert d’attention.

- Aucun appel LLM n’est effectué par le heartbeat ni par la perception.
- Les tâches sont bornées par la concurrence, une queue maximale, le timeout, les retries exponentiels, le circuit breaker et une dead-letter queue visible.
- Les permissions par skill, le dry-run, le sandbox, les approbations et `.leannaignore` restent obligatoires : cette couche n’accorde ni ne contourne de permission.
- Consultez [AUTONOMY.md](AUTONOMY.md) pour le cycle complet, le tuning 24/7, la procédure d’arrêt/reprise et les limites connues.

**Démarrage prudent :** conservez `Leanna_PERMISSION_MODE="enforce"`, activez `Leanna_DRY_RUN="true"` pour une première validation et commencez avec `LEANNA_AUTONOMY_MAX_CONCURRENCY="1"`.

**Monitoring :** après démarrage, consultez `GET /api/v2/metrics/autonomy` avec le header `x-leanna-token`. Il expose l’état, la santé, les échecs récents et les 100 dernières tâches autonomes. `GET /api/health` reste accessible sans authentification.

Les variables `LEANNA_HEARTBEAT_*` et `LEANNA_AUTONOMY_*` de `.env.example` règlent les intervalles, la backpressure, la déduplication, les retries, timeouts et le circuit breaker.

**Couches optionnelles (dégradation propre sans Redis/Supabase) :**

- **Task store durable** — checkpoint/reprise des tâches autonomes après un crash (Supabase).
- **Timeline temps réel** — événements `autonomy:*` diffusés sur le canal WebSocket dédié `/autonomy`, visualisés dans l’UI via la route `/autonomy` (`AutonomyView`).
- **Fallback inter-providers** — bascule automatique Gemini ↔ OpenRouter avec disjoncteur (`LEANNA_PROVIDER_FALLBACK`).
- **Verrou distribué** — coordination mono-instance entre processus (`LEANNA_LOCK_REDIS_URL`, repli in-process).
- **Bus multi-processus** — pont Redis Streams pour diffuser l’`EventBus` entre instances (`LEANNA_EVENTBUS_*`).
- **Test de charge** — `npm run test:soak` valide le `TaskManager` sous charge soutenue.

Sans Redis/Supabase configurés, chacune de ces couches reste inactive et le runtime fonctionne exactement comme en mono-instance in-process. Détails complets dans [AUTONOMY.md](AUTONOMY.md).

---

## Lancement

### Mode développement

```bash
npm run dev
```

Démarre le serveur Express avec Vite en middleware (HMR activé) sur `http://127.0.0.1:4000`.

### Mode production (Node direct)

```bash
npm run build
npm start
```

### Mode production supervisé (PM2 — recommandé)

Le fichier `ecosystem.config.cjs` est inclus à la racine. Il définit une app `leanna` avec :
- `script: ./dist/server.cjs` (le bundle produit par `npm run build`)
- `exec_mode: fork` (1 instance), `autorestart: true`, `max_memory_restart: 1G`
- `kill_timeout: 3000`, `shutdown_with_message: true` pour une extinction propre

```bash
# 1. Build le bundle
npm run build

# 2. Démarrer via ecosystem.config.cjs
pm2 start ecosystem.config.cjs

# 3. Vérifier le statut dans le terminal ou via l'IDE (Panel PM2)
pm2 status
pm2 logs leanna

# 4. Sauvegarder le process list pour démarrage au boot
pm2 save
pm2 startup    # (copier/coller la commande générée)
```

Endpoints `/api/pm2/*` exposés par le serveur (monitoring et contrôle) :
```
GET    /api/pm2/status           # Statut global (apps + daemon + host)
POST   /api/pm2/:name/restart    # Redémarrer une app
POST   /api/pm2/:name/stop       # Arrêter une app
POST   /api/pm2/reload?file=ecosystem.config.cjs
POST   /api/pm2/flush            # Vider les logs
GET    /api/pm2/logs/:name?lines=120
```

### Mode desktop (Electron)

```bash
# Développement
npm run desktop

# Debug (DevTools ouverts)
npm run desktop:debug

# Build installateur Windows (.exe)
npm run dist:win
```

### Tests

```bash
# Lancer tous les tests
npm test

# Tests Agent Brain uniquement
node --import tsx --test server/agents/brain/AgentBrain.test.ts

# Lancer les tests d'un module spécifique
npm test -- server/skills/browser.test.ts

# Lancer uniquement les tests d'intégration des routes
npm test -- server/routes/*.test.ts
```

**Couverture de tests :**
- ✅ `server/agents/brain/` : **20 tests unitaires** Agent Brain (100% pass)
  - GoalUnderstandingEngine : détection de domaine et complexité
  - DynamicPlanner : séquence dynamique par type d'objectif
  - BrainVerifier : vérification multi-niveaux
  - BrainCorrectionLoop : boucle d'auto-correction bornée
- ✅ `server/runtime/` : Runtime V2 + HierarchicalMemoryService
- ✅ `server/skills/` : ≥60% de couverture
  - 136+ tests unitaires sur les skills critiques
  - Validation exhaustive des schemas Zod
  - Tests de gestion d'erreurs et logique métier
- ✅ `server/routes/` : **74 tests d'intégration REST**
  - Tests complets de tous les endpoints API
  - Validation des schémas de requêtes/réponses
  - Gestion des erreurs 400/404/500/503
  - Tests d'authentification et autorisation

---

## Structure du projet

```
leanna/
├── electron/               # Application desktop Electron
│   ├── main.cjs            # Processus principal Electron
│   ├── preload.cjs         # Preload script (IPC bridge)
│   ├── splash.css          # Styles splash screen
│   └── splash.html         # Splash screen de démarrage
├── server/                 # Backend Express (Node.js)
│   ├── agents/             # Orchestrateur et flotte d'agents autonomes
│   │   ├── brain/          # 🧠 Agent Brain
│   │   │   ├── types.ts                 # Types et interfaces Brain
│   │   │   ├── GoalUnderstandingEngine.ts # Compréhension de l'objectif
│   │   │   ├── DynamicPlanner.ts        # Décomposition DAG dynamique
│   │   │   ├── BrainVerifier.ts         # Vérification multi-niveaux
│   │   │   ├── BrainCorrectionLoop.ts   # Boucle d'auto-correction
│   │   │   ├── AgentBrain.ts            # Coordinateur central
│   │   │   └── AgentBrain.test.ts       # Tests unitaires
│   │   ├── AgentOrchestrator.ts         # Façade orchestration + Brain
│   │   ├── AgentExecutor.ts             # Exécution de tâches
│   │   ├── DelegationManager.ts         # Délégation structurée JSON
│   │   ├── AutonomousAgent.ts           # Base class agents autonomes
│   │   ├── AgentCommunication.ts        # Matrice de délégation
│   │   ├── AgentPersistence.ts          # Persistance tâches agents
│   │   └── roles.ts                     # Définitions des 15 rôles
│   ├── autonomy/           # Supervisor, SmartSkills + LeannaCore événementiel
│   ├── config/             # Rate limiters, configuration serveur
│   ├── export/             # Export PDF/DOCX/HTML
│   ├── knowledge/          # Knowledge Graph (indexation workspace, RAG)
│   │   └── document-system/ # Extraction / analyse / mémoire documents
│   ├── live/               # Handler WebSocket Gemini Live
│   ├── marketplace/        # Catalogue skills/agents
│   ├── mcp/                # Bridge + Client MCP (Model Context Protocol)
│   ├── middleware/         # Middlewares Express (validateBody…)
│   ├── mission/            # Système de missions longues (Planner/Executor/Reflection)
│   ├── notebooks/          # RAG : ingestion + embeddings + RAGEngine
│   ├── prompts/            # System instructions + SystemPromptBuilder
│   ├── routes/             # Routeurs REST (40+ modules)
│   │   ├── pm2.ts          # Endpoints monitoring/contrôle PM2
│   │   ├── safeguards.ts   # Garde-fous sécurité
│   │   ├── checkpoint.ts   # Sauvegardes Git avant modifs
│   │   ├── mcp.ts          # Configuration MCP
│   │   ├── automation.ts   # Tâches planifiées
│   │   ├── workflows.ts    # Moteur de workflows
│   │   ├── audit.ts        # Audit log
│   │   ├── agents.ts       # API REST agents + /brain/plan /brain/execute
│   │   └── telegram.ts     # API de gestion du bot Telegram
│   ├── runtime/            # ⚡ Runtime V2 — SkillManagerV2
│   │   ├── agents/         # 8 agents V2 spécialisés (formatter, planner, proofreader, researcher, summarizer, translator, writer)
│   │   ├── compat/         # LegacyBridge + SkillAdapter
│   │   ├── prompts/        # PromptRegistry (base, chat, browser, autonomy…)
│   │   ├── routes/         # /api/v2/agents + /api/v2/metrics (+ /autonomy)
│   │   ├── workflows/      # Workflows JSON prédéfinis (feature, refactor-safe, security-audit)
│   │   ├── ToolRegistry.ts · StateMachine.ts · WorkflowEngine.ts
│   │   ├── PermissionPolicy.ts · DryRun.ts   # Permissions par skill + dry-run global
│   │   ├── EventBus.ts · Observability.ts · AgentRuntime.ts
│   │   └── HierarchicalMemoryService.ts
│   ├── skills/             # Skills natifs (35+) dont agent_brain et telegram
│   ├── telegram/           # Service Bot Telegram (grammy, whitelist, chat IA)
│   │   ├── TelegramService.ts
│   │   └── types.ts
│   ├── utils/              # Sandbox, crypto, checkpoint, selfRoot, serverRestart…
│   ├── workflows/          # Moteur de workflows planifiés + audit-workflow
│   ├── audit.ts            # Module d'audit global
│   ├── security.ts         # Authentification (token), validation, rate limiter
│   └── lifecycle.ts        # Graceful shutdown
├── src/                    # Frontend React
│   ├── components/
│   │   ├── ide/            # Composants IDE (Monaco, sidebar, file explorer, terminal…)
│   │   ├── panels/         # Panels spécialisés
│   │   │   ├── PM2StatusPanel.tsx     # Monitoring + contrôle PM2
│   │   │   ├── AgentFleetPanel.tsx    # Flotte d'agents V2
│   │   │   ├── MissionPanel.tsx       # Système de missions
│   │   │   ├── CheckpointPanel.tsx    # Checkpoints Git
│   │   │   ├── AgentBuilderPanel.tsx  # Création d'agents custom
│   │   │   ├── McpPanel.tsx           # Config MCP
│   │   │   ├── WorkflowsPanel.tsx     # Gestion workflows
│   │   │   ├── SandboxPanel.tsx       # Sandbox viewer + diff
│   │   │   ├── AutomationPanel.tsx    # Tâches planifiées
│   │   │   ├── AuditPanel.tsx         # Audit log
│   │   │   ├── MarketplacePanel.tsx   # Marketplace skills/agents
│   │   │   └── ... (BrowserPanel, TerminalPanel, Notebooks…)
│   │   ├── notebooks/      # Panels notebooks RAG + Mermaid + slides
│   │   ├── settings/       # Sections paramètres (Agents, AI, Apparence, Mémoire, Telegram…)
│   │   └── ui/             # Composants UI atomiques (Panel, Toast, Modal…)
│   ├── context/            # Contextes React (LiveAPI, Profile, ScreenShare, Theme)
│   ├── hooks/              # Hooks personnalisés (useLiveAPI, useFileMention, useToken…)
│   ├── services/           # Clients API (ideApi, pm2Api, workspaceApi, notebookApi…)
│   ├── config/             # Config sidebar, templates
│   ├── stores/             # État global
│   ├── types/              # Types TypeScript partagés
│   ├── utils/              # Utilitaires frontend
│   ├── views/              # Pages (IdeView, NotebooksView, GitHubView…)
│   ├── index.css           # Tailwind + tokens globaux
│   └── main.tsx            # Point d'entrée React
├── scripts/                # Scripts utilitaires (lint, start-desktop, analyze-tooltips…)
├── assets/                 # Images, icônes, vidéos splash
├── ecosystem.config.cjs    # Configuration PM2 (app leanna)
├── supabase/               # Schémas SQL et migrations Supabase
├── server.ts               # Point d'entrée du serveur Express
├── server-bootstrap.ts     # Bootstrap (env, déchiffrement, démarrage)
├── vite.config.ts          # Configuration Vite
├── tsconfig.json           # Configuration TypeScript
├── package.json            # Dépendances et scripts npm
├── .env.example            # Template variables d'environnement
├── API_DOCS.md             # Référence API REST + WebSocket
├── ARCHITECTURE.md         # Architecture technique détaillée
├── DB_SCHEMA.md            # Schéma de base de données
├── GEMINI.md               # Guide d'utilisation Gemini
├── SELF_IDE.md             # Auto-hébergement & développement avec Leanna
├── ROADMAP.md              # Feuille de route
├── CHANGELOG.md            # Historique des versions
├── CLAUDE.md · CONTRIBUTING.md
└── LICENSE                 # BUSL 1.1
```

---

## Utiliser l'Agent Brain

### Via l'interface vocale

Dites simplement votre objectif à Leanna :
> *« Modernise mon site et rends le header responsive »*
> *« Corrige le crash au démarrage de l'application »*
> *« Refactorise le module authentication pour respecter les principes SOLID »*

Leanna invoque automatiquement `agent_brain` qui planifie et exécute dynamiquement.

### Via l'outil direct (mode plan_first)

```
agent_brain({
  goal: "Modernise mon site et rends le header responsive",
  mode: "plan_first"
})
```

Retourne le plan complet pour inspection avant exécution.

### Via l'API REST

```bash
# Générer un plan sans exécuter
curl -X POST http://localhost:4000/api/agents/brain/plan \
  -H "Content-Type: application/json" \
  -H "x-leanna-token: <Leanna_API_TOKEN>" \
  -d '{"goal": "Modernise mon site et rends le header responsive"}'

# Exécuter de bout en bout
curl -X POST http://localhost:4000/api/agents/brain/execute \
  -H "Content-Type: application/json" \
  -H "x-leanna-token: <Leanna_API_TOKEN>" \
  -d '{"goal": "Fix le crash au démarrage", "maxCorrectionAttempts": 3}'

# Suivre l'avancement
curl -H "x-leanna-token: <Leanna_API_TOKEN>" \
  http://localhost:4000/api/agents/brain/status/<planId>
```

---

## Sécurité de l'agent : permissions & dry-run

Deux garde-fous complémentaires contrôlent ce que l'agent peut réellement faire.

### Modèle de permissions par skill

Chaque skill (et chaque outil) déclare les permissions qu'il requiert, dans le vocabulaire de la roadmap :

| Permission | Signification |
|---|---|
| `read` | Lecture de fichiers / ressources |
| `write` | Écriture, création ou suppression de fichiers |
| `network` | Accès réseau sortant (API, git remote…) |
| `exec` | Exécution de commandes shell / processus |

Les permissions sont déclarées sur le skill, appliquées au runtime par le `ToolRegistry` à **chaque appel d'outil** (missions, agents, chat). Exemple de déclaration :

```ts
export const systemSkill: Skill = {
  name: "system",
  permissions: ["exec"],                 // défaut du skill
  toolPermissions: {                     // surcharge par outil
    system_info: ["read"],
    run_project_command: ["exec"],
  },
  // …
};
```

À défaut de déclaration explicite, les permissions sont **déduites** du nom de l'outil (fallback historique).

**Modes d'application** (`Leanna_PERMISSION_MODE`) :
- `enforce` (défaut) : un appel réclamant une permission non accordée est **refusé** (`PermissionDeniedError`).
- `audit` : l'appel passe mais l'usage est **journalisé** (utile pour cartographier avant de restreindre).
- `off` : aucune vérification (comportement legacy).

Le jeu de permissions accordées globalement se règle via `Leanna_GRANTED_PERMISSIONS` (CSV). Par exemple, pour interdire toute exécution shell et tout accès réseau :

```env
Leanna_PERMISSION_MODE=enforce
Leanna_GRANTED_PERMISSIONS=read,write
```

### Dry-run global (simulation sans effet de bord)

Le dry-run exécute une mission complète **en simulation** : les outils en lecture seule (`read`) s'exécutent normalement — pour que l'agent puisse lire, chercher et planifier — mais tout outil à effet de bord (`write` / `exec` / `network`) est **intercepté** et **non exécuté**. Un résultat simulé est renvoyé et l'effet évité est enregistré dans un rapport.

**Par mission** (via le skill `mission`) :
```
mission_create({
  title: "Refactor auth",
  description: "…",
  dryRun: true          // simulation, aucun effet de bord réel
})
```
Puis, pour voir ce qui aurait été fait :
```
mission_dryrun_report()   // liste des écritures / exécutions / appels réseau simulés
```

**Globalement** (au démarrage) via l'environnement :
```env
Leanna_DRY_RUN=true
```

Le dry-run s'appuie sur les mêmes permissions déclarées : la classification d'un outil comme « effet de bord » est cohérente avec le contrôle d'accès.

---

## Dépannage (Troubleshooting)

### `GET /api/pm2/status 503 Service Unavailable`

Le serveur ne peut pas invoquer la CLI `pm2`. Causes les plus fréquentes :

1. **PM2 n'est pas installé (global)**
   ```bash
   npm install -g pm2
   pm2 --version   # doit afficher 7.x
   ```

2. **PM2 n'est pas dans le PATH du process serveur (Windows)**
   - Symptôme : `pm2 jlist` fonctionne dans PowerShell mais pas via le serveur.
   - Solution : Le code a un fallback `exec()` avec shell qui résout `pm2` via `PATH/PATHEXT`. Si le problème persiste, redémarrer le terminal / l'IDE pour rafraîchir `PATH`.
   - Sur Windows avec PowerShell, PM2 s'installe typiquement en `%APPDATA%\npm\pm2.cmd` et `%APPDATA%\npm\pm2.ps1`.

3. **Le daemon PM2 n'a jamais été démarré (aucune app)**
   ```bash
   pm2 ping          # doit retourner pong
   pm2 list          # affiche la liste (vide OK)
   pm2 resurrect     # restore la dernière liste sauvegardée
   ```

4. **Inspecter le log backend**
   Le serveur log désormais `[PM2] GET /status failed: <message> (code=...)` directement dans la console du process. Ce message donne la cause exacte (ENOENT, EINVAL, CMD introuvable, etc.).

### Erreur 401 Unauthorized sur /api/*

Si `Leanna_API_TOKEN` est défini dans `.env`, TOUTES les routes `/api/*` (sauf `/api/health`) nécessitent le header :

```
x-leanna-token: <valeur de Leanna_API_TOKEN>
```

Le frontend doit stocker ce token dans `localStorage['Leanna_api_token']` (le login / setup s'en occupe). Les clients API (`ideApi`, `pm2Api`, etc.) l'ajoutent automatiquement via `getAuthHeaders()`.

### Gemini Live échoue immédiatement (Quota dépassé)

- Vérifiez que `INITIAL_PROMPT_MAX_TOKENS` et la limite d'injection notebooks sont bien appliqués.
- Si vous injectez beaucoup de notebooks : préférer `summary` à `rawText`.
- Activer le key pool : définissez plusieurs `GEMINI_API_KEY_N` (rotation + failover 429).

---

## Documentation

- [README.md](README.md) — Vue d'ensemble et installation (ce fichier)
- [API_DOCS.md](API_DOCS.md) — Référence complète de l'API REST et WebSockets
- [AUTONOMY.md](AUTONOMY.md) — Fonctionnement, exploitation 24/7, supervision, arrêt et récupération du runtime autonome
- [AUTONOMY_AUDIT.md](AUTONOMY_AUDIT.md) — Audit des composants réutilisés et des limites de l’architecture
- [ARCHITECTURE.md](ARCHITECTURE.md) — Architecture technique détaillée
- [CONTRIBUTING.md](CONTRIBUTING.md) — Guide de contribution et conventions
- [DB_SCHEMA.md](DB_SCHEMA.md) — Schéma de base de données Supabase
- [GEMINI.md](GEMINI.md) — Guide d'intégration et troubleshooting Gemini
- [SELF_IDE.md](SELF_IDE.md) — Auto-hébergement et développement de Leanna avec Leanna
- [ROADMAP.md](ROADMAP.md) — Feuille de route du projet
- [CHANGELOG.md](CHANGELOG.md) — Historique des versions

---

## Contribuer

Consultez [CONTRIBUTING.md](CONTRIBUTING.md) pour le workflow Git, les conventions de code et le processus de review.

---

## Licence

Ce projet est distribué sous licence **BUSL 1.1** (Business Source License 1.1).

Voir le fichier [LICENSE](LICENSE) pour les conditions complètes.

code2prompt "C:\Users\Mayss\Desktop\Jarvis-os-ori" --exclude="*.txt,node_modules/**,.git/**,dist/**,build/**,.next/**,coverage/**,.Leanna/**" -O "output.md"