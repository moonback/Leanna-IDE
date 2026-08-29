# Leanna - ANALYSE TECHNIQUE COMPLÈTE - PARTIE 3D

**Date** : 28 août 2026  
**Version** : 1.0.0  
**Périmètre** : Flux utilisateur + Diagrammes  

---

## 12. FLUX UTILISATEUR

### 12.1. Parcours principaux

#### 12.1.1. Premier démarrage

```
Utilisateur
  ↓
Ouvre l'application (Electron ou Web)
  ↓
[si premier lancement]
  ↓
StartupProjectModal.tsx
  ↓
Sélection du projet (ou création)
  ↓
[Initialisation asynchrone - server.ts:120-175]
  │
  ├── Init Self-Root (server/utils/selfRoot.ts)
  ├── Chargement des workflows (server/skills/workflow.ts)
  ├── Vérification audit workflow (server/workflows/audit-workflow.ts)
  ├── Restauration tâches agents (server/agents/AgentPersistence.ts)
  │   └── Restauré: X tâche(s), Y orchestration(s)
  ├── Indexation Knowledge Graph (si projet actif)
  │   └── Projet indexé: Z fichiers, W entités
  └── Activation sandbox (si projet actif)
      └── Mode sandbox READY + watcher démarré
  ↓
Affichage interface principale
  ↓
UnifiedSidebar.tsx + Dashboard (vue par défaut)
```

---

#### 12.1.2. Création d'un notebook

```
Utilisateur dans Dashboard
  ↓
Clic sur "Nouveau Notebook" ou Ctrl+K → "New Notebook"
  ↓
POST /api/notebooks
  { name: "Mon notebook", description: "..." }
  ↓
[Serveur]
  ├── Validation du nom
  ├── Génération UUID v4
  └── Création .Leanna/notebooks/<uuid>.json
  ↓
[Réponse: { id: "uuid", name: "...", createdAt: "..." }]
  ↓
Redirection vers /notebooks/<uuid>
  ↓
Chargement NotebookView
  │
  ├── GET /api/notebooks/:id → métadonnées
  ├── GET /api/notebooks/:id/sources → sources
  └── GET /api/notebooks/:id/chat → historique
  ↓
Affichage interface notebook (4 onglets: Chat, Sources, Notes, Settings)
```

---

#### 12.1.3. Chat avec un notebook

```
Utilisateur dans NotebookView → onglet Chat
  ↓
Saisie message dans ChatInput + validation
  ↓
POST /api/notebooks/:id/chat
  { message: "Explique moi...", stream: true }
  ↓
[Serveur - Validation]
  │
  ├── Vérification token (requireAuth)
  ├── Vérification notebook existe
  └── Rate limit check (10/min par notebook)
  ↓
[Serveur - Pré-traitement]
  │
  ├── Sanitization du message
  ├── Détection prompt injection
  └── Extraction contexte
  ↓
[Serveur - Recherche RAG (si sources disponibles)]
  │
  ├── Récupération embeddings du notebook
  ├── match_memories() dans Supabase
  └── Top K résultats (K=5 par défaut)
  ↓
[Serveur - Génération]
  │
  ├── Sélection clé du pool (geminiKeyPool.ts)
  ├── Appel Google GenAI avec prompt + contexte
  └── Streaming activé
  ↓
[Serveur - Diffusion WebSocket /live]
  │
  └── Pour chaque chunk:
      └── Diffusion: { type: 'chat_chunk', notebookId, chunk, sequenceNumber }
  ↓
[Client - Réception via WebSocket]
  │
  ├── onMessage() → type === 'chat_chunk'
  │   ├── Accumulation des chunks
  │   ├── Mise à jour du message (appendChunk)
  │   ├── Animation de typing
  │   └── Auto-scroll si nécessaire
  └── [À la fin]
      ├── Affichage sources citées (si RAG)
      ├── Activation actions (like, copy)
      └── Sauvegarde historique local
```

---

#### 12.1.4. Upload d'un document

