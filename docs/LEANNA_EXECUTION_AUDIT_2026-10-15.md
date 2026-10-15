# Leanna — Audit d'exécution réelle (15 octobre 2026)

> Phase 1 du plan d'amélioration (« établir la vérité d'exécution »). Audit **en lecture seule** :
> aucun fichier de code n'a été modifié. Base : `main` @ `13f57b8`.
> Chaque constat cite `fichier:ligne`. Les constats marqués **[reproduit]** ont été confirmés
> par une exécution, les autres par lecture de code.

## 0. Synthèse

| # | Constat | Gravité | Preuve |
|---|---|---|---|
| 1 | La garde d'idempotence met en cache **tous** les outils (lectures comprises) avec une clé **globale** `-:-:outil:hashArgs`, persistée entre redémarrages. Un 2ᵉ `verify_file {path}` renvoie l'ancien hash. | **P0** | [reproduit] |
| 2 | Deux moteurs d'exécution coexistent avec deux modèles de vérification : `Executor` (missions) et `AgenticRuntime` (agents). Il n'y a pas de contrat unique. | **P0** | code |
| 3 | Les deux moteurs peuvent déclarer un succès sans preuve suffisante (`partial` ⇒ `success:true`, « au moins une action réussie », verdict LLM négatif annulé). | **P0** | code |
| 4 | L'apprentissage inter-missions est surtout en écriture seule : playbooks, leçons et `MissionEvolution` ne sont jamais relus par le Planner. | P1 | code |
| 5 | La fiabilité des outils est dégradée par des erreurs qui ne viennent pas d'eux (génération d'arguments LLM ratée, schéma invalide). Pas de distinction transitoire / récurrent. | P1 | code |
| 6 | La reprise rejoue aveuglément les actions `in_progress`. Comme le contexte de mission n'est jamais posé, la garde du ledger ne protège pas ce cas. | P1 | code |
| 7 | Les tests serveur écrivent dans le vrai `.Leanna/` du workspace (`strategy.json`, `mission-evolution.json`, `project-profile.json`). | P1 | [reproduit] |
| 8 | `docs/AUTONOMY_RUNTIME_MAP.md` décrit une cible, pas l'état réel (fichier `AgentRuntime.ts` inexistant, tsc/tests présentés comme postconditions obligatoires alors que `verify()` ne les exécute pas). | P2 | code |

Tests ciblés exécutés : **87/87 passent** (13 fichiers, ~10 s). Ces tests ne couvrent aucun des
défauts 1 à 6 : ils passent malgré eux.

---

## 1. Livrable 1 — Carte des chemins d'exécution

### Matrice « entrée → exécuteur → outils → vérification → résultat final »

| Point d'entrée | Exécuteur réel | Passage des outils | Vérification | Résultat final |
|---|---|---|---|---|
| `mission_create` (skill, chat/live) — `server/skills/mission.ts:328` | `Executor.startMission` (moteur missions, 2 910 lignes) | `skillManager.handleToolCall` → `ToolRegistry.call` (ou handler direct si `context`, `SkillManagerV2.ts:117`) | `verifyGoalCriteria` : preuve si `LEANNA_MISSION_EVIDENCE`, sinon LLM + heuristique (`Executor.ts:1939`) | `Mission.state.status` binaire `completed`/`failed` (`Mission.ts:234`) |
| Autonomie `LeannaCore` → `executeMission` — `server.ts:487-511` | `Executor.startMission` + `waitForMission` | idem | idem | `success = status === "completed"` |
| `agent_orchestrate` / `delegateTask` — `AgentOrchestrator.ts:190-230` | `AgentRuntimeExecutor` → `AgenticRuntime` (après `enableAgenticRuntime`, `server.ts:525`) | `AgenticRuntime.invokeTool` → `ToolRegistry.call` | `verify()` : pas d'échec d'outil + hash `verify_file` (`AgenticRuntime.ts:926`) | `task.status = success ? completed : failed` (`AgentRuntimeExecutor.ts:140`), `partial` compris dans `success` |
| Orchestration multi-agents — `TaskScheduler.ts:108` | idem (runner basculé par `setRunner`, `AgentOrchestrator.ts:108`) | idem | idem | dépendants annulés si une dépendance échoue (`TaskScheduler.ts:121-140`) |
| Flotte autonome (`AutonomousAgent`, `AutonomousLoop`) | basculée sur `AgentRuntimeExecutor` via `registry.setRunner` (`AgentOrchestrator.ts:113`). Repli legacy `AgentExecutor` si des tâches sont actives (`AgentRegistry.ts:55`) | idem | idem + `verify_file` direct (`AutonomousLoop.ts:335`) | idem |
| Noyau supervisé `runSupervisedAgenticMission` — `server/core/kernel.ts:142` | **aucun appelant en production** (seulement `server/core/AgenticMissionRunner.test.ts`) | — | `LeannaSupervisor` + `EvidenceEngine` + checkpoints | — |

