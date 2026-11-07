# Intégration e-mail — Leanna

## Périmètre

Le compte dédié **Leanna** utilise Infomaniak. Le compte personnel existant, s'il est configuré, reste indépendant et conserve son intégration Gmail. Cette évolution ne migre, ne déconnecte et ne modifie pas le compte personnel.

La connexion utilise les protocoles standards **IMAP et SMTP**, sans OAuth2, sans API propriétaire et sans fenêtre d'authentification navigateur.

## Paramètres Infomaniak

| Paramètre | Valeur |
|---|---|
| Serveur IMAP | `mail.infomaniak.com` |
| Port IMAP | `993` |
| Sécurité IMAP | SSL/TLS implicite |
| Serveur SMTP | `mail.infomaniak.com` |
| Port SMTP | `587` |
| Sécurité SMTP | STARTTLS obligatoire |
| Identifiant | Adresse e-mail complète |
| Mot de passe | Mot de passe de la boîte (ou mot de passe dédié si la double authentification le requiert) |

Ces paramètres sont ceux de la documentation officielle Infomaniak : https://www.infomaniak.com/fr/support/faq/468

## Configuration

1. Créer ou disposer d'une adresse e-mail Infomaniak dédiée à Leanna.
2. Vérifier que l'accès IMAP est disponible pour cette boîte.
3. Dans **Paramètres > E-mail**, choisir **Infomaniak (sans OAuth2)** pour le compte dédié de Leanna.
4. Saisir l'adresse complète et le mot de passe de la boîte.
5. Cliquer sur **Connecter le compte**.

Leanna teste réellement la connexion IMAP puis SMTP avant d'enregistrer les identifiants. En cas d'échec, le compte précédent reste configuré.

## Architecture

- Le service `server/email/GmailService.ts` conserve les cinq outils agent existants et sélectionne les paramètres réseau à partir du fournisseur enregistré pour chaque compte.
- Le compte `leanna` accepte Infomaniak ou Gmail.
- Le compte `personal` reste Gmail ; Infomaniak ne peut pas être configuré sur ce compte dans cette évolution.
- Les connexions IMAP et SMTP exigent TLS 1.2 minimum.
- SMTP Infomaniak utilise STARTTLS obligatoire sur le port 587 ; aucune connexion en clair n'est autorisée.
- Les mots de passe restent chiffrés avec `server/utils/crypto.ts` dans `.Leanna-email.json`, dans le dossier de configuration persistant de Leanna.
- Les secrets ne sont jamais renvoyés au frontend, exposés aux outils agent ou écrits dans les logs.

## Outils agent conservés

| Outil | Fonction |
|---|---|
| `email_check_new` | Vérifier les messages non lus |
| `email_list_messages` | Lister les derniers messages |
| `email_read_message` | Lire un message par son UID IMAP |
| `email_search_messages` | Rechercher avec les critères IMAP pris en charge |
| `email_send_message` | Envoyer un message après confirmation humaine |

Les critères de recherche restent : `from:`, `to:`, `subject:`, `after:`, `before:`, `is:unread` et `is:read`. Les messages sont actuellement lus dans INBOX.

## Protections conservées

- Chiffrement des secrets au repos et permissions de fichier restrictives.
- TLS 1.2 minimum et vérification des certificats.
- Vérification IMAP et SMTP avant l'enregistrement d'une nouvelle configuration.
- Pas de route HTTP d'envoi direct.
- Chaque envoi passe par l'outil agent et une confirmation interactive explicite affichant le compte expéditeur, le destinataire, l'objet et un aperçu du corps.
- Si le pont de confirmation est absent, l'envoi est refusé.
- Les validations de destinataire, Cc, objet, corps et taille du message restent actives.
- Les contenus reçus sont des données non fiables : ils ne peuvent pas modifier les règles de Leanna ni déclencher seuls un envoi.
- Le compte personnel garde son verrou d'envoi désactivé par défaut.

## Limites connues

- Pas d'API OAuth2 ni de synchronisation propriétaire Infomaniak : IMAP/SMTP sont les interfaces utilisées.
- La lecture et la recherche couvrent actuellement INBOX et les critères exposés par le service.
- Les pièces jointes sont exposées sous forme de métadonnées ; leur téléchargement et leur envoi ne sont pas couverts par les cinq outils actuels.
- Les opérations d'archivage, suppression, déplacement, réponse et transfert ne sont pas exposées.
- Les listes sont limitées à 50 messages par appel et le corps lu à 100 000 caractères.
