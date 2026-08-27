# Skill : Document Linker (`server/skills/documentLinker.ts`)

Ce skill permet à l'IA d'analyser les relations entre différents documents stockés dans le système et de générer des synthèses croisées. Il complète le skill `documentKnowledge` en se concentrant sur les liens inter-documents.

## Outils Exposés

Ce skill offre des outils pour connecter les informations :

*   `document_list` : Liste les documents persistés avec leurs résumés et liens.
*   `document_search` : Recherche des documents par mots-clés.
*   `document_analyze_links` : Analyse sémantique (via LLM) pour trouver des liens entre documents.
*   `document_find_similar` : Trouve des documents similaires à un document donné.
*   `document_cross_synthesis` : Génère une synthèse croisée de plusieurs documents.

## Autonomie

Ce skill renforce l'autonomie en permettant à l'IA de connecter de manière autonome des informations provenant de sources multiples pour construire une compréhension plus globale d'un sujet.

**Pistes d'amélioration pour l'autonomie :**
*   Permettre à l'IA de lancer de manière proactive une analyse de liens lorsqu'elle détecte que des documents traitent de sujets connexes.
*   Améliorer l'analyse locale (fallback) pour qu'elle soit plus performante quand l'accès au LLM est limité.
