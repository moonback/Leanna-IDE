# Skill : History (`server/skills/history.ts`)

Ce skill permet à l'IA d'accéder à l'historique des conversations passées, stocké dans Supabase. Il est utile pour retrouver du contexte, des décisions ou des informations échangées précédemment.

## Outils Exposés

Ce skill offre des outils pour gérer et consulter l'historique :

*   `list_conversations` : Liste les conversations précédentes avec leurs résumés.
*   `search_history` : Recherche des messages spécifiques dans tout l'historique.
*   `get_conversation_context` : Récupère les messages d'une conversation spécifique pour obtenir du contexte.

## Autonomie

Ce skill renforce l'autonomie en donnant à l'IA une "mémoire à long terme" des interactions, lui permettant de s'appuyer sur le passé pour mieux répondre aux tâches présentes, sans avoir besoin que l'utilisateur répète les informations.

**Pistes d'amélioration pour l'autonomie :**
*   Permettre à l'IA de décider de manière autonome de consulter l'historique si elle détecte qu'une tâche actuelle est liée à une discussion passée.
*   Intégrer un système de résumé automatique des conversations terminées pour faciliter la recherche de contexte.
