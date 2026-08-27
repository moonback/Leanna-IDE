# Skill : System (`server/skills/system.ts`)

Ce skill permet à l'IA d'exécuter des commandes système et d'interagir avec le système de fichiers du projet. Il est essentiel pour lancer des builds, installer des dépendances ou effectuer des opérations de maintenance.

## Outils Exposés

Ce skill offre des outils pour interagir avec le système :

*   `run_project_command` : Exécute des commandes autorisées (`npm`, `npx`, `node`) dans le workspace. Certaines commandes (ex: `npm install`) nécessitent une confirmation utilisateur.
*   `list_directory_recursive` : Liste récursivement le contenu d'un dossier.

## Autonomie

Ce skill est crucial pour l'autonomie car il permet à l'IA de gérer le cycle de vie du projet (installation, build, test) et d'explorer l'arborescence des fichiers de manière approfondie.

**Pistes d'amélioration pour l'autonomie :**
*   Étendre la liste des commandes autorisées en fonction des besoins, tout en maintenant un haut niveau de sécurité.
*   Permettre à l'IA de mieux interpréter les erreurs de commande pour suggérer des corrections (ex: installer une dépendance manquante).
