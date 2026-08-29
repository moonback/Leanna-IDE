# Améliorations Agents Jarvis

Ce document liste les pistes d'améliorations pour le système multi-agents de Jarvis, classées par catégorie.

## 1. Architecture des Agents et Prompts

*   ✅ **Spécialisation des compétences (Skills)** : Implémenté - Création d'un mapping dynamique outil → agent basé sur les `capabilities` des rôles dans `server/agents/roles.ts`. Le nouveau module `toolAgentMapper.ts` fournit des fonctions pour obtenir les agents associés à un outil, les outils associés à un agent, et les catégories d'outils. Le frontend utilise maintenant ce mapping dynamique via `/api/agents/tool-mapping/primary`. De plus, `TOOL_KEYWORDS_WITH_AGENTS` dans `SkillManager.ts` enrichit les mots-clés avec des associations aux rôles d'agents recommandés.
*   **Prompts dynamiques contextuels** : Injecter des règles spécifiques (ex: performance, sécurité) dans les prompts en fonction de la tâche à accomplir.
*   **Persistance durable des agents dynamiques** : Sauvegarder les définitions d'agents sur disque ou en base de données pour qu'elles survivent aux redémarrages (actuellement en mémoire uniquement).

## 2. Communication et Messagerie

*   **Délégation structurée** : Rendre la délégation programmable via un outil dédié et un format comme le JSON, au lieu de reposer sur le parsing de Markdown.
*   **Routage avancé de la communication** : Implémenter des stratégies de routage (load-balancing, round-robin) dans l'AgentMessageBus pour optimiser la distribution des messages.
*   **Surveillance et traçage du MessageBus** : Enrichir le bus de messages avec des métriques détaillées et des outils de visualisation pour diagnostiquer les interactions.

## 3. Exécution et Orchestration

*   **Points d'extension dans l'exécution** : Ajouter des hooks (pré/post-processing) dans AgentExecutor pour permettre des traitements spécifiques autour de l'exécution d'une tâche.
*   **Détection de blocage dans la boucle autonome** : Enrichir AutonomousLoop avec des heuristiques pour identifier la non-progression ou les boucles sémantiques.
*   **Stratégies de reprise dans l'orchestration** : Permettre de définir des retries ou des tâches alternatives dans le TaskScheduler en cas d'échec d'une tâche.
*   **Format structuré pour l'écriture de fichiers** : Généraliser l'usage d'un format structuré (ex: JSON) par les agents pour déclarer les fichiers à écrire, fiabilisant ainsi l'extraction par GeneratedFileWriter.
