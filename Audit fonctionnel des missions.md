# Audit fonctionnel des missions

Audit statique du code (rien n'a été exécuté) : `mission/` (Mission, Executor à \~80 %, MissionStore, AutonomyPolicy, Planner en partie), `core/` (state machine, Supervisor, store durable, kernel), `routes/missions.ts` et `skills/mission.ts`.

**Limites :** `Reflection.ts`, `SkillScorer`, `PlanEstimator` et les tests n'ont pas été lus en détail. Le fichier d'entrée du serveur n'est pas dans le dump : le montage des routes et l'authentification n'ont pas pu être vérifiés.

## Verdict

L'idée est solide (goal stack, vagues parallèles, anti-boucle, dry-run, approbation humaine). Mais plusieurs mécanismes annoncés ne fonctionnent pas réellement, et le noyau de fiabilité (`core/`) n'est pas utilisé par les missions.

## État d'avancement

- ✅ **Sprint 1 terminé** (points 1, 2, 3, 4, 9) — logique corrigée dans `Mission.ts`, `types.ts`, `Executor.ts`.
- ✅ **Sprint 2 largement traité** (fiabilité) :
  - Store local `.Leanna` par défaut (`LocalMissionStore` + `CompositeMissionStore`) → reprise après crash sans Supabase.
  - Persistance **après chaque action** (plus seulement par vague).
  - `AbortSignal` propagé au `skillHandler` et déclenché sur annulation/timeout (skill en cours interrompu).
  - Watchdog **pause-aware** : le temps en pause ne compte plus dans le timeout.
  - `writeJsonAtomic` : `fsync` ajouté ; `readJson` journalise un JSON corrompu.
  - Routes : `approve` lié au `missionId`, `409` vs `404` pour pause/resume, `durationMs` réellement calculé, `priority` validée.
- 🔄 **Sprint 3 (partie 1) : `LeannaSupervisor` durci** — rechargement d'état depuis snapshot, `try/finally` autour de rollback/commit/evidence, timeout runner (`AbortSignal`), et usage de `PAUSED`/`WAITING_APPROVAL` via hooks. Nouveau `kernel.missionStoreDir` pour isoler les snapshots en test.
- ⏳ **Sprint 3 (partie 2) à venir** : faire passer l'Executor par le Supervisor (couture `MissionRunner`, preuve réelle via `EvidenceEngine`), compléter le skill `mission` (point 10), plafonner le Planner (point 12).
- Vérifs : typecheck propre sur les fichiers touchés ; **88 tests mission + core au vert** (dont 6 nouveaux sur le Supervisor durci).

## 🔴 Critiques (à corriger en premier)

### 1. ✅ CORRIGÉ — Le « retry » ne relance jamais rien

- `Mission.recordActionResult` met l'action en `failed`, et rien ne la remet en `pending`. Seul `Mission.fromJSON` le fait, uniquement pour `in_progress`.
- La boucle de `executeGoalDirectly` ne sélectionne que les actions `pending` : une action « à retenter » est silencieusement sautée.
- `goal.attempts` n'est jamais incrémenté, donc `attemptCount` vaut toujours 1. La limite `maxAttempts` et l'escalade qui en dépend ne se déclenchent jamais.
- **Correctif :** sur `retry`, si `attempts < maxAttempts`, faire `attempts++`, remettre l'action à `pending` et vider son résultat. Sinon, passer en `replan` ou `escalate`.
- **Fait :** `Mission.retryAction()` (incrémente `attempts`, remet en `pending`, vide résultat/réflexion, renvoie `false` quand `maxAttempts` atteint) ; la branche `retry` de `executeGoalDirectly` l'appelle et bascule en `replan` quand le budget est épuisé.

### 2. ✅ CORRIGÉ — Fausses missions « réussies »

- Dans `executeMission`, `success = allCompleted || (allTerminal && !anyCriticalFailed)`.
- Une mission dont des sous-objectifs non critiques ont échoué est donc marquée `completed`.
- Les stats, `MissionEvolution`, les playbooks et le profil projet apprennent alors de faux succès.
- **Correctif :** succès uniquement si tout est `completed`. Sinon, ajouter un statut `partial` et ne pas alimenter l'apprentissage en succès.
- **Fait :** `success = allCompleted` ; résumé « partiellement réussie » quand une partie seulement aboutit. L'apprentissage ne reçoit plus de faux succès.

### 3. ✅ CORRIGÉ — Une mission dry-run réactivée s'exécute pour de vrai

- `confirmResume` appelle `Mission.fromJSON(pending.state)` sans config, donc `dryRun` retombe à `false`. Timeout, `maxRetries` et autres réglages repartent aux valeurs par défaut.
- Les reprises n'ont pas non plus de watchdog, de trace télémétrie, de budget ni d'entrée dans `missionRuns` : `waitForMission` rend la main immédiatement.
- **Correctif :** sauvegarder `config` dans `MissionState`, la passer à `fromJSON`, et factoriser un `launchMission()` commun à `startMission` et `confirmResume`.
- **Fait :** `MissionConfig` persistée dans `MissionState` et restaurée par `fromJSON` ; `launchMission()` factorisé (watchdog + télémétrie + `missionRuns`) partagé par `startMission` et `confirmResume`.

### 4. ✅ CORRIGÉ (hors AbortSignal) — Annulation et timeout incorrects

- `cancelMission` et le watchdog utilisent `completeActiveGoal`, qui ferme le sommet de la pile (un sous-objectif), pas la racine.
- Conséquences : le statut peut rester `in_progress` dans l'historique, et `executeMission` reprend ensuite et finalise une 2ᵉ fois (doublon dans `completedMissions`, `mission_completed` émis après `mission_cancelled`).
- Si le dernier objectif est annulé alors que les autres sont terminés, la mission peut finir `completed`.
- Le statut `cancelled` n'est jamais posé alors que la route répond `"cancelled"`. Sans objectif actif, `completeActiveGoal` lève une exception (route en 500).
- Un skill en cours n'est pas interrompu (pas d'`AbortSignal`).
- **Correctif :** ajouter `Mission.cancel()` (racine + objectifs non terminaux → `cancelled`), rendre `finalizeMission` idempotent, et propager un `AbortSignal` au `skillHandler`.
- **Fait :** `Mission.cancel()` ajouté (racine + objectifs/actions non terminaux → `cancelled`) ; `finalizeMission` idempotent via `finalizedMissions` ; `executeMission` ne ré-émet plus après annulation. **Reste :** propagation d'un `AbortSignal` au skill en cours (Sprint 2).

