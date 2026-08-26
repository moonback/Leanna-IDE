## Analyse des dépendances, duplications et prochains modules à extraire

### 1. Cartographie des dépendances entre routeurs et services

Après analyse du code et de l’architecture, voici une vue synthétique des dépendances principales entre les routeurs Express et les services/modules du backend.

| Routeur | Dépendances directes (services internes) | Observations |
|---------|------------------------------------------|--------------|
| `agents.ts` | `SkillManager`, `agentOrchestrator`, `agentMessageBus`, `agentPersistence`, `COLLABORATION_PATTERNS`, `DELEGATION_MATRIX` | Routeur mature, bien découplé. |
| `notebooks.ts` | `notebookManager`, `sourceIngester`, `groundedChat`, `contentGenerator`, `embeddingStore`, `backupService`, `sourceProcessingQueue`, `chatResponseCache`, `ragSearchCache` | Très gros routeur (~1500 lignes). Dépend de presque tout le module `notebooks/`. |
| `knowledge.ts` | `knowledgeGraph`, `projectIndexer`, `projectMemory`, `understandingEngine`, `dependencyGraph`, `learningEngine`, `fileWatcher`, `DocumentStore`, `documentExtractor` | Agrège les fonctionnalités du système de connaissance. |
| `sandbox.ts` | `utils/sandbox`, `utils/sandboxWatcher`, `audit`, `SELF_ROOT` | Routeur dédié, bien isolé. |
| `checkpoint.ts` | `utils/checkpoint` | Léger, bien isolé. |
| `gemini-keys.ts` | `utils/geminiKeyPool` | Léger, bien isolé. |
| `browser.ts` | `browserReadPending`, `browserActionPending` (Maps partagés avec LiveSocketHandler) | Routeur simple, dépend d’un état partagé. |
| `profile.ts` / `tokens.ts` | `getProfile`, `setProfile`, `updateEnvFile`, `validateToken` | Dépendances fonctionnelles. |
| `documents.ts` | `documentAnalyzer`, `documentMemory`, `documentSearchEngine`, `multer` | Bonne isolation. |
| `upload-document.ts` | `multer`, `geminiKeyPool`, `promptInjectionGuard`, `DocumentStore` | Routeur d’upload, dépend de plusieurs utilitaires. |
| `mcp.ts` | `mcpBridge` | Bonne isolation. |
| `workspace.ts` | `getWorkspaceRoot`, `SELF_ROOT`, `isSandboxActive` | Très simple. |
| `self-root.ts` | `switchSandboxProject`, `requestConfirmation`, `knowledgeGraph`, `projectMemory`, `projectIndexer` | Gère le changement de projet. Dépend de nombreux modules. |
| `impact.ts` / `understanding.ts` | `impactAnalyzer`, `understandingEngine` | Bien isolés. |
| `export.ts` | `exportToPdf`, `exportToDocx`, `exportToStandaloneHtml`, `notebookManager` | Bonne isolation. |
| `ide.ts` | `resolveWorkspacePath`, `isSandboxActive`, `getSandboxRoot`, `markFileModified`, `assertSandboxReady`, `appendAuditEvent` | Routeur IDE, dépend de nombreux utils. |
| `audit.ts` | `readAuditEntries`, `analyzeAuditLog`, `getLogEntries` | Bien isolé. |
| `custom-skills.ts` | `getAllCustomSkills`, `createCustomSkill`, etc. | Dépend de `skills/customSkills`. |
| `conversations.ts` | `listConversations`, `getConversationMessages`, etc. | Dépend de `skills/history`. |
| `memories.ts` | `createClient` (Supabase) | Léger. |
| `lists.ts` | `createList`, `getListByName`, etc. | Dépend de `skills/list`. |
| `automation.ts` | `getScheduledTasksSnapshot`, `pauseScheduledTask`, etc. | Dépend de `skills/automation`. |
| `workflows.ts` | `getWorkflowsSnapshot`, `createWorkflow`, etc. | Dépend de `skills/workflow`. |
| `skills.ts` | Aucune dépendance forte (retourne une liste statique) | Simple. |
| `openrouter.ts` | `optimizeMessagesWithLLM`, `getBudgetForModel` | Dépend de `utils/tokenOptimizer`. |
| `summarize-context.ts` | `summarizeWithLLM`, `estimateTokens` | Dépend de `utils/tokenOptimizer`. |
| `tokens-optimization.ts` | `estimateTokens`, `getBudgetForModel`, `buildSystemInstruction` | Dépend de `prompts/systemInstruction`. |
| `generate-agent.ts` | `generateText` | Simple. |
| `tts.ts` | `generateSpeech`, `generateSpeechStreaming`, `getTTSStats`, `clearTTSCache` | Dépend de `utils/geminiTTS`. |
| `safeguards.ts` | `listCheckpoints`, `validateBuild`, `rollbackToCheckpoint` | Dépend de `utils/checkpoint`. |
| `agent-builder.ts` | `handleGenerateAgent` | Simple. |
| `custom-agents-router.ts` | `handleListAgents`, etc. | Dépend de `routes/custom-agents`. |

