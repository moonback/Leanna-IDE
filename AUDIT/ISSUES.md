# Audit — Problèmes identifiés

États possibles : À vérifier · Confirmé · En cours · Corrigé · Bloqué · Non vérifié.
« Corrigé » signifie qu'un test de régression a été exécuté et passe.

| ID | Prio | Catégorie | État |
|---|---|---|---|
| BUG-001 | P1 | Données / secrets | Corrigé |
| TEST-001 | P1 | Fiabilité des tests (état réel écrasé) | Corrigé |
| BUG-002 | P2 | Frontend / réseau | Corrigé |
| BUG-003 | P2 | Gestion des erreurs HTTP | Corrigé |
| TEST-002 | P2 | Tests (faux échecs) | Corrigé |
| DEP-001 | P1 | Dépendances vulnérables (prod) | Corrigé (reste 2 faibles en prod, 18 en dev) |
| BUG-004 | P2 | Runtime plugins (sandbox) | Bloqué |
| TEST-003 | P2 | Tests (état `.Leanna/` réel modifié) | Confirmé, non corrigé |
| CFG-001 | P3 | Fichiers runtime versionnés | Confirmé, non corrigé |
| TEST-004 | P3 | Tests dépendant de l'environnement | Confirmé, non corrigé |
| UX-001 | P3 | Sécurité / UX des paramètres | À décider |

---

## BUG-001 — `POST /api/env` chiffre des clés jamais déchiffrées au démarrage

- **Fichiers** : `server/routes/env.ts` (`writeEnvKey`), `server-bootstrap.ts` (liste des clés déchiffrées).
- **Problème** : `writeEnvKey` chiffrait toutes les clés de `SENSITIVE_ENV_KEYS`. Or le bootstrap ne déchiffre que 9 clés. Les autres clés sensibles étaient donc relues sous leur forme chiffrée `gcm:…` :
  - `Leanna_MASTER_KEY` : au démarrage, la valeur chiffrée n'est pas une clé base64 de 32 octets. `ensureMasterKey()` génère alors une nouvelle clé et écrase la ligne. Résultat : toutes les clés API chiffrées deviennent irrécupérables (perte de données).
  - `VITE_Leanna_API_TOKEN`, `VITE_SUPABASE_*` : Vite injecte le texte chiffré dans le bundle. Le frontend envoie un mauvais jeton et reçoit des 401.
  - `REDIS_URL`, `LEANNA_*_REDIS_URL`, `SANDBOX_EXIT_CODE` : les valeurs chiffrées sont utilisées telles quelles.
- **Preuve** : un test (`env.test.ts`, « never encrypts keys… ») échoue sur le code d'origine. Le `.env` écrit contenait `Leanna_MASTER_KEY="gcm:…"`. Le même test passe après correction.
- **Cause racine** : deux listes de clés divergentes, l'une pour « masquer à l'affichage », l'autre pour « déchiffrer au démarrage ».
- **Correction** : une liste unique `server/config/encryptedEnvKeys.ts` est utilisée par le bootstrap (déchiffrement) et par `env.ts` (chiffrement). Les clés REDIS et `SANDBOX_EXIT_CODE` y sont ajoutées, ce qui permet de relire les valeurs déjà chiffrées par l'ancien code. La master key et les `VITE_*` restent masquées à l'affichage mais sont écrites en clair.
- **Limite** : une master key déjà corrompue par l'ancien code ne peut pas être récupérée.
- **Confiance** : élevée.

## TEST-001 — `npm test` écrasait la vraie config Telegram

- **Fichiers** : `server/routes/telegram.test.ts`, `server/telegram/TelegramService.ts`.
- **Problème** : les tests appelaient `saveConfig` sur le singleton, qui écrit `<racine app>/.Leanna-telegram.json`. Le token, les utilisateurs autorisés et `autoStart` du développeur étaient remplacés par des valeurs de test, sans restauration complète.
- **Preuve** : après le premier `npm test`, `git diff .Leanna-telegram.json` montrait `allowedUsers` remplacé par `user_test_42`, `autoStart` passé de `true` à `false` et le token réécrit.
- **Correction** : le chemin peut être surchargé par la variable d'environnement `LEANNA_TELEGRAM_CONFIG_PATH`. Le test pointe vers un dossier temporaire avant d'importer le service.
- **Vérification** : l'empreinte SHA-1 de `.Leanna-telegram.json` est identique avant et après la suite complète.

## BUG-002 — La déduplication `fetch` partage une requête annulée

- **Fichier** : `src/main.tsx` (intercepteur global), logique extraite dans `src/lib/fetchDedup.ts`.
- **Problème** : les GET `/api` concurrents vers la même URL partageaient une seule promesse, sans tenir compte de `init.signal`.
- **Scénario** : en StrictMode (dev), un effet lance la requête A ; son cleanup annule A ; le remontage lance la requête B sur la même URL. B reçoit alors la promesse de A, rejetée en `AbortError`, et les données ne s'affichent jamais. Composants touchés : `TokenDetailModal`, `useResource` (notebooks), `McpDirectory` et tous les GET annulables. En production, le même cas se produit dès qu'une requête est relancée pendant qu'une requête identique est annulée.
- **Correction** : les requêtes porteuses d'un `signal`, ainsi que les objets `Request`, ne sont plus dédupliquées.
- **Vérification** : `src/lib/fetchDedup.test.ts` (3 tests). L'ancienne fonction était inline et non importable : le test n'a donc pas pu être exécuté sur le code d'origine. Le défaut est établi par lecture du code.

## BUG-003 — Handlers Express async sans gestion de rejet : requêtes suspendues

