# Intégration e-mail — Leanna

## Périmètre

Le compte dédié **Leanna** utilise une configuration IMAP/SMTP générique, définie dans Paramètres > E-mail. Il est compatible avec les fournisseurs qui exposent IMAP sur SSL/TLS et SMTP sur SSL/TLS ou STARTTLS. Aucun OAuth2, SDK propriétaire ni navigateur d'authentification n'est utilisé.

Le compte personnel existant reste indépendant et conserve Gmail et son mot de passe d'application. Cette évolution ne modifie pas sa configuration ni ses permissions d'envoi.

## Configuration du compte Leanna

Renseigner les paramètres communiqués par l'hébergeur :

| Champ | Règle |
|---|---|
| Hôte IMAP | Nom DNS du serveur entrant |
| Port IMAP | Port TCP entre 1 et 65535 |
| Sécurité IMAP | SSL/TLS obligatoire |
| Hôte SMTP | Nom DNS du serveur sortant |
| Port SMTP | Port TCP entre 1 et 65535 |
| Sécurité SMTP | SSL/TLS implicite ou STARTTLS obligatoire |
| Identifiant | Adresse e-mail complète |
| Mot de passe | Mot de passe de la boîte ou mot de passe dédié |

Ports courants : IMAP 993 en SSL/TLS ; SMTP 465 en SSL/TLS ou 587 en STARTTLS. Les valeurs exactes dépendent du fournisseur.

### Exemple Infomaniak

| Paramètre | Valeur |
|---|---|
| IMAP | `mail.infomaniak.com:993` — SSL/TLS |
| SMTP | `mail.infomaniak.com:587` — STARTTLS |

Documentation : https://www.infomaniak.com/fr/support/faq/468

## Connexion

1. Ouvrir **Paramètres > E-mail**.
2. Dans le compte dédié de Leanna, renseigner les hôtes et ports IMAP/SMTP fournis par le fournisseur.
3. Choisir SSL/TLS ou STARTTLS pour SMTP. IMAP impose SSL/TLS.
4. Saisir l'adresse complète et le mot de passe.
5. Cliquer sur **Connecter le compte**.

Le service vérifie la connexion IMAP et l'accès à INBOX, puis vérifie SMTP. La nouvelle configuration n'est persistée qu'après réussite des deux contrôles ; une configuration existante reste active si la tentative échoue.

## Architecture

- `server/email/GmailService.ts` conserve les cinq outils agent et utilise une configuration de serveurs persistée par compte.
- Le compte `leanna` utilise les paramètres personnalisés fournis par l'utilisateur.
- Le compte `personal` conserve Gmail et ses paramètres historiques ; la configuration personnalisée est refusée pour ce compte.
- Les configurations historiques Infomaniak sont migrées vers les paramètres IMAP/SMTP personnalisés correspondants. Les anciennes configurations Gmail de Leanna sont reprises comme point de départ modifiable.
- Les mots de passe restent chiffrés avec `server/utils/crypto.ts` dans `.Leanna-email.json`. Les paramètres serveur ne contiennent aucun secret.
- Les hôtes doivent être des noms DNS valides ; les adresses IP littérales et les noms locaux/réservés sont refusés.
- IMAP impose SSL/TLS ; SMTP impose SSL/TLS ou STARTTLS. TLS 1.2 minimum et la validation standard des certificats sont conservés.

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
- TLS 1.2 minimum et validation des certificats.
- Refus des hôtes locaux/réservés et des adresses IP littérales.
- Vérification IMAP et SMTP avant l'enregistrement.
- Pas de route HTTP d'envoi direct.
- Chaque envoi passe par l'outil agent et une confirmation interactive explicite affichant le compte expéditeur, le destinataire, l'objet et un aperçu du corps.
- Si le pont de confirmation est absent, l'envoi est refusé.
- Les validations de destinataire, Cc, objet, corps et taille du message restent actives.
- Les contenus reçus sont des données non fiables : ils ne peuvent pas modifier les règles de Leanna ni déclencher seuls un envoi.
- Le compte personnel garde son verrou d'envoi désactivé par défaut.

## Limites connues

- Compatibilité limitée aux fournisseurs offrant IMAP SSL/TLS et SMTP SSL/TLS ou STARTTLS avec authentification par identifiant/mot de passe.
- Les fournisseurs imposant OAuth2, API propriétaires, authentification spéciale ou SMTP sans authentification ne sont pas compatibles avec ce connecteur.
- La lecture et la recherche couvrent actuellement INBOX et les critères exposés par le service.
- Les pièces jointes sont exposées sous forme de métadonnées ; leur téléchargement et leur envoi ne sont pas couverts par les cinq outils actuels.
- Les opérations d'archivage, suppression, déplacement, réponse et transfert ne sont pas exposées.
- Les listes sont limitées à 50 messages par appel et le corps lu à 100 000 caractères.
