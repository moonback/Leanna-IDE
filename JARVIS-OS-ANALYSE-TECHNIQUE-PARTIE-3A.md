# JARVIS-OS - ANALYSE TECHNIQUE COMPLÈTE - PARTIE 3A

**Date** : 28 août 2026  
**Version** : 1.0.0  
**Périmètre** : Base de données + API  

---

## 7. ANALYSE DE LA BASE DE DONNÉES

### 7.1. Architecture de persistance

**Deux systèmes complémentaires** :

#### 7.1.1. Cloud (Supabase PostgreSQL)
- PostgreSQL 15+ avec extensions `pgvector` (embeddings) et `pg_trgm` (recherche textuelle)
- Row-Level Security (RLS) activé sur toutes les tables
- 5 schémas SQL définis dans `supabase/`

**Fichiers** :
```
supabase/
├── supabase_schema.sql          # memories, lists
├── conversations_schema.sql     # conversations, messages
├── workflows_schema.sql         # workflows
├── scheduled_tasks_schema.sql   # tâches planifiées
├── custom_skills_schema.sql     # skills personnalisées
└── migrations/                  # migrations versionnées
```

#### 7.1.2. Local (JSON Filesystem)
- Stockage dans `.jarvis/` à la racine du projet
- Format JSON avec UUIDv4 comme identifiants
- Backup automatique avec versioning

**Structure** :
```
.jarvis/
├── .jarvis-profile.json          # Profil utilisateur
├── lastProject.json             # Dernier projet
├── ProjectKnowledge.json        # Connaissances indexées
├── ProjectMemory.json           # Mémoire du projet
├── documents.json               # Index des documents
└── notebooks/
    ├── <uuid>.json              # Métadonnées
    ├── embeddings/
    │   └── <uuid>.json          # Vecteurs
    └── backups/
        ├── backup-<timestamp>/
        │   ├── <uuid>.json
        │   ├── embeddings/
        │   └── _metadata.json
        └── _last-timestamps.json
```

---

### 7.2. Schémas Supabase détaillés

#### Table `memories`
| Champ | Type | Contraintes |
|-------|------|-------------|
| id | UUID PK | DEFAULT gen_random_uuid() |
| content | TEXT | NOT NULL |
| tags | TEXT[] | DEFAULT '{}'::text[] |
| embedding | vector(768) | Pour RAG |
| created_at | TIMESTAMPTZ | DEFAULT now() |
| updated_at | TIMESTAMPTZ | Trigger auto-update |

**Index** : `memories_content_idx` (GIN sur content avec gin_trgm_ops)  
**RLS** : Accès complet pour `service_role`  
**Fonction** : `match_memories(query_embedding, threshold, count)` → retourne id, content, similarity

---

#### Table `conversations`
| Champ | Type | Contraintes |
|-------|------|-------------|
| id | UUID PK | DEFAULT gen_random_uuid() |
| title | TEXT | - |
| summary | TEXT | - |
| started_at | TIMESTAMPTZ | DEFAULT now() |
| ended_at | TIMESTAMPTZ | - |
| message_count | INTEGER | DEFAULT 0 |
| created_at | TIMESTAMPTZ | DEFAULT now() |

**RLS** : Accès complet pour `service_role`

**Table `conversation_messages`** :
| Champ | Type | Contraintes |
|-------|------|-------------|
| id | UUID PK | DEFAULT gen_random_uuid() |
| conversation_id | UUID FK | REFERENCES conversations(id) ON DELETE CASCADE |
| role | TEXT | CHECK (role IN ('user', 'assistant')) |
| content | TEXT | NOT NULL |
| created_at | TIMESTAMPTZ | DEFAULT now() |

**Index** : `idx_conversation_messages_conversation_id`, `idx_conversation_messages_content_search` (GIN)  
**Fonction** : `search_conversations(search_query, result_limit)` → recherche full-text

---

