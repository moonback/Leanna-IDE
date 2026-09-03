# Audit de performance & parcours client — Backend "server"

**Périmètre analysé :** dossier `server/` (286+ fichiers TypeScript, ~92 000 lignes) — moteur d'agents autonomes, indexation de code, notebooks/RAG, WebSocket temps réel, exports, marketplace.
**Méthode :** analyse statique du code source fourni (pas d'accès à un environnement d'exécution ni à des métriques APM). Les constats ci-dessous sont basés sur des patterns de code identifiés et vérifiés fichier par fichier ; les temps annoncés sont des ordres de grandeur, pas des mesures.

---

## 1. Résumé exécutif

Le backend est riche fonctionnellement (agents autonomes, RAG hybride, live voice, indexation de code) mais souffre de **trois familles de problèmes récurrents** qui touchent directement les parcours utilisateurs les plus fréquents (chat notebook, exécution de missions d'agents, chargement de l'IDE) :

1. **Écritures disque synchrones et non-débouncées** sur les chemins d'écriture les plus chauds (chaque message de chat, chaque note, chaque scan de code) — bloque l'event loop Node.js pour **tous** les utilisateurs/connexions WebSocket pendant l'écriture.
2. **Pipeline RAG en cascade d'appels séquentiels** (expansion de requête → recherche embeddings par sous-requête → re-ranking LLM → génération) sur le parcours le plus utilisé du produit : poser une question à un notebook.
3. **Compression HTTP et limites de body appliquées de façon incohérente** : un seul groupe de routes (`/api/ide`) bénéficie de `compression()`, alors que les payloads les plus volumineux (graphe de connaissances, résultats RAG, historiques de chat) transitent ailleurs.

Il existe aussi de bons patterns déjà en place (voir §5) qui montrent que l'équipe sait résoudre ces problèmes — ils ne sont simplement pas appliqués partout.

---

## 2. Constats de performance détaillés

### 2.1 Écritures fichier synchrones sur le chemin critique (Sévérité : **Haute**)

**Où :** `notebooks/NotebookManager.ts`, `knowledge/KnowledgeGraph.ts` (méthode `save()`).

Chaque mutation — un message de chat ajouté, une note créée, un titre renommé — déclenche un `fs.writeFileSync(filePath, JSON.stringify(notebook, null, 2))` **synchrone** sur l'objet complet (notebook entier avec historique de chat, sources, chunks). `KnowledgeGraph.save()` fait de même pour l'intégralité du graphe de connaissances du projet, appelé après chaque `addFile`/`removeFile`/`setRelations`.

**Pourquoi c'est un problème :** `writeFileSync` est bloquant pour tout le thread Node.js. Sur un serveur mono-processus qui sert aussi les WebSockets `/live` (voix temps réel) et `/sandbox-watch`, une écriture de quelques dizaines à quelques centaines de ms fige **toutes les connexions actives**, pas seulement l'utilisateur qui écrit. Plus un notebook grossit (historique limité à 200 messages, mais avec chunks de sources), plus l'écriture est coûteuse — et elle se déclenche à chaque tour de chat, pas seulement en fin de conversation.

**Contraste révélateur :** `notebooks/EmbeddingStore.ts` résout déjà ce problème correctement — écriture asynchrone + debounce de 1,5 s par notebook, avec commentaire explicite dans le code sur cette optimisation. Le pattern existe dans le codebase, il n'est simplement pas repris dans `NotebookManager` ni `KnowledgeGraph`.

### 2.2 Parcours "poser une question au notebook" : trop d'allers-retours séquentiels (Sévérité : **Haute**)

**Où :** `notebooks/RAGEngine.ts` → `searchHybrid()`, appelé par `notebooks/GroundedChat.ts` → `ask()` / `askStream()`.

Avant même que le premier token de réponse ne soit généré, le pipeline exécute dans l'ordre :
1. Un appel LLM pour l'**expansion de requête** (jusqu'à 3 sous-questions).
2. Pour **chaque** sous-requête, un appel `embeddingStore.search()` — exécuté dans une boucle `for (const q of queries) { await ... }`, donc **séquentiellement** alors que ces appels sont indépendants et pourraient être parallélisés avec `Promise.all`.
3. Un appel LLM de **re-ranking** sur les meilleurs candidats.
4. Enfin, l'appel de **génération** de la réponse (streamée ou non).

