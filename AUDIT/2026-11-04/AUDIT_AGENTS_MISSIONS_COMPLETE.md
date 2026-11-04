# Audit complet — Agents & Missions (2026-11-04)

> **Périmètre :** parcours Agent, délégation, orchestration multi-agents, Brain, Missions, planification, exécution, approbation, récupération, persistance, observabilité et interfaces React.
>
> **Base inspectée :** branche `refactor/consolidate-runtime-prompts`, commit `a1d69d2314389cdd1aeb6d21d343bba423651543`.
>
> **Méthode :** lecture statique des sources et tests, cartographie des appelants et des contrats API, confrontation avec les audits `AUDIT/AGENTS_MISSIONS_*` du 25 octobre 2026. Cet audit n'est pas un test d'acceptation en conditions réelles : aucun fournisseur LLM, serveur interactif ni session Electron n'a été lancé pendant cette revue. Les mesures réelles de latence/coût restent donc indisponibles.

## 1. Synthèse exécutive

Leanna dispose d'une base agentique ambitieuse et déjà structurée : runtime outillé, planification, délégation, rôles spécialisés, Brain, récupération, preuves, approbations humaines, persistance et interfaces de suivi. Les audits précédents ont corrigé plusieurs défauts critiques de statut et de vérification. Le problème principal n'est plus l'absence de briques ; c'est **la fragmentation du parcours et des autorités** : plusieurs moteurs, plusieurs machines à états, plusieurs surfaces UI et plusieurs flux de télémétrie coexistent sans constituer encore une expérience unifiée et totalement observable.

### Verdict

- **Architecture fonctionnelle :** riche, mais plusieurs voies d'exécution restent distinctes et les garanties du Supervisor sont activables par configuration.
- **Logique métier :** les invariants essentiels ont progressé ; des limites restent autour du rollback des fichiers découverts en cours d'exécution, de la validation du graphe de dépendances et de la cohérence des résultats annulés/incomplets.
- **UI/UX :** beaucoup d'informations sont disponibles, mais réparties entre AgentPanel, AgentFleetPanel, MissionPanel, MissionControlView, AgentSwarmView et plusieurs modales. L'utilisateur doit comprendre les distinctions internes entre tâche, mission, orchestration et plan.
- **Observabilité :** le flux SSE est en mémoire et sans reprise d'événements ; le store UI est principalement mémoire locale. Un retour de connexion restaure les tâches actives, pas un historique complet des événements.
- **Validation :** les rapports existants documentent une bonne couverture simulée, mais pas de campagne LLM réelle, de tests d'acceptation Electron ni de mesures p50/p95/p99.

### Priorités proposées

| Priorité | Sujet | Impact |
|---|---|---|
| P0 | Garantir un rollback couvrant toutes les écritures réelles, pas seulement les fichiers préannoncés | Intégrité du workspace |
| P1 | Valider les DAG avant lancement et rendre les dépendances non résolues/cycliques explicites | Fiabilité des orchestrations |
| P1 | Unifier les états et la gouvernance des deux moteurs d'exécution | Cohérence des résultats et sécurité |
| P1 | Rendre les événements rejouables et l'historique d'agents restaurable | Observabilité et confiance |
| P1 | Corriger les collisions/déductions erronées du flux de flotte | Exactitude de l'UI |
| P1 | Reconcevoir l'approbation comme une décision contextualisée et informée | Sécurité utilisable |
| P2 | Unifier l'expérience Agent/Mission autour d'un espace de travail unique | Simplicité et découvrabilité |
| P2 | Instrumenter les coûts, délais, reprises et preuves réels | Pilotage produit |

## 2. Cartographie du système constaté

### 2.1 Deux familles d'exécution

1. **Missions** — `server/mission/Executor.ts` et `Mission.ts` : objectif hiérarchique, décomposition par `Planner`, sélection de skills, exécution d'actions, réflexion, retry/replan/escalade, preuve et persistance.
2. **Tâches d'agents** — `server/agents/AgentOrchestrator.ts`, `AgentTaskRunner.ts`, `AgentRuntimeExecutor.ts` et `runtime/agentic/AgenticRuntime.ts` : tâche assignée à un rôle, boucle plan→outil→vérification→récupération, avec orchestration de tâches dépendantes via `TaskScheduler`.

