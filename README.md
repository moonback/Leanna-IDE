# Jarvis OS

<p align="center">
  <img src="assets/images/header.png" alt="Jarvis OS" width="100%" />
</p>

<h1 align="center">Jarvis OS</h1>

<p align="center">
  <strong>L'IDE intelligent pour développeurs, assisté par l'IA Leanna et ses agents spécialisés</strong>
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

## 📌 Table des matières

- [Pourquoi Jarvis OS ?](#-pourquoi-jarvis-os)
- [Présentation](#-présentation)
- [Stack technique](#-stack-technique)
- [Fonctionnalités principales](#-fonctionnalités-principales)
  - [IDE ](#ide-)
  - [Assistant Code (Leanna)](#assistant-code-leanna)
  - [Système Multi-Agents](#système-multi-agents)
  - [Notebooks RAG](#notebooks-rag)
  - [Assistant Multimodal](#assistant-multimodal)
  - [Moteur de Connaissances](#moteur-de-connaissances)
- [Prérequis](#-prérequis)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Lancement](#-lancement)
- [Structure du projet](#-structure-du-projet)
- [Contribution](#-contribution)
- [Licence](#-licence)

---

## 🌟 Pourquoi Jarvis OS ?

Jarvis OS est **l'IDE du futur** : un environnement de développement **intelligent** où **l'IA Leanna et ses 14 agents spécialisés** collaborent avec toi pour :

- **Créer et modifier du code** de manière sécurisée et assistée.
- **Comprendre et optimiser** ton projet grâce à une **indexation sémantique** du workspace.
- **Automatiser des tâches complexes** (refactoring, tests, documentation, etc.).
- **Travailler en mode multimodal** (voix, webcam, partage d'écran).
- **Bénéficier d'une mémoire projet** pour des suggestions contextuelles.

> **💡 Cas d'usage** :
> - Développeurs qui veulent **accélérer leur workflow** avec une IA intégrée.
> - Équipes cherchant à **automatiser des revues de code** ou des tests.
> - Projets nécessitant une **documentation automatique** ou une **recherche avancée** dans le code.

---

## 📖 Présentation

**Jarvis OS est un IDE ** : un environnement de développement **intelligent** où l'assistant IA intégré (**Leanna par défaut**) peut **lire, comprendre et modifier le code source de votre application**.

Conçu comme un **système d'exploitation desktop**, Jarvis OS combine :

- ✅ Un **IDE complet** avec éditeur Monaco, explorateur de fichiers et recherche globale.
- 🤖 Un **assistant IA multimodal** (voix, webcam, partage d'écran via Gemini Live).
- 👥 Un **système multi-agents** (14 rôles spécialisés) capable de collaborer sur des tâches complexes.
- 📚 Des **notebooks RAG** (style NotebookLM) avec ingestion de sources et chat avec citations.
- 🧠 Un **moteur de connaissances** avec indexation sémantique du workspace.
- 🔒 Un **sandbox isolé** pour les modifications assistées avec validation avant merge.

---

## 🛠️ Stack technique

| Couche | Technologies |
|--------|-------------|
| **Frontend** | React 19, React Router 7, Tailwind CSS 4, Monaco Editor, Motion, Lucide React, react-window |
| **Backend** | Node.js 22+, Express 4, WebSocket (ws), multer, compression |
| **IA** | Google Gemini 2.x (SDK @google/genai), OpenRouter (optionnel), embeddings gemini-embedding-001 |
| **Desktop** | Electron 43, electron-builder (NSIS Windows) |
| **Bundling** | Vite 6, esbuild, tsx |
| **Base de données** | Supabase (PostgreSQL) avec RLS, stockage local JSON |
| **Autres** | pdf-parse, puppeteer, marked, mermaid, recharts, cva, clsx |

---

## ✨ Fonctionnalités principales

### 💻 IDE 

- **Éditeur Monaco** : Syntaxe, autocomplétion, multi-fichiers, multi-onglets.
- **Explorateur de fichiers** : Arbre interactif avec filtres et recherche globale (`Ctrl+Shift+F`).
- **Mode Sandbox** : Environnement isolé (`.jarvis/sandbox/`) pour les modifications IA.
- **Checkpoints Git** : Snapshot automatique avant modification avec possibilité de rollback.
- **Validation stricte** : TypeScript, lint, analyse de sécurité avant merge.

---

### 🤖 Assistant Code (Leanna)

Accès direct au code source de votre app via **20+ outils** pour une assistance complète :

#### 📖 Lecture
- `read_project_file` : Lecture partielle ou complète avec numéros de ligne et hash MD5.
- `read_file_outline` : Structure du fichier (fonctions, classes, exports) avec numéros de ligne.
- `search_in_files` : Recherche textuelle ou regex avec contexte.
- `list_project_files` : Exploration avec filtrage par extension.

#### ✍️ Écriture & Modification
- `write_project_file` : Création/écrasement de fichiers + mode append.
- `modify_project_file` : Remplacement exact avec fuzzy match.
- `patch_project_file` : Application de patchs par numéros de ligne (replace/insert/delete).
- `apply_patch` : Application de diff unifié (format `git diff`).
- `rename_project_file` / `delete_project_file` / `delete_project_folder`.

#### ✅ Validation
- `verify_file` : Lint + typecheck TypeScript + analyse de sécurité.
- `verify_typecheck` / `verify_syntax` / `verify_security`.

---

### 👥 Système Multi-Agents (14 agents)

#### 💻 Pôle Code & Ingénierie Logicielle

| Agent | Rôle | Capacité |
|-------|------|----------|
| **coder** | Développeur | Lecture/Écriture/Tests |
| **refactor** | Refactorisation | Lecture/Écriture/Validation |
| **debugger** | Débogueur | Lecture/Écriture/Validation |
| **reviewer** | Revue de Code | Lecture seule |
| **tester** | QA & Tests | Lecture/Écriture/Validation |
| **security** | Sécurité & Audit | Lecture seule |
| **architect** | Architecte Logiciel | Lecture/Écriture/Structure |

#### 📝 Pôle Rédaction & Documentation

| Agent | Rôle | Capacité |
|-------|------|----------|
| **writer** | Rédacteur | Lecture/Écriture |
| **formatter** | Mise en forme | Lecture/Écriture |
| **researcher** | Recherche | Lecture seule |
| **proofreader** | Correcteur | Lecture/Écriture |
| **translator** | Traducteur | Lecture/Écriture |
| **summarizer** | Synthèse | Lecture/Écriture |
| **planner** | Planificateur | Lecture/Écriture/Structure |

---

### 📚 Notebooks RAG

- **Sources multiples** : Upload de fichiers PDF, DOCX, MD, HTML, images, CSV, JSON.
- **Recherche hybride** : Embeddings sémantiques + TF-IDF + Re-ranking LLM.
- **Chat groundé** : Questions/réponses avec citations précises.
- **Génération de contenu** : Résumés, FAQ, guides, briefings, mindmaps (Mermaid).
- **Audio Overview** : Script de podcast IA avec deux hôtes.
- **Notes avancées** : Vue Canvas 2D, backlinks, templates.

---

### 🎤 Assistant Multimodal

- **Voix en temps réel** : Dictée, commandes vocales, réponses audio (TTS).
- **Vision webcam** : Analyse de documents physiques ou schémas manuscrits.
- **Partage d'écran** : Capture et interprétation du contenu affiché.

---

### 🧠 Moteur de Connaissances

- **Indexation automatique** du workspace (fichiers, code, dépendances).
- **Graphe de relations** entre fichiers et entités.
- **Recherche sémantique** sans API externe.
- **Analyse d'impact** avant modification.
- **Mémoire projet** (conventions, préférences de style).

---

## 📋 Prérequis

- Node.js >= 22.12.0
- npm >= 10.x
- **Clé API Gemini** (Google AI Studio) - **obligatoire**
- Clé API OpenRouter - optionnelle (modèles alternatifs)
- Supabase CLI - optionnel (pour la gestion de la base de données)
- Git - pour le versionnage et les checkpoints

---

## 🚀 Installation

### 1. Cloner le dépôt

```bash
git clone https://github.com/moonback/Jarvis-OS.git
cd Jarvis-OS
```

### 2. Installer les dépendances

```bash
npm install
```

### 3. Configurer l'environnement

1. Copier le fichier d'exemple :
   ```bash
   cp .env.example .env
   ```

2. Éditer `.env` et configurer au minimum :
   ```env
   GEMINI_API_KEY=votre_clé_api_gemini
   JARVIS_API_TOKEN=votre_token_sécurité  # Recommandé
   SUPABASE_URL=votre_url_supabase          # Optionnel
   SUPABASE_SERVICE_ROLE_KEY=votre_clé    # Optionnel
   ```

> **⚠️ Note** : Les clés sont chiffrées au repos (AES-256-GCM) dans `.env` ou `.env.local`.

---

## ⚙️ Configuration

### Variables d'environnement

Voir `.env.example` pour la liste complète. Voici les principales :

| Variable | Description | Obligatoire |
|----------|-------------|:-----------:|
| `GEMINI_API_KEY` | Clé API Google Gemini | ✅ |
| `JARVIS_API_TOKEN` | Token de sécurité des endpoints | ❌ (Recommandé) |
| `SUPABASE_URL` | URL de l'instance Supabase | ❌ |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service Supabase | ❌ |
| `OPENROUTER_API_KEY` | Clé OpenRouter | ❌ |
| `GITHUB_TOKEN` | Token GitHub | ❌ |
| `ENABLE_CHAIN_OF_THOUGHT` | Afficher le raisonnement IA (`true`/`false`) | ❌ |
| `SANDBOX_EXIT_CODE` | Code de sécurité pour sortir du sandbox | ❌ |
| `VITE_SERVER_PORT` | Port du serveur backend (défaut: 5000) | ❌ |
| `JARVIS_DEFAULT_WORKSPACE` | Chemin du workspace par défaut | ❌ |

### Pool de clés Gemini

Jarvis OS supporte un **pool de clés API** avec rotation automatique (round-robin + retry sur `429`). Les clés sont stockées chiffrées dans `.gemini-keys.json`. Gestion possible via l'UI **Paramètres > Clés API**.

---

## ▶️ Lancement

### Mode Développement (Web)

```bash
npm run dev
```

> **Serveur accessible** sur [http://localhost:5000](http://localhost:5000) (ou le port configuré dans `VITE_SERVER_PORT`).
> **⚠️ Note** : Le backend Express intègre Vite en middleware. Utilisez **UNIQUEMENT** `npm run dev`, pas `vite dev` manuellement.

---

### Mode Desktop (Electron)

```bash
# Avec DevTools
npm run desktop:debug

# Sans DevTools
npm run desktop
```

---

### Mode Production

```bash
# Build complet (frontend + backend)
npm run build

# Démarrer le serveur de production
npm start
```

---

### Build Installateur Windows

```bash
# Packager pour Windows (dossier portable)
npm run pack:win

# Générer l'installateur NSIS
npm run dist:win
```

> **Sortie** : Les fichiers sont générés dans `release/`.

---

## 📁 Structure du projet

```
Jarvis-OS/
├── assets/                          # Images, icônes, splash screen
├── electron/                        # Process principal Electron
│   ├── main.cjs                    # Point d'entrée Electron
│   ├── preload.cjs                # Script de préchargement
│   └── splash/                     # Écran de démarrage
├── server/                         # Backend Express + WebSocket
│   ├── agents/                     # Orchestrateur multi-agents
│   │   ├── AgentOrchestrator.ts    # Gestion des agents
│   │   ├── AgentPersistence.ts    # Persistance Supabase
│   │   ├── AutonomousAgent.ts      # Agents autonomes
│   │   └── types.ts               # Types des agents
│   ├── autonomy/                   # Boucle autonome supervisée
│   ├── knowledge/                  # Moteur de connaissances
│   │   ├── KnowledgeGraph.ts       # Graphe de connaissances
│   │   ├── ProjectIndexer.ts      # Indexation du projet
│   │   └── ProjectMemory.ts       # Mémoire projet
│   ├── mcp/                        # Bridge MCP
│   ├── mission/                    # Planificateur de missions
│   ├── notebooks/                  # Moteur RAG Notebooks
│   │   ├── NotebookManager.ts     # Gestion des notebooks
│   │   ├── RAGEngine.ts           # Recherche hybride
│   │   ├── GroundedChat.ts        # Chat avec citations
│   │   └── ContentGenerator.ts    # Génération de contenu
│   ├── prompts/                    # Instructions système
│   │   ├── systemInstruction.ts   # Prompt système principal
│   │   └── promptConfig.ts        # Configuration des prompts
│   ├── routes/                     # 30+ routeurs REST
│   │   ├── ide.ts                 # Opérations IDE
│   │   ├── notebooks/             # Routes notebooks (10+)
│   │   ├── agents.ts             # Gestion des agents
│   │   └── ...                   # Autres endpoints
│   ├── runtime/                    # Runtime V2
│   │   ├── AgentRuntime.ts        # Exécution des agents
│   │   ├── ToolRegistry.ts        # Registre des outils
│   │   └── WorkflowEngine.ts     # Moteur de workflows
│   ├── skills/                     # 22+ skills IA
│   │   ├── SkillManager.ts        # Gestionnaire de skills
│   │   ├── codebase.ts           # Accès au code
│   │   ├── verify.ts             # Vérification
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
│   │   │   ├── EditorTabs.tsx     # Onglets de l'éditeur
│   │   │   ├── FileExplorer.tsx   # Explorateur de fichiers
│   │   │   ├── ChatPanel.tsx      # Panneau de chat
│   │   │   └── ...               # Autres
│   │   ├── notebooks/             # Composants notebooks
│   │   │   ├── NotebookChat.tsx   # Chat notebook
│   │   │   ├── SourcePanel.tsx    # Panneau sources
│   │   │   ├── NotesPanel.tsx     # Panneau notes
│   │   │   └── GeneratePanel.tsx  # Génération
│   │   ├── panels/                # Panneaux latéraux
│   │   └── ui/                   # Composants UI réutilisables
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
├── server-bootstrap.ts             # Point d'entrée serveur
├── server.ts                       # Serveur Express principal
├── package.json                    # Dépendances et scripts
├── vite.config.ts                  # Configuration Vite
└── index.html                     # Shell HTML
```

---

## 🤝 Contribution

Les contributions sont les bienvenues ! Voici comment contribuer :

### Bonnes pratiques

- **TypeScript strict** : Toujours activer `strict: true` dans `tsconfig.json`.
- **Commits conventionnels** : Utiliser les préfixes `feat:`, `fix:`, `refactor:`, `docs:`, `test:`.
- **Tests** : Ajouter des tests unitaires pour les nouvelles fonctionnalités.
- **Documentation** : Documenter les nouveaux endpoints et skills.

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

1. Forker le projet.
2. Créer une branche pour votre fonctionnalité (`git checkout -b feat/ma-fonctionnalité`).
3. Commiter vos changements (`git commit -m 'feat: ajouter ma fonctionnalité'`).
4. Pousser vers la branche (`git push origin feat/ma-fonctionnalité`).
5. Ouvrir une **Pull Request**.

---

## 📜 Licence

Distribué sous licence **MIT**. Voir [LICENSE](LICENSE) pour plus de détails.

---

<p align="center">
  Built with passion and a lot of Gemini by Jarvis OS team
</p>