# Rapport technique — Jarvis-OS

> **Périmètre et limites documentaires**  
> Ce rapport s’appuie exclusivement sur les éléments fournis dans la source « Codebase — sandbox », principalement la description générale de l’architecture et les fichiers `.env` et `.env.example`.  
> Les détails internes des fichiers TypeScript, le schéma exact de la base de données, les routes HTTP, les contrats d’API, les mécanismes d’authentification détaillés, les tests et les métriques d’exploitation ne sont pas présents dans les sources. Ils sont donc explicitement signalés comme **[Information non disponible dans les sources]** lorsqu’ils sont nécessaires à l’analyse.

---

## 1. 📋 Résumé technique

### 1.1 Objectif du document

Jarvis-OS est présenté comme une application d’assistant IA **auto-référentielle**, c’est-à-dire capable de travailler sur son propre code source et de s’appuyer sur des mécanismes d’analyse, de navigation, de gestion documentaire, de connaissances et d’automatisation.

Le présent rapport vise à :

- formaliser l’architecture technique décrite dans les sources ;
- identifier les composants fonctionnels et leurs responsabilités ;
- documenter les fournisseurs et intégrations externes configurés ;
- expliciter les principaux choix techniques visibles ;
- mettre en évidence les limites et les risques ;
- proposer un plan d’implémentation et de sécurisation cohérent avec les éléments disponibles ;
- distinguer les faits établis des informations manquantes.

### 1.2 Décisions techniques clés

Les décisions ou orientations techniques identifiables sont les suivantes :

| Domaine | Décision ou orientation observée |
|---|---|
| Langage backend | Backend riche en agents, missions, runtime, connaissances, notebooks, compétences et workflows, décrit comme TypeScript |
| Orchestration | Coexistence de deux systèmes : `server/mission` pour la cognition et les objectifs ; `server/runtime` pour l’infrastructure et l’exécution |
| Évolution d’architecture | Une cible d’unification des deux systèmes d’orchestration est documentée |
| IA générative | Utilisation configurée de Gemini, OpenRouter et potentiellement EdenAI |
| Persistance | Utilisation de Supabase, avec URL, clé publique frontend et clé de service backend |
| Communication terminal | Port backend configuré à `4000`, utilisé par le terminal WebSocket côté client |
| Auto-réparation | Présence d’un mode `SELF_HEAL_READONLY`, indiquant une capacité d’auto-réparation en lecture seule |
| Sécurité d’exécution | Présence d’un mode sandbox et d’un code de sortie du sandbox |
| Configuration | Paramétrage par variables d’environnement |
| Auto-référentialité | Le projet est décrit comme un IDE auto-référentiel ne gérant que son propre code source |

### 1.3 Stack et architecture retenues

La stack identifiable comprend :

- **Backend :** TypeScript ;
- **Frontend :** présence de variables préfixées `VITE_`, indiquant un environnement frontend compatible avec Vite ;
- **Base de données et services backend :** Supabase ;
- **Modèles IA :**
  - Gemini ;
  - OpenRouter ;
  - EdenAI ;
- **Terminal distant ou intégré :** communication WebSocket côté client vers le backend ;
- **Hébergement :** une URL d’application injectée à l’exécution, avec mention d’AI Studio et de Cloud Run dans les commentaires de configuration ;
- **Contrôle de version et intégration code :** présence d’un token GitHub ;
- **Système d’exploitation cible apparent :** chemin de workspace Windows dans la configuration fournie.

L’architecture est donc celle d’un assistant IA modulaire, organisé autour d’un backend TypeScript et de plusieurs sous-systèmes d’orchestration et de capacités spécialisées.

### 1.4 Point critique immédiat

Le fichier `.env` fourni contient de nombreuses informations d’authentification en clair : clés de fournisseurs IA, clé de service Supabase, clé GitHub, tokens applicatifs et code de sortie du sandbox.

Il s’agit d’un **risque critique**. Les actions prioritaires sont :

1. révoquer immédiatement tous les secrets exposés ;
2. générer de nouveaux secrets ;
3. vérifier les journaux d’utilisation des fournisseurs concernés ;
4. supprimer les secrets de l’historique du dépôt s’ils y ont été commités ;
5. remplacer les valeurs par des références à un gestionnaire de secrets ;
6. vérifier que les variables publiques `VITE_*` ne donnent pas accès à des opérations privilégiées.