Le contrat `AgentTaskRunner` est une bonne frontière de migration entre moteur legacy et runtime agentique. Il reste néanmoins deux domaines de cycle de vie : `GoalStatus`/états de mission et `TaskStatus`/états de tâche, auxquels s'ajoute `MissionLifecycleState` dans `server/core/MissionStateMachine.ts`.

### 2.2 Flux utilisateur et écrans

- `AgentPanel` : rôles, tâches déléguées et activités d'outils.
- `AgentFleetPanel` : flotte, bus inter-agents et statistiques.
- `MissionPanel` : création, liste, pause/reprise/annulation, reprise après crash et détails des missions.
- `MissionDetail` : brief, critères, plan, budget, fichiers, commandes, vérifications et délégations.
- `MissionControlView` : santé du projet, diagnostic et opportunités d'amélioration.
- `AgentSwarmView` : composition/aperçu de swarm.
- `AgentStatusBar` et `MissionApprovalModal` : statut global et approbation.

Ces composants donnent une bonne couverture fonctionnelle, mais l'utilisateur navigue entre plusieurs concepts et panneaux pour suivre un même objectif.

## 3. Constats techniques et logique métier

### F-01 — P0 — Couverture de rollback incomplète si le périmètre réel dépasse les fichiers prévus

**Fichiers :** `server/core/LeannaSupervisor.ts`, `server/core/CheckpointManager.ts`, `server/core/AgenticMissionRunner.ts`, `server/agents/AgentRuntimeExecutor.ts`.

Le Supervisor prend un snapshot à partir de `plannedFiles`. Les audits antérieurs précisent que, pour les tâches agents supervisées, le rollback ne couvre que les fichiers déclarés avant l'exécution (`task.context.files`). Or le runtime peut découvrir et modifier d'autres fichiers en cours de mission. Si ces chemins ne sont pas dans le snapshot initial, un rollback peut restaurer les fichiers connus tout en laissant des changements résiduels.

**Impact :** mission présentée comme annulée/rollbackée alors que le workspace peut rester partiellement modifié. C'est particulièrement risqué après échec de vérification, annulation ou escalade.

**Recommandations :**
- Introduire un journal transactionnel des écritures au niveau du point d'entrée unique des outils : chemin canonique, hash avant, hash après, opération, missionId, horodatage.
- Capturer automatiquement le contenu initial avant la première écriture, y compris pour un fichier découvert dynamiquement.
- Pour les créations/suppressions/renommages, enregistrer l'opération inverse et son ordre.
- Refuser le commit si une écriture n'est pas attribuée à la transaction courante.
- Exposer les limites de rollback et les fichiers non restaurés dans le résultat final ; ne jamais afficher « rollback réussi » si la restauration est partielle.
- Ajouter des tests : fichier non annoncé modifié puis rollback, création/suppression/rename, écriture concurrente, crash entre write et journalisation.

**Critère d'acceptation :** après tout échec/annulation supervisé, l'état du workspace est identique au snapshot initial, ou l'UI affiche explicitement chaque différence résiduelle et demande une action humaine.

### F-02 — P1 — Deux graphes de tâches acceptent des dépendances invalides avant exécution

**Fichiers :** `server/agents/AgentOrchestrator.ts`, `server/agents/TaskScheduler.ts`.

L'orchestrateur résout les dépendances à partir d'IDs stables, de titres ou d'IDs directs. Les références non résolues sont journalisées, mais conservées sous forme de chaînes. Le scheduler ne peut lancer une tâche que lorsque toutes ses dépendances figurent dans `completed`. Une dépendance inconnue ou un cycle conduit donc à un deadlock, puis à un état incomplet/échec au lieu d'une erreur de validation immédiate. Les IDs stables dupliqués sont également seulement avertis.

**Impact :** une orchestration peut être acceptée, démarrer partiellement, consommer du temps et finir en tâches bloquées alors que le problème était détectable avant le lancement.

**Recommandations :**
- Valider le graphe entier avant toute création/exécution : unicité des IDs, références résolues, absence de cycle, pas d'auto-dépendance, taille/profondeur bornées.
- Retourner une erreur structurée par tâche et par arête invalide ; aucun agent ne démarre si le graphe n'est pas valide.
- Prévoir une visualisation DAG avec dépendances, parallélisme estimé et conséquences d'échec.
- Définir la politique de propagation : bloquer uniquement les descendants, poursuivre les branches indépendantes, et autoriser une reprise ciblée.
- Distinguer `blocked_by_dependency`, `incomplete`, `failed` et `cancelled` au lieu de les rabattre sur le même résultat.

