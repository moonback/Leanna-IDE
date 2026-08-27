# Skill : List (`server/skills/list.ts`)

Ce skill permet à l'IA de gérer des listes d'éléments persistantes stockées dans Supabase. Il est utile pour stocker des informations structurées simples comme des todos, des listes de courses, des configurations, etc.

## Outils Exposés

Ce skill offre des outils pour gérer les listes :

*   `list_create_or_update` : Crée une nouvelle liste ou met à jour une liste existante.
*   `list_add_item` : Ajoute un élément à une liste.
*   `list_remove_item` : Supprime un élément d'une liste.
*   `list_delete` : Supprime une liste complète.
*   `list_get` : Récupère le contenu d'une liste.
*   `list_list_all` : Liste toutes les listes disponibles.

## Autonomie

Ce skill permet à l'IA de stocker et de manipuler des données structurées de manière autonome, ce qui peut être utile pour suivre l'avancement de tâches complexes ou pour mémoriser des préférences utilisateur.

**Pistes d'amélioration pour l'autonomie :**
*   Permettre à l'IA d'utiliser des listes pour planifier des séquences d'actions complexes et suivre leur exécution.
*   Intégrer la possibilité de trier ou de filtrer les éléments d'une liste directement via le skill.
