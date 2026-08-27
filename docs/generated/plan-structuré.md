# Plan structuré de synthèse — Jarvis-OS

## I. Présentation générale du projet

### A. Nature et positionnement de l’application

#### 1. Assistant IA auto-référentiel

##### a. Finalité générale  
- **Note :** Jarvis-OS est conçu comme une application d’assistant IA capable d’analyser, d’exécuter et de faire évoluer son propre environnement logiciel.

##### b. Périmètre fonctionnel  
- **Note :** Le système se concentre sur son propre code source et ne prévoit pas, selon `.env.example`, la gestion de workspaces externes configurables.

#### 2. Composition globale du codebase

##### a. Volume du projet  
- **Note :** L’export du codebase, réalisé le 27/08/2026, comprend 219 fichiers et environ 1 953 Ko de texte.

##### b. Organisation technologique  
- **Note :** Le backend est principalement structuré en TypeScript et regroupe des composants dédiés aux agents, aux missions, au runtime, aux connaissances, aux notebooks, aux compétences et aux workflows.

### B. Principes directeurs

#### 1. Autonomie

- **Note :** L’application vise à permettre à l’assistant de planifier des objectifs, d’utiliser des outils, de naviguer sur le web et d’exécuter des opérations de manière largement autonome.

#### 2. Auto-référence

- **Note :** Jarvis-OS est pensé comme un IDE auto-référentiel : ses fonctions d’analyse et de modification concernent prioritairement son propre code source.

#### 3. Auto-réparation contrôlée

- **Note :** Le projet inclut des mécanismes d’auto-réparation, mais la présence de `SELF_HEAL_READONLY=true` indique une volonté de limiter ces mécanismes à un mode en lecture seule ou à un mode non destructif.

---

## II. Architecture fonctionnelle et orchestration

### A. Organisation modulaire du backend

#### 1. Agents et missions

- **Note :** Les agents représentent les capacités spécialisées de l’assistant, tandis que les missions structurent les objectifs à atteindre et les étapes nécessaires à leur réalisation.

#### 2. Runtime et exécution

- **Note :** Le runtime prend en charge les aspects opérationnels : lancement d’actions, interaction avec les outils, gestion de l’exécution et communication avec les composants applicatifs.

#### 3. Connaissances, notebooks et compétences

- **Note :** Ces modules permettent respectivement de stocker ou exploiter des connaissances, de conserver des espaces de travail analytiques et de gérer des capacités réutilisables.

#### 4. Workflows

- **Note :** Les workflows organisent des séquences d’actions ou de traitements pouvant être déclenchés par l’assistant ou par des événements applicatifs.

### B. Coexistence de deux systèmes d’orchestration

#### 1. Système `server/mission`

##### a. Orientation cognitive  
- **Note :** Ce système est orienté vers la compréhension, la cognition, la planification et la poursuite d’objectifs.

##### b. Gestion des objectifs  
- **Note :** Il semble constituer la couche chargée de transformer une intention ou une demande en mission structurée.

#### 2. Système `server/runtime`

##### a. Orientation infrastructurelle  
- **Note :** Ce système se concentre sur l’infrastructure d’exécution et la mise en œuvre concrète des actions.

##### b. Gestion opérationnelle  
- **Note :** Il est probablement responsable de l’exécution des outils, de la communication avec le serveur et de la gestion des contraintes techniques.

#### 3. Problématique de séparation

- **Note :** La coexistence de deux orchestrateurs peut entraîner des responsabilités redondantes, des divergences de logique ou des difficultés de synchronisation entre planification et exécution.

#### 4. Cible d’unification

- **Note :** L’architecture documente une trajectoire d’unification des systèmes `mission` et `runtime` afin de réduire la fragmentation et de clarifier le cycle complet allant de l’objectif à l’action.

### C. Gouvernance de l’exécution

#### 1. Outils à niveaux contrôlés

- **Note :** `FORCE_TIERED_TOOLS=true` indique que les outils doivent être exécutés selon une hiérarchie ou un système de niveaux, probablement afin de limiter les actions sensibles.

#### 2. Mode sandbox

##### a. Sortie du sandbox  
- **Note :** Un code de sécurité à six chiffres est prévu pour sortir du mode sandbox.

##### b. Risque associé  
- **Note :** Ce mécanisme doit être protégé comme un secret sensible et ne doit pas être exposé dans un fichier de configuration versionné ou partagé.

#### 3. Affichage de la chaîne de pensée

- **Note :** `ENABLE_CHAIN_OF_THOUGHT=false` désactive l’affichage de la chaîne de pensée, ce qui limite l’exposition de raisonnements internes et réduit les risques de divulgation d’informations sensibles.

