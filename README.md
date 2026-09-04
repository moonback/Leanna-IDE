# Leanna — AI Operating System

Leanna est un environnement de développement augmenté par IA, conçu pour les développeurs qui veulent déléguer des tâches complexes à une IA multimodale en temps réel. Il intègre un éditeur de code (Monaco), un terminal interactif, un système d'agents autonomes, et une interaction vocale via l'API Gemini Live — le tout dans une application web ou desktop (Electron).

Il s'adresse aux développeurs solo et aux petites équipes qui souhaitent un assistant IA local, sécurisé, capable de lire, écrire et exécuter du code dans leur propre workspace, sans envoyer leurs fichiers vers des services tiers non contrôlés.

![Build](https://img.shields.io/badge/build-passing-brightgreen) ![Version](https://img.shields.io/badge/version-0.9.0-blue) ![License](https://img.shields.io/badge/license-BUSL--1.1-orange) ![Node](https://img.shields.io/badge/node-%3E%3D20-green) ![Electron](https://img.shields.io/badge/electron-43-blueviolet)

---

## Stack technique

| Technologie | Rôle | Version |
|---|---|---|
| React | UI frontend | ^19.0.1 |
| Vite | Bundler / dev server | ^6.2.3 |
| TypeScript | Langage principal (front + back) | ^5.0.0 |
| TailwindCSS | Styles utilitaires | ^4.1.14 |
| Express | Serveur HTTP / API REST | ^4.21.2 |
| Node.js | Runtime backend | ≥ 20 |
| WebSocket (`ws`) | Temps réel (Gemini Live, terminal, sandbox) | ^8.21.0 |
| Electron | Application desktop (Windows) | ^43.1.0 |
| Monaco Editor | Éditeur de code intégré | ^0.53.0 |
| Google GenAI | Modèles Gemini (texte + voix) | ^2.4.0 |
| Supabase | Base de données PostgreSQL + pgvector | ^2.110.2 |
| Zod | Validation de schémas | ^3.25.76 |
| Puppeteer | Automatisation navigateur | ^25.3.0 |
| Recharts | Graphiques / dashboards | 3.10.1 |
| Motion | Animations UI | ^12.23.24 |
| Tree-sitter | Parsing AST (TypeScript, JavaScript) | ^0.27.0 |
| pdf-parse | Extraction de documents PDF | ^2.4.5 |
| basic-ftp | Connexions FTP | 6.2.1 |
| esbuild | Build serveur (CJS bundle) | ^0.25.0 |

---

## Fonctionnalités principales

### Utilisateur
- **Interaction vocale en temps réel** via Gemini Live API (WebSocket `/live`) avec choix de voix
- **Éditeur de code Monaco** avec coloration syntaxique, multi-onglets, et arborescence de fichiers
- **Terminal interactif** intégré dans l'interface
- **Agents autonomes** : délégation de tâches à des agents spécialisés (coder, architect, refactor, test, docs, security, review)
- **Sandbox sécurisé** : toutes les modifications de l'IA sont isolées et soumises à validation avant application
- **Partage d'écran et webcam** vers le modèle Gemini pour interaction visuelle
- **Notebooks RAG** : ingestion de documents (PDF, texte) et chat contextuel avec recherche sémantique
- **Historique des conversations** persisté dans Supabase avec recherche full-text
- **Mémoire long-terme** via Supabase (pgvector) avec recherche par similarité sémantique
- **Listes intelligentes** créées et gérées par l'IA
- **Workflows automatisés** planifiables (ex : toutes les 24h, 30m…)
- **Tâches planifiées** (automation) avec intervalles configurables
- **Intégration GitHub** : statut Git, commits, push, issues, PRs depuis l'interface
- **Gestion de documents** : upload de PDF/DOCX, extraction et indexation
- **Thème dark/light** et couleur d'accent personnalisable

### Administrateur / Développeur
- **Knowledge Graph** du workspace : indexation incrémentale des fichiers, entités, dépendances
- **Custom Skills** : création d'outils IA personnalisés via une interface dédiée
- **Marketplace de skills et d'agents** : catalogue extensible
- **Rotation de clés Gemini** : pool de clés avec failover automatique sur erreur 429
- **MCP (Model Context Protocol)** : intégration de serveurs MCP externes
- **Audit log** : traçabilité de toutes les opérations sur les fichiers
- **Export** de conversations et données
- **FTP** : connexion à des serveurs FTP distants depuis l'IA
- **OpenRouter** : support de modèles alternatifs (GPT-4o-mini, etc.)
- **Text-to-Speech** intégré pour les réponses vocales
- **Checkpoint Git** : sauvegarde automatique avant chaque modification critique

---

## Prérequis

| Élément | Version minimale |
|---|---|
| Node.js | 20.x |
| npm | 10.x |
| Git | 2.x |
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
| `SANDBOX_EXIT_CODE` | Code à 6 chiffres pour sortir du sandbox | `123456` | ❌ |
| `ALLOW_FTP_PRIVATE_IPS` | Autorise les connexions FTP vers IPs privées | `false` | ❌ |
| `Leanna_LISTEN_HOST` | Interface d'écoute du serveur | `127.0.0.1` | ❌ |
| `NODE_ENV` | Environnement d'exécution | `development` | ❌ |

---

## Lancement

### Mode développement

```bash
npm run dev
```

Démarre le serveur Express avec Vite en middleware (HMR activé) sur `http://127.0.0.1:4000`.

### Mode production

```bash
npm run build
npm start
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
npm test
```

---

## Structure du projet

```
leanna/
├── electron/               # Application desktop Electron
│   ├── main.cjs            # Processus principal Electron
│   ├── preload.cjs         # Preload script (IPC bridge)
│   └── splash.html         # Splash screen de démarrage
├── server/                 # Backend Express (Node.js)
│   ├── agents/             # Orchestrateur et flotte d'agents autonomes
│   ├── autonomy/           # SmartSkills et boucle autonome
│   ├── config/             # Rate limiters, configuration serveur
│   ├── export/             # Export de données
│   ├── knowledge/          # Knowledge Graph, indexation du workspace
│   ├── live/               # Handler WebSocket Gemini Live
│   ├── marketplace/        # Catalogue skills/agents
│   ├── mcp/                # Bridge Model Context Protocol
│   ├── middleware/         # Middlewares Express
│   ├── mission/            # Système de missions (tâches longues)
│   ├── notebooks/          # RAG : ingestion, embeddings, recherche
│   ├── prompts/            # System instructions Gemini
│   ├── routes/             # Routeurs REST (40+ modules)
│   ├── runtime/            # SkillManagerV2, ToolRegistry, Observability
│   ├── skills/             # Skills natifs (25+)
│   ├── utils/              # Sandbox, crypto, checkpoint, selfRoot…
│   └── workflows/          # Moteur de workflows planifiés
├── src/                    # Frontend React
│   ├── components/         # Composants UI (IDE, panels, sidebar…)
│   ├── context/            # Contextes React (LiveAPI, Profile, ScreenShare)
│   ├── hooks/              # Hooks personnalisés
│   ├── services/           # Clients API (ideApi, sandboxApi, supabase)
│   ├── stores/             # État global
│   ├── types/              # Types TypeScript partagés
│   ├── utils/              # Utilitaires frontend
│   ├── views/              # Pages (IdeView, NotebooksView, GitHubView…)
│   └── main.tsx            # Point d'entrée React
├── supabase/               # Schémas SQL et migrations Supabase
├── assets/                 # Images, icônes
├── docs/                   # Documentation complémentaire
├── scripts/                # Scripts de build et lint
├── server.ts               # Point d'entrée du serveur Express
├── server-bootstrap.ts     # Bootstrap (env, déchiffrement, démarrage)
├── vite.config.ts          # Configuration Vite
├── tsconfig.json           # Configuration TypeScript
└── package.json            # Dépendances et scripts npm
```

---

## Contribuer

Consultez [CONTRIBUTING.md](CONTRIBUTING.md) pour le workflow Git, les conventions de code et le processus de review.

---

## Licence

Ce projet est distribué sous licence **BUSL 1.1** (Business Source License 1.1).

Voir le fichier [LICENSE](LICENSE) pour les conditions complètes.
