# Skill : Browser (`server/skills/browser.ts`)

Ce skill permet à l'IA de contrôler le navigateur web intégré visible dans l'interface utilisateur de Jarvis OS. Il est différent de `automation.ts` qui utilise un navigateur en arrière-plan.

## Outils Exposés

Ce skill offre des outils pour naviguer et interagir avec le web en direct :

*   `browser_navigate` : Ouvre une URL.
*   `browser_search` : Effectue une recherche sur Google, Bing, etc.
*   `browser_read_content` : Lit le contenu textuel de la page actuelle.
*   `browser_get_links` : Extrait les liens de la page.
*   `browser_open_link` : Ouvre un lien spécifique.
*   `browser_click` : Clique sur un élément.
*   `browser_type` : Saisit du texte.
*   `browser_research` : Recherche approfondie sur plusieurs sources.

## Autonomie

Ce skill est essentiel pour l'autonomie car il permet à l'IA de chercher des informations à jour, de consulter de la documentation ou d'interagir avec des services en ligne.

**Pistes d'amélioration pour l'autonomie :**
*   Améliorer la capacité de l'IA à analyser la structure de la page (DOM) pour trouver les bons éléments sur lesquels cliquer ou écrire, même si le design change.
*   Permettre à l'IA de gérer des scénarios complexes comme l'authentification ou le remplissage de formulaires multi-étapes.
