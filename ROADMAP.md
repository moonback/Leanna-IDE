# Feuille de route (Roadmap)

Cette feuille de route est le plan de référence produit et technique de **Leanna**. Elle est volontairement organisée par résultats vérifiables plutôt que par accumulation de fonctionnalités.

## État de référence — 2 septembre 2026

* **Produit** : IDE desktop/web IA multimodal avec Monaco, terminal, sandbox, multi-workspace, GitHub, FTP/FTPS, agents, marketplace, notebooks/RAG et indexation AST.
* **Qualité** : la suite de tests serveur existe, mais aucun workflow `.github/workflows` n'est configuré. Le lint produit actuellement de nombreux avertissements historiques.
* **Principe de priorité** : fiabilité et sécurité d'abord, expérience développeur ensuite, nouvelles capacités IA après validation des fondations.

### Définition de « prêt »

Une fonctionnalité n'est considérée comme livrée que si elle possède :

1. un parcours utilisateur complet avec états vide, chargement, succès, erreur et annulation ;
2. une validation serveur, une journalisation d'audit et une permission adaptée à son niveau de risque ;
3. un test automatisé pertinent et une documentation courte ;
4. une vérification web et Electron sur Windows, avec un comportement dégradé explicite hors ligne ;
5. un indicateur de succès mesurable et un plan de retour arrière.

---

## V0 — Livré (État actuel du code)

* [x] **Connexion Multimodale Gemini Live** (`server/live/LiveSocketHandler.ts`) : Audio bidirectionnel PCM 16kHz, vision par capture d'écran et streaming texte.
* [x] **Système de Bac à Sable (Sandbox)** (`server/utils/sandbox.ts`, `server/routes/sandbox.ts`) : Isolation miroir dans `.Leanna/sandbox`, calcul de diffs et validation `tsc`.
* [x] **Sécurité & Confinement Self-Root** (`server/utils/selfRoot.ts`, `server/security.ts`) : Verrouillage strict du périmètre au dossier racine du projet.
* [x] **Pool de clés Gemini avec Failover** (`server/utils/geminiKeyPool.ts`) : Rotation automatique sur erreurs 429 et gestion des priorités.
* [x] **Éditeur de code Monaco Editor** (`src/views/IdeView.tsx`) : Navigation dans l'arborescence, recherche globale et modifications avec garde-fous.
* [x] **Système d'Agents & Bus de Messages** (`server/agents/`) : Découplage des rôles, matrice de délégation et bus de communication inter-agents.
* [x] **Gestionnaire de Notebooks & RAG** (`server/notebooks/`) : Ingestion multi-formats (PDF, TXT, MD, DOCX), chunking, recherche sémantique et génération de résumés/slides.
* [x] **Lecture & indexation des PDF dans le workspace** (`server/knowledge/WorkspaceIndexer.ts`, `src/views/IdeView.tsx`, `src/components/ide/PdfPreview.tsx`) : détection des fichiers `.pdf`, extraction de texte via `pdf-parse`, ouverture directe dans l’IDE et disponibilité pour l’analyse documentaire.
* [x] **Validation Stricte Zod des Requêtes API** (`server/middleware/validateBody.ts`, `server/routes/`) : Middleware réutilisable de validation de schémas et typage strict.
* [x] **Agent Builder & Registre d'Agents Personnalisés** (`server/routes/custom-agents.ts`, `src/components/panels/AgentBuilderPanel.tsx`) : Création visuelle d'agents, import/export JSON, enregistrement dynamique.
* [x] **Marketplace d'Agents et de Skills** (`server/marketplace/`, `server/routes/marketplace.ts`, `src/components/panels/MarketplacePanel.tsx`) : Registre communautaire, installation en un clic, notation, publication avec validation sécurité automatisée, import/export JSON, accessible depuis `Outils → Marketplace` dans la sidebar IDE.
* [x] **Indexation AST Incrémentale par Tree-sitter & Call-Graph** (`server/knowledge/ASTParser.ts`, `server/knowledge/ASTCallGraph.ts`) : Analyse syntaxique WASM fine, signatures typées, dépendances et chaîne d'appels.
* [x] **Mode Multi-Workspace Sécurisé** (`server/utils/selfRoot.ts`, `server/routes/self-root.ts`) : Gestion multi-projets avec isolation stricte et persistance dans `workspaces.json`. **Clone depuis une URL Git** (`POST /api/self-root/clone`) avec flux SSE temps réel, terminal de progression intégré dans la modale et activation automatique du workspace cloné. IPC Electron `electron/git-clone` + `window.electronAPI.gitClone()` dans le preload.
* [x] **Synchronisation de workspaces FTP** (`server/utils/ftpSync.ts`, `server/routes/ftp.ts`, `src/components/StartupProjectModal.tsx`) : Connexion FTP/FTPS, test d'accès, téléchargement récursif vers un miroir local, activation automatique comme workspace et push complet ou ciblé vers le serveur avec progression SSE. Les serveurs connus sont conservés sans mot de passe dans `.Leanna/ftp-servers.json`.
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

