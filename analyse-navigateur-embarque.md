# Analyse du navigateur embarqué de Leanna IDE (lecture seule)

Date : 2026-11-15. Aucun fichier du dépôt modifié, rien commité. Seul effet de bord : `graphify-out/cache/last_query_stamp` (horodatage écrit par `graphify query`).

Tests lancés : 128/128 verts (commande en fin de document).

Légende : **[V]** vérifié dans le code — **[S]** supposition (comportement Electron/Chromium ou chemin non tracé jusqu'au bout).

## 1. Architecture de bout en bout

Aller (agent → page) :
1. Le modèle appelle un outil `browser_*` ; `browserSkill.handleToolCall` valide les arguments (zod) — `server/skills/browser.ts:1125`. [V]
2. Le skill émet une action via `context.emitIdeAction`, qui est un simple `clientWs.send({type:'ide-action', action})` sur le WebSocket de la session live — `server/live/LiveSocketHandler.ts:1812`. [V]
3. Dans le renderer, `useLiveAPI` transforme chaque action en `CustomEvent` (`Leanna-action` + un événement dédié `Leanna-browser-*`) — `src/hooks/useLiveAPI.ts:371-443`. [V]
4. `IdeView` ouvre/ferme le panneau et pose l'URL pilotée (`open-browser`, `close-browser`, `browser-navigate`) — `src/views/IdeView.tsx:532-542`. [V]
5. `BrowserPanel` écoute les événements dédiés et agit sur la `<webview>` de l'onglet actif, presque toujours par `webview.executeJavaScript(...)` — `src/components/panels/BrowserPanel.tsx:1461-1486`. [V]
6. Cas de la fenêtre « orb » (session vocale séparée) : les événements sont relayés par IPC `electron/forward-to-ide` → `leanna-remote-event`, avec liste blanche des noms — `src/lib/ideRemoteBridge.ts:30-63,118-123`, `electron/main.cjs:594-599`. [V]

Retour (page → agent) :
- Le skill enregistre une promesse dans `browserReadPending` / `browserActionPending` (Maps en mémoire du serveur, `server.ts:598-607`) avec un `requestId` et un délai — `server/skills/browser.ts:1131-1149` et `:1312-1323`. [V]
- `BrowserPanel` poste le résultat en HTTP : `POST /api/browser/content-result` (texte de page) ou `/api/browser/action-result` (tout le reste) — `BrowserPanel.tsx:512,537` ; la route résout la promesse — `server/routes/browser.ts:31-77`. [V]
- Avant renvoi au modèle : garde anti-injection propre au skill (`guardUntrustedContent`) puis garde central `guardToolResponse` sur toute réponse d'outil — `server/live/LiveSocketHandler.ts:2172`. [V]
- Capture : `webview.capturePage()` → PNG base64 → `action-result` → analyse par Gemini côté serveur ; le modèle principal ne reçoit que le texte de l'analyse, jamais l'image — `BrowserPanel.tsx:1444-1455`, `server/skills/browser.ts:1805-1842`. [V]

Trois moteurs coexistent : la webview visible (`browser_*`), un fetch 100 % serveur (`browser_web_search`, `server/skills/browser.ts:1639`) et Puppeteer headless (`automation_*`, `server/skills/automationBrowser.ts`, non audité ici). `ComputerUseAgent` n'est qu'un traducteur d'actions abstraites vers `browser_*` — `server/autonomy/ComputerUseAgent.ts:137-142`. [V]

Les missions autonomes n'ont PAS accès à la webview : seul `browser_web_search` passe le filtre — `server.ts:416-424,555-559`. [V]

## 2. Capacités réelles

| Capacité | État | Référence |
|---|---|---|
| Navigation, recherche, retour/avant/rechargement | Existe, mais « tire et oublie » : `success` renvoyé sans attendre ni vérifier le chargement | `browser.ts:1195-1285` |
| Clic par sélecteur CSS / par rôle ARIA | Existe ; clic synthétique `dispatchEvent(new MouseEvent('click'))`, sans `scrollIntoView`, sans pointerdown/mousedown | `BrowserPanel.tsx:633-638` |
| Saisie (`type`, `fill_form`, `type_by_label`, `select_option`) | Existe ; `pressEnter` = keydown/keyup synthétiques seulement | `BrowserPanel.tsx:677-712` |
| Défilement | Existe (px, haut/bas) ; pas de défilement d'un conteneur interne | `BrowserPanel.tsx:453-468` |
| Lecture de page | `innerText` nettoyé (sans nav/header/footer/aside), 8 000 caractères max | `BrowserPanel.tsx:490-507` |
| Liens, snapshot, inspect, arbre ARIA, texte/attribut d'élément | Existent, plafonnés (20 champs, 15 boutons, 12 par type en inspect) | `BrowserPanel.tsx:797,810,852-858` |
| Attente de condition (sélecteur/texte/URL) | Existe, polling 100 ms | `BrowserPanel.tsx:888-917` |
| Console + erreurs réseau | Existe, tampon de 300 entrées par onglet, vidé à chaque navigation | `BrowserTabView.tsx:66,142-165` |
| Capture | Zone visible uniquement, analysée par Gemini | `browser.ts:1802-1850` |
| Onglets | L'agent peut seulement OUVRIR un onglet ; ni lister, ni changer, ni fermer. Toutes les actions visent l'onglet actif | `browser.ts:1853`, `BrowserPanel.tsx:160-166` |
| Téléchargements | Bloqués volontairement | `electron/main.cjs:318-321` |
| Envoi de fichier (upload), glisser-déposer, survol, touches clavier arbitraires, iframes, shadow DOM, boîtes `alert/confirm`, PDF | Absents (aucun outil ni handler) | — |
| Authentification / cookies | Pas d'outil dédié. La webview utilise la partition persistante du profil actif (`persist:browser-<id>`) : l'agent agit donc avec les sessions déjà ouvertes par l'utilisateur. Pas de profil réservé à l'agent | `useBrowserProfiles.ts:34-39`, `BrowserPanel.tsx:83` |
| Google | Non chargeable en webview → repli Bing | `browser.ts:297-308` |

## 3. Sécurité

Ce qui est bien fait [V] :
- Webview verrouillée à l'attache : preload supprimé, `nodeIntegration=false`, `contextIsolation=true`, `sandbox=true`, `webSecurity=true`, `allowRunningInsecureContent=false`, partition imposée par regex — `electron/main.cjs:328-346`.
- Popups refusés (`setWindowOpenHandler` → deny), fenêtres de l'app interdites de navigation hors origine — `main.cjs:416-436`. Pas d'attribut `allowpopups` sur la webview — `BrowserTabView.tsx:217-231`.
- IPC réservés à l'origine de l'app — `main.cjs:466-473`.
- Filtrage d'URL côté skill : schémas `javascript/data/file/vbscript/about` refusés, IP privées/loopback/link-local/IPv4-mappées refusées — `browser.ts:35,161-238,262-286`.
- Fetch serveur limité au web public — `browser.ts:246-260`.
- Canal de retour protégé par `requireAuth` quand un jeton est configuré — `server.ts:754,912`.

Problèmes :

S1. Injection de JavaScript par le sélecteur dans `browser_read_content`. Le sélecteur est recopié brut dans une chaîne JS entre apostrophes : `'[sélecteur introuvable: ${detail.selector}]'` — `BrowserPanel.tsx:493`. [V] Conséquences : (a) tout sélecteur légitime contenant une apostrophe (`input[name='q']`) produit une erreur de syntaxe et la lecture échoue ; (b) un sélecteur forgé exécute du JS arbitraire dans la page, avec la session de l'utilisateur. Le clic a un échappement partiel du même genre — `BrowserPanel.tsx:635`.

S2. Le filtrage d'URL n'existe qu'au moment de l'appel d'outil. Les webviews restent « libres » de naviguer (`main.cjs:426-436`) : redirection, lien cliqué via `browser_click`, ou nom DNS public pointant vers une IP privée ne sont pas filtrés (`classifyHost` ne résout pas le DNS, `browser.ts:210-229`). [V pour l'absence de garde ; S pour l'exploitation]

S3. `localhost` est autorisé (`browser.ts:40,224,234`), donc l'agent peut ouvrir `http://localhost:<port>/api/...`, c'est-à-dire l'API de Leanna elle-même. Sans `Leanna_API_TOKEN`, toute requête est acceptée — `server/security.ts:45-48`. [V] Une page piégée + une injection de prompt pourrait donc faire lire ou appeler l'API locale. [S pour le scénario complet]

S4. Permissions en liste de refus : tout ce qui n'est pas listé est ACCORDÉ (`callback(!DENIED.has(permission))`) — `main.cjs:291-316`. `clipboard-read`, `display-capture`, `clipboard-sanitized-write`, etc. ne sont pas dans la liste. [V pour la logique ; S pour la liste exacte des permissions qu'Electron soumet]

