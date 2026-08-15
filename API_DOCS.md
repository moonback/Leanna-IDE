# 📖 Référence API — Jarvis-OS

Cette documentation répertorie tous les points d'accès (endpoints) de l'API de Jarvis-OS. 

Toutes les requêtes de l'API (sauf `/api/health`) requièrent une authentification si un jeton de sécurité `JARVIS_API_TOKEN` est défini dans l'environnement.

---

## 🔐 Authentification & Sécurité

L'API utilise une authentification par jeton passée dans les en-têtes HTTP ou via les cookies pour les connexions WebSocket.

*   **Type d'authentification** : API Token (En-tête personnalisé)
*   **En-tête requis** : `x-jarvis-token`
*   **Cookie (WebSockets)** : `jarvis_token`
*   **Statut par défaut** : Si `JARVIS_API_TOKEN` n'est pas défini dans le fichier `.env`, l'authentification est désactivée et toutes les requêtes sont autorisées.
*   **Limiteur de débit (Rate Limiting)** : Les routes sensibles (comme l'authentification et l'évaluation de jetons) ont une limite stricte appliquée via Express Rate Limit.

---

## 🏥 Diagnostics & Métriques

### `GET /api/health`
*   **Description fonctionnelle** : Vérifie la santé globale du serveur.
*   **Authentification requise** : Non
*   **Paramètres** : Aucun
*   **Exemple de requête** :
    ```bash
    curl -X GET http://localhost:5000/api/health
    ```
*   **Réponse de succès (200 OK)** :
    ```json
    {
      "status": "ok"
    }
    ```

### `GET /api/workspace`
*   **Description fonctionnelle** : Retourne les informations sur le workspace actuel.
*   **Authentification requise** : Oui
*   **Paramètres** : Aucun
*   **Exemple de requête** :
    ```bash
    curl -X GET http://localhost:5000/api/workspace -H "x-jarvis-token: VOTRE_TOKEN"
    ```
*   **Réponse de succès (200 OK)** :
    ```json
    {
      "workspace": "C:\\Users\\Mayss\\Desktop\\Jarvis-os-ori",
      "exists": true,
      "selfReferential": true,
      "sandbox": false
    }
    ```

---

## 📁 Workspace & Gestion de Projets (Self-Root)

Ce domaine permet de gérer le répertoire de travail actif (`SELF_ROOT`) sur lequel l'IA peut opérer.

### `GET /api/self-root/status`
*   **Description fonctionnelle** : Récupère le statut du projet actif chargé.
*   **Authentification requise** : Oui
*   **Paramètres** : Aucun
*   **Réponse de succès (200 OK)** :
    ```json
    {
      "status": "ready",
      "root": "C:\\Users\\Mayss\\Desktop\\Jarvis-os-ori",
      "noProject": false,
      "gitStatus": {
        "clean": true,
        "branch": "main"
      }
    }
    ```

### `POST /api/self-root/change`
*   **Description fonctionnelle** : Bascule vers un projet existant à un chemin local donné.
*   **Authentification requise** : Oui
*   **Paramètres (Body JSON)** :
    | Nom | Type | Requis | Description |
    | :--- | :--- | :--- | :--- |
    | `path` | string | Oui | Chemin absolu du répertoire à ouvrir. |
    | `userConfirmed` | boolean | Non | Bypass de confirmation WebSocket pour l'interface graphique. |

*   **Exemple de requête** :
    ```json
    {
      "path": "C:\\Users\\Mayss\\Desktop\\MonAutreProjet",
      "userConfirmed": true
    }
    ```
*   **Réponse de succès (200 OK)** :
    ```json
    {
      "status": "success",
      "newRoot": "C:\\Users\\Mayss\\Desktop\\MonAutreProjet"
    }
    ```
*   **Réponses d'erreur** :
    *   `400 Bad Request` : Chemin invalide ou manquant.
    *   `403 Forbidden` : Refusé par l'utilisateur (si non confirmé).

### `POST /api/self-root/clear`
*   **Description fonctionnelle** : Réinitialise et ferme le projet actif, désactivant le sandbox et forçant le retour au modal de sélection.
*   **Authentification requise** : Oui
*   **Réponse de succès (200 OK)** :
    ```json
    {
      "status": "success"
    }
    ```

### `POST /api/self-root/new`
*   **Description fonctionnelle** : Crée un nouveau répertoire de projet vierge et l'active.
*   **Authentification requise** : Oui
*   **Paramètres (Body JSON)** :
    | Nom | Type | Requis | Description |
    | :--- | :--- | :--- | :--- |
    | `path` | string | Non | Chemin absolu du projet. Si vide, utilise le dossier Documents par défaut. |
    | `name` | string | Non | Nom du projet (requis si le chemin est absent). |

