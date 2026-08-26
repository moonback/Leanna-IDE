# Analyse complète — Jarvis OS (v0.4.0)

*Analyse basée sur un dump complet du dépôt : 464 fichiers, ~147 500 lignes de source concaténées, 239 fichiers backend (`server/`), 189 fichiers frontend (`src/`), 40 fichiers de tests.*

---

## 1. Vue d'ensemble

**Jarvis OS** est un IDE desktop (Electron) auto-référentiel : il ne gère que son propre code source (pas de workspace externe configurable, cf. `.env.example`). C'est un projet très ambitieux qui combine cinq produits en un :

1. Un **IDE** complet (Monaco Editor, explorateur, recherche globale, Git, sandbox de validation IA)
2. Un **assistant multimodal temps réel** (Gemini Live : voix, webcam, partage d'écran)
3. Un **système multi-agents** (14 agents spécialisés : code + rédaction)
4. Des **notebooks RAG** façon NotebookLM (ingestion de sources, chat groundé, génération de 9 types de contenus, audio overview)
5. Un **moteur de connaissance** (graphe de dépendances, mémoire projet, recherche sémantique locale) + orchestration de **workflows/missions autonomes** + passerelle **MCP**

C'est essentiellement un « OS IA » personnel plutôt qu'une simple application — la surface fonctionnelle est comparable à plusieurs produits SaaS combinés (Cursor/Windsurf + NotebookLM + un orchestrateur d'agents + Zapier-like workflows).

---

## 2. Stack technique

| Couche | Choix | Commentaire |
|---|---|---|
| Frontend | React 19, React Router 7, Tailwind CSS 4, Monaco Editor, Motion | Stack moderne, à jour (React 19 tout juste sorti) |
| Backend | Node 22+, Express 4, `ws` (WebSocket), multer | Classique et robuste |
| IA | `@google/genai` (Gemini 2.x), OpenRouter en secours multi-modèles | Bonne redondance de fournisseurs |
| Desktop | Electron 43 + electron-builder (NSIS Windows uniquement) | Build ciblé Windows seul actuellement |
| Build | Vite 6, esbuild, tsx | Pipeline dev/prod cohérent |
| Persistance | Fichiers JSON locaux + Supabase (optionnel) | Fonctionne « offline-first », Supabase en option |

Le projet est **mono-repo unifié** : le serveur Express et le frontend Vite vivent dans le même `package.json`/même process (`server.ts` monte Vite en middleware en dev). C'est pragmatique pour du desktop, mais couple fortement front et back.

---

## 3. Architecture backend (`server/`, 239 fichiers)

Organisation en modules cohérents et bien nommés :

- **`agents/`** — Orchestrateur multi-agents (`AgentOrchestrator`, `AgentExecutor`, `AgentMessageBus`, `DelegationParser`, `AgentRepairLoop`...). Système mature avec bus de messages, boucle de réparation automatique et persistance d'état.
- **`autonomy/`** — Superviseur de missions autonomes et compétences dynamiques (`SmartSkills`).
- **`knowledge/`** — Un vrai moteur de compréhension de code : graphe de connaissances, extracteur de relations, indexeur de projet, moteur de raisonnement, recherche sémantique **sans API externe** (embeddings locaux/TF-IDF probablement).
- **`mcp/`** — Passerelle Model Context Protocol (client + bridge), stdio et SSE.
- **`mission/`** & **`runtime/`** — Deux couches d'orchestration qui se chevauchent partiellement (voir §6).
- **`notebooks/`** — Système RAG complet : `RAGEngine`, `EmbeddingStore` avec éviction LRU, `ResponseCache` (LRU + similarité de Jaccard), `ProcessingQueue` (concurrence, retry, priorités), `BackupService` (sauvegarde incrémentale).
- **`routes/`** — ~30 routeurs Express, un fichier par domaine fonctionnel (bon découpage REST).
- **`skills/`** — Le cœur de la « boîte à outils » de l'IA : ~40 fichiers, chacun exposant des *function calls* Gemini (lecture/écriture fichiers, git, github, système, automatisation, navigateur web...). Chaque skill a son fichier `.test.ts` associé — bonne discipline.
- **`utils/`** — Utilitaires transverses : chiffrement, pool de clés Gemini, logger, checkpoints, sandbox, validation post-édition.

Un fichier `server.ts` de **3 470 lignes** agrège tout : montage des ~30 routeurs, gestion WebSocket pour Gemini Live, et une quarantaine de routes définies inline (sandbox, IDE tree/file, browser). C'est le point le plus dense du projet (voir §6, dette technique).

---

## 4. Architecture frontend (`src/`, 189 fichiers)

- **`components/ide/`** (~45 composants) — cœur de l'IDE : éditeur à onglets, explorateur virtualisé (`react-window`), panneau de chat, visualiseur de diff, palette de commandes, recherche globale, moniteur de skills en direct.
- **`components/panels/`** — panneaux dédiés (agents, mission, MCP, mémoire, sandbox, vision, logs système) — reflète bien la richesse fonctionnelle du backend.
- **`components/notebooks/`** — UI complète du système RAG (canvas de notes 2D, diagrammes Mermaid, audio overview).
- **`hooks/`** — 20 hooks, bien découpés par responsabilité (`useFileSystem`, `useLiveAPI`, `useSandboxWatcher`, `useHotkeys`...).
- **`context/`** — 4 contextes React (Live API, theme, profil utilisateur, partage d'écran) — usage raisonnable du Context API, pas d'over-engineering avec Redux.

Le découpage components/hooks/services/stores est propre et suit les conventions React modernes. Le nommage est cohérent en anglais malgré une documentation en français.

---

## 5. Points forts

1. **Sécurité prise au sérieux, avec traces d'un vrai audit.** Le fichier `server/skills/system.ts` contient un commentaire explicite décrivant une faille d'injection de commande corrigée (regex qui ne filtrait pas `\n`/`\r`, permettant `npm run build\nrm -rf /`), avec l'explication du fix. `run_project_command` est restreint à des préfixes whitelistés (`npm`, `npx`, `node`), bloque les métacaractères shell, et exige une confirmation utilisateur interactive pour tout ce qui touche `node_modules`. `resolveWorkspacePath` empêche la traversée de répertoire hors du workspace. Le serveur **refuse de démarrer** si on l'expose sur `0.0.0.0` sans `JARVIS_API_TOKEN` configuré. C'est le niveau de rigueur qu'on attend d'un outil qui laisse une IA écrire/exécuter du code.
2. **Sandbox IA avant application des changements** — les modifications de l'agent passent par un espace isolé avec diff/validation avant merge (`/api/sandbox/*`), plutôt que d'écrire directement dans le repo.
3. **Système multi-agents bien pensé** : 14 rôles avec permissions différenciées (lecture seule pour `reviewer`/`security`/`researcher`, lecture/écriture pour les autres), patterns de collaboration documentés (cycle feature, cycle bugfix sécurisé...).
4. **Ingénierie de résilience côté notebooks** : LRU eviction des embeddings, cache avec matching par similarité pour éviter de re-questionner le LLM sur des questions proches, backup incrémental avec rotation, circuit breaker sur les erreurs réseau, retry exponentiel. Ce ne sont pas des détails cosmétiques — c'est le genre de robustesse qu'on ne voit pas dans un prototype.
5. **Discipline de tests correcte pour un projet perso/petit collectif** : 40 fichiers `.test.ts`, quasi-systématiquement à côté du fichier testé (`AgentValidation.test.ts`, `codebaseHelpers.test.ts`, `skillManagerRules.test.ts`...).
6. **Documentation vivante** : README (0.4.0) très détaillé, `ROADMAP.md` avec statuts précis phase par phase, `SELF_IDE.md`, `ai-studio-build.md`, guide d'intégration runtime (`INTEGRATION_GUIDE.md`). Peu de projets de cette taille documentent aussi consciencieusement.

---

## 6. Points d'attention / dette technique

1. **`server.ts` fait 3 470 lignes.** Même s'il délègue à ~30 routeurs, il reste ~40 routes définies inline (sandbox, arbre IDE, lecture/écriture de fichiers, résultats du navigateur) plus toute la logique WebSocket Gemini Live. C'est le fichier le plus à risque du projet : difficile à tester unitairement, source probable de conflits Git, et un seul point de défaillance au démarrage. **Recommandation** : extraire au minimum les routes `sandbox/*` et `ide/*` dans des routeurs dédiés comme le reste, et isoler le handler WebSocket Live dans son propre module.
2. **Deux couches d'orchestration qui se chevauchent** : `server/mission/` (Executor, Planner, Reflection, SkillScorer) et `server/runtime/` (AgentRuntime, WorkflowEngine, StateMachine) semblent couvrir un territoire fonctionnel proche (planification + exécution de tâches IA), avec en plus une couche de compatibilité (`runtime/compat/LegacyBridge.ts`, `SkillManagerV2.ts`). Ça sent la migration en cours d'une V1 (`skills/SkillManager.ts`) vers une V2 (`runtime/`) sans que l'ancienne ait été retirée. À terme, ça vaut la peine de documenter clairement laquelle est la source de vérité, ou de terminer la migration.
3. **Chiffrement sans authentification (AES-256-CBC, pas GCM).** `server/utils/crypto.ts` chiffre les secrets avec une clé dérivée de `hostname+platform+username` (+ éventuel `JARVIS_MASTER_KEY`). C'est raisonnable pour du secret-at-rest local (empêche un simple `cat .gemini-keys`), mais CBC sans HMAC n'authentifie pas le ciphertext (pas de détection de falsification). Pour un chiffrement local de clés API, le risque réel est faible, mais passer à `aes-256-gcm` serait un gain peu coûteux.
4. **Authentification optionnelle par défaut.** `authenticateRequest`/`authenticateToken` renvoient `{ ok: true }` si aucun `JARVIS_API_TOKEN` n'est configuré — cohérent avec un usage desktop local, mais à documenter clairement pour éviter qu'un utilisateur ne l'expose par erreur sans y penser (le garde-fou sur `0.0.0.0` aide déjà beaucoup).
5. **Cible desktop unique (Windows/NSIS).** `electron-builder` ne configure que `win.target: nsis`. Pas de build macOS/Linux visible — probablement un choix assumé plutôt qu'un oubli, mais à noter si l'audience visée s'élargit.
6. **`.env.example` contient une ligne suspecte** : `JARVIS_SELF_ROOT_OVERRIDE="C:\chemin\vers\autre\repo" npm run dev` en clair dans le fichier, et une ligne orpheline `NODE_ENV === 'test'` (comparaison, pas assignation) tout en bas — probablement des résidus de copier-coller à nettoyer, sans impact fonctionnel mais qui traduit un manque de relecture sur ce fichier précis.
7. **Beaucoup de connecteurs optionnels actifs simultanément** (Supabase, OpenRouter, MCP stdio/SSE, Puppeteer, TTS, embeddings) : chacun est une source de pannes partielles possibles. La présence de `health.ts` et de dashboards système (`SystemHealthDashboard.tsx`, `KnowledgeHealthDashboard.tsx`) montre que c'est déjà anticipé, ce qui est bon signe.
8. **19 occurrences `TODO`/`FIXME`** dans l'ensemble du dump — volume raisonnable pour ~147k lignes, rien d'alarmant.

---

## 7. Ce que révèle le ROADMAP.md

Le projet est rendu jusqu'à la **Phase 7/12** (v0.6.0), avec les phases 1 à 7 marquées ✅ (IDE, multimodal, RAG, multi-agents, knowledge engine, automatisation/MCP, templates & UX). Les phases restantes (8 à 12, non commencées) visent :
- Export/import PDF/DOCX/Notion (interopérabilité)
- Scoring de qualité documentaire (complétude, clarté, couverture)
- Multimodal avancé (dictée longue, OCR de schémas manuscrits, vidéo → résumé)
- Écosystème (Google Drive, Notion, Slack, API publique, multi-utilisateurs)
- Autonomie complète (self-improvement du code de l'app par l'IA elle-même)

C'est une roadmap ambitieuse mais réaliste dans sa progression — chaque phase construit sur la précédente sans sauter d'étapes.

---

## 8. Recommandations prioritaires

| Priorité | Action | Bénéfice |
|---|---|---|
| Haute | Découper `server.ts` (extraire routes sandbox/ide + handler WebSocket) | Maintenabilité, testabilité |
| Haute | Clarifier/fusionner `server/mission/` vs `server/runtime/` (ou documenter la coexistence) | Réduit la confusion pour tout futur contributeur (ou pour l'IA elle-même en mode self-edit) |
| Moyenne | Passer `crypto.ts` en AES-256-GCM | Authentifie le ciphertext, coût faible |
| Moyenne | Nettoyer `.env.example` (ligne `JARVIS_SELF_ROOT_OVERRIDE=... npm run dev`, ligne `NODE_ENV === 'test'`) | Évite la confusion à l'onboarding |
| Basse | Étendre la couverture de tests aux routes HTTP (actuellement centrée sur `skills/` et `agents/`) | Sécurise les ~30 routeurs Express contre les régressions |
| Basse | Évaluer un build macOS/Linux si l'audience s'élargit au-delà de Windows | Portée du produit |

---

## 9. Conclusion

Jarvis OS n'est pas un prototype jetable : c'est un projet d'une ampleur inhabituelle pour un outil personnel (464 fichiers, ~147k lignes), avec une architecture modulaire cohérente, une vraie discipline de sécurité (fix documenté d'une injection de commande, sandbox de validation, whitelisting strict), et une couverture de tests correcte sur les modules critiques (skills, agents). Les principaux risques ne sont pas fonctionnels mais **structurels** : un fichier serveur trop dense et deux systèmes d'orchestration qui se chevauchent, symptômes classiques d'une croissance rapide plutôt que d'un manque de rigueur. Le projet est à un stade où un refactor ciblé de `server.ts` et une clarification `mission/` vs `runtime/` auraient le meilleur rapport effort/bénéfice avant d'attaquer les phases 8-12 de la roadmap.
