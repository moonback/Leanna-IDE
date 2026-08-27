# Skill : Reasoning (`server/skills/reasoning.ts`)

Ce skill fournit à l'IA des outils pour améliorer son processus de pensée et de raisonnement. Il permet de choisir différentes stratégies de réflexion, d'utiliser la synthèse vocale pour annoncer ses pensées, et de lancer des tâches en arrière-plan.

## Outils Exposés

Ce skill offre des outils pour structurer la pensée :

*   `reasoning_think` : Permet à l'IA de prendre un moment pour réfléchir à un problème en utilisant une stratégie spécifique (Chain of Thought, décomposition, etc.) et éventuellement d'annoncer vocalement le début de sa réflexion.
*   `reasoning_background_task` : Permet de lancer une tâche longue en arrière-plan (comme lister récursivement des fichiers) et d'être notifié du résultat.

## Autonomie

Ce skill est important pour l'autonomie car il permet à l'IA de gérer son propre processus cognitif, de choisir la meilleure approche pour résoudre un problème complexe, et de gérer des tâches asynchrones sans bloquer l'interaction.

**Pistes d'amélioration pour l'autonomie :**
*   Permettre à l'IA d'auto-évaluer l'efficacité de sa stratégie de pensée et d'en changer si elle n'aboutit pas.
*   Enrichir les capacités des tâches en arrière-plan pour permettre des opérations plus complexes de manière autonome.
