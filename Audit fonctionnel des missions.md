# Audit fonctionnel des missions

Audit statique du code (rien n'a été exécuté) : `mission/` (Mission, Executor à \~80 %, MissionStore, AutonomyPolicy, Planner en partie), `core/` (state machine, Supervisor, store durable, kernel), `routes/missions.ts` et `skills/mission.ts`.

**Limites :** `Reflection.ts`, `SkillScorer`, `PlanEstimator` et les tests n'ont pas été lus en détail. Le fichier d'entrée du serveur n'est pas dans le dump : le montage des routes et l'authentification n'ont pas pu être vérifiés.

## Verdict

L'idée est solide (goal stack, vagues parallèles, anti-boucle, dry-run, approbation humaine). Mais plusieurs mécanismes annoncés ne fonctionnent pas réellement, et le noyau de fiabilité (`core/`) n'est pas utilisé par les missions.

## 🔴 Critiques (à corriger en premier)

### 1. Le « retry » ne relance jamais rien

- `Mission.recordActionResult` met l'action en `failed`, et rien ne la remet en `pending`. Seul `Mission.fromJSON` le fait, uniquement pour `in_progress`.
- La boucle de `executeGoalDirectly` ne sélectionne que les actions `pending` : une action « à retenter » est silencieusement sautée.
- `goal.attempts` n'est jamais incrémenté, donc `attemptCount` vaut toujours 1. La limite `maxAttempts` et l'escalade qui en dépend ne se déclenchent jamais.
- **Correctif :** sur `retry`, si `attempts < maxAttempts`, faire `attempts++`, remettre l'action à `pending` et vider son résultat. Sinon, passer en `replan` ou `escalate`.

### 2. Fausses missions « réussies »

- Dans `executeMission`, `success = allCompleted || (allTerminal && !anyCriticalFailed)`.
- Une mission dont des sous-objectifs non critiques ont échoué est donc marquée `completed`.
- Les stats, `MissionEvolution`, les playbooks et le profil projet apprennent alors de faux succès.
- **Correctif :** succès uniquement si tout est `completed`. Sinon, ajouter un statut `partial` et ne pas alimenter l'apprentissage en succès.

### 3. Une mission dry-run réactivée s'exécute pour de vrai

- `confirmResume` appelle `Mission.fromJSON(pending.state)` sans config, donc `dryRun` retombe à `false`. Timeout, `maxRetries` et autres réglages repartent aux valeurs par défaut.
- Les reprises n'ont pas non plus de watchdog, de trace télémétrie, de budget ni d'entrée dans `missionRuns` : `waitForMission` rend la main immédiatement.
- **Correctif :** sauvegarder `config` dans `MissionState`, la passer à `fromJSON`, et factoriser un `launchMission()` commun à `startMission` et `confirmResume`.

### 4. Annulation et timeout incorrects

- `cancelMission` et le watchdog utilisent `completeActiveGoal`, qui ferme le sommet de la pile (un sous-objectif), pas la racine.
- Conséquences : le statut peut rester `in_progress` dans l'historique, et `executeMission` reprend ensuite et finalise une 2ᵉ fois (doublon dans `completedMissions`, `mission_completed` émis après `mission_cancelled`).
- Si le dernier objectif est annulé alors que les autres sont terminés, la mission peut finir `completed`.
- Le statut `cancelled` n'est jamais posé alors que la route répond `"cancelled"`. Sans objectif actif, `completeActiveGoal` lève une exception (route en 500).
- Un skill en cours n'est pas interrompu (pas d'`AbortSignal`).
- **Correctif :** ajouter `Mission.cancel()` (racine + objectifs non terminaux → `cancelled`), rendre `finalizeMission` idempotent, et propager un `AbortSignal` au `skillHandler`.

### 5. Le noyau `core/` n'est pas branché sur les missions

