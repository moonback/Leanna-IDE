# Skill : Guidelines (`server/skills/guidelines.ts`)

Ce skill fournit à l'IA un accès aux directives, protocoles et standards du projet. Il sert de référence pour garantir que l'IA agit conformément aux attentes en matière de sécurité, de workflow et de qualité de code.

## Outils Exposés

Ce skill expose des outils pour consulter différentes sections des directives :

*   `get_workflow_guidelines` : Directives sur le processus de travail (avant, pendant, après une tâche).
*   `get_project_standards` : Standards de code et conventions du projet.
*   `get_security_rules` : Règles de sécurité critiques.
*   `get_all_guidelines` : Récupère l'ensemble des directives.

## Autonomie

Ce skill est crucial pour l'autonomie car il permet à l'IA de s'auto-référer aux règles du projet pour prendre des décisions éclairées, plutôt que de dépendre d'instructions externes constantes.

**Pistes d'amélioration pour l'autonomie :**
*   Intégrer un mécanisme où l'IA vérifie proactivement les directives pertinentes avant d'effectuer une action critique (ex: modification de configuration).
*   Permettre à l'IA de suggérer des mises à jour des directives si elle identifie des incohérences ou des inefficacités dans le workflow actuel.
