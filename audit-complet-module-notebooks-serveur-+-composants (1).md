# 🔍 Audit complet du module Notebooks

**Périmètre analysé :** 11 fichiers serveur (`notebooks/*.ts`) + ~50 composants React (`notebooks/*.tsx`), soit l'ensemble des deux dumps fournis.
**Méthode :** lecture intégrale du code serveur, inventaire croisé des endpoints appelés par le frontend, analyse des flux de données, détection de bugs et de fonctionnalités non branchées.

---

## 1. Verdict global

> **Le module Notebooks est fonctionnellement complet et bien architectivé (~80 % production-ready), mais il n'est pas possible de certifier que "toutes les fonctionnalités marchent" à 100 % pour 3 raisons :**
> 1. **Les routes HTTP ne sont pas dans les extraits fournis** — 20+ endpoints appelés par le frontend ne peuvent pas être vérifiés côté serveur ;
> 2. **Plusieurs bugs réels identifiés** (perte potentielle de données, fuite de processus Puppeteer, caches jamais utilisés, statut podcast potentiellement périmé sur disque) ;
> 3. **Des features partiellement implémentées** (YouTube sans transcription, caches sémantiques non branchés).

| Domaine | Diagnostic |
|---|---|
| CRUD notebooks / notes / sources | 🟢 Solide, persisté, débouncé |
| Ingestion (PDF, texte, markdown, HTML, image, GitHub) | 🟢 Fonctionnelle (⚠️ fuite Puppeteer) |
| Ingestion YouTube | 🔴 Non implémentée réellement |
| RAG hybride (embeddings + TF-IDF + RRF + re-rank LLM) | 🟢 Complet et robuste (fallbacks multiples) |
| Chat groundé + streaming + citations | 🟢 Fonctionnel |
| Deep dive, comparaison, insights, follow-ups | 🟢 Implémentés côté service |
| Génération de documents (17+ types) | 🟢 Complet, streaming OK |
| Audio Overview (podcast + TTS) | 🟡 Génère bien, ⚠️ statut disque possiblement périmé |
| Backup automatique | 🟡 Service complet, ⚠️ `start()` non appelé dans le module |
| Caches intelligents (ResponseCache) | 🔴 Code mort — jamais branchés |
| File de traitement (ProcessingQueue) | 🟢 Correcte (in-memory, perdue au restart) |
| Tests frontend | 🟢 Bonne couverture de caractérisation |

---

## 2. Matrice de fonctionnalités

### Côté serveur (vérifié en lisant le code)

