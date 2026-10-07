Je commence par lire le fichier.Le fichier fait plus de 271 000 lignes. Je cible les parties liées au navigateur, à la recherche et à la navigation web.Je suis en train de lire le code de ton navigateur intégré : la skill serveur `browser.ts`, puis `BrowserPanel.tsx` et la barre d'outils. Ensuite je te livre l'analyse.Je suis dans le code Electron (`main.cjs`) pour vérifier la sécurité du `<webview>` : popups, permissions, téléchargements. Ensuite j'écris l'analyse complète.Je regarde un dernier fichier, `automationBrowser.ts` (le moteur Puppeteer headless et sa recherche DuckDuckGo). Après ça, je te donne l'analyse complète.Je vérifie deux soupçons de bugs en les exécutant avant de te les affirmer.J'ai lu le navigateur intégré : `server/skills/browser.ts`, `BrowserPanel.tsx`, `BrowserToolbar.tsx`, `useBrowserHistory.ts`, `electron/main.cjs`, `automationBrowser.ts` et le prompt `browser.md`. Je n'ai pas relu en détail les handlers click/type/get-links du panneau, les profils, l'UI des extensions, le preload ni les tests. J'ai exécuté les deux bugs 1 et 2 pour les confirmer.

L'architecture est solide : un navigateur visible piloté par IPC, des profils isolés, de l'ARIA snapshot, des retries. Il y a aussi une vraie ambition de recherche (`browser_research`, avec fiabilité, fraîcheur et contradictions). Les problèmes sont dans les détails d'implémentation et dans le choix de scraper Google dans une webview.

## 1. Bugs et sécurité à corriger en priorité

**1. `classifyHost` bloque des sites légitimes et laisse passer des adresses internes** (`browser.ts`)
- Les tests par préfixe `startsWith("fc"/"fd"/"fe8"/"fec"/"fed"/"fee"/"fef")` s'appliquent aussi aux noms de domaine. Résultat : `fedex.com`, `fda.gov`, `fcc.gov` et `feedly.com` sont refusés (testé). Seule la version `www.` passe.
- À l'inverse, `http://[::ffff:127.0.0.1]/`, `[fd00::1]` et `[fe80::1]` sont classés `PUBLIC_WEB`. `URL.hostname` garde les crochets et normalise l'IPv4 mappée en `[::ffff:7f00:1]`. C'est un contournement de ta policy SSRF.
- Correction : retirer les crochets, utiliser `net.isIP()` et une lib de plages (`ipaddr.js`) pour les IP, et ne tester aucun préfixe sur les noms de domaine. Idéalement, résoudre le DNS (`dns.lookup`, `all: true`) et vérifier chaque adresse.

**2. `isSponsored` marque comme publicitaires des sources officielles** (`rankLinkCandidates`)
- Le motif `pub` matche `service-public.fr`, `pubmed.ncbi.nlm.nih.gov` et « Publications » (testé). `ads\b` matche `downloads`.
- Ces liens perdent 100 points et sont exclus de `browser_research` et `browser_open_link`.
- Correction : un motif à bornes de mots (`\b(sponsor(is[ée]s?)?|annonce|advertisement)\b`) et surtout la détection structurelle des blocs pub du moteur (par exemple `#tads` ou `[data-text-ad]` sur Google), pas des mots.