Les valeurs elles-mêmes ne sont pas reproduites dans ce rapport.

---

## 2. 🏗️ Architecture

### 2.1 Architecture globale

La source décrit une architecture organisée autour d’un backend TypeScript, d’un frontend et de plusieurs services spécialisés.

```text
                         ┌──────────────────────────┐
                         │       Interface Web       │
                         │   Frontend compatible Vite│
                         └────────────┬─────────────┘
                                      │
                                      │ HTTP / WebSocket
                                      │
                         ┌────────────▼─────────────┐
                         │      Backend TypeScript   │
                         │       Port configuré: 4000│
                         └───────┬─────────┬─────────┘
                                 │         │
                ┌────────────────┘         └────────────────┐
                │                                           │
    ┌───────────▼───────────┐                   ┌───────────▼───────────┐
    │   Orchestration        │                   │    Orchestration       │
    │   server/mission       │                   │    server/runtime      │
    │ Cognition, objectifs   │                   │ Infrastructure,        │
    │ et missions            │                   │ exécution               │
    └───────────┬───────────┘                   └───────────┬───────────┘
                │                                           │
                └────────────────┬──────────────────────────┘
                                 │
                    Cible documentée : unification
                                 │
        ┌────────────────────────▼────────────────────────┐
        │ Capacités spécialisées                           │
        │ Agents, connaissances, notebooks, compétences,  │
        │ workflows, navigation web, documents, analyse   │
        │ de code, autonomie et auto-réparation            │
        └───────────────┬──────────────────┬──────────────┘
                        │                  │
             ┌──────────▼─────────┐ ┌────▼────────────────┐
             │ Fournisseurs IA     │ │ Persistance et      │
             │ Gemini, OpenRouter, │ │ services Supabase   │
             │ EdenAI              │ │                    │
             └────────────────────┘ └─────────────────────┘
```

Ce schéma est une représentation fonctionnelle fondée sur la description fournie. Le découpage exact des modules, les protocoles complets et les routes d’accès ne sont pas documentés dans les sources.

### 2.2 Composants principaux et responsabilités

#### Backend TypeScript

Le backend constitue le cœur d’exécution de Jarvis-OS. Il porte notamment :

- l’orchestration des missions ;
- l’exécution technique et opérationnelle ;
- la gestion des agents ;
- les workflows ;
- la gestion des connaissances ;
- les notebooks ;
- les compétences ;
- les mécanismes d’analyse du code ;
- les capacités d’autonomie et d’auto-réparation ;
- l’interface avec le terminal via WebSocket.

La granularité exacte des modules et les responsabilités précises de chaque fichier sont **[Information non disponible dans les sources]**.

#### `server/mission`

Ce sous-système est orienté :

- cognition ;
- objectifs ;
- missions ;
- planification ou suivi de tâches, selon la description générale.

Il semble représenter la dimension intentionnelle de l’assistant : ce que Jarvis-OS cherche à accomplir et pourquoi.

#### `server/runtime`

Ce sous-système est orienté :

- infrastructure ;
- exécution ;
- gestion opérationnelle des actions.

Il semble représenter la dimension opérationnelle : comment une action est exécutée dans l’environnement.

La coexistence de ces deux systèmes permet de séparer les décisions liées aux objectifs des mécanismes d’exécution. Toutefois, elle crée également un risque de duplication de responsabilités, de divergence de modèles et de coordination complexe. La source indique explicitement qu’une **unification est ciblée**.

#### Agents, compétences et workflows

La description indique la présence de nombreux agents, compétences et workflows. Ces composants peuvent être compris comme des unités de capacité spécialisées :

- les **agents** portent vraisemblablement des comportements ou rôles d’assistance ;
- les **compétences** encapsulent des capacités réutilisables ;
- les **workflows** structurent des séquences d’actions.

Les contrats précis entre ces éléments ne sont pas fournis : **[Information non disponible dans les sources]**.

#### Gestion des connaissances et notebooks

Le projet intègre des mécanismes liés :

- aux connaissances ;
- aux notebooks ;
- à la gestion documentaire ;
- à l’analyse de code.

