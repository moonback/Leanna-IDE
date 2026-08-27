# Skill : Mission (`server/skills/mission.ts`)

Ce skill permet à l'IA d'interagir avec le système de mission de Jarvis OS. Il est utilisé pour gérer des tâches complexes de haut niveau qui nécessitent une planification multi-étapes, une exécution autonome et un suivi continu.

## Outils Exposés

Ce skill offre des outils pour piloter les missions :

*   `mission_create` : Crée une nouvelle mission autonome pour un objectif complexe.
*   `mission_status` : Consulte l'état d'avancement d'une mission spécifique.
*   `mission_list` : Liste les missions actives ou terminées.
*   `mission_cancel` : Annule une mission en cours.
*   `mission_reflection` : Obtient un rapport de réflexion sur le déroulement de la mission (leçons apprises, risques).

## Autonomie

Ce skill est l'un des plus importants pour l'autonomie de haut niveau. Il permet à l'IA de prendre en charge des objectifs globaux, de les décomposer en sous-tâches et de gérer leur exécution complète sans supervision humaine constante à chaque étape.

**Pistes d'amélioration pour l'autonomie :**
*   Permettre à l'IA de créer des sous-missions de manière récursive pour des tâches extrêmement complexes.
*   Intégrer la capacité pour une mission de s'auto-replanifier si les conditions initiales changent ou si des obstacles imprévus surviennent.
