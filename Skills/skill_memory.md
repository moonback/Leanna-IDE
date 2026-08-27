# Skill : Memory (`server/skills/memory.ts`)

Ce skill permet à l'IA de sauvegarder et de rechercher des informations importantes dans une mémoire à long terme (base de données vectorielle Supabase). Il est utilisé pour retenir des préférences, des faits sur l'utilisateur, des décisions de projet, etc.

## Outils Exposés

Ce skill offre des outils pour gérer la mémoire à long terme :

*   `save_memory` : Sauvegarde une information (avec embedding vectoriel) en évitant les doublons sémantiques.
*   `search_memory` : Recherche des souvenirs par similarité sémantique et/ou par tags.
*   `list_memories` : Liste les souvenirs stockés.
*   `delete_memory` : Supprime un souvenir spécifique.

## Autonomie

Ce skill est crucial pour l'autonomie car il permet à l'IA de se souvenir des interactions passées et d'adapter son comportement en fonction des préférences et du contexte mémorisés, sans que l'utilisateur ait besoin de répéter les informations.

**Pistes d'amélioration pour l'autonomie :**
*   Permettre à l'IA de consolider proactivement ses souvenirs, par exemple en regroupant des informations éparses ou en archivant des données obsolètes.
*   Intégrer un mécanisme de "rappel" automatique où l'IA recherche des souvenirs pertinents au début d'une nouvelle tâche.