### 5. Le noyau `core/` n'est pas branché sur les missions

- Dans les 527 fichiers fournis, aucun appel à `runSupervisedAgenticMission` hors tests. `DurableMissionStore.listResumable` n'est jamais lu.
- Deux machines d'états parallèles coexistent (`GoalStatus` côté Executor, 13 états côté `core`), alors que `LeannaSupervisor` se présente comme « autorité unique ».
- La persistance réelle dépend de Supabase, qui est un no-op silencieux sans variables d'env. Dans ce cas, **aucune reprise après crash**, alors que le store local `.Leanna/` est toujours disponible.
- Le Supervisor lui-même avait des trous — ✅ **durcis (Sprint 3, partie 1) :**
  - ✅ **Rechargement d'état** : `runMission` relit le snapshot persisté (`loadOrCreate`) et court-circuite si la mission est déjà terminale ; `ensureReady` ramène une machine reprise à `READY` par transitions légales.
  - ✅ **try/finally** : `evidence.record`/`commit`/`rollback` encapsulés ; toute exception bascule proprement en `FAILED` (via `safeAdvance`, toujours persisté) au lieu de rester coincé en `VERIFYING`/`COMMITTING`/`RECOVERING`.
  - ✅ **Timeout runner** : `runnerTimeoutMs` borne chaque tentative ; un dépassement déclenche un `AbortSignal` transmis au runner et compte comme tentative échouée.
  - ✅ **`PAUSED` / `WAITING_APPROVAL`** : hooks optionnels (`needsApproval`/`awaitApproval`, `shouldPause`/`awaitResume`) matérialisent ces états (rétrocompatibles).
  - **Reste :** sans `plannedFiles`, le rollback ne couvre toujours rien (limite du checkpoint) ; l'Executor des missions ne passe toujours PAS par le Supervisor (couture `MissionRunner`, Sprint 3 partie 2).