### Conséquences

- **Le « contrat d'exécution unique » n'existe que côté agents.** `AgentTaskRunner` est une interface
  (`AgentTaskRunner.ts:46`) partagée par l'exécuteur legacy et l'exécuteur agentique. Le moteur de
  missions (`Executor`) n'en fait pas partie : il a son propre planner, sa propre boucle et sa
  propre vérification.
- **Le seul chemin qui pose le contexte d'idempotence (`guard.setContext({ missionId })`,
  `kernel.ts:154`) est le noyau supervisé, qui est orphelin.** C'est la cause racine du constat 1.
- Le démarrage est correct dans l'ordre actuel : `enableAgenticRuntime` (`server.ts:525`) est appelé
  avant `setSkillHandler` (`server.ts:528`), donc la flotte démarre directement sur le runtime
  agentique.

---

## 2. Livrable 2 — Écarts entre capacités déclarées et comportement réel

### 2.1 Idempotence : cache global de tous les outils **[reproduit]**

- Clé : `idempotencyKeyFor` = `missionId:stepId:tool:argsHash`, avec `-` quand le contexte est absent
  (`ExecutionLedger.ts:57-60`). En production, le contexte n'est jamais posé : la clé est donc
  globale.
- `ToolRegistry.call` consulte la garde pour **tout** outil, sans tenir compte des permissions
  (`ToolRegistry.ts:436-447`). `LedgerGuard` ne se sert de `sideEffect` que pour décider d'un
  `block` (`LedgerGuard.ts:47-60`). Toute entrée `completed` donne un `skip` qui renvoie le résultat
  mis en cache.
- L'index est réhydraté depuis `.Leanna/core/ledger/actions.jsonl` à chaque démarrage
  (`ExecutionLedger.ts:80-92`). Le cache est donc permanent.
- Activé ici : `LEANNA_IDEMPOTENCY="true"` dans `.env` (valeur par défaut `false` dans `.env.example`).
- Le ledger local contient déjà des entrées `completed` pour `read_project_file`,
  `list_project_files`, `search_memory`, `generate_codebase_markdown`, `get_github_user`, toutes
  avec une clé `-:-:…`.

**Reproduction** (ledger temporaire, `LedgerGuard` exactement comme en production, sans contexte) :

```text
appel 1: execute
appel 2: skip résultat servi: {"hashAfter":"AAAA"}
après redémarrage: skip {"hashAfter":"AAAA"}
```

**Impact :** dans `AgenticRuntime`, la séquence écriture → `verify_file` → réparation → réécriture →
`verify_file` reçoit l'**ancien** enregistrement de hash. La vérification hashée, qui est l'arbitre du
succès (`AgenticRuntime.ts:1365`), ne peut alors plus valider une réparation. Les lectures renvoient
aussi des contenus périmés, d'une mission à l'autre et après redémarrage. Le harness de missions
(`mission-harness.test.ts`, scénario B REPAIR) passe parce qu'il n'active pas la garde.

### 2.2 Vérification : des succès déclarés sans preuve suffisante

**Runtime agentique**

- `partial` est compté comme un succès : `success = outcome === "success" || outcome === "partial"`
  (`AgenticRuntime.ts:473` et `1395`). `AgentRuntimeExecutor` en fait alors une tâche `completed`
  (`AgentRuntimeExecutor.ts:140`), et `TaskScheduler` débloque les tâches dépendantes
  (`TaskScheduler.ts:110`).
- `partial` couvre notamment : fichiers écrits et vérifiés par hash **mais avec une étape en échec**
  (par exemple une étape « les tests passent »), ou bien aucun fichier écrit avec une erreur d'outil
  (`AgenticRuntime.ts:1356-1383`).
