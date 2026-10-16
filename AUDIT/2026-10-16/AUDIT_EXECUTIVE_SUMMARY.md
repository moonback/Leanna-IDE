# Synthèse exécutive — Audit global de Leanna-IDE (16 octobre 2026)

Branche `perf/knowledge-batch-updates` @ `d66d5d5`, version 2.1.0. Audit en lecture seule : aucun
fichier applicatif, test, dépendance ou configuration n'a été modifié. Seuls les dix fichiers de ce
dossier ont été créés.

Livrables : [Architecture](AUDIT_ARCHITECTURE.md) · [Bugs](AUDIT_BUGS.md) ·
[Sécurité](AUDIT_SECURITY.md) · [UX/UI](AUDIT_UX_UI.md) · [Parcours client](AUDIT_CUSTOMER_JOURNEY.md) ·
[Fonctionnalités manquantes](AUDIT_MISSING_FEATURES.md) · [Tests et qualité](AUDIT_TESTS_AND_QUALITY.md) ·
[Plan d'action](AUDIT_ACTION_PLAN.md) · [Index des preuves](AUDIT_EVIDENCE_INDEX.md)

## 1. État réel du projet

Leanna-IDE est un projet ambitieux et volumineux (≈ 265 000 lignes, 238 outils, deux moteurs
d'exécution autonomes). Il compile sans erreur et ses 1 559 tests passent. Beaucoup de défauts relevés
le 15/10 ont été corrigés (idempotence, statut `partial`).

Le problème central n'est pas le manque de fonctionnalités mais **l'écart entre les garde-fous déclarés
et ceux qui s'exécutent réellement** :
- le chemin le plus utilisé (voix/chat) contourne les permissions, le gate de sécurité et
  l'idempotence ;
- le curseur d'autonomie et `.leannaignore` ne gouvernent que les missions, et `.leannaignore` reste
  figé sur la racine du démarrage ;
- plusieurs composants de gouvernance existent sans être branchés (`AuthorizationGate`, kernel supervisé,
  sandbox des plugins) ;
- l'agent peut exécuter `node`/`npx` et envoyer des fichiers par Telegram sans confirmation ;
- une mission peut être déclarée réussie sans preuve.

Côté distribution, le jeton API du développeur est embarqué dans l'installateur, et une installation
neuve est **probablement inutilisable** (API en 401, assistant muet). Ce point n'a pas été reproduit sur
machine vierge.

**Forces** : TypeScript sans erreur ; suite de tests large et verte ; écoute locale et authentification
de toutes les routes ; CSP de production stricte ; durcissement du navigateur intégré ; confirmation
fail-closed pour les fichiers critiques ; RLS Supabase correcte ; documentation abondante et audits
antérieurs honnêtes sur leurs limites.

## 2. Les dix problèmes les plus importants

1. **AUDIT-002** — installation neuve probablement bloquée (401 partout, aucun message). *Critique, probable.*
2. **AUDIT-001** — jeton API du développeur embarqué dans le bundle et l'installateur. *Élevée, confirmé.*
3. **AUDIT-003** — `node`/`npx` exécutés sans confirmation avec tous les secrets en environnement. *Élevée, confirmé.*
4. **AUDIT-004** — le chemin Live/chat contourne `ToolRegistry` (permissions, gate Jev, idempotence). *Élevée, confirmé.*
5. **AUDIT-005** — exfiltration possible de `.env` vers n'importe quel chat Telegram. *Élevée, confirmé.*
6. **AUDIT-012 / 011** — curseur d'autonomie limité aux missions ; `.leannaignore` figé. *Élevée, confirmé.*
7. **AUDIT-013** — succès de mission sans preuve (une action réussie suffit ; verdict négatif converti). *Élevée, confirmé.*
8. **AUDIT-006** — aucun garde anti-injection dans les moteurs autonomes. *Élevée, confirmé.*
9. **AUDIT-018** — missions de refactorisation lancées en un clic, jusqu'à 5 en parallèle, sans aperçu. *Élevée, confirmé.*
10. **AUDIT-035 / 022** — tests qui écrivent dans l'état réel, aucune CI, ESLint en échec masqué. *Moyenne, confirmé.*

## 3. Risques qui nécessitent une intervention immédiate

- **Faire tourner le jeton API** exposé dans `Leanna Setup 2.1.0.exe` et ne plus redistribuer cet installateur.
- **Bloquer `node`/`npx` sans confirmation** et filtrer l'environnement des sous-processus (correctif court).
- **Désactiver ou restreindre `telegram_send_from_workspace`** tant que le contrôle de chemin et de destinataire n'est pas en place.
- Recommander aux utilisateurs actuels le mode d'autonomie « suggest » **en sachant qu'il ne couvre que les missions** (AUDIT-012).

## 4. Fonctionnalités centrales qui ne fonctionnent pas complètement

| Fonctionnalité annoncée | Réalité constatée |
|---|---|
| Approbation interactive des actions à risque | Partielle : fichiers critiques et `npm` oui ; `node`, `npx`, Telegram non ; chemin Live hors `ToolRegistry` |
| Curseur d'autonomie + `.leannaignore` | Missions seulement ; motifs figés au démarrage |
| Vérification par preuve | Opt-in, désactivée par défaut ; repli complaisant |
| Mémoire et apprentissage inter-missions | Écrits ; seule la fiabilité des outils est relue par le Planner |
| Superviseur / noyau transactionnel | `LeannaSupervisor` opt-in pour les missions ; `runSupervisedAgenticMission` orphelin |
| Sandbox des plugins | Non branchée (`AgentLoader` inutilisé) |
| Marketplace | Catalogue, avis et téléchargements fictifs |
| Diagnostic de santé du projet | Indicateur de taille de fichier faux ; compteurs contradictoires |
| Premier démarrage packagé | Probablement bloqué |

## 5. Améliorations UX/UI prioritaires

1. « Simuler » avant tout lancement de mission, confirmation explicite, erreurs visibles (AUDIT-018/033).
2. Écran d'erreur clair sur 401 et au premier démarrage (AUDIT-002/033).
3. Une seule navigation, regroupée en 5-6 espaces, police ≥ 12 px (AUDIT-027).
4. Libellés d'état non ambigus (« Voix : inactive » au lieu de « Hors ligne ») (AUDIT-032).
5. Accessibilité : 205 avertissements jsx-a11y à traiter (AUDIT-034).

## 6. Principales frictions du parcours client

Installation lourde (1 Go installé) ; premier démarrage probablement bloqué sans explication ; assistant
de clés qui disparaît en cas d'erreur ; jargon interne ; deux systèmes de navigation ; aucune
visibilité sur ce que l'IA est autorisée à faire ; missions lancées sans aperçu ; diagnostic de santé
partiellement faux.

## 7. Fonctionnalités manquantes les plus utiles

1. Point de passage unique des autorisations (brancher `AuthorizationGate`).
2. Journal unifié des actions de l'IA (commande, fichiers, environnement, approbation, preuve).
3. Profil d'environnement des sous-processus visible et modifiable.
4. Écran de diagnostic de premier démarrage avec réparation.
5. Test e2e de mission de référence en CI avec un modèle déterministe.

## 8. Tests réellement exécutés

| Contrôle | Résultat |
|---|---|
| `tsc --noEmit` | 0 erreur (3 min 22 s) |
| `npm test` (serveur) | 1 467 / 1 467 réussis, 174 suites (4 min 21 s) |
| `vitest` (UI) | 92 / 92 réussis, 19 fichiers (1 min 13 s) |
| `npm run lint` (linter maison) | 0 erreur, 5 577 avertissements |
| `eslint .` | **181 erreurs**, 2 220 avertissements (sortie 1) |
| Build web (dossier isolé) | Réussi, 1 min 30 s, 30 Mo |
| Build serveur esbuild (dossier isolé) | Réussi, 4,09 Mo |
| `npm audit` | prod : 2 faibles ; total : 3 critiques, 2 élevées (outillage) |
| Effets de bord des tests | `git status` inchangé ; **écritures dans `.Leanna/` réel** (AUDIT-035) |

Non exécutés : tests de soak, tests de missions avec LLM réel, packaging, tests e2e Electron
(inexistants), installation sur machine vierge.

## 9. Plan d'action ordonné (résumé)

- **P0** : rotation et amorçage du jeton à l'exécution (P0.1) ; confirmation `node`/`npx` et
  environnement filtré (P0.2) ; suppression du court-circuit Live (P0.3) ; Telegram sécurisé (P0.4) ;
  suppression des IPC inutilisés (P0.5).
- **P1** : `AuthorizationGate` dans `ToolRegistry` (P1.1) → `.leannaignore` dynamique (P1.2) ;
  vérification honnête des missions (P1.3) ; garde anti-injection dans les moteurs autonomes (P1.4) ;
  « Simuler d'abord » et file d'attente des missions (P1.5) ; retry limité aux lectures (P1.6) ;
  enquête `verify_file` (P1.7).
- **P2** : isolation des tests (P2.1), CI (P2.2), ESLint (P2.3), indicateurs (P2.4), Marketplace (P2.5),
  dépendances (P2.6), UX (P2.7), authentification (P2.8), secrets (P2.9), Planner (P2.10)…
- **P3** : `utilityProcess`, journal unifié, diagnostic de démarrage, e2e de référence, unification des
  moteurs.

Détails, prérequis, risques et critères : [AUDIT_ACTION_PLAN.md](AUDIT_ACTION_PLAN.md).

## 10. Prochaine tâche concrète

Sur une branche dédiée, corriger **AUDIT-003** dans `server/skills/system.ts` : confirmation de risque
« high » pour `npx` et `node`, refus des drapeaux d'évaluation, environnement des sous-processus en
liste blanche. Écrire d'abord les deux tests décrits dans le constat et vérifier qu'ils échouent sur le
code actuel. En parallèle, faire tourner le jeton API exposé.

---

## Couverture de l'audit et état de reprise

**Inspecté en profondeur** : Electron (main, preload), authentification et montage des routes
(`server.ts`, `server/security.ts`), exécution de commandes (`server/skills/system.ts`), écriture de
fichiers critiques, `ToolRegistry`, `SkillManagerV2`, `SkillAdapter`, `PermissionPolicy`, `DryRun`,
`LedgerGuard`, `AutonomyPolicy`, vérification d'`AgenticRuntime` et de l'`Executor`, `MissionSimulator`,
garde anti-injection, Telegram (envoi de fichiers), Marketplace, stockage des secrets, Supabase (RLS),
`EnvSetupModal`, `AuthGate`, `MissionControlView`, calcul de santé (`KnowledgeGraph`/`ProjectDoctor`),
isolation des tests.

**Inspecté partiellement** : `LiveSocketHandler` (routage et retries), `Planner`, `Reflection`,
`PlaybookStore`, CSP, sanitizer Markdown, terminal WebSocket, sandbox.

**Non audité (à reprendre)** :
1. `server/skills/browser.ts` et `automationBrowser.ts` (navigation, saisie, sessions) ;
2. notebooks, RAG, ingestion de documents (`server/notebooks/*`, upload) ;
3. workflows et tâches planifiées (`server/skills/workflow.ts`, `automationScheduler.ts`) ;
4. GitHub (push, PR) et `codebaseWriter` hors fichiers critiques ;
5. MCP (`server/mcp/*`) — aucun serveur configuré pendant l'audit ;
6. reprise après crash (constat 6 du 15/10 non revérifié) ;
7. écrans UI non visités (chat, notebooks, navigateur, agents, observabilité, marketplace) ;
8. performance mesurée (démarrage, mémoire, rendus React) — aucun profilage effectué ;
9. installation sur machine vierge (pour confirmer AUDIT-002).

**Prochaines actions exactes pour reprendre l'audit** : relancer `npm run dev` ; auditer les points 1 à 4
avec la même méthode (outil → permissions déclarées → chemin d'appel → confirmation → contrôle de chemin) ;
mesurer le démarrage (`Leanna-debug.log` horodaté) ; tester AUDIT-002 dans une VM.
