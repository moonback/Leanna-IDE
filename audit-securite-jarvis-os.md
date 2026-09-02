# Audit de sécurité — Jarvis OS (Leanna IDE)

**Périmètre analysé :** dump complet du dépôt fourni (`output.md`, ~544 fichiers source extraits : serveur Express/TypeScript, frontend React/Vite, Electron).
**Type d'audit :** revue de code statique manuelle (SAST) + relecture d'architecture. Aucun test dynamique (DAST), aucune exécution de l'application, et **aucun accès réseau** dans cet environnement — l'audit des dépendances tierces (`npm audit`) n'a donc pas pu être effectué et doit être fait séparément.
**Contexte du produit :** Jarvis OS / *Leanna* est un IDE piloté par des agents IA, avec accès **terminal shell interactif**, **système de fichiers**, **navigateur automatisé (Puppeteer)**, **client FTP**, **client MCP**, et exécution de commandes `git`/`npm`. La surface d'attaque native de ce type d'outil est élevée par conception : l'enjeu de l'audit est de vérifier que cette puissance est correctement cloisonnée.

---

## 1. Synthèse

| Sévérité | Nombre de constats |
|---|---|
| 🔴 Élevée | 3 |
| 🟠 Moyenne | 4 |
| 🟡 Faible | 4 |
| 🔵 Informative / bonne pratique confirmée | 5 |

Le code montre une **maturité sécurité réelle** : validation Zod systématique, sanitisation HTML par allowlist DOM (pas de regex fragile), protection anti-SSRF avec liste d'hôtes/IP privées bloqués, garde-fous de non-démarrage en écoute réseau ouverte sans jeton, rate limiting, chiffrement authentifié AES-256-GCM. Les points ci-dessous sont donc surtout des **durcissements** plutôt que des failles béantes, à l'exception du modèle d'authentification par défaut qui mérite une attention particulière compte tenu de l'accès shell complet exposé par l'application.

---

## 2. Constats détaillés

### 🔴 H-1 — Authentification désactivée par défaut sur une application donnant un accès shell complet
**Fichiers :** `server/security.ts`, `server.ts` (l. 340-565), `server/routes/terminal.ts`

`authenticateRequest()` et `authenticateToken()` retournent `{ ok: true }` **sans vérification** dès lors que `Leanna_API_TOKEN` n'est pas défini dans `.env` (valeur vide par défaut dans `.env.example`). Or cette API expose, entre autres, un **WebSocket terminal donnant un shell interactif complet** (`spawn(shell, ['--login', '-i'])` / PowerShell), la lecture/écriture de fichiers, l'exécution `git`, etc.

Le code contient déjà de bons garde-fous : liaison par défaut sur `127.0.0.1`, refus explicite de démarrer si `Leanna_LISTEN_HOST=0.0.0.0` sans jeton configuré, et avertissement console au démarrage. C'est une conception raisonnable pour un outil **strictement local mono-utilisateur**. Le risque réel dépend donc entièrement de l'environnement de déploiement :
- Poste partagé / multi-utilisateur, conteneur, VM, ou tout scénario où un autre processus/utilisateur local peut atteindre `127.0.0.1:4000` → accès shell complet sans authentification.
- Toute régression future qui changerait le bind par défaut, ou tout reverse-proxy placé devant l'app, contournerait la protection.

**Recommandation :** rendre `Leanna_API_TOKEN` **obligatoire** (générer un jeton aléatoire fort à la première installation plutôt que de permettre une valeur vide), et documenter clairement que l'absence de jeton n'est acceptable que sur poste strictement personnel et non partagé.

### 🔴 H-2 — Jeton d'authentification transmis en paramètre d'URL (WebSocket terminal)
**Fichier :** `server/routes/terminal.ts` (l. ~118-122)

Le jeton du WebSocket terminal est lu via `url.searchParams.get('token')`. Les jetons passés en query string se retrouvent typiquement dans les logs serveur/proxy, l'historique navigateur, et peuvent fuiter via l'en-tête `Referer`.

**Recommandation :** transmettre le jeton via un en-tête WebSocket (`Sec-WebSocket-Protocol` ou en-tête custom lors du handshake) ou via un cookie `httpOnly` déjà posé ailleurs dans le code (`server.ts` pose un cookie `Leanna_token` — à réutiliser ici plutôt qu'un paramètre d'URL).

