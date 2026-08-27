# Skill : Document Knowledge (`server/skills/documentKnowledge.ts`)

Ce skill expose le système de gestion de connaissances documentaires à l'IA. Il permet d'interagir avec une base de documents indexés (PDF, DOCX, TXT, etc.) pour y rechercher des informations, extraire des faits ou obtenir des synthèses.

## Outils Exposés

Ce skill offre des outils pour exploiter la base documentaire :

*   `doc_search` : Recherche sémantique dans les documents indexés.
*   `doc_memory_search` : Recherche dans la mémoire des faits extraits des documents.
*   `doc_get_context` : Obtient un contexte documentaire complet pour répondre à une question.
*   `doc_add_fact` : Ajoute manuellement un fait ou une connaissance à la mémoire.
*   `doc_list` : Liste les documents disponibles.
*   `doc_summarize` : Crée une synthèse d'un ou plusieurs documents.
*   `doc_relations` : Obtient les relations entre documents ou entités.

## Autonomie

Ce skill est crucial pour l'autonomie car il permet à l'IA d'accéder à une vaste base de connaissances non structurées et de l'enrichir, sans dépendre uniquement de son contexte de prompt initial.

**Pistes d'amélioration pour l'autonomie :**
*   Permettre à l'IA de décider de manière autonome d'indexer de nouveaux documents si elle juge que sa base de connaissances actuelle est insuffisante pour une tâche.
*   Améliorer l'extraction automatique de faits et de relations lors de la lecture de documents pour enrichir la mémoire sans intervention humaine.
