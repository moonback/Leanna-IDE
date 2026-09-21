# Plan d'Action : Optimisation Leanna OS (Jarvis-os-ori)

> **Date :** Mars 2025  
> **Auteur :** Maysson / Leanna Multi-Agent System  
> **Version cible :** 1.1.x → 1.2.0  
> **Statut :** Planification validée  

---

## 1. Contexte & Métriques du Codebase

L'analyse du graphe de dépendances et de l'architecture a mis en lumière l'envergure du projet :
- **Volume :** ~602 fichiers sources, ~1.4M mots de code et documentation.
- **Topologie du graphe :** 5 639 nœuds, 12 121 arêtes et 280 communautés fonctionnelles.
- **Stack :** Electron 1.1.0 + React/Vite + Express/Node.js + Tailwind CSS.
- **Moteur temps réel :** Gemini Live WebSocket API, bus d'événements interne, TTS et Knowledge System.

---

## 2. Matrice des Chantiers Stratégiques

| Chantier | Action concrète | Cibles prioritaires | Priorité | Impact attendu |
| :--- | :--- | :--- | :---: | :--- |
| **Robustesse TypeScript** | Correction des erreurs de compilation en cours (TS6133, TS2353), suppression des variables inutilisées et typage strict sans `any`. | `server.ts`, `server/agents/brain/AgentBrain.ts` | **Haute** | Compilation propre, tests fiabilisés et CI/CD sans avertissement bloquant. |
| **Découplage des Hubs** | Allègement des « God Nodes » fortement connectés et rupture des dépendances circulaires entre routes Express, bus et agents. | `AgentRole`, `server.ts`, `knowledgeGraph`, `agentMessageBus` | **Haute** | Modularité renforcée, refactoring simplifié et isolation des composants. |
| **Cycle de Vie & Shutdown** | Implémentation d'un arrêt ordonné (*Graceful Shutdown*) sur fermeture de fenêtre Electron (SIGINT/SIGTERM, sockets, pools de clés). | `electron/main.cjs`, `server-bootstrap.ts`, `geminiKeyPool.ts` | **Moyenne** | Fin des processus orphelins, libération propre du port 3000 et prévention des fuites mémoire. |
| **Knowledge & Sandbox** | Mise en cache incrémentale de l'indexation AST (Tree-sitter) et renforcement de la synchronisation sécurisée Sandbox ↔ Workspace. | `server/knowledge/*`, `ASTParser.ts`, `utils/sandbox.ts` | **Moyenne** | Démarrage accéléré et intégrité totale des écritures de fichiers en environnement sécurisé. |
| **Sécurité IPC & UI** | Audit de l'isolation du renderer (`contextIsolation`), validation stricte des canaux `ipcRenderer` et optimisation du bundle Vite. | `electron/preload.cjs`, `vite.config.ts`, `src/App.tsx` | **Basse** | Durcissement sécuritaire conforme aux standards Electron et fluidité UI. |

---

## 3. Feuille de Route & Chronologie

```
[Semaine 1] Assainissement TypeScript & Tests
     │
     ▼
[Semaine 2] Découplage des Hubs Critiques (God Nodes)
     │
     ▼
[Semaine 3] Cycle de Vie Electron & Graceful Shutdown
     │
     ▼
[Semaine 4] Perfectionnement Knowledge System & Sandbox
```

### Étape 1 : Assainissement TypeScript & Tests (Semaine 1)
- Résoudre les variables inutilisées (`skillsRouter`, `req`) signalées par le compilateur dans `server.ts`.
- Valider la cohérence des interfaces dans `AgentBrain.ts`.
- Exécuter la suite de tests automatisés via `node --import tsx --test server/**/*.test.ts`.

### Étape 2 : Découplage des Hubs Critiques (Semaine 2)
- Revoir la distribution des dépendances autour de `AgentRole` (91 arêtes) et `knowledgeGraph` (63 arêtes).
- Factoriser les fonctions utilitaires pour réduire le couplage direct vers `server.ts`.
- Mettre à jour le graphe Graphify après les modifications architecturales.

### Étape 3 : Cycle de Vie & Graceful Shutdown (Semaine 3)
- Intercepter l'événement `window-all-closed` et `before-quit` dans `electron/main.cjs`.
- Diffuser un signal de fermeture à Express et clore proprement :
  - Les sockets WebSocket actives (`useLiveAPI`).
  - Les sous-processus d'automatisation éventuels.
  - Le pool de clés Gemini (`geminiKeyPool.ts`).

### Étape 4 : Perfectionnement Knowledge & Sandbox (Semaine 4)
- Valider le mécanisme de détection de fraîcheur AST avant de rescanner l'intégralité du projet.
- Auditer les flux de réconciliation `.Leanna/sandbox` vers le workspace utilisateur.
- Documenter les nouvelles conventions dans `.project-memory.json`.

---

## 4. Actions Immédiates à Lancer

1. **Vérification TypeScript :** Exécuter une passe de compilation ciblée sur les fichiers serveurs modifiés.
2. **Nettoyage des imports orphelins :** Réduire le bruit dans `server.ts`.
3. **Commit / Checkpoint :** Figer l'état courant dans Git avant toute intervention structurelle sur les hubs.