```
Utilisateur dans NotebookView → onglet Sources
  ↓
Glisser-déposer ou clic bouton upload
  ↓
[Client - Validation]
  │
  ├── Taille < 50MB
  └── Type autorisé (pdf, txt, md, etc.)
  ↓
POST /api/notebooks/:id/sources/upload
  (Content-Type: multipart/form-data)
  ↓
[Serveur - multer]
  │
  ├── memoryStorage() → buffer en mémoire
  └── Validation via fileFilter
  ↓
[Serveur - Queue]
  │
  └── sourceProcessingQueue.enqueue()
      ├── Task: { type: 'ingest', notebookId, fileName, mimeType, buffer }
      └── onProgress callback
  ↓
[Processing asynchrone]
  │
  ├── onProgress(10) → "Réception"
  ├── SourceIngester.ingestFromBuffer()
  │   ├── Extraction texte
  │   ├── Découpage en chunks
  │   └── Calcul embeddings (batch de 100)
  ├── onProgress(70) → "Extraction"
  ├── notebookManager.addSource()
  ├── onProgress(90) → "Ajout"
  ├── Invalidation cache RAG
  └── onProgress(100) → "Terminé"
  ↓
[Client]
  │
  ├── Toast de succès
  └── Mise à jour liste des sources
```

---

#### 12.1.5. Exécution d'une skill

```
Utilisateur → n'importe quelle vue
  ↓
Ouvre CommandPalette (Ctrl+K ou Cmd+K)
  ↓
Recherche et sélection d'une skill
  ↓
[Si skill nécessite arguments]
  │
  └── Affichage formulaire
  ↓
POST /api/skills/:name/execute
  { arguments: {...} }
  ↓
[Serveur - SkillManager.handleToolCall()]
  │
  ├── Vérification skill existe
  ├── Validation arguments (schéma Zod)
  └── Vérification permissions
  ↓
[Serveur - SkillExecutor.execute()]
  │
  ├── Préparation contexte
  ├── Appel Google GenAI
  │   ├── Construction prompt
  │   ├── Inclusion contexte
  │   └── Pool de clés (rotation 429)
  └── Réception et parsing réponse
  ↓
[Serveur - Retour]
  │
  ├── Formatage résultat
  ├── Audit logging
  └── Retour client
  ↓
[Client]
  │
  ├── Affichage dans ResultPanel
  ├── Notification toast
  └── Analytics logging
```

---

### 12.2. Parcours secondaires

#### 12.2.1. Gestion des agents autonomes

```
Utilisateur → AgentsView
  ↓
GET /api/agents/fleet
  ↓
Affichage flotte d'agents
  │
  ├── Statut de chaque agent
  ├── Tâches en cours
  └── Historique messages
  ↓
[Création orchestration]
  │
  └── POST /api/agents/orchestrate
      └── { agents: [...], task: "...", collaboration: "..." }
  ↓
[Surveillance temps réel]
  │
  └── WebSocket /live → événements agents
      └── Mise à jour UI automatique
```

---

#### 12.2.2. Configuration des paramètres

```
Utilisateur → SettingsView
  ↓
[Section Profil]
  │
  ├── GET /api/profile → chargement
  ├── POST /api/profile → sauvegarde
  └── POST /api/profile/theme → changement thème
      └── Mise à jour data-theme sur <html>
  ↓
[Section Clés API]
  │
  ├── GET /api/profile/gemini-keys → liste
  ├── POST /api/profile/gemini-keys → ajout (chiffré)
  ├── POST /api/profile/gemini-keys/test → test
  └── DELETE /api/profile/gemini-keys/:id → suppression
  ↓
[Section Apparence]
  │
  └── Sélection thème (dark/light/cyberpunk/sepia/high-contrast)
      └── Persistance dans .Leanna-profile.json
```

---

#### 12.2.3. Mode Sandbox

