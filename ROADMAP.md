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
* [x] **Journalisation d'Audit NDJSON** (`server/audit.ts`) : Enregistrement de chaque action avec horodatage et détails.
* [x] **Circuit Breaker HTTP Frontend** (`src/main.tsx`) : Protection contre la saturation de sockets TCP en cas d'indisponibilité backend.
* [x] **Intégration Electron Desktop** (`electron/main.cjs`, `electron/preload.cjs`) : Packaging Windows NSIS, splash screen et bridge IPC.

---

## V1 — Court terme (< 3 mois)

### Priorisation des actions

| Priorité | Élément | Statut | Justification technique |
| :--- | :--- | :--- | :--- |
| **P0** | Sécurisation et fiabilisation des endpoints sans validation de schéma | 🚧 En cours | Certains routeurs manipulent directement `req.body` sans validation stricte (ex: Zod/TypeBox), risquant des exceptions non rattrapées. |
| **P0** | Définition d'un pipeline CI/CD automatisé | 📋 Planifié | Aucun workflow de test ou de build automatique n'est configuré dans `.github/workflows`. |
| **P1** | Finalisation de la migration Runtime V2 | 🚧 En cours | Coexistence actuelle entre `SkillManager` V1 et `SkillManagerV2` / `ToolRegistry` nécessitant une unification définitive. |
| **P1** | Couverture de tests e2e pour les WebSockets | 📋 Planifié | Les tests actuels couvrent principalement les utilitaires unitaires (`server/**/*.test.ts`) mais manquent d'intégration sur `/live` et `/terminal`. |
| **P2** | Nettoyage des routes Git désactivées | 📋 Planifié | Le routeur `/api/git` retourne actuellement un code 404 hardcodé ; il doit être soit supprimé, soit réintégré proprement via l'API GitHub. |
| **P2** | Optimisation du cache d'embeddings Notebooks | 🚧 En cours | Réduction de la latence lors de la réindexation de gros volumes documentaires. |

---

## V2+ — Long terme (Évolutions structurelles)

* 💡 **Idée : Support natif de conteneurs Docker pour le Sandbox** : Remplacer l'isolation par dossier miroir `.Leanna/sandbox` par des conteneurs éphémères légers pour isoler également l'exécution des commandes shell `run_project_command`.
* 💡 **Idée : Indexation AST incrémentale par Treesitter** : Améliorer le `KnowledgeGraph` en analysant les arbres de syntaxe abstraite complets pour une cartographie des dépendances inter-fonctions encore plus fine.
* 💡 **Idée : Mode Multi-Workspace sécurisé** : Permettre l'ouverture de dépôts externes tout en conservant le modèle de garde-fous et de validation stricte de `selfRoot`.
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
   - *Impact* : Complexité de maintenance et surcharge mémoire lors du chargement des modules.
   - *Action recommandée* : Achever la dépréciation de `SkillManager` V1 au profit exclusif de `bootstrapRuntimeSync`.
3. **Routeur `/api/git` désactivé de manière abrupte**
   - *Impact* : Incohérence dans l'API REST retournant une erreur 404 statique.
   - *Action recommandée* : Nettoyer les routes mortes ou documenter formellement la bascule vers `/api/github`.
