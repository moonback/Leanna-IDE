# Audit — Historique des cycles

## Ligne de base (avant toute modification)

| Vérification | Résultat |
|---|---|
| `npm run typecheck` | OK (code 0) |
| `npm run lint` | 0 erreur, 5 446 avertissements, 52 infos |
| `npm test` (serveur) | 1 307 tests : 1 291 ✓, 13 ✗, 3 annulés |
| `vitest` (UI) | 37/37 ✓ |
| `npm audit --omit=dev` | 23 vulnérabilités (1 critique, 9 hautes) |

Effet de bord constaté pendant ce run : `.Leanna-telegram.json` (fichier suivi par git) a été réécrit par les tests. Il a été restauré avec `git checkout`.

## Cycle 1 — BUG-001 : chiffrement `.env` destructeur (P1)

- **Fichiers** : `server/config/encryptedEnvKeys.ts` (nouveau), `server-bootstrap.ts`, `server/routes/env.ts`, `server/routes/env.test.ts`.
- **Test** : `env.test.ts` « never encrypts keys… » échoue sur le code d'origine et passe après correction (4/4).
- **Commit** : `fix(env): ne chiffrer au repos que les clés déchiffrées au démarrage`.

## Cycle 2 — TEST-001 : isolation de la config Telegram (P1)

- **Fichiers** : `server/telegram/TelegramService.ts` (surcharge `LEANNA_TELEGRAM_CONFIG_PATH`), `server/routes/telegram.test.ts`.
- **Test** : 3/3 ✓. L'empreinte SHA-1 de `.Leanna-telegram.json` est identique avant et après la suite complète.

## Cycle 3 — BUG-002 : déduplication `fetch` et `AbortSignal` (P2)

- **Fichiers** : `src/lib/fetchDedup.ts` (nouveau), `src/lib/fetchDedup.test.ts` (nouveau), `src/main.tsx`.
- **Test** : 3/3 ✓. Aucun test n'a pu être exécuté sur le code d'origine, la fonction était inline.

## Cycle 4 — BUG-003 : rejets async non gérés dans les routes (P2)

- **Fichiers** : `server/utils/asyncRoute.ts` (nouveau), `server/routes/ide.ts` (12 handlers), `server/routes/automation.ts`, `server/routes/workflows.ts`, `server/routes/ide.test.ts`.
- **Test** : `ide.test.ts` « answers with an error instead of hanging » échoue avant correction (rejet `EISDIR` non géré) et passe après (4/4).

## Cycle 5 — TEST-002 : faux échecs de la suite serveur (P2)

- **Fichiers** : `server/core/LeannaSupervisor.test.ts` (11/11), `server/knowledge.test.ts` (5/5), `server/security.test.ts` (15/15), `server/routes/env.test.ts`.

### Validation après les cycles 1 à 5

| Vérification | Résultat |
|---|---|
| `npm test` | 1 309 tests : 1 300 ✓, 9 ✗, 0 annulé |
| `vitest` | 40/40 ✓ |
| `npm run typecheck` | OK |
| ESLint sur les fichiers modifiés | 3 erreurs, toutes préexistantes (identiques sur `HEAD`) |

Les 9 échecs restants sont tous documentés : 6 relèvent de BUG-004 (bloqué) et 3 de TEST-004 (DNS, binaire `graphify`).

## Cycle 6 — DEP-001 : dépendances vulnérables (P1)

- **Action** : `npm audit fix`, sans `--force`. Seul `package-lock.json` change ; `package.json` est inchangé.
- **Résultat** : `npm audit --omit=dev` passe de 23 vulnérabilités à 2 faibles. Il reste 18 vulnérabilités dans les dépendances de dev, qui exigent des montées de version majeures.
- **Validation après mise à jour** : `npm run typecheck` OK ; vitest 40/40 ✓ ; `npm run build` OK (Vite et esbuild) ; `npm test` 1 300/1 309 ✓, avec les 9 mêmes échecs documentés, aucune régression ; `.Leanna-telegram.json` non modifié.

## Cycle 7 — TEST-003 et BUG-005 : isolation de l'état et emplacement du jeton

- **Fichiers** : `server/utils/selfRoot.ts` (`LEANNA_STATE_DIR`), `server/security.ts` (`ensureApiToken`), `scripts/test-isolation.mjs` (nouveau), `package.json` (scripts `test` et `test:soak`), `server/security.test.ts` (+2 tests).
- **Tests** : les 2 nouveaux tests échouent avant correction et passent après (17/17). `npm test` : 1 302/1 311 ✓, avec les 9 mêmes échecs documentés. L'état de l'app est identique avant et après la suite, et `.env` n'est pas recréé. Typecheck OK. ESLint : 1 erreur préexistante (`@ts-ignore`, `selfRoot.ts:27`).

## Bilan de session

- Corrigés et vérifiés par test : BUG-001, TEST-001, BUG-002, BUG-003, TEST-002, DEP-001 (production), TEST-003, BUG-005.
- Restants : BUG-004 (bloqué, choix d'architecture), CFG-001, TEST-004, UX-001. Voir `NEXT_STEPS.md`.