#### Table `lists`
| Champ | Type | Contraintes |
|-------|------|-------------|
| id | UUID PK | DEFAULT gen_random_uuid() |
| name | TEXT | NOT NULL |
| name_lower | TEXT | NOT NULL, UNIQUE |
| items | JSONB | DEFAULT '[]'::jsonb |
| created_at | TIMESTAMPTZ | DEFAULT now() |
| updated_at | TIMESTAMPTZ | DEFAULT now() |

**Index** : `lists_name_lower_unique`, `lists_updated_at_idx`  
**RLS** : Accès complet pour `service_role`

---

#### Table `workflows`
| Champ | Type | Contraintes |
|-------|------|-------------|
| id | UUID PK | DEFAULT gen_random_uuid() |
| name | TEXT | NOT NULL |
| description | TEXT | - |
| trigger_type | TEXT | NOT NULL |
| trigger_config | JSONB | DEFAULT '{}'::jsonb |
| actions | JSONB | DEFAULT '[]'::jsonb |
| is_active | BOOLEAN | DEFAULT true |
| created_at | TIMESTAMPTZ | DEFAULT now() |
| updated_at | TIMESTAMPTZ | DEFAULT now() |

---

#### Table `scheduled_tasks`
| Champ | Type | Contraintes |
|-------|------|-------------|
| id | UUID PK | DEFAULT gen_random_uuid() |
| name | TEXT | NOT NULL |
| task_type | TEXT | NOT NULL |
| cron_expression | TEXT | NOT NULL |
| config | JSONB | DEFAULT '{}'::jsonb |
| is_active | BOOLEAN | DEFAULT true |
| created_at | TIMESTAMPTZ | DEFAULT now() |

---

#### Table `custom_skills`
| Champ | Type | Contraintes |
|-------|------|-------------|
| id | UUID PK | DEFAULT gen_random_uuid() |
| name | TEXT | NOT NULL UNIQUE |
| description | TEXT | - |
| prompt | TEXT | NOT NULL |
| parameters | JSONB | DEFAULT '{}'::jsonb |
| icon | TEXT | - |
| category | TEXT | - |
| is_active | BOOLEAN | DEFAULT true |
| created_at | TIMESTAMPTZ | DEFAULT now() |
| updated_at | TIMESTAMPTZ | DEFAULT now() |

---

### 7.3. Relations entre tables

```
┌─────────────────────────────────────────────────────────┐
│  Supabase Database Schema                                 │
├─────────────────────────────────────────────────────────┤
│                                                             │
│  memories──┬─────────────┬─────────────┬────────lists    │
│           │             │             │                 │
│  conversations─┬──────────conversation_messages            │
│                (ON DELETE CASCADE)                         │
│                                                             │
│  workflows─────scheduled_tasks─────custom_skills           │
│                                                             │
└─────────────────────────────────────────────────────────┘
```

---

### 7.4. Persistance locale JSON

#### Notebooks
**Fichier** : `.jarvis/notebooks/<uuid>.json`
```json
{
  "id": "uuid",
  "name": "Nom",
  "description": "Description",
  "createdAt": "ISODate",
  "updatedAt": "ISODate",
  "config": { "model": "gemini-2.0", "temperature": 0.7 },
  "sources": [{ "id": "src-001", "fileName": "doc.pdf", "chunks": [...] }],
  "chatHistory": [],
  "notes": []
}
```

#### Embeddings
**Fichier** : `.jarvis/notebooks/embeddings/<uuid>.json`
```json
{
  "notebookId": "uuid",
  "sourceId": "src-001",
  "embeddings": [
    { "chunkId": "chunk-001", "vector": [0.123,...,0.789], "text": "..." }
  ],
  "model": "text-embedding-004",
  "dimension": 768
}
```

#### Backup automatique
**Service** : `server/notebooks/BackupService.ts`
- Backup périodique automatique
- Sauvegarde incrémentale
- Conservation de N versions
- Structure : `backup-<timestamp>/<notebook>.json + embeddings/`

---

### 7.5. Cache et optimisation