### 🔴 H-3 — `execFile(..., { shell: true })` réintroduit un risque d'injection de commande
**Fichiers :** `server/skills/project.ts:178`, `server/skills/verify.ts:518,638,660`, `server/utils/checkpoint.ts:49`, `server/utils/sandbox.ts:623`, `server/mcp/McpClient.ts:257`

`child_process.execFile` avec un tableau d'arguments est normalement sûr car Node l'exécute directement (`execve`), sans interprétation shell. **Mais dès que `shell: true` est ajouté**, Node concatène commande + arguments en une seule ligne passée à `/bin/sh -c` (ou `cmd.exe` sous Windows) **sans échapper les métacaractères** — c'est un piège Node.js documenté qui réintroduit exactement le risque que `execFile` est censé éviter.

- Dans `project.ts`, le paramètre `projectName` est heureusement filtré par une allowlist stricte (`[^a-zA-Z0-9_-]` → `-`) avant usage : ce site précis est donc sûr.
- Dans `verify.ts` (lint/format/tsc) et `sandbox.ts`, les arguments transmis (chemins de fichiers, cibles de lint) proviennent d'appels d'outils déclenchés par l'agent IA. Si un chemin de fichier ou un argument contient des métacaractères shell (`; | & \` $( )`), et n'est pas filtré aussi strictement qu'en `project.ts`, l'exécution shell peut être détournée. Le risque est amplifié par le fait que ces arguments peuvent transiter par du contenu généré par un LLM, potentiellement influencé par une **injection de prompt** (ex. contenu d'un fichier ouvert par l'agent).

**Recommandation :** auditer chaque site `shell: true` un par un ; le supprimer partout où il n'est pas strictement nécessaire (il ne l'est en général que pour résoudre les `.cmd`/`.bat` sous Windows — préférer résoudre le chemin binaire exact, ou utiliser une lib comme `cross-spawn` qui gère ce cas sans shell). Là où il reste nécessaire, valider chaque argument avec une allowlist de caractères, comme déjà fait dans `project.ts`.

---

### 🟠 M-1 — Clé de chiffrement au repos dérivée d'informations non secrètes
**Fichier :** `server/utils/crypto.ts`

`getMasterKey()` dérive la clé AES-256-GCM utilisée pour chiffrer les clés API Gemini stockées sur disque (`geminiKeyPool.ts`) à partir de `hostname + platform + username`, complétées par un `Leanna_MASTER_KEY` **optionnel** (absent de `.env.example`, donc non défini par défaut). Hostname et nom d'utilisateur sont des informations généralement non secrètes et faciles à obtenir localement (ou parfois à distance). Sans `Leanna_MASTER_KEY` positionné, le chiffrement relève donc plus de l'obfuscation que d'une réelle protection contre un attaquant ayant accès au disque ou à une sauvegarde.

**Recommandation :** rendre `Leanna_MASTER_KEY` obligatoire (générer et stocker une clé aléatoire dédiée à la première exécution, hors du contrôle de version) plutôt que de retomber sur des attributs machine devinables.

### 🟠 M-2 — Protection anti-SSRF de la navigation automatisée contournable par DNS rebinding
**Fichier :** `server/skills/automationHelpers.ts` (`assertSafeUrl`)

Bon réflexe déjà en place : blocage des IP littérales privées/loopback/link-local (`127.`, `10.`, `192.168.`, `169.254.169.254`, métadonnées cloud AWS/GCP/Alibaba, etc.) et validation du schéma `http(s)` uniquement. Cependant, la vérification `isPrivateIp()` ne s'applique **qu'au nom d'hôte littéral** — un nom de domaine public dont le DNS résout vers une IP privée (technique classique de *DNS rebinding*) contourne totalement ce contrôle, puisque Puppeteer résoudra et se connectera à l'IP réelle au moment du `page.goto()`. Ce point est particulièrement pertinent ici car l'URL naviguée peut être fournie par un agent IA, donc potentiellement influencée par une injection de prompt provenant d'une page web tierce lue par l'agent.

