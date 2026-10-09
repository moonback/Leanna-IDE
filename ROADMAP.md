# Roadmap — Leanna AI Operating System

> **Dernière refonte : Octobre 2026** · Version courante : **1.6.0** · Licence BUSL 1.1
>
> Cette roadmap a été **re-auditée contre le code réel** après l'itération **Noyau P0** (`server/core/`) et l'extension des rôles d'agents (**20 rôles statiques**). Elle distingue rigoureusement ce qui est *réellement livré et solide*, ce qui est *scaffolding en attente de câblage*, et ce qui est *ambitieux mais buildable*. **Aucune case n'est ✅ sans preuve dans le code source, avec le fichier et le symbole qui l'attestent.**

Leanna est un **OS agentique local-first** : un IDE, un runtime d'agents autonomes et une mémoire long-terme réunis dans une seule application desktop. La vision reste : passer d'un « IDE qui délègue à des agents » à un **système d'exploitation cognitif qui comprend une intention, planifie un vrai graphe d'exécution parallèle, agit de façon autonome sous garde-fous transactionnels, et apprend de chaque mission**.

---

## Changelog de la roadmap

| Version | Date | Changements majeurs |
|---|---|---|
| **1.6.0** | 2026-10-09 | **Noyau P0 transactionnel** livré (`server/core/` : machine à états durable 13 états, `ExecutionLedger` idempotent, `CheckpointManager` snapshot/rollback, `EvidenceEngine`, `LeannaSupervisor`, `LedgerGuard`, `JevSafetyGate`, `kernel.createCoreKernel`). **20 rôles statiques** (ajout du groupe Web & Qualité : `ui_ux`, `seo`, `documentation`, `accessibility`, `performance`) = **20 plugins runtime**. Autonomie proactive (`AnticipationEngine`, `ComputerUseAgent`, `SmartSkills`). Nouvelle **Phase R7 — 20 fonctionnalités & optimisations**. **R7 #6 livré** : contract-net en production (routage dynamique vers l'agent le mieux-noté + repli déterministe `fallbackBidders`). |
| **1.4.0** | 2026-10-04 | Sandbox d'exécution des skills tiers : `SkillWorker`, `agentDefinitionSchema` (Zod + HMAC-SHA256), `AgentLoader` hardened, `DynamicAgentRegistry.registerAgent()`, `McpBridge.sanitizePathArgs()`. 32 nouveaux tests. |
| **1.3.0** | 2026-09-25 | Re-audit post-`AGENTIC_RUNTIME` et `AUTONOMY_IMPLEMENTATION`. 11 items migrés 📋/🟡 → ✅. KPI actualisés. |
| 1.3.0 | 2026-09-04 | Refonte complète : audit du code, 5 paris, 6 phases R0→R6, registre de risques. |

**Ce qui a changé depuis la 1.4.0** (récapitulatif pour les lecteurs pressés) :

