# Leanna — Extension Telegram

## 1. Mission
Faciliter la communication fluide et sécurisée entre Leanna et les utilisateurs via l'application Telegram, et permettre le pilotage de Leanna à distance (statut, missions autonomes, exécution de commandes, exploration du projet).

## 2. Capacités d'Interaction
- **Notifications instantanées** : Envoi d'alertes, de rapports ou de résumés d'activités.
- **Pilotage à distance** : Lancement et suivi de missions autonomes, exécution de commandes et exploration du workspace depuis le chat Telegram.
- **Gestion des utilisateurs** : Authentification et autorisation basées sur une liste d'utilisateurs whitelistés.

## 3. Commandes Disponibles
Les utilisateurs autorisés peuvent piloter Leanna via les commandes suivantes :

| Commande | Description |
|----------|-------------|
| `/status` | Afficher l'état de Leanna (bot, mission en cours, workspace actif). |
| `/agent <objectif>` | Lancer une mission autonome avec l'objectif fourni. |
| `/tasks` | Lister les agents / missions en cours et leur statut. |
| `/task <id>` | Afficher le détail et l'avancement d'une mission précise. |
| `/cancel <id>` | Annuler une mission autonome en cours. |
| `/cmd <commande>` | Exécuter une commande shell dans le workspace. |
| `/ls <chemin>` | Explorer le contenu d'un dossier du projet. |
| `/read <chemin>` | Lire le contenu d'un fichier du projet. |
| `/project [nom]` | Consulter le workspace actif, ou en changer si un nom est fourni. |

### Règles d'usage des commandes
- **Authentification** : Toute commande provenant d'un utilisateur non whitelisté est refusée.
- **Confirmation** : Les actions destructrices ou à large impact (`/cmd`, `/cancel`, changement de workspace via `/project`) doivent être explicitement confirmées avant exécution.
- **Retour clair** : Chaque commande renvoie un accusé de réception puis un résultat concis, exploitable sur mobile.
- **Suivi** : Après `/agent`, communiquer l'identifiant de la mission afin de permettre son suivi via `/task` et son annulation via `/cancel`.

## 4. Garde-fous et Sécurité
- **Confidentialité** : Ne jamais divulguer d'informations sensibles, de clés d'API ou de secrets.
- **Portée des commandes** : `/cmd`, `/ls` et `/read` restent limités au workspace actif ; refuser tout accès hors de ses limites.
- **Conformité** : Respect strict des règles de gestion des données personnelles et de la sécurité du codebase.
- **Accessibilité** : Assurer que les messages restent concis et exploitables sur mobile.

## 5. Outils Déclarés
- `telegram_notify` : Envoi d'une notification simple.
- `telegram_send_message` : Envoi d'un message avec formatage Markdown.
