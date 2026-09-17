# Leanna — AI Operating System

Leanna est un environnement de développement augmenté par IA, conçu pour les développeurs qui veulent déléguer des tâches complexes à une IA multimodale en temps réel. Il intègre un éditeur de code (Monaco), un terminal interactif, un système d'agents autonomes avec un **cerveau central dynamique (Agent Brain)**, et une interaction vocale via l'API Gemini Live — le tout dans une application web ou desktop (Electron).

Il s'adresse aux développeurs solo et aux petites équipes qui souhaitent un assistant IA local, sécurisé, capable de lire, écrire et exécuter du code dans leur propre workspace, sans envoyer leurs fichiers vers des services tiers non contrôlés.

![Build](https://img.shields.io/badge/build-passing-brightgreen) ![Version](https://img.shields.io/badge/version-1.0.0-blue) ![License](https://img.shields.io/badge/license-BUSL--1.1-orange) ![Node](https://img.shields.io/badge/node-%3E%3D20-green) ![Electron](https://img.shields.io/badge/electron-43-blueviolet)

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

---

### Utilisateur
- **Interaction vocale en temps réel** via Gemini Live API (WebSocket `/live`) avec choix de voix
- **Éditeur de code Monaco** avec coloration syntaxique, multi-onglets, et arborescence de fichiers
- **Terminal interactif** intégré dans l'interface
- **Agent Brain** : cerveau central qui décompose et exécute des objectifs complexes dynamiquement *(nouveau)*
- **Agents autonomes** : délégation de tâches à des agents spécialisés (coder, architect, refactor, tester, debugger, reviewer, researcher, vision, security, writer, planner…)
- **Orchestration multi-agents** avec gestion des dépendances (DAG) et collaboration par patterns
- **Boucle d'auto-correction** : les agents détectent et réparent leurs propres erreurs de façon autonome
- **Sandbox sécurisé** : toutes les modifications de l'IA sont isolées et soumises à validation avant application
- **Partage d'écran et webcam** vers le modèle Gemini pour interaction visuelle
- **Notebooks RAG** : ingestion de documents (PDF, texte) et chat contextuel avec recherche sémantique
- **Historique des conversations** persisté dans Supabase avec recherche full-text
- **Mémoire hiérarchique** : court-terme (session), moyen-terme (projet), long-terme (Supabase pgvector)
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

## Architecture des Agents

Leanna dispose d'un système multi-agents complet organisé en 3 couches :

```
┌─────────────────────────────────────────────┐
│              Agent Brain (nouveau)          │
│   Compréhension → Décomposition → Planif.  │
│   → Sélection agents/skills/outils         │
│   → Exécution → Vérification → Correction  │
└────────────────┬────────────────────────────┘
                 │ orchestre dynamiquement
┌────────────────▼────────────────────────────┐
│           AgentOrchestrator                 │
│   delegateTask · orchestrate · brainPlan   │
│   collaborateByPattern · brainExecute      │
└────────────────┬────────────────────────────┘
                 │ exécute via
┌────────────────▼────────────────────────────┐
│       Agents spécialisés (15 rôles)         │
│                                             │
│  Code & Ingénierie    │  Rédaction & Docs   │
│  ─────────────────    │  ──────────────────  │
│  coder                │  writer             │
│  refactor             │  formatter          │
│  debugger             │  researcher         │
│  reviewer             │  proofreader        │
│  tester               │  translator         │
│  security             │  summarizer         │
│  architect            │  planner            │
│  vision               │                     │
└─────────────────────────────────────────────┘
```

**Délégation dynamique** (via matrice de délégation) : `coder` → `tester` → `reviewer` ; `planner` → `coder, researcher, writer` ; etc.

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
│   └── splash.html         # Splash screen de démarrage
├── server/                 # Backend Express (Node.js)
│   ├── agents/             # Orchestrateur et flotte d'agents autonomes
│   │   ├── brain/          # 🧠 Agent Brain (nouveau)
│   │   │   ├── types.ts                 # Types et interfaces Brain
│   │   │   ├── GoalUnderstandingEngine.ts # Compréhension de l'objectif
│   │   │   ├── DynamicPlanner.ts        # Décomposition DAG dynamique
│   │   │   ├── BrainVerifier.ts         # Vérification multi-niveaux
│   │   │   ├── BrainCorrectionLoop.ts   # Boucle d'auto-correction
│   │   │   ├── AgentBrain.ts            # Coordinateur central
│   │   │   └── AgentBrain.test.ts       # 20 tests unitaires
│   │   ├── AgentOrchestrator.ts         # Façade orchestration + Brain
│   │   ├── AgentExecutor.ts             # Exécution de tâches
│   │   ├── DelegationManager.ts         # Délégation structurée JSON
│   │   ├── AutonomousAgent.ts           # Base class agents autonomes
│   │   ├── AgentCommunication.ts        # Matrice de délégation
│   │   └── roles.ts                     # Définitions des 15 rôles
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
│   │   └── agents.ts       # API REST agents + /brain/plan /brain/execute
│   ├── runtime/            # SkillManagerV2, ToolRegistry, Observability
│   ├── skills/             # Skills natifs (25+) dont agent_brain
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
  -d '{"goal": "Modernise mon site et rends le header responsive"}'

# Exécuter de bout en bout
curl -X POST http://localhost:4000/api/agents/brain/execute \
  -H "Content-Type: application/json" \
  -d '{"goal": "Fix le crash au démarrage", "maxCorrectionAttempts": 3}'

# Suivre l'avancement
curl http://localhost:4000/api/agents/brain/status/<planId>
```

---

## Documentation

- [README.md](README.md) — Vue d'ensemble et installation
- [API_DOCS.md](API_DOCS.md) — Référence complète de l'API REST et WebSockets
- [ARCHITECTURE.md](ARCHITECTURE.md) — Architecture technique détaillée
- [CONTRIBUTING.md](CONTRIBUTING.md) — Guide de contribution et conventions
- [TESTING.md](TESTING.md) — Stratégie de test, patterns et couverture
- [DB_SCHEMA.md](DB_SCHEMA.md) — Schéma de base de données Supabase
- [ROADMAP.md](ROADMAP.md) — Feuille de route du projet
- [SELF_IDE.md](SELF_IDE.md) — Auto-hébergement et développement de Leanna avec Leanna

---

## Contribuer

Consultez [CONTRIBUTING.md](CONTRIBUTING.md) pour le workflow Git, les conventions de code et le processus de review.

---

## Licence

Ce projet est distribué sous licence **BUSL 1.1** (Business Source License 1.1).

Voir le fichier [LICENSE](LICENSE) pour les conditions complètes.