- Dans les 527 fichiers fournis, aucun appel à `runSupervisedAgenticMission` hors tests. `DurableMissionStore.listResumable` n'est jamais lu.
- Deux machines d'états parallèles coexistent (`GoalStatus` côté Executor, 13 états côté `core`), alors que `LeannaSupervisor` se présente comme « autorité unique ».
- La persistance réelle dépend de Supabase, qui est un no-op silencieux sans variables d'env. Dans ce cas, **aucune reprise après crash**, alors que le store local `.Leanna/` est toujours disponible.
- Le Supervisor lui-même a des trous :
  - il crée toujours une machine neuve et ne recharge jamais l'état sauvegardé ;
  - pas de try/finally : si `rollback`, `commit` ou `evidence.record` lève une exception, la mission reste coincée en `RECOVERING`, `VERIFYING` ou `COMMITTING` ;
  - pas de timeout runner ;
  - il n'utilise jamais `PAUSED` ni `WAITING_APPROVAL` ;
  - sans `plannedFiles`, le rollback ne fait rien.

## 🟠 Majeurs

6. **Pause :** le watchdog de 30 min continue de tourner pendant la pause, donc une mission pausée peut être tuée. La pause n'est pas persistée et ne prend effet qu'entre deux actions.
7. **Persistance :** sauvegarde au démarrage, après chaque vague et à la fin seulement, jamais après une action. À la reprise, les actions `in_progress` sont rejouées, ce qui est risqué pour les écritures, le shell et git, puisque l'idempotence du ledger est optionnelle (`LEANNA_IDEMPOTENCY`) et ne couvre pas ce chemin. L'historique (50 max) est en mémoire seulement et disparaît au redémarrage. Les `void persist()` en fin de mission peuvent s'écraser entre eux.
8. **Route `approve` :** elle ignore `:id`, donc n'importe quel `actionId` est approuvable via n'importe quelle mission. `POST /missions/autonomy` peut passer en mode `auto` : à protéger (auth, rate-limit) ; non vérifiable ici. Le garde-fou `LEANNA_AUTO_ALLOW_DANGEROUS` est lui bien conçu.
9. **Échec critique :** seul `failed` arrête la mission, pas `blocked` (escalade), alors que le calcul final compte `blocked` comme échec critique. Les dépendants d'un objectif bloqué attendent une vague de plus.
10. **Skill `mission` :** `mission_pause`, `mission_resume` et `mission_add_goal` sont dans `toolPermissions` mais sans déclaration, schéma ni handler. L'IA ne peut donc ni pauser ni reprendre. Les schémas Zod de `types.ts` doublonnent ceux du skill.
11. **Vérification des objectifs trop permissive :** sans critères, un seul succès suffit. Avec LLM, un verdict négatif non « bloquant » est converti en succès. La vérification repose sur le LLM plutôt que sur des faits, alors que l'`EvidenceEngine` fait exactement cela.
12. **Planner (à vérifier) :** aucun plafonnement par `maxSubGoals` (10) trouvé. Si le LLM renvoie plus de 10 sous-objectifs, `addSubGoal` lève une exception et `startMission` échoue. Les `dependsOn` par titre écrasent les doublons de titres.
13. **Simulator (à vérifier) :** il lit un rapport dry-run global (`DryRunController`) sans reset visible ; des simulations ou missions concurrentes peuvent se polluer.

## 🟡 Mineurs

- **Routes :** utiliser 409 plutôt que 404 pour « déjà en pause » ou « non en pause » ; `durationMs: undefined` dans `serializeMission` ; `priority` non validée côté route.
- **Machine d'états :** `ESCALATED` est terminal, donc aucune reprise humaine après escalade ; pas de transition vers `PAUSED` depuis `VERIFYING` ou `COMMITTING`.
- **`writeJsonAtomic` :** pas de `fsync`, et le repli `copyFileSync` (EPERM Windows) n'est pas atomique. Un snapshot corrompu devient `null` sans aucun log.
- **Tests :** `Executor.test.ts` compte 2 tests pour 2 134 lignes. Rien sur retry, cancel, pause, reprise ou ordonnancement par dépendances. `Executor.ts` (2 134 lignes) et `Reflection.ts` (1 266) méritent d'être découpés.

## Plan proposé

1. **Sprint 1, corriger la logique :** points 1, 2, 3, 4, puis 9. Ajouter les tests correspondants.
2. **Sprint 2, fiabilité :** persister après chaque action ; activer le store local `.Leanna` par défaut ; corriger le Supervisor (rechargement, try/finally, timeout) ; sécuriser les routes (points 7, 8, 5).
3. **Sprint 3, unification :** faire passer les missions par le Supervisor (l'Executor devient un `MissionRunner`, avec preuve réelle à la place du verdict LLM), compléter le skill (10) et plafonner le Planner (12).