## Plan de perfectionnement recommandé

### Phase 0 — Stabiliser la base (0 à 2 semaines, priorité P0)

Objectif : rendre chaque installation reproductible avant d'ajouter de la puissance.

* [ ] **Ajouter une CI minimale** : installation propre, typecheck, lint, tests serveur, build Vite/esbuild et vérification de l'artefact desktop sur Windows.
* [ ] **Créer un diagnostic support** : commande ou écran exportant version, OS, mode web/desktop, port, état des variables non secrètes, dernière erreur serveur et chemin du log.
* [ ] **Traiter la dette lint par lots** : bloquer les nouvelles erreurs, puis réduire les avertissements par domaine sans reformater tout le dépôt.
* [ ] **Tester les transitions critiques** : démarrage sans clé Gemini, serveur indisponible, port déjà utilisé, workspace invalide, annulation clone/FTP et fermeture pendant une opération.

**Critères de sortie :** `npm run build`, `npm test` et la CI passent sur une machine propre ; `npm run desktop:debug` démarre ou explique son échec en moins de 15 secondes ; aucune clé ou mot de passe n'apparaît dans les logs.

### Phase 1 — Expérience IDE premium (2 à 6 semaines, P0/P1)

Objectif : rendre les tâches quotidiennes rapides, prévisibles et réversibles.

* [ ] **Accueil orienté action** : dernier workspace, reprendre la session, ouvrir/cloner, commandes récentes et état des services visibles en un coup d'oeil.
* [ ] **Command palette unifiée** : recherche de fichiers, commandes, agents, workflows et réglages avec raccourcis configurables, actions désactivées expliquées et historique.
* [ ] **Système d'état cohérent** : notifications non intrusives, erreurs contextualisées, retry, annulation et progression pour chaque appel réseau ou opération longue.
* [ ] **Revue des modifications** : diff Monaco avant/après, acceptation par fichier ou bloc, restauration, checkpoint nommé et résumé IA vérifiable.
* [ ] **Git de niveau professionnel** : branche active, changements non commités, stage partiel, commit assisté, conflit guidé, push/pull avec confirmation et récupération d'erreur.
* [ ] **Terminal fiable** : sessions persistantes, renommage, copie, recherche, raccourcis, sortie limitée avec téléchargement des logs et avertissement pour les commandes à risque.
* [ ] **Responsive et accessibilité** : navigation clavier complète, focus visible, `aria-live` pour les flux SSE, contraste vérifié, tailles compactes sans débordement et mode mouvement réduit.
* [ ] **Préférences utilisateur** : raccourcis, modèle, niveau d'autonomie, thème, langue, confidentialité et comportement de confirmation regroupés dans un profil exportable.

