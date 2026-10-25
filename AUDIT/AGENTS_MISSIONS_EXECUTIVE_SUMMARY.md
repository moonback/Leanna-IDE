# Agents & missions — synthèse (2026-10-25)

Détails : [architecture](AGENTS_MISSIONS_ARCHITECTURE.md) · [constats](AGENTS_MISSIONS_FINDINGS.md) · [performances](AGENTS_MISSIONS_PERFORMANCE.md) · [tests](AGENTS_MISSIONS_TEST_RESULTS.md) · [plan](AGENTS_MISSIONS_ACTION_PLAN.md) · [changelog](AGENTS_MISSIONS_CHANGELOG.md)

## En bref

- **3 défauts P0 corrigés.** Ce sont des fausses réussites ou des statuts faux sur les chemins de production par défaut. Chacun a été reproduit par un test qui échouait avant le correctif.
- **1 défaut P1 corrigé** en mode supervisé (opt-in).
- **2 défauts confirmés et 1 hypothèse documentés, non corrigés**, avec justification.
- Diff : 4 lignes de logique modifiées dans 3 fichiers source, 6 tests ajoutés. Aucune dépendance, API ou format persisté modifié.
- Performances LLM (latences, tokens, coûts) **indisponibles** : aucune mission réelle exécutée, faute de serveur et de clé fournisseur dans la session.

## Problèmes les plus importants

1. **F-01** : une tâche agent dont le plan s'arrête en cours de route (budget épuisé, ou exception suivie d'un abandon) pouvait être déclarée `success`.
2. **F-02** : une tâche agent annulée par l'utilisateur pendant son exécution était enregistrée `failed`.
3. **F-03** : une mission dont un sous-objectif est escaladé était finalisée **et persistée** `in_progress`, puis reproposée comme « interrompue » au redémarrage.
4. **F-04** : en mode supervisé, une mission en échec subissait 2 tentatives vides, chacune suivie d'un rollback.
5. **F-05** : le chemin « mission agentique supervisée » du noyau (`runSupervisedAgenticMission`) n'a aucun appelant en production. Ses garanties ne s'appliquent pas aux tâches agents.

## Tableau récapitulatif

| Problème | Gravité | Cause racine | Correction | Test | Résultat | Statut |
|---|---|---|---|---|---|---|
| F-01 Plan inachevé déclaré `success` | P0 | `assessOutcome` ne compte que `failed` ; les étapes `pending`/`running` sont ignorées | toute étape ni `done` ni `skipped` = non accomplie | `agentic.test.ts` « assessOutcome — étapes non terminées » (3) | 2 échecs avant → 20/20 après | Corrigé |
| F-02 Annulation rapportée `failed` | P0 | le runtime retourne `blocked` sans lever ; seul le `catch` posait `cancelled` | signal annulé + échec → `cancelled` | `AgentTaskRunner.test.ts` « annulation en cours d'exécution » | `failed` avant → 5/5 après | Corrigé |
| F-03 Mission finalisée `in_progress` | P0 | `blockGoal` ne dépile pas ; `completeActiveGoal` fermait le sous-objectif au lieu de la racine | `completeGoal(rootGoal.id)` | `Executor.test.ts` « escalated (blocked) sub-goal » | échec avant → 19/19 après | Corrigé |
| F-04 Tentatives fantômes en mode supervisé | P1 | relance de `executeMission` sur une mission finalisée | escalade si la mission est terminale et en échec | `Executor.test.ts` « does not fake retries » | `attempts` 3 → 1 | Corrigé |
| F-05 Noyau agentique supervisé non branché | P1 | aucun appelant de production | aucune (décision requise, validation LLM nécessaire) | — | — | Confirmé, ouvert |
| F-06 Contexte `LedgerGuard` global | P2 | état ambiant partagé | aucune (non exploitable tant que F-05 est inactif) | — | — | Confirmé, ouvert |
| F-07 Divergence statut/preuve en supervisé | P2 | actions `failed` non critiques comptées dans la preuve | aucune | non reproduit | — | Hypothèse |

## Critères de réussite

- Défauts critiques identifiés corrigés : oui (F-01 à F-03). F-05 est bloqué avec justification.
- Fausse réussite empêchée sur les chemins corrigés : oui, prouvé par les tests.
- Tests ciblés et suite serveur complète : voir `AGENTS_MISSIONS_TEST_RESULTS.md`.
- Performances : marquées indisponibles, rien n'est inventé.
- UI : non auditée en détail (seul le polling a été inspecté).
