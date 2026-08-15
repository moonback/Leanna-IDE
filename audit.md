# Analyse et Suggestions d'Amélioration pour Jarvis-OS

Après une revue approfondie du codebase, voici les axes d'amélioration prioritaires, classés par catégorie.

---

## 1. Gestion des Erreurs et Robustesse

### Problèmes identifiés
- **`catch` vides ou silencieux** dans de nombreux modules (ex: `agentPersistence.saveTask`, `agentMessageBus.publish`, `sandbox.ts`). Les erreurs sont avalées sans trace, ce qui rend le débogage impossible.
- **Promesses non gérées** : certaines opérations asynchrones sont lancées sans `await` ni `.catch` (ex: `this.executor.execute(task).catch(...)` dans `AgentOrchestrator`, mais certains appels similaires manquent).
- **Pas de timeout sur les appels réseau** (ex: `fetch` dans `github.ts` et `openrouter.ts` utilisent des timeouts, mais certains appels à `withGeminiRetry` peuvent bloquer longtemps sans limite).

### Suggestions
- **Remplacer tous les `catch {}`** par au minimum un log d'erreur (`console.error` ou `logger.error`).
- **Utiliser un gestionnaire global d'erreurs** pour les promesses non rattrapées (`process.on('unhandledRejection', ...)`).
- **Systématiser les timeouts** sur toutes les opérations réseau (fetch, exécution de commandes, appels LLM). Utiliser `AbortController` avec un délai.
- **Dans `AgentExecutor.execute`**, la boucle `executeToolLoop` pourrait être interrompue en cas d'erreur critique ; ajouter un mécanisme d'arrêt d'urgence.

---

## 2. Sécurité

### Problèmes identifiés
- **Injection de commande** dans `system_execute_command` : bien que restreint à `npm`, `npm run` peut exécuter des scripts définis dans `package.json`, potentiellement dangereux. Actuellement, une confirmation interactive est requise, mais un utilisateur malveillant pourrait tromper l'IA pour exécuter un script nuisible.
- **Évaluation d'expressions dans les workflows** (`evaluateCondition` dans `workflow.ts`) : bien que l'interpréteur soit sécurisé (pas de `eval`), l'accès aux propriétés via `prev` et `steps` pourrait exposer des données sensibles. Limiter les propriétés accessibles.
- **Chemins absolus interdits** dans `assertSandboxReady` : bonne protection, mais il faut aussi interdire les chemins avec `..` après résolution (déjà fait partiellement).
- **Manque de validation des entrées utilisateur** dans les routes Express (certains endpoints acceptent des objets non validés).

### Suggestions
- **Renforcer la politique de sécurité des commandes système** : interdire `npm` sauf si une liste blanche de scripts est définie. Ne pas autoriser `npm install` (risque d'installation de paquets malveillants).
- **Ajouter une validation stricte** avec Zod pour toutes les requêtes HTTP, comme c'est déjà fait dans certains `inputSchemas` des skills.
- **Pour les workflows**, ne pas autoriser l'accès à des propriétés autres que `result`, `status`, `error` dans `prev` et `steps`.
- **Utiliser un mécanisme de "sandbox" pour l'exécution de code** (ex: utiliser `vm2` ou `isolated-vm` si jamais l'IA génère du code exécutable, mais ce n'est pas le cas ici).

---

## 3. Duplication de Code et Centralisation

### Problèmes identifiés
- **Gestion des chemins** : 4 fonctions différentes pour normaliser/résoudre des chemins :
  - `normalizeSelfPath` (selfRoot.ts)
  - `normalizeProjectPath` (codebaseHelpers.ts)
  - `resolveWorkspacePath` (security.ts)
  - `resolveSandboxPath` (sandbox.ts)
- **Parsing de logs/erreurs** : `parseTsErrors`, `parseLintResults`, `parseTscOutput` (sandbox.ts) se chevauchent partiellement.
- **Logging** : mélange de `console.log`, `console.warn`, `console.error` et du logger custom. Il faut uniformiser vers le logger.

### Suggestions
- **Créer un module `pathUtils.ts`** exportant des fonctions standardisées : `resolveProjectPath`, `assertInProject`, `normalizePath`, etc., utilisées partout.
- **Consolider les parsers** en un seul module `parsers.ts` pour les formats d'erreurs courants (TypeScript, ESLint, etc.).
- **Utiliser le logger custom** systématiquement, en important `createLogger` dans chaque module.
- **Factoriser les schémas Zod** récurrents (comme `PATH_PARAM`, `FILES_PARAM` déjà présents dans `common/schemas.ts`) et les utiliser partout.

---

## 4. Performance

### Problèmes identifiés
- **Indexation complète du KnowledgeGraph** (`ProjectIndexer.scanAll`) relue en mémoire : pour de gros projets (>10k fichiers), cela peut prendre plusieurs secondes et consommer beaucoup de RAM.
- **Recherche sémantique** : l'index inversé est reconstruit à chaque modification, même si c'est incrémental, il peut devenir lourd.
- **Analyse d'impact** (`ImpactAnalyzer`) recalcule les scores à chaque appel, même pour des requêtes répétées (pas de cache sur les résultats complets, seulement sur les chaînes d'impact).
- **Parsing de fichiers** : `extractFileOutline` est appelée pour chaque fichier lors du scan, ce qui est coûteux.

