# Agents & missions — plan d'action

## Fait (lots 1 à 4, 2026-10-25)

Lot 1 : cartographie et baseline. Lots 2 à 4 : correctifs F-01 à F-04, chacun avec un test de régression. Voir `AGENTS_MISSIONS_CHANGELOG.md`.

## Prochaines étapes, par priorité

1. **F-05 — décider du sort de `runSupervisedAgenticMission`** (P1). Deux options :
   - le brancher sur un chemin réel, par exemple les tâches `coder` lancées depuis une mission ;
   - le supprimer avec `AgenticMissionRunner`, une fois prouvé qu'aucun plugin ne l'utilise.
   Dans les deux cas, valider d'abord par une exécution avec un vrai LLM.
2. **F-06 — isoler le contexte `LedgerGuard`** par `AsyncLocalStorage`, comme `runWithTelemetryContext`. À faire avant tout branchement de F-05.
3. **Baseline LLM réelle** : lancer `npm run dev` puis `npm run test:missions` avec une clé configurée, plusieurs exécutions par scénario. Relever durée, appels LLM et tokens, puis remplir les colonnes « indisponible » de `AGENTS_MISSIONS_PERFORMANCE.md`.
4. **`Mission.blockGoal` et la pile** (P2) : décider si un objectif bloqué doit être dépilé. Ce n'est plus nécessaire à la cohérence du statut final depuis F-03.
5. **F-07** : reproduire ou écarter la divergence statut/preuve en mode supervisé avec la preuve désactivée.
6. **Taille des modules** (P2) : `Executor.ts` (2 951 lignes) et `AgenticRuntime.ts` (1 725 lignes) concentrent le risque de régression. Ne les découper qu'avec une couverture préalable.

## Hors périmètre de cette session

- UI (`AgentFleetPanel`, `AgentPanel`, `MissionPanel`, `MissionDetail`) : seul le polling a été inspecté. L'absence de progression simulée ou de zéros trompeurs n'est pas vérifiée. Point à auditer. Effet de F-02 : l'UI recevra désormais `cancelled` sur ce chemin ; vérifier son rendu.
- Benchmarks de charge.
