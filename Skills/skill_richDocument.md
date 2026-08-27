# Skill : Rich Document (`server/skills/richDocument.ts`)

Ce skill permet à l'IA de créer et d'afficher des documents riches interactifs directement dans l'interface utilisateur de Jarvis OS. Ces documents peuvent combiner différents types de contenus visuels.

## Outils Exposés

Ce skill offre un outil principal :

*   `create_rich_document` : Crée et affiche un document composé de différents blocs.

### Types de Blocs Supportés
*   `table` : Tableaux de données.
*   `bar_chart`, `line_chart`, `area_chart`, `pie_chart` : Graphiques.
*   `card` : Fiches d'information.
*   `list` : Listes structurées.
*   `text` : Texte Markdown.
*   `code` : Blocs de code.
*   `progress` : Barres de progression.
*   `timeline` : Frises chronologiques.
*   `stat_grid` : Grilles de statistiques.

## Autonomie

Ce skill permet à l'IA de présenter des informations complexes de manière structurée et visuelle, améliorant ainsi sa capacité à communiquer des résultats d'analyse ou des états de projet à l'utilisateur de façon autonome et claire.

**Pistes d'amélioration pour l'autonomie :**
*   Permettre à l'IA de mettre à jour dynamiquement un document riche déjà affiché en réponse à de nouvelles données.
*   Intégrer des interactions dans les documents riches pour permettre à l'utilisateur de déclencher des actions en cliquant sur des éléments.
