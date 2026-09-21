# Plan d'Action : Optimisation du Système Multi-Agents pour Gemini 3.8 Live Extended Thinking

> **Date :** Mars 2025  
> **Cible :** `server/agents/` ↔ `server/live/LiveSocketHandler.ts`  
> **Modèle d'IA :** `gemini-3.8-live-extended-thinking` (Google AI Studio Live API)  
> **Statut :** Prêt pour implémentation  

---

## 1. Contexte Technique & Caractéristiques du Modèle

Le système multi-agents de Leanna repose sur une architecture modulaire (44 fichiers dans `server/agents/`) exploitant un cerveau central (`AgentBrain`), un bus d'événements (`AgentMessageBus`), et un exécuteur outillé (`AgentExecutor`).

L'alignement sur **`gemini-3.8-live-extended-thinking`** impose de tirer parti des spécificités fondamentales du modèle :
1. **Extended Thinking Natif (`thinkingLevel: HIGH`)** : Capacité de réflexion multi-étapes interne (`part.thought`) sans besoin d'échafaudages textuels artificiels ou d'outils externes lents.
2. **Appels d'Outils Non-Bloquants (`Behavior.NON_BLOCKING`)** : Traitement asynchrone des fonctions permettant au modèle de poursuivre son interaction vocale ou textuelle pendant l'exécution en arrière-plan.
3. **Batching Parallèle d'Outils (Multi-Tool Calls)** : Émission simultanée de plusieurs requêtes d'outils dans un seul tour sans sérialisation superflue.
4. **Budget de Contexte Compact (131k tokens)** : Gestion rigoureuse de la compression glissante en session Live, exigeant une injection contextuelle ultra-ciblée (outline-first).

---

## 2. Synthèse des 5 Chantiers Majeurs

| Chantier | Objectif Principal | Fichiers Cibles | Impact & Gain |
| :--- | :--- | :--- | :--- |
| **1. Thinking Natif & Prompts Lean** | Supprimer les prompts bavards forçant la pensée visible ; s'appuyer sur le thinking interne de Gemini. | `PromptBuilder.ts`, `promptSections.ts`, `roles.ts` | **-35% de tokens générés**, réduction du TTFT, zéro bavardage. |
| **2. Batching & Outils Non-Bloquants** | Permettre l'exécution parallèle d'outils et l'intégration du mode `NON_BLOCKING` dans l'exécuteur. | `AgentExecutor.ts`, `ToolCallParser.ts`, `AutonomousLoop.ts` | **Temps d'exécution divisé par 2** sur les phases de lecture/recherche. |
| **3. Gestion Compacte du Contexte** | Remplacer la lecture intégrale des fichiers par `outline` + extraits ciblés (±25 lignes). | `AgentContextResolver.ts`, `WorkspaceState.ts` | **Préservation de la fenêtre 131k**, élimination de la troncature Live. |
| **4. Passerelle Audio Temps Réel** | Connecter les événements d'agents au canal vocal Live pour un feedback continu pendant les tâches. | `AgentEventStream.ts`, `LiveSocketHandler.ts` | **Interactivité vocale fluide** sans interruption du dialogue audio. |
| **5. Refonte Modulaire des Rôles** | Compacter les 1200+ lignes de `roles.ts` en schémas denses d'invariants et de compétences. | `roles.ts`, `DynamicAgentRegistry.ts` | **Démarrage instantané**, clarté accrue et maintenance facilitée. |

---

## 3. Feuille de Route Détaillée par Chantier

### Chantier 1 : Exploitation du Thinking Étendu Natif
- **Problématique** : Les agents exigent actuellement des sections de formatage textuel verbeuses (ex. `## Résumé`, `## Détails`, étapes de raisonnement explicites), ce qui surcharge la sortie et duplique le travail déjà effectué dans `part.thought`.
- **Actions concrètes** :
  1. Configurer explicitement `thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH, includeThoughts: true }` sur les instances de raisonnement.
  2. Nettoyer `BASE_SYSTEM_PROMPT` dans `roles.ts` pour supprimer les injonctions à expliciter les pensées intermédiaires.
  3. Réserver l'outil externe `reasoning_think` aux diagnostics d'incidents critiques ou arbitrages multi-branches, en déléguant la planification standard au thinking natif.