| Fonctionnalité | Fichier | État | Remarques |
|---|---|---|---|
| CRUD notebooks, persistance débouncée 1,5 s | NotebookManager | 🟢 | `flushAll()` à appeler au shutdown |
| Gestion notes (pin, update, delete) | NotebookManager | 🟢 | OK |
| Historique chat plafonné à 200 messages | NotebookManager | 🟢 | OK |
| Sources : ajout/suppression + cleanup embeddings | NotebookManager | 🟢 | OK |
| Ingestion PDF (pdf-parse) | SourceIngester | 🟢 | OK, erreurs gérées |
| Ingestion image via Vision (Gemini) + fallback | SourceIngester | 🟢 | Fallback textuel propre |
| Ingestion URL (Puppeteer + fallback fetch) | SourceIngester | 🟡 | **Fuite de browser si `goto` échoue** (pas de `finally`) |
| Ingestion YouTube | SourceIngester | 🔴 | Type détecté mais **aucune extraction de transcription** → texte de la page scrapé, quasi inutilisable |
| Ingestion dépôt GitHub (arbre + fichiers, batch 5) | SourceIngester | 🟢 | Résumé LLM + fallback, métadonnées riches |
| Chunking sémantique adapté au type (md/pdf/html/texte) | SourceIngester | 🟢 | Overlap, min/max, 300 chunks max — bien conçu |
| Résumé + mots-clés LLM avec fallback | SourceIngester | 🟢 | OK |
| Embeddings OpenRouter, batches 100, retry/delay | EmbeddingStore | 🟢 | Lazy-load, LRU, normes pré-calculées |
| Persistance embeddings débouncée | EmbeddingStore | 🟡 | **Risque de perte : éviction LRU avant flush → index réécrit incomplet** |
| Recherche vectorielle cosinus + cache query | EmbeddingStore | 🟢 | OK |
| RAG hybride : expansion de requête LLM | RAGEngine | 🟢 | Question originale toujours incluse |
| Fusion RRF (0.65 sémantique / 0.35 lexical) | RAGEngine | 🟢 | Normalisation par max, filtres adaptatifs |
| Re-ranking LLM avec 5 stratégies de parsing | RAGEngine | 🟢 | Très défensif, score final 0.4/0.6 |
| TF-IDF avec bonus proximité/coverage | RAGEngine | 🟢 | ⚠️ df par substring vs tf par token (incohérence mineure) |
| Extraction citations `[SOURCE N]` | RAGEngine | 🟢 | Fallback top-3 si pas de citation |
| Chat groundé (ask / askStream / askWithContext) | GroundedChat | 🟢 | ⚠️ question dupliquée dans l'historique du prompt |
| Deep dive (4 étapes, multi-recherches dédupliquées) | GroundedChat | 🟢 | OK |
| Comparaison de sources (2+) | GroundedChat | 🟢 | OK |
| Extraction d'insights | GroundedChat | 🟢 | OK |
| Follow-ups (3 questions) + suggestions (5 questions) | GroundedChat | 🟢 | Parsing JSON strict avec fallback |
| Génération : summary, faq, study-guide, briefing, timeline, outline, mindmap, swot, glossary | ContentGenerator | 🟢 | Prompts détaillés, streaming |
| Rapports spécialisés ×10 + full-report + comparative + synthèse | ContentGenerator | 🟢 | 16 384 tokens pour les rapports |
| Infographie (image OpenRouter → PNG sandbox) | ContentGenerator | 🟡 | **base64 stocké dans le JSON du notebook → fichiers notebooks de plusieurs MB** |
| Visualisation de données (JSON D3 + SVG optionnel) | ContentGenerator | 🟢 | Doc d'erreur propre si JSON illisible |
| Roadmap auto à la création | ContentGenerator | 🟢 | OK |
| Suggestions de rapports (LLM + fallback heuristique) | ContentGenerator | 🟢 | Validation des sourceIds |
| Audio Overview (script 2 hôtes, ton ×4, durée ×3) | ContentGenerator | 🟡 | **Statut muté après `addAudioOverview()` sans re-persist explicite** |
| Backup périodique + incrémental + rotation + restauration | BackupService | 🟡 | **`start()` jamais appelé dans le module** — à vérifier dans le main process |
| File de traitement : concurrence 2, retry backoff, priorités, stats | ProcessingQueue | 🟢 | In-memory → perdue au restart (assumé) |
| Cache LRU + similarité Jaccard + invalidation | ResponseCache | 🔴 | **Jamais importé/utilisé par GroundedChat ou RAGEngine — code mort** |

### Côté frontend (vérifié via composants + tests)

