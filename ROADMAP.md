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
* [x] **Validation Stricte Zod des Requêtes API** (`server/middleware/validateBody.ts`, `server/routes/`) : Middleware réutilisable de validation de schémas et typage strict.
* [x] **Agent Builder & Registre d'Agents Personnalisés** (`server/routes/custom-agents.ts`, `src/components/panels/AgentBuilderPanel.tsx`) : Création visuelle d'agents, import/export JSON, enregistrement dynamique.
* [x] **Indexation AST Incrémentale par Tree-sitter & Call-Graph** (`server/knowledge/ASTParser.ts`, `server/knowledge/ASTCallGraph.ts`) : Analyse syntaxique WASM fine, signatures typées, dépendances et chaîne d'appels.
* [x] **Mode Multi-Workspace Sécurisé** (`server/utils/selfRoot.ts`, `server/routes/self-root.ts`) : Gestion multi-projets avec isolation stricte et persistance dans `workspaces.json`.
* [x] **Journalisation d'Audit NDJSON** (`server/audit.ts`) : Enregistrement de chaque action avec horodatage et détails.
* [x] **Circuit Breaker HTTP Frontend** (`src/main.tsx`) : Protection contre la saturation de sockets TCP.
* [x] **Intégration Electron Desktop** (`electron/main.cjs`, `electron/preload.cjs`) : Packaging Windows NSIS, splash screen et bridge IPC.

---

## V1 — Court terme (< 3 mois)

### Priorisation des actions

| Priorité | Élément | Statut | Justification technique |
| :--- | :--- | :--- | :--- |
| **P0** | Sécurisation et fiabilisation des endpoints sans validation de schéma | ✅ Livré | Middleware `validateBody` et schémas Zod déployés sur les routeurs critiques. |
| **P0** | Définition d'un pipeline CI/CD automatisé | 📋 Planifié | Aucun workflow de test ou de build automatique n'est configuré dans `.github/workflows`. |
| **P1** | Finalisation de la migration Runtime V2 | ✅ Livré | Unification complète sur `SkillManagerV2` / `ToolRegistry` et suppression de l'ancien V1. |
| **P1** | Couverture de tests e2e pour les WebSockets | ✅ Livré | Suite de tests d'intégration e2e complète validant l'authentification handshake, `/terminal`, `/live` et `/sandbox-watch`. |
| **P1** | **Intégration GitHub complète dans l'IDE** | ✅ Livré (v0.8.0) | Panneau GitHub natif (`src/components/ide/GitHubPanel.tsx`) avec 5 onglets : Commits locaux (avec détail diff par fichier), Repos (filtre live + recherche GitHub), Issues (filtres open/closed/all), PRs (filtres + draft), Notifications (badges non-lus). Accès via la sidebar Git & CI/CD. |
| **P2** | Nettoyage des routes Git désactivées | ✅ Livré | `/api/git` et `/api/github` unifiés sur `createGithubRouter` avec support complet. |
| **P2** | Optimisation du cache d'embeddings Notebooks | 🚧 En cours | Réduction de la latence lors de la réindexation de gros volumes documentaires. |

---

## V2+ — Long terme (Évolutions structurelles)

* 💡 **Idée : Support natif de conteneurs Docker pour le Sandbox** : Remplacer l'isolation par dossier miroir `.Leanna/sandbox` par des conteneurs éphémères légers.
* 💡 **Idée : Support multi-fournisseurs voix locale** : Intégration de modèles vocaux locaux (ex: Whisper / Piper) pour réduire la dépendance au cloud.
* 💡 **Idée : GitHub Actions depuis l'IDE** : Déclenchement et visualisation des workflows CI/CD directement depuis le panneau GitHub sans quitter l'IDE.
* 💡 **Idée : Création d'issues et PRs depuis l'IDE** : Formulaires de création inline pour issues et pull requests avec sélection de labels, assignees et milestone.

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