**Impact :** jusqu'à 3 appels réseau séquentiels rien que pour l'étape 2, plus 2 appels LLM additionnels (expansion + re-ranking) avant la génération elle-même. C'est le time-to-first-token le plus visible pour l'utilisateur — sur ce qui est probablement la fonctionnalité la plus utilisée du produit (chat sur les sources). Paralléliser l'étape 2 avec `Promise.all` est un changement à faible risque qui peut diviser son temps par ~3 lorsque plusieurs sous-requêtes sont générées.

### 2.3 Compression et taille de payload incohérentes (Sévérité : **Moyenne**)

**Où :** `config/rateLimits.ts` → `applyStaticAndCompression()`.

```ts
app.use(express.json({ limit: "50mb" }));
app.use("/api/ide", compression());
```

La compression gzip/brotli n'est activée que pour `/api/ide`. Les routes `notebooks`, `knowledge`, `agents`, `mcp`, `marketplace` — qui renvoient des payloads potentiellement volumineux (graphe de connaissances, résultats RAG avec chunks, historiques de chat, listes d'entités de code) — ne sont pas compressées. Pour un utilisateur sur une connexion moyenne, cela se traduit par un temps de chargement plus long, en particulier pour les vues de type "vue d'ensemble du projet" ou "explorateur de connaissances".

La limite globale de `50mb` sur `express.json` s'applique à **toutes** les routes API, y compris celles qui n'ont jamais besoin de payloads volumineux (chat, actions ponctuelles) — cela laisse une marge de traitement/mémoire inutilement large ouverte partout plutôt que réservée aux routes d'upload qui en ont réellement besoin.

### 2.4 Boucles séquentielles dans les modules à fort trafic (Sévérité : Moyenne)

Une recherche de pattern (`for (const … ) { await … }` sans `Promise.all` à proximité) a identifié **35 fichiers** présentant ce pattern. Les plus significatifs pour l'expérience utilisateur :

| Fichier | Contexte | Impact utilisateur |
|---|---|---|
| `notebooks/RAGEngine.ts` | recherche embeddings par sous-requête | direct — voir §2.2 |
| `mission/Executor.ts` | exécution séquentielle d'étapes de mission | temps d'attente pendant l'exécution d'une tâche d'agent |
| `agents/AgentOrchestrator.ts` | reprise des tâches interrompues au démarrage (`loadRecentTasks`) | démarrage serveur plus lent après un redémarrage avec beaucoup de tâches en cours |
| `knowledge/ProjectIndexer.ts` | scan complet : parsing fichier par fichier + AST | premier scan d'un gros projet ; atténué par le cache incrémental déjà en place (bon point, voir §5) |
| `routes/notebooks/sourcesRouter.ts`, `embeddingsRouter.ts` | traitement de sources ajoutées | temps d'attente à l'ajout d'un document |

Ce n'est pas systématiquement un bug : certaines de ces boucles sont sur des chemins peu fréquents (démarrage, tâches de fond). Mais celles sur les chemins de requête utilisateur (RAG, sources, missions) méritent un audit ciblé pour paralléliser ce qui peut l'être.

### 2.5 Absence de pagination visible sur les listes volumineuses (Sévérité : Moyenne, à vérifier)

`NotebookManager.getAllNotebooks()` charge et trie **tous** les notebooks en mémoire à chaque appel (pas de pagination, pas de limite). Idem pour les listes d'entités du `KnowledgeGraph` exposées via les routes `routes/knowledge/*`. Sur un usage prolongé avec de nombreux notebooks/projets, cela alourdit chaque requête de liste. À confirmer selon le volume réel attendu par utilisateur, mais c'est un point de vigilance pour la scalabilité du parcours "tableau de bord".

---

## 3. Parcours client impactés (priorisation par fréquence d'usage)