S5. Aucune confirmation côté code avant une action sensible du navigateur. La seule barrière est le prompt (`server/runtime/prompts/browser.md:9`, `server/runtime/prompts/rules/core.ts:301`). Aucun `browser_*` n'apparaît dans les attributions sensibles (`server/agents/toolAgentMapper.ts:168-205`). [V pour l'absence dans les fichiers lus ; je n'ai pas tracé `PermissionPolicy` jusqu'au bout dans le chemin live]

S6. Garde anti-injection partiel. Le garde ne bloque jamais, il préfixe un avertissement (`promptInjectionGuard.ts:222-238`) et le garde central ne couvre que des champs nommés (`text`, `content`, `message`… — `:308-321`). Ne sont donc pas scannés : `pageContent` renvoyé après un clic (`browser.ts:1879`), `inputs/buttons` du snapshot (`:1910-1911`), `elements` ARIA (`:1945`), `links[].text` (`:1473`), `value` d'attribut (`:2060`), `title`. La détection repose sur une douzaine d'expressions régulières FR/EN (`promptInjectionGuard.ts:27-43`). [V]

S7. Les popups refusés sont rouverts automatiquement en onglets d'arrière-plan, sans plafond ni filtrage d'URL — `main.cjs:418-423`, `preload.cjs:71-75`, `BrowserPanel.tsx:217-221`. Une page peut ouvrir un nombre illimité d'onglets. [V]

