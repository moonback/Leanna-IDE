# Intégration Gmail — Leanna

## Fonctionnement

Leanna prend en charge deux boîtes Gmail indépendantes :

- **Compte dédié de Leanna** : boîte de réception et compte d'expédition par défaut.
- **Compte personnel** : boîte consultable séparément. L'envoi depuis cette adresse est désactivé par défaut.

La connexion utilise directement les protocoles **IMAP et SMTP sur TLS**, sans Google Web OAuth, sans API Gmail et sans fenêtre de connexion navigateur.

- IMAP : `imap.gmail.com:993` (TLS implicite).
- SMTP : `smtp.gmail.com:465` (TLS implicite).
- Authentification : mot de passe d'application Google propre à chaque compte.

Les mots de passe d'application sont chiffrés avec `server/utils/crypto.ts` et enregistrés dans `.Leanna-email.json` sous le dossier de configuration persistant de Leanna (`Leanna_CONFIG_PATH` / `userData` Electron). Les secrets ne sont jamais renvoyés au frontend, ajoutés aux prompts ou écrits dans les logs. Le fichier est ignoré par Git.

## Configuration des comptes

Pour chacun des deux comptes :

1. Activer la validation en deux étapes dans le compte Google.
2. Ouvrir [Mots de passe des applications Google](https://myaccount.google.com/apppasswords).
3. Créer un mot de passe d'application (Google affiche généralement un code de 16 caractères).
4. Dans **Paramètres > E-mail**, saisir l'adresse Gmail et ce mot de passe d'application.
5. Cliquer sur **Connecter le compte**. Leanna vérifie IMAP et SMTP avant d'enregistrer les identifiants.

Le mot de passe Google habituel ne doit pas être utilisé. Google peut ne pas proposer les mots de passe d'application sur certains comptes, notamment selon les règles Google Workspace, Advanced Protection ou les politiques de sécurité du compte. Si l'option n'est pas disponible, cette méthode ne pourra pas fonctionner pour ce compte.

## Outils disponibles pour Leanna

| Outil | Fonction |
|---|---|
| `email_check_new` | Vérifier les messages non lus des deux comptes |
| `email_list_messages` | Lister les derniers messages d'une boîte |
| `email_read_message` | Lire un message par son UID IMAP |
| `email_search_messages` | Rechercher avec les critères IMAP pris en charge |
| `email_send_message` | Envoyer un message après confirmation humaine |

Critères de recherche pris en charge : `from:`, `to:`, `subject:`, `after:`, `before:`, `is:unread` et `is:read`. Les autres opérateurs propres à la recherche Gmail ne sont pas interprétés par IMAP.

## Politique d'envoi

- Le compte de Leanna est le compte d'expédition par défaut.
- Si le destinataire n'est pas précisé, Leanna utilise l'adresse du compte personnel connecté.
- Chaque envoi depuis le chat passe par la demande de confirmation interactive du runtime.
- L'envoi depuis le compte personnel nécessite une activation explicite dans les paramètres **et** une confirmation pour chaque message.
- Aucune route HTTP d'envoi direct n'est exposée : l'envoi reste derrière l'outil agent et sa confirmation.

## Sécurité et limites

- Connexions TLS obligatoires, avec TLS 1.2 minimum.
- Mot de passe d'application chiffré au repos et masqué dans l'interface.
- Déconnexion : suppression du secret local. Google ne propose pas de révocation OAuth car aucun jeton OAuth n'est utilisé.
- La lecture extrait le texte du message et les métadonnées des pièces jointes ; le téléchargement des pièces jointes n'est pas encore exposé comme outil.
- Les réponses et transferts de conversations ne sont pas encore exposés comme outils dédiés.
- Les listes sont limitées à 50 messages par appel et le corps lu à 100 000 caractères.