```
Parcours                          Fréquence   Problèmes identifiés
──────────────────────────────────────────────────────────────────
Chat avec un notebook (RAG)       Très haute   §2.1, §2.2, §2.3
Ajout d'une source / document     Haute        §2.1, §2.4
Exécution d'une mission d'agent   Haute        §2.4 (mission/Executor)
Chargement dashboard / listes     Haute        §2.3, §2.5
Session voix live (WebSocket)     Moyenne      §2.1 (blocage event loop)
Redémarrage serveur               Faible       §2.4 (AgentOrchestrator)
```

Le chat notebook et l'ajout de sources sont les deux parcours qui cumulent le plus de constats — logique, puisqu'ils concentrent l'essentiel de l'activité I/O + LLM du produit. Ce sont les deux priorités de remédiation.

---

## 4. Recommandations priorisées

### Quick wins (faible risque, fort impact, à faire en premier)
1. **Paralléliser la recherche embeddings multi-requêtes** dans `RAGEngine.searchHybrid()` avec `Promise.all` au lieu d'une boucle séquentielle.
2. **Étendre `compression()` à toutes les routes `/api`** (pas seulement `/api/ide`) dans `applyStaticAndCompression()`.
3. **Rendre `NotebookManager.persist()` asynchrone et débouncée**, sur le modèle exact déjà implémenté dans `EmbeddingStore.ts` (même fenêtre de 1,5 s).

### Structurel (impact fort, effort modéré)
4. **Appliquer le même pattern de debounce/async à `KnowledgeGraph.save()`**, en particulier pour les mises à jour incrémentales fréquentes (watcher de fichiers).
5. **Scoper `express.json({ limit: "50mb" })`** aux seules routes d'upload (`upload-document`, `sources`) plutôt qu'à toute l'API.
6. **Ajouter la pagination** sur `getAllNotebooks()` et les endpoints de listing du `KnowledgeGraph`.

### À investiguer (nécessite mesure en environnement réel)
7. Profiler le coût réel de l'expansion de requête + re-ranking LLM dans le pipeline RAG : sont-ils justifiés par un gain de pertinence mesurable qui compense le coût de latence ? Un mode "rapide" sans expansion/re-ranking pourrait être proposé pour les questions simples.
8. Vérifier le comportement sous charge concurrente (plusieurs notebooks actifs en simultané) pour confirmer l'impact réel des écritures synchrones — un test de charge simple (ex. 10 requêtes concurrentes de chat) confirmerait l'ampleur du blocage décrit en §2.1.

---

## 5. Points positifs à noter

Pour être complet, plusieurs choix d'architecture sont déjà solides et méritent d'être généralisés plutôt que remis en cause :
- **`EmbeddingStore.ts`** : lazy loading par notebook, normes L2 pré-calculées, cache de requêtes récentes, éviction LRU, persistence débouncée — c'est le meilleur exemple du codebase et devrait servir de référence pour `NotebookManager` et `KnowledgeGraph`.
- **`knowledge/ProjectIndexer.ts`** : cache incrémental différentiel (mtime + taille) qui évite un rescan complet coûteux à chaque démarrage — bon design.
- **`AgentPersistence.ts`** : utilise Supabase de façon asynchrone plutôt que des écritures fichier bloquantes — cohérent avec les bonnes pratiques.
- **`ProcessingQueue.ts`** : file d'attente avec concurrence limitée, retry à backoff exponentiel, priorités — bien pensé pour absorber la charge de traitement de sources.

---

## 6. Limites de cet audit

Cette analyse est statique, basée sur la lecture du code source fourni sous forme d'un export unique (~92 000 lignes). Elle ne remplace pas :
- un profilage réel (flamegraphs Node.js, APM) pour confirmer l'ampleur des blocages event loop ;
- des tests de charge sur les parcours identifiés en §3 ;
- une revue des index/requêtes côté Supabase (non visibles dans cet export, potentiellement pertinents pour `agents/AgentPersistence.ts` et le marketplace).

Ces éléments seraient l'étape naturelle suivante pour valider et chiffrer précisément le gain de chaque recommandation.
