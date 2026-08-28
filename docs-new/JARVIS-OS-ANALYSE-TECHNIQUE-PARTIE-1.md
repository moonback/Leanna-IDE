# 🔍 **ANALYSE TECHNIQUE COMPLÈTE - JARVIS OS**
## *Partie 1 : Vue Générale et Architecture Technique*

---

## 📌 **Table des Matières**

### Partie 1
1. [Vue générale de l'application](#1-vue-générale-de-lapplication)
2. [Architecture technique détaillée](#2-architecture-technique-détaillée)

### Partie 2 (fichier séparé)
3. Analyse fonctionnalité par fonctionnalité
4. Analyse écran par écran (UI/UX)
5. Analyse des composants
6. Analyse de la logique métier

### Partie 3 (fichier séparé)
7. Analyse de la base de données
8. Analyse des API
9. Sécurité
10. Performance
11. Design System
12. Flux utilisateur
13. Diagramme de fonctionnement

---

## 1. **Vue générale de l'application**

### 🎯 Type d'application
**Application Desktop Multiplateforme** (Windows, macOS, Linux via Electron) avec interface web intégrée.

- **Catégorie** : IDE Intelligent + Système d'Exploitation IA + Plateforme Multi-Agents
- **Modèle** : Application monolithique avec architecture modulaire
- **Mode d'exécution** : Electron (desktop) + Express (backend HTTP/WebSocket) + React (frontend)

### 🎯 Objectif de l'application

Jarvis OS est un **environnement de développement IA tout-en-un** conçu comme un système d'exploitation desktop intelligent qui combine :

1. **IDE Complet** - Éditeur de code avancé avec gestion de fichiers, recherche, navigation
2. **Assistant IA Multimodal** - Interaction par voix, webcam, partage d'écran, chat textuel
3. **Système Multi-Agents** - 14 agents autonomes spécialisés dans le développement logiciel et la rédaction
4. **Notebooks RAG** - Système concurrent de NotebookLM avec ingestion de sources, chat groundé, génération de contenu
5. **Moteur de Connaissances** - Compréhension profonde du projet via indexation, graphe de relations, mémoire projet
6. **Automatisation & Workflows** - Planification de tâches, missions autonomes, orchestration
7. **Passerelle MCP** - Connexion à des outils externes via Model Context Protocol
8. **Intégration GitHub** - Gestion de dépôts, issues, pull requests

### 🛠️ Stack technologique complète

#### Frontend
| Technologie | Version | Usage |
|------------|---------|-------|
| React | 19.0.1 | Framework principal |
| React Router | 7.18.1 | Routing SPA |
| TypeScript | 5.0.0+ | Langage principal |
| Monaco Editor | 0.53.0 | Éditeur de code |
| @monaco-editor/react | 4.7.0 | Wrapper React pour Monaco |
| Tailwind CSS | 4.1.14 | Styling utility-first |
| @tailwindcss/vite | 4.1.14 | Plugin Tailwind pour Vite |
| Motion | 12.23.24 | Animations |
| Lucide React | 0.546.0 | Icônes |
| Recharts | 3.10.1 | Graphiques |
| react-window | 2.3.0 | Virtualisation de listes |
| react-hotkeys-hook | 4.6.1 | Gestion des raccourcis clavier |
| clsx | 2.1.1 | Construction de classes CSS |
| cva | 1.0.0-beta.2 | Variants de composants |

#### Backend
| Technologie | Version | Usage |
|------------|---------|-------|
| Node.js | 22.12.0+ | Runtime |
| Express | 4.21.2 | Serveur HTTP |
| WebSocket (ws) | 8.21.0 | Communication temps réel |
| multer | 2.2.0 | Upload de fichiers |
| compression | 1.8.1 | Compression HTTP |
| express-rate-limit | 8.6.0 | Rate limiting |

#### IA / ML
| Technologie | Version | Usage |
|------------|---------|-------|
| @google/genai | 2.4.0 | SDK Google Gemini |
| pdf-parse | 2.4.5 | Extraction texte PDF |
| puppeteer | 25.3.0 | Navigation web automatisée |

#### Desktop
| Technologie | Version | Usage |
|------------|---------|-------|
| Electron | 43.1.0 | Framework desktop |
| electron-builder | 26.15.3 | Build & packaging |

#### Bundling & Tooling
| Technologie | Version | Usage |
|------------|---------|-------|
| Vite | 6.2.3 | Bundler frontend |
| esbuild | 0.25.0 | Bundler backend |
| tsx | 4.23.1 | Execution TypeScript |
| concurrently | 10.0.3 | Lancement parallèle |
| autoprefixer | 10.4.21 | Préfixes CSS |
| vite-plugin-monaco-editor | 1.1.0 | Plugin Monaco pour Vite |

#### Persistance
| Technologie | Version | Usage |
|------------|---------|-------|
| @supabase/supabase-js | 2.110.2 | Client Supabase |
| Système de fichiers JSON | - | Stockage local |

#### Autres
| Technologie | Version | Usage |
|------------|---------|-------|
| marked | 15.0.12 | Parsing Markdown |
| mermaid | 11.4.1 | Diagrammes |
| react-window-tree | 1.0.4 | Virtualisation d'arborescence |

### 🏗️ Frameworks utilisés

1. **Express.js** - Framework backend pour la gestion des routes HTTP
2. **React 19** - Framework frontend avec hooks et concurrent features
3. **Electron** - Framework pour applications desktop cross-platform
4. **Monaco Editor** - Éditeur de code (même moteur que VS Code)
5. **Tailwind CSS 4** - Framework CSS utility-first
6. **Google GenAI SDK** - Intégration avec les modèles Gemini
7. **Supabase** - Backend as a Service (optionnel pour la persistance)

### 🏛️ Architecture générale

```
Jarvis OS
├── Electron (Process Main)
│   ├── main.cjs - Point d'entrée Electron
│   ├── preload.cjs - Bridge entre main et renderer
│   └── splash.html - Écran de démarrage
│
├── Backend (Express + WebSocket)
│   ├── server.ts - Point d'entrée serveur
│   ├── server-bootstrap.ts - Initialisation précoce
│   │
│   ├── agents/ - Système multi-agents (14 files)
│   │   ├── AgentOrchestrator.ts - Orchestration des tâches
│   │   ├── AgentExecutor.ts - Exécution des tâches agents
│   │   ├── AgentRegistry.ts - Registre des agents autonomes
│   │   ├── AgentMessageBus.ts - Communication inter-agents
│   │   ├── AgentPersistence.ts - Persistance des tâches
│   │   ├── AgentRepairLoop.ts - Auto-guérison
│   │   ├── AgentValidation.ts - Validation des agents
│   │   ├── AutonomousAgent.ts - Agents autonomes
│   │   ├── AutonomousLoop.ts - Boucle autonome
│   │   ├── TaskScheduler.ts - Planification des tâches
│   │   ├── ProgressNotifier.ts - Notifications de progression
│   │   ├── roles.ts - Définitions des rôles agents
│   │   └── types.ts - Types agents
│   │
│   ├── skills/ - Compétences/Outils IA (22+ files)
│   │   ├── SkillManager.ts - Gestionnaire central
│   │   ├── base.ts - Classe de base des skills
│   │   ├── codebase.ts - Manipulation de fichiers
│   │   ├── verify.ts - Vérification et validation
│   │   ├── system.ts - Commandes système
│   │   ├── git.ts - Intégration Git
│   │   ├── github.ts - Intégration GitHub
│   │   ├── automation.ts - Automatisation
│   │   ├── browser.ts - Navigation web
│   │   ├── knowledge.ts - Connaissances projet
│   │   ├── memory.ts - Mémoire persistante
│   │   ├── mission.ts - Missions autonomes
│   │   ├── agents.ts - Délégation aux agents
│   │   ├── reasoning.ts - Raisonnement
│   │   ├── richDocument.ts - Documents riches
│   │   ├── documentKnowledge.ts - Connaissance documentaire
│   │   ├── documentLinker.ts - Liaisons entre documents
│   │   ├── workflow.ts - Workflows
│   │   ├── time.ts - Gestion du temps
│   │   ├── weather.ts - Informations météo
│   │   ├── guidelines.ts - Conventions de code
│   │   ├── history.ts - Historique
│   │   ├── list.ts - Gestion de listes
│   │   ├── project.ts - Création de projets
│   │   ├── aiStudioDirectives.ts - Directives AI Studio
│   │   └── customSkills.ts - Skills personnalisées
│   │
│   ├── knowledge/ - Moteur de connaissances (12+ files)
│   │   ├── KnowledgeGraph.ts - Graphe de connaissances
│   │   ├── ProjectIndexer.ts - Indexation du projet
│   │   ├── ProjectMemory.ts - Mémoire projet
│   │   ├── DependencyGraph.ts - Graphe de dépendances
│   │   ├── SemanticSearch.ts - Recherche sémantique
│   │   ├── ImpactAnalyzer.ts - Analyse d'impact
│   │   ├── PlanningEngine.ts - Planification
│   │   ├── UnderstandingEngine.ts - Compréhension du projet
│   │   ├── LearningEngine.ts - Apprentissage automatique
│   │   ├── ReasoningPipeline.ts - Pipeline de raisonnement
│   │   ├── RelationExtractor.ts - Extraction de relations
│   │   ├── DocumentExtractor.ts - Extraction de documents
│   │   ├── DocumentStore.ts - Stockage de documents
│   │   ├── FileWatcher.ts - Surveillance des fichiers
│   │   └── document-system/ - Système documentaire (5 files)
│   │
│   ├── notebooks/ - Notebooks RAG (11 files)
│   │   ├── NotebookManager.ts - Gestion des notebooks
│   │   ├── EmbeddingStore.ts - Stockage des embeddings
│   │   ├── RAGEngine.ts - Moteur RAG
│   │   ├── GroundedChat.ts - Chat groundé
│   │   ├── ContentGenerator.ts - Génération de contenu
│   │   ├── SourceIngester.ts - Ingestion de sources
│   │   ├── BackupService.ts - Sauvegarde automatique
│   │   ├── ProcessingQueue.ts - File d'attente
│   │   ├── ResponseCache.ts - Cache des réponses
│   │   └── types.ts - Types notebooks
│   │
│   ├── runtime/ - Nouveau runtime V2 (10+ files)
│   │   ├── AgentRuntime.ts - Runtime des agents
│   │   ├── AgentLoader.ts - Chargeur d'agents
│   │   ├── EventBus.ts - Bus d'événements
│   │   ├── StateMachine.ts - Machine d'état
│   │   ├── ToolRegistry.ts - Registre des outils
│   │   ├── Memory.ts - Mémoire contextuelle
│   │   ├── WorkflowEngine.ts - Moteur de workflows
│   │   ├── PromptRegistry.ts - Registre des prompts
│   │   ├── Observability.ts - Observabilité
│   │   ├── bootstrap.ts - Initialisation
│   │   └── agents/ - Agents runtime (8 files)
│   │
│   ├── routes/ - Routes API (32+ files)
│   │   ├── health.ts - Santé système
│   │   ├── ide.ts - Opérations IDE
│   │   ├── agents.ts - Agents
│   │   ├── notebooks/ - Routes notebooks (10+ files)
│   │   ├── knowledge/ - Routes connaissances (4 files)
│   │   ├── skills.ts - Registry des skills
│   │   ├── workflows.ts - Workflows
│   │   ├── automation.ts - Automatisation
│   │   ├── github.ts - GitHub
│   │   ├── mcp.ts - MCP
│   │   ├── documents.ts - Documents
│   │   ├── export.ts - Export
│   │   ├── profile.ts - Profil utilisateur
│   │   └── ... (20+ autres)
│   │
│   ├── utils/ - Utilitaires (15+ files)
│   │   ├── sandbox.ts - Environnement sandbox
│   │   ├── selfRoot.ts - Gestion du root projet
│   │   ├── geminiKeyPool.ts - Pool de clés API
│   │   ├── textGeneration.ts - Génération de texte
│   │   ├── tokenOptimizer.ts - Optimisation tokens
│   │   ├── promptInjectionGuard.ts - Protection injection
│   │   ├── safeguards.ts - Garde-fous
│   │   ├── logger.ts - Journalisation
│   │   ├── crypto.ts - Chiffrement
│   │   ├── checkpoint.ts - Points de sauvegarde
│   │   └── pathUtils.ts - Utilitaires chemins
│   │
│   ├── config/ - Configuration
│   │   └── rateLimits.ts - Limitation de taux
│   │
│   ├── prompts/ - Prompts système
│   │   ├── systemInstruction.ts - Instructions système
│   │   └── promptConfig.ts - Configuration prompts
│   │
│   ├── mcp/ - Passerelle MCP (4 files)
│   │   ├── McpBridge.ts - Bridge principal
│   │   ├── McpClient.ts - Client MCP
│   │   └── mcpConfig.ts - Configuration
│   │
│   ├── mission/ - Missions (5 files)
│   │   ├── Mission.ts - Définition mission
│   │   ├── Executor.ts - Exécuteur
│   │   ├── Planner.ts - Planificateur
│   │   ├── Reflection.ts - Réflexion
│   │   └── SkillScorer.ts - Score des skills
│   │
│   ├── autonomy/ - Autonomie (2 files)
│   │   ├── Supervisor.ts - Superviseur
│   │   └── SmartSkills.ts - Skills intelligentes
│   │
│   ├── export/ - Export (3 files)
│   │   ├── pdfExporter.ts - Export PDF
│   │   ├── docxExporter.ts - Export DOCX
│   │   └── htmlExporter.ts - Export HTML
│   │
│   ├── audit.ts - Audit système
│   └── lifecycle.ts - Cycle de vie
│
└── Frontend (React + Vite)
    ├── src/
    │   ├── main.tsx - Point d'entrée
    │   │
    │   ├── components/ - 60+ composants
    │   │   ├── ide/ - Composants IDE (25+)
    │   │   │   ├── FileExplorer.tsx - Explorateur de fichiers
    │   │   │   ├── EditorTabs.tsx - Onglets éditeur
    │   │   │   ├── ChatPanel.tsx - Panneau de chat
    │   │   │   ├── StatusBar.tsx - Barre de statut
    │   │   │   ├── CommandPalette.tsx - Palette de commandes
    │   │   │   ├── GlobalSearch.tsx - Recherche globale
    │   │   │   ├── ContextMenu.tsx - Menu contextuel
    │   │   │   ├── DiffViewer.tsx - Visualiseur de diffs
    │   │   │   ├── ImagePreview.tsx - Aperçu images
    │   │   │   ├── MarkdownPreview.tsx - Aperçu Markdown
    │   │   │   └── ... (15+ autres)
    │   │   │
    │   │   ├── notebooks/ - Composants notebooks (11)
    │   │   │   ├── NotebookList.tsx - Liste des notebooks
    │   │   │   ├── NotebookDetail.tsx - Détail notebook
    │   │   │   ├── NotebookChat.tsx - Chat notebook
    │   │   │   ├── SourcePanel.tsx - Panneau sources
    │   │   │   ├── NotesPanel.tsx - Panneau notes
    │   │   │   ├── NotesCanvas.tsx - Canvas de notes
    │   │   │   └── ... (5+ autres)
    │   │   │
    │   │   ├── panels/ - Panneaux (15+)
    │   │   │   ├── AgentPanel.tsx - Panneau agents
    │   │   │   ├── AgentFleetPanel.tsx - Flotte d'agents
    │   │   │   ├── AgentBuilderPanel.tsx - Constructeur d'agents
    │   │   │   ├── MissionPanel.tsx - Panneau missions
    │   │   │   ├── BrowserPanel.tsx - Navigateur web
    │   │   │   ├── VisionPanel.tsx - Vision IA
    │   │   │   ├── DocumentPanel.tsx - Documents
    │   │   │   ├── SandboxPanel.tsx - Sandbox
    │   │   │   └── ... (7+ autres)
    │   │   │
    │   │   ├── settings/ - Paramètres (12+)
    │   │   │   ├── AiSection.tsx - IA
    │   │   │   ├── ModelSection.tsx - Modèles
    │   │   │   ├── TokensSection.tsx - Tokens
    │   │   │   ├── ProfileSection.tsx - Profil
    │   │   │   └── ... (8+ autres)
    │   │   │
    │   │   ├── sidebar/ - Sidebar
    │   │   │   ├── SidebarItem.tsx
    │   │   │   ├── SidebarSection.tsx
    │   │   │   └── FlyoutMenu.tsx
    │   │   │
    │   │   ├── ui/ - UI Primitives
    │   │   │   ├── Toast.tsx
    │   │   │   ├── Panel.tsx
    │   │   │   ├── Skeleton.tsx
    │   │   │   ├── Toggle.tsx
    │   │   │   ├── Tooltip.tsx
    │   │   │   └── ...
    │   │   │
    │   │   ├── FloatingOrb.tsx - Orb flottant
    │   │   ├── UnifiedSidebar.tsx - Sidebar unifié
    │   │   ├── ThemeToggle.tsx - Toggle thème
    │   │   ├── TokenCounter.tsx - Compteur tokens
    │   │   └── ... (10+ autres)
    │   │
    │   ├── views/ - Vues principales (10)
    │   │   ├── IdeView.tsx - Vue IDE
    │   │   ├── NotebooksView.tsx - Vue Notebooks
    │   │   ├── SettingsView.tsx - Vue Paramètres
    │   │   ├── DocumentsView.tsx - Vue Documents
    │   │   ├── GitHubView.tsx - Vue GitHub
    │   │   ├── AutomationView.tsx - Vue Automatisation
    │   │   ├── HistoryView.tsx - Vue Historique
    │   │   ├── MemoriesView.tsx - Vue Mémoires
    │   │   ├── ListsView.tsx - Vue Listes
    │   │   └── HelpView.tsx - Vue Aide
    │   │
    │   ├── context/ - Contextes React
    │   │   ├── LiveAPIContext.tsx - API Live
    │   │   ├── ThemeContext.tsx - Thème
    │   │   ├── UserProfileContext.tsx - Profil utilisateur
    │   │   └── ScreenShareContext.tsx - Partage écran
    │   │
    │   ├── hooks/ - Custom Hooks (15+)
    │   │   ├── useLiveAPI.ts - API Live
    │   │   ├── useFileSystem.ts - Système de fichiers
    │   │   ├── useHotkeys.ts - Raccourcis clavier
    │   │   ├── useIdeSettings.ts - Paramètres IDE
    │   │   ├── useChatPersistence.ts - Persistance chat
    │   │   ├── useToken.ts - Gestion tokens
    │   │   └── ... (9+ autres)
    │   │
    │   ├── services/ - Services
    │   │   ├── ideApi.ts - API IDE
    │   │   ├── sandboxApi.ts - API Sandbox
    │   │   ├── supabase.ts - Client Supabase
    │   │   └── realtimeCache.ts - Cache temps réel
    │   │
    │   ├── stores/ - Stores (Zustand)
    │   │   ├── agentActivityStore.ts - Activité agents
    │   │   └── customAgentStore.ts - Agents personnalisés
    │   │
    │   ├── types/ - Types TypeScript
    │   │   ├── ide.ts - Types IDE
    │   │   ├── notebook.ts - Types notebooks
    │   │   └── global.d.ts - Types globaux
    │   │
    │   ├── utils/ - Utilitaires frontend
    │   │   ├── audit.ts
    │   │   ├── fileUtils.ts
    │   │   ├── supabaseClient.ts
    │   │   └── templateVariables.ts
    │   │
    │   └── index.css - Styles globaux
    │
    ├── public/ - Assets statiques
    ├── index.html - Page principale
    └── vite.config.ts - Configuration Vite
```

### 📁 Organisation des dossiers

```
Jarvis-OS/
├── .aionrs/ - Configuration Aion
├── .github/ - Configuration GitHub
├── .husky/ - Git Hooks
├── .jarvis/ - Données persistance (créé à l'exécution)
│   ├── notebooks/ - Données notebooks
│   │   ├── backups/ - Sauvegardes
│   │   ├── embeddings/ - Embeddings
│   │   └── sources/ - Sources
│   ├── ProjectMemory.json - Mémoire projet
│   ├── ProjectKnowledge.json - Connaissances projet
│   ├── sandbox/ - Environnement sandbox
│   └── documents.json - Documents
│
├── .vscode/ - Configuration VS Code
├── assets/ - Assets (images, icônes)
├── dist/ - Build backend (généré)
├── electron/ - Code Electron
│   ├── main.cjs - Process principal
│   ├── preload.cjs - Preload script
│   └── splash.html - Écran de démarrage
│
├── node_modules/ - Dépendances
├── release/ - Build Electron (généré)
├── scripts/ - Scripts utilitaires
│   ├── lint.cjs
│   ├── start-desktop.cjs
│   └── ...
│
├── server/ - Backend (TypeScript)
│   ├── agents/ - Système multi-agents (14 files)
│   ├── autonomy/ - Autonomie (2 files)
│   ├── config/ - Configuration (1 file)
│   ├── export/ - Export (3 files)
│   ├── knowledge/ - Moteur de connaissances (13 files)
│   ├── live/ - WebSocket Live (1 file)
│   ├── mcp/ - Passerelle MCP (4 files)
│   ├── mission/ - Missions (5 files)
│   ├── notebooks/ - Notebooks RAG (11 files)
│   ├── prompts/ - Prompts système (2 files)
│   ├── routes/ - Routes API (32+ files)
│   ├── runtime/ - Runtime V2 (15+ files)
│   ├── skills/ - Compétences IA (22+ files)
│   ├── utils/ - Utilitaires (15+ files)
│   ├── audit.ts - Audit système
│   ├── audit.test.ts - Tests audit
│   ├── lifecycle.ts - Cycle de vie
│   ├── security.ts - Sécurité
│   ├── security.test.ts - Tests sécurité
│   ├── server.ts - Serveur Express (POINT D'ENTRÉE)
│   └── server-bootstrap.ts - Initialisation
│
├── Skills/ - Skills personnalisées utilisateur (créé à l'exécution)
├── src/ - Frontend (React + TypeScript)
│   ├── components/ - Composants React (60+)
│   ├── config/ - Configuration
│   ├── context/ - Contextes
│   ├── hooks/ - Custom Hooks
│   ├── services/ - Services
│   ├── stores/ - Stores
│   ├── types/ - Types
│   ├── utils/ - Utilitaires
│   ├── views/ - Vues principales
│   ├── main.tsx - Point d'entrée
│   └── vite-env.d.ts - Déclarations Vite
│
├── supabase/ - Configuration Supabase (optionnel)
├── tests/ - Tests
├── docs/ - Documentation
├── .env - Variables d'environnement
├── .env.example - Template .env
├── .env.local - Variables locales
├── .gemini-keys.json - Clés API Gemini (chiffré)
├── .gitignore
├── index.html
├── metadata.json
├── package.json
├── package-lock.json
├── README.md
├── ROADMAP.md
├── SELF_IDE.md
├── server-bootstrap.ts - Initialisation backend
├── server.ts - Serveur (dupliqué dans server/ ?)
├── start.bat
├── task.md
├── tsconfig.json
└── vite.config.ts
```

**Note** : Il y a une apparente duplication entre `server.ts` à la racine et `server/server.ts`. Le fichier racine semble être le point d'entrée principal.

### 🎯 Modules principaux

#### Backend (server/)

1. **Système Multi-Agents** (`agents/`)
   - Orchestration, exécution, persistance des tâches agents
   - 14 agents spécialisés (coder, reviewer, debugger, architect, security, writer, etc.)
   - Communication inter-agents via bus de messages
   - Auto-guérison et récupération après crash

2. **Compétences IA** (`skills/`)
   - 22+ compétences regroupées par domaine
   - Manipulation de fichiers, validation, système, Git, GitHub
   - Connaissances, mémoire, automatisation, navigation web
   - Raisonnement, documents riches, workflows
   - Classification automatique des outils via mots-clés

3. **Moteur de Connaissances** (`knowledge/`)
   - Indexation automatique du workspace
   - Graphe de connaissances et dépendances
   - Recherche sémantique locale (sans API externe)
   - Mémoire projet et apprentissage automatique
   - Analyse d'impact avant modification

4. **Notebooks RAG** (`notebooks/`)
   - Gestion complète des notebooks
   - Ingestion de sources multiples (PDF, DOCX, MD, HTML, images, CSV, JSON, YAML)
   - Chat groundé avec citations
   - Génération de contenu (10+ types : résumés, FAQ, guides, etc.)
   - Audio overview (podcast IA)
   - Notes avancées avec canvas 2D

5. **Runtime V2** (`runtime/`)
   - **Nouveau cœur architectural** pour la version 2
   - ToolRegistry, AgentRuntime, StateMachine
   - WorkflowEngine, PromptRegistry
   - EventBus pour la communication asynchrone
   - Observability pour les métriques
   - Compatibilité avec l'ancien système (SkillManager)

6. **Routes API** (`routes/`)
   - 32+ groupes de routes REST
   - Gestion de l'IDE, agents, notebooks, connaissances
   - Export, import, automatisation, GitHub, MCP, etc.
   - **Modularisation** : Chaque fonctionnalité a son propre routeur

7. **Passerelle MCP** (`mcp/`)
   - Connexion à des serveurs MCP externes
   - Support de stdio et SSE
   - Invocation d'outils externes depuis l'IA

8. **Missions** (`mission/`)
   - Planification et exécution de missions autonomes
   - Score des skills et sélection optimale
   - Réflexion et apprentissage

9. **Autonomie** (`autonomy/`)
   - Supervision des agents autonomes
   - Skills intelligentes avec prise de décision

#### Frontend (src/)

1. **Vues Principales** (`views/`)
   - 10 vues : IDE, Notebooks, Settings, Documents, GitHub, Automation, History, Memories, Lists, Help
   - **Lazy loading** : Toutes les vues chargées dynamiquement

2. **Composants IDE** (`components/ide/`)
   - 25+ composants : Explorateur, éditeur, onglets, chat, barre de statut
   - CommandPalette, GlobalSearch, ContextMenu, DiffViewer
   - ImagePreview, MarkdownPreview, RichDocumentViewer

3. **Composants Notebooks** (`components/notebooks/`)
   - 11 composants : Liste, détail, chat, sources, notes, canvas
   - AudioOverviewPanel, GeneratePanel, HistoryPanel
   - MermaidDiagram, SlidePreviewModal, SourceViewer

4. **Panneaux** (`components/panels/`)
   - 15+ panneaux : Agents, Missions, Navigateur, Vision, Documents, Sandbox, Workflows, MCP, etc.
   - Tous les panneaux sont **réductibles**, **dockables**, et **détachables**

5. **Paramètres** (`components/settings/`)
   - 12+ sections : Profil, Apparence, IA, Modèles, Tokens, Sécurité, Données, Santé, Comportement, Prompts, OpenRouter, Audit

6. **Contextes et Hooks** (`context/`, `hooks/`)
   - LiveAPIContext, ThemeContext, UserProfileContext, ScreenShareContext
   - useLiveAPI, useFileSystem, useHotkeys, useIdeSettings, useChatPersistence, useToken, etc.

7. **Services** (`services/`)
   - ideApi, sandboxApi, supabase, realtimeCache

8. **Stores** (`stores/`)
   - agentActivityStore (Zustand), customAgentStore (Zustand)

---

## 2. **Architecture technique détaillée**

### 🖥️ Frontend

#### Structure React
- **React 19** avec Concurrent Features
- **React Router 7** pour le routing SPA
- **TypeScript** strict partout
- **Vite 6** comme bundler (avec HMR)
- **SPA (Single Page Application)** : Une seule page HTML, tout le reste géré par React Router

#### Gestion d'état

**Hiérarchie des états** :
```
État Global (Application)
├── UserProfileContext - Profil utilisateur
│   ├── theme, accentColor, aiName, aiVoice, etc.
├── LiveAPIContext - Connexion Live API
│   ├── connected, muted, activity, reasoning
├── ScreenShareContext - Partage écran
│   ├── isSharing, sources, frameCount
└── ToastProvider - Notifications
    └── toasts queue

État Global (Zustand)
├── agentActivityStore - Activité des agents
│   ├── activities, clearActivity, addActivity
└── customAgentStore - Agents personnalisés

État Local (useState)
└── État spécifique à chaque composant

Persistance Locale
├── localStorage
│   ├── jarvis_api_token - Token d'authentification
│   ├── jarvis_user_profile - Profil utilisateur
│   └── jarvis_mode - Mode (full/ask)
└── sessionStorage
    └── jarvis-ide-pending-file - Fichier en attente d'ouverture
```

**Pattern de gestion d'état** :
1. **Context API** pour les états globaux partagés
2. **Zustand** pour les états complexes nécessitant des updates fréquents
3. **useState/useReducer** pour les états locaux
4. **LocalStorage** pour la persistance des préférences

#### Routing

**Configuration** :
- **Library** : React Router 7
- **Mode** : BrowserRouter (HTML5 History API)
- **Lazy loading** : Toutes les vues chargées via `React.lazy`

**Routes principales** :
```
/
├── / (→ /ide)
├── /ide - Interface IDE complète
├── /memories - Mémoires long terme
├── /history - Historique des sessions
├── /settings - Paramètres de l'application
├── /lists - Listes et to-do
├── /github - Intégration GitHub
├── /automation - Automatisation et tâches planifiées
├── /documents - Gestion documentaire
├── /notebooks - Notebooks RAG
│   └── #notebook=<id> - Détail d'un notebook
└── /help - Aide et documentation
```

**Navigation** :
- **Hash-based** : Pour les notebooks (`#notebook=<id>`)
- **State-based** : Pour les paramètres et autres vues
- **Programmatic** : Via `useNavigate` hook

#### Communication avec le backend

**Méthodes** :
1. **Fetch API** avec intercepteur global (voir `src/main.tsx` lignes 32-149)
2. **WebSocket** pour la communication temps réel
3. **SSE** (Server-Sent Events) pour le streaming

**Intercepteur Fetch Global** :
- **Circuit breaker** : 12 échecs consécutifs → blocage 8 secondes
- **Deduplication** : Une seule requête GET par URL en vol
- **Injection token** : Ajout automatique de `x-jarvis-token` header
- **Error tracking** : Suivi des erreurs réseau

**Exemple de code** :
```typescript
// Circuit breaker
const CB = {
  failures: 0,
  openUntil: 0,
  THRESHOLD: 12,
  BLOCK_MS: 8000,
  isOpen(): boolean {
    if (Date.now() < CB.openUntil) return true;
    if (CB.failures >= CB.THRESHOLD) {
      CB.failures = 0; // reset
    }
    return false;
  }
};

// Deduplication
const inflight = new Map<string, { promise: Promise<Response> }>();
function dedupKeyFor(input, init): string | null {
  if (init?.method !== 'GET') return null;
  const url = typeof input === 'string' ? input : input.url;
  if (url.startsWith('/api/')) return url;
  return null;
}

// Interception
window.fetch = function (input, init) {
  const rawUrl = typeof input === 'string' ? input : input.url;
  const isApi = rawUrl.startsWith('/api/');
  
  // Circuit breaker
  if (isApi && CB.isOpen()) {
    return Promise.resolve(serviceUnavailable('Trop d\'échecs'));
  }
  
  // Token injection
  if (isApi) {
    const token = localStorage.getItem('jarvis_api_token');
    if (token) {
      const headers = new Headers(init?.headers);
      headers.set('x-jarvis-token', token);
      init = { ...init, headers };
    }
  }
  
  // Deduplication
  const key = dedupKeyFor(input, init);
  if (key) {
    const existing = inflight.get(key);
    if (existing) return existing.promise.then(r => r.clone());
    const promise = _originalFetch(input, init);
    inflight.set(key, { promise });
    return promise.then(r => r.clone());
  }
  
  return _originalFetch(input, init);
};
```

#### Gestion des erreurs frontend

1. **Circuit Breaker** : Protection contre les cascades d'erreurs réseau
   - Seuil : 12 échecs consécutifs
   - Blocage : 8 secondes
   - Auto-recovery : Réduction du compteur après succès

2. **Toast Notifications** : Via `ToastProvider`
   - Position : Haut à droite
   - Durée : 3-5 secondes
   - Types : success, error, warning, info

3. **Error Boundaries** : Non explicitement implémenté (React 19 gère nativement)

4. **Reconnection Logic** : Pour WebSocket
   - Auto-reconnect après déconnexion
   - Heartbeat pour maintenir la connexion

### 🖥️ Backend

#### Serveur Express

**Configuration** :
- **Framework** : Express 4.21.2
- **Port** : 5000 (configurable via `VITE_SERVER_PORT`)
- **Host** : 127.0.0.1 par défaut (sécurité)
- **Mode** : Development (Vite middleware) ou Production (static files)

**Middleware Stack** :
```
Request
  ↓
Rate Limiting (global)
  ↓
Authentication (requireAuth)
  ↓
Compression (gzip)
  ↓
Static Files (production)
  ↓
Vite Middleware (development)
  ↓
Route Handlers
  ↓
Error Handler (global)
  ↓
Response
```

**Détails** :
```typescript
// Dans server.ts
const app = express();
const PORT = Number(process.env.VITE_SERVER_PORT) || 5000;

// Rate limiting
const rateBundle = createRateLimitBundle(rateLimitDeps);
applyGlobalRateLimits(app, rateBundle, rateLimitDeps);

// Authentication
app.use("/api", requireAuth); // Toutes les routes /api/* sauf /api/health

// Compression et fichiers statiques
applyStaticAndCompression(app, { ...rateLimitDeps, getWorkspaceRoot });

// Routes
app.use("/api", healthRouter); // Avant requireAuth
app.use("/api", requireAuth);
app.use("/api/audit", auditRouter);
app.use("/api/automation", automationRouter);
// ... 30+ autres routes

// Global error handler
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const msg = err.message || String(err);
  console.error(`[HTTP ${status}] ${msg}`);
  res.status(status).json({ error: msg, ...debugInfo });
});

// Serveur HTTP
const server = app.listen(PORT, listenHost, () => {
  console.log(`Server running on http://${listenHost}:${PORT}`);
});
```

**Rate Limiting Configuration** (`server/config/rateLimits.ts`) :
- **Global** : Limites de base pour toutes les routes
- **Spécifique** : Limiteurs dédiés pour certaines routes
  - `/api/notebooks/:id/chat` : 30 req/min (chat)
  - `/api/notebooks/:id/embeddings/reindex` : 50 req/5min (embeddings)
  - `/api/notebooks/:id/sources/upload` : 50 req/5min
- **Niveaux** :
  - **Strict** : Authentification, écritures
  - **Modéré** : Lecture, polling
  - **Relaxé** : Health checks, static files

#### WebSocket

**Configuration** :
- **Library** : `ws` 8.21.0
- **Paths** :
  - `/live` - Communication temps réel pour Gemini Live
  - `/sandbox-watch` - Surveillance des fichiers sandbox
- **Authentication** : Via cookie `jarvis_token` ou query string `token`

**Handler** : `server/live/LiveSocketHandler.ts`

**Fonctionnalités** :
1. **Gemini Live** : Communication audio/vidéo/textuelle temps réel
2. **Sandbox Watch** : Notification des changements de fichiers
3. **Broadcast** : Diffusion d'événements aux clients connectés
4. **Session Management** : Gestion des sessions actives

**Code** :
```typescript
// Création des serveurs WebSocket
const wss = new WebSocketServer({ noServer: true });
const sandboxWss = new WebSocketServer({ noServer: true });

