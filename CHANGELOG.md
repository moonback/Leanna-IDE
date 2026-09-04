# Changelog — Leanna

Toutes les modifications notables du projet sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

---

## [Unreleased] - 2026-09-04

### Ajouté

- Documentation du tuning adaptatif des skills dans le README et la référence API.
- Génération périodique des propositions de tuning via `LEANNA_SKILL_TUNING_INTERVAL_MS`.
- Déduplication des propositions ouvertes et conservation de l’identifiant de révision appliquée.
- Tests du scheduler et du cycle métriques → proposition → approbation → rollback.

### Modifié

- Roadmap synchronisée avec les fonctionnalités effectivement livrées: tests REST, notifications agents, recherche globale et diff viewer.

---

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
