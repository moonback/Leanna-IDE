# Bugs confirmés et problèmes probables — Leanna-IDE (16 octobre 2026)

Base : `perf/knowledge-batch-updates` @ `d66d5d5`. Les constats de sécurité sont dans
[AUDIT_SECURITY.md](AUDIT_SECURITY.md) ; ceux d'interface dans [AUDIT_UX_UI.md](AUDIT_UX_UI.md).
Ce fichier couvre les bugs fonctionnels, l'autonomie IA et la qualité.

## Index

| ID | Titre | Gravité | Statut | Confiance |
|---|---|---|---|---|
| AUDIT-002 | Installation neuve : jeton serveur ≠ jeton embarqué → toute l'API en 401, assistant muet | Critique | Probable | Élevée |
| AUDIT-011 | `.leannaignore` et curseur d'autonomie figés sur la racine du démarrage | Élevée | Confirmé (code) | Élevée |
| AUDIT-012 | Curseur d'autonomie appliqué au seul moteur de missions ; `AuthorizationGate` jamais instancié | Élevée | Confirmé (code) | Élevée |
| AUDIT-013 | Vérification des missions complaisante (succès sans preuve) | Élevée | Confirmé (code) | Élevée |
| AUDIT-014 | Apprentissage inter-missions surtout en écriture seule | Moyenne | Confirmé (code) | Élevée |
| AUDIT-015 | Composants de gouvernance orphelins (kernel supervisé, `AgentLoader`/sandbox plugins) | Moyenne | Confirmé (code) | Élevée |
| AUDIT-016 | Retry automatique des outils à effet de bord sur timeout (chemin Live) | Moyenne | Probable | Moyenne |
| AUDIT-017 | Aucune limite de missions concurrentes ni verrou de fichiers | Moyenne | Probable | Moyenne |
| AUDIT-019 | « Taille moyenne de fichier » calculée en octets, affichée et seuillée en lignes | Moyenne | Confirmé | Élevée |
| AUDIT-020 | Compteur de missions du tableau de bord ≠ liste des missions | Faible | Confirmé (observé) | Moyenne |
| AUDIT-021 | Marketplace : catalogue, avis et téléchargements fictifs présentés comme réels | Moyenne | Confirmé | Élevée |
| AUDIT-022 | Aucune CI ; ESLint en échec (181 erreurs) masqué par un linter maison | Moyenne | Confirmé (exécuté) | Élevée |
| AUDIT-023 | Un test laisse `.tmp-docstore-a/b` à la racine du dépôt | Faible | Confirmé | Élevée |
| AUDIT-025 | Serveur et indexeur dans le processus principal Electron ; paquet de 1 Go | Moyenne | Confirmé (mesuré) | Moyenne |
| AUDIT-026 | README : « ✅ » = fichier + symbole présents, pas fonctionnalité validée | Moyenne | Confirmé | Élevée |
| AUDIT-028 | `verify_file` à 0 % de succès récent selon la télémétrie de l'app | Moyenne | À investiguer | Moyenne |
| AUDIT-029 | Le serveur de dev s'est arrêté pendant `npm test` | Info | À investiguer | Faible |
| AUDIT-030 | Cache de lecture de `ToolRegistry` consulté avant les permissions | Faible | Confirmé (code) | Élevée |
| AUDIT-031 | Code mort : client Supabase frontend, IPC inutilisés | Faible | Confirmé | Élevée |
| AUDIT-035 | `npm test` écrit encore dans le `.Leanna/` réel (preuves, checkpoints, stratégie) | Moyenne | Confirmé (mesuré) | Élevée |

Constats de l'audit du 15/10 revérifiés comme **corrigés** : C1 (idempotence globale —
`server/core/LedgerGuard.ts:53-80` ne journalise plus que les outils à effet de bord avec `missionId`
et `stepId`) ; C2 (runtime agentique : `partial` n'est plus un succès —
`server/runtime/agentic/AgenticRuntime.ts:472-478`, `assessOutcome` exige des écritures vérifiées par
hash, `:1367-1394`) ; détection des échecs « soft » des outils (`detectResultError`, `:150-175`).
**Toujours ouverts** : C3 (AUDIT-013), C6 (AUDIT-014), noyau supervisé orphelin (AUDIT-015).
**Rouvert** : l'isolation des tests (TEST-003 de `AUDIT/ISSUES.md`, marqué « Corrigé ») n'est que
partielle — voir AUDIT-035.