**Recommandation :** résoudre le DNS *avant* navigation (ou via un hook `request`/proxy Puppeteer) et valider l'IP résolue, pas seulement la chaîne d'hôte ; envisager également l'allowlist de domaines (`AUTOMATION_ALLOWED_DOMAINS`) en production plutôt que le mode permissif par défaut.

### 🟠 M-3 — Client FTP acceptant tout hôte/port sans restriction
**Fichier :** `server/routes/ftp.ts`

`host`/`port` sont validés uniquement pour leur forme (chaîne non vide, port 1-65535) via Zod, sans restriction vers les plages privées. C'est une fonctionnalité légitime (se connecter à *son* serveur FTP), mais si l'application est un jour exposée au-delà de `127.0.0.1`, ce endpoint peut servir de proxy pour sonder le réseau interne (scan de ports/services via connexions FTP vers des IP internes).

**Recommandation :** documenter le risque, ou appliquer la même liste de blocage d'IP privées que pour la navigation automatisée si un usage multi-utilisateur/distant est envisagé.

### 🟠 M-4 — Comparaison non constante et faible entropie pour le code de sortie du bac à sable
**Fichier :** `server/routes/sandbox.ts` (plusieurs occurrences, ex. l. 67-93, 250-360)

`code !== exitCode` compare directement deux chaînes (pas de `crypto.timingSafeEqual`), pour un code numérique à 6 chiffres (10⁶ possibilités). Le risque réel est faible en usage strictement local, mais reste un axe d'attaque par force brute/timing si ce endpoint est un jour exposé au-delà de `localhost`.

**Recommandation :** utiliser `crypto.timingSafeEqual` et un rate-limit dédié et strict sur cette route (au-delà du rate limit global).

---

### 🟡 L-1 — Attribut `style` autorisé sur `<span>` dans le sanitizer HTML
**Fichier :** `src/utils/sanitizeMarkdownHtml.ts`

Le sanitizer maison (`sanitizeMarkdownHtml`) est une bonne implémentation par **allowlist DOM** (tags + attributs autorisés, retrait des gestionnaires `on*`, validation stricte des schémas `href`). Seul point mineur : l'attribut `style` est autorisé sur `<span>`, ce qui laisse une petite surface pour des attaques CSS (exfiltration d'information via sélecteurs CSS, mise en page trompeuse). Risque faible mais évitable.

**Recommandation :** retirer `style` de la liste blanche, ou le restreindre à une liste de propriétés CSS sûres.

### 🟡 L-2 — `git rev-list` avec interpolation du nom de branche
**Fichier :** `server/routes/self-root.ts:65`

