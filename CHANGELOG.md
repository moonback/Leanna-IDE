# Changelog — Leanna

Toutes les modifications notables du projet sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

---

## [Unreleased] - 2026-09-05

### Sécurité
- Durcissement de `run_project_command` : classification des scripts npm connus, confirmation renforcée pour les scripts arbitraires et transmission du niveau de risque à l'interface.
- Policy navigateur `PUBLIC_WEB` : blocage de localhost, loopback, réseaux privés, link-local et domaines internes.
- Délégation inter-agents soumise à une `DelegationPolicy` explicite ; suppression de l'autorisation joker pour les agents custom.

### Modifié
- Classement et déduplication des liens navigateur avant navigation.
- `browser_research` enrichi avec fiabilité, fraîcheur, faits, preuves, consensus, contradictions et confiance.
- Boucles autonomes bornées par le runtime à 3 approches × 2 tentatives, avec pivot imposé.
- `SystemPromptBuilder` devient la source canonique ; les anciennes fonctions de prompt restent des wrappers de compatibilité.
- Le précheck `checkBracketBalance` est non bloquant pour TypeScript ; l'API Compiler TypeScript reste l'autorité syntaxique.
- Les workflows de modification sont gradués `TRIVIAL`, `STANDARD` et `COMPLEX`.

### Documentation
- Mise à jour de `API_DOCS.md`, `ARCHITECTURE.md` et `TESTING.md` avec les politiques d'exécution, de navigation, de délégation et de validation.
- Nouvelle section **Choisir entre un navigateur visible et l'automatisation headless** :
  - Explications des cas d'usage : quand préférer un navigateur visible (débogage, démonstrations, interactions manuelles, tests visuels) et quand privilégier le headless (CI/serveurs, performance, parallélisation).
  - Critères de décision pratiques : performance, stabilité, observabilité, consommation de ressources, complexité d'installation et compatibilité OS.
  - Exemples et recettes : configurations pour local, CI et Docker ; snippets de lancement pour les deux modes.
  - Considérations CI/CD : recommandations d'intégration dans les pipelines, gestion des dépendances navigateur/headless et réduction du flakiness.
  - Accessibilité et tests visuels : impacts sur les tests E2E, captures d'écran et enregistrement vidéo selon le mode.
  - Conseils de déploiement et paramètres recommandés : options par défaut, variables d'environnement et flags utiles.
  - Limites connues et troubleshooting : erreurs courantes (sandboxing, dépendances manquantes, permissions) et solutions.
- Scope & impact :
  - Type: documentation (aucune modification de l'API ou code de production prévue).
  - Risque: faible — contenu informatif seulement.
  - Taille du changement: 94 fichiers modifiés, +7 446 lignes ajoutées, -1 682 lignes supprimées.
- Remarques
  - Pas de breaking changes.
  - Recommande de relire les nouveaux exemples si vous avez des workflows CI particuliers (Docker, headless sur serveurs sans GPU).

## [1.0.0] - 2026-09-04

### Ajouté

#### Tests d'intégration REST complets
- **74 nouveaux tests d'intégration** pour tous les routeurs REST (`server/routes/*.test.ts`)
- Couverture complète des endpoints API :
  - `agents.test.ts` : 15 tests (statut, tâches, rôles, flotte, collaboration, persistance)
  - `marketplace.test.ts` : 13 tests (recherche, installation, publication, sécurité)
  - `workflows.test.ts` : 7 tests (CRUD et exécution)
  - `browser.test.ts` : 7 tests (actions navigateur et promesses)
  - `upload-document.test.ts` : 7 tests (validation, rate limiting)
  - `conversations.test.ts` : 7 tests (historique et recherche)
  - `skills.test.ts` : 6 tests (liste et configuration Supabase)
  - `profile.test.ts` : 6 tests (profil et tokens)
  - `terminal.test.ts` : 5 tests (configuration et sessions)
  - `memories.test.ts` : 3 tests (mémoire long-terme)
  - `workspace.test.ts` : 3 tests (info workspace)
  - `health.test.ts` : 1 test (health check)
- Validation complète des codes HTTP (200, 400, 404, 500, 503)
- Tests de validation Zod pour tous les endpoints POST/PATCH
- Tests d'authentification et rate limiting
- Gestion des dépendances optionnelles (Supabase, registres)

#### Documentation
- Nouveau document **TESTING.md** : guide complet de test
  - Stratégie de test (unitaire vs intégration)
  - Patterns et conventions
  - Exemples de code annotés
  - Instructions debugging
  - Métriques et objectifs de couverture
- Mise à jour **README.md** : ajout section tests d'intégration
- Mise à jour **CONTRIBUTING.md** : templates de tests et bonnes pratiques
- Mise à jour **API_DOCS.md** : section tests d'intégration
- Mise à jour **ARCHITECTURE.md** : section complète sur les tests
- Nouveau **CHANGELOG.md** : suivi des versions

### Modifié

#### Tests existants
- Adaptation des tests pour gérer les services optionnels (Supabase)
- Amélioration de la gestion des erreurs dans les tests
- Uniformisation des patterns de test HTTP

### Technique

- Tous les tests utilisent le Node.js test runner natif (`node:test`)
- Pattern standard : serveur Express isolé sur port aléatoire par test
- Cleanup automatique des ressources (fermeture serveurs, restauration env)
- Exécution parallèle des tests pour performance optimale
- Couverture totale : **210+ tests** (136 unitaires + 74 intégration)

---

## Versions précédentes

Les versions antérieures à 1.0.0 ne sont pas documentées dans ce changelog.
Consultez l'historique Git pour les détails :

```bash
git log --oneline --decorate --graph
```

---

**Format du changelog :**
- `Ajouté` : nouvelles fonctionnalités
- `Modifié` : changements sur des fonctionnalités existantes
- `Déprécié` : fonctionnalités qui seront retirées
- `Retiré` : fonctionnalités supprimées
- `Corrigé` : corrections de bugs
- `Sécurité` : en cas de vulnérabilités

[1.0.0]: https://github.com/<owner>/leanna/releases/tag/v1.0.0
