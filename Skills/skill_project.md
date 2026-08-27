# Skill : Project (`server/skills/project.ts`)

Ce skill permet à l'IA de créer de nouveaux projets React en utilisant différents frameworks (Vite, Next.js, React Router) et de basculer automatiquement le workspace sur le nouveau projet créé.

## Outils Exposés

Ce skill offre un outil principal :

*   `project_scaffold` : Crée un nouveau projet dans un dossier spécifié en utilisant le framework choisi.

## Autonomie

Ce skill permet à l'IA d'initier de nouveaux projets de manière autonome, ce qui est utile pour démarrer rapidement des prototypes ou de nouvelles applications sans intervention manuelle pour la configuration initiale.

**Pistes d'amélioration pour l'autonomie :**
*   Étendre le support à d'autres frameworks ou types de projets (backend, mobile, etc.).
*   Permettre à l'IA de personnaliser la configuration initiale du projet (choix des dépendances, configuration de l'eslint, etc.) en fonction des besoins exprimés par l'utilisateur.
