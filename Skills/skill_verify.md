# Skill : Verify (`server/skills/verify.ts`)

Ce skill fournit des outils pour valider la qualité, la syntaxe, la compilation et la sécurité du code. Il est utilisé pour s'assurer que les modifications apportées au projet ne cassent rien et respectent les standards.

## Outils Exposés

Ce skill offre des outils de validation puissants :

*   `verify_file` : Lance une analyse complète sur un fichier modifié (lint, typecheck ciblé, sécurité, tests associés).
*   `verify_typecheck` : Vérifie la compilation TypeScript de tout le projet.
*   `verify_syntax` : Vérification syntaxique rapide standalone (équilibre accolades, etc.).
*   `verify_security` : Analyse de sécurité statique sur le projet.

## Autonomie

Ce skill est indispensable pour l'autonomie car il permet à l'IA de vérifier d'elle-même la validité de ses changements. Elle peut ainsi détecter et corriger immédiatement ses erreurs sans attendre un retour humain.

**Pistes d'amélioration pour l'autonomie :**
*   Permettre à l'IA de lancer automatiquement des tests de non-régression plus larges si une modification touche un module critique.
*   Intégrer des outils d'analyse de performance pour vérifier que les changements n'impactent pas négativement la vitesse de l'application.
