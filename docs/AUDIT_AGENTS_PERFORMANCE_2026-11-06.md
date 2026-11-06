# Audit technique des agents Leanna-IDE — performances, capacités et orchestration

> **Date de l'audit :** 6 novembre 2026  
> **Dépôt :** `moonback/Leanna-IDE`  
> **Branche d'audit :** `audit/agents-performance-2026-11-06` (créée depuis `main`, sans modification de `main`)  
> **Périmètre :** agents statiques et dynamiques, prompts de rôle, capacités/outils, sélection, délégation, orchestration, runtime agentique, Brain, vérification et observabilité.  
> **Nature :** audit statique du code et des documents présents dans le dépôt. Les tests, benchmarks et exécutions locales n'ont pas été lancés dans le cadre de cette passe. Les recommandations sont donc des hypothèses d'amélioration à valider par mesures avant toute refonte.

---

## 1. Synthèse exécutive

Leanna dispose déjà d'une base agentique riche : 20 rôles statiques, un registre d'agents dynamiques, un orchestrateur, une négociation Contract-Net, un scheduler de tâches, un Agent Brain avec plan DAG, un runtime agentique partagé, des budgets, une boucle de réparation et des mécanismes de preuve.

Le principal potentiel d'amélioration n'est pas d'ajouter encore des agents. Il est de rendre la flotte **plus sélective, plus mesurable, plus prévisible et moins coûteuse**.

### Évaluation qualitative

| Domaine | État observé dans le code | Priorité |
|---|---|---:|
| Spécialisation des rôles | 20 rôles, mais plusieurs frontières fonctionnelles se chevauchent | P1 |
| Attribution des outils | Capacités déclarées et ToolRegistry reliés ; audits d'attribution/capacités présents | P0 |
| Sélection Contract-Net | Score compétences/confiance/charge ; confiance actuellement approximée par une métrique globale du bus | P0 |
| Parallélisme | Tâches prêtes lancées par lots avec `Promise.allSettled`, sans limite globale visible dans le scheduler | P0 |
| Runtime agentique | Boucle plan → act → verify → recover → finalize, budgets et traces | P1 |
| Format des tool calls | Protocole JSON textuel décrit dans le prompt et extrait de la réponse LLM | P1 |
| Vérification | Vérification hashée des fichiers ; typecheck/tests complets non garantis après chaque étape | P0 |
| Moteurs historiques | `AgentExecutor` reste disponible comme repli du runner partagé | P1 |
| Observabilité | Traces d'exécution et télémétrie présentes, mais benchmark comparatif par rôle à formaliser | P1 |
| Sécurité | Permissions, dry-run, autorisations agent/outils et protections conditionnelles | P0 |

**Conclusion :** traiter d'abord les risques de concurrence, de sélection et de vérification. Optimiser ensuite les prompts et les échanges LLM. Ne pas fusionner les moteurs de missions et d'agents : ils ont des responsabilités distinctes documentées.

## 2. Architecture observée

### 2.1 Deux chemins d'exécution à conserver distincts

Le dépôt décrit deux flux principaux :

```text
Missions utilisateur / API / autonomie
  └─ server/mission/Executor.ts
       ├─ Planner et objectifs
       ├─ exécution planifiée/directe
       ├─ SkillHandler → ToolRegistry
       ├─ critères de succès / EvidenceEngine
       └─ persistance et reprise

Tâches d'agents / délégation / orchestration
  └─ AgentOrchestrator
       └─ AgentRuntimeExecutor (contrat AgentTaskRunner)
            └─ server/runtime/agentic/AgenticRuntime.ts
                 ├─ plan → act → observe
                 ├─ ToolRegistry.call
                 ├─ verify → recover → finalize
                 └─ WorkspaceState / preuves hashées
```

Le moteur de missions et le runtime agentique ne sont pas des doublons stricts. Ils gèrent des objets, des points d'entrée et des cycles de vie différents. Une unification forcée risquerait de casser la reprise, les événements, les statuts et les contrats d'API. La bonne cible est d'unifier les **contrats transversaux** (budgets, preuves, événements, annulation, métriques), pas nécessairement les moteurs.

### 2.2 Rôles et composants principaux