S8. La capture (éventuellement d'une page authentifiée) part chez Gemini sans confirmation — `browser.ts:1820-1830`. [V]

S9. Détails : le handler `certificate-error` est posé sur la fenêtre principale, pas sur les webviews (`main.cjs:349`) — sans effet néfaste car Electron refuse par défaut [S]. Fenêtre principale en `sandbox:false` (`main.cjs:200`). Extensions chargées avec `allowFileAccess:true` (`main.cjs:737,786`).

## 4. Fiabilité et performance

F1. Navigation « tire et oublie » : `browser_navigate`, `browser_search`, `back/forward/reload/scroll` renvoient `success` immédiatement ; un `did-fail-load` n'est jamais remonté à l'agent — `browser.ts:1198-1207`, `BrowserTabView.tsx:147-161`. [V]

F2. Renaviguer vers la même URL ne fait rien. `IdeView` pose `browserUrl` dans un état React ; si la valeur est identique à la précédente, l'effet de `BrowserPanel` (dépendance `[controlledUrl]`) ne se rejoue pas — `IdeView.tsx:539-541`, `BrowserPanel.tsx:228-236`. Scénario : l'agent ouvre X, clique vers Y, redemande X → rien ne se passe, mais le skill annonce un succès. [V]

F3. Attente de chargement par `location.href.includes(urlDemandée)` — `browser.ts:1408,1536,1580`, `BrowserPanel.tsx:907-910`. Toute redirection (www, consentement, paramètres ajoutés) fait attendre 10 s pour rien ; à l'inverse la condition est vraie dès le commit de navigation, avant que le contenu soit rendu. Aucun usage de `did-stop-loading`. [V pour la logique ; S pour la fréquence]

F4. Délais cumulés : lecture 18 s par essai (`browser.ts:1314`), jusqu'à 3 essais. Pire cas de `browser_research` à 5 sources : environ 4 à 5 minutes. [calcul à partir des constantes, V]

F5. Webview absente = attente muette : `handleReadRequest` sort sans répondre si `webviewRef` est nul (`BrowserPanel.tsx:488`), d'où 18 s de délai au lieu d'une erreur immédiate. Idem pour scroll/back/forward. [V]

F6. `pressEnter` n'envoie que des événements clavier synthétiques (`BrowserPanel.tsx:703-712`) : un formulaire HTML natif n'est pas soumis. [V pour le code ; S pour l'effet, comportement standard de Chromium avec des événements non « trusted »]

F7. Taille du contenu : la page est coupée à 8 000 caractères côté renderer sans marqueur (`BrowserPanel.tsx:493,505`) alors que le serveur prévoit 15 000 et un indicateur `truncated` qui ne peut donc jamais être vrai (`browser.ts:55,311-317`). L'agent ne sait pas que la page est tronquée et n'a pas de pagination. `browser_research` renvoie le contenu complet de chaque source + `facts` + `evidence` (phrases dupliquées) : jusqu'à ~50 000 caractères par appel (`browser.ts:1589-1600`). `browser_web_search` : 15 000 caractères × 6 sources (`webSearchProvider.ts:86`). [V]

F8. Capture PNG en base64 postée en JSON, limite de corps 10 Mo (`server/config/rateLimits.ts:115`) : un grand écran HiDPI pourrait dépasser. [S]

F9. Détection JSON fragile : un texte de page commençant par `{` et contenant `"text"` est interprété comme la réponse structurée — `browser.ts:1327-1329`. [V]

F10. Divers [V] : `normalizeUrl` dupliqué et divergent entre client (repli Google, `BrowserPanel.tsx:46-54`) et serveur (repli Bing, `browser.ts:262-286`) ; deux effets concurrents sur la barre d'adresse (`BrowserPanel.tsx:115-117` et `143-145`) ; en-tête de `browser.ts:17-21` obsolète (« CLIENT REQUIS » alors que le handler existe) ; `BrowserPanel.tsx` fait 1 643 lignes avec ~20 scripts injectés en chaînes.

## 5. Tests

Existants et lancés (tous verts, 128 tests, 4,9 s) :
- `server/skills/browser.test.ts` : schémas zod, déclarations, politique d'URL/SSRF, classement des liens, liens sponsorisés, erreurs sans `emitIdeAction`.
- `server/routes/browser.test.ts` : canal de retour (résolution, rejet, requestId inconnu).
- `server/autonomy/ComputerUseAgent.test.ts`, `server/utils/promptInjectionGuard.test.ts`, `server/skills/webSearchProvider.test.ts`, `server/runtime/prompts/attack-data-injection.test.ts`.

Non couvert :
- Aucun test pour `BrowserPanel.tsx`, `BrowserTabView.tsx`, `useLiveAPI` (dispatch), `ideRemoteBridge` : les scripts injectés, là où se trouvent S1, F2, F5, F6, F7, ne sont jamais exécutés par un test. [V : aucun fichier `Browser*.test.*` dans `src/components/panels`]
- Aucun test des handlers du skill avec un `emit` simulé (lecture avec réessai, troncature, `browser_research`, capture).
- Aucun test du durcissement Electron (`will-attach-webview`, permissions).
- Aucun test de bout en bout avec une vraie webview.

Commande :
`node --import tsx --import ./scripts/test-isolation.mjs --test server/skills/browser.test.ts server/routes/browser.test.ts server/autonomy/ComputerUseAgent.test.ts server/utils/promptInjectionGuard.test.ts server/skills/webSearchProvider.test.ts server/runtime/prompts/attack-data-injection.test.ts`

## 6. Liste priorisée

| # | Problème | Impact | Effort |
|---|---|---|---|
| 1 | S1 — sélecteur injecté brut dans le script de lecture (casse les sélecteurs à apostrophe + exécution de JS) | Élevé | Faible (passer par `JSON.stringify`, comme ailleurs) |
| 2 | S5 — pas de confirmation côté code pour saisie d'identifiants, soumission, capture envoyée à Gemini | Élevé | Moyen |
| 3 | S2 + S3 — filtrage d'URL seulement à l'appel ; `localhost` (API de Leanna) atteignable | Élevé si pas de jeton | Moyen (`will-navigate`/`webRequest` sur les partitions `persist:browser-*`, exclure le port de l'app) |
| 4 | F2 — renavigation vers la même URL ignorée, succès annoncé à tort | Moyen | Faible |
| 5 | F1 + F3 — pas de vrai signal de fin de chargement ni d'erreur remontée | Moyen (lenteur, pages lues vides) | Moyen (s'appuyer sur `did-stop-loading`/`did-fail-load`) |
| 6 | F7 — troncature silencieuse à 8 000 caractères, résultats de recherche trop volumineux | Moyen | Faible |
| 7 | S4 — permissions en liste de refus | Moyen | Faible (passer en liste d'autorisation) |
| 8 | S6 — champs non couverts par le garde anti-injection | Moyen | Faible à moyen |
| 9 | F6 — `pressEnter` et clics synthétiques (passer à `sendInputEvent`) | Moyen | Moyen |
| 10 | F5 — erreurs immédiates au lieu de délais quand la webview est absente | Faible à moyen | Faible |
| 11 | S7 — plafonner les onglets ouverts par popup | Faible | Faible |
| 12 | Onglets : lister / changer / fermer ; profil dédié à l'agent | Fonctionnel | Moyen |
| 13 | Tests du renderer (extraire les scripts injectés en fonctions testables) | Prévention | Moyen à élevé |
