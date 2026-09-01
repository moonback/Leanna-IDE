# Référence API

Toutes les routes de l'API REST sont préfixées par `/api`.

### Format d'authentification
Sauf mention contraire (notamment `/api/health`), tous les endpoints nécessitent un jeton secret si `Leanna_API_TOKEN` est défini dans l'environnement.

* **En-tête HTTP** : `x-leanna-token: <SECRET>`
* **Cookie HTTP** : `Leanna_token=<SECRET>`
* **Paramètre de requête (WebSockets)** : `?token=<SECRET>`

---

## Santé & Système

### `GET /api/health`

#### Description
Vérifie l'état de santé du serveur backend et retourne son temps de fonctionnement.

#### Authentification
Non

#### Paramètres
Aucun.

#### Exemple de requête
```bash
curl -X GET http://127.0.0.1:4000/api/health
```

#### Réponse succès (200 OK)
```json
{
  "status": "ok",
  "uptime": 142.5,
  "timestamp": "2026-08-31T17:30:00.000Z"
}
```

#### Codes HTTP
| Code | Signification |
| :--- | :--- |
| 200 | Serveur opérationnel |

---

## Multi-Workspace & Périmètre Self-Root

### `GET /api/self-root/status`

#### Description
Retourne l'état actuel du périmètre `SELF_ROOT`, les métadonnées Git du workspace actif et l'état de synchronisation.

#### Authentification
Non (ou `x-leanna-token` si configuré)

#### Réponse succès (200 OK)
```json
{
  "rootPath": "C:/Users/Mayss/Desktop/mon-projet",
  "locked": true,
  "siteUrl": "https://mon-site.com",
  "gitBranch": "main",
  "gitStatus": "clean",
  "lastCommit": "feat: init project",
  "lastCommitDate": "il y a 2 heures",
  "aheadBehind": { "ahead": 0, "behind": 0 }
}
```

---

### `GET /api/self-root/workspaces`

#### Description
Retourne la liste de tous les dépôts enregistrés dans `.Leanna/workspaces.json`, triés par date de dernier accès, ainsi que le workspace actif.

#### Authentification
Non (ou `x-leanna-token` si configuré)

#### Réponse succès (200 OK)
```json
{
  "workspaces": [
    {
      "id": "mon_projet_1a2b3c",
      "name": "Mon Projet",
      "path": "C:/Users/Mayss/Desktop/mon-projet",
      "siteUrl": "https://mon-site.com",
      "lastOpened": "2026-08-31T17:40:00.000Z",
      "createdAt": "2026-08-31T12:00:00.000Z",
      "isGit": true,
      "gitBranch": "main"
    }
  ],
  "activeRoot": "C:/Users/Mayss/Desktop/mon-projet",
  "siteUrl": "https://mon-site.com"
}
```

---

### `POST /api/self-root/workspaces/validate`

