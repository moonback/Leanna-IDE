# Roadmap — Leanna AI Operating System

> Dernière mise à jour : Septembre 2026 · Version courante : **1.0.0**

---

## V1.0 — Stabilité et tests (Septembre 2026) ✅

### Qualité et tests
| Fonctionnalité | Statut |
|---|---|
| Suite complète de tests d'intégration REST (74 tests) | ✅ Fait |
| Tests unitaires des skills (136+ tests, ≥60% couverture) | ✅ Fait |
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

### Intelligence Artificielle
| Fonctionnalité | Statut |
|---|---|
| Intégration Gemini Live API (texte, voix, vision) | ✅ Fait |
| Pool de clés Gemini avec rotation sur erreur 429 | ✅ Fait |
| SkillManagerV2 + ToolRegistry centralisé | ✅ Fait |
| 25+ skills natifs (system, codebase, browser, memory, github…) | ✅ Fait |
| Custom Skills créés via UI et persistés dans Supabase | ✅ Fait |
| Agent Orchestrator avec 7 rôles spécialisés | ✅ Fait |
| Boucle autonome Observe → Decide → Act par rôle | ✅ Fait |
| Message Bus inter-agents | ✅ Fait |
| Persistance des agents et orchestrations dans Supabase | ✅ Fait |
| Restauration des tâches après crash/redémarrage | ✅ Fait |
| Collaboration multi-agents par patterns prédéfinis | ✅ Fait |
| Mission System pour tâches longues (multi-étapes) | ✅ Fait |
| Chain of Thought configurable (`ENABLE_CHAIN_OF_THOUGHT`) | ✅ Fait |
| OpenRouter comme backend alternatif | ✅ Fait |
| MCP (Model Context Protocol) bridge | ✅ Fait |
| Text-to-Speech (TTS) intégré | ✅ Fait |

### Knowledge & Mémoire
| Fonctionnalité | Statut |
|---|---|
| Knowledge Graph avec parsing AST (Tree-sitter TS/JS) | ✅ Fait |
| Workspace Indexer (extraction documents, sections) | ✅ Fait |
| Mémoire long-terme dans Supabase (pgvector) | ✅ Fait |
| Recherche sémantique par similarité vectorielle (RAG) | ✅ Fait |
| Notebooks RAG : ingestion PDF/texte, chat contextuel | ✅ Fait |
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

### Desktop & UI
| Fonctionnalité | Statut |
|---|---|
| Application Electron (Windows, NSIS installer) | ✅ Fait |
| Splash screen animé | ✅ Fait |
| Thème dark/light + couleur d'accent personnalisable | ✅ Fait |
| Animations de transitions entre routes (motion/react) | ✅ Fait |
| Orb flottant déplaçable (chat rapide hors IDE) | ✅ Fait |
| Code splitting Vite (vendor-react, vendor-monaco, ide-core, panels) | ✅ Fait |
| Sélecteur de workspace au démarrage (StartupProjectModal) | ✅ Fait |
| Marketplace de skills et d'agents | ✅ Fait |
| Workflows automatisés planifiables depuis l'UI | ✅ Fait |
| Tâches planifiées (automation) | ✅ Fait |

---

## V1 — Priorités court terme (< 3 mois)

Améliorations de qualité, performance et DX ciblées sur les frictions identifiées.

### Qualité & Stabilité
| Fonctionnalité | Statut |
|---|---|
| Couverture de tests unitaires ≥ 60% sur `server/skills/` | ✅ Fait (136+ tests, 5 nouveaux fichiers) |
| Tests d'intégration pour tous les routeurs REST | 📋 Planifié |
| Tests E2E Playwright sur les flux critiques (sandbox sync, agent delegate) | 📋 Planifié |
| CI GitHub Actions : lint + test + build à chaque PR | 📋 Planifié |
| Logging structuré (JSON) avec niveaux (`debug`/`info`/`warn`/`error`) | 📋 Planifié |
| Health check enrichi (`/api/health`) : Supabase, Gemini, mémoire, uptime | 📋 Planifié |
| Gestion propre des erreurs WebSocket (reconnexion automatique côté client) | 📋 Planifié |

**Tests unitaires server/skills/ (✅ Complété)**
- ✅ `aiStudioDirectives.test.ts` : 14 tests (directives AI Studio)
- ✅ `browser.test.ts` : 58 tests (25 outils browser, schemas Zod, accessibilité)
- ✅ `knowledge.test.ts` : 29 tests (13 outils knowledge, validations complètes)
- ✅ `automationScheduler.test.ts` : 35 tests (scheduling, pause/resume, états)
- ✅ `chainOfThought.test.ts` : Tests de complexité et exécution CoT
- 📊 **Total : 136+ tests unitaires fonctionnels**
- 🎯 Couverture exhaustive des schemas Zod, gestion d'erreurs et logique métier