- `verify()` ne lit jamais `step.verification` ni `plan.successCriteria` (`AgenticRuntime.ts:926-1012`).
  Elle ne vérifie que deux choses : aucun outil n'a échoué et le hash concorde. Un hash concordant
  prouve que l'écriture a bien eu lieu, pas que le contenu est correct.
- Une tâche sans écriture, avec des outils exécutés sans erreur, se termine en `success`
  (`AgenticRuntime.ts:1383`) sans que ses critères soient évalués.

**Moteur de missions**

- Sans critère explicite, l'objectif est validé si **au moins une** action a réussi
  (`Executor.ts:1960-1968`).
- Un verdict LLM `passed:false` est **remplacé par un succès** si toutes les actions ont renvoyé
  « ok » et que le LLM n'a pas marqué l'échec comme `blocking` (`Executor.ts:2018-2023`). Le prompt
  demande lui-même `blocking:false` en cas de doute.
- Une action est « réussie » dès que `detectSkillFailure` ne trouve pas d'échec, c'est-à-dire
  quand l'outil renvoie `{ok:true}`. La vérification par preuve (`verifyByEvidence`) reprend ce même
  signal et ajoute seulement un contrôle « artefact attendu » basé sur une regex
  (`Executor.ts:1324`). Elle ne relit pas les fichiers.
- `LEANNA_MISSION_EVIDENCE` vaut `"false"` par défaut (`.env.example:119`, câblage `server.ts:383`).
  Une installation neuve utilise donc la vérification LLM tolérante.
- Le statut de mission est binaire `completed`/`failed` (`Mission.ts:234`). Il n'existe ni
  `partial` ni critères non satisfaits conservés au niveau mission.

### 2.3 Apprentissage inter-missions