- **Noyau P0** : ✅ machine à états de mission durable (13 états validés), ✅ ledger d'idempotence avec reprise sûre après crash, ✅ checkpoints snapshot/commit/rollback, ✅ moteur de preuve (la preuve prime sur la narration LLM), ✅ superviseur unique orchestrant le cycle `PREPARE→SNAPSHOT→ACT→VERIFY→COMMIT/ROLLBACK`.
- **Safety Gate Jev** : ✅ jugement sémantique de risque pré-exécution, modes `off`/`audit`/`enforce` (fail-closed), seuils calibrables.
- **Agents** : ✅ 20 rôles statiques = 20 plugins runtime (7 rédaction one-shot + 8 ingénierie + 5 Web & Qualité agentiques), ✅ `SwarmComposer`, ✅ `ContractNetNegotiator`, ✅ `MessageBusMonitor`.
- **Autonomie proactive** : ✅ `AnticipationEngine` (observe→détecte→propose + auto-launch borné), ✅ `ComputerUseAgent`, ✅ `SmartSkills` (quality_loop, validate_patch, read_until_understood, plan_code_change).
- **Kill-switch temps-réel** : ✅ `AbortSignal` propagé jusqu'au `ToolRegistry.call` (soldé depuis la 1.4.0).

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
13. [**Phase R7 — 20 fonctionnalités & optimisations (nouveau)**](#phase-r7--20-fonctionnalités--optimisations-nouveau)
14. [Registre des risques](#registre-des-risques)
15. [Dette technique prioritaire](#dette-technique-prioritaire)

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
| **20 rôles = 20 plugins runtime** *(étendu)* | `server/agents/types.ts` (`STATIC_AGENT_ROLES`, 20) + `server/agents/roles.ts` (définitions + prompts FR). Plugins : `writing.agents.ts` (7, one-shot), `engineering.agents.ts` (8, agentique), `specialized.agents.ts` (5, agentique : `ui_ux`/`seo`/`documentation`/`accessibility`/`performance`). Pont `agenticBridge.ts`. |
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
| **Tests & sécurité de base** | **1193+ tests** (`node --import tsx --test server/**/*.test.ts`), 118 tests d'intégration REST (22 fichiers), auth `timingSafeEqual`, rate limiting, écoute loopback, audit log NDJSON, `promptInjectionGuard` (3 vues EN+FR), `csp.ts` dev/prod. |

### 🟡 Scaffolding solide, mais pas encore câblé au réel

| Sous-système | Le gap précis |
|---|---|
| **Observabilité (export réel)** | Traces OpenTelemetry créées et corrélées, mais **aucun exporter OTLP par défaut** ni Jaeger/Tempo local câblé. Les métriques exposées sont des endpoints **JSON** — pas d'exposition au format texte Prometheus. |
| **Timeline de mission rejouable** | Événements `autonomy:*` diffusés sur `/autonomy` (`AutonomyTimeline.tsx`), mais **pas de replay** : pas de fixtures ni de stockage ordonné des décisions/outils/diffs. |
| **File d'approbation humaine (UI)** | `Executor.resolveApproval` + `AutonomyPolicy` + file Telegram (`TelegramService.pendingApprovals`) existent côté backend, mais l'**UI de validation interactive** dans `AutonomyView` reste à câbler (vue encore « lecture seule »). |
| **`AnticipationKind.automation`** | Déclaré dans l'union de types, mais **aucun chemin d'émission** dédié dans le sweep (les opérations récurrentes surfacent en `problem`/`optimization`). |
| **Workflow builder visuel** | `VisualWorkflowBuilder.tsx` présent, mais nature exacte (canvas de nœuds vs formulaire) non confirmée. |
| **Marketplace** | Module minimal (`MarketplaceRegistry.ts` + `types.ts`) — surface réduite, à confirmer comme feature livrée. |

### 🔴 Absent ou très mince

| Sujet | Réalité |
|---|---|
| **Modèles locaux (Ollama)** | Aucune trace. `textGeneration.ts` ne connaît que `'gemini' | 'openrouter'`. Le « local-first » ne s'applique pas encore à l'inférence. |
| **Harness d'évaluation d'agents** | Pas de dossier `eval/`, pas de suite de tâches de référence scorée, pas de fixtures enregistrées. |
| **CI GitHub Actions bloquante** | `.github/workflows/` existe mais aucun pipeline « lint + typecheck + test + build » bloquant confirmé. |
| **Migrations Supabase versionnées** | `supabase/migrations/` ne contient qu'une seule migration ; les autres schémas sont ad-hoc. |
| **Support Linux / macOS Electron** | `package.json > build.win` uniquement (`nsis` x64). |
| **Mode headless / CLI** | Pas de binaire CLI ; unique point d'entrée `server-bootstrap.ts`. |
| **SDK de plugins versionné** | Aucun package `@leanna/plugin-sdk`. |

---

## Vision refondée — les 5 paris

1. **Un cerveau qui planifie vraiment.** ✅ **Atteint** — scheduler DAG parallèle, validation Zod, réplanification à chaud. Reste : estimation coût/risque/durée avancée, timeline rejouable, rapport post-mission unifié.
2. **Une autonomie qui agit sous garde-fous.** ✅ **Atteint & durci** — dispatcher autonome + **Noyau P0 transactionnel** (snapshot/rollback/preuve) + **Safety Gate Jev**. Reste : UI d'approbation interactive.
3. **Un moteur de modèles universel.** 🚧 **En cours** — failover Gemini↔OpenRouter solide. Manque Ollama local + routeur intelligent.
4. **Une mémoire qui apprend.** ✅ **Atteint** — `StrategyMemory` influence la planification dès la première itération. Restent playbooks et profils par projet.
5. **De l'inédit, mesurable.** 📋 **À construire** — harness d'évaluation, time-travel, simulation globale, voix comme interface principale.

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

| Indicateur | Aujourd'hui (2026-10-09) | Cible R5/R7 |
|---|---|---|
| Taux de succès des missions autonomes | mécanique prouvée, **score métier non mesuré** | ≥ 85 % sur suite d'évaluation |
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
| **Reconnexion WebSocket auto** (backoff) sur `/live`, `/notebook-live`, `/terminal`, `/sandbox-watch`, `/autonomy` | P0 | S | 📋 |
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
| **File d'approbation humaine (UI)** : bouton approuver/refuser dans `AutonomyView` (backend + relais Telegram prêts) | P0 | M | 🟡 backend prêt, UI à câbler |
| **Vue Autonomie interactive** : passer de « lecture seule » à un centre de contrôle (approuver, pause, annuler) | P1 | M | 🟡 timeline connectée, actions absentes |
| **Rotation du token API** et **audit des accès** exposés dans l'UI | P1 | M | 📋 |

---

## Phase R3 — Le moteur de modèles universel

| Fonctionnalité | Prio | Effort | Statut |
|---|---|---|---|
| **Intégration Ollama** : provider local first-class (`'gemini' | 'openrouter' | 'ollama'`), mode 100 % hors-ligne | P0 | L | 📋 |
| **Abstraction provider complète** : découpler les skills du client Gemini | P0 | L | 📋 |
| **Fallback en cascade multi-niveaux** (Gemini → OpenRouter → Ollama local) | P0 | M | 🟡 2 niveaux sur 3 |
| **Routeur de modèles intelligent** : choix auto par complexité, coût, latence, confidentialité | P1 | L | 📋 |
| **Cache sémantique de prompts** : réponse réutilisée si prompt équivalent | P1 | M | 📋 |
| **Compression de contexte automatique** en fin de fenêtre | P1 | L | 🟡 `POST /api/tokens/summarize-context` existe ; pas de trigger auto |

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

**Thème** : vingt chantiers concrets qui capitalisent sur le socle livré en 1.6.0 — le **Noyau P0 transactionnel**, les **20 rôles**, l'**autonomie proactive** et le **RAG hybride**. Chaque item cite le composant existant sur lequel il s'appuie, pour rester buildable et honnête. Aucun n'est marqué ✅ : ce sont les prochains pas.

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
| 6 | ✅ ~~**Contract-net en production** : utiliser `ContractNetNegotiator` pour attribuer dynamiquement les tâches aux agents les mieux notés, au lieu d'un routage statique~~ | `ContractNetNegotiator`, `AgentMessageBus` | P1 | L | ✅ Livré — repli déterministe `fallbackBidders` (singleton câblé sur `listAgentRoles`, garantit un gagnant éligible même sans flotte abonnée) ; `AgentOrchestrator.delegateTask`/`delegateAutonomously` basculent sur la négociation quand aucun rôle n'est imposé (`resolveRoleByNegotiation` + `inferRequiredCapabilities`), puis exécutent le gagnant par le chemin standard. HTTP `POST /api/agents/delegate-autonomous` accepte `role` optionnel. Tests : `ContractNetNegotiator.test.ts` (repli), `AgentOrchestrator.negotiation.test.ts` (bascule rôle-implicite). |
| 7 | **Dashboard du bus de messages** : exposer `MessageBusMonitor` (health, alertes, flux, métriques agrégées) dans l'UI avec le rendu ASCII en live | `MessageBusMonitor` | P2 | M | 📋 |
| 8 | **Scoring par-rôle du contract-net** : remplacer le proxy `successRate` global par une fiabilité par rôle issue de `StrategyMemory` | `ContractNetNegotiator.estimateConfidence`, `StrategyMemory` | P2 | M | 📋 |

### Catégorie C — Autonomie proactive

| # | Fonctionnalité / optimisation | S'appuie sur | Prio | Effort | Statut |
|---|---|---|---|---|---|
| 9 | **Centre de propositions** : UI listant les `AnticipationProposal` (problem/opportunity/optimization/risk) avec accepter/ignorer/planifier | `AnticipationEngine.getProposals` | P1 | M | 📋 |
| 10 | **Chemin d'émission `automation`** : implémenter la détection d'opérations manuelles répétées pour émettre réellement des propositions de kind `automation` | `AnticipationEngine` (union déjà déclarée) | P2 | M | 🟡 type déclaré, émission absente |
| 11 | **Computer Use avec confirmation UI** : câbler le handler de confirmation `confirmAtOrAbove` à une modale, pour sortir du fail-closed systématique | `ComputerUseAgent` | P1 | M | 📋 |
| 12 | **Smart Skills dans l'IDE** : exposer `quality_loop` / `validate_patch` / `plan_code_change` comme actions one-click dans l'éditeur | `SmartSkills` | P2 | M | 📋 |

### Catégorie D — Modèles & performance

| # | Fonctionnalité / optimisation | S'appuie sur | Prio | Effort | Statut |
|---|---|---|---|---|---|
| 13 | **Cache sémantique de prompts** : clé par embedding de prompt, réponse réutilisée si similarité ≥ seuil (économie tokens/latence) | `embeddingStore`, `TelemetryService` | P1 | M | 📋 |
| 14 | **Préchauffage & réutilisation du cache de contexte agentique** : persister `session.readCache` entre missions proches d'un même workspace | `AgenticRuntime` (CACHEABLE_TOOLS) | P2 | M | 📋 |
| 15 | **Compression de contexte auto en fin de fenêtre** : déclencher `summarize-context` automatiquement au seuil de tokens plutôt que sur appel manuel | `POST /api/tokens/summarize-context` | P1 | M | 🟡 endpoint prêt, trigger auto manquant |
| 16 | **Budget adaptatif par type de mission** : dériver `DEFAULT_AGENT_BUDGET` (8/3/9/6/4) de l'historique `StrategyMemory` au lieu de constantes fixes | `AgentBudget`, `StrategyMemory` | P2 | M | 📋 |

### Catégorie E — Connaissance, observabilité & qualité

| # | Fonctionnalité / optimisation | S'appuie sur | Prio | Effort | Statut |
|---|---|---|---|---|---|
| 17 | **Exporter OpenTelemetry OTLP + Jaeger local** : rendre visibles les spans mission→task→tool déjà corrélés | `TelemetryService` | P0 | S | 📋 |
| 18 | **Ré-indexation incrémentale des embeddings** : étendre le backoff/debounce du `FileWatcher` au ré-embedding ciblé des fichiers modifiés | `FileWatcher`, `ProjectIndexer`, `EmbeddingStore` | P2 | M | 🟡 KG incrémental ✅, embeddings à confirmer |
| 19 | **Harness d'évaluation d'agents** : dossier `eval/`, tâches de référence, fixtures de réponses modèles, scoring reproductible, détection de régression en CI | `mission-harness.test.ts`, `AgentTaskRunnerContract` | P0 | XL | 📋 |
| 20 | **Rapport post-mission Markdown unifié** : agréger `EvidenceBundle` + diffs + coût + durée + corrections en un artefact lisible, promu en source notebook | `EvidenceEngine`, `TelemetryService`, `DocumentStore` | P1 | M | 🟡 faits disponibles, agrégation à écrire |

> Récapitulatif R7 : **20 items** · P0 ×3 · P1 ×9 · P2 ×8. Chacun transforme un composant **déjà présent** en valeur visible ou en gain de performance — pas de dépendance à une brique inexistante. **Premier item livré : #6 Contract-net en production ✅** (routage dynamique vers l'agent le mieux-noté + repli déterministe).

---

## Registre des risques

| Risque | Impact | Mitigation |
|---|---|---|
| Dépendance forte à Gemini (quotas, ruptures d'API) | Élevé | Routeur multi-provider + Ollama local (R3), abstraction provider (dette P0) |
| Agent autonome causant une perte de données | Élevé | ✅ **Fortement mitigé** — Noyau P0 (snapshot/rollback, idempotence), Safety Gate Jev `enforce`, sandbox, permissions |
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
| Absence de migrations Supabase versionnées | P1 | 📋 Ouvert | R6 (portabilité) |
| Serveur Express monoprocessus (blocages CPU longs) | P1 | 📋 Ouvert | R2/R3 (charge autonome + inférence locale) |
| `planner` a `delete_project_file` dans ses capabilities | P1 | 🐛 Bug identifié | Cohérence du contrat de rôles |
| `AnticipationKind.automation` déclaré mais jamais émis | P2 | 🐛 Incohérence | R7 item #10 |

---

*Cette roadmap est un document vivant, mais elle refuse le vaporware : une fonctionnalité marquée ✅ est prouvée par le code source (fichier + symbole) et couverte par un test. Un 🟡 est du scaffolding honnête, avec le gap précisément identifié. Tout le reste est planifié avec priorité, effort et critère de succès. Depuis la 1.4.0, le **Noyau P0 transactionnel** et le **Safety Gate Jev** font passer le pari « autonomie sous garde-fous » de « mécanique prouvée » à « transactionnel durable », et la Phase R7 trace vingt chantiers qui capitalisent sur ce socle.*

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

# R7 #6 — Contract-net en production (routage dynamique + repli déterministe)
node --import tsx --test server/agents/ContractNetNegotiator.test.ts
node --import tsx --test server/agents/AgentOrchestrator.negotiation.test.ts
node --import tsx --test server/agents/DelegationNegotiation.test.ts
```

Un item ✅ **sans** test exécutable associé est un bug de cette roadmap — signalez-le.

---

**Note de maintenance.** Ce document doit être mis à jour à chaque itération majeure (nouvelle phase R*, changement de statut significatif). Les audits pointus (`docs/LEANNA_AUTONOMY_MASTER_AUDIT.md`, `docs/AGENTIC_RUNTIME.md`) restent la source de vérité pour les détails d'implémentation ; la roadmap reste la source de vérité pour **le statut** et **la priorisation**. En cas de contradiction, le code + les tests priment.
