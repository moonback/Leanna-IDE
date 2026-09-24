# Leanna — AI Operating System

> **Un IDE augmenté par IA pour déléguer, orchestrer et exécuter des tâches complexes directement dans votre workspace.**
<!-- <p align="center">
  <img src="assets\images\logo.png" alt="Jarvis-os" width="440" />
</p> -->
<p align="center">
  <img src="assets\images\header-bg.png" alt="Jarvis IA" width="100%" />
</p>

Leanna combine un IDE Monaco, un terminal interactif, des agents autonomes, un **Agent Brain** capable de construire dynamiquement des plans d'exécution, une interaction vocale Gemini Live et un runtime autonome 24/7.

Le projet cible principalement les développeurs solo et les petites équipes qui souhaitent conserver leur code et leur environnement d'exécution dans leur propre workspace.

![Build](https://img.shields.io/badge/build-passing-brightgreen)
![Version](https://img.shields.io/badge/version-1.1.0-blue)
![License](https://img.shields.io/badge/license-BUSL--1.1-orange)
![Node](https://img.shields.io/badge/node-%3E%3D20-green)
![Electron](https://img.shields.io/badge/electron-43-blueviolet)

> **Aperçu :** IDE Monaco + terminal + orchestration multi-agents + Agent Brain + Gemini Live + runtime autonome.

---

## Sommaire

- [Pourquoi Leanna ?](#pourquoi-leanna)
- [Fonctionnalités](#fonctionnalités)
  - [Agent Brain](#agent-brain)
  - [Agents autonomes](#agents-autonomes)
  - [Runtime agentique](#runtime-agentique)
  - [Runtime autonome 24/7](#runtime-autonome-247)
  - [Boucle exécutive autonome](#boucle-exécutive-autonome)
  - [Bot Telegram](#bot-telegram)
  - [IDE et outils développeur](#ide-et-outils-développeur)
  - [Sécurité et contrôle](#sécurité-et-contrôle)
- [Architecture](#architecture)
- [Stack technique](#stack-technique)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Configuration](#configuration)
- [Lancement et exploitation](#lancement-et-exploitation)
- [Tests](#tests)
- [Structure du projet](#structure-du-projet)
- [Utiliser l'Agent Brain](#utiliser-lagent-brain)
- [Dépannage](#dépannage)
- [Documentation](#documentation)
- [Contribution](#contribution)
- [Licence](#licence)

---

## Pourquoi Leanna ?

Leanna est conçu autour d'une idée simple : **décrire un objectif plutôt qu'une suite d'actions**.

Exemple :

```text
« Modernise mon site et rends le header responsive »
```

Leanna peut alors :

1. comprendre l'objectif et le contexte ;
2. le décomposer en sous-objectifs ;
3. sélectionner les agents et outils nécessaires ;
4. exécuter les étapes avec leurs dépendances ;
5. vérifier le résultat ;
6. corriger certaines erreurs automatiquement ;
7. produire un rapport final.

L'objectif est de fournir une expérience proche d'un **environnement de développement piloté par intention**, tout en conservant des garde-fous explicites sur les opérations sensibles.

---

# Fonctionnalités

## Agent Brain

L'**Agent Brain** est la couche d'orchestration cognitive de Leanna. Il transforme un objectif utilisateur en **graphe d'exécution dynamique (DAG)**, sans workflow métier figé.

```text
Utilisateur
    │
    │ « Modernise mon site et rends le header responsive »
    ▼
Agent Brain
    ├─ Compréhension de l'objectif
    ├─ Décomposition dynamique en DAG
    ├─ Validation du plan (schéma strict + Mermaid)
    ├─ Sélection des agents, skills et outils
    ├─ Exécution parallèle du DAG (fan-out / fan-in)
    ├─ Vérification multi-niveaux
    ├─ Correction autonome bornée
    └─ Réplanification à chaud du sous-graphe restant
    │
    ▼
Résultat final + rapport
```

### Moteur d'exécution

Le Brain ne se contente pas d'enchaîner les étapes séquentiellement : il lit les
dépendances (`dependsOn`) de chaque étape et pilote leur exécution via un
**scheduler topologique**.

- **Exécution parallèle** : toutes les étapes dont les dépendances sont
  satisfaites démarrent simultanément (fan-out), puis convergent (fan-in).
- **Plan validé** : chaque plan généré est vérifié par un schéma strict avant
  exécution — rôles connus, dépendances existantes, absence de cycle. Un
  diagramme **Mermaid** du DAG est produit pour inspection.
- **Correction autonome** : sur échec d'une étape, une boucle de correction
  bornée (`maxCorrectionAttempts`) tente de réparer avant d'abandonner.
- **Réplanification à chaud** : si une étape échoue durablement, le Brain
  re-décompose le sous-graphe restant au lieu d'interrompre toute la mission,
  avec un garde-fou anti-boucle (`maxReplans`).
- **Échec isolé** : l'échec d'une branche n'annule que ses dépendants ; les
  branches indépendantes poursuivent (succès partiel possible).

### Modes

- `plan_first` : génère le plan (avec diagramme Mermaid) et permet de l'inspecter avant exécution.
- `auto` : exécute la mission de bout en bout.

### API

```text
POST /api/agents/brain/plan       # renvoie le plan + le DAG Mermaid
POST /api/agents/brain/execute
GET  /api/agents/brain/status/:id
```

---

## Agents autonomes

Leanna dispose d'une flotte d'agents spécialisés, notamment :

| Domaine | Agents |
|---|---|
| Code | `coder`, `refactor`, `debugger` |
| Architecture | `architect`, `planner` |
| Qualité | `tester`, `reviewer`, `proofreader` |
| Recherche | `researcher` |
| Sécurité | `security` |
| Vision | `vision` |
| Rédaction | `writer`, `formatter`, `translator`, `summarizer` |

Les agents peuvent être orchestrés sous forme de DAG et collaborer via une matrice de délégation.

Exemple :

```text
planner
   ├── researcher
   ├── architect
   └── coder
          ↓
       tester
          ↓
       reviewer
```

---

## Runtime agentique

Le **runtime agentique** est le moteur d'exécution partagé d'une tâche agent. Il donne
**réellement** ses outils à un agent (intersection de ses `capabilities` déclarées et du
`ToolRegistry`) et boucle jusqu'à un résultat vérifié, au lieu d'un simple aller-retour
prompt → réponse.

```text
Objectif
   ↓
PLAN ──► ACT ──► OBSERVE ──► VERIFY ──► (SUCCESS → étape suivante | FAILURE → RECOVER)
   ▲                                                        │
   └──────────────── réplanification bornée ◄───────────────┘
   ↓
FINALIZE → rapport
```

### Ce qu'il garantit

- **Outils réellement fournis** — un agent ne peut appeler que les outils qu'il déclare ;
  chaque appel passe par `ToolRegistry.call()` (permissions, dry-run, timeout, métriques).
- **Budget de mission par phase** (valeurs absolues, source de vérité) — défaut
  `lecture 8 · plan 3 · écriture 9 · vérification 6 · correction 4` (total 30). Les quotas
  d'écriture et de vérification sont **réservés** : l'exploration ne peut jamais les consommer,
  donc après la découverte l'agent a toujours de quoi écrire ET vérifier.
- **Écritures transactionnelles** — une écriture réussie est enregistrée et hashée (SHA-256)
  **immédiatement**, avant tout contrôle de budget. Une limite atteinte plus tard n'annule
  jamais une modification déjà émise.
- **Vérification hashée** — chaque fichier écrit est revérifié via `verify_file` ; le
  `VerificationRecord` (hash avant/après) est conservé dans `WorkspaceState`. L'étape ne passe
  que si le hash vérifié correspond au contenu courant.
- **Réparation bornée** — `AgentRepairLoop` décide `retry / replan / stop` en détectant les
  patchs identiques répétés, l'absence de progrès et les régressions.
- **Cache de contexte** — les lectures/recherches identiques sont resservies depuis le cache,
  sans réexécution ni coût de budget.

Tous les chemins d'exécution (`agent_orchestrate`, délégation, scheduler DAG et flotte
autonome) partagent ce moteur via l'interface `AgentTaskRunner`. L'ancien `AgentExecutor`
reste disponible derrière la même interface mais n'est plus le moteur principal. Un **contrat
commun** (10 invariants) est vérifié contre les deux moteurs pour éviter toute divergence.

Le superviseur multi-agents (`AgentBrain`) roule sur ce moteur : la **vérification d'étape**
du DAG passe par la même discipline `WorkspaceState` (preuve hashée `verify_file`), et une
étape n'est validée que si le hash vérifié correspond au contenu courant.

Documentation détaillée : [`docs/AGENTIC_RUNTIME.md`](docs/AGENTIC_RUNTIME.md).

---

## Runtime autonome 24/7

Leanna possède un runtime d'autonomie **événementiel**. Il ne repose pas sur une boucle qui interroge constamment un modèle.

Le runtime comprend notamment :

- heartbeat avec états `watching`, `idle` et `sleeping` ;
- déduplication des tâches ;
- file d'attente bornée ;
- limite de concurrence ;
- timeout ;
- retries avec backoff ;
- circuit breaker ;
- dead-letter queue ;
- persistance/reprise optionnelle via Supabase ;
- coordination multi-instance optionnelle via Redis ;
- bus d'événements Redis Streams optionnel ;
- monitoring via `/api/v2/metrics/autonomy`.

## Boucle exécutive autonome

Les événements significatifs ne restent plus de simples éléments de queue :
le serveur les transforme en une décision traçable, puis les transmet à la
mission existante. La boucle reste **bornée**, **interruptible** et ne crée pas
de chemin d'exécution parallèle aux protections du runtime.

La concurrence est doublement bornée : `TaskManager` limite la queue et les
workers autonomes, tandis que `AutonomousExecutive.maxConcurrentCycles` limite
les cycles de décision/mission simultanés. Lorsqu'une limite est atteinte, la
tâche remonte vers le retry/backoff existant au lieu de contourner la limite.

```text
RuntimeEvent / Heartbeat
        ↓
PerceptionEngine
        ↓
AutonomousExecutive
  ├─ normalise l'observation
  ├─ arbitre la priorité de façon déterministe
  ├─ déduplique ou crée un AutonomousGoal
  └─ choisit STORE, INVESTIGATE, ACT ou ESCALATE
        ↓
Mission.Executor
  ├─ planification et DAG existants
  ├─ ToolRegistry → PermissionPolicy → DryRunController
  ├─ vérification, correction et réplanification bornées
  └─ réflexion
        ↓
LearningEngine (propositions uniquement)
        ↓
Memory / prochain cycle
```

### Décisions et objectifs

`AutonomousExecutive` utilise les dispositions suivantes : `IGNORE`, `STORE`,
`MONITOR`, `INVESTIGATE`, `ACT` et `ESCALATE`. Les objectifs issus d'événements
répétés sont dédupliqués selon leur classe de défaillance, et non selon un ID de
tâche éphémère. Leur priorité est calculée par le runtime à partir de critères
bornés (urgence, importance, risque, dépendances, intention, délai, coût,
confiance et impact) : un modèle peut proposer du contexte, mais ne décide pas
seul d'une priorité critique.

Un refus de permission est toujours escaladé, sans tentative de contournement.
Si un événement arrive avant l'initialisation du système de missions, il est
également escaladé en sécurité. Les missions autonomes attendent l'état terminal
du `Mission.Executor`; la simple création asynchrone d'une mission n'est jamais
considérée comme un succès.

### Apprentissage contrôlé

Après une mission terminale, `LearningEngine` extrait des leçons et des
`candidateImprovements`. Ces propositions sont disponibles pour l'UI ou une
politique ultérieure, mais ne sont **pas auto-appliquées** par la finalisation de
mission. Ce choix évite qu'un apprentissage transforme le workspace, les
permissions ou les stratégies sans validation explicite.

Les événements de cycle incluent un `traceId`, un `cycleId`, le `goalId` et le
`taskId` lorsque disponibles; ils sont relayés à la timeline d'autonomie. Voir
[l'audit complet](docs/AUTONOMOUS_AGENT_AUDIT.md) pour les composants, limites,
risques et travaux de validation restants.

> Pour une première validation, il est recommandé de conserver `Leanna_PERMISSION_MODE=enforce`, d'activer `Leanna_DRY_RUN=true` et de commencer avec `LEANNA_AUTONOMY_MAX_CONCURRENCY=1`.

Documentation détaillée : [`AUTONOMY.md`](AUTONOMY.md).

---

## Bot Telegram

Leanna peut être piloté à distance depuis Telegram via `grammy` et Long Polling, sans exposer de port réseau public.

```text
Smartphone
    │
    ▼
Telegram Bot
    │
    ├─ Vérification de la whitelist
    ├─ Routage de la commande
    ├─ Exécution de la tâche
    └─ Notification du résultat
```

### Commandes principales

```text
/status
/agent <tâche>
/tasks [statut]
/task <id>
/cancel <id>
/cmd <commande>
/ls [dossier]
/read <chemin>
/project [chemin]
/clear
/help
```

Le bot applique notamment :

- une whitelist d'utilisateurs ;
- une protection contre le path traversal pour `/read` et `/ls` ;
- des restrictions sur les commandes destructrices ;
- des notifications lors de la fin ou de l'échec d'une tâche.

---

## IDE et outils développeur

### Expérience utilisateur

- Éditeur Monaco avec onglets, coloration syntaxique et explorateur de fichiers.
- Terminal interactif.
- Interaction vocale Gemini Live.
- Partage d'écran et webcam.
- Historique des conversations.
- Mémoire court / moyen / long terme.
- Recherche globale dans le workspace.
- Palette de commandes `Ctrl+K`.
- Thème clair/sombre et couleur d'accent.
- Workflows et tâches planifiées.
- Notebooks RAG avec PDF, texte, recherche sémantique, Mermaid, slides et TTS.
- Gestion de documents.
- Intégration GitHub.
- Checkpoints Git et rollback.
- Liste d'exclusion `.leannaignore` (chemins interdits en écriture à l'agent), éditable depuis l'explorateur.
- Panel PM2.
- Contrôle à distance via Telegram.

### Outils avancés

- Knowledge Graph et analyse des dépendances.
- Custom Skills.
- Marketplace de skills et agents.
- MCP.
- Audit log.
- FTP.
- OpenRouter.
- Rotation de clés Gemini.
- Token optimization.
- Sandbox Watch.
- Hierarchical Memory Engine.
- Serveur de métriques Runtime V2.

---

## Sécurité et contrôle

Leanna fournit plusieurs niveaux de contrôle afin de limiter les effets de bord des agents.

### Permissions par skill

Chaque skill peut déclarer des permissions :

| Permission | Usage |
|---|---|
| `read` | Lecture de fichiers et ressources |
| `write` | Création, modification ou suppression |
| `network` | Accès réseau sortant |
| `exec` | Exécution de commandes/processus |

Le runtime applique ces permissions via `ToolRegistry`.

### Modes

```env
Leanna_PERMISSION_MODE=enforce
Leanna_GRANTED_PERMISSIONS=read,write
```

- `enforce` : refuse les appels non autorisés.
- `audit` : autorise mais journalise.
- `off` : désactive les vérifications.

### Dry-run

Le dry-run permet de simuler une mission sans effet de bord :

```env
Leanna_DRY_RUN=true
```

Les opérations de lecture restent exécutables ; les opérations `write`, `exec` et `network` sont interceptées.

Exemple :

```ts
mission_create({
  title: "Refactor auth",
  description: "...",
  dryRun: true
})
```

Puis :

```ts
mission_dryrun_report()
```

### Liste d'exclusion de chemins (`.leannaignore`)

Un fichier `.leannaignore` placé à la racine du projet définit les dossiers et fichiers que l'agent ne peut **jamais** modifier (écriture, création, suppression, renommage). C'est un complément aux protections en dur (`.git`, `node_modules`…), entièrement contrôlé par l'utilisateur.

Le format est proche de `.gitignore` :

```gitignore
# Un chemin par ligne, relatif à la racine du projet
secrets/                 # bloque le dossier et tout son contenu
config/*.prod.json       # * = un segment (hors /)
docs/**                  # ** = récursif
!docs/CONTRIBUTING.md     # ! = exception (ré-autorise un chemin)
```

- Un dossier listé bloque tout son contenu récursivement.
- La dernière règle correspondante l'emporte (placez les `!` après).
- Les modifications prennent effet immédiatement, sans redémarrage.
- Le fichier est **miroité dans la sandbox** : la copie isolée sur laquelle l'agent travaille reflète la même liste d'exclusion.

La liste est éditable via un **modal accessible depuis le header de l'explorateur de fichiers** (icône bouclier barré), ou directement via l'API :

```text
GET  /api/safeguards/ignore      # lit le contenu + l'aperçu des règles
POST /api/safeguards/ignore      # enregistre le contenu { content: string }
```

Un modèle documenté est fourni dans [`.leannaignore.example`](.leannaignore.example).

---

# Architecture

Leanna est organisé en plusieurs couches :

```text
┌──────────────────────────────────────────────┐
│        Autonomous Executive Loop              │
│ Perception → Goal → Priority → Mission        │
└──────────────────────┬───────────────────────┘
                       │
┌──────────────────────▼───────────────────────┐
│                 Agent Brain                  │
│ Compréhension → Planification → Vérification │
└──────────────────────┬───────────────────────┘
                       │
┌──────────────────────▼───────────────────────┐
│             AgentOrchestrator                │
│ délégation · orchestration · collaboration  │
└──────────────────────┬───────────────────────┘
                       │
┌──────────────────────▼───────────────────────┐
│        Runtime V2 / SkillManagerV2           │
│ ToolRegistry · StateMachine · Workflows      │
│ Observability · PromptRegistry · EventBus    │
└──────────────────────┬───────────────────────┘
                       │
┌──────────────────────▼───────────────────────┐
│             Agents spécialisés               │
│ Code · Test · Research · Vision · Docs ...  │
└──────────────────────────────────────────────┘
```

### Principaux composants

- `AgentBrain` : compréhension et planification dynamique.
- `AgentOrchestrator` : orchestration et délégation.
- `AgentRuntime` (agentique) : boucle plan → act → verify → recover, budget de mission et écritures transactionnelles.
- `AgentTaskRunner` : interface partagée du moteur d'exécution (runtime agentique ou exécuteur legacy).
- `WorkspaceState` / `AgentRepairLoop` : état de fichiers adressé par contenu (hash) et réparation bornée.
- `SkillManagerV2` : exécution des skills.
- `ToolRegistry` : registre et contrôle des outils.
- `PermissionPolicy` : contrôle des permissions.
- `DryRun` : simulation des effets de bord.
- `EventBus` : communication événementielle.
- `HierarchicalMemoryService` : mémoire hiérarchisée.
- `LeannaCore` : runtime autonome événementiel et queue bornée.
- `AutonomousExecutive` : pont déterministe perception → objectif → mission.
- `Mission.Executor` : attend la fin vérifiée d'une mission et produit des propositions d'apprentissage non appliquées.

Pour l'architecture complète : [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

# Stack technique

| Technologie | Rôle | Version |
|---|---|---|
| React | Frontend | ^19.0.1 |
| React Router DOM | Routage | ^7.18.1 |
| Vite | Bundler / dev server | ^6.2.3 |
| TypeScript | Front + back | ^5.0.0 |
| TailwindCSS | UI | ^4.1.14 |
| Express | API / serveur | ^4.21.2 |
| Node.js | Runtime | ≥ 20 |
| WebSocket (`ws`) | Temps réel | ^8.21.0 |
| Electron | Desktop Windows | ^43.1.0 |
| Monaco Editor | Éditeur | ^0.53.0 |
| Google GenAI | Gemini texte/voix | ^2.4.0 |
| Supabase | PostgreSQL + pgvector | ^2.110.2 |
| Redis | Cache / coordination | ^6.2.1 |
| Puppeteer | Automatisation navigateur | ^25.3.0 |
| Mermaid | Diagrammes | ^11.4.1 |
| Tree-sitter | Parsing AST | ^0.27.0 |
| grammy | Bot Telegram | ^1.46.0 |
| PM2 | Supervision production | 7.x |

---

# Prérequis

| Élément | Version minimale |
|---|---|
| Node.js | 20.x |
| npm | 10.x |
| Git | 2.x |
| PM2 | 7.x, optionnel |
| Google AI Studio | Pour `GEMINI_API_KEY` |
| Supabase | Optionnel |
| OpenRouter | Optionnel |
| GitHub | Optionnel |

> Le build Electron (`.exe`) est prévu pour Windows. Le serveur web fonctionne également sous Linux/macOS.

---

# Installation

## 1. Cloner le dépôt

```bash
git clone https://github.com/<owner>/leanna.git
cd leanna
```

## 2. Installer les dépendances

```bash
npm install
```

## 3. Configurer l'environnement

```bash
cp .env.example .env
```

Renseignez au minimum :

```env
GEMINI_API_KEY=...
```

`Leanna_API_TOKEN` et `Leanna_MASTER_KEY` peuvent être générés automatiquement s'ils sont laissés vides.

## 4. Démarrer Leanna

```bash
npm run dev
```

Application disponible sur :

```text
http://127.0.0.1:4000
```

## 5. Desktop Electron

```bash
npm run desktop
```

---

# Configuration

Les variables sont chargées depuis `.env` ou `.env.local`, ce dernier étant prioritaire.

## Variables essentielles

| Variable | Description | Défaut |
|---|---|---|
| `GEMINI_API_KEY` | Clé Google Gemini | — |
| `Leanna_API_TOKEN` | Authentification API/WebSocket | Auto |
| `Leanna_MASTER_KEY` | Chiffrement des données sensibles | Auto |
| `VITE_SERVER_PORT` | Port serveur | `4000` |
| `Leanna_PERMISSION_MODE` | `enforce`, `audit`, `off` | `enforce` |
| `Leanna_GRANTED_PERMISSIONS` | Permissions globales | — |
| `Leanna_DRY_RUN` | Simulation globale | `false` |
| `Leanna_LISTEN_HOST` | Interface d'écoute | `127.0.0.1` |
| `NODE_ENV` | Environnement | `development` |

## Providers IA

| Variable | Description |
|---|---|
| `OPENROUTER_API_KEY` | Clé OpenRouter |
| `OPENROUTER_FREE_API_KEY` | Clé OpenRouter tier gratuit |
| `OPENROUTER_MODEL` | Modèle OpenRouter |
| `LEANNA_PROVIDER_FALLBACK` | Fallback Gemini ↔ OpenRouter |
| `LEANNA_PROVIDER_BREAKER_THRESHOLD` | Seuil du circuit breaker |
| `LEANNA_PROVIDER_BREAKER_COOLDOWN_MS` | Cooldown du provider |

## Redis et multi-instance

| Variable | Description |
|---|---|
| `REDIS_URL` | Redis principal |
| `LEANNA_LOCK_REDIS_URL` | Verrou distribué |
| `LEANNA_EVENTBUS_REDIS_URL` | EventBus Redis Streams |
| `LEANNA_EVENTBUS_STREAM` | Nom du stream |
| `LEANNA_EVENTBUS_MAXLEN` | Taille maximale approximative |

## Runtime autonome

| Variable | Description |
|---|---|
| `LEANNA_HEARTBEAT_ACTIVE_MS` | Heartbeat actif |
| `LEANNA_HEARTBEAT_IDLE_MS` | Heartbeat idle |
| `LEANNA_HEARTBEAT_SLEEP_MS` | Heartbeat sleeping |
| `LEANNA_AUTONOMY_MAX_CONCURRENCY` | Concurrence maximale |
| `LEANNA_AUTONOMY_MAX_CONCURRENT_CYCLES` | Cycles exécutifs simultanés (défaut sûr : `1`) |
| `LEANNA_AUTONOMY_MAX_QUEUE_SIZE` | Taille maximale de queue |
| `LEANNA_AUTONOMY_MAX_RETRIES` | Nombre maximal de retries |
| `LEANNA_AUTONOMY_TASK_TIMEOUT_MS` | Timeout des tâches |
| `LEANNA_AUTONOMY_CIRCUIT_BREAKER_THRESHOLD` | Seuil circuit breaker |
| `LEANNA_AUTONOMY_CIRCUIT_BREAKER_COOLDOWN_MS` | Cooldown |

Pour la liste complète des variables, voir `.env.example` et [`AUTONOMY.md`](AUTONOMY.md).

---

# Lancement et exploitation

## Développement

```bash
npm run dev
```

## Production

```bash
npm run build
npm start
```

## Production avec PM2

Le fichier `ecosystem.config.cjs` configure le process `leanna`.

```bash
npm run build
pm2 start ecosystem.config.cjs
pm2 status
pm2 logs leanna
pm2 save
pm2 startup
```

### API PM2

```text
GET  /api/pm2/status
POST /api/pm2/:name/restart
POST /api/pm2/:name/stop
POST /api/pm2/reload?file=ecosystem.config.cjs
POST /api/pm2/flush
GET  /api/pm2/logs/:name?lines=120
```

## Electron

```bash
npm run desktop
npm run desktop:debug
npm run dist:win
```

---

# Tests

```bash
# Tous les tests
npm test

# Agent Brain (scheduler DAG, validation, réplanification)
node --import tsx --test server/agents/brain/AgentBrain.test.ts

# Cohérence des capacités d'agents (détection d'outils fantômes)
node --import tsx --test server/agents/roleCapabilities.test.ts

# Runtime agentique (budget de mission, écritures transactionnelles, vérification hashée, réparation)
node --import tsx --test server/runtime/agentic/agentic.test.ts

# Migration du moteur partagé (AgentTaskRunner, flotte autonome)
node --import tsx --test server/agents/AgentTaskRunner.test.ts

# Contrat AgentTaskRunner (10 invariants, exécuté contre les deux moteurs)
node --import tsx --test server/agents/AgentTaskRunnerContract.test.ts

# Harness de mission agentique de bout en bout (modèle déterministe)
node --import tsx --test server/runtime/agentic/mission-harness.test.ts

# Harness superviseur (AgentBrain end-to-end, vérification d'étape hashée)
node --import tsx --test server/agents/brain/supervisor-harness.test.ts

# Module spécifique
npm test -- server/skills/browser.test.ts

# Routes
npm test -- server/routes/*.test.ts

# Test de charge autonomie
npm run test:soak

# Boucle perception → objectif → escalade et fin de mission vérifiée
node --import tsx --test server/autonomy/AutonomousExecutive.test.ts server/autonomy/LeannaCore.test.ts server/mission/Executor.test.ts
```

## Smoke-test réel de l'Agent Brain

Une fois le serveur démarré (`npm run dev`), un script vérifie de bout en bout
la planification (avec diagramme Mermaid) puis, en option, l'exécution :

```bash
npm run brain:smoke                              # plan_first : DAG + Mermaid
npm run brain:smoke -- --execute                 # + exécution auto complète
npm run brain:smoke -- --goal "Ton objectif"     # objectif personnalisé
```

Le token est lu automatiquement depuis `.env` (`Leanna_API_TOKEN`). Pendant une
exécution, les logs du serveur affichent les lignes `[BrainScheduler] Fan-out`
qui matérialisent le parallélisme des étapes.

La suite actuelle couvre notamment :

- Agent Brain : scheduler DAG parallèle, validation de plan, réplanification ;
- cohérence des capacités d'agents (détection d'outils fantômes) ;
- runtime agentique : budget de mission par phase, écritures transactionnelles, vérification hashée, réparation bornée ;
- contrat `AgentTaskRunner` (10 invariants) vérifié contre les deux moteurs ;
- harness de bout en bout : mission agentique (modèle déterministe) et superviseur `AgentBrain` avec vérification d'étape hashée ;
- Runtime V2 ;
- boucle exécutive autonome : priorité déterministe, déduplication, escalade de permission et attente de mission terminale ;
- apprentissage : propositions disponibles après mission sans auto-application ;
- skills critiques ;
- validation Zod ;
- routes REST ;
- authentification et autorisation ;
- gestion des erreurs.

---

# Structure du projet

```text
leanna/
├── electron/          # Application desktop
├── server/
│   ├── agents/        # Agents + Agent Brain
│   ├── autonomy/      # Runtime autonome
│   ├── config/        # Configuration serveur
│   ├── knowledge/     # Knowledge Graph / RAG
│   ├── live/          # Gemini Live
│   ├── marketplace/   # Skills et agents
│   ├── mcp/           # Model Context Protocol
│   ├── mission/       # Missions longues
│   ├── notebooks/     # RAG / documents
│   ├── routes/        # API REST
│   ├── runtime/       # Runtime V2
│   ├── skills/        # Skills natifs
│   ├── telegram/      # Bot Telegram
│   ├── workflows/     # Workflows planifiés
│   ├── security.ts    # Auth / sécurité
│   └── lifecycle.ts   # Arrêt propre
├── src/               # Frontend React
│   ├── components/    # UI / IDE / panels
│   ├── context/       # Contextes React
│   ├── hooks/         # Hooks
│   ├── services/      # Clients API
│   ├── stores/        # État global
│   ├── views/         # Pages
│   └── main.tsx       # Entrée frontend
├── scripts/           # Scripts utilitaires
├── assets/            # Assets
├── supabase/          # Schémas et migrations
├── ecosystem.config.cjs
├── server.ts
├── server-bootstrap.ts
├── vite.config.ts
├── package.json
└── .env.example
```

---

# Utiliser l'Agent Brain

## Depuis l'interface

Exemples :

```text
« Modernise mon site et rends le header responsive »

« Corrige le crash au démarrage de l'application »

« Refactorise le module authentication pour respecter les principes SOLID »
```

## Avec le skill

```ts
// Planification seule : renvoie les étapes, leurs dépendances et un diagramme Mermaid
agent_brain({
  goal: "Modernise mon site et rends le header responsive",
  mode: "plan_first"
})

// Exécution complète avec budgets d'auto-correction et de réplanification
agent_brain({
  goal: "Fix le crash au démarrage",
  mode: "auto",
  maxCorrectionAttempts: 2, // tentatives de correction par étape (0-5, défaut 3)
  maxReplans: 2             // réplanifications du sous-graphe restant (0-5, défaut 2)
})
```

## Avec l'API

### Générer un plan

La réponse contient les étapes, leurs `dependsOn` et un champ `mermaid`
(diagramme `graph TD` du DAG, copiable dans [mermaid.live](https://mermaid.live)).

```bash
curl -X POST http://localhost:4000/api/agents/brain/plan \
  -H "Content-Type: application/json" \
  -H "x-leanna-token: <Leanna_API_TOKEN>" \
  -d '{"goal": "Modernise mon site et rends le header responsive"}'
```

### Exécuter une mission

```bash
curl -X POST http://localhost:4000/api/agents/brain/execute \
  -H "Content-Type: application/json" \
  -H "x-leanna-token: <Leanna_API_TOKEN>" \
  -d '{"goal": "Fix le crash au démarrage", "maxCorrectionAttempts": 3, "maxReplans": 2}'
```

### Suivre une mission

```bash
curl -H "x-leanna-token: <Leanna_API_TOKEN>" \
  http://localhost:4000/api/agents/brain/status/<planId>
```

---

# Dépannage

## `GET /api/pm2/status` retourne `503`

Vérifiez :

```bash
pm2 --version
pm2 ping
pm2 list
```

Si PM2 n'est pas installé :

```bash
npm install -g pm2
```

Sous Windows, vérifiez également que PM2 est disponible dans le `PATH` du processus serveur.

## `401 Unauthorized` sur `/api/*`

Lorsque `Leanna_API_TOKEN` est défini, les routes API nécessitent :

```text
x-leanna-token: <Leanna_API_TOKEN>
```

Exception :

```text
/api/health
```

## Gemini Live échoue à cause du quota

Vérifiez les limites de tokens et l'injection des notebooks. Si nécessaire, configurez plusieurs clés `GEMINI_API_KEY_N` pour permettre la rotation et le failover sur les erreurs 429.

---

# Documentation

| Document | Contenu |
|---|---|
| [`API_DOCS.md`](API_DOCS.md) | API REST et WebSocket |
| [`AUTONOMY.md`](AUTONOMY.md) | Runtime autonome 24/7 |
| [`AUTONOMY_AUDIT.md`](AUTONOMY_AUDIT.md) | Audit historique et limites de l'autonomie |
| [`docs/AUTONOMOUS_AGENT_AUDIT.md`](docs/AUTONOMOUS_AGENT_AUDIT.md) | Audit actuel de la boucle exécutive autonome, gaps et contrat d'intégration |
| [`docs/AGENTIC_RUNTIME.md`](docs/AGENTIC_RUNTIME.md) | Runtime agentique : boucle plan→act→verify→recover, budget de mission, écritures transactionnelles |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Architecture technique |
| [`DB_SCHEMA.md`](DB_SCHEMA.md) | Schéma Supabase |
| [`GEMINI.md`](GEMINI.md) | Intégration Gemini |
| [`SELF_IDE.md`](SELF_IDE.md) | Auto-hébergement avec Leanna |
| [`ROADMAP.md`](ROADMAP.md) | Feuille de route |
| [`CHANGELOG.md`](CHANGELOG.md) | Historique des versions |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Contribution et conventions |

---

# Contribution

Consultez [`CONTRIBUTING.md`](CONTRIBUTING.md) pour :

- le workflow Git ;
- les conventions de code ;
- les règles de contribution ;
- le processus de review.

---

# Licence

Leanna est distribué sous licence **BUSL 1.1 (Business Source License 1.1)**.

Voir [`LICENSE`](LICENSE) pour les conditions complètes.
