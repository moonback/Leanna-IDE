<p align="center">
  <img src="assets/images/header.png" alt="Jarvis OS" width="100%" />
</p>

<h1 align="center">Jarvis OS</h1>

<p align="center">
  <strong>IDE auto-référentiel avec assistant IA intégré (Leanna) — Comprend et modifie le code de l'application du workspace</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.5.0-blue" alt="Version" />
  <img src="https://img.shields.io/badge/node-%3E%3D22.12.0-brightgreen" alt="Node.js" />
  <img src="https://img.shields.io/badge/electron-43-blueviolet" alt="Electron" />
  <img src="https://img.shields.io/badge/react-19-61dafb" alt="React" />
  <img src="https://img.shields.io/badge/AI-Gemini%202.x-orange" alt="Gemini" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
</p>

---

## Table des matières

- [Présentation](#-présentation)
- [Concept Clé : IDE Auto-Référentiel](#-concept-clé--ide-auto-référentiel)
- [Stack Technique](#-stack-technique)
- [Fonctionnalités Principales](#-fonctionnalités-principales)
- [Screenshots](#-screenshots)
- [Documentation Technique](#-documentation-technique)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Lancement](#-lancement)
- [Architecture](#-architecture)
- [API Backend](#-api-backend)
- [Skills & Outils IA](#-skills--outils-ia)
- [Sécurité](#-sécurité)
- [Contribution](#-contribution)
- [Licence](#-licence)

---

## Présentation

**Jarvis OS est un IDE auto-référentiel** — un environnement de développement intelligent où l'assistant IA intégré (Leanna) peut **lire, comprendre et modifier le code source de l'application elle-même**.

Conçu comme un système d'exploitation desktop, Jarvis OS combine :

- Un **IDE complet** avec éditeur Monaco, explorateur de fichiers, recherche globale et intégration Git
- Un **assistant IA multimodal** (Leanna) capable de voix en temps réel, vision webcam et partage d'écran via Gemini Live
- Un **système multi-agents** (14 rôles spécialisés) capable de collaborer sur des tâches complexes
- Des **notebooks RAG** (style NotebookLM) avec ingestion de sources, chat avec citations et génération de contenu
- Un **moteur de connaissances** avec indexation sémantique automatique du workspace
- Un **sandbox isolé** pour les modifications assistées avec validation avant merge

> **Positionnement produit (v0.5.0)** : Jarvis OS ne gère désormais que son propre code source. Chaque modification est protégée par un système de checkpoints Git, permettant un rollback instantané en cas d'erreur. L'application est **self-contained** : elle ne peut pas ouvrir ou modifier des projets externes.

---

## Concept Clé : IDE Auto-Référentiel

### Ce que cela signifie

Jarvis OS est **auto-hébergé** : il ne fonctionne que sur son propre repository. Cette contrainte structurelle garantit que :

1. **Périmètre verrouillé** : La racine du projet (`SELF_ROOT`) est résolue une seule fois au démarrage et ne peut pas changer
2. **Validation centralisée** : Tous les accès filesystem passent par `server/utils/selfRoot.ts`
3. **Protection des fichiers critiques** : Les fichiers sensibles nécessitent une confirmation explicite avant modification
4. **Checkpoints automatiques** : Snapshot Git avant toute modification avec capacité de rollback

### Module `selfRoot.ts` — Source de vérité

| Export | Type | Rôle |
|--------|------|------|
| `SELF_ROOT` | `string` | Racine absolue et immuable du repo |
| `normalizeSelfPath(target)` | `function` | Valide qu'un chemin reste dans le périmètre |
| `isWriteForbidden(absPath)` | `function` | Vérifie si le fichier est interdit en écriture |
| `isCriticalFile(absPath)` | `function` | Vérifie si le fichier nécessite confirmation |

### Garde-fous Auto-Modification

Chaque modification de code suit ce workflow sécurisé :

```
1. Rate limiting (30 écritures/min max)
2. Validation du chemin (normalisation + vérification périmètre)
3. Confirmation interactive pour fichiers critiques
4. Checkpoint Git AVANT écriture
5. Écriture effective
6. Audit enrichi (avec diff sommaire)
7. Restart serveur si nécessaire + validation post-édition
```

> Voir [SELF_IDE.md](SELF_IDE.md) pour la documentation complète du système auto-référentiel.

---

## Stack Technique

| Couche | Technologies |
|--------|-------------|
| **Frontend** | React 19, React Router 7, Tailwind CSS 4, Monaco Editor, Motion, Lucide React, react-window |
| **Backend** | Node.js 22+, Express 4, WebSocket (ws), multer, compression |
| **IA** | Google Gemini 2.x (SDK `@google/genai`), OpenRouter (multi-modèles), embeddings `gemini-embedding-001`, Gemini Vision |
| **Desktop** | Electron 43, electron-builder (NSIS Windows) |
| **Bundling** | Vite 6, esbuild, tsx |
| **Base de données** | Supabase (PostgreSQL) avec RLS, stockage local JSON |
| **Autres** | pdf-parse, puppeteer (scraping), marked (Markdown), mermaid (diagrammes), recharts |

---

## Fonctionnalités Principales

### IDE Intelligent & Auto-Référentiel

- **Éditeur Monaco** : Syntaxe colorée, autocomplétion, multi-fichiers, multi-onglets
- **Explorateur de fichiers** : Arbre interactif avec filtres, recherche globale (Ctrl+Shift+F)
- **Mode Sandbox** : Environnement isolé `.jarvis/sandbox/` pour les modifications IA
- **Checkpoints Git** : Snapshot automatique avant modification avec rollback possible
- **Validation stricte** : TypeScript, lint, analyse sécurité avant merge
- **Self-Edit Mode** : Indicateurs visuels quand l'IA modifie le fichier ouvert

### Assistant Code (Leanna) — Cœur du Système

Leanna est l'assistant IA intégré qui **comprend et modifie directement le code du workspace** :

#### Capacités de Lecture
| Outil | Description |
|-------|-------------|
| `read_project_file` | Lecture partielle ou complète avec numéros de ligne, hash MD5, preview |
| `read_file_outline` | Structure d'un fichier (fonctions, classes, exports) avec numéros de ligne |
| `search_in_files` | Recherche textuelle ou regex avec lignes de contexte et prévisualisation |
| `list_project_files` | Exploration avec filtrage par extension et statistiques |

#### Capacités d'Écriture & Modification
| Outil | Description |
|-------|-------------|
| `write_project_file` | Création ou écrasement complet + mode `append` |
| `modify_project_file` | Remplacement de texte exact avec fuzzy match et suggestions |
| `patch_project_file` | Patch par numéros de ligne (replace / insert / delete) |
| `apply_patch` | Application de diff unifié (format `git diff`) avec tolérance whitespace |
| `rename_project_file` | Renommage et déplacement de fichiers |
| `delete_project_file` / `delete_project_folder` | Suppression avec garde-fous |

#### Exécution & Validation
| Outil | Description |
|-------|-------------|
| `run_project_command` | Exécute `npm`, `npx` ou `node` dans le workspace |
| `verify_file` | Lint + typecheck TypeScript + analyse sécurité sur un fichier |
| `verify_typecheck` | Vérification TypeScript complète du projet |
| `verify_syntax` | Validation syntaxique instantanée |

#### Workflow Code Intégré
```
1. read_file_outline → identifier la structure
2. read_project_file (startLine/endLine) → lire la section précise
3. modify_project_file ou patch_project_file → appliquer le changement
4. verify_file → valider avant de terminer
```

### Système Multi-Agents (14 Agents Autonomes)

Le système orchestré par Leanna comprend **14 agents spécialisés** répartis en deux pôles :

#### Pôle Code & Ingénierie Logicielle

| Agent | Rôle / ID | Mission Principale | Capacité |
|---|---|---|:---:|
| Developpeur | `coder` | Implémentation de fonctionnalités, écriture et modification de code typé | Lecture / Écriture / Tests |
| Refactorisation | `refactor` | Clean Code, modularité, découpage de composants, réduction de dette | Lecture / Écriture / Validation |
| Débogueur | `debugger` | Diagnostic d'erreurs/stacktraces, root-cause et correctifs chirurgicaux | Lecture / Écriture / Validation |
| Revue de Code | `reviewer` | Audit qualité, détection d'anti-patterns SOLID/DRY et feedback constructif | Lecture seule |
| QA & Tests | `tester` | Conception et écriture de suites de tests (unitaires, intégration, cas limites) | Lecture / Écriture / Validation |
| Sécurité & Audit | `security` | Audit de vulnérabilités OWASP, fuites de secrets, validation des flux | Lecture seule |
| Architecte Logiciel | `architect` | Conception système, arborescence, schémas de données, interfaces et patterns | Lecture / Écriture / Structure |

#### Pôle Rédaction & Documentation

| Agent | Rôle / ID | Mission Principale | Capacité |
|---|---|---|:---:|
| Rédacteur | `writer` | Rédaction de documents complets, guides, README et articles | Lecture / Écriture |
| Mise en forme | `formatter` | Formatage structurel Markdown, tables, blocs de code, TOC | Lecture / Écriture |
| Recherche | `researcher` | Collecte d'informations, vérification de faits et sources | Lecture seule |
| Correcteur | `proofreader` | Correction orthographique, grammaticale, style et cohérence | Lecture / Écriture |
| Traducteur | `translator` | Traduction et localisation multilingue fidèle | Lecture / Écriture |
| Synthèse | `summarizer` | Résumés exécutifs, condensés et points clés | Lecture / Écriture |
| Planificateur | `planner` | Plans détaillés, outlines et organisation de documents | Lecture / Écriture / Structure |

#### Patterns de Collaboration Multi-Agents
- **Cycle Feature Complète** : `architect` → `coder` → `tester` → `reviewer`
- **Cycle Bugfix Sécurisé** : `debugger` → `tester` → `security`
- **Cycle Clean Code** : `reviewer` → `refactor` → `tester`
- **Cycle Document Complet** : `planner` → `writer` → `proofreader` → `formatter`
- **Cycle Traduction Vérifiée** : `writer` → `translator` → `proofreader`
- **Cycle Recherche & Synthèse** : `researcher` → `planner` → `writer` → `summarizer`

> **Flotte d'agents autonomes** avec surveillance d'activité en temps réel via `AgentPanel` et `AgentFleetPanel`.

### Notebooks RAG (style NotebookLM)

#### Gestion des Sources
- **Upload multiples** : PDF, DOCX, MD, HTML, images (PNG/JPG/WebP), CSV, JSON, YAML
- **Ingestion d'URLs** : Extraction automatique du contenu web
- **Texte collé** : Depuis le presse-papier ou saisie manuelle
- **Rendu visuel** : Les fichiers HTML sont rendus dans une iframe sandboxée
- **Support images** : Upload avec analyse Vision IA (OCR, description visuelle)

#### Recherche & Chat
- **Recherche hybride** : Embeddings sémantiques (Gemini) + TF-IDF lexical + Reciprocal Rank Fusion + Re-ranking LLM
- **5 stratégies de parsing** pour une extraction optimale
- **Chat groundé** : Questions/réponses avec citations précises et score de pertinence
- **Conversations multiples** : Threads de chat séparés par notebook
- **Deep Dive** : Mode exploration approfondie multi-étapes
- **Comparaison de sources** : Analyse des similitudes, différences et contradictions
- **Mode Focus Sources** : Sélectionner quelles sources utiliser pour une question

#### Génération de Contenu
- Résumés synthétiques et exécutifs
- FAQ (15-20 Q&R) automatiques
- Guides d'étude (concepts, quiz, auto-évaluation)
- Briefings exécutifs
- Chronologies et plans structurés
- Cartes mentales (rendu Mermaid visuel)
- Analyse SWOT
- Glossaires techniques
- Infographies (génération d'images IA)
- **Audio Overview** : Script de podcast IA (deux hôtes discutent de vos sources)

#### Notes Avancées
- **Templates** : Cornell, Résumé, To-do, Compte-rendu
- **Vue Canvas** : Espace 2D pour organiser visuellement les notes (drag & drop, zoom, pan)
- **Backlinks** : Détection automatique des mentions entre notes
- **Export** : Toutes les notes en Markdown
- **Recherche full-text** et tri (récentes, anciennes, A→Z)

### Assistant Multimodal (Gemini Live)

- **Voix en temps réel** : Dictée, commandes vocales, réponses audio (TTS)
- **Vision webcam** : Analyse de documents physiques ou schémas manuscrits
- **Partage d'écran** : Capture et interprétation du contenu affiché
- **Chat textuel** : Conversation avec historique, streaming SSE, contexte persistant
- **Personnalités IA** : 6 tons disponibles (Standard, Académique, Vulgarisateur, Concis, Détaillé, Créatif)

### Moteur de Connaissances

- **Indexation automatique** du workspace (fichiers, code, dépendances)
- **Graphe de relations** entre fichiers et entités
- **Recherche sémantique** sans API externe
- **Analyse d'impact** avant modification
- **Détection de contradictions** entre documents
- **Mémoire projet** (conventions, préférences de style)

### Automatisation & Workflows

- **Workflows documentaires** orchestrés (pipelines de traitement)
- **Tâches planifiées** (cron-like) avec déclencheurs
- **Missions autonomes** avec planification IA
- **Exécution parallèle ou séquentielle** avec dépendances
- **Navigation web automatisée** (Puppeteer)

### Navigateur Web Intégré (BrowserPanel)

Navigateur embarqué basé sur Electron `<webview>`, **pilotable en temps réel par l'IA** :

| Commande | Action |
|----------|--------|
| `browser_navigate` | Navigation vers une URL |
| `browser_search` | Recherche dans la page |
| `browser_read_content` | Extraction du texte visible (ou sélecteur CSS) |
| `browser-scroll` | Défilement (top/bottom/up/down) |
| `browser-back/forward/reload` | Navigation historique |

### Passerelle MCP

- **Connexion à chaud** de serveurs MCP (stdio & SSE)
- **Invocation d'outils externes** depuis l'IA
- **Interface de gestion intégrée**
- **Sandboxing automatique** : tous les chemins sont validés via `selfRoot.ts`

### Gestion Documentaire

- Création assistée de documents structurés
- Templates intelligents (MVP, rapport, cahier des charges, specs, roadmap)
- Export multi-format (Markdown, PDF, DOCX)
- Analyse croisée de documents
- Versionning avec rollback

### Intégrations

- **Supabase** : Persistance, mémoire long terme
- **OpenRouter** : Modèles alternatifs (GPT-4o, Claude, Llama, etc.)
- **GitHub** : Intégration repos, issues, PRs

---

## Screenshots

<p align="center">
  <img src="assets/Screen/ide.PNG" alt="IDE View" width="90%" />
</p>
<p align="center">
  <img src="assets/Screen/ide1.PNG" alt="IDE View" width="90%" />
</p>
<p align="center">
  <img src="assets/Screen/ide2.PNG" alt="IDE View" width="90%" />
</p>

---

## Documentation Technique

La documentation complète est disponible dans le dossier [`docs-new/`](docs-new/) :

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](docs-new/ARCHITECTURE.md) | Architecture complète avec diagrammes Mermaid |
| [API_DOCS.md](docs-new/API_DOCS.md) | Documentation détaillée des 32+ endpoints REST |
| [DB_SCHEMA.md](docs-new/DB_SCHEMA.md) | Schéma complet de la base de données Supabase (12 tables) |
| [CONTRIBUTING.md](docs-new/CONTRIBUTING.md) | Guide de contribution et bonnes pratiques |
| [ROADMAP.md](docs-new/ROADMAP.md) | Feuille de route du projet |

> Pour comprendre comment étendre les skills en respectant le périmètre auto-référentiel, voir [SELF_IDE.md](SELF_IDE.md).

---

## Installation

### Prérequis

- **Node.js** ≥ 22.12.0
- **npm** ≥ 10.x
- **Clé API Gemini** (Google AI Studio) — **obligatoire**
- **Clé API OpenRouter** — optionnelle (pour les modèles alternatifs)
- **Git** — pour le versionnage et les checkpoints

### Étapes

```bash
# 1. Cloner le dépôt
git clone https://github.com/moonback/Jarvis-OS.git
cd Jarvis-OS

# 2. Installer les dépendances
npm install

# 3. Configurer l'environnement
cp .env.example .env
# Renseigner au minimum GEMINI_API_KEY dans .env
```

---

## Configuration

### Variables d'environnement (.env)

| Variable | Description | Obligatoire |
|----------|-------------|:-----------:|
| `GEMINI_API_KEY` | Clé API Google Gemini | ✅ |
| `JARVIS_API_TOKEN` | Token de sécurité des endpoints | ⚠️ Recommandé |
| `SUPABASE_URL` | URL de l'instance Supabase | ❌ |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service Supabase | ❌ |
| `OPENROUTER_API_KEY` | Clé OpenRouter (modèles alternatifs) | ❌ |
| `GITHUB_TOKEN` | Token GitHub (repos, issues, PRs) | ❌ |
| `ENABLE_CHAIN_OF_THOUGHT` | Afficher le raisonnement IA (true/false) | ❌ |
| `SANDBOX_EXIT_CODE` | Code de sécurité pour sortir du sandbox | ❌ |
| `VITE_SERVER_PORT` | Port du serveur backend (défaut: 5000) | ❌ |

### Pool de clés Gemini

Jarvis OS supporte un **pool de clés API** avec rotation automatique (round-robin + retry sur 429). Les clés sont stockées chiffrées dans `.gemini-keys.json`.

> **Sécurité** : Les clés sont chiffrées au repos avec AES-256-GCM. La dérivation de clé est machine-bound via `JARVIS_MASTER_KEY` + hardware seed.

---

## Lancement

### Mode Web (développement)

```bash
npm run dev
```

Serveur accessible sur `http://localhost:5000` (ou le port configuré dans `VITE_SERVER_PORT`).

> **Note** : Le backend Express intègre Vite en middleware. Utilisez **UNIQUEMENT** `npm run dev`, pas `vite dev` manuellement.

### Mode Desktop (Electron)

```bash
# Avec DevTools
npm run desktop:debug

# Sans DevTools
npm run desktop
```

### Mode Production

```bash
# Build complet (frontend + backend)
npm run build

# Démarrer le serveur de production
npm start
```

### Build Installateur Windows

```bash
# Packager pour Windows (dossier portable)
npm run pack:win

# Générer l'installateur NSIS
npm run dist:win
```

> Sortie : Les fichiers sont générés dans `release/`.

---

## Architecture

```
Jarvis-OS/
├── assets/                    # Images, icônes, splash screen
├── electron/                  # Process principal Electron (main, preload, splash)
├── server/                    # Backend Express + WebSocket
│   ├── agents/                # Orchestrateur multi-agents (AgentOrchestrator, AutonomousAgent)
│   ├── autonomy/              # Boucle autonome supervisée
│   ├── knowledge/             # Indexation, graphe, recherche sémantique
│   │   ├── KnowledgeGraph.ts
│   │   ├── ProjectIndexer.ts
│   │   └── ProjectMemory.ts
│   ├── mcp/                   # Bridge MCP (stdio/SSE)
│   ├── mission/               # Planificateur de missions autonomes
│   ├── notebooks/             # Moteur RAG (11 modules)
│   │   ├── NotebookManager.ts
│   │   ├── SourceIngester.ts
│   │   ├── EmbeddingStore.ts
│   │   ├── RAGEngine.ts
│   │   ├── GroundedChat.ts
│   │   ├── ContentGenerator.ts
│   │   ├── BackupService.ts
│   │   ├── ProcessingQueue.ts
│   │   └── ResponseCache.ts
│   ├── prompts/               # Instructions système (SystemPromptBuilder)
│   ├── routes/                # 32 fichiers de routes REST
│   ├── runtime/               # ToolRegistry, AgentRuntime, StateMachine
│   ├── skills/                # 22+ skills IA (codebase, git, memory, automation...)
│   │   ├── SkillManager.ts
│   │   ├── codebase.ts
│   │   ├── verify.ts
│   │   └── ...
│   ├── utils/                 # Logger, crypto, sandbox, validation, key pool
│   │   ├── selfRoot.ts       # Périmètre auto-référentiel (CRITICAL)
│   │   ├── checkpoint.ts     # Checkpoints Git automatiques
│   │   ├── confirmationBridge.ts
│   │   ├── serverRestart.ts
│   │   ├── postEditValidator.ts
│   │   └── audit.ts
│   └── workflows/             # Moteur de workflows documentaires
├── src/                       # Frontend React 19
│   ├── components/            # 80+ composants
│   │   ├── ide/               # IDE (Editor, Explorer, Terminal, Git)
│   │   ├── notebooks/         # Notebooks (Chat, Sources, Notes, Canvas, Audio)
│   │   ├── panels/            # Panneaux latéraux (AgentPanel, SandboxPanel)
│   │   └── ui/                # Composants UI réutilisables
│   ├── config/                # Configuration sidebar, thèmes
│   ├── context/               # Providers (Theme, Profile, LiveAPI, ScreenShare)
│   ├── hooks/                 # Custom hooks
│   ├── services/              # Clients HTTP (supabase, api)
│   ├── types/                 # Types centralisés
│   └── views/                 # 10 vues (IDE, Notebooks, Memories, Settings...)
├── server-bootstrap.ts        # Point d'entrée serveur (env, crypto, validation)
├── server.ts                  # Serveur Express + WebSocket + Gemini Live
├── SELF_IDE.md                # Documentation du système auto-référentiel
├── index.html                 # Shell HTML Vite
├── package.json               # Scripts, dépendances
└── vite.config.ts             # Configuration Vite + plugins
```

> Voir [ARCHITECTURE.md](docs-new/ARCHITECTURE.md) pour une documentation détaillée avec diagrammes.

---

## API Backend

32 groupes de routes REST exposées sous `/api/` :

| Route | Description |
|-------|-------------|
| `/api/agents` | Orchestration multi-agents |
| `/api/automation` | Tâches planifiées & automatisation |
| `/api/browser` | Intégration navigateur |
| `/api/conversations` | Sessions de chat |
| `/api/custom-agents` | Agents personnalisés (Agent Builder) |
| `/api/custom-skills` | Skills créées par l'utilisateur |
| `/api/documents` | Gestion et analyse documentaire |
| `/api/generate-agent` | Génération dynamique d'agents |
| `/api/git` | Opérations Git (status, commit, branches) |
| `/api/github` | Intégration GitHub (repos, issues, PRs) |
| `/api/health` | Monitoring & santé système |
| `/api/ide` | Opérations IDE (fichiers, terminal) |
| `/api/impact` | Analyse d'impact avant modification |
| `/api/knowledge` | Base de connaissances, indexation |
| `/api/lists` | Listes et to-do |
| `/api/mcp` | Gestion des serveurs MCP |
| `/api/memories` | Mémoire long terme |
| `/api/notebooks` | Notebooks RAG (sources, chat, génération, audio, threads, notes) |
| `/api/openrouter` | Configuration OpenRouter |
| `/api/profile` | Profil utilisateur, préférences IA |
| `/api/safeguards` | Garde-fous de sécurité |
| `/api/sandbox` | Environnement sandbox isolé |
| `/api/self-root` | Gestion du self-root |
| `/api/skills` | Registry des outils IA |
| `/api/summarize-context` | Optimisation contexte LLM |
| `/api/tokens-optimization` | Gestion des tokens |
| `/api/tts` | Synthèse vocale (Text-to-Speech) |
| `/api/understanding` | Moteur de compréhension |
| `/api/upload-document` | Upload et analyse de documents |
| `/api/workflows` | Moteur de workflows |
| `/api/workspace` | Gestion du workspace |

> Voir [API_DOCS.md](docs-new/API_DOCS.md) pour la documentation complète de chaque endpoint.

> **Note** : Les skills `codebase`, `verify` et `system` sont chargées au démarrage (critical skills) et disponibles immédiatement sans `request_tools`.

---

## Skills & Outils IA

L'IA dispose de **22+ skills** regroupées par domaine, toutes conçues pour fonctionner dans le périmètre auto-référentiel :

| Skill | Outils principaux |
|-------|------------------|
| **codebase** | `read_project_file`, `read_file_outline`, `search_in_files`, `list_project_files`, `write_project_file` (+ append), `modify_project_file` (+ fuzzy match), `patch_project_file`, `apply_patch` (+ tolérance whitespace), `rename_project_file`, `delete_project_file`, `delete_project_folder`, `create_project_directory` |
| **verify** | `verify_file` (lint + typecheck + sécurité), `verify_typecheck`, `verify_syntax`, `verify_lint`, `verify_security`, `verify_full` |
| **system** | `run_project_command` (npm/npx/node), `system_execute_command`, `system_info`, `system_notify`, `system_open` |
| **git** | Status, commit, push, branches, diff, log |
| **github** | Issues, PRs, repos, review, comments |
| **automation** | Tâches planifiées, navigation web (Puppeteer) |
| **browser** | `browser_navigate`, `browser_search`, `browser_open`, `browser_read_content` (lecture page + sélecteur CSS) |
| **knowledge** | Indexation, recherche sémantique, graphe de dépendances, analyse d'impact |
| **documentKnowledge** | Connaissance documentaire spécialisée |
| **documentLinker** | Liaisons et analyse croisée entre documents |
| **memory** | Stockage/récupération de mémoires persistantes (Supabase + embeddings) |
| **mission** | Planification et exécution de missions autonomes |
| **agents** | Délégation à des agents spécialisés (coder, test, docs, refactor, security, review, architect) |
| **reasoning** | Chain-of-thought, décomposition de problèmes (`reasoning_think`) |
| **richDocument** | `create_rich_document` — tableaux, graphiques, KPI, listes interactifs |
| **workflow** | Exécution de pipelines documentaires |
| **time** | Heure, date, timestamps |
| **weather** | Informations météo |
| **guidelines** | Conventions de code, style guides |
| **history** | Historique des sessions et conversations |
| **list** | Gestion de listes et to-do |
| **project** | Scaffold de nouveaux projets (React, Next, Vite, etc.) |
| **aiStudioDirectives** | Directives techniques pour la génération IA Studio |
| **customSkills** | Skills définies par l'utilisateur |

---

## Sécurité

Jarvis OS implémente une **sécurité multi-couches** adaptée à son modèle auto-référentiel :

### Authentification & Contrôle d'Accès
- **Jeton secret** configuré via `JARVIS_API_TOKEN` dans `.env`
- Transmis via en-tête `x-jarvis-token` (REST) ou cookie/query string (WebSockets)
- Avertissement visuel au démarrage si aucun jeton n'est configuré
- Écoute par défaut restreinte à `127.0.0.1` (`JARVIS_LISTEN_HOST=0.0.0.0` requiert obligatoirement un token)

### Chiffrement au Repos (AES-256-GCM)
- Chiffrement authentifié avec tag d'intégrité (GCM) pour les clés d'API sensibles
- Dérivation de clé machine-bound via `JARVIS_MASTER_KEY` + hardware seed
- Rétrocompatibilité transparente avec le format historique AES-256-CBC

### Sandbox Isolé
- Modifications et créations de fichiers isolées dans `.jarvis/sandbox/`
- Validation statique TypeScript avant synchronisation vers le workspace principal
- Checkpoints Git automatiques avant toute écriture

### Rate Limiting Multi-Couche
- Global strict sur les écritures et endpoints d'authentification
- Polling relaxé pour l'interface utilisateur
- Limiteur dédié sur le chat et l'indexation vectorielle des notebooks
- Plafond de **30 écritures de fichiers/minute**

### Garde-fous Fichiers Critiques
- Confirmation interactive requise pour toute écriture touchant des fichiers du cœur système
- Liste des fichiers critiques : `server.ts`, `server/security.ts`, `server/utils/selfRoot.ts`, `electron/main.cjs`, `electron/preload.cjs`, `.env`, `.env.local`, `.gemini-keys.json`
- Fichiers totalement interdits en écriture : `.git/config`, `.git/HEAD`, `node_modules`

### Isolation d'Exécution Shell
- Whitelist stricte pour `run_project_command` : `npm`, `npx`, `node` uniquement
- Blocage des caractères shell d'échappement
- Confirmation interactive sur les opérations dans `node_modules`

### Audit Trail & Journalisation
- Enregistrement structuré de chaque opération de modification/suppression avec diff résumé
- Journal NDJSON enrichi dans `.jarvis-audit.log`
- **Garde-fous Auto-Modification** : Checkpoints, validation build, confirmation critique, MCP sandboxing

---

## Contribution

Les contributions sont les bienvenues !

### Bonnes pratiques

- **TypeScript strict** : Toujours activer `strict: true` dans `tsconfig.json`
- **Commits conventionnels** : Utiliser les préfixes `feat:`, `fix:`, `refactor:`, `docs:`, `test:`
- **Tests** : Ajouter des tests unitaires pour les nouvelles fonctionnalités
- **Documentation** : Documenter les nouveaux endpoints et skills

### Commandes utiles

```bash
# Lancer les tests
npm test

# Lancer le linter
npm run lint

# Build complet
npm run build

# Vérifier la typage
npx tsc --noEmit
```

### Processus de contribution

1. Forker le projet
2. Créer une branche pour votre fonctionnalité (`git checkout -b feat/ma-fonctionnalite`)
3. Commiter vos changements (`git commit -m 'feat: ajouter ma fonctionnalite'`)
4. Pousser vers la branche (`git push origin feat/ma-fonctionnalite`)
5. Ouvrir une Pull Request

> Voir [CONTRIBUTING.md](docs-new/CONTRIBUTING.md) pour le guide complet.

---

## Licence

Distribué sous licence **MIT**. Voir [LICENSE](LICENSE) pour plus de détails.

---

<p align="center">
  <sub>Construit avec passion et beaucoup de Gemini par l'équipe Jarvis OS</sub>
</p>