`execSync(\`git rev-list --left-right --count origin/${gitBranch}...HEAD\`, ...)` interpole `gitBranch` (lui-même issu d'un précédent `git rev-parse --abbrev-ref HEAD`) dans une chaîne de commande shell. En usage normal `gitBranch` provient de Git lui-même donc peu contrôlable par un attaquant distant ; le risque n'est réaliste qu'en cas de dépôt cloné avec un nom de branche forgé de façon inhabituelle. À corriger par hygiène de code plutôt qu'en urgence.

**Recommandation :** passer par `execFile('git', ['rev-list', ..., \`origin/${gitBranch}...HEAD\`])` sans `shell`.

### 🟡 L-3 — Rapport d'audit interne généré par le SAST maison contient des faux positifs
**Fichier :** `security-audit-report.md` (existant dans le dépôt)

L'outil d'auto-audit intégré (`server/skills/verify.ts`, règle `no-hardcoded-secrets`, `no-eval`) semble effectuer une correspondance de motifs texte simple, ce qui génère de faux positifs : il signale par exemple des « secrets codés en dur » dans `.env` (qui ne contient en réalité que des commentaires/valeurs vides) et des usages de `eval()` qui sont en fait des chaînes de **détection** de `eval()` à l'intérieur même de l'outil de scan (`verify.ts`, `MarketplaceRegistry.ts`). Ce n'est pas une vulnérabilité en soi, mais un défaut de fiabilité de l'outillage de sécurité interne qui peut conduire à ignorer de vraies alertes noyées dans le bruit (fatigue d'alerte).

**Recommandation :** faire évoluer le SAST maison vers une analyse contextuelle (AST) plutôt que du pattern-matching texte brut, ou le compléter par un outil établi (Semgrep, ESLint security plugin) pour réduire les faux positifs.

### 🟡 L-4 — Absence de vérification des dépendances tierces dans cet audit
**Portée :** `package.json`

Cet environnement d'audit n'a pas d'accès réseau ; `npm audit` / vérification CVE n'a donc **pas pu être exécuté**. Les versions observées (`express ^4.21.2`, `ws ^8.21.0`, `puppeteer ^25.3.0`, `vite ^6.2.3`, `marked 15.0.12`, `multer ^2.2.0`) sont relativement récentes à l'œil, mais cela ne remplace pas un scan réel.

**Recommandation :** exécuter `npm audit --production` et idéalement un scan SCA (Snyk, Dependabot, `npm audit` en CI) régulièrement.

---

## 3. Points positifs confirmés

- **Path traversal :** `resolveWorkspacePath()` (server/security.ts) utilise `path.resolve` + vérification `startsWith(root + sep)`, un pattern correct et couramment recommandé contre le traversal.
- **Sanitisation HTML :** allowlist DOM réelle (pas de regex fragile), retrait systématique des `on*`, validation des schémas `href` (blocage `javascript:`, `data:`, `vbscript:`, `file:`).
- **Rendu Mermaid :** `securityLevel: 'strict'` explicitement configuré — bonne pratique qui neutralise une classe de XSS connue sur cette librairie.
- **Protection SSRF de base :** blocage des IP privées/loopback et des adresses de métadonnées cloud (AWS/GCP/Alibaba) avant navigation automatisée.
- **Chiffrement en transit des secrets :** AES-256-GCM (chiffrement authentifié) avec IV aléatoire, plutôt que du CBC non authentifié ; bonne rétrocompatibilité gérée proprement.
- **Validation d'entrée systématique :** middleware Zod générique (`validateBody`) appliqué de façon cohérente sur les routes ; limites de taille sur les uploads (`multer`, 10 Mo, allowlist de types MIME).
- **Rate limiting :** plusieurs profils de limiteurs (`express-rate-limit`) par type de route (chat, embeddings, polling, global), avec exemption raisonnable pour `127.0.0.1` en local.

---

## 4. Plan d'action priorisé

1. **Rendre l'authentification obligatoire par défaut** (générer un jeton fort à l'installation) — H-1.
2. **Faire transiter le jeton WebSocket hors de l'URL** (en-tête ou cookie httpOnly) — H-2.
3. **Éliminer ou verrouiller chaque usage de `shell: true`** dans les appels `execFile`/`execSync`, en appliquant partout l'allowlist déjà utilisée dans `project.ts` — H-3.
4. **Rendre `Leanna_MASTER_KEY` obligatoire** pour le chiffrement des clés API stockées — M-1.
5. **Corriger le contournement DNS rebinding** de la protection SSRF de navigation — M-2.
6. Durcir FTP (M-3) et la comparaison du code sandbox avec `timingSafeEqual` (M-4).
7. Retirer `style` de la liste blanche HTML (L-1), corriger l'interpolation shell mineure dans `self-root.ts` (L-2).
8. Réduire les faux positifs du SAST maison ou le compléter par un outil établi (L-3), et lancer un `npm audit`/scan SCA complet dès qu'un accès réseau est disponible (L-4).

---

## 5. Limites de cet audit

- Analyse **statique uniquement** : aucune exécution du serveur, aucun test d'intrusion dynamique, aucune preuve d'exploitation (PoC) réalisée.
- **Pas d'audit des dépendances** (pas d'accès réseau dans cet environnement).
- Le dépôt fourni est un **dump texte** généré (fichier unique de ~179 000 lignes listant l'arborescence complète) ; 544 fichiers ont pu être reconstruits et analysés. Certains fichiers binaires (images, vidéos) n'ont pas été inclus dans le dump et n'ont donc pas pu être vérifiés (non pertinent pour la sécurité applicative).
- L'audit couvre le code applicatif ; il ne couvre pas la configuration de déploiement réelle (reverse proxy, pare-feu, durcissement OS, gestion des secrets en production), qui reste déterminante pour le niveau de risque effectif de H-1 en particulier.
