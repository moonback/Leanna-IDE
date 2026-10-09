# Plan d'Action : Intégration de la Visualisation Pixel-Art des Agents

Ce document détaille les étapes pour intégrer la visualisation des agents IA sous forme de personnages animés en pixel-art dans Leanna-ide.

## 1. Analyse et Conception de l'Architecture

- **Objectif** : Associer les états d'exécution des agents IA à des représentations graphiques animées.
- **Flux de données** :
  1. `AgentRuntime` (Backend) émet des événements d'état.
  2. `EventBus` centralise ces événements.
  3. `WebSocket Server` (ex: `/terminal` ou `/autonomy`) diffuse l'état au client.
  4. `AgentVisualizer` (Frontend React) reçoit et affiche l'animation correspondante.

## 2. Définition des États des Agents et Correspondances Visuelles

Les états suivants, capturés depuis le cycle de vie de `AgentRuntime`, seront associés à des spritesheets :
- `IDLE` (En attente) : Animation de repos ou marche lente.
- `THINKING` (En réflexion) : Animation de lecture.
- `EDITING` (Modification de fichiers) : Animation de tape au clavier.
- `SEARCHING` (Recherche) : Animation de consultation de documents.
- `WAITING` (En attente d'input utilisateur) : Animation d'alerte visuelle.

## 3. Implémentation Backend (EventBridge & WebSocket)

- **Étape 3.1** : Modifier ou étendre l'interface des événements dans `server/runtime/types.ts` pour inclure l'état visuel de l'agent.
- **Étape 3.2** : Intégrer l'émission de ces événements dans `server/runtime/AgentRuntime.ts` ou via le pont d'autonomie `server/autonomy/TaskManager.ts`.
- **Étape 3.3** : S'assurer de la diffusion via les WebSockets existants (ex: `server.ts` pour le routeur WebSocket).

## 4. Implémentation Frontend (UI / Composant React)

- **Étape 4.1** : Créer le composant `src/components/agents/AgentVisualizer.tsx`.
- **Étape 4.2** : Implémenter la gestion des spritesheet (CSS ou Canvas) pour chaque état.
- **Étape 4.3** : Connecter le composant au flux WebSocket approprié à l'aide de hooks existants.
- **Étape 4.4** : Intégrer le visualiseur dans le layout de l'IDE (ex: barre latérale ou status bar).

## 5. Validation et Tests

- **Étape 5.1** : Vérifier la transmission des états dans les logs et le WebSocket.
- **Étape 5.2** : Valider l'intégration visuelle et l'absence de régression dans l'UI existante.
- **Étape 5.3** : Lancer `verify_typecheck` et `run_tests` pour valider les modifications de types.

---
*Fin du plan d'action révisé.*