#### Description
Pré-valide la sécurité d'un chemin de dépôt externe avant tentative d'ouverture (vérification d'existence, interdiction des racines systèmes, inspection Git).

#### Authentification
Non (ou `x-leanna-token` si configuré)

#### Corps de la requête (JSON)
```json
{
  "path": "C:/Users/Mayss/Desktop/mon-projet"
}
```

#### Réponse succès (200 OK)
```json
{
  "valid": true,
  "resolvedPath": "C:/Users/Mayss/Desktop/mon-projet",
  "isGit": true,
  "gitBranch": "main",
  "hasPackageJson": true,
  "hasTsConfig": true,
  "suspiciousSymlinksCount": 0
}
```

---

### `POST /api/self-root/change`

#### Description
Bascule le workspace actif vers un nouveau dépôt de manière atomique. Réinitialise le sandbox, recharge le graphe de connaissances et la mémoire projet.

#### Authentification
Oui / Confirmation interactive (sauf si `userConfirmed: true` depuis l'UI)

#### Corps de la requête (JSON)
```json
{
  "path": "C:/Users/Mayss/Desktop/mon-projet",
  "userConfirmed": true,
  "name": "Mon Projet",
  "siteUrl": "https://mon-site.com"
}
```

#### Réponse succès (200 OK)
```json
{
  "status": "success",
  "newRoot": "C:/Users/Mayss/Desktop/mon-projet",
  "siteUrl": "https://mon-site.com"
}
```

---

### `DELETE /api/self-root/workspaces/:id`

#### Description
Retire un workspace du registre de l'historique `.Leanna/workspaces.json` sans supprimer les fichiers sur le disque.

#### Authentification
Non (ou `x-leanna-token` si configuré)

#### Réponse succès (200 OK)
```json
{
  "success": true,
  "id": "mon_projet_1a2b3c"
}
```

---

### `PATCH /api/self-root/workspaces/:id`

#### Description
Met à jour le nom personnalisé ou l'URL du site associé à un workspace enregistré.

#### Corps de la requête (JSON)
```json
{
  "name": "Nouveau Nom",
  "siteUrl": "https://doc.mon-site.com"
}
```

---

### `POST /api/self-root/clear`

#### Description
Réinitialise le workspace actif (`SELF_ROOT` remis à vide) et désactive le Sandbox.

---

### `POST /api/self-root/clone` *(SSE)*

#### Description
Clone un dépôt Git distant (GitHub, GitLab, Bitbucket, SSH…) dans un dossier local, puis l'active automatiquement comme workspace. La réponse est un flux **Server-Sent Events** qui transmet la progression ligne par ligne en temps réel.

#### Authentification
Non (ou `x-leanna-token` si configuré)

#### Corps de la requête (JSON)
```json
{
  "url": "https://github.com/user/repository",
  "targetDir": "C:/Users/Mayss/Documents/mes-projets"
}
```

| Champ | Type | Requis | Description |
| :--- | :--- | :--- | :--- |
| `url` | string | Oui | URL HTTPS (`https://…`) ou SSH (`git@…`) du dépôt |
| `targetDir` | string | Non | Dossier parent de destination. Défaut : `~/Documents/Leanna-Projects` |

#### Format des événements SSE

Chaque ligne reçue est un objet JSON préfixé `data:` :

```
data: {"type":"log","level":"info","message":"🔗 Clonage de https://github.com/user/repo…"}

data: {"type":"log","level":"info","message":"Receiving objects:  45% (120/265)"}

data: {"type":"done","status":"success","newRoot":"C:/Users/Mayss/Documents/Leanna-Projects/repo","repoName":"repo"}
```

| `type` | Champs supplémentaires | Signification |
| :--- | :--- | :--- |
| `log` | `level` (`info`/`warn`/`error`), `message` | Ligne de progression ou erreur git |
| `done` | `status: "success"`, `newRoot`, `repoName` | Clone terminé, workspace activé |
| `error` | `error` (message), `clonePath?` | Échec du clone (code git non-zero, URL invalide…) |

#### Codes HTTP
| Code | Signification |
| :--- | :--- |
| 200 | Flux SSE ouvert (résultat final dans l'événement `done` ou `error`) |
| 400 | Corps invalide (URL manquante ou format non autorisé) |

#### Notes
- Le dossier de destination ne doit pas exister avant le clonage ; si c'est le cas, l'événement `error` est immédiatement émis avec le `clonePath`.
- En cas d'échec partiel, le dossier partiellement cloné est nettoyé automatiquement.
- Après succès, le sandbox est réinitialisé et le Knowledge System est réindexé exactement comme après `POST /api/self-root/change`.

---

## Système de Fichiers & IDE

### `GET /api/ide/tree`

#### Description
Retourne l'arborescence complète des fichiers et dossiers du projet actif (prend en compte le miroir sandbox si actif).

#### Authentification
Oui — `x-leanna-token`

#### Paramètres
Aucun.

#### Exemple de requête
```bash
curl -X GET http://127.0.0.1:4000/api/ide/tree \
  -H "x-leanna-token: <SECRET>"
```

#### Réponse succès (200 OK)
```json
{
  "path": "c:/Users/Mayss/Desktop/Jarvis-os-ori",
  "entries": [
    {
      "name": "src",
      "path": "src",
      "type": "directory",
      "children": [
        {
          "name": "main.tsx",
          "path": "src/main.tsx",
          "type": "file"
        }
      ]
    }
  ]
}
```

#### Codes HTTP
| Code | Signification |
| :--- | :--- |
| 200 | Arborescence générée |
| 401 | Authentification invalide |
| 500 | Erreur lors de la lecture du système de fichiers |

---

### `GET /api/ide/file`

#### Description
Lit le contenu textuel UTF-8 d'un fichier du workspace.

#### Authentification
Oui — `x-leanna-token`

#### Paramètres
| Emplacement | Nom | Type | Requis | Description |
| :--- | :--- | :--- | :--- | :--- |
| query | `path` | string | Oui | Chemin relatif du fichier à lire |

#### Exemple de requête
```bash
curl -X GET "http://127.0.0.1:4000/api/ide/file?path=package.json" \
  -H "x-leanna-token: <SECRET>"
```

#### Réponse succès (200 OK)
```json
{
  "path": "package.json",
  "content": "{\n  \"name\": \"Leanna\",\n  \"version\": \"0.7.0\"\n}"
}
```

#### Réponse erreur (403 / 404)
```json
{
  "error": "Chemin hors du workspace."
}
```

#### Codes HTTP
| Code | Signification |
| :--- | :--- |
| 200 | Contenu retourné avec succès |
| 400 | Paramètre `path` manquant |
| 401 | Non autorisé |
| 403 | Chemin en dehors du périmètre autorisé |
| 404 | Fichier introuvable |

---

### `POST /api/ide/file`

#### Description
Crée ou met à jour le contenu d'un fichier (redirigé vers le Sandbox si actif).

#### Authentification
Oui — `x-leanna-token`

#### Paramètres
| Emplacement | Nom | Type | Requis | Description |
| :--- | :--- | :--- | :--- | :--- |
| body | `path` | string | Oui | Chemin relatif du fichier cible |
| body | `content` | string | Oui | Nouveau contenu texte du fichier |

#### Exemple de requête
```bash
curl -X POST http://127.0.0.1:4000/api/ide/file \
  -H "Content-Type: application/json" \
  -H "x-leanna-token: <SECRET>" \
  -d '{
    "path": "src/test.txt",
    "content": "Hello Leanna"
  }'
```

#### Réponse succès (200 OK)
```json
{
  "status": "success",
  "path": "src/test.txt",
  "sandbox": true
}
```

#### Codes HTTP
| Code | Signification |
| :--- | :--- |
| 200 | Fichier enregistré |
| 400 | Paramètre `path` manquant |
| 401 | Non autorisé |
| 403 | Écriture hors sandbox ou sur cible interdite |
| 503 | Sandbox non prêt |

---

### `POST /api/ide/search`

#### Description
Recherche du texte ou une expression régulière à travers tous les fichiers du projet.

#### Authentification
Oui — `x-leanna-token`

#### Paramètres
| Emplacement | Nom | Type | Requis | Description |
| :--- | :--- | :--- | :--- | :--- |
| body | `query` | string | Oui | Chaîne ou motif recherché |
| body | `caseSensitive`| boolean| Non | Sensibilité à la casse (défaut: false) |
| body | `regex` | boolean| Non | Recherche par expression régulière |
| body | `filePattern` | string | Non | Filtre sur le nom de fichier |

#### Exemple de requête
```bash
curl -X POST http://127.0.0.1:4000/api/ide/search \
  -H "Content-Type: application/json" \
  -H "x-leanna-token: <SECRET>" \
  -d '{
    "query": "startServer",
    "caseSensitive": true,
    "regex": false
  }'
```

#### Réponse succès (200 OK)
```json
{
  "results": [
    {
      "file": "server.ts",
      "line": 391,
      "column": 16,
      "preview": "async function startServer() {"
    }
  ]
}
```

#### Codes HTTP
| Code | Signification |
| :--- | :--- |
| 200 | Recherche complétée |
| 400 | Paramètre `query` manquant |
| 401 | Non autorisé |
| 500 | Erreur interne lors du parcours |

---

## Bac à Sable (Sandbox)

### `GET /api/sandbox/status`

#### Description
Retourne le statut actuel du bac à sable (actif/inactif, racine, fichiers modifiés).

#### Authentification
Oui — `x-leanna-token`

#### Exemple de requête
```bash
curl -X GET http://127.0.0.1:4000/api/sandbox/status \
  -H "x-leanna-token: <SECRET>"
```

#### Réponse succès (200 OK)
```json
{
  "status": "success",
  "sandbox": {
    "active": true,
    "root": "c:/Users/Mayss/Desktop/Jarvis-os-ori/.Leanna/sandbox",
    "modifiedFiles": ["src/main.tsx"]
  }
}
```

---

### `POST /api/sandbox/validate`

#### Description
Exécute une vérification TypeScript (`tsc --noEmit`) au sein du bac à sable pour détecter d'éventuelles erreurs de compilation.

#### Authentification
Oui — `x-leanna-token`

#### Exemple de requête
```bash
curl -X POST http://127.0.0.1:4000/api/sandbox/validate \
  -H "x-leanna-token: <SECRET>"
```

#### Réponse succès (200 OK)
```json
{
  "status": "success",
  "valid": true,
  "errorCount": 0,
  "warningCount": 0,
  "diagnostics": [],
  "errorsByFile": {},
  "exitCode": 0,
  "stdout": "",
  "stderr": ""
}
```

#### Réponse échec de validation (200 OK)
```json
{
  "status": "validation_failed",
  "valid": false,
  "errorCount": 1,
  "warningCount": 0,
  "diagnostics": ["src/main.tsx:42:5 - error TS2304: Cannot find name 'foo'."],
  "errorsByFile": {
    "src/main.tsx": ["Line 42: Cannot find name 'foo'."]
  },
  "exitCode": 2
}
```

---

### `POST /api/sandbox/sync`

#### Description
Synchronise l'ensemble des fichiers modifiés du bac à sable vers le projet principal (bloqué si la validation TypeScript échoue).

#### Authentification
Oui — `x-leanna-token`

#### Exemple de requête
```bash
curl -X POST http://127.0.0.1:4000/api/sandbox/sync \
  -H "x-leanna-token: <SECRET>"
```

#### Réponse succès (200 OK)
```json
{
  "status": "success",
  "applied": true,
  "filesCount": 2,
  "files": ["src/main.tsx", "server.ts"]
}
```

---

### `POST /api/sandbox/deactivate`

#### Description
Désactive le mode bac à sable. Requiert le code de sécurité configuré dans `SANDBOX_EXIT_CODE`.

#### Authentification
Oui — `x-leanna-token`

#### Paramètres
| Emplacement | Nom | Type | Requis | Description |
| :--- | :--- | :--- | :--- | :--- |
| body | `code` | string | Oui | Code à 6 chiffres |

#### Exemple de requête
```bash
curl -X POST http://127.0.0.1:4000/api/sandbox/deactivate \
  -H "Content-Type: application/json" \
  -H "x-leanna-token: <SECRET>" \
  -d '{"code": "123456"}'
```

#### Réponse succès (200 OK)
```json
{
  "status": "success",
  "active": false
}
```

#### Codes HTTP
| Code | Signification |
| :--- | :--- |
| 200 | Sandbox désactivé |
| 401 | Non autorisé |
| 403 | Code de sécurité incorrect ou non configuré |

---

## Flotte d'Agents & Orchestration

### `GET /api/agents/fleet`

#### Description
Retourne l'état complet de la flotte d'agents autonomes, leurs statuts et charges de travail.

#### Authentification
Oui — `x-leanna-token`

#### Exemple de requête
```bash
curl -X GET http://127.0.0.1:4000/api/agents/fleet \
  -H "x-leanna-token: <SECRET>"
```

#### Réponse succès (200 OK)
```json
{
  "totalAgents": 6,
  "activeAgents": 1,
  "agents": [
    {
      "role": "architect",
      "status": "idle",
      "currentTask": null,
      "capabilities": ["design", "architecture_review"]
    },
    {
      "role": "coder",
      "status": "busy",
      "currentTask": "task-891",
      "capabilities": ["code_generation", "refactoring"]
    }
  ]
}
```

---

### `GET /api/agents/bus/history`

#### Description
Récupère l'historique des messages échangés entre agents via le bus interne.

#### Authentification
Oui — `x-leanna-token`

#### Paramètres
| Emplacement | Nom | Type | Requis | Description |
| :--- | :--- | :--- | :--- | :--- |
| query | `limit` | number | Non | Nombre max de messages (défaut: 50, max: 200) |

#### Exemple de requête
```bash
curl -X GET "http://127.0.0.1:4000/api/agents/bus/history?limit=10" \
  -H "x-leanna-token: <SECRET>"
```

#### Réponse succès (200 OK)
```json
{
  "messages": [
    {
      "id": "msg-123",
      "from_role": "architect",
      "to_role": "coder",
      "type": "task_delegation",
      "payload": { "task": "Créer le routeur health" },
      "created_at": "2026-08-31T17:00:00.000Z"
    }
  ]
}
```

---

## Notebooks & Moteur RAG

### `POST /api/notebooks`

#### Description
Crée un nouveau notebook d'étude ou de recherche.

#### Authentification
Oui — `x-leanna-token`

#### Paramètres
| Emplacement | Nom | Type | Requis | Description |
| :--- | :--- | :--- | :--- | :--- |
| body | `title` | string | Oui | Titre du notebook |
| body | `description` | string | Non | Description facultative |

#### Exemple de requête
```bash
curl -X POST http://127.0.0.1:4000/api/notebooks \
  -H "Content-Type: application/json" \
  -H "x-leanna-token: <SECRET>" \
  -d '{"title": "Analyse Architecture Leanna", "description": "Documentation technique"}'
```

#### Réponse succès (200 OK)
```json
{
  "id": "nb-45f8a9",
  "title": "Analyse Architecture Leanna",
  "description": "Documentation technique",
  "sources": [],
  "notes": [],
  "createdAt": "2026-08-31T17:15:00.000Z"
}
```

---

### `POST /api/notebooks/:id/sources/upload`

#### Description
Téléverse et extrait le contenu textuel d'un document (PDF, TXT, MD, Code, Image) pour l'associer au notebook. Les PDF sont traités via `pdf-parse`, puis leur texte extrait est indexé et exploitable par le moteur documentaire.

#### Authentification
Oui — `x-leanna-token`

#### Paramètres
| Emplacement | Nom | Type | Requis | Description |
| :--- | :--- | :--- | :--- | :--- |
| path | `id` | string | Oui | Identifiant du notebook |
| body (form-data) | `file` | binary | Oui | Fichier à ingérer (max 50 Mo) |

#### Codes HTTP
| Code | Signification |
| :--- | :--- |
| 200 | Document ingéré et indexé |
| 400 | Fichier manquant ou type de fichier non supporté |
| 401 | Non autorisé |
| 429 | Rate limit d'embedding atteint |

---

## Gestion des Clés Gemini

### `GET /api/gemini-keys`

#### Description
Liste l'ensemble des clés configurées dans le pool de rotation Gemini.

#### Authentification
Oui — `x-leanna-token`

#### Réponse succès (200 OK)
```json
{
  "keys": [
    {
      "id": "key-1",
      "hint": "AIzaSy...4xK9",
      "priority": 1,
      "enabled": true,
      "usageCount": 154,
      "errorCount": 0,
      "lastUsed": "2026-08-31T17:25:00.000Z"
    }
  ]
}
```

---

## Knowledge System & Call-Graph AST

### `GET /api/knowledge/health`

#### Description
Scanne l'état de santé du graphe de connaissances, la mémoire projet, les cycles de dépendances et les métadonnées du workspace.

#### Réponse succès (200 OK)
```json
{
  "status": "success",
  "health": { "overall": "healthy", "isInitialized": true, "warnings": [] },
  "knowledgeGraph": { "totalFiles": 515, "totalEntities": 8359, "totalLines": 72400 },
  "dependencyGraph": { "cycleCount": 0, "cycles": [] },
  "projectMemory": { "totalFacts": 24, "structuralFacts": 8 }
}
```

---

### `GET /api/knowledge/ast/stats`

#### Description
Retourne les métriques globales du moteur Tree-sitter et du graphe d'appels bidirectionnel.

#### Réponse succès (200 OK)
```json
{
  "status": "success",
  "astReady": true,
  "stats": {
    "totalNodes": 4337,
    "totalEdges": 31028,
    "resolvedEdges": 5405,
    "crossFileEdges": 1935
  }
}
```

---

### `GET /api/knowledge/ast/functions`

#### Description
Recherche et liste les fonctions, méthodes et composants indexés par Tree-sitter avec leurs plages de lignes et signatures typées.

#### Paramètres Query
* `q` *(optionnel)* : Mot-clé ou nom de fonction.
* `file` *(optionnel)* : Filtre par sous-chemin de fichier.
* `limit` *(optionnel, défaut 50)* : Nombre max de résultats.

---

### `GET /api/knowledge/ast/callers`

#### Description
Trouve toutes les fonctions qui appellent une fonction donnée (analyse d'impact / appelants).

#### Paramètres Query
* `fn` *(requis)* : Nom de la fonction ou méthode.
* `file` *(optionnel)* : Chemin du fichier.
* `class` *(optionnel)* : Nom de la classe si méthode.

---

### `GET /api/knowledge/ast/callees`

#### Description
Trouve toutes les fonctions et méthodes appelées par une fonction donnée (y compris appels `this.method()`).

#### Paramètres Query
* `fn` *(requis)* : Nom de la fonction source.
* `file` *(optionnel)* : Chemin du fichier.

---

### `GET /api/knowledge/ast/chain`

#### Description
Déroule l'arborescence complète et récursive des appels (BFS) à partir d'une fonction racine jusqu'à N niveaux de profondeur.

#### Paramètres Query
* `fn` *(requis)* : Fonction racine.
* `depth` *(optionnel, défaut 4)* : Profondeur de recherche BFS.

---

### `POST /api/knowledge/reindex`

#### Description
Déclenche une réindexation complète du projet par `ProjectIndexer` et reconstruit le `KnowledgeGraph` et l'arbre AST Tree-sitter.

---

## Agents Personnalisés (`/api/custom-agents`)

Gestion CRUD et persistance locale (`.Leanna/custom-agents.json`) des agents personnalisés créés via l'Agent Builder, avec validation Zod stricte.

### `GET /api/custom-agents`
Retourne la liste complète de tous les agents personnalisés enregistrés.

### `POST /api/custom-agents`
Crée un nouvel agent personnalisé et l'enregistre dynamiquement dans le runtime.

#### Corps de requête (JSON validé Zod)
```json
{
  "name": "Expert Python",
  "role": "python_expert",
  "description": "Agent spécialisé en développement et tests Python",
  "systemPrompt": "Tu es un expert Python...",
  "capabilities": ["python_exec", "read_project_file"],
  "maxConcurrency": 2,
  "defaultTimeoutMs": 60000,
  "triggerKeywords": ["python", "pytest", "django"]
}
```

### `PUT /api/custom-agents/:id`
Met à jour les propriétés d'un agent personnalisé existant. Rejette toute clé non autorisée (`strict`).

### `DELETE /api/custom-agents/:id`
Supprime un agent et le désenregistre du registre dynamique.

### `POST /api/custom-agents/import`
Importe un lot d'agents personnalisés depuis une structure `{ "agents": [...] }`.

---

## Intégration MCP (Model Context Protocol) (`/api/mcp`)

Gestion du pont MCP pour connecter des serveurs d'outils externes (Stdio / SSE).

### `GET /api/mcp/servers`
Liste les serveurs MCP configurés et leur statut (connecté, déconnecté, erreur).

### `POST /api/mcp/servers`
Ajoute et démarre un nouveau serveur MCP.

#### Corps de requête (JSON validé Zod)
```json
{
  "id": "github-mcp",
  "name": "GitHub Tool Server",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": { "GITHUB_TOKEN": "ghp_xxx" }
}
```

### `PUT /api/mcp/servers/:id`
Met à jour la configuration d'un serveur MCP.

### `POST /api/mcp/servers/:id/toggle`
Active ou désactive un serveur MCP (`{ "enabled": true }`).

### `GET /api/mcp/tools`
Retourne l'ensemble des outils découverts sur tous les serveurs MCP actifs.

### `POST /api/mcp/tools/call`
Exécute un outil MCP spécifique.

#### Corps de requête (JSON validé Zod)
```json
{
  "tool": "github_create_issue",
  "arguments": {
    "title": "Bug fix",
    "body": "Description..."
  }
}
```

---

## Flotte d'Agents Autonomes & Collaboration (`/api/agents`)

### `GET /api/agents/fleet`
Statut en temps réel de tous les agents de la flotte (rôles statiques et dynamiques).

### `POST /api/agents/collaborate`
Lance une session de collaboration multi-agents structurée selon un pattern prédéfini.

#### Corps de requête (JSON validé Zod)
```json
{
  "patternName": "feature_development",
  "context": {
    "title": "Implémentation Auth JWT",
    "description": "Créer le module d'authentification et les tests associés",
    "files": ["server/auth.ts", "tests/auth.test.ts"]
  }
}
```

### `POST /api/agents/delegate-autonomous`
Délègue de manière asynchrone une tâche à un agent autonome avec sous-délégation automatique.

#### Corps de requête (JSON validé Zod)
```json
{
  "role": "coder",
  "title": "Refactoring des routes",
  "description": "Ajouter la validation Zod sur les contrôleurs",
  "priority": "high",
  "timeoutMs": 120000
}
```

---

## Synthèse Vocale TTS (`/api/tts`)

### `POST /api/tts/speak`
Synthétise un texte en audio PCM (base64) avec mise en cache.

#### Corps de requête (JSON validé Zod)
```json
{
  "text": "Bonjour, je suis votre assistant Jarvis.",
  "voice": "Puck",
  "speed": 1.0,
  "noCache": false
}
```

### `POST /api/tts/speak-stream`
Génère le flux audio en Server-Sent Events (SSE) pour les réponses longues.

---

## Format Standardisé des Erreurs de Validation (400 Bad Request)

Toutes les routes équipées de la validation Zod renvoient un format uniforme en cas d'erreur de corps :
```json
{
  "error": "Corps de requête invalide.",
  "details": [
    {
      "field": "role",
      "message": "Le rôle ne peut contenir que des lettres, chiffres, tirets et underscores"
    }
  ]
}
```

---



## Interfaces Non-HTTP

### WebSocket `/live` (Gemini Live API Bridge)
* **URL** : `ws://127.0.0.1:4000/live?token=<SECRET>&conversation_id=<ID>&mode=full`
* **Direction** : Bidirectionnelle temps réel.
* **Protocole de messages Client → Serveur** :
  - `{ "audio": "<base64_pcm_16khz>" }` : Envoi de flux microphone.
  - `{ "video": { "data": "<base64_jpeg>", "mimeType": "image/jpeg" } }` : Envoi d'une capture d'écran / caméra.
  - `{ "text": "Bonjour Leanna" }` : Envoi d'un message texte utilisateur.
  - `{ "type": "summarize_context" }` : Demande de compactage manuel du contexte.
  - `{ "type": "confirm-response", "requestId": "req-1", "approved": true }` : Réponse à une demande d'approbation critique.
* **Protocole de messages Serveur → Client** :
  - `{ "audio": "<base64_pcm_16khz>" }` : Flux vocal de réponse de l'assistant.
  - `{ "text": "..." }` : Transcription textuelle incrémentale.
  - `{ "tool_start": "read_project_file", "args": { "path": "server.ts" } }` : Début d'exécution d'un outil.
  - `{ "tool_used": "read_project_file", "info": "..." }` : Résultat d'un outil.
  - `{ "context_size": { "currentSize": 45000, "maxSize": 1000000, "percent": 5, "level": "ok" } }` : Métriques de contexte.
  - `{ "ide-action": { "type": "open-file", "path": "src/main.tsx" } }` : Commande de pilotage UI.

### WebSocket `/terminal` (Console PTY-like)
* **URL** : `ws://127.0.0.1:4000/terminal?token=<SECRET>`
* **Direction** : Bidirectionnelle.
* **Messages Client → Serveur** :
  - `{ "type": "input", "data": "ls -la\r" }`
  - `{ "type": "resize", "data": { "cols": 80, "rows": 24 } }`
* **Messages Serveur → Client** :
  - Flux binaire ou texte brut de sortie standard (`stdout`/`stderr`).

---

## Marketplace d'Agents et de Skills (`/api/marketplace`)

Registre communautaire d'agents, skills et bundles installables en un clic. Tous les endpoints sont protégés par le middleware `x-leanna-token`.

### `GET /api/marketplace/search`

Recherche paginée dans le catalogue avec filtres.

**Query params** :

| Param | Type | Description | Défaut |
| :--- | :--- | :--- | :--- |
| `query` | `string` | Recherche plein-texte (nom, description, tags, auteur) | — |
| `type` | `agent\|skill\|bundle` | Filtrer par type de paquet | — |
| `category` | `string` | Filtrer par catégorie (`code`, `devops`, `web`, `data`, `writing`, `security`, `productivity`, `ai`, `other`) | — |
| `sort` | `popular\|recent\|rating\|installs` | Critère de tri | `popular` |
| `page` | `number` | Numéro de page (1-indexed) | `1` |
| `limit` | `number` | Nombre de résultats par page (max 50) | `20` |
| `verified` | `boolean` | Filtrer sur les paquets certifiés | — |
| `featured` | `boolean` | Filtrer sur les paquets mis en avant | — |
| `tags` | `string` | Tags séparés par virgule | — |

**Réponse `200`** :
```json
{
  "success": true,
  "packages": [ /* MarketplacePackage[] */ ],
  "total": 10,
  "page": 1,
  "totalPages": 1
}
```

---

### `GET /api/marketplace/featured`

Retourne les paquets mis en avant (`featured: true`), triés par popularité.

**Réponse `200`** :
```json
{ "success": true, "packages": [ /* MarketplacePackage[] */ ] }
```

---

### `GET /api/marketplace/installed`

Retourne les paquets installés localement sur cette instance (marqués `_installed: true`).

**Réponse `200`** :
```json
{ "success": true, "packages": [ /* MarketplacePackage[] avec _installed: true */ ] }
```

---

### `GET /api/marketplace/stats`

Statistiques globales du catalogue.

**Réponse `200`** :
```json
{
  "success": true,
  "stats": {
    "total": 10,
    "agents": 6,
    "skills": 2,
    "bundles": 2,
    "verified": 7,
    "totalInstalls": 18770,
    "installed": 3
  }
}
```

---

### `GET /api/marketplace/package/:id`

Retourne le détail complet d'un paquet (incluant README, reviews, rapport sécurité).

**Réponse `200`** :
```json
{
  "success": true,
  "package": { /* MarketplacePackage complet avec _installed */ }
}
```

**Réponse `404`** si le paquet est introuvable.

---

### `POST /api/marketplace/install`

Installe un paquet : l'agent est enregistré dans le `DynamicAgentRegistry` et persisté dans `.Leanna/custom-agents.json` ; les skills sont créés dans Supabase `custom_skills` (si configuré).

**Corps** :
```json
{ "packageId": "code-reviewer-pro", "version": "2.1.0" }
```

**Réponse `200`** :
```json
{
  "success": true,
  "packageId": "code-reviewer-pro",
  "agentInstalled": true,
  "skillsInstalled": 0,
  "warnings": [],
  "message": "\"Code Reviewer Pro\" installé avec succès. Agent disponible dans l'Agent Builder."
}
```

**Réponse `403`** si le paquet est signalé (`trustLevel: "flagged"`).

---

### `POST /api/marketplace/uninstall`

Désinstalle un paquet : supprime l'agent du registre dynamique et du JSON local.

**Corps** :
```json
{ "packageId": "code-reviewer-pro" }
```

**Réponse `200`** :
```json
{ "success": true, "message": "\"Code Reviewer Pro\" désinstallé." }
```

---

### `POST /api/marketplace/publish`

Publie un nouveau paquet dans le registre local après validation de sécurité automatique. La publication est bloquée si des flags critiques sont détectés.

**Corps** (schéma `PublishPackageSchema`) :
```json
{
  "name": "Mon Agent Spécialisé",
  "description": "Description courte du paquet (≤ 200 chars)",
  "type": "agent",
  "category": "code",
  "tags": ["typescript", "review"],
  "version": "1.0.0",
  "author": "mon_pseudo",
  "license": "MIT",
  "avatar": "🤖",
  "color": "#6366f1",
  "agent": {
    "name": "Mon Agent",
    "role": "mon_agent",
    "description": "...",
    "systemPrompt": "Tu es un expert en...",
    "capabilities": ["read_project_file", "reasoning_think"],
    "tools": [],
    "maxConcurrency": 2,
    "defaultTimeoutMs": 60000,
    "triggerKeywords": ["review", "audit"]
  }
}
```

**Réponse `200`** :
```json
{
  "success": true,
  "package": { /* MarketplacePackage */ },
  "securityReport": {
    "trustLevel": "community",
    "score": 94,
    "warnings": [],
    "flags": [],
    "summary": "Aucun problème détecté. Paquet approuvé."
  }
}
```

**Réponse `422`** si des flags critiques bloquent la publication.

---

### `POST /api/marketplace/rate`

Soumet un avis sur un paquet et recalcule la note moyenne.

**Corps** :
```json
{
  "packageId": "code-reviewer-pro",
  "rating": 5,
  "comment": "Excellent agent, très utile au quotidien !",
  "author": "dev_pro_42"
}
```

**Réponse `200`** :
```json
{ "success": true, "newRating": 4.8, "reviewCount": 128 }
```

---

### `POST /api/marketplace/validate-security`

Lance le scan de sécurité sur un brouillon de paquet **sans** le publier. Utile pour un aperçu avant soumission.

**Corps** : identique à `POST /api/marketplace/publish`

**Réponse `200`** :
```json
{
  "success": true,
  "securityReport": {
    "trustLevel": "community",
    "analyzedAt": "2026-09-01T12:00:00.000Z",
    "score": 94,
    "warnings": [],
    "flags": [],
    "summary": "Aucun problème détecté."
  }
}
```

---

### `GET /api/marketplace/export/:id`

Télécharge un paquet complet au format JSON avec en-tête `Content-Disposition: attachment`.

**Réponse** : Fichier JSON avec nom `{id}-v{version}.leanna.json`

---

### Schéma `MarketplacePackage`

```typescript
interface MarketplacePackage {
  id: string;                    // Slug unique (ex: "code-reviewer-pro")
  name: string;                  // Nom affiché
  description: string;           // Description courte ≤ 200 chars
  readme?: string;               // README Markdown
  type: "agent" | "skill" | "bundle";
  category: MarketplaceCategory; // "code" | "devops" | "web" | ...
  tags: string[];
  version: string;               // Semver (ex: "2.1.0")
  versions: string[];            // Historique des versions
  author: string;
  license: string;
  avatar: string;                // Emoji
  color: string;                 // Hex (#rrggbb)
  agent?: PackageAgentDefinition;
  skills?: PackageSkillDefinition[];
  security: {
    trustLevel: "verified" | "community" | "unreviewed" | "flagged";
    score: number;               // 0–100
    warnings: string[];
    flags: string[];             // Problèmes critiques
    summary: string;
    analyzedAt: string;
  };
  stats: {
    downloads: number;
    installs: number;
    rating: number;              // Moyenne 0–5
    reviewCount: number;
    weeklyDownloads: number;
  };
  reviews: Array<{
    id: string;
    author: string;
    rating: number;              // 1–5
    comment: string;
    createdAt: string;
    helpful: number;
  }>;
  publishedAt: string;
  updatedAt: string;
  featured: boolean;
  verified: boolean;
  _installed?: boolean;          // Enrichissement serveur — non persisté
}
```

---

### Niveaux de confiance sécurité

| Niveau | Couleur | Condition |
| :--- | :--- | :--- |
| `verified` | Vert | Certifié par l'équipe Leanna, score ≥ 95 |
| `community` | Bleu | Validé par la communauté, score ≥ 80, aucun flag |
| `unreviewed` | Gris | Non encore analysé |
| `flagged` | Rouge | Flags critiques détectés — installation bloquée |

**Patterns de sécurité analysés** (12 règles) :
- Prompt injection (`ignore previous instructions`)
- Utilisation de `eval()`
- Accès aux variables d'environnement (`process.env`)
- Import `child_process` ou appels `exec`/`execSync`
- Commandes destructives (`sudo`, `rm -rf`)
- Opérations SQL destructives (`DROP TABLE`, `TRUNCATE`)
- Tentatives de role-jailbreak (`act as`, `pretend you are`)
- Références à des secrets/tokens hardcodés
- Requêtes HTTP externes non Leanna
- Décodage base64 suspect

