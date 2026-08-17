# 🧠 Jarvis-OS — L'IDE universel piloté par l'IA
<img src="assets/images/header.png" alt="Jarvis-OS" />
Jarvis-OS est un système d'exploitation de développement et un IDE multimodal en temps réel conçu pour les développeurs modernes. Il combine une interface de bureau immersive avec une interaction vocale et visuelle permanente basée sur l'API Gemini Live. Il permet d'importer instantanément n'importe quel projet local pour l'indexer, le modifier en toute sécurité au sein d'une Sandbox isolée, et déléguer des tâches complexes à des agents autonomes. C'est l'assistant idéal pour accélérer le prototypage, l'audit de code et la refactorisation de projets complexes.

---

## 🛡️ Badges

[![Version](https://img.shields.io/badge/version-0.4.0-blue)](https://github.com/yourusername/Jarvis-os-original/releases)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](#)
[![License](https://img.shields.io/badge/license-MIT-green)](file:///c:/Users/Mayss/Desktop/Jarvis-os-ori/CONTRIBUTING.md#licence)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.12.0-brightgreen)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](file:///c:/Users/Mayss/Desktop/Jarvis-os-ori/CONTRIBUTING.md)

---

## 🛠️ Stack Technique

| Technologie | Rôle / Utilisation | Version détectée |
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

---

## ✨ Fonctionnalités Principales

### 💻 Orientées Développeur (Developer-centric)
- **IDE Intégré Immersif** : Éditeur Monaco complet avec coloration, explorateur de fichiers virtuel et panneau Git.
- **Bac à Sable Sécurisé (Sandbox)** : Toutes les écritures de l'IA sont isolées dans `.jarvis/sandbox/` et ne sont appliquées au workspace réel qu'après validation.
- **Rationnalisation de Typecheck** : Validation automatique du code via `tsc --noEmit` avant de synchroniser le sandbox.
- **Checkpoints Git automatiques** : Sauvegarde locale automatique avant toute modification de fichier pour un rollback instantané.
- **Moteur de Connaissance** : Graphe de dépendances, analyse d'impact des modifications, et recherche sémantique TF-IDF locale.

### 🎙️ Orientées Utilisateur (User-centric)
- **Assistant Multimodal Gemini Live** : Interaction vocale fluide et vision par webcam/partage d'écran en temps réel via WebSocket.
- **Palette de commandes** : Raccourcis clavier complets (`Ctrl+Shift+P`, `Ctrl+P`) pour piloter l'IDE sans souris.
- **Visualiseur Markdown** : Mode d'aperçu HTML enrichi pour la documentation avec bascule rapide.
- **Mémoire long terme (RAG)** : Conservation automatique des préférences utilisateur et décisions de conception.

### ⚙️ Orientées Administrateur (Admin-centric)
- **Passerelle MCP (Model Context Protocol)** : Connexion à chaud de serveurs d'outils externes en stdio ou SSE avec reconnexion automatique.
- **Gestionnaire de Workflows** : Création et planification de suites d'actions automatisées persistées dans la base de données.
- **Créateur de Skills Dynamiques** : Interface de création de compétences personnalisées pour étendre le function calling de l'IA.
- **Audit de Sécurité** : Enregistrement de toutes les actions et modifications dans un fichier de log d'audit.

---

## 📋 Prérequis

- **Node.js** : Version `>= 22.12.0` installée sur le système.
- **npm** : Version `>= 10.x`.
- **Git** : Installé (requis pour les fonctionnalités de checkpointing local).
- **Clé API Gemini** : Un compte Google AI Studio valide avec une clé d'API.
- **Compte Supabase** (Optionnel) : Si vous souhaitez activer l'historique et la mémoire vectorielle RAG.

---

## 📦 Installation

Suivez les étapes ci-dessous pour installer et démarrer l'application localement.

```bash
# 1. Cloner le dépôt de Jarvis-OS
git clone https://github.com/yourusername/Jarvis-os-original.git
cd Jarvis-os-original

# 2. Installer les dépendances du projet
npm install

# 3. Préparer le fichier de configuration d'environnement
cp .env.example .env
# --> Ouvrir le fichier .env et renseigner au minimum la variable GEMINI_API_KEY
```

---

## ⚙️ Configuration (.env)

Voici la liste de toutes les variables d'environnement gérées par l'application :

| Variable | Description | Exemple | Obligatoire |
| :--- | :--- | :--- | :--- |
| `GEMINI_API_KEY` | Clé API requise pour utiliser le modèle principal Gemini. | `AIzaSy...` | **Oui** |
| `OPENROUTER_API_KEY` | Clé pour exploiter d'autres modèles en fallback via OpenRouter. | `sk-or-...` | Non |
| `JARVIS_API_TOKEN` | Jeton pour sécuriser les appels d'API (header `x-jarvis-token`). | `mypassword123` | Recommandé |
| `SUPABASE_URL` | URL de l'API REST de votre base de données Supabase. | `https://xyz.supabase.co` | Non (RAG inactif) |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé secrète de rôle de service de Supabase. | `eyJhbGc...` | Non (RAG inactif) |
| `GITHUB_TOKEN` | Jeton GitHub pour la gestion des Pull Requests et dépôts. | `ghp_...` | Non |
| `VITE_SERVER_PORT` | Port d'écoute du serveur Node/Express. | `5000` | Non (défaut : 5000) |
| `SELF_HEAL_READONLY` | Désactive les écritures automatiques lors d'une auto-guérison. | `true` | Non (défaut : false) |
| `SANDBOX_EXIT_CODE` | Code à 6 chiffres pour sortir du mode sandbox dans l'IDE. | `123456` | Non |

> ⚠️ **Note Supabase** : `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` doivent être définies ensemble. Si une seule des deux est présente, le serveur refusera de démarrer.

---

## 🚀 Lancement de l'Application

### Mode Développement (Web)
Pour lancer le backend Express combiné au serveur HMR de Vite :
```bash
npm run dev
```
L'interface sera alors accessible dans votre navigateur à l'adresse `http://localhost:5000`.

### Mode Desktop (Electron)
Pour exécuter l'application sous forme de client lourd de bureau local :
```bash
# Lancement de l'interface en mode débogage avec DevTools
npm run desktop:debug
```

### Mode Production (Compilation & Lancement)
Pour builder le bundle de production et lancer le serveur optimisé :
```bash
# Compiler le frontend (Vite) et bundler le serveur (esbuild)
npm run build

# Démarrer le serveur web compilé
npm start
```

Pour packager l'application en exécutable Windows (.exe) :
```bash
npm run dist:win
```

---

## 📁 Structure du Projet

Voici l'organisation simplifiée du projet (limité à 3 niveaux de profondeur) :

```
Jarvis-os-original/
├── assets/                  # Ressources statiques (images, icônes)
├── electron/                # Fichiers de configuration et de cycle de vie Electron
│   ├── main.cjs             # Processus principal Electron
│   └── preload.cjs          # Script de pré-chargement Electron
├── server/                  # Backend Node.js / Express
│   ├── agents/              # Orchestration multi-agents et gestionnaires de tâches
│   ├── autonomy/            # Superviseurs de la boucle de décision autonome
│   ├── knowledge/           # Indexeur, Graphe de connaissances et raisonnement
│   ├── mcp/                 # Connexion et gestion des serveurs MCP externes
│   ├── mission/             # Décomposition, planification et réflexion de missions
│   ├── routes/              # Déclarations des endpoints Express (REST)
│   ├── runtime/             # Nouveau runtime d'agents et registre d'outils
│   ├── skills/              # Déclarations et logique des outils du LLM
│   └── utils/               # Sandbox, checkpoints Git, cryptographie, self-root
├── src/                     # Code source de l'interface utilisateur React
│   ├── components/          # Composants UI (IDE, settings, workflows)
│   ├── context/             # États partagés globaux (Live API, profils)
│   ├── hooks/               # Logique de hooks React réutilisables
│   ├── services/            # Services de requête HTTP vers le backend
│   └── views/               # Vues majeures de l'application (IDE, Settings, Help)
└── supabase/                # Fichiers SQL de configuration et de schémas des tables
```

---

## 🤝 Contribuer

Les contributions sont les bienvenues ! Veuillez consulter notre document de directives [CONTRIBUTING.md](file:///c:/Users/Mayss/Desktop/Jarvis-os-ori/CONTRIBUTING.md) pour connaître notre workflow Git, nos règles de commit et de standards de développement.

---

## 📄 Licence

> ⚠️ À compléter : Ce projet ne contient aucun fichier LICENSE officiel à la racine du dépôt. La licence MIT est appliquée par défaut pour les contributions et la distribution de Jarvis-OS.