| Fonctionnalité | Composant | État | Remarques |
|---|---|---|---|
| Liste/détail notebooks, modale de création | NotebookList, CreateNotebookModal | 🟢 | ⚠️ `fetch` brut au lieu du client API |
| Upload sources (simple, multi, texte, URL) | sources/UploadQueue, useSourceUpload | 🟢 | File d'upload + progression |
| Visionneuse de source (texte/html/image) | SourceViewer | 🟢 | Endpoint `/sources/:id/content` |
| Réindexation / tags / suppression de source | SourcePanel | 🟢 | Endpoints présents côté appels |
| Résumé multi-sources | SourcesSummaryCard | 🟢 | `/sources-summary` |
| Chat streaming SSE + threads + TTS + export + feedback | NotebookChat, chat/* | 🟢 | Architecture découpée, hooks dédiés |
| Panneau génération (file, progression, retry, cancel) | GeneratePanel, generation/* | 🟢 | File client avec états actifs |
| Visionneuse docs générés (copy, export MD, régénération, slides) | DocViewer, SlidePreviewModal (lazy) | 🟢 | Slides via `/generated/:id/slides` |
| Historique générations + ajout aux sources | GeneratedDocsPanel | 🟢 | Types non-prose exclus (bonne garde) |
| Audio Overview : génération, régénération atomique, suppression, export sandbox, lecture TTS | AudioOverviewPanel, audio/* | 🟢 | Régénération "génère puis supprime" — jamais de perte |
| Notes (panneau + canvas) | NotesPanel, NotesCanvas | 🟢 | CRUD notes complet |
| Mermaid (mindmap, etc.) | MermaidDiagram | 🟢 | Rendu dédié |
| Import GitHub (mes repos/recherche/URL directe, token, filtres) | GitHubRepositoryImportModal (lazy) | 🟢 | ⚠️ `loadMyRepos` dépend de `selectedRepo` → rechargements superflus |
| Client API + SSE + useResource | api/* | 🟢 | AbortController, erreurs typées ApiError |

---

## 3. 🔴 Problèmes critiques (à corriger en priorité)

1. **Caches sémantiques jamais branchés** — `chatResponseCache` et `ragSearchCache` (ResponseCache) sont exportés dans `index.ts` mais **aucun service ne les utilise** (GroundedChat et RAGEngine ne les importent pas). La feature "cache intelligent + invalidation" est inopérante de bout en bout.
2. **`backupService.start()` non appelé dans le module** — le singleton est créé mais rien dans les fichiers fournis ne démarre les backups automatiques. Si le main process ne l'appelle pas explicitement, **aucun backup n'a jamais lieu**.
3. **Fuite de navigateurs Puppeteer** — dans `SourceIngester.ingestFromURL`, `browser.close()` n'est pas dans un `finally`. Si `page.goto` échoue (timeout 30 s), le process Chrome reste zombie.
4. **Perte d'embeddings possible (LRU + debounce)** — `EmbeddingStore.enforceMemoryLimit()` peut évincer des vecteurs **modifiés mais pas encore flushés** (fenêtre de debounce 1,5 s) ; `flushNotebook()` réécrit alors un index incomplet sur disque → embeddings perdus définitivement.
5. **Ingestion YouTube factice** — le type `youtube` est détecté mais aucune transcription n'est extraite ; on scrape la page YouTube via Puppeteer (contenu quasi vide). La fonctionnalité est en réalité **non fonctionnelle**.

## 4. 🟡 Problèmes moyens

6. **Statut Audio Overview potentiellement périmé sur disque** — `generateAudioOverview()` appelle `addAudioOverview()` (status `generating`), puis mute l'objet (`status = "ready"`), **sans re-persistance explicite**. L'écriture disque ne survient que si une autre mutation du notebook déclenche le debounce. Après un restart, un podcast prêt peut apparaître « generating ».
7. **Base64 des infographies stocké dans le notebook** — `generateInfographic()` sérialise l'image entière en base64 dans `content` du document. Les fichiers `notebooks/*.json` peuvent atteindre plusieurs Mo, ralentissant chaque loadAll/persist/backup.
8. **`flushAll()` non câblé visiblement** — ni `NotebookManager.flushAll()` ni `EmbeddingStore.flushAll()` ne sont appelés dans `index.ts`. Sans hook shutdown (à vérifier dans le process principal), toute mutation des 1,5 dernières secondes est perdue à la fermeture.
9. **Question dupliquée dans le prompt chat** — `ask()`/`askStream()` sauvegardent le message utilisateur **avant** de construire l'historique (`slice(-6)`), qui contient donc déjà la question, puis la question est re-appendue en section dédiée. Doublon systématique dans le prompt.
10. **Incohérence de scoring TF-IDF** — le document frequency est calculé par *substring* (`content.includes(token)`) alors que le term frequency utilise la *tokenisation* (égalité stricte). Scores légèrement biaisés.
11. **Endpoints non vérifiables** — les routes HTTP ne sont pas dans les extraits. Le frontend appelle ~20 endpoints (threads, save-message, feedback, export, tags, reindex, slides, tts, sandbox/folders, codebase, github/*) dont l'existence ne peut être confirmée ici.
12. **Incohérence client HTTP frontend** — `CreateNotebookModal` et `GitHubRepositoryImportModal` utilisent `fetch` brut, alors que le reste du module passe par `api()`/`apiVoid()` (erreurs normalisées, `ApiError`). Comportement d'erreur incohérent.

## 5. 🟢 Points mineurs

- `expandQuery()` : bloc `if` vide avec commentaire (`{ // condition }`) — fonctionne mais illisible.
- `getAllNotebooks(workspaceId)` exclut les notebooks sans `workspaceId` : après migration, les anciens notebooks disparaissent des vues workspace (comportement voulu ? à confirmer).
- `loadMyRepos` (modal GitHub) : dépendance `useCallback` sur `selectedRepo` → rechargement de la liste à chaque changement de sélection.
- `rawText` tronqué à 500 000 chars mais chunks calculés sur le texte complet → le viewer peut montrer moins que ce que le RAG cite.
- Détection de langue fr/en rudimentaire (comptage de mots courants) — acceptable.
- ProcessingQueue in-memory : une file d'uploads en cours est perdue au restart (documenté dans le code, assumé).

---

## 6. Couverture de tests (frontend)

Bons tests de **caractérisation** présents pour : AudioOverviewPanel (POST + toast + refresh), GeneratePanel (refus sans source, POST `/generate/stream`, frame `document`), NotebookChat, SourcePanel, SourceListFull, api/client, api/sse, api/useResource. Les mocks (`mockFetchRouter`, `sseResponse`) verrouillent bien les contrats d'API.

**Manquent :** tests serveur (aucun `*.test.ts` côté `notebooks/` serveur dans les extraits) — le RAG, le chunking, le backup et le chat n'ont pas de filet de sécurité automatisé.

## 7. Plan d'action recommandé

1. **Brancher ou supprimer les caches** (`chatResponseCache`, `ragSearchCache`) dans GroundedChat/RAGEngine — sinon supprimer le fichier.
2. **Vérifier le démarrage du backup** (`backupService.start()` + hook shutdown appelant les trois `flushAll()`).
3. **Corriger la fuite Puppeteer** : envelopper dans `try/finally { await browser.close(); }`.
4. **Flush avant éviction LRU** dans `EmbeddingStore.enforceMemoryLimit()`.
5. **Persister le statut de l'Audio Overview** après génération (`notebookManager.persistNotebook()`).
6. **Déplacer le base64 des infographies** hors du notebook (fichier sandbox + chemin seulement).
7. **Décider du sort de YouTube** : soit intégrer une vraie API de transcription, soit retirer le type.
8. **Harmoniser le client HTTP** frontend (tout passer par `api()`).
9. **Ajouter des tests serveur** : chunking, TF-IDF/RRF, extraction de citations, rotation des backups.
10. **Auditer les routes HTTP** (fichier manquant) pour valider les ~20 endpoints frontend non vérifiables.

---

*Audit réalisé sur la base intégrale des deux dumps fournis (serveur : 11 fichiers lus en entier ; frontend : lecture ciblée des orchestrateurs, hooks, client API et inventaire exhaustif des endpoints appelés).*

---

## 8. 🆕 Mise à jour après réception du dump complet `Leanna-ide` (output.md)

⚠️ **Limite technique :** le dump fait **11,8 Mo** et dépasse la limite de fichier de l'environnement (4 Mo). Seuls les ~86 000 premiers caractères ont pu être lus : l'arborescence complète du projet, `.env.example`, et le début de `API_DOCS.md`. **Le code des routeurs `server/routes/notebooks/*` n'a pas pu être relu** — les conclusions ci-dessous reposent sur la structure et la doc, pas sur le code des routes.

### 8.1 Ce que le dump complet confirme (et améliore)

| Point précédemment en doute | Statut mis à jour |
|---|---|
| ~20 endpoints frontend « invérifiables » | 🟢 **Amélioré** — la structure confirme l'existence de **tous les routeurs** : `notebooksCrudRouter`, `sourcesRouter`, `chatRouter`, `contentRouter`, `audioRouter`, `notesRouter`, `embeddingsRouter`, `backupRouter`, `cacheRouter`, `queueRouter`, `slidesTheme`. Les endpoints appelés par le frontend ont donc bien des fichiers de route dédiés. |
| Cache jamais branché (critique #1) | 🟡 **Nuancé** — un `cacheRouter.ts` dédié existe dans les routes. Il pourrait brancher `chatResponseCache`/`ragSearchCache` ou juste exposer des stats. **Vérification du code du routeur nécessaire.** |
| `backupService.start()` jamais appelé (critique #2) | 🟡 **Nuancé** — un `backupRouter.ts` existe (donc des endpoints de backup/restore), mais rien ne prouve que le **timer automatique** est démarré au bootstrap. À vérifier dans `server-bootstrap.ts` / `server.ts` (non lisibles). |
| `flushAll()` au shutdown (point moyen #8) | 🔴 **Inchangé** — `server/lifecycle.ts` existe dans l'arborescence, bon signe, mais son contenu reste à vérifier. |
| Endpoints TTS (`/api/tts/speak`, `/speak-stream`) | 🟢 **Confirmé** par API_DOCS. |
| `/api/tokens` (sauvegarde du token GitHub) | 🟢 **Confirmé** par API_DOCS (clé `GITHUB_TOKEN` autorisée, chiffrée au repos). |
| `/api/github/*` (user, repos, search) | 🟢 **Confirmé** par API_DOCS (routes `/repos`, `/search`) — mais `/github/user`, `/repo-info`, `/repo-files`, `/ingest-repository` **ne sont pas documentés** (le routeur `github.ts` existe). |

### 8.2 Nouveaux constats tirés du dump complet

1. **API_DOCS.md est obsolète côté notebooks.** La doc ne documente que 5 endpoints notebooks (`GET/POST /api/notebooks`, `GET/DELETE /:id`, `sources/upload`, `chat`, `embeddings/reindex`) alors que le frontend en appelle ~40 (threads, deep-dive, insights, compare, generated, slides, notes, tags, reindex, audio-overviews…). La doc est en retard sur le code — risque de mauvais usage de l'API par des intégrations tierces.
2. **Architecture cohérente avec les modules** : `server/notebooks/` (services) ↔ `server/routes/notebooks/` (11 routeurs) ↔ `src/components/notebooks/` (UI). Le découpage en routeurs dédiés (audio, backup, cache, chat, content, embeddings, crud, notes, queue, sources) correspond exactement aux familles d'endpoints appelées par le frontend — aucun endpoint appelé ne semble orphelin au niveau structurel.
3. **Sécurité confirmée** : toutes les routes `/api/*` (sauf health) exigent le header `x-leanna-token` avec comparaison en temps constant ; les WebSockets (`/notebook-live`, `/sandbox-watch`, `/autonomy`) valident le token via cookie. Les rate limits sont documentées sur les endpoints sensibles (upload, chat, reindex).
4. **Puppeteer** : `.env.example` documente `PUPPETEER_EXECUTABLE_PATH` / `PUPPETEER_SKIP_DOWNLOAD` — la fuite de browser (critique #3) reste d'actualité, le bug étant dans le code du service, pas dans la config.
5. **Variables d'environnement cohérentes** : `OPENROUTER_API_KEY`, `OPENROUTER_EMBEDDING_MODEL`, `GITHUB_TOKEN` existent bien dans le schéma `.env` — les dépendances externes du module notebooks sont toutes prévues.

### 8.3 Ce qui reste à vérifier (code non accessible)

Pour terminer l'audit à 100 %, il faudrait me fournir le contenu de :
1. **`server/routes/notebooks/cacheRouter.ts`** → le cache est-il vraiment branché ? (critique #1)
2. **`server/routes/notebooks/backupRouter.ts`** + **`server-bootstrap.ts`** → `backupService.start()` et `flushAll()` au shutdown (critiques #2 et #8)
3. **`server/lifecycle.ts`** → hook de fermeture propre
4. **`server/routes/github.ts`** → endpoints `user` / `repo-info` / `repo-files` / `ingest-repository` réellement implémentés (le frontend les appelle mais la doc ne les liste pas)
5. **`server/routes/notebooks/chatRouter.ts`** → confirme l'usage (ou non) des caches dans le flux chat, et la persistance du statut audio-overview

💡 **Astuce :** le dump complet dépasse la limite de 4 Mo. Pour la prochaine itération, envoie uniquement les fichiers listés ci-dessus (ils font quelques dizaines de Ko au total), ou découpe le dump en plusieurs parties sous la limite.

---

## 9. ✅ Conclusions définitives (après lecture des 5 routeurs/lifecycle/bootstrap)

### 9.1 Points critiques — verdict final

| # | Point | Verdict final |
|---|---|---|
| 1 | **Caches jamais branchés** | 🔴 **Confirmé.** `cacheRouter.ts` n'expose que des stats/clear/invalidate (`/cache/stats`, `/cache/clear`, `/cache/:notebookId`). Or `GroundedChat.ask()`/`askStream()` et `RAGEngine.searchHybrid()` **n'utilisent jamais** `chatResponseCache`/`ragSearchCache` (aucune lecture/écriture). Conséquence : `/cache/stats` renverra toujours `{entries: 0, hits: 0, misses: 0}` — les stats et l'invalidation sont cosmétiques. Le cache intelligent reste du code mort de bout en bout. |
| 2 | **`backupService.start()` non appelé** | 🔴 **Confirmé (sauf cas particulier).** Ni `server-bootstrap.ts` ni `lifecycle.ts` n'appellent `start()`. Le `backupRouter` ne déclenche le timer que si l'on fait un `PATCH /backup/config` avec `enabled: true` (le service fait `stop()` puis `start()` à ce moment-là). **Sans action manuelle de l'utilisateur, aucun backup automatique n'a jamais lieu.** |
| 3 | Fuite Puppeteer | 🔴 Inchangé (bug côté service `SourceIngester`). |
| 4 | Perte d'embeddings LRU/flush | 🟡 **Atténué.** `lifecycle.ts` appelle bien `embeddingStore.flushAll()` à l'arrêt gracieux. Le risque résiduel reste l'éviction LRU en cours d'exécution (flush incomplet sur disque pendant le run), mais le shutdown est propre. |
| 5 | YouTube factice | 🔴 Inchangé. |
| 8 | `flushAll()` au shutdown | 🟢 **Résolu.** `lifecycle.ts` flushe `notebookManager.flushAll()` et `embeddingStore.flushAll()` sur SIGTERM/SIGINT/beforeExit, et expose `process.__LeannaShutdown` pour Electron. Conception propre. ⚠️ Note : `backupService.stop()` n'est pas appelé au shutdown — sans conséquence tant que le timer n'est pas démarré, mais à ajouter quand le point #2 sera corrigé. |

### 9.2 Nouveaux constats sur `chatRouter.ts`

6. **`POST /:id/chat/feedback` est un stub** — l'endpoint renvoie `{status: "success", messageId, feedback}` mais **ne persiste rien** (aucun stockage du feedback). Le frontend l'appelle, l'utilisateur croit que son vote est enregistré — il est perdu.
7. **Duplication messages threads vs chatHistory** — `askStream()` pousse les messages dans `notebook.chatHistory` (via `addChatMessage`) **et** dans le `thread.messages` (dans le routeur). Résultat : les échanges d'un thread apparaissent aussi dans l'historique global, et le prompt du chat (qui lit `chatHistory`) mélange tous les threads.
8. **Les threads ne sont pas isolés** — `ask()`/`askStream()` construisent toujours le contexte depuis `notebook.chatHistory` (tous threads confondus), jamais depuis les messages du thread appelant. La fonctionnalité « threads de conversation » est donc cosmétique côté contexte.
9. **Coût LLM caché** — chaque `chat/stream`, `deep-dive`, `compare` et `insights` appelle systématiquement `generateFollowUps()` (un appel LLM supplémentaire par requête), même si le client n'affiche pas les follow-ups.
10. **Sauvegarde de message (save-message) : sanitisation partielle** — `folder.replace(/\.\../g, "")` retire les `..`, mais ne canonicalise pas le chemin (contournement possible via encodages/slashes). Risque faible (token requis), mais un `path.resolve` + vérification de préfixe serait plus sûr.
11. **IDs non normalisés** — threads (`thread-${Date.now()}-${random}`) et messages (`msg-${Date.now()}-u`) utilisent `Date.now()` alors que le reste du module utilise des UUID. Collision possible à la milliseconde, style incohérent.
12. **Bonnes implémentations confirmées** : export markdown du chat, chunk viewer, save-message en sandbox avec citations, SSE avec `event: start/chunk/done/error` proprement gérés (y compris erreur post-headers), gestion 400/404/500 rigoureuse.

### 9.3 Synthèse de l'audit final

**Fonctionnel de bout en bout (vérifié) :** CRUD notebooks, sources, notes, chat stream + threads (stockage), deep-dive, compare, insights, export, follow-ups, suggestions, génération de documents, audio overview, TTS, save-message, flush au shutdown, gestion des erreurs SSE.

**Cassé ou factice (à corriger) :**
1. Cache intelligent : jamais branché (stats toujours vides) — brancher dans `GroundedChat.ask()` ou supprimer
2. Backup auto : timer jamais démarré au bootstrap
3. Feedback chat : stub non persistant
4. Threads : non isolés dans le contexte RAG + duplication dans chatHistory
5. Fuite Puppeteer + YouTube factice (côté service)

**Recommandation prioritaire :** dans `server.ts`, ajouter au démarrage `backupService.start()` (et `backupService.stop()` dans `lifecycle.ts`), puis brancher les caches dans `GroundedChat` — deux corrections de ~10 lignes chacune qui activent deux fonctionnalités déjà entièrement écrites.