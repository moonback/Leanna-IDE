# Cartographie du runtime autonome de Leanna

> Mise à jour : 2026-11-06 · Référence de l'architecture observée sur `main`.
> Cette cartographie décrit les chemins réellement câblés. Elle ne signifie pas que
> toutes les protections optionnelles sont activées dans chaque installation.

## 1. Deux moteurs distincts

Leanna possède deux chemins d'exécution principaux, qui ont des responsabilités différentes :

```text
Missions utilisateur / API
  └─ server/mission/Executor.ts
       ├─ Planner / plan d'objectifs
       ├─ executeGoalsScheduled / executeGoalDirectly
       ├─ SkillHandler → ToolRegistry.call
       ├─ verifyGoalCriteria / EvidenceEngine
       └─ persistance et reprise des missions

Tâches d'agents / API
  └─ AgentOrchestrator
       └─ AgentRuntimeExecutor (AgentTaskRunner)
            └─ server/runtime/agentic/AgenticRuntime.ts
                 ├─ plan → act → observe
                 ├─ ToolRegistry.call
                 ├─ verify → recover → finalize
                 └─ WorkspaceState / vérifications hashées
```

**Ne pas confondre** le moteur de missions (`mission/Executor`) et le runtime agentique
(`runtime/agentic/AgenticRuntime`). Le second est utilisé par les tâches déléguées via
`AgentRuntimeExecutor`. Le moteur legacy `AgentExecutor` reste un repli derrière le contrat
`AgentTaskRunner`, notamment pour préserver les tâches déjà actives lors d'un changement de runner.

## 2. Chemin des missions

- Entrées : routes et skills de missions, chat/Live, et autonomie via `LeannaCore`.
- Planification : `server/mission/Planner.ts`, `SkillScorer`, dépendances et vagues
  d'exécution dans `server/mission/Executor.ts`.
- Exécution : les actions passent par le handler de skills puis `ToolRegistry.call`.
- Vérification : `verifyGoalCriteria` et `EvidenceEngine` ; le niveau de preuve dépend
  de la configuration effective et du chemin utilisé.
- Persistance : `CompositeMissionStore` (stockage local et Supabase si configuré).
- Reprise : `resumePending` au démarrage, avec les règles de reprise du moteur de missions.

La gouvernance par `LeannaSupervisor` est **opt-in** via
`LEANNA_MISSION_SUPERVISED=1` pour le chemin de mission décrit dans l'audit
`AUDIT/AGENTS_MISSIONS_ARCHITECTURE.md` (25 octobre 2026). Ne pas présenter le Supervisor,
les checkpoints et le rollback comme une garantie universelle de chaque mission.

## 3. Chemin des tâches d'agents

- `AgentOrchestrator` expose délégation et orchestration.
- `AgentRuntimeExecutor` adapte le contrat `AgentTaskRunner` au runtime agentique.
- `AgenticRuntime` se trouve dans `server/runtime/agentic/AgenticRuntime.ts`
  (et non `AgentRuntime.ts`).
- `ToolPromptBuilder` expose au modèle les outils résolus depuis les capacités et le registre.
- `ToolRegistry.call` applique les contrôles de permissions, dry-run, timeout, annulation,
  idempotence et Safety Gate lorsqu'ils sont configurés.
- `WorkspaceState` et `verify_file` fournissent les vérifications hashées des fichiers.
- `AgentRepairLoop` borne les tentatives de correction et de replanification.

Le runtime agentique n'implique pas qu'un `tsc` ou qu'une suite de tests complète soit
automatiquement lancée après chaque étape. Ces contrôles sont des outils que le plan ou
l'appelant doit demander explicitement ; distinguer une vérification de fichier d'un
typecheck et d'une exécution de tests.

## 4. Rôles et attribution des outils

Les rôles statiques sont définis par `STATIC_AGENT_ROLES` dans
`server/agents/types.ts` (20 rôles au 2026-11-06), auxquels peuvent s'ajouter des rôles
dynamiques. Les outils disponibles varient selon les skills, plugins, MCP et outils
personnalisés chargés au démarrage.

La résolution d'attribution est implémentée dans `server/agents/toolAgentMapper.ts` :
1. attribution explicite portée par le ToolRegistry / socle des outils sensibles ;
2. capacités des rôles ;
3. catégorie sémantique, qui reste une attribution probable ;
4. rôle neutre `system` en l'absence d'attribution.

`server/agents/attributionAudit.ts` calcule les totaux sur les outils réellement enregistrés.
Les chiffres ne doivent donc pas être copiés comme constantes dans une documentation.

## 5. Contrôles et options de sécurité

| Contrôle | Source | Condition |
|---|---|---|
| Permissions | `server/runtime/PermissionPolicy.ts` | Selon `Leanna_PERMISSION_MODE` et permissions accordées |
| Dry-run | `server/runtime/DryRun.ts` | Selon le contrôleur et les options d'appel |
| Autorisation agent/outils sensibles | `server/agents/toolAgentMapper.ts` + `PermissionPolicy` | Attribution appliquée au bootstrap |
| Idempotence / ledger | `server/core/ExecutionLedger.ts`, `LedgerGuard.ts` | Branchée par défaut (opt-out `LEANNA_IDEMPOTENCY=false`) |
| Safety Gate Jev | `server/core/JevSafetyGate.ts` | Mode `LEANNA_SAFETY_GATE=off|audit|enforce` (défaut : `audit` non bloquant si clé OpenRouter, sinon `off`) |
| Supervisor agentique | `server/core/LeannaSupervisor.ts` | Chemin supervisé opt-in, notamment `LEANNA_AGENT_SUPERVISED=1` |
| Sandbox | `server/utils/sandbox.ts` et helpers de skills | Selon le chemin et l'outil d'écriture |

Ne jamais déduire l'état effectif d'une protection de la seule présence de son fichier :
contrôler les variables d'environnement, le bootstrap et l'appelant du chemin concerné.

## 6. Références de vérification

- `AUDIT/AGENTS_MISSIONS_ARCHITECTURE.md` — cartographie des appels réels, mise à jour
  du 2026-10-25 ; référence la plus récente pour la distinction missions / agents.
- `docs/AGENTIC_RUNTIME.md` — détails du runtime agentique et de ses budgets.
- `server/agents/AgentRuntimeExecutor.ts` — adaptateur d'exécution.
- `server/runtime/agentic/AgenticRuntime.ts` — boucle agentique.
- `server/agents/toolAgentMapper.ts` et `server/agents/attributionAudit.ts` — attribution.
- `server/core/kernel.ts` — assemblage et activation conditionnelle des protections P0.

## 7. Limites de cette documentation

Cette page est une carte d'architecture, pas un rapport de tests. Elle ne certifie ni les
résultats d'une exécution locale, ni les secrets présents dans un fichier `.env`, ni les
valeurs de configuration de l'installation de l'utilisateur. Les états de tests et les
constats ponctuels doivent rester dans des audits datés avec leur commit de référence.
