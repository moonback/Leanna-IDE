# Intégration Gmail — Leanna

## Fonctionnement

Leanna prend en charge deux boîtes Gmail indépendantes :

- **Compte dédié de Leanna** : compte d'expédition par défaut de l'assistante.
- **Compte personnel** : boîte personnelle consultable séparément. L'envoi depuis cette adresse est désactivé par défaut.

L'intégration utilise OAuth 2.0 et l'API Gmail. Aucun mot de passe Google n'est collecté. Le Client Secret OAuth et les refresh tokens sont chiffrés avec le module local `server/utils/crypto.ts`, puis enregistrés dans `.Leanna-email.json` sous le dossier de configuration persistant de Leanna (`Leanna_CONFIG_PATH` / `userData` Electron). Ce fichier ne doit jamais être ajouté à Git, envoyé au frontend ou inclus dans les logs.

## Configuration Google Cloud

1. Ouvrir [Google Cloud Console — Identifiants](https://console.cloud.google.com/apis/credentials).
2. Sélectionner ou créer un projet Google Cloud.
3. Activer **Gmail API** dans « API et services > Bibliothèque ».
4. Configurer l'écran de consentement OAuth. En mode test, ajouter les deux adresses Gmail comme utilisateurs de test.
5. Créer un identifiant OAuth de type **Application Web**.
6. Ajouter exactement l'URI de redirection affichée dans **Paramètres > E-mail Gmail**. En développement, la valeur par défaut est :
   `http://127.0.0.1:4000/api/email/oauth/callback`
7. Copier le Client ID et le Client Secret dans Paramètres > E-mail Gmail, puis enregistrer.
8. Connecter séparément le compte de Leanna et le compte personnel en suivant les fenêtres Google.

Scopes demandés :
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/gmail.send`

Google peut exiger une vérification OAuth avant une distribution publique selon le statut de l'application et les scopes demandés. Pour un usage personnel en mode test, les comptes doivent être déclarés comme utilisateurs de test.

## Outils disponibles pour Leanna

| Outil | Fonction |
|---|---|
| `email_check_new` | Vérifier les messages non lus des deux comptes |
| `email_list_messages` | Lister les derniers messages d'une boîte |
| `email_read_message` | Lire un message par son identifiant |
| `email_search_messages` | Rechercher avec la syntaxe Gmail |
| `email_send_message` | Envoyer un message après confirmation humaine |

Exemples de recherche Gmail : `from:contact@example.com`, `subject:facture`, `after:2026/01/01`, `has:attachment`, `is:unread`.

## Politique d'envoi

- Le compte de Leanna est le compte d'expédition par défaut.
- Si le destinataire n'est pas précisé, Leanna utilise l'adresse du compte personnel connecté.
- Chaque envoi depuis le chat passe par la demande de confirmation interactive du runtime.
- L'envoi depuis le compte personnel nécessite une activation explicite dans les paramètres **et** une confirmation pour chaque message.
- L'API ne fournit volontairement pas de route d'envoi directe contournant cette confirmation.

## Limites actuelles

- Les pièces jointes sont listées dans les métadonnées du message mais leur téléchargement n'est pas encore exposé comme outil.
- Les réponses et le transfert de conversations ne sont pas encore exposés comme outils dédiés.
- La recherche et la lecture sont limitées aux 50 résultats par appel et le corps lu est tronqué à 100 000 caractères.
- Les tests de bout en bout nécessitent un projet Google Cloud OAuth réel et deux comptes Gmail autorisés.