---

## III. Capacités principales de Jarvis-OS

### A. Capacités d’intelligence et d’autonomie

#### 1. Planification et réalisation de missions

- **Note :** Le système peut structurer des missions, définir des objectifs intermédiaires et coordonner plusieurs étapes d’exécution.

#### 2. Utilisation d’agents spécialisés

- **Note :** Les agents permettent de répartir les responsabilités entre différentes fonctions : analyse, recherche, exécution, réparation ou gestion documentaire.

#### 3. Exécution autonome

- **Note :** L’assistant est conçu pour sélectionner des outils et effectuer des opérations en fonction du contexte et des objectifs définis.

### B. Navigation et recherche web

#### 1. Navigation web

- **Note :** Le projet comporte des capacités de navigation sur le web, destinées à rechercher, consulter ou exploiter des informations externes.

#### 2. Intégration de modèles et de services IA

- **Note :** Plusieurs fournisseurs sont prévus, notamment Gemini, Eden AI et OpenRouter, afin d’alimenter les fonctions d’intelligence artificielle.

### C. Gestion documentaire et connaissances

#### 1. Analyse documentaire

- **Note :** Jarvis-OS comprend des fonctions de gestion et d’analyse de documents.

#### 2. Capitalisation des connaissances

- **Note :** Les modules de connaissances et de notebooks permettent de conserver des informations, des analyses ou des résultats réutilisables.

#### 3. Support des workflows documentaires

- **Note :** Les workflows peuvent servir à automatiser l’ingestion, l’analyse, la transformation et l’exploitation de documents.

### D. Analyse et évolution du code

#### 1. Analyse du codebase

- **Note :** OpenRouter est présenté comme un fournisseur optionnel pour l’analyse du codebase.

#### 2. Auto-réparation

- **Note :** Les mécanismes d’auto-réparation visent à détecter ou corriger certains problèmes du système, avec une configuration actuelle imposant un mode prudent en lecture seule.

#### 3. Limitation au code interne

- **Note :** `.env.example` précise que Jarvis-OS ne gère que son propre code source et qu’aucun workspace externe n’est configurable.

---

## IV. Configuration de l’environnement

### A. Services d’intelligence artificielle

#### 1. Gemini

- **Note :** `GEMINI_API_KEY` est requis pour les appels aux modèles Gemini ; la configuration indique que cette variable est normalement injectée par AI Studio à partir des secrets utilisateur.

#### 2. Eden AI

- **Note :** `EDENAI_API_KEY` est utilisée pour accéder à Eden AI, mais elle n’est pas documentée dans `.env.example`, ce qui crée une différence entre l’environnement réel et le modèle de configuration fourni.

#### 3. OpenRouter

##### a. Clés d’accès  
- **Note :** Deux variables sont prévues : `OPENROUTER_API_KEY` et `OPENROUTER_FREE_API_KEY`.

##### b. Modèle  
- **Note :** `OPENROUTER_MODEL` est configuré sur `openrouter/free`.

##### c. Métadonnées d’intégration  
- **Note :** `OPENROUTER_REFERER` et `OPENROUTER_TITLE` servent à identifier l’application auprès d’OpenRouter.

### B. Base de données et persistance

#### 1. Supabase

##### a. URL du projet  
- **Note :** `SUPABASE_URL` et `VITE_SUPABASE_URL` pointent vers le même projet Supabase.

##### b. Clé de service  
- **Note :** `SUPABASE_SERVICE_ROLE_KEY` permet des opérations privilégiées et doit rester strictement côté serveur.

##### c. Clé publique frontend  
- **Note :** `VITE_SUPABASE_ANON_KEY` est destinée au frontend ; même si une clé anonyme peut être exposée, les règles d’accès Supabase doivent impérativement limiter les permissions effectives.

### C. Configuration applicative

#### 1. URL de l’application

- **Note :** `APP_URL` sert aux liens auto-référentiels, aux callbacks OAuth, aux webhooks et aux endpoints de l’application ; sa valeur réelle doit être définie au déploiement.

#### 2. Workspace par défaut

- **Note :** `JARVIS_DEFAULT_WORKSPACE` désigne un chemin local Windows correspondant au dossier du projet Jarvis-OS.

#### 3. Port du serveur

- **Note :** `VITE_SERVER_PORT=4000` définit le port backend utilisé notamment par le terminal WebSocket côté client.

#### 4. Environnement d’exécution

- **Note :** La présence de `NODE_ENV === 'test'` dans `.env` semble être une expression ou une ligne de configuration invalide ; elle doit être vérifiée et déplacée dans la configuration appropriée si nécessaire.