*   **Réponse de succès (200 OK)** :
    ```json
    {
      "status": "success",
      "newRoot": "C:\\Users\\Mayss\\Documents\\Jarvis-Projects\\nouveau_projet"
    }
    ```

### `POST /api/self-root/scaffold`
*   **Description fonctionnelle** : Initialise un projet structuré à partir d'un template (React Vite, Next.js, React Router). Stream les logs de création via Server-Sent Events (SSE).
*   **Authentification requise** : Oui
*   **Paramètres (Body JSON)** :
    | Nom | Type | Requis | Description |
    | :--- | :--- | :--- | :--- |
    | `framework` | string | Oui | `react-vite`, `react-vite-js`, `next` ou `react-router`. |
    | `name` | string | Oui | Nom du dossier à créer. |
    | `parent_path` | string | Oui | Chemin parent où créer le projet. |

*   **Format de streaming SSE** :
    ```text
    data: {"type":"log","level":"info","message":"Running npm create vite@latest..."}
    data: {"type":"complete","root":"C:\\chemin\\vers\\projet"}
    ```

---

## 🛡️ Sandbox & Checkpoints

Permet de manipuler la copie de travail isolée (Sandbox) et de gérer les sauvegardes locales automatiques (Checkpoints).

### `GET /api/sandbox/status`
*   **Description fonctionnelle** : Récupère le statut d'activation du sandbox.
*   **Authentification requise** : Oui
*   **Réponse de succès (200 OK)** :
    ```json
    {
      "status": "success",
      "sandbox": {
        "active": true,
        "path": "C:\\Users\\Mayss\\Desktop\\Jarvis-os-ori\\.jarvis\\sandbox"
      }
    }
    ```

### `GET /api/sandbox/diff`
*   **Description fonctionnelle** : Donne la liste des fichiers modifiés dans le sandbox par rapport au dépôt principal.
*   **Authentification requise** : Oui
*   **Réponse de succès (200 OK)** :
    ```json
    {
      "status": "success",
      "diff": [
        { "file": "src/App.tsx", "type": "modified" }
      ]
    }
    ```

### `POST /api/sandbox/init`
*   **Description fonctionnelle** : Initialise et active la copie sandbox pour le projet actuel.
*   **Authentification requise** : Oui
*   **Réponse de succès (200 OK)** :
    ```json
    {
      "status": "success",
      "sandbox": { "active": true }
    }
    ```

### `POST /api/sandbox/sync`
*   **Description fonctionnelle** : Synchronise toutes les modifications validées du sandbox vers le projet réel.
*   **Authentification requise** : Oui
*   **Réponse de succès (200 OK)** :
    ```json
    {
      "status": "success",
      "synchronizedFiles": ["src/App.tsx"]
    }
    ```

### `POST /api/sandbox/discard`
*   **Description fonctionnelle** : Annule et supprime toutes les modifications en cours dans le sandbox.
*   **Authentification requise** : Oui
*   **Réponse de succès (200 OK)** :
    ```json
    {
      "status": "success"
    }
    ```

### `GET /api/safeguards/checkpoints`
*   **Description fonctionnelle** : Récupère l'historique des checkpoints locaux de sauvegarde Git.
*   **Authentification requise** : Oui
*   **Paramètres (Query)** :
    | Nom | Type | Requis | Description |
    | :--- | :--- | :--- | :--- |
    | `limit` | integer | Non | Nombre maximum à retourner (par défaut 5). |

*   **Réponse de succès (200 OK)** :
    ```json
    {
      "checkpoints": [
        {
          "hash": "a1b2c3d4",
          "message": "Checkpoint avant modification de src/App.tsx",
          "date": "2026-08-15T20:30:00Z"
        }
      ]
    }
    ```

### `POST /api/safeguards/rollback`
*   **Description fonctionnelle** : Restaure le workspace à un checkpoint Git donné via son hash.
*   **Authentification requise** : Oui
*   **Paramètres (Body JSON)** :
    | Nom | Type | Requis | Description |
    | :--- | :--- | :--- | :--- |
    | `hash` | string | Oui | Le hash du checkpoint à restaurer. |

*   **Réponse de succès (200 OK)** :
    ```json
    {
      "success": true
    }
    ```

---

## 💻 Gestion de Fichiers (IDE)

