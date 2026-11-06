# Audit ciblé — Mission System & Recovery

Date : 2026-11-06  
Branche : `audit/agents-performance-2026-11-06`

## Périmètre

Audit statique du cycle `Mission → Planner → Executor → Supervisor → Checkpoint → Evidence → Recovery`, de la persistance locale/Supabase et de la reprise après redémarrage. Les constats ci-dessous sont issus de la lecture du code de cette branche ; ils ne constituent pas une validation d'exécution. Les tests ajoutés doivent encore être lancés localement/CI.

## Résumé exécutif

Leanna dispose de briques utiles (Goal Stack, planification par dépendances, persistance locale, store composite, ledger d'idempotence, checkpoints, EvidenceEngine, Supervisor, approbations et reprise soumise à confirmation). Le problème principal n'est pas l'absence de composants : c'est le manque de cohérence de bout en bout entre ces composants.

Le chemin de mission historique et le chemin supervisé possèdent chacun leur propre état, leurs propres mécanismes de retry et leurs propres règles de reprise. Le Supervisor ne gouverne donc pas encore complètement l'exécution réelle.

## Constats priorisés

### P0 — Le Supervisor ne pilote pas réellement les reprises du moteur Executor

**Fichiers :** `server/mission/Executor.ts` (`runSupervised`, `buildMissionOutcome`, `executeMission`) et `server/core/LeannaSupervisor.ts`.

- `runSupervised` appelle `executeMission` pour une tentative complète.
- `executeMission` ferme la mission racine et finalise la mission lorsqu'il termine, même si des sous-objectifs ont échoué.
- `runSupervised` transforme ensuite une mission échouée déjà terminale en suggestion `escalate`.
- Le Supervisor ne peut donc généralement pas appliquer son propre cycle `retry / repair / replan` à une mission Executor réelle : le moteur interne a déjà consommé ses décisions et finalisé son état.

**Risque :** deux autorités de récupération se superposent. Le Supervisor affiche une politique à quatre niveaux, mais le retry/replan réel se déroule dans l'Executor ; le Supervisor sert surtout d'enveloppe de statut, preuve et checkpoint.

**Correction cible :** définir un contrat de tentative non terminale. L'Executor doit pouvoir exécuter une tentative, rendre un résultat factuel et conserver le contexte sans fermer la mission. Une seule autorité doit décider retry/repair/replan/escalate. La finalisation métier ne doit arriver qu'après le commit du Supervisor.

### P0 — Le callback de journalisation des écritures n'atteint pas les appels d'outils

**Fichiers :** `server/core/LeannaSupervisor.ts` (`beforeToolCall`) et `server/mission/Executor.ts` (`runSupervised`, `executeAction`).

- Le Supervisor construit un callback `beforeToolCall` destiné à capturer un fichier juste avant sa mutation.
- `runMission` reçoit ce callback uniquement via le runner.
- Le runner défini par `runSupervised` ignore ses paramètres et appelle `executeMission` sans propager le callback.
- Aucun `resolveWriteTargets` n'est fourni dans l'appel actuel au Supervisor.

**Risque :** les chemins non présents dans `plannedFiles` ne sont pas journalisés à temps ; un rollback peut donc être incomplet ou ne pas restaurer un fichier découvert dynamiquement.

**Correction cible :** propager un contexte d'exécution typé jusqu'au dernier point commun avant `skillHandler`, résoudre les chemins avec le même résolveur que les outils d'écriture, et refuser les mutations supervisées non journalisées. Tester création, modification, renommage, déplacement et répertoires.

### P0 — Le timeout du Supervisor peut laisser le runner continuer en arrière-plan

**Fichier :** `server/core/LeannaSupervisor.ts` (`runAttempt`).

- Le timeout déclenche un AbortController et résout la branche timeout d'un `Promise.race`.
- Le runner reçoit le signal, mais le chemin Executor actuel ne le consomme pas.
- `Promise.race` ne termine ni n'attend la promesse runner perdante.

**Risque :** le Supervisor peut commencer le rollback pendant que le runner continue à écrire. Cela crée une course critique entre rollback et effets de bord tardifs.

**Correction cible :** propager le signal jusqu'aux skills et commandes système ; après timeout, attendre l'arrêt confirmé du runner dans une fenêtre bornée. Si l'arrêt n'est pas confirmé, verrouiller le workspace/mission, ne pas prétendre que le rollback est sûr et escalader avec un état de récupération incomplet.

### P0 — Les checkpoints ne sont pas liés au journal durable de mission

**Fichiers :** `server/core/LeannaSupervisor.ts`, `server/core/DurableMissionStore.ts`, `server/core/CheckpointManager.ts`.

- Le checkpoint est créé à chaque tentative, mais son identifiant et son statut ne sont pas enregistrés dans le snapshot de la machine d'état.
- Les états `RUNNING`, `VERIFYING` et `COMMITTING` sont normalisés vers `READY` à la reprise, sans retrouver explicitement le checkpoint correspondant ni vérifier si le commit/rollback avait déjà eu lieu.
- Un crash entre le commit du checkpoint et la transition terminale peut laisser une mission et son checkpoint dans des états discordants.

**Risque :** reprise ambiguë, checkpoint orphelin, rollback impossible après commit ou nouvelle exécution alors que l'effet précédent a peut-être déjà été validé.

**Correction cible :** persister un journal transactionnel par tentative : `attemptId`, `checkpointId`, phase, décision, empreinte du plan, timestamps et statut d'effet. La reprise doit réconcilier le journal, le checkpoint et le ledger avant toute action.

### P1 — Le budget de tentatives du Supervisor est réinitialisé à chaque appel

**Fichier :** `server/core/LeannaSupervisor.ts`.

- `attempt` est une variable locale initialisée à zéro dans `runMission`.
- Le snapshot durable ne conserve ni compteur de tentative ni historique des décisions de recovery.

**Risque :** un nouvel appel sur une mission non terminale peut réinitialiser le budget et dépasser le nombre maximal d'essais prévu.

**Correction cible :** conserver le compteur et les tentatives dans un état durable par mission ; les limites doivent être atomiques et résistantes aux redémarrages.

### P1 — Les hooks PAUSE / APPROVAL du Supervisor ne sont pas raccordés à l'Executor

**Fichiers :** `server/core/LeannaSupervisor.ts`, `server/mission/Executor.ts`, `server/routes/missions.ts`.

Le Supervisor expose `needsApproval`, `awaitApproval`, `shouldPause` et `awaitResume`, mais `runSupervised` n'en fournit aucun. L'Executor gère ses propres approbations et pauses. Les actions peuvent donc attendre l'utilisateur sans que la machine de cycle de vie du Supervisor reflète nécessairement `WAITING_APPROVAL` ou `PAUSED`.

**Correction cible :** unifier les commandes pause/reprise/annulation et les approbations sous une interface de contrôle de mission commune. L'état UI doit dériver d'une source de vérité et non de deux timelines indépendantes.

### P1 — Persistance locale annoncée comme durable mais best-effort

**Fichier :** `server/mission/LocalMissionStore.ts`.

`LocalMissionStore.save` intercepte les erreurs d'écriture et les masque après log. `Executor.persist` intercepte également les erreurs. Une mission peut donc poursuivre son exécution sans que le dernier état soit durablement enregistré.

**Risque :** perte d'avancement et reprise sur un état ancien, alors que le système croit avoir persisté chaque action.

**Correction cible :** distinguer explicitement persistance critique et télémétrie best-effort. Pour les transitions critiques et les frontières d'action, la mission ne doit pas annoncer de durabilité si l'écriture atomique a échoué ; exposer un état `persistenceDegraded` et bloquer les actions à effets de bord si la politique l'exige.

### P1 — Reprise des actions en cours et idempotence à démontrer ensemble

**Fichiers :** `server/mission/Mission.ts`, `server/mission/Executor.ts`, `server/core/ExecutionLedger.ts`.

`Mission.fromJSON` remet les actions `in_progress` en `pending`. L'Executor fournit un scope d'idempotence `missionId + actionId`, ce qui est une bonne protection, mais la sûreté dépend de la persistance, du comportement du ledger pour les états `started/unknown` et du fait que chaque outil à effet de bord utilise bien le guard.

**Risque :** une action non idempotente peut être rejouée après crash si son résultat externe a été appliqué mais que le ledger n'a pas pu enregistrer le résultat final, ou si un outil contourne le guard.

**Correction cible :** adopter un résultat explicite `succeeded / failed / unknown` pour les actions interrompues. Ne jamais rejouer automatiquement `unknown` : réconcilier l'effet, demander validation ou appliquer une compensation. Exiger le ledger pour tout outil à effet de bord.

### P1 — Le chargement du store composite pouvait choisir une copie obsolète

**Fichier :** `server/mission/LocalMissionStore.ts`.

La méthode `load` renvoyait le premier store qui possédait une mission, sans comparer `updatedAt`. Le store local, placé avant Supabase au bootstrap, pouvait donc masquer une copie Supabase plus récente.

**Correction appliquée dans cette passe :** `CompositeMissionStore.load` interroge maintenant les réplicas actifs, ignore un réplica indisponible et renvoie la version ayant le `updatedAt` le plus récent. Deux tests ciblés ont été ajoutés dans `LocalMissionStore.test.ts`.

## Architecture cible

1. **MissionAggregate** : identité, objectif, plan versionné, tâches, progression et résultat métier.
2. **MissionLifecycle** : machine d'état unique, transitions validées, pause/approbation/annulation.
3. **AttemptJournal** : historique durable des tentatives et des décisions de recovery.
4. **ExecutionLedger** : idempotence des opérations, état `unknown` explicite et réconciliation.
5. **CheckpointTransaction** : snapshot associé à une tentative, journal des chemins avant mutation, commit/rollback récupérables.
6. **RecoveryPolicy** : décision déterministe fondée sur la classe d'erreur, la preuve, le risque, le budget et les stratégies déjà essayées.
7. **EvidenceBundle** : preuve vérifiable, versionnée par tentative ; une preuve d'une tentative précédente ne peut pas valider la tentative courante.
8. **MissionEventLog** : événements ordonnés et rejouables pour reconstruire la timeline et diagnostiquer une reprise.

## Ordre de correction recommandé

- **R0 — Sûreté des effets de bord :** propagation AbortSignal + callback de capture, verrou d'exécution, journal de tentative et réconciliation checkpoint/ledger.
- **R1 — Autorité unique :** sortir la finalisation de `executeMission` dans le mode supervisé ; une seule politique décide du retry/replan.
- **R2 — Reprise déterministe :** budget durable, tentative durable, états `unknown`, reprise explicite et idempotente.
- **R3 — Persistance et observabilité :** erreurs de sauvegarde visibles, événements corrélés par mission/attempt/action/checkpoint, diagnostics exploitables.
- **R4 — Tests de chaos :** crash simulé à chaque frontière (avant/après outil, écriture, preuve, commit, rollback, sauvegarde), timeout avec runner qui ignore le signal, double reprise concurrente et réplication locale/Supabase désynchronisée.

## Validation

- Correction composite : tests ajoutés, exécution non disponible depuis cette session GitHub.
- Aucune suite TypeScript/backend/UI n'est déclarée passée dans cet audit.
- Les constats P0 ci-dessus doivent être corrigés avant de considérer le mode supervisé comme transactionnel et récupérable en production.


## Passe de durcissement P0 — timeout et annulation (commit 2026-11-06)

### Correction appliquée : ne plus rollback pendant qu'un runner peut encore écrire

Dans `LeannaSupervisor.runAttempt`, le timeout ne se contente plus de gagner un `Promise.race` puis de rendre la main immédiatement :

1. le délai de tentative expire ;
2. le Supervisor déclenche l'`AbortSignal` ;
3. il attend jusqu'à 250 ms que le runner se termine réellement ;
4. si le runner s'arrête, la tentative est classée en échec et le rollback peut être envisagé ;
5. si le runner ignore le signal, la mission passe en `RECOVERING → ESCALATED`, le rollback est volontairement différé et le résultat signale `rollbackComplete: false`.

Cette stratégie ne prétend pas arrêter un code qui ignore l'annulation. Elle évite au moins une corruption supplémentaire causée par un rollback exécuté en concurrence avec ce code. Le checkpoint reste ouvert pour une réconciliation manuelle/automatisée ultérieure.

### Correction appliquée : relayer l'annulation vers les skills

Le runner fourni par `Executor.runSupervised` écoute désormais le signal du Supervisor. À son déclenchement, il annule l'agrégat de mission et appelle le contrôleur d'annulation de l'Executor, dont le signal est transmis au `skillHandler`.

### Tests ajoutés

- Un runner qui respecte `AbortSignal` doit s'arrêter et laisser le cycle normal de rollback/échec se terminer.
- Un runner qui ignore `AbortSignal` et écrit tardivement doit être mis en quarantaine ; le Supervisor ne doit pas restaurer le fichier en concurrence avec lui.

### Limites restantes — ne pas considérer le P0 comme clos

- La propagation de `beforeToolCall` n'est pas encore raccordée au point d'appel du `skillHandler` dans l'Executor : les fichiers découverts dynamiquement ne sont donc pas encore garantis d'être capturés sur le chemin réel supervisé.
- Le runner Executor finalise encore son agrégat interne ; le Supervisor ne possède donc pas encore l'autorité unique sur retry/replan.
- Si un skill ignore lui-même le signal et continue après escalade, le workspace n'est pas encore verrouillé par un lease exclusif. Le résultat expose le danger, mais un verrou inter-processus et une procédure de réconciliation restent nécessaires.
- Les tests n'ont pas été exécutés depuis la session GitHub ; aucune réussite de CI/typecheck n'est revendiquée.


## Passe checkpoint P0 — raccordement au vrai ToolRegistry (2026-11-06)

### Correction appliquée

Le callback du Supervisor est maintenant propagé sur le chemin d'exécution réel :

`LeannaSupervisor.beforeToolCall`
→ `Executor.runSupervised`
→ `Executor.executeAction`
→ `SkillHandlerOptions.beforeExecute`
→ `SkillManagerV2.handleToolCall`
→ `ToolRegistry.call`
→ hook juste avant le handler.

Le hook `ToolRegistry.beforeExecute` s'exécute après les contrôles d'autorisation et d'idempotence, immédiatement avant le handler. Les lectures ne déclenchent pas de capture. Les outils de mutation du workspace sont explicitement identifiés : écriture, modification, patch, création de dossier, renommage/déplacement, suppression de fichier et suppression de dossier.

### Résolution des chemins

- Les chemins planifiés et les chemins découverts au moment de l'appel sont résolus depuis `SELF_ROOT`, jamais depuis `process.cwd()`.
- Les cibles lexicalement hors workspace, racines du workspace et chemins sans projet actif sont refusés.
- Les renommages capturent source et destination avant l'appel du handler.
- Les suppressions de dossiers passent par la capture récursive du CheckpointManager.
- Si la capture préalable échoue, le callback lève une erreur et le handler n'est pas exécuté.

### Limites restantes

- Le contrôle de périmètre lexical ne remplace pas une vérification `realpath` au niveau du CheckpointManager. Les outils d'écriture doivent conserver leurs propres contrôles anti-symlink et anti-traversal ; un durcissement commun du FileGateway reste recommandé.
- La liste des outils de mutation est explicite. Tout nouvel outil capable d'écrire dans le workspace doit être ajouté à `CHECKPOINT_WRITE_TOOLS` et à son résolveur de cible, ou être refusé en mode supervisé.
- La transaction ne capture pas encore les effets externes (DB, API, commandes système, services distants). Ces opérations nécessitent une compensation ou un contrat idempotent ; un rollback fichier ne peut pas les annuler.
- Le verrouillage exclusif inter-processus et la réconciliation durable des checkpoints après crash restent à implémenter.
- Les tests/typecheck/CI n'ont pas été exécutés depuis cette session GitHub.

## Passe Recovery R0 — blocage des reprises ambiguës (2026-11-06)

Le Supervisor inspecte les checkpoints ouverts avant toute reprise. Si un checkpoint ouvert a survécu à l’instance précédente, il ne lance ni le runner ni un rollback spéculatif. Il place la mission dans `RECOVERY_REQUIRED` et renvoie les identifiants des checkpoints à réconcilier.

- Nouvel état durable `RECOVERY_REQUIRED`, distinct de `RECOVERING`.
- `CheckpointManager.listOpenByMission()` expose les transactions ouvertes après hydratation disque.
- `runMission()` bloque toute réexécution si une transaction ouverte est détectée.
- `ensureReady()` ne ramène jamais `RECOVERY_REQUIRED` automatiquement vers `READY`.
- Un test simule un crash après écriture et avant décision : le runner ne doit pas être rappelé et aucun rollback automatique ne doit être tenté.

Cette passe est un garde-fou fail-closed, pas encore un orchestrateur complet. La réconciliation manuelle du checkpoint et du ledger, le verrou inter-processus, le journal de tentative atomique et la comparaison des empreintes externes restent à implémenter. Tests/typecheck non exécutés depuis la session GitHub.

## Passe R0 — journal de tentative et quarantaine après crash (2026-11-06)

### Modifications appliquées

- Le snapshot durable de mission conserve maintenant `activeAttempt` : numéro de tentative, identifiant du checkpoint, phase transactionnelle (`prepared`, `executing`, `verifying`, `committing`, `rolling_back`) et horodatage.
- Le Supervisor persiste ce contexte avant le runner, avant la vérification, avant le commit et avant le rollback. Le contexte n'est effacé qu'après la finalisation de la transaction fichier.
- Le nouvel état non terminal `RECOVERY_REQUIRED` permet de distinguer une mission récupérable automatiquement d'une mission dont les effets sont ambigus.
- Au redémarrage, le Supervisor examine l'état de la machine, les tentatives encore actives, les checkpoints ouverts et les entrées `unknown` à effet de bord du `ExecutionLedger`.
- Toute incohérence place la mission en quarantaine. Le runner n'est pas rappelé automatiquement. Un timeout avec runner toujours actif aboutit également à `RECOVERY_REQUIRED`, sans rollback concurrent.
- Le `CheckpointManager` expose les checkpoints ouverts et l'historique de checkpoints par mission ; le ledger expose les entrées et effets inconnus par mission.

### Tests ajoutés (non exécutés dans cette session)

- Redémarrage simulé avec checkpoint ouvert et tentative `executing` : la mission doit être mise en quarantaine et le runner ne doit jamais être rappelé.
- Redémarrage avec action externe `started` devenue `unknown` dans le ledger : la mission doit être mise en quarantaine sans rejouer l'action.

### Limites explicites

- Cette passe privilégie la sûreté : elle détecte et bloque les reprises ambiguës, mais ne restaure pas encore automatiquement un checkpoint ouvert. La réconciliation/compensation doit être une opération explicite, après vérification que l'ancien runner est arrêté.
- Le verrou inter-processus/lease exclusif n'est pas encore implémenté. Deux processus démarrant simultanément peuvent encore lire le même état avant qu'un mécanisme de lease ne les sérialise.
- La détection d'écritures externes concurrentes reste à renforcer par comparaison d'empreintes et politique de conflit. Un rollback automatique ne doit jamais écraser silencieusement une modification extérieure.
- Les effets externes (API, base de données, Git distant, commandes système) ne sont pas annulables par un checkpoint fichier. Ils nécessitent des contrats de compensation ou une réconciliation métier.
- Les tests, le typecheck et la CI n'ont pas été exécutés depuis cette session GitHub. Aucune validation d'exécution n'est revendiquée.


### Durcissement complémentaire — lease exclusif inter-processus

- Ajout de `MissionExecutionLease`, un verrou fichier atomique créé avec le flag exclusif `wx`.
- Le verrou est acquis avant le chargement de l'état de mission et libéré dans un `finally`, y compris si le runner ou la persistance échoue.
- Une deuxième exécution de la même mission est refusée tant que le premier processus détient le lease.
- Un lease n'est automatiquement récupéré que si son propriétaire est sur le même hôte et que son PID est démontrablement arrêté. Les verrous distants, illisibles ou ambigus sont conservés (fail-closed).
- Tests ajoutés pour la contention, la libération par token propriétaire et la récupération d'un PID mort. Ils ne sont pas exécutés dans cette session.

- Un rollback qui échoue, ou dont les fichiers résiduels ne correspondent pas au snapshot, ne termine plus la mission en simple `FAILED` : il la place en `RECOVERY_REQUIRED` et conserve le contexte de tentative lorsque la transaction n'a pas pu être restaurée.
- Une mission déjà en quarantaine renvoie explicitement `recoveryRequired: true` et ne relance pas le runner.