- `server/agents/types.ts` déclare 20 rôles statiques : coder, refactor, debugger, reviewer, tester, security, architect, vision, writer, formatter, researcher, proofreader, translator, summarizer, planner, ui_ux, seo, documentation, accessibility et performance.
- `server/agents/roles.ts` définit les prompts, capacités, limites de concurrence et timeouts par rôle.
- `DynamicAgentRegistry.ts` permet d'ajouter des rôles dynamiques.
- `AgentOrchestrator.ts` expose délégation, négociation et orchestration.
- `ContractNetNegotiator.ts` classe les offres selon compétences, confiance et charge.
- `TaskScheduler.ts` exécute les tâches selon leurs dépendances.
- `AgentBrain.ts` comprend l'objectif, construit un DAG, valide le plan, exécute et corrige.
- `AgentRuntimeExecutor.ts` adapte le runtime agentique au contrat historique `AgentTaskRunner`.
- `AgenticRuntime.ts` exécute la boucle bornée avec outils, observation, vérification et récupération.

## 3. Constats détaillés

### P0 — Sélection Contract-Net : la confiance n'est pas réellement propre à chaque agent

**Fichiers :** `server/agents/ContractNetNegotiator.ts`, `AgentMessageBus.ts`, `AgentCommunication.ts`.

Le score utilise les poids par défaut :
- compétences : 0,60 ;
- confiance : 0,25 ;
- charge : 0,15.

Le code de `estimateConfidence(role)` lit les métriques du bus, mais utilise le `successRate` global comme proxy de fiabilité, faute de métrique par rôle. Le paramètre `role` ne permet donc pas de distinguer correctement un agent très performant d'un agent qui échoue fréquemment si le taux global est bon.

**Impact :**
- mauvais classement possible entre deux agents de compétences proches ;
- apprentissage de la flotte peu fiable ;
- risque de récompenser un agent dont les résultats propres sont médiocres ;
- impossibilité d'expliquer précisément pourquoi un rôle est sélectionné.

**Recommandations :**
1. Calculer des métriques par rôle et par type de tâche : succès vérifié, succès partiel, échec, annulation, timeout, régression.
2. Pondérer par volume et récence ; utiliser un lissage statistique pour éviter qu'un agent ayant une seule réussite soit noté à 100 %.
3. Séparer la confiance technique (tests/preuves) de la satisfaction métier (critères de mission).
4. Stocker les métriques dans une mémoire durable, avec version du prompt et du modèle.
5. Exposer dans la trace le détail du score et la raison de disqualification.

**Critère d'acceptation :** un benchmark déterministe démontre que le classement évolue selon les résultats propres à chaque rôle et non selon le seul taux global du bus.

### P0 — Parallélisme sans limite globale visible dans les schedulers

**Fichiers :** `server/agents/TaskScheduler.ts`, `server/agents/brain/BrainScheduler.ts`, `server/agents/AgentOrchestrator.ts`, `server/agents/roles.ts`.

Les schedulers identifient les tâches/étapes prêtes et les lancent par lot avec `Promise.allSettled`. Le Brain fait de même sur toutes les étapes prêtes. `roles.ts` déclare des `maxConcurrency` par rôle (valeurs observées de 1 à 3), et la délégation directe vérifie une limite dans l'orchestrateur. Cependant, aucune limite globale de workers ou de budget de concurrence n'est visible dans les boucles de scheduling consultées.

**Impact potentiel :**
- pics d'appels LLM et de consommation de tokens ;
- saturation du fournisseur, réponses 429 et activation inutile du fallback ;
- concurrence sur les mêmes fichiers ou ressources ;
- latence globale accrue par contention CPU, mémoire et I/O ;
- coût imprévisible lorsqu'un DAG possède un grand fan-out.

**Recommandations :**
1. Ajouter un sémaphore central avec limites configurables : globale, par rôle, par fournisseur et par workspace.
2. Respecter les `maxConcurrency` des rôles sur tous les chemins d'entrée, pas uniquement la délégation directe.
3. Introduire une file priorisée (critical/high/medium/low), avec fairness pour éviter la famine.
4. Limiter le fan-out du Brain et du TaskScheduler ; démarrer une nouvelle vague dès qu'un slot est libéré.
5. Ajouter un verrou ou une stratégie de conflit par fichier/ressource pour les tâches qui écrivent dans les mêmes zones.
6. Propager l'annulation et les deadlines aux tâches en attente comme aux tâches en cours.