// Attachement au serveur HTTP
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url!, `http://${request.headers.host}`);
  const pathname = url.pathname;
  
  // Authentification
  if (pathname === '/live' || pathname === '/sandbox-watch') {
    const token = cookies['jarvis_token'] || url.searchParams.get('token');
    const authResult = authenticateToken(token, apiToken);
    if (!authResult.ok) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
  }
  
  // Routage
  if (pathname === '/live') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else if (pathname === '/sandbox-watch') {
    sandboxWss.handleUpgrade(request, socket, head, (ws) => {
      sandboxWss.emit('connection', ws, request);
    });
  }
});

// Attachement des handlers
attachLiveWebSocket(wss, sandboxWss, {
  skillManager,
  getCurrentProfile,
  getWorkspaceRoot,
  createGeminiAI,
  activeGeminiSessions,
  browserReadPending,
  browserActionPending,
});
```

#### Gestion des agents

**Architecture** :
```
AgentOrchestrator (Façade)
├── TaskScheduler - Planification des tâches
├── AgentExecutor - Exécution des tâches
│   └── SkillHandler - Appel des compétences
├── ProgressNotifier - Notifications de progression
│   └── EventBroadcaster - Diffusion aux clients
└── AgentRegistry - Registre des agents autonomes
    └── AutonomousAgent[] - Agents autonomes