---

## AUDIT-002 — Installation neuve : toute l'API répond 401 et l'assistant de configuration reste muet

- **Catégorie** : Bug bloquant / parcours de premier démarrage
- **Gravité** : critique · **Statut** : probable (non reproduit sur machine vierge) · **Confiance** : élevée
- **Fichiers** : `electron/main.cjs:55-60` (copie `.env.example` → `userData/.env`), `.env.example:39-41`
  (`Leanna_API_TOKEN=""`, `VITE_Leanna_API_TOKEN=""`), `server/security.ts` (`ensureApiToken` : génère un
  nouveau jeton si vide), `src/main.tsx:52-55` (jeton embarqué au build), `src/components/EnvSetupModal.tsx:54-58`
- **Preuve observée** :
  1. Sur une installation neuve, `userData/.env` est copié depuis `.env.example`, où le jeton est vide.
     `ensureApiToken()` génère alors un jeton aléatoire propre à cette machine.
  2. Le renderer envoie le jeton **embarqué au build** (celui du développeur, mesuré dans `app.asar`,
     voir AUDIT-001), ou aucun jeton si le build en était dépourvu.
  3. Les deux diffèrent : chaque appel `/api/*` reçoit 401 (comportement mesuré : `GET /api/tools/count`
     sans jeton valide → 401).
  4. `EnvSetupModal` lit `GET /api/env` ; sur 401 la réponse ne contient pas `status: 'success'` et le
     composant se ferme **silencieusement** (`setChecking(false)`, aucun message).
  5. `AuthGate` (`src/main.tsx:313-316`) considère l'utilisateur authentifié, car il compare le jeton du
     `localStorage` au jeton embarqué : aucun écran de saisie n'apparaît.
- **Pourquoi le bug est masqué** : sur le poste du développeur, `%APPDATA%/Leanna/.env` contient le même
  jeton que le build (vérifié par comparaison, sans affichage). L'installation locale fonctionne donc.
- **Reproduction proposée (isolée)** : VM Windows propre → installer `Leanna Setup 2.1.0.exe` → lancer →
  ouvrir les DevTools (F12) → onglet Réseau : réponses 401 sur `/api/*`.
- **Cause racine** : jeton distribué au build au lieu de l'exécution (même racine qu'AUDIT-001).
- **Impact utilisateur** : produit inutilisable après installation, sans message ni piste de résolution.
- **Correction recommandée** : voir AUDIT-001 ; en complément, afficher un écran explicite quand une
  réponse 401 est reçue, et faire échouer l'assistant de configuration de façon visible.
- **Effort** : moyen · **Dépendances** : AUDIT-001
- **Critères d'acceptation** : installation neuve → assistant de clés affiché → mission simple réussie.
- **Test de non-régression** : test e2e Electron (Playwright `_electron`) sur un `userData` temporaire.

## AUDIT-011 — `.leannaignore` et curseur d'autonomie figés sur la racine du démarrage

- **Catégorie** : Autonomie / garde-fous
- **Gravité** : élevée · **Statut** : confirmé (code) · **Confiance** : élevée
- **Fichiers** : `server.ts:419-427` (`new AutonomyPolicy({ workspaceRoot: SELF_ROOT })`),
  `server/mission/AutonomyPolicy.ts:56-66`, `:85-87` (`reloadIgnore`), `:259-262`,
  `server/utils/selfRoot.ts:442` (`export let SELF_ROOT = ""`), `server/routes/missions.ts:462-476`