#### ResponseCache (`server/notebooks/ResponseCache.ts`)
- `chatResponseCache` : Cache des réponses chat (TTL: 1h)
- `ragSearchCache` : Cache des recherches RAG (TTL: 1h)
- Invalidation automatique lors d'ajout de sources
- Clé : notebookId + queryHash

#### ProcessingQueue (`server/notebooks/ProcessingQueue.ts`)
- Traitement asynchrone des uploads
- Queue FIFO avec priorités
- maxConcurrency: 3
- Notification de progression en temps réel

---

### 7.6. Indexation et recherche

#### KnowledgeGraph (`server/knowledge/KnowledgeGraph.ts`)
- Indexation automatique des fichiers du workspace
- Extraction des entités (classes, fonctions, variables)
- Construction d'un graphe de dépendances

**Fichier** : `.jarvis/ProjectKnowledge.json`
```json
{
  "projectRoot": "/path/to/project",
  "totalFiles": 150,
  "totalEntities": 450,
  "entities": { "classes": [...], "functions": [...] },
  "dependencies": { "fileA.ts": ["fileB.ts"] }
}
```

#### ProjectMemory (`server/knowledge/ProjectMemory.ts`)
- Stockage des mémoires du projet
- Embeddings pour recherche sémantique
- Intégration avec Supabase possible

---

### 7.7. Sécurité des données

#### Chiffrement (`server/utils/crypto.ts`)
**Algorithmes** :
1. **AES-256-GCM** (recommandé) : Format `gcm:<iv_hex>:<tag_hex>:<ciphertext_hex>`
2. **AES-256-CBC** (rétrocompatibilité) : Format `<iv_hex>:<ciphertext_hex>`

**Génération clé** :
```typescript
function getMasterKey(): Buffer {
  const envKey = process.env.JARVIS_MASTER_KEY || '';
  const machineSeed = `${os.hostname()}-${os.platform()}-${os.userInfo().username}`;
  return crypto.createHash('sha256').update(envKey + machineSeed).digest();
}
```

**Variables chiffrées dans .env** :
```
JARVIS_API_TOKEN, GEMINI_API_KEY, SUPABASE_URL, 
SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY, GITHUB_TOKEN
```

#### Validation des chemins (`server/security.ts`)
```typescript
function resolveWorkspacePath(requestedPath: string, workspaceRoot: string) {
  const absolutePath = path.resolve(workspaceRoot, requestedPath);
  const normalizedRoot = path.resolve(workspaceRoot);
  const normalizedTarget = path.resolve(absolutePath);
  
  if (!normalizedTarget.startsWith(normalizedRoot + path.sep)) {
    return { ok: false, status: 403, error: 'Path outside workspace' };
  }
  return { ok: true, absolutePath: normalizedTarget };
}
```

---

### 7.8. Résumé

| Catégorie | Type | Localisation | Format | Taille |
|----------|------|--------------|--------|--------|
| Mémoires | Cloud | Supabase | PostgreSQL | Variable |
| Conversations | Cloud | Supabase | PostgreSQL | Variable |
| Lists | Cloud | Supabase | PostgreSQL | Variable |
| Workflows | Cloud | Supabase | PostgreSQL | Variable |
| Skills | Cloud | Supabase | PostgreSQL | Variable |
| Notebooks | Local | `.jarvis/notebooks/` | JSON | 1-10MB/nb |
| Embeddings | Local | `.jarvis/embeddings/` | JSON | 10-100MB/nb |
| Knowledge | Local | `.jarvis/` | JSON | 1-5MB |
| Profil | Local | `.jarvis-profile.json` | JSON | ~1KB |

---

## 8. ANALYSE DES API

### 8.1. Architecture générale

- **Type** : REST API + WebSocket
- **Base URL** : `/api`
- **Format** : JSON
- **Authentification** : Token API (`JARVIS_API_TOKEN`)
- **CORS** : Désactivé (accès local uniquement)
- **Rate Limiting** : `server/config/rateLimits.ts`

---