**Critère d'acceptation :** tests de charge prouvant que le nombre de tâches simultanées ne dépasse jamais les limites configurées, même avec plusieurs orchestrations et plusieurs points d'entrée simultanés.

### P0 — Succès de mission : distinguer preuve de fichier et validation du projet

**Fichiers :** `server/runtime/agentic/AgenticRuntime.ts`, `WorkspaceState.ts`, `AgentRuntimeExecutor.ts`, `server/agents/brain/BrainVerifier.ts`, `server/mission/Executor.ts`.

Le runtime vérifie les fichiers écrits avec une preuve hashée. C'est une bonne garantie d'observation de l'état du fichier, mais cela ne démontre pas à elle seule que le projet compile, que les tests passent ou que le comportement fonctionnel est correct. La cartographie du runtime précise que typecheck et tests complets ne sont pas automatiquement exécutés après chaque étape.

**Impact :** un agent peut livrer un fichier présent et hashé, alors qu'une erreur de type, une régression d'intégration ou un test cassé demeure.

**Recommandations :**
1. Définir des profils de vérification selon le risque : document, code simple, code critique, sécurité, refactor multi-fichiers.
2. Exiger au minimum typecheck ciblé ou complet pour les modifications TypeScript significatives.
3. Exécuter les tests ciblés identifiés par l'impact du changement ; réserver la suite complète aux jalons pertinents.
4. Faire produire un `VerificationReport` structuré : fichier/hash, typecheck, lint, tests, critères métier, régressions.
5. Ne jamais convertir un simple `verify_file` réussi en « mission entièrement validée ».
6. Afficher explicitement les vérifications non exécutées dans le résultat final.

**Critère d'acceptation :** le statut `success` exige les preuves requises par le profil de risque ; les validations absentes restent explicitement `not_run`.

### P1 — Chevauchement des rôles et des responsabilités

**Fichier :** `server/agents/roles.ts`.

Plusieurs familles sont proches :

| Famille | Rôles concernés | Risque de chevauchement |
|---|---|---|
| Ingénierie | coder, refactor, debugger, architect, reviewer, tester | lecture, analyse, modification et vérification partagées |
| Documentation | writer, documentation, formatter, proofreader, summarizer, translator | écriture et édition communes, frontière de responsabilité peu explicite |
| Analyse/planification | planner, researcher, summarizer, architect | recherche, synthèse, analyse d'impact et plan |
| Qualité transverse | security, performance, accessibility, seo, ui_ux | lecture/analyse communes, besoins de validation différents |

Ce chevauchement n'est pas nécessairement mauvais : certains outils sont des primitives communes. Le problème apparaît lorsque le routeur ne sait pas distinguer les rôles sur la base de résultats et de responsabilités exclusives.

**Recommandations :**
1. Définir une fiche de rôle normalisée : mission, tâches acceptées, tâches refusées, livrables, critères de réussite, outils autorisés.
2. Séparer les capacités génériques (lecture, recherche, mémoire) des capacités métier.
3. Réduire les capacités d'écriture des rôles d'audit en lecture seule lorsque leur mission ne demande pas de corriger.
4. Clarifier les frontières : `writer` produit le contenu, `documentation` maintient la documentation technique, `formatter` structure, `proofreader` corrige la langue.
5. Ne supprimer/fusionner aucun rôle sans analyser ses appels réels, ses prompts, ses statistiques et les usages UI/API.
6. Construire une matrice de confusion : tâches envoyées à un rôle mais mieux traitées par un autre.

**Critère d'acceptation :** chaque rôle possède une responsabilité différenciée et les tâches de référence sont routées vers le bon rôle avec un taux de succès mesuré.

### P1 — Sélection des outils : réduire le bruit et les coûts de prompt

**Fichiers :** `server/runtime/agentic/ToolPromptBuilder.ts`, `server/runtime/agentic/AgenticRuntime.ts`, `server/agents/roles.ts`.

`resolveAgentTools` expose les déclarations du ToolRegistry correspondant aux capacités du rôle. Le prompt décrit les outils et leurs paramètres, puis demande au modèle d'émettre des appels JSON textuels. Le runtime utilise un parseur pour extraire ces appels.