### `GET /api/ide/tree`
*   **Description fonctionnelle** : Récupère l'arborescence complète des fichiers du projet (sandbox ou réel).
*   **Authentification requise** : Oui
*   **Réponse de succès (200 OK)** :
    ```json
    {
      "tree": [
        {
          "name": "src",
          "isDir": true,
          "children": [
            { "name": "App.tsx", "isDir": false, "sizeBytes": 1024 }
          ]
        }
      ]
    }
    ```

### `GET /api/ide/file`
*   **Description fonctionnelle** : Récupère le contenu d'un fichier spécifié.
*   **Authentification requise** : Oui
*   **Paramètres (Query)** :
    | Nom | Type | Requis | Description |
    | :--- | :--- | :--- | :--- |
    | `path` | string | Oui | Chemin relatif du fichier à charger. |

*   **Réponse de succès (200 OK)** :
    ```json
    {
      "content": "export default function App() { ... }"
    }
    ```

### `POST /api/ide/file`
*   **Description fonctionnelle** : Écrit ou modifie le contenu d'un fichier.
*   **Authentification requise** : Oui
*   **Paramètres (Body JSON)** :
    | Nom | Type | Requis | Description |
    | :--- | :--- | :--- | :--- |
    | `path` | string | Oui | Chemin relatif du fichier. |
    | `content` | string | Oui | Nouveau contenu complet. |

*   **Réponse de succès (200 OK)** :
    ```json
    {
      "status": "success",
      "path": "src/App.tsx"
    }
    ```

### `POST /api/ide/create-file`
*   **Description fonctionnelle** : Crée un nouveau fichier vide.
*   **Authentification requise** : Oui
*   **Paramètres (Body JSON)** :
    | Nom | Type | Requis | Description |
    | :--- | :--- | :--- | :--- |
    | `path` | string | Oui | Chemin relatif du fichier à créer. |

*   **Réponse de succès (200 OK)** :
    ```json
    {
      "status": "success"
    }
    ```

### `POST /api/ide/rename`
*   **Description fonctionnelle** : Renomme ou déplace un fichier/dossier.
*   **Authentification requise** : Oui
*   **Paramètres (Body JSON)** :
    | Nom | Type | Requis | Description |
    | :--- | :--- | :--- | :--- |
    | `oldPath` | string | Oui | Chemin actuel relatif. |
    | `newPath` | string | Oui | Nouveau chemin relatif. |

*   **Réponse de succès (200 OK)** :
    ```json
    {
      "status": "success"
    }
    ```

### `POST /api/ide/search`
*   **Description fonctionnelle** : Effectue une recherche textuelle globale dans les fichiers du projet.
*   **Authentification requise** : Oui
*   **Paramètres (Body JSON)** :
    | Nom | Type | Requis | Description |
    | :--- | :--- | :--- | :--- |
    | `query` | string | Oui | Terme ou regex à rechercher. |
    | `isRegex` | boolean | Non | Recherche par expression régulière. |
    | `caseSensitive` | boolean | Non | Sensibilité à la casse. |

*   **Réponse de succès (200 OK)** :
    ```json
    {
      "results": [
        { "file": "src/App.tsx", "line": 42, "text": "const user = ...;" }
      ]
    }
    ```

### `DELETE /api/ide/file`
*   **Description fonctionnelle** : Supprime un fichier ou répertoire.
*   **Authentification requise** : Oui
*   **Paramètres (Query)** :
    | Nom | Type | Requis | Description |
    | :--- | :--- | :--- | :--- |
    | `path` | string | Oui | Chemin relatif de l'élément à supprimer. |

*   **Réponse de succès (200 OK)** :
    ```json
    {
      "status": "success"
    }
    ```

---

## 🧠 Connaissance & Mémoire (Knowledge System)

### `GET /api/memory`
*   **Description fonctionnelle** : Liste toutes les mémoires utilisateur stockées dans la base de données.
*   **Authentification requise** : Oui
*   **Réponse de succès (200 OK)** :
    ```json
    {
      "status": "success",
      "memories": [
        { "id": "uuid", "content": "L'utilisateur préfère TypeScript strict.", "tags": ["pref"] }
      ]
    }
    ```

### `POST /api/memory`
*   **Description fonctionnelle** : Enregistre une nouvelle mémoire.
*   **Authentification requise** : Oui
*   **Paramètres (Body JSON)** :
    | Nom | Type | Requis | Description |
    | :--- | :--- | :--- | :--- |
    | `content` | string | Oui | Contenu de la mémoire. |
    | `tags` | array | Non | Liste de chaînes de tags associés. |

*   **Réponse de succès (200 OK)** :
    ```json
    {
      "status": "success",
      "memory": { "id": "uuid", "content": "..." }
    }
    ```