### Performance
| Fonctionnalité | Statut |
|---|---|
| Pagination côté serveur pour `GET /api/ide/tree` (workspaces > 10k fichiers) | ✅ Fait  |
| Lazy loading des chunks Monaco workers (réduction temps de premier chargement) | ✅ Fait |
| Cache Redis/mémoire partagé pour le Knowledge Graph (multi-instances) | ✅ Fait |
| Streaming des réponses agents via SSE (Server-Sent Events) | ✅ Fait |

### DX & Outillage
| Fonctionnalité | Statut |
|---|---|
| Variables d'environnement validées au démarrage avec messages d'erreur clairs | ✅ Fait |
| Hot-reload des custom skills sans redémarrage serveur | ✅ Fait |
| Export/Import complet du profil (skills, workflows, agents) | 📋 Planifié |
| Documentation interactive des skills (auto-générée depuis les déclarations) | 📋 Planifié |

### Sécurité
| Fonctionnalité | Statut |
|---|---|
| Support HTTPS local (certificat auto-signé) | 📋 Planifié |
| Rotation automatique du `Leanna_API_TOKEN` depuis l'UI | 📋 Planifié |
| Audit des accès API (qui a appelé quoi, quand) | 📋 Planifié |
| Limitation de la taille des uploads documents (configurable) | 📋 Planifié |

### UI/UX
| Fonctionnalité | Statut |
|---|---|
| Indicateur de progression des agents en temps réel (barre + log) | ✅ Fait |
| Notifications desktop (OS) pour les événements agents importants | 📋 Planifié |
| Raccourcis clavier configurables (remapping) | 📋 Planifié |
| Diff viewer intégré côté UI (sandbox file-diff) | ✅ Fait |
| Recherche globale (fichiers + mémoires + historique) via `Cmd+K` | 📋 Planifié |

---

## V2+ — Vision long terme

Fonctionnalités avancées et intégrations majeures.

### IA & Agents
| Fonctionnalité | Statut |
|---|---|
| Support multi-modèles simultanés (Gemini + Claude + GPT en parallèle) | 💡 Idée |
| Agent de monitoring autonome (surveille les métriques et alerte) | 💡 Idée |
| Fine-tuning de skills sur la base de l'historique d'interactions | 💡 Idée |
| Mémoire hiérarchique : court-terme (session) / moyen-terme (projet) / long-terme (Supabase) | 💡 Idée |
| Compréhension de code multi-langages (Python, Rust, Go via Tree-sitter) | 📋 Planifié |
| Génération de tests automatique à partir du code (skill `test`) | 📋 Planifié |
| Agent de refactoring avec validation TypeScript intégrée | 📋 Planifié |

### Collaboration
| Fonctionnalité | Statut |
|---|---|
| Mode multi-utilisateurs (workspaces partagés avec RBAC) | 💡 Idée |
| Partage de sessions Gemini Live (pair programming assisté) | 💡 Idée |
| Commentaires et annotations sur le code par l'IA | 💡 Idée |
| Intégration Slack/Discord pour les notifications agents | 💡 Idée |

### Intégrations
| Fonctionnalité | Statut |
|---|---|
| Support Linux (Electron + AppImage/deb) | 📋 Planifié |
| Support macOS (Electron + .dmg) | 📋 Planifié |
| Intégration Jira / Linear (issues, sprints) | 💡 Idée |
| Intégration Confluence / Notion (documentation) | 💡 Idée |
| Déploiement cloud managé (SaaS) avec isolation par tenant | 💡 Idée |
| Docker Compose pour déploiement self-hosted simplifié | 📋 Planifié |

### Notebooks & RAG
| Fonctionnalité | Statut |
|---|---|
| Ingestion de sources web (URL → chunks) | 📋 Planifié |
| Ingestion de repos GitHub publics | 💡 Idée |
| Recherche hybride (vectorielle + full-text BM25) | 📋 Planifié |
| Export des notebooks en PDF/Markdown | 📋 Planifié |

---

## Backlog

Idées non planifiées, sans engagement de date.

| Idée | Catégorie |
|---|---|
| Plugin system pour étendre l'IDE (à la VS Code) | Architecture |
| Thèmes de couleur personnalisés complets (au-delà de l'accent) | UI |
| Support des extensions Monaco (LSP custom) | IDE |
| Historique des actions IA avec replay (time-travel debugging) | IA |
| Tableau de bord de métriques d'utilisation (tokens consommés, coûts estimés) | Observabilité |
| Support audio TTS en streaming (tokens audio au fil de la génération) | IA |
| Intégration de modèles locaux via Ollama | IA |
| Snapshots de workspace (backup instantané avant une mission longue) | Sécurité |
| Mode hors-ligne complet (modèles locaux + Supabase local) | Infrastructure |
| Application mobile (iOS/Android) avec accès distant au serveur local | Mobile |