### D. Authentification interne et sécurité applicative

#### 1. Jeton API Jarvis

- **Note :** `JARVIS_API_TOKEN` protège vraisemblablement les appels internes ou API du backend.

#### 2. Jeton exposé au frontend

- **Note :** `VITE_JARVIS_API_TOKEN` rend le jeton accessible au bundle frontend ; cette pratique est risquée, car toute variable préfixée par `VITE_` peut potentiellement être exposée côté client.

#### 3. Paramètres de sécurité

- **Note :** Les valeurs de sécurité doivent être stockées dans un gestionnaire de secrets et jamais dans le dépôt, les exports de codebase ou les journaux.

---

## V. Fichier `.env.example` et modèle de déploiement

### A. Rôle du fichier d’exemple

#### 1. Documentation des variables attendues

- **Note :** `.env.example` fournit les noms des variables nécessaires au fonctionnement de l’application sans inclure de valeurs opérationnelles.

#### 2. Séparation entre configuration et secrets

- **Note :** Les clés y sont laissées vides, ce qui correspond à une bonne pratique de partage du projet.

### B. Variables documentées

#### 1. Fournisseurs IA

- **Note :** Le fichier documente Gemini et OpenRouter, mais ne mentionne pas Eden AI, alors que cette variable apparaît dans `.env`.

#### 2. Supabase

- **Note :** Les variables d’URL et de clé de service Supabase sont prévues dans le modèle.

#### 3. URL publique

- **Note :** `APP_URL` est décrite comme nécessaire aux redirections et aux webhooks.

### C. Contraintes fonctionnelles déclarées

#### 1. Auto-référentialité

- **Note :** Le fichier indique explicitement que Jarvis-OS est un IDE auto-référentiel.

#### 2. Absence de workspace externe

- **Note :** Aucun workspace externe ne doit être configurable selon la documentation d’exemple, ce qui limite le périmètre d’action de l’assistant.

### D. Écarts entre `.env` et `.env.example`

#### 1. Variables absentes du modèle

- **Note :** Eden AI, GitHub, les paramètres de sandbox, les options d’auto-réparation, les jetons Jarvis et certains paramètres d’exécution ne sont pas correctement représentés dans `.env.example`.

#### 2. Risque de documentation incomplète

- **Note :** Ces écarts peuvent compliquer l’installation, provoquer des erreurs de déploiement et rendre moins claire la gestion des dépendances sensibles.

---

## VI. Risques de sécurité critiques

### A. Exposition de secrets dans `.env`

#### 1. Clés de fournisseurs IA

- **Note :** Des clés Gemini, Eden AI et OpenRouter apparaissent en clair dans le fichier d’environnement fourni.

#### 2. Identifiants Supabase

- **Note :** Une clé de service Supabase privilégiée est exposée ; elle doit être considérée comme compromise.

#### 3. Jeton GitHub

- **Note :** Un token GitHub personnel est présent en clair et peut permettre un accès non autorisé aux dépôts ou aux ressources associées.

#### 4. Secrets internes de l’application

- **Note :** Les jetons Jarvis et le code de sortie du sandbox sont également exposés.

### B. Conséquences potentielles

#### 1. Accès non autorisé aux services tiers

- **Note :** Un attaquant pourrait utiliser les clés compromises pour appeler des modèles IA, consommer des quotas ou générer des coûts.

#### 2. Compromission des données Supabase

- **Note :** La clé de service pourrait permettre de contourner les contrôles frontend et d’accéder à des données ou opérations administratives.

#### 3. Compromission GitHub

- **Note :** Le token GitHub pourrait être utilisé pour lire, modifier ou supprimer des ressources selon ses permissions.

#### 4. Prise de contrôle de fonctions sensibles

- **Note :** Les jetons internes et le code sandbox pourraient faciliter des appels non autorisés ou la sortie d’un mode de protection.

### C. Mesures immédiates prioritaires

#### 1. Révocation des credentials

- **Note :** Toutes les clés et tous les tokens exposés doivent être révoqués immédiatement auprès de leurs fournisseurs respectifs.

#### 2. Rotation complète

- **Note :** De nouvelles valeurs doivent être générées, avec des permissions minimales et des durées de validité réduites lorsque cela est possible.

#### 3. Suppression de l’exposition

- **Note :** Les secrets doivent être retirés des fichiers suivis, des exports, des logs et de tout historique Git accessible.

#### 4. Vérification de compromission

- **Note :** Les journaux Gemini, Eden AI, OpenRouter, Supabase et GitHub doivent être examinés afin de détecter des utilisations anormales.