**Points d’attention :**
- **`notebooks.ts`** est un point de couplage très fort : il centralise toutes les routes liées aux notebooks et dépend de presque tous les sous-modules du répertoire `notebooks/`.
- **`knowledge.ts`** est également un agrégateur important, mais il délègue à des services bien séparés.
- **`self-root.ts`** a des dépendances larges (knowledge, sandbox, etc.), mais son rôle est critique.
- **Routes inline dans `server.ts`** : il reste deux routes définies directement dans `server.ts` (`POST /api/workspace` et `POST /api/verify-exit-code`). Elles devraient être déplacées dans des routeurs dédiés.

---

### 2. Duplications identifiées

#### 2.1. Chevauchement `server/mission/` ↔ `server/runtime/`

Comme documenté dans `plan-action-jarvis-os.md` et `ADR-001-orchestration-unification.md`, il existe deux systèmes d’orchestration :
- **`mission/`** : niveau cognitif (Planner, Executor, Reflection, SkillScorer) — piloté par l’IA.
- **`runtime/`** : niveau infrastructure (ToolRegistry, EventBus, WorkflowEngine, StateMachine) — exécution déterministe.

**Duplication constatée :**
- `mission/Executor` appelait directement `SkillManager.handleToolCall`, contournant les métriques et timeouts du `ToolRegistry`.
- `mission/Reflection` et `runtime/Observability` collectent des métriques similaires.
- `mission/Planner` et `runtime/WorkflowEngine` ont des concepts proches (décomposition, dépendances).

**Recommandation :** suivre l’ADR-001 — faire de `mission/` un plugin du runtime, et utiliser `ToolRegistry` comme source unique d’exécution des outils.

#### 2.2. Skills redondantes / chevauchement fonctionnel

- **`codebase` vs `browser` vs `automation`** : certaines fonctionnalités de navigation web sont présentes dans `automation` (Puppeteer headless) et dans `browser` (navigateur visible via IPC). La logique de capture de sélecteurs est similaire. Une consolidation pourrait être envisagée, mais les contextes d’usage sont différents (headless vs visible).
- **`knowledge` et `documentKnowledge`** : le premier gère la connaissance du code, le second les documents uploadés. Leurs interfaces sont proches (recherche, contexte). Une unification sous un seul « moteur de connaissance » pourrait être pertinente à long terme.
- **`memory` (Supabase) et `ProjectMemory` (fichier JSON)** : deux systèmes de mémoire persistante. Leur rôle est complémentaire (mémoire long terme vs projet), mais leurs APIs sont similaires (addFact, searchFacts). Une interface commune pourrait réduire la duplication.

#### 2.3. Routage : plusieurs routeurs de « connaissance »

- `knowledge.ts`, `memory.ts`, `impact.ts`, `understanding.ts` sont des routeurs séparés, mais ils pourraient être regroupés dans un seul routeur `/api/knowledge` avec des sous-routeurs (ou un seul gros fichier). Actuellement, ils sont montés sur des préfixes différents (`/api/knowledge`, `/api/knowledge/memory`, `/api/knowledge/impact`, `/api/knowledge/understanding`). Cela crée une fragmentation inutile.

#### 2.4. Gestion des logs / audit

- `audit.ts` (routeur) utilise `appendAuditEvent` et `readAuditEntries` de `server/audit.ts`.
- `logs` sont également exposés via `assistant_logs` dans `agents.ts`.
- La duplication est faible, mais il y a une redondance entre l’audit des actions (fichier `.jarvis-audit.log`) et les logs de session (mémoire).

---

### 3. Prochains modules à extraire de `server.ts`

Actuellement, `server.ts` fait ~3470 lignes. Les sprints précédents ont déjà extrait de nombreux routeurs. Il reste :