### Chantier 2 : Batching Multi-Outils et Asynchronisme Non-Bloquant
- **Problématique** : L'exécuteur traite actuellement les lectures de fichiers ou vérifications de façon quasi-séquentielle, multipliant les allers-retours de prompts.
- **Actions concrètes** :
  1. Adapter `ToolCallParser.ts` pour parser des tableaux d'appels d'outils simultanés (`tool_call` multiples émis par Gemini).
  2. Modifier `AgentExecutor.ts` :
     ```typescript
     // Exécution parallèle immédiate pour les outils de lecture et d'analyse
     const readPromises = parallelCalls.map(call => this.callToolWithTimeout(call.name, call.parameters));
     const results = await Promise.all(readPromises);
     ```
  3. Aligner la boucle d'exécution sur le comportement `Behavior.NON_BLOCKING` utilisé dans `LiveSocketHandler.ts` pour éviter le blocage de la boucle événementielle.

### Chantier 3 : Optimisation du Contexte (Stratégie Outline-First)
- **Problématique** : L'injection de gros fichiers dans `AgentContextResolver.ts` consomme rapidement la fenêtre de contexte de 131k tokens et accélère le déclenchement de la mémoire glissante.
- **Actions concrètes** :
  1. Règle stricte dans `AgentContextResolver.ts` :
     - Si fichier < 200 lignes → lecture directe (`full: true`).
     - Si fichier ≥ 200 lignes → appel préalable de `read_file_outline`, puis injection exclusive des lignes cibles (blocs de ±25 lignes).
  2. Dans `WorkspaceState.ts`, ne transmettre aux messages suivants que le diff / rapport de validation plutôt que le fichier complet réécrit.

### Chantier 4 : Synchronisation Événements Agents ↔ Session Live (Voice Streaming)
- **Problématique** : Lorsqu'une tâche agent longue est lancée, l'utilisateur en session vocale Live subit un silence ou un manque de visibilité.
- **Actions concrètes** :
  1. Relier `AgentEventStream.ts` et `ProgressNotifier.ts` à l'instance active de `LiveSocketHandler`.
  2. Permettre l'envoi de messages de contexte légers au modèle pendant l'exécution :
     ```json
     {
       "clientContent": {
         "turns": [{
           "role": "user",
           "parts": [{ "text": "[Événement Agent] Agent Développeur : écriture de AgentExecutor.ts terminée, validation en cours..." }]
         }],
         "turnComplete": false
       }
     }
     ```
  3. Gemini 3.8 Live peut ainsi glisser un court commentaire vocal naturel à l'utilisateur sans rompre la communication.

### Chantier 5 : Refonte & Compaction Modulaire de `roles.ts`
- **Problématique** : `server/agents/roles.ts` compte plus de 1 290 lignes avec une répétition massive de gabarits textuels (`SECTION_IDENTITY`, `SECTION_PROCESS`, etc.).
- **Actions concrètes** :
  1. Factoriser les définitions des 15 rôles sous forme d'objets déclaratifs compacts.
  2. Remplacer les longs paragraphes par une liste dense d'invariants négatifs et positifs (style Rule-Dense).
  3. Alléger l'empreinte mémoire du module de 50 000 caractères à moins de 20 000 caractères.

---

## 4. Matrice de Priorisation & Calendrier

```
Phase 1 : Socle Cognitif & Contexte (Jours 1 - 2)
  ├── Compaction de roles.ts & promptSections.ts (Chantier 5)
  └── Optimisation Outline-First dans AgentContextResolver.ts (Chantier 3)

Phase 2 : Performance & Batching (Jours 3 - 4)
  ├── Batching parallèle dans AgentExecutor.ts (Chantier 2)
  └── Exploitation du thinking natif HIGH (Chantier 1)

Phase 3 : Intégration Live Audio (Jours 5 - 6)
  └── Passerelle AgentEventStream ↔ LiveSocketHandler (Chantier 4)
```

---

## 5. Critères de Validation & Métriques de Réussite

1. **TTFT & Temps de réponse** : Diminution de 30% du temps global d'exécution sur les tâches multi-outils grâce au batching parallèle.
2. **Économie de Tokens** : Réduction de 40% du volume de tokens système injectés par tâche agent.
3. **Stabilité du Contexte** : Zéro saturation de contexte 131k sur des missions complexes grâce au découpage `read_file_outline`.
4. **Fluidité Conversationnelle** : L'assistant vocal Live reste réactif et informe l'utilisateur en continu pendant les actions multi-agents.
