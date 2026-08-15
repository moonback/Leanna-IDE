# 🏗️ Architecture Système — Jarvis-OS

Ce document présente l'architecture logicielle de Jarvis-OS. L'application est un IDE intelligent local reposant sur un serveur Node.js et une interface utilisateur React encapsulés dans Electron.

---

## 🗺️ Vue d'ensemble du flux de données

Le diagramme suivant illustre le flux d'informations et les interactions entre le client web/desktop, l'API backend, la base de données et les services d'intelligence artificielle externes.

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Développeur
    participant UI as Frontend (React / Monaco)
    participant Srv as Backend (Express API & WS)
    participant Box as Sandbox (.jarvis/sandbox)
    participant DB as Supabase (PostgreSQL)
    participant Gemini as Google Gemini Live API

    %% Flux conversationnel vocal/visuel
    Dev->>UI: Parle / Partage écran
    UI->>Srv: Stream audio/images (WS /live)
    Srv->>Gemini: Stream Bidirectionnel (WebSocket)
    Gemini->>Srv: Signal d'appel d'outil (Tool Call)
    
    %% Flux d'exécution d'un outil
    Srv->>Box: Opérations de fichiers isolées
    Box-->>Srv: Retourne les résultats
    Srv->>Gemini: Envoie le résultat de l'outil
    Gemini-->>Srv: Réponse textuelle ou audio
    Srv-->>UI: Restitue la réponse (Voix / Texte)
    
    %% Flux d'enregistrement et de validation
    Dev->>UI: Valide les changements (Bouton Sync)
    UI->>Srv: POST /api/sandbox/sync
    Srv->>Srv: Exécute validation (tsc / tests)
    alt Validation Réussie
        Srv->>Box: Copie les fichiers modifiés vers le workspace réel
        Srv->>DB: Enregistre l'historique et les mémoires (RAG)
        Srv-->>UI: Statut OK + Actualisation explorateur
    else Validation Échouée
        Srv-->>UI: Statut Erreur + Reste en Sandbox
    end
