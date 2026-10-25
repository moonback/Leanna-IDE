# Agents & missions — architecture réelle (vérifiée le 2026-10-25)

Cartographie établie par lecture du code et `grep` des appelants, pas par la présence de fichiers.

## Flux d'exécution réellement empruntés

```
UI / API
 ├─ POST /api/missions ─► handleToolCall("mission_create") ─► mission/Executor.startMission
 │     preparePlan (Planner.decompose + planActions, PlanEstimator)
 │     launchMission ─► writeQueue (1 mission réelle à la fois ; dry-run en parallèle)
 │        ├─ [défaut] executeMission ─► executeGoalsScheduled (vagues, maxConcurrentGoals=3)
 │        │        └─ executeGoalDirectly ─► executeAction ─► skillHandler ─► ToolRegistry.call
 │        │                 (retry / replan / escalate / abort décidés par Reflection)
 │        │        └─ verifyGoalCriteria ─► verifyByEvidence (EvidenceEngine, ON par défaut)
 │        └─ [LEANNA_MISSION_SUPERVISED=1] runSupervised ─► LeannaSupervisor.runMission
 │                 (MissionStateMachine durable, CheckpointManager, EvidenceEngine) ─► executeMission
 │     finalizeMission ─► persist (CompositeMissionStore : LocalMissionStore + Supabase)
 │     redémarrage ─► resumePending (missions pending/in_progress) ─► confirmResume
 │
 └─ /api/agents/* ─► AgentOrchestrator ─► TaskScheduler / DelegationManager
          └─ AgentRuntimeExecutor.execute ─► AgenticRuntime.run (plan → act → verify → recover)
                   └─ ToolRegistry.call (PermissionPolicy, DryRun, LedgerGuard*, JevSafetyGate*)
```

`*` branchés seulement si activés (`LEANNA_IDEMPOTENCY`, `LEANNA_SAFETY_GATE`) via `core/kernel.ts` (`runtime/bootstrap.ts`).

## Deux runtimes : rôles distincts, pas de double exécution

- `mission/Executor` exécute les **missions** (graphe d'objectifs → actions outil).
- `runtime/agentic/AgenticRuntime` exécute les **tâches agent** (boucle LLM outillée), via `AgentRuntimeExecutor` (`AgentOrchestrator.enableAgenticRuntime`). `AgentExecutor` (legacy) reste en repli derrière le contrat `AgentTaskRunner`.
- Une même mission n'est pas exécutée par les deux : l'Executor appelle des **outils**, pas le runtime agentique.

## Chemins opt-in

- Lot 1 : `CoreKernel.runSupervisedAgenticMission` n'avait aucun appelant hors tests.
- Lot 2 : il est branché sur `AgentRuntimeExecutor.execute` si `LEANNA_AGENT_SUPERVISED=1` :
  `AgentRuntimeExecutor.runSupervised` ─► `kernel.runSupervisedAgenticMission` ─► `LedgerGuard.runWithContext` / `JevSafetyGate.runWithContext` ─► `LeannaSupervisor.runMission` ─► `createAgenticMissionRunner` ─► `AgenticRuntime.run`.
- Le contexte ambiant d'idempotence est isolé par `AsyncLocalStorage`. `setContext` (global) ne reste utilisé que par les tests.

## Matrice

| Composant | Responsabilité | Appelants réels | État détenu | Persistance | Tests | Statut vérifié | Risque |
|---|---|---|---|---|---|---|---|
| `mission/Executor` | cycle de vie mission | `server.ts`, `routes/missions.ts`, skills `mission_*` | missions actives/terminées, pauses, approbations, file d'écriture | `CompositeMissionStore` | `Executor.test.ts` (19) | 2 défauts corrigés (F-03, F-04) | élevé (2 951 lignes) |
| `mission/Mission` | état objectifs/actions, pile | Executor | `MissionState` | via store | indirects | `blockGoal` ne dépile pas (cause de F-03) | moyen |
| `core/LeannaSupervisor` | autorité de cycle, preuve, rollback | `Executor.runSupervised` (opt-in) | machine d'états | `DurableMissionStore` | 11 + 2 | F-04 corrigé | moyen |
| `core/MissionStateMachine` | transitions validées | Supervisor | état + historique | snapshot | 8 | conforme | faible |
| `core/EvidenceEngine` | preuve factuelle | Executor, Supervisor | — | `.Leanna/core/evidence` | 6 | conforme | faible |
| `core/CheckpointManager` | snapshot/rollback | Supervisor | checkpoints | `.Leanna/core` | 6 | conforme | moyen (rollback de fichiers) |
| `core/ExecutionLedger` + `LedgerGuard` | idempotence | ToolRegistry (opt-in) | journal | `actions.jsonl` | 6 + 8 | conforme ; contexte ambiant global (F-06, non corrigé) | faible en prod |
| `runtime/agentic/AgenticRuntime` | boucle agent | `AgentRuntimeExecutor`, `AgenticMissionRunner` | `RunSession` | — | 20 + 11 + 6 | F-01 corrigé | élevé (1 725 lignes) |
| `agents/AgentRuntimeExecutor` | adaptation tâche ↔ runtime, annulation | `AgentOrchestrator`, `AgentRegistry` | `AbortController` par tâche | — | 5 + 13 | F-02 corrigé | moyen |
| `agents/AgentOrchestrator` | orchestration, annulation | `routes/agents.ts` | plans, tâches | `agentPersistence` | indirects | lecture seule | moyen |
| `runtime/ToolRegistry` | point unique d'appel d'outil | tous | cache de lecture 5 s, métriques | — | 2 suites dédiées | lecture seule | moyen |
| `runtime/PermissionPolicy` / `AuthorizationGate` / `DryRun` / `SafetyGate` | sécurité | ToolRegistry | — | — | dédiés | non modifiés | — |

## Doublons

- Deux machines d'états (`GoalStatus` de l'Executor, `MissionLifecycleState` du core) : couche additive documentée, fusionnée seulement en mode supervisé. Non modifié (règle : ne pas créer de 2e registre).
- Deux moteurs de tâche (`AgentExecutor` legacy, `AgentRuntimeExecutor`) sous un contrat commun testé : légitime pendant la migration.
