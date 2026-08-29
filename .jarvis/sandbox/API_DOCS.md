# API Documentation - Jarvis OS

## Sommaire

- [Apercu general](#-apercu-general)
- [Authentification](#-authentification)
- [Endpoints REST](#-endpoints-rest)
  - [Health](#health)
  - [IDE](#ide)
  - [Agents](#agents)
  - [Notebooks](#notebooks)
  - [Knowledge](#knowledge)
  - [Automation](#automation)
  - [Workspace](#workspace)
  - [Memories](#memories)
  - [Conversations](#conversations)
  - [Documents](#documents)
  - [Skills](#skills)
  - [Profile](#profile)
  - [Workflow](#workflow)
  - [GitHub](#github)
  - [MCP](#mcp)
  - [Sandbox](#sandbox)
  - [Checkpoint](#checkpoint)
  - [Browser](#browser)
  - [Export](#export)
  - [Gemini Keys](#gemini-keys)
  - [Tokens Optimization](#tokens-optimization)
  - [TTS](#tts)
  - [Lists](#lists)
  - [Safeguards](#safeguards)
  - [Custom Skills](#custom-skills)
  - [OpenRouter](#openrouter)
- [WebSocket API](#-websocket-api)
- [Rate Limiting](#-rate-limiting)
- [Codes de reponse](#-codes-de-reponse)

---

## Apercu general

L'API de Jarvis OS est composee de **32+ groupes de routes REST** exposees sous le prefixe `/api/`.

- **Base URL** : `http://localhost:5000/api/` (dev) ou selon `VITE_SERVER_PORT`
- **Format** : JSON pour les requetes et reponses
- **Authentification** : Header `x-jarvis-token` ou cookie `jarvis_token`
- **CORS** : Configure pour permettre les requetes depuis `http://localhost:*`

Toutes les routes **sauf `/api/health`** requierent une authentification quand `JARVIS_API_TOKEN` est configure.

---

## Authentification

### Header HTTP
```bash
curl -X GET http://localhost:5000/api/ide/tree \
  -H 'x-jarvis-token: votre_token'
```

### Cookie
```bash
curl -X GET http://localhost:5000/api/ide/tree \
  -H 'Cookie: jarvis_token=votre_token'
```

### Configuration du token
Le token est configure dans `.env` :
```
JARVIS_API_TOKEN=votre_token_secret
VITE_JARVIS_API_TOKEN=votre_token_secret  # Pour le frontend
```

> **Securite** : Si `JARVIS_LISTEN_HOST=0.0.0.0`, un token est **obligatoire**.

---

## Endpoints REST

### Health

**Route** : `/api/health`

| Methode | Description | Auth |
|---------|-------------|------|
| GET | Verifier l etat du serveur | Non |

**Reponse** :
```json
{
  "status": "ok"
}
```

---

### IDE

**Route** : `/api/ide`

Operations de gestion de fichiers et de l environnement IDE.

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/tree` | Obtenir l arbre des fichiers du workspace |
| GET | `/tree-workspace` | Obtenir l arbre du workspace (ignore sandbox) |
| GET | `/file` | Lire un fichier (query: `path`) |
| GET | `/file-raw` | Lire un fichier binaire (images, etc.) |
| POST | `/file` | Sauvegarder un fichier |
| POST | `/create-file` | Creer un nouveau fichier |
| POST | `/create-directory` | Creer un dossier |
| POST | `/rename` | Renommer/deplacer un fichier |
| POST | `/copy` | Copier un fichier/dossier |
| POST | `/search` | Recherche dans les fichiers |
| DELETE | `/file` | Supprimer un fichier/dossier |

**Request (POST /file)** :
```json
{
  "path": "src/components/Example.tsx",
  "content": "const Example = () => {};"
}
```

**Request (POST /search)** :
```json
{
  "query": "function getData",
  "caseSensitive": false,
  "regex": false,
  "filePattern": ".tsx"
}
```

---

### Agents

**Route** : `/api/agents`

Gestion des agents autonomes et de l orchestration multi-agents.

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/` | Liste de tous les agents disponibles |
| GET | `/status` | Etat des agents actifs |
| POST | `/execute` | Executer une tache avec un agent |
| POST | `/delegate` | Deleguer une tache a un agent specialise |
| GET | `/history` | Historique des executions |
| DELETE | `/:taskId/cancel` | Annuler une tache en cours |

**Request (POST /execute)** :
```json
{
  "agentId": "coder",
  "task": "Implémenter une fonction de calcul",
  "context": {
    "file": "src/utils/math.ts",
    "language": "typescript"
  }
}
```

---

### Notebooks

**Route** : `/api/notebooks`

Gestion complete des notebooks RAG (style NotebookLM).

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/` | Liste de tous les notebooks |
| POST | `/` | Creer un nouveau notebook |
| GET | `/:id` | Obtenir un notebook |
| PUT | `/:id` | Mettre a jour un notebook |
| DELETE | `/:id` | Supprimer un notebook |
| GET | `/:id/sources` | Liste des sources |
| POST | `/:id/sources/upload` | Upload une source |
| DELETE | `/:id/sources/:sourceId` | Supprimer une source |
| GET | `/:id/chat` | Obtenir l historique du chat |
| POST | `/:id/chat` | Envoyer un message |
| DELETE | `/:id/chat` | Effacer l historique |
| GET | `/:id/notes` | Liste des notes |
| POST | `/:id/notes` | Creer une note |
| POST | `/:id/generate` | Generer du contenu |
| GET | `/:id/embeddings` | Etat des embeddings |
| POST | `/:id/embeddings/reindex` | Re-indexer les embeddings |
| POST | `/:id/backup` | Sauvegarde manuelle |

**Sub-routes** :
- `/api/notebooks/:id/chat` → Chat en temps reel
- `/api/notebooks/:id/embeddings/reindex` → Re-indexation (rate limited)
- `/api/notebooks/:id/sources/upload` → Upload de sources (rate limited)

**Request (POST /:id/chat)** :
```json
{
  "message": "Quels sont les points clés de ce document ?",
  "sourceIds": ["src1", "src2"],
  "options": {
    "personality": "academic",
    "includeSources": true
  }
}
```

---

### Knowledge

**Route** : `/api/knowledge`

Moteur de connaissances et d indexation du projet.

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/status` | Etat de l indexation |
| POST | `/index` | Demarrer l indexation manuelle |
| GET | `/search` | Recherche semantique |
| GET | `/graph` | Obtenir le graphe de connaissances |
| POST | `/analyze-impact` | Analyser l impact d une modification |
| GET | `/memory` | Obtenir la memoire du projet |
| POST | `/memory` | Mettre a jour la memoire |

**Sub-routes** :
- `/api/knowledge/understanding` → Moteur de comprehension
- `/api/knowledge/memory` → Mémoire projet
- `/api/knowledge/impact` → Analyse d impact

---

### Automation

**Route** : `/api/automation`

Gestion des taches planifiees et de l automatisation.

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/tasks` | Liste des taches planifiees |
| POST | `/tasks` | Creer une nouvelle tache |
| GET | `/tasks/:id` | Obtenir une tache |
| PUT | `/tasks/:id` | Mettre a jour une tache |
| DELETE | `/tasks/:id` | Supprimer une tache |
| POST | `/tasks/:id/run` | Executer une tache immediate |
| POST | `/tasks/:id/enable` | Activer une tache |
| POST | `/tasks/:id/disable` | Desactiver une tache |

---

### Workspace

**Route** : `/api/workspace`

Gestion de l environnement de travail.

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/root` | Obtenir la racine du workspace |
| POST | `/root` | Changer la racine du workspace |
| GET | `/stats` | Statistiques du workspace |
| POST | `/scan` | Scanner le workspace |

---

### Memories

**Route** : `/api/memories`

Memoire long terme basee sur Supabase.

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/` | Liste de toutes les memories |
| POST | `/` | Creer une nouvelle memoire |
| DELETE | `/:id` | Supprimer une memoire |
| DELETE | `/all` | Supprimer toutes les memories |

---

### Conversations

**Route** : `/api/conversations`

Historique des conversations avec l IA.

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/` | Liste de toutes les conversations |
| POST | `/` | Creer une nouvelle conversation |
| GET | `/:id` | Obtenir une conversation |
| PUT | `/:id` | Mettre a jour une conversation |
| DELETE | `/:id` | Supprimer une conversation |
| POST | `/:id/export` | Exporter une conversation |

---

### Documents

**Route** : `/api/documents`

Gestion des documents et analyse documentaire.

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/` | Liste de tous les documents |
| POST | `/upload` | Upload un document |
| GET | `/:id` | Obtenir un document |
| DELETE | `/:id` | Supprimer un document |
| POST | `/:id/analyze` | Analyser un document |
| POST | `/:id/summarize` | Resumer un document |

---

### Skills

**Route** : `/api/skills`

Registry des outils IA disponibles.

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/` | Liste de toutes les skills |
| GET | `/:name` | Obtenir une skill specifique |
| GET | `/:name/tools` | Liste des outils d une skill |

---

### Profile

**Route** : `/api/profile`

Gestion du profil utilisateur et des preferences.

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/` | Obtenir le profil courant |
| POST | `/` | Mettre a jour le profil |

**Request (POST /)** :
```json
{
  "aiName": "Leanna",
  "aiVoice": "Aoede",
  "userName": "John Doe",
  "userRole": "Developer",
  "language": "fr",
  "responseStyle": "balanced",
  "theme": "dark",
  "accentColor": "#6366f1"
}
```

---

### Workflow

**Route** : `/api/workflows`

Moteur de workflows documentaires.

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/` | Liste de tous les workflows |
| POST | `/` | Creer un nouveau workflow |
| GET | `/:id` | Obtenir un workflow |
| PUT | `/:id` | Mettre a jour un workflow |
| DELETE | `/:id` | Supprimer un workflow |
| POST | `/:id/execute` | Executer un workflow |
| POST | `/:id/stop` | Arreter un workflow |

---

### GitHub

**Route** : `/api/github`

Integration avec GitHub.

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/repos` | Liste des repositories |
| GET | `/repos/:owner/:repo` | Obtenir un repository |
| GET | `/repos/:owner/:repo/issues` | Liste des issues |
| GET | `/repos/:owner/:repo/pulls` | Liste des pull requests |
| POST | `/repos/:owner/:repo/issues` | Creer une issue |

---

### MCP

**Route** : `/api/mcp`

Gestion des serveurs MCP (Model Context Protocol).

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/servers` | Liste des serveurs MCP |
| POST | `/servers` | Ajouter un serveur MCP |
| DELETE | `/servers/:id` | Supprimer un serveur MCP |
| POST | `/servers/:id/connect` | Connecter a un serveur |
| POST | `/servers/:id/disconnect` | Deconnecter |
| GET | `/servers/:id/resources` | Liste des ressources |
| POST | `/servers/:id/tools/:toolName` | Appeler un outil |

---

### Sandbox

**Route** : `/api/sandbox`

Gestion de l environnement sandbox isole.

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/status` | Etat du sandbox |
| POST | `/init` | Initialiser le sandbox |
| POST | `/activate` | Activer le sandbox |
| POST | `/deactivate` | Desactiver le sandbox |
| POST | `/sync` | Synchroniser sandbox -> workspace |
| GET | `/modified` | Liste des fichiers modifies |
| POST | `/reset` | Reinitialiser le sandbox |

---

### Checkpoint

**Route** : `/api/checkpoint`

Gestion des checkpoints Git pour la securite.

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/status` | Etat des checkpoints |
| POST | `/create` | Creer un checkpoint |
| POST | `/restore/:id` | Restaurer un checkpoint |
| GET | `/list` | Liste des checkpoints |
| DELETE | `/:id` | Supprimer un checkpoint |

---

### Browser

**Route** : `/api/browser`

Integration du navigateur embarque.

| Methode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/navigate` | Naviguer vers une URL |
| POST | `/search` | Recherche web |
| POST | `/action` | Action browser (click, type, etc.) |
| POST | `/content-result` | Resultat de la lecture de page |
| POST | `/action-result` | Resultat d une action browser |
| POST | `/screenshot` | Capture d ecran |

---

### Export

**Route** : `/api/export`

Export de donnees dans differents formats.

| Methode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/markdown` | Exporter en Markdown |
| POST | `/pdf` | Exporter en PDF |
| POST | `/docx` | Exporter en DOCX |
| POST | `/html` | Exporter en HTML |

---

### Gemini Keys

**Route** : `/api/gemini-keys`

Gestion du pool de cles API Gemini.

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/` | Liste des cles configurees |
| POST | `/` | Ajouter une nouvelle cle |
| DELETE | `/:id` | Supprimer une cle |
| POST | `/:id/test` | Tester une cle |
| POST | `/rotate` | Rotation manuelle des cles |

---

### Tokens Optimization

**Route** : `/api/tokens-optimization`

Optimisation de l utilisation des tokens.

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/stats` | Statistiques d utilisation |
| POST | `/optimize` | Optimiser la consommation |
| GET | `/limits` | Obtenir les limites |

---

### TTS

**Route** : `/api/tts`

Synthese vocale (Text-to-Speech).

| Methode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/speak` | Generer un discours |
| POST | `/stop` | Arreter la lecture |

**Request (POST /speak)** :
```json
{
  "text": "Bonjour, comment puis-je vous aider ?",
  "voice": "Aoede",
  "speed": 1.0,
  "language": "fr"
}
```

---

### Lists

**Route** : `/api/lists`

Gestion des listes et to-do.

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/` | Liste de toutes les listes |
| POST | `/` | Creer une nouvelle liste |
| GET | `/:id` | Obtenir une liste |
| PUT | `/:id` | Mettre a jour une liste |
| DELETE | `/:id` | Supprimer une liste |
| POST | `/:id/items` | Ajouter un element |
| DELETE | `/:id/items/:itemId` | Supprimer un element |

---

### Safeguards

**Route** : `/api/safeguards`

Configuration des garde-fous de securite.

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/` | Liste des garde-fous |
| POST | `/` | Mettre a jour les garde-fous |
| GET | `/critical-files` | Liste des fichiers critiques |

---

### Custom Skills

**Route** : `/api/custom-skills`

Gestion des skills personnalisees par l utilisateur.

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/` | Liste des custom skills |
| POST | `/` | Creer une custom skill |
| GET | `/:id` | Obtenir une custom skill |
| PUT | `/:id` | Mettre a jour une custom skill |
| DELETE | `/:id` | Supprimer une custom skill |

---

### OpenRouter

**Route** : `/api/openrouter`

Configuration OpenRouter pour les modeles alternatifs.

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/config` | Configuration actuelle |
| POST | `/config` | Mettre a jour la configuration |
| GET | `/models` | Liste des modeles disponibles |

---

## WebSocket API

### Connexion

```javascript
const socket = new WebSocket('ws://localhost:5000/live?token=votre_token');
```

### Types de messages

#### Client -> Serveur

```typescript
// Message texte
{
  type: 'text',
  text: 'Explique moi ce code'
}

// Message audio
{
  type: 'audio',
  audio: Blob  // Audio data
}

// Frame video (screen share)
{
  type: 'video_frame',
  frame: Blob  // Video frame
}

// Action
{
  type: 'action',
  action: {
    type: 'open-file',
    path: 'src/main.tsx'
  }
}
```

#### Serveur -> Client

```typescript
// Reponse
{
  type: 'response',
  response: 'Voici l explication...',
  sources: [{ id: 'src1', citation: '...' }],
  tokensUsed: 150
}

// Progression
{
  type: 'progress',
  progress: 45,
  stage: 'Analyse du code'
}

// Erreur
{
  type: 'error',
  error: 'Fichier introuvable',
  code: 'NOT_FOUND'
}

// Evenement
{
  type: 'event',
  event: {
    type: 'agent_started',
    agentId: 'coder',
    taskId: 'task_123'
  }
}
```

### Endpoints WebSocket

| Endpoint | Description |
|----------|-------------|
| `/live` | Communication principale IA <-> Frontend |
| `/sandbox-watch` | Surveillance des fichiers sandbox en temps reel |
| `/mcp` | Communication MCP (optionnel) |

---

## Rate Limiting

Jarvis OS implemente un **rate limiting multi-couche** pour proteger contre les abus.

### Limiteurs globaux

| Endpoint | Limite | Fenetre | Type |
|----------|--------|---------|------|
| `/api/*` (global) | 100 req/min | 1 minute | Strict |
| `/api/ide/file` (write) | 30 req/min | 1 minute | Strict |
| `/api/notebooks/*/chat` | 30 req/min | 1 minute | Strict |
| `/api/notebooks/*/embeddings/reindex` | 50 req/5min | 5 minutes | Strict |
| `/api/health` | Non limite | - | - |

### Limiteurs de polling

| Endpoint | Limite | Fenetre |
|----------|--------|---------|
| `/api/ide/tree` | 5 req/sec | 1 seconde | Relaxed |
| `/api/agents/status` | 2 req/sec | 1 seconde | Relaxed |

### Configuration

Voir `server/config/rateLimits.ts` pour les details de configuration.

---

## Codes de reponse

| Code | Description | Cause typique |
|------|-------------|--------------|
| 200 | Succes | Requete traitee avec succes |
| 201 | Cree | Ressource creee |
| 400 | Mauvaise requete | Parametres manquants ou invalides |
| 401 | Non autorise | Token manquant ou invalide |
| 403 | Interdit | Acces refuse (sandbox, RLS) |
| 404 | Non trouve | Ressource inexistante |
| 409 | Conflit | Ressource deja existante |
| 429 | Trop de requetes | Rate limit depasse |
| 500 | Erreur interne | Erreur serveur |
| 503 | Service indisponible | Backend non disponible |

---

## Exemples d utilisation

### CURL - Lire un fichier

```bash
curl -X GET "http://localhost:5000/api/ide/file?path=src/main.tsx" \
  -H 'x-jarvis-token: votre_token'
```

### CURL - Envoyer un message au chat

```bash
curl -X POST "http://localhost:5000/api/notebooks/abc123/chat" \
  -H 'Content-Type: application/json' \
  -H 'x-jarvis-token: votre_token' \
  -d '{"message": "Resumer ce document"}'
```

### JavaScript - WebSocket

```javascript
const socket = new WebSocket('ws://localhost:5000/live?token=votre_token');

socket.onopen = () => {
  socket.send(JSON.stringify({
    type: 'text',
    text: 'Bonjour Leanna'
  }));
};

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Reponse:', data.response);
};
```

### TypeScript - Client API

Voir `src/services/ideApi.ts` pour un client type complet.
