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

> Ces évolutions représentent la vision à 6–18 mois du projet. Elles sont classées par domaine fonctionnel, de l'isolation système aux capacités IA avancées.

---

### 🐳 Infrastructure & Isolation

* 💡 **Conteneurs Docker pour le Sandbox** : Remplacer l'isolation par dossier miroir `.Leanna/sandbox` par des conteneurs éphémères Docker (ou Podman) pour isoler également l'exécution des commandes shell. Chaque session sandbox obtiendrait un réseau, un système de fichiers et un PID namespace dédiés, éliminant tout risque d'évasion vers le système hôte.

* 💡 **Sandboxing WebAssembly pour les outils IA** : Faire tourner certains outils de traitement (analyse AST, exécution de scripts Python légers) dans un runtime WASM (Wasmtime / WASI) directement dans le processus Node.js, sans overhead Docker et sans accès au système de fichiers hôte.

---

### 🤖 IA & Modèles

* 💡 **Support multi-fournisseurs voix locale** : Intégration de Whisper (STT) et Piper (TTS) en mode local pour fonctionner hors-ligne et réduire la dépendance à Gemini Live. La sélection du moteur serait configurable par profil utilisateur.

* 💡 **Routing intelligent entre modèles IA** : Ajouter un orchestrateur de modèles qui choisit automatiquement entre Gemini, OpenRouter et les modèles locaux (Ollama) selon la nature de la tâche (coût, latence, confidentialité des données). Les décisions de routing seraient traçables dans l'audit log.

* 💡 **Mémoire long-terme sémantique persistante** : Enrichir le système de mémoire Supabase avec une indexation vectorielle pgvector complète sur l'historique des conversations, les décisions prises et les artefacts générés. L'assistant se souviendrait de contextes de sessions antérieures avec un score de pertinence.

---

### � IDE & Workflow Développeur

* 💡 **GitHub Actions depuis l'IDE** : Déclenchement et visualisation des workflows CI/CD directement depuis le panneau GitHub — logs en streaming temps réel, statut des jobs, re-run de pipelines et visualisation de l'arbre des steps sans quitter l'éditeur.

* 💡 **Création d'issues et PRs inline** : Formulaires de création intégrés à l'IDE pour issues et pull requests, avec sélection de labels, assignees, milestone, et pré-remplissage intelligent du titre et de la description à partir du code sélectionné ou des erreurs console.

* 💡 **Diff visuel Monaco avec revue de code IA** : Intégrer un diff-editor Monaco côte à côte pour la revue de PR, avec annotations IA inline (suggestions, détection de régressions, commentaires de revue automatisés) déposés directement sur les lignes modifiées.

---

### 🌐 Collaboration & Partage

* 💡 **Mode collaboratif multi-curseurs (CRDT)** : Permettre à plusieurs développeurs de co-éditer le même fichier en temps réel via un protocole CRDT (Yjs / Automerge) synchronisé par WebSocket, avec présence de curseurs colorés et résolution automatique des conflits.

* ✅ **Marketplace d'agents et de skills** *(livré v0.9.0)* : Registre communautaire de 10 paquets seedés (agents, skills, bundles). Installation en un clic depuis la sidebar IDE (`Outils → Marketplace`). Versioning sémantique, notation communautaire (1-5 étoiles) et validation de sécurité automatisée par analyse statique des prompts (12 patterns OWASP/injection). Publication dans le registre local avec rapport de sécurité. Export JSON téléchargeable. Endpoints : `GET/POST /api/marketplace/*` (search, install, uninstall, publish, rate, export, validate-security).
---

## Backlog technique & Qualité

### Sécurité
* Renforcer la politique CSP (Content Security Policy) dans `index.html` et Electron.
* Remplacer la vérification de jeton statique par une rotation de sessions avec jetons éphémères signés.

### Performance & DX
* Réduire la taille du bundle de production en améliorant le code-splitting des dépendances lourdes (`monaco-editor`, `mermaid`, `recharts`).
* Ajouter un linter automatisé ESLint/Prettier dans les hooks Husky pré-commit.

