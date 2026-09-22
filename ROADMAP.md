# Roadmap — Leanna AI Operating System

> Dernière refonte : Septembre 2026 · Version courante : **1.1.0** · Licence BUSL 1.1
>
> Cette roadmap a été **entièrement repensée** après un audit du code réel. Elle distingue rigoureusement ce qui est *réellement livré et solide*, ce qui est *scaffolding en attente de câblage*, et ce qui est *ambitieux mais buildable*. Aucune case n'est ✅ si le code ne le prouve pas.

Leanna est un **OS agentique local-first** : un IDE, un runtime d'agents autonomes et une mémoire long-terme réunis dans une seule application desktop. La vision de cette refonte : passer d'un « IDE qui délègue à des agents » à un **système d'exploitation cognitif qui comprend une intention, planifie un vrai graphe d'exécution parallèle, agit de façon autonome sous garde-fous, et apprend de chaque mission**.

---

## Sommaire

1. [État réel du produit (audit)](#état-réel-du-produit-audit)
2. [Vision refondée — les 5 paris](#vision-refondée--les-5-paris)
3. [Principes directeurs](#principes-directeurs)
4. [Légende & conventions](#légende--conventions)
5. [KPI de succès](#kpi-de-succès)
6. [Phase R0 — Vérité du socle (immédiat)](#phase-r0--vérité-du-socle-immédiat)
7. [Phase R1 — Le cerveau qui planifie vraiment](#phase-r1--le-cerveau-qui-planifie-vraiment)
8. [Phase R2 — L'autonomie qui agit](#phase-r2--lautonomie-qui-agit)
9. [Phase R3 — Le moteur de modèles universel](#phase-r3--le-moteur-de-modèles-universel)
10. [Phase R4 — Mémoire cumulative & apprentissage](#phase-r4--mémoire-cumulative--apprentissage)
11. [Phase R5 — Innovation & différenciation](#phase-r5--innovation--différenciation)
12. [Phase R6 — Ouverture & portabilité](#phase-r6--ouverture--portabilité)
13. [Registre des risques](#registre-des-risques)
14. [Dette technique prioritaire](#dette-technique-prioritaire)

---

## État réel du produit (audit)

Constat honnête, tiré du code source. C'est le point de départ de toute la refonte.

### ✅ Réellement solide, production-grade

| Sous-système | Preuve dans le code |
|---|---|
| **Sandbox isolé & sync transactionnel** | `server/utils/sandbox.ts` : machine à états fail-closed (DISABLED→INITIALIZING→READY), défense anti-échappement (chemins absolus/UNC/drive-relative rejetés, walk des symlinks segment par segment), sync transactionnelle avec checkpoint + rollback total, mutex anti-concurrence. C'est la couche la plus robuste du produit. |
| **RAG hybride** | `server/notebooks/RAGEngine.ts` : pipeline réel en 5 étapes — expansion de requête LLM, embeddings sémantiques, TF-IDF lexical, fusion RRF pondérée, re-ranking LLM, citations sourcées `[SOURCE N]`. Le sous-système le plus mûr. |
| **Suivi coûts & tokens** | `server/observability/TelemetryService.ts` : capture réelle des tokens depuis Gemini/OpenRouter, calcul de coût par table de pricing, agrégation par modèle/agent/mission, flush Supabase à dégradation propre. |
| **Failover multi-provider** | `server/utils/textGeneration.ts` : routeur Gemini↔OpenRouter réel avec circuit breaker par provider, key-pool Gemini avec rotation 429, streaming supporté. |
| **Tests & sécurité de base** | 103 tests d'intégration REST + 136+ tests skills, auth `timingSafeEqual`, rate limiting, écoute loopback, audit log. |

### 🟡 Scaffolding solide, mais pas encore câblé au réel

| Sous-système | Le gap précis |
|---|---|
| **Agent Brain** | `AgentBrain.executeGoal()` exécute les étapes dans une **simple boucle `for` séquentielle** et s'arrête à la première erreur. Les `dependsOn` existent dans les données mais **aucun scheduler topologique** ne les lit : pas de parallélisme, pas de branches. Le « plan dynamique » heuristique est en réalité une **échelle de rôles codée en dur** par mot-clé de domaine (une branche est même taillée pour la démo « header responsive »). Le parsing du plan LLM est un `regex match` sans validation de schéma. |
| **Runtime autonome** | `LeannaCore` est une vraie boucle perception→file bornée→persistance→timeline, mais le handler terminal `onTask` (dans `server.ts`) **écrit juste une observation en mémoire de session**. Aucun outil, aucune mission n'est déclenchée. L'autonomie *observe* mais n'*agit* pas. La vue `AutonomyView` est explicitement « lecture seule ». |
| **Observabilité** | Traces OpenTelemetry réellement créées et corrélées mission→task→tool→model, **mais aucun exporter** par défaut (console-only si `OTEL_CONSOLE_EXPORT=1`). Les budgets sont **comptés mais pas appliqués** : `checkBudget()` calcule `exceeded` mais rien n'arrête la mission automatiquement. |

### 🔴 Absent ou très mince

| Sujet | Réalité |
|---|---|
| **Modèles locaux (Ollama)** | Aucune trace dans le code. Le routeur ne connaît que `'gemini' \| 'openrouter'`, tous deux hébergés et centrés Google par défaut. Le « local-first » ne s'applique pas encore à l'inférence. |
| **Vrai DAG d'agents** | Pas de scheduler, pas d'exécution concurrente, pas de fan-out/fan-in. |
| **Apprentissage cumulatif** | La mémoire injecte du contexte mais ne modifie pas le comportement de planification. |
| **Évaluation d'agents** | Pas de harness de scoring, pas de replay déterministe, pas de détection de régression agent. |

---

## Vision refondée — les 5 paris

Ces cinq paris structurent toute la roadmap. Chacun transforme une force existante ou comble un gap identifié à l'audit.

1. **Un cerveau qui planifie vraiment.** Remplacer la boucle séquentielle par un **scheduler de DAG parallèle** avec fan-out/fan-in, réplanification à chaud et plans validés par schéma. On a déjà les données `dependsOn` — il manque le moteur.
2. **Une autonomie qui agit sous garde-fous.** Câbler le `onTask` no-op à un **dispatcher de missions réel** passant par permissions, dry-run et approbation. On a la perception, la file bornée, la persistance — il manque le pont vers l'exécution.
3. **Un moteur de modèles universel.** Étendre le routeur à un **routeur intelligent** (choix par coût/latence/complexité) + **Ollama local** pour un vrai mode hors-ligne. On a le failover — il manque le local et la décision.
4. **Une mémoire qui apprend.** Passer d'une mémoire-contexte à une **mémoire qui change les décisions** : préférences, échecs passés, playbooks appris.
5. **De l'inédit, mesurable.** Des capacités qu'on ne voit pas ailleurs : **time-travel debugging de missions**, **agents proactifs qui ouvrent des PR**, **simulation de mission avant exécution**, **voix comme interface principale**.

---

## Principes directeurs

| # | Principe | Conséquence concrète |
|---|---|---|
| 1 | **Local-first** | Rien ne quitte la machine sans action explicite. Étendu à l'inférence via Ollama (R3). |
| 2 | **Agent sous contrôle** | Toute action destructive est réversible (sandbox, checkpoint) ou soumise à approbation. |
| 3 | **Observable par défaut** | Si l'agent le fait, on le voit, on le rejoue, on en connaît le coût — et le budget peut *stopper* la mission, pas seulement la compter. |
| 4 | **Extensible sans fork** | Skills, agents, modèles et workflows s'ajoutent sans toucher au cœur. |
| 5 | **Honnêteté d'ingénierie** | Une case n'est ✅ que si le code la prouve. Le scaffolding est marqué comme tel. |

---

## Légende & conventions

**Statut** : ✅ Fait (prouvé par le code) · 🟡 Partiel/scaffolding · 🚧 En cours · 📋 Planifié · 💡 Idée

**Priorité** : P0 (fondation, débloque le reste) · P1 (majeur) · P2 (confort) · P3 (opportuniste)

**Effort** : S (< 2 j) · M (2–5 j) · L (1–2 sem.) · XL (> 2 sem.)

**DoD** : code + tests + doc + entrée CHANGELOG. Sans les quatre, pas de ✅.

---

## KPI de succès

| Indicateur | Aujourd'hui | Cible R5 |
|---|---|---|
| Taux de succès des missions autonomes | non mesuré (pas de harness) | ≥ 85 % sur suite d'évaluation |
| Parallélisme réel du planificateur | 1 (séquentiel) | ≥ 4 étapes concurrentes quand le DAG le permet |
| Missions autonomes réellement exécutées | 0 (onTask no-op) | ≥ 90 % des tâches perçues aboutissent à une action tracée |
| Inférence locale disponible | non | Ollama : ≥ 1 modèle en fallback hors-ligne |
| Budget appliqué (kill-switch) | non (compté seulement) | Arrêt automatique à 100 % du dépassement |
| Coût médian d'une mission | mesuré, affiché | mesuré, affiché, **plafonnable et appliqué** |
| Régression agent détectée en CI | non | PR bloquée si le score baisse |
| Temps de démarrage à froid (Electron) | à mesurer | < 3 s |

---

## Phase R0 — Vérité du socle (immédiat)

**Thème** : rendre vrai ce qui est marqué comme fait. Ces items sont des dettes qui bloquent la crédibilité et les phases suivantes.

| Fonctionnalité | Prio | Effort | Statut |
|---|---|---|---|
| **Exporter OpenTelemetry réel** (OTLP → Jaeger/Tempo local en container) — les traces existent mais ne sortent nulle part | P0 | S | 📋 |
| **Appliquer les budgets** : brancher `checkBudget()` sur l'AgentExecutor/Mission pour un arrêt dur au dépassement | P0 | M | 📋 |
| **Validation de schéma Zod du plan LLM** (remplacer le `regex match` fragile de `DynamicPlanner.planWithLLM`) | P0 | S | 📋 |
| **CI GitHub Actions bloquante** : lint + typecheck + test + build + `npm audit` à chaque PR | P0 | M | 📋 |
| **Reconnexion WebSocket auto** (backoff exponentiel) sur `/live`, `/terminal`, `/sandbox-watch`, `/autonomy` | P0 | S | 📋 |
| **Health check enrichi** `/api/health` : Supabase, Gemini, pgvector, Ollama, uptime, version | P1 | S | 📋 |
| **Endpoint `/api/metrics` Prometheus** (latences, erreurs, files, coûts) | P2 | M | 📋 |
| **Scan + redaction de secrets** dans logs, traces, prompts et avant tout commit/push agent | P0 | M | 📋 |

---

## Phase R1 — Le cerveau qui planifie vraiment

**Thème** : transformer l'Agent Brain d'un pipeline linéaire déguisé en DAG en un **vrai orchestrateur de graphe**.

| Fonctionnalité | Prio | Effort | Statut |
|---|---|---|---|
| **Scheduler topologique** : lire les `dependsOn`, exécuter les étapes indépendantes **en parallèle** (fan-out/fan-in), respecter les dépendances | P0 | XL | 📋 |
| **Réplanification à chaud** : sur échec d'étape, le Brain re-décompose le sous-graphe restant au lieu d'aborter tout le pipeline | P0 | L | 📋 |
| **Plan validé & inspectable** : schéma Zod strict, visualisation Mermaid du DAG dans l'UI avant exécution (`plan_first`) | P1 | M | 📋 |
| **Planification par capacités, pas par mots-clés** : remplacer les échelles de rôles codées en dur par une sélection basée sur les capabilities déclarées des agents | P1 | L | 📋 |
| **Estimation coût/risque/durée avant exécution** affichée sur le plan | P1 | M | 📋 |
| **Détection de boucle infinie d'agent** (même action N fois → pivot/escalade forcé) | P1 | S | 📋 |
| **Timeline de mission rejouable** : chaque décision, outil, diff, coût, horodaté et navigable | P1 | L | 📋 |
| **Rapport post-mission automatique** (fichiers touchés, tests lancés, coût, durée, échecs, corrections) | P1 | M | 📋 |

---

## Phase R2 — L'autonomie qui agit

**Thème** : câbler la perception (déjà solide) à l'exécution réelle, sous tous les garde-fous existants.

| Fonctionnalité | Prio | Effort | Statut |
|---|---|---|---|
| **Dispatcher de missions autonome** : remplacer le `onTask` no-op par un vrai lancement de mission via `ToolRegistry` → `PermissionPolicy` → `DryRunController` → `AutonomyPolicy` | P0 | XL | 🟡→📋 |
| **File d'approbation humaine** : les actions autonomes destructives attendent un OK (UI + Telegram) avant d'agir | P0 | M | 📋 |
| **Agents proactifs** : détectent dette technique, dépendance vulnérable, test manquant, et **proposent** une mission (sans l'exécuter sans accord) | P1 | L | 💡 |
| **Snapshots de workspace** avant mission longue, rollback en un clic | P1 | M | 📋 |
| **Mode approbation granulaire** : validation requise avant écriture hors sandbox, `git push`, commande shell | P0 | M | 📋 |
| **Vue Autonomie interactive** : passer de « lecture seule » à un centre de contrôle (approuver, mettre en pause, annuler) | P1 | M | 🟡→📋 |
| **Rotation du token API** et **audit des accès** exposés dans l'UI | P1 | M | 📋 |

---

## Phase R3 — Le moteur de modèles universel

**Thème** : de « Gemini + fallback » à un vrai moteur multi-modèles avec inférence locale.

| Fonctionnalité | Prio | Effort | Statut |
|---|---|---|---|
| **Intégration Ollama** : provider local first-class dans le routeur (`'gemini' \| 'openrouter' \| 'ollama'`), mode 100 % hors-ligne | P0 | L | 📋 |
| **Routeur de modèles intelligent** : choix automatique par complexité, coût, latence et confidentialité de la tâche | P1 | L | 📋 |
| **Fallback en cascade multi-niveaux** (Gemini → OpenRouter → Ollama local) sur quota/erreur | P0 | M | 🟡→📋 |
| **Cache sémantique de prompts** : réponse réutilisée si prompt équivalent (économie tokens) | P1 | M | 📋 |
| **Compression de contexte** : résumé auto des longues sessions avant dépassement de fenêtre | P1 | L | 📋 |
| **Multi-modèles simultanés** : Gemini + Claude + local en parallèle sur la même tâche, meilleure réponse retenue | P2 | XL | 💡 |
| **Abstraction provider complète** : découpler les skills du client Gemini (dette technique P0 identifiée) | P0 | L | 📋 |

---

## Phase R4 — Mémoire cumulative & apprentissage

**Thème** : une mémoire qui ne fait pas qu'injecter du contexte, mais **change les décisions**.

| Fonctionnalité | Prio | Effort | Statut |
|---|---|---|---|
| **Playbooks appris** : après une mission réussie, le Brain persiste la séquence d'agents gagnante et la réutilise sur objectifs similaires | P1 | L | 💡 |
| **Mémoire d'échecs** : les erreurs passées modifient la planification (évite les approches qui ont échoué) | P1 | L | 💡 |
| **Profils d'agent par projet** : conventions, style de code, règles apprises et appliquées automatiquement | P1 | M | 📋 |
| **Recherche hybride sur la mémoire** (déjà en place pour les notebooks — l'étendre à la mémoire long-terme) | P1 | M | 📋 |
| **Ré-indexation incrémentale** du Knowledge Graph et des embeddings (pas de reconstruction complète) | P2 | M | 📋 |
| **Reranking + citations obligatoires** étendus à toutes les réponses mémoire, pas seulement notebooks | P2 | M | 📋 |
| **Journal de bord quotidien** auto-généré (ce qui a changé, pourquoi, par quel agent) | P2 | M | 💡 |

---

## Phase R5 — Innovation & différenciation

**Thème** : du jamais-vu, mais buildable sur le socle. C'est ce qui distingue Leanna.

| Fonctionnalité | Prio | Effort | Statut |
|---|---|---|---|
| **Time-travel debugging de missions** : rejouer une mission étape par étape avec réponses modèles enregistrées (fixtures), inspecter chaque état | P1 | XL | 💡 |
| **Simulation complète de mission (dry-run global)** : exécuter tout le DAG en simulation, voir tous les diffs et coûts prévus, sans aucun effet de bord | P1 | L | 🟡→📋 |
| **Harness d'évaluation d'agents** : suite de tâches de référence scorées automatiquement, détection de régression en CI | P0 | XL | 📋 |
| **Leanna se développe elle-même (SELF_IDE complet)** : ouvre une PR sur son propre repo, la teste, la documente, attend une revue humaine | P2 | XL | 💡 |
| **Voix comme interface principale** : mot d'activation, conversation mains libres continue, compréhension de l'écran en temps réel (le socle Gemini Live + partage d'écran existe déjà) | P1 | L | 💡 |
| **Agent de revue de PR** : commente le diff, suggère, ne pousse rien sans accord | P1 | L | 💡 |
| **Compagnon mobile** : app iOS/Android en accès distant au serveur local (suivre, approuver, relire) — le pont Telegram est un premier pas | P2 | XL | 💡 |
| **Versionnage & A/B testing de prompts** sur la suite d'évaluation | P2 | L | 💡 |

---

## Phase R6 — Ouverture & portabilité

**Thème** : Leanna tourne partout et s'étend sans fork.

| Fonctionnalité | Prio | Effort | Statut |
|---|---|---|---|
| **Support Linux** (AppImage/deb) et **macOS** (.dmg notarisé) | P1 | L | 📋 |
| **Docker Compose self-hosted** (app + Supabase local + Ollama + Jaeger) | P1 | M | 📋 |
| **Mode headless / CLI** : lancer une mission depuis le terminal ou un cron, sans UI | P1 | L | 📋 |
| **Supabase local** (Postgres + pgvector en container) pour un fonctionnement 100 % hors-ligne | P1 | L | 📋 |
| **SDK de plugins** (`@leanna/plugin-sdk`) avec API stable et versionnée | P1 | XL | 💡 |
| **Exécution des skills tiers en sandbox** (worker isolé, permissions déclarées, timeout) + **signature** | P0 | L | 📋 |
| **Migrations de schéma versionnées et réversibles** (dette identifiée) | P1 | M | 📋 |
| **Export/Import complet du profil** (skills, workflows, agents, mémoires) | P1 | M | 📋 |
| **Workflows en DSL YAML** versionnables en Git, éditables en UI ou texte | P2 | L | 💡 |
| **Webhooks entrants/sortants** (déclencher une mission depuis un événement externe) | P2 | M | 💡 |

---

## Registre des risques

| Risque | Impact | Mitigation |
|---|---|---|
| Dépendance forte à Gemini (quotas, ruptures d'API) | Élevé | Routeur multi-provider + Ollama local (R3), abstraction provider (dette P0) |
| Agent autonome causant une perte de données une fois `onTask` câblé | Élevé | Sandbox (déjà solide), snapshots, permissions, file d'approbation (R2) |
| Coûts modèles non maîtrisés | Moyen | Budgets **appliqués** (R0), pas seulement comptés |
| Scaffolding pris pour du fini (fausse confiance) | Moyen | Cette roadmap distingue explicitement 🟡 de ✅ ; DoD strict |
| Parallélisme du scheduler introduisant des races | Moyen | Sandbox transactionnel + mutex existants, tests de charge (R5) |
| Skills tiers non fiables | Élevé | Sandbox d'exécution + signature (R6) |
| Fuite de secrets dans prompts/logs | Élevé | Scan + redaction (R0) |

---

## Dette technique prioritaire

À traiter en continu, elle conditionne plusieurs phases.

| Sujet | Priorité | Débloque |
|---|---|---|
| Couplage des skills au client Gemini | P0 | R3 (multi-provider, Ollama) |
| Exécution Brain séquentielle (boucle `for`, abort au 1er échec) | P0 | R1 (scheduler DAG) |
| `onTask` autonome no-op | P0 | R2 (autonomie qui agit) |
| Budgets comptés mais non appliqués | P0 | R0 (kill-switch) |
| Traces OTel sans exporter | P1 | R0 (observabilité réelle) |
| Parsing regex du plan LLM sans validation | P1 | R1 (plans fiables) |
| Absence de migrations Supabase versionnées | P1 | R6 (portabilité) |
| Serveur Express monoprocessus (blocages CPU longs) | P1 | R2/R3 (charge autonome + inférence locale) |

---

*Cette roadmap est un document vivant, mais elle refuse le vaporware : une fonctionnalité marquée ✅ est prouvée par le code, un 🟡 est du scaffolding honnête, et tout le reste est planifié avec priorité, effort et critère de succès. L'ambition est réelle — le parallélisme, l'autonomie exécutante, l'inférence locale et l'apprentissage cumulatif — mais chaque pari part d'une force existante ou comble un gap précisément identifié.*