### 8.2. Middleware et sécurité

#### Authentification (`server/security.ts`)
```typescript
function authenticateRequest(req: { headers?: Record<string, string> }, 
  options: AuthOptions): AuthResult
```
- Header requis : `x-jarvis-token`
- Cookie alternative : `jarvis_token`
- Token query param : `token` (pour WebSocket)
- Si `JARVIS_API_TOKEN` non configuré → accès autorisé
- Sinon → vérification du token

**Application** :
```typescript
// Dans server.ts
app.use("/api", requireAuth); // TOUTES les routes /api/* SAUF /api/health
app.use("/api/health", healthRouter); // Avant requireAuth
```

#### Rate Limiting (`server/config/rateLimits.ts`)
| Route | Limite | Fenêtre | Type |
|-------|--------|---------|------|
| `/api/notebooks/:id/chat` | 10 req/min | 60s | Par notebook |
| `/api/notebooks/:id/embeddings/reindex` | 5 req/min | 60s | Par notebook |
| `/api/notebooks/:id/sources/upload` | 5 req/min | 60s | Par notebook |
| Global (dev) | 100 req/min | 60s | Par IP |
| Global (prod) | 1000 req/min | 60s | Par IP |

---

### 8.3. Liste complète des endpoints

#### 8.3.1. Système (2 endpoints)
| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/health` | Santé du serveur | ❌ |
| GET | `/api/health/db` | Santé BDD | ✅ |

---

#### 8.3.2. Profil et Configuration (10 endpoints)
| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/profile` | Récupérer profil | ✅ |
| POST | `/api/profile` | Mettre à jour profil | ✅ |
| GET | `/api/profile/themes` | Liste thèmes | ✅ |
| POST | `/api/profile/theme` | Changer thème | ✅ |
| GET | `/api/profile/gemini-keys` | Liste clés | ✅ |
| POST | `/api/profile/gemini-keys` | Ajouter clé | ✅ |
| DELETE | `/api/profile/gemini-keys/:id` | Supprimer clé | ✅ |
| POST | `/api/profile/gemini-keys/test` | Tester clé | ✅ |

---

#### 8.3.3. Workspace et Projet (15 endpoints)
| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/workspace/tree` | Arbre workspace | ✅ |
| GET | `/api/workspace/file` | Lire fichier | ✅ |
| POST | `/api/workspace/file` | Sauvegarder fichier | ✅ |
| DELETE | `/api/workspace/file` | Supprimer fichier | ✅ |
| POST | `/api/workspace/create-file` | Créer fichier | ✅ |
| POST | `/api/workspace/create-folder` | Créer dossier | ✅ |
| GET | `/api/workspace/search` | Recherche | ✅ |
| POST | `/api/workspace/rename` | Renommer | ✅ |

---

#### 8.3.4. Self-Root / Projet (5 endpoints)
| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/self-root` | Projet actuel | ✅ |
| GET | `/api/self-root/list` | Lister projets | ✅ |
| POST | `/api/self-root/change` | Changer projet | ✅ |
| POST | `/api/self-root/create` | Créer projet | ✅ |
| DELETE | `/api/self-root/remove` | Retirer projet | ✅ |

---

#### 8.3.5. Notebooks (20+ endpoints)
**Fichier** : `server/routes/notebooks/index.ts` (12 routeurs modulaires)

