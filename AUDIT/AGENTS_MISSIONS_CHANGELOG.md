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

## Changements de comportement observables

- Une tâche agent arrêtée par épuisement du budget avant la fin de son plan n'est plus `success`. Elle devient `partial` (écritures vérifiées mais plan inachevé) ou `failed` (aucune écriture).
- Une tâche agent annulée pendant son exécution est `cancelled`, plus `failed`.
- Une mission dont un sous-objectif est escaladé se termine `failed`, plus `in_progress` ; elle n'est plus reproposée à la reprise.
- En mode supervisé, une mission en échec est escaladée après 1 tentative réelle au lieu de 3 comptées (dont 2 vides).

## Rollback

`git checkout -- <fichier>` sur les 4 fichiers source ci-dessus ; les tests ajoutés échoueront alors, comme attendu.