### Suggestions
- **Limiter l'indexation** aux fichiers pertinents (ex: ignorer les fichiers de test, les fichiers `.d.ts`, les fichiers dans `dist/`). Déjà partiellement fait, mais renforcer.
- **Mettre en cache les résultats d'analyse d'impact** avec un TTL court (ex: 30s) pour les requêtes fréquentes.
- **Optimiser `extractFileOutline`** en utilisant des regex plus efficaces, et éviter de parser les fichiers binaires (déjà fait).
- **Utiliser un worker thread** pour l'indexation initiale, afin de ne pas bloquer le thread principal.
- **Ajouter une pagination** dans les requêtes de liste (ex: `listProjectFiles` avec `recursive` peut retourner des milliers de fichiers ; limiter par défaut).

---

## 5. Architecture et Couplage

### Problèmes identifiés
- **Couplage fort** entre `agents`, `knowledge`, `mission`, `runtime`. Les imports sont nombreux et circulaires (ex: `AgentOrchestrator` importe `AgentExecutor`, `TaskScheduler`, `ProgressNotifier`, qui importent eux-mêmes d'autres modules).
- **Présence de deux systèmes de skills** : l'ancien `SkillManager` (dans `server/skills/SkillManager.ts`) et le nouveau `SkillManagerV2` (dans `runtime/compat`). La coexistence rend le code difficile à maintenir.
- **`AgentRuntime`** et **`AgentOrchestrator`** ont des responsabilités qui se chevauchent (gestion des tâches, des agents). Il y a une tentative de migration vers le nouveau runtime, mais l'ancien est encore utilisé.

### Suggestions
- **Adopter une architecture en couches claires** : `Domain` (agents, knowledge), `Application` (orchestration, runtime), `Infrastructure` (persistence, skills, utils). Utiliser l'injection de dépendances pour découpler.
- **Migrer complètement vers `AgentRuntime`** et supprimer `AgentOrchestrator` (ou le rendre un wrapper). La compatibilité peut être assurée via un adaptateur.
- **Supprimer l'ancien `SkillManager`** et utiliser exclusivement `SkillManagerV2` qui s'appuie sur `ToolRegistry`. Les skills existantes doivent être adaptées (déjà partiellement fait dans `compat`).
- **Utiliser des interfaces (`interface` TypeScript)** pour définir les contrats entre modules, plutôt que des imports directs de classes concrètes.

---

## 6. Tests et Qualité du Code

### Problèmes identifiés
- **Manque de tests** pour des modules critiques :
  - `DelegationParser` (parsing des délégations)
  - `AutonomousLoop` (boucle de décision)
  - `PlanningEngine` (ordonnancement)
  - `LearningEngine` (apprentissage)
  - `ImpactAnalyzer` (analyse d'impact)
- **Fonctions trop longues** (>200 lignes) : `AgentExecutor.execute`, `ProjectIndexer.scanAll`, `ImpactAnalyzer.analyze`, `UnderstandingEngine.buildContext`, etc.
- **Utilisation excessive de `any`** dans les types, réduisant la sécurité du typage.

### Suggestions
- **Écrire des tests unitaires** pour les modules manquants, en priorisant ceux avec une logique métier complexe (`DelegationParser`, `AutonomousLoop`).
- **Refactoriser les longues fonctions** en extrayant des sous-fonctions privées, ce qui améliore la lisibilité et facilite les tests.
- **Remplacer `any`** par des types plus spécifiques, ou utiliser `unknown` suivi de guards de type.
- **Ajouter une analyse statique** (ESLint avec règles `@typescript-eslint` strictes) pour détecter les `any`, les fonctions trop longues, etc.

---

## 7. Gestion d'État et Transactions

### Problèmes identifiés
- **`TaskScheduler`** : la gestion des tâches en parallèle avec dépendances est fragile ; en cas d'échec d'une tâche, les dépendances ne sont pas toujours marquées comme échouées.
- **Sandbox** : la synchronisation vers le principal (`syncToMain`) est transactionnelle (rollback), mais il n'y a pas de verrouillage pour empêcher deux sync simultanés.
- **Persistance des tâches** : mise à jour asynchrone sans garantie d'ordre ; en cas de crash, certaines tâches peuvent rester en `running`.

### Suggestions
- **Utiliser un mécanisme de verrouillage (mutex)** pour les opérations critiques comme la synchronisation du sandbox.
- **Pour le scheduler**, implémenter un mécanisme de "compensation" : si une tâche échoue, annuler les tâches dépendantes (ou les marquer comme bloquées).
- **Ajouter une transaction BDD** pour les mises à jour de statut des tâches, ou utiliser un système de versioning optimiste.

---

## 8. Documentation et Maintenabilité

### Problèmes identifiés
- **Certains fichiers** sont bien documentés (avec des commentaires d'en-tête), mais beaucoup de fonctions n'ont pas de JSDoc.
- **Les décisions d'architecture** ne sont pas documentées de manière centralisée (ex: pourquoi deux systèmes de skills ?).
- **Le code de `roles.ts`** contient des prompts système très longs, ce qui rend le fichier volumineux.

### Suggestions
- **Ajouter JSDoc** pour toutes les fonctions publiques, et pour les fonctions internes complexes.
- **Créer un `ARCHITECTURE.md`** décrivant les composants principaux, leurs responsabilités, et les flux de données.
- **Extraire les prompts système** dans des fichiers `.md` séparés (comme commencé dans `runtime/prompts/`) et les charger dynamiquement.
- **Utiliser des "Type Aliases"** pour les types complexes afin d'améliorer la lisibilité.

---

## 9. Optimisation des Ressources (Mémoire, CPU)

### Problèmes identifiés
- **`KnowledgeGraph`** stocke tous les fichiers en mémoire, y compris leur contenu (via `FileNode`). Cela peut être lourd.
- **`ProjectMemory`** utilise un index inversé en mémoire, ce qui double la mémoire consommée.
- **L'historique des messages** dans `AgentMessageBus` garde les 500 derniers messages en mémoire.

### Suggestions
- **Ne stocker que les métadonnées** des fichiers dans `KnowledgeGraph` (chemin, taille, lignes, entités) et charger le contenu à la demande via `read_project_file`.
- **Pour l'index inversé**, utiliser un stockage persistant (ex: SQLite) si le nombre de faits dépasse un seuil (déjà fait avec `MAX_FACTS` = 500, mais l'index est en mémoire).
- **Limiter l'historique des messages** à 100 et le persister en BDD pour un accès ultérieur.

---

## 10. Évolutivité et Extensibilité

### Problèmes identifiés
- **Ajout d'un nouvel agent** nécessite de modifier plusieurs fichiers (`roles.ts`, `agents/index.ts`, `routes/agents.ts`). Pas de système de plugin simple.
- **Les skills sont déclarées statiquement** ; l'ajout d'une nouvelle skill nécessite une modification du code.

### Suggestions
- **Implémenter un système de plugins** pour les agents et les skills, basé sur l'auto-découverte de fichiers (comme déjà fait pour les agents dans `runtime/agents/`).
- **Utiliser un mécanisme d'injection de dépendances** pour que les plugins puissent accéder aux services (ToolRegistry, EventBus, etc.) sans importer directement.
- **Créer un registre central** pour les skills et agents, accessible via une API REST pour l'administration.

---

## Conclusion

Les améliorations proposées visent à renforcer la robustesse, la sécurité, la maintenabilité et les performances du système. La priorité devrait être donnée à la gestion des erreurs, à la sécurité, et à la réduction de la duplication, car ces aspects impactent directement la fiabilité du serveur en production. Ensuite, une refonte architecturale progressive (migration vers le nouveau runtime) permettra de clarifier la structure et de faciliter les évolutions futures.#