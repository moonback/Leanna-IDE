# Skill : Automation (`server/skills/automation.ts`)

Ce skill regroupe les capacités d'automatisation de Jarvis OS, couvrant à la fois l'interaction avec le navigateur web et la gestion de tâches planifiées (workflows).

## Outils Exposés

Ce skill expose de nombreux outils, principalement dans deux catégories :

### 1. Automatisation Navigateur (`automationBrowser.ts`)
Permet d'interagir avec des pages web : navigation, clic, saisie de texte, extraction de contenu, etc.
*   `automation_navigate`
*   `automation_click`
*   `automation_type`
*   `automation_search`
*   ...

### 2. Planification & Workflows (`automationScheduler.ts` & `workflow.ts`)
Permet de créer, lister, exécuter et planifier des séquences d'actions.
*   `workflow_create`
*   `workflow_execute`
*   `schedule_task`
*   `schedule_list`
*   ...

## Autonomie

Ce skill est fondamental pour l'autonomie car il permet à l'IA d'agir sur le monde extérieur (web) et de programmer des actions futures.

**Pistes d'amélioration pour l'autonomie :**
*   Permettre à l'IA de créer des workflows complexes qui s'auto-adaptent en fonction des résultats obtenus lors de l'exécution.
*   Améliorer la gestion des erreurs dans les interactions navigateur pour que l'IA puisse retenter une action avec un sélecteur différent par exemple.
