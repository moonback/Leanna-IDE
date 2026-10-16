# Plan d'action priorisé (16 octobre 2026)

Principe : corriger d'abord ce qui rend le produit dangereux ou inutilisable, puis rendre les garde-fous
**réellement uniformes**, puis rendre les résultats **honnêtes**, et seulement ensuite enrichir.
Aucune refonte d'architecture n'est proposée sans constat qui la justifie : la seule évolution
structurelle (point de passage unique des autorisations) réutilise un composant déjà écrit
(`AuthorizationGate`) et le point de passage existant (`ToolRegistry.call`).

## P0 — Sécurité critique et impossibilité d'utiliser le produit

| Ordre | Action | Constats | Prérequis | Effort | Risque de régression | Critère de résolution |
|---|---|---|---|---|---|---|
| P0.1 | Faire tourner le jeton API actuel ; supprimer `VITE_Leanna_API_TOKEN` ; jeton généré au lancement et transmis par le preload ; 401 → écran explicite | 001, 002, 009 (pt 4) | — | Moyen | Moyen : tous les `fetch`, WebSockets et ressources `?token=` | Build sans jeton (scan automatique) ; installation neuve sur VM → assistant de clés affiché → appel API 200 |
| P0.2 | `node` / `npx` soumis à confirmation « high » ; interdire `-e/-p/--eval/--print` ; environnement filtré pour tous les sous-processus | 003, 008 | — | Faible | Faible : scripts qui lisaient une variable d'environnement | Tests : pas d'exécution sans confirmation ; enfant sans `*_KEY/_TOKEN/_SECRET` |
| P0.3 | Supprimer le court-circuit de `SkillManagerV2` : tout appel passe par `ToolRegistry.call` avec `context` | 004 | — | Faible à moyen | Moyen : outils qui dépendent de `emitIdeAction` (vérifier par tests Live) | Outil sans permission refusé en Live ; gate Jev journalise les appels Live |
| P0.4 | `telegram_send_from_workspace` : `resolveWorkspacePath`, `chatId` restreint, confirmation | 005 | P0.3 conseillé | Faible | Faible | `.env` refusé ; `chatId` inconnu refusé |
| P0.5 | Retirer les 6 IPC inutilisés ; valider l'expéditeur des IPC restants | 007 | — | Faible | Faible (aucun appelant) | Liste des clés du preload testée |

## P1 — Bugs majeurs, fausses déclarations de réussite, fonctions centrales inopérantes