Ces fonctionnalités concourent à un assistant capable d’exploiter des informations persistantes et de travailler sur un corpus de documents ou de code. Le format des notebooks, le moteur d’indexation, le modèle de recherche et la stratégie de stockage ne sont pas précisés.

#### Navigation web et analyse de code

La source mentionne des capacités de :

- navigation web ;
- analyse de code ;
- gestion documentaire.

Ces capacités impliquent potentiellement des accès à des données externes ou à des fichiers locaux. Les politiques de contrôle d’accès, d’isolation, de filtrage des contenus et de limitation des actions ne sont pas détaillées.

### 2.3 Flux de données

Le flux fonctionnel déductible est le suivant :

1. L’utilisateur interagit avec l’interface web.
2. La requête est transmise au backend TypeScript.
3. Le backend l’oriente vers le système `server/mission` lorsqu’elle relève d’un objectif ou d’une mission.
4. Le système runtime prend en charge les opérations d’infrastructure et d’exécution.
5. Les agents, compétences ou workflows nécessaires sont mobilisés.
6. Le backend peut solliciter un ou plusieurs fournisseurs IA configurés.
7. Les connaissances, notebooks, documents ou éléments d’analyse de code peuvent être consultés.
8. Le résultat est renvoyé à l’utilisateur, éventuellement via le terminal WebSocket.

Ce flux est une synthèse architecturale. Les règles de routage, la sélection du modèle IA, la gestion des erreurs et la persistance des conversations sont **[Information non disponible dans les sources]**.

### 2.4 Intégrations externes

| Intégration | Usage indiqué ou déductible des sources | Niveau de précision disponible |
|---|---|---|
| Gemini | Appels aux modèles de langage Gemini | Variable d’environnement et commentaire explicite |
| OpenRouter | Analyse de code et accès à différents modèles | Configuration explicite, modèle `openrouter/free` |
| EdenAI | Clé API présente dans la configuration | Usage fonctionnel non précisé |
| Supabase | Base de données ou services backend | URL et clé de service configurées |
| GitHub | Accès via un token GitHub | Usage exact non précisé |
| AI Studio / Cloud Run | Injection runtime de secrets et URL d’hébergement | Mention dans les commentaires de configuration |
| Terminal WebSocket | Communication entre le client et le backend | Port configuré à `4000` |
| Workspace local | Chemin de travail par défaut | Chemin Windows présent dans `.env`, mais incompatibilité avec la contrainte d’auto-référentialité à clarifier |

---

## 3. ⚙️ Choix techniques

### 3.1 Technologies retenues et justification

#### TypeScript pour le backend

Le backend est décrit comme étant en TypeScript. Ce choix est cohérent avec :

- une application composée de nombreux modules ;
- des agents et workflows nécessitant des contrats d’interface ;
- des intégrations avec des APIs externes ;
- une interaction étroite avec un frontend web ;
- l’utilisation de WebSocket et de services asynchrones.

La configuration de compilation, la version TypeScript et le framework serveur ne sont pas indiqués.

#### Séparation mission/runtime

La séparation entre `server/mission` et `server/runtime` constitue un choix structurant :

- `mission` traite les objectifs et la cognition ;
- `runtime` traite l’infrastructure et l’exécution.

Cette séparation permet de distinguer les décisions de haut niveau des opérations concrètes. Elle est particulièrement pertinente dans un assistant autonome, où l’intention, la planification et l’exécution ne doivent pas nécessairement être confondues.

La source indique cependant que cette séparation doit évoluer vers une unification. Cela suggère que l’architecture actuelle est considérée comme transitoire ou qu’elle présente des problèmes d’intégration.

#### Multiples fournisseurs IA

La présence de Gemini, OpenRouter et EdenAI révèle une stratégie multi-fournisseurs. Les bénéfices potentiels sont :

- capacité de choisir différents modèles ;
- réduction de la dépendance à un seul fournisseur ;
- possibilité d’utiliser OpenRouter pour l’analyse de code ;
- adaptation du coût, de la disponibilité ou des capacités selon la tâche.

En contrepartie, cette stratégie complexifie :

- la gestion des clés ;
- la normalisation des réponses ;
- la surveillance des coûts ;
- la gestion des erreurs ;
- la conformité et la confidentialité des données envoyées.