**Critère d'acceptation :** un graphe cyclique ou avec une dépendance inconnue renvoie HTTP 400 avec diagnostic et zéro tâche exécutée.

### F-03 — P1 — Gouvernance et états de mission non canoniques entre les moteurs

**Fichiers :** `server/mission/Executor.ts`, `server/agents/AgentRuntimeExecutor.ts`, `server/core/LeannaSupervisor.ts`, `server/core/MissionStateMachine.ts`, `server/mission/types.ts`.

Le code conserve deux familles de moteurs et plusieurs vocabulaires d'état. La gouvernance supervisée des missions et celle des tâches agents sont configurables séparément (`LEANNA_MISSION_SUPERVISED`, `LEANNA_AGENT_SUPERVISED`) et les audits précédents indiquent que la supervision agentique est désactivée par défaut. Les garanties de preuve/rollback ne sont donc pas identiques sur tous les chemins.

**Impact :** même demande métier, garanties potentiellement différentes selon qu'elle passe par Mission, Agent Brain, délégation directe, swarm ou chemin legacy. Les statuts et les métriques peuvent être difficiles à comparer.

**Recommandations :**
- Définir un modèle canonique de run : `Run` (objectif, propriétaire, workspace, parent, état, budget, politique, preuves, artefacts).
- Conserver les moteurs comme stratégies d'exécution, mais faire transiter tous les effets de bord par le même orchestrateur transactionnel et la même politique de preuve.
- Définir un mapping exhaustif et testé des états internes vers les états UI ; ne jamais convertir un état inconnu en `pending`.
- Rendre visible dans le détail le moteur, le mode de gouvernance, le niveau de preuve et les limites effectives de rollback.
- Décider explicitement quelles classes de tâches peuvent fonctionner sans Supervisor ; documenter ce compromis dans les paramètres.

**Critère d'acceptation :** tests contractuels identiques pour Mission, Agent direct, Brain et swarm sur succès, échec, annulation, pause, reprise, timeout, rollback et preuve rejetée.

### F-04 — P1 — Le flux d'événements agents ne permet pas une reprise fidèle après déconnexion

**Fichiers :** `server/agents/AgentEventStream.ts`, `server/routes/agents.ts` (`GET /events`), `src/hooks/useAgentEventStream.ts`, `src/stores/agentActivityStore.ts`.

Le SSE publie aux abonnés actuellement connectés, sans identifiant d'événement ni journal durable/rejeu. Le client reconnecte avec backoff, puis `syncActiveTasksFromServer` restaure seulement les tâches `running/pending`. Les événements intermédiaires manqués (progression, outils, messages bus, décisions de reprise) ne sont pas rejoués ; le store UI est en mémoire et réinitialisé au démontage global/rechargement.

**Impact :** l'utilisateur peut perdre la chronologie et le contexte d'une exécution après veille, redémarrage ou coupure réseau. Le détail serveur peut encore exister, mais l'interface ne reconstruit pas nécessairement la liste/historique.

**Recommandations :**
- Ajouter un `eventId` monotone par workspace/run et persister un journal borné.
- Accepter `Last-Event-ID`/curseur de reprise ; envoyer les événements manqués puis un snapshot de l'état courant.
- Persister les résumés de tâches et leurs liens d'orchestration ; fournir un endpoint paginé d'historique.
- Distinguer événement perdu, tâche terminée et tâche supprimée/purgée.
- Conserver les détails volumineux (logs, traces, résultats outils) dans un stockage séparé avec rétention et pagination.

**Critère d'acceptation :** après coupure réseau pendant 60 secondes, reconnexion et rechargement de l'application, l'état courant et la chronologie manquante sont reconstruits sans doublons.

### F-05 — P1 — L'UI de flotte peut afficher un état d'agent erroné et masquer des messages du bus

**Fichier :** `src/components/panels/AgentFleetPanel.tsx`.

