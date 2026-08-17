# 🧠 Jarvis-OS — Assistant IA de Gestion Documentaire

<img src="assets/images/header.png" alt="Jarvis-OS" />

Jarvis-OS est un assistant intelligent spécialisé dans la **gestion de documents**. Il permet de créer, structurer, organiser et améliorer tous types de documents professionnels : MVPs, rapports de conception, cahiers des charges, spécifications techniques, plans de projet, notes de recherche et documentation. Piloté par l'IA (Gemini), il offre une interaction multimodale (voix, texte, vision) pour accélérer la production documentaire.

---

## 🛡️ Badges

[![Version](https://img.shields.io/badge/version-0.5.0-blue)](https://github.com/yourusername/Jarvis-os-original/releases)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](#)
[![License](https://img.shields.io/badge/license-MIT-green)](CONTRIBUTING.md#licence)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.12.0-brightgreen)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## ✨ Fonctionnalités Principales

### 📄 Gestion de Documents

- **Création assistée** : Génération de documents structurés (MVPs, rapports, specs, plans) à partir d'instructions simples
- **Templates intelligents** : Modèles pré-configurés pour chaque type de document
- **Édition collaborative** : Modifications ciblées avec historique des versions
- **Structuration automatique** : Table des matières, numérotation, hiérarchie des sections
- **Export multi-format** : Markdown, PDF, DOCX, texte brut

### 📋 Types de Documents Supportés

| Type | Description |
| :--- | :--- |
| **MVP** | Document de vision produit minimum viable |
| **Rapport de conception** | Architecture, choix techniques, diagrammes |
| **Cahier des charges** | Exigences fonctionnelles et non-fonctionnelles |
| **Spécification technique** | API, schémas de données, protocoles |
| **Plan de projet** | Jalons, livrables, planning |
| **Note de recherche** | Synthèse, état de l'art, analyse comparative |
| **Documentation** | Guides utilisateur, tutoriels, README |
| **Roadmap** | Feuille de route avec phases et objectifs |

### 🧠 Moteur de Connaissance (Knowledge Engine)

- **Indexation documentaire** : Graphe de relations entre documents, sections et concepts
- **Recherche sémantique** : Recherche intelligente dans la base documentaire sans API externe
- **Analyse de cohérence** : Détection de contradictions ou doublons entre documents
- **Apprentissage** : Accumulation des conventions d'écriture et préférences de style
- **Dashboard** : Visualisation de la base documentaire et de ses relations

### 🎙️ Assistant Multimodal (Gemini Live)

- **Dictée vocale** : Rédaction de documents par la voix en temps réel
- **Vision par webcam** : Analyse de documents physiques ou de schémas manuscrits
- **Partage d'écran** : Capture et interprétation de contenu visuel
- **Chat textuel** : Interface de conversation avec historique et commandes
- **Résumé automatique** : Compression intelligente du contexte conversationnel

### 🤖 Système Multi-Agents Documentaires

Jarvis-OS dispose de **7 agents spécialisés** exclusivement dédiés à la rédaction et au traitement de documents :

| Agent | Rôle | Capacité |
| :--- | :--- | :--- |
| ✍️ **Rédacteur** (`writer`) | Rédaction de documents complets | Lecture/Écriture |
| 🎨 **Mise en Forme** (`formatter`) | Formatage Markdown, tables, TOC, structure | Lecture/Écriture |
| 🔍 **Recherche** (`researcher`) | Collecte d'infos, vérification de faits, sources | Lecture seule |
| ✅ **Correcteur** (`proofreader`) | Orthographe, grammaire, style, cohérence | Lecture/Écriture |
| 🌐 **Traducteur** (`translator`) | Traduction et localisation multilingue | Lecture/Écriture |
| 📋 **Synthèse** (`summarizer`) | Résumés exécutifs, abstracts, condensés | Lecture/Écriture |
| 📐 **Planificateur** (`planner`) | Plans, outlines, structures de documents | Lecture seule |

**Patterns de collaboration prédéfinis :**

- `document-complet` : Planificateur → Rédacteur → Correcteur → Mise en Forme
- `traduction-verifiee` : Rédacteur → Traducteur → Correcteur
- `recherche-redaction` : Recherche → Planificateur → Rédacteur → Correcteur

**Délégation automatique** : Chaque agent peut déléguer à un autre selon une matrice de compétences (ex. rédaction terminée → correction automatique).

### ⚙️ Automatisation & Workflows

- **Workflows documentaires** : Chaînes de traitement orchestrées (rédaction → relecture → mise en forme → export)
- **Orchestration multi-agents** : Exécution parallèle ou séquentielle avec dépendances entre tâches
- **Tâches planifiées** : Génération récurrente de rapports ou mises à jour
- **Versionning** : Suivi des modifications avec possibilité de rollback
- **Agent Builder** : Interface visuelle pour créer des agents documentaires personnalisés

### 🔌 Passerelle MCP (Model Context Protocol)

- **Connexion à chaud** : Ajout de serveurs MCP externes sans redémarrage
- **Outils documentaires** : Invocation d'outils spécialisés (traduction, résumé, extraction)
- **Interface de gestion** : Panneau UI pour configurer les serveurs MCP

### 🔐 Sécurité & Audit

- **Authentification API** : Protection des endpoints via jeton `x-jarvis-token`
- **Isolation** : Les modifications IA sont isolées dans un bac à sable avant validation
- **Log d'audit** : Enregistrement de toutes les actions documentaires
- **Chiffrement** : Données sensibles protégées

### 💾 Persistance (Supabase — optionnel)

- **Historique** : Conservation et reprise des sessions
- **Mémoire long terme** : Stockage des préférences et décisions éditoriales
- **Base documentaire** : Indexation et recherche dans tous les documents créés

---

## 📋 Prérequis

- **Node.js** : Version `>= 22.12.0`
- **npm** : Version `>= 10.x`
- **Clé API Gemini** : Un compte Google AI Studio valide
- **Compte Supabase** (Optionnel) : Pour la persistance et la mémoire long terme

---

## 📦 Installation

```bash
# 1. Cloner le dépôt
git clone https://github.com/yourusername/Jarvis-os-original.git
cd Jarvis-os-original

# 2. Installer les dépendances
npm install

# 3. Configurer l'environnement
cp .env.example .env
# --> Ouvrir .env et renseigner au minimum GEMINI_API_KEY
```

---

## ⚙️ Configuration (.env)

| Variable | Description | Obligatoire |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Clé API pour le modèle principal Gemini | **Oui** |
| `JARVIS_API_TOKEN` | Jeton pour sécuriser les appels API | Recommandé |
| `SUPABASE_URL` | URL de l'API REST Supabase | Non |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé secrète Supabase | Non |
| `VITE_SERVER_PORT` | Port d'écoute (défaut : 5000) | Non |

---

## 🚀 Lancement

### Mode Développement (Web)
```bash
npm run dev
```
Interface accessible sur `http://localhost:5000`.

### Mode Desktop (Electron)
```bash
npm run desktop:debug
```

### Mode Production
```bash
npm run build
npm start
```

---

## 📁 Structure du Projet

```
Jarvis-os-original/
├── assets/                  # Ressources statiques (images, icônes)
├── electron/                # Cycle de vie Electron (main, preload, splash)
├── server/                  # Backend Node.js / Express
│   ├── agents/              # Orchestrateur & 7 agents documentaires spécialisés
│   ├── autonomy/            # Superviseur de boucle autonome
│   ├── knowledge/           # Base de connaissances, recherche sémantique
│   ├── mcp/                 # Bridge MCP (stdio/SSE)
│   ├── mission/             # Planification de missions documentaires
│   ├── routes/              # Endpoints REST
│   ├── runtime/             # Runtime (ToolRegistry, Prompts, AgentPlugins)
│   ├── skills/              # Skills intégrées (rédaction, recherche, mémoire)
│   ├── utils/               # Sandbox, validation, crypto
│   └── workflows/           # Moteur de workflows documentaires
├── src/                     # Interface utilisateur React
│   ├── components/          # Composants UI (éditeur, panels, visualiseurs)
│   ├── context/             # États partagés
│   ├── hooks/               # Hooks React
│   ├── services/            # Clients HTTP vers le backend
│   └── views/               # Vues principales
└── supabase/                # Schémas SQL
```

---

## 🤝 Contribuer

Les contributions sont les bienvenues ! Consultez [CONTRIBUTING.md](CONTRIBUTING.md) pour le workflow et les standards.

---

## 📄 Licence

Ce projet est distribué sous licence MIT.