Les règles précises de sélection entre fournisseurs ne sont pas documentées.

#### Supabase

Supabase est utilisé avec :

- une URL de projet ;
- une clé de service destinée au backend ;
- une URL et une clé anonyme exposées via des variables `VITE_*` pour le frontend.

Ce choix fournit vraisemblablement une base commune entre frontend et backend. Toutefois, le schéma de données et les règles de sécurité Supabase ne sont pas présents.

### 3.2 Alternatives évaluées et raisons du rejet

Les sources ne documentent pas d’alternatives explicitement évaluées ni de décisions formelles de rejet.

| Alternative | Statut |
|---|---|
| Autre langage backend que TypeScript | [Information non disponible dans les sources] |
| Autre solution de persistance que Supabase | [Information non disponible dans les sources] |
| Fournisseur IA unique | [Information non disponible dans les sources] |
| Architecture d’orchestration unique dès l’origine | [Information non disponible dans les sources] |
| Autre protocole que WebSocket pour le terminal | [Information non disponible dans les sources] |

Il est donc impossible d’attribuer un rejet factuel à une technologie donnée.

### 3.3 Trade-offs acceptés

Les trade-offs suivants sont identifiables ou directement induits par l’architecture décrite :

#### Flexibilité contre complexité

La multiplication des agents, compétences, workflows et fournisseurs augmente la flexibilité fonctionnelle, mais rend le système plus difficile à comprendre, tester et monitorer.

#### Séparation des responsabilités contre duplication

La séparation mission/runtime clarifie théoriquement les responsabilités. Elle peut toutefois entraîner des duplications de logique et des divergences de modèle, ce qui explique probablement la cible d’unification documentée.

#### Autonomie contre contrôle

Les capacités d’autonomie, d’auto-réparation, de navigation web et d’exécution augmentent la valeur fonctionnelle de l’assistant. Elles augmentent aussi les risques liés :

- aux actions non prévues ;
- à l’accès aux fichiers ;
- à l’exécution de commandes ;
- à l’utilisation de tokens ;
- à la propagation d’erreurs produites par un modèle.

Le paramètre `SELF_HEAL_READONLY=true` montre qu’un compromis a été prévu : conserver une capacité d’auto-réparation avec une restriction en lecture seule.

#### Sécurité contre ergonomie

La présence d’un sandbox et d’un code de sortie à six chiffres suggère un mécanisme de protection opérationnelle. Cependant, la valeur du code est stockée dans le fichier `.env`, ce qui réduit fortement la sécurité si ce fichier est exposé.

---

## 4. 📐 Spécifications

### 4.1 Modèle de données

La source permet uniquement d’identifier les domaines fonctionnels suivants :

- agents ;
- missions ;
- runtime ;
- connaissances ;
- notebooks ;
- compétences ;
- workflows ;
- documents ;
- analyses de code.

Un modèle conceptuel minimal peut être représenté ainsi :

```text
Mission
  ├── Objectifs
  ├── Agents / compétences mobilisés
  ├── Workflows exécutés
  └── Résultats / connaissances produites

Runtime
  ├── Actions d’exécution
  ├── Terminal
  ├── Workspace
  └── État d’exécution

Connaissances
  ├── Documents
  ├── Notebooks
  └── Résultats d’analyse de code
```

Ce schéma est uniquement conceptuel. Les tables, colonnes, relations, index, contraintes d’intégrité et politiques RLS Supabase sont :

> **[Information non disponible dans les sources]**

### 4.2 APIs et interfaces

Les interfaces suivantes sont identifiables :

- interface frontend/backend ;
- terminal WebSocket côté client ;
- APIs des fournisseurs IA ;
- connexion Supabase ;
- accès GitHub ;
- URL applicative utilisée pour les liens auto-référentiels, callbacks OAuth et endpoints.

La variable `APP_URL` est explicitement décrite comme utilisée pour :

- les liens auto-référentiels ;
- les callbacks OAuth ;
- les endpoints API.

Les éléments suivants ne sont pas fournis :

- routes HTTP ;
- méthodes et schémas JSON ;
- événements WebSocket ;
- mécanisme de versionnement d’API ;
- authentification et autorisation par endpoint ;
- politique de retry ;
- limites de taille des requêtes.