- **Fichiers** : `server/routes/ide.ts` (12 routes), `server/routes/automation.ts` (`POST /scheduled-tasks/:id/run`), `server/routes/workflows.ts` (`GET /active-runs`).
- **Problème** : Express 4 ne transmet pas les rejets de promesse au middleware d'erreur. Par exemple, `POST /api/ide/file` sur un dossier provoque `EISDIR`, et la requête ne reçoit jamais de réponse. Le gestionnaire `unhandledRejection` global se contente de journaliser.
- **Preuve** : le test `ide.test.ts` (« answers with an error instead of hanging ») échoue avant correction, avec un rejet `EISDIR` non géré.
- **Correction** : le wrapper `server/utils/asyncRoute.ts` transmet le rejet à `next(err)`, ce qui renvoie un 500 via le gestionnaire global de `server.ts`.
- **Portée** : un scan heuristique des routeurs n'a trouvé que ces 14 handlers sans `try` autour d'un `await`.

## TEST-002 — Faux échecs dans la suite serveur

| Test | Cause | Correction |
|---|---|---|
| `LeannaSupervisor.test.ts` (3 annulés) | Le runner factice utilisait un timer `unref()`. La boucle d'événements se vidait avant le timeout (lui aussi `unref`) du superviseur, et les tests suivants étaient annulés. | Le runner garde la boucle active et annule son timer sur `abort`. |
| `knowledge.test.ts` (2 tests reindex) | L'extraction documentaire est désactivée par défaut (choix produit documenté) et les tests ne l'activaient pas. | `setDocumentExtractionEnabled(true)` sur le workspace temporaire. |
| `security.test.ts` (chemin) | `C:/workspace` est un chemin relatif hors Windows. | Racine `path.resolve(path.sep, 'workspace', 'app')`, portable. |
| `env.test.ts` (`GET /`) | Le test dépendait du `.env` réel du répertoire courant et lisait les secrets du développeur. | `.env` de fixture dans un dossier temporaire. |

## DEP-001 — Dépendances de production vulnérables

`npm audit --omit=dev` remonte 23 vulnérabilités (1 critique, 9 hautes, 11 modérées, 2 faibles), toutes avec un correctif disponible sans montée de version majeure : `proxy-addr`, `compression`, `multer`, `ip-address`, `lodash-es`, `react-router`, `mermaid`, `qs`, etc.
Exposition atténuée : écoute en local, jeton obligatoire, Mermaid en `securityLevel: 'strict'`, Electron avec `contextIsolation`.

## BUG-004 — `SkillWorker` (sandbox des plugins) ne peut pas charger son propre module

- **Fichier** : `server/runtime/SkillWorker.ts` (`new Worker(fileURLToPath(import.meta.url))`).
- **Preuve** : les 6 tests `skillWorker.test.ts` échouent avec `Cannot find module '…/server/utils/logger.js'`. Le Worker exécute un fichier `.ts` sans le loader tsx.
- **Bundle de production** : vérifié, `SkillWorker` et `AgentLoader` n'y figurent pas (0 occurrence dans `dist/server.cjs`). Le problème se limite donc à l'exécution via tsx (dev et tests). Il faut aussi vérifier si `AgentLoader` est réellement utilisé quelque part ; c'est peut-être du code mort.
- **Impact** : limité à la fonction opt-in `LEANNA_PLUGIN_SANDBOX=true`, dont l'isolation des plugins ne fonctionne pas en dev.
- **Blocage** : la correction demande un choix d'architecture (point d'entrée Worker dédié et compilé, ou transmission du loader). Elle n'a pas été tentée.

## TEST-003 — Les tests modifient `.Leanna/` réel (dernier projet, registre des workspaces)

`setSelfRoot()` persiste dans `<racine app>/.Leanna/lastProject.json` et dans le registre des workspaces. Les tests l'appellent avec des dossiers temporaires. Après `npm test`, l'application peut donc rouvrir un dossier de test supprimé. Ces fichiers sont ignorés par git mais font partie de l'état utilisateur. Les tests génèrent aussi `.env` (clé maître et jeton) à la racine si celui-ci est absent.
Correction proposée : un répertoire d'état surchargeable (ex. `LEANNA_STATE_DIR`) défini par le runner de tests.

## CFG-001 — Fichiers runtime versionnés malgré `.gitignore`

`.Leanna-telegram.json` (token chiffré en AES-GCM, identifiant utilisateur autorisé), `.project-knowledge.json.tmp_*` et `.project-memory.json.tmp_*` sont suivis par git.
Le token est chiffré avec une clé hors dépôt : le risque est faible, mais l'identifiant Telegram autorisé est en clair.
Non corrigé volontairement : un `git rm --cached` supprimerait ces fichiers chez les autres clones au prochain pull. C'est une décision à prendre par le mainteneur.

## TEST-004 — Tests dépendant de l'environnement

- `automationHelpers: assertSafeUrl` exige une résolution DNS publique.
- `graphify_god_nodes` et `graphify_query` exigent le binaire `graphify` et un graphe généré.

Ces tests échouent dans un conteneur sans DNS ni graphify. Ce ne sont pas des régressions.

## UX-001 — La master key est éditable depuis l'écran des paramètres

`Leanna_MASTER_KEY` fait partie des clés éditables via `POST /api/env`. La changer rend illisibles au redémarrage tous les secrets chiffrés avec l'ancienne clé, sans aucun avertissement ni re-chiffrement. Il faut décider entre une clé en lecture seule dans l'UI et un re-chiffrement automatique. C'est un changement de comportement, donc non appliqué.