**Limites :**
- les paramètres et descriptions d'outils augmentent la taille du prompt à chaque tour ;
- le JSON textuel dépend du respect du protocole par le modèle et de la robustesse du parseur ;
- un rôle peut recevoir un grand nombre d'outils dont seule une petite partie est pertinente pour l'étape courante.

**Recommandations :**
1. Préférer les tool calls natifs des fournisseurs (function calling) quand le provider et le modèle le permettent.
2. Conserver un adaptateur commun pour Gemini/OpenRouter et un fallback JSON textuel testé.
3. Filtrer les outils par étape et intention, pas uniquement par rôle ; garder une liste de secours contrôlée.
4. Réduire les descriptions redondantes et ne transmettre les schémas complets que pour les outils pertinents.
5. Mesurer les tokens du prompt système, des outils et de l'historique séparément.
6. Tester les réponses malformées, les blocs Markdown, les arguments volumineux et les tool calls multiples.

**Critère d'acceptation :** mêmes missions de référence, même taux de réussite ou meilleur, avec réduction mesurée des tokens et des erreurs de parsing.

### P1 — Réduire le coût des tours LLM et de l'historique

**Fichiers :** `server/runtime/agentic/AgenticRuntime.ts`, `ToolPromptBuilder.ts`, `server/utils/textGeneration.ts`.

Le runtime possède déjà des bornes de plan, d'historique et de résultats d'outils. C'est une base utile. Les recommandations historiques du dépôt évoquent également la conversation multi-tours et le cache de préfixe.

**Recommandations :**
1. Passer à une vraie séquence de messages assistant/tool lorsque les API le permettent, au lieu de reconstruire tout l'historique dans un seul prompt.
2. Utiliser le prompt caching fournisseur lorsqu'il est disponible et compatible.
3. Conserver un résumé d'état compact : objectif, critères, plan, décisions, fichiers modifiés, erreurs encore ouvertes.
4. Ne transmettre que les observations utiles à l'étape courante ; conserver les détails complets dans la trace, pas dans chaque prompt.
5. Définir des budgets différenciés par phase : planification, exécution, vérification, récupération.
6. Réserver un modèle plus puissant aux tâches complexes ou aux récupérations difficiles ; utiliser un modèle rapide pour les opérations simples après validation par benchmark.
7. Mesurer le coût par tâche réussie, et pas seulement le coût par appel.

### P1 — Réparation et arrêt : renforcer les critères de progrès

**Fichiers :** `server/agents/AgentRepairLoop.ts`, `server/runtime/agentic/AgenticRuntime.ts`, `server/agents/brain/BrainCorrectionLoop.ts`.

`AgentRepairLoop` détecte notamment les patches répétés, les causes qui persistent, l'absence de progrès et les régressions fortes. Cette approche est saine.

**Améliorations :**
- partager un identifiant de cause racine entre vérification, réparation et réplanification ;
- distinguer « aucune modification », « modification sans progrès », « vérification indisponible » et « régression » ;
- éviter qu'une erreur externe (provider, permission, sandbox) soit traitée comme un défaut du code ;
- fixer un budget de réparation par cause, par fichier et par mission ;
- faire intervenir un autre rôle uniquement si le changement de stratégie apporte une compétence absente, pas pour répéter le même prompt ;
- conserver les patches et preuves précédents pour éviter les corrections circulaires.

### P1 — Double moteur : terminer la migration sans casser les tâches actives

**Fichiers :** `server/agents/AgentTaskRunner.ts`, `AgentExecutor.ts`, `AgentRuntimeExecutor.ts`, `AgentRegistry.ts`, `AgentOrchestrator.ts`.

Le contrat `AgentTaskRunner` permet aux consommateurs de dépendre d'une interface plutôt que d'un moteur concret. Le runtime agentique est le moteur actif après activation au bootstrap, mais `AgentExecutor` reste un repli et le registre autonome protège les tâches actives lors d'un changement de runner.

