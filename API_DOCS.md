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
  "content": "{\n  \"name\": \"Leanna\",\n  \"version\": \"0.6.0\"\n}"
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
Téléverse et extrait le contenu textuel d'un document (PDF, TXT, MD, Code, Image) pour l'associer au notebook.

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
