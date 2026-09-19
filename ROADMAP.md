# Roadmap — Leanna AI Operating System

> Dernière mise à jour : Septembre 2026 · Version courante : **1.1.0** · Licence BUSL 1.1

Leanna est un **OS agentique local-first** : un IDE, un runtime d'agents autonomes et une mémoire long-terme réunis dans une seule application desktop. Cette roadmap décrit où va le produit, avec quelles priorités et selon quels critères de succès.

---

## Sommaire

1. [Principes directeurs](#principes-directeurs)
2. [Légende & conventions](#légende--conventions)
3. [Cadence de release](#cadence-de-release)
4. [Indicateurs de succès (KPI)](#indicateurs-de-succès-kpi)
5. [V1.0 — Stabilité et tests (livré)](#v10--stabilité-et-tests-septembre-2026-)
6. [V0 — Socle livré](#v0--socle-livré)
7. [V1.1 — Observabilité & confiance (Q4 2026)](#v11--observabilité--confiance-q4-2026)
8. [V1.2 — Agents fiables & évaluables (Q1 2027)](#v12--agents-fiables--évaluables-q1-2027)
9. [V1.3 — Ouverture & portabilité (Q2 2027)](#v13--ouverture--portabilité-q2-2027)
10. [V2 — Vision long terme](#v2--vision-long-terme)
11. [Backlog](#backlog)
12. [Non-objectifs](#non-objectifs)
13. [Registre des risques](#registre-des-risques)
14. [Dette technique identifiée](#dette-technique-identifiée)

---

## Principes directeurs

Toute fonctionnalité proposée doit être défendable face à ces cinq principes. Si elle en contredit un, elle part au backlog avec une justification.

| # | Principe | Conséquence concrète |
|---|---|---|
| 1 | **Local-first** | Rien ne quitte la machine sans action explicite. Le cloud est une option, jamais un prérequis. |
| 2 | **Agent sous contrôle** | Toute action destructive est réversible (checkpoint Git, snapshot) ou soumise à approbation. |
| 3 | **Observable par défaut** | Si l'agent le fait, l'utilisateur peut le voir, le rejouer et en connaître le coût. |
| 4 | **Extensible sans fork** | Skills, agents, modèles et workflows s'ajoutent sans toucher au cœur. |
| 5 | **Coût maîtrisé** | Chaque appel modèle est compté, plafonnable et attribuable à une tâche. |

---

## Légende & conventions

**Statut** : ✅ Fait · 🚧 En cours · 📋 Planifié · 💡 Idée · ❄️ Gelé

**Priorité** : P0 (bloquant release) · P1 (majeur) · P2 (confort) · P3 (opportuniste)

**Effort** : S (< 2 j) · M (2–5 j) · L (1–2 sem.) · XL (> 2 sem.)

Chaque ligne planifiée possède une **DoD** (Definition of Done) implicite : code + tests + documentation + entrée CHANGELOG. Sans les quatre, la case ne passe pas à ✅.

---

## Cadence de release

| Type | Fréquence | Contenu |
|---|---|---|
| Patch (`1.0.x`) | À la demande | Correctifs, sécurité, régressions |
| Mineure (`1.x.0`) | ~6 semaines | Un thème de roadmap, rétrocompatible |
| Majeure (`x.0.0`) | ~12 mois | Ruptures d'API assumées, migration documentée |

Règle : une version mineure ne sort pas si la CI est rouge, si la couverture globale baisse, ou si une régression P0 est ouverte.

---

## Indicateurs de succès (KPI)

Cibles à atteindre avant de déclarer la V2 ouverte.

| Indicateur | Aujourd'hui | Cible V1.3 |
|---|---|---|
| Couverture de tests globale | ~60 % (skills) | ≥ 75 % global, ≥ 85 % sur `server/agents/` |
| Temps de démarrage à froid (Electron) | à mesurer | < 3 s jusqu'à l'IDE interactif |
| Taux de succès des missions autonomes | non mesuré | ≥ 80 % sur la suite d'évaluation interne |
| Taux de correction automatique (repair loop) | non mesuré | ≥ 70 % des erreurs TSC résolues sans humain |
| Coût médian d'une mission | non mesuré | Mesuré, affiché, plafonnable |
| MTTR après crash serveur | non mesuré | < 30 s (restauration automatique des tâches) |
| Vulnérabilités `npm audit` critiques | non suivi | 0 en continu (CI bloquante) |

> **Prérequis transverse** : quatre KPI sur sept sont « non mesurés ». La V1.1 est donc consacrée en priorité à l'instrumentation. On n'améliore pas ce qu'on ne mesure pas.

---

## V1.0 — Stabilité et tests (Septembre 2026) ✅

### Qualité et tests
| Fonctionnalité | Statut |
|---|---|
| Suite complète de tests d'intégration REST (74 tests) | ✅ Fait |
| Tests unitaires des skills (136+ tests, ≥ 60 % couverture) | ✅ Fait |
| Documentation complète des tests (TESTING.md) | ✅ Fait |
| Patterns de test standardisés pour tous les routeurs | ✅ Fait |
| Validation des schémas Zod dans tous les endpoints | ✅ Fait |
| Tests de rate limiting et authentification | ✅ Fait |
| Tests de gestion d'erreurs (400/404/500/503) | ✅ Fait |
| Guide de contribution avec templates de tests | ✅ Fait |
| Changelog structuré (CHANGELOG.md) | ✅ Fait |

---

## V0 — Socle livré

Fonctionnalités déjà présentes dans le code source.

### Infrastructure & Sécurité
| Fonctionnalité | Statut |
|---|---|
| Serveur Express monoprocessus avec Vite en middleware | ✅ Fait |
| Authentification par token (`x-leanna-token`) sur toutes les routes `/api/*` | ✅ Fait |
| Auto-génération du token API au premier démarrage | ✅ Fait |
| Chiffrement des clés sensibles dans `.env` (`Leanna_MASTER_KEY`) | ✅ Fait |
| Écoute sur `127.0.0.1` par défaut (pas d'exposition réseau) | ✅ Fait |
| Rate limiting global + limiteurs spécifiques (notebooks, sandbox) | ✅ Fait |
| Circuit breaker frontend (prévention ENOBUFS) | ✅ Fait |
| Déduplication des requêtes GET in-flight (frontend) | ✅ Fait |
| Graceful shutdown (sessions Gemini, timers, WebSocket) | ✅ Fait |
| Validation TypeScript stricte (strict, noUnusedLocals…) | ✅ Fait |
| Audit log des opérations fichiers | ✅ Fait |

### IDE & Système de fichiers
| Fonctionnalité | Statut |
|---|---|
| Éditeur Monaco multi-onglets avec coloration syntaxique | ✅ Fait |
| Arborescence de fichiers (FileExplorer) avec CRUD complet | ✅ Fait |
| Recherche plein-texte et regex dans le workspace | ✅ Fait |
| Sandbox isolé avec diff, validation TSC, sync granulaire | ✅ Fait |
| Sandbox exit code avec rate limiting et comparaison temps-constant | ✅ Fait |
| Terminal PTY interactif via WebSocket | ✅ Fait |
| Checkpoint Git automatique avant modifications critiques | ✅ Fait |
| Watcher de fichiers incrémental (Knowledge Graph) | ✅ Fait |
| Pagination serveur de `GET /api/ide/tree` (workspaces > 10k fichiers) | ✅ Fait |
| Diff viewer intégré côté UI (sandbox file-diff) | ✅ Fait |

### Intelligence Artificielle
| Fonctionnalité | Statut |
|---|---|
| Intégration Gemini Live API (texte, voix, vision) | ✅ Fait |
| Pool de clés Gemini avec rotation sur erreur 429 | ✅ Fait |
| SkillManagerV2 + ToolRegistry centralisé | ✅ Fait |
| 25+ skills natifs (system, codebase, browser, memory, github…) | ✅ Fait |
| Custom Skills créés via UI et persistés dans Supabase | ✅ Fait |
| Agent Orchestrator avec 7 rôles spécialisés | ✅ Fait |
| Agent Brain (planification dynamique, mode `plan_first`) | ✅ Fait |
| Boucle de correction automatique (BrainCorrectionLoop / AgentRepairLoop) | ✅ Fait |
| Boucle autonome Observe → Decide → Act par rôle | ✅ Fait |
| Message Bus inter-agents + monitoring | ✅ Fait |
| Persistance des agents et orchestrations dans Supabase | ✅ Fait |
| Restauration des tâches après crash/redémarrage | ✅ Fait |
| Collaboration multi-agents par patterns prédéfinis | ✅ Fait |
| Mission System pour tâches longues (multi-étapes) | ✅ Fait |
| Chain of Thought configurable (`ENABLE_CHAIN_OF_THOUGHT`) | ✅ Fait |
| Streaming des réponses agents via SSE | ✅ Fait |
| OpenRouter comme backend alternatif | ✅ Fait |
| MCP (Model Context Protocol) bridge | ✅ Fait |
| Text-to-Speech (TTS) intégré | ✅ Fait |

### Knowledge & Mémoire
| Fonctionnalité | Statut |
|---|---|
| Knowledge Graph avec parsing AST (Tree-sitter TS/JS) | ✅ Fait |
| Cache partagé pour le Knowledge Graph (multi-instances) | ✅ Fait |
| Workspace Indexer (extraction documents, sections) | ✅ Fait |
| Mémoire long-terme dans Supabase (pgvector) | ✅ Fait |
| Mémoire hiérarchique : session / projet / long-terme | ✅ Fait |
| Recherche sémantique par similarité vectorielle (RAG) | ✅ Fait |
| Notebooks RAG : ingestion PDF/texte, chat contextuel | ✅ Fait |
| Ingestion de repos GitHub publics | ✅ Fait |
| Cache de réponses notebooks (TTL + invalidation par source) | ✅ Fait |
| Backup automatique des notebooks | ✅ Fait |
| Historique conversations persisté avec recherche full-text | ✅ Fait |
| Listes intelligentes gérées par l'IA | ✅ Fait |

### Intégrations
| Fonctionnalité | Statut |
|---|---|
| GitHub : repos, issues, PRs, notifications, commits, push | ✅ Fait |
| Puppeteer : automatisation web headless | ✅ Fait |
| FTP : connexion et navigation (IPs privées bloquées par défaut) | ✅ Fait |
| Partage d'écran vers Gemini (desktopCapturer Electron) | ✅ Fait |
| Webcam vers Gemini | ✅ Fait |
| Supervision PM2 depuis l'UI | ✅ Fait |

### Desktop & UI
| Fonctionnalité | Statut |
|---|---|
| Application Electron (Windows, NSIS installer) | ✅ Fait |
| Splash screen animé | ✅ Fait |
| Thème dark/light + couleur d'accent personnalisable | ✅ Fait |
| Animations de transitions entre routes (motion/react) | ✅ Fait |
| Orb flottant déplaçable (chat rapide hors IDE) | ✅ Fait |
| Code splitting Vite (vendor-react, vendor-monaco, ide-core, panels) | ✅ Fait |
| Lazy loading des workers Monaco | ✅ Fait |
| Sélecteur de workspace au démarrage (StartupProjectModal) | ✅ Fait |
| Marketplace de skills et d'agents | ✅ Fait |
| Workflows automatisés planifiables depuis l'UI | ✅ Fait |
| Tâches planifiées (automation) | ✅ Fait |
| Indicateur de progression des agents en temps réel | ✅ Fait |
| Documentation interactive des skills (auto-générée) | ✅ Fait |
| Hot-reload des custom skills sans redémarrage | ✅ Fait |
| Validation des variables d'environnement au démarrage | ✅ Fait |

---

## V1.1 — Observabilité & confiance (Q4 2026)

**Thème** : on ne peut pas faire confiance à un agent qu'on ne voit pas travailler. Cette version rend visible le coût, le raisonnement et l'impact de chaque action.

### Observabilité 🆕
| Fonctionnalité | Prio | Effort | Statut |
|---|---|---|---|
| Logging structuré JSON avec niveaux (`debug`/`info`/`warn`/`error`) et `correlationId` par requête | P0 | M | 📋 Planifié |
| **Tracing OpenTelemetry** : une trace par mission, un span par étape/outil/appel modèle | P1 | L | ✅ Fait |
| **Tableau de bord Coûts & Tokens** : consommation par modèle, agent, mission et jour | P0 | L | ✅ Fait |
| **Budget guardrails** : plafond de tokens/€ par mission, arrêt automatique au dépassement | P0 | M | ✅ Fait |
| Health check enrichi (`/api/health`) : Supabase, Gemini, pgvector, mémoire, uptime, version | P0 | S | 📋 Planifié |
| **Endpoint `/api/metrics` format Prometheus** (latences, erreurs, files d'attente) | P2 | M | 📋 Planifié |
| **Timeline de mission rejouable** : chaque décision, outil appelé, diff produit, horodaté | P1 | L | 📋 Planifié |
| **Rapport post-mission automatique** (fichiers touchés, tests lancés, coût, durée, échecs) | P1 | M | 📋 Planifié |
| Détection et alerte de boucle infinie d'agent (même action N fois) | P1 | S | 📋 Planifié |

### Sécurité & contrôle de l'agent 🆕
| Fonctionnalité | Prio | Effort | Statut |
|---|---|---|---|
| **Modèle de permissions par skill** (`read` / `write` / `network` / `exec`) déclaré et appliqué au runtime | P0 | L | ✅ Fait |
| **Mode approbation humaine** : validation requise avant écriture hors sandbox, `git push`, commande shell | P0 | M | 📋 Planifié |
| **Dry-run global** : exécuter une mission complète en simulation, sans effet de bord | P1 | M | ✅ Fait |
| **Liste d'exclusion de chemins** (`.leannaignore`) : dossiers interdits en écriture à l'agent | P1 | S | 📋 Planifié |
| Snapshots de workspace avant mission longue, avec rollback en un clic | P1 | M | 📋 Planifié |
| Support HTTPS local (certificat auto-signé) | P2 | S | 📋 Planifié |
| Rotation du `Leanna_API_TOKEN` depuis l'UI (sans redémarrage) | P1 | S | 📋 Planifié |
| Audit des accès API (qui, quoi, quand) exposé dans l'UI | P1 | M | 📋 Planifié |
| **Scan de secrets** avant tout commit/push généré par l'agent | P0 | M | 📋 Planifié |
| **Redaction automatique des secrets** dans les logs, traces et prompts envoyés aux modèles | P0 | M | 📋 Planifié |
| Limitation configurable de la taille des uploads documents | P2 | S | 📋 Planifié |

### Qualité & CI
| Fonctionnalité | Prio | Effort | Statut |
|---|---|---|---|
| CI GitHub Actions : lint + typecheck + test + build à chaque PR | P0 | M | 📋 Planifié |
| **CI bloquante sur la couverture** (seuil minimal, pas de régression) | P1 | S | 📋 Planifié |
| **`npm audit` + Dependabot + génération de SBOM** en CI | P1 | S | 📋 Planifié |
| Tests d'intégration pour tous les routeurs REST restants | P1 | L | 📋 Planifié |
| Tests E2E Playwright sur les flux critiques (sandbox sync, agent delegate, notebook chat) | P1 | L | 📋 Planifié |
| **Tests de charge** sur le WebSocket PTY et le SSE agents (N sessions simultanées) | P2 | M | 📋 Planifié |
| Reconnexion automatique WebSocket côté client avec backoff exponentiel | P0 | S | 📋 Planifié |
| **Builds reproductibles + release automatisée** (tag → installeur signé + CHANGELOG) | P2 | M | 📋 Planifié |

### UI/UX
| Fonctionnalité | Prio | Effort | Statut |
|---|---|---|---|
| Recherche globale (fichiers + mémoires + historique + commandes) via `Cmd+K` | P1 | M | 📋 Planifié |
| Notifications desktop (OS) pour les événements agents importants | P2 | S | 📋 Planifié |
| Raccourcis clavier configurables (remapping) | P2 | M | 📋 Planifié |
| **Palette de commandes agent** : lancer une mission sans quitter le clavier | P2 | S | 📋 Planifié |
| **Panneau « Ce que l'agent fait maintenant »** (étape courante, outil, fichier, coût cumulé) | P1 | M | 📋 Planifié |
| **Accessibilité** : navigation clavier complète, ARIA, contrastes AA | P2 | L | 📋 Planifié |
| **Internationalisation (i18n)** FR/EN avec détection de la locale système | P2 | M | 📋 Planifié |

---

## V1.2 — Agents fiables & évaluables (Q1 2027)

**Thème** : passer d'agents qui « marchent souvent » à des agents dont on mesure et fait progresser le taux de réussite.

### Évaluation & fiabilité 🆕
| Fonctionnalité | Prio | Effort | Statut |
|---|---|---|---|
| **Harness d'évaluation d'agents** : suite de tâches de référence rejouable, scorée automatiquement | P0 | XL | 📋 Planifié |
| **Mode replay déterministe** : rejouer une mission avec réponses modèles enregistrées (fixtures) | P0 | L | 📋 Planifié |
| **Versionnage des prompts** avec historique, diff et rollback | P1 | M | 📋 Planifié |
| **A/B testing de prompts et de modèles** sur la suite d'évaluation | P2 | L | 💡 Idée |
| **Détection de régression agent** en CI (le score baisse → PR bloquée) | P1 | M | 📋 Planifié |
| Golden tests des sorties de skills critiques (snapshot des schémas de retour) | P1 | M | 📋 Planifié |

### Moteur de modèles 🆕
| Fonctionnalité | Prio | Effort | Statut |
|---|---|---|---|
| **Routeur de modèles** : choix automatique du modèle selon complexité, coût et latence | P1 | L | 📋 Planifié |
| **Fallback en cascade** entre providers (Gemini → OpenRouter → local) sur erreur/quota | P0 | M | 📋 Planifié |
| Support multi-modèles simultanés (Gemini + Claude + GPT en parallèle sur la même tâche) | P2 | XL | 💡 Idée |
| **Intégration de modèles locaux via Ollama** (fallback hors-ligne, tâches peu critiques) | P1 | L | 📋 Planifié |
| **Cache sémantique de prompts** (réponse réutilisée si prompt équivalent) | P2 | M | 💡 Idée |
| **Compression de contexte** : résumé automatique des longues sessions avant dépassement | P1 | L | 📋 Planifié |
| Streaming audio TTS (tokens audio au fil de la génération) | P2 | M | 💡 Idée |

### Capacités agent
| Fonctionnalité | Prio | Effort | Statut |
|---|---|---|---|
| Compréhension de code multi-langages (Python, Rust, Go via Tree-sitter) | P1 | L | 📋 Planifié |
| **Intégration LSP** : diagnostics, hover, go-to-definition exploités par l'agent, pas seulement par l'humain | P1 | XL | 📋 Planifié |
| Génération de tests automatique à partir du code (skill `test`) | P1 | L | 📋 Planifié |
| Agent de refactoring avec validation TypeScript intégrée | P1 | L | 📋 Planifié |
| **Agent de revue de PR** (commente le diff, suggère, ne pousse rien sans accord) | P1 | L | 💡 Idée |
| **Agent de monitoring autonome** (surveille métriques, logs PM2, alerte et propose un correctif) | P2 | L | 💡 Idée |
| **Support multi-repos** : une mission qui traverse plusieurs workspaces liés | P2 | XL | 💡 Idée |
| Historique des actions IA avec replay (time-travel debugging) | P2 | L | 💡 Idée |
| Fine-tuning de skills sur la base de l'historique d'interactions | P3 | XL | 💡 Idée |

### Notebooks & RAG
| Fonctionnalité | Prio | Effort | Statut |
|---|---|---|---|
| Ingestion de sources web (URL → chunks, avec respect de `robots.txt`) | P1 | M | 📋 Planifié |
| Recherche hybride (vectorielle + full-text BM25) | P1 | M | 📋 Planifié |
| **Reranking des résultats** (cross-encoder ou modèle léger) avant injection au contexte | P1 | M | 📋 Planifié |
| **Citations sourcées obligatoires** dans les réponses notebook (n° de page / ancre) | P1 | M | 📋 Planifié |
| **Chunking adaptatif** selon le type de document (code / prose / tableau) | P2 | M | 💡 Idée |
| **Ré-indexation incrémentale** au lieu de reconstruction complète | P2 | M | 📋 Planifié |
| Export des notebooks en PDF/Markdown | P2 | S | 📋 Planifié |
| Ingestion audio/vidéo avec transcription locale (Whisper) | P3 | L | 💡 Idée |

---

## V1.3 — Ouverture & portabilité (Q2 2027)

**Thème** : Leanna tourne partout, s'étend sans fork, et ce que les gens construisent dessus est partageable.

### Portabilité
| Fonctionnalité | Prio | Effort | Statut |
|---|---|---|---|
| Support Linux (Electron + AppImage/deb) | P1 | M | 📋 Planifié |
| Support macOS (Electron + .dmg, notarisation) | P1 | L | 📋 Planifié |
| Docker Compose pour déploiement self-hosted simplifié | P1 | M | 📋 Planifié |
| **Mode headless / CLI** : lancer une mission depuis le terminal ou un cron, sans UI | P1 | L | 📋 Planifié |
| **Supabase local (Postgres + pgvector en container)** pour un fonctionnement 100 % hors-ligne | P2 | L | 📋 Planifié |
| Export/Import complet du profil (skills, workflows, agents, mémoires) | P1 | M | 📋 Planifié |
| **Migrations de schéma versionnées et réversibles** | P1 | M | 📋 Planifié |

### Extensibilité 🆕
| Fonctionnalité | Prio | Effort | Statut |
|---|---|---|---|
| **SDK de plugins** (`@leanna/plugin-sdk`) avec API stable et versionnée | P1 | XL | 💡 Idée |
| **Exécution des skills tiers en sandbox** (worker isolé, permissions déclarées, timeout) | P0 | L | 📋 Planifié |
| **Signature et vérification des skills** du marketplace | P1 | M | 📋 Planifié |
| **Publication au marketplace depuis l'UI** (packaging, versioning, changelog) | P2 | L | 💡 Idée |
| **Workflows en DSL YAML** versionnables en Git, éditables en UI ou en texte | P2 | L | 💡 Idée |
| **Webhooks entrants/sortants** (déclencher une mission depuis un événement externe) | P2 | M | 💡 Idée |
| Support des extensions Monaco / serveurs LSP custom | P3 | L | 💡 Idée |

### Collaboration
| Fonctionnalité | Prio | Effort | Statut |
|---|---|---|---|
| Mode multi-utilisateurs (workspaces partagés avec RBAC) | P2 | XL | 💡 Idée |
| Partage de sessions Gemini Live (pair programming assisté) | P3 | XL | 💡 Idée |
| Commentaires et annotations sur le code par l'IA | P2 | M | 💡 Idée |
| Intégration Slack/Discord pour les notifications agents | P2 | M | 💡 Idée |
| Intégration Jira / Linear (issues, sprints) | P3 | L | 💡 Idée |
| Intégration Confluence / Notion (documentation) | P3 | L | 💡 Idée |

---

## V2 — Vision long terme

Cap produit, sans engagement de date.

| Direction | Description |
|---|---|
| **Leanna se développe elle-même** | Le pipeline `SELF_IDE` devient complet : Leanna ouvre une PR sur son propre repo, la teste, la documente, et attend une revue humaine. |
| **Agents persistants et proactifs** | Des agents qui tournent en continu, observent le projet et proposent des actions sans qu'on les sollicite (dette détectée, dépendance vulnérable, test manquant). |
| **Mémoire réellement cumulative** | La mémoire apprend des préférences et des échecs passés et modifie le comportement de planification, pas seulement le contexte injecté. |
| **Déploiement cloud managé (SaaS)** | Isolation par tenant, facturation à l'usage, pour ceux qui ne veulent pas gérer l'infra. |
| **Compagnon mobile** | Application iOS/Android en accès distant au serveur local : suivre une mission, approuver une action, relire un rapport. |
| **Voix comme interface principale** | Mot d'activation, conversation continue mains libres, compréhension de l'écran en temps réel. |

---

## Backlog

Idées non planifiées, sans engagement.

| Idée | Catégorie |
|---|---|
| Thèmes de couleur personnalisés complets (au-delà de l'accent) | UI |
| Marketplace de templates de projet (scaffolding par agent) | Écosystème |
| Mode « focus » : masquer tout sauf éditeur + agent | UI |
| Comparateur de coûts entre providers en temps réel | Observabilité |
| Générateur de documentation continue (docs synchronisées au code) | IA |
| Détection de code mort et de dépendances inutilisées | Qualité |
| Estimation de complexité et de risque avant exécution d'une mission | IA |
| Profils d'agent par projet (règles, style de code, conventions) | IA |
| Support Windows ARM64 | Infrastructure |
| Chiffrement au repos de la base locale | Sécurité |
| Journal de bord quotidien généré automatiquement (ce qui a changé, pourquoi) | Productivité |

---

## Non-objectifs

Ce que Leanna ne cherche pas à devenir, pour éviter la dispersion.

- **Un remplaçant de VS Code.** L'IDE existe pour servir les agents, pas pour rivaliser en fonctionnalités d'édition.
- **Un fournisseur de modèles.** Leanna orchestre des modèles tiers, n'en entraîne pas.
- **Une plateforme no-code grand public.** La cible reste des développeurs.
- **Un outil cloud-only.** Toute fonctionnalité qui casserait le fonctionnement local est rejetée.

---

## Registre des risques

| Risque | Impact | Mitigation |
|---|---|---|
| Dépendance forte à l'API Gemini (quotas, ruptures d'API, dépréciations) | Élevé | Fallback en cascade multi-providers (V1.2), abstraction du provider, Ollama local |
| Agent autonome causant une perte de données | Élevé | Checkpoints Git, snapshots, permissions par skill, mode approbation (V1.1) |
| Coûts modèles non maîtrisés sur missions longues | Moyen | Budget guardrails et dashboard coûts (V1.1) |
| Exécution de skills tiers non fiables depuis le marketplace | Élevé | Sandbox d'exécution + signature (V1.3) |
| Croissance de la surface de code sans couverture de tests proportionnelle | Moyen | CI bloquante sur la couverture (V1.1) |
| Support mono-plateforme (Windows) limitant l'adoption | Moyen | Linux/macOS en V1.3 |
| Fuite de secrets dans les prompts ou les logs | Élevé | Redaction automatique + scan de secrets (V1.1) |

---

## Dette technique identifiée

À traiter en continu, hors thème de release.

| Sujet | Priorité |
|---|---|
| Serveur Express monoprocessus : pas de tolérance aux blocages CPU longs | P1 |
| Couplage de certains skills au client Gemini (freine le multi-provider) | P0 |
| Absence de schéma de migration versionné côté Supabase | P1 |
| Gestion d'erreurs hétérogène entre routeurs REST anciens et récents | P2 |
| Composants UI dupliqués entre l'IDE et les panneaux (candidats à factorisation) | P2 |
| Scripts de démarrage Electron multiples et partiellement redondants | P3 |

---

*Cette roadmap est un document vivant. Une fonctionnalité qui n'a ni priorité, ni effort, ni critère de succès n'est pas planifiée — c'est une idée.*