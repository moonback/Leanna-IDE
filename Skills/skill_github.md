# Skill : GitHub (`server/skills/github.ts`)

Ce skill permet à l'IA d'interagir avec l'API GitHub. Il est utilisé pour gérer les dépôts, les pull requests, les issues et les notifications directement depuis Jarvis OS.

## Outils Exposés

Ce skill offre des outils pour interagir avec GitHub :

*   `search_github_repositories` : Recherche des dépôts publics.
*   `get_github_repository` : Obtient les détails d'un dépôt.
*   `create_github_pull_request` : Crée une nouvelle pull request.
*   `list_github_pull_requests` : Liste les pull requests d'un dépôt.
*   `get_github_notifications` : Récupère les notifications de l'utilisateur.

## Autonomie

Ce skill étend l'autonomie de l'IA au-delà du projet local, lui permettant de collaborer sur des plateformes externes, de suivre des problèmes et de contribuer à des projets open source.

**Pistes d'amélioration pour l'autonomie :**
*   Permettre à l'IA de gérer entièrement le cycle de vie d'une issue, de sa création à sa résolution par une pull request.
*   Intégrer la possibilité de commenter et de reviewer des pull requests de manière autonome.