| Ordre | Action | Constats | Prérequis | Effort | Critère de résolution |
|---|---|---|---|---|---|
| P1.1 | Brancher `AuthorizationGate` dans `ToolRegistry.call` (permissions + curseur d'autonomie + chemins sandbox) pour tous les moteurs | 012, 015 | P0.3 | Moyen | En mode « suggest », une écriture demandée par la voix, un agent ou une mission est refusée |
| P1.2 | `AutonomyPolicy` : racine dynamique, rechargement de `.leannaignore` au changement de projet, mode persistant | 011 | P1.1 | Faible | Test : changement de projet → motif appliqué |
| P1.3 | Vérification honnête des missions : preuve activée par défaut, `allSuccess` sans critères, pas de verdict négatif converti, statut `non vérifié` | 013 | — | Faible | Tests unitaires des trois cas |
| P1.4 | Garde anti-injection sur toutes les observations d'outils d'`AgenticRuntime` et de l'`Executor` | 006 | — | Faible | Test avec modèle factice capturant le prompt |
| P1.5 | Boutons Pilotage : « Simuler » d'abord, confirmation explicite, erreurs visibles ; file d'attente d'une mission d'écriture à la fois par workspace | 018, 017, 033 | P1.3 conseillé | Moyen | Aucun `POST /api/missions` sans écran de confirmation ; deux missions ne s'exécutent pas en parallèle sur le même workspace |
| P1.6 | Retry Live limité aux outils en lecture | 016 | P0.3 | Faible | Outil `write` en timeout appelé une seule fois |
| P1.7 | Investiguer `verify_file` à 0 % de succès | 028 | P2.1 (données propres) | Faible à moyen | Taux de succès mesuré sur un jeu propre et cause documentée |

## P2 — Fiabilité, UX/UI, tests, performance, fonctions incomplètes

| Ordre | Action | Constats | Effort |
|---|---|---|---|
| P2.1 | Résolveur unique du dossier d'état (`LEANNA_STATE_DIR`), tests entièrement isolés, purge des données de test du `.Leanna/` local | 035, 023 | Faible |
| P2.2 | CI : typecheck, `npm test`, `test:ui`, ESLint en erreurs, build, scan de secrets du bundle, vérification d'arborescence `.Leanna/` | 022 | Faible |
| P2.3 | Corriger les 181 erreurs ESLint (priorité aux 34 `no-empty` dans les chemins d'outils) ; remplacer `npm run lint` | 022 | Moyen |
| P2.4 | Indicateurs : moyenne en lignes, source unique du compteur de missions | 019, 020 | Faible |
| P2.5 | Marketplace : retirer les données fictives ou bandeau « démo » | 021 | Faible |
| P2.6 | Mettre à jour `vite`, `vitest`, `@vitest/ui` | 024 | Faible à moyen |
| P2.7 | Navigation unique, police ≥ 12 px, libellé « Voix : inactive », corrections jsx-a11y | 027, 032, 034 | Moyen |
| P2.8 | Authentification : refuser `?token=` hors ressources binaires, contrôle `Origin` WebSocket, `timingSafeEqual` | 009 | Faible |
| P2.9 | Clé maître dans `safeStorage`, chiffrement uniforme des secrets | 008 | Moyen |
| P2.10 | Planner : injection du playbook et des leçons pertinentes, avec mesure avant/après | 014 | Moyen |
| P2.11 | Cache de lecture après les contrôles de permission | 030 | Faible |
| P2.12 | README : trois états (implémenté / branché / validé) | 026 | Faible |

## P3 — Améliorations produit et évolutions justifiées

| Ordre | Action | Justification |
|---|---|---|
| P3.1 | Serveur dans un `utilityProcess` Electron ; dépendances de production allégées | AUDIT-025 (paquet 1 Go, processus unique) |
| P3.2 | Journal unifié des actions de l'IA (C1) | Traçabilité aujourd'hui dispersée |
| P3.3 | Écran de diagnostic de premier démarrage (C3) | Réduit l'abandon à l'installation |
| P3.4 | Test e2e de mission de référence avec modèle déterministe (C4) | Valide la boucle autonome de bout en bout |
| P3.5 | Unifier ou documenter clairement les deux moteurs (`Executor` / `AgenticRuntime`) | Deux contrats de vérification, constat récurrent depuis le 15/10 |
| P3.6 | Sandbox plugins réelle avant toute Marketplace publique | AUDIT-015, D1 |

## Dépendances principales

```
P0.1 ─────────────────────────────► P3.3
P0.3 ─► P0.4, P1.1 ─► P1.2
        P1.6
P1.3 ─► P1.5
P2.1 ─► P1.7, P2.2
P2.2 ─► (garde-fou permanent pour toutes les corrections)
```

## Stratégie de validation

1. Chaque correction arrive avec le test de non-régression décrit dans son constat ; le test doit
   échouer sur le code actuel avant la correction (preuve que le défaut est réel).
2. P2.2 (CI) est réalisable immédiatement et en parallèle de P0 : il fige les acquis.
3. Après P0 + P1 : rejouer manuellement trois scénarios de référence et consigner les résultats —
   (a) installation neuve sur VM ; (b) fichier piégé contenant une instruction `node -p process.env`
   lu par un agent en mode « auto » ; (c) mission « corrige ce test » avec preuve.
4. Ne pas déclarer un constat résolu sans le critère de résolution du tableau ci-dessus.

## Prochaine tâche concrète

**P0.1 + P0.2, dans cet ordre, sur une branche dédiée** — commencer par P0.2 (effort faible, aucun
prérequis) : dans `server/skills/system.ts`, faire passer `npx` et `node` par une confirmation de
risque « high », bloquer les drapeaux d'évaluation, et construire l'environnement des sous-processus à
partir d'une liste blanche. Écrire d'abord les deux tests décrits dans AUDIT-003 et vérifier qu'ils
échouent sur le code actuel. Faire tourner le jeton API exposé (P0.1) dès que possible, même avant le
correctif complet.