```

**AgentOrchestrator** (`server/agents/AgentOrchestrator.ts`) :
- **Rôle** : Point d'entrée pour la délégation de tâches
- **Méthodes** :
  - `setSkillHandler(handler)` - Configuration du handler de skills
  - `setProgressCallback(callback)` - Configuration des callbacks
  - `setEventBroadcaster(broadcaster)` - Configuration du broadcast
  - `delegateTask(params)` - Délégation simple
  - `orchestrate(params)` - Orchestration multi-agents

**AgentExecutor** (`server/agents/AgentExecutor.ts`) :
- **Rôle** : Exécution des tâches agents
- **Fonctionnalités** :
  - Gestion des timeouts
  - Limitation de concurrency par agent
  - Validation des paramètres
  - Appel des skills via SkillHandler

**TaskScheduler** (`server/agents/TaskScheduler.ts`) :
- **Rôle** : Planification des tâches
- **Fonctionnalités** :
  - Priorisation des tâches
  - Gestion des dépendances
  - Exécution parallèle/séquentielle

**ProgressNotifier** (`server/agents/ProgressNotifier.ts`) :
- **Rôle** : Notification de la progression
- **Fonctionnalités** :
  - Callbacks de progression
  - Broadcast via WebSocket
  - Journalisation

**AgentRegistry** (`server/agents/AgentRegistry.ts`) :
- **Rôle** : Registre des agents autonomes
- **Fonctionnalités** :
  - Initialisation des agents
  - Gestion du cycle de vie
  - Persistance des tâches

**AgentMessageBus** (`server/agents/AgentMessageBus.ts`) :
- **Rôle** : Communication inter-agents
- **Types de messages** :
  - `task_started` - Début d'une tâche
  - `task_completed` - Fin d'une tâche
  - `task_failed` - Échec d'une tâche
  - `custom` - Messages personnalisés

**AgentPersistence** (`server/agents/AgentPersistence.ts`) :
- **Rôle** : Persistance des tâches et orchestrations
- **Backend** : Supabase (optionnel) ou JSON local
- **Fonctionnalités** :
  - Sauvegarde des tâches
  - Restauration après crash
  - Synchronisation avec le frontend

#### Gestion des notebooks

**Architecture** :
```
NotebookManager (CRUD)
├── Persistence (JSON files)
│   └── .jarvis/notebooks/<id>.json
├── Source Management
│   ├── SourceIngester - Extraction de texte
│   │   └── Support: PDF, DOCX, MD, HTML, images, CSV, JSON, YAML
│   ├── Chunking - Découpage en morceaux
│   └── Metadata Extraction
├── Embedding Management
│   ├── EmbeddingStore - Stockage des vecteurs
│   │   └── LRU Cache (50K max)
│   └── Vectorization - gemini-embedding-001
└── Chat Management
    ├── GroundedChat - Chat avec citations
    │   └── RAGEngine - Recherche hybride
    ├── ContentGenerator - Génération de contenu
    │   └── 10+ types: résumé, FAQ, guide, etc.
    └── AudioOverview - Script de podcast
        └── TTS - Synthèse vocale