- **Preuve observée** : `SELF_ROOT` est passé **par valeur** au constructeur. Au démarrage sans projet,
  il vaut `""` : `path.join("", ".leannaignore")` lit le `.leannaignore` du dossier courant (celui de
  l'application). `grep reloadIgnore` : aucun appelant. Le changement de projet (`/api/self-root/change`)
  ne met à jour ni `workspaceRoot` ni les motifs.
- **Scénario** : démarrer Leanna, ouvrir un projet dont le `.leannaignore` protège `infra/`, lancer une
  mission qui modifie `infra/` → aucune demande d'approbation pour ce motif.
- **Compléments** : `POST /api/missions/autonomy` change le mode en mémoire uniquement (perdu au
  redémarrage, sans indication dans l'UI).
- **Correction recommandée** : passer une fonction `() => SELF_ROOT` et recharger les motifs à chaque
  changement de projet (callback déjà existant dans `createSelfRootRouter`, `server.ts:738-749`) ;
  persister le mode.
- **Effort** : faible · **Critères d'acceptation** : le motif du projet actif est appliqué après un
  changement de projet.
- **Test de non-régression** : test qui change `SELF_ROOT` puis vérifie `decide()` sur un chemin ignoré.

## AUDIT-012 — Curseur d'autonomie appliqué au seul moteur de missions

- **Catégorie** : Autonomie / architecture des autorisations
- **Gravité** : élevée · **Statut** : confirmé (code) · **Confiance** : élevée
- **Fichiers** : `server/mission/Executor.ts:1650` (unique appel à `autonomy.decide`),
  `server/runtime/AuthorizationGate.ts:333-354` (fabrique), `server/runtime/index.ts:23` (seul export)
- **Preuve observée** : `grep "createAuthorizationGate\|new AuthorizationGate"` hors tests : aucune
  instanciation. `AgenticRuntime` (agents, délégation, swarm) et le chemin Live n'appellent pas
  `AutonomyPolicy`. Le réglage « suggest / ask / auto » visible dans l'UI ne gouverne donc que les
  missions de l'`Executor`.
- **Impact** : un utilisateur qui passe en mode « suggest » pense bloquer les écritures ; les agents
  autonomes et l'assistant vocal continuent d'agir.
- **Correction recommandée** : brancher `AuthorizationGate` (qui combine déjà `PermissionPolicy`,
  `AutonomyPolicy` et le contrôle de chemin sandbox) comme point de passage unique dans
  `ToolRegistry.call`, ce qui règle aussi AUDIT-004.
- **Effort** : moyen · **Dépendances** : AUDIT-004, AUDIT-011
- **Critères d'acceptation** : en mode « suggest », une écriture demandée par un agent ou par la voix
  est refusée.
- **Test de non-régression** : test d'intégration des trois points d'entrée (Live, mission, agent).

## AUDIT-013 — Vérification des missions complaisante : succès sans preuve

- **Catégorie** : Autonomie / vérification indépendante / fausses déclarations de réussite
- **Gravité** : élevée · **Statut** : confirmé (code) · **Confiance** : élevée
- **Fichiers** : `server/mission/Executor.ts:1948-2045` (`verifyGoalCriteria`), `server.ts:384-394`,
  `.env.example` (`LEANNA_MISSION_EVIDENCE="false"`)
- **Preuve observée** :
  1. Sans critères explicites : `passed = anySuccess` — **une seule** action réussie suffit, même si
     les autres ont échoué (`:1971-1977`).
  2. Verdict LLM négatif converti en succès si toutes les actions ont réussi et que le LLM n'a pas
     marqué `blocking` (`:2024-2033`). Le prompt demande lui-même de ne pas bloquer « en cas de simple
     doute » (`:2009-2011`).
  3. La vérification par preuve (`EvidenceEngine`) est désactivée par défaut dans `.env.example`. Elle
     est activée dans le `.env` local du développeur : l'expérience du développeur diffère de celle d'un
     nouvel utilisateur.
- **Impact** : une mission peut être affichée « terminée » sans que l'objectif soit atteint, ce qui
  alimente ensuite l'apprentissage (playbooks, statistiques de fiabilité) avec de faux succès.
- **Correction recommandée** : activer `LEANNA_MISSION_EVIDENCE` par défaut ; sans critères, exiger
  `allSuccess` ; supprimer la conversion d'un verdict négatif en succès (le statut honnête est
  « non vérifié »).
- **Effort** : faible · **Critères d'acceptation** : une mission avec une action échouée et sans
  critère est `failed` ou `unverified`.
- **Test de non-régression** : tests unitaires de `verifyGoalCriteria` pour les trois cas ci-dessus.

## AUDIT-014 — Apprentissage inter-missions surtout en écriture seule

- **Catégorie** : Autonomie / mémoire
- **Gravité** : moyenne · **Statut** : confirmé (code) · **Confiance** : élevée
- **Fichiers** : `server/mission/Executor.ts:2575-2631` (écriture de playbooks), `server/mission/Planner.ts:263-281`
  (lecture de `strategyMemory` uniquement), `server/knowledge/PlaybookStore.ts:345` (`findMatching`)
- **Preuve observée** : `findMatching` n'est appelé que par `PredictionEngine`, lui-même appelé
  seulement par une route (`insightsRouter.ts:85`) et un outil à la demande (`knowledge.ts:1460`).
  Le Planner relit les statistiques de fiabilité des outils (`StrategyMemory`, amorçage du
  `SkillScorer` à `Executor.ts:483-487`) mais ni les playbooks, ni les leçons de `Reflection`, ni
  `MissionEvolution`.
- **Correction recommandée** : injecter le playbook correspondant (s'il existe) et les 3 dernières
  leçons pertinentes dans le prompt de `Planner.decomposeWithLLM`, avec une mesure avant/après.
- **Effort** : moyen · **Test** : test du Planner vérifiant la présence du playbook dans le prompt.

## AUDIT-015 — Composants de gouvernance orphelins

- **Catégorie** : Architecture / code mort à risque
- **Gravité** : moyenne · **Statut** : confirmé (code) · **Confiance** : élevée
- **Preuves** :
  - `runSupervisedAgenticMission` (`server/core/kernel.ts:142-167`) : aucun appelant hors tests. Seul
    ce chemin pose le contexte ambiant d'idempotence et du gate Jev par mission.
  - `AgentLoader` / `SkillWorker` (`server/runtime/AgentLoader.ts`) : seulement exporté
    (`server/runtime/index.ts:38`), 0 occurrence dans `dist/server.cjs`. Le drapeau
    `LEANNA_PLUGIN_SANDBOX="true"` de `.env.example` n'a donc aucun effet (BUG-004 de l'audit
    précédent : toujours « Bloqué »).
  - `AuthorizationGate` : voir AUDIT-012.
- **Impact** : la documentation et la configuration laissent croire à des protections qui ne
  s'exécutent pas.
- **Correction recommandée** : brancher ou supprimer chaque composant ; retirer les drapeaux sans effet
  de `.env.example`. **Effort** : faible (suppression) à moyen (branchement).

## AUDIT-016 — Retry automatique des outils à effet de bord sur timeout (chemin Live)

- **Gravité** : moyenne · **Statut** : probable · **Confiance** : moyenne
- **Fichiers** : `server/live/LiveSocketHandler.ts:93` (`TOOL_MAX_RETRIES = 2`), `:139-154`
  (`isRetryableToolError` : tout timeout est réessayable), `:1961-1984`
- **Constat** : la décision de réessayer ne tient pas compte des permissions de l'outil. Un envoi
  Telegram, un `git push` ou une écriture qui expire mais aboutit côté serveur peut être exécuté
  jusqu'à trois fois.
- **Correction** : ne réessayer que les outils en lecture seule, ou s'appuyer sur la garde
  d'idempotence. **Test** : outil `write` qui lève `ToolTimeoutError` → un seul appel.

## AUDIT-017 — Aucune limite de missions concurrentes ni verrou de fichiers

- **Gravité** : moyenne · **Statut** : probable · **Confiance** : moyenne
- **Fichiers** : `server/mission/Executor.ts:118`, `:497` (`activeMissions` sans plafond),
  `src/views/MissionControlView.tsx:86-101` (« Diagnostiquer & créer » : jusqu'à 5 missions),
  `server/utils/DistributedLock.ts` (aucun usage en production)
- **Scénario** : « Diagnostiquer & créer » lance cinq missions de refactorisation qui écrivent en
  parallèle dans la même sandbox. Aucun mécanisme n'empêche deux missions de modifier le même fichier.
- **Correction** : file d'attente (concurrence 1 par workspace pour les missions qui écrivent) ou verrou
  par fichier. **Test** : deux missions écrivant le même fichier → la seconde attend ou échoue proprement.

## AUDIT-019 — « Taille moyenne de fichier » en octets, affichée et seuillée en lignes

- **Catégorie** : Bug de calcul / diagnostic trompeur
- **Gravité** : moyenne · **Statut** : confirmé · **Confiance** : élevée
- **Fichiers** : `server/knowledge/KnowledgeGraph.ts:685` (`totalSize += file.size`) et `:708`
  (`averageFileSize = totalSize / totalFiles`), `server/knowledge/ProjectDoctor.ts:308-314`
  (seuil 300 « lignes », message « … lignes »)
- **Preuve observée** : l'écran Pilotage affiche « Taille moyenne de fichier élevée (12324 lignes) ».
  Le dépôt compte environ 265 000 lignes de code sur environ 950 fichiers suivis (mesure `wc -l`) : la
  moyenne réelle est de l'ordre de 280 lignes. 12 324 correspond à une moyenne en octets.
- **Impact** : pénalité permanente du score de maintenabilité, missions d'amélioration proposées à tort.
- **Correction** : `totalLines / totalFiles` (le champ `totalLines` est déjà calculé `:684`).
- **Effort** : faible · **Test** : `computeStats` sur deux fichiers de tailles connues.

## AUDIT-020 — Compteur de missions du tableau de bord ≠ liste des missions

- **Gravité** : faible · **Statut** : confirmé (observé dans l'interface) · **Confiance** : moyenne
- **Preuve observée** : `/pilotage` affiche « Missions : 1 ✓ / 0 ✗ » ; l'onglet Missions affiche
  « Aucune mission. Lancez une mission pour voir sa timeline. »
- **Cause racine** : à investiguer — le briefing (`/api/knowledge/daily-briefing`) et la liste
  (`/api/missions`) lisent des sources différentes (statistiques persistées vs missions actives).
- **Correction** : une seule source, ou libeller « historique » vs « en cours ».

## AUDIT-021 — Marketplace : données communautaires fictives présentées comme réelles

- **Catégorie** : Fonctionnalité simulée
- **Gravité** : moyenne · **Statut** : confirmé · **Confiance** : élevée
- **Fichiers** : `server/marketplace/MarketplaceRegistry.ts:7-10` (« données mockées réalistes »),
  `:104-108` (téléchargements 4 820, note 4,8, avis signés `devpro_42`, `alice_dev`…),
  `src/components/panels/MarketplacePanel.tsx` (aucun libellé « démo » trouvé)
- **Impact** : l'utilisateur prend des avis inventés pour des signaux de confiance avant d'installer un
  paquet. Le README marque la Marketplace « ✅ ».
- **Correction** : retirer les avis et statistiques fictifs, ou afficher un bandeau « catalogue de
  démonstration ». **Effort** : faible.

## AUDIT-022 — Aucune CI ; ESLint en échec masqué par un linter maison

- **Catégorie** : Qualité / outillage
- **Gravité** : moyenne · **Statut** : confirmé (exécuté) · **Confiance** : élevée
- **Preuves** : `.github/` ne contient aucun workflow suivi (`git ls-files .github` vide) ; les hooks
  `.husky/` ne sont pas versionnés. `npm run lint` (`scripts/lint.cjs`, « ESLint non installé » dans
  son en-tête, alors qu'ESLint 9 est installé) : 0 erreur, 5 577 avertissements. `npx eslint .` :
  181 erreurs, 2 220 avertissements, code de sortie 1.
- **Impact** : aucune barrière automatique ; les 1 559 tests ne s'exécutent que si quelqu'un les lance.
- **Correction** : workflow CI (typecheck, `npm test`, `test:ui`, ESLint en erreurs seulement, build) ;
  remplacer `npm run lint` par ESLint. **Effort** : faible.

## AUDIT-023 — `server/knowledge.test.ts` laisse des dossiers à la racine du dépôt

- **Gravité** : faible · **Statut** : confirmé · **Confiance** : élevée
- **Fichiers** : `server/knowledge.test.ts:44-45` (`path.join(process.cwd(), '.tmp-docstore-a')`)
- **Preuve** : `.tmp-docstore-a/.Leanna` et `.tmp-docstore-b/.Leanna` présents à la racine (datés de
  16:05). **Correction** : `fs.mkdtempSync(os.tmpdir())` + nettoyage en `after`.

## AUDIT-025 — Serveur et indexeur dans le processus principal Electron ; paquet de 1 Go

- **Catégorie** : Architecture / performance
- **Gravité** : moyenne · **Statut** : confirmé (mesuré) · **Confiance** : moyenne (impact non mesuré)
- **Fichiers** : `electron/main.cjs:91-93` (`require(serverPath)` dans le main), `package.json`
  (`puppeteer`, `typescript` en `dependencies` ; `files: node_modules/**/*`)
- **Mesures** : `release/win-unpacked` = 1 003 Mo ; installateur 2.1.0 = 251 Mo ;
  `.project-knowledge.json` = 19,5 Mo à la racine ; bundle web 30 Mo dont `vendor-monaco` 3,7 Mo et
  `IdeView` 1,35 Mo (build mesuré).
- **Risque** : toute tâche CPU du serveur (indexation, parsing tree-sitter, JSON de 19 Mo) bloque la
  boucle d'événements du processus qui gère les fenêtres, le tray et les IPC. Non mesuré (aucun
  profilage effectué).
- **Correction** : lancer le serveur dans un `utilityProcess` Electron ; retirer `typescript` des
  dépendances de production ; évaluer `puppeteer-core`. **Effort** : moyen.

## AUDIT-026 — README : « ✅ » signifie « fichier + symbole présents »

- **Gravité** : moyenne · **Statut** : confirmé · **Confiance** : élevée
- **Fichiers** : `README.md:80-90` (légende), `:232-243` (tableau des capacités tout en ✅)
- **Constat** : la légende définit ✅ comme « fichier + symbole présents ». Le tableau marque ✅
  « Boucle humaine : approbation interactive des actions à risque » (contredit par AUDIT-003/004/005),
  « Marketplace » (AUDIT-021), « Noyau transactionnel … superviseur unique » (AUDIT-015).
- **Correction** : trois états distincts — implémenté / branché au flux réel / validé par un test
  d'intégration.

## AUDIT-028 — `verify_file` à 0 % de succès récent selon la télémétrie de l'application

- **Gravité** : moyenne · **Statut** : à investiguer · **Confiance** : moyenne
- **Preuve** : l'écran Pilotage affiche « L'outil « verify_file » échoue régulièrement (succès récent
  0 %) ». `verify_file` est l'arbitre de la vérification hashée d'`AgenticRuntime` (`:943-992`) : s'il
  échoue systématiquement, aucune mission d'écriture ne peut atteindre `success`.
- **À faire** : lire `.Leanna/core/ledger` et les métriques de l'outil pour distinguer un vrai bug d'une
  statistique polluée (anciens appels sous l'ancien cache d'idempotence C1).

## AUDIT-029 — Le serveur de dev s'est arrêté pendant `npm test`

- **Gravité** : informationnelle · **Statut** : à investiguer · **Confiance** : faible
- **Observation** : le serveur de l'utilisateur répondait sur `127.0.0.1:4000` (`/api/health` = 200)
  avant `npm test`. Pendant l'exécution, le port n'était plus en écoute (connexions `TIME_WAIT`
  uniquement). Aucun test ne cible le port 4000 (`grep`). La cause n'est pas établie (arrêt par
  l'utilisateur, crash, effet d'un test sur un fichier surveillé).
- **À faire** : relancer `npm run dev` puis `npm test` en surveillant la sortie du serveur.

## AUDIT-030 — Cache de lecture de `ToolRegistry` consulté avant les permissions

- **Gravité** : faible · **Statut** : confirmé (code) · **Confiance** : élevée
- **Fichier** : `server/runtime/ToolRegistry.ts:372-379` (retour du cache avant `permissionPolicy.enforce`
  à `:389`) ; clé globale `nom:args`, sans agent.
- **Impact** : un agent sans permission `read` peut recevoir un résultat mis en cache par un autre
  pendant 5 s. **Correction** : déplacer la lecture du cache après les contrôles.

## AUDIT-035 — `npm test` écrit encore dans le `.Leanna/` réel du dépôt

- **Catégorie** : Tests / isolation / persistance
- **Gravité** : moyenne · **Statut** : confirmé (mesuré) · **Confiance** : élevée
- **Fichiers** : `server/core/paths.ts` (`workspaceRoot()` retombe sur `process.cwd()` si `SELF_ROOT`
  est vide), `server/knowledge/StrategyMemory.ts:64` (même repli), `server/core/AgenticMissionRunner.test.ts:80-81`
  et `:161` (`createCoreKernel` ne reçoit que `ledgerFile` et `missionStoreDir` ; preuves et checkpoints
  gardent leur chemin par défaut), `scripts/test-isolation.mjs` (redirige `LEANNA_STATE_DIR`, que ces
  modules ne lisent pas)
- **Preuve observée** : marqueur temporel posé avant `npm test` (17:28:36), fin des tests 17:33:06.
  Fichiers modifiés dans cette fenêtre : `.Leanna/core/evidence/fixed-id.json` (17:29:20 — identifiant
  codé en dur dans le test, `:161` : attribution **certaine**), 4 autres preuves et 8 checkpoints
  `.Leanna/core/checkpoints/cp_*` à la même seconde (attribution probable au même test),
  `.Leanna/strategy.json` et `.Leanna/mission-evolution.json` (17:29:31 : attribution incertaine, car le
  serveur de dev de l'utilisateur répondait encore à ce moment et peut écrire ces fichiers).
  `git status` ne montre rien car `.Leanna/` est ignoré.
- **Impact** : les statistiques de fiabilité (`strategy.json`), l'historique d'évolution et les preuves
  réelles du développeur sont mélangés avec des données de test — ce qui peut expliquer des indicateurs
  incohérents (AUDIT-020, AUDIT-028). En production, le même repli sur `process.cwd()` écrit l'état du
  noyau dans le dossier courant du processus quand aucun projet n'est ouvert (en mode packagé, ce dossier
  n'est pas maîtrisé : probable, non vérifié).
- **Correction recommandée** : un seul résolveur de dossier d'état qui lit `LEANNA_STATE_DIR` ; dans
  `createCoreKernel`, exiger ou dériver tous les chemins (preuves, checkpoints) du même dossier ; dans les
  tests, passer un dossier temporaire pour tout.
- **Effort** : faible · **Critères d'acceptation** : aucune modification sous `.Leanna/` pendant `npm test`.
- **Test de non-régression** : script de CI qui compare l'arborescence `.Leanna/` (mtime) avant et après la suite.

## AUDIT-031 — Code mort

- **Gravité** : faible · **Statut** : confirmé · **Confiance** : élevée
- `src/services/memory-manager/index.ts` : client Supabase anonyme jamais importé ; il échouerait de
  toute façon (politiques RLS réservées à `service_role`).
- IPC `folder-contents`, `create-file`, `create-folder`, `delete-path`, `open-path`,
  `get-project-root` : exposés mais jamais appelés (voir AUDIT-007).
- 1 902 `any` explicites (avertissements ESLint) : contrats d'outils faiblement typés.