### `GET /api/memory/search`
*   **Description fonctionnelle** : Recherche sémantique dans les mémoires à l'aide d'embeddings.
*   **Authentification requise** : Oui
*   **Paramètres (Query)** :
    | Nom | Type | Requis | Description |
    | :--- | :--- | :--- | :--- |
    | `q` | string | Oui | Texte recherché. |
    | `limit` | integer | Non | Limite de résultats (défaut 5). |

*   **Réponse de succès (200 OK)** :
    ```json
    {
      "status": "success",
      "results": [
        { "id": "uuid", "content": "...", "similarity": 0.89 }
      ]
    }
    ```

### `DELETE /api/memory/:id`
*   **Description fonctionnelle** : Supprime une mémoire spécifique par son identifiant unique.
*   **Authentification requise** : Oui
*   **Réponse de succès (200 OK)** :
    ```json
    {
      "status": "success"
    }
    ```

---

## 🤖 Workflows & Skills Personnalisés

### `GET /api/workflows`
*   **Description fonctionnelle** : Récupère la liste de tous les workflows déclarés et leur statut.
*   **Authentification requise** : Oui
*   **Réponse de succès (200 OK)** :
    ```json
    {
      "status": "success",
      "workflows": [
        {
          "id": "wf-1",
          "name": "Audit de sécurité",
          "enabled": true,
          "steps": [...]
        }
      ]
    }
    ```

### `POST /api/workflows/:id/run`
*   **Description fonctionnelle** : Lance l'exécution immédiate d'un workflow par son ID.
*   **Authentification requise** : Oui
*   **Réponse de succès (200 OK)** :
    ```json
    {
      "status": "success",
      "result": { "status": "completed", "logs": [...] }
    }
    ```

### `POST /api/custom-skills`
*   **Description fonctionnelle** : Gère la création, modification, suppression ou lecture des skills personnalisés de l'IA.
*   **Authentification requise** : Oui
*   **Paramètres (Body JSON)** :
    | Nom | Type | Requis | Description |
    | :--- | :--- | :--- | :--- |
    | `action` | string | Oui | `list`, `create`, `update` ou `delete`. |
    | `name` | string | Non | Nom du skill (requis pour `create`). |
    | `description` | string | Non | Description pour l'IA (requis pour `create`). |
    | `parameters` | array | Non | Paramètres JSON du skill. |
    | `instruction` | string | Non | Instructions/Prompt pour l'IA. |
    | `id` | string | Non | ID du skill (requis pour `update` et `delete`). |

*   **Exemple (Création)** :
    ```json
    {
      "action": "create",
      "name": "generer_route_express",
      "description": "Génère une route express normalisée",
      "instruction": "Écris une route Express en TypeScript utilisant Zod..."
    }
    ```
*   **Réponse de succès (200 OK)** :
    ```json
    {
      "id": "uuid",
      "name": "generer_route_express",
      "enabled": true
    }
    ```

---

## 🔌 Model Context Protocol (MCP)

### `GET /api/mcp/servers`
*   **Description fonctionnelle** : Liste tous les serveurs MCP configurés, leurs statuts et configurations.
*   **Authentification requise** : Oui
*   **Réponse de succès (200 OK)** :
    ```json
    {
      "status": "success",
      "servers": [
        {
          "id": "mcp-server-1",
          "name": "Database Analyzer",
          "transport": "stdio",
          "status": "connected"
        }
      ]
    }
    ```

### `POST /api/mcp/servers`
*   **Description fonctionnelle** : Déclare et connecte un nouveau serveur MCP.
*   **Authentification requise** : Oui
*   **Paramètres (Body JSON)** :
    | Nom | Type | Requis | Description |
    | :--- | :--- | :--- | :--- |
    | `id` | string | Oui | Identifiant unique du serveur. |
    | `name` | string | Oui | Nom d'affichage. |
    | `transport` | string | Oui | `stdio` ou `sse`. |
    | `command` | string | Non | Commande d'exécution (obligatoire pour `stdio`). |
    | `args` | array | Non | Arguments de la commande. |
    | `url` | string | Non | URL de transport (obligatoire pour `sse`). |

*   **Réponse de succès (200 OK)** :
    ```json
    {
      "status": "success",
      "server": { "id": "mcp-server-1", "status": "connected" }
    }
    ```

### `POST /api/mcp/servers/:id/reconnect`
*   **Description fonctionnelle** : Force la tentative de reconnexion d'un serveur MCP donné.
*   **Authentification requise** : Oui
*   **Réponse de succès (200 OK)** :
    ```json
    {
      "status": "success",
      "server": { "id": "mcp-server-1", "status": "connected" }
    }
    ```