| Méthode | Endpoint | Description | Auth | RL |
|---------|----------|-------------|------|----|
| GET | `/api/notebooks` | Lister | ✅ | ❌ |
| POST | `/api/notebooks` | Créer | ✅ | ❌ |
| GET | `/api/notebooks/:id` | Récupérer | ✅ | ❌ |
| PUT | `/api/notebooks/:id` | Mettre à jour | ✅ | ❌ |
| DELETE | `/api/notebooks/:id` | Supprimer | ✅ | ❌ |
| GET | `/api/notebooks/:id/chat` | Historique | ✅ | 10/min |
| POST | `/api/notebooks/:id/chat` | Envoyer message | ✅ | 10/min |
| GET | `/api/notebooks/:id/sources` | Lister sources | ✅ | ❌ |
| POST | `/api/notebooks/:id/sources/upload` | Uploader | ✅ | 5/min |
| DELETE | `/api/notebooks/:id/sources/:id` | Supprimer | ✅ | ❌ |
| POST | `/api/notebooks/:id/embeddings/reindex` | Réindexer | ✅ | 5/min |
| GET | `/api/notebooks/:id/notes` | Lister notes | ✅ | ❌ |
| POST | `/api/notebooks/:id/notes` | Ajouter note | ✅ | ❌ |
| GET | `/api/notebooks/:id/export` | Exporter | ✅ | ❌ |

Routeurs modulaires : notebooksCrudRouter, sourcesRouter, chatRouter, notesRouter, contentRouter, audioRouter, embeddingsRouter, queueRouter, cacheRouter, backupRouter

---

#### 8.3.6. IDE (25+ endpoints)
**Fichier** : `server/routes/ide.ts`

| Méthode | Endpoint | Description | Auth | RL |
|---------|----------|-------------|------|----|
| GET | `/api/ide/tree` | Arbre (respecte sandbox) | ✅ | ❌ |
| GET | `/api/ide/tree-workspace` | Arbre réel | ✅ | ❌ |
| GET | `/api/ide/file` | Lire fichier | ✅ | ❌ |
| GET | `/api/ide/file-raw` | Lire binaire | ✅ | ❌ |
| POST | `/api/ide/file` | Sauvegarder | ✅ | ❌ |
| POST | `/api/ide/create-file` | Créer fichier | ✅ | ❌ |
| POST | `/api/ide/create-folder` | Créer dossier | ✅ | ❌ |
| POST | `/api/ide/rename` | Renommer | ✅ | ❌ |
| DELETE | `/api/ide/file` | Supprimer | ✅ | ❌ |
| GET | `/api/ide/search` | Recherche | ✅ | ❌ |
| POST | `/api/ide/execute-terminal` | Terminal | ✅ | ❌ |
| GET | `/api/ide/terminal-history` | Historique | ✅ | ❌ |
| GET/POST | `/api/ide/git/*` | Git | ✅ | ❌ |

**Note** : Git est **désactivé** dans la version actuelle (retourne 404)

---

#### 8.3.7. Agents (15 endpoints)
**Fichier** : `server/routes/agents.ts`

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/agents/status` | Statut | ✅ |
| GET | `/api/agents/tasks` | Lister tâches | ✅ |
| GET | `/api/agents/roles` | Lister rôles | ✅ |
| GET | `/api/agents/fleet` | Statut flotte | ✅ |
| POST | `/api/agents/delegate` | Déléguer | ✅ |
| POST | `/api/agents/execute` | Exécuter | ✅ |
| GET | `/api/agents/bus/metrics` | Métriques bus | ✅ |
| GET | `/api/agents/bus/history` | Historique | ✅ |
| GET | `/api/agents/collaboration/patterns` | Patterns | ✅ |
| POST | `/api/agents/orchestrate` | Orchestrer | ✅ |
| GET | `/api/agents/persistence` | Statut persistance | ✅ |

---

#### 8.3.8. Knowledge (10 endpoints)
**Fichiers** : `server/routes/knowledge/`

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/knowledge/memories` | Lister mémoires | ✅ |
| POST | `/api/knowledge/memories` | Ajouter | ✅ |
| GET | `/api/knowledge/memories/search` | Recherche | ✅ |
| DELETE | `/api/knowledge/memories/:id` | Supprimer | ✅ |
| GET | `/api/knowledge/graph` | Graphe | ✅ |
| GET | `/api/knowledge/graph/entities` | Entités | ✅ |
| GET | `/api/knowledge/graph/dependencies` | Dépendances | ✅ |
| GET | `/api/knowledge/impact` | Analyse impact | ✅ |
| GET | `/api/knowledge/understanding` | Compréhension | ✅ |

