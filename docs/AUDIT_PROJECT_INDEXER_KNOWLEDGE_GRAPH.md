# Audit — ProjectIndexer & KnowledgeGraph

_Date : 2026-10-16 · Périmètre : `server/knowledge/ProjectIndexer.ts`, `server/knowledge/KnowledgeGraph.ts`, `server/knowledge/KnowledgeGraphCache.ts`, `server/routes/knowledge/knowledgeRouter.ts`, `server/utils/knowledgeBroadcaster.ts`, UI `src/components/knowledge/*`, `StatusBar.tsx`._

Audit statique (lecture de code). Aucun profilage n'a été exécuté : les gains annoncés sont des estimations basées sur la complexité algorithmique, à confirmer par mesure (voir §6).

---

## 0. Synthèse

| # | Constat | Gravité | Effort |
|---|---------|---------|--------|
| P1 | `updateFile` / `removeFile` reconstruisent **tout** l'index (entités + dépendances + stats) à chaque fichier → O(N²) en mise à jour incrémentale | 🔴 Haute | M |
| P2 | `refreshSemanticRelations()` réextrait les relations de **tous** les fichiers à chaque batch du watcher (+ `statSync` par fichier) | 🔴 Haute | M |
| P3 | `/reindex` fait un scan complet **puis** `buildASTIndex()` complet → AST parsé deux fois | 🔴 Haute | XS |
| S1 | `/ast/file` lit n'importe quel chemin (`../../.env`) — pas de confinement à la racine | 🔴 Haute (sécurité) | XS |
| F1 | L'annulation UI n'arrête que le `fetch` : le scan serveur continue (le `signal` n'est pas câblé dans `/reindex`) | 🟠 Moyenne | S |
| P4 | Tout l'I/O de scan est synchrone (`statSync`, `readSync`) et la boucle de parsing ne cède jamais l'event loop | 🟠 Moyenne | S |
| P5 | Persistance : `JSON.stringify` complet + `structuredClone` complet + copie mémoire permanente dans `KnowledgeGraphCache` à chaque save | 🟠 Moyenne | S |
| F2 | Le watcher (`handleFileChanges`) n'est pas coordonné avec `scanAll` (`inFlight`) → course possible | 🟠 Moyenne | S |
| F3 | Incohérence de racine : l'indexeur cible toujours `SELF_ROOT`, mais `/reindex` et `/ast/file` utilisent la racine sandbox | 🟠 Moyenne | XS |
| U1 | 4 boutons « Réindexer » différents, dont un libellé « Re-scan AST » qui relance tout (code + documents) | 🟠 Moyenne | S |
| U2 | Recherche AST sans debounce ni annulation des requêtes obsolètes | 🟡 Basse | XS |

---

## 1. Performance — ProjectIndexer

### P1 — Mises à jour du graphe en O(N) par fichier → O(N²) par batch
`KnowledgeGraph.updateFile()` et `removeFile()` (`KnowledgeGraph.ts:297-324`) appellent à chaque fois `rebuildEntityIndex()`, `rebuildDependencyGraph()` (avec résolution d'import pour **tous** les fichiers) et `computeStats()`, puis `emitUpdate()` et un `log.info`.

Appelées en boucle dans :
- CAS B de `scanAll` (`ProjectIndexer.ts:309-314`) — jusqu'à 40 % du projet ;
- `handleFileChanges` (`ProjectIndexer.ts:1663-1707`) pour chaque évènement.

Sur 900 fichiers et un `git checkout` de 300 fichiers : ~300 × (900 fichiers × imports) résolutions + 300 émissions d'évènement aux listeners.

**Recommandation** : ajouter une API batch, sans nouvelle abstraction :
```ts
// KnowledgeGraph
applyChanges(upserts: FileNode[], removals: string[]): void {
  for (const p of removals) delete this.state.files[p];
  for (const f of upserts) this.state.files[f.path] = f;
  this.rebuildEntityIndex(); this.rebuildDependencyGraph();
  this.state.stats = this.computeStats();
  this.state.lastIndexed = new Date().toISOString();
  this.dirty = true; this.save(); this.emitUpdate();
}
```
Le CAS B et `handleFileChanges` accumulent les `FileNode` puis appellent `applyChanges` **une seule fois**. Gain attendu : O(N²) → O(N) par batch.

Étape suivante (si encore lent) : mise à jour incrémentale de l'index d'entités et de `dependents` (retirer les anciennes entrées du fichier, ajouter les nouvelles) au lieu d'un rebuild.

### P2 — Recalcul global des relations à chaque modification
`refreshSemanticRelations()` (`ProjectIndexer.ts:1467-1512`) :
1. fait un `fs.statSync` sur **chaque** fichier du graphe pour valider le cache ;
2. relit depuis le disque tous les fichiers évincés du cache de 64 Mo ;
3. réexécute `relationExtractor.extractRelations` sur tous les fichiers TS/JS ;
4. copie l'index AST complet (`getAllASTResults()` fait `new Map(...)`).

Le commentaire du code chiffre déjà le coût à ~2 s. Un simple enregistrement de fichier dans l'éditeur déclenche ce coût.

**Recommandations** (par ordre de rentabilité) :
1. **Debounce** du refresh des relations dans le watcher (ex. 500 ms–1 s après le dernier batch) : les sauvegardes en rafale (formatter, agent) ne paient qu'une fois.
2. **Relations par fichier** : stocker `relationsByFile: Map<path, EntityRelation[]>` ; sur modification, ne recalculer que le fichier modifié **et** ses `dependents` directs (les seules relations dont la cible peut changer). `setRelations` devient la concaténation.
3. Supprimer la validation `statSync` : le watcher et `_readContent` invalident déjà le cache (`_invalidateContentCache`) ; il suffit d'invalider aussi sur évènement `modified`.
4. `getAllASTResults()` : retourner un `ReadonlyMap` au lieu d'une copie.

### P3 — Double parsing AST sur `/reindex`
`knowledgeRouter.ts:248-268` : `scanAll({ force: true })` construit déjà l'index AST complet (CAS C, `ProjectIndexer.ts:367-413`), puis la route appelle `projectIndexer.buildASTIndex()` qui **relit et reparse tout** et fait `astCallGraph.clear()`. 
**Recommandation** : supprimer la ligne 268. Gain : ~50 % du temps de réindexation sur la partie AST.

Même problème atténué dans `GET /ast/stats` (`knowledgeRouter.ts:503-505`) : un **GET** peut déclencher une construction AST complète et bloquer la requête. Préférer renvoyer `astReady: false, building: true` et lancer la construction en tâche de fond.

### P4 — I/O synchrone et boucle non coopérative
- `_readContent` (`openSync`/`fstatSync`/`readSync`), `parseFile` (`statSync` **en plus** alors que `_readContent` a déjà le `fstat` — `ProjectIndexer.ts:725-731`), CAS A (`statSync` séquentiel sur tous les fichiers).
- La boucle du CAS C ne cède la main qu'aux `await` de `astParser.parseFile` ; si celui-ci est synchrone en pratique, l'event loop (WebSocket, API) est gelée pendant tout le scan.

**Recommandations** :
- Faire retourner `{ content, size, mtime }` par `_readContent` et supprimer le `statSync` de `parseFile`.
- CAS A : `fs.promises.stat` avec une concurrence bornée (ex. 32) — ou mieux, réutiliser les `Dirent` du walk avec `fs.promises.readdir(..., { withFileTypes: true })` + `stat` parallèle.
- Céder l'event loop tous les ~50 fichiers : `if (i % 50 === 0) await new Promise(setImmediate);`.
- Option à plus long terme : déporter parsing + extraction dans un `worker_threads` (le code est déjà pur sur `(path, content)`).

### P5 — Coûts CPU évitables dans l'extraction
- `_stripComments` est appelé **deux fois** par fichier (`extractImportsExports` et `extractSymbolEntities`) et utilise `src.split("")` (un tableau d'un élément par caractère). → calculer une seule fois dans `parseFile` et passer le résultat ; travailler par tranches (`slice`) plutôt que par tableau de caractères.
- `lineOf(offset)` (`ProjectIndexer.ts:1226`) fait `content.slice(0, offset).match(/\n/g)` pour **chaque** import/export → O(taille × nb_symboles). Précalculer un tableau des offsets de début de ligne et faire une recherche binaire.
- `extractAllRelations` filtre le tableau de relations 4 fois juste pour un `log.info` (`ProjectIndexer.ts:1602`) → un seul passage de comptage, ou niveau `debug`.
- `staticImportRe` (`/\b(?:import|export)\b[\s\S]*?\bfrom\s+.../`) est paresseux mais **multi-lignes** : un `export const` suivi bien plus loin d'un `from '...'` dans une chaîne peut capturer un faux import. Ancrer sur début d'instruction (`^\s*(?:import|export)\b[^;]*?\bfrom`) limite le risque. À terme, `es-module-lexer` (déjà évoqué dans le code) remplace ces regex de façon fiable et plus rapide.

### P6 — Mémoire
- `_contentCache` jusqu'à 64 Mo **+** `astIndex` **+** `state` **+** copie `memoryCache` du `KnowledgeGraphCache` (voir P7) : jusqu'à 3 copies du graphe en RAM.
- `buildASTIndex` appelle `_readContent(absPath)` sans `relPath` → pas de cache, relecture systématique.

---

## 2. Performance — KnowledgeGraph & persistance

### P7 — Sauvegarde coûteuse
À chaque `flush()` (`KnowledgeGraph.ts:182-225`) :
1. `JSON.stringify(this.state)` synchrone sur tout l'état ;
2. `knowledgeGraphCache.set()` → `structuredClone(state)` complet **+** `JSON.stringify` à nouveau si Redis ;
3. la copie clonée reste en mémoire indéfiniment dans `memoryCache`.

L'état persisté contient aussi des **données dérivées** : `entities` (doublon des entités déjà dans `files`), `dependencies`, `dependents` — alors que `validateState` les recalcule de toute façon au chargement (`KnowledgeGraph.ts:627`).

**Recommandations** :
- Ne persister que `files`, `relations`, `lastIndexed`, `projectRoot` ; reconstruire `entities`/`dependencies`/`stats` au chargement (déjà fait pour les dépendances). Gain disque estimé : ~40-50 %.
- Passer la chaîne JSON déjà produite au cache (`knowledgeGraphCache.setRaw(root, data)`) au lieu d'un `structuredClone` + second `stringify`.
- Retirer le `memoryCache` local (il ne sert que si Redis est absent, auquel cas l'état en mémoire **est** déjà la source) ou le limiter à l'activation multi-projets.

### F4 — Écritures concurrentes
Deux `flush()` peuvent se chevaucher (le second démarre pendant le `writeFile` du premier) ; si le premier `rename` termine après le second, l'ancien état écrase le récent. 
**Recommandation** : un drapeau `writing` ; si un flush est demandé pendant une écriture, reprogrammer après la fin.

### P8 — Requêtes linéaires
`getEntityRelations`, `getFileRelations`, `getSubclasses`, `getImplementors`, `/relations` et `/search` parcourent tout le tableau à chaque appel. Pour un usage LLM fréquent (ImpactAnalyzer, SemanticSearch), indexer à la volée lors de `setRelations` :
```ts
private relByEntity = new Map<string, EntityRelation[]>();
private relByFile   = new Map<string, EntityRelation[]>();
```
`searchEntities` : ajouter un paramètre `limit` (aujourd'hui `/search` peut renvoyer des milliers d'entités).

### F5 — Cohérence de l'API
- `getEntities`, `getDependencies`, `getRelations`… n'appellent pas `syncToCurrentWorkspace()` contrairement aux autres getters → peuvent servir l'ancien projet juste après un changement de racine.
- `getState()` expose l'état mutable (`Readonly` n'est que superficiel).
- `hydrateFromSharedCache` peut remplacer l'état **après** qu'un scan a commencé à le modifier (seul `lastIndexed` est comparé) ; vérifier aussi `projectIndexer` inactif ou comparer la version d'écriture.

---

## 3. Processus & fonctionnalités

### F1 — Annulation non effective
`KnowledgeHealthDashboard` annule le `fetch`, mais `/reindex` ne passe pas de `signal` à `scanAll` : le serveur continue, les évènements de progression continuent d'arriver et la barre réapparaît après l'annulation. 
**Recommandation** : un `AbortController` côté serveur, déclenché par `req.on('close')` ou par une route `POST /reindex/cancel` ; `scanAll` gère déjà `ScanCancelledError`.

### F2 — Watcher vs scan complet
`handleFileChanges` ne consulte pas `this.inFlight`. Pendant un CAS C, le watcher peut appeler `updateFile`, puis `knowledgeGraph.update(parsedFiles)` écrase tout avec la photographie prise **avant** l'évènement. 
**Recommandation** : si `inFlight`, mettre les évènements en file et poser `pendingRescan = true` (le mécanisme existe déjà).

### F3 — Racine incohérente
`ProjectIndexer.getActiveProjectRoot()` ignore volontairement la sandbox (commentaire `ProjectIndexer.ts:127-133`), mais `/reindex` (`knowledgeRouter.ts:246`) et `/ast/file` (`:533`) utilisent `getSandboxRoot()`. Les documents et l'AST à la demande peuvent donc venir d'une autre arborescence que le graphe. Aligner sur `SELF_ROOT`.

### S1 — Sécurité des routes
- `/ast/file?file=../../.env` : `path.join(root, filePath)` sans contrôle → lecture hors projet (le contenu n'est pas renvoyé tel quel, mais l'AST et l'existence fuient). Ajouter :
  ```ts
  const abs = path.resolve(root, filePath);
  if (!abs.startsWith(path.resolve(root) + path.sep)) return res.status(400)…
  ```
- `/ast/chain?depth=` non borné → BFS potentiellement énorme. `Math.min(Math.max(depth || 4, 1), 6)`.
- `/ast/functions?limit=abc` → `NaN` → résultat vide silencieux. Même correction de bornes.
- Appels `/reindex` sans `authHeaders()` dans `ASTCallGraphExplorer.tsx:159` et `KnowledgeHealthDashboard.tsx:168` alors que `ImpactPanel`/`StatusBar` les envoient : si la route est protégée, ces boutons échouent ; si elle ne l'est pas, c'est une route coûteuse ouverte. À trancher et uniformiser.
- `/reindex` n'a aucun garde-fou de fréquence : plusieurs clics = plusieurs scans complets séquentiels (`force` attend puis relance). Renvoyer `409 Already running` (ou rejoindre le scan en cours) quand `inFlight` est actif.

### F6 — Qualité des données
- Les titres Markdown sont typés `export` avec un modifier `heading` (`ProjectIndexer.ts:888`) → gonfle `entitiesByType.export` dans les stats et le contexte LLM. Ajouter `"heading"` à `CodeEntityType`.
- `totalEntities` inclut les `symbol` (chaque import nommé) et les clés JSON : la métrique affichée « entités » ne reflète pas le code réel. Afficher séparément « déclarations » (function/class/interface/type/component) et « symboles ».
- Routes Express : préfixes de montage résolus uniquement dans le même fichier (limitation documentée). Une passe globale après le scan (collecter tous les `app.use('/x', router)` puis réécrire les routes) donnerait des chemins réels.
- `MAX_FILE_SIZE` (500 Ko) écarte silencieusement des fichiers : les lister dans `/health` (`skippedFiles`) pour que l'utilisateur le sache.

### F7 — Observabilité
- Remplacer les `log.info` par fichier (`updateFile`, `removeFile`) par un log de batch → bruit réduit massivement en incrémental.
- Exposer dans `/health` : durée du dernier scan, mode (cache / incrémental / complet), nombre de fichiers ignorés, durée du dernier refresh de relations. Ces chiffres serviront à valider les optimisations ci-dessus.
- `broadcastKnowledgeProgress` envoie un message WebSocket **par fichier** : throttler à ~10 messages/s (garder toujours le dernier et `done`).

---

## 4. UI / UX

### U1 — Points d'entrée multiples et libellés trompeurs
Quatre déclencheurs de `/reindex` : `KnowledgeHealthDashboard`, `ASTCallGraphExplorer` (« Re-scan AST »), `ImpactPanel`, `StatusBar`. Le bouton AST relance en réalité tout (code + documents + liens).
**Recommandations** :
- Un hook unique `useReindex()` (état partagé, auth, annulation, toasts) consommé par les 4 endroits — tous affichent alors le même état « en cours » et le même bouton désactivé.
- Libellés explicites : « Réindexer le projet (code + documents) ». Si un rescan AST seul est souhaité, une route dédiée.
- Afficher la progression dans la `StatusBar` (petite jauge) pendant tout scan, y compris ceux lancés automatiquement au démarrage / par le watcher — aujourd'hui seul le dashboard l'affiche.

### U2 — Explorateur AST
- `searchFunctions` est recréé à chaque frappe (`searchQuery` dans les deps) et déclenché par `useEffect` → une requête par caractère. Ajouter un debounce (~250 ms) et un `AbortController` pour ignorer les réponses obsolètes (sinon résultats qui « sautent »).
- `inspectFunction` lit `selectedFn` hors des dépendances du `useCallback` → closure périmée ; la sélection automatique du premier résultat peut écraser un choix de l'utilisateur.
- `inspectFunction` fait 3 requêtes parallèles ; une route `GET /ast/inspect` renvoyant `{ callers, callees, chain }` divise par 3 les allers-retours.
- Erreurs silencieuses (`catch {}` sur `fetchStats`) : afficher un état « AST indisponible — Tree-sitter non chargé » plutôt qu'un panneau vide.

### U3 — Dashboard de santé
- Pas de rafraîchissement après les mises à jour du watcher : s'abonner à un évènement WebSocket `knowledge_updated` (émis depuis `emitUpdate`, throttlé) plutôt que d'exiger un clic sur « Rafraîchir ».
- Après annulation, la progression revient (cf. F1) ; masquer la barre et ignorer les évènements jusqu'au prochain lancement.
- Barre de progression : la phase `relations` est envoyée avec `total` mais `current: 0` → affiche 0 % pendant l'étape la plus longue. Utiliser un état indéterminé pour cette phase.
- Statut : les pastilles `animate-pulse` / `animate-bounce` permanentes doivent respecter `prefers-reduced-motion` (`motion-safe:animate-pulse`).
- Couleurs en dur (`#00c2ff`, `bg-blue-500/10`, `text-cyan-400`…) mélangées aux tokens (`var(--accent-primary)`) → passer par les tokens pour la cohérence clair/sombre.
- Doublon d'API : `KnowledgeHealthDashboard` utilise `/health`, `DocumentsView` utilise `/dashboard` qui recalcule la quasi-totalité des mêmes données (dont `detectCycles()`). Converger vers un seul endpoint, avec un cache court (ex. invalidé sur `emitUpdate`).

### U4 — Fonctionnalités UI à forte valeur
- **Cycles cliquables** : chaque fichier d'un cycle ouvre l'éditeur à la ligne de l'import fautif.
- **Visualisation du graphe de dépendances** (vue locale d'un fichier : dépendances + dépendants sur 1-2 niveaux) — les données (`dependencies`/`dependents`) existent déjà.
- **« Pourquoi ce fichier n'est pas indexé ? »** : liste des fichiers ignorés (taille, extension, règle d'exclusion).
- **Indicateur de fraîcheur** dans la StatusBar : « Index à jour · il y a 12 s » / « Indexation… 42 % ».

---

## 5. Plan d'action proposé

| Ordre | Action | Fichiers | Gain |
|-------|--------|----------|------|
| 1 | Supprimer le `buildASTIndex()` redondant de `/reindex` | `knowledgeRouter.ts:268` | ~-50 % temps AST du reindex |
| 2 | Confinement de chemin + bornes `depth`/`limit` | `knowledgeRouter.ts` | Sécurité |
| 3 | `applyChanges()` batch dans `KnowledgeGraph`, utilisé par CAS B et le watcher | `KnowledgeGraph.ts`, `ProjectIndexer.ts` | O(N²) → O(N) |
| 4 | Debounce du refresh des relations côté watcher | `ProjectIndexer.ts` | Sauvegardes en rafale quasi gratuites |
| 5 | Câbler l'annulation serveur + `409` si scan en cours | `knowledgeRouter.ts` | UX + charge serveur |
| 6 | Coordination watcher ↔ `inFlight` | `ProjectIndexer.ts` | Correction d'une course |
| 7 | Hook `useReindex()` partagé + debounce recherche AST | `src/components/knowledge/*`, `StatusBar.tsx` | Cohérence UX |
| 8 | Persistance allégée (sans `entities`/`dependencies`) + cache sans clone | `KnowledgeGraph.ts`, `KnowledgeGraphCache.ts` | Disque/RAM, temps de save |
| 9 | Relations incrémentales par fichier | `ProjectIndexer.ts`, `RelationExtractor.ts` | Refresh ~2 s → quelques ms |
| 10 | Parsing en `worker_threads` | `ProjectIndexer.ts` | Event loop libre pendant le scan |

## 6. Mesurer avant / après
Ajouter (ou exposer via `/health`) ces métriques avant toute optimisation :
- durée `scanAll` par CAS (A/B/C) ;
- durée `refreshSemanticRelations` ;
- durée et taille de `flush()` ;
- lag de l'event loop pendant un scan complet (`perf_hooks.monitorEventLoopDelay`).

Un test de non-régression simple : indexer un fixture de ~200 fichiers, modifier 50 fichiers, vérifier que le résultat de `applyChanges` est identique (fichiers, entités, dépendances, relations) à celui d'un scan complet.