| Mémoire | Écrite | Relue pour planifier |
|---|---|---|
| `StrategyMemory` (fiabilité des outils) | `Executor.ts:1605, 1629, 1703, 1744` | **oui** : `SkillScorer.seedFromReliability` (`Executor.ts:487`), `Planner.getFailingSkills` (`Planner.ts:264, 282`) |
| `PlaybookStore` | `Executor.ts:2610` | **non** (aucun lecteur dans `server/mission`) |
| `LearningEngine` (leçons) | `Executor.ts:2642` | **non** (seul lecteur : `routes/knowledge/knowledgeRouter.ts:171`, pour l'UI) |
| `MissionEvolutionStore` | `Executor.ts:2557` | **non** |
| `ProjectProfile` | `Executor.ts:2572` | **non** (seulement briefing, doctor et routes insights) |
| Runtime agentique | — | **aucune mémoire** : `server/runtime/agentic/` ne lit ni n'écrit `StrategyMemory`, `LearningEngine` ou les playbooks |

Défauts de qualité du signal :
- `recordSkillOutcome(skill, success: boolean, ms)` (`StrategyMemory.ts:130`) ne distingue pas une
  erreur transitoire (réseau, timeout) d'une erreur récurrente.
- Une génération d'arguments LLM ratée ou un JSON invalide est enregistré comme un **échec de
  l'outil** (`Executor.ts:1605`, `1629`). C'est le modèle qui s'est trompé, mais l'outil est
  pénalisé.

### 2.4 Reprise et idempotence

- `resumePending` liste les missions `pending`/`in_progress` et attend une décision de l'utilisateur
  (`Executor.ts:2711-2750`). C'est sain.
- À la réactivation, `Mission.fromJSON` remet chaque action `in_progress` en `pending` et efface son
  résultat (`Mission.ts:479-495`). L'action est **rejouée sans aucune vérification** de ce qui avait
  déjà été appliqué.
- Le ledger sait bloquer une action à effet de bord de statut `unknown` (`ExecutionLedger.ts:106-115`),
  mais seulement si la clé correspond. Sans `missionId`/`stepId`, cette protection devient un cache
  global (voir 2.1) au lieu d'une garde par étape.

### 2.5 Délégation multi-agents

- Concurrence par rôle contrôlée (`getRunningCount`, `AgentOrchestrator.ts:197`). Les dépendances
  échouées annulent les tâches en aval (`TaskScheduler.ts:121-140`). La détection de deadlock existe
  (`TaskScheduler.ts:60-82`).
- Le résultat `partial` d'un agent est considéré comme terminé et injecté tel quel dans le contexte
  des dépendants (`TaskScheduler.ts:95-99`).
- Aucune politique de nouvelle tentative ou d'escalade pour un agent délégué en échec : l'échec se
  propage, sans réaffectation.

### 2.6 Isolation des tests **[reproduit]**

Un run de `server/mission/*.test.ts` a réécrit `.Leanna/strategy.json`, `.Leanna/mission-evolution.json`
et `.Leanna/project-profile.json` du workspace réel. `strategy.json` contient maintenant les
fixtures `only_tool` et `unreliable_tool` (`Planner.replan.test.ts`) ainsi que des compteurs pour
`read_project_file` et `verify_typecheck` issus des tests. Cause : `scripts/test-isolation.mjs`
redirige `LEANNA_STATE_DIR`, mais `leannaDir()`/`coreDir()` (`server/core/paths.ts:28-37`) et le
singleton `strategyMemory` utilisent `workspaceRoot()`.

---

## 3. Livrable 3 — Corrections priorisées

Chaque correction est petite, réversible et testable seule. Ordre recommandé : C1 → C2 → C3 → C4 → reste.

### C1 — P0 · Restreindre et contextualiser la garde d'idempotence
> **Implémenté le 2026-10-15.** `LedgerGuard` ne journalise plus que les outils à effet de bord et
> seulement avec `missionId` + `stepId` ; `ToolCallOptions.idempotencyScope` est posé par l'Executor
> (`stepId` = id d'action) et par `AgenticRuntime` (`stepId` = `iter-N`). Tests :
> `server/core/LedgerGuard.test.ts`, scénario E de `mission-harness.test.ts`, test de portée dans
> `server/mission/Executor.test.ts`.
>
> **Découvert en chemin (hors C1) :** le scénario B REPAIR se termine en `outcome=failed` **même sans
> garde**, alors que l'étape est `done` et que la dernière vérification passe. `assessOutcome` s'appuie
> sur `WorkspaceState.completionReport`, qui semble garder un état `stale`/`failed` antérieur. À traiter
> avec C2.

- **Fichiers :** `server/core/LedgerGuard.ts`, `server/runtime/ToolRegistry.ts`, `server/runtime/agentic/AgenticRuntime.ts`, `server/mission/Executor.ts`.
- **Changement :** (a) ne jamais faire de `skip` pour un outil sans effet de bord : seuls les outils
  `write`/`exec`/`network` passent par le ledger ; (b) sans `missionId`/`stepId`, ne pas utiliser le
  ledger, ou ne bloquer que les `unknown` ; (c) poser le contexte (`missionId`, `stepId` = id
  d'action ou index d'étape + itération) dans `Executor.executeAction` et dans `AgenticRuntime.invokeTool`.
- **Tests à ajouter :** `verify_file` appelé deux fois renvoie deux résultats réels ; lecture après
  redémarrage non mise en cache ; écriture rejouée dans la même étape → `skip` ; écriture `unknown`
  après crash → `block`.
- **Acceptation :** le scénario B REPAIR de `mission-harness.test.ts` passe **avec la garde activée**.
- **Mesure immédiate possible :** passer `LEANNA_IDEMPOTENCY="false"` dans `.env` en attendant le
  correctif.

### C2 — P0 · Un résultat qui ne peut pas mentir (runtime agentique)
- **Fichiers :** `server/runtime/agentic/AgenticRuntime.ts:473, 1356-1395`, `server/agents/AgentRuntimeExecutor.ts:140`, `server/agents/types.ts`, `server/agents/TaskScheduler.ts`.
- **Changement :** `success` vrai uniquement pour `outcome === "success"`. Propager `outcome` jusqu'à
  `TaskResult` (le type `TaskOutcome` existe déjà). Le scheduler n'enchaîne sur un `partial` que si la
  dépendance l'autorise explicitement.
- **Tests :** étape « tests passent » échouée avec fichier vérifié → `partial`, `success:false` ;
  dépendant non lancé.
- **Acceptation :** aucun chemin `partial` → `completed`.

### C3 — P0 · Vérification des missions sans complaisance
- **Fichiers :** `server/mission/Executor.ts:1939-2036`, `server/mission/Mission.ts:234`, `.env.example:119`.
- **Changement :** supprimer l'annulation « verdict LLM non bloquant → succès » (2018-2023) ; sans
  critère explicite, exiger que **toutes** les actions réussissent (et non une seule) ; activer
  `LEANNA_MISSION_EVIDENCE` par défaut ; ajouter un statut mission `partial` avec les critères non
  satisfaits.
- **Tests :** outil `{ok:true}` sans effet réel ; LLM `passed:false, blocking:false` → objectif non
  atteint ; 1 action sur 3 réussie sans critère → échec.
- **Acceptation :** taux de faux succès nul sur ces fixtures.

### C4 — P1 · Isoler les tests de l'état réel
- **Fichiers :** `scripts/test-isolation.mjs`, `server/core/paths.ts`, `server/knowledge/StrategyMemory.ts` (et les stores qui en recopient la persistance).
- **Changement :** faire respecter `LEANNA_STATE_DIR` (ou un `LEANNA_WORKSPACE_ROOT` de test) par
  `workspaceRoot()`, ou rendre les singletons éphémères quand `NODE_ENV=test`.
- **Acceptation :** `.Leanna/` identique (mtime et contenu) avant et après `npm test`.

### C5 — P1 · Signal d'apprentissage propre
- **Fichiers :** `server/knowledge/StrategyMemory.ts:130`, `server/mission/Executor.ts:1605, 1629, 1703, 1744`.
- **Changement :** `recordSkillOutcome(skill, { success, kind: "skill" | "transient" | "model" })` ;
  ne pas pénaliser l'outil pour les erreurs `model` (arguments) ; pondérer ou ignorer les erreurs
  `transient`.
- **Tests :** 5 timeouts consécutifs → outil pas marqué `failing` ; 5 arguments invalides → outil
  pas pénalisé.

### C6 — P1 · Relire ce qu'on apprend
- **Fichiers :** `server/mission/Planner.ts`, `server/knowledge/PlaybookStore.ts`, `server/knowledge/LearningEngine.ts`.
- **Changement :** injecter dans `decompose` le playbook correspondant à la signature (`problemSignature`)
  et les 3 leçons les plus pertinentes, en citant la source dans le plan pour l'explicabilité.
- **Test bout en bout :** mission A échoue avec l'outil X → redémarrage → mission comparable B : le
  plan évite X ou le justifie.

### C7 — P1 · Reprise sans double exécution
- **Fichiers :** `server/mission/Mission.ts:479-495`, `server/mission/Executor.ts`.
- **Changement :** une action `in_progress` à effet de bord passe à `needs_review` (ou est vérifiée
  par une relecture) au lieu de `pending`. Avec C1, le ledger bloque l'`unknown` sur la bonne clé.
- **Test :** crash simulé pendant `write_project_file` → reprise sans réécriture aveugle.

### C8 — P2 · Unifier ou documenter les deux moteurs
- Décider si le moteur de missions délègue ses actions de code à `AgenticRuntime` ou reste séparé
  avec un contrat `MissionOutcome` commun. Supprimer ou brancher `runSupervisedAgenticMission`
  (orphelin).
- Corriger `docs/AUTONOMY_RUNTIME_MAP.md` : `AgentRuntime.ts` → `AgenticRuntime.ts`, et signaler que
  tsc/tests ne font pas partie de `verify()`.

---

## 4. Ce qui n'a pas été fait

- `npm run typecheck`, `npm run lint`, `npm run build` et la suite complète `npm test` n'ont pas été
  lancés : audit ciblé, et la suite complète prend plus de 10 minutes selon l'audit maître.
- Aucune mission réelle n'a été lancée contre un LLM, donc aucun taux de réussite de référence n'a
  été mesuré. C'est l'étape suivante de la phase 1 (jeu de missions de référence).
- Les chemins Telegram, MCP (`McpBridge.handleToolCall`) et `SmartSkills` n'ont pas été tracés.

### Tests exécutés

```text
node --import tsx --import ./scripts/test-isolation.mjs --test \
  server/agents/{AgentTaskRunnerContract,AgentTaskRunner,WorkspaceState,AgentEvidenceEvaluator,
  AgentValidation,DelegationManager,e2e-mission}.test.ts \
  server/runtime/agentic/{agentic,mission-harness}.test.ts \
  server/mission/{Executor,SkillScorer,Planner.replan,SelfEvaluation}.test.ts
→ tests 87 · pass 87 · fail 0 · ~10,2 s
```
