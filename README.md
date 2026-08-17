# 🧠 Jarvis-OS — L'IDE universel piloté par l'IA

<img src="assets/images/header.png" alt="Jarvis-OS" />

Jarvis-OS est un système d'exploitation de développement et un IDE multimodal en temps réel conçu pour les développeurs modernes. Il combine une interface de bureau immersive avec une interaction vocale et visuelle permanente. Il permet d'importer instantanément n'importe quel projet local pour l'indexer, le modifier en toute sécurité au sein d'une Sandbox isolée, et déléguer des tâches complexes à des agents autonomes. C'est l'assistant idéal pour accélérer le prototypage, l'audit de code et la refactorisation de projets complexes.

---

## 🛡️ Badges

[![Version](https://img.shields.io/badge/version-0.4.0-blue)](https://github.com/yourusername/Jarvis-os-original/releases)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](#)
[![License](https://img.shields.io/badge/license-MIT-green)](CONTRIBUTING.md#licence)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.12.0-brightgreen)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## 🛠️ Stack Technique

| Technologie | Rôle / Utilisation | Version |
| :--- | :--- | :--- |
| **Node.js** | Environnement d'exécution serveur (Backend) | `>= 22.12.0` |
| **Express** | Framework d'API REST et gestion des serveurs WebSocket | `^4.21.2` |
| **React** | Framework de construction de l'interface utilisateur | `^19.0.1` |
| **TypeScript** | Langage principal de développement (Mode strict) | `^5.0.0` |
| **Vite** | Outil de build rapide et serveur HMR frontend | `^6.2.3` |
| **Tailwind CSS** | Framework CSS utilitaire pour le design system | `^4.1.14` |
| **Electron** | Wrapper desktop pour l'exécution locale de bureau | `^43.1.0` |
| **Supabase JS** | Client de persistance des conversations, listes et RAG | `^2.110.2` |
| **Monaco Editor** | Moteur d'édition de code (identique à VS Code) | `^0.53.0` |
| **Google GenAI** | SDK officiel pour l'intégration de Gemini Live (WebSocket) | `^2.4.0` |
| **Puppeteer** | Automatisation de navigateur et agent de test web | `^25.3.0` |
| **Motion** | Animations et transitions fluides dans l'UI | `^12.23.24` |

---

## ✨ Fonctionnalités Principales

### 💻 IDE Intégré (Developer-centric)

- **Éditeur Monaco complet** : Coloration syntaxique, IntelliSense, onglets multiples, breadcrumb de navigation, et raccourcis clavier identiques à VS Code.
- **Explorateur de fichiers virtualisé** : Navigation fluide dans les arborescences de projet volumineuses avec renommage, création, suppression et déplacement de fichiers.
- **Bac à sable sécurisé (Sandbox)** : Toutes les écritures de l'IA sont isolées dans `.jarvis/sandbox/` et ne sont appliquées au workspace réel qu'après validation explicite. Visualiseur de diff intégré avant synchronisation.
- **Palette de commandes** : Raccourcis clavier complets (`Ctrl+Shift+P`, `Ctrl+P`) pour piloter l'IDE sans souris.
- **Recherche globale** : Recherche de texte dans tous les fichiers du projet avec navigation directe aux résultats.
- **Visualiseur Markdown** : Aperçu HTML enrichi de la documentation avec bascule rapide code/preview.
- **Diff Viewer** : Comparaison côte-à-côte des modifications avant validation.

### 🧠 Moteur de Connaissance (Knowledge Engine)

- **Graphe de connaissances** : Indexation complète du code source — entités, exports, imports, relations entre fichiers.
- **Graphe de dépendances** : Analyse des imports/exports avec détection automatique de cycles.
- **Analyse d'impact** : Évaluation automatique des fichiers impactés par une modification donnée.
- **Recherche sémantique TF-IDF** : Recherche locale intelligente dans la base de code sans API externe.
- **Indexation incrémentale** : FileWatcher qui met à jour le graphe en temps réel à chaque modification.
- **Moteur d'apprentissage** : Accumulation automatique de faits structurels sur le projet (patterns, conventions, architecture).
- **Dashboard Knowledge** : Visualisation des statistiques du graphe, santé du système, et relations entre entités.

### 🎙️ Assistant Multimodal (Gemini Live)

- **Interaction vocale fluide** : Communication audio bidirectionnelle en temps réel via WebSocket avec Gemini.
- **Vision par webcam** : L'IA peut voir et analyser le flux vidéo de la webcam en temps réel.
- **Partage d'écran** : Capture et envoi de frames de l'écran ou de fenêtres spécifiques à l'IA.
- **Chat textuel** : Interface de conversation complète avec historique, slash commands et mentions de fichiers.
- **Résumé automatique de contexte** : Compression intelligente de la conversation quand le seuil de tokens est atteint.
- **Pool de clés Gemini** : Rotation automatique entre plusieurs clés API en cas d'erreur 429 (rate limit).

### 🤖 Système Multi-Agents

- **Orchestrateur d'agents** : Planification, délégation et suivi de tâches complexes décomposées en sous-tâches.
- **Agents autonomes** : Boucle de décision autonome avec supervision pour l'exécution de missions multi-étapes.
- **Agent Builder** : Interface de création d'agents personnalisés via prompt IA.
- **Persistance et recovery** : Restauration automatique des tâches agents après un crash serveur (Supabase).
- **Communication inter-agents** : Bus de messages et protocole de délégation entre agents.
- **Boucle de réparation** : Auto-correction des agents en cas d'erreur d'exécution.

### ⚙️ Automatisation & Workflows

- **Gestionnaire de workflows** : Création, planification et exécution de suites d'actions automatisées.
- **Tâches planifiées** : Exécution différée ou récurrente de tâches (cron-like).
- **Automatisation navigateur** : Puppeteer intégré pour les tests web, le scraping et l'interaction avec des pages.
- **Workflow d'audit** : Workflow automatique qui enregistre et analyse les actions du système.

### 🔌 Passerelle MCP (Model Context Protocol)

- **Connexion à chaud** : Ajout/suppression de serveurs MCP externes en stdio ou SSE sans redémarrage.
- **Reconnexion automatique** : Gestion transparente des déconnexions et reconnexions.
- **Appel d'outils** : Invocation des outils MCP depuis l'IA avec métriques de performance.
- **Interface de gestion** : Panneau UI dédié pour configurer, activer/désactiver et monitorer les serveurs MCP.

### 🧩 Skills & Function Calling

- **Skills intégrées** : time, weather, git, github, list, memory, automation, system, reasoning, codebase, history, mission, knowledge, workflow, agents, guidelines, verify, chainOfThought, documentLinker.
- **Skills personnalisées** : Création dynamique de compétences via l'interface (custom skills) ou fichiers `.aionrs/skills/`.
- **LiveSkills Monitor** : Visualisation en temps réel des outils appelés par l'IA pendant une session.
- **Skill Manager** : Registre centralisé avec déclarations d'outils pour le function calling Gemini.

### 📂 Gestion de Documents

- **Upload de documents** : Import de fichiers PDF, DOCX et texte dans le contexte de l'IA.
- **Parsing PDF** : Extraction automatique du contenu textuel des PDFs (pdf-parse).
- **Lien de documents** : Association de documents de référence aux conversations et projets.

### 🔐 Sécurité & Audit

- **Authentification API** : Protection des endpoints via jeton `x-jarvis-token`.
- **Rate limiting** : Limitation de débit par IP sur toutes les routes sensibles.
- **Garde anti-injection** : Détection de tentatives d'injection de prompt.
- **Chiffrement** : Variables d'environnement sensibles chiffrées dans `.env`.
- **Log d'audit** : Enregistrement JSON-line de toutes les actions (fichier `.jarvis-audit.log`).
- **Code de sortie sandbox** : Code à 6 chiffres requis pour quitter le mode sandbox.

### 💾 Persistance (Supabase — optionnel)

- **Historique de conversations** : Conservation et reprise des sessions de chat.
- **Mémoire long terme (RAG)** : Stockage vectoriel des préférences et décisions de conception.
- **Listes** : Listes persistantes (todo, bookmarks, notes) accessibles par l'IA.
- **Workflows persistés** : Sauvegarde et restauration des workflows en base de données.

---

## 📋 Prérequis

- **Node.js** : Version `>= 22.12.0`
- **npm** : Version `>= 10.x`
- **Git** : Installé (requis pour les checkpoints et le panneau Git)
- **Clé API Gemini** : Un compte Google AI Studio valide avec une clé d'API
- **Compte Supabase** (Optionnel) : Pour l'historique, la mémoire vectorielle RAG et les listes

---

## 📦 Installation

```bash
# 1. Cloner le dépôt
git clone https://github.com/yourusername/Jarvis-os-original.git
cd Jarvis-os-original

# 2. Installer les dépendances
npm install

# 3. Configurer l'environnement
cp .env.example .env
# --> Ouvrir .env et renseigner au minimum GEMINI_API_KEY
```

---

## ⚙️ Configuration (.env)

| Variable | Description | Obligatoire |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Clé API pour le modèle principal Gemini. | **Oui** |
| `OPENROUTER_API_KEY` | Clé pour exploiter d'autres modèles en fallback via OpenRouter. | Non |
| `JARVIS_API_TOKEN` | Jeton pour sécuriser les appels API (header `x-jarvis-token`). | Recommandé |
| `SUPABASE_URL` | URL de l'API REST Supabase. | Non (RAG inactif) |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé secrète de rôle de service Supabase. | Non (RAG inactif) |
| `GITHUB_TOKEN` | Jeton GitHub pour la gestion des Pull Requests et dépôts. | Non |
| `VITE_SERVER_PORT` | Port d'écoute du serveur (défaut : 5000). | Non |
| `SELF_HEAL_READONLY` | Désactive les écritures automatiques lors d'une auto-guérison. | Non |
| `SANDBOX_EXIT_CODE` | Code à 6 chiffres pour sortir du mode sandbox. | Non |

> ⚠️ `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` doivent être définies ensemble. Si une seule est présente, le serveur refusera de démarrer.

---

## 🚀 Lancement

### Mode Développement (Web)
```bash
npm run dev
```
Interface accessible sur `http://localhost:5000`.

### Mode Desktop (Electron)
```bash
npm run desktop:debug
```

### Mode Production
```bash
# Compiler frontend (Vite) + backend (esbuild)
npm run build

# Lancer le serveur optimisé
npm start
```

### Packager en exécutable Windows
```bash
npm run dist:win
```

---

## 📁 Structure du Projet

```
Jarvis-os-original/
├── assets/                  # Ressources statiques (images, icônes)
├── electron/                # Cycle de vie Electron (main, preload, splash)
├── server/                  # Backend Node.js / Express
│   ├── agents/              # Orchestrateur multi-agents, délégation, persistence
│   ├── autonomy/            # Superviseur de boucle de décision autonome
│   ├── knowledge/           # KnowledgeGraph, DependencyGraph, SemanticSearch, Indexer
│   ├── mcp/                 # Bridge MCP (stdio/SSE), config, client
│   ├── mission/             # Planification et réflexion de missions multi-étapes
│   ├── routes/              # 30+ endpoints REST modulaires
│   ├── runtime/             # Runtime V2 (ToolRegistry, AgentLoader, Observability)
│   ├── skills/              # Function calling : 20+ skills intégrées + custom
│   ├── utils/               # Sandbox, checkpoint, crypto, validation, key pool
│   └── workflows/           # Moteur de workflows automatisés
├── src/                     # Interface utilisateur React
│   ├── components/          # 60+ composants (IDE, panels, sandbox, orb)
│   ├── context/             # États partagés (LiveAPI, Profile, ScreenShare)
│   ├── hooks/               # Hooks React (useLiveAPI, useFileSystem, useToken...)
│   ├── services/            # Clients HTTP vers le backend (ideApi, etc.)
│   ├── stores/              # Stores globaux (agentActivity)
│   └── views/               # Vues principales de l'application
└── supabase/                # Schémas SQL de la base de données
```

---

## 🖥️ Vues de l'Application

| Vue | Description |
| :--- | :--- |
| **IDE** | Éditeur de code complet avec chat, agents, sandbox, knowledge, MCP, workflows |
| **GitHub** | Commits, issues et pull requests du dépôt détecté |
| **Automation** | Gestion des workflows et tâches planifiées |
| **History** | Historique des conversations avec l'IA |
| **Memories** | Mémoire long terme et faits appris par l'IA |
| **Lists** | Listes persistantes (todo, bookmarks, notes) |
| **Settings** | Configuration du profil, clés API, comportement IA |
| **Help** | Documentation et raccourcis clavier |

---

## 🤝 Contribuer

Les contributions sont les bienvenues ! Consultez [CONTRIBUTING.md](CONTRIBUTING.md) pour le workflow Git, les règles de commit et les standards de développement.

---

## 📄 Licence

Ce projet est distribué sous licence MIT.