```

**NotebookManager** (`server/notebooks/NotebookManager.ts`) :
- **Fonctionnalités** :
  - CRUD des notebooks
  - Gestion des sources
  - Gestion des notes
  - Gestion des documents générés
  - Gestion des audio overviews
  - Gestion de l'historique de chat
- **Persistance** : Fichiers JSON dans `.jarvis/notebooks/`
- **Rotation des couleurs** : 8 couleurs disponibles
- **Rotation des icônes** : 8 icônes disponibles

**EmbeddingStore** (`server/notebooks/EmbeddingStore.ts`) :
- **Rôle** : Stockage et gestion des embeddings
- **Fonctionnalités** :
  - Stockage des vecteurs (1536 dimensions)
  - Recherche par similarité cosinus
  - LRU Cache (50K entrées max)
  - Invalidation automatique
  - Persistance sur disque

**RAGEngine** (`server/notebooks/RAGEngine.ts`) :
- **Rôle** : Moteur de recherche hybride
- **Algorithmes** :
  - Embeddings sémantiques (Gemini)
  - TF-IDF lexical
  - Reciprocal Rank Fusion (RRF)
  - Re-ranking via LLM
- **Fonctionnalités** :
  - Recherche hybride
  - Fusion des résultats
  - Citations avec scores de pertinence

**GroundedChat** (`server/notebooks/GroundedChat.ts`) :
- **Rôle** : Chat avec citations
- **Fonctionnalités** :
  - Intégration des citations dans le prompt
  - Streaming des réponses
  - Gestion de l'historique
  - Feedback utilisateur (thumbs up/down)

**ContentGenerator** (`server/notebooks/ContentGenerator.ts`) :
- **Rôle** : Génération de contenu
- **Types de contenu** :
  - Résumé synthétique
  - FAQ (15-20 Q&R)
  - Guide d'étude
  - Briefing exécutif
  - Chronologie
  - Plan structuré
  - Carte mentale (Mermaid)
  - Analyse SWOT
  - Glossaire
  - Infographies
- **Fonctionnalités** :
  - Streaming en temps réel
  - Sélection des sources
  - Instructions personnalisées
  - Export Markdown

**BackupService** (`server/notebooks/BackupService.ts`) :
- **Rôle** : Sauvegarde automatique
- **Fréquence** : Toutes les 30 minutes
- **Type** : Incrémentale
- **Rotation** : 10 backups maximum
- **Compression** : Optionnelle
- **Restauration** : Par notebook ou globale

**ProcessingQueue** (`server/notebooks/ProcessingQueue.ts`) :
- **Rôle** : File d'attente pour l'ingestion de sources
- **Concurrence** : 2 tâches simultanées
- **Retry** : Exponentiel avec backoff
- **Priorités** : Gestion des priorités
- **Annulation** : Possible

**ResponseCache** (`server/notebooks/ResponseCache.ts`) :
- **Rôle** : Cache intelligent des réponses
- **Type** : LRU Cache
- **TTL** : Time-to-Live configurable
- **Matching** : Similarité Jaccard pour les questions proches
- **Invalidation** : Automatique quand les sources changent

#### Moteur de connaissances

**Architecture** :
```
ProjectIndexer
  │
  ▼