```
Utilisateur → n'importe quelle vue
  ↓
POST /api/sandbox/activate
  │
  ├── Vérification projet sélectionné
  └── Initialisation sandbox
      └── Copie projet vers .Leanna/sandbox/
  ↓
Mode sandbox actif
  │
  ├── Toutes opérations limitées à .Leanna/sandbox/
  ├── Badge "SANDBOX" dans barre de statut
  └── POST /api/sandbox/deactivate → sortie
```

---

#### 12.2.4. Workflows automatiques

```
Utilisateur → WorkflowsView
  ↓
GET /api/workflows → liste
  ↓
[Création]
  │
  ├── POST /api/workflows
  │   ├── Définition déclencheur (cron/event/manual)
  │   └── Définition actions
  └── POST /api/workflows/:id/enable → activation
  ↓
[Déclenchement]
  │
  ├── [cron] → Exécution par TaskScheduler
  ├── [event] → Déclenché par FileWatcher
  └── [manual] → POST /api/workflows/:id/trigger
  ↓
[Exécution]
  │
  ├── Chargement workflow Supabase
  ├── Exécution séquentielle actions
  └── Audit logging
```

---

### 12.3. Flux techniques

#### 12.3.1. Authentification WebSocket

```
Client → Connexion ws://localhost:5000/live
  │
  ├── Token URL: ?token=<Leanna_API_TOKEN>
  └── Ou Cookie: Leanna_token=<Leanna_API_TOKEN>
  ↓
Serveur (server.ts:648-671)
  │
  ├── Parsing cookies
  ├── Extraction token
  ├── Vérification via authenticateToken()
  │   └── Comparaison avec Leanna_API_TOKEN
  ├── Si invalide
  │   └── socket.write('HTTP/1.1 401...') + socket.destroy()
  └── Si valide
      └── wss.handleUpgrade() → connexion établie
  ↓
Client → Écoute messages
```

---

#### 12.3.2. Streaming des réponses

```
Client → POST /api/notebooks/:id/chat { stream: true }
  ↓
Serveur
  │
  ├── Ajout à activeGeminiSessions (Set)
  ├── getGeminiAI() → client du pool
  ├── Envoi requête à Google GenAI
  │   └── Utilisation clé courante du pool
  ├── Réception stream
  │   └── Pour chaque chunk
  │       └── Diffusion WebSocket /live
  └── Finalisation
      └── Retrait activeGeminiSessions
  ↓
Client
  │
  ├── Réception via onMessage()
  ├── [type === 'chat_chunk']
  │   ├── Accumulation chunks
  │   ├── Mise à jour message
  │   └── Animation typing
  └── [type === 'chat_complete']
      └── Finalisation
```

---

#### 12.3.3. Gestion des erreurs

```
[401 Unauthorized]
  │
  ├── Pas de token → "Configurez Leanna_API_TOKEN"
  └── Token invalide → "Token invalide"

[403 Forbidden]
  │
  ├── Path outside workspace → "Accès refusé: chemin hors workspace"
  └── Sandbox not active → "Activez le sandbox"

[429 Too Many Requests]
  │
  └── "Rate limit dépassé, réessayez dans X secondes"

[500 Internal Server Error]
  │
  ├── Dev → Affichage stacktrace
  └── Prod → Message générique + logging
```

---

### 12.4. États

#### 12.4.1. États globaux

| État | Description | Gestion |
|------|-------------|---------|
| no-project | Aucun projet | Modal sélection auto |
| loading | Chargement initial | Spinner + overlay |
| ready | Prêt | Interface normale |
| sandbox-active | Sandbox actif | Badge + restrictions |
| error | Erreur critique | Modal + reload |
| offline | Pas de connexion | Badge + mode dégradé |

#### 12.4.2. États par notebook

| État | Description | Gestion |
|------|-------------|---------|
| empty | Aucun message | EmptyState + suggestions |
| loading | Chargement | Skeleton messages |
| ready | Prêt | Affichage normal |
| generating | Génération | Animation typing + stop |
| error | Erreur | Message + retry |
| processing | Upload | Barre progression |

---

### 12.5. Navigation