Ils sont donc **[Information non disponible dans les sources]**.

### 4.3 Contraintes de performance

La seule contrainte chiffrée visible est le port backend `4000`. Aucun objectif de performance explicite n’est fourni.

Sont notamment absents :

- temps de réponse cible ;
- nombre maximal d’utilisateurs simultanés ;
- débit de messages WebSocket ;
- durée maximale d’une mission ;
- limites de taille des documents ;
- budget de tokens IA ;
- objectifs de disponibilité ;
- capacité de stockage ;
- temps maximal de démarrage.

> **[Information non disponible dans les sources]**

Compte tenu de la nature agentique et des appels IA externes, les futures spécifications devront distinguer au minimum :

- latence de l’orchestrateur ;
- latence des fournisseurs IA ;
- durée totale des missions ;
- temps de réponse du terminal ;
- taux d’échec par intégration ;
- consommation de tokens et coûts associés.

### 4.4 Exigences de sécurité

Les sources révèlent un état de sécurité préoccupant.

#### Secrets exposés

Le fichier `.env` contient en clair des secrets associés à :

- Gemini ;
- EdenAI ;
- Supabase ;
- OpenRouter ;
- GitHub ;
- l’API Jarvis-OS ;
- l’interface frontend ;
- la sortie du sandbox.

La compromission potentielle concerne donc à la fois des services externes, la base de données, le contrôle de version et les fonctions internes de l’application.

#### Mesures obligatoires

| Priorité | Action |
|---|---|
| Critique | Révoquer et renouveler toutes les clés exposées |
| Critique | Contrôler les journaux des fournisseurs |
| Critique | Retirer les secrets de l’historique Git si nécessaire |
| Haute | Stocker les secrets dans un gestionnaire dédié |
| Haute | Vérifier la séparation stricte entre clés frontend et backend |
| Haute | Ne jamais exposer la clé Supabase de service au frontend |
| Haute | Remplacer les tokens statiques faibles par des mécanismes robustes |
| Haute | Protéger le mode sandbox et son mécanisme de sortie |
| Moyenne | Auditer les permissions GitHub et Supabase |
| Moyenne | Ajouter une détection automatisée de secrets |

#### Incohérences de configuration

Le fichier `.env` présente également :

- des blocs dupliqués ;
- des lignes semblant tronquées ou mal formées ;
- une valeur `NODE_ENV === 'test'` qui ne correspond pas à une affectation standard de variable d’environnement ;
- un token applicatif simple partagé entre backend et frontend ;
- un code sandbox statique.

Ces éléments doivent faire l’objet d’un nettoyage et d’une validation avant déploiement.

#### Auto-réparation et chaîne de pensée

Le paramètre `SELF_HEAL_READONLY=true` indique une restriction d’auto-réparation en lecture seule, mesure favorable pour limiter les modifications autonomes.

Le paramètre `ENABLE_CHAIN_OF_THOUGHT=false` désactive l’affichage de la chaîne de pensée. Cette configuration réduit le risque d’exposer des raisonnements internes ou des informations sensibles dans l’interface. Le comportement interne exact de cette option n’est pas documenté.

---

## 5. 🚀 Plan d’implémentation

### 5.1 Phase 0 — Remédiation de sécurité

Cette phase est prioritaire et doit précéder toute nouvelle mise en production.

Actions :

1. révoquer tous les secrets présents dans `.env` ;
2. générer de nouvelles clés par fournisseur ;
3. contrôler les accès Supabase et GitHub ;
4. vérifier l’historique du dépôt ;
5. créer une configuration locale nettoyée ;
6. interdire le commit de fichiers `.env` ;
7. mettre en place une gestion sécurisée des secrets ;
8. vérifier la séparation frontend/backend ;
9. remplacer le code sandbox statique ;
10. auditer les accès du terminal et du workspace.

**Critère de sortie :** aucun secret actif connu ne doit rester exposé dans les sources ou l’historique accessible.

### 5.2 Phase 1 — Cartographie du codebase

La source indique un export de 219 fichiers et environ 1 953 Ko de texte. Une cartographie détaillée doit être réalisée afin de :

