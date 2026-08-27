# Skill : Knowledge (`server/skills/knowledge.ts`)

Ce skill est le point d'entrée principal pour la compréhension du projet. Il combine la recherche sémantique, la mémoire du projet, le graphe de dépendances et l'analyse d'impact pour fournir un contexte riche à l'IA.

## Outils Exposés

Ce skill offre des outils puissants pour explorer et comprendre le projet :

*   `knowledge_build_context` : Outil principal pour obtenir un contexte complet sur une tâche.
*   `knowledge_semantic_search` : Recherche sémantique dans le codebase.
*   `knowledge_search_entities` : Recherche d'entités de code spécifiques (classes, fonctions).
*   `knowledge_memory_search` / `knowledge_memory_add` : Gère la mémoire des faits spécifiques au projet.
*   `knowledge_impact_analyze` : Analyse l'impact potentiel d'une modification.
*   `knowledge_status` / `knowledge_reindex` : Gère l'état de l'index de connaissance.

## Autonomie

Ce skill est la pierre angulaire de l'autonomie car il permet à l'IA de se construire une représentation mentale précise du projet, d'évaluer les risques et de prendre des décisions éclairées sans assistance humaine constante.

**Pistes d'amélioration pour l'autonomie :**
*   Permettre à l'IA d'ajouter automatiquement des faits à la mémoire du projet lorsqu'elle découvre des patterns ou des décisions importantes lors de l'analyse du code.
*   Intégrer l'analyse d'impact de manière systématique avant toute modification non triviale.