```

---

## 🎨 Frontend (Interface Utilisateur)

Le frontend est construit sous la forme d'une application monopage (SPA) optimisée pour le temps réel et l'édition de code.

### 1. Structure des composants
*   **IDE principal** : Encapsule les vues dans `src/views/`. Le coeur de l'IDE (`IdeView.tsx`) orchestre l'explorateur de fichiers virtualisé, le terminal interactif, et l'éditeur Monaco.
*   **Orb Control (`FloatingOrb.tsx`)** : Représente visuellement l'état de l'assistant (inactif, écoute, traitement, réponse). Contient les contrôles d'activation vocale.
*   **Panneaux latéraux (`UnifiedSidebar.tsx`)** : Gère la navigation entre l'IDE, l'Historique, les Workflows, GitHub, et les Paramètres.

### 2. Routage (Routing)
*   Géré par **React Router v7** (`react-router-dom`).
*   Le routage est principalement utilisé pour séparer l'interface de démarrage (`StartupProjectModal` / pas de projet actif) des vues de travail principales.

### 3. Gestion de l'état
*   **Contextes React** : Utilisés pour propager les flux globaux :
    - `LiveAPIContext` : Gère le socket vocal/vision avec Gemini Live.
    - `UserProfileContext` : Stocke le profil utilisateur actif.
*   **State local & Refs** : Monaco et xterm.js maintiennent leurs propres états internes synchronisés via des références pour des raisons de performance.

---

## ⚙️ Backend (API Express & Serveurs Websocket)

Le backend agit comme le pivot de sécurité et d'exécution locale. Il s'exécute sous Node.js et peut être embarqué dans le processus principal d'Electron.

### 1. Couches applicatives
*   **Routes REST (`server/routes/`)** : Déclarent les points d'accès HTTP standard pour l'IDE, Supabase, et la configuration.
*   **Skills / Outils (`server/skills/`)** : Implémentent les fonctions concrètes appelées par l'IA (lecture, écriture, git, puppeteer). Gérées par un `SkillManager`.
*   **Agent Runtime (`server/agents/` & `server/runtime/`)** : Planifie, orchestre, et distribue les tâches aux différents agents spécialisés via un bus de messages.
*   **Sandbox Engine (`server/utils/sandbox.ts`)** : Met en oeuvre l'isolation du système de fichiers et assure la validation du code (`tsc`, scripts).

### 2. Middlewares
*   `requireAuth` : Valide la présence et la conformité de l'en-tête `x-jarvis-token`.
*   `strictLimiter` / `authLimiter` : Limiteurs de débit Express pour se prémunir des attaques par force brute ou du flood de requêtes.
*   `express.json()` & `compression()` : Analyseurs de corps de requêtes et compression Gzip pour le transfert des fichiers Monaco.

### 3. Gestion des WebSockets
*   Le serveur Express monte des serveurs WebSocket (`ws`) sur des chemins distincts :
    - `/live` : Relaye directement les paquets audio binaires et les messages JSON d'outils entre le client et l'API Gemini Live.
    - `/terminal` : Relaye le flux d'entrée/sortie entre xterm.js et le processus PTY local.

---

## 🗄️ Base de données (Modèle & Migration)

### 1. Modèle relationnel simplifié
La base de données relationnelle s'appuie sur Supabase (PostgreSQL) et comporte deux blocs :
*   **Bloc RAG & Mémoire** : `memories` (avec extensions vectorielles PGVector pour le stockage des embeddings 768 dimensions).
*   **Bloc Historique & Automatisation** : `conversations`, `conversation_messages`, `lists`, `scheduled_tasks`, `workflows` et `custom_skills`.
*   **Bloc Agent Persistence** : `agent_tasks`, `agent_orchestrations` et `agent_messages`.

### 2. Stratégie de migration
*   Les scripts SQL bruts de création des tables sont conservés dans le dossier `supabase/`.
*   Lors du déploiement, ces scripts sont exécutés directement dans la console Supabase ou via le CLI Supabase.
*   Le backend intègre également une routine d'auto-migration pour créer les tables d'agent manquantes via `AgentPersistence.getMigrationSQL()`.

---

## 🔌 Intégrations et Services Externes

Jarvis-OS s'intègre à des API tierces pour offrir une expérience complète :
*   **Google Gemini Live API** : Moteur d'interaction multimodal en temps réel (WebSocket `/live`).
*   **Supabase** : Stockage persistant et recherche vectorielle (RAG).
*   **OpenRouter API** : Utilisé comme fournisseur alternatif de modèles de langage pour les tâches d'analyse complexes ou les plans d'agents secondaires.
*   **GitHub API** : Utilisé par l'IDE pour lister les dépôts, créer des Pull Requests et synchroniser le code directement à partir du token configuré (`GITHUB_TOKEN`).

---

## 💡 Décisions d'Architecture Majeures

### 1. Pourquoi ce stack (Vite/React + Node/Express + Electron) ?
*   **React + Monaco Editor** : Monaco (le moteur de VS Code) offre une édition de code de niveau professionnel directement dans le navigateur.
*   **Node.js local** : Requis pour utiliser des librairies système comme `node-pty` (indispensable pour un vrai terminal de commande) et Puppeteer.
*   **Vite en middleware d'Express** : Simplifie le déploiement local. L'ensemble de l'application (frontend + backend) démarre sur un seul port (5000), évitant ainsi les problèmes de CORS et simplifiant l'empaquetage Electron.

### 2. Le pattern Sandbox (Isolation avant écriture)
*   **Justification** : Donner un accès en écriture direct à un LLM sur le système de fichiers réel comporte de grands risques (destruction accidentelle, injection de code malveillant).
*   **Solution** : L'IA travaille exclusivement dans `.jarvis/sandbox/`. L'utilisateur dispose d'un outil de diff visuel interactif et doit valider manuellement l'application des changements vers le dépôt principal.

### 3. Migration vers le runtime V2 & SkillManagerV2
*   Le projet est en phase de transition d'une architecture monolithique (`SkillManager` historique) vers une architecture modulaire basée sur le `ToolRegistry` (`server/runtime/`). Cette transition permet un découpage plus propre des outils, l'enregistrement automatique des métriques d'exécution et un chargement paresseux plus efficace pour réduire la consommation de tokens.
