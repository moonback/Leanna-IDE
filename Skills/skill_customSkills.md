# Skill : Custom Skills (`server/skills/customSkills.ts`)

Ce skill permet à l'utilisateur de créer, modifier, lister et supprimer ses propres skills personnalisés. Ces skills sont stockés dans une base de données Supabase.

## Outils Exposés

Ce skill expose les outils de gestion (CRUD) pour les skills personnalisés :

*   `create_custom_skill` : Crée un nouveau skill.
*   `list_custom_skills` : Liste tous les skills personnalisés.
*   `update_custom_skill` : Modifie un skill existant.
*   `delete_custom_skill` : Supprime un skill.

## Autonomie

Ce skill est puissant pour l'autonomie car il permet à l'IA d'étendre ses propres capacités en créant de nouveaux outils pour répondre à des besoins spécifiques non couverts par les skills par défaut.

**Pistes d'amélioration pour l'autonomie :**
*   Permettre à l'IA de s'auto-suggérer la création d'un custom skill lorsqu'elle identifie une tâche répétitive ou complexe qu'elle ne peut pas accomplir avec les outils actuels.
*   Intégrer un mécanisme de test automatique lors de la création d'un custom skill pour vérifier qu'il fonctionne comme prévu.
