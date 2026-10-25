# Agents & missions — constats (2026-10-25)

« Corrigé » = un test de régression échouait avant le correctif et passe après.

## F-01 — P0 — Fausse réussite d'une tâche agent au plan inachevé

- **Fichier** : `server/runtime/agentic/AgenticRuntime.ts` (`assessOutcome`).
- **Preuve** : `anyFailedStep` ne comptait que `status === "failed"`. Deux chemins laissent une étape non accomplie sans ce statut :
  1. la boucle sort sur `budgetExhausted` : les étapes suivantes restent `pending` ;
  2. `execute()` lève, la récupération renvoie `abort` : l'étape reste `running`.
  Avec au moins un outil exécuté et aucune écriture, la fonction finissait sur `return "success"`. Tests ajoutés (`agentic.test.ts`, « assessOutcome — étapes non terminées ») : 2 échecs avant correctif.
- **Impact** : tâche `completed`, dépendances débloquées, `AgenticMissionRunner` ne propose aucune récupération.
- **Correction** : toute étape ni `done` ni `skipped` compte comme non accomplie. La sortie anticipée légitime (`isFinal` + `allRemainingTrivial`) n'est pas affectée : elle exige déjà que les étapes restantes soient `done`/`skipped`.
- **Statut** : Corrigé.

## F-02 — P0 — Annulation utilisateur rapportée « failed »

- **Fichier** : `server/agents/AgentRuntimeExecutor.ts` (`execute`).
- **Preuve** : `AgenticRuntime.run` **retourne** `finish(..., "blocked", "Tâche annulée…")` quand le signal est déclenché ; il ne lève pas. Seule la branche `catch` posait `cancelled`. `AgentOrchestrator.cancelTask` délègue explicitement ce statut terminal à `execute()`. Test ajouté (`AgentTaskRunner.test.ts`) : `actual: 'failed', expected: 'cancelled'` avant correctif.
- **Impact** : UI, persistance (`agentPersistence`) et notifications indiquaient un échec au lieu d'une annulation ; les statistiques d'échec par agent étaient faussées.
- **Correction** : `!result.success && controller.signal.aborted` donne `cancelled` (statut et notification).
- **Statut** : Corrigé.

## F-03 — P0 — Mission finalisée et persistée en « in_progress »

- **Fichiers** : `server/mission/Executor.ts` (`executeMission`), cause dans `server/mission/Mission.ts` (`blockGoal` ne dépile pas).
- **Preuve** : trace instrumentée de `Mission` sur le chemin par défaut. Un sous-objectif escaladé (`blockGoal`) reste au sommet de `goalStack`. En fin de mission, `completeActiveGoal` ferme ce sous-objectif (requalifié `failed`) et non la racine. La racine reste `in_progress`. `finalizeMission` déplace la mission dans l'historique et la persiste `in_progress`. Test ajouté : échec avant correctif.
- **Impact** : mission terminée affichée « en cours ». Au redémarrage, `resumePending` (`listByStatus(["pending","in_progress"])`) la repropose comme interrompue. Un sous-objectif `blocked` était renommé `failed`.
- **Correction** : la fin de mission ferme la racine explicitement (`completeGoal(rootGoal.id, …)`).
- **Limite** : `blockGoal` ne dépile toujours pas. Seul appelant de `completeActiveGoal` : celui qui a été corrigé. Laissé en l'état pour ne pas modifier la sémantique de pile.
- **Statut** : Corrigé.

## F-04 — P1 — Mode supervisé : tentatives fantômes et rollbacks répétés

- **Fichier** : `server/mission/Executor.ts` (`runSupervised`). Opt-in via `LEANNA_MISSION_SUPERVISED`.
- **Preuve** : avec des sous-objectifs indépendants en échec, `buildMissionOutcome` suggère `replan`. Le Supervisor relance alors `executeMission` sur une mission **déjà finalisée** : aucune action n'est rejouée, mais 3 « tentatives » sont comptées, avec un rollback de checkpoint après chacune. Test ajouté : `attempts` valait 3 au lieu de 1.
- **Correction** : quand la mission est terminale et non réussie, le runner suggère `escalate`. Les retry/replan internes de l'Executor sont déjà épuisés à ce stade.
- **Statut** : Corrigé.

## F-05 — P1 — Chemin « noyau supervisé agentique » mort en production

- `CoreKernel.runSupervisedAgenticMission` et `createAgenticMissionRunner` n'ont aucun appelant hors tests. Les garanties décrites dans ces fichiers (preuve avant COMPLETED, rollback) ne couvrent donc pas les tâches agents en production.
- **Branchement préparé (2026-10-25, lot 2)** : `AgentRuntimeExecutor.execute` passe par `kernel.runSupervisedAgenticMission` quand `LEANNA_AGENT_SUPERVISED=1` (ou `BootstrapConfig.enableAgentSupervision`), sur les deux chemins de bootstrap. **Désactivé par défaut.**
  - Le runner transmet désormais les champs de la tâche réelle (`signal`, `budget`, `onProgress`, `onTrace`, `files`, `metadata`). Avant, il les perdait : une tâche supervisée n'était pas annulable et ignorait son budget.
  - Le noyau renvoie le dernier `AgentResult` brut (`lastResult`), nécessaire à l'adaptation en `TaskResult`.
  - Le verdict du Supervisor prime : runtime `success` mais état final autre que `COMPLETED` → tâche `failed` (`outcome: "partial"`). Les fichiers déclarés (`task.context.files`), restaurés par le rollback, sont retirés de `filesModified`.
  - `missionId` unique par exécution (`agent-task:<taskId>:<suffixe>`) : une ré-exécution de la même tâche n'est pas court-circuitée par un snapshot terminal.
