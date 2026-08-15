# Architecture de Jarvis-OS

## Vue d'ensemble

Jarvis-OS est un IDE intelligent multi-projets avec une architecture serveur Node.js/Express et un frontend React/Vite. L'IA (via Gemini/OpenRouter) est intégrée comme co-pilote avec un système d'agents spécialisés.

## Couches principales

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React/Vite)                     │
│  src/components/ — UI IDE (Monaco, FileExplorer, Chat, etc.)     │
└─────────────────────────────┬───────────────────────────────────┘
                              │ HTTP + WebSocket
┌─────────────────────────────▼───────────────────────────────────┐
│                         server.ts (Express)                       │
│  Routes REST + WebSocket Gemini Live + SSE Scaffold               │
└──────┬─────────────┬───────────────────┬────────────────────────┘
       │             │                   │
┌──────▼──────┐ ┌───▼────────┐ ┌────────▼──────────┐
│   Skills    │ │   Agents   │ │    Knowledge      │
│ (Outils IA) │ │ (Multi-agent│ │ (Graphe, Mémoire, │
│             │ │  autonome)  │ │  Indexation)      │
└─────────────┘ └────────────┘ └───────────────────┘
```

## Composants serveur

### `server/skills/` — Système de compétences (outils)

Chaque "skill" expose des outils (tool declarations) que l'IA peut appeler :

- **SkillManager** (legacy, ~960 lignes) : chargement dynamique, scoring par keywords, lazy loading
- **SkillManagerV2** (nouveau, ~200 lignes) : délègue au `ToolRegistry`, plus simple

> **Décision d'architecture** : SkillManagerV2 est le remplacement prévu mais pas encore
> activé par défaut (server.ts utilise toujours SkillManager). Migration progressive en cours.

Skills existantes : `codebase`, `git`, `github`, `system`, `knowledge`, `memory`, `agents`, `mission`, `verify`, `automation`, `weather`, `list`, `history`, `project`, `reasoning`, `guidelines`, `aiStudioDirectives`

### `server/agents/` — Système multi-agents

- **AgentOrchestrator** : façade pour créer/exécuter des tâches et des orchestrations
- **AgentExecutor** : cycle de vie d'une tâche (prompt → LLM → outils → résultat)
- **TaskScheduler** : parallélisme avec gestion des dépendances entre tâches
- **AgentMessageBus** : pub/sub + request/response inter-agents
- **AgentPersistence** : persistance Supabase avec mode dégradé (mémoire)
- **AgentRegistry** : registre des agents autonomes disponibles

### `server/knowledge/` — Système de connaissance projet

- **KnowledgeGraph** : graphe d'entités (fichiers, classes, fonctions, dépendances)
- **ProjectIndexer** : indexation incrémentale avec FileWatcher
- **ProjectMemory** : faits et conventions, index inversé pour recherche sémantique
- **ImpactAnalyzer** : analyse d'impact des modifications
- **UnderstandingEngine** : construction de contexte pour les agents

### `server/mission/` — Système de missions

- **Executor** : exécution de plans multi-étapes
- **PlanningEngine** : ordonnancement et décomposition
- **ReflectionEngine** : apprentissage post-mission

### `server/runtime/` — Nouveau runtime (en développement)

- **AgentRuntime** : nouvelle architecture unifiée
- **ToolRegistry** : registre centralisé d'outils avec métriques
- **EventBus** : bus d'événements typé
- **compat/** : adaptateurs de compatibilité (SkillManagerV2, SkillAdapter)

### `server/utils/` — Utilitaires transverses

- **selfRoot.ts** : résolution du workspace projet actif (SELF_ROOT)
- **sandbox.ts** : sandbox isolé pour auto-modification sécurisée
- **logger.ts** : logger structuré avec niveaux et préfixes
- **pathUtils.ts** : module centralisé de résolution de chemins
- **geminiKeyPool.ts** : pool de clés Gemini avec rotation et retry
- **confirmationBridge.ts** : pont WebSocket pour confirmations interactives

### `server/autonomy/` — Boucle d'autonomie

- **AutonomousLoop** : boucle de décision autonome
- **Supervisor** : surveillance et limites

## Sécurité

- **Sandbox** : toute écriture passe par `.jarvis/sandbox/`, validée avant sync
- **Path validation** : `assertSandboxReady()` vérifie chemins relatifs, rejette symlinks
- **Command injection** : whitelist de commandes, filtrage de métacaractères
- **Confirmation interactive** : pont WebSocket pour approbation utilisateur

## Flux de données

1. **Chat vocal/texte** → WebSocket → Gemini Live → Tool calls → Skills → Réponse
2. **Écriture fichier** → assertSandboxReady → sandbox → validation (tsc) → syncToMain
3. **Multi-agents** → Orchestrator → TaskScheduler → AgentExecutor → ProgressNotifier

## Persistance

- **Supabase** : tâches agents, orchestrations, mémoires, listes, conversations
- **Fichier local** : `.jarvis/lastProject.json`, `.jarvis/ProjectKnowledge.json`
- **En mémoire** : KnowledgeGraph, MessageBus (avec limites)