KnowledgeGraph ←── DependencyGraph
  │
  ▼
┌─────────────────────┐
│ SemanticSearch      │
│ ImpactAnalyzer      │
│ PlanningEngine      │
│ UnderstandingEngine │
│ LearningEngine      │
│ ReasoningPipeline   │
└─────────────────────┘
  │
  ▼
ProjectMemory
```

**ProjectIndexer** (`server/knowledge/ProjectIndexer.ts`) :
- **Rôle** : Indexation complète du workspace
- **Fonctionnalités** :
  - Scan de tous les fichiers
  - Extraction des entités de code
  - Génération des embeddings
  - Stockage dans KnowledgeGraph
  - Indexation incrémentale via FileWatcher

**KnowledgeGraph** (`server/knowledge/KnowledgeGraph.ts`) :
- **Rôle** : Graphe des connaissances du projet
- **Fonctionnalités** :
  - Stockage des entités (classes, fonctions, etc.)
  - Gestion des relations entre entités
  - Persistance dans `.jarvis/ProjectKnowledge.json`
  - Recherche sémantique

**DependencyGraph** (`server/knowledge/DependencyGraph.ts`) :
- **Rôle** : Graphe des dépendances entre fichiers
- **Fonctionnalités** :
  - Détection des imports/exports
  - Construction du graphe orienté
  - Détection des cycles
  - Calcul de l'impact des modifications

**SemanticSearch** (`server/knowledge/SemanticSearch.ts`) :
- **Rôle** : Recherche sémantique locale
- **Algorithme** : Similarité cosinus sur les embeddings
- **Fonctionnalités** :
  - Recherche vectorielle
  - Fusion avec recherche lexicale
  - Re-ranking via LLM

**ImpactAnalyzer** (`server/knowledge/ImpactAnalyzer.ts`) :
- **Rôle** : Analyse d'impact avant modification
- **Fonctionnalités** :
  - Prédiction des fichiers impactés
  - Score de risque
  - Recommandations (tests, vérifications)
  - Visualisation du graphe d'impact

**PlanningEngine** (`server/knowledge/PlanningEngine.ts`) :
- **Rôle** : Planification de refactoring
- **Stratégies** :
  - Refactoring
  - Nouvelle fonctionnalité
  - Bugfix
- **Fonctionnalités** :
  - Plan structuré avec étapes
  - Gestion des risques
  - Parallelisation optimale

**UnderstandingEngine** (`server/knowledge/UnderstandingEngine.ts`) :
- **Rôle** : Évaluation de la compréhension du projet
- **Fonctionnalités** :
  - Score de compréhension (0-100)
  - Identification des lacunes
  - Recommandations d'amélioration
  - Indicateurs de santé du codebase

**LearningEngine** (`server/knowledge/LearningEngine.ts`) :
- **Rôle** : Apprentissage automatique
- **Fonctionnalités** :
  - Détection de patterns récurrents
  - Suggestions d'optimisations
  - Capitalisation des expériences
  - Auto-amélioration des skills

**FileWatcher** (`server/knowledge/FileWatcher.ts`) :
- **Rôle** : Surveillance des changements de fichiers
- **Fonctionnalités** :
  - Détection des créations/modifications/suppressions
  - Ré-indexation incrémentale
  - Debounce pour éviter les déclenchements multiples
  - Notifications aux clients connectés

#### Runtime V2

**Nouveau cœur architectural** pour la version 2 du système.

**AgentRuntime** (`server/runtime/AgentRuntime.ts`) :
- **Rôle** : Runtime des agents
- **Fonctionnalités** :
  - Registre des agents
  - Gestion du cycle de vie
  - Exécution des tâches
  - Observabilité

**ToolRegistry** (`server/runtime/ToolRegistry.ts`) :
- **Rôle** : Registre central des outils
- **Fonctionnalités** :
  - Enregistrement des outils
  - Validation des paramètres
  - Appel des handlers
  - Métriques d'utilisation

**EventBus** (`server/runtime/EventBus.ts`) :
- **Rôle** : Bus d'événements asynchrone
- **Fonctionnalités** :
  - Émission d'événements
  - Abonnement aux événements
  - Gestion des erreurs

**StateMachine** (`server/runtime/StateMachine.ts`) :
- **Rôle** : Machine d'état pour les workflows
- **Fonctionnalités** :
  - Définition des états
  - Transitions validées
  - Gestion du contexte

**WorkflowEngine** (`server/runtime/WorkflowEngine.ts`) :
- **Rôle** : Moteur d'exécution de workflows
- **Fonctionnalités** :
  - Définition des workflows
  - Exécution séquentielle/parallèle
  - Gestion des erreurs
  - Métriques de performance

**PromptRegistry** (`server/runtime/PromptRegistry.ts`) :
- **Rôle** : Registre des prompts système
- **Fonctionnalités** :
  - Stockage des templates
  - Gestion des versions
  - Sélection optimale

**Observability** (`server/runtime/Observability.ts`) :
- **Rôle** : Observabilité du système
- **Fonctionnalités** :
  - Métriques d'utilisation
  - Logging structuré
  - Traçage des exécutions

**Compatibilité** (`server/runtime/compat/`):
- **LegacyBridge** : Pont vers l'ancien système
- **SkillAdapter** : Adaptation des skills v1 vers v2
- **SkillManagerV2** : Version 2 du gestionnaire de skills

#### Skills IA

**SkillManager** (`server/skills/SkillManager.ts`) :
- **Rôle** : Gestionnaire central de toutes les compétences IA
- **Fonctionnalités** :
  - Chargement des skills (22+)
  - Classification automatique via mots-clés
  - Validation des arguments
  - Appel des handlers
  - Journalisation des appels
  - Auto-guérison

**Skills Disponibles** :

| Skill | Domain | Capacités |
|-------|--------|-----------|
| codebase | Manipulation fichiers | lecture, écriture, modification, recherche |
| verify | Vérification | lint, typecheck, sécurité, syntax |
| system | Système | commandes, processus, notifications |
| git | Git | status, commit, push, branches |
| github | GitHub | repos, issues, PRs |
| automation | Automatisation | navigation web, scraping |
| browser | Navigateur | navigation, extraction, recherche |
| knowledge | Connaissances | indexation, recherche, graphe |
| memory | Mémoire | stockage, recherche, apprentissage |
| mission | Missions | planification, exécution, suivi |
| agents | Agents | délégation, orchestration |
| reasoning | Raisonnement | chain-of-thought, analyse |
| richDocument | Documents | tableaux, graphiques, KPI |
| documentKnowledge | Connaissance doc | analyse, cross-reference |
| documentLinker | Liaisons | cross-document, consistency |
| workflow | Workflows | pipeline, étapes, conditions |
| time | Temps | heure, date, timestamp |
| weather | Météo | informations météo |
| guidelines | Conventions | style guides, normes |
| history | Historique | sessions, conversations |
| list | Listes | to-do, shopping, gestion |
| project | Projets | scaffold, templates |
| aiStudioDirectives | Directives | AI Studio, build |
| customSkills | Personnalisé | skills utilisateur |

**Classification Automatique** :
- **Mots-clés** : Chaque skill a une liste de mots-clés pour le matching
- **Exemple** : `codebase` → ['fichier', 'file', 'lire', 'read', 'écrire', 'write', ...]
- **Matching** : Basé sur la requête utilisateur ou la demande explicite

**Sélection des Skills** :
- **Critical Skills** : Chargées au démarrage (codebase, verify, system, etc.)
- **Lazy Skills** : Chargées à la demande (git, github, etc.)
- **Custom Skills** : Définies par l'utilisateur

#### Sécurité

**server/security.ts** :

**Authentification** :
```typescript
function authenticateRequest(req, options = {}) {
  const configuredToken = options.apiToken;
  if (!configuredToken) return { ok: true }; // Pas de token = accès libre
  
  const headerValue = req.headers?.['x-jarvis-token'];
  const token = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  
  if (token === configuredToken) return { ok: true };
  return { ok: false, status: 401, error: 'Unauthorized' };
}