---

#### 8.3.9. Conversations (8 endpoints)
**Fichier** : `server/routes/conversations.ts`

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/conversations` | Lister | ✅ |
| POST | `/api/conversations` | Créer | ✅ |
| GET | `/api/conversations/:id` | Récupérer | ✅ |
| DELETE | `/api/conversations/:id` | Supprimer | ✅ |
| GET | `/api/conversations/:id/messages` | Messages | ✅ |
| POST | `/api/conversations/:id/messages` | Ajouter | ✅ |

---

#### 8.3.10. Skills (10 endpoints)
**Fichier** : `server/routes/skills.ts`

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/skills` | Lister | ✅ |
| GET | `/api/skills/categories` | Catégories | ✅ |
| GET | `/api/skills/:name` | Récupérer | ✅ |
| POST | `/api/skills/:name/execute` | Exécuter | ✅ |

---

#### 8.3.11. Custom Skills (8 endpoints)
**Fichier** : `server/routes/custom-skills.ts`

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/custom-skills` | Lister | ✅ |
| POST | `/api/custom-skills` | Créer | ✅ |
| GET | `/api/custom-skills/:id` | Récupérer | ✅ |
| PUT | `/api/custom-skills/:id` | Mettre à jour | ✅ |
| DELETE | `/api/custom-skills/:id` | Supprimer | ✅ |
| POST | `/api/custom-skills/:id/test` | Tester | ✅ |

---

#### 8.3.12. Workflows (8 endpoints)
**Fichier** : `server/routes/workflows.ts`

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/workflows` | Lister | ✅ |
| POST | `/api/workflows` | Créer | ✅ |
| GET | `/api/workflows/:id` | Récupérer | ✅ |
| PUT | `/api/workflows/:id` | Mettre à jour | ✅ |
| DELETE | `/api/workflows/:id` | Supprimer | ✅ |
| POST | `/api/workflows/:id/trigger` | Déclencher | ✅ |
| POST | `/api/workflows/:id/enable` | Activer | ✅ |
| POST | `/api/workflows/:id/disable` | Désactiver | ✅ |

---

#### 8.3.13. Automation (5 endpoints)
**Fichier** : `server/routes/automation.ts`

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/automation/tasks` | Lister | ✅ |
| POST | `/api/automation/tasks` | Créer | ✅ |
| DELETE | `/api/automation/tasks/:id` | Supprimer | ✅ |
| POST | `/api/automation/tasks/:id/enable` | Activer | ✅ |
| POST | `/api/automation/tasks/:id/disable` | Désactiver | ✅ |

---

#### 8.3.14. Browser (8 endpoints)
**Fichier** : `server/routes/browser.ts`

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| POST | `/api/browser/navigate` | Naviguer | ✅ |
| POST | `/api/browser/read-content` | Lire contenu | ✅ |
| POST | `/api/browser/content-result` | Callback | ✅ |
| POST | `/api/browser/action` | Action | ✅ |
| POST | `/api/browser/action-result` | Callback | ✅ |
| POST | `/api/browser/screenshot` | Capture | ✅ |
| POST | `/api/browser/close` | Fermer | ✅ |

---

#### 8.3.15. Sandbox (6 endpoints)
**Fichier** : `server/routes/sandbox.ts`

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/sandbox/status` | Statut | ✅ |
| POST | `/api/sandbox/activate` | Activer | ✅ |
| POST | `/api/sandbox/deactivate` | Désactiver | ✅ |
| POST | `/api/sandbox/init` | Initialiser | ✅ |
| GET | `/api/sandbox/tree` | Arbre | ✅ |
| POST | `/api/sandbox/file` | Manipuler | ✅ |

---

#### 8.3.16. Export (6 endpoints)
**Fichier** : `server/routes/export.ts`

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| POST | `/api/export/html` | HTML | ✅ |
| POST | `/api/export/docx` | DOCX | ✅ |
| POST | `/api/export/pdf` | PDF | ✅ |
| POST | `/api/export/markdown` | Markdown | ✅ |
| GET | `/api/export/status` | Statut | ✅ |

