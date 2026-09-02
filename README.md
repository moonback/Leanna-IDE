
<p align="center">
  <img src="assets/images/icon-light.png" alt="Leanna IA" width="20%" />
</p>

# Leanna

## Pitch

Leanna est un IDE augmenté par l'IA et un système d'exploitation pour développeurs, pensé pour transformer la manière dont on écrit, teste et audite du code. Grâce à une connexion vocale et multimodale bidirectionnelle avec Google Gemini Live, Leanna permet d'explorer, éditer, tester et sécuriser un codebase en temps réel — comme si un ingénieur senior travaillait à vos côtés, en continu.

Un système d'agents autonomes orchestre les tâches complexes, tandis qu'un bac à sable sécurisé et des garde-fous stricts garantissent que chaque modification automatisée préserve l'intégrité et la résilience du code. Un **Marketplace communautaire** permet d'installer des agents et des skills prêts à l'emploi en un clic, directement depuis l'IDE.

---

<p align="center">
  <img src="assets/images/header.png" alt="Leanna IA" width="100%" />
</p>

## Badges

[![Version](https://img.shields.io/badge/version-0.9.0-blue.svg)](package.json)
[![License](https://img.shields.io/badge/license-Source--Available-orange.svg)](LICENSE)[![Runtime](https://img.shields.io/badge/node-%3E%3D22.0.0-green.svg)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0.0-3178C6.svg)](tsconfig.json)
[![Framework](https://img.shields.io/badge/React-19.0.1-61DAFB.svg)](package.json)
[![Desktop](https://img.shields.io/badge/Electron-43.1.0-47848F.svg)](package.json)
[![AI](https://img.shields.io/badge/%40google%2Fgenai-2.4.0-EA4335.svg)](package.json)

---

## Stack technique

| Technologie | Rôle | Version |
| :--- | :--- | :--- |
| **Node.js** | Runtime serveur et scripts d'exécution | `>=22.20.1` |
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
| **Supabase JS** | Client de persistance distante (mémoires, historique, RAG, custom skills) | `^2.110.2` |
| **Puppeteer** | Automatisation et navigation Web headless | `^25.3.0` |
| **pdf-parse** | Extraction textuelle de documents PDF | `^2.4.5` |
| **basic-ftp** | Connexion FTP/FTPS et synchronisation des workspaces | `6.2.1` |
| **esbuild** | Compilation et bundling du bootstrap serveur (`dist/server.cjs`) | `^0.25.0` |
| **electron-builder** | Packaging et création d'installateurs Windows (NSIS) | `^26.15.3` |

---

## Fonctionnalités principales

### Assistant & IA

* **Assistant Vocal & Multimodal Live** : Interaction en direct via WebSocket audio PCM 16kHz bidirectionnel et vision (partage d'écran / webcam) avec `gemini-3.1-flash-live-preview`.
* **Orchestration d'agents autonomes & Fleet** : Architecture multi-agents (Architecte, Développeur, Testeur, Sécurité, etc.) communicant via un bus de messages interne avec support d'agents personnalisés dynamiques.
* **Agent Builder Visuel** : Interface de création, personnalisation (avatar, couleur, instructions système, presets d'outils, modèles) et test d'agents personnalisés avec import/export JSON.
* **Optimiseur de contexte & Pool de clés Gemini** : Calcul automatique des tokens, compactage/résumé automatique des conversations, rotation dynamique des clés API Gemini sur erreur 429.

### 🛒 Marketplace d'agents et de skills *(nouveau v0.9.0)*

Le Marketplace est accessible depuis la sidebar IDE : **Outils → Marketplace** (ou raccourci `Ctrl+K` dans le panel).

**Catalogue communautaire** : 10 paquets seedés dès le démarrage — 6 agents spécialisés (Code Reviewer Pro, Security Auditor, Fullstack Architect, Doc Writer, Data Analyst, DevOps Pipeline Builder), 2 skills (Regex Builder, SQL Optimizer, Commit Generator) et 2 bundles (Python Suite).

| Fonctionnalité | Détail |
| :--- | :--- |
| **Installation en un clic** | Agent → `DynamicAgentRegistry` + `custom-agents.json` · Skill → Supabase `custom_skills` |
| **Désinstallation** | Suppression propre du registre dynamique et du JSON local |
| **Notation communautaire** | Formulaire inline 1-5 étoiles + commentaire, recalcul de moyenne en temps réel |
| **Validation sécurité** | 12 patterns OWASP/injection analysés sur prompts et instructions avant publication |
| **Publication** | Formulaire avec scan sécurité live — bloqué si flags critiques détectés |
| **Import glisser-déposer** | Fichiers `.leanna.json` exportés ou partagés par la communauté |
| **Export JSON** | Téléchargement `{id}-v{version}.leanna.json` de n'importe quel paquet |
| **Partage de lien** | Copie d'URL dans le presse-papier en un clic |
| **Filtres avancés** | Par type (agent/skill/bundle), catégorie (9), tri (popularité/récence/note/installs) |
| **Vue détail** | 4 onglets : Aperçu · Contenu (agent + skills) · Avis · Rapport sécurité |

**Catégories disponibles** : Code · DevOps · Web · Data · Rédaction · Sécurité · Productivité · IA · Autre

**API REST** : `GET/POST /api/marketplace/*` — search, featured, installed, stats, package/:id, install, uninstall, publish, rate, validate-security, export/:id

### IDE & Workflow

* **Mode Multi-Workspace Sécurisé** : Ouverture, enregistrement et bascule instantanée entre dépôts avec isolation stricte (`SELF_ROOT`), historique des workspaces, validation préventive et badges Git. Clonage direct depuis une URL GitHub/GitLab avec progression en temps réel (SSE) et activation automatique du workspace cloné.
* **Synchronisation FTP/FTPS** : Connexion depuis la modale de démarrage, test d'accès, téléchargement récursif vers un miroir local `~/.Leanna/ftp-workspaces`, activation comme workspace et push complet ou ciblé vers le serveur avec progression SSE. Les mots de passe restent en mémoire et ne sont jamais enregistrés.
* **Éditeur de code intelligent** : Monaco Editor, arborescence de fichiers, coloration syntaxique, recherche globale avec regex, onglets multiples et panneau de prévisualisation web.
* **Prise en charge native des PDF** : Les fichiers PDF du workspace sont détectés, indexés et ouverts directement dans l’IDE avec aperçu document, extraction de texte et téléchargement.
* **Intégration GitHub native** : Panneau GitHub avec 5 onglets (Commits locaux avec diff, Repos, Issues, PRs, Notifications), filtres et badges de compteurs. Le bouton **GitHub** de la status bar ouvre aussi `WorkspacePublishPanel` pour afficher les modifications du workspace réel, créer un commit et pousser vers `origin`. Le dossier `.Leanna/` est toujours exclu du statut et des commits.
* **Terminal intégré** : Émulation PowerShell/Bash via WebSocket et PTY avec sessions multiples.
* **Navigateur Web autonome** : Navigation, capture d'écran, extraction de texte et formulaires via webview + Puppeteer.

### Données & Knowledge

* **Mode Bac à Sable (Sandbox)** : Isolation des modifications dans un miroir `.Leanna/sandbox`, diff, validation TypeScript et synchronisation sélective.
* **Gestionnaire de Notebooks & RAG** : Ingestion multi-formats (PDF, Markdown, texte, code), recherche sémantique, génération de guides, FAQ, résumés et diapositives Reveal.js.
* **Knowledge System & AST Tree-sitter** : Indexation incrémentale WASM du codebase, cartographie bidirectionnelle des appels, signatures typées et chaînes d'appels BFS.
* **Runtime V2 & Custom Skills** : `ToolRegistry` + `SkillManagerV2` — déclaration et exécution d'outils custom créés à la volée via Supabase.
* **Passerelle MCP** : Connexion à des serveurs MCP tiers (stdio/SSE) avec validation de chemin stricte.

### Sécurité & Administration

* **Garde-fous & Checkpoints Git** : Snapshots avant chaque modification destructive, validation post-édition, détection de boucles via le `Supervisor` et confirmation utilisateur pour fichiers critiques. Le Supervisor est isolé par session, force un pivot après 2 échecs d'une approche, verrouille après 3 approches échouées et suspend la session à 10 corrections cumulées. Un Context Gate suspend aussi les écritures lorsque le contexte est faible ou à risque, jusqu'à lecture des fichiers pertinents.
* **Périmètre Self-Root verrouillé** : Confinement de l'IA au dépôt actif, blocage des racines disques et détection des évasions par symlinks.
* **Journalisation d'audit NDJSON** : Enregistrement structuré de chaque action dans `.Leanna-audit.log`.
* **Protection par jeton d'accès** : Middleware `x-leanna-token` sur tous les endpoints HTTP et WebSocket.

---

## Prérequis

* **Système d'exploitation** : Windows 10/11 (x64), Linux ou macOS.
* **Node.js** : `>= 22.0.0` (modules ES et `@types/node`).
* **npm** : `>= 10.x`.
* **Clé API Gemini** : Requise pour l'assistant Live et la génération de texte.
* **Supabase** *(optionnel)* : URL + clé de service pour la persistance cloud des mémoires, historique, custom skills et RAG.
* **OpenRouter** *(optionnel)* : Pour les modèles d'IA alternatifs.
* **GitHub Token** *(optionnel)* : Pour l'intégration GitHub dans l'IDE (repos, issues et PRs). Le commit/push du workspace utilise la configuration Git locale (`origin`, gestionnaire d'identifiants ou clé SSH).

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
# → Remplir GEMINI_API_KEY et Leanna_API_TOKEN dans .env
```

---

## Configuration

Renseignez les variables dans `.env` ou `.env.local` à la racine :

| Variable | Description | Obligatoire |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Clé API Google Gemini | Oui |
| `Leanna_API_TOKEN` | Jeton d'authentification API & WebSocket | Recommandé |
| `SANDBOX_EXIT_CODE` | Code 6 chiffres pour désactiver le Sandbox | Recommandé |
| `VITE_SERVER_PORT` | Port d'écoute HTTP/WS (défaut : `4000`) | Non |
| `Leanna_LISTEN_HOST` | Hôte TCP (défaut : `127.0.0.1`) | Non |
| `SUPABASE_URL` | URL instance Supabase | Non |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé de service Supabase | Non |
| `OPENROUTER_API_KEY` | Clé API OpenRouter | Non |
| `OPENROUTER_MODEL` | Modèle OpenRouter par défaut | Non |
| `GITHUB_TOKEN` | Personal Access Token GitHub | Recommandé |
| `ENABLE_CHAIN_OF_THOUGHT` | Affichage de la réflexion IA (défaut : `true`) | Non |
| `FORCE_TIERED_TOOLS` | Filtrage dynamique des outils Gemini (défaut : `true`) | Non |
| `NODE_ENV` | Environnement (`development`, `production`, `test`) | Non |

---

## Lancement

### Développement

```bash
# Mode Web (navigateur sur http://127.0.0.1:4000)
npm run dev

# Mode Desktop (Electron + backend concurrents)
npm run desktop

# Mode Desktop avec DevTools ouverts
npm run desktop:debug
```

### Production & Packaging

```bash
# Compiler frontend (Vite) + bundle serveur (esbuild)
npm run build

# Démarrer le serveur de production
npm start

# Générer l'installateur Windows NSIS
npm run dist:win
```

### Tests & Qualité

```bash
# Suite de tests unitaires et d'intégration
npm test

# Linter de projet
npm run lint
```

### Boucle qualité automatique

Les agents disposent de l'outil `quality_loop` pour sécuriser une modification de fichier en une seule passe bornée :

1. capture de la baseline existante ;
2. modification du fichier ;
3. formatage ciblé (`verify_format`) ;
4. typecheck TypeScript ;
5. vérification des tests associés ;
6. analyse du diff et comparaison de régression.

La boucle s'arrête à la première phase en échec. Elle ne relance pas automatiquement une correction sans limite et retourne `stoppedAt`, `errors`, `diff`, `baseline`, `current` et `regression` pour permettre une reprise explicite.

### Contexte traçable et plan d'action

Chaque réponse issue d'une recherche, d'un notebook ou d'une mission doit exposer ses preuves : fichier ou source, plage de lignes, test exécuté et extrait réellement utilisé. Le bouton **Inspecter le contexte** ouvre la liste de ces éléments ; chaque source peut être exclue, puis le contexte et la réponse doivent être recalculés. Une citation ne doit jamais être générée pour une source qui n'a pas été effectivement consultée.

Avant toute mission multi-étapes, l'interface doit afficher un plan d'action confirmable avec les objectifs, fichiers ciblés, outils autorisés, risques, coût estimé (tokens/appels) et conditions d'arrêt. La mission ne démarre pas tant que le plan n'est pas accepté ou explicitement ajusté par l'utilisateur.

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
│   ├── marketplace/            # ← Registre Marketplace, types, validation sécurité
│   │   ├── MarketplaceRegistry.ts   # Singleton — catalogue, install, publish, rate
│   │   └── types.ts                 # Interfaces & schémas Zod du Marketplace
│   ├── mcp/                    # Pont Model Context Protocol (MCP)
│   ├── mission/                # Moteur d'exécution de missions autonomes
│   ├── notebooks/              # Gestionnaire RAG, traitement de sources, cache
│   ├── prompts/                # Directives système et construction des prompts
│   ├── routes/                 # Routeurs d'API REST modulaires
│   │   └── marketplace.ts      # ← API REST Marketplace (11 endpoints)
│   ├── runtime/                # Moteur d'outils, observabilité et compatibilité V2
│   ├── skills/                 # Implémentations concrètes des compétences (outils)
│   └── utils/                  # Sandbox, checkpoints, cryptographie, self-root
├── src/                        # Frontend React 19 (SPA)
│   ├── components/             # Composants d'interface, panneaux et modales
│   │   └── panels/
│   │       └── MarketplacePanel.tsx  # ← Panel Marketplace (SidePanel overlay)
│   ├── context/                # Contextes React (LiveAPI, Profile, ScreenShare)
│   ├── hooks/                  # Hooks personnalisés
│   ├── stores/                 # État global client
│   │   └── marketplaceStore.ts # ← Store Marketplace (useSyncExternalStore)
│   ├── views/                  # Vues applicatives (IDE, Documents, Automation...)
│   └── main.tsx                # Point d'entrée React, circuit breaker, routage
├── supabase/                   # Schémas SQL et migrations BDD
├── tests/                      # Scripts et tests de validation e2e
├── server.ts                   # Point de démarrage du serveur HTTP/WS
├── server-bootstrap.ts         # Bootstrap déchiffrement + initialisation
└── package.json                # Dépendances et scripts
```

---

## Utiliser le Marketplace

### Installer un paquet

1. Ouvrir la sidebar IDE → **Outils** → **Marketplace**
2. Parcourir le catalogue ou chercher avec `Ctrl+K`
3. Cliquer **Installer** sur la carte — l'agent et/ou les skills sont immédiatement disponibles

### Publier un paquet

1. Onglet **Publier** dans le Marketplace
2. Remplir le formulaire (nom, description, contenu agent/skill)
3. Cliquer **Analyser la sécurité** — un rapport est généré automatiquement
4. Si le score est ≥ 1 (pas de flags critiques), cliquer **Publier dans le Marketplace**

### Importer un fichier local

1. Onglet **Importer**
2. Glisser-déposer un fichier `.leanna.json` ou cliquer pour le sélectionner
3. Le(s) paquet(s) sont installés automatiquement

### Exporter un paquet

Dans la vue détail d'un paquet → icône **⬇** en haut à droite → téléchargement `{id}-v{version}.leanna.json`

---

## API Marketplace

| Méthode | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/marketplace/search?query=&type=&category=&sort=&page=` | Recherche paginée avec filtres |
| `GET` | `/api/marketplace/featured` | Paquets mis en avant |
| `GET` | `/api/marketplace/installed` | Paquets installés localement |
| `GET` | `/api/marketplace/stats` | Statistiques globales du catalogue |
| `GET` | `/api/marketplace/package/:id` | Détail complet d'un paquet |
| `POST` | `/api/marketplace/install` | Installer un paquet `{ packageId }` |
| `POST` | `/api/marketplace/uninstall` | Désinstaller un paquet `{ packageId }` |
| `POST` | `/api/marketplace/publish` | Publier un nouveau paquet |
| `POST` | `/api/marketplace/rate` | Soumettre un avis `{ packageId, rating, comment, author }` |
| `POST` | `/api/marketplace/validate-security` | Scanner sécurité sans publier |
| `GET` | `/api/marketplace/export/:id` | Télécharger un paquet en JSON |

---

## Documentation complémentaire

- [Architecture système](ARCHITECTURE.md)
- [Référence API](API_DOCS.md)
- [Feuille de route & Roadmap](ROADMAP.md)

---

## License

Leanna is source-available under a custom Business Source License.

Commercial use is restricted until September 2, 2031.
On September 2, 2031, the applicable version will become open source
under the GNU General Public License v3.0 or later.

See [LICENSE](LICENSE) for the complete terms.