## Analyse des dépendances, duplications et modules extraits — Audit v2

> **Date de mise à jour :** 2026-08-26
> **État actuel de `server.ts` : 708 lignes** (contre 813 lignes à la v1 — soit 105 lignes supplémentaires extraites, et une réduction totale de ~80% depuis les ~3470 lignes initiales)

---

### 0. Ce qui a été IMPLÉMENTÉ depuis la v1 (section actualisée)

Cette section remplace les « Prochains modules à extraire » de la v1 par l'état réel après implémentation.

#### ✅ 0.1 Extractions et refactorings TERMINÉS

| Tâche | État | Fichier(s) | Impact sur `server.ts` |
|-------|------|------------|------------------------|
| **Regroupement des routeurs knowledge dans un dossier** | ✅ Terminé | `server/routes/knowledge/index.ts` + `knowledgeRouter.ts`, `memoryRouter.ts`, `impactRouter.ts`, `understandingRouter.ts` | Réduit la racine `routes/` de 3 fichiers. Import agrégé unique : `import { knowledgeRouter, memoryRouter, impactRouter, understandingRouter } from "./server/routes/knowledge"` |
| **Extraction des rate limits + middlewares statique/compression** | ✅ Terminé | `server/config/rateLimits.ts` | ~80 lignes gagnées. Expose `createRateLimitBundle(deps)`, `applyGlobalRateLimits(app, bundle, deps)` et `applyStaticAndCompression(app, deps)`. Inclut `notebookChatLimiter`, `notebookEmbeddingLimiter`, skip local, compression, fichiers statiques (Monaco, workspace-preview). |
| **Extraction du graceful shutdown** | ✅ Terminé | `server/lifecycle.ts` | ~40 lignes gagnées. Expose `setupGracefulShutdown(deps)` avec typage fort `GracefulShutdownDeps` : ferme les sessions Gemini Live, les WSS, stop `runtimeV2`, `observability`, les timers workflows/scheduled, le `KnowledgeGraph`, `ProjectMemory`, `McpBridge`. Les signaux `SIGTERM/SIGINT/beforeExit` y sont internes. |
| **Déplacement route inline `POST /api/verify-exit-code`** | ✅ Terminé | Exporté dans `server/routes/sandbox.ts` → `createVerifyExitCodeRouter()`. Monté sur `/api` via `server.ts` L469. | Plus aucune route inline sandbox dans `server.ts`. |
| **Déplacement route inline `POST /api/workspace`** | ✅ Terminé | Déjà dans `server/routes/workspace.ts` (GET + POST — POST renvoie 403 IDE auto-référentiel). | 0 routes inline REST dans `server.ts`. Il reste uniquement le `Global Error Handler` et la wildcard `*all` (dist/) qui doivent rester dans le point d'entrée Express. |
| **Correction TypeScript globale** (erreurs 7006 / 7030 / 6133) | ✅ Terminé | `knowledgeRouter.ts`, `sandbox.ts`, `server.ts`, `workspace.ts` | Toutes les erreurs initialement remontées par l'IDE sur ces 4 fichiers sont éliminées : typage des callbacks `.map()`, normalisation `res.status(...).json(...); return;` au lieu de `return res.status(...)`, purge des 26 imports/symboles inutilisés. |
| **Normalisation des handlers de route** | ✅ Terminé | Tous les `router.METHOD` de `knowledgeRouter.ts` et `sandbox.ts` concernés | Les handlers mixtes qui utilisaient parfois `return res.status(...)` et parfois `res.json(...)` **sans return** ont été normalisés avec un type de retour explicite (`void` / `Promise<void>`) et une instruction `return;` après envoi de réponse, éliminant les `TS7030 "Not all code paths return a value"`. |

#### ✅ 0.2 Fonctionnalités critiques implémentées

##### 🛡️ Système de contrôle de navigation et inspection du navigateur pour Leanna
- **Skills ajoutées** dans `server/skills/browser.ts` : `browser_snapshot`, `browser_inspect`, `browser_click`, `browser_type`.
- **Backend → Frontend** : pattern `emitIdeAction` → WebSocket → consolidation `ide-action` dans `useLiveAPI.ts` (switch statement) → injection dans `BrowserPanel.tsx` (IPC webview) → callback vers API.
- **Routes de retour** dans `server/routes/browser.ts` : `POST /api/browser/content-result` + `POST /api/browser/action-result`, qui résolvent les promesses stockées dans `browserReadPending` et `browserActionPending` (deux `Map<string, ...>` partagées entre `server.ts` et `LiveSocketHandler.ts`).
- **Chaque événement browser porte un `requestId`** pour mapper le résultat côté skill à la promesse correspondante.

##### 🔁 Reconnexion automatique après expiration de session Gemini Live
- **Gestion `GoAway` et `context_overflow`** dans `server/live/LiveSocketHandler.ts` (L532+).
- **Fermeture proactive WebSocket** des deux côtés (backend + frontend) pour déclencher `onclose` (sinon la socket restait ouverte malgré la fin de session, et la reconnexion auto ne partait jamais).
- **Délais de sécurité + drapeaux anti-double-close** pour éviter les appels redondants à `.close()`.
- **Résumé LLM garanti via `finally`** : la génération d'un résumé avant redémarrage est toujours exécutée, même si la fermeture socket échoue.

##### 💰 Budgets de tokens Gemini Live (évite le quota exceeded à 253k)
- **Plafond global prompt système** : `INITIAL_PROMPT_MAX_TOKENS = 60_000` (~240k chars) dans `server/live/LiveSocketHandler.ts` L401.
- **Budgets par composant** (hiérarchie de troncature en cas d'overflow) :
  - Notebooks (max 15k tokens / 60k chars — max 5 notebooks, 5 sources par notebook)
  - Knowledge (3k tokens)
  - Mémoire (2k tokens)
  - SystemText (reste)
- **Privilégie les `summary` des sources au texte brut** (`rawText`) lors de l'injection.
- **Résout le bug critique** où l'injection brute de notebooks consommait ~253k tokens et faisait échouer immédiatement les sessions Gemini Live par `quota exceeded`.

##### 🔐 Sécurité : authentification sur TOUTES les routes `/api/*`
- **Bug corrigé** : historiquement `requireAuth` n'était appliqué qu'à une poignée de routes `/api/ide/*` et `/api/upload-document`. Toutes les autres (Gemini keys, tokens, workspace, git, workflows, mémoires, conversations…) étaient accessibles sans jeton, même quand `JARVIS_API_TOKEN` était défini.
- **Maintenant** : `app.use("/api", requireAuth);` est monté APRÈS `/api/health` (qui reste publique) mais AVANT tous les autres routeurs.
- Écoute HTTP sur `127.0.0.1` par défaut au lieu de `0.0.0.0`, avec refus de démarrage si `0.0.0.0` est utilisé sans `JARVIS_API_TOKEN`.

---

### 1. Cartographie des dépendances entre routeurs et services (mise à jour)

| Routeur | Dépendances directes | Observations |
|---------|---------------------|--------------|
| `knowledge/knowledgeRouter.ts` | `knowledgeGraph`, `projectIndexer`, `projectMemory`, `understandingEngine`, `dependencyGraph`, `learningEngine`, `fileWatcher`, `DocumentStore`, `documentExtractor`, `SELF_ROOT`, `sandbox` | Ajout des routes `/documents` et `/documents/search` depuis la v1. |
| `knowledge/memoryRouter.ts` | `projectMemory` | Sous-routeur `/api/knowledge`. |
| `knowledge/impactRouter.ts` | `impactAnalyzer` | Sous-routeur `/api/knowledge`. |
| `knowledge/understandingRouter.ts` | `understandingEngine` | Sous-routeur `/api/knowledge`. |
| `notebooks.ts` | `notebookManager`, `sourceIngester`, `groundedChat`, `contentGenerator`, `embeddingStore`, `backupService`, `sourceProcessingQueue`, `chatResponseCache`, `ragSearchCache` | **⚠️ Encore 2926 lignes.** Principal point de dette technique. |
| `sandbox.ts` | `utils/sandbox`, `utils/sandboxWatcher`, `audit`, `SELF_ROOT` | **Exporte aussi `createVerifyExitCodeRouter()`** (la route `/api/verify-exit-code` n'est plus inline). |
| `browser.ts` | `browserReadPending`, `browserActionPending` (Maps partagés) | Routes `/content-result` et `/action-result` pour résoudre les promesses skills. |
| `workspace.ts` | `getWorkspaceRoot`, `SELF_ROOT`, `isSandboxActive` | **Contient maintenant aussi `POST /api/workspace`** (403 auto-référentiel). |
| `self-root.ts` | `switchSandboxProject`, `requestConfirmation`, `knowledgeGraph`, `projectMemory`, `projectIndexer`, `wss` | Dépendances larges mais rôle critique. |
| `ide.ts` | `resolveWorkspacePath`, `isSandboxActive`, `getSandboxRoot`, `markFileModified`, `assertSandboxReady`, `appendAuditEvent` | Routeur IDE volumineux. |
| `custom-agents.ts` | `SELF_ROOT`, `fs`/`path` (.jarvis/custom-agents.json) | Persistance JSON locale. |
| `health.ts` | Aucune | Publique, non protégée par `requireAuth`. |
| Routes V2 Runtime | `runtimeV2` | `/api/v2/agents`, `/api/v2/metrics`. |

**État des routes inline dans `server.ts` :**
- ✅ **Aucune route métier inline** ne reste.
- Ce qui reste dans `server.ts` : le `Global Error Handler` Express (doit être le dernier middleware enregistré) et la wildcard `app.get('*all', ...)` pour servir `dist/index.html` en production. Ces deux éléments **doivent** rester dans le point d'entrée.

---

### 2. Duplications identifiées (inchangé, à traiter)

#### 2.1. Chevauchement `server/mission/` ↔ `server/runtime/`

Comme documenté dans `ADR-001-orchestration-unification.md`, deux systèmes d'orchestration coexistent toujours :
- **`mission/`** : niveau cognitif (Planner, Executor, Reflection, SkillScorer) — piloté par l'IA.
- **`runtime/`** : niveau infrastructure (ToolRegistry, EventBus, WorkflowEngine, StateMachine) — exécution déterministe.

**Points notables :**
- `server/runtime/bootstrap.ts` **existe toujours mais n'est toujours pas branché** dans `server.ts` — qui initialise le Runtime V2 à la main via `createRuntime()`, `Observability`, et un `setTimeout(..., 3000)` pour le mirroring des skills.
- Le mirroring SkillManager → ToolRegistry est **fonctionnel** (L239-265 environ) mais passer par `bootstrapRuntime()` éliminerait ~30 lignes de setup manuel.

#### 2.2. Skills redondantes / chevauchement fonctionnel

Inchangé depuis la v1 :
- `codebase` vs `browser` vs `automation` (Puppeteer headless vs navigateur visible IPC)
- 4 couches de mémoire distinctes : `memories.ts` (Supabase long terme), `memoryRouter.ts` (`ProjectMemory` JSON projet), `skills/memory.ts`, `skills/project.ts`

---

### 3. Modules RESTANT à extraire / améliorer (roadmap mise à jour)

Les « actions HAUTE priorité » de la v1 sont **toutes terminées**. Voici ce qui demeure, trié par impact :

#### 3.1. 🔴 Priorité HAUTE — Impact maximal / dette la plus visible

##### 🚨 Découper `notebooks.ts` (2926 lignes)
Le plus gros fichier routeur du projet. Dépend de ~8 sous-modules `notebooks/`.  
**Découpage recommandé** :
```
server/routes/notebooks/
  ├── index.ts            (export { createNotebooksRouter })
  ├── chatRouter.ts       POST /:id/chat, GET /:id/messages
  ├── sourcesRouter.ts    upload/reextract/search embeddings
  ├── notesRouter.ts      CRUD notes
  ├── generationRouter.ts  generate_content, presentations
  └── audioRouter.ts      tts, audio streaming
```

**Gain estimé** : chaque sous-routeur ~400-600 lignes, testabilité drastiquement améliorée.

##### 🔌 Brancher `server/runtime/bootstrap.ts` dans `server.ts`
- Fonction `bootstrapRuntime()` existe déjà, fait le travail proprement.
- Remplacerait ~30 lignes d'init manuelle Runtime V2 + Observability + setTimeout mirroring.
- Uniformise le démarrage.

#### 3.2. 🟡 Priorité MOYENNE

##### 🏗️ Appliquer l'ADR-001 : unifier `mission/` et `runtime/`
Supprime la duplication d'orchestration. Faire de `mission/` un plugin du Runtime V2, utiliser `ToolRegistry` comme source unique d'exécution (au lieu que `mission/Executor` appelle `SkillManager.handleToolCall` en contournant les métriques/timeouts).

##### 🪵 Extraire l'initialisation WebSocket (init + upgrade handler)
Déplacer la création de `WebSocketServer` + le `server.on('upgrade', ...)` (actuellement ~45 lignes dans `server.ts`) vers un `server/websocket/index.ts` qui expose :
```ts
export function attachWebSocketServers(server, deps): { wss, sandboxWss }
```
La logique métier est déjà extraite dans `attachLiveWebSocket()` et `sandbox-watch.ts` ; cette étape ne concerne que le plumbing HTTP upgrade.

##### 🚀 Déplacer la séquence d'init asynchrone vers `server-bootstrap.ts`
Déplacer le bloc async L128-183 environ (`initSelfRoot`, `loadScheduledTasks`, `loadWorkflows`, `ensureAuditWorkflow`, `agentPersistence.restoreFromPersistence`, `projectIndexer.scanAll`, démarrage watchers) vers `server-bootstrap.ts` ou `server/bootstrap/initSequence.ts`.

#### 3.3. 🟢 Priorité BASSE — améliorations qualitatives

- Appliquer la **normalisation TS7030** (type de retour `void`/`Promise<void>` + `return;` après envoi de réponse) aux **autres routeurs** qui ont encore le même pattern mixte (`agents.ts`, `automation.ts`, `browser.ts`, `checkpoint.ts`, `conversations.ts`, `custom-agents.ts`, `custom-skills.ts`, `export.ts`, `gemini-keys.ts`, `github.ts`, `ide.ts` — révélés par `tsc --noEmit`).
- Créer des interfaces TypeScript partagées pour les résultats de recherche de documents (`DocumentSearchResult`), etc., pour éviter les callbacks `.map((d: any) => ...)`.
- Unifier l'API des 4 couches de mémoire derrière une interface commune.

---

### 4. Plan d'action priorisé MIS À JOUR

| Priorité | Action | Bénéfice estimé |
|----------|--------|-----------------|
| **🔴 Haute** | Découper `notebooks.ts` (2926 lignes) en sous-routeurs | Réduit le plus gros fichier projet, améliore la testabilité DRAMATIQUEMENT |
| **🔴 Haute** | Brancher `bootstrapRuntime()` pour initialiser Runtime V2 + SkillManager | Élimine ~30 lignes d'init manuelle, utilise le code déjà écrit |
| **🟡 Moyenne** | Appliquer ADR-001 : unifier `mission/` et `runtime/` | Supprime la duplication d'orchestration, architecture claire |
| **🟡 Moyenne** | Extraire init WebSocket dans `server/websocket/index.ts` | ~45 lignes gagnées, isole le plumbing d'upgrade |
| **🟡 Moyenne** | Déplacer séquence d'init asynchrone vers `server-bootstrap.ts` | Isole le démarrage, rend `server.ts` plus déclaratif |
| **🟢 Basse** | Normaliser handlers `TS7030` sur routeurs restants | Cohérence TypeScript globale |
| **🟢 Basse** | Interfaces partagées pour éviter `any` dans callbacks map | Type safety accru |
| **🟢 Basse** | Interface unifiée pour les 4 couches de mémoire | Réduit duplication API mémoire |

---

### 5. Conclusion — État de l'art

#### ✅ Ce qui est DÉJÀ terminé (depuis la v1)
- ✅ Toutes les routes métier inline extraites de `server.ts`
- ✅ Rate limits + middlewares statiques/compression → `server/config/rateLimits.ts`
- ✅ Graceful shutdown + signaux → `server/lifecycle.ts`
- ✅ 4 routeurs knowledge regroupés dans `server/routes/knowledge/` avec `index.ts`
- ✅ Authentification sur TOUTES les routes `/api/*` (sauf `/health`)
- ✅ Écoute HTTP sur `127.0.0.1` (sauf export explicite + jeton)
- ✅ Système browser skills (snapshot/inspect/click/type) + Maps `browserReadPending`/`browserActionPending` + routes `/content-result` et `/action-result`
- ✅ Reconnexion auto après GoAway / context_overflow (fermeture proactive WS)
- ✅ Budgets de tokens Gemini (60k max, troncature hiérarchisée notebooks → memory → system)
- ✅ Erreurs TypeScript des fichiers critiques corrigées

#### 🎯 Objectif à court terme (prochaines étapes)
1. Brancher `bootstrapRuntime()` (existe, ~5 lignes de changement)
2. Découper `notebooks.ts` (gros travail, ROI maximal)
3. Appliquer ADR-001 (unification mission/runtime)

**Résultat attendu :** `server.ts` réduit à **~600 lignes** (contre 708 aujourd'hui), avec une architecture où chaque préoccupation est dans son module dédié, et le point d'entrée Express n'est plus qu'un assembleur déclaratif.
