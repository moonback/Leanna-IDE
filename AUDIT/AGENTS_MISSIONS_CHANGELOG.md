# Agents & missions — changelog (2026-10-25)

Aucune dépendance ajoutée. Aucune API, aucun contrat ni format persisté modifié.

| Fichier | Modification | Raison |
|---|---|---|
| `server/runtime/agentic/AgenticRuntime.ts` | `assessOutcome` : une étape ni `done` ni `skipped` compte comme non accomplie | F-01 |
| `server/agents/AgentRuntimeExecutor.ts` | résultat non réussi + signal annulé → statut et notification `cancelled` | F-02 |
| `server/mission/Executor.ts` | fin de mission : `completeGoal(rootGoal.id)` au lieu de `completeActiveGoal` | F-03 |
| `server/mission/Executor.ts` | `runSupervised` : mission terminale non réussie → `suggestedRecovery = "escalate"` | F-04 |
| `server/runtime/agentic/agentic.test.ts` | +3 tests `assessOutcome` | régression F-01 |
| `server/agents/AgentTaskRunner.test.ts` | +1 test d'annulation en cours d'exécution | régression F-02 |
| `server/mission/Executor.test.ts` | +2 tests (statut terminal, absence de tentatives fantômes) | régression F-03, F-04 |
| `AUDIT/AGENTS_MISSIONS_*.md` | 7 rapports | livrables demandés |

## Lot 2 — branchement supervisé des tâches agents (F-05) et isolation du contexte (F-06)

| Fichier | Modification |
|---|---|
| `server/core/LedgerGuard.ts`, `server/core/JevSafetyGate.ts` | `runWithContext` (`AsyncLocalStorage`), prioritaire sur le contexte global |
| `server/core/AgenticMissionRunner.ts` | options `baseTask` (champs de la tâche réelle) et `onResult` |
| `server/core/kernel.ts` | `runSupervisedAgenticMission` générique : `baseTask`, renvoie `lastResult`, contexte isolé ; `agentSupervisionEnabledFromEnv` |
| `server/agents/AgentRuntimeExecutor.ts` | `setSupervision` / `isSupervised` ; chemin supervisé dans `execute` |
| `server/agents/AgentOrchestrator.ts` | `setAgentSupervision` |
| `server/runtime/bootstrap.ts` | `enableAgentSupervision` / `LEANNA_AGENT_SUPERVISED` sur les deux bootstraps |
| `.env.example` | `LEANNA_AGENT_SUPERVISED="false"` |
| `server/core/kernel.test.ts` | +2 tests (concurrence F-06, transmission des champs de tâche) |
| `server/agents/AgentTaskRunner.test.ts` | +3 tests (verdict Supervisor, COMPLETED, aucune tentative) |

Par défaut (flag absent), le comportement est inchangé.

## Lot 3 — cohérence supervisée (F-07) et tokens mesurés dans l'UI (F-08)

| Fichier | Modification |
|---|---|
| `server/mission/Executor.ts` | en mode supervisé, verdict d'objectif par preuve factuelle (EvidenceEngine par défaut si absent) |
| `server/runtime/agentic/types.ts` | `BudgetUsage.tokens`, `BudgetUsage.unmeasuredLlmCalls` ; champs optionnels dans `ExecutionTrace.budget` |
| `server/runtime/agentic/AgenticRuntime.ts` | `accountCost` cumule les tokens mesurés et compte les appels sans mesure ; exposés dans la trace |
| `src/components/panels/MissionDetail.tsx` | ligne « Tokens mesurés » (absente sans mesure, total partiel signalé) |
| `server/mission/Executor.test.ts` | +1 test F-07 |
| `server/runtime/agentic/agentic.test.ts` | +1 test `accountCost` |
| `src/components/panels/MissionDetail.test.tsx` | +2 tests (aucun zéro trompeur, total partiel) |

## Changements de comportement observables

- Une tâche agent arrêtée par épuisement du budget avant la fin de son plan n'est plus `success`. Elle devient `partial` (écritures vérifiées mais plan inachevé) ou `failed` (aucune écriture).
- Une tâche agent annulée pendant son exécution est `cancelled`, plus `failed`.
- Une mission dont un sous-objectif est escaladé se termine `failed`, plus `in_progress` ; elle n'est plus reproposée à la reprise.
- En mode supervisé, une mission en échec est escaladée après 1 tentative réelle au lieu de 3 comptées (dont 2 vides).

## Rollback

`git checkout -- <fichier>` sur les 4 fichiers source ci-dessus ; les tests ajoutés échoueront alors, comme attendu.
