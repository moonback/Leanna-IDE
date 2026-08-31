
<p align="center">
  <img src="assets/images/icon-light.png" alt="Leanna IA" width="20%" />
</p>

# Leanna

## Pitch
Leanna est un IDE augmenté par l'IA et un système d'exploitation pour développeurs, pensé pour transformer la manière dont on écrit, teste et audite du code. Grâce à une connexion vocale et multimodale bidirectionnelle avec Google Gemini Live, Leanna permet d'explorer, éditer, tester et sécuriser un codebase en temps réel — comme si un ingénieur senior travaillait à vos côtés, en continu. Un système d'agents autonomes orchestre les tâches complexes, tandis qu'un bac à sable sécurisé et des garde-fous stricts garantissent que chaque modification automatisée préserve l'intégrité et la résilience du code.

---
<p align="center">
  <img src="assets/images/header.png" alt="Leanna IA" width="100%" />
</p>

## Badges

[![Version](https://img.shields.io/badge/version-0.7.0-blue.svg)](package.json)
[![Runtime](https://img.shields.io/badge/node-%3E%3D22.0.0-green.svg)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0.0-3178C6.svg)](tsconfig.json)
[![Framework](https://img.shields.io/badge/React-19.0.1-61DAFB.svg)](package.json)
[![Desktop](https://img.shields.io/badge/Electron-43.1.0-47848F.svg)](package.json)
[![AI](https://img.shields.io/badge/%40google%2Fgenai-2.4.0-EA4335.svg)](package.json)


## Stack technique

| Technologie | Rôle | Version détectée |
| :--- | :--- | :--- |
| **Node.js** | Runtime serveur et scripts d'exécution | `>=22.20.1` (`@types/node`) |
| **TypeScript** | Typage statique frontend et backend | `^5.0.0` |
| **Electron** | Conteneur applicatif Desktop (Main & Preload) | `^43.1.0` |
| **Express** | Serveur HTTP backend et API REST | `^4.21.2` |
| **ws** | Serveur et client WebSocket (`/live`, `/terminal`, `/sandbox-watch`) | `^8.21.0` |
| **React** | Bibliothèque UI frontend (SPA) | `^19.0.1` |
| **React Router** | Routage déclaratif côté client | `^7.18.1` |
| **Vite** | Bundler frontend et serveur de développement HMR | `^6.2.3` |
| **TailwindCSS** | Framework utilitaire CSS (compilateur v4) | `^4.1.14` |
| **Monaco Editor** | Éditeur de code intégré (moteur VS Code) | `^0.53.0` |
| **Motion** | Animations et transitions d'interface | `^12.23.24` |
| **Zod** | Validation de schémas et typage strict des requêtes | `^3.25.76` |
| **@google/genai** | SDK officiel Google Gemini (Gemini Live API & Text Gen) | `^2.4.0` |
| **Supabase JS** | Client de persistance distante (mémoires, historique, workflows, RAG) | `^2.110.2` |
| **Puppeteer** | Automatisation et navigation Web headless | `^25.3.0` |
| **pdf-parse** | Extraction textuelle de documents PDF | `^2.4.5` |
| **esbuild** | Compilation et bundling du bootstrap serveur (`dist/server.cjs`) | `^0.25.0` |
| **electron-builder** | Packaging et création d'installateurs Windows (NSIS) | `^26.15.3` |

---

## Fonctionnalités principales

### Fonctionnalités utilisateur
* **Assistant Vocal & Multimodal Live** : Interaction en direct via WebSocket audio PCM 16kHz bidirectionnel et vision (partage d'écran / webcam) avec `gemini-3.1-flash-live-preview`.
* **Mode Multi-Workspace Sécurisé** : Ouverture, enregistrement et bascule instantanée entre dépôts externes avec isolation stricte du périmètre (`SELF_ROOT`), historique des workspaces (`.Leanna/workspaces.json`), validation préventive de sécurité et badges Git.
* **Agent Builder Visuel** : Interface de création, personnalisation (avatar, couleur, instructions système, presets d'outils, modèles) et test d'agents personnalisés avec import/export JSON.
* **Éditeur de code intelligent (IDE)** : Édition avec Monaco Editor, arborescence de fichiers, coloration syntaxique, recherche globale avec regex, onglets multiples et panneau de prévisualisation web.
* **Mode Bac à Sable (Sandbox)** : Isolation complète des modifications de fichiers dans un miroir `.Leanna/sandbox`, avec calcul de diff, validation syntaxique/TypeScript en temps réel et synchronisation sélective.
* **Gestionnaire de Notebooks & RAG** : Indexation de documents multiples (PDF, Markdown, texte, code), découpage en chunks, recherche sémantique, génération automatique de guides d'étude, FAQ, résumés, timelines et diapositives Reveal.js.
* **Terminal intégré** : Émulation de terminal PowerShell/Bash via WebSocket et PTY-like avec gestion de sessions multiples.
* **Navigateur Web autonome** : Navigation, capture d'écran, extraction de texte, inspection DOM et formulaires via webview et Puppeteer.
* **Synthèse Vocale & Audio** : Support TTS multivoix et lecteur audio pour les résumés et briefings générés.
* **Gestion des listes et tâches** : Création et gestion de listes de tâches synchronisées avec Supabase.

### Fonctionnalités développeur
* **Orchestration d'agents autonomes & Fleet** : Architecture multi-agents (Architecte, Développeur, Testeur, Sécurité, etc.) communicant via un bus de messages interne (`agentMessageBus`) avec support d'agents personnalisés dynamiques.
* **Validation Stricte Zod (`validateBody`)** : Middleware universel garantissant le filtrage des champs inconnus, le typage strict et la prévention des injections de propriétés sur les endpoints REST.
* **Knowledge System & Analyse Syntaxique Tree-sitter** : Indexation AST WASM incrémentale du codebase, cartographie bidirectionnelle des appels (`ASTCallGraph`), extraction de signatures typées, chaînes d'appels BFS et détection des dépendances intra-classe (`this.method()`).
* **Runtime V2 & Extensibilité Skills** : Système unifié de déclaration et d'exécution d'outils (`ToolRegistry`, `SkillManagerV2`), supportant les custom skills créés à la volée.
* **Passerelle MCP (Model Context Protocol)** : Connexion à des serveurs MCP tiers (stdio / SSE) pour étendre les outils disponibles tout en appliquant une validation de chemin stricte.
* **Garde-fous & Checkpoints Git automatiques** : Snapshots Git créés avant chaque modification destructive, détection de boucles de correction via le `Supervisor` et confirmation utilisateur pour les fichiers critiques.
* **Optimiseur de contexte & Pool de clés Gemini** : Calcul automatique des tokens, compactage/résumé automatique des conversations pour éviter les dépassements de fenêtre de contexte, et rotation dynamique des clés API Gemini sur erreur 429.

### Fonctionnalités administrateur & Sécurité
* **Périmètre Self-Root & Multi-Workspace verrouillé** : Confinement strict de l'ensemble des compétences IA et des opérations système au dépôt actif (`SELF_ROOT`), avec blocage préventif des racines disques (`C:\`, `/etc`) et détection des évasions par symlinks.
* **Journalisation d'audit NDJSON** : Enregistrement structuré de chaque action (création, écriture, suppression, exécution de commande) dans `.Leanna-audit.log`.
* **Protection par jeton d'accès** : Middleware de vérification `x-leanna-token` sur tous les endpoints HTTP `/api/*` et poignées de main WebSocket.
* **Code de sécurité Sandbox** : Désactivation du bac à sable protégée par un code à 6 chiffres (`SANDBOX_EXIT_CODE`).

---

## Prérequis

* **Système d'exploitation** : Windows 10/11 (x64), Linux ou macOS.
* **Node.js** : Version `>= 22.0.0` recommandée (ES modules et compatibilité `@types/node`).
* **Gestionnaire de paquets** : `npm` (version `>= 10.x`).
* **Clé API Gemini** : Clé Google Gemini valide (requise pour le fonctionnement de l'assistant Live et de la génération de texte).
* **Compte Supabase** *(Optionnel)* : URL et clé de rôle de service pour la persistance cloud (mémoires, historique, workflows, RAG).
* **Clé API OpenRouter** *(Optionnel)* : Pour les modèles d'IA alternatifs et l'analyse de code complémentaire.

---

## Installation

```bash
# 1. Cloner le dépôt
git clone <repository_url>
cd Jarvis-os-ori

# 2. Installer les dépendances
npm install

# 3. Configurer l'environnement
cp .env.example .env
```

---

## Configuration

Renseignez les variables nécessaires dans le fichier `.env` ou `.env.local` à la racine :

| Variable | Description | Exemple | Obligatoire |
| :--- | :--- | :--- | :--- |
| `GEMINI_API_KEY` | Clé API principale Google Gemini | `<YOUR_GEMINI_API_KEY>` | Oui |
| `Leanna_API_TOKEN` | Jeton d'authentification pour sécuriser l'API et les WebSockets | `<YOUR_SECRET_TOKEN>` | Non (Recommandé) |
| `SANDBOX_EXIT_CODE` | Code à 6 chiffres pour désactiver ou réinitialiser le Sandbox | `123456` | Non (Recommandé) |
| `VITE_SERVER_PORT` | Port d'écoute du serveur backend HTTP/WebSocket | `4000` | Non (Défaut: 4000) |
| `Leanna_LISTEN_HOST` | Hôte d'écoute TCP (limité à la boucle locale par défaut) | `127.0.0.1` | Non (Défaut: 127.0.0.1) |
| `SUPABASE_URL` | URL de l'instance Supabase | `https://<ref>.supabase.co` | Non |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé de service Supabase pour accès BDD complet | `<YOUR_SUPABASE_SERVICE_ROLE_KEY>` | Non |
| `OPENROUTER_API_KEY` | Clé API OpenRouter pour modèles alternatifs | `<YOUR_OPENROUTER_KEY>` | Non |
| `OPENROUTER_MODEL` | Modèle par défaut pour OpenRouter | `google/gemini-2.0-flash-001` | Non |
| `GITHUB_TOKEN` | Jeton d'accès personnel GitHub | `ghp_<SECRET>` | Non |
| `ENABLE_CHAIN_OF_THOUGHT` | Active l'affichage de la chaîne de réflexion IA | `true` | Non (Défaut: true) |
| `FORCE_TIERED_TOOLS` | Filtre dynamiquement les outils envoyés à Gemini par pertinence | `true` | Non (Défaut: true) |
| `NODE_ENV` | Environnement d'exécution (`development`, `production`, `test`) | `development` | Non |

---

## Lancement

### Développement

Le serveur Express intègre Vite en mode middleware pour le rechargement à chaud (HMR) :

```bash
# Lancement en mode Web (navigateur)
npm run dev

# Lancement en mode Desktop (Electron + Backend concurrents)
npm run desktop

# Lancement en mode Desktop avec DevTools ouverts
npm run desktop:debug
```

L'application est accessible par défaut sur `http://127.0.0.1:4000`.

### Production & Packaging

```bash
# 1. Compiler le frontend (Vite) et le bundle serveur (esbuild)
npm run build

# 2. Démarrer le serveur autonome de production
npm start

# 3. Générer le paquet d'installation Desktop Windows (NSIS)
npm run dist:win
```

### Tests & Qualité

```bash
# Exécution de la suite de tests unitaires et d'intégration
npm test

# Lancement du linter de projet
npm run lint
```

---

## Structure du projet

```text
Jarvis-os-ori/
├── electron/                   # Processus Electron principal et preload
│   ├── main.cjs                # Cycle de vie Electron, fenêtres, IPC
│   ├── preload.cjs             # Bridge contextuel sécurisé (electronAPI)
│   └── splash.html             # Écran de chargement initial
├── server/                     # Backend Express, Runtime IA et services
│   ├── agents/                 # Orchestrateur, registre et bus d'agents
│   ├── autonomy/               # Superviseur et moteur d'autonomie
│   ├── config/                 # Rate limiting et configuration serveurs
│   ├── knowledge/              # Knowledge Graph, mémoire projet et indexation
│   ├── live/                   # Gestionnaire de sessions WebSocket Gemini Live
│   ├── mcp/                    # Pont et client Model Context Protocol (MCP)
│   ├── mission/                # Moteur d'exécution de missions autonomes
│   ├── notebooks/              # Gestionnaire RAG, traitement de sources, cache
│   ├── prompts/                # Directives système et construction des prompts
│   ├── routes/                 # Routeurs d'API REST modulaires
│   ├── runtime/                # Moteur d'outils, observabilité et compatibilité V2
│   ├── skills/                 # Implémentations concrètes des compétences (outils)
│   └── utils/                  # Sandbox, checkpoints, cryptographie, self-root
├── src/                        # Frontend React 19 (SPA)
│   ├── components/             # Composants d'interface, panneaux et modales
│   ├── context/                # Contextes React (LiveAPI, Profile, ScreenShare)
│   ├── hooks/                  # Hooks personnalisés (LiveAPI, Terminal, Hotkeys)
│   ├── services/               # Clients API et passerelles Supabase
│   ├── stores/                 # État global client
│   ├── views/                  # Vues applicatives (IDE, Documents, Automation...)
│   └── main.tsx                # Point d'entrée React, circuit breaker fetch, routage
├── supabase/                   # Schémas SQL et migrations BDD
├── tests/                      # Scripts et tests de validation e2e
├── server.ts                   # Point de démarrage et configuration du serveur HTTP/WS
├── server-bootstrap.ts         # Bootstrap déchiffrement d'environnement et initialisation
└── package.json                # Définition du projet, dépendances et scripts
```

---

## Documentation complémentaire

- [Architecture système](ARCHITECTURE.md)
- [Référence API](API_DOCS.md)
- [Feuille de route & Roadmap](ROADMAP.md)

---

## Licence

> ⚠️ À compléter : aucune licence n'a été détectée dans le dépôt (champ `license` absent de `package.json` et aucun fichier `LICENSE` présent).