Deux problèmes concrets dans le traitement local des événements :
1. Le statut d'un agent est remplacé par `idle` à la fin d'une tâche, même si `runningTasks` reste supérieur à zéro ; l'agent peut donc apparaître libre alors qu'une autre tâche tourne.
2. Les IDs synthétiques des messages bus reposent sur le préfixe du `taskId` (`bus-${taskId.slice(0,8)}`). Le store déduplique par ID : plusieurs messages d'un même task/correlation peuvent être confondus. Les événements synthétiques dédupliquent aussi par `taskId + event`, ce qui peut masquer des progressions répétées.

**Impact :** métriques et disponibilité de flotte trompeuses, historique bus incomplet.

**Recommandations :**
- Calculer le statut depuis les compteurs et la capacité : `offline` si non connecté, `overloaded` si capacité dépassée, `busy` si tâches actives, sinon `idle`.
- Fournir un véritable `messageId`/eventId depuis le bus ; ne pas fabriquer l'identité d'un message à partir de la tâche.
- Garder les événements répétés en timeline, tout en agrégeant séparément les compteurs.
- Réconcilier périodiquement les compteurs avec un snapshot serveur plutôt que de les incrémenter/décrémenter uniquement côté client.

**Critère d'acceptation :** deux tâches simultanées sur un rôle ne produisent jamais un statut `idle` avant la fin de la seconde ; 10 messages d'une même tâche restent 10 entrées distinctes.

### F-06 — P1 — Annulation d'une tâche en attente : statut et résultat métier contradictoires

**Fichiers :** `server/agents/AgentOrchestrator.ts` (`cancelTask`), `src/components/panels/MissionDetail.tsx`.

