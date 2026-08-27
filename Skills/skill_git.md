# Skill : Git (`server/skills/git.ts`)

Ce skill permet à l'IA d'interagir avec le système de contrôle de version Git dans le projet actif. Il est essentiel pour la gestion de version et la collaboration.

## Outils Exposés

Ce skill offre des outils pour les opérations Git courantes :

*   `git_status` : Affiche l'état du répertoire de travail et de la zone de transit.
*   `git_add` : Ajoute le contenu des fichiers à la zone de transit.
*   `git_commit` : Enregistre les modifications apportées au dépôt.
*   `git_log` : Affiche l'historique des commits.
*   `git_diff` : Affiche les changements entre les commits, le commit et le répertoire de travail, etc.
*   `git_branch` : Liste, crée ou supprime des branches.
*   `git_checkout` : Change de branche ou restaure des fichiers du répertoire de travail.

## Autonomie

Ce skill est crucial pour l'autonomie car il permet à l'IA de sauvegarder son travail, de créer des points de restauration avant des modifications risquées, et de gérer l'historique du projet.

**Pistes d'amélioration pour l'autonomie :**
*   Permettre à l'IA de créer automatiquement des commits avec des messages descriptifs après chaque modification réussie.
*   Intégrer une gestion plus intelligente des conflits de fusion pour que l'IA puisse tenter de les résoudre de manière autonome.