- **Limites** : le rollback ne couvre que les fichiers déclarés avant l'exécution. Une annulation est escaladée (`blocked` → `escalate`), avec rollback des fichiers déclarés. Aucune validation avec un vrai LLM.
- **Statut** : Branché en opt-in, testé en simulation. Activation par défaut à décider après une exécution réelle.

## F-06 — P1 — `LedgerGuard` : contexte ambiant global

- `setContext` écrivait un état partagé par toutes les missions. Preuve : test « concurrent supervised missions… » (`kernel.test.ts`), exécuté sur l'ancien code (`git stash`) → échec. La mission B, en finissant, vidait le contexte global : l'écriture de la mission A passait **sans protection d'idempotence**. Avec un autre ordonnancement, la clé aurait été attribuée à la mauvaise mission, avec un `skip` à tort possible.
- **Correction** : `LedgerGuard.runWithContext` et `JevSafetyGate.runWithContext` (`AsyncLocalStorage`), utilisés par le noyau. Le contexte isolé prime ; `setContext` reste disponible (compatibilité, tests existants).
- **Statut** : Corrigé.

## F-07 — P2 — Mode supervisé : divergence possible statut mission ↔ preuve

- `buildMissionOutcome` compte comme contrôle échoué toute action `failed` restée dans le plan. Une action non critique en échec avec décision `continue`, suivie d'une validation LLM de l'objectif (preuve désactivée), peut donner une mission `completed` alors que le Supervisor rollback les fichiers.
- **Reproduit (lot 3)** : test `Executor.test.ts` « …never "completed" while the Supervisor rejects its evidence (F-07) ». Une action échoue, la réflexion décide « continue », et la vérification LLM valide l'objectif. Résultat : mission `completed`, alors que le Supervisor est `ESCALATED` et a restauré les fichiers déclarés. L'utilisateur voyait « réussie » sur un travail annulé.
- **Correction** : en mode supervisé, `verifyGoalCriteria` juge les objectifs par la preuve factuelle, comme le Supervisor, même si `LEANNA_MISSION_EVIDENCE` est coupé. Un `EvidenceEngine` par défaut est créé s'il n'en existe aucun.
- **Statut** : Corrigé.

## F-08 — P2 — UI : tokens absents, « coût » runtime non mesuré

- `ExecutionTrace` n'exposait ni tokens ni coût. Le `usage.cost` du runtime est une unité abstraite (tokens/1000, ou **1 forfaitaire** quand le fournisseur ne renvoie pas d'usage) : l'afficher comme un coût aurait été trompeur.
- **Correction** : `BudgetUsage` gagne `tokens` (somme des `totalTokens` rapportés) et `unmeasuredLlmCalls`. Les deux sont exposés dans la trace. `MissionDetail` affiche « Tokens mesurés » uniquement s'il y a une mesure, et signale un total partiel quand des appels n'ont pas été mesurés. Rien n'est affiché à 0 par défaut.
- **Vérifié sans défaut** : le statut `cancelled` (effet de F-02) a son badge « Annulée ». Il est exclu du taux de réussite et compté avec les échecs dans le filtre « Échecs » d'`AgentPanel`. Les estimations du plan sont préfixées par `~`.
- **Statut** : Corrigé (tests `MissionDetail.test.tsx` +2, `agentic.test.ts` +1).

## Vérifications sans défaut trouvé

- Reprise après crash : `Mission.fromJSON` remet les actions `in_progress` en `pending` (rejeu) ; la reprise exige une décision utilisateur (`confirmResume`).
- Annulation de mission : `Mission.cancel` ferme racine et objectifs ; `abortMission` propage l'`AbortSignal` ; garde contre la double finalisation.
- Timeout de mission : le watchdog ne compte que le temps actif (pause et file d'attente exclues), `unref`, nettoyé en fin de mission.
- Concurrence : une seule mission réelle à la fois (`writeQueue`) ; vagues bornées par `maxConcurrentGoals` ; télémétrie isolée par `AsyncLocalStorage`.
- Retries bornés : `retryAction` est plafonné par `maxAttempts` ; boucle d'objectif bornée à 100 itérations ; l'anti-boucle d'exploration force un livrable une seule fois.
- UI : polling de la flotte toutes les 30 s ; les autres `setInterval` sont des horloges locales (aucune requête réseau).

## Non vérifié

- Comportement avec de vrais fournisseurs LLM (qualité de sélection d'agent, tokens, latences) : non exécuté, aucune clé ni serveur lancé dans cette session.
- Scénarios « conflit entre agents », « redémarrage serveur réel » et « approbation en attente via l'UI » : couverts uniquement par les tests existants, non rejoués de bout en bout.