**Recommandations :**
1. Instrumenter chaque exécution avec `engine=agentic|legacy` et son point d'entrée.
2. Prouver qu'aucun chemin de production ne crée encore de nouvelle tâche sur le moteur legacy.
3. Tester la bascule, le redémarrage, l'annulation et les tâches actives.
4. Déprécier le legacy progressivement ; ne le supprimer qu'après une période sans exécution legacy et une couverture de tests équivalente.
5. Documenter le comportement de repli et rendre visible tout démarrage en mode legacy.

### P1 — Observabilité et benchmark par rôle

**Fichiers :** `server/observability/TelemetryService.ts`, `server/agents/AgentEventStream.ts`, `ProgressNotifier.ts`, `AgentPersistence.ts`, `scripts/test-agent-missions.mjs`.

La télémétrie et les traces existent, mais il faut une base de comparaison stable pour savoir si un changement améliore réellement les agents.

**Métriques minimales par rôle, modèle et type de tâche :**

| Indicateur | Définition |
|---|---|
| Taux de succès vérifié | tâches terminées avec toutes les preuves exigées / tâches terminées |
| Taux de réussite partielle | tâches livrées partiellement / tâches terminées |
| Taux d'échec | échecs techniques ou fonctionnels / tâches lancées |
| Taux de timeout/annulation | tâches expirées ou annulées / tâches lancées |
| Latence p50/p95 | durée de bout en bout et durée par phase |
| Coût moyen | coût fournisseur par tâche et par tâche réussie |
| Tokens | prompt, outils, historique, sortie |
| Efficacité outils | appels utiles, appels refusés, appels répétés, erreurs de parsing |
| Efficacité de réparation | réparations ayant réduit les causes racines / réparations tentées |
| Qualité métier | critères de succès satisfaits, régressions introduites |

**Règles de mesure :**
- comparer des tâches de difficulté similaire ;
- enregistrer le hash/version du prompt, du modèle, des outils et du runtime ;
- séparer les tâches analytiques des tâches qui modifient le projet ;
- conserver un jeu de missions de référence déterministe en CI ;
- lancer périodiquement un benchmark réel sur un échantillon contrôlé, avec plafonds de coût.

### P2 — Brain et orchestration : limiter les cycles de polling

**Fichiers :** `server/agents/brain/BrainScheduler.ts`, `server/agents/TaskScheduler.ts`.

Le Brain attend périodiquement les étapes en cours (boucle avec sommeil court) et le TaskScheduler attend aussi lorsqu'il reste des tâches actives. C'est simple, mais un mécanisme piloté par événements/promesses serait plus réactif et éviterait les réveils inutiles.

**Recommandations :**
- remplacer le polling par une promesse de fin par tâche/étape ou un événement de transition ;
- ajouter un timeout/deadline à chaque attente ;
- propager les erreurs avec un résultat structuré plutôt que dépendre uniquement des mutations de statut ;
- tester les DAG vides, cycles, dépendances inconnues, échecs en cascade, annulations et tâches qui ne terminent jamais.

### P2 — Rôles dynamiques : gouvernance et isolation

**Fichiers :** `server/agents/DynamicAgentRegistry.ts`, routes des agents personnalisés, audits de capacités.

Les rôles dynamiques augmentent la flexibilité, mais ils doivent passer par la même validation que les rôles statiques.

**Recommandations :**
- valider le schéma du rôle, les capacités, les limites et le prompt à l'enregistrement ;
- refuser toute capacité inconnue ou non autorisée ;
- appliquer une limite de concurrence et de coût par agent dynamique ;
- versionner les définitions et garder l'origine de chaque changement ;
- empêcher qu'un rôle dynamique puisse s'auto-attribuer des outils sensibles ;
- exécuter des tests de non-régression sur l'autorisation au démarrage.

## 4. Plan d'action recommandé

### Phase 0 — Sécuriser et rendre mesurable (priorité immédiate)

1. Ajouter les métriques de succès, latence, coût et erreurs par rôle.
2. Corriger la confiance Contract-Net pour qu'elle soit réellement calculée par rôle.
3. Introduire une limite globale et des limites par rôle/fournisseur/workspace.
4. Formaliser les profils de vérification et empêcher de confondre preuve hashée et validation complète.
5. Ajouter un test d'intégration qui prouve l'application des autorisations aux outils sensibles au bootstrap.
6. Rendre visible le moteur réellement utilisé pour chaque tâche.