- identifier les points d’entrée ;
- localiser les modules `server/mission` et `server/runtime` ;
- recenser les agents et workflows ;
- identifier les appels aux fournisseurs IA ;
- repérer les accès Supabase ;
- documenter les interfaces WebSocket ;
- inventorier les opérations sur le workspace ;
- distinguer les chemins de lecture et d’écriture.

Le résultat attendu est une matrice composants / responsabilités / dépendances.

### 5.3 Phase 2 — Stabilisation de l’orchestration

Objectifs :

- clarifier les frontières entre mission et runtime ;
- définir un modèle commun d’état ;
- documenter le cycle de vie d’une mission ;
- formaliser les transitions vers l’exécution ;
- éviter les duplications de logique ;
- préparer l’unification annoncée.

Les interfaces de coordination doivent être documentées avant toute fusion physique des modules.

### 5.4 Phase 3 — Normalisation des intégrations IA

Cette phase doit :

- centraliser les appels aux fournisseurs ;
- uniformiser les formats de requête et de réponse ;
- traiter les erreurs et indisponibilités ;
- définir les règles de sélection entre Gemini, OpenRouter et EdenAI ;
- tracer le fournisseur et le modèle utilisés ;
- contrôler les données transmises à des services externes.

La stratégie de fallback n’est pas fournie dans les sources et doit donc être spécifiée.

### 5.5 Phase 4 — Validation des capacités d’exécution

Les fonctions suivantes doivent être testées dans un sandbox contrôlé :

- terminal WebSocket ;
- workspace par défaut ;
- navigation web ;
- gestion documentaire ;
- analyse de code ;
- auto-réparation ;
- mécanisme de sortie du sandbox.

Les tests doivent couvrir les erreurs, les permissions, les chemins invalides et les tentatives d’accès hors périmètre.

### 5.6 Phase 5 — Observabilité et exploitation

Mettre en place :

- logs structurés ;
- corrélation par identifiant de mission ;
- mesure de la latence IA ;
- suivi des erreurs par fournisseur ;
- suivi des actions du runtime ;
- alertes de sécurité ;
- suivi des modifications autonomes ;
- détection d’accès anormaux au workspace.

### 5.7 Dépendances techniques

| Dépendance | Impact |
|---|---|
| Fournisseurs IA | Fonctionnement des agents et de l’analyse de code |
| Supabase | Persistance ou services backend |
| Configuration `APP_URL` | Liens, callbacks OAuth et endpoints |
| WebSocket sur port 4000 | Fonctionnement du terminal côté client |
| GitHub token | Fonctionnalités liées au code ou au dépôt |
| Workspace | Exécution et auto-référentialité |
| Secrets runtime | Accès à toutes les intégrations |

### 5.8 Risques techniques et mesures de mitigation

| Risque | Niveau | Mitigation |
|---|---:|---|
| Secrets compromis | Critique | Révocation, rotation, audit et gestionnaire de secrets |
| Clé Supabase de service exposée | Critique | Retrait du frontend, rotation et audit des permissions |
| Exécution autonome dangereuse | Élevé | Sandbox, mode lecture seule, permissions minimales et validations |
| Divergence mission/runtime | Élevé | Contrat commun et plan d’unification |
| Dépendance aux fournisseurs IA | Élevé | Abstraction fournisseur, gestion d’erreurs et fallback documenté |
| Accès excessif au workspace | Élevé | Périmètre strict, contrôle des chemins et journalisation |
| Token frontend partagé | Élevé | Authentification robuste et séparation des responsabilités |
| Configuration `.env` incohérente | Moyen | Validation automatisée et modèle `.env.example` maintenu |
| Absence de métriques formelles | Moyen | Définition de SLO et tableaux de bord |
| Intégrations non documentées | Moyen | Inventaire des interfaces et contrats versionnés |

---

## 6. 📊 Métriques et monitoring

### 6.1 KPIs techniques recommandés

Les sources ne définissent aucun KPI officiel. Les indicateurs suivants sont proposés comme cadre de monitoring directement aligné sur les composants décrits.

#### Orchestration

- nombre de missions démarrées ;
- taux de missions terminées avec succès ;
- taux d’échec par type de mission ;
- durée moyenne et maximale d’une mission ;
- nombre d’étapes exécutées par mission ;
- taux de blocage entre `server/mission` et `server/runtime`.

#### Fournisseurs IA

