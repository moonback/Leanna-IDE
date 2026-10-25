# Agents & missions — plan d'action

## Fait (lots 1 à 4, 2026-10-25)

Lot 1 : cartographie et baseline. Lots 2 à 4 : correctifs F-01 à F-04, chacun avec un test de régression. Voir `AGENTS_MISSIONS_CHANGELOG.md`.

## Prochaines étapes, par priorité

1. **F-05 — valider le mode `LEANNA_AGENT_SUPERVISED=1` avec un vrai LLM** (P1). Il est branché en opt-in (lot 2). À observer :
   - taux de tâches escaladées alors que le runtime disait `success` ;
   - coût des tentatives supplémentaires (jusqu'à 3 runs complets par tâche) ;
   - rollbacks sur annulation.
   Décider ensuite de l'activer par défaut, ou de ne le garder que pour certains rôles (ex. `coder`).
2. ~~F-06~~ : corrigé au lot 2.
3. **Baseline LLM réelle** : lancer `npm run dev` puis `npm run test:missions` avec une clé configurée, plusieurs exécutions par scénario. Relever durée, appels LLM et tokens, puis remplir les colonnes « indisponible » de `AGENTS_MISSIONS_PERFORMANCE.md`.
4. **`Mission.blockGoal` et la pile** (P2) : décider si un objectif bloqué doit être dépilé. Ce n'est plus nécessaire à la cohérence du statut final depuis F-03.
5. ~~F-07~~ : reproduit et corrigé au lot 3.
6. **Taille des modules** (P2) : `Executor.ts` (2 951 lignes) et `AgenticRuntime.ts` (1 725 lignes) concentrent le risque de régression. Ne les découper qu'avec une couverture préalable.

## Hors périmètre de cette session

- UI : statuts, estimations et budget vérifiés par lecture du code et tests (lot 3, F-08). Pas d'audit visuel dans le navigateur : il exigerait un serveur lancé et une mission réelle.
- Benchmarks de charge.
