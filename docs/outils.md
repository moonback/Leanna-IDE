# Liste complète de tous les outils à ma disposition

Voici l'ensemble exhaustif des outils et capacités que je peux utiliser :

## 📁 Manipulation de fichiers (écriture / structure)
- `write_project_file` : Crée un nouveau fichier ou écrase un fichier existant.
- `modify_project_file` : Modifie un fichier existant par remplacement de texte exact.
- `patch_project_file` : Patche un fichier via des opérations par ligne (replace, insert, delete).
- `rename_project_file` : Renomme ou déplace un fichier ou dossier.
- `delete_project_file` : Supprime un fichier.
- `delete_project_folder` : Supprime un dossier et tout son contenu.
- `create_project_directory` : Crée un nouveau dossier.

## 🔍 Inspection de fichiers (lecture / recherche)
- `read_project_file` : Lit le contenu d'un fichier du workspace.
- `read_file_outline` : Retourne la structure d'un fichier (exports, fonctions, classes, etc.).
- `list_project_files` : Liste les fichiers et dossiers dans un répertoire du projet.
- `search_in_files` : Recherche du texte ou un pattern à travers les fichiers du projet.
- `analyze_project_file` : Analyse un fichier et retourne ses métadonnées et un aperçu.

##  Contrôle & Validation de qualité
- `verify_file` : Vérifie un fichier modifié (lint, typecheck, analyse sécurité, tests).
- `verify_typecheck` : Vérifie la compilation TypeScript de tout le projet.
- `verify_lint` : Lance l'analyseur de syntaxe (lint).
- `verify_format` : Vérifie le formatage du code.
- `verify_full` : Lance une vérification complète du projet.
- `quality_loop` : Exécute une boucle de contrôle qualité.
- `run_tests` : Exécute la suite de tests pertinents.

## 💻 Exécution système & shell
- `run_project_command` : Exécute une commande npm, npx ou node dans le workspace.

## 📄 Rendus visuels & Documentation
- `create_rich_document` : Crée et affiche un document riche interactif (tableaux, graphiques, etc.).

## 🧠 Graphe de connaissances (Graphify)
- `graphify_query` : Explore le graphe relationnel pour répondre à une question sur l'architecture.
- `graphify_path` : Trouve le plus court chemin relationnel entre deux nœuds ou fichiers.
- `graphify_explain` : Donne la fiche détaillée d'un nœud ou symbole.
- `graphify_update` : Met à jour le graphe relationnel après des modifications de code.

## 🤖 Orchestration Multi-Agents
- `agent_delegate` : Délègue une tâche à un agent spécialisé.
- `agent_negotiate` : Met une sous-tâche aux enchères entre agents.
- `agent_orchestrate` : Orchestre plusieurs agents en séquence ou en parallèle.
- `agent_status` : Consulte le statut d'une tâche ou orchestration.

## 🌐 Outils MCP (Model Context Protocol)
- `resolve_library_id` : Résout un nom de paquet à un identifiant de bibliothèque compatible.
- `query_docs` : Récupère et interroge la documentation et des exemples de code.

## 📧 Gestion des e-mails
- `email_check_new` : Vérifie les nouveaux e-mails non lus.
- `email_list_messages` : Liste les derniers e-mails d'un compte.
- `email_read_message` : Lit le contenu d'un e-mail.
- `email_search_messages` : Recherche dans la boîte e-mail.
- `email_send_message` : Envoie un e-mail depuis le compte de Leanna.

## 💬 Notifications Telegram
- `telegram_notify` : Envoie une notification/alerte sur le chat Telegram par défaut.
- `telegram_send_message` : Envoie un message texte direct à un chat Telegram spécifique.
- `telegram_send_photo` : Envoie une photo à un chat Telegram.
- `telegram_send_document` : Envoie un document/fichier à un chat Telegram.
- `telegram_send_from_workspace` : Envoie un fichier directement depuis le workspace.
- `telegram_broadcast` : Diffuse un message à tous les utilisateurs autorisés.
- `telegram_get_status` : Obtient l'état complet du bot Telegram.
- `telegram_list_users` : Retourne la liste des utilisateurs autorisés.
- `telegram_get_chat_info` : Récupère les détails d'un chat Telegram.

## 🔒 Sécurité & Audit
- `security_audit` : Audit complet en lecture seule (SAST, secrets, configuration).

## 🎨 Génération d'images
- `generate_image` : Génère une image à partir d'une description en langage naturel.

## ⏰ Utilitaires
- `get_current_time` : Obtient l'heure et la date actuelles du système.