---

#### 8.3.17-8.3.29. Autres endpoints (50+)

| Catégorie | Endpoints | Fichier |
|----------|-----------|--------|
| GitHub | 6 | `server/routes/github.ts` |
| MCP | 5 | `server/routes/mcp.ts` |
| Lists | 8 | `server/routes/lists.ts` |
| Safeguards | 5 | `server/routes/safeguards.ts` |
| OpenRouter | 4 | `server/routes/openrouter.ts` |
| Tokens | 3 | `server/routes/tokens-optimization.ts` |
| Summarize | 3 | `server/routes/summarize-context.ts` |
| Checkpoint | 5 | `server/routes/checkpoint.ts` |
| Agent Builder | 3 | `server/routes/agent-builder.ts` |
| Custom Agents | 5 | `server/routes/custom-agents.ts` |
| TTS | 5 | `server/routes/tts.ts` |
| Upload Document | 2 | `server/routes/upload-document.ts` |
| Documents | 4 | `server/routes/documents.ts` |
| Memories | 5 | `server/routes/memories.ts` |
| Audit | 4 | `server/routes/audit.ts` |
| Runtime V2 | 5 | `server/runtime/routes/` |

---

### 8.4. WebSocket Endpoints

| Endpoint | Description | Protocole | Auth |
|----------|-------------|-----------|------|
| `/live` | Communication temps réel (Gemini Live) | WebSocket | ✅ |
| `/sandbox-watch` | Surveillance fichiers sandbox | WebSocket | ✅ |

**Fichier** : `server/live/LiveSocketHandler.ts`

**Fonctionnalités** :
- Diffusion des événements agents
- Diffusion des événements missions
- Gestion des sessions Gemini actives
- Streaming des réponses en temps réel
- Notifications de progression

---

### 8.5. Format des réponses

**Succès** :
```json
{ "status": "success", "data": {...}, "timestamp": "ISODate" }
```

**Erreur** :
```json
{ "error": "Description", "status": 400, "timestamp": "ISODate" }
```

**Erreur 500 (dev)** :
```json
{
  "error": "Erreur interne",
  "details": "Message",
  "stack": ["ligne 1", "ligne 2", ...]
}
```

---

### 8.6. Gestion des erreurs globale

**Middleware** dans `server.ts` (ligne 489-501) :
```typescript
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (res.headersSent) return;
  const status = err.status || err.statusCode || 500;
  const msg = err.message || String(err);
  console.error(`[HTTP ${status}] ${msg}`);
  if (err.stack) console.error(err.stack);
  res.status(status).json({
    error: status === 500 ? "Erreur interne du serveur." : msg,
    ...(process.env.NODE_ENV !== "production" ? 
      { details: msg, stack: err.stack?.split("\n").slice(0, 6) } : {}),
  });
});
```

---

### 8.7. Statistiques

**Total endpoints REST** : 150+ (54 fichiers × ~3 endpoints/fichier)  
**Total endpoints WebSocket** : 2  
**Total endpoints Runtime V2** : 5  
**Total routes Express** : 175+

**Par catégorie** :
- Système : 2
- Profil/Config : 10
- Workspace/Projet : 20
- Notebooks : 20+
- IDE : 25+
- Agents : 15
- Knowledge : 10
- Conversations : 6
- Skills : 10
- Custom Skills : 8
- Automation : 5
- Browser : 8
- Export : 6
- GitHub : 6
- MCP : 5
- Lists : 8
- Safeguards : 5
- OpenRouter : 4
- Tokens : 3
- Summarize : 3
- Checkpoint : 5
- Agent Builder : 3
- Custom Agents : 5
- TTS : 5
- Upload Document : 2
- Documents : 4
- Memories : 5
- Audit : 4
- Runtime V2 : 5

---

*Fin de la Partie 3A - Suite : PARTIE-3B (Sécurité + Performance)*