**3. `allowpopups` est activé alors que tu veux le désactiver** (`BrowserPanel.tsx`)
- `setAttribute('allowpopups', 'false')` crée l'attribut, et c'est la présence de l'attribut qui l'active (c'est un attribut booléen). `webpreferences` posé après l'attache est aussi ignoré.
- Côté `main.cjs`, je ne trouve ni `setWindowOpenHandler`, ni `will-attach-webview`, ni `setPermissionRequestHandler`, ni `will-download`, ni `certificate-error`.
- Sans handler de permissions, Electron accorde par défaut caméra, micro, géolocalisation et notifications à n'importe quel site chargé dans la webview.
- Correction : ne pas poser l'attribut, puis dans `main.cjs` :

```js
win.webContents.on('will-attach-webview', (e, prefs, params) => {
  delete prefs.preload; prefs.nodeIntegration = false; prefs.contextIsolation = true;
  if (!/^persist:browser-[\w-]+$/.test(params.partition)) e.preventDefault();
});
app.on('web-contents-created', (_e, wc) => {
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) win.webContents.send('browser-open-tab', url); // futurs onglets
    return { action: 'deny' };
  });
});
// par partition : ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
```

**4. `browser.ts` n'a aucune protection anti-injection de prompt**
- `automationBrowser.ts` utilise `guardUntrustedContent/Fields`. `browser.ts` (0 référence) renvoie au modèle le texte brut des pages : `browser_read_content`, `browser_research` (jusqu'à N pages) et `pageContent` après un clic.
- Le prompt dit « le contenu web est une donnée », mais rien ne le garantit côté code. Appliquer le même guard à `readPageContent` et aux champs de `ResearchSource`.

**5. `electron/open-external` ouvre n'importe quelle URL**
- `shell.openExternal(url)` sans validation permet `file:`, des protocoles custom, etc. Mets une allowlist `http:`, `https:` et `mailto:`.
- De plus, `handleOpenInNewWindow` appelle `require('electron')` dans le renderer, alors que `nodeIntegration: false`. L'appel lève toujours une exception et tu retombes sur `window.open`. Passe par le preload.

**6. `did-fail-load` affiche une erreur pour les sous-frames**
- Une pub ou un iframe qui échoue affiche « Impossible de charger cette page ». Teste `ev.isMainFrame` (idem pour `did-navigate-in-page`, qui pollue la barre d'adresse avec des URLs d'iframes).

## 2. Corrections de fiabilité

- **Historique compté en double** : `did-navigate` et `did-stop-loading` appellent tous les deux `recordVisit`, donc chaque page gagne +2 visites et les suggestions sont faussées. N'enregistre qu'à un seul endroit, sur la frame principale.
- **Bouton « Arrêter le chargement »** : le label change mais `onClick` reste `onRefresh`. Appelle `wv.stop()` quand `loading` est vrai.
- **`waitForBrowserCondition(url, "url")`** utilise `location.href.includes(urlComplète)`.
  - Une redirection, un slash final ou un paramètre en plus, et tu attends 10 s pour rien. En Europe, Google redirige souvent vers `consent.google.com`, et le flux de recherche casse.
  - La condition est vraie dès le commit de navigation, pas à la fin du chargement, d'où ton retry « contenu < 40 caractères ».
  - Correction : attendre l'événement `did-stop-loading` (ou `did-finish-load`) avec un identifiant de navigation.
- **Extraction du contenu** :
  - `cloneNode` détaché + `innerText` se comporte comme `textContent` : les sauts de ligne sont perdus.
  - Supprimer tous les `header` retire aussi les titres d'articles.
  - `selector` est injecté brut dans une chaîne JS dans le message d'erreur : utilise `JSON.stringify`.
  - La limite client est de 8000 caractères et celle du serveur de 15 000 : le flag `truncated` n'est donc jamais vrai, et le modèle ne sait pas que la page est coupée.
  - Correction : cibler `main, article, [role=main]`, travailler sur le DOM vivant ou injecter Readability, et renvoyer `truncated` depuis le client.
- **`normalizeUrl` est dupliqué** (client et serveur) avec des comportements différents. Le client n'applique pas la policy réseau. `localhost:3000` sans schéma part en recherche Google, alors que la policy autorise localhost. Mets-le dans un module partagé.
- **`controlledUrl`** : si Leanna renavigue vers la même URL après que l'utilisateur a bougé, l'effet ne se redéclenche pas (`normalized === currentUrl` ou prop inchangée).
- **`sourceReliability`** : les regex `^www\.(reuters|bbc…)` ratent `reuters.com` sans `www`, et `new URL()` peut lever. `sourceFreshness` prend la première date trouvée dans 4000 caractères (copyright, date de commentaire…). Lis plutôt `article:published_time`, JSON-LD `datePublished` et `<time datetime>`.
- **`compareResearchSources`** : deux chiffres différents sont déclarés « contradiction » même s'ils sont complémentaires (« 5 % en 2023, 7 % en 2024 »). Présente-les comme « divergences possibles » et laisse le LLM trancher.
- **`NON_CONTENT_DOMAINS: "google."`** exclut aussi `docs.google.com`, `developers.google.com` et `cloud.google.com`. Restreins-toi aux domaines de recherche.
- **DuckDuckGo headless** (`automationBrowser.ts`) : `.result__url` donne l'URL affichée tronquée, pas le lien réel. Lis `a.result__a[href]` et décode le paramètre `uddg`. Il n'y a pas de détection de CAPTCHA ni de page « anomaly », et le User-Agent annonce Chrome 120.
- **Singletons Puppeteer** (`browser`, `page` globaux) : avec ton `AgentOrchestrator` multi-agents, deux missions se marchent dessus. Utilise un pool de pages ou `browser.createBrowserContext()` par mission, avec un mutex.

## 3. Améliorations de la recherche

La plus grosse amélioration possible est d'arrêter de scraper des pages de résultats dans la webview visible.

1. **Un `SearchProvider` unique** avec une chaîne de repli : l'API Brave Search, Tavily ou un SearXNG auto-hébergé. Tu utilises déjà `@google/genai`, donc le grounding Google Search de Gemini est aussi une option. Aujourd'hui tu as deux implémentations (Google en webview, DDG en Puppeteer), ce qui est fragile : CAPTCHA, consentement UE, changements de markup. Les résultats deviennent du JSON structuré (titre, URL, extrait, date).
2. **Lecture serveur en parallèle** pour `browser_research` : `fetch` + Readability sur N pages à la fois, avec cache et dédoublonnage. La webview ne sert qu'à afficher la source que l'utilisateur veut voir. Aujourd'hui, `browser_research` lit les sources une par une et détourne la page de l'utilisateur pendant plusieurs dizaines de secondes. Garde `browser_*` pour les interactions (formulaires, SPA) et les cas où une session connectée est nécessaire.
3. **Réduire le volume renvoyé au modèle** : `ResearchSource` renvoie `content` complet, plus `facts` et `evidence` qui répètent le même texte. Renvoie des extraits pertinents (passages classés par similarité avec la requête, tu as déjà `SemanticSearch`) plutôt que 8000 caractères par source.
4. **Requêtes multiples** : décomposer la question en 2–3 sous-requêtes, avec un second tour si la confiance est basse.
5. **Moteur configurable** et mots-clés dans la barre d'adresse (`g …`, `w …`, `ddg …`), au lieu du Google codé en dur dans les deux `normalizeUrl`. La page d'accueil actuelle est `google.com/webhp?igu=1`.
6. **Citations vérifiables** : renvoyer pour chaque affirmation l'URL et le passage exact, pour que l'UI puisse les surligner.

## 4. Améliorations de navigation

- **Onglets** : le type `BrowserPanelProps` a déjà `onOpenInNewTab`, mais il est inutilisé. Il n'y a qu'une seule webview, donc `target=_blank` ne fait rien (ou ouvre une fenêtre non contrôlée, voir le point 3). Fais un tableau d'onglets avec une webview par onglet (les inactives masquées), et permets à l'agent de choisir l'onglet cible.
- **Recherche dans la page** (`wv.findInPage`) et **zoom** (`setZoomFactor`).
- **Favicon** (événement `page-favicon-updated`) et **barre de progression**.
- **Pages d'erreur dédiées** : DNS, certificat (avec un vrai `certificate-error`), hors-ligne, avec un bouton « Réessayer ».
- **Favoris** et historique par période (effacer la dernière heure, le dernier jour).
- **Gestionnaire de téléchargements** (`will-download`), avec dossier du workspace comme cible possible.
- **Mode lecture** via Readability, utile aussi pour l'agent.
- **Devtools** (`openDevTools`), très attendu dans un IDE.

## 5. Nouvelles fonctionnalités à fort impact pour un IDE

1. **Aperçu du projet avec retour console/réseau** : détecte le port du serveur de dev, ouvre-le dans le navigateur, et relaie `console-message` et les erreurs de chargement à l'agent. Leanna peut alors corriger une erreur qu'elle voit réellement. Ajoute l'émulation d'appareils (`enableDeviceEmulation`).
2. **Capture + vision** : `wv.capturePage()` envoyé à Gemini pour « que vois-tu sur cette page ? » ou pour comparer avec une maquette.
3. **« Enregistrer dans une base »** : un bouton pour envoyer la page (en Markdown propre) vers tes Notebooks (`SourceIngester`) ou la mémoire du projet. Tu as déjà ces briques côté serveur.
4. **Confirmation avant les actions sensibles** : le prompt l'exige (mots de passe, paiement), mais je ne vois pas d'application côté code. Un garde-fou dans `browser_click`, `browser_type` et `browser_fill_form` (champ `password`, boutons « payer », domaine de paiement) qui exige une confirmation dans l'UI le rendrait réel.
5. **Journal d'actions de l'agent** (URL visitées, actions, captures) rejouable, branché sur ton `ExecutionLedger`.
6. **Mode « recherche approfondie »** avec progression visible (« 3/6 sources lues »), annulable.

## Ordre conseillé

1. Sécurité : points 3, 4 et 5 (un après-midi).
2. Bugs 1 et 2 (`classifyHost` et `isSponsored`) : petits correctifs, grand effet.
3. Fiabilité : attente de fin de chargement, extraction du contenu, historique, bouton stop, `isMainFrame`.
4. `SearchProvider` unique et lecture serveur parallèle.
5. Onglets, puis aperçu du projet avec console, puis capture + vision.

Je peux écrire les patchs pour les points 1, 2, 3 et 6 (avec des tests `node:test` dans le style de `browser.test.ts`), ou commencer par l'architecture du `SearchProvider`. Dis-moi par où tu veux commencer.