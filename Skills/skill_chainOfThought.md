# Skill : Chain of Thought (`server/skills/chainOfThought.ts`)

Ce skill permet à l'IA de décomposer des problèmes complexes et de raisonner de manière explicite étape par étape. Il vise à améliorer la qualité des réponses en forçant une réflexion structurée.

## Fonctionnalités Clés

*   **Analyse de Complexité** : Évalue la difficulté d'une tâche pour déterminer la meilleure stratégie de raisonnement.
*   **Décomposition en Étapes** : Découpe un problème en sous-tâches plus simples.
*   **Raisonnement Parallèle** : Peut paralléliser certaines analyses pour gagner du temps.
*   **Gestion des Erreurs** : Si une étape échoue, le processus peut continuer sur les autres.

## Autonomie

Ce skill est crucial pour l'autonomie car il donne à l'IA la capacité de planifier ses actions et de résoudre des problèmes non triviaux sans assistance humaine constante.

**Pistes d'amélioration pour l'autonomie :**
*   Permettre à l'IA d'ajuster dynamiquement son plan d'action en cours de route si une étape révèle des informations imprévues.
*   Intégrer une boucle de "self-correction" où l'IA vérifie son propre raisonnement à la fin de chaque étape.