**Critères de sortie :** un nouveau projet est ouvert en trois actions maximum ; toute mutation destructive possède aperçu, confirmation et undo ; les parcours principaux sont testés au clavier et sur une fenêtre 1280 px / 768 px.

### Phase 2 — IA utile et contrôlable (1 à 3 mois, P1)

Objectif : augmenter la qualité des décisions de l'IA sans sacrifier la compréhension humaine.

* [ ] **Plan d'action explicite** : avant une mission multi-étapes, afficher objectifs, fichiers ciblés, outils, risques, coût estimé et conditions d'arrêt.
* [ ] **Autonomie par niveaux** : lecture seule, proposition, exécution surveillée et autonomie contrôlée ; permissions par outil, workspace et durée.
* [ ] **Contexte traçable** : chaque réponse cite les fichiers, lignes, tests et sources réellement utilisés ; bouton pour inspecter ou exclure une source du contexte.
* [ ] **Boucle qualité automatique** : après modification, formatage ciblé, typecheck, tests concernés, analyse de diff et rapport de régression ; arrêt sur échec plutôt que nouvelle tentative infinie.
* [ ] **Routing multi-modèles** : Gemini, OpenRouter et Ollama selon coût, latence, confidentialité et disponibilité ; affichage du modèle choisi et possibilité de forcer un fournisseur.
* [ ] **Mémoire maîtrisée** : aperçu avant sauvegarde, TTL, suppression/export, séparation mémoire personnelle/projet et recherche vectorielle avec score de pertinence.
* [ ] **Voix et multimodal** : transcription éditable, bouton mute clair, indicateur d'enregistrement, reprise après coupure WebSocket et fallback texte hors ligne.
* [ ] **Évaluation continue** : jeu de scénarios anonymisés couvrant édition, sécurité, Git, RAG et refus d'actions dangereuses ; mesure de précision, coût, latence et taux d'annulation.

**Critères de sortie :** aucune action d'écriture sans permission explicite, toutes les missions ont une trace d'exécution lisible, et les scénarios de référence ont un seuil de réussite défini avant chaque changement de modèle.

### Phase 3 — Sécurité, confidentialité et entreprise (1 à 6 mois, P0/P1)

* [ ] **CSP stricte et Electron durci** : supprimer les exceptions inutiles, contrôler les origines, vérifier navigation externe, permissions webview, téléchargements et liens `shell`.
* [ ] **Sessions éphémères** : remplacer le jeton statique par sessions signées, rotation, expiration, révocation et protection CSRF adaptée au mode web.
* [ ] **Secret management** : stocker les secrets dans le coffre OS quand disponible, ne jamais charger une clé de service Supabase côté renderer, et masquer les secrets dans erreurs/audits.
* [ ] **Permissions granulaires** : scopes filesystem, réseau, terminal, MCP, GitHub et FTP ; écran d'approbation lisible avec durée et portée exactes.
* [ ] **Audit exploitable** : identifiant de corrélation par mission, acteur, outil, fichiers, résultat, durée et raison du refus ; export JSON/CSV et rotation du fichier NDJSON.
* [ ] **Threat model vivant** : revue symlinks/junctions, path traversal, prompt injection, SSRF, MCP malveillant, archive bombs, uploads et commandes shell.
* [ ] **Sauvegarde et récupération** : export local chiffré, restauration testée, migration de schéma versionnée et stratégie claire si Supabase est indisponible.

**Critères de sortie :** une revue sécurité reproductible est passée, les tests d'attaque critiques sont automatisés, et la documentation indique exactement quelles données quittent la machine.

### Phase 4 — Distribution et écosystème (3 à 9 mois, P1/P2)

