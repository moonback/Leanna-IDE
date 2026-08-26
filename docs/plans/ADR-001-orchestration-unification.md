# ADR-001: Unification de l'Orchestration (Mission vs Runtime)

- **Statut** : Proposé (Sprint 2)
- **Date** : 2026-08-26
- **Auteurs** : Jarvis OS Core Team

## Contexte

Dans les versions précédentes de Jarvis-OS, deux sous-systèmes d'orchestration ont émergé indépendamment :
1. `server/mission/` : Implémente la boucle cognitive de résolution d'objectifs (décomposition d'objectifs, planification, réflexion sur les résultats, détection de boucles d'erreur, heuristiques de scoring des outils).
2. `server/runtime/` : Implémente le runtime modulaire V2 (injection de dépendances, registre d'outils typé avec métriques et timeouts, EventBus typé, machine à états pour les tâches, moteur de workflows DAG).

Actuellement, `server.ts` démarre les deux systèmes en parallèle. Le `SkillManager` est mirroré manuellement dans `runtime.tools` via un timer au démarrage.

## Problématique

1. **Double registre d'outils** : `SkillManager` (v1) et `ToolRegistry` (v2) coexistent, générant un risque de dérive sur les signatures d'outils et les métriques de fiabilité.
2. **Double canal d'événements** : `Executor.setEventEmitter` (v1) et `EventBus` (v2) émettent tous les deux vers les websockets de manière désynchronisée.
3. **Absence de garanties de timeout sur les missions** : Les missions exécutées via `mission/Executor` ne bénéficient pas des timeouts stricts ni du contrôle de concurrence fournis par `runtime/ToolRegistry`.

## Décision

Nous adoptons une **architecture en couches non-redondante** :

1. **Conservation de `server/mission/` comme Couche Cognitive** :
   - `Planner`, `ReflectionEngine`, `SkillScorer`, `Mission` sont conservés et restent focalisés sur l'intelligence de résolution de problèmes.
   - `Executor` est adapté pour déléguer l'invocation des outils à `ToolRegistry` (au lieu de `SkillManager` direct).

2. **Élévation de `server/runtime/` comme Socle d'Exécution Unique** :
   - `ToolRegistry` devient l'unique point d'entrée pour l'exécution d'actions dans le système.
   - `EventBus` centralise tous les événements de mission, de workflow et d'agents.

3. **Stratégie de Transition Progressive** :
   - Phase 1 (Actuelle) : Documentation et audit (ADR-001 + architecture-orchestration.md).
   - Phase 2 : Injection de `ToolRegistry` et `EventBus` dans `mission/Executor`.
   - Phase 3 : Remplacement définitif de `SkillManager` par `SkillManagerV2` branché nativement sur `ToolRegistry`.

## Conséquences

### Positives
- Clarté conceptuelle : `mission/` = IA / Raisonnement / Auto-correction ; `runtime/` = Infrastructure / Scheduler / EventBus / Timeouts.
- Sécurité accrue : Tous les appels d'outils des missions passent par les garde-fous, métriques et timeouts du `ToolRegistry`.
- Observabilité unifiée : Tous les événements passent par le même `EventBus`, simplifiant le frontend et les logs.

### Risques & Mitigations
- *Risque* : Régression sur les missions complexes en cas de changement de signature de handler.
- *Mitigation* : Le bridge `SkillAdapter` garantit la compatibilité ascendante et les 208 tests automatisés valident le comportement à chaque étape.
