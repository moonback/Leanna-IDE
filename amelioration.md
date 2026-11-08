Je vais traiter cette mission comme un audit technique préalable à la mise en production de Leanna-IDE, et non comme une simple génération de 40 idées.

Le dépôt identifié est :

moonback/Leanna-IDE

Dépôt identifié

[Lien vers le dépôt GitHub](https://github.com/moonback/Leanna-IDE?utm_source=chatgpt.com)

Le périmètre sera strictement non destructif : aucune modification de fichier, aucun commit, aucune migration et aucun push.

Je vais notamment distinguer les capacités déclarées dans l'architecture de celles dont les chemins d'exécution et les résultats peuvent être démontrés dans le code.

### Premier constat : le dépôt contient déjà plusieurs audits spécialisés

L'arborescence confirme la présence de systèmes distincts pour le runtime, les agents, les missions, les notebooks, la mémoire, l'interface et les intégrations.

J'ai également repéré plusieurs audits préexistants, notamment :

- `docs/AUTONOMY_AUDIT.md`
- `docs/AUTONOMOUS_AGENT_AUDIT.md`
- `docs/AUTONOMY_RUNTIME_MAP.md`
- `docs/AUTONOMY_TEST_PLAN.md`
- `docs/AUDIT_MISSION_RECOVERY_2026-11-06.md`
- `docs/AUDIT_AGENTS_PERFORMANCE_2026-11-06.md`
- `docs/UX_UI_AUDIT.md`
- `docs/P0_ARCHITECTURE_PLAN.md`

C'est important : je vais confronter ces diagnostics à l'implémentation actuelle, plutôt que de refaire artificiellement des recommandations déjà documentées.

## 1. Périmètre et méthode de l'audit

Version du dépôt

# 2.3.0

Arborescence

# 1 151

Fichiers recensés

Fichiers de tests

# 227

203 serveur, 23 interface et 1 autre

Documentation

# Importante

Architecture, autonomie, sécurité et UX

Référence examinée : branche `main`, version 2.3.0.

Référence Git : `3afbba46d7888b9cbfd2dddec82c5bc62abb7217`

Une précision importante : cet audit est une analyse statique approfondie des principaux chemins architecturaux et fichiers de gouvernance, complétée par l'inventaire du dépôt et l'examen des audits existants. Je n'ai pas lu individuellement les 1 151 fichiers et le connecteur GitHub ne me permet pas d'exécuter directement les commandes locales du projet.

En conséquence :

- Les constats accompagnés de références sont des observations du code versionné.
- Les problèmes issus des audits précédents sont signalés comme tels.
- Les hypothèses à confirmer par exécution ne sont pas présentées comme des bugs démontrés.
- Aucun test n'est déclaré réussi ou échoué sans exécution effective.

## 2. Cartographie de l'architecture

Leanna possède une architecture sensiblement plus avancée qu'un simple assistant IA avec quelques outils.

INTERFACE LEANNA

React 19 · Monaco · Dashboard · Chat · Visualisation

API ET COMMUNICATION

Express · REST · WebSockets · Authentification · Rate limiting

Agent Runtime

ToolRegistry, permissions, budgets, exécution et vérification

Mission System

Planner, Executor, objectifs, réflexion et récupération

Agent Orchestrator

20 rôles, délégation, Contract-Net, scheduler, Brain

Core P0

Ledger, checkpoints, EvidenceEngine, Supervisor

Knowledge Layer

Knowledge Graph, AST, RAG, embeddings, Project Memory

Intelligence Layer

Gemini, OpenRouter, ModelRouter, prompts et mémoire

PERSISTANCE ET SERVICES

Stockage local · Supabase · PostgreSQL · pgvector · Redis optionnel · GitHub · Telegram · E-mail

### Les principaux modules

| Domaine              | Référence                           |
| -------------------- | ----------------------------------- |
| Bootstrap            | `server-bootstrap.ts`, `server.ts`  |
| Runtime              | `server/runtime/`                   |
| Agents               | `server/agents/`                    |
| Exécution agentique  | `server/runtime/agentic/`           |
| Missions             | `server/mission/`                   |
| Noyau transactionnel | `server/core/`                      |
| Autonomie proactive  | `server/autonomy/`                  |
| Connaissances        | `server/knowledge/`                 |
| Notebooks et RAG     | `server/notebooks/`                 |
| Sécurité             | `server/utils/`, `server/security/` |
| Interface            | `src/`                              |
| Electron             | `electron/`                         |
| Base de données      | `supabase/`                         |

### Première conclusion architecturale

Le problème principal n'est pas le manque de systèmes.

Leanna dispose déjà de plusieurs moteurs sophistiqués. Le risque est plutôt leur coexistence avec des responsabilités, des cycles de vie et des niveaux de gouvernance différents.

Je déconseille une réécriture complète. Il faut progressivement unifier les contrats transversaux sans détruire les moteurs existants.

## 3. État réel des fonctionnalités

Voici mon évaluation de maturité sur la base des implémentations et documents examinés.

Échelle : 1 = expérimental, 2 = partiel, 3 = opérationnel sous conditions, 4 = robuste avec tests, 5 = éprouvé en production.

| Système                   | Maturité estimée | Observation                                      |
| ------------------------- | ---------------- | ------------------------------------------------ |
| ToolRegistry              | 4/5              | Point de passage central réel                    |
| PermissionPolicy          | 3/5              | Enforce présent, configuration à durcir          |
| AgenticRuntime            | 4/5              | Boucle agentique, budgets, réparation            |
| AgentOrchestrator         | 3/5              | Délégation et orchestration présentes            |
| Contract-Net              | 3/5              | Sélection intelligente, calibration à poursuivre |
| Mission System            | 3/5              | Planification et persistance                     |
| LeannaSupervisor          | 2/5              | Gouvernance optionnelle, couture à fiabiliser    |
| ExecutionLedger           | 3/5              | Implémenté, activation conditionnelle            |
| CheckpointManager         | 3/5              | Snapshot et rollback présents, limites externes  |
| EvidenceEngine            | 3/5              | Preuves disponibles, utilisation non universelle |
| Knowledge Graph           | 3/5              | Infrastructure existante, qualité à mesurer      |
| RAG / Notebooks           | 3/5              | Ingestion et recherche, gouvernance à renforcer  |
| ModelRouter               | 3/5              | Routage adaptatif initial                        |
| Project Memory            | 3/5              | Plusieurs niveaux de mémoire                     |
| Sécurité globale          | 3/5              | Nombreux contrôles, activation inégale           |
| Interface professionnelle | 3/5              | Fonctionnelle, amélioration UX continue          |
| Observabilité             | 3/5              | Télémétrie et traces existantes                  |
| CI / qualité              | 3/5              | Vérifications présentes, ESLint non bloquant     |

Ces notes sont des appréciations architecturales, pas des résultats de certification ou de tests en production.

### 3.1 Les points forts

1. Existence d'un véritable `ToolRegistry`.
2. Séparation entre missions et tâches agentiques.
3. Résolution des capacités des agents vers les outils réellement disponibles.
4. Boucle PLAN → ACT → VERIFY → RECOVER.
5. Gestion des budgets d'exécution.
6. Vérification des fichiers par empreinte SHA-256.
7. Annulation coopérative des tâches.
8. Persistance locale des missions.
9. Mécanismes de récupération après interruption.
10. Contrôles de permissions et de sécurité.
11. Tests utilisant un faux LLM déterministe.
12. Infrastructure d'observabilité.

Ce sont des fondations sérieuses. Il serait contre-productif de les remplacer.

### 3.2 Les faiblesses structurelles

Les principaux risques sont :

- Plusieurs autorités de décision.
- Gouvernance optionnelle sur des chemins importants.
- Vérification parfois moins exigeante que le niveau de qualité attendu.
- Concurrence entre différents schedulers.
- Mémoire et métriques qui ne sont pas toujours persistantes.
- Configuration centralisée mais encore incomplète.
- Validation de production insuffisamment démontrée.

# 4. Les 20 améliorations et corrections

Les identifiants ci-dessous correspondent à des chantiers distincts. Les problèmes documentés dans les audits précédents sont indiqués comme tels lorsqu'ils n'ont pas été vérifiés par une nouvelle exécution.

## IMP-01 à IMP-05 — Sécurité et gouvernance

IMP-01 — Adopter des permissions par défaut restrictives



P0

Complexité moyenne



- Problème : `PermissionPolicy` initialise ses permissions accordées avec `ALL_PERMISSIONS` lorsque rien n'est configuré.
- Preuve : `server/runtime/PermissionPolicy.ts`, constructeur et `fromEnv()`.
- Conséquence : le mode `enforce` ne garantit pas à lui seul le principe du moindre privilège.
- Solution : permissions minimales par installation et par profil, avec activation explicite des droits supplémentaires.
- Bénéfice : réduction de la surface d'attaque.
- Risque : moyen, certains outils pourraient ne plus fonctionner sans permissions supplémentaires.
- Validation : un outil non explicitement autorisé est systématiquement refusé.

IMP-02 — Rendre Jev Safety Gate cohérent sur tous les chemins



P0

Complexité moyenne



- Problème : Jev est optionnel et son mode est configurable indépendamment du reste.
- Preuve : `server/core/kernel.ts`, `server/core/JevSafetyGate.ts`, `server/runtime/bootstrap.ts`.
- Conséquence : la présence du Safety Gate ne signifie pas qu'il protège toutes les exécutions.
- Solution : définir une politique centrale par niveau de risque et contrôler les chemins qui ne passent pas par le registre.
- Bénéfice : décisions de sécurité homogènes.
- Risque : moyen, blocage d'actions légitimes en cas de mauvaise calibration.
- Validation : mêmes décisions pour les actions équivalentes provenant du chat, des missions et des agents.

IMP-03 — Généraliser l'idempotence des actions sensibles



P0

Complexité élevée



- Problème : `LEANNA_IDEMPOTENCY` est optionnel et désactivé par défaut si non configuré.
- Preuve : `server/core/kernel.ts`, `server/core/ExecutionLedger.ts`.
- Conséquence : le niveau de protection contre les répétitions après interruption dépend de la configuration.
- Solution : activer l'idempotence pour les opérations concernées et normaliser les clés mission/étape/outil/arguments.
- Bénéfice : éviter les doubles écritures, envois et mutations.
- Risque : moyen, une mauvaise clé peut empêcher une action légitime.
- Validation : une action déjà exécutée n'est jamais répétée après reprise.

IMP-04 — Faire du Supervisor le véritable propriétaire de la gouvernance



P0

Complexité élevée



- Problème : le `AgentRuntimeExecutor` peut exécuter directement `agentic.run()` lorsque la supervision n'est pas branchée.
- Preuve : `server/agents/AgentRuntimeExecutor.ts`, `server/runtime/bootstrap.ts`.
- Conséquence : le comportement transactionnel dépend du chemin d'exécution.
- Solution : définir une politique explicite indiquant quelles missions doivent obligatoirement être supervisées.
- Bénéfice : fiabilité et traçabilité.
- Risque : élevé, impact sur les flux existants.
- Validation : chaque mission à risque possède un état durable et une preuve de fin.

IMP-05 — Harmoniser la gouvernance des missions et des agents



P0

Complexité élevée



- Problème : le Mission Executor et l'AgenticRuntime possèdent des cycles de vie distincts.
- Preuve : `server/mission/Executor.ts`, `server/runtime/agentic/AgenticRuntime.ts`.
- Conséquence : des règles de vérification et de récupération peuvent différer.
- Solution : un contrat commun pour les tentatives, budgets, preuves, annulations et événements, sans fusion forcée des moteurs.
- Bénéfice : cohérence globale.
- Risque : élevé.
- Validation : scénarios identiques de sécurité et de récupération sur les deux moteurs.

## IMP-06 à IMP-10 — Fiabilité et autonomie

IMP-06 — Corriger la propagation des checkpoints dynamiques



P0

Complexité élevée



- Problème documenté : le callback `beforeToolCall` du Supervisor n'atteint pas correctement le point d'exécution des outils dans le chemin Mission Executor.
- Preuve : `server/core/LeannaSupervisor.ts`, `server/mission/Executor.ts`. Constat de `docs/AUDIT_MISSION_RECOVERY_2026-11-06.md`.
- Conséquence : des fichiers découverts pendant l'exécution pourraient ne pas être capturés avant modification.
- Solution : propager un contexte transactionnel jusqu'au handler final et refuser les écritures supervisées non journalisées.
- Bénéfice : rollback plus fiable.
- Risque : élevé.
- Validation : tests de modification, création, suppression et renommage de fichiers découverts dynamiquement.

IMP-07 — Fixer un timeout réel au Supervisor



P0

Complexité moyenne



- Problème : `LeannaSupervisor` utilise `runnerTimeoutMs = 0` par défaut, soit aucune limite.
- Preuve : `server/core/LeannaSupervisor.ts`.
- Conséquence : un runner bloqué peut conserver une mission active indéfiniment.
- Solution : timeout configurable par type de mission, propagation du signal d'annulation et confirmation de l'arrêt avant rollback.
- Bénéfice : meilleure maîtrise des ressources.
- Risque : moyen.
- Validation : un runner bloqué finit en état contrôlé, sans rollback concurrent dangereux.

IMP-08 — Supprimer les doubles autorités de récupération



P0

Complexité élevée



- Problème documenté : le moteur de missions peut finaliser une mission avant que le Supervisor puisse appliquer sa propre stratégie de retry/replan.
- Preuve : `server/mission/Executor.ts`, `server/core/LeannaSupervisor.ts`, audit de récupération du 6 novembre.
- Conséquence : incohérence possible entre statut métier et statut transactionnel.
- Solution : distinguer tentative et finalisation ; une seule autorité décide de la récupération.
- Bénéfice : cycle de mission prévisible.
- Risque : élevé.
- Validation : une mission en échec peut être réparée sans être prématurément considérée comme terminale.

IMP-09 — Séparer vérification de fichier et validation complète du projet



P0

Complexité moyenne



- Problème : le contrôle d'un fichier modifié ne garantit pas que l'ensemble du projet fonctionne.
- Preuve : `server/runtime/agentic/AgenticRuntime.ts`, constantes `VERIFY_TOOLS` et `VERIFY_TOOL_SET`.
- Conséquence : une mission peut produire un fichier correct isolément mais introduire une régression ailleurs.
- Solution : définir des niveaux de vérification obligatoires selon le périmètre : fichier, module, TypeScript, lint, tests et build.
- Bénéfice : qualité des livrables.
- Risque : moyen, coûts d'exécution supplémentaires.
- Validation : aucune mission de refactoring global ne termine sans ses contrôles de projet requis.

IMP-10 — Mettre en place une limite globale de concurrence



P0

Complexité élevée



- Problème documenté : plusieurs schedulers coexistent et leur concurrence n'est pas entièrement gouvernée par un budget global partagé.
- Preuve : `server/agents/TaskScheduler.ts`, `server/agents/brain/BrainScheduler.ts`, `server/agents/AgentOrchestrator.ts`.
- Nuance : `TaskScheduler` dispose déjà d'une limite locale de quatre tâches par défaut ; il ne faut pas confondre cela avec une limite globale de tous les schedulers.
- Solution : sémaphore partagé par workspace et limites par rôle, fournisseur LLM et type d'outil.
- Bénéfice : stabilité et maîtrise des coûts.
- Risque : moyen.
- Validation : charge simultanée plafonnée même avec plusieurs missions et schedulers.

## IMP-11 à IMP-15 — Intelligence et configuration

IMP-11 — Réduire le bruit dans les outils proposés aux agents



P1

Complexité moyenne



- Problème : un agent peut recevoir des outils qui ne sont pas pertinents pour son objectif.
- Preuve : `server/runtime/agentic/ToolPromptBuilder.ts`.
- Conséquence : tokens supplémentaires, erreurs de sélection et coûts inutiles.
- Solution : filtrage par objectif, capacités, contexte projet et risque.
- Bénéfice : meilleure précision des appels d'outils.
- Risque : moyen.
- Validation : comparaison du nombre de tokens et du taux de réussite avant/après.

IMP-12 — Persister les métriques du ModelRouter



P1

Complexité moyenne



- Problème : les échantillons de latence du routeur adaptatif sont conservés en mémoire.
- Preuve : `server/utils/modelRouter.ts`.
- Conséquence : les statistiques disparaissent après redémarrage.
- Solution : historique durable par modèle, rôle, complexité et fournisseur.
- Bénéfice : décisions de routage plus fiables.
- Risque : faible à moyen.
- Validation : les métriques restent disponibles après redémarrage.

IMP-13 — Renforcer la sécurité du RAG à la récupération



P0

Complexité élevée



- Problème documenté : le garde d'injection de prompts couvre les principaux chemins d'entrée vers le modèle, mais la documentation identifie encore un chantier sur la récupération des contenus notebooks/knowledge.
- Preuve : `server/utils/promptInjectionGuard.ts`, `server/notebooks/SourceIngester.ts`, `server/knowledge/document-system/ContentExtractor.ts`.
- Conséquence : confiance insuffisamment formalisée dans les passages récupérés.
- Solution : provenance, niveau de confiance, neutralisation et isolation des instructions dans les contextes RAG.
- Bénéfice : résistance aux contenus malveillants.
- Risque : moyen.
- Validation : corpus de documents adversariaux et tests de récupération.

IMP-14 — Terminer la centralisation de l'environnement



P1

Complexité moyenne



- Problème : `envSchema` utilise `.passthrough()` pour conserver des variables historiques.
- Preuve : `server/config/env.ts`.
- Conséquence : toutes les variables utilisées ne bénéficient pas nécessairement d'une validation centrale.
- Solution : inventorier les accès directs à `process.env`, typer progressivement les variables et documenter leurs consommateurs.
- Bénéfice : configurations prévisibles.
- Risque : moyen.
- Validation : aucune variable métier non documentée ou non validée sans justification.

IMP-15 — Rendre visibles les configurations invalides en mode embarqué



P1

Complexité moyenne



- Problème : le parseur tolérant d'Electron retire les clés invalides et permet un démarrage dégradé.
- Preuve : `server/config/env.ts`, `parseEnvLenient()`.
- Conséquence : l'application peut démarrer sans qu'un utilisateur comprenne immédiatement qu'une fonctionnalité est désactivée.
- Solution : état de santé de la configuration, explication par variable, action de correction et historique.
- Bénéfice : diagnostic plus simple.
- Risque : faible.
- Validation : chaque clé ignorée apparaît dans un écran de diagnostic sans exposer sa valeur.

## IMP-16 à IMP-20 — Produit, Electron et qualité

IMP-16 — Durcir l'isolation Electron



P0

Complexité moyenne



- Problème : `sandbox: false` est utilisé sur les fenêtres Electron principales et splash.
- Preuve : `electron/main.cjs`.
- Conséquence : défense en profondeur réduite.
- Solution : réévaluer les dépendances du preload, migrer vers un renderer sandboxé compatible et conserver `nodeIntegration: false` et `contextIsolation: true`.
- Bénéfice : meilleure isolation.
- Risque : moyen, incompatibilités possibles.
- Validation : tests IPC, tests renderer et audit de sécurité Electron.

IMP-17 — Étendre la détection des secrets



P0

Complexité moyenne



- Problème : le scanner actuel recherche les valeurs secrètes de `.env` et `.env.local` dans `dist`.
- Preuve : `scripts/check-bundle-secrets.cjs`.
- Conséquence : ce contrôle ne certifie pas l'absence de secrets dans l'historique Git, tous les artefacts et les environnements distants.
- Solution : scanner de secrets dédié sur les fichiers suivis, l'historique et les artefacts de distribution.
- Bénéfice : réduction du risque de fuite.
- Risque : faible.
- Validation : secrets factices détectés dans tous les périmètres prévus.

IMP-18 — Rendre ESLint bloquant progressivement



P1

Complexité moyenne



- Problème : la CI autorise actuellement l'échec ESLint.
- Preuve : `.github/workflows/ci.yml`, étape ESLint `continue-on-error: true`.
- Conséquence : des régressions de qualité peuvent être intégrées.
- Solution : correction par lots, seuil maximal de warnings puis activation d'un échec CI.
- Bénéfice : qualité constante.
- Risque : faible à moyen.
- Validation : aucun nouveau défaut lint introduit par une PR.

IMP-19 — Compléter la CI par les scénarios critiques



P1

Complexité moyenne



- Problème : les scripts de smoke test, missions et soak ne figurent pas tous dans le workflow CI.
- Preuve : `package.json`, `.github/workflows/ci.yml`.
- Solution : ajouter des jobs dédiés pour les missions, la récupération, les charges longues et la sécurité, avec des environnements isolés.
- Bénéfice : meilleure détection des régressions.
- Risque : moyen, temps de CI plus important.
- Validation : pipeline séparant tests rapides, intégration et tests longs.

IMP-20 — Unifier les traces de bout en bout



P1

Complexité élevée



- Problème : les différents systèmes ont leurs propres événements, historiques et métriques.
- Preuve : `server/runtime/Observability.ts`, `server/observability/TelemetryService.ts`, `server/agents/AgentEventStream.ts`.
- Solution : identifiants de corrélation communs entre requête, mission, tâche, agent, outil et appel LLM.
- Bénéfice : diagnostic rapide et analyse des coûts.
- Risque : moyen.
- Validation : reconstitution intégrale d'une mission à partir de son identifiant.

# 5. Les 20 nouvelles fonctionnalités IA

Ces propositions visent à différencier Leanna d'un IDE classique équipé d'un chatbot.

Elles sont considérées comme de nouvelles opportunités fonctionnelles : je n'ai pas identifié de workflow complet équivalent dans les modules examinés. Une recherche complémentaire dans les 1 151 fichiers devra précéder chaque implémentation pour exclure tout chevauchement résiduel.

## Intelligence contextuelle

NEW-01 — Project Intelligence Radar

Forte valeur stratégique

- Description : une intelligence qui surveille en permanence la santé du projet.
- Besoin : identifier les problèmes avant qu'ils deviennent des bugs.
- Fonctionnement : croise Knowledge Graph, Git, tests, erreurs, dépendances et historiques de missions.
- Intégration : `server/knowledge/`, `server/observability/`, `server/autonomy/`.
- Technologies : AST, embeddings, événements, LLM.
- IA : détection de tendances et classification des anomalies.
- Autonomie : 4/5.
- Difficulté : élevée.
- Priorité : P1.
- Validation : détection reproductible d'une régression injectée dans un projet de test.

NEW-02 — Mémoire décisionnelle évolutive

- Description : mémoriser pourquoi une décision technique a été prise, pas seulement le fait lui-même.
- Besoin : éviter que les agents répètent les mêmes erreurs ou annulent des choix antérieurs.
- Fonctionnement : associer décisions, alternatives rejetées, contraintes et résultats observés.
- Intégration : ProjectMemory, StrategyMemory, HierarchicalMemoryService.
- Technologies : PostgreSQL, embeddings, graphe de connaissances.
- IA : extraction et rapprochement des décisions.
- Autonomie : 3/5.
- Difficulté : élevée.
- Priorité : P1.
- Validation : une mission ultérieure retrouve la décision et respecte sa justification.

NEW-03 — Change Impact Predictor

- Description : prédire les risques d'une modification avant son exécution.
- Besoin : éviter les changements qui provoquent des régressions indirectes.
- Fonctionnement : analyse les dépendances AST, les appelants, les tests concernés et l'historique Git.
- Intégration : `CodeMap`, `KnowledgeGraph`, `WorkspaceState`.
- Technologies : AST, graphe de dépendances, modèle de classification.
- IA : estimation du risque et explication des conséquences.
- Autonomie : 3/5.
- Difficulté : élevée.
- Priorité : P1.
- Validation : score de risque confronté aux régressions réellement observées.

NEW-04 — Context Compiler adaptatif

- Description : construire automatiquement le meilleur contexte possible pour chaque agent.
- Besoin : limiter la consommation de tokens et éviter les informations inutiles.
- Fonctionnement : sélection des fichiers, décisions, dépendances, mémoire et outils selon la mission.
- Intégration : `ToolPromptBuilder`, `TokenOptimizer`, `KnowledgeGraph`.
- Technologies : RAG, AST, embeddings, classement.
- IA : sélection sémantique et compression contextuelle.
- Autonomie : 4/5.
- Difficulté : élevée.
- Priorité : P1.
- Validation : amélioration du taux de réussite avec réduction du contexte consommé.

## Intelligence des agents

NEW-05 — Agent Reputation Intelligence

- Description : établir une réputation mesurée de chaque agent par spécialité.
- Besoin : ne pas confondre disponibilité d'un agent et compétence réelle.
- Fonctionnement : mesurer les résultats vérifiés, les corrections nécessaires, le coût et la durée par catégorie de tâche.
- Intégration : ContractNetNegotiator, StrategyMemory, AgentOrchestrator.
- Technologies : statistiques, historique durable, scoring.
- IA : estimation de fiabilité et sélection contextualisée.
- Autonomie : 4/5.
- Difficulté : moyenne à élevée.
- Priorité : P1.
- Validation : sélection plus pertinente qu'un classement basé uniquement sur les capacités déclarées.

NEW-06 — Multi-Agent Independent Review

Différenciation

- Description : faire examiner indépendamment une mission par plusieurs agents avant validation.
- Besoin : réduire les erreurs produites par un agent unique.
- Fonctionnement : un agent réalise, un autre audite, un troisième vérifie les preuves ; les désaccords sont arbitrés.
- Intégration : AgentOrchestrator, ContractNet, EvidenceEngine.
- Technologies : orchestration, scoring, traces.
- IA : critique indépendante et confrontation des résultats.
- Autonomie : 4/5.
- Difficulté : élevée.
- Priorité : P1.
- Validation : détection de défauts laissés par l'agent exécutant, sans faux consensus.

NEW-07 — Adversarial Agent

- Description : un agent chargé de chercher volontairement les failles d'un plan avant son exécution.
- Besoin : identifier les scénarios dangereux et les hypothèses fragiles.
- Fonctionnement : examine les actions, permissions, données et effets de bord prévus.
- Intégration : Safety Gate, Planner, PermissionPolicy.
- Technologies : LLM, règles déterministes, scénarios adversariaux.
- IA : analyse contradictoire et simulation d'attaques.
- Autonomie : 3/5.
- Difficulté : élevée.
- Priorité : P1.
- Validation : détection de scénarios de sécurité connus sans autoriser de contournement.

NEW-08 — Autonomous Agent Benchmark Lab

- Description : laboratoire qui compare les performances des agents sur des missions de référence.
- Besoin : savoir objectivement quel agent est le plus performant.
- Fonctionnement : lance des scénarios isolés, collecte preuves, coûts, temps et régressions.
- Intégration : AgentRuntime, TelemetryService, tests.
- Technologies : environnement sandboxé, benchmarks, rapports.
- IA : analyse comparative et recommandations.
- Autonomie : 3/5.
- Difficulté : élevée.
- Priorité : P2.
- Validation : benchmarks reproductibles et comparables entre versions.

## Développement logiciel intelligent

NEW-09 — Test Gap Intelligence

- Description : identifier les zones du projet insuffisamment testées.
- Besoin : détecter les fonctions critiques sans tests pertinents.
- Fonctionnement : croise AST, couverture, changements Git et chemins d'exécution.
- Intégration : Knowledge Graph, Vitest, node:test.
- Technologies : coverage, AST, mutation testing.
- IA : génération de scénarios de tests ciblés.
- Autonomie : 4/5.
- Difficulté : élevée.
- Priorité : P1.
- Validation : augmentation de la couverture des chemins critiques et détection de mutations.

NEW-10 — Visual Regression Intelligence

- Description : détecter les régressions visuelles de l'interface.
- Besoin : éviter les changements UI qui cassent les écrans existants.
- Fonctionnement : captures de référence, comparaison pixel et analyse visuelle.
- Intégration : React, Electron, VisionAgent, CI.
- Technologies : Playwright, screenshots, vision LLM.
- IA : classification des changements visuels et explication des écarts.
- Autonomie : 3/5.
- Difficulté : moyenne à élevée.
- Priorité : P2.
- Validation : détection d'une régression visuelle volontaire.

NEW-11 — Autonomous Dependency Guardian

- Description : surveiller la santé technique des dépendances.
- Besoin : anticiper les incompatibilités et risques de sécurité.
- Fonctionnement : analyse des versions, vulnérabilités, usages réels et compatibilités.
- Intégration : package-lock, KnowledgeGraph, sécurité.
- Technologies : npm audit, SBOM, analyse statique.
- IA : évaluation des impacts et préparation de mises à jour.
- Autonomie : 3/5.
- Difficulté : moyenne.
- Priorité : P1.
- Validation : détection d'une dépendance vulnérable et proposition d'une mise à jour testable.

NEW-12 — Technical Debt Intelligence

- Description : cartographier et quantifier la dette technique.
- Besoin : savoir quelles parties du projet méritent réellement un refactoring.
- Fonctionnement : analyse de complexité, duplication, dépendances circulaires et fréquence des modifications.
- Intégration : Knowledge Graph, CodeMap, Git.
- Technologies : AST, analyse statique, historique.
- IA : classement des dettes et estimation de leur coût.
- Autonomie : 3/5.
- Difficulté : moyenne.
- Priorité : P2.
- Validation : classement confronté à une revue technique humaine.

## Intelligence opérationnelle

NEW-13 — Mission Digital Twin

Différenciation majeure

- Description : créer une représentation simulée de l'état du projet avant une mission complexe.
- Besoin : comprendre les conséquences possibles avant de toucher au workspace.
- Fonctionnement : copie logique du graphe, des dépendances, des fichiers et des contraintes ; simulation du plan puis comparaison des états.
- Intégration : Sandbox, CheckpointManager, KnowledgeGraph, Mission System.
- Technologies : snapshot, graphe, simulation déterministe.
- IA : comparaison de plusieurs stratégies et anticipation des risques.
- Autonomie : 4/5.
- Difficulté : très élevée.
- Priorité : P2.
- Validation : simulation comparée à l'exécution réelle sur des scénarios isolés.

NEW-14 — Incident Intelligence Center

- Description : détecter, regrouper et diagnostiquer automatiquement les incidents.
- Besoin : éviter de traiter séparément des erreurs qui ont une même origine.
- Fonctionnement : corrélation des logs, erreurs, appels LLM, outils, WebSockets et services.
- Intégration : Observability, EventBus, TaskManager.
- Technologies : OpenTelemetry, événements, clustering.
- IA : diagnostic causal et proposition de résolution.
- Autonomie : 4/5.
- Difficulté : élevée.
- Priorité : P1.
- Validation : regroupement correct d'incidents artificiellement provoqués.

NEW-15 — Predictive Integration Guardian

- Description : surveiller la fiabilité des intégrations externes.
- Besoin : anticiper les interruptions de Gemini, OpenRouter, Supabase, Telegram et e-mail.
- Fonctionnement : suivi des latences, erreurs, quotas, disponibilité et changements de configuration.
- Intégration : services externes, TelemetryService, Automation.
- Technologies : sondes de santé, métriques, alertes.
- IA : détection d'anomalies et diagnostic.
- Autonomie : 3/5.
- Difficulté : moyenne.
- Priorité : P1.
- Validation : détection d'une panne simulée et notification contextualisée.

NEW-16 — Adaptive Model Portfolio

- Description : attribuer automatiquement le modèle le plus adapté à chaque sous-tâche.
- Besoin : optimiser simultanément qualité, latence et coûts.
- Fonctionnement : comparaison de modèles candidats selon difficulté, budget, qualité historique et contraintes.
- Intégration : ModelRouter, AgenticRuntime, OpenRouter.
- Technologies : benchmarks, tarification, scoring.
- IA : sélection adaptative et réévaluation.
- Autonomie : 4/5.
- Difficulté : élevée.
- Priorité : P1.
- Validation : qualité minimale maintenue avec réduction mesurée des coûts.

## Intelligence produit et expérience utilisateur

NEW-17 — Adaptive Workspace Intelligence

- Description : adapter l'espace de travail au contexte de la mission.
- Besoin : éviter une interface identique pour toutes les activités.
- Fonctionnement : réorganisation suggérée des panneaux selon le type de tâche, l'activité des agents et les besoins de supervision.
- Intégration : React, Dashboard, AgentRuntime.
- Technologies : préférences, événements, système de layout.
- IA : recommandations de disposition.
- Autonomie : 2/5, avec validation utilisateur.
- Difficulté : moyenne.
- Priorité : P2.
- Validation : dispositions pertinentes et réversibles, sans déplacement automatique imposé.

NEW-18 — Proactive Development Opportunities

- Description : découvrir les améliorations pertinentes que l'utilisateur n'a pas encore demandées.
- Besoin : transformer Leanna en assistant proactif de maintenance.
- Fonctionnement : analyse périodique des défauts, dépendances, code inutilisé, dette technique et problèmes de configuration.
- Intégration : ProjectDoctor, OpportunityEngine, Automation.
- Technologies : AST, Git, règles et LLM.
- IA : génération et classement d'opportunités contextualisées.
- Autonomie : 3/5.
- Difficulté : moyenne.
- Priorité : P1.
- Validation : suggestions pertinentes, non redondantes et justifiées par le code.

NEW-19 — Governed Playbook Intelligence

- Description : transformer les missions réussies en procédures réutilisables.
- Besoin : ne pas repartir de zéro sur des problèmes récurrents.
- Fonctionnement : extraction d'un workflow éprouvé, contrôle des préconditions, versionnement et approbation.
- Intégration : PlaybookStore, LearningEngine, WorkflowEngine.
- Technologies : workflows versionnés, mémoire, tests.
- IA : généralisation des solutions et adaptation au contexte.
- Autonomie : 4/5.
- Difficulté : élevée.
- Priorité : P2.
- Validation : reproduction d'une solution dans un autre projet compatible, sans exécution dangereuse automatique.

NEW-20 — Cross-Project Intelligence

Différenciation majeure

- Description : apprendre des architectures, solutions et expériences de plusieurs projets de travail.
- Besoin : réutiliser les connaissances sans mélanger les données confidentielles.
- Fonctionnement : bibliothèque de connaissances partageables avec classification, anonymisation et isolation stricte.
- Intégration : KnowledgeGraph, ProjectMemory, Supabase.
- Technologies : RAG multi-projets, contrôle d'accès, provenance.
- IA : recherche de solutions et transfert de connaissances.
- Autonomie : 3/5.
- Difficulté : très élevée.
- Priorité : P2.
- Validation : transfert d'une connaissance autorisée sans fuite entre espaces de travail.

# 6. Audit approfondi de l'autonomie

C'est la partie la plus importante de l'analyse.

## 6.1 Les deux moteurs ne sont pas identiques

Moteur A — Missions

`server/mission/Executor.ts`

- Objectifs et sous-objectifs.
- Planification par Planner.
- Sélection de skills.
- Exécution par SkillHandler.
- Réflexion et récupération.
- Persistance des missions.

Moteur B — Tâches agentiques

`server/runtime/agentic/AgenticRuntime.ts`

- Résolution des outils.
- Planification.
- Exécution via ToolRegistry.
- Observation.
- Vérification.
- Réparation et finalisation.

Les deux systèmes sont légitimes. Ils ne doivent pas nécessairement être fusionnés.

Leur principal problème est qu'ils ne partagent pas encore toutes les garanties de gouvernance.

## 6.2 Matrice de maturité de l'autonomie

| Capacité                        | État                        | Maturité |
| ------------------------------- | --------------------------- | -------- |
| Compréhension d'une tâche       | Implémentée                 | 4/5      |
| Planification                   | Implémentée                 | 4/5      |
| Décomposition                   | Implémentée                 | 4/5      |
| Attribution des agents          | Implémentée                 | 3/5      |
| Négociation Contract-Net        | Implémentée                 | 3/5      |
| Délégation                      | Implémentée                 | 3/5      |
| Communication inter-agents      | Implémentée                 | 3/5      |
| Exécution des outils            | Implémentée                 | 4/5      |
| Permissions                     | Implémentées                | 3/5      |
| Vérification indépendante       | Partielle selon le chemin   | 3/5      |
| Auto-correction                 | Implémentée                 | 3/5      |
| Persistance                     | Implémentée                 | 3/5      |
| Reprise après redémarrage       | Implémentée sous conditions | 3/5      |
| Supervisor universel            | Non démontré                | 2/5      |
| Exécution multi-heures live     | Non certifiée               | 1/5      |
| Autonomie complète multi-agents | Non certifiée               | 2/5      |

## 6.3 Ce que Leanna sait réellement faire

Le code de `AgenticRuntime.ts` démontre une véritable boucle agentique :

1. Résoudre les outils du rôle.
2. Construire le contexte.
3. Planifier les étapes.
4. Appeler réellement les outils.
5. Observer les résultats.
6. Vérifier les modifications.
7. Réparer ou replanifier.
8. Finaliser selon le résultat.

Ce n'est pas simplement une réponse textuelle générée par un LLM.

Le test `server/runtime/agentic/mission-harness.test.ts` comprend notamment des scénarios de réparation, d'échec de typecheck, de budget et d'idempotence avec un modèle déterministe.

C'est une fondation très intéressante.

## 6.4 Ce qui empêche encore une autonomie de niveau production

Quatre limites dominent :

1\. La gouvernance n'est pas universelle.

Le Supervisor est branché conditionnellement. Les missions et les tâches agentiques ne bénéficient pas automatiquement du même niveau de protection.

2\. Une vérification n'est pas toujours une validation globale.

Un fichier peut être correctement modifié sans que le projet entier compile ou que ses tests passent.

3\. La récupération transactionnelle reste complexe.

Les écritures locales peuvent être restaurées, mais les effets externes comme un e-mail envoyé, un appel API ou un push Git nécessitent des compensations spécifiques.

4\. La durée réelle n'est pas certifiée.

Les tests déterministes démontrent le comportement du runtime, mais ne prouvent pas la réussite de missions longues sur des modèles distants probabilistes, avec réseau instable et redémarrages réels.

Verdict

Leanna possède un véritable moteur d'agent autonome, mais l'application complète n'est pas encore démontrée comme un système autonome transactionnel et supervisé de bout en bout.

La différence est fondamentale.

# 7. Audit des paramètres et incohérences

J'ai relevé plusieurs points à traiter.

| Paramètre / système           | Observation                          | Action                                                      |
| ----------------------------- | ------------------------------------ | ----------------------------------------------------------- |
| `LEANNA_SUPERVISED`           | Supervision conditionnelle           | Définir les missions obligatoirement supervisées            |
| `LEANNA_IDEMPOTENCY`          | Activation conditionnelle            | Généraliser aux effets de bord critiques                    |
| `LEANNA_SAFETY_GATE`          | Mode configurable                    | Définir une politique de sécurité par défaut                |
| `LEANNA_PERMISSION_MODE`      | Modes enforce/audit/off              | Interdire les configurations trop permissives en production |
| `Leanna_GRANTED_PERMISSIONS`  | Peut hériter des droits par défaut   | Passer au moindre privilège                                 |
| `LEANNA_AUTO_ALLOW_DANGEROUS` | Autorisation supplémentaire possible | Conserver une approbation humaine                           |
| `LEANNA_AUTONOMY_MODE`        | suggest/ask/auto                     | Définir une source de vérité centrale                       |
| `Leanna_DRY_RUN`              | Contrôle global                      | Documenter les exceptions et overrides                      |
| `LEANNA_MISSION_EVIDENCE`     | Vérification optionnelle             | Formaliser les critères de preuve                           |
| `LEANNA_AGENT_SUPERVISED`     | Gouvernance conditionnelle           | Vérifier le câblage de chaque entrée                        |

### Point particulièrement important

La présence de `envSchema` ne signifie pas que toute la configuration est centralisée.

Le `.passthrough()` dans `server/config/env.ts` conserve volontairement les variables historiques. C'est une migration progressive, pas une centralisation terminée.

Par ailleurs, `parseEnvLenient()` peut ignorer une configuration invalide en mode embarqué. Il faut donc rendre ces situations visibles dans l'interface.

# 8. Audit de sécurité

## État des protections

| Protection             | Implémentation constatée | Réserve                                 |
| ---------------------- | ------------------------ | --------------------------------------- |
| Authentification API   | Présente                 | Configuration locale à contrôler        |
| Rate limiting          | Présent                  | Tester toutes les routes                |
| PermissionPolicy       | Présente                 | Permissions par défaut à durcir         |
| AuthorizationGate      | Présent                  | Vérifier chaque chemin                  |
| DryRun                 | Présent                  | Activité dépendante de la configuration |
| Jev Safety Gate        | Présent                  | Activation conditionnelle               |
| ExecutionLedger        | Présent                  | Idempotence conditionnelle              |
| PromptInjectionGuard   | Présent                  | Couverture RAG à renforcer              |
| Sandbox                | Présent                  | Tester les scénarios complexes          |
| Validation des secrets | Présente                 | Scanner incomplet                       |
| Isolation Electron     | Partielle                | `sandbox: false`                        |
| Journalisation         | Présente                 | Corrélation à améliorer                 |

### Les trois risques les plus importants

1. Autorisations trop larges : le mode enforce ne suffit pas si trop de permissions sont accordées par défaut.
2. Gouvernance optionnelle : il faut garantir que les actions critiques ne puissent pas contourner le niveau de supervision attendu.
3. Effets externes : le rollback des fichiers ne peut pas annuler un e-mail, une opération distante ou un déploiement.

# 9. Audit des performances

### 9.1 AgenticRuntime

Le runtime possède déjà plusieurs optimisations :

- Budget d'itérations.
- Limites d'appels d'outils.
- Cache de lectures.
- Historique de contexte borné.
- Limitation des itérations improductives.
- Compression et sélection des outils.
- Annulation des exécutions.

Il existe néanmoins des axes d'amélioration :

| Problème ou opportunité                 | Amélioration                               |
| --------------------------------------- | ------------------------------------------ |
| Répétition de contexte entre appels LLM | Cache de contexte versionné                |
| Historique volumineux                   | Compression hiérarchique                   |
| Résultats d'outils trop importants      | Résumés structurés avec références         |
| Plusieurs agents concurrents            | Budget partagé                             |
| Latence des fournisseurs                | Routage fondé sur des mesures persistantes |
| Missions longues                        | Checkpoints de contexte et reprise         |

### 9.2 ModelRouter

Le routeur adaptatif existe déjà dans `server/utils/modelRouter.ts`.

Il prend en compte :

- Coût estimé.
- Complexité.
- Échecs récents.
- Latence observée.

Mais ses statistiques de latence sont conservées en mémoire et le routage documenté ne couvre pas encore le streaming.

Il faut donc éviter de reconstruire un routeur concurrent : il faut faire évoluer celui qui existe.

### 9.3 Interface et Electron

Les principaux axes sont :

- Réduire les rendus inutiles des composants React.
- Virtualiser les listes d'agents et d'événements volumineuses.
- Limiter les animations 3D lorsqu'elles n'apportent aucune information.
- Séparer les événements fréquents des événements métier persistants.
- Mesurer les performances des fenêtres Electron indépendamment.
- Limiter les mises à jour du dashboard aux changements réellement significatifs.

# 10. Audit des tests et de la qualité

Infrastructure de tests recensée

# 203

Fichiers de tests serveur

# 23

Fichiers de tests UI

Commandes disponibles

```
npm run typecheck
npm run typecheck:test
npm test
npm run test:ui
npm run test:soak
npm run brain:smoke
npm run test:missions
npm run audit:deps
npm run lint:eslint
```

### 10.1 Analyse de la CI

Le workflow `.github/workflows/ci.yml` exécute actuellement :

- Installation des dépendances.
- TypeScript.
- Tests serveur.
- Tests UI.
- Build.
- Vérification des secrets du bundle.
- ESLint non bloquant.

Un commentaire du workflow mentionne 181 erreurs ESLint existantes dans la photographie documentée.

Point à corriger

La CI accepte actuellement un échec ESLint avec `continue-on-error: true`.

Il faut corriger progressivement les erreurs, puis rendre cette vérification bloquante.

### 10.2 Tests indispensables à ajouter ou renforcer

| Test                                     | Importance |
| ---------------------------------------- | ---------- |
| Mission interrompue pendant une écriture | Critique   |
| Redémarrage avec checkpoint ouvert       | Critique   |
| Double exécution d'une action externe    | Critique   |
| Timeout avec runner non coopératif       | Critique   |
| Agent sans permission suffisante         | Critique   |
| Injection de prompt via RAG              | Critique   |
| Deux missions simultanées                | Critique   |
| Défaillance OpenRouter puis fallback     | Haute      |
| Reprise d'une mission multi-fichiers     | Haute      |
| Régression UI après modification         | Haute      |
| Charge prolongée de 20 agents            | Haute      |
| Réseau indisponible pendant une mission  | Haute      |

### 10.3 Limite de validation

Je n'ai pas exécuté `npm run typecheck`, `npm test` ou `npm run test:ui`.

Le dépôt GitHub permet de consulter les scripts et les tests, mais pas de prétendre que les commandes ont été exécutées sur ton environnement local.

# 11. Classement stratégique

## Les 5 corrections les plus urgentes

P0

1\. IMP-01 — Permissions par défaut restrictives

P0

2\. IMP-06 — Fiabilité des checkpoints dynamiques

P0

3\. IMP-08 — Une seule autorité de récupération

P0

4\. IMP-09 — Vérification complète des projets

P0

5\. IMP-16 — Durcissement Electron

Les IMP-02, IMP-03, IMP-04, IMP-05, IMP-07 et IMP-13 doivent également être traitées avant de considérer la gouvernance comme prête pour la production.

## Les 5 meilleurs rapports bénéfice/coût

| Amélioration                                | Bénéfice   | Coût  |
| ------------------------------------------- | ---------- | ----- |
| IMP-12 : métriques ModelRouter persistantes | Élevé      | Moyen |
| IMP-14 : centralisation des variables       | Élevé      | Moyen |
| IMP-15 : diagnostic des configurations      | Élevé      | Moyen |
| IMP-18 : ESLint bloquant progressivement    | Élevé      | Moyen |
| IMP-20 : corrélation des traces             | Très élevé | Élevé |

## Les 5 nouvelles fonctionnalités IA les plus prometteuses

1. NEW-01 — Project Intelligence Radar.
2. NEW-03 — Change Impact Predictor.
3. NEW-06 — Multi-Agent Independent Review.
4. NEW-13 — Mission Digital Twin.
5. NEW-14 — Incident Intelligence Center.

## Les 5 fonctionnalités les plus différenciantes

[Digital Twins and M2M: Creating Virtual Replicas of Physical Assets | M2MConference.com](https://images.openai.com/static-rsc-4/2FIfCStxTyYH9O8jjYSnOLz8A1PmXHrM2JYvfzDGPfCSiCCaidfo-iBTog-IEwCqsZMt2b206M3uAUMlFvAwrmjXD6xso8As5MsxGR-iPi0XLmN1aY7kt1P8hKcbsjmuXGywLbIrdV5SgC253LGBEQ3-aDccBXYT0V0b9UNl-As?purpose=inline)

NEW-13 — Mission Digital Twin

Simuler les conséquences d'une mission avant de toucher au projet.

Très différenciant

[Multiagent AI Orchestration: Enterprise Guide](https://images.openai.com/static-rsc-4/WaIVy4n4lAYodPzu2cYmcJU4uFPTvLsNL_gAq8-h-999N88t2y99a8TLna4kCCgbjtyVOlNHYiouqr0_51b03l4KhGajBKyx1xt519v_yL7AtF6_d6J0DeBYJiNY_2DpOzJOwU-6ogSgrkmkJObhjvMFO_BPELP0NkhfHk1rvjY?purpose=inline)

NEW-06 — Multi-Agent Independent Review

Plusieurs agents confrontent indépendamment leurs résultats.

Très différenciant

[From AI Chaos to Control: My Deep Dive into Opik for LLM Observability | by Md Zahid Hussain | Medium](https://images.openai.com/static-rsc-4/zbUvjj3Yu36kC45y45rYcm6pm22KMkg0NjDhKQkMWFcTHBWjV8DCZFK3yVY4fKtADqy126ffO9nihdR9pDL1sjNAyySqGE0p0Ioe_dw4CkPb8yQyNjMnr4ZgdkV3nd3S41oR0lbMbU0zi_PpIicnI1IglnVJk6EVU1lHk2IxeGQ?purpose=inline)

NEW-14 — Incident Intelligence Center

Leanna détecte et diagnostique ses propres incidents.

Très différenciant

[Graphify: Bringing Knowledge Graphs to AI-Assisted Engineering](https://images.openai.com/static-rsc-4/YHVKUXHqRkm4eWS9Cs_LDE9nehvpkdBYCEGdbCV3TwLlzABH4qOgeIe2w7IruMxn6ZQZp-xCdXrTcbnRmp7-M8ERAimiemPf6cmzybDUbHvIxhBkhDn8lYMKCgi_1JVBi6zFUETLQF5NC275ZtgAjwpQR3qyOoH1MLDY7yJvcT8?purpose=inline)

NEW-01 — Project Intelligence Radar

Une intelligence permanente dédiée à la santé du code.

Très différenciant

[Agor: A Multiplayer-ready, Spatial Layer for Agentic Coding – agor](https://images.openai.com/static-rsc-4/qcVf05cupgkVE4QLoo122MO2s4B3sUOhnj5grhoA-ItIpHKtCtIUanlYZMAoWvX5jmic4WG2J-5439yaYfr5yoqazH8RQRLC6GuEd7yQYLKnMHxIDxLWUvovzqcvNy3rrB7_KZSv7lysw4xAoMBmbBk5N1mIBjQAL3Tkd_nYwwI?purpose=inline)

NEW-20 — Cross-Project Intelligence

Réutilisation contrôlée des connaissances entre projets.

Très différenciant

## Les 5 risques techniques à traiter avant d'ajouter des fonctionnalités

1. Gouvernance non uniforme des actions autonomes.
2. Rollback incomplet ou ambigu sur certaines mutations.
3. Concurrence globale insuffisamment coordonnée.
4. Validation de mission qui ne garantit pas systématiquement la qualité globale du projet.
5. Absence de certification de missions longues en environnement réel.

# 12. Roadmap de développement recommandée

Je recommande une progression en cinq étapes, avec des portes de validation obligatoires.

Étape 1 — Stabilisation

Priorité maximale

# Socle fiable

Objectif : sécuriser les capacités existantes.

- IMP-01 à IMP-10.
- Revoir les permissions, Jev et idempotence.
- Corriger la propagation des checkpoints.
- Unifier les contrats de récupération.
- Formaliser les niveaux de vérification.
- Ajouter les tests de reprise et de concurrence.

Réussite : aucune action critique sans contrôle, aucune reprise ambiguë exécutée automatiquement.

Étape 2 — Optimisation

# Performance et qualité

Objectif : améliorer la stabilité et la productivité.

- IMP-11, IMP-12, IMP-14, IMP-15.
- Réduction du contexte LLM.
- Mesures persistantes du ModelRouter.
- Harmonisation des configurations.
- IMP-18 à IMP-20.
- Durcissement Electron et CI.

Réussite : performances mesurées, erreurs de qualité réduites et diagnostic reproductible.

Étape 3 — Intelligence

# Leanna comprend mieux ses projets

Objectif : transformer les données existantes en intelligence exploitable.

- NEW-01 Project Intelligence Radar.
- NEW-02 Mémoire décisionnelle.
- NEW-03 Change Impact Predictor.
- NEW-04 Context Compiler.
- NEW-09 Test Gap Intelligence.
- NEW-11 Dependency Guardian.
- NEW-12 Technical Debt Intelligence.

Réussite : détection anticipée des problèmes et recommandations prouvées par le code.

Étape 4 — Autonomie avancée

# Collaboration et récupération

Objectif : rendre les missions plus autonomes et vérifiables.

- NEW-05 Agent Reputation.
- NEW-06 Multi-Agent Independent Review.
- NEW-07 Adversarial Agent.
- NEW-08 Benchmark Lab.
- NEW-13 Mission Digital Twin.
- NEW-14 Incident Intelligence.
- NEW-15 Integration Guardian.
- NEW-19 Governed Playbooks.

Réussite : les agents collaborent, se contrôlent et récupèrent dans un cadre gouverné.

Étape 5 — Excellence produit

# Un véritable AI Operating System

Objectif : différenciation et expérience professionnelle.

- NEW-10 Visual Regression Intelligence.
- NEW-16 Adaptive Model Portfolio.
- NEW-17 Adaptive Workspace.
- NEW-18 Proactive Development Opportunities.
- NEW-20 Cross-Project Intelligence.
- Optimisation de l'expérience dashboard.
- Benchmarks de production et certification.

Réussite : Leanna anticipe, assiste, agit et justifie ses décisions avec une expérience cohérente.

## 12.1 Ordre d'implémentation conseillé

Il ne faut pas lancer les 40 chantiers simultanément.

Je recommande cet ordre :

| Rang | Chantier                       | Dépendance |
| ---- | ------------------------------ | ---------- |
| 1    | Sécurité et permissions        | Aucune     |
| 2    | Checkpoints et récupération    | 1          |
| 3    | Vérification complète          | 2          |
| 4    | Contrats communs mission/agent | 2 et 3     |
| 5    | Concurrence globale            | 4          |
| 6    | Observabilité unifiée          | 1 à 5      |
| 7    | Project Intelligence Radar     | 6          |
| 8    | Change Impact Predictor        | 7          |
| 9    | Multi-Agent Review             | 4 à 6      |
| 10   | Mission Digital Twin           | 2, 3 et 7  |

# 13. Conclusion stratégique

# Leanna a un potentiel important.

Mais sa prochaine évolution ne doit pas être l'ajout massif de nouvelles fonctionnalités.

Le véritable enjeu est de transformer son architecture actuelle en un système cohérent, mesurable et fiable.

# 20

Améliorations et corrections identifiées

# 20

Nouvelles fonctionnalités IA proposées

### Mon diagnostic final

Je considère que Leanna a déjà franchi plusieurs étapes importantes :

- Elle possède un véritable runtime agentique.
- Elle dispose d'une architecture multi-agents.
- Elle peut planifier et exécuter des missions.
- Elle possède des mécanismes de vérification et de récupération.
- Elle possède une mémoire et une infrastructure de connaissances.
- Elle dispose de mécanismes de sécurité avancés.

Mais il reste un écart entre la richesse des composants disponibles et les garanties offertes par leur assemblage.

Ma recommandation principale : consacrer la prochaine grande phase de développement à la fiabilisation du cycle complet d'une mission.

Le cycle cible devrait être :

01

Comprendre

Analyser la demande et le contexte.

02

Planifier

Construire un plan et évaluer les risques.

03

Négocier

Sélectionner les agents et leurs responsabilités.

04

Autoriser

Vérifier permissions et gouvernance.

05

Exécuter

Agir dans un environnement contrôlé.

06

Observer

Collecter les résultats et les événements.

07

Vérifier

Contrôler les résultats avec des preuves indépendantes.

08

Récupérer

Réparer, recommencer ou escalader.

09

Finaliser

Commit, persistance et compte rendu.

10

Apprendre

Conserver les leçons et améliorer les prochaines missions.

Terminé

C'est cette cohérence qui fera la différence entre un ensemble d'agents IA et un véritable environnement autonome de niveau professionnel.

### Références techniques à conserver

Les documents et sources les plus importants pour la suite :

- [Architecture générale](https://github.com/moonback/Leanna-IDE/blob/main/ARCHITECTURE.md?utm_source=chatgpt.com)
- [Contrat d'autonomie](https://github.com/moonback/Leanna-IDE/blob/main/docs/AUTONOMY_CONTRACT.md?utm_source=chatgpt.com)
- [Cartographie du runtime autonome](https://github.com/moonback/Leanna-IDE/blob/main/docs/AUTONOMY_RUNTIME_MAP.md?utm_source=chatgpt.com)
- [Audit des performances agents](https://github.com/moonback/Leanna-IDE/blob/main/docs/AUDIT_AGENTS_PERFORMANCE_2026-11-06.md?utm_source=chatgpt.com)
- [Audit de récupération des missions](https://github.com/moonback/Leanna-IDE/blob/main/docs/AUDIT_MISSION_RECOVERY_2026-11-06.md?utm_source=chatgpt.com)
- [Plan d'industrialisation P0](https://github.com/moonback/Leanna-IDE/blob/main/docs/P0_ARCHITECTURE_PLAN.md?utm_source=chatgpt.com)

État de la mission

Analyse statique ciblée du dépôt `main`

Effectuée

40 propositions structurées

Effectuées

Exécution des tests locaux

Non effectuée

Vérification live des intégrations

Non effectuée

Modification du code GitHub

Aucune

La prochaine étape que je recommande : transformer les cinq corrections P0 les plus urgentes en un plan d'implémentation précis pour Claude Code, avec dépendances, fichiers concernés, tests d'acceptation et ordre d'exécution, avant d'ajouter les nouvelles fonctionnalités.

Souhaites-tu également que je surveille chaque semaine les évolutions du dépôt pour détecter les régressions architecturales, de sécurité et de qualité ?

🔍Surveiller les audits de Leanna chaque semaineAppuyez pour configurer