# Architecture d'Orchestration — Jarvis-OS

## 1. Contexte et Objectifs

Jarvis-OS dispose actuellement de deux sous-systèmes d'orchestration dans le backend :
1. `server/mission/` : Système cognitif orienté objectifs (Planification, Boucle Plan-Act-Verify-Reflect, Détection de boucles, Scoring de compétences).
2. `server/runtime/` (Runtime V2) : Moteur d'exécution modulaire et réactif (Conteneur d'injection, Registre d'outils typé, Moteur de workflows DAG, Machine à états finis, EventBus, Observabilité).

Ce document dresse l'état des lieux, cartographie les responsabilités de chaque module, analyse le recouvrement et décrit la cible d'unification.

---

## 2. Cartographie des Responsabilités

### 2.1 Sous-système `server/mission/` (Niveau Cognitif)

| Fichier | Rôle | Dépendances principales |
|---|---|---|
| `Executor.ts` | Boucle autonome Plan → Act → Verify → Correct. Gère la file de missions actives et complétées. | `Planner`, `ReflectionEngine`, `SkillScorer`, `SkillManager` |
| `Planner.ts` | Décomposition d'un objectif de haut niveau en sous-objectifs et actions séquentielles/parallèles. | `SkillScorer`, `types.ts` |
| `Reflection.ts` | Évaluation des résultats d'outils, détection de boucles infinies ou d'échecs répétitifs, génération de rapports de mission. | `ProjectMemory`, `types.ts` |
| `SkillScorer.ts` | Évaluation de la pertinence d'une compétence par rapport à un objectif donné. | `types.ts` |
| `Mission.ts` | Modèle de données mutable représentant l'arbre d'objectifs, le contexte et l'historique d'une mission. | `types.ts` |

### 2.2 Sous-système `server/runtime/` (Niveau Infrastructure & Exécution)

| Fichier | Rôle | Dépendances principales |
|---|---|---|
| `AgentRuntime.ts` | Conteneur d'injection de dépendances, ordonnanceur de tâches, cycle de vie des agents plugins. | `EventBus`, `StateMachine`, `ToolRegistry`, `Memory` |
| `ToolRegistry.ts` | Registre typé des outils avec timeouts stricts, vérification de permissions et métriques d'exécution. | `EventBus`, `types.ts` |
| `WorkflowEngine.ts` | Moteur d'exécution déclarative de workflows DAG (JSON/YAML) avec templating d'arguments et parallélisme. | `ToolRegistry`, `EventBus`, `types.ts` |
| `StateMachine.ts` | Machine d'états formelle régissant les transitions des tâches (`pending` → `running` → `completed` / `failed`). | `types.ts` |
| `EventBus.ts` | Bus d'événements typé découplant les composants système et notifiant les clients WebSocket. | Node `EventEmitter` |
| `PromptRegistry.ts` | Registre et compilateur de templates de prompts LLM avec mise en cache. | `types.ts` |
| `Observability.ts` | Collecteur centralisé de métriques, traces et logs structurés. | `EventBus` |
| `compat/` | Adaptateurs de compatibilité (`LegacyBridge`, `SkillAdapter`, `SkillManagerV2`). | `ToolRegistry`, `AgentRuntime` |

---

## 3. Analyse de Recouvrement

```
                   ┌──────────────────────────────────────────────┐
                   │               Couche Cognitive               │
                   │                                              │
                   │   server/mission/ (Objectifs, Plan, Reflec)   │
                   └──────────────────────┬───────────────────────┘
                                          │  utilise
                                          ▼
                   ┌──────────────────────────────────────────────┐
                   │              Couche d'Exécution              │
                   │                                              │
                   │  server/runtime/ (ToolRegistry, DAG, Events) │
                   └──────────────────────┬───────────────────────┘
                                          │  pilote
                                          ▼
                   ┌──────────────────────────────────────────────┐
                   │               Couche Outils / OS             │
                   │                                              │
                   │      server/skills/ (Codebase, Shell, IDE)   │
                   └──────────────────────────────────────────────┘
```

1. **Complémentarité vs Duplication** :
   - `mission/` ne duplique pas `runtime/` : `mission/` est un résolveur d'objectifs autonome (IA), tandis que `runtime/` est un orchestrateur déterministe de composants et de workflows.
   - Le point de friction actuel réside dans l'accès aux outils : `mission/Executor` appelait directement `SkillManager.handleToolCall`, contournant les métriques, timeouts et permissions du `ToolRegistry` de `runtime/`.

2. **Événements et Observabilité** :
   - `mission/Executor` utilisait un callback ad-hoc `ExecutorEventEmitter` alors que `runtime/EventBus` offre déjà une publication/souscription unifiée avec typage strict.

---

## 4. Architecture Cible Unifiée

1. **`ToolRegistry` comme source unique d'outils** : Tous les outils (`server/skills/*`) sont enregistrés dans `ToolRegistry`.
2. **`MissionExecutor` comme Agent Plugin du Runtime** : `mission/` devient le composant d'autonomie cognitive s'exécutant sur le socle `AgentRuntime`.
3. **`EventBus` comme canal unique** : Les événements de mission (`mission:started`, `goal:completed`, `reflection:loop_detected`) transitent par l'EventBus global.