**Livrable :** tableau de bord de référence et tests de garde-fous, sans refonte des rôles.

### Phase 1 — Améliorer la sélection et la qualité

1. Créer un jeu de 5 à 10 missions de référence par grande famille de rôles.
2. Mesurer les rôles qui réussissent réellement chaque famille.
3. Ajuster les descriptions, capacités et critères d'éligibilité.
4. Clarifier les frontières entre rôles qui se chevauchent.
5. Ajouter une sélection hybride : règles déterministes + score historique + charge + risque.
6. Expliquer chaque choix d'agent dans la trace.

**Livrable :** sélection plus pertinente et explicable, validée par benchmark.

### Phase 2 — Optimiser les performances LLM

1. Tester le function calling natif par fournisseur.
2. Introduire le filtrage d'outils par étape.
3. Optimiser le prompt et l'historique avec cache de préfixe si disponible.
4. Router les modèles selon la complexité, la phase et le budget.
5. Comparer coût et latence avant/après sur le même jeu de missions.

**Livrable :** réduction chiffrée du coût et de la latence sans baisse du taux de succès.

### Phase 3 — Simplifier l'architecture

1. Instrumenter puis éliminer les nouveaux appels au moteur legacy.
2. Stabiliser les contrats communs entre Mission, Brain et AgentRuntime.
3. Remplacer les boucles de polling par des transitions événementielles.
4. Consolider les mécanismes transversaux sans fusionner artificiellement les responsabilités métier.
5. Réduire ou fusionner des rôles uniquement sur preuves d'usage et de performance.

**Livrable :** architecture plus simple, sans perte de compatibilité ni de capacité.

## 5. Matrice de tests à ajouter ou renforcer

| Test | Scénario | Résultat attendu |
|---|---|---|
| Sélection par rôle | deux rôles avec succès historiques différents | le rôle le plus fiable est favorisé à compétence égale |
| Sélection à froid | aucun historique disponible | score neutre explicite, pas de confiance inventée |
| Limite globale | grand DAG avec beaucoup d'étapes prêtes | concurrence toujours bornée |
| Limite par rôle | plusieurs tâches du même rôle | respect strict de `maxConcurrency` |
| Conflit de fichiers | deux tâches écrivent le même fichier | sérialisation ou conflit explicite |
| Vérification | fichier hashé mais typecheck échoué | mission non déclarée entièrement réussie |
| Annulation | annuler une orchestration avec tâches en cours | signal propagé et statut terminal cohérent |
| Provider dégradé | 429/timeout sur un fournisseur | fallback contrôlé, coût et latence tracés |
| Tool call malformé | JSON incomplet ou volumineux | erreur explicite, pas de perte silencieuse |
| Réparation répétée | même patch ou même erreur deux fois | arrêt et rapport de blocage |
| Bootstrap | outil sensible ou capacité inconnue | audit fail-closed selon configuration |
| Runner legacy | exécution pendant la migration | moteur utilisé visible et testable |

## 6. Indicateurs cibles proposés

Ces valeurs sont des **objectifs de pilotage initiaux**, pas des performances mesurées actuellement.

| Indicateur | Cible initiale |
|---|---:|
| Tâches avec rôle et moteur identifiés | 100 % |
| Tâches terminées avec rapport de vérification structuré | 100 % |
| Dépassements de concurrence configurée | 0 |
| Capacités fantômes en mode strict | 0 |
| Appels d'outils répétés à l'identique | < 1 % |
| Tâches sans trace exploitable | 0 |
| Missions de référence exécutées en CI | 100 % du corpus déterministe |
| Réduction du coût par tâche réussie | à mesurer, objectif après baseline : −15 % |
| Réduction de latence p95 | à mesurer, objectif après baseline : −15 % |

Ne pas optimiser les tokens au détriment des preuves, de la sécurité ou du taux de réussite.

## 7. Fichiers de référence examinés

