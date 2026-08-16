# 📝 Jarvis-OS — L'assistant IA de rédaction et d'édition documentaire
<img src="assets/images/header.png" alt="Jarvis-OS" />

Jarvis-OS est un système d'assistance à la **création, rédaction, relecture, mise en page et gestion de documents** piloté par l'IA. Il combine une interface de bureau immersive avec une interaction vocale et visuelle permanente basée sur l'API Gemini Live. Il permet d'importer instantanément n'importe quel projet local pour indexer, naviguer et éditer des documents structurés en toute sécurité au sein d'une Sandbox isolée, en déléguant les tâches complexes à une flotte d'agents éditoriaux autonomes spécialisés.

---

## 🛡️ Badges

[![Version](https://img.shields.io/badge/version-0.4.0-blue)](https://github.com/yourusername/Jarvis-os-original/releases)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](#)
[![License](https://img.shields.io/badge/license-MIT-green)](./CONTRIBUTING.md#licence)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.12.0-brightgreen)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

---

## ✨ Fonctionnalités Principales

### 📄 Orientées Document (Document-centric)
- **Rédaction assistée par IA** : Génération, développement et enrichissement de contenu Markdown, texte structuré, rapports, spécifications et cahiers des charges.
- **Relecture et correction automatique** : Orthographe, grammaire, ponctuation et syntaxe corrigées par un agent dédié.
- **Mise en page intelligente** : Structuration en sections logiques, génération de tables des matières, hiérarchie de titres, mise en forme de tableaux et listes.
- **Amélioration de style** : Reformulation, simplification, synthèse et harmonisation du registre de langue selon le public cible.
- **Fact-checking documentaire** : Vérification de cohérence et signalement des affirmations douteuses ou contradictoires.

### 🤖 Orientées Agent (Agent-centric)
- **Flotte d'agents éditoriaux** : 7 agents autonomes spécialisés travaillant en coordination sur vos documents.
- **Bac à Sable Sécurisé (Sandbox)** : Toutes les écritures de l'IA sont isolées dans `.jarvis/sandbox/` avant d'être appliquées au workspace réel.
- **Moteur de Connaissance** : Graphe de dépendances documentaires, recherche sémantique TF-IDF locale, mémoire longue-durée.
- **Conformité & Confidentialité** : Détection et signalement des données sensibles (RGPD, secrets, informations personnelles) avant publication.

### 🎙️ Orientées Utilisateur (User-centric)
- **Assistant Multimodal Gemini Live** : Interaction vocale fluide et vision par webcam/partage d'écran en temps réel via WebSocket.
- **Éditeur Monaco intégré** : Interface d'édition de documents avec coloration syntaxique Markdown, explorateur de fichiers et panneau de navigation.
- **Visualiseur Markdown** : Mode d'aperçu HTML enrichi avec bascule rapide éditeur ↔ rendu.
- **Palette de commandes** : Raccourcis clavier complets (`Ctrl+Shift+P`, `Ctrl+P`) pour piloter l'IDE sans souris.

### ⚙️ Orientées Administrateur (Admin-centric)
- **Passerelle MCP** : Connexion de serveurs d'outils externes (stdio ou SSE) avec reconnexion automatique.
- **Gestionnaire de Workflows** : Création et planification de suites d'actions automatisées persistées en base de données.
- **Skills Dynamiques** : Interface de création de compétences personnalisées pour étendre les capacités de l'IA.
- **Audit de traçabilité** : Enregistrement de toutes les actions et modifications dans un fichier de log.

---

## 🤖 Flotte d'Agents Éditoriaux

Jarvis-OS dispose d'une équipe de 7 agents autonomes dédiés à la création et à l'amélioration de documents :

| Agent | Rôle | Capacités |
| :--- | :--- | :--- |
| **Rédacteur** (`coder`) | Rédige, crée et édite les documents à la demande | Lecture, écriture, patch de fichiers |
| **Relecteur** (`test`) | Corrige l'orthographe, la grammaire et vérifie les faits | Lecture, correction ciblée |
| **Formatage** (`docs`) | Organise la structure, génère les tables des matières | Mise en page Markdown, navigation |
| **Styliste** (`refactor`) | Améliore le style, reformule et synthétise les textes | Réécriture, simplification |
| **Conformité** (`security`) | Détecte les données sensibles et vérifie la conformité | Audit en lecture seule |
| **Revue Critique** (`review`) | Évalue la logique et la cohérence argumentative | Analyse en lecture seule |
| **Structurateur** (`architect`) | Planifie les documents complexes, coordonne la flotte | Planification, délégation |

### Workflow de délégation automatique

```
Demande utilisateur
       │
       ▼
  Rédacteur ──────────────────────────────────► Fichier créé/modifié
       │                                               │
       ├── Texte rédigé ─────────────────────► Relecteur (orthographe, grammaire)
       │                                               │
       ├── Structure complexe ──────────────► Formatage (tables des matières, layout)
       │                                               │
       ├── Style à améliorer ──────────────► Styliste (reformulation, synthèse)
       │                                               │
       ├── Contenu sensible ───────────────► Conformité (RGPD, confidentialité)
       │                                               │
       └── Logique à valider ─────────────► Revue Critique (cohérence, arguments)
```

---

## 🛠️ Stack Technique

| Technologie | Rôle / Utilisation | Version |
| :--- | :--- | :--- |
| **Node.js** | Environnement d'exécution serveur (Backend) | `>= 22.12.0` |
| **Express** | Framework d'API REST et gestion des serveurs WebSocket | `^4.21.2` |
| **React** | Framework de construction de l'interface utilisateur | `^19.0.1` |
| **TypeScript** | Langage principal du backend (Mode strict) | `^5.0.0` |
| **Vite** | Outil de build rapide et serveur HMR frontend | `^6.2.3` |
| **Tailwind CSS** | Framework CSS utilitaire pour le design system | `^4.1.14` |
| **Electron** | Wrapper desktop pour l'exécution locale de bureau | `^43.1.0` |
| **Supabase JS** | Client de persistance des conversations et mémoire RAG | `^2.110.2` |
| **Monaco Editor** | Moteur d'édition de documents (identique à VS Code) | `^0.53.0` |
| **Google GenAI** | SDK officiel pour l'intégration de Gemini Live (WebSocket) | `^2.4.0` |
| **Puppeteer** | Automatisation navigateur pour la recherche documentaire | `^25.3.0` |

---

## 📋 Prérequis

- **Node.js** : Version `>= 22.12.0`
- **npm** : Version `>= 10.x`
- **Clé API Gemini** : Un compte Google AI Studio valide avec une clé d'API
- **Compte Supabase** *(Optionnel)* : Pour activer l'historique et la mémoire vectorielle RAG

---

## 📦 Installation

```bash
# 1. Cloner le dépôt de Jarvis-OS
git clone https://github.com/yourusername/Jarvis-os-original.git
cd Jarvis-os-original

# 2. Installer les dépendances du projet
npm install

# 3. Préparer le fichier de configuration d'environnement
cp .env.example .env
# --> Ouvrir le fichier .env et renseigner au minimum la variable GEMINI_API_KEY
```

---

## ⚙️ Configuration (.env)

| Variable | Description | Exemple | Obligatoire |
| :--- | :--- | :--- | :--- |
| `GEMINI_API_KEY` | Clé API requise pour le modèle Gemini principal | `AIzaSy...` | **Oui** |
| `OPENROUTER_API_KEY` | Clé pour d'autres modèles en fallback via OpenRouter | `sk-or-...` | Non |
| `JARVIS_API_TOKEN` | Jeton pour sécuriser les appels d'API | `mypassword123` | Recommandé |
| `SUPABASE_URL` | URL de l'API REST Supabase | `https://xyz.supabase.co` | Non (mémoire inactive) |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé secrète de rôle de service Supabase | `eyJhbGc...` | Non (mémoire inactive) |
| `VITE_SERVER_PORT` | Port d'écoute du serveur Node/Express | `5000` | Non (défaut : 5000) |
| `SANDBOX_EXIT_CODE` | Code à 6 chiffres pour sortir du mode sandbox | `123456` | Non |

> ⚠️ **Note Supabase** : `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` doivent être définies ensemble ou laissées vides toutes les deux.

---

## 🚀 Lancement de l'Application

### Mode Développement (Web)
```bash
npm run dev
```
Interface accessible à `http://localhost:5000`

### Mode Desktop (Electron)
```bash
npm run desktop
```

### Mode Desktop Débogage
```bash
npm run desktop:debug
```

### Mode Production
```bash
# Compiler le frontend et le serveur
npm run build

# Démarrer le serveur compilé
npm start
```

### Packaging Windows (.exe)
```bash
npm run dist:win
```

---

## 📁 Structure du Projet

```
Jarvis-os-original/
├── assets/                  # Ressources statiques (images, icônes)
├── electron/                # Configuration et cycle de vie Electron
│   ├── main.cjs             # Processus principal Electron
│   └── preload.cjs          # Script de pré-chargement Electron
├── server/                  # Backend Node.js / Express
│   ├── agents/              # Flotte d'agents éditoriaux et orchestration
│   │   ├── roles.ts         # Définitions des 7 agents éditoriaux spécialisés
│   │   └── ...              # Exécuteur, registre, persistance des tâches
│   ├── autonomy/            # Superviseurs de la boucle de décision autonome
│   ├── knowledge/           # Indexeur, graphe documentaire et recherche sémantique
│   ├── mcp/                 # Connexion et gestion des serveurs MCP externes
│   ├── mission/             # Décomposition, planification et réflexion de missions
│   ├── routes/              # Endpoints Express (REST)
│   ├── runtime/             # Runtime d'agents et prompts système (fichiers .md)
│   │   └── prompts/         # Instructions système modulaires par domaine
│   ├── skills/              # Déclarations et logique des outils du LLM
│   └── utils/               # Sandbox, checkpoints, cryptographie, self-root
├── src/                     # Interface utilisateur React
│   ├── components/          # Composants UI (IDE, settings, workflows)
│   ├── context/             # États globaux partagés (Live API, profils)
│   ├── hooks/               # Hooks React réutilisables
│   ├── services/            # Services de requête HTTP vers le backend
│   └── views/               # Vues majeures (IDE, Settings, Help)
└── supabase/                # Fichiers SQL de configuration des tables
```

---

## 📚 Documentation

| Document | Description |
| :--- | :--- |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Vue d'ensemble de l'architecture système |
| [API_DOCS.md](./API_DOCS.md) | Documentation des endpoints REST |
| [DB_SCHEMA.md](./DB_SCHEMA.md) | Schéma de base de données Supabase |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Guide de contribution et standards |
| [ROADMAP.md](./ROADMAP.md) | Feuille de route et fonctionnalités à venir |

---

## 🤝 Contribuer

Les contributions sont les bienvenues ! Consultez [CONTRIBUTING.md](./CONTRIBUTING.md) pour le workflow Git, les règles de commit et les standards de développement.

---

## 📄 Licence

> ⚠️ Ce projet utilise la licence MIT par défaut. Aucun fichier LICENSE officiel n'est présent à la racine du dépôt.