- latence par fournisseur ;
- taux d’erreur par fournisseur ;
- nombre d’appels ;
- consommation de tokens, si disponible ;
- taux de fallback ;
- modèle utilisé par type de tâche.

#### Runtime et terminal

- nombre de connexions WebSocket ;
- latence des échanges ;
- déconnexions anormales ;
- commandes exécutées ;
- erreurs d’accès au workspace ;
- nombre d’actions bloquées par le sandbox.

#### Persistance

- taux d’erreur Supabase ;
- latence des requêtes ;
- erreurs d’autorisation ;
- volume de données par domaine fonctionnel ;
- échecs de sauvegarde des missions ou connaissances.

#### Sécurité

- détection de secrets dans le dépôt ;
- utilisation de tokens révoqués ;
- tentatives de sortie du sandbox ;
- accès hors workspace ;
- modifications autonomes ;
- appels externes non autorisés.

### 6.2 Stratégie de monitoring

La stratégie cible doit être organisée en quatre niveaux.

#### Niveau 1 — Logs applicatifs

Chaque mission, appel IA et opération runtime devrait être associé à un identifiant corrélable. Les logs devraient distinguer :

- composant émetteur ;
- type d’opération ;
- statut ;
- durée ;
- erreur éventuelle ;
- fournisseur externe ;
- mode sandbox ou lecture seule.

Le format exact des logs actuels est **[Information non disponible dans les sources]**.

#### Niveau 2 — Métriques

Les métriques doivent être agrégées par :

- mission ;
- agent ;
- workflow ;
- fournisseur IA ;
- type d’opération ;
- environnement.

Il faut éviter d’enregistrer des secrets ou des contenus sensibles dans les logs.

#### Niveau 3 — Traces

Les workflows multi-agents et les missions longues nécessitent une traçabilité de bout en bout :

```text
Requête utilisateur
  → Mission
  → Agent
  → Compétence
  → Workflow
  → Appel IA ou Runtime
  → Persistance
  → Réponse
```

La capacité actuelle de traçage distribué n’est pas fournie.

#### Niveau 4 — Alertes

Les alertes doivent couvrir en priorité :

- secret détecté dans le code ;
- appel avec une clé invalidée ;
- augmentation brutale des erreurs IA ;
- accès à un chemin hors workspace ;
- tentative de sortie du sandbox ;
- désactivation inattendue de `SELF_HEAL_READONLY` ;
- augmentation des modifications autonomes ;
- indisponibilité Supabase ;
- rupture des connexions WebSocket.

### 6.3 Seuils d’alerte

Aucun seuil numérique n’est défini dans les sources. Les seuils ci-dessous doivent donc être considérés comme **à spécifier**, et non comme des valeurs existantes.

| Indicateur | Seuil attendu |
|---|---|
| Secret détecté dans un fichier versionné | Alerte immédiate, niveau critique |
| Utilisation d’un secret révoqué | Blocage et alerte immédiate |
| Tentative d’accès hors workspace | Blocage et alerte immédiate |
| Tentative de sortie du sandbox | Alerte haute, voire blocage selon le contexte |
| Échec fournisseur IA | Seuil à définir par fournisseur |
| Latence IA | SLO à définir |
| Échec WebSocket | Seuil à définir selon le volume attendu |
| Erreur Supabase | Seuil à définir selon la criticité |
| Modification autonome en dehors du mode autorisé | Blocage et alerte critique |

### 6.4 Synthèse opérationnelle

Le principal enjeu technique de Jarvis-OS n’est pas uniquement la richesse fonctionnelle, mais la maîtrise de l’exécution autonome. Les capacités d’agents, de workflows, d’analyse de code, de navigation et d’auto-réparation doivent être observables et bornées par des contrôles explicites.

La coexistence de `server/mission` et `server/runtime` doit être traitée comme un axe architectural prioritaire : la séparation est utile pour structurer le système, mais l’unification annoncée devra préserver la distinction entre intention et exécution sans maintenir deux chaînes de responsabilité concurrentes.

Enfin, la remédiation des secrets est une condition préalable non négociable. Tant que les credentials présents dans `.env` ne sont pas révoqués, renouvelés et retirés des sources accessibles, le système doit être considéré comme exposé, indépendamment de la qualité de son architecture logicielle.