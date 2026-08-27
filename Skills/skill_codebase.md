# Skill : Codebase (`server/skills/codebase.ts`)

Ce skill fournit à l'IA les outils nécessaires pour lire, comprendre et modifier le code source du projet. C'est le cœur des capacités de développement de Jarvis OS.

## Outils Exposés

Ce skill expose de nombreux outils pour interagir avec les fichiers du projet :

### Lecture et Analyse (`codebaseReader.ts`)
*   `list_project_files` : Liste les fichiers.
*   `read_project_file` : Lit le contenu d'un fichier.
*   `read_file_outline` : Donne la structure d'un fichier (fonctions, classes).
*   `search_in_files` : Recherche du texte dans tout le projet.

### Écriture et Modification (`codebaseWriter.ts`)
*   `write_project_file` : Crée ou écrase un fichier.
*   `modify_project_file` : Remplace du texte par correspondance exacte.
*   `patch_project_file` : Applique des modifications ligne par ligne (insert, replace, delete).
*   `rename_project_file`, `delete_project_file`, `create_project_directory`.

## Autonomie

Ce skill est indispensable pour l'autonomie en développement. Il permet à l'IA d'explorer le code existant et d'appliquer des changements de manière autonome.

**Pistes d'amélioration pour l'autonomie :**
*   Intégrer une analyse sémantique plus poussée pour aider l'IA à trouver le code pertinent plus rapidement.
*   Améliorer la robustesse des opérations d'écriture pour éviter d'introduire des erreurs de syntaxe.