### D. Mesures structurelles

#### 1. Gestionnaire de secrets

- **Note :** Les secrets doivent être stockés dans AI Studio Secrets, un coffre-fort cloud ou un gestionnaire équivalent.

#### 2. Protection du dépôt

- **Note :** `.env` doit être ajouté à `.gitignore`, et un outil de détection de secrets doit être intégré à la CI.

#### 3. Principe du moindre privilège

- **Note :** Les clés doivent être limitées aux environnements, APIs et opérations strictement nécessaires.

#### 4. Séparation frontend/backend

- **Note :** Aucun secret privilégié, notamment la clé de service Supabase ou un token API interne, ne doit être transmis au frontend.

---

## VII. Incohérences et problèmes de configuration à traiter

### A. Doublons et fragments parasites

#### 1. Répétition de blocs de configuration

- **Note :** Plusieurs sections de `.env` sont dupliquées, notamment autour du workspace, du port serveur et du token GitHub.

#### 2. Texte corrompu ou isolé

- **Note :** La séquence `ssus.` ainsi que certains commentaires répétés suggèrent un fichier partiellement concaténé ou mal nettoyé.

### B. Valeurs potentiellement incorrectes

#### 1. `APP_URL`

- **Note :** La valeur `MY_APP_URL` est un placeholder et ne peut pas convenir telle quelle à un déploiement réel.

#### 2. Chemin Windows

- **Note :** Le chemin local `C:\Users\...` n’est pas portable et doit être adapté ou remplacé par une résolution dynamique selon l’environnement.

#### 3. Expression `NODE_ENV`

- **Note :** `NODE_ENV === 'test'` n’est pas une affectation valide dans un fichier `.env` standard et doit être corrigée.

### C. Cohérence des clés Supabase

#### 1. Clé de service et clé frontend

- **Note :** Les deux variables semblent utiliser la même valeur dans l’extrait, ce qui est anormal et potentiellement critique.

#### 2. Vérification nécessaire

- **Note :** Il faut confirmer que la clé frontend est bien une clé anonyme distincte et que la clé de service n’est jamais injectée dans le bundle client.

---

## VIII. Feuille de route recommandée

### A. Phase 1 — Sécurisation immédiate

#### 1. Révoquer et remplacer les secrets

- **Note :** Priorité absolue à Gemini, Eden AI, OpenRouter, Supabase, GitHub et aux tokens Jarvis.

#### 2. Nettoyer les fichiers et l’historique

- **Note :** Supprimer les secrets des fichiers, commits, exports de codebase et artefacts de déploiement.

#### 3. Vérifier les accès

- **Note :** Contrôler les journaux, les quotas, les utilisateurs et les permissions associés aux services compromis.

### B. Phase 2 — Normalisation de la configuration

#### 1. Reconstituer un `.env.example` complet

- **Note :** Ajouter toutes les variables réellement utilisées, en particulier Eden AI, GitHub, sandbox, auto-réparation et authentification Jarvis.

#### 2. Supprimer les doublons

- **Note :** Réorganiser le fichier `.env` par catégories : IA, base de données, serveur, workspace, sécurité et fonctionnalités expérimentales.

#### 3. Corriger les valeurs invalides

- **Note :** Remplacer les placeholders, corriger `NODE_ENV` et rendre les chemins portables.

### C. Phase 3 — Clarification architecturale

#### 1. Cartographier `server/mission` et `server/runtime`

- **Note :** Identifier précisément les responsabilités, interfaces, flux de données et dépendances de chaque orchestrateur.

#### 2. Définir la cible d’unification

- **Note :** Concevoir une orchestration unique séparant clairement la planification cognitive, la validation des outils et l’exécution infrastructurelle.

#### 3. Formaliser les contrôles d’exécution

- **Note :** Documenter les niveaux d’outils, le sandbox, l’auto-réparation en lecture seule et les conditions d’autorisation.

### D. Phase 4 — Renforcement qualité et exploitation

#### 1. Tests de configuration

- **Note :** Ajouter des contrôles vérifiant la présence, le format et la portée de chaque variable obligatoire.

#### 2. Tests de sécurité

- **Note :** Vérifier qu’aucun secret backend n’est accessible au frontend et que les permissions Supabase sont correctement appliquées.

#### 3. Observabilité

- **Note :** Mettre en place des journaux d’exécution, des alertes de consommation et un suivi des actions autonomes sans enregistrer de secrets ni de chaîne de pensée.

#### 4. Documentation opérationnelle

- **Note :** Documenter l’installation, le déploiement, la rotation des secrets, le fonctionnement du sandbox et la procédure de récupération après incident.