# Feuille de route (Roadmap)

La présente feuille de route est établie sur la base de l'analyse réelle du code source du projet **Leanna** (version 0.6.0).

---

## V0 — Livré (État actuel du code)

* [x] **Connexion Multimodale Gemini Live** (`server/live/LiveSocketHandler.ts`) : Audio bidirectionnel PCM 16kHz, vision par capture d'écran et streaming texte.
* [x] **Système de Bac à Sable (Sandbox)** (`server/utils/sandbox.ts`, `server/routes/sandbox.ts`) : Isolation miroir dans `.Leanna/sandbox`, calcul de diffs et validation `tsc`.
* [x] **Sécurité & Confinement Self-Root** (`server/utils/selfRoot.ts`, `server/security.ts`) : Verrouillage strict du périmètre au dossier racine du projet.
* [x] **Pool de clés Gemini avec Failover** (`server/utils/geminiKeyPool.ts`) : Rotation automatique sur erreurs 429 et gestion des priorités.
* [x] **Éditeur de code Monaco Editor** (`src/views/IdeView.tsx`) : Navigation dans l'arborescence, recherche globale et modifications avec garde-fous.
* [x] **Système d'Agents & Bus de Messages** (`server/agents/`) : Découplage des rôles, matrice de délégation et bus de communication inter-agents.
* [x] **Gestionnaire de Notebooks & RAG** (`server/notebooks/`) : Ingestion multi-formats (PDF, TXT, MD, DOCX), chunking, recherche sémantique et génération de résumés/slides.
* [x] **Validation Stricte Zod des Requêtes API** (`server/middleware/validateBody.ts`, `server/routes/`) : Middleware réutilisable de validation de schémas et typage strict sur les endpoints critiques (`/api/custom-agents`, `/api/mcp`, `/api/agents`, `/api/tts`).
* [x] **Agent Builder & Registre d'Agents Personnalisés** (`server/routes/custom-agents.ts`, `src/components/panels/AgentBuilderPanel.tsx`) : Création visuelle d'agents, import/export JSON, enregistrement dynamique dans le runtime et persistance locale.
* [x] **Indexation AST Incrémentale par Tree-sitter & Call-Graph** (`server/knowledge/ASTParser.ts`, `server/knowledge/ASTCallGraph.ts`) : Analyse syntaxique WASM fine des fonctions, signatures typées, dépendances intra/inter-fichiers et chaîne d'appels récursive.
* [x] **Mode Multi-Workspace Sécurisé** (`server/utils/selfRoot.ts`, `server/routes/self-root.ts`) : Gestion multi-projets avec isolation stricte, persistance dans `workspaces.json` et garde-fous sandbox.
* [x] **Journalisation d'Audit NDJSON** (`server/audit.ts`) : Enregistrement de chaque action avec horodatage et détails.
* [x] **Circuit Breaker HTTP Frontend** (`src/main.tsx`) : Protection contre la saturation de sockets TCP en cas d'indisponibilité backend.
* [x] **Intégration Electron Desktop** (`electron/main.cjs`, `electron/preload.cjs`) : Packaging Windows NSIS, splash screen et bridge IPC.

---

## V1 — Court terme (< 3 mois)

### Priorisation des actions

| Priorité | Élément | Statut | Justification technique |
| :--- | :--- | :--- | :--- |
| **P0** | Sécurisation et fiabilisation des endpoints sans validation de schéma | ✅ Livré (Sprint 1) | Middleware `validateBody` et schémas Zod déployés sur les routeurs critiques (`custom-agents`, `mcp`, `agents`, `tts`). Extension progressive aux autres routeurs secondaires. |
| **P0** | Définition d'un pipeline CI/CD automatisé | 📋 Planifié | Aucun workflow de test ou de build automatique n'est configuré dans `.github/workflows`. |
| **P1** | Finalisation de la migration Runtime V2 | ✅ Livré | Unification complète sur `SkillManagerV2` / `ToolRegistry` (`server/runtime/`) et suppression de l'ancien `SkillManager` V1 obsolète. |
| **P1** | Couverture de tests e2e pour les WebSockets | ✅ Livré | Suite de tests d'intégration e2e complète (`server/websocket.e2e.test.ts`) validant l'authentification handshake, `/terminal`, `/live` et `/sandbox-watch`. |
| **P2** | Nettoyage des routes Git désactivées | ✅ Livré | Le routeur `/api/git` et `/api/github` sont unifiés sur `createGithubRouter` avec support complet des commits, repos, issues et PRs. |
| **P2** | Optimisation du cache d'embeddings Notebooks | 🚧 En cours | Réduction de la latence lors de la réindexation de gros volumes documentaires. |

---

## V2+ — Long terme (Évolutions structurelles)

* 💡 **Idée : Support natif de conteneurs Docker pour le Sandbox** : Remplacer l'isolation par dossier miroir `.Leanna/sandbox` par des conteneurs éphémères légers pour isoler également l'exécution des commandes shell `run_project_command`.
* 💡 **Idée : Support multi-fournisseurs voix locale** : Intégration de modèles vocaux locaux (ex: Whisper / Piper) pour réduire la dépendance au cloud en mode hors-ligne.


---

## Backlog technique & Qualité

### Sécurité
* Renforcer la politique CSP (Content Security Policy) dans `index.html` et Electron.
* Remplacer la vérification de jeton statique par une rotation de sessions avec jetons éphémères signés.

### Performance & DX
* Réduire la taille du bundle de production en améliorant le code-splitting des dépendances lourdes (`monaco-editor`, `mermaid`, `recharts`).
* Ajouter un linter automatisé ESLint/Prettier dans les hooks Husky pré-commit.

### Détection des problèmes observés lors de l'audit

1. **Absence de licence explicite**
   - *Impact* : Incertitude juridique sur la distribution et l'usage open-source.
   - *Action recommandée* : Ajouter un fichier `LICENSE` (ex: Apache-2.0 ou MIT) à la racine du dépôt.
2. **Coexistence de deux systèmes de runtime (`server/skills/SkillManager.ts` vs `server/runtime/`)**
   - *Statut* : ✅ **Résolu** — `SkillManager` V1 supprimé au profit exclusif de `SkillManagerV2` / `ToolRegistry`.
3. **Routeur `/api/git` désactivé de manière abrupte**
   - *Statut* : ✅ **Résolu** — `/api/git` réintégré et unifié avec le routeur GitHub fonctionnel.