Sur le chemin d'annulation d'une tâche `pending` (et sur la branche d'annulation logique sans exécution active), la tâche prend le statut `cancelled`, mais le résultat contient `outcome: "failed"`. Le détail UI utilise le résultat pour libeller l'issue. Il peut donc présenter une tâche annulée comme un échec, malgré le statut de tâche annulée.

**Impact :** taux d'échec, filtres, historique et compréhension utilisateur incohérents.

**Recommandations :**
- Ajouter `cancelled` au vocabulaire `TaskOutcome` et au contrat `AgentTaskRunner`.
- Normaliser ensemble `status`, `success`, `outcome`, `error.code` et notification.
- Distinguer `cancelled_by_user`, `cancelled_by_parent`, `cancelled_by_timeout` et `cancelled_by_shutdown`.
- Tester annulation avant démarrage, pendant outil, entre deux étapes et après terminalisation.

**Critère d'acceptation :** une tâche annulée ne porte jamais un résultat `failed` et n'entre jamais dans les dénominateurs de réussite/échec sans règle documentée.

### F-07 — P2 — Les états inconnus sont rabattus silencieusement sur « en attente »

**Fichiers :** `src/stores/agentActivityStore.ts`, `src/components/panels/AgentPanel.tsx`.

La fonction `mapStatus` du store retourne `pending` pour toute valeur hors du petit ensemble connu. Or le scheduler utilise aussi `incomplete` pour les tâches bloquées par dépendance. Un état serveur nouveau ou non terminal peut ainsi être rendu comme une tâche en attente, au lieu d'un état explicite ou d'une erreur de contrat.

**Recommandations :**
- Partager les types de statut via un contrat API généré ou un package commun.
- Ajouter les états `incomplete`, `blocked`, `waiting_approval`, `paused` et `timed_out` si nécessaires.
- Pour une valeur inconnue, afficher « état non reconnu » et enregistrer une télémétrie de contrat ; ne pas inventer `pending`.
- Ajouter un test de compatibilité backend↔frontend sur toutes les valeurs d'enum.

### F-08 — P2 — Sérialisation du détail de tâche et résultat d'exécution à faire évoluer vers un contrat versionné

**Fichiers :** `server/routes/agents.ts` (`serializeTaskDetail`), `src/components/panels/MissionDetail.tsx`.

Le serveur construit manuellement un DTO et le frontend maintient un miroir de types. Les champs sont bornés, ce qui est positif, mais les deux schémas peuvent diverger sans validation contractuelle. Certaines propriétés du résultat (preuves globales, erreurs, fichiers, délégations) sont transformées à la main.

**Recommandations :**
- Définir un schéma Zod versionné partagé pour `AgentTaskDetail` et `MissionDetail`.
- Ajouter `schemaVersion`, `runId`, `workspaceId`, `parentRunId`, `engine`, `governanceMode`, `evidenceSummary`.
- Valider la sortie côté serveur et le parsing côté client.
- Paginer les listes et les événements, avec des limites par défaut cohérentes.

## 4. Audit UI/UX — recommandations concrètes

### U-01 — Unifier les surfaces autour de « Mission Control »

**Constat :** AgentPanel, AgentFleetPanel, MissionPanel, MissionControlView et AgentSwarmView présentent des facettes voisines sans un point d'entrée unifié.

**Proposition :** un seul espace Mission Control, avec navigation secondaire :
- **Vue d'ensemble** : état global, tâches actives, approbations, blocages et dernières missions.
- **Missions** : objectifs utilisateur, plan, dépendances, livrables, historique.
- **Agents** : rôles/capacités, disponibilité, tâches affectées et charge.
- **Orchestrations** : DAG, dépendances, branches parallèles, erreurs propagées.
- **Événements** : timeline unifiée, filtres par run/agent/type.
- **Qualité & coûts** : preuves, tests, tokens, coût réellement mesuré, durée et récupération.

Ne pas supprimer immédiatement les composants : les faire converger progressivement vers des vues d'un même modèle de données.

### U-02 — Repenser la création de mission en progressive disclosure

**Constat :** le formulaire de `MissionPanel` ne demande que titre, description et priorité ; la route accepte aussi `dryRun`, mais l'interface n'expose pas ce choix. Les critères de succès, limites, workspace, mode d'autonomie et risques sont surtout inférés.

**Proposition :**
1. **Simple** : objectif en langage naturel + workspace courant.
2. **Options** : critères de réussite, fichiers inclus/exclus, priorité, délai, budget tokens/coût, nombre de tentatives, parallélisme, dry-run.
3. **Avant lancement** : plan lisible, étapes/dépendances, outils/agents retenus, fichiers touchés, risques, estimation et confiance.
4. **Confirmation** : « Lancer », « Modifier le plan », « Simuler », « Annuler ».

Le mode simulation doit être explicite et visuellement distinct d'une exécution réelle.

### U-03 — Transformer l'approbation en fiche d'impact

**Constat :** `MissionApprovalModal` affiche l'action, une raison, les arguments JSON et un compte à rebours. C'est informatif pour un développeur, mais insuffisant pour une décision de sécurité éclairée.

**Proposition :** présenter :
- intention en langage clair et pourquoi l'action est nécessaire ;
- outil, chemin(s), commande et paramètres normalisés ;
- aperçu diff avant/après ou simulation de l'effet ;
- données réseau envoyées, destination et volume si applicable ;
- niveau de risque, réversibilité, durée et portée ;
- conséquences d'un refus et comportement fail-closed ;
- approbation limitée à cette action, jamais un consentement global implicite.

Conserver « Refuser » comme choix par défaut en cas d'expiration ; afficher le temps restant sans rendre la décision précipitée.

### U-04 — Une timeline unique, structurée et consultable

Chaque événement doit être affiché sous forme d'étape : comprendre, planifier, affecter, lire, écrire, vérifier, récupérer, demander validation, terminer. Chaque ligne doit exposer heure, durée, agent, outil, résultat et preuve, avec détail repliable. Les logs bruts restent disponibles mais ne doivent pas constituer la seule explication.

### U-05 — Résultat orienté livrables et preuve

La page de détail devrait commencer par :
- **Résultat** : réussi / partiel / échoué / bloqué / annulé ;
- **Preuve** : checks exécutés, checks passés/échoués, commit/hash/diff ;
- **Livrables** : fichiers créés/modifiés/supprimés, liens ouvrant l'éditeur ;
- **Reste à faire** : étapes non exécutées, raisons, dépendances bloquées ;
- **Récupération** : tentatives, rollback complet/partiel, changements résiduels ;
- **Coût** : tokens mesurés, appels non mesurés, coût fournisseur réel si disponible, estimation clairement séparée.

Ne pas mettre en avant un score de confiance LLM comme substitut à la preuve.

### U-06 — Accessibilité et ergonomie de supervision

- Ajouter un focus management fiable aux modales d'approbation et de création ; annoncer les événements critiques avec une zone live ARIA non intrusive.
- Permettre de désactiver les animations et de réduire la fréquence de rafraîchissement.
- Ajouter des filtres, recherche, tri, pagination et vues sauvegardées pour les historiques.
- Rendre les actions destructives explicites, avec confirmation et portée visible.
- Permettre de copier/exporter un rapport d'audit complet (brief, plan, événements, preuves, diff, coûts).
- Utiliser des libellés cohérents : « tâche agent », « mission utilisateur », « orchestration », « étape », sans employer « mission » pour tous les objets.

## 5. Améliorations de logique métier

### M-01 — Contrat de succès strict et indépendant du texte du modèle
Une mission n'est réussie que si tous les critères obligatoires sont satisfaits par des preuves observables. Le résultat doit être `success | partial | failed | blocked | cancelled`, avec `reasonCode`, `unmetCriteria`, `evidenceRefs` et `sideEffects`. Les étapes non terminées doivent interdire le statut réussi.

### M-02 — Politique de récupération par classe d'action
Toutes les actions ne sont pas rejouables. Définir pour chaque outil : idempotent, compensable, non répétable, réversible, nécessite approbation. Le retry doit exiger une clé d'idempotence et une preuve que le premier essai n'a pas déjà produit l'effet. Ne pas appliquer le même retry à un GET, un write fichier, un push Git et une action réseau.

### M-03 — Budget et arrêt basés sur le progrès utile
Suivre séparément temps actif, temps en file, appels LLM, tokens entrée/sortie, appels outils, lectures, écritures, reprises, coût réel et coût estimé. Déclencher une alerte ou un arrêt si le coût augmente sans progrès vérifiable, si le plan oscille ou si les mêmes fichiers/outils sont répétés.

### M-04 — Isolation explicite par workspace et par run
La file d'écriture globale de `Executor` suppose un workspace actif unique. Si plusieurs projets/workspaces doivent être supportés, utiliser une file/verrou par workspace et des clés de cache/idempotence incluant workspace + run + outil + arguments. Toute ressource doit avoir un workspaceId résolu et vérifié avant écriture.

### M-05 — Stratégie d'échec des orchestrations
Formaliser les règles pour branches indépendantes, dépendances échouées, agent indisponible, timeout, annulation parent, réassignation et reprise. Une orchestration partiellement réussie doit conserver les artefacts valides et proposer une reprise des seules branches non satisfaites, sans rejouer les tâches déjà terminées.

### M-06 — Apprentissage contrôlé
Les mémoires de stratégie et auto-évaluations doivent stocker les résultats vérifiés, la version de modèle/outils, le contexte projet et le niveau de confiance. Ne pas apprendre comme un succès une mission partielle ou rollbackée. Prévoir expiration, correction et explication des recommandations générées par l'apprentissage.

## 6. Observabilité et indicateurs produit

Construire un tableau de bord par workspace et par type de run :

| Indicateur | Définition |
|---|---|
| Taux de réussite vérifiée | Runs terminés avec tous les critères obligatoires prouvés / runs terminaux éligibles |
| Taux de réussite partielle | Runs avec livrables utiles mais critères incomplets |
| Taux d'escalade | Runs nécessitant une intervention humaine |
| Taux de rollback complet | Rollbacks confirmés sans différence résiduelle / rollbacks demandés |
| Taux de reprise réussie | Runs repris après interruption et terminés correctement |
| Temps p50/p95 | Création→fin, séparé en file, planification, exécution, vérification |
| Coût par run | Coût fournisseur réellement rapporté ; séparer estimation et mesures manquantes |
| Efficacité des agents | Succès vérifiés, durée, tokens et escalades par rôle/capacité |
| Efficacité du planificateur | Étapes inutiles, replans, dépendances bloquées, boucles détectées |
| Fiabilité des outils | Succès/échecs, retries, durée, erreurs métier par outil |

Les tableaux de bord doivent signaler les échantillons insuffisants et les appels non mesurés. Ne pas afficher un coût précis si le fournisseur ne l'a pas fourni.

## 7. Plan de réalisation proposé

### Lot A — Intégrité et contrat (priorité immédiate)
1. Journaliser chaque effet de bord et garantir le rollback dynamique.
2. Valider les DAG avant lancement.
3. Normaliser les statuts et résultats (notamment annulation et incomplete).
4. Ajouter des tests contractuels croisés pour les deux moteurs.

### Lot B — Observabilité fiable
1. Journal d'événements durable, IDs et replay SSE.
2. Endpoint paginé d'historique des tâches et orchestrations.
3. Snapshot serveur de la flotte, compteurs dérivés et réconciliation.
4. Corriger les IDs bus et la dérivation du statut d'agent.

### Lot C — UX de confiance
1. Mission Control unifié.
2. Création guidée + aperçu de plan + simulation.
3. Approbation contextualisée avec diff/impact.
4. Détail de run orienté preuves/livrables et timeline.

### Lot D — Optimisation mesurée
1. Campagne d'au moins 5 runs par scénario et par mode.
2. Comparer Agent legacy, Agentic runtime supervisé, Mission direct et Mission supervisée.
3. Relever latences p50/p95, tokens, coûts, taux de reprise, rollbacks, faux succès et qualité des livrables.
4. N'activer par défaut un mode supervisé qu'après validation de non-régression et du coût.

## 8. Matrice minimale de tests d'acceptation

- Mission simple : succès prouvé, un seul livrable attendu.
- Mission multi-étapes : DAG valide, parallélisme contrôlé, résultats de dépendances transmis.
- Dépendance inconnue, ID dupliqué, cycle : rejet avant exécution.
- Échec d'une branche : branches indépendantes continuent, descendants bloqués proprement.
- Annulation avant démarrage, pendant lecture, pendant écriture, pendant vérification.
- Timeout pendant attente, exécution et approbation.
- Échec de preuve après écriture : rollback complet vérifié.
- Fichier découvert après snapshot : rollback automatique.
- Crash après écriture et avant commit : récupération sans duplication.
- Déconnexion SSE puis reconnexion : replay sans perte ni doublon.
- Deux tâches simultanées du même rôle : flotte et bus exacts.
- État API inconnu : UI affiche un état inconnu, jamais pending par défaut.
- Coût fournisseur absent/partiel : UI signale la mesure partielle.
- Accessibilité clavier/lecteur d'écran pour création, suivi et approbation.

## 9. Fichiers de référence examinés

### Frontend
- `src/components/panels/AgentPanel.tsx`
- `src/components/panels/AgentFleetPanel.tsx`
- `src/components/panels/MissionPanel.tsx`
- `src/components/panels/MissionDetail.tsx`
- `src/views/MissionControlView.tsx`
- `src/views/AgentSwarmView.tsx`
- `src/components/MissionApprovalModal.tsx`
- `src/components/MissionCreatedPrompt.tsx`
- `src/components/AgentStatusBar.tsx`
- `src/stores/agentActivityStore.ts`
- `src/hooks/useAgentEventStream.ts`

### Backend
- `server/agents/AgentOrchestrator.ts`
- `server/agents/TaskScheduler.ts`
- `server/agents/AgentTaskRunner.ts`
- `server/agents/AgentRuntimeExecutor.ts`
- `server/agents/AgentEventStream.ts`
- `server/mission/Executor.ts`
- `server/mission/Planner.ts`
- `server/mission/types.ts`
- `server/mission/PlanEstimator.ts`
- `server/routes/agents.ts`
- `server/routes/missions.ts`
- `server/core/LeannaSupervisor.ts`
- `server/core/MissionStateMachine.ts`
- `server/core/AgenticMissionRunner.ts`
- `server/core/CheckpointManager.ts`

### Audits et tests antérieurs
- `AUDIT/AGENTS_MISSIONS_EXECUTIVE_SUMMARY.md`
- `AUDIT/AGENTS_MISSIONS_FINDINGS.md`
- `AUDIT/AGENTS_MISSIONS_ARCHITECTURE.md`
- `AUDIT/AGENTS_MISSIONS_TEST_RESULTS.md`
- `AUDIT/AGENTS_MISSIONS_PERFORMANCE.md`
- `AUDIT/AGENTS_MISSIONS_ACTION_PLAN.md`

## 10. Limites et conclusion

Cet audit repose sur le code de la branche et les rapports de tests antérieurs ; il n'affirme pas que tous les scénarios passent sur l'environnement de production. Les défauts F-05 et F-06 sont des constats de code directement vérifiables. Les risques de rollback dynamique et de replay SSE sont déduits des contrats et implémentations consultés et doivent être confirmés par les tests d'acceptation proposés.

**Recommandation générale :** ne pas ajouter encore de nouveaux rôles ou de nouveaux sous-systèmes agentiques. Consolider d'abord la transaction, le modèle d'état, le graphe de dépendances, l'observabilité et l'expérience Mission Control. Cela donnera plus de valeur et de confiance aux capacités déjà présentes.