- `server/agents/types.ts` — rôles statiques et contrats de tâches.
- `server/agents/roles.ts` — prompts, capacités, concurrence et timeouts par rôle.
- `server/agents/AgentOrchestrator.ts` — délégation, négociation et orchestration.
- `server/agents/ContractNetNegotiator.ts` — scoring et enchères.
- `server/agents/TaskScheduler.ts` — exécution des graphes de tâches.
- `server/agents/AgentRegistry.ts` — cycle de vie et changement de runner.
- `server/agents/AgentTaskRunner.ts` — contrat commun des moteurs.
- `server/agents/AgentRuntimeExecutor.ts` — adaptateur vers le runtime agentique.
- `server/agents/AgentRepairLoop.ts` — détection de stagnation et de patches répétés.
- `server/agents/brain/AgentBrain.ts` — compréhension, planification, exécution et arbitrage.
- `server/agents/brain/BrainScheduler.ts` — exécution parallèle du DAG.
- `server/runtime/agentic/AgenticRuntime.ts` — boucle agentique et budgets.
- `server/runtime/agentic/ToolPromptBuilder.ts` — résolution et présentation des outils.
- `server/runtime/bootstrap.ts` — initialisation et audits d'attribution/capacités.
- `server/agents/toolAgentMapper.ts` — attribution et autorisation des outils sensibles.
- `server/utils/textGeneration.ts` — routage fournisseurs et fallback.
- `docs/AUTONOMY_RUNTIME_MAP.md` — cartographie des chemins d'exécution au 2026-11-06.
- `docs/ANALYSE_AGENTS.md` — audit antérieur, explicitement marqué comme photographie historique.

## 8. Limites et précautions

- Audit réalisé sur le code accessible dans le dépôt au moment de la lecture ; aucune exécution locale ni benchmark n'a été réalisé.
- Les valeurs de concurrence, les protections et les mécanismes opt-in doivent être confirmés dans la configuration effective de l'installation.
- La présence d'une classe, d'un test ou d'une variable d'environnement ne prouve pas à elle seule que le chemin est actif en production.
- Les statistiques de tests inscrites dans les documents ne sont pas certifiées par cette passe.
- Avant chaque implémentation, relire les fichiers sur la branche cible et vérifier que les constats sont toujours valides.

---

**Recommandation finale :** commencer par la Phase 0. Le meilleur gain immédiat pour Leanna est une flotte dont la sélection est fondée sur des résultats propres à chaque rôle, dont la concurrence est maîtrisée et dont chaque succès repose sur un niveau de preuve explicite. L'ajout de nouveaux agents ne devrait intervenir qu'après cette mise à niveau.


---

## Suivi d'implémentation — 2026-11-06

### Réalisé sur `audit/agents-performance-2026-11-06`

- **Scoring Contract-Net corrigé** : `ContractNetNegotiator` ne réutilise plus le taux de succès global du bus comme proxy de fiabilité. Il consulte `StrategyMemory` pour les capacités effectivement requises par la tâche, applique un a priori neutre (2 succès / 2 échecs) et conserve une confiance de 0,5 sans historique exploitable.
- **Concurrence bornée** : `TaskScheduler` accepte `maxConcurrentTasks` (défaut : 4), valide la configuration et traite les tâches prêtes par lots. Les dépendances restent évaluées entre les lots.
- **Tests ajoutés** : confiance neutre / positive / négative du Contract-Net ; plafond de concurrence, drainage des tâches prêtes et rejet d'une limite invalide.

### Vérification

Les modifications et les tests ont été enregistrés sur la branche GitHub. L'exécution locale de TypeScript, des tests Node et des benchmarks n'est pas disponible dans cette session : ces contrôles restent à exécuter dans l'environnement du dépôt ou par CI avant toute fusion.

### Prochaine étape

Étendre la gouvernance de concurrence au-delà d'une orchestration isolée : limites partagées entre orchestrations, quotas par rôle et par fournisseur LLM, annulation et libération garanties des créneaux, puis métriques p50/p95 et coût par tâche réussie.


### Phase 0 — complément : limites globales et par rôle

