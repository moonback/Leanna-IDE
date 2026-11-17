# Roadmap — Leanna AI Operating System

> **Mise à jour documentaire : 8 novembre 2026** · **Version du dépôt : 2.4.0** · Licence BUSL 1.1
> **Audit statique ciblé du dépôt main : 8 novembre 2026** ; il complète l'audit
> fonctionnel du 15 octobre sans le remplacer par une validation d'exécution.
>
> Cette roadmap distingue les composants présents, les intégrations partielles,
> les risques identifiés et les évolutions planifiées. Les audits statiques ne
> prouvent ni le comportement en production ni le passage des tests. Les statuts
> historiques R0–R8 restent à revalider lorsqu'une phase est reprise.
>
> **Inventaire et exécution des tests.** L'arbre Git actuel recense **203 fichiers
> backend** `server/**/*.test.ts`, **23 fichiers UI**
> `src/**/*.{test,spec}.{ts,tsx}` et un fichier de test supplémentaire (227 au total). La dernière exécution documentée reste celle
> du 2026-10-15 : `npm test` → **1460 cas / 174 suites · 0 échec** (184 fichiers) ;
> `npm run test:ui` → **90 cas · 0 échec** (18 fichiers). Ces résultats sont
> historiques et n'ont pas été rejoués pendant cette revue documentaire.
>
> Les plugins de rôles vivent sous `server/runtime/agents/` ; `supabase/migrations/`
> contient **14 migrations** ; le décompte d'outils est un **total runtime variable**
> (builtin + MCP + custom), pas une constante.

Leanna est un **OS agentique local-first** : un IDE, un runtime d'agents autonomes et une mémoire long-terme réunis dans une seule application desktop. La vision reste : passer d'un « IDE qui délègue à des agents » à un **système d'exploitation cognitif qui comprend une intention, planifie un vrai graphe d'exécution parallèle, agit de façon autonome sous garde-fous transactionnels, et apprend de chaque mission**.

---

## Changelog de la roadmap

