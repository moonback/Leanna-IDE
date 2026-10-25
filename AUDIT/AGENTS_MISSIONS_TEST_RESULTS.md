# Agents & missions — résultats de tests (2026-10-25)

Tous les tests ci-dessous sont **simulés** (sans fournisseur LLM réel). Aucun test avec un vrai fournisseur n'a été exécuté.

## Suite complète et contrôles

| Commande | Avant | Après | Remarque |
|---|---|---|---|
| `npm test` (`server/**/*.test.ts`) | 1 491 / 1 491 réussis, 243 s | **1 497 / 1 497 réussis**, 113 s | +6 tests ajoutés ; durées non comparables (1 exécution chacune, charge machine non contrôlée) |
| `npm run typecheck` (`tsconfig.json`) | 0 erreur | **0 erreur** | — |
| `npm run typecheck:test` (`tsconfig.test.json`) | non exécuté | 2 erreurs | **préexistantes** : `src/hooks/useAutonomyTimeline.ts:201` (TS2339) et `src/lib/fetchDedup.test.ts:2` (TS2835), deux fichiers non modifiés |
| `npm run lint` | non exécuté | 0 erreur, 5 589 avertissements, 52 infos | baseline non relevée : pas de comparaison possible |
| `npm run test:ui` (vitest) | non exécuté | non exécuté | aucun fichier front modifié |
| `npm run build` | non exécuté | non exécuté | la logique serveur modifiée est déjà couverte par `tsc` + tests ; build non validé |
| `npm run test:missions` | non exécuté | non exécuté | exige un serveur lancé et une clé LLM |

## Tests de régression ajoutés (échec avant correctif → succès après)

| Test | Fichier | Avant | Après |
|---|---|---|---|
| budget épuisé avec étapes `pending` → pas `success` | `server/runtime/agentic/agentic.test.ts` | ✖ | ✔ |
| étape restée `running` (exception + abort) → pas `success` | idem | ✖ | ✔ |
| étapes `done`/`skipped` → `success` (témoin) | idem | ✔ | ✔ |
| tâche annulée pendant `run()` → `cancelled` | `server/agents/AgentTaskRunner.test.ts` | ✖ (`failed`) | ✔ |
| mission avec sous-objectif escaladé → `failed`, racine `failed`, sous-objectif `blocked` | `server/mission/Executor.test.ts` | ✖ (`in_progress`) | ✔ |
| mode supervisé : 1 seule tentative sur mission finalisée | idem | ✖ (`attempts` = 3) | ✔ |

## Suites ciblées relancées après chaque lot

`server/runtime/agentic/{agentic,agentPerformance,mission-harness}.test.ts` (20 / 11 / 6), `server/agents/{AgentTaskRunner,AgentTaskRunnerContract,e2e-mission}.test.ts` (5 / 13 / 4), `server/mission/*.test.ts` (7 fichiers), `server/core/*.test.ts` (9 fichiers) : toutes réussies.

## Scénarios de cycle de vie : couverture

| Scénario | Couverture | Source |
|---|---|---|
| mission simple réussie | test existant | `Executor.test.ts` |
| échec d'outil / skill en échec factuel | existant + ajouté | `Executor.test.ts` |
| plan inachevé (budget) | ajouté | `agentic.test.ts` |
| annulation utilisateur (tâche agent) | ajouté | `AgentTaskRunner.test.ts` |
| annulation / pause de mission | existant | `Executor.test.ts` |
| échec répété → escalade | ajouté | `Executor.test.ts` |
| reprise après crash | existant (lecture du code + tests `LeannaSupervisor`) | `LeannaSupervisor.test.ts` |
| timeout modèle, réponse LLM malformée, conflit entre agents, redémarrage serveur réel | **non rejoués** dans cette session | — |