**Routes** :
```
/
├── /login (si pas de projet)
├── / (dashboard)
├── /notebooks
│   ├── / (liste)
│   ├── /new
│   └── /:id
│       ├── /chat
│       ├── /sources
│       ├── /notes
│       └── /settings
├── /ide (éditeur complet)
├── /agents
│   ├── / (liste)
│   ├── /new
│   └── /:id
├── /knowledge (graphe)
├── /workflows
├── /settings
│   ├── /profile
│   ├── /appearance
│   ├── /keys
│   └── /advanced
├── /sandbox
└── /admin
    ├── /audit
    └── /logs
```

---

## 13. DIAGRAMMES DE FONCTIONNEMENT

### 13.1. Architecture globale

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ARCHITECTURE Leanna                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      CLIENT (Electron / Web)                           │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │   │
│  │  │              FRONTEND: React 18 + Vite 5 + Tailwind                 │  │   │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐  ┌──────────────┐  │  │   │
│  │  │  │  Views   │  │ Components│  │   Stores    │  │    Hooks    │  │  │   │
│  │  │  │ (10+)    │  │ (50+)    │  │ (Zustand)   │  │ (20+)      │  │  │   │
│  │  │  └──────────┘  └──────────┘  └──────────────┘  └──────────────┘  │  │   │
│  │  │  ┌─────────────────────────────────────────────────────────────┐ │  │   │
│  │  │  │  Services: api.ts, webSocket.ts, hooks/, utils/                │ │  │   │
│  │  │  └─────────────────────────────────────────────────────────────┘ │  │   │
│  │  └─────────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                          │
│                                    ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     BACKEND (Express + Node.js 20)                      │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │   │
│  │  │              server.ts: Configuration + Middleware                   │  │   │
│  │  │  - Rate Limiting (server/config/rateLimits.ts)                     │  │   │
│  │  │  - Authentification (server/security.ts)                            │  │   │
│  │  │  - Compression HTTP                                                 │  │   │
│  │  │  - Static files                                                    │  │   │
│  │  └─────────────────────────────────────────────────────────────────┘  │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │   │
│  │  │              ROUTES: 54 routeurs modulaires (/api/*)                 │  │   │
│  │  │  notebooks/, ide/, agents/, knowledge/, conversations/, etc.       │  │   │
│  │  └─────────────────────────────────────────────────────────────────┘  │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │   │
│  │  │              CORE SERVICES                                             │  │   │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │  │   │
│  │  │  │SkillManager  │  │AgentOrchestr.│  │NotebookMngr  │            │  │   │
│  │  │  └──────────────┘  └──────────────┘  └──────────────┘            │  │   │
│  │  │  ┌──────────────┐  ┌──────────────┐                                │  │   │
│  │  │  │KnowledgeGraph│  │KnowledgeIndex│                                │  │   │
│  │  │  └──────────────┘  └──────────────┘                                │  │   │
│  │  │  ┌──────────────┐  ┌──────────────┐                                │  │   │
│  │  │  │Runtime V2    │  │MCP Bridge    │                                │  │   │
│  │  │  └──────────────┘  └──────────────┘                                │  │   │
│  │  └─────────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                          │
│                                    ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     PERSISTANCE                                          │   │
│  │  ┌──────────────────────┐     ┌──────────────────┐                   │   │
│  │  │   SUPABASE (Cloud)    │     │   LOCAL (JSON)   │                   │   │
│  │  │  PostgreSQL 15+       │     │  .Leanna/        │                   │   │
│  │  │  - pgvector           │     │  - notebooks/    │                   │   │
│  │  │  - pg_trgm            │     │  - embeddings/   │                   │   │
│  │  │  - 6 tables           │     │  - backups/     │                   │   │
│  │  └──────────────────────┘     └──────────────────┘                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                          │
│                                    ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     SERVICES EXTERNES                                   │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                 │   │
│  │  │Google    │ │GitHub    │ │OpenRouter│ │Supabase  │                 │   │
│  │  │GenAI     │ │API v3    │ │API v1    │ │PostgreSQL│                 │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 13.2. Diagramme du flux de chat

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FLUX DE CHAT (NOTEBOOK)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                 │
│  │   CLIENT    │     │   SERVER    │     │   GEMINI    │                 │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘                 │
│         │                    │                   │                          │
│         │ POST /api/notebooks/:id/chat                          │                          │
│         │ { message, stream: true }                              │                          │
│         ▼                    ▼                   │                          │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    TRAITEMENT SERVEUR                               │   │
│  │                                                                  │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │   │
│  │  │ VALIDATION   │→ │ PRÉ-TRAIT.  │→ │ RAG         │             │   │
│  │  │              │  │              │  │ (optionnel) │             │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘             │   │
│  │                                                          │             │   │
│  │                          ┌───────────────────────────────────▼─────┐ │   │
│  │                          │              GÉNÉRATION                │ │   │
│  │                          │  ┌──────────┐ ┌──────────┐          │ │   │
│  │                          │  │ Key Pool │→│Google    │→ STREAM  │ │   │
│  │                          │  │          │ │GenAI     │          │ │   │
│  │                          │  └──────────┘ └──────────┘          │ │   │
│  │                          └──────────────────────────┬────────┘ │   │
│  │                                                      │             │   │
│  │                    ┌─────────────────────────────────▼────┐      │   │
│  │                    │       DIFFUSION WEBSOCKET /live        │      │   │
│  │                    │  ┌─────────────────────────────────┐  │      │   │
│  │                    │  │ Pour chaque chunk:              │  │      │   │
│  │                    │  │   wss.clients.forEach(client => │  │      │   │
│  │                    │  │     client.send(JSON.stringi... │  │      │   │
│  │                    │  └─────────────────────────────────┘  │      │   │
│  │                    └────────────────────────────────────────┘      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                          │
│         ┌──────────────────────────────────────┐                         │
│         ▼                                          │                         │
│  ┌─────────────────────────────────────────────┐                        │
│  │              RÉCEPTION CLIENT                                   │                        │
│  │  WebSocket /live → onmessage()                                   │                        │
│  │    [type === 'chat_chunk']                                      │                        │
│  │      ├── Accumulation chunks                                    │                        │
│  │      ├── appendChunkToMessage()                                 │                        │
│  │      ├── Animation typing                                       │                        │
│  │      └── Auto-scroll                                             │                        │
│  │    [type === 'chat_complete']                                   │                        │
│  │      ├── Affichage sources citées                              │                        │
│  │      └── Activation actions                                     │                        │
│  └─────────────────────────────────────────────┘                        │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 13.3. Diagramme du système de Skills

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SYSTÈME DE SKILLS                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    SkillManager (COEUR DU SYSTÈME)                       │   │
│  │  server/skills/SkillManager.ts                                                 │   │
│  │                                                                            │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐   │   │
│  │  │ SkillRegistry   │  │ SkillExecutor   │  │   MissionExecutor        │   │   │
│  │  │  - register()   │  │  - execute()     │  │   - executeMission()     │   │   │
│  │  │  - get()        │  │  - validate()   │  │   - registerDynSkills() │   │   │
│  │  └────────────────┘  └────────────────┘  └────────────────────────┘   │   │
│  │                                                                       │   │
│  │  CATEGORIES: File, Code, Search, Git, Agent, IDE, Browser, Terminal    │   │
│  │  System, Math, Date/Time, Notebooks, Conversations, Export             │   │
│  │                                                                       │   │
│  │  FLUX: Client → handleToolCall() → execute() → Google GenAI → Retour  │   │
│  │                                                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 13.4. Diagramme du système de Notebooks

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      SYSTÈME DE NOTEBOOKS                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    NotebookManager (GESTION)                            │   │
│  │  server/notebooks/NotebookManager.ts                                   │   │
│  │                                                                            │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                  │   │
│  │  │NotebookStore │ │SourceManager │ │ChatManager   │                  │   │
│  │  │- CRUD        │ │- add/remove  │ │- history      │                  │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘                  │   │
│  │                                                                       │   │
│  │  PROCESSING PIPELINE:                                              │   │
│  │    Upload → Queue (FIFO) → Ingest (extract + chunk + embed) → Save    │   │
│  │                                                                       │   │
│  │  CACHE: chatResponseCache, ragSearchCache (TTL: 1h)                   │   │
│  │                                                                       │   │
│  │  PERSISTANCE: .Leanna/notebooks/<uuid>.json + embeddings/            │   │
│  │  BACKUP: BackupService → backup-<timestamp>/ (automatique)            │   │
│  │                                                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 13.5. Diagramme du Runtime V2

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RUNTIME V2 (NOUVEAU)                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Runtime Core: ToolRegistry + EventBus + Observability + AgentRegistry │   │
│  │                                                                            │   │
│  │  MIRROR: SkillManager → ToolRegistry (server.ts:231-276)                │   │
│  │    setTimeout 3s → Attendre init async SkillManager                     │   │
│  │    Pour chaque skill: register dans ToolRegistry avec handler        │   │
│  │                                                                            │   │
│  │  NOUVELLES FONCTIONNALITÉS:                                         │   │
│  │    - Agents V2 avec orchestration avancée                            │   │
│  │    - EventBus pour communication inter-outils                         │   │
│  │    - Observability intégrée (métriques)                              │   │
│  │                                                                            │   │
│  │  API ROUTES V2:                                                      │   │
│  │    GET  /api/v2/agents         → Liste agents V2                       │   │
│  │    POST /api/v2/agents/:name  → Exécuter agent V2                     │   │
│  │    GET  /api/v2/metrics        → Toutes les métriques                 │   │
│  │    GET  /api/v2/metrics/agents → Métriques agents                     │   │
│  │    GET  /api/v2/metrics/tools  → Métriques outils                     │   │
│  │                                                                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 13.6. Légende

| Symbole | Signification |
|--------|---------------|
| `┌─────┐` | Début/Fin de composant |
| `│` | Lien vertical |
| `─` | Lien horizontal |
| `└───┘` | Coin |
| `→` | Flux de données |
| `✅` | Implémenté |
| `❌` | Non implémenté |
| `⚠️` | Partiel |

---

## 📚 RÉFÉRENCES

**Fichiers analysés** :
- `src/main.tsx` (point d'entrée)
- `src/views/` (toutes les vues)
- `src/components/` (tous les composants)
- `server.ts` (initialisation)
- `server/routes/` (toutes les routes)
- `server/skills/` (SkillManager)
- `server/notebooks/` (NotebookManager)
- `server/runtime/` (Runtime V2)

---

## 🎯 SYNTHÈSE FINALE

### Résumé du rapport complet

**Partie 1** : Vue générale + Architecture technique
- Type: Application desktop/propriétaire
- Stack: Electron + React 18 + Vite 5 + Express + PostgreSQL + Google GenAI
- Architecture: Client-Serveur modulaire
- 260+ fichiers server, 50+ routes API

**Partie 2** : Fonctionnalités + UI/UX + Composants + Logique métier
- 50+ fonctionnalités détaillées
- 20+ écrans identifiés
- 50+ composants analysés
- Logique métier complète (skills, agents, notebooks)

**Partie 3A** : Base de données + API
- Architecture hybride (Cloud + Local)
- 6 tables Supabase + persistance JSON
- 150+ endpoints REST + 2 WebSocket

**Partie 3B** : Sécurité + Performance
- Authentification token API
- Chiffrement AES-256-GCM
- Sandboxing complet
- Optimisations multi-niveaux

**Partie 3C** : Design System
- Tokens CSS standardisés
- 5 thèmes disponibles
- 12 composants UI
- Plan de migration détaillé

**Partie 3D** : Flux utilisateur + Diagrammes
- Parcours principaux et secondaires
- Flux techniques détaillés
- 5 diagrammes architecturaux

---

**Statut** : ✅ **RAPPORT COMPLET**

*Fin du rapport technique Leanna - Toutes les sections sont maintenant disponibles.*
