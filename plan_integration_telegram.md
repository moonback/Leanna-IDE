# Plan d'action : Intégration de Telegram

Ce document détaille les étapes pour intégrer Telegram à ton projet.

## Phase 1 : Préparation et Configuration

1.  **Création du Bot** :
    *   Contacter `@BotFather` sur Telegram.
    *   Utiliser la commande `/newbot` pour obtenir le **Token d'API**.
    *   Configurer les commandes avec `/setcommands`.

2.  **Sécurisation** :
    *   Ajouter le Token dans le fichier `.env`.
    *   **Ne pas commiter** le Token.

## Phase 2 : Développement

1.  **Installation** :
    *   Installer une bibliothèque (ex: `grammy` ou `telegraf`).

2.  **Service Telegram** :
    *   Initialiser le bot dans le code.
    *   Créer les gestionnaires (handlers) pour les commandes et messages.

3.  **Liaison Métier** :
    *   Connecter les commandes Telegram à la logique existante du projet.

## Phase 3 : Déploiement

1.  **Local** : Utiliser le mode "polling".
2.  **Production** : Configurer un "webhook" HTTPS.

## Phase 4 : Tests

*   Valider le fonctionnement global.