function authenticateToken(token, apiToken) {
  if (!apiToken) return { ok: true };
  if (token === apiToken) return { ok: true };
  return { ok: false, status: 401, error: 'Unauthorized' };
}
```

**Résolution des chemins** :
```typescript
function resolveWorkspacePath(requestedPath, workspaceRoot) {
  const absolutePath = path.resolve(workspaceRoot, requestedPath);
  const normalizedRoot = path.resolve(workspaceRoot);
  const normalizedTarget = path.resolve(absolutePath);
  
  if (!normalizedTarget.startsWith(normalizedRoot + path.sep) && 
      normalizedTarget !== normalizedRoot) {
    return { ok: false, status: 403, error: 'Path outside workspace' };
  }
  
  return { ok: true, absolutePath: normalizedTarget };
}
```

**Gestion du workspace** :
```typescript
function getWorkspaceRoot() {
  if (isSandboxActive()) {
    return getSandboxRoot();
  }
  return getDefaultWorkspaceRoot();
}

function getDefaultWorkspaceRoot() {
  return SELF_ROOT; // Défini dans server/utils/selfRoot.ts
}
```

**Sandbox** (`server/utils/sandbox.ts`) :
- **Dossier** : `.jarvis/sandbox/`
- **Activation** : Via `activateSandbox()`
- **Désactivation** : Via `deactivateSandbox()`
- **Validation** : `assertSandboxReady(path)` vérifie que le fichier est dans le sandbox
- **Modifications** : `markFileModified(path)` marque un fichier comme modifié
- **Statut** : `isSandboxActive()` vérifie si le sandbox est actif

**Fichiers Critiques** (`server/utils/selfRoot.ts`) :
```typescript
const CRITICAL_FILES = [
  '.env',
  '.env.local', 
  '.gemini-keys.json',
  'package.json',
  'server.ts',
  'server-bootstrap.ts',
  'vite.config.ts',
  'tsconfig.json',
  'electron/main.cjs',
  'electron/preload.cjs',
];

