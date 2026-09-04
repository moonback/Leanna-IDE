# API Reference — Leanna

## Authentification

Toutes les routes `/api/*` (sauf `GET /api/health`) requièrent le header suivant :

```
x-leanna-token: <Leanna_API_TOKEN>
```

Le token est défini dans `.env` (ou auto-généré au premier démarrage). La comparaison est effectuée en temps constant (`crypto.timingSafeEqual`) pour prévenir les timing attacks.

Les WebSockets `/live` et `/sandbox-watch` valident le token via le **cookie** `Leanna_token`, posé automatiquement par le premier appel REST authentifié.

**Codes HTTP communs :**

| Code | Signification |
|---|---|
| `200` | Succès |
| `202` | Accepté (tâche asynchrone démarrée) |
| `400` | Requête invalide (paramètre manquant ou malformé) |
| `401` | Non authentifié |
| `403` | Accès refusé (chemin hors workspace, code sandbox incorrect) |
| `404` | Ressource introuvable |
| `409` | Conflit (fichier déjà existant) |
| `429` | Trop de requêtes (rate limit) |
| `500` | Erreur interne serveur |
| `503` | Service indisponible (sandbox non prêt, Supabase non configuré) |

---

## Domaines fonctionnels

- [Santé](#santé)
- [IDE — Système de fichiers](#ide--système-de-fichiers)
- [Sandbox](#sandbox)
- [Agents](#agents)
- [Workflows](#workflows)
- [Conversations](#conversations)
- [Mémoires](#mémoires)
- [Compétences (Skills)](#compétences-skills)
- [Git / GitHub](#git--github)
- [Profil & Tokens](#profil--tokens)
- [Notebooks (RAG)](#notebooks-rag)
- [Documents](#documents)
- [Automatisation](#automatisation)
- [Terminal](#terminal)
- [Knowledge Graph](#knowledge-graph)
- [Audit](#audit)
- [MCP](#mcp)
- [Export](#export)
- [FTP](#ftp)
- [Marketplace](#marketplace)
- [WebSockets](#websockets)

---

## Santé

### `GET /api/health`

Vérifie que le serveur est opérationnel. Seule route ne nécessitant **pas** d'authentification.

**Authentification :** Non

**Réponse 200 :**
```json
{ "status": "ok" }
```

---

## IDE — Système de fichiers

Toutes les opérations de lecture/écriture sont contraintes au workspace actif (sandbox ou workspace principal). Toute tentative d'accès hors de la racine retourne `403`.

### `GET /api/ide/tree`

Retourne l'arborescence du workspace actif (sandbox si actif, sinon workspace principal). Exclut `node_modules`, `.git`, `dist`, `build`, `out`. **Supporte la pagination côté serveur pour les workspaces avec > 10k fichiers.**

**Authentification :** Oui

**Query Parameters :**
| Paramètre | Type | Description | Obligatoire |
|---|---|---|---|
| `path` | string | Chemin relatif du répertoire à lister (par défaut : racine du workspace) | Non |
| `page` | number | Numéro de la page (début à 1) | Non |
| `pageSize` | number | Nombre d'entrées par page (0 = pas de pagination) | Non |

**Réponse 200 :**
```json
{
  "path": "/absolute/path/to/directory",
  "entries": [
    {
      "name": "src",
      "path": "src",
      "type": "directory",
      "children": []
    },
    {
      "name": "package.json",
      "path": "package.json",
      "type": "file"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 100,
    "total": 150,
    "totalPages": 2,
    "hasMore": true
  }
}
```

**Notes :**
- Lorsque `pageSize` > 0, seul le niveau de répertoire spécifié est retourné (les dossiers ont `children: []`)
- Pour accéder aux sous-éléments, faites des requêtes supplémentaires avec le paramètre `path`
- Si aucun paramètre de pagination n'est fourni et que le répertoire contient > 10 000 entrées, une limite de sécurité de 10 000 est appliquée automatiquement
- Le champ `pagination` n'est présent que lorsque la pagination est active

---

### `GET /api/ide/tree-workspace`

Retourne l'arborescence du workspace **principal** (ignore le sandbox). Exclut également `.Leanna`.

**Authentification :** Oui

**Réponse 200 :** Même format que `/api/ide/tree`.

---

### `GET /api/ide/file`

Lit le contenu d'un fichier texte.

**Authentification :** Oui

**Query params :**

| Nom | Type | Requis | Description |
|---|---|---|---|
| `path` | `string` | ✅ | Chemin relatif au workspace |

**Réponse 200 :**
```json
{ "path": "src/main.tsx", "content": "import React..." }
```

**Erreurs :** `400` si `path` absent · `403` hors workspace · `404` fichier introuvable

---

### `GET /api/ide/file-raw`

Sert un fichier **binaire** (image, PDF…) avec le bon `Content-Type`. Cache `public, max-age=3600`.

**Authentification :** Oui

**Query params :** Même que `/api/ide/file`.

**Réponse 200 :** Contenu binaire avec header `Content-Type` adapté à l'extension.

---

### `POST /api/ide/file`

Sauvegarde le contenu d'un fichier (crée les dossiers parents si nécessaire). Enregistre un événement d'audit.

**Authentification :** Oui

**Body :**
```json
{ "path": "src/utils/helper.ts", "content": "export const foo = () => {};" }
```

| Champ | Type | Requis | Description |
|---|---|---|---|
| `path` | `string` | ✅ | Chemin relatif au workspace |
| `content` | `string` | ❌ | Contenu du fichier (vide si absent) |

**Réponse 200 :**
```json
{ "status": "success", "path": "src/utils/helper.ts", "sandbox": true }
```

---

### `POST /api/ide/create-file`

Crée un fichier vide.

**Authentification :** Oui

**Body :**
```json
{ "path": "src/new-file.ts" }
```

**Réponse 200 :**
```json
{ "status": "success", "path": "src/new-file.ts" }
```

---

### `POST /api/ide/create-directory`

Crée un dossier (récursif).

**Authentification :** Oui

**Body :**
```json
{ "path": "src/components/new-feature" }
```

**Réponse 200 :**
```json
{ "status": "success", "path": "src/components/new-feature" }
```

---

### `POST /api/ide/rename`

Renomme ou déplace un fichier/dossier.

**Authentification :** Oui

**Body :**

| Champ | Type | Requis | Description |
|---|---|---|---|
| `oldPath` | `string` | ✅ | Chemin source relatif |
| `newPath` | `string` | ✅ | Chemin destination relatif |

**Réponse 200 :**
```json
{ "status": "success", "oldPath": "src/old.ts", "newPath": "src/new.ts" }
```

**Erreurs :** `404` source introuvable · `409` destination déjà existante

---

### `POST /api/ide/copy`

Copie un fichier ou dossier (récursif). Génère un nom unique si la destination existe déjà. Les liens symboliques sont refusés (sécurité sandbox).

**Authentification :** Oui

**Body :**

| Champ | Type | Requis | Description |
|---|---|---|---|
| `srcPath` | `string` | ✅ | Chemin source relatif |
| `destPath` | `string` | ✅ | Chemin destination relatif |

**Réponse 200 :**
```json
{ "status": "success", "srcPath": "src/foo.ts", "destPath": "src/foo_copy.ts" }
```

---

### `POST /api/ide/search`

Recherche plein-texte ou regex dans les fichiers du workspace.

**Authentification :** Oui

**Body :**

| Champ | Type | Requis | Description |
|---|---|---|---|
| `query` | `string` | ✅ | Texte ou pattern regex à rechercher |
| `caseSensitive` | `boolean` | ❌ | Sensible à la casse (défaut: `false`) |
| `regex` | `boolean` | ❌ | Interprète `query` comme une regex (défaut: `false`) |
| `filePattern` | `string` | ❌ | Filtre sur le nom de fichier |

**Réponse 200 :**
```json
{
  "results": [
    { "file": "src/main.tsx", "line": 42, "column": 3, "preview": "  const foo = ..." }
  ],
  "truncated": false
}
```

Limité à 1000 résultats. `truncated: true` si la limite est atteinte.

---

### `DELETE /api/ide/file`

Supprime un fichier ou dossier (récursif pour les dossiers).

**Authentification :** Oui

**Query params :**

| Nom | Type | Requis | Description |
|---|---|---|---|
| `path` | `string` | ✅ | Chemin relatif à supprimer |

**Réponse 200 :**
```json
{ "status": "success", "path": "src/old.ts" }
```

---

## Sandbox

Le sandbox isole les modifications de l'IA dans `.Leanna/sandbox/` avant application sur le workspace principal.

### `GET /api/sandbox/status`

Retourne l'état courant du sandbox.

**Authentification :** Oui

**Réponse 200 :**
```json
{
  "status": "success",
  "sandbox": {
    "active": true,
    "path": "/workspace/.Leanna/sandbox",
    "modifiedFiles": ["src/app.ts"]
  }
}
```

---

### `POST /api/sandbox/init`

Initialise le sandbox (copie miroir du workspace).

**Authentification :** Oui · **Body :** vide

**Réponse 200 :** `{ "status": "success", "filesCopied": 142 }`

---

### `POST /api/sandbox/activate`

Active le mode sandbox (les écritures IA sont redirigées vers le sandbox).

**Authentification :** Oui · **Body :** vide

**Réponse 200 :** `{ "status": "success", "active": true, "path": "..." }`

---

### `POST /api/sandbox/deactivate`

Désactive le mode sandbox. Nécessite le code de sécurité à 6 chiffres.

**Authentification :** Oui

**Body :**
```json
{ "code": "123456" }
```

**Erreurs :** `403` code incorrect · `429` trop de tentatives (bloqué 15 min)

---

### `POST /api/verify-exit-code`

Vérifie le code sandbox sans changer son état. Utile pour l'UI de confirmation.

**Authentification :** Oui

**Body :** `{ "code": "123456" }`

**Réponse 200 :** `{ "status": "success" }` · **403 :** code incorrect

---

### `POST /api/sandbox/validate`

Lance une validation TypeScript (`tsc --noEmit`) sur le sandbox.

**Authentification :** Oui · **Body :** vide

**Réponse 200 :**
```json
{
  "status": "success",
  "valid": true,
  "errorCount": 0,
  "warningCount": 2,
  "diagnostics": [],
  "errorsByFile": {}
}
```

---

### `POST /api/sandbox/sync`

Valide TypeScript puis copie le sandbox → workspace principal si valide.

**Authentification :** Oui · **Body :** vide

**Réponse 200 :** `{ "status": "success", "filesSynced": 3 }`

**Réponse si erreurs TS :** `{ "status": "validation_failed", "errorCount": 2, "diagnostics": [...] }`

---

### `GET /api/sandbox/diff`

Retourne la liste des fichiers modifiés dans le sandbox (comparaison avec le workspace principal).

**Authentification :** Oui

**Réponse 200 :** `{ "status": "success", "diffs": [{ "path": "src/app.ts", "status": "modified" }] }`

---

### `GET /api/sandbox/file-diff`

Retourne le contenu avant/après d'un fichier spécifique.

**Authentification :** Oui

**Query params :** `path` (string, requis)

**Réponse 200 :**
```json
{
  "status": "success",
  "path": "src/app.ts",
  "original": "// ancien contenu",
  "modified": "// nouveau contenu"
}
```

---

### `POST /api/sandbox/accept-file`

Applique un fichier individuel du sandbox vers le workspace principal.

**Authentification :** Oui · **Body :** `{ "path": "src/app.ts" }`

**Réponse 200 :** `{ "status": "success", "applied": true, "postValidation": { "valid": true, ... } }`

---

### `POST /api/sandbox/reject-file`

Restaure un fichier à sa version originale (annule la modification dans le sandbox).

**Authentification :** Oui · **Body :** `{ "path": "src/app.ts" }`

**Réponse 200 :** `{ "status": "success", "reverted": true }`

---

### `POST /api/sandbox/discard`

Abandonne toutes les modifications du sandbox (restore complet).

**Authentification :** Oui · **Body :** vide

**Réponse 200 :** `{ "status": "success" }`

---

### `POST /api/sandbox/reset`

Réinitialise le sandbox (re-copie complète depuis le workspace). Nécessite le code de sécurité.

**Authentification :** Oui · **Body :** `{ "code": "123456" }`

**Réponse 200 :** `{ "status": "success", "filesCopied": 145 }`

---

## Agents

### `GET /api/agents/status`

Statistiques de l'orchestrateur et liste des outils agents enregistrés.

**Authentification :** Oui

**Réponse 200 :** `{ "registered": true, "tools": ["agent_delegate", ...], "stats": { ... } }`

---

### `GET /api/agents/tasks`

Liste les 50 dernières tâches agents (en cours et terminées).

**Authentification :** Oui

**Réponse 200 :** `{ "tasks": [{ "id": "uuid", "role": "coder", "status": "completed", ... }] }`

---

### `GET /api/agents/roles`

Liste tous les rôles d'agents disponibles.

**Authentification :** Oui

**Réponse 200 :** `{ "roles": ["coder", "architect", "refactor", "test", "docs", "security", "review"] }`

---

### `GET /api/agents/fleet`

Statut complet de la flotte d'agents (registry + orchestrateur).

**Authentification :** Oui

---

### `GET /api/agents/bus/metrics`

Métriques du bus de messages inter-agents (messages envoyés, reçus, erreurs).

**Authentification :** Oui

---

### `GET /api/agents/bus/history`

Historique des messages entre agents.

**Authentification :** Oui

**Query params :** `limit` (number, max 200, défaut 50)

**Réponse 200 :** `{ "messages": [{ "from": "coder", "to": "architect", "content": "...", "ts": "..." }] }`

---

### `GET /api/agents/collaboration/patterns`

Liste les patterns de collaboration disponibles (ex : `code-review`, `full-stack-feature`).

**Authentification :** Oui

---

### `POST /api/agents/collaborate`

Lance une collaboration structurée multi-agents selon un pattern.

**Authentification :** Oui

**Body :**

| Champ | Type | Requis | Description |
|---|---|---|---|
| `patternName` | `string` | ✅ | Nom du pattern (ex: `code-review`) |
| `context.title` | `string` | ✅ | Titre de la tâche |
| `context.description` | `string` | ✅ | Description détaillée |
| `context.files` | `string[]` | ❌ | Fichiers concernés |
| `context.instructions` | `string` | ❌ | Instructions supplémentaires |

**Réponse 202 :**
```json
{
  "orchestrationId": "uuid",
  "pattern": "code-review",
  "status": "running",
  "tasks": 3,
  "message": "Collaboration \"code-review\" démarrée"
}
```

---

### `POST /api/agents/delegate-autonomous`

Délègue une tâche à un agent autonome. L'agent peut sous-déléguer automatiquement.

**Authentification :** Oui

**Body :**

| Champ | Type | Requis | Description |
|---|---|---|---|
| `role` | `string` | ✅ | Rôle cible (coder, architect…) |
| `title` | `string` | ✅ | Titre de la tâche |
| `description` | `string` | ✅ | Description complète |
| `files` | `string[]` | ❌ | Fichiers à traiter |
| `instructions` | `string` | ❌ | Instructions spécifiques |
| `priority` | `"low"\|"normal"\|"high"\|"critical"` | ❌ | Priorité (défaut: `normal`) |
| `timeoutMs` | `number` | ❌ | Timeout en ms |

**Réponse 202 :**
```json
{
  "taskId": "uuid",
  "role": "coder",
  "status": "pending",
  "message": "Tâche déléguée à l'agent autonome \"coder\""
}
```

---

### `GET /api/agents/persistence/status`

État de la connexion Supabase pour la persistance des agents.

**Authentification :** Oui

---

### `GET /api/agents/tool-mapping`

Mapping complet outil → agent (tous les outils).

**Authentification :** Oui

---

### `GET /api/agents/tool-mapping/primary`

Mapping optimisé outil → agent principal. Utilisé par le frontend.

**Authentification :** Oui

**Réponse 200 :** `{ "success": true, "mapping": { "read_file": "coder", "run_tests": "test" }, "totalTools": 42 }`

---

### `GET /api/agents/:role/tools`

Liste tous les outils disponibles pour un rôle donné.

**Authentification :** Oui

**Path params :** `role` (string)

**Réponse 200 :** `{ "success": true, "role": "coder", "tools": ["read_file", "write_file", ...], "count": 12 }`

---

### `GET /api/v2/agents/*` · `GET /api/v2/metrics`

Endpoints du runtime V2 (nouveau système coexistant). Même logique, nouveau ToolRegistry.

**Authentification :** Oui

---

## Workflows

### `GET /api/workflows`

Liste tous les workflows.

**Authentification :** Oui

**Réponse 200 :** `{ "status": "success", "workflows": [{ "id": "uuid", "name": "...", "enabled": true, "schedule": "24h", ... }] }`

---

### `GET /api/workflows/active-runs`

Liste les exécutions de workflows en cours.

**Authentification :** Oui

---

### `POST /api/workflows`

Crée un nouveau workflow.

**Authentification :** Oui

**Body :**

| Champ | Type | Requis | Description |
|---|---|---|---|
| `name` | `string` | ✅ | Nom du workflow |
| `description` | `string` | ❌ | Description |
| `steps` | `object[]` | ✅ | Étapes (tableau JSON) |
| `schedule` | `string` | ❌ | Intervalle (ex: `"24h"`, `"30m"`) |
| `enabled` | `boolean` | ❌ | Actif par défaut (`true`) |

**Réponse 200 :** `{ "status": "success", "workflow": { ... } }`

---

### `POST /api/workflows/:id/run`

Exécute immédiatement un workflow.

**Authentification :** Oui · **Path params :** `id` (UUID)

**Réponse 200 :** `{ "status": "success", "result": { ... } }`

---

### `POST /api/workflows/:id/toggle`

Active ou désactive un workflow.

**Authentification :** Oui

**Body :** `{ "enabled": true }`

---

### `DELETE /api/workflows/:id`

Supprime un workflow.

**Authentification :** Oui

**Réponse 200 :** `{ "status": "success" }` ou `{ "status": "not_found" }`

---

## Conversations

### `GET /api/conversations`

Liste les conversations (paginées).

**Authentification :** Oui

**Query params :**

| Nom | Type | Description |
|---|---|---|
| `limit` | `number` | Max 100, défaut 30 |
| `offset` | `number` | Offset pour la pagination |

**Réponse 200 :** `{ "status": "success", "conversations": [{ "id": "uuid", "title": "...", "message_count": 12, ... }] }`

---

### `GET /api/conversations/search`

Recherche full-text dans les messages (PostgreSQL `to_tsvector` en français).

**Authentification :** Oui

**Query params :** `q` (string, requis) · `limit` (number, max 50)

**Réponse 200 :** `{ "status": "success", "results": [{ "message_id": "uuid", "content": "...", "rank": 0.8 }] }`

---

### `GET /api/conversations/:id`

Récupère les messages d'une conversation.

**Authentification :** Oui

**Path params :** `id` (UUID)

**Query params :** `limit` (max 500, défaut 100) · `offset`

**Réponse 200 :** `{ "status": "success", "messages": [{ "id": "uuid", "role": "user", "content": "...", "created_at": "..." }] }`

---

### `PATCH /api/conversations/:id`

Met à jour le titre d'une conversation.

**Authentification :** Oui · **Body :** `{ "title": "Nouveau titre" }`

---

### `DELETE /api/conversations/:id`

Supprime une conversation et ses messages (cascade).

**Authentification :** Oui

---

### `DELETE /api/conversations/all`

Supprime toutes les conversations.

**Authentification :** Oui

**Réponse 200 :** `{ "status": "success", "deleted": 42 }`

---

## Mémoires

### `GET /api/memories`

Liste les mémoires long-terme (Supabase). Requiert Supabase configuré.

**Authentification :** Oui

**Query params :** `limit` (max 100, défaut 20) · `offset`

**Réponse 200 :** `{ "memories": [{ "id": "uuid", "content": "...", "created_at": "..." }] }`

---

### `DELETE /api/memories/:id`

Supprime une mémoire par son ID.

**Authentification :** Oui

---

### `DELETE /api/memories/all`

Supprime toutes les mémoires.

**Authentification :** Oui

**Réponse 200 :** `{ "status": "success", "deleted": 15 }`

---

## Compétences (Skills)

### `GET /api/skills`

Liste tous les skills natifs avec leur statut.

**Authentification :** Oui

**Réponse 200 :**
```json
{
  "skills": [
    { "id": "memory", "name": "Long-term Memory (Supabase)", "icon": "Database", "status": "authenticated" },
    { "id": "automation", "name": "Automation (Puppeteer)", "icon": "Globe", "status": "active" }
  ]
}
```

Statuts possibles : `active` · `authenticated` (Supabase connecté) · `requires_auth` (Supabase non configuré)

---

### `GET /api/custom-skills`

Liste les custom skills créés par l'utilisateur.

**Authentification :** Oui

---

### `POST /api/custom-skills`

Gère les custom skills via le champ `action` : `list`, `create`, `update` ou
`delete`.
|---|---|---|---|
| `name` | `string` | ✅ | Nom unique du skill |
| `description` | `string` | ✅ | Description pour l'IA |
| `parameters` | `object[]` | ❌ | Paramètres `[{name, type, description, required}]` |
| `instruction` | `string` | ✅ | Prompt/instruction exécutée par l'IA |
| `category` | `string` | ❌ | Catégorie (défaut: `custom`) |
| `icon` | `string` | ❌ | Icône Lucide (défaut: `Sparkles`) |

---

**Authentification :** Oui

Pour une mise à jour ou une suppression, le body contient également `action`
et `id`.

### `GET /api/skill-tuning/metrics`

Retourne les métriques agrégées des appels de skills: volume, échecs, taux de
succès, durée moyenne et feedback utilisateur.

**Authentification :** Oui · **Supabase requis**

**Query params :** `toolName` (optionnel) · `limit` (1 à 500, défaut 100)

**Réponse 200 :** `{ "status": "success", "metrics": [{ "toolName": "security_audit", "calls": 12, "failures": 2, "successRate": 0.83, "averageDurationMs": 420, "feedback": { "correct": 8, "incorrect": 1, "needsImprovement": 1 } }] }`

### `GET /api/skill-tuning/interactions`

Retourne les traces récentes des appels de skills. Les arguments sont
redactés avant persistance.

**Authentification :** Oui · **Supabase requis**

**Query params :** `toolName` (optionnel) · `limit` (1 à 500, défaut 100)

### `POST /api/skill-tuning/feedback`

Associe un feedback à une interaction.

**Body :**

```json
{
  "callId": "call-uuid",
  "label": "correct",
  "correction": "Optionnel",
  "comment": "Optionnel"
}
```

`label` vaut `correct`, `incorrect` ou `needs_improvement`.

### `GET /api/skill-tuning/proposals`

Liste les propositions de tuning. Filtre optionnel `status` : `proposed`,
`approved` ou `rejected`.

### `POST /api/skill-tuning/proposals/generate`

Analyse l’historique et génère les propositions justifiées par au moins cinq
appels et un taux de succès inférieur à 80 %, ou par au moins deux feedbacks
négatifs. Les propositions ouvertes ne sont pas dupliquées.

### `PATCH /api/skill-tuning/proposals/:id`

Approuve ou rejette une proposition.

**Body :** `{ "status": "approved" }` ou `{ "status": "rejected" }`

### `GET /api/skill-tuning/revisions`

Liste les snapshots de custom skills créés avant application d’une proposition.

### `POST /api/skill-tuning/proposals/:id/apply`

Applique une modification approuvée à un custom skill et crée un snapshot
restaurable.

**Body :** `{ "skillId": "uuid", "expectedUpdatedAt": "ISO-8601", "updates": { "instruction": "..." } }`

### `POST /api/skill-tuning/revisions/:id/rollback`

Restaure le custom skill depuis le snapshot indiqué.

---

## Git / GitHub

### `GET /api/git/status`

Statut Git du workspace (fichiers modifiés, branche courante).

**Authentification :** Oui

**Réponse 200 :**
```json
{
  "branch": "main",
  "clean": false,
  "files": [
    { "index": "M", "worktree": " ", "path": "src/app.ts" }
  ]
}
```

---

### `GET /api/git/commits`

Historique des commits récents.

**Authentification :** Oui

**Query params :** `limit` (max 50, défaut 20)

**Réponse 200 :** `{ "commits": [{ "hash": "abc123", "shortHash": "abc", "author": "Dev", "date": "...", "message": "feat: ..." }] }`

---

### `GET /api/git/commits/:hash`

Détail d'un commit (informations + fichiers modifiés).

**Authentification :** Oui

---

### `POST /api/git/commit`

Crée un commit avec tous les fichiers modifiés du workspace (hors `.Leanna`).

**Authentification :** Oui

**Body :** `{ "message": "feat: add new feature" }` (max 200 caractères)

**Réponse 200 :** `{ "success": true, "output": "[main abc1234] feat: ..." }`

---

### `POST /api/git/push`

Pousse vers le remote `origin`.

**Authentification :** Oui · **Body :** vide

---

### `GET /api/git/current-repo`

Récupère owner/repo depuis le remote `origin`.

**Authentification :** Oui

**Réponse 200 :** `{ "status": "success", "owner": "user", "repo": "my-repo", "remoteUrl": "https://..." }`

---

### `GET /api/github/repos`

Liste les repos GitHub de l'utilisateur (nécessite `GITHUB_TOKEN`).

**Authentification :** Oui

---

### `GET /api/github/issues`

Liste les issues d'un repo.

**Authentification :** Oui

**Query params :** `owner` (requis) · `repo` (requis) · `state` (`open`/`closed`, défaut `open`)

---

### `GET /api/github/pulls`

Liste les pull requests d'un repo.

**Authentification :** Oui · **Query params :** mêmes que `/github/issues`

---

### `GET /api/github/notifications`

Notifications GitHub non lues.

**Authentification :** Oui

---

### `GET /api/github/search`

Recherche de repos GitHub.

**Authentification :** Oui · **Query params :** `query` (string, requis)

---

## Profil & Tokens

### `GET /api/profile`

Récupère le profil IA courant (nom, voix, langue, style de réponse…).

**Authentification :** Oui

**Réponse 200 :**
```json
{
  "aiName": "Leanna",
  "aiVoice": "Aoede",
  "userName": "Dev",
  "language": "fr",
  "responseStyle": "balanced",
  "reasoningEnabled": true
}
```

---

### `POST /api/profile`

Met à jour le profil (merge avec l'existant).

**Authentification :** Oui

**Body :** Tout champ du profil (partiel accepté).

---

### `GET /api/tokens`

Liste les clés API configurées avec leur statut de validité (validé en temps réel).

**Authentification :** Oui

**Réponse 200 :**
```json
{
  "tokens": [
    {
      "key": "GEMINI_API_KEY",
      "label": "Gemini API Key",
      "configured": true,
      "valid": true,
      "preview": "AIza••••••••"
    }
  ]
}
```

---

### `POST /api/tokens`

Enregistre ou met à jour une clé API dans `.env` (chiffrée au repos).

**Authentification :** Oui

**Body :** `{ "key": "GEMINI_API_KEY", "value": "AIza..." }`

Clés autorisées : `GEMINI_API_KEY` · `SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` · `OPENROUTER_API_KEY` · `GITHUB_TOKEN`

---

### `GET /api/gemini-keys`

Liste les clés du pool Gemini (rotation automatique sur 429).

**Authentification :** Oui

---

### `POST /api/gemini-keys` · `DELETE /api/gemini-keys/:id`

Ajoute ou supprime une clé du pool Gemini.

**Authentification :** Oui

---

## Notebooks (RAG)

### `GET /api/notebooks`

Liste tous les notebooks.

**Authentification :** Oui

---

### `POST /api/notebooks`

Crée un nouveau notebook.

**Authentification :** Oui · **Body :** `{ "title": "Mon notebook", "description": "..." }`

---

### `GET /api/notebooks/:id`

Détail d'un notebook (sources, metadata).

**Authentification :** Oui

---

### `DELETE /api/notebooks/:id`

Supprime un notebook et ses sources.

**Authentification :** Oui

---

### `POST /api/notebooks/:id/sources/upload`

Upload un document source (PDF, texte…) pour ingestion RAG. Rate-limité.

**Authentification :** Oui · **Content-Type :** `multipart/form-data`

**Form fields :** `file` (binaire)

---

### `POST /api/notebooks/:id/chat`

Chat contextuel sur le notebook (RAG). Rate-limité.

**Authentification :** Oui

**Body :** `{ "message": "Résume les points clés" }`

**Réponse 200 :** `{ "answer": "...", "sources": [{ "title": "...", "chunk": "..." }] }`

---

### `POST /api/notebooks/:id/embeddings/reindex`

Relance l'indexation vectorielle des sources. Rate-limité.

**Authentification :** Oui

---

## Documents

### `POST /api/upload-document`

Upload un document (PDF, DOCX…) et l'indexe dans le workspace.

**Authentification :** Oui · **Content-Type :** `multipart/form-data`

**Form fields :** `file` (binaire)

---

### `GET /api/documents`

Liste les documents indexés.

**Authentification :** Oui

---

### `DELETE /api/documents/:id`

Supprime un document indexé.

**Authentification :** Oui

---

## Automatisation

### `GET /api/automation`

Liste les tâches d'automatisation planifiées.

**Authentification :** Oui

---

### `POST /api/automation`

Crée une tâche planifiée.

**Authentification :** Oui

**Body :**

| Champ | Type | Requis | Description |
|---|---|---|---|
| `name` | `string` | ✅ | Nom de la tâche |
| `action_name` | `string` | ✅ | Nom du skill à exécuter |
| `args` | `object` | ❌ | Arguments du skill |
| `interval_expression` | `string` | ✅ | Intervalle (ex: `"24h"`, `"10m"`) |
| `enabled` | `boolean` | ❌ | Actif par défaut (`true`) |

---

### `POST /api/automation/:id/toggle` · `DELETE /api/automation/:id`

Active/désactive ou supprime une tâche planifiée.

**Authentification :** Oui

---

## Terminal

### `GET /api/terminal`

Récupère l'état du terminal.

**Authentification :** Oui

> Le terminal interactif est accessible via **WebSocket** (`/terminal`). Voir section [WebSockets](#websockets).

---

## Knowledge Graph

### `GET /api/knowledge/status`

Statut de l'indexation du Knowledge Graph.

**Authentification :** Oui

---

### `POST /api/knowledge/scan`

Lance une re-indexation complète du workspace.

**Authentification :** Oui

---

### `GET /api/knowledge/impact`

Analyse l'impact d'une modification sur le graphe de dépendances.

**Authentification :** Oui

---

### `GET /api/knowledge/understanding`

Retourne la compréhension contextuelle d'un fichier ou d'un symbole.

**Authentification :** Oui

---

## Audit

### `GET /api/audit`

Retourne le log d'audit des opérations sur les fichiers.

**Authentification :** Oui

**Réponse 200 :**
```json
{
  "events": [
    {
      "action": "write_file",
      "target": "src/app.ts",
      "actor": "user",
      "details": "updated via IDE",
      "timestamp": "2026-09-04T10:00:00.000Z"
    }
  ]
}
```

---

## MCP

### `GET /api/mcp/status`

Statut des serveurs MCP connectés.

**Authentification :** Oui

---

### `POST /api/mcp/call`

Appelle un outil sur un serveur MCP.

**Authentification :** Oui

**Body :** `{ "server": "server-name", "tool": "tool-name", "args": { ... } }`

---

## Export

### `POST /api/export`

Exporte des données (conversations, mémoires…) dans différents formats.

**Authentification :** Oui

---

## FTP

### `POST /api/ftp/connect`

Établit une connexion FTP.

**Authentification :** Oui

**Body :** `{ "host": "ftp.example.com", "user": "user", "password": "pass", "port": 21 }`

> Par défaut, les IPs privées (RFC 1918) sont bloquées. Définir `ALLOW_FTP_PRIVATE_IPS=true` pour les autoriser.

---

### `GET /api/ftp/list`

Liste les fichiers d'un répertoire FTP.

**Authentification :** Oui · **Query params :** `path` (string)

---

## Marketplace

### `GET /api/marketplace`

Liste les agents et skills disponibles dans le catalogue marketplace.

**Authentification :** Oui

---

### `POST /api/marketplace/install`

Installe un item du marketplace.

**Authentification :** Oui · **Body :** `{ "id": "item-id" }`

---

## WebSockets

### `WS /live`

Session Gemini Live bidirectionnelle. Gère le texte, l'audio, la vidéo et les tool calls.

**Auth :** Cookie `Leanna_token` (posé par le premier appel REST authentifié)

**Messages entrants (client → serveur) :**

```json
{ "type": "text", "text": "Explique ce code" }
{ "type": "audio_chunk", "data": "<base64>" }
{ "type": "video_frame", "data": "<base64>" }
{ "type": "tool_result", "callId": "uuid", "result": { ... } }
```

**Messages sortants (serveur → client) :**

```json
{ "type": "text_chunk", "text": "Bien sûr..." }
{ "type": "audio_chunk", "data": "<base64>" }
{ "type": "tool_call", "callId": "uuid", "name": "read_file", "args": { ... } }
{ "type": "knowledge_progress", "phase": "indexing", "current": 42, "total": 100 }
{ "type": "agent_event", "event": "task_started", "taskId": "uuid", "role": "coder" }
{ "type": "mission_event", "event": "step_completed", ... }
```

---

### `WS /sandbox-watch`

Notifications temps réel des changements dans le sandbox.

**Auth :** Cookie `Leanna_token`

**Messages sortants :**
```json
{ "type": "file_changed", "path": "src/app.ts", "action": "modified" }
{ "type": "file_created", "path": "src/new.ts" }
{ "type": "file_deleted", "path": "src/old.ts" }
```

---

### `WS /terminal`

Terminal PTY interactif.

**Auth :** Token via cookie ou query param

**Messages entrants :** Commandes shell en texte brut ou JSON `{ "type": "resize", "cols": 80, "rows": 24 }`

**Messages sortants :** Sortie du terminal en texte brut (stdout + stderr du PTY)


---

## Tests d'intégration

Tous les endpoints REST disposent de tests d'intégration dans `server/routes/*.test.ts`.

**Couverture actuelle : 74 tests d'intégration**

### Tests par routeur

| Routeur | Fichier de test | Nombre de tests | Couverture |
|---|---|---|---|
| Agents | `agents.test.ts` | 15 | Statut, tâches, rôles, flotte, bus, collaboration, persistance, mapping |
| Marketplace | `marketplace.test.ts` | 13 | Recherche, featured, installation, publication, sécurité |
| Workflows | `workflows.test.ts` | 7 | CRUD, exécution, toggle |
| Browser | `browser.test.ts` | 7 | Content requests, actions, promesses |
| Upload Document | `upload-document.test.ts` | 7 | Validation fichiers, types supportés, rate limiting |
| Conversations | `conversations.test.ts` | 7 | Liste, recherche, messages, CRUD |
| Skills | `skills.test.ts` | 6 | Liste, propriétés, statut Supabase |
| Profile | `profile.test.ts` | 6 | GET/POST profile, GET/POST tokens |
| Terminal | `terminal.test.ts` | 5 | Configuration, sessions, authentification |
| Memories | `memories.test.ts` | 3 | GET, DELETE (Supabase) |
| Workspace | `workspace.test.ts` | 3 | GET info, POST interdit |
| Health | `health.test.ts` | 1 | Health check |

### Exécuter les tests d'intégration

```bash
# Tous les tests d'intégration des routes
npm test -- server/routes/*.test.ts

# Un routeur spécifique
npm test -- server/routes/agents.test.ts

# Voir les résultats détaillés
npm test 2>&1 | grep -E "(✔|✖)"
```

### Ajouter des tests pour une nouvelle route

Voir le guide complet dans [CONTRIBUTING.md](CONTRIBUTING.md#ajouter-une-route-api).

Template minimal :

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'http';
import myRouter from './my-route.js';

test('GET /my-endpoint returns 200', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/my-route', myRouter);

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/my-route/my-endpoint`);
    assert.equal(res.status, 200);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
```
