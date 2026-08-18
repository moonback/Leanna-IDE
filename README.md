<p align="center">
  <img src="assets/images/header.png" alt="Jarvis OS" width="100%" />
</p>

<h1 align="center">🧠 Jarvis OS</h1>

<p align="center">
  <strong>Système d'exploitation IA multimodal — IDE intelligent, agents autonomes & notebooks RAG</strong>
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

## 📋 Table des matières

- [Présentation](#-présentation)
- [Stack technique](#-stack-technique)
- [Fonctionnalités](#-fonctionnalités)
- [Screenshots](#-screenshots)
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

## 🎯 Présentation

Jarvis OS est un **environnement de développement IA** tout-en-un, conçu comme un OS desktop intelligent. Il combine :

- Un **IDE complet** (Monaco Editor, explorateur, recherche, Git)
- Un **assistant IA multimodal** (voix en temps réel, webcam, partage d'écran via Gemini Live)
- Un **système multi-agents** spécialisé dans la rédaction et le traitement documentaire
- Des **notebooks RAG** (concurrent de NotebookLM — ingestion de sources, chat avec citations, génération de contenu)
- Un **moteur de workflows** et d'automatisation avec planification de missions autonomes
- Une **passerelle MCP** (Model Context Protocol) pour connecter des outils externes

Le projet fonctionne en mode **self-referential** : Jarvis gère et améliore son propre code source.

---

## 🔧 Stack technique

| Couche | Technologies |
|--------|-------------|
| **Frontend** | React 19, React Router 7, Tailwind CSS 4, Monaco Editor, Motion (animations), Lucide React |
| **Backend** | Node.js, Express 4, WebSocket (ws), multer |
| **IA** | Google Gemini (SDK `@google/genai`), OpenRouter (multi-modèles), embeddings `gemini-embedding-001` |
| **Desktop** | Electron 43, electron-builder (NSIS Windows) |
| **Bundling** | Vite 6, esbuild, tsx |
| **Persistance** | Système de fichiers JSON, Supabase (optionnel) |
| **Autres** | pdf-parse, puppeteer (scraping), marked (Markdown), mermaid (diagrammes), react-window (virtualisation) |

---

## ✨ Fonctionnalités

### 💻 IDE Intelligent

- Éditeur Monaco (syntaxe, autocomplétion, multi-fichiers, multi-onglets)
- Explorateur de fichiers avec arbre interactif
- Recherche globale dans le projet (Ctrl+Shift+F)
- Terminal intégré avec exécution de commandes
- Intégration Git (branches, commits, diff visuel)
- Sandbox IA isolé pour les modifications assistées (validation avant merge)

### 🎙️ Assistant Multimodal (Gemini Live)

- **Voix en temps réel** : Dictée, commandes vocales, réponses audio
- **Vision webcam** : Analyse de documents physiques ou schémas manuscrits
- **Partage d'écran** : Capture et interprétation du contenu affiché
- **Chat textuel** : Conversation avec historique, streaming SSE, contexte persistant
- **Orb flottant** : Interface minimale accessible depuis n'importe quelle page

### 🤖 Système Multi-Agents

7 agents documentaires spécialisés avec orchestration automatique :

| Agent | Rôle | Capacité |
|-------|------|----------|
| ✍️ **Rédacteur** | Rédaction de documents complets | Lecture/Écriture |
| 🎨 **Mise en forme** | Formatage Markdown, tables, TOC | Lecture/Écriture |
| 🔍 **Recherche** | Collecte d'infos, vérification de faits | Lecture seule |
| ✅ **Correcteur** | Orthographe, grammaire, cohérence | Lecture/Écriture |
| 🌐 **Traducteur** | Traduction et localisation multilingue | Lecture/Écriture |
| 📋 **Synthèse** | Résumés exécutifs, abstracts | Lecture/Écriture |
| 📐 **Planificateur** | Plans, outlines, structures | Lecture seule |

**Patterns de collaboration :**
- `document-complet` : Planificateur → Rédacteur → Correcteur → Mise en Forme
- `traduction-verifiee` : Rédacteur → Traducteur → Correcteur
- `recherche-redaction` : Recherche → Planificateur → Rédacteur → Correcteur

**Flotte d'agents autonomes** et **missions planifiées** pour des tâches complexes multi-étapes.

### 📓 Notebooks RAG (style NotebookLM)

- **Sources multiples** : Upload fichiers (PDF, DOCX, MD, HTML, CSV, JSON, YAML), ingestion d'URLs, texte collé, paste depuis le presse-papier
- **Recherche hybride** : Embeddings sémantiques (Gemini) + TF-IDF lexical + Reciprocal Rank Fusion + Re-ranking LLM (5 stratégies de parsing)
- **Chat groundé** : Questions/réponses avec citations précises et score de pertinence
- **Conversations multiples** : Threads de chat séparés par notebook, switch instantané, titrage automatique
- **Deep Dive** : Mode exploration approfondie multi-étapes
- **Comparaison de sources** : Analyse des similitudes, différences et contradictions entre 2+ sources
- **Extraction d'insights** : Détection automatique des tendances, connexions cachées et points de vigilance
- **Mode Focus Sources** : Sélectionner quelles sources utiliser pour une question spécifique
- **Personnalités IA** : 6 tons disponibles (Standard, Académique, Vulgarisateur, Concis, Détaillé, Créatif)
- **Commandes slash** : `/résume`, `/compare`, `/quiz`, `/insights`, `/glossaire`, `/plan`
- **Voice Input** : Dictée vocale via Web Speech API (français)
- **TTS** : Lecture audio des réponses avec contrôle play/stop
- **Retry / Regenerate** : Régénérer une réponse en un clic
- **Edit & Resend** : Modifier un message utilisateur et relancer la conversation
- **Copy to clipboard** : Copier n'importe quelle réponse
- **Feedback** : Thumbs up/down pour noter la qualité des réponses
- **Stop streaming** : Arrêter la génération en cours avec sauvegarde partielle
- **Token counter** : Estimation en temps réel des tokens utilisés par conversation
- **Sauvegarde en notes** : Enregistrer une réponse du chat directement dans les notes du notebook
- **Génération de contenu** :
  - Résumé synthétique
  - FAQ (15-20 Q&R)
  - Guide d'étude (concepts, quiz, auto-évaluation)
  - Briefing exécutif
  - Chronologie
  - Plan structuré
  - Carte mentale (rendu Mermaid visuel)
  - Analyse SWOT (forces, faiblesses, opportunités, menaces)
  - Glossaire (termes techniques, acronymes)
- **Génération en streaming** : Contenu affiché en temps réel avec design pro
- **Filtrage de sources** : Sélection des sources spécifiques pour la génération
- **Instructions personnalisées** : Prompt custom pour guider le style et le focus
- **Import au workspace** : Exporter un document généré directement dans le projet
- **Export Markdown** : Télécharger tout document en fichier .md
- **Régénérer** : Relancer la génération si le résultat ne convient pas
- **Audio Overview** : Script de podcast IA (deux hôtes discutent de vos sources)
  - Vitesse de lecture variable (1x → 2x)
  - Progression synchronisée (karaoké)
  - Download du script en Markdown
  - Personnalisation du ton et instructions custom
- **Notes avancées** :
  - Templates (Cornell, Résumé, To-do, Compte-rendu)
  - Recherche full-text et tri (récentes, anciennes, A→Z)
  - Export de toutes les notes en Markdown
  - Épinglage et organisation
  - **Vue Canvas** : Espace 2D pour organiser visuellement les notes (drag & drop, zoom, pan)
  - **Backlinks** : Détection automatique des mentions entre notes avec liens visuels
- **Sources** :
  - Preview du contenu inline
  - Re-indexing (re-embed après mise à jour du modèle)
  - Tags custom (ajout/suppression inline)
  - Paste depuis le presse-papier
- **UX** :
  - Skeletons de loading cohérents
  - Breadcrumb navigation (Notebooks > Titre > Onglet)
  - Raccourcis clavier (Ctrl+1-5 onglets, Ctrl+N notes, Ctrl+F chat)
  - Formatage riche des réponses (bold, italic, code, tables, blockquotes, liens)

### 🧠 Moteur de Connaissances

- Indexation automatique du workspace (fichiers, code, dépendances)
- Graphe de relations entre fichiers et entités
- Recherche sémantique sans API externe
- Analyse d'impact avant modification
- Détection de contradictions entre documents
- Mémoire projet (conventions, préférences de style)

### ⚙️ Automatisation & Workflows

- Workflows documentaires orchestrés (pipelines de traitement)
- Tâches planifiées (cron-like) avec déclencheurs
- Missions autonomes avec planification IA
- Exécution parallèle ou séquentielle avec dépendances

### 🏗️ Infrastructure Backend

- **Rate limiting ciblé** : Limiteurs dédiés pour chat (30 req/min), embeddings (50/5min), polling (relaxé), auth (strict)
- **Gestion mémoire intelligente** : LRU éviction des embeddings par notebook, lazy loading depuis le disque, limite configurable (50K vecteurs/~50MB)
- **Backup automatique** : Sauvegarde incrémentale toutes les 30 min, rotation (10 backups max), restauration par notebook ou globale
- **Queue de processing** : File d'attente pour l'ingestion de sources (concurrence ×2, retry exponentiel, priorités, annulation)
- **Cache intelligent** : Cache LRU avec TTL + matching par similarité Jaccard pour les questions proches, invalidation auto quand les sources changent

### 🔌 Passerelle MCP

- Connexion à chaud de serveurs MCP (stdio & SSE)
- Invocation d'outils externes depuis l'IA
- Interface de gestion intégrée

### 📄 Gestion Documentaire

- Création assistée de documents structurés
- Templates intelligents (MVP, rapport, cahier des charges, specs, roadmap)
- Export multi-format (Markdown, PDF, DOCX)
- Analyse croisée de documents
- Versionning avec rollback

### 🔗 Intégrations

- **GitHub** : Repos, issues, PRs, review
- **Supabase** : Persistance, mémoire long terme
- **OpenRouter** : Modèles alternatifs (GPT-4o, Claude, etc.)

---

## 📸 Screenshots

<p align="center">
  <img src="assets/Screen/ide.PNG" alt="IDE View" width="90%" />
</p>

---

## 📦 Installation

### Prérequis

- **Node.js** ≥ 22.12.0
- **npm** ≥ 10.x
- **Clé API Gemini** (Google AI Studio)

### Étapes

```bash
# 1. Cloner le dépôt
git clone https://github.com/yourusername/Jarvis-OS.git
cd Jarvis-OS

# 2. Installer les dépendances
npm install

# 3. Configurer l'environnement
cp .env.example .env
# Renseigner au minimum GEMINI_API_KEY dans .env
```

---

## ⚙️ Configuration

### Variables d'environnement (.env)

| Variable | Description | Obligatoire |
|----------|-------------|:-----------:|
| `GEMINI_API_KEY` | Clé API Google Gemini | ✅ |
| `JARVIS_API_TOKEN` | Token de sécurité des endpoints | Recommandé |
| `SUPABASE_URL` | URL de l'instance Supabase | Non |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service Supabase | Non |
| `OPENROUTER_API_KEY` | Clé OpenRouter (modèles alternatifs) | Non |
| `GITHUB_TOKEN` | Token GitHub (repos, issues, PRs) | Non |
| `ENABLE_CHAIN_OF_THOUGHT` | Afficher le raisonnement IA (true/false) | Non |
| `SANDBOX_EXIT_CODE` | Code de sécurité pour sortir du sandbox | Non |

### Pool de clés Gemini

Jarvis OS supporte un **pool de clés API** avec rotation automatique (round-robin + retry sur 429). Les clés sont stockées chiffrées dans `.gemini-keys.json`. Gestion via l'UI Paramètres.

---

## 🚀 Lancement

### Mode Web (développement)

```bash
npm run dev
```

Serveur accessible sur `http://localhost:5000`

### Mode Desktop (Electron)

```bash
# Avec DevTools
npm run desktop:debug

# Sans DevTools
npm run desktop
```

### Mode Production

```bash
npm run build
npm start
```

### Build installateur Windows

```bash
npm run dist:win
```

Génère un `.exe` (NSIS) dans le dossier `release/`.

---

## 🏗️ Architecture

```
Jarvis-OS/
├── assets/                    # Images, icônes
├── electron/                  # Process principal Electron (main, preload, splash)
├── server/                    # Backend Express + WebSocket
│   ├── agents/                # Orchestrateur multi-agents & fleet
│   ├── autonomy/              # Boucle autonome supervisée
│   ├── knowledge/             # Indexation, graphe, recherche sémantique
│   ├── mcp/                   # Bridge MCP (stdio/SSE)
│   ├── mission/               # Planificateur de missions autonomes
│   ├── notebooks/             # RAG Engine, EmbeddingStore, GroundedChat, ContentGenerator, BackupService, ProcessingQueue, ResponseCache
│   ├── prompts/               # Instructions système (SystemPromptBuilder)
│   ├── routes/                # 32 fichiers de routes REST (incl. threads, tags, reindex, feedback)
│   ├── runtime/               # ToolRegistry, AgentPlugins, SkillManagerV2
│   ├── skills/                # 20+ skills IA (codebase, git, memory, automation...)
│   ├── utils/                 # Logger, crypto, sandbox, validation, key pool
│   └── workflows/             # Moteur de workflows documentaires
├── src/                       # Frontend React
│   ├── components/            # 60+ composants (IDE, notebooks, panels, sidebar, UI, Skeleton, Canvas)
│   ├── config/                # Configuration sidebar, thèmes
│   ├── context/               # Providers (Theme, Profile, LiveAPI, ScreenShare)
│   ├── hooks/                 # Hooks (useLiveAPI, useProfile, useTheme...)
│   ├── services/              # Clients HTTP
│   ├── types/                 # Types centralisés (notebook.ts)
│   └── views/                 # 10 vues (IDE, Notebooks, Memories, Settings, etc.)
├── server-bootstrap.ts        # Point d'entrée serveur (env, crypto, validation)
├── index.html                 # Shell HTML Vite
├── package.json               # Scripts, dépendances
└── vite.config.ts             # Configuration Vite + plugins
```

---

## 🌐 API Backend

35 groupes de routes REST disponibles :

| Route | Description |
|-------|-------------|
| `/api/agents` | Orchestration multi-agents |
| `/api/automation` | Tâches planifiées & automatisation |
| `/api/conversations` | Sessions de chat |
| `/api/custom-agents` | Agents personnalisés (Agent Builder) |
| `/api/custom-skills` | Skills créées par l'utilisateur |
| `/api/documents` | Gestion et analyse documentaire |
| `/api/git` | Opérations Git (status, commit, branches) |
| `/api/github` | Intégration GitHub (repos, issues, PRs) |
| `/api/health` | Monitoring & santé système |
| `/api/ide` | Opérations IDE (fichiers, terminal) |
| `/api/impact` | Analyse d'impact avant modification |
| `/api/knowledge` | Base de connaissances, indexation |
| `/api/lists` | Listes et to-do |
| `/api/mcp` | Gestion des serveurs MCP |
| `/api/memories` | Mémoire long terme |
| `/api/notebooks` | Notebooks RAG (sources, chat, génération, audio) |
| `/api/notebooks/backup` | Backup & restauration automatique des notebooks |
| `/api/notebooks/queue` | File d'attente de processing des sources |
| `/api/notebooks/cache` | Statistiques & contrôle du cache intelligent |
| `/api/profile` | Profil utilisateur, préférences IA |
| `/api/safeguards` | Garde-fous de sécurité |
| `/api/sandbox` | Environnement sandbox isolé |
| `/api/skills` | Registry des outils IA |
| `/api/workflows` | Moteur de workflows |
| `/api/workspace` | Gestion du workspace |

---

## 🛠️ Skills & Outils IA

L'IA dispose de 20+ skills regroupées par domaine :

| Skill | Outils fournis |
|-------|---------------|
| **codebase** | Lecture/écriture de fichiers, recherche, refactoring |
| **git** | Status, commit, push, branches, diff |
| **github** | Issues, PRs, repos, review |
| **automation** | Créer/lister/supprimer des tâches planifiées, navigation web |
| **knowledge** | Indexation, recherche sémantique, graphe de dépendances |
| **memory** | Stockage/récupération de mémoires persistantes |
| **mission** | Planification et exécution de missions autonomes |
| **agents** | Délégation à des agents spécialisés |
| **reasoning** | Chain-of-thought, décomposition de problèmes |
| **workflow** | Exécution de pipelines documentaires |
| **verify** | Validation et tests |
| **system** | Commandes système, monitoring |
| **time** | Gestion du temps, timestamps |
| **weather** | Informations météo |
| **guidelines** | Conventions de code, style guides |
| **history** | Historique des sessions |
| **list** | Gestion de listes |
| **project** | Métadonnées projet |
| **customSkills** | Skills définies par l'utilisateur |

---

## 🔐 Sécurité

- **Authentification** : Token `x-jarvis-token` sur tous les endpoints API
- **Chiffrement** : Clés API et secrets chiffrés au repos (AES)
- **Sandbox** : Modifications IA isolées, validation manuelle avant merge
- **Rate limiting** : Protection multi-couche (global strict, polling relaxé, auth brute-force, notebook chat/embedding dédié)
- **Audit trail** : Journalisation de toutes les actions sensibles
- **Circuit breaker** : Protection côté client contre les cascades d'erreurs réseau
- **Injection guards** : Protection contre l'injection de prompts
- **Backup & Recovery** : Sauvegarde automatique incrémentale avec restauration granulaire
- **Memory management** : Éviction LRU pour prévenir les fuites mémoire sur les embeddings

---

## 🤝 Contribution

Les contributions sont les bienvenues !

```bash
# Lancer les tests
npm test

# Lancer le linter
npm run lint

# Build complet
npm run build
```

### Guidelines

- TypeScript strict partout
- Commits conventionnels (feat:, fix:, refactor:, docs:)
- Tests unitaires pour les nouvelles skills
- Documentation des endpoints REST

---

## 📄 Licence

Distribué sous licence **MIT**. Voir [LICENSE](LICENSE) pour plus de détails.

---

<p align="center">
  <sub>Construit avec ❤️ et beaucoup de Gemini par l'équipe Jarvis OS</sub>
</p>