## 🟠 Majeurs

6. ✅ **CORRIGÉ (watchdog) — Pause :** le watchdog ne compte plus le temps passé en pause (sondage qui n'accumule que le temps actif). **Reste :** la pause n'est toujours pas persistée et ne prend effet qu'entre deux actions.
7. ✅ **CORRIGÉ en partie — Persistance :** sauvegarde désormais **après chaque action** (plus seulement par vague). Store local `.Leanna` par défaut → reprise possible sans Supabase. **Reste :** à la reprise, les actions `in_progress` sont encore rejouées (idempotence ledger optionnelle) ; l'historique (50 max) reste en mémoire.
8. ✅ **CORRIGÉ (approve) — Route `approve` :** l'action doit désormais appartenir à la mission `:id` (plus d'approbation croisée). **Reste :** `POST /missions/autonomy` (passage en mode `auto`) à protéger par auth/rate-limit — non vérifiable depuis ce dump. Garde-fou `LEANNA_AUTO_ALLOW_DANGEROUS` bien conçu.
9. ✅ **CORRIGÉ — Échec critique :** seul `failed` arrêtait la mission, pas `blocked`. **Fait :** un objectif critique `blocked` stoppe désormais la mission comme un `failed`, cohérent avec le calcul de succès final.
10. **Skill `mission` :** `mission_pause`, `mission_resume` et `mission_add_goal` sont dans `toolPermissions` mais sans déclaration, schéma ni handler. L'IA ne peut donc ni pauser ni reprendre. Les schémas Zod de `types.ts` doublonnent ceux du skill.
11. **Vérification des objectifs trop permissive :** sans critères, un seul succès suffit. Avec LLM, un verdict négatif non « bloquant » est converti en succès. La vérification repose sur le LLM plutôt que sur des faits, alors que l'`EvidenceEngine` fait exactement cela.
12. **Planner (à vérifier) :** aucun plafonnement par `maxSubGoals` (10) trouvé. Si le LLM renvoie plus de 10 sous-objectifs, `addSubGoal` lève une exception et `startMission` échoue. Les `dependsOn` par titre écrasent les doublons de titres.
13. **Simulator (à vérifier) :** il lit un rapport dry-run global (`DryRunController`) sans reset visible ; des simulations ou missions concurrentes peuvent se polluer.

## 🟡 Mineurs

- ✅ **CORRIGÉ — Routes :** `409` (conflit d'état) vs `404` (introuvable) pour pause/resume ; `durationMs` réellement renseigné dans `serializeMission` (via `PlannedAction.durationMs`) ; `priority` validée côté route.
- **Machine d'états :** `ESCALATED` est terminal, donc aucune reprise humaine après escalade ; pas de transition vers `PAUSED` depuis `VERIFYING` ou `COMMITTING`. *(non traité)*
- ✅ **CORRIGÉ (fsync + log) — `writeJsonAtomic` :** `fsync` ajouté avant le rename ; un JSON corrompu est désormais journalisé dans `readJson`. **Reste :** le repli `copyFileSync` (EPERM Windows) n'est toujours pas atomique.
- **Tests :** `Executor.test.ts` compte 2 tests pour 2 134 lignes. Rien sur retry, cancel, pause, reprise ou ordonnancement par dépendances. `Executor.ts` (2 134 lignes) et `Reflection.ts` (1 266) méritent d'être découpés.

## Plan proposé

1. **Sprint 1, corriger la logique :** points 1, 2, 3, 4, puis 9. Ajouter les tests correspondants.
2. **Sprint 2, fiabilité :** persister après chaque action ; activer le store local `.Leanna` par défaut ; corriger le Supervisor (rechargement, try/finally, timeout) ; sécuriser les routes (points 7, 8, 5).
3. **Sprint 3, unification :** faire passer les missions par le Supervisor (l'Executor devient un `MissionRunner`, avec preuve réelle à la place du verdict LLM), compléter le skill (10) et plafonner le Planner (12).
