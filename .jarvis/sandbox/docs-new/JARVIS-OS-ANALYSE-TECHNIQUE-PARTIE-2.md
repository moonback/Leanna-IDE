# 🔍 **ANALYSE TECHNIQUE COMPLÈTE - JARVIS OS**
## *Partie 2 : Fonctionnalités, UI/UX, Composants et Logique Métier*

---

## 📌 **Table des Matières - Partie 2**

1. [Analyse fonctionnalité par fonctionnalité](#3-analyse-fonctionnalité-par-fonctionnalité)
2. [Analyse écran par écran (UI/UX)](#4-analyse-écran-par-écran-ui-ux)
3. [Analyse des composants](#5-analyse-des-composants)
4. [Analyse de la logique métier](#6-analyse-de-la-logique-métier)

---

## 3. **Analyse fonctionnalité par fonctionnalité**

---

## 3.1 **IDE Intelligent**

### 🎯 Objectif
Fournir un environnement de développement complet avec éditeur de code, exploration de fichiers, recherche, et intégration IA.

### 📁 Fichiers impliqués

**Backend** :
- `server/routes/ide.ts` - Toutes les routes IDE
- `server/utils/sandbox.ts` - Gestion sandbox
- `server/utils/selfRoot.ts` - Gestion du root projet
- `server/audit.ts` - Journalisation des actions

**Frontend** :
- `src/views/IdeView.tsx` - Vue principale IDE
- `src/components/ide/` - 25+ composants IDE
- `src/hooks/useFileSystem.ts` - Gestion fichier
- `src/hooks/useEditorActions.ts` - Actions éditeur
- `src/services/ideApi.ts` - API IDE
- `src/stores/agentActivityStore.ts` - Activité agents

### 🧩 Composants utilisés

#### Éditeur
- `MonacoEditor` (lazy loaded) - Éditeur de code principal
- `EditorTabs` - Onglets pour les fichiers ouverts
- `FileExplorer` / `FileExplorerVirtualized` - Explorateur de fichiers
- `RichDocumentViewer` - Visualiseur de documents riches
- `MarkdownPreview` - Aperçu Markdown
- `ImagePreview` - Aperçu images
- `DiffViewer` - Visualiseur de diffs

#### Panneaux
- `ChatPanel` - Chat avec l'IA
- `AgentPanel` - Panneau des agents
- `AgentFleetPanel` - Flotte d'agents
- `AgentBuilderPanel` - Constructeur d'agents
- `MissionPanel` - Panneau des missions
- `BrowserPanel` - Navigateur web intégré
- `VisionPanel` - Vision IA (webcam)
- `DocumentPanel` - Documents
- `SandboxPanel` - Sandbox
- `WorkflowPanel` - Workflows
- `McpPanel` - MCP
- `SettingsPanel` - Paramètres IDE
- `HelpPanel` - Aide
- `HistoryPanel` - Historique
- `AutomationPanel` - Automatisation
- `MemoryPanel` - Mémoire
- `SystemHealthDashboard` - Santé système
- `AgentActivityOverlay` - Superposition activité agents
- `AgentProgressBar` - Barre de progression agents

#### UI
- `StatusBar` - Barre de statut
- `CommandPalette` - Palette de commandes
- `GlobalSearch` - Recherche globale
- `ContextMenu` - Menu contextuel
- `UnifiedSidebar` - Sidebar unifié
- `TokenCounter` - Compteur de tokens
- `AgentStatusBlock` - Bloc statut agents

### 🔄 Logique interne

#### Gestion des fichiers
1. **Lecture** : `GET /api/ide/file?path=<path>`
2. **Écriture** : `POST /api/ide/file` avec `{ path, content }`
3. **Création** : `POST /api/ide/create-file`
4. **Suppression** : `DELETE /api/ide/file?path=<path>`
5. **Arborescence** : `GET /api/ide/tree`

#### Sandbox
- **Activation** : `POST /api/sandbox/activate`
- **Désactivation** : `POST /api/sandbox/deactivate`
- **Statut** : `GET /api/sandbox/status`
- **Modifications** : Suivies dans `.jarvis/sandbox/`
- **Validation** : `POST /api/sandbox/validate` avant merge

#### Vérification fichiers (Skill: verify)
- **verify_file** : Lint + TypeScript + Sécurité
- **verify_typecheck** : Vérification TypeScript complète
- **verify_syntax** : Validation syntaxique
- **verify_lint** : Linting
- **verify_security** : Audit sécurité
- **verify_full** : Vérification complète

### 👤 Flux utilisateur

```
1. Utilisateur ouvre l'IDE (/ide)
2. Sidebar gauche : Explorateur de fichiers (FileExplorer)
3. Zone centrale : Éditeur Monaco avec onglets (EditorTabs)
4. Sidebar droite : Panneaux contextuels (Chat, Agents, etc.)
5. Bas : Barre de statut (StatusBar)
6. Haut : CommandPalette (Ctrl+K), GlobalSearch (Ctrl+Shift+F)
```

### 🌐 API appelées

| Endpoint | Méthode | Description | Auth |
|----------|---------|-------------|------|
| `/api/ide/tree` | GET | Arborescence des fichiers | ✅ |
| `/api/ide/file` | GET | Lire un fichier | ✅ |
| `/api/ide/file` | POST | Écrire un fichier | ✅ |
| `/api/ide/create-file` | POST | Créer un fichier | ✅ |
| `/api/ide/delete` | DELETE | Supprimer un fichier | ✅ |
| `/api/ide/rename` | POST | Renommer un fichier | ✅ |
| `/api/ide/search` | GET | Recherche dans les fichiers | ✅ |
| `/api/ide/verify` | POST | Vérification de fichier | ✅ |
| `/api/ide/execute` | POST | Exécuter une commande | ✅ |

### 💾 Données manipulées
- **Fichiers** : Contenu des fichiers du workspace
- **Arborescence** : Structure des dossiers
- **Onglets** : Fichiers ouverts dans l'éditeur
- **Sélection** : Fichier/répertoire sélectionné
- **Historique** : Historique de navigation

### ⚠️ Conditions
- **Sandbox actif** : Certaines opérations nécessitent le sandbox
- **Fichiers critiques** : Confirmation requise pour `.env`, `package.json`, etc.
- **Validation** : Vérification syntaxique avant écriture
- **Rate limiting** : 30 écritures/minute max

### ❌ Gestion d'erreurs
- **403** : Chemin hors du workspace
- **404** : Fichier introuvable
- **500** : Erreur serveur
- **Audit** : Journalisation de toutes les modifications
- **Confirmation** : Pour les fichiers critiques

### 🎯 Cas limites
- **Fichiers volumineux** : Lecture partielle avec preview
- **Binaire** : Support via `/api/ide/file-raw`
- **Chemin absolu** : Résolution relative au workspace
- **Symlinks** : Gérés par `path.resolve`

### 🔗 Dépendances
- **Monaco Editor** : Éditeur de code
- **react-window** : Virtualisation de l'arborescence
- **@monaco-editor/react** : Wrapper React
- **lucide-react** : Icônes

---

## 3.2 **Système Multi-Agents**

### 🎯 Objectif
Orchestrer 14 agents autonomes spécialisés pour des tâches de développement logiciel et de rédaction documentaire.

### 📁 Fichiers impliqués

**Backend** :
- `server/agents/AgentOrchestrator.ts` - Orchestrateur principal
- `server/agents/AgentExecutor.ts` - Exécuteur de tâches
- `server/agents/AgentRegistry.ts` - Registre des agents
- `server/agents/AgentMessageBus.ts` - Bus de messages
- `server/agents/AgentPersistence.ts` - Persistance Supabase
- `server/agents/AgentRepairLoop.ts` - Auto-guérison
- `server/agents/AgentValidation.ts` - Validation
- `server/agents/AutonomousAgent.ts` - Agents autonomes
- `server/agents/AutonomousLoop.ts` - Boucle autonome
- `server/agents/TaskScheduler.ts` - Planificateur
- `server/agents/ProgressNotifier.ts` - Notifications
- `server/agents/roles.ts` - Définitions des rôles
- `server/agents/types.ts` - Types

**Frontend** :
- `src/components/panels/AgentPanel.tsx` - Panneau agent unique
- `src/components/panels/AgentFleetPanel.tsx` - Flotte d'agents
- `src/components/panels/AgentBuilderPanel.tsx` - Constructeur
- `src/stores/agentActivityStore.ts` - Store d'activité
- `src/hooks/useAgentNotifications.ts` - Notifications

### 🤖 Agents disponibles (14)

#### Pôle Code & Ingénierie Logicielle (7 agents)

| Agent | Rôle | Mission | Capacités | Concurrency | Timeout |
|-------|------|---------|-----------|-------------|---------|
| 💻 Développeur | coder | Implémentation de fonctionnalités | Lecture/Écriture/Tests/Validation | 3 | 120s |
| ✨ Refactorisation | refactor | Clean Code, réduction dette | Lecture/Écriture/Validation | 2 | 180s |
| 🪲 Débogueur | debugger | Diagnostic, root-cause, correctifs | Lecture/Écriture/Validation | 2 | 120s |
| 🔍 Revue de Code | reviewer | Audit qualité, anti-patterns | Lecture seule | 1 | 90s |
| 🧪 QA & Tests | tester | Conception suites de tests | Lecture/Écriture/Validation | 2 | 120s |
| 🛡️ Sécurité | security | Audit vulnérabilités OWASP | Lecture seule | 1 | 90s |
| 🏛️ Architecte | architect | Conception système, schémas | Lecture/Écriture/Structure | 2 | 180s |

#### Pôle Rédaction & Documentation (7 agents)

| Agent | Rôle | Mission | Capacités | Concurrency | Timeout |
|-------|------|---------|-----------|-------------|---------|
| ✍️ Rédacteur | writer | Rédaction documents | Lecture/Écriture | 3 | 120s |
| 🎨 Mise en forme | formatter | Formatage Markdown | Lecture/Écriture | 2 | 60s |
| 🔎 Recherche | researcher | Collecte d'informations | Lecture seule | 2 | 90s |
| 🖋️ Correcteur | proofreader | Correction orthographique | Lecture/Écriture | 2 | 60s |
| 🌐 Traducteur | translator | Traduction multilingue | Lecture/Écriture | 2 | 90s |
| 📝 Synthèse | summarizer | Résumés exécutifs | Lecture/Écriture | 2 | 60s |
| 📋 Planificateur | planner | Plans détaillés | Lecture/Écriture/Structure | 2 | 90s |

### 🎯 Patterns de Collaboration Multi-Agents

1. **Cycle Feature Complète** : `architect` → `coder` → `tester` → `reviewer`
2. **Cycle Bugfix Sécurisé** : `debugger` → `tester` → `security`
3. **Cycle Clean Code** : `reviewer` → `refactor` → `tester`
4. **Cycle Document Complet** : `planner` → `writer` → `proofreader` → `formatter`
5. **Cycle Traduction Vérifiée** : `writer` → `translator` → `proofreader`
6. **Cycle Recherche & Synthèse** : `researcher` → `planner` → `writer` → `summarizer`

### 🔄 Logique interne

#### Délégation simple
1. Réception d'une demande de tâche
2. Identification de l'agent approprié (via mots-clés ou spécification directe)
3. Vérification de la concurrency max de l'agent
4. Création de la tâche avec statut `pending`
5. Persistance de la tâche (Supabase)
6. Exécution asynchrone par l'AgentExecutor
7. Mise à jour du statut (`running` → `completed`/`failed`)
8. Broadcast des événements via WebSocket

#### Orchestration multi-agents
1. Réception d'un plan d'orchestration
2. Création des tâches avec leurs dépendances
3. Résolution des dépendances (topological sort)
4. Exécution parallèle des tâches sans dépendances
5. Exécution séquentielle des tâches avec dépendances
6. Gestion des erreurs et timeout
7. Aggregation des résultats

### 🌐 API appelées

| Endpoint | Méthode | Description | Auth |
|----------|---------|-------------|------|
| `/api/agents/delegate` | POST | Délégation simple | ✅ |
| `/api/agents/orchestrate` | POST | Orchestration | ✅ |
| `/api/agents` | GET | Liste des tâches | ✅ |
| `/api/agents/:taskId` | GET | Détails tâche | ✅ |
| `/api/agents/:taskId/cancel` | POST | Annuler | ✅ |
| `/api/agents/fleet` | GET | Statut flotte | ✅ |

### 💾 Données manipulées
- **AgentTask** : Définition d'une tâche agent
- **OrchestrationPlan** : Plan d'orchestration
- **AgentEvent** : Événements de progression
- **TaskResult** : Résultat d'une tâche

### ⚠️ Conditions
- **Concurrency** : Chaque agent a une limite de tâches simultanées
- **Timeout** : Chaque agent a un timeout par défaut
- **Priorité** : Les tâches sont traitées par ordre de priorité (high > medium > low)
- **Dépendances** : Les tâches avec dépendances attendent la complétion

### ❌ Gestion d'erreurs
- **429** : Agent à capacité maximale
- **408** : Timeout de la tâche
- **500** : Erreur d'exécution
- **Auto-guérison** : Récupération après crash via AgentRepairLoop
- **Persistence** : Restauration des tâches après redémarrage

### 🔗 Dépendances
- **SkillManager** : Pour l'exécution des outils
- **AgentRegistry** : Pour la gestion des agents autonomes
- **AgentMessageBus** : Pour la communication inter-agents
- **AgentPersistence** : Pour la persistance Supabase
- **ProgressNotifier** : Pour les notifications

---

## 3.3 **Notebooks RAG**

### 🎯 Objectif
Fournir un système concurrent de NotebookLM avec ingestion de sources multiples, chat groundé avec citations, et génération de contenu avancée.

### 📁 Fichiers impliqués

**Backend** :
- `server/notebooks/NotebookManager.ts` - CRUD notebooks
- `server/notebooks/EmbeddingStore.ts` - Stockage embeddings
- `server/notebooks/RAGEngine.ts` - Moteur RAG
- `server/notebooks/GroundedChat.ts` - Chat groundé
- `server/notebooks/ContentGenerator.ts` - Génération de contenu
- `server/notebooks/SourceIngester.ts` - Ingestion de sources
- `server/notebooks/BackupService.ts` - Sauvegarde automatique
- `server/notebooks/ProcessingQueue.ts` - File d'attente
- `server/notebooks/ResponseCache.ts` - Cache des réponses
- `server/notebooks/types.ts` - Types

**Frontend** :
- `src/views/NotebooksView.tsx` - Vue principale
- `src/components/notebooks/NotebookList.tsx` - Liste des notebooks
- `src/components/notebooks/NotebookDetail.tsx` - Détail notebook
- `src/components/notebooks/NotebookChat.tsx` - Chat notebook
- `src/components/notebooks/SourcePanel.tsx` - Panneau sources
- `src/components/notebooks/NotesPanel.tsx` - Panneau notes
- `src/components/notebooks/NotesCanvas.tsx` - Canvas de notes
- `src/components/notebooks/GeneratePanel.tsx` - Génération de contenu
- `src/components/notebooks/HistoryPanel.tsx` - Historique
- `src/components/notebooks/MermaidDiagram.tsx` - Diagrammes Mermaid

### 📚 Fonctionnalités Notebooks

#### Gestion des sources
- **Upload** : PDF, DOCX, MD, HTML, images (PNG/JPG/WebP), CSV, JSON, YAML
- **URL** : Ingestion depuis une URL
- **Texte** : Collage de texte ou depuis presse-papier
- **Images** : Upload avec analyse Vision IA (OCR, description visuelle)
- **HTML** : Rendu visuel dans iframe sandboxée
- **Preview** : Aperçu inline du contenu
- **Tags** : Ajout de tags personnalisés
- **Suppression** : Individuelle avec nettoyage des embeddings

#### Chat groundé
- **Recherche hybride** : Embeddings sémantiques (Gemini) + TF-IDF lexical + Reciprocal Rank Fusion + Re-ranking LLM
- **Citations** : Références précises aux sources avec scores de pertinence
- **Conversations multiples** : Threads séparés par notebook
- **Switch instantané** : Changement de conversation
- **Titrage automatique** : Génération de titres pour les conversations
- **Personnalités IA** : 6 tons (Standard, Académique, Vulgarisateur, Concis, Détaillé, Créatif)
- **Commandes slash** : `/résume`, `/compare`, `/quiz`, `/insights`, `/glossaire`, `/plan`
- **Voice Input** : Dictée vocale via Web Speech API (français)
- **TTS** : Lecture audio des réponses avec contrôle play/stop
- **Retry/Regenerate** : Régénération en un clic
- **Edit & Resend** : Modification et réenvoi
- **Copy to clipboard** : Copie des réponses
- **Feedback** : Thumbs up/down
- **Stop streaming** : Arrêt de la génération
- **Token counter** : Estimation temps réel

#### Génération de contenu (10+ types)
- **Résumé synthétique**
- **FAQ** (15-20 Q&R)
- **Guide d'étude** (concepts, quiz, auto-évaluation)
- **Briefing exécutif**
- **Chronologie**
- **Plan structuré**
- **Carte mentale** (rendu Mermaid visuel)
- **Analyse SWOT**
- **Glossaire** (termes techniques, acronymes)
- **Infographies** (génération d'images IA)
- **Streaming** : Affichage en temps réel avec design pro
- **Filtrage de sources** : Sélection des sources spécifiques
- **Instructions personnalisées** : Prompt custom
- **Import au workspace** : Export vers le projet
- **Export Markdown** : Téléchargement .md

#### Audio Overview
- **Script de podcast IA** : Deux hôtes discutent des sources
- **Vitesse variable** : 1x → 2x
- **Progression synchronisée** : Mode karaoké
- **Download** : Script en Markdown
- **Personnalisation** : Ton et instructions custom

#### Notes avancées
- **Templates** : Cornell, Résumé, To-do, Compte-rendu
- **Recherche** : Full-text avec tri (récentes, anciennes, A→Z)
- **Export** : Toutes les notes en Markdown
- **Épinglage** : Organisation
- **Vue Canvas** : Espace 2D pour organiser visuellement (drag & drop, zoom, pan)
- **Backlinks** : Détection automatique des mentions entre notes

### 🔄 Logique interne

#### RAG Engine
1. **Indexation** : Extraction de chunks depuis les sources
2. **Embedding** : Vectorisation via gemini-embedding-001
3. **Stockage** : Dans EmbeddingStore avec LRU eviction (50K vecteurs max)
4. **Recherche** : Requête → Embedding → Similarité cosinus
5. **Fusion** : Reciprocal Rank Fusion avec TF-IDF
6. **Re-ranking** : Re-classement via LLM
7. **Citations** : Extraction des passages pertinents

#### Chat Flow
1. **Requête utilisateur** → Analyse et classification
2. **Recherche RAG** → Récupération des chunks pertinents
3. **Construction du prompt** → Intégration des citations
4. **Génération** → Appel à l'API Gemini
5. **Streaming** → Affichage progressif
6. **Sauvegarde** → Historique de conversation

### 🌐 API appelées

| Endpoint | Méthode | Description | Auth |
|----------|---------|-------------|------|
| `/api/notebooks` | GET/POST | Liste/Créer notebooks | ✅ |
| `/api/notebooks/:id` | GET/PUT/DELETE | CRUD notebook | ✅ |
| `/api/notebooks/:id/sources` | POST/GET | Gestion sources | ✅ |
| `/api/notebooks/:id/chat` | POST/GET | Chat | ✅ |
| `/api/notebooks/:id/chat/regenerate` | POST | Régénérer | ✅ |
| `/api/notebooks/:id/generate` | POST | Générer contenu | ✅ |
| `/api/notebooks/:id/audio` | POST | Audio overview | ✅ |
| `/api/notebooks/:id/export` | POST | Export | ✅ |

### 💾 Données manipulées
- **Notebook** : Objet notebook complet
- **Source** : Fichier source uploadé
- **Chunk** : Morceau de texte vectorisé
- **Embedding** : Vecteur (1536 dimensions pour gemini-embedding-001)
- **ChatMessage** : Message avec citations
- **NotebookNote** : Note utilisateur
- **GeneratedDocument** : Document généré
- **AudioOverview** : Script audio généré

### ⚠️ Conditions
- **Taille source** : Limite de 8000 caractères pour l'extraction
- **Embeddings** : Limite de 50K vecteurs (~50MB)
- **Cache** : Invalidé quand les sources changent
- **Streaming** : Support via SSE

### ❌ Gestion d'erreurs
- **404** : Notebook ou source introuvable
- **413** : Source trop volumineuse
- **429** : Rate limit dépassé
- **500** : Erreur serveur ou API IA
- **Retry** : Exponentiel pour l'ingestion

---

## 3.4 **Moteur de Connaissances**

### 🎯 Objectif
Fournir une compréhension profonde du projet via indexation automatique, graphe de connaissances, recherche sémantique et analyse d'impact.

### 📁 Fichiers impliqués

**Backend** :
- `server/knowledge/ProjectIndexer.ts` - Indexation du projet
- `server/knowledge/KnowledgeGraph.ts` - Graphe de connaissances
- `server/knowledge/DependencyGraph.ts` - Graphe de dépendances
- `server/knowledge/ProjectMemory.ts` - Mémoire projet
- `server/knowledge/SemanticSearch.ts` - Recherche sémantique
- `server/knowledge/ImpactAnalyzer.ts` - Analyse d'impact
- `server/knowledge/PlanningEngine.ts` - Planification
- `server/knowledge/UnderstandingEngine.ts` - Compréhension
- `server/knowledge/LearningEngine.ts` - Apprentissage
- `server/knowledge/ReasoningPipeline.ts` - Raisonnement
- `server/knowledge/RelationExtractor.ts` - Extraction de relations
- `server/knowledge/DocumentExtractor.ts` - Extraction de documents

**Frontend** :
- `src/components/knowledge/KnowledgeHealthDashboard.tsx` - Tableau de bord
- `src/components/panels/MemoryPanel.tsx` - Panneau mémoire

### 🧠 Fonctionnalités

#### ProjectIndexer
- **Scan complet** : Tous les fichiers du workspace
- **Extraction d'entités** : Classes, fonctions, interfaces, types, variables, etc.
- **Indexation incrémentale** : Surveillance des changements via FileWatcher
- **Statistiques** : Nombre de fichiers, entités, durée d'indexation

#### KnowledgeGraph
- **Entités** : Représentation des éléments de code
- **Relations** : Import, export, héritage, utilisation, etc.
- **Persistance** : Sauvegarde dans `.jarvis/ProjectKnowledge.json`
- **Visualisation** : Graphe des relations entre fichiers

#### SemanticSearch
- **Recherche vectorielle** : Sur les embeddings des entités
- **Similarité** : Cosine similarity
- **Fusion** : Combinaison avec recherche TF-IDF
- **Re-ranking** : Via LLM pour améliorer la pertinence

#### ImpactAnalyzer
- **Analyse avant modification** : Prédiction des fichiers impactés
- **Score de risque** : Évaluation du risque (low, medium, high)
- **Recommandations** : Tests à exécuter, fichiers à vérifier
- **Visualisation** : Graphe d'impact

### 🔄 Logique interne

#### Indexation
1. **Scan initial** : Au démarrage du serveur (si projet actif)
2. **Extraction** : Pour chaque fichier, extraction des entités
3. **Vectorisation** : Génération des embeddings pour chaque entité
4. **Stockage** : Sauvegarde dans KnowledgeGraph
5. **Surveillance** : FileWatcher détecte les changements
6. **Mise à jour** : Indexation incrémentale

#### Recherche sémantique
1. **Requête** : Texte de l'utilisateur
2. **Embedding** : Vectorisation de la requête
3. **Similarité** : Comparaison avec les embeddings stockés
4. **Top-K** : Sélection des K entités les plus proches
5. **Fusion** : Combinaison avec recherche TF-IDF
6. **Re-ranking** : Ré-ordination via LLM
7. **Résultats** : Entités pertinentes avec scores

### 🌐 API appelées

| Endpoint | Méthode | Description | Auth |
|----------|---------|-------------|------|
| `/api/knowledge/index` | POST | Indexer le projet | ✅ |
| `/api/knowledge/search` | GET | Recherche sémantique | ✅ |
| `/api/knowledge/graph` | GET | Récupérer le graphe | ✅ |
| `/api/knowledge/impact` | POST | Analyse d'impact | ✅ |
| `/api/knowledge/health` | GET | Santé du codebase | ✅ |

---

## 3.5 **Assistant Multimodal (Gemini Live)**

### 🎯 Objectif
Fournir une interaction naturelle avec l'IA via voix, webcam, partage d'écran et chat textuel en temps réel.

### 📁 Fichiers impliqués

**Backend** :
- `server/live/LiveSocketHandler.ts` - Gestion WebSocket Live
- `server/utils/geminiKeyPool.ts` - Pool de clés API
- `server/utils/geminiTTS.ts` - Synthèse vocale
- `server/utils/textGeneration.ts` - Génération de texte
- `server/routes/tts.ts` - Routes TTS

**Frontend** :
- `src/context/LiveAPIContext.tsx` - Contexte Live API
- `src/hooks/useLiveAPI.ts` - Hook Live API
- `src/components/ide/ChatPanel.tsx` - Panneau de chat
- `src/components/FloatingOrb.tsx` - Orb flottant
- `src/context/ScreenShareContext.tsx` - Contexte partage écran
- `src/hooks/useScreenShare.ts` - Hook partage écran
- `src/hooks/useAudio.ts` - Hook audio
- `src/hooks/useTranscript.ts` - Hook transcription

### 🎤 Fonctionnalités

#### Voix en temps réel
- **Dictée** : Reconnaissance vocale via Web Speech API
- **Commandes vocales** : Exécution de commandes par voix
- **Réponses audio** : Synthèse vocale des réponses (TTS)
- **Transcription** : Conversion audio → texte en temps réel

#### Vision Webcam
- **Capture** : Accès à la webcam via `getUserMedia`
- **Analyse** : Interprétation des images (documents physiques, schémas)
- **Description** : Génération de descriptions textuelles
- **OCR** : Reconnaissance de texte dans les images

#### Partage d'écran
- **Capture** : Partage d'écran via `getDisplayMedia`
- **Analyse** : Interprétation du contenu affiché
- **Frames** : Envoi de frames vidéo vers l'API
- **Débits** : Contrôle du débit (FPS variable)

#### Chat textuel
- **Conversation** : Historique persistant
- **Streaming** : Affichage progressif des réponses (SSE)
- **Contexte** : Maintien du contexte de conversation
- **Personnalisation** : Ton et style de réponse

### 🔄 Logique interne

#### Connexion WebSocket
1. **Établissement** : Connexion à `/live` avec authentification
2. **Événements** : Gestion des messages entrants/sortants
3. **Reconnexion** : Automatique après déconnexion
4. **Heartbeat** : Pings régulières pour maintenir la connexion

#### Traitement audio
1. **Capture** : Accès au microphone via `navigator.mediaDevices`
2. **Streaming** : Envoi de chunks audio vers l'API
3. **Transcription** : Conversion en texte via l'API
4. **Traitement** : Analyse et réponse
5. **Synthèse** : Conversion texte → audio (TTS)

### 🌐 API appelées

| Endpoint | Méthode | Description | Auth |
|----------|---------|-------------|------|
| `/live` (WebSocket) | - | Communication temps réel | ✅ |
| `/api/tts` | POST | Synthèse vocale | ✅ |

### 💾 Données manipulées
- **Audio chunks** : Morceaux audio pour transcription
- **Video frames** : Frames vidéo pour analyse visuelle
- **Text messages** : Messages textuels
- **Transcript** : Transcription des conversations
- **TTS audio** : Audio généré

### ⚠️ Conditions
- **Permissions** : Accès microphone/camera requis
- **HTTPS** : Obligatoire pour getUserMedia en production
- **Codecs** : Support des codecs audio/vidéo
- **Bande passante** : Débit suffisant pour le streaming

---

## 3.6 **Automatisation & Workflows**

### 🎯 Objectif
Automatiser des tâches répétitives, orchestrer des workflows documentaires et planifier des missions autonomes.

### 📁 Fichiers impliqués

**Backend** :
- `server/skills/automation.ts` - Skill automatisation
- `server/skills/automationBrowser.ts` - Navigation web automatisée
- `server/skills/automationScheduler.ts` - Planificateur
- `server/skills/workflow.ts` - Skill workflow
- `server/skills/mission.ts` - Skill mission
- `server/mission/` - Moteur de missions
- `server/workflows/` - Moteur de workflows
- `server/routes/automation.ts` - Routes automatisation
- `server/routes/workflows.ts` - Routes workflows

**Frontend** :
- `src/views/AutomationView.tsx` - Vue automatisation
- `src/components/ide/AutomationPanel.tsx` - Panneau automatisation
- `src/components/panels/WorkflowsPanel.tsx` - Panneau workflows
- `src/components/panels/ScheduledTasksPanel.tsx` - Tâches planifiées
- `src/components/panels/MissionPanel.tsx` - Panneau missions

### ⚙️ Fonctionnalités

#### Automatisation Browser
- **Navigation** : Ouverture d'URLs, clics, scroll
- **Extraction** : Récupération du contenu de la page
- **Recherche** : Recherche dans les pages web
- **Captures** : Screenshots de pages
- **Formulaires** : Remplissage et soumission

#### Puppeteer Integration
- **Headless** : Navigation sans interface
- **Full page** : Capture complète des pages
- **Interactions** : Clics, saisie de texte, sélection
- **Attente** : Attente d'éléments, timeout

#### Missions Autonomes
- **Planification** : Décomposition de tâches complexes
- **Exécution** : Orchestration d'agents
- **Suivi** : Progression en temps réel
- **Validation** : Vérification des résultats

### 🌐 API appelées

| Endpoint | Méthode | Description | Auth |
|----------|---------|-------------|------|
| `/api/automation/tasks` | GET/POST | Tâches planifiées | ✅ |
| `/api/automation/browser` | POST | Navigation web | ✅ |
| `/api/workflows` | GET/POST | Workflows | ✅ |
| `/api/workflows/:id/run` | POST | Exécuter workflow | ✅ |
| `/api/missions` | GET/POST | Missions | ✅ |

---

## 4. **Analyse écran par écran (UI/UX)**

---

## 4.1 **IdeView - Interface IDE**

### 🎯 Nom de l'écran
**Interface principale de l'IDE**

### 📁 Fichiers concernés
- `src/views/IdeView.tsx` - Vue principale
- `src/components/ide/` - Tous les composants IDE
- `src/hooks/useFileSystem.ts` - Gestion fichiers
- `src/hooks/useEditorActions.ts` - Actions éditeur
- `src/services/ideApi.ts` - API IDE

### 🎨 Structure UI

```
┌─────────────────────────────────────────────────────────────────────┐
│  ┌─────────────┬─────────────────────────────────────┬─────────────┐ │
│  │ Command     │  Monaco Editor (Onglets)              │ ChatPanel   │ │
│  │ Palette     │  ┌─────────────────────────────────┐ │ (Réducible)  │ │
│  │ (Ctrl+K)    │  │  Code Editing Area                 │ │             │ │
│  │             │  │  - Syntax highlighting           │ │ - Chat avec  │ │
│  │             │  │  - Autocompletion               │ │   Leanna    │ │
│  │             │  │  - Linting                      │ │ - Citations │ │
│  │             │  │  - Folding                      │ │ - Streaming │ │
│  │             │  └─────────────────────────────────┘ │             │ │
│  └─────────────┴─────────────────────────────────────┴─────────────┘ │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  StatusBar                                                   Token │ │
│  │  - Git status  - File info  - Line/Column  - Errors/Warnings    Counter │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘

Sidebar Gauche (Réducible):
┌───────────────────┐
│ File Explorer     │ ← Arbre des fichiers
│                   │
│ Notebooks         │
│ Documents         │
│ GitHub            │
│ Automation        │
│ ...               │
└───────────────────┘

Sidebar Droite (Réducible):
┌───────────────────┐
│ Panels disponibles│
│ - Agents          │
│ - Mission         │
│ - Browser         │
│ - Vision          │
│ - Document        │
│ - Sandbox         │
│ - Workflow        │
│ - MCP             │
│ - Settings        │
│ - Help            │
└───────────────────┘
```

### 🧩 Composants présents

#### Barre Supérieure
- **CommandPalette** (`Ctrl+K`) - Recherche de commandes et fichiers
- **GlobalSearch** (`Ctrl+Shift+F`) - Recherche globale dans le projet
- **Boutons** : Sauvegarde, Annuler, Rétablir, Exécuter
- **TokenCounter** - Estimation des tokens utilisés

#### Zone Éditrice
- **EditorTabs** - Onglets pour les fichiers ouverts
- **MonacoEditor** - Éditeur de code (lazy loaded)
- **EmptyEditorState** - Affiché quand aucun fichier n'est ouvert
- **MarkdownPreview** - Aperçu Markdown
- **ImagePreview** - Aperçu des images
- **RichDocumentViewer** - Visualiseur de documents riches
- **DiffViewer** - Visualiseur de différences

#### Sidebar Gauche (UnifiedSidebar)
- **FileExplorerVirtualized** - Explorateur de fichiers avec virtualisation
- **Sections** : Accès rapide aux autres vues

#### Sidebar Droite (Panels)
- **Panel container** - Conteneur pour les panneaux (réductibles, dockables)

#### Barre de Statut (StatusBar)
- **Git status** - Statut Git du dépôt
- **File info** - Informations sur le fichier courant
- **Position** - Ligne:Colonne
- **Problèmes** - Nombre d'erreurs/warnings
- **Mode** - Indicateur de mode (full/ask)

#### Superpositions (Overlays)
- **AgentActivityOverlay** - Superposition de l'activité des agents
- **AgentProgressBar** - Barre de progression des tâches
- **NotebookPickerModal** - Modale de sélection de notebook
- **TemplateSelectorModal** - Modale de sélection de template
- **CriticalEditConfirm** - Confirmation pour les edits critiques
- **CommandPalette** - Overlay de recherche
- **GlobalSearch** - Overlay de recherche globale
- **SandboxDiffViewer** - Visualiseur de diffs sandbox

### 🖱️ Interactions utilisateur

#### Clavier
- **`Ctrl+K`** : Ouvrir CommandPalette
- **`Ctrl+Shift+F`** : Ouvrir GlobalSearch
- **`Ctrl+S`** : Sauvegarder le fichier courant
- **`Ctrl+Z`/`Ctrl+Y`** : Annuler/Rétablir
- **`Ctrl+Tab`** : Naviguer entre les onglets
- **`Ctrl+1-5`** : Ouvrir le panel correspondant
- **`Ctrl+N`** : Nouveau fichier
- **`F2`** : Renommer
- **`Delete`** : Supprimer

#### Souris
- **Clic** : Sélection d'un fichier/dossier
- **Double-clic** : Ouverture d'un fichier
- **Right-clic** : Ouverture du menu contextuel
- **Drag & Drop** : Déplacement de fichiers
- **Hover** : Preview rapide pour les fichiers
- **Scroll** : Navigation dans l'arborescence

### 🧭 Navigation
- **Arborescence** : Clic sur les dossiers pour naviguer
- **Onglets** : Switch entre fichiers ouverts
- **Panels** : Switch entre les panels droits
- **Sections** : Navigation entre les sections de la sidebar
- **Historique** : Navigation avant/arrière du navigateur

### 🌈 États possibles

| État | Composant | Description |
|------|-----------|-------------|
| Loading | Skeleton | Pour les notebooks, files, etc. |
| Loading | Spinner | Pour les opérations en cours |
| Loading | ProgressBar | Pour les téléchargements, générations |
| Erreur | Toast | Messages d'erreur en haut à droite |
| Erreur | Inline | Messages d'erreur dans les champs |
| Erreur | Overlay | Dialogue d'erreur pour les erreurs critiques |
| Vide | EmptyEditorState | Quand aucun fichier n'est ouvert |
| Vide | EmptyState | Composant réutilisable pour les listes vides |
| Succès | Toast | "Opération réussie" |
| Succès | Animation | Feedback visuel sur les interactions |
| Activité | AgentActivityOverlay | Indicateurs des tâches en cours |
| Activité | ProgressBar | Barres de progression |
| Activité | StatusBar | Indicateurs d'activité |
| Activité | Orb | Animation quand l'assistant est actif |

### 📱 Responsive
**État actuel dans le code** :
- **Non explicitement responsive** pour l'IDE
- La plupart des composants utilisent des tailles fixes
- Certains panels ont des largeurs minimales
- **FloatingOrb** est masqué sur les écrans IDE
- **ChatPanel** peut être réduit pour gagner de la place

**Points à améliorer** :
- Adaptation aux tablettes et mobiles
- Réorganisation des panels sur petits écrans
- Menu mobile pour la sidebar

---

## 4.2 **NotebooksView - Vue Notebooks**

### 🎯 Nom de l'écran
**Interface de gestion des Notebooks RAG**

### 📁 Fichiers concernés
- `src/views/NotebooksView.tsx` - Vue principale
- `src/components/notebooks/` - Tous les composants notebooks

### 🎨 Structure UI

**Navigation** : Hash-based (`#notebook=<id>`)

```
NotebooksView
└── Si notebook sélectionné : NotebookDetail
    └── 5 Onglets :
        ├── Chat (NotebookChat)
        ├── Sources (SourcePanel)
        ├── Notes (NotesPanel + NotesCanvas)
        ├── Générer (GeneratePanel)
        └── Audio (AudioOverviewPanel)

└── Sinon : NotebookList
    └── Grille des notebooks existants
```

#### NotebookList
```
┌─────────────────────────────────────────────────────────────┐
│  ✓ Créer un Notebook                                    [Bouton] │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                     │
│  │ 📓     │ │ 📚     │ │ 🔬     │                     │
│  │ Noteb.. │ │ Docum.. │ │ Recher.. │                     │
│  │ 12 src │ │ 8 src  │ │ 5 src  │                     │
│  │ 23/01  │ │ 20/01  │ │ 15/01  │                     │
│  └─────────┘ └─────────┘ └─────────┘                     │
│  ... (grille responsive de 1 à 4 colonnes)              │
└─────────────────────────────────────────────────────────────┘
```

#### NotebookDetail - Chat Tab
```
┌─────────────────────────────────────────────────────────────┐
│  [Barre de recherche dans le chat]                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │ User: Bonjour, peux-tu résumer ce document?         │   │
│  └─────────────────────────────────────────────────────┘   │
│                              ↓                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Leanna: Voici un résumé... [1] [2] [3]              │   │
│  │ [1] Source 1 - pertinence 0.95                       │   │
│  │ [2] Source 2 - pertinence 0.87                       │   │
│  │ [3] Source 3 - pertinence 0.75                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                              ↓                            │
│  [Barre d'entrée]                                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ →  Poser une question...                              │   │
│  │    [🎤 Dictée] [↗ Upload] [📄 Notes]                  │   │
│  └─────────────────────────────────────────────────────┘   │
│  [Suggestions: /résume, /compare, /quiz...]                │
└─────────────────────────────────────────────────────────────┘
```

#### NotebookDetail - Sources Tab
```
┌─────────────────────────────────────────────────────────────┐
│  [Barre de recherche]  [Filtres: PDF, DOCX, etc.]       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 📄 document.pdf                                      │   │
│  │ 12 pages • 2450 mots • 15 chunks                     │   │
│  │ Tags: [important] [✏️] [🗑️]                       │   │
│  └─────────────────────────────────────────────────────┘   │
│  [✏️ Upload de nouvelles sources]                          │
│  [Résumé global automatique des sources]                    │
└─────────────────────────────────────────────────────────────┘
```

#### NotebookDetail - Notes Tab
```
Mode Liste:
┌─────────────────────────────────────────────────────────────┐
│  [Barre de recherche]  [Filtres]  [Mode: Liste/Canvas]     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 📝 Note 1                                              │   │
│  │ Contenu de la note...                                 │   │
│  │ #tag1 #tag2  📌 Épinglé  15/01  ✏️                    │   │
│  └─────────────────────────────────────────────────────┘   │
│  [✏️ Nouvelle note]  [Templates: Cornell, Résumé, etc.]    │
└─────────────────────────────────────────────────────────────┘

Mode Canvas:
┌─────────────────────────────────────────────────────────────┐
│  ┌─────────────────────────────────────────────────────┐   │
│  │    [Note 1]──────[Note 2]                             │   │
│  │        ↓        ↓        ↓                           │   │
│  │    [Note 3]──────[Note 4]                             │   │
│  │ (Drag & Drop, Zoom avec molette, Pan avec clic)     │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

#### NotebookDetail - Generate Tab
```
┌─────────────────────────────────────────────────────────────┐
│  Type: [Résumé ▼]  Sources: ☑ S1 ☑ S2 ☐ S3                │
├─────────────────────────────────────────────────────────────┤
│  Instructions: [Focus sur les aspects techniques...]     │
│  Personnalité: [Standard ▼]  Ton: [Académique ▼]          │
├─────────────────────────────────────────────────────────────┤
│  [🎯 Générer]  [⚡ Régénérer]                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Résultat généré en streaming...                       │   │
│  └─────────────────────────────────────────────────────┘   │
│  [💾 Exporter]  [📥 Importer dans workspace]            │
└─────────────────────────────────────────────────────────────┘
```

#### NotebookDetail - Audio Tab
```
┌─────────────────────────────────────────────────────────────┐
│  Audio Overview: Podcast sur vos sources                    │
├─────────────────────────────────────────────────────────────┤
│  Script:                                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Hôte 1: Bonjour, aujourd'hui...                         │   │
│  │ Hôte 2: Absolument, voici ce que j'ai trouvé...         │   │
│  └─────────────────────────────────────────────────────┘   │
│  Vitesse: [1x ▼]  [▐░░░░░░░░░░░]  00:00 / 05:23  [▶]     │
│  [✏️ Personnaliser]  [💾 Télécharger]                  │
│  [🎯 Générer Audio Overview]                              │
└─────────────────────────────────────────────────────────────┘
```

### 🧩 Composants présents
- **NotebookList** : Grille responsive de notebooks
- **NotebookCard** : Carte avec icône, titre, nombre de sources, date
- **NotebookDetail** : Détail avec 5 onglets
- **Chat Components** : NotebookChat, ChatMessage, ChatInput
- **Source Components** : SourcePanel, SourceCard, SourceViewer
- **Note Components** : NotesPanel, NotesCanvas, NoteCard
- **Generate Components** : GeneratePanel, ContentTypeSelector
- **Audio Components** : AudioOverviewPanel, AudioPlayer

### 🖱️ Interactions utilisateur

#### Clavier
- **`Ctrl+1-5`** : Switch entre les onglets
- **`Ctrl+N`** : Nouvelle note
- **`Ctrl+F`** : Recherche dans le chat
- **`↑/↓`** : Navigation dans l'historique
- **`Enter`** : Envoyer un message

#### Souris
- **Clic onglet** : Sélectionner un onglet
- **Clic source** : Prévisualiser la source
- **Drag note** : Déplacer dans le canvas
- **Click citation** : Aller à la source

#### Voice
- **Dictée** : Activée via le bouton micro

### 🧭 Navigation
- **Hash-based** : `#notebook=<id>`
- **Breadcrumb** : Notebooks > Nom du notebook
- **Retour** : Bouton de retour vers la liste

### 🌈 États possibles
- **Loading** : Skeleton pour les notebooks, Spinner pour les opérations
- **Empty** : "Aucun notebook. Créez-en un !"
- **Empty** : "Aucune source. Upload un document."
- **Streaming** : Animation de typing dans le chat

### 📱 Responsive
- **Grille NotebookList** : Adaptative (1 à 4 colonnes selon la largeur)
- **Tabs** : Enroulement sur petits écrans
- **Canvas** : Scrollable horizontalement et verticalement
- **Breakpoints** : `max-width: 768px` et `max-width: 1024px`

---

## 4.3 **SettingsView - Vue Paramètres**

### 🎯 Nom de l'écran
**Interface de configuration complète de l'application**

### 📁 Fichiers concernés
- `src/views/SettingsView.tsx` - Vue principale
- `src/components/settings/` - 12+ composants de paramètres
- `src/context/UserProfileContext.tsx` - Contexte du profil

### 🎨 Structure UI

```
┌─────────────────────────────────────────────────────────────┐
│  Paramètres                        [✓ Sauvegarder] [✕ Annuler]  │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐                                              │
│  │ 🎨 Apparence│                                              │
│  │   - Thème: [Sombre ▼]                                      │
│  │   - Couleur: [#6366f1 ▼]                                   │
│  └─────────────┘                                              │
│                                                             │
│  ┌─────────────┐                                              │
│  │ 🤖 IA       │                                              │
│  │   - Modèle: [gemini-2.0-flash ▼]                          │
│  │   - Personnalité: [Leanna ▼]                              │
│  └─────────────┘                                              │
│                                                             │
│  ┌─────────────┐                                              │
│  │ 🔐 Sécurité  │                                              │
│  │   - Token: [ Masqué ]                                     │
│  └─────────────┘                                              │
│                                                             │
│  ... (12+ sections dans sidebar)                              │
└─────────────────────────────────────────────────────────────┘
```

### 🧩 Composants présents

#### Sidebar de navigation
- **Sections** : Liste des 12+ sections de paramètres
- **Actif** : Indicateur visuel de la section active
- **Icônes** : Pour chaque section
- **Badges** : Indicateurs de notifications

#### Sections disponibles
1. **ProfileSection** - Profil utilisateur (nom, rôle, avatar)
2. **AppearanceSection** - Apparence (thème, couleurs, police)
3. **AiSection** - IA (nom, voix, langue, style)
4. **ModelSection** - Modèles (Gemini, OpenRouter, paramètres)
5. **TokensSection** - Tokens (compteur, limites, optimisation)
6. **SafeguardsSection** - Garde-fous (niveau, fichiers critiques)
7. **DataSection** - Données (stockage, Supabase, synchronisation)
8. **KnowledgeHealthSection** - Santé connaissances
9. **BehaviorSection** - Comportement (mode, auto-open, notifications)
10. **SystemPromptSection** - Prompt Système
11. **OpenRouterSection** - OpenRouter (clé API, modèles)
12. **AuditSection** - Audit (logs, niveau, export)

### 🖱️ Interactions utilisateur
- **Clic section** : Sélection de la section
- **Clic champ** : Focus sur le champ
- **Hover** : Effets de survol
- **Click sauvegarder** : Sauvegarde de tous les paramètres

### 🌈 États possibles
- **Loading** : Spinner sur les boutons de test
- **Erreur** : Toast en cas d'erreur de sauvegarde
- **Succès** : Toast "Paramètres sauvegardés"
- **Modifié** : * à côté des champs modifiés

### 📱 Responsive
- **Sidebar** : Devient un menu déroulant sur mobile
- **Sections** : Empilement vertical sur petits écrans

---

## 4.4 **Autres Vues**

### 4.4.1 **MemoriesView**
- **Objectif** : Gestion des mémoires long terme
- **Composants** : MemoryList, MemoryCard, MemoryEditor
- **Fonctionnalités** : Liste, filtrage par catégorie, création, suppression

### 4.4.2 **GitHubView**
- **Objectif** : Intégration GitHub
- **Composants** : RepositoryList, IssueList, PullRequestList
- **Fonctionnalités** : Liste dépôts, issues, PRs, workflows

### 4.4.3 **AutomationView**
- **Objectif** : Gestion de l'automatisation
- **Composants** : ScheduledTasksPanel, WorkflowsPanel
- **Fonctionnalités** : Tâches planifiées, workflows

### 4.4.4 **DocumentsView**
- **Objectif** : Gestion documentaire
- **Composants** : DocumentPanel, DocumentUpload
- **Fonctionnalités** : Upload, analyse, export

### 4.4.5 **HistoryView**
- **Objectif** : Historique des sessions
- **Composants** : HistoryPanel
- **Fonctionnalités** : Liste sessions, conversations

### 4.4.6 **ListsView**
- **Objectif** : Gestion des listes
- **Fonctionnalités** : To-do, shopping, gestion

### 4.4.7 **HelpView**
- **Objectif** : Aide et documentation
- **Fonctionnalités** : Guide, raccourcis, FAQ

---

## 5. **Analyse des composants**

---

## 5.1 **Composants IDE**

### 📁 FileExplorer / FileExplorerVirtualized
- **Rôle** : Explorateur de fichiers du workspace
- **Props** : rootPath, onSelect, onDoubleClick, selectedPath, expandedFolders
- **Logique** : Arborescence hiérarchique, filtrage, virtualisation, tri
- **Hooks** : useState, useEffect, useCallback, useFileSystem
- **Interactions** : Clic, double-clic, right-clic, drag & drop
- **Dépendances** : react-window, lucide-react, FileIcon

### 📁 EditorTabs
- **Rôle** : Gestion des onglets de l'éditeur
- **Props** : files, activePath, onSelect, onClose, onCloseAll, onRename
- **Logique** : Onglets, actif, fermeture, drag & drop, overflow
- **Hooks** : useState, useEffect, useCallback

### 📁 ChatPanel
- **Rôle** : Panneau de chat avec l'assistant IA
- **Props** : onSend, messages, isLoading, activity
- **Logique** : Messages, streaming, input avec suggestions, voice
- **Hooks** : useState, useEffect, useRef, useLiveAPI, useChatPersistence

### 📁 StatusBar
- **Rôle** : Barre de statut en bas de l'IDE
- **Props** : Aucun (utilise contexts)
- **Logique** : Git status, file info, position, problems, mode
- **Hooks** : useFileSystem, useIdeSettings

### 📁 CommandPalette
- **Rôle** : Palette de commandes accessible via Ctrl+K
- **Props** : onSelect, onClose
- **Logique** : Commandes, filtres, groupe, navigation
- **Hooks** : useState, useEffect, useCallback

### 📁 GlobalSearch
- **Rôle** : Recherche globale dans le workspace
- **Props** : onSearch, onClose
- **Logique** : Index, query, résultats, navigation
- **Hooks** : useState, useEffect, useCallback

### 📁 ContextMenu
- **Rôle** : Menu contextuel pour les fichiers et dossiers
- **Props** : target, onClose, onAction
- **Logique** : Position, actions, groupe, navigation
- **Hooks** : useState, useEffect, useCallback

### 📁 DiffViewer
- **Rôle** : Visualiseur de différences entre fichiers
- **Props** : oldValue, newValue, language
- **Logique** : Diff, render, coloration, navigation
- **Hooks** : useState, useEffect

---

## 5.2 **Composants Notebooks**

### 📁 NotebookList
- **Rôle** : Liste des notebooks disponibles
- **Props** : onSelectNotebook, onClose
- **Logique** : Grille, carte, tri, recherche
- **Hooks** : useState, useEffect, useCallback

### 📁 NotebookDetail
- **Rôle** : Détail d'un notebook
- **Props** : notebookId, onBack
- **Logique** : Onglets, chargement, état, navigation
- **Hooks** : useState, useEffect, useCallback, useParams

### 📁 NotebookChat
- **Rôle** : Chat d'un notebook avec citations
- **Props** : notebookId, conversationId
- **Logique** : Messages, streaming, input, citations, feedback
- **Hooks** : useState, useEffect, useWebSocket, useLiveAPI

### 📁 SourcePanel
- **Rôle** : Panneau de gestion des sources
- **Props** : notebookId
- **Logique** : Liste, upload, preview, actions, résumé
- **Hooks** : useState, useEffect, useCallback

### 📁 NotesPanel & NotesCanvas
- **Rôle** : Gestion des notes
- **Props** : notebookId
- **Logique** (NotesPanel) : Liste, création, édition, templates, recherche
- **Logique** (NotesCanvas) : 2D space, drag & drop, zoom, pan, connections
- **Hooks** : useState, useEffect, useCallback, useGesture

### 📁 GeneratePanel
- **Rôle** : Panneau de génération de contenu
- **Props** : notebookId
- **Logique** : Types, sources, personnalité, instructions, génération, résultat
- **Hooks** : useState, useEffect, useCallback

### 📁 AudioOverviewPanel
- **Rôle** : Panneau de génération audio
- **Props** : notebookId
- **Logique** : Script, audio, player, contrôle, progression
- **Hooks** : useState, useEffect, useAudio, useTranscript

---

## 5.3 **Composants Panneaux**

Tous les panneaux suivent un pattern similaire :
- **Props** : Aucun ou minimal (onClose)
- **Logique** : Affichage, gestion d'état local, interactions
- **Style** : Réductible, dockable, scrollable

### 📁 AgentPanel
- **Rôle** : Panneau de gestion d'un agent
- **Props** : agentId, onClose
- **Logique** : Détails, tâches, statut, actions

### 📁 AgentFleetPanel
- **Rôle** : Panneau de la flotte d'agents
- **Props** : Aucun
- **Logique** : Liste, statut, activité, collaboration, actions

### 📁 MissionPanel
- **Rôle** : Panneau de gestion des missions
- **Props** : Aucun
- **Logique** : Liste, statut, progression, création, actions

### 📁 BrowserPanel
- **Rôle** : Navigateur web intégré
- **Props** : initialUrl, onClose
- **Logique** : Webview, navigation, pilotage IA, extraction, events

### 📁 VisionPanel
- **Rôle** : Panneau de vision (webcam)
- **Props** : onClose
- **Logique** : Camera, stream, capture, analyse, actions

### 📁 DocumentPanel
- **Rôle** : Panneau de gestion documentaire
- **Props** : Aucun
- **Logique** : Liste, upload, actions, preview

### 📁 SandboxPanel
- **Rôle** : Panneau de l'environnement sandbox
- **Props** : Aucun
- **Logique** : Statut, fichiers, actions, diff, validation

### 📁 WorkflowPanel
- **Rôle** : Panneau de gestion des workflows
- **Props** : Aucun
- **Logique** : Liste, visualisation, exécution, logs, construction

### 📁 McpPanel
- **Rôle** : Panneau de la passerelle MCP
- **Props** : Aucun
- **Logique** : Serveurs, statut, outils, actions

### 📁 SettingsPanel
- **Rôle** : Panneau des paramètres
- **Props** : Aucun
- **Logique** : Sections, navigation, sauvegarde

---

## 5.4 **Composants UI Primitives**

### 📁 Toast
- **Rôle** : Notification toast
- **Props** : message, type, duration, action
- **Logique** : Position, animation, timer, action
- **Hooks** : useState, useEffect

### 📁 Panel
- **Rôle** : Conteneur de panneau
- **Props** : title, children, onClose, className
- **Logique** : Header, content, resizable, dockable

### 📁 SidePanel
- **Rôle** : Panneau latéral
- **Props** : title, children, width, onClose
- **Logique** : Position, resizable, collapsible

### 📁 Skeleton
- **Rôle** : Composant de loading skeleton
- **Props** : variant, width, height, className
- **Logique** : Animation (pulse ou shimmer), formes

### 📁 Toggle
- **Rôle** : Interrupteur (switch)
- **Props** : checked, onChange, label, disabled
- **Logique** : État, animation, accessibilité

### 📁 Tooltip
- **Rôle** : Info-bulle
- **Props** : content, children, position, delay
- **Logique** : Trigger, position, animation

### 📁 StatusBadge
- **Rôle** : Badge de statut
- **Props** : status, text, size
- **Logique** : Couleur, icône, animation

### 📁 EmptyState
- **Rôle** : État vide
- **Props** : title, description, icon, action
- **Logique** : Affichage, styling

### 📁 IconButton
- **Rôle** : Bouton avec icône
- **Props** : icon, onClick, size, variant, disabled, tooltip
- **Logique** : Rendu, état, animation

### 📁 ViewHeader
- **Rôle** : En-tête de vue
- **Props** : title, description, actions, breadcrumb
- **Logique** : Layout, responsive

---

## 5.5 **Composants Electron-Spécifiques**

### 📁 ScreenShareCapture
- **Rôle** : Capture pour le partage d'écran

### 📁 WebcamCapture
- **Rôle** : Capture webcam

### 📁 FloatingOrb
- **Rôle** : Orb flottant pour l'assistant
- **Props** : onClick, isActive
- **Logique** : Position flottante, animation, draggable, click

### 📁 CriticalEditConfirm
- **Rôle** : Dialogue de confirmation pour les edits critiques
- **Props** : sendMessage, filePath, action
- **Logique** : Affichage modal, message, choix, sécurité

### 📁 StartupProjectModal
- **Rôle** : Modale de sélection du projet au démarrage
- **Props** : Aucun
- **Logique** : Détection, liste, sélection, nouveau

---

## 6. **Analyse de la logique métier**

---

## 6.1 **Règles Métier Principales**

### 🔐 Sécurité

#### 1. Accès API
- Toutes les routes `/api/*` nécessitent authentification **SI** `JARVIS_API_TOKEN` est configuré
- Authentification via header `x-jarvis-token`
- Token stocké dans `.env` ou `.env.local`
- **Si pas de token configuré** : Accès libre (développement)

#### 2. Port Binding
- Par défaut : `127.0.0.1` (localhost uniquement)
- Si `JARVIS_LISTEN_HOST=0.0.0.0`, **réquiert obligatoirement** `JARVIS_API_TOKEN`
- Sinon, **refus de démarrage** avec message d'erreur

#### 3. Fichiers Critiques
- Détectés via `isCriticalFile(path)` dans `server/utils/selfRoot.ts`
- **Liste** : `.env`, `.env.local`, `.gemini-keys.json`, `package.json`, `server.ts`, etc.
- **Action** : **Confirmation obligatoire** avant modification
- **Component** : `CriticalEditConfirm` (frontend)

#### 4. Fichiers Interdits
- Détectés via `isWriteForbidden(path)` dans `server/utils/selfRoot.ts`
- **Liste** : `.git/`, `node_modules/`, `dist/`, `build/`, `out/`
- **Action** : **Blocage complet** des écritures
- **Erreur** : `403 Forbidden - Chemin interdit`

#### 5. Exécution de Commandes
- **Whitelist** : `npm`, `npx`, `node`
- **Blockage** : Caractères shell (`;`, `&&`, `||`, `|`, `>`, `<`)
- **Confirmation** : Obligatoire pour `node_modules`
- **Timeout** : Configurable

#### 6. Sandbox Isolation
- **Dossier** : `.jarvis/sandbox/`
- **Activation** : Si un projet est sélectionné
- **Fonctionnement** :
  - Toutes les modifications IA vont dans le sandbox
  - **Pas de modification directe** du workspace
  - **Validation** avant merge
  - **Visualisation** des différences avant merge

#### 7. Checkpoints Git
- **Snapshot automatique** avant modification de fichiers Git
- Utilisation de `git stash` ou commit temporaire
- **Rollback automatique** si erreur de compilation après modification
- Nettoyage des checkpoints anciens (> 24h)

#### 8. Chiffrement des Clés
- **Algorithme** : AES-256-GCM
- **Clé dérivée** : `JARVIS_MASTER_KEY` + hardware seed
- **Clés chiffrées** : `GEMINI_API_KEY`, `SUPABASE_*`, `OPENROUTER_API_KEY`, `GITHUB_TOKEN`
- **Rétrocompatibilité** : Support du format AES-256-CBC historique

---

*Fin de la Partie 2. Voir JARVIS-OS-ANALYSE-TECHNIQUE-PARTIE-3.md pour la suite avec Base de Données, API, Sécurité, Performance, Design System, Flux Utilisateur et Diagrammes.*