- Nouveau `TaskExecutionLimiter` FIFO, appelé à la frontière de `AgentExecutor.execute()` et `AgentRuntimeExecutor.execute()`. Les chemins `TaskScheduler`, délégation directe et flotte autonome qui utilisent ces exécuteurs partagent donc le même budget.
- Plafond global du processus : **8 tâches actives** ; plafond local inchangé : **4 tâches par orchestration**.
- Quota par rôle : `getAgentDefinition(role).maxConcurrency` est réservé atomiquement à l'entrée dans l'exécuteur, file d'attente comprise. Un rôle saturé ne bloque pas les autres rôles : le limiteur accorde les créneaux au premier waiter éligible.
- Les créneaux sont transmis directement au prochain élément de la file afin d'éviter une course entre libération et nouvelle arrivée.
- Annulation d'une tâche encore en file : `cancel()` retire le waiter ; une tâche annulée ne peut donc pas démarrer ultérieurement par erreur. `AgentOrchestrator.cancelTask()` relaie l'annulation à l'exécuteur.
- Tests ajoutés pour les plafonds globaux, les quotas par rôle, l'équité entre rôles, la libération après exception, les capacités invalides et l'annulation d'un waiter.

**Limite connue à traiter ensuite :** les quotas par fournisseur/modèle LLM ne sont pas encore centralisés. Plusieurs rôles peuvent utiliser le même fournisseur ; il faut donc ajouter un plafond fournisseur distinct, configurable et compatible avec les limites de débit réelles des API.


### Phase suivante — fiabilité du failover LLM

- `generateText()` ne déclenche plus de fallback inter-fournisseur sur les erreurs HTTP client permanentes : 400, 401, 403, 404, etc.
- Les erreurs transitoires restent éligibles au fallback : 408, 409, 425, 429, 5xx, erreurs réseau et timeouts sans statut HTTP.
- Les erreurs 4xx permanentes ne font plus augmenter le compteur du circuit breaker : une clé invalide ou une requête mal formée ne doit pas faire croire que le fournisseur est en panne.
- Tests de non-régression ajoutés pour vérifier qu'un 401 ne bascule pas silencieusement vers l'autre fournisseur et qu'un 429 conserve le failover.

**Pourquoi c'est important :** un fallback automatique sur 401/403 peut masquer une clé révoquée, une permission insuffisante ou une mauvaise configuration en envoyant la même tâche à un fournisseur différent. Le comportement doit privilégier la transparence et l'action corrective plutôt qu'une réussite apparente.

**Validation à exécuter en CI :** `server/utils/textGeneration.telemetry.test.ts`, puis typecheck et suite serveur. Les tests ne sont pas exécutés depuis cette session GitHub.


### Phase suivante — estimation alignée sur le modèle réellement sélectionné

- Ajout de `getActiveModel()` dans `server/utils/textGeneration.ts` : expose le modèle effectif du profil (modèle OpenRouter personnalisé ou défaut Gemini/OpenRouter).
- `PlanEstimator` utilise maintenant ce modèle pour calculer le coût estimé. Il ne suppose plus que tout profil OpenRouter utilise `google/gemini-3.6-flash`, ce qui sous-estimait ou surestimait les missions lorsque l'utilisateur sélectionnait un autre modèle.
- Tests ajoutés pour le modèle OpenRouter personnalisé, la valeur OpenRouter vide et le défaut Gemini.

**Limite conservée volontairement :** ce changement aligne le coût estimé sur le modèle de profil actif ; il ne choisit pas encore automatiquement un modèle selon la complexité. Les tarifs `MODEL_PRICING` restent des valeurs configurées et non certifiées par rapport à la facture fournisseur.


### Phase suivante — modèle configurable par agent personnalisé

- Le profil contient déjà `agents.customAgents[].model`, mais le runtime de génération ne le consultait pas : tous les agents personnalisés partageaient le modèle OpenRouter global.
- `AgenticRuntime.callLLM()` transmet maintenant le rôle à `generateText()`. Pour un agent personnalisé, le modèle configuré sur son rôle est utilisé lorsque le provider actif est OpenRouter.
- Ordre de priorité : surcharge explicite `openrouterModel` de l'appel, modèle de l'agent personnalisé, modèle OpenRouter global, puis défaut sûr.
- Les rôles sans modèle personnalisé et les appels Gemini conservent leur comportement antérieur. Le choix global de provider n'est pas modifié.
- Tests ajoutés pour la sélection par rôle, le repli sur le modèle global et la priorité de la surcharge explicite.

**Limite :** cette passe ne crée pas de sélection automatique par complexité, coût ou latence. Elle rend opérationnelle la configuration par agent déjà exposée dans le profil ; le routage adaptatif nécessitera des benchmarks fiables et une politique activable explicitement.