* [ ] **Release engineering** : versionnement sémantique, changelog automatique, artefacts signés, checksum, canaux stable/beta et rollback de release.
* [ ] **Observabilité opt-in** : métriques anonymisées de crash, latence et erreurs avec consentement, désactivation simple et aucune collecte de contenu de code par défaut.
* [ ] **Marketplace fiable** : manifeste signé, versions compatibles, permissions affichées avant installation, scan à l'installation, mise à jour réversible et réputation basée sur sécurité autant que notes.
* [ ] **MCP et extensions** : catalogue de permissions, isolation par processus, health check, logs par serveur, arrêt forcé et quotas réseau/CPU.
* [ ] **Collaboration** : partage de session en lecture seule d'abord, commentaires sur diff ensuite, puis co-édition CRDT uniquement après modèle de permissions et résolution de conflits validé.
* [ ] **Documentation produit** : guide de démarrage illustré, dépannage desktop, sécurité, configuration entreprise, FAQ et matrice de compatibilité OS/Node/Git.

**Critères de sortie :** une personne externe installe Leanna, ouvre un projet, exécute un parcours IA et récupère ses données sans assistance ; chaque release est vérifiable et réversible.

### Scorecard de pilotage

Suivre ces indicateurs à chaque version :

| Domaine | Indicateur cible |
| :--- | :--- |
| Démarrage | succès desktop > 99 % sur machines supportées, temps jusqu'à l'éditeur < 8 s |
| Fiabilité | crash renderer/backend, erreurs WebSocket et opérations abandonnées |
| Productivité | temps ouverture projet, temps première réponse, actions annulées/restaurées |
| IA | taux de tâches réussies, régressions détectées, coût par mission, citations vérifiables |
| Sécurité | tests critiques passants, secrets exposés, permissions trop larges, findings non résolus |
| Qualité | couverture des chemins critiques, temps CI, erreurs TypeScript et warnings lint nouveaux |
| Adoption | activation du premier workspace, retour après 7 jours, désinstallation marketplace |

Chaque entrée future de la roadmap doit préciser le propriétaire, la version cible, la métrique concernée, les dépendances et le test qui permettra de la marquer comme terminée.

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

* ✅ **Marketplace d'agents et de skills** *(livré v0.9.0)* : Registre communautaire de 10 paquets seedés (6 agents, 2 skills, 2 bundles) avec persistence locale dans `.Leanna/marketplace-registry.json`. Interface `SidePanel` overlay (côté droit, fond IDE visible). Fonctionnalités complètes :
  - **Catalogue** : recherche plein-texte, filtres type/catégorie/tri, pagination, raccourci `Ctrl+K`
  - **Installation en un clic** : agent → `DynamicAgentRegistry` + `custom-agents.json` ; skill → Supabase `custom_skills`
  - **Désinstallation** : suppression du registre dynamique et du fichier JSON
  - **Détail paquet** : 4 onglets (Aperçu, Contenu, Avis, Sécurité), stats live, partage par lien
  - **Notation communautaire** : formulaire inline (1-5 étoiles + commentaire), recalcul de moyenne
  - **Validation sécurité automatisée** : 12 patterns OWASP/injection sur prompts/instructions avant publication
  - **Publication** : formulaire avec scan sécurité live, blocage si flags critiques
  - **Import glisser-déposer** : fichiers `.leanna.json` (paquets exportés ou partagés)
  - **Export JSON** : téléchargement `{id}-v{version}.leanna.json`
  - **Copie de lien** : partage URL dans le presse-papier
  - **API REST** : 9 endpoints `GET/POST /api/marketplace/*` (search, featured, installed, stats, package/:id, install, uninstall, publish, rate, validate-security, export/:id)
---

## Backlog technique & Qualité

### Sécurité
* Renforcer la politique CSP (Content Security Policy) dans `index.html` et Electron.
* Remplacer la vérification de jeton statique par une rotation de sessions avec jetons éphémères signés.

### Performance & DX
* Réduire la taille du bundle de production en améliorant le code-splitting des dépendances lourdes (`monaco-editor`, `mermaid`, `recharts`).
* Ajouter un linter automatisé ESLint/Prettier dans les hooks Husky pré-commit.

