# Jarvis OS

<p align="center">
  <img src="assets/images/header.png" alt="Jarvis OS" width="100%" />
</p>

<h1 align="center">Jarvis OS</h1>

<p align="center">
  <strong>IDE auto-référentiel avec assistant IA intégré (Leanna) - Modifiez le code de l'application elle-même</strong>
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

## Table des matieres

- [Presentation](#-presentation)
- [Stack technique](#-stack-technique)
- [Fonctionnalites principales](#-fonctionnalites-principales)
- [Prerequis](#-prerequis)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Lancement](#-lancement)
- [Structure du projet](#-structure-du-projet)
- [Variables d'environnement](#-variables-denvironnement)
- [Contribution](#-contribution)
- [Licence](#-licence)

---

## Presentation

**Jarvis OS est un IDE auto-référentiel** - un environnement de developpement intelligent ou l'assistant IA embarque (Leanna par defaut) peut **lire et modifier le code source de l'application elle-meme**.

Concu comme un systeme d'exploitation desktop, Jarvis OS combine :

- Un IDE complet avec editeur Monaco, explorateur de fichiers, recherche globale
- Un assistant IA multimodal (voix, webcam, partage d'ecran via Gemini Live)
- Un systeme multi-agents (14 roles specialises) capable de collaborer sur des taches complexes
- Des notebooks RAG (style NotebookLM) avec ingestion de sources, chat avec citations
- Un moteur de knowledge avec indexation semantique du workspace
- Un sandbox isole pour les modifications assistées avec validation avant merge

> **Positionnement produit (v0.5.0)** : Jarvis ne gere désormais que son propre code source. Chaque modification est protègee par un checkpoint.

---

## Stack technique

| Couche | Technologies |
|--------|-------------|
| **Frontend** | React 19, React Router 7, Tailwind CSS 4, Monaco Editor, Motion, Lucide React, react-window |
| **Backend** | Node.js 22+, Express 4, WebSocket (ws), multer, compression |
| **IA** | Google Gemini 2.x (SDK @google/genai), OpenRouter (optionnel), embeddings gemini-embedding-001 |
| **Desktop** | Electron 43, electron-builder (NSIS Windows) |
| **Bundling** | Vite 6, esbuild, tsx |
| **Base de donnees** | Supabase (PostgreSQL) avec RLS, stockage local JSON |
| **Autres** | pdf-parse, puppeteer, marked, mermaid, recharts, cva, clsx |

---

## Fonctionnalites principales (MVP)

### IDE Auto-Reférentiel

- Editeur Monaco : Syntaxe, autocompletion, multi-fichiers, multi-onglets
- Explorateur de fichiers : Arbre interactif avec filtres, recherche globale (Ctrl+Shift+F)
- Mode Sandbox : Environnement isole .jarvis/sandbox/ pour les modifications IA
- Checkpoints Git : Snapshot automatique avant modification avec rollback possible
- Validation strict : TypeScript, lint, analyse securite avant merge

### Assistant Code (Leanna)

Acces direct au code source via 20+ outils :

#### Lecture
- read_project_file - lecture partielle/complete avec numeros de ligne, hash MD5
- read_file_outline - structure (fonctions, classes, exports) avec numeros de ligne
- search_in_files - recherche textuelle/regex avec contexte
- list_project_files - exploration avec filtrage par extension

#### Ecriture & Modification
- write_project_file - creation/ecrasement + mode append
- modify_project_file - remplacement exact avec fuzzy match
- patch_project_file - patch par numeros de ligne (replace/insert/delete)
- apply_patch - application de diff unifie (format git diff)
- rename_project_file / delete_project_file / delete_project_folder

#### Validation
- verify_file - lint + typecheck TypeScript + analyse securite
- verify_typecheck / verify_syntax / verify_security

### Systeme Multi-Agents (14 agents)

#### Pole Code & Ingenierie Logicielle
| Agent | Role | Capacite |
|-------|-------|------------|
| coder | Developpeur | Lecture/Ecriture/Tests |
| refactor | Refactorisation | Lecture/Ecriture/Validation |
| debugger | Débogueur | Lecture/Ecriture/Validation |
| reviewer | Revue de Code | Lecture seule |
| tester | QA & Tests | Lecture/Ecriture/Validation |
| security | Securite & Audit | Lecture seule |
| architect | Architecte Logiciel | Lecture/Ecriture/Structure |

#### Pole Redaction & Documentation
| Agent | Role | Capacite |
|-------|-------|------------|
| writer | Redacteur | Lecture/Ecriture |
| formatter | Mise en forme | Lecture/Ecriture |
| researcher | Recherche | Lecture seule |
| proofreader | Correcteur | Lecture/Ecriture |
| translator | Traducteur | Lecture/Ecriture |
| summarizer | Synthese | Lecture/Ecriture |
| planner | Planificateur | Lecture/Ecriture/Structure |

### Notebooks RAG

- Sources multiples : Upload PDF, DOCX, MD, HTML, images, CSV, JSON
- Recherche hybride : Embeddings semantiques + TF-IDF + Re-ranking LLM
- Chat grounde : Questions/reponses avec citations precis
- Generation de contenu : Resumes, FAQ, guides, briefings, mindmaps (Mermaid)
- Audio Overview : Script de podcast IA avec deux hotes
- Notes avancees : Vue Canvas 2D, backlinks, templates

### Assistant Multimodal

- Voix en temps reel : Dictee, commandes vocales, reponses audio (TTS)
- Vision webcam : Analyse de documents physiques ou schemas manuscrits
- Partage d'ecran : Capture et interpretation du contenu affiche

### Moteur de Connaissances

- Indexation automatique du workspace (fichiers, code, dependances)
- Graphe de relations entre fichiers et entites
- Recherche semantique sans API externe
- Analyse d'impact avant modification
- Memoire projet (conventions, preferences de style)

### Automatisation

- Workflows documentaires orchestres
- Taches planifiees (cron-like) avec declencheurs
- Missions autonomes avec planification IA
- Navigation web automatisee (Puppeteer)

### Passerelle MCP

- Connexion a chaud de serveurs MCP (stdio & SSE)
- Invocation d'outils externes depuis l'IA

---

## Prerequis

- Node.js >= 22.12.0
- npm >= 10.x
- Cle API Gemini (Google AI Studio) - obligatoire
- Cle API OpenRouter - optionnelle (modeles alternatifs)
- Supabase CLI - optionnel (pour la gestion de la base de donnees)
- Git - pour le versionnage et les checkpoints

---

## Installation

### Cloner le depot

git clone https://github.com/moonback/Jarvis-OS.git
cd Jarvis-OS

### Installer les dependances

npm install

### Configurer l'environnement

1. Copier le fichier d'exemple :
cp .env.example .env

2. Editer .env et configurer au minimum :
GEMINI_API_KEY=votre_cle_api_gemini
JARVIS_API_TOKEN=votre_token_securite  # Recommande
SUPABASE_URL=votre_url_supabase          # Optionnel
SUPABASE_SERVICE_ROLE_KEY=votre_cle    # Optionnel

Note : Les cles sont chiffrees au repos (AES-256-GCM) dans .env/.env.local.

---

## Configuration

### Variables d'environnement

Voir .env.example pour la liste complete. Voici les principales :

| Variable | Description | Obligatoire |
|----------|-------------|:-----------:|
| GEMINI_API_KEY | Cle API Google Gemini | [x] |
| JARVIS_API_TOKEN | Token de securite des endpoints | [ ] Recommande |
| SUPABASE_URL | URL de l'instance Supabase | [ ] |
| SUPABASE_SERVICE_ROLE_KEY | Cle service Supabase | [ ] |
| OPENROUTER_API_KEY | Cle OpenRouter | [ ] |
| GITHUB_TOKEN | Token GitHub | [ ] |
| ENABLE_CHAIN_OF_THOUGHT | Afficher le raisonnement IA (true/false) | [ ] |
| SANDBOX_EXIT_CODE | Code de securite pour sortir du sandbox | [ ] |
| VITE_SERVER_PORT | Port du serveur backend (defaut: 5000) | [ ] |
| JARVIS_DEFAULT_WORKSPACE | Chemin du workspace par defaut | [ ] |

### Pool de cles Gemini

Jarvis OS supporte un pool de cles API avec rotation automatique (round-robin + retry sur 429). Les cles sont stockees chiffrees dans .gemini-keys.json. Gestion possible via l'UI Parametres > Cles API.

---

## Lancement

### Mode Developpement (Web)

npm run dev

Serveur accessible sur http://localhost:5000 (ou le port configure dans VITE_SERVER_PORT).

Note : Le backend Express integre Vite en middleware. Utilisez UNIQUEMENT npm run dev, pas vite dev manuellement.

### Mode Desktop (Electron)

# Avec DevTools
npm run desktop:debug

# Sans DevTools
npm run desktop

### Mode Production

# Build complet (frontend + backend)
npm run build

# Demarrer le serveur de production
npm start

### Build Installateur Windows

# Packager pour Windows (dossier portable)
npm run pack:win

# Generer l'installateur NSIS
npm run dist:win

Sortie : Les fichiers sont generes dans release/.

---

## Structure du projet

```
Jarvis-OS/
├── assets/                          # Images, icones, splash screen
├── electron/                        # Process principal Electron
│   ├── main.cjs                    # Point d'entree Electron
│   ├── preload.cjs                # Script de prechargement
│   └── splash/                     # Ecran de demarrage
├── server/                         # Backend Express + WebSocket
│   ├── agents/                     # Orchestrateur multi-agents
│   │   ├── AgentOrchestrator.ts    # Gestion des agents
│   │   ├── AgentPersistence.ts    # Persistance Supabase
│   │   ├── AutonomousAgent.ts      # Agents autonomes
│   │   └── types.ts               # Types des agents
│   ├── autonomy/                   # Boucle autonome supervisee
│   ├── knowledge/                  # Moteur de connaissances
│   │   ├── KnowledgeGraph.ts       # Graphe de connaissances
│   │   ├── ProjectIndexer.ts      # Indexation du projet
│   │   └── ProjectMemory.ts       # Memoire projet
│   ├── mcp/                        # Bridge MCP
│   ├── mission/                    # Planificateur de missions
│   ├── notebooks/                  # Moteur RAG Notebooks
│   │   ├── NotebookManager.ts     # Gestion des notebooks
│   │   ├── RAGEngine.ts           # Recherche hybride
│   │   ├── GroundedChat.ts        # Chat avec citations
│   │   └── ContentGenerator.ts    # Generation de contenu
│   ├── prompts/                    # Instructions systeme
│   │   ├── systemInstruction.ts   # Prompt systeme principal
│   │   └── promptConfig.ts        # Configuration des prompts
│   ├── routes/                     # 30+ routeurs REST
│   │   ├── ide.ts                 # Operations IDE
│   │   ├── notebooks/             # Routes notebooks (10+)
│   │   ├── agents.ts             # Gestion des agents
│   │   └── ...                   # Autres endpoints
│   ├── runtime/                    # Runtime V2
│   │   ├── AgentRuntime.ts        # Execution des agents
│   │   ├── ToolRegistry.ts        # Registre des outils
│   │   └── WorkflowEngine.ts     # Moteur de workflows
│   ├── skills/                     # 22+ skills IA
│   │   ├── SkillManager.ts        # Gestionnaire de skills
│   │   ├── codebase.ts           # Acces au code
│   │   ├── verify.ts             # Verification
│   │   └── ...                   # Autres skills
│   ├── utils/                      # Utilitaires
│   │   ├── sandbox.ts            # Gestion du sandbox
│   │   ├── checkpoint.ts         # Checkpoints Git
│   │   ├── crypto.ts             # Chiffrement
│   │   └── logger.ts             # Journalisation
│   └── workflows/                 # Workflows documentaires
├── src/                            # Frontend React 19
│   ├── components/                 # 80+ composants
│   │   ├── ide/                   # Composants IDE
│   │   │   ├── EditorTabs.tsx     # Onglets de l'editeur
│   │   │   ├── FileExplorer.tsx   # Explorateur de fichiers
│   │   │   ├── ChatPanel.tsx      # Panneau de chat
│   │   │   └── ...               # Autres
│   │   ├── notebooks/             # Composants notebooks
│   │   │   ├── NotebookChat.tsx   # Chat notebook
│   │   │   ├── SourcePanel.tsx    # Panneau sources
│   │   │   ├── NotesPanel.tsx     # Panneau notes
│   │   │   └── GeneratePanel.tsx  # Generation
│   │   ├── panels/                # Panneaux lateraux
│   │   └── ui/                   # Composants UI reutilisables
│   ├── config/                     # Configuration
│   ├── context/                    # Contextes React
│   ├── hooks/                      # Custom hooks
│   ├── services/                   # Clients HTTP
│   ├── types/                      # Types TypeScript
│   ├── utils/                      # Utilitaires frontend
│   └── views/                      # Vues principales
│       ├── IdeView.tsx            # Vue IDE
│       ├── NotebooksView.tsx     # Vue Notebooks
│       └── ...                    # Autres vues
├── server-bootstrap.ts             # Point d'entree serveur
├── server.ts                       # Serveur Express principal
├── package.json                    # Dependances et scripts
├── vite.config.ts                  # Configuration Vite
└── index.html                     # Shell HTML
```

---

## Contribution

Les contributions sont les bienvenues !

### Bonnes pratiques

- TypeScript strict : Toujours activer strict: true dans tsconfig.json
- Commits conventionnels : Utiliser les prefixes feat:, fix:, refactor:, docs:, test:
- Tests : Ajouter des tests unitaires pour les nouvelles fonctionnalites
- Documentation : Documenter les nouveaux endpoints et skills

### Commandes utiles

# Lancer les tests
npm test

# Lancer le linter
npm run lint

# Build complet
npm run build

# Verifier la typage
npx tsc --noEmit

### Processus de contribution

1. Forker le projet
2. Creer une branche pour votre fonctionnalite (git checkout -b feat/ma-fonctionnalite)
3. Commiter vos changements (git commit -m 'feat: ajouter ma fonctionnalite')
4. Pousser vers la branche (git push origin feat/ma-fonctionnalite)
5. Ouvrir une Pull Request

---

## Licence

Distribue sous licence MIT. Voir LICENSE pour plus de details.

---

<p align="center">
  Built with passion and a lot of Gemini by Jarvis OS team
</p>