| Version | Date | Changements majeurs |
|---|---|---|
| **2.0.0** | 2026-11-08 | **Actualisation post-audit du dépôt main.** Inventaire statique : 227 fichiers de tests (203 backend, 23 UI, 1 autre), sans prétendre qu'ils ont tous été exécutés. Ajout de la phase R9 : convergence des chemins d'exécution, autorité de récupération unique, sûreté des effets de bord, permissions minimales, durcissement Electron, CI bloquante et cockpit opérateur. Les chantiers UI 3D, dashboard compact/personnalisable, e-mail et transferts Telegram restent à valider/terminer sur main avant d'être déclarés livrés. |
| **1.9.0** | 2026-10-15 | **Re-audit documentaire + harmonisation README ⇄ ROADMAP.** Suites **exécutées** et recalées : backend **1460 cas / 174 suites · 0 échec** (184 fichiers), UI **90 cas · 0 échec** (18 fichiers) — au lieu des estimations historiques ~1326/171 et ~45/14. Correction des chemins de plugins de rôles (`server/runtime/agents/`), du nombre de migrations Supabase (**14**, l'item « une seule migration » retiré de la section 🔴), et clarification que le total d'outils est **runtime-variable** (builtin + MCP + custom). Harmonisation des docs techniques (`API_DOCS.md`, `ARCHITECTURE.md`, `DB_SCHEMA.md`). Aucune case de statut promue sans preuve ; aucun code applicatif modifié. Audits de référence consultés : `docs/LEANNA_EXECUTION_AUDIT_2026-10-15.md`, `docs/LEANNA_TOKEN_TELEMETRY_AUDIT_2026-10-15.md`, `docs/TOOL_OWNERSHIP_MATRIX.md`. |
| **1.8.0** | 2026-10-13 | **Refonte stratégique + nouvelle Phase R8 (20 fonctionnalités innovantes).** Vision portée au niveau supérieur : time-travel debugging, dry-run global de mission, harness d'évaluation scoré, auto-amélioration (Leanna code Leanna), inférence locale Ollama, voix comme interface principale, agent de revue de PR, mémoire épisodique sémantique, graphe causal de mission, et 11 autres chantiers — chacun ancré sur un composant **déjà présent** (`MissionTimeTravel`, `MissionSimulator`, `MissionEvolution`, `LearningEngine`, `PredictionEngine`, `textGeneration`, `/orb-live`, `EvidenceEngine`…). **Recalage factuel** : comptes de tests réels (~1326 backend / 171 fichiers · ~45 UI / 14 fichiers) répercutés dans le README. Découverte d'audit : `MissionTimeTravel.ts`, `MissionSimulator.ts`, `MissionEvolution.ts`, `LearningEngine.ts`, `PredictionEngine.ts`, `ReasoningPipeline.ts` existent déjà en scaffolding → plusieurs items R8 sont donc du *câblage*, pas du *greenfield*. |
| **1.7.0** | 2026-10-11 | **Boucle humaine (HITL) câblée bout-en-bout** : file d'approbation interactive côté UI (`AutonomyView` → `PendingApprovalsCard`, `usePendingApprovals`, `MissionPanel.resolveApproval`, pastille `StatusBar`) adossée au backend `Executor.requestApproval/resolveApproval` + routes REST `POST /missions/:id/approve|pause|resume|cancel`, `DELETE /missions/:id`. **Centre de propositions** `AnticipationProposal` dans `MissionControlView` (lancer une mission depuis une proposition). **Compression de contexte automatique** réellement déclenchée au seuil de tokens (`LiveSocketHandler.autoSummarizeContext`). **Contract-net en production** (`AgentOrchestrator` + `DelegationDispatcher` appellent `contractNetNegotiator.negotiate`). **Reconnexion WebSocket `/live`** avec backoff exponentiel borné (`useWebSocket`). **Marketplace** (backend local + UI) et **Workflow builder** (éditeur par étapes). **Correctif** : le rôle `planner` n'a plus `delete_project_file` (contradiction P1 soldée). |
| **1.6.0** | 2026-10-09 | **Noyau P0 transactionnel** livré (`server/core/` : machine à états durable 13 états, `ExecutionLedger` idempotent, `CheckpointManager` snapshot/rollback, `EvidenceEngine`, `LeannaSupervisor`, `LedgerGuard`, `JevSafetyGate`, `kernel.createCoreKernel`). **20 rôles statiques** (ajout du groupe Web & Qualité : `ui_ux`, `seo`, `documentation`, `accessibility`, `performance`) = **20 plugins runtime**. Autonomie proactive (`AnticipationEngine`, `ComputerUseAgent`, `SmartSkills`). Nouvelle **Phase R7 — 20 fonctionnalités & optimisations**. |
| **1.4.0** | 2026-10-04 | Sandbox d'exécution des skills tiers : `SkillWorker`, `agentDefinitionSchema` (Zod + HMAC-SHA256), `AgentLoader` hardened, `DynamicAgentRegistry.registerAgent()`, `McpBridge.sanitizePathArgs()`. 32 nouveaux tests. |
| **1.3.0** | 2026-09-25 | Re-audit post-`AGENTIC_RUNTIME` et `AUTONOMY_IMPLEMENTATION`. 11 items migrés 📋/🟡 → ✅. KPI actualisés. |
| 1.3.0 | 2026-09-04 | Refonte complète : audit du code, 5 paris, 6 phases R0→R6, registre de risques. |

**Ce qui a changé depuis la 1.4.0** (récapitulatif pour les lecteurs pressés) :

- **Noyau P0** : ✅ machine à états de mission durable (13 états validés), ✅ ledger d'idempotence avec reprise sûre après crash, ✅ checkpoints snapshot/commit/rollback, ✅ moteur de preuve (la preuve prime sur la narration LLM), ✅ superviseur unique orchestrant le cycle `PREPARE→SNAPSHOT→ACT→VERIFY→COMMIT/ROLLBACK`.
- **Safety Gate Jev** : ✅ jugement sémantique de risque pré-exécution, modes `off`/`audit`/`enforce` (fail-closed), seuils calibrables.
- **Agents** : ✅ 20 rôles statiques = 20 plugins runtime (7 rédaction one-shot + 8 ingénierie + 5 Web & Qualité agentiques), ✅ `SwarmComposer`, ✅ `ContractNetNegotiator`, ✅ `MessageBusMonitor`.
- **Autonomie proactive** : ✅ `AnticipationEngine` (observe→détecte→propose + auto-launch borné), ✅ `ComputerUseAgent`, ✅ `SmartSkills` (quality_loop, validate_patch, read_until_understood, plan_code_change).
- **Kill-switch temps-réel** : ✅ `AbortSignal` propagé jusqu'au `ToolRegistry.call` (soldé depuis la 1.4.0).
- **Boucle humaine (HITL)** *(nouveau 1.7.0)* : ✅ file d'approbation **interactive** de bout en bout — l'UI approuve/refuse une action à effet de bord bloquée par le superviseur, et pilote la mission (pause/reprise/annulation/suppression). Le refus par défaut (fail-closed) reste garanti à l'expiration du délai.
- **Compression de contexte auto** *(nouveau 1.7.0)* : ✅ déclenchée automatiquement au seuil de tokens dans la session live (plus seulement sur appel manuel).

---

## Sommaire

1. [État réel du produit (audit 2026-10-09)](#état-réel-du-produit-audit-2026-10-09)
2. [Vision refondée — les 5 paris](#vision-refondée--les-5-paris)
3. [Principes directeurs](#principes-directeurs)
4. [Légende & conventions](#légende--conventions)
5. [KPI de succès](#kpi-de-succès)
6. [Phase R0 — Vérité du socle](#phase-r0--vérité-du-socle)
7. [Phase R1 — Le cerveau qui planifie vraiment](#phase-r1--le-cerveau-qui-planifie-vraiment)
8. [Phase R2 — L'autonomie qui agit](#phase-r2--lautonomie-qui-agit)
9. [Phase R3 — Le moteur de modèles universel](#phase-r3--le-moteur-de-modèles-universel)
10. [Phase R4 — Mémoire cumulative & apprentissage](#phase-r4--mémoire-cumulative--apprentissage)
11. [Phase R5 — Innovation & différenciation](#phase-r5--innovation--différenciation)
12. [Phase R6 — Ouverture & portabilité](#phase-r6--ouverture--portabilité)
13. [Phase R7 — 20 fonctionnalités & optimisations](#phase-r7--20-fonctionnalités--optimisations-nouveau)
14. [**Phase R8 — 20 fonctionnalités innovantes (refonte 2026-10-13)**](#phase-r8--20-fonctionnalités-innovantes-refonte-2026-10-13)
15. [Registre des risques](#registre-des-risques)
16. [Dette technique prioritaire](#dette-technique-prioritaire)

---

## État réel du produit (audit 2026-10-09)

Constat honnête, tiré du code source. Chaque ligne ✅ est traçable à un fichier + un symbole + (si applicable) un test.

### ✅ Réellement solide, production-grade

| Sous-système | Preuve dans le code |
|---|---|
| **Noyau P0 — machine à états durable** *(nouveau)* | `server/core/MissionStateMachine.ts` — 13 états (`CREATED`→`PLANNING`→`READY`→`RUNNING`→`VERIFYING`→`RECOVERING`→`WAITING_APPROVAL`→`PAUSED`→`COMMITTING`→`COMPLETED`/`FAILED`/`ESCALATED`/`CANCELLED`), table `TRANSITIONS` validée, `IllegalTransitionError`, pure (aucune I/O). Persistance via `DurableMissionStore` (`.Leanna/core/missions/<id>.json`, atomique). Tests : `MissionStateMachine.test.ts`. |
| **Noyau P0 — idempotence & reprise crash** *(nouveau)* | `server/core/ExecutionLedger.ts` — journal append-only `.Leanna/core/ledger/actions.jsonl`, clé déterministe `missionId:stepId:tool:argsHash` (SHA-256 clés triées), `begin()` → `skip`/`block`/`execute`, requalification `started→unknown` à la reprise, blocage du rejeu d'un effet de bord. `LedgerGuard` branché via `ToolRegistry.setIdempotencyGuard`. Activé par `LEANNA_IDEMPOTENCY`. Tests : `ExecutionLedger.test.ts`, `LedgerGuard.test.ts`. |
| **Noyau P0 — checkpoints transactionnels** *(nouveau)* | `server/core/CheckpointManager.ts` — `snapshot`/`commit`/`rollback` sur `FileGateway` injectable, statuts `open`/`committed`/`rolledback`, hash SHA-256 (`WorkspaceState.hash`), `.Leanna/core/checkpoints/`. Tests : `CheckpointManager.test.ts`. |
| **Noyau P0 — preuve & superviseur** *(nouveau)* | `server/core/EvidenceEngine.ts` — `EvidenceBundle` déterministe (`deriveConfidence`, `evidenceEstablishesSuccess`), la preuve prime sur la narration. `server/core/LeannaSupervisor.ts` — autorité unique, `runMission()` orchestre `PREPARE→SNAPSHOT→ACT→VERIFY→COMMIT/ROLLBACK`, `maxAttempts=3`, `RecoveryDecision` retry/repair/replan/escalate. Fabrique `kernel.createCoreKernel`. Tests : `EvidenceEngine.test.ts`, `LeannaSupervisor.test.ts`, `kernel.test.ts`, `AgenticMissionRunner.test.ts`. |
| **Safety Gate Jev** *(nouveau)* | `server/core/JevSafetyGate.ts` + `server/utils/jevGating.ts` (`decideGate` pure, `GATE_THRESHOLDS` block 0.85 / review 0.4 / irréversible 0.6) + `jevDecisions.ts` (questions typées). Modes `off`/`audit`/`enforce` (`LEANNA_SAFETY_GATE`), **fail-closed** en `enforce`. Pré-filtre SAFE/RISKY. Calibration `scripts/jev-gate-calibrate.ts`. Tests : `JevSafetyGate.test.ts`. |
| **Sandbox isolé & sync transactionnel** | `server/utils/sandbox.ts` — machine à états fail-closed, défense anti-échappement (chemins absolus/UNC/drive-relative rejetés, walk des symlinks), sync transactionnelle avec checkpoint + rollback, mutex. Tests : `sandbox.test.ts`, `safeguards.test.ts`. |
| **20 rôles = 20 plugins runtime** *(étendu)* | `server/agents/types.ts` (`STATIC_AGENT_ROLES`, 20) + `server/agents/roles.ts` (définitions + prompts FR). Plugins sous **`server/runtime/agents/`** : `writing.agents.ts` (7, one-shot), `engineering.agents.ts` (8, agentique), `specialized.agents.ts` (5, agentique : `ui_ux`/`seo`/`documentation`/`accessibility`/`performance`), agrégés par `server/runtime/agents/index.ts`. Pont `agenticBridge.ts`. |
| **Orchestration multi-agents** *(étendu)* | `server/agents/SwarmComposer.ts` (composition dynamique + `dissolve()`, pipeline 8 étapes), `ContractNetNegotiator.ts` (appel d'offres, scoring skill 0.6/confidence 0.25/load 0.15), `MessageBusMonitor.ts` (health/alertes/dashboard ASCII), `DelegationManager.ts` (JSON + Zod, batch, conditions). Tests : `SwarmComposer.test.ts`, `ContractNetNegotiator.test.ts`, `MessageBusMonitor.test.ts`, `DelegationManager.test.ts`. |
| **Autonomie proactive** *(nouveau)* | `server/autonomy/AnticipationEngine.ts` (observe→détecte→propose, sweeps + réflexions, auto-launch borné `autoLaunchThreshold`), `ComputerUseAgent.ts` (observe→plan→act→verify, gating risque, `maxSteps`), `SmartSkills.ts` (quality_loop / validate_patch / read_until_understood / plan_code_change), `Supervisor.ts` (anti-boucle 2×3, coupe-circuit session), `HeartbeatService.ts` (timer adaptatif). Tests : `AnticipationEngine.test.ts`, `ComputerUseAgent.test.ts`, `SmartSkills.test.ts`, `Supervisor.test.ts`. |
| **Runtime agentique** | `server/runtime/agentic/AgenticRuntime.ts` — boucle `run/plan/execute/verify/recover/finalize`, budget transactionnel **8/3/9/6/4** étanche (`DEFAULT_AGENT_BUDGET`), `WorkspaceState` hash SHA-256, cache de contexte anti search→read→search. Tests : `agentic.test.ts`, `mission-harness.test.ts`, `AgentTaskRunnerContract.test.ts` (10 invariants × 2 moteurs). |
| **Agent Brain (DAG parallèle)** | `server/agents/brain/BrainScheduler.ts` (fan-out/fan-in, deadlock), `BrainPlanValidator.ts` (Zod + DFS cycles + Mermaid), `AgentBrain.replanSubgraph`. Tests : `BrainScheduler.test.ts`, `BrainPlanValidator.test.ts`. |
| **RAG hybride** | `server/notebooks/RAGEngine.ts` — expansion LLM, embeddings, TF-IDF, fusion RRF, re-ranking LLM, citations `[SOURCE N]`. Assistant vocal notebook `/notebook-live` (`NotebookLiveSocketHandler.ts`). |
| **Suivi coûts & tokens (OpenTelemetry)** | `server/observability/TelemetryService.ts` — capture tokens, pricing, agrégation mission/agent/modèle, flush Supabase, spans corrélés. |
| **Failover multi-provider** | `server/utils/textGeneration.ts` — routeur Gemini↔OpenRouter, circuit breaker, key-pool Gemini rotation 429, streaming. |
| **Cross-mission learning** | `server/knowledge/StrategyMemory.ts` — store durable `.Leanna/strategy.json` (atomique, legacy `.Leanna-strategy.json` auto-migré), `getFailingSkills` (seuil 0.34, min 3). Consommé par `SkillScorer.seedFromReliability`, `Planner`, `AutonomousExecutive.recallOutcome`. Tests : `StrategyMemory.test.ts`. |
| **Navigateur intégré** | `server/skills/browser.ts` — **29 outils** `browser_*`, multi-onglets/profils/extensions, `browser_capture` (vision multimodale), `browser_get_console`. Recherche serveur `webSearchProvider.ts` (Brave + DuckDuckGo, SSRF, lecture parallèle). Durcissement `electron/main.cjs`. |
| **Kill-switch temps-réel** | `ToolCallOptions.signal` propagé jusqu'au `ToolRegistry.call`, course abort, `run_project_command` tue le sous-processus via `execFile({ signal })`. |
| **Boucle humaine (HITL) interactive** *(nouveau)* | **Backend** : `server/mission/Executor.ts` — `requestApproval()` bloque l'action sur un verdict `ask` (`Promise<boolean>`, `pendingApprovals`, refus fail-closed à l'expiration `approvalTimeoutMs`), `resolveApproval()`, `actionBelongsToMission()` (anti-approbation croisée). **Routes** : `server/routes/missions.ts` — `POST /missions/:id/approve|pause|resume|cancel`, `DELETE /missions/:id`, `GET /missions/pending-approvals`. **UI** : `src/views/AutonomyView.tsx` (`PendingApprovalsCard`), `src/hooks/usePendingApprovals.ts` (store partagé `useSyncExternalStore`, `usePendingApprovalCount`), `src/components/panels/MissionPanel.tsx` (`resolveApproval`, `controlMission`), pastille globale `StatusBar.tsx`. Relais Telegram `TelegramService.pendingApprovals`. |
| **Contrôle de mission (pause/reprise/annulation)** *(nouveau)* | `Executor.pauseMission/resumeMission/cancelMission/deleteMission` + routes REST dédiées + reprise après crash (`listPendingResumes` / `confirmResume` → `reactivate`/`delete`), jamais relancée d'office. UI : `MissionPanel.controlMission`. |
| **Compression de contexte automatique** *(nouveau)* | `server/live/LiveSocketHandler.ts` — `autoSummarizeContext` déclenchée au seuil critique de tokens (`summarizeWithLLM`, cooldown 30 s, `MAX_AUTO_SUMMARIZES_PER_SESSION=6`, `MIN_MESSAGES_FOR_AUTO_SUMMARIZE=8`), ré-injection `[CONTEXTE COMPACTÉ (AUTO)]`. Chemin manuel séparé : `POST /api/tokens/summarize-context`. |
| **Contract-net en production** *(câblé)* | `server/agents/ContractNetNegotiator.ts` (`negotiate`, singleton `contractNetNegotiator`) réellement invoqué hors tests : `AgentOrchestrator.ts` et `DelegationDispatcher.ts`. Tests : `ContractNetNegotiator.test.ts`, `DelegationNegotiation.test.ts`. |
| **Marketplace (backend local + UI)** *(précisé)* | `server/marketplace/MarketplaceRegistry.ts` (`search`/`publish`+`runSecurityAnalysis`/`ratePackage`/`getFeatured`/`getInstalled`, persistance disque + `buildSeedCatalog`), route `server/routes/marketplace.ts` (test `marketplace.test.ts`). UI `src/components/panels/MarketplacePanel.tsx` + `marketplaceStore.ts`. **Marketplace local/embarqué** (seed + fichiers), pas de registre distant communautaire. |
| **Reconnexion WebSocket `/live`** *(nouveau)* | `src/hooks/useWebSocket.ts` — backoff exponentiel borné (`RECONNECT_MAX=5`, `min(2000·2^n, 30 s)`), reprise GoAway/`context_overflow`/`prompt_replace` avec `conversation_id`. **Limité au socket `/live`.** |
| **Tests & sécurité de base** | **1460 cas / 174 suites · 0 échec** sur **184 fichiers** `server/**/*.test.ts` (`npm test`, exécuté le 2026-10-15, ~90 s) couvrant unité, intégration REST, contrat, e2e et soak ; auth `timingSafeEqual`, rate limiting, écoute loopback, audit log NDJSON, `promptInjectionGuard` (3 vues EN+FR), `csp.ts` dev/prod. |

### 🟡 Scaffolding solide, mais pas encore câblé au réel

| Sous-système | Le gap précis |
|---|---|
| **Observabilité (export réel)** | Traces OpenTelemetry créées et corrélées, mais **aucun exporter OTLP par défaut** ni Jaeger/Tempo local câblé. Les métriques exposées sont des endpoints **JSON** — pas d'exposition au format texte Prometheus. |
| **Timeline de mission rejouable** | Événements `autonomy:*` diffusés sur `/autonomy` (`AutonomyTimeline.tsx`), mais **pas de replay** : pas de fixtures ni de stockage ordonné des décisions/outils/diffs. |
| **Reconnexion auto des autres sockets** | ✅ pour `/live` (`useWebSocket`), mais `/notebook-live`, `/terminal`, `/sandbox-watch` et `/autonomy` ne passent **pas** par ce hook et n'héritent donc pas du backoff. Gap : généraliser la reconnexion aux 4 autres sockets. |
| **Cache de prompts (non sémantique)** | `server/utils/promptCache.ts` (`PromptCache`) existe, mais c'est un cache **exact par clé** (SHA-256 base/rôle), **non branché** dans `textGeneration.ts` et **sans test**. Pas de similarité par embedding → ce n'est pas encore un cache *sémantique*. |
| **Rapport post-mission Markdown** | Les faits existent (`EvidenceEngine` → `EvidenceBundle`, coûts via `TelemetryService`), mais **aucun agrégateur** ne les assemble en un artefact Markdown unifié (fichiers + tests + coût + corrections). |
| **Composition de swarm pilotée par le Brain** | `SwarmComposer.plan()/compose()` prêts et testés, mais atteints **uniquement** via l'outil LLM `agent_compose_swarm` (`server/skills/agents.ts`) ; le Brain ne compose/dissout **pas** d'équipe automatiquement, et `compose()` (teardown dynamique) n'est appelé nulle part en prod. |
| **`AnticipationKind.automation`** | Déclaré dans l'union de types, mais **aucun chemin d'émission** dédié dans le sweep (les opérations récurrentes surfacent en `problem`/`optimization`). |
| **Workflow builder** | ✅ livré, mais c'est un **éditeur par étapes séquentielles** (`VisualWorkflowBuilder.tsx` : steps, action, args JSON, onError, retries, schedule) adossé à `server/routes/workflows.ts` (test `workflows.test.ts`) — **pas un canvas de nœuds** drag-and-drop. |

### 🔴 Absent ou très mince

| Sujet | Réalité |
|---|---|
| **Modèles locaux (Ollama)** | Aucune trace. `textGeneration.ts` ne connaît que `'gemini' | 'openrouter'`. Le « local-first » ne s'applique pas encore à l'inférence. |
| **Harness d'évaluation d'agents** | Pas de dossier `eval/`, pas de suite de tâches de référence scorée, pas de fixtures enregistrées. |
| **CI GitHub Actions bloquante** | `.github/workflows/` existe mais aucun pipeline « lint + typecheck + test + build » bloquant confirmé. |
| **Migrations Supabase réversibles & consolidées** | `supabase/migrations/` contient **14 migrations**, mais **8 schémas SQL ad-hoc** subsistent à la racine de `supabase/` (`*_schema.sql`) et les migrations ne sont pas toutes réversibles/consolidées. Le gap n'est plus l'absence de migrations mais leur **discipline** (versionnement réversible, source unique). |
| **Support Linux / macOS Electron** | `package.json > build.win` uniquement (`nsis` x64). |
| **Mode headless / CLI** | Pas de binaire CLI ; unique point d'entrée `server-bootstrap.ts`. |
| **SDK de plugins versionné** | Aucun package `@leanna/plugin-sdk`. |

---

## Vision refondée — les 5 paris

1. **Un cerveau qui planifie vraiment.** ✅ **Atteint** — scheduler DAG parallèle, validation Zod, réplanification à chaud. Reste : estimation coût/risque/durée avancée, timeline rejouable, rapport post-mission unifié.
2. **Une autonomie qui agit sous garde-fous.** ✅ **Atteint, durci & supervisable** — dispatcher autonome + **Noyau P0 transactionnel** (snapshot/rollback/preuve) + **Safety Gate Jev** + **boucle humaine interactive** (approuver/refuser/pause/reprise/annuler depuis l'UI). Reste : confirmation UI du `ComputerUseAgent`.
3. **Un moteur de modèles universel.** 🚧 **En cours** — failover Gemini↔OpenRouter solide. Manque Ollama local + routeur intelligent.
4. **Une mémoire qui apprend.** ✅ **Atteint** — `StrategyMemory` influence la planification dès la première itération. Restent playbooks et profils par projet.
5. **De l'inédit, mesurable.** 🚧 **Planifié & câblable (Phase R8)** — harness d'évaluation scoré (R8 #5), time-travel debugging (R8 #1), simulation globale de mission (R8 #2), voix comme interface principale (R8 #13), agent de revue de PR (R8 #14), mémoire épisodique sémantique (R8 #17). L'audit du 13 oct. confirme que **9 de ces 20 chantiers reposent sur du scaffolding déjà présent** — l'inédit devient buildable, pas spéculatif.

---

## Principes directeurs

| # | Principe | Conséquence concrète |
|---|---|---|
| 1 | **Local-first** | Rien ne quitte la machine sans action explicite. Le Noyau P0 persiste sous `.Leanna/core/` sans Supabase. À étendre à l'inférence via Ollama (R3). |
| 2 | **Agent sous contrôle transactionnel** | Toute action à effet de bord est snapshottée (checkpoint), idempotente (ledger) et jugée par le Safety Gate avant exécution ; échec → rollback. |
| 3 | **La preuve prime sur la narration** | Une action `ok:true` ne vaut rien tant que `EvidenceEngine` ne l'a pas confirmée par des faits observables (hash, typecheck, tests). |
| 4 | **Observable par défaut** | Si l'agent le fait, on le voit, on le rejoue, on en connaît le coût — et le budget peut *stopper* la mission en temps réel. |
| 5 | **Honnêteté d'ingénierie** | Une case n'est ✅ que si le code la prouve **et** un test la couvre. |

---

## Légende & conventions

**Statut** : ✅ Fait (prouvé par le code + test) · 🟡 Partiel/scaffolding · 🚧 En cours · 📋 Planifié · 💡 Idée

**Priorité** : P0 (fondation, débloque le reste) · P1 (majeur) · P2 (confort) · P3 (opportuniste)

**Effort** : S (< 2 j) · M (2–5 j) · L (1–2 sem.) · XL (> 2 sem.)

**DoD** : code + tests + doc + entrée CHANGELOG. Sans les quatre, pas de ✅.

---

## KPI de succès

| Indicateur | Aujourd'hui (2026-10-11) | Cible R5/R7 |
|---|---|---|
| Taux de succès des missions autonomes | mécanique prouvée, **score métier non mesuré** | ≥ 85 % sur suite d'évaluation |
| Boucle humaine (approbation interactive) | ✅ UI approuver/refuser/pause/reprise/annuler branchée au superviseur | 100 % des actions `ask` tranchées par l'humain (ou refus fail-closed) |
| Reprise sûre après crash (idempotence) | ✅ `ExecutionLedger` (rejeu d'effet de bord bloqué) | 100 % des actions destructives non rejouées |
| Rollback transactionnel de mission | ✅ `CheckpointManager` + `LeannaSupervisor` | 100 % des échecs restaurent l'état antérieur |
| Jugement de risque pré-exécution | ✅ `JevSafetyGate` (audit/enforce) | ≥ 95 % de rappel sur actions destructives en `enforce` |
| Inférence locale disponible | non | Ollama : ≥ 1 modèle en fallback hors-ligne |
| Budget appliqué (kill-switch) | ✅ par action **et** temps-réel (`AbortSignal`) | maintenu à 100 % |
| Régression agent détectée en CI | non | PR bloquée si le score baisse |
| Temps de démarrage à froid (Electron) | à mesurer | < 3 s |

---

## Phase R0 — Vérité du socle

**Thème** : rendre vrai ce qui est marqué comme fait.

| Fonctionnalité | Prio | Effort | Statut |
|---|---|---|---|
| ✅ ~~Validation Zod du plan LLM~~ | P0 | S | ✅ `DynamicPlanner.parseLLMPlanResponse` |
| ✅ ~~Budgets (arrêt dur + temps-réel)~~ | P0 | M | ✅ `Executor.executeAction` + `AbortSignal` propagé au `ToolRegistry.call` |
| ✅ ~~Noyau transactionnel (snapshot/commit/rollback + idempotence)~~ | P0 | XL | ✅ `server/core/` (Noyau P0) |
| ✅ ~~Jugement de risque pré-exécution~~ | P0 | L | ✅ `JevSafetyGate` + `jevGating` |
| **Exporter OpenTelemetry réel** (OTLP → Jaeger/Tempo local en container) | P0 | S | 📋 |
| **CI GitHub Actions bloquante** : lint + typecheck + test + build + `npm audit` | P0 | M | 📋 |
| **Reconnexion WebSocket auto** (backoff) sur `/live`, `/notebook-live`, `/terminal`, `/sandbox-watch`, `/autonomy` | P0 | S | 🟡 ✅ `/live` (`useWebSocket`, backoff borné) ; 4 autres sockets à généraliser |
| **Scan + redaction de secrets** dans logs, traces, prompts et avant tout commit/push agent | P0 | M | 📋 |
| **Health check enrichi** `/api/health` : Supabase, Gemini, pgvector, Ollama, uptime, version | P1 | S | 📋 |

---

## Phase R1 — Le cerveau qui planifie vraiment

| Fonctionnalité | Prio | Effort | Statut |
|---|---|---|---|
| ✅ ~~Scheduler topologique~~ (fan-out/fan-in) | P0 | XL | ✅ `BrainScheduler.ts` |
| ✅ ~~Réplanification à chaud~~ | P0 | L | ✅ `AgentBrain.replanSubgraph` |
| ✅ ~~Plan validé & inspectable~~ (Zod + Mermaid) | P1 | M | ✅ `BrainPlanValidator` |
| ✅ ~~Détection de boucle infinie d'agent~~ | P1 | S | ✅ `AgentRepairLoop` + `Supervisor` (2×3) |
| ✅ ~~Planification par capacités~~ | P1 | L | ✅ `determineNeededPhases` + `selectRoleForPhase` |
| **Estimation coût/risque/durée avancée** affichée sur le plan | P1 | M | 🟡 `PlanEstimator` existe (coût/durée/risque/confiance) ; à enrichir |
| **Timeline de mission rejouable** : chaque décision, outil, diff, coût, horodaté et navigable | P1 | L | 📋 |
| **Rapport post-mission automatique** (fichiers touchés, tests, coût, échecs, corrections) | P1 | M | 🟡 `EvidenceBundle` fournit les faits ; rapport Markdown unifié à produire |

---

## Phase R2 — L'autonomie qui agit

| Fonctionnalité | Prio | Effort | Statut |
|---|---|---|---|
| ✅ ~~Dispatcher de missions autonome~~ | P0 | XL | ✅ `server.ts` `executeMission` + `waitForMission` |
| ✅ ~~Gouvernance transactionnelle de mission~~ | P0 | XL | ✅ `LeannaSupervisor.runMission` (Noyau P0) |
| ✅ ~~Snapshots de workspace avant mission~~ | P1 | M | ✅ `CheckpointManager.snapshot` (dans le cycle du superviseur) |
| ✅ ~~Agents proactifs (détectent, proposent sans exécuter sans accord)~~ | P1 | L | ✅ `AnticipationEngine` (auto-launch borné + réflexions) |
| ✅ ~~File d'approbation humaine (UI)~~ : approuver/refuser dans `AutonomyView` | P0 | M | ✅ `PendingApprovalsCard` + `usePendingApprovals` + `POST /missions/:id/approve` (backend `Executor.requestApproval/resolveApproval`) |
| ✅ ~~Vue Autonomie interactive~~ : centre de contrôle (approuver, pause, annuler) | P1 | M | ✅ `MissionPanel.controlMission` + routes `pause`/`resume`/`cancel`/`delete` ; propositions actionnables dans `MissionControlView` |
| **Rotation du token API** et **audit des accès** exposés dans l'UI | P1 | M | 📋 |

---

## Phase R3 — Le moteur de modèles universel

| Fonctionnalité | Prio | Effort | Statut |
|---|---|---|---|
| **Intégration Ollama** : provider local first-class (`'gemini' | 'openrouter' | 'ollama'`), mode 100 % hors-ligne | P0 | L | 📋 |
| **Abstraction provider complète** : découpler les skills du client Gemini | P0 | L | 📋 |
| **Fallback en cascade multi-niveaux** (Gemini → OpenRouter → Ollama local) | P0 | M | 🟡 2 niveaux sur 3 |
| **Routeur de modèles intelligent** : choix auto par complexité, coût, latence, confidentialité | P1 | L | 📋 |
| **Cache sémantique de prompts** : réponse réutilisée si prompt équivalent | P1 | M | 📋 aucun cache de prompts dans le code actuel (l'ancien `promptCache.ts` exact a été retiré) — à bâtir sur embeddings |
| ✅ ~~Compression de contexte automatique~~ en fin de fenêtre | P1 | L | ✅ `LiveSocketHandler.autoSummarizeContext` (déclenchée au seuil de tokens) |

---

## Phase R4 — Mémoire cumulative & apprentissage

| Fonctionnalité | Prio | Effort | Statut |
|---|---|---|---|
| ✅ ~~Mémoire d'échecs~~ (modifie la planification) | P1 | L | ✅ `StrategyMemory` + `Planner.buildFailingSkillsWarning` |
| ✅ ~~Cross-mission reliability~~ (escalade après N échecs) | P1 | L | ✅ `AutonomousExecutive.recallOutcome` |
| ✅ ~~Briefing quotidien auto-généré~~ | P2 | M | ✅ `DailyBriefing.ts` (critiques/en attente/améliorations + missions recommandées) |
| **Playbooks appris** : séquence d'agents gagnante persistée et réutilisée | P1 | L | 🟡 `PlaybookStore` référencé par `OpportunityEngine` ; réutilisation auto à câbler |
| **Profils d'agent par projet** : conventions/style appris et appliqués | P1 | M | 🟡 `ProjectProfile.ts` existe (stack/stats) ; application auto à étendre |
| **Recherche hybride étendue à la mémoire long-terme** | P1 | M | 🟡 notebooks ✅, longterm TF-IDF seul |
| **Ré-indexation incrémentale** du Knowledge Graph et des embeddings | P2 | M | 🟡 `FileWatcher` + `ProjectIndexer.scanFile` ✅ ; embeddings à confirmer |

---

## Phase R5 — Innovation & différenciation

| Fonctionnalité | Prio | Effort | Statut |
|---|---|---|---|
| **Harness d'évaluation d'agents** : suite de tâches scorées, régression en CI | P0 | XL | 📋 |
| **Simulation complète de mission (dry-run global)** : tout le DAG en simulation, diffs/coûts prévus, zéro effet de bord | P1 | L | 🟡 `DryRunController` + checkpoints existent ; orchestration bout-en-bout à câbler |
| **Time-travel debugging** : rejouer une mission étape par étape avec réponses modèles enregistrées | P1 | XL | 💡 (fondé sur `ExecutionLedger` + `EvidenceEngine`) |
| **Voix comme interface principale** : mot d'activation, mains libres, compréhension d'écran temps réel | P1 | L | 💡 (socle Gemini Live + `/orb-live` + partage d'écran) |
| **Agent de revue de PR** : commente le diff, suggère, ne pousse rien sans accord | P1 | L | 💡 |
| **Leanna se développe elle-même (SELF_IDE complet)** | P2 | XL | 💡 |

---

## Phase R6 — Ouverture & portabilité

| Fonctionnalité | Prio | Effort | Statut |
|---|---|---|---|
| ✅ ~~Exécution des skills tiers en sandbox + signature~~ | P0 | L | ✅ `SkillWorker`, `agentDefinitionSchema`, `AgentLoader`, `McpBridge.sanitizePathArgs` |
| **Support Linux** (AppImage/deb) et **macOS** (.dmg notarisé) | P1 | L | 📋 |
| **Docker Compose self-hosted** (app + Supabase local + Ollama + Jaeger) | P1 | M | 📋 |
| **Mode headless / CLI** : lancer une mission depuis le terminal ou un cron | P1 | L | 📋 |
| **Supabase local** (Postgres + pgvector en container) | P1 | L | 📋 |
| **Migrations de schéma versionnées et réversibles** | P1 | M | 📋 |
| **SDK de plugins** (`@leanna/plugin-sdk`) versionné | P1 | XL | 💡 |
| **Workflows en DSL YAML** versionnables en Git | P2 | L | 💡 |

---

## Phase R7 — 20 fonctionnalités & optimisations (nouveau)

**Thème** : vingt chantiers concrets qui capitalisent sur le socle livré en 1.6.0 — le **Noyau P0 transactionnel**, les **20 rôles**, l'**autonomie proactive** et le **RAG hybride**. Chaque item cite le composant existant sur lequel il s'appuie, pour rester buildable et honnête. **Mise à jour 1.7.0 : 3 items livrés (#6 contract-net, #9 centre de propositions, #15 compression auto).**

### Catégorie A — Noyau P0 & transactionnalité

| # | Fonctionnalité / optimisation | S'appuie sur | Prio | Effort | Statut |
|---|---|---|---|---|---|
| 1 | **Tableau de bord du noyau P0** : vue UI temps réel de la machine à états (13 états), des checkpoints ouverts et des entrées de ledger `unknown` à la reprise | `MissionStateMachine`, `CheckpointManager`, `ExecutionLedger` | P1 | M | 📋 |
| 2 | **Reprise interactive après crash** : au démarrage, lister les missions `listResumable()` et les actions ledger orphelines, proposer reprise/rollback/abandon en un clic | `DurableMissionStore.listResumable`, `ExecutionLedger.listUnknown` | P1 | M | 📋 |
| 3 | **Checkpoints multi-fichiers étendus & GC** : étendre le snapshot aux fichiers découverts en cours de route + purge périodique de `.Leanna/core/checkpoints/` committés | `CheckpointManager`, `LeannaSupervisor` | P1 | M | 📋 |
| 4 | **Calibration continue du Safety Gate** : jeu d'exemples labellisés versionné + rapport de précision/rappel rejoué à chaque PR touchant `jevGating` | `scripts/jev-gate-calibrate.ts`, `GATE_THRESHOLDS` | P1 | M | 📋 |

### Catégorie B — Agents & orchestration

| # | Fonctionnalité / optimisation | S'appuie sur | Prio | Effort | Statut |
|---|---|---|---|---|---|
| 5 | **Composition de swarm pilotée par le Brain** : brancher `SwarmComposer.compose()` sur le plan réel pour instancier/dissoudre l'équipe par mission | `SwarmComposer`, `AgentBrain` | P1 | L | 📋 |
| 6 | ✅ ~~**Contract-net en production**~~ : attribution dynamique des tâches aux agents les mieux notés | `ContractNetNegotiator`, `AgentMessageBus` | P1 | L | ✅ `contractNetNegotiator.negotiate` appelé par `AgentOrchestrator` + `DelegationDispatcher` |
| 7 | **Dashboard du bus de messages** : exposer `MessageBusMonitor` (health, alertes, flux, métriques agrégées) dans l'UI avec le rendu ASCII en live | `MessageBusMonitor` | P2 | M | 📋 |
| 8 | **Scoring par-rôle du contract-net** : remplacer le proxy `successRate` global par une fiabilité par rôle issue de `StrategyMemory` | `ContractNetNegotiator.estimateConfidence`, `StrategyMemory` | P2 | M | 📋 |

### Catégorie C — Autonomie proactive

| # | Fonctionnalité / optimisation | S'appuie sur | Prio | Effort | Statut |
|---|---|---|---|---|---|
| 9 | ✅ ~~**Centre de propositions**~~ : UI listant les `AnticipationProposal` (problem/opportunity/optimization/risk/automation) avec lancement de mission | `AnticipationEngine.getProposals` | P1 | M | ✅ `MissionControlView` → `InsightsCard` (lance une mission via `POST /api/missions`) + `PendingApprovalsCard` |
| 10 | **Chemin d'émission `automation`** : implémenter la détection d'opérations manuelles répétées pour émettre réellement des propositions de kind `automation` | `AnticipationEngine` (union déjà déclarée) | P2 | M | 🟡 type déclaré, émission absente |
| 11 | **Computer Use avec confirmation UI** : câbler le handler de confirmation `confirmAtOrAbove` à une modale, pour sortir du fail-closed systématique | `ComputerUseAgent` | P1 | M | 📋 |
| 12 | **Smart Skills dans l'IDE** : exposer `quality_loop` / `validate_patch` / `plan_code_change` comme actions one-click dans l'éditeur | `SmartSkills` | P2 | M | 📋 |

### Catégorie D — Modèles & performance

| # | Fonctionnalité / optimisation | S'appuie sur | Prio | Effort | Statut |
|---|---|---|---|---|---|
| 13 | **Cache sémantique de prompts** : clé par embedding de prompt, réponse réutilisée si similarité ≥ seuil (économie tokens/latence) | `embeddingStore`, `TelemetryService` | P1 | M | 📋 |
| 14 | **Préchauffage & réutilisation du cache de contexte agentique** : persister `session.readCache` entre missions proches d'un même workspace | `AgenticRuntime` (CACHEABLE_TOOLS) | P2 | M | 📋 |
| 15 | ✅ ~~**Compression de contexte auto en fin de fenêtre**~~ : déclenchée automatiquement au seuil de tokens | `LiveSocketHandler.autoSummarizeContext` | P1 | M | ✅ seuil + cooldown 30 s + ré-injection `[CONTEXTE COMPACTÉ (AUTO)]` |
| 16 | **Budget adaptatif par type de mission** : dériver `DEFAULT_AGENT_BUDGET` (8/3/9/6/4) de l'historique `StrategyMemory` au lieu de constantes fixes | `AgentBudget`, `StrategyMemory` | P2 | M | 📋 |

### Catégorie E — Connaissance, observabilité & qualité

| # | Fonctionnalité / optimisation | S'appuie sur | Prio | Effort | Statut |
|---|---|---|---|---|---|
| 17 | **Exporter OpenTelemetry OTLP + Jaeger local** : rendre visibles les spans mission→task→tool déjà corrélés | `TelemetryService` | P0 | S | 📋 |
| 18 | **Ré-indexation incrémentale des embeddings** : étendre le backoff/debounce du `FileWatcher` au ré-embedding ciblé des fichiers modifiés | `FileWatcher`, `ProjectIndexer`, `EmbeddingStore` | P2 | M | 🟡 KG incrémental ✅, embeddings à confirmer |
| 19 | **Harness d'évaluation d'agents** : dossier `eval/`, tâches de référence, fixtures de réponses modèles, scoring reproductible, détection de régression en CI | `mission-harness.test.ts`, `AgentTaskRunnerContract` | P0 | XL | 📋 |
| 20 | **Rapport post-mission Markdown unifié** : agréger `EvidenceBundle` + diffs + coût + durée + corrections en un artefact lisible, promu en source notebook | `EvidenceEngine`, `TelemetryService`, `DocumentStore` | P1 | M | 🟡 faits disponibles, agrégation à écrire |

> Récapitulatif R7 : **20 items** — ✅ 3 livrés (#6 contract-net, #9 centre de propositions, #15 compression auto) · 🟡 3 partiels (#10 `automation`, #18 embeddings incrémentaux, #20 rapport Markdown) · 📋 14 planifiés. Chacun transforme un composant **déjà présent** en valeur visible ou en gain de performance — pas de dépendance à une brique inexistante.

---

## Phase R8 — 20 fonctionnalités innovantes (refonte 2026-10-13)

**Thème** : passer de l'« OS agentique durci » à un **système cognitif qui se simule avant d'agir, se rejoue pour s'expliquer, s'auto-évalue pour s'améliorer, et collabore comme un collègue**. Là où la Phase R7 rendait *visible* le socle livré, la Phase R8 vise la **différenciation produit** : les capacités qu'aucun assistant conversationnel ne peut imiter parce qu'elles exigent le Noyau P0, la mémoire durable et la preuve.

**Règle d'honnêteté maintenue :** chaque item cite le(s) composant(s) **réel(s)** sur lequel il s'appuie. L'audit du 13 oct. a révélé que plusieurs briques « innovation » existent **déjà en scaffolding** (`MissionTimeTravel.ts`, `MissionSimulator.ts`, `MissionEvolution.ts`, `LearningEngine.ts`, `PredictionEngine.ts`, `ReasoningPipeline.ts`, `SelfEvaluation.ts`, `VoiceCommandInterpreter.ts`) — ces items sont donc du **câblage de valeur**, pas du greenfield, ce qui les rend immédiatement buildables.

### Catégorie F — Rejouabilité, simulation & explicabilité

| # | Fonctionnalité innovante | S'appuie sur | Prio | Effort | Statut |
|---|---|---|---|---|---|
| 1 | **Time-travel debugging de mission** : rejouer une mission étape par étape avec les réponses modèles enregistrées, naviguer avant/arrière dans l'historique des décisions/outils/diffs, « forker » depuis n'importe quel point | `MissionTimeTravel.ts` (scaffolding), `ExecutionLedger` (journal append-only), `EvidenceEngine`, `src/views/MissionTimelineView.tsx` | P1 | XL | 🟡 scaffolding présent, enregistrement + replay UI à câbler |
| 2 | **Dry-run global de mission (simulation complète)** : exécuter tout le DAG en simulation — diffs prévus, coûts estimés, risques détectés — **zéro effet de bord**, avant d'engager la mission réelle | `MissionSimulator.ts` (scaffolding), `src/views/MissionSimulationView.tsx`, `DryRunController`, `CheckpointManager`, `PlanEstimator` | P1 | L | 🟡 vue + simulateur présents, orchestration bout-en-bout à finaliser |
| 3 | **Graphe causal de mission** : visualiser *pourquoi* chaque action a eu lieu (objectif → décision → preuve → action suivante), surligner la chaîne causale d'un échec | `EvidenceEngine` (bundles), `BrainPlanValidator` (Mermaid), `AgentEventStream`, `src/views/ExplainabilityView.tsx` | P2 | L | 📋 faits disponibles, moteur causal + rendu à construire |
| 4 | **Rapport post-mission narratif + partageable** : artefact Markdown/HTML unifié (objectif, plan, fichiers, tests, coût, échecs, corrections, preuve) promu en source notebook et exportable PDF | `EvidenceEngine`, `TelemetryService`, `DocumentStore`, `server/export/{pdfExporter,htmlExporter}.ts` | P1 | M | 🟡 faits prêts, agrégateur à écrire (recoupe R7 #20) |

### Catégorie G — Auto-amélioration & apprentissage

| # | Fonctionnalité innovante | S'appuie sur | Prio | Effort | Statut |
|---|---|---|---|---|---|
| 5 | **Harness d'évaluation d'agents scoré** : dossier `eval/`, suite de tâches de référence, fixtures de réponses modèles figées, score reproductible, **régression bloquante en CI** | `mission-harness.test.ts`, `AgentTaskRunnerContract.test.ts`, `SelfEvaluation.ts` | P0 | XL | 📋 fondations de test présentes, suite scorée à bâtir |
| 6 | **Playbooks appris auto-réutilisés** : persister la séquence d'agents gagnante d'une mission réussie et la **re-proposer** automatiquement sur une mission similaire | `PlaybookStore.ts`, `OpportunityEngine`, `StrategyMemory`, `MissionEvolution.ts` | P1 | L | 🟡 `PlaybookStore` existe, réutilisation auto à câbler (recoupe R4) |
| 7 | **Évolution dirigée de stratégie** : analyser l'historique des missions pour détecter les patterns gagnants/perdants et ajuster automatiquement la planification | `MissionEvolution.ts`, `LearningEngine.ts`, `StrategyMemory`, `Planner.replan` | P2 | L | 🟡 moteurs présents en scaffolding, boucle d'ajustement à fermer |
| 8 | **Profils d'agent par projet** : apprendre les conventions/style d'un repo (nommage, structure de tests, patterns) et les appliquer automatiquement aux générations | `ProjectProfile.ts`, `KnowledgeGraph`, `ASTParser` | P1 | M | 🟡 `ProjectProfile` existe (stack/stats), application auto à étendre |

### Catégorie H — Moteur de modèles universel & local-first

| # | Fonctionnalité innovante | S'appuie sur | Prio | Effort | Statut |
|---|---|---|---|---|---|
| 9 | **Inférence locale Ollama (100 % hors-ligne)** : provider local first-class (`'gemini' \| 'openrouter' \| 'ollama'`), fallback en cascade sur 3 niveaux, confidentialité totale | `server/utils/textGeneration.ts` (routeur actuel 2 providers), `getActiveProvider` | P0 | L | 📋 abstraction provider à compléter (débloque le vrai local-first) |
| 10 | **Routeur de modèles intelligent** : choix automatique du modèle par complexité de la tâche, coût, latence et niveau de confidentialité requis | `textGeneration.ts`, `PlanEstimator` (score risque/coût), `TelemetryService` (pricing réel) | P1 | L | 📋 signaux disponibles, politique de routage à écrire |
| 11 | **Cache sémantique de prompts** : réponse réutilisée si un prompt **équivalent** (similarité d'embedding ≥ seuil) a déjà été payé — économie tokens/latence | `EmbeddingStore.ts`, `notebooks/RAGEngine` (RRF/similarité), `TelemetryService` | P1 | M | 📋 (⚠️ l'ancien `promptCache.ts` exact a disparu ; repartir d'un cache **par embedding**) |
| 12 | **Budget adaptatif par type de mission** : dériver le budget `8/3/9/6/4` de l'historique réel (`StrategyMemory`) au lieu de constantes fixes, par catégorie de mission | `AgentBudget` (`DEFAULT_AGENT_BUDGET`), `StrategyMemory`, `MissionEvolution.ts` | P2 | M | 📋 (recoupe R7 #16, étendu avec l'évolution de stratégie) |

### Catégorie I — Interface, voix & collaboration

| # | Fonctionnalité innovante | S'appuie sur | Prio | Effort | Statut |
|---|---|---|---|---|---|
| 13 | **Voix comme interface principale** : mot d'activation mains libres, compréhension d'écran temps réel, exécution de missions dictées, confirmation vocale des actions à risque | `/orb-live` (`OrbLiveView.tsx`), `VoiceCommandInterpreter.ts`, `ScreenShareProvider`, Gemini Live | P1 | L | 🟡 socle vocal + interpréteur présents, pipeline « voix→mission » à relier |
| 14 | **Agent de revue de PR** : commente un diff ligne par ligne, suggère des correctifs, lance les tests impactés — **ne pousse jamais sans accord** | `server/skills/github.ts`, `reviewer`/`security` agents, `ImpactAnalyzer`, HITL (`requestApproval`) | P1 | L | 📋 briques présentes, orchestration PR→revue à assembler |
| 15 | **Pair-programming temps réel** : Leanna suit l'édition active dans Monaco, propose des diffs contextuels inline et explique son raisonnement (`ReasoningPipeline`) à la demande | `src/components/ide/`, `useEditorActions`, `SmartSkills` (`plan_code_change`), `ReasoningPipeline.ts` | P2 | L | 📋 hooks éditeur présents, boucle de suggestion live à construire |
| 16 | **Dashboard du Noyau P0 en temps réel** : vue UI de la machine à états (13 états), checkpoints ouverts, entrées ledger `unknown`, avec reprise/rollback interactive en un clic | `MissionStateMachine`, `CheckpointManager`, `ExecutionLedger.listUnknown`, `DurableMissionStore.listResumable` | P1 | M | 📋 (fusionne R7 #1 et #2 en une surface opérateur unique) |

### Catégorie J — Mémoire, connaissance & observabilité avancées

| # | Fonctionnalité innovante | S'appuie sur | Prio | Effort | Statut |
|---|---|---|---|---|---|
| 17 | **Mémoire épisodique sémantique** : indexer chaque mission passée (objectif, décisions, résultat) en embeddings pour un rappel « as-tu déjà fait quelque chose comme ça ? » au démarrage d'une mission | `HierarchicalMemoryService`, `EmbeddingStore`, `StrategyMemory`, `MissionEvolution.ts` | P1 | L | 📋 mémoire durable présente, couche épisodique vectorisée à ajouter |
| 18 | **Prédiction d'impact avant écriture** : avant toute modification, estimer les fichiers/tests impactés et le risque de régression via le call-graph, affiché dans le diff | `PredictionEngine.ts`, `ImpactAnalyzer`, `ASTCallGraph`, `DependencyGraph` | P1 | M | 🟡 `PredictionEngine` + call-graph présents, affichage pré-écriture à câbler |
| 19 | **Exporter OpenTelemetry réel + traces navigables** : OTLP → Jaeger/Tempo local (Docker), spans mission→task→tool déjà corrélés rendus explorables dans l'UI Observabilité | `TelemetryService` (spans corrélés), `src/views/ObservabilityView.tsx` | P0 | S | 📋 (promu depuis R7 #17 — débloque le débogage de perf réel) |
| 20 | **Ré-indexation incrémentale des embeddings + Knowledge Graph live** : étendre le debounce du `FileWatcher` au ré-embedding ciblé des seuls fichiers modifiés, KG toujours frais sans rescan complet | `FileWatcher`, `ProjectIndexer.scanFile`, `EmbeddingStore`, `KnowledgeGraph` | P2 | M | 🟡 KG incrémental ✅, ré-embedding ciblé à confirmer (recoupe R7 #18) |

> Récapitulatif R8 : **20 items innovants** — 🟡 **9 partiels** (scaffolding réel déjà en place : #1, #2, #4, #6, #7, #8, #13, #18, #20) · 📋 **11 planifiés** (#3, #5, #9, #10, #11, #12, #14, #15, #16, #17, #19). Priorités : **4 items P0** (#5 harness d'éval, #9 Ollama, #19 OTLP) ancrent la différenciation et la fiabilité ; **10 items P1** livrent la valeur produit visible (time-travel, dry-run global, revue de PR, voix, mémoire épisodique). **Point clé :** 9 des 20 chantiers sont du *câblage* d'un composant existant, pas de la création from scratch — la roadmap reste buildable et honnête.

### Dépendances inter-phases

```text
R8 #9 (Ollama)  ──requiert──▶  dette P0 « couplage skills ↔ Gemini »  +  R3 (abstraction provider)
R8 #5 (harness) ──débloque──▶  R8 #7 (évolution de stratégie) + CI bloquante (R0)
R8 #1 (time-travel) ──fondé sur──▶  ExecutionLedger (✅) + EvidenceEngine (✅)
R8 #16 (dashboard P0) ──fusionne──▶  R7 #1 + R7 #2
R8 #19 (OTLP) ──promeut──▶  R7 #17  (même brique, priorité relevée à P0)
```

---

## Phase R9 — Fiabilisation production & expérience opérateur (nouveau · 2026-11-08)

> **Objectif :** transformer les composants agentiques existants en un système
> cohérent, mesurable et sûr de bout en bout, puis rendre son activité lisible et
> pilotable depuis le cockpit. Cette phase privilégie le câblage et la fiabilité
> avant l'ajout de nouveaux sous-systèmes.

### R9.0 — P0 : une seule autorité d'exécution et de récupération

**Priorité : P0 · Bloquant avant toute revendication de transactionnalité universelle.**

- [ ] Définir un contrat de tentative non terminale entre Mission Executor et Supervisor ; l'Executor ne doit pas finaliser une mission avant la décision finale du superviseur.
- [ ] Faire converger les chemins Mission System et AgenticRuntime vers une politique commune de cycle de vie, de budget, d'approbation, d'annulation et de récupération.
- [ ] Propager AbortSignal jusqu'aux handlers, skills, commandes et sous-processus ; ne jamais lancer un rollback tant qu'un runner peut encore écrire.
- [ ] Persister un AttemptJournal corrélé à missionId, attemptId, checkpointId, actionId et décision de recovery.
- [ ] Réconcilier au redémarrage l'état de mission, le checkpoint et le ledger ; une action au résultat inconnu ne doit jamais être rejouée automatiquement.
- [ ] Exiger la capture préalable pour toute mutation supervisée du workspace ; refuser les nouveaux outils d'écriture non enregistrés dans la politique de checkpoint.
- [ ] Distinguer rollback de fichiers et compensation des effets externes (API, e-mail, DB, Git, commandes distantes).

**Critères de sortie :** tests d'intégration sur succès, échec, timeout, annulation, crash à chaque frontière transactionnelle, double reprise concurrente et effet externe incertain ; aucune mission ne doit être déclarée durable si sa persistance critique a échoué.

### R9.1 — P0/P1 : sécurité effective et configuration explicite

- [ ] Définir une allowlist de permissions minimale par profil et par outil ; le mode enforce ne doit pas être assimilé à une politique least-privilege.
- [ ] Auditer les chemins de bootstrap pour garantir que les garde-fous attendus (Supervisor, idempotence, Safety Gate, DryRun) sont réellement branchés, ou afficher clairement leur état désactivé.
- [ ] Remplacer les dégradations de configuration silencieuses par des diagnostics structurés, avec distinction entre valeur absente, valeur invalide et fallback volontaire.
- [ ] Durcir les fenêtres Electron : sandbox, contextIsolation, nodeIntegration, preload minimal, CSP et validation IPC ; documenter les exceptions nécessaires.
- [ ] Étendre les frontières de confiance aux contenus RAG, notebooks, documents, résultats web, e-mails et messages Telegram ; séparer instructions fiables et données récupérées.
- [ ] Cartographier les secrets sur l'ensemble des sources, bundles, logs, exports et historiques Git ; ne pas limiter le contrôle aux seuls fichiers .env.

**Critères de sortie :** matrice permissions/risques testée, tests d'injection de prompt sur contenus récupérés, tests Electron/IPC et validation des erreurs de configuration.

### R9.2 — P1 : fiabilité, observabilité et coût mesurable

- [ ] Ajouter une limite de concurrence globale partagée entre TaskScheduler, BrainScheduler, missions et orchestrateur ; conserver les limites locales comme garde-fous secondaires.
- [ ] Uniformiser timeout, cancellation, retry, circuit breaker et dead-letter sur toutes les files et tous les fournisseurs.
- [ ] Persister les métriques du ModelRouter : latence, coût, tokens, erreurs, qualité observée et succès par type de tâche.
- [ ] Réduire le contexte envoyé au modèle via ToolPromptBuilder : outils pertinents par étape, schémas à la demande, résumé d'état et budgets par phase.
- [ ] Ajouter des tests de chaos/soak pour les missions longues, les providers indisponibles, les redémarrages, les files saturées et les dépendances Redis/Supabase absentes.
- [ ] Rendre le lint bloquant après réduction progressive de la dette ; publier les rapports de typecheck, tests, audit dépendances et bundle.

**Critères de sortie :** SLO mesurés (succès mission, temps de récupération, coût par mission réussie, latence p95, taux d'intervention humaine) et CI bloquante sur les portes de qualité convenues.

### R9.3 — P1 : cockpit opérateur, supervision visuelle et ergonomie

- [ ] Finaliser le cockpit multi-agents 3D : agents regroupés par équipe, liens de délégation, événements animés et flux d'erreurs/résultats, avec réduction de mouvement et mode 2D accessible.
- [ ] Ajouter une timeline interactive corrélée mission → étape → agent → outil → preuve, avec filtres, recherche et accès au détail d'une exécution.
- [ ] Permettre de déplacer, redimensionner, masquer et réordonner les sections du dashboard ; persister les layouts par utilisateur/projet.
- [ ] Réduire la densité visuelle et les espaces inutiles, clarifier les niveaux de priorité et regrouper les actions secondaires dans un menu unique.
- [ ] Unifier l'état de connexion et éviter les commandes de connexion dupliquées ; rendre l'état réel des providers immédiatement visible.
- [ ] Prévoir un mode compact sans scroll excessif, ainsi que des vues adaptées aux petits écrans.

**Critères de sortie :** interactions clavier/souris testées, état temps réel sans duplication, performance stable avec une flotte active, tests d'accessibilité et persistance du layout.

### R9.4 — P1/P2 : intégrations cohérentes et transferts contrôlés

- [ ] Finaliser le provider e-mail générique avec configuration indépendante de l'envoi SMTP et de la réception IMAP ; autoriser envoi seul, réception seule ou les deux.
- [ ] Harmoniser les providers e-mail (configuration, validation, statut, tests de connexion, erreurs et secrets) sans imposer OAuth2 lorsque le provider utilise des identifiants serveur.
- [ ] Compléter les transferts Telegram dans les deux sens pour documents, images et fichiers, avec limites de taille, allowlist de chemins, validation MIME et confirmation pour les actions sensibles.
- [ ] Uniformiser les intégrations externes autour d'un contrat commun : configuration, permissions, santé, retry, journal d'audit et révocation.

**Critères de sortie :** tests d'intégration IMAP/SMTP et Telegram avec erreurs réseau, pièces jointes volumineuses, chemins interdits, doublons et reprise après interruption.

### R9.5 — P2 : nouvelles capacités IA différenciantes

- [ ] Mission Replay : rejouer une mission en environnement isolé à partir de ses événements, sans répéter ses effets externes.
- [ ] Mission Simulator : comparer un plan à plusieurs stratégies et estimer coût, durée, risques et dépendances avant exécution.
- [ ] Évaluation continue des agents : jeux de tâches versionnés, scores par rôle/modèle, régressions et comparaison de prompts.
- [ ] Mémoire épisodique avec provenance : relier chaque souvenir à une mission, une preuve, une date d'expiration et un niveau de confiance.
- [ ] Routage adaptatif par tâche : arbitrer qualité, latence, coût, confidentialité et disponibilité des modèles, avec seuils explicables.
- [ ] Centre de connaissances projet : visualiser les dépendances, impacts, décisions, risques et évolutions détectées par l'indexation.

**Critères de sortie :** chaque capacité doit être reliée à un usage concret, disposer d'un mode désactivable, d'une mesure de valeur et de tests sans effets de bord réels.

### Ordre d'exécution recommandé

1. **R9.0** — sûreté des effets de bord et autorité de récupération unique.
2. **R9.1** — permissions, bootstrap, configuration, Electron et confiance des données.
3. **R9.2** — concurrence globale, observabilité, coûts, tests de chaos et CI bloquante.
4. **R9.3** — cockpit visuel et expérience opérateur, en intégrant les branches UI après revue.
5. **R9.4** — e-mail et Telegram, une fois les contrats d'intégration et de sécurité stabilisés.
6. **R9.5** — capacités différenciantes, après consolidation des fondations.

**Règle de statut :** une fonctionnalité présente dans une branche de travail, un composant isolé ou un test unitaire ne devient pas ✅ sur main avant intégration, tests d'intégration et preuve d'usage bout-en-bout.

---
## Registre des risques

| Risque | Impact | Mitigation |
|---|---|---|
| Dépendance forte à Gemini (quotas, ruptures d'API) | Élevé | Routeur multi-provider + Ollama local (R3), abstraction provider (dette P0) |
| Agent autonome causant une perte de données | Élevé | ✅ **Fortement mitigé** — Noyau P0 (snapshot/rollback, idempotence), Safety Gate Jev `enforce`, sandbox, permissions, **boucle humaine interactive** (verdict `ask` → approbation UI, refus fail-closed à l'expiration) |
| Rejeu d'une action destructive après crash | Élevé | ✅ **Mitigé** — `ExecutionLedger` bloque le rejeu d'un effet de bord de statut `unknown` |
| Coûts modèles non maîtrisés | Moyen | Budgets appliqués par action **et** temps-réel ✅ ; cache sémantique + budget adaptatif (R7) |
| Scaffolding pris pour du fini (fausse confiance) | Moyen | Cette roadmap distingue explicitement 🟡 de ✅ ; DoD strict |
| Skills tiers non fiables | Élevé | ✅ **Mitigé** — `SkillWorker`, `agentDefinitionSchema`, `AgentLoader`, `McpBridge.sanitizePathArgs` |
| Fuite de secrets dans prompts/logs | Élevé | Scan + redaction (R0) ; `promptInjectionGuard` neutralise déjà le contenu non fiable |
| Boucle de réparation qui ne converge pas | Moyen | ✅ `AgentRepairLoop` + `Supervisor` (2×3, coupe-circuit session) |

---

## Dette technique prioritaire

| Sujet | Priorité | Statut | Débloque |
|---|---|---|---|
| Couplage des skills au client Gemini | P0 | 📋 Ouvert | R3 (multi-provider, Ollama) |
| ✅ ~~Exécution Brain séquentielle~~ | P0 | ✅ **Soldé** (`BrainScheduler`) | — |
| ✅ ~~`onTask` autonome no-op~~ | P0 | ✅ **Soldé** (`executeMission`) | — |
| ✅ ~~Budgets comptés mais non appliqués~~ | P0 | ✅ **Soldé** (par action + temps-réel) | — |
| ✅ ~~Parsing regex du plan LLM~~ | P1 | ✅ **Soldé** (`llmPlanSchema.safeParse`) | — |
| ✅ ~~Exécution de mission non transactionnelle~~ | P0 | ✅ **Soldé** (Noyau P0 : snapshot/commit/rollback + preuve) | — |
| Traces OTel sans exporter | P1 | 📋 Ouvert | R0/R7 (observabilité réelle) |
| Migrations Supabase à consolider/rendre réversibles (14 migrations + 8 schémas SQL ad-hoc) | P1 | 📋 Ouvert | R6 (portabilité) |
| Serveur Express monoprocessus (blocages CPU longs) | P1 | 📋 Ouvert | R2/R3 (charge autonome + inférence locale) |
| ✅ ~~`planner` a `delete_project_file` dans ses capabilities~~ | P1 | ✅ **Soldé** (`roles.ts` : capability retirée du `plannerAgent` ; cohérence gardée par `roleCapabilities.test.ts`/`capabilityAudit.test.ts`) | — |
| `AnticipationKind.automation` déclaré mais jamais émis | P2 | 🐛 Incohérence | R7 item #10 |

---

*Cette roadmap est un document vivant, mais elle refuse le vaporware : une fonctionnalité marquée ✅ est prouvée par le code source (fichier + symbole) et couverte par un test. Un 🟡 est du scaffolding honnête, avec le gap précisément identifié. Tout le reste est planifié avec priorité, effort et critère de succès. Depuis la 1.4.0, le **Noyau P0 transactionnel** et le **Safety Gate Jev** ont fait passer le pari « autonomie sous garde-fous » de « mécanique prouvée » à « transactionnel durable » ; la **1.7.0** y ajoute la **boucle humaine interactive** (approbation + contrôle de mission depuis l'UI), la **compression de contexte automatique** et le **contract-net en production**, soldant 3 des 20 chantiers de la Phase R7. La **1.8.0** (13 oct. 2026) ouvre la **Phase R8 — 20 fonctionnalités innovantes** : l'audit a révélé que **9 des 20 briques « innovation » existent déjà en scaffolding** (`MissionTimeTravel`, `MissionSimulator`, `MissionEvolution`, `LearningEngine`, `PredictionEngine`, `ReasoningPipeline`, `SelfEvaluation`, `VoiceCommandInterpreter`, `ProjectProfile`) — l'avenir de Leanna n'est donc pas à inventer de zéro, mais à **câbler et prouver**.*

---

## Annexe — Comment vérifier une case ✅

Pour chaque fonctionnalité marquée ✅, exécutez le test associé :

```bash
# Noyau P0 — machine à états, ledger, checkpoints, preuve, superviseur, gate, kernel
node --import tsx --test server/core/MissionStateMachine.test.ts
node --import tsx --test server/core/ExecutionLedger.test.ts
node --import tsx --test server/core/CheckpointManager.test.ts
node --import tsx --test server/core/EvidenceEngine.test.ts
node --import tsx --test server/core/LeannaSupervisor.test.ts
node --import tsx --test server/core/LedgerGuard.test.ts
node --import tsx --test server/core/JevSafetyGate.test.ts
node --import tsx --test server/core/kernel.test.ts
node --import tsx --test server/core/AgenticMissionRunner.test.ts

# Autonomie proactive
node --import tsx --test server/autonomy/AnticipationEngine.test.ts
node --import tsx --test server/autonomy/ComputerUseAgent.test.ts
node --import tsx --test server/autonomy/SmartSkills.test.ts
node --import tsx --test server/autonomy/Supervisor.test.ts

# Orchestration multi-agents
node --import tsx --test server/agents/SwarmComposer.test.ts
node --import tsx --test server/agents/ContractNetNegotiator.test.ts
node --import tsx --test server/agents/MessageBusMonitor.test.ts
node --import tsx --test server/agents/DelegationManager.test.ts

# Agent Brain : scheduler DAG parallèle + validation de plan
node --import tsx --test server/agents/brain/BrainScheduler.test.ts
node --import tsx --test server/agents/brain/BrainPlanValidator.test.ts
node --import tsx --test server/agents/brain/DynamicPlanner.test.ts

# Runtime agentique : budget 8/3/9/6/4, hash, réparation, contrat × 2 moteurs
node --import tsx --test server/runtime/agentic/agentic.test.ts
node --import tsx --test server/runtime/agentic/mission-harness.test.ts
node --import tsx --test server/agents/AgentTaskRunnerContract.test.ts

# Apprentissage cross-mission
node --import tsx --test server/knowledge/StrategyMemory.test.ts

# Sécurité des skills tiers + MCP
node --import tsx --test server/security/agentDefinitionSchema.test.ts
node --import tsx --test server/runtime/skillWorker.test.ts
node --import tsx --test server/mcp/mcpBridgeSanitize.test.ts

# Cohérence du contrat de rôles (planner sans delete_project_file)
node --import tsx --test server/agents/roleCapabilities.test.ts
node --import tsx --test server/agents/capabilityAudit.test.ts

# Contract-net (négociation en production)
node --import tsx --test server/agents/ContractNetNegotiator.test.ts
node --import tsx --test server/agents/DelegationNegotiation.test.ts

# Phase R8 — scaffolding « innovation » déjà couvert par des tests
# (prouve que ces chantiers sont du câblage, pas du greenfield)
node --import tsx --test server/mission/MissionTimeTravel.test.ts    # R8 #1 time-travel
node --import tsx --test server/mission/MissionSimulator.test.ts     # R8 #2 dry-run global
node --import tsx --test server/mission/SelfEvaluation.test.ts       # R8 #5 harness d'éval
node --import tsx --test server/knowledge/MissionEvolution.test.ts   # R8 #6/#7 évolution stratégie
node --import tsx --test server/knowledge/PredictionEngine.test.ts   # R8 #18 prédiction d'impact
node --import tsx --test server/knowledge/PlaybookStore.test.ts      # R8 #6 playbooks appris
node --import tsx --test server/knowledge/ProjectProfile.test.ts     # R8 #8 profils par projet
```

Un item ✅ **sans** test exécutable associé est un bug de cette roadmap — signalez-le. Les tests R8 listés ci-dessus couvrent le **scaffolding** (le composant existe et est testé) ; l'item reste 🟡 tant que le **câblage de bout en bout** (émission, UI, orchestration) n'est pas livré ni couvert.

**Gaps de couverture identifiés (1.7.0, à combler) :** la boucle d'approbation HITL (`Executor.requestApproval → resolveApproval`) est livrée et vérifiée manuellement, mais **sans test d'intégration dédié** ciblant explicitement le cycle `ask → approve/reject → unblock` ; la suppression de `delete_project_file` chez le `planner` est garantie **indirectement** par l'audit de cohérence du registre (`capabilityAudit.test.ts`) plutôt que par une assertion littérale. Deux tests de garde à ajouter pour une clôture formelle.

---

**Note de maintenance.** Ce document doit être mis à jour à chaque itération majeure (nouvelle phase R*, changement de statut significatif). Les audits pointus (`docs/LEANNA_AUTONOMY_MASTER_AUDIT.md`, `docs/AGENTIC_RUNTIME.md`) restent la source de vérité pour les détails d'implémentation ; la roadmap reste la source de vérité pour **le statut** et **la priorisation**. En cas de contradiction, le code + les tests priment.
