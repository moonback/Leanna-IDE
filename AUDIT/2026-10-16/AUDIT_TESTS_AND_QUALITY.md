# Tests et qualité — résultats réellement exécutés (16 octobre 2026)

Environnement : Windows 10 Home 10.0.19045, Node (version du poste), dépôt @ `d66d5d5`, sans modification.
Les journaux bruts sont restés dans le dossier temporaire de la session d'audit (non versionnés).

## 1. Commandes exécutées

| # | Commande | Résultat | Durée | Remarques |
|---|---|---|---|---|
| 1 | `npx tsc --noEmit -p tsconfig.json --incremental false` | **0 erreur**, sortie 0 | 3 min 22 s | `--incremental false` pour ne pas réécrire `tsconfig.tsbuildinfo` |
| 2 | `node scripts/lint.cjs` (= `npm run lint`) | 0 erreur, 5 577 avertissements, 52 infos, sortie 0 | 2,5 s | Linter maison, pas ESLint |
| 3 | `npx eslint . --format json` | **181 erreurs, 2 220 avertissements**, sortie 1 | ≈ 1 min 30 s | 937 fichiers. Le format `compact` n'existe plus dans ESLint 9 (1ᵉʳ essai en échec pour cette raison) |
| 4 | `npm test` (node:test, `server/**/*.test.ts`) | **1 467 tests, 174 suites : 1 467 réussis, 0 échec, 0 ignoré** | 4 min 21 s | |
| 5 | `npx vitest run --config vitest.config.ts` (`test:ui`) | **19 fichiers, 92 tests : tous réussis** | 1 min 13 s | |
| 6 | `npx vite build --outDir <dossier temporaire>` | **Réussi** | 1 min 30 s | 2 premiers essais en échec à cause de mes chemins de sortie (plugin Monaco + chemin relatif erroné), pas du projet |
| 7 | `npx esbuild server-bootstrap.ts --bundle … --outfile=<temporaire>` | **Réussi**, 4,09 Mo | < 1 s | |
| 8 | `npm audit --json` / `--omit=dev` | prod : 2 faibles ; total : 18 (3 critiques, 2 élevées) | — | voir AUDIT-024 |
| 9 | `GET /api/health`, `GET /api/tools/count` sans jeton, `GET /api/tools/registry` avec jeton | 200 ; **401** ; 238 outils | — | serveur local de l'utilisateur, lecture seule |

**Non exécutés** : `npm run test:soak` (long, non demandé), `npm run test:missions` et `brain:smoke`
(appels LLM réels, coût et effets externes), `npm run pack:win`/`dist:win` (packaging), tests
end-to-end Electron (inexistants), tests sur machine vierge.

**Contrôle des effets de bord des tests** : `git status --porcelain` identique avant et après la suite
complète, **mais** une recherche des fichiers modifiés après un marqueur temporel montre des écritures
dans le `.Leanna/` réel (ignoré par git) pendant `npm test` : preuves (dont `fixed-id.json`, écrit
par `AgenticMissionRunner.test.ts`) et checkpoints ; `strategy.json` et `mission-evolution.json` ont
aussi changé, sans attribution certaine (AUDIT-035). Les dossiers `.tmp-docstore-a/b`
laissés par `server/knowledge.test.ts` existaient déjà (AUDIT-023). Le serveur de dev de l'utilisateur
s'est arrêté pendant `npm test`, cause non établie (AUDIT-029).

## 2. Répartition des erreurs ESLint (exécution n° 3)

| Règle | Erreurs | Avertissements |
|---|---|---|
| `@typescript-eslint/no-explicit-any` | 29 | 1 902 |
| `@typescript-eslint/no-require-imports` | 34 | — |
| `no-empty` (blocs `catch {}` vides) | 34 | — |
| `no-useless-escape` | 32 | — |
| `prefer-const` | 16 | — |
| `@typescript-eslint/ban-ts-comment` | 12 | — |
| `no-control-regex` | 6 | — |
| `jsx-a11y/*` (toutes règles) | — | 205 |
| `react-hooks/exhaustive-deps` | — | 32 |
| `max-lines` | — | 56 |

Les 34 `no-empty` sont des erreurs avalées silencieusement : à revoir en priorité dans les chemins
d'exécution d'outils.

## 3. Pertinence des tests existants

**Points forts**
- 1 559 tests au total, tous verts. `scripts/test-isolation.mjs` redirige la configuration, Telegram
  et `LEANNA_STATE_DIR` vers un dossier temporaire — isolation partielle seulement (AUDIT-035).
- Les corrections de l'audit du 15/10 (idempotence, `partial`) sont couvertes (`LedgerGuard.test.ts`,
  tests d'`AgenticRuntime`).

**Limites**
- Tests majoritairement unitaires avec dépendances simulées : aucun test ne relie Live →
  `SkillManagerV2` → `ToolRegistry` → handler réel. C'est précisément le chemin où les gardes sont
  contournées (AUDIT-004) : la suite reste verte malgré ce défaut.
- Côté frontend, 19 fichiers de tests pour 385 fichiers source.
- Aucun test end-to-end Electron, aucun test d'installation, aucun test de premier démarrage :
  AUDIT-002 ne peut pas être détecté.
- Aucune CI : ces résultats dépendent d'une exécution manuelle (AUDIT-022).

## 4. Scénarios critiques sans test

| Scénario | Constat lié |
|---|---|
| Installation neuve → premier appel API authentifié | AUDIT-001/002 |
| Outil appelé depuis le chemin Live soumis à `PermissionPolicy` | AUDIT-004 |
| `run_project_command` avec `node`/`npx` exige une confirmation | AUDIT-003 |
| Environnement des sous-processus sans secrets | AUDIT-003/008 |
| `telegram_send_from_workspace` refuse `.env` et un `chatId` inconnu | AUDIT-005 |
| Résultats d'outils enveloppés par le garde anti-injection dans `AgenticRuntime` | AUDIT-006 |
| `.leannaignore` rechargé au changement de projet | AUDIT-011 |
| Mode « suggest » bloque une écriture demandée par un agent | AUDIT-012 |
| Mission avec une action échouée et sans critère → non réussie | AUDIT-013 |
| Le Planner reçoit le playbook correspondant | AUDIT-014 |
| Outil d'écriture en timeout non réessayé | AUDIT-016 |
| Deux missions sur le même fichier | AUDIT-017 |
| `computeStats` : moyenne en lignes | AUDIT-019 |
| Liste des clés exposées par le preload | AUDIT-007 |
| Dry-run de bout en bout : aucun fichier hors sandbox ni processus lancé | partiellement couvert (`MissionSimulator.test.ts`, dépendances simulées) |

## 5. Indicateurs de maintenabilité mesurés

- 56 fichiers dépassent la limite `max-lines` configurée ; 3 fichiers > 2 000 lignes.
- 1 931 `any` explicites.
- Avertissement Vite : `sandboxApi.ts` importé à la fois statiquement et dynamiquement (le découpage
  attendu n'a pas lieu) ; chunks > 1 000 kB (`vendor-monaco` 3,7 Mo, `IdeView` 1,35 Mo).
- Durées de la boucle de validation locale : typecheck 3 min 22 s + tests 5 min 34 s + ESLint 1 min 30 s
  + build 1 min 30 s ≈ 12 min.