function isCriticalFile(path) {
  const normalized = path.resolve(path);
  return CRITICAL_FILES.some(file => 
    normalized.endsWith(file) || 
    normalized.includes(`/node_modules/${file}`)
  );
}

const FORBIDDEN_DIRS = [
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
];

function isWriteForbidden(path) {
  const normalized = path.resolve(path);
  return FORBIDDEN_DIRS.some(dir => 
    normalized.includes(`/${dir}/`) || 
    normalized.includes(`/${dir}`) ||
    normalized.endsWith(dir)
  );
}
```

**Checkpoint Git** (`server/utils/checkpoint.ts`) :
- **Auto-save** : Avant modification de fichiers Git
- **Snapshot** : Via `git stash` ou commit temporaire
- **Rollback** : Si erreur de compilation
- **Cleanup** : Nettoyage des anciens checkpoints

**Protection Prompt Injection** (`server/utils/promptInjectionGuard.ts`) :
- **Patterns** : Liste de patterns dangereux
- **Sanitization** : Nettoyage des prompts
- **Block** : Blocage des requêtes malveillantes

**Chiffrement** (`server/utils/crypto.ts`) :
- **Algorithme** : AES-256-GCM
- **Clé** : Dérivée de `JARVIS_MASTER_KEY` + hardware seed
- **Fonctions** :
  - `encrypt(plaintext)` : Chiffrement
  - `decrypt(ciphertext)` : Déchiffrement
  - `deriveKey(masterKey)` : Dérivation de la clé

#### Gestion du cycle de vie

**server/lifecycle.ts** :

**Fonctionnalités** :
- **Graceful Shutdown** : Fermeture propre du serveur
- **Cleanup** : Libération des ressources
- **Persistence** : Sauvegarde de l'état avant arrêt

**Processus de shutdown** :
```typescript
function setupGracefulShutdown(deps) {
  // Fermeture des connexions WebSocket
  // Arrêt des timers et tâches planifiées
  // Sauvegarde de l'état
  // Fermeture du serveur HTTP
  
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
  process.on('SIGQUIT', gracefulShutdown);
}
```

---

*Fin de la Partie 1. Voir JARVIS-OS-ANALYSE-TECHNIQUE-PARTIE-2.md pour la suite.*