#### 3.1. Routes inline à déplacer

- **`POST /api/workspace`** : déjà désactivé (retourne 403). Il pourrait être supprimé ou déplacé dans `workspace.ts`.
- **`POST /api/verify-exit-code`** : logique de vérification du code de sécurité sandbox. Cette route pourrait être déplacée dans `sandbox.ts` (ou un nouveau `security.ts`).

**Action :** créer une issue pour déplacer ces deux routes.

#### 3.2. Initialisation du Runtime V2 et du SkillManager

La création du `SkillManager`, du `runtimeV2`, de l’`Observability` et le mirroring des skills se font dans `server.ts`. Cette logique pourrait être extraite dans un module `bootstrap.ts` (comme esquissé dans `server/runtime/bootstrap.ts` mais pas encore utilisé).

**Action :** utiliser `bootstrapRuntime()` depuis `server/runtime/bootstrap.ts` pour centraliser cette initialisation.

#### 3.3. Middlewares et configuration HTTP

- Les rate limiters (`strictLimiter`, `pollingLimiter`, `authLimiter`, `notebookChatLimiter`, etc.) sont définis dans `server.ts`. Ils pourraient être regroupés dans un fichier `config/rateLimits.ts` et appliqués via une fonction.
- La configuration de compression, de limite de taille, et les middlewares d’authentification (`requireAuth`) pourraient également être externalisés.

**Action :** créer un module `server/middleware/index.ts` pour regrouper ces configurations.

#### 3.4. Gestion des fichiers statiques (Monaco, workspace-preview)

- `app.use('/monaco-editor', ...)` et `app.use('/workspace-preview', ...)` pourraient être déplacés dans un routeur `static.ts` ou intégrés à `ide.ts`.

#### 3.5. WebSocket (Live et Sandbox)

- La logique d’attachement des WebSockets (`wss`, `sandboxWss`) est déjà extraite dans `LiveSocketHandler.ts`. Cependant, l’initialisation des serveurs WebSocket et leur rattachement au serveur HTTP se fait encore dans `server.ts`. Cela pourrait être déplacé dans un module `websocket/index.ts`.

#### 3.6. Gestion du cycle de vie (graceful shutdown)

- La fonction `gracefulShutdown` est définie dans `server.ts`. Elle pourrait être extraite dans un module `lifecycle.ts` qui expose `setupGracefulShutdown(server, deps)`.

---

### 4. Plan d’action priorisé

| Priorité | Module à extraire / refactorer | Bénéfice |
|----------|--------------------------------|----------|
| **Haute** | Déplacer les routes inline (`/api/workspace`, `/api/verify-exit-code`) | Réduit `server.ts` de ~30 lignes, améliore la cohérence |
| **Haute** | Extraire les middlewares (rate limiting, auth, compression) dans `middleware/` | Centralise la configuration, facilite les tests |
| **Haute** | Utiliser `bootstrapRuntime()` pour initialiser le runtime V2 | Réduit ~100 lignes, isole la logique d’initialisation |
| **Moyenne** | Unifier `mission/` et `runtime/` (suivre ADR-001) | Supprime la duplication, clarifie l’architecture |
| **Moyenne** | Découper `notebooks.ts` en sous-routeurs (chat, sources, notes, génération, audio) | Réduit la taille du fichier, facilite la maintenance |
| **Moyenne** | Consolider les routeurs de connaissance (`knowledge`, `memory`, `impact`, `understanding`) en un seul module avec sous-routeurs | Réduit la fragmentation, améliore la cohérence |
| **Basse** | Extraire la gestion des WebSockets dans `websocket/index.ts` | Isole la logique de connexion |
| **Basse** | Créer un module `lifecycle.ts` pour le graceful shutdown | Centralise la gestion des arrêts |

---

### 5. Conclusion

Le projet Jarvis-OS a déjà fait un excellent travail de découpage des routeurs. Les principaux points de duplication sont bien documentés (ADR-001) et concernent l’orchestration (`mission` vs `runtime`). Les prochaines étapes consistent à :
1. Déplacer les dernières routes inline.
2. Externaliser les middlewares et l’initialisation du runtime.
3. Découper les gros routeurs (`notebooks.ts`, `knowledge.ts`).
4. Appliquer l’ADR-001 pour unifier l’orchestration.

Ces actions permettront de réduire `server.ts` à moins de 500 lignes et d’améliorer la testabilité et la maintenabilité de l’ensemble.