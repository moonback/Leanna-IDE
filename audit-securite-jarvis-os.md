# Audit de sécurité —  (Leanna IDE)

**Périmètre analysé :** dump complet du dépôt fourni (`output.md`, ~544 fichiers source extraits : serveur Express/TypeScript, frontend React/Vite, Electron).
**Type d'audit :** revue de code statique manuelle (SAST) + relecture d'architecture. Aucun test dynamique (DAST), aucune exécution de l'application, et **aucun accès réseau** dans cet environnement — l'audit des dépendances tierces (`npm audit`) n'a donc pas pu être effectué et doit être fait séparément.
**Contexte du produit :**  / *Leanna* est un IDE piloté par des agents IA, avec accès **terminal shell interactif**, **système de fichiers**, **navigateur automatisé (Puppeteer)**, **client FTP**, **client MCP**, et exécution de commandes `git`/`npm`. La surface d'attaque native de ce type d'outil est élevée par conception : l'enjeu de l'audit est de vérifier que cette puissance est correctement cloisonnée.

---

## Statut des corrections — v2 (2 septembre 2026)

| ID | Sévérité | Statut | Fichiers modifiés |
|---|---|---|---|
| H-1 | 🔴 Élevée | ✅ **Corrigé** | `server/security.ts`, `server.ts`, `.env.example` |
| H-2 | 🔴 Élevée | ✅ **Corrigé** | `server/routes/terminal.ts`, `src/hooks/useTerminal.ts` |
| H-3 | 🔴 Élevée | ✅ **Corrigé** | `server/skills/project.ts`, `server/skills/verify.ts`, `server/utils/checkpoint.ts`, `server/utils/sandbox.ts`, `server/mcp/McpClient.ts`, `server/security.ts` |
| M-1 | 🟠 Moyenne | ✅ **Corrigé** | `server/utils/crypto.ts`, `.env.example` |
| M-2 | 🟠 Moyenne | ✅ **Corrigé** | `server/skills/automationHelpers.ts`, `server/skills/automationBrowser.ts`, `server/skills/automationHelpers.test.ts` |
| M-3 | 🟠 Moyenne | ✅ **Corrigé** | `server/routes/ftp.ts`, `.env.example` |
| M-4 | 🟠 Moyenne | ✅ **Corrigé** | `server/routes/sandbox.ts` |
| L-1 | 🟡 Faible | ✅ **Corrigé** | `src/utils/sanitizeMarkdownHtml.ts` |
| L-2 | 🟡 Faible | ✅ **Corrigé** | `server/routes/self-root.ts` |
| L-3 | 🟡 Faible | ⏳ **Reporté** | Amélioration SAST maison (non bloquant) |
| L-4 | 🟡 Faible | ✅ **Corrigé** | `package.json` |

---

## 1. Synthèse initiale

| Sévérité | Nombre de constats |
|---|---|
| 🔴 Élevée | 3 |
| 🟠 Moyenne | 4 |
| 🟡 Faible | 4 |
| 🔵 Informative / bonne pratique confirmée | 5 |

Le code montre une **maturité sécurité réelle** : validation Zod systématique, sanitisation HTML par allowlist DOM (pas de regex fragile), protection anti-SSRF avec liste d'hôtes/IP privées bloqués, garde-fous de non-démarrage en écoute réseau ouverte sans jeton, rate limiting, chiffrement authentifié AES-256-GCM. Les points ci-dessous sont donc surtout des **durcissements** plutôt que des failles béantes, à l'exception du modèle d'authentification par défaut qui mérite une attention particulière compte tenu de l'accès shell complet exposé par l'application.

---

## 2. Constats détaillés et corrections appliquées

### 🔴 H-1 — Authentification désactivée par défaut ✅ Corrigé

**Fichiers :** `server/security.ts`, `server.ts`, `server/routes/terminal.ts`

**Problème initial :** `authenticateRequest()` et `authenticateToken()` retournaient `{ ok: true }` **sans vérification** dès lors que `Leanna_API_TOKEN` n'était pas défini. Cette API expose un **WebSocket terminal donnant un shell interactif complet**, la lecture/écriture de fichiers, l'exécution `git`, etc.

**Correction appliquée :**
- Ajout de `ensureApiToken()` dans `server/security.ts` : génère automatiquement un token cryptographiquement fort (32 octets, base64url, 256 bits) au premier démarrage si `Leanna_API_TOKEN` est absent ou vide.
- Le token généré est persisté dans `.env` et rechargé dans `process.env` pour la session courante.
- `server.ts` appelle désormais `ensureApiToken()` au démarrage — le token est **toujours** défini avant le premier traitement de requête.
- Les anciens avertissements permissifs (`AVERTISSEMENT SÉCURITÉ : Aucun token`) ont été remplacés par un message de confirmation (`✓ API authentication is enabled`).
- `Leanna_API_TOKEN` est maintenant documenté dans `.env.example`.

---

### 🔴 H-2 — Jeton WebSocket transmis en paramètre d'URL ✅ Corrigé

**Fichier :** `server/routes/terminal.ts`, `src/hooks/useTerminal.ts`

**Problème initial :** Le token était lu via `url.searchParams.get('token')` — visible dans les logs serveur/proxy, l'historique navigateur et les en-têtes `Referer`.

**Correction appliquée :**
- **Côté serveur** (`terminal.ts`) : le token est lu selon une priorité de 3 sources sécurisées :
  1. Cookie `Leanna_token` (httpOnly, déjà posé par `server.ts`)
  2. En-tête `Sec-WebSocket-Protocol` (format `"token, <valeur>"`)
  3. En-tête `X-Leanna-Token` (fallback)
  Le paramètre d'URL `?token=` n'est plus lu.
- **Côté client** (`useTerminal.ts`) : la fonction `getTerminalWebSocketUrl()` ne prend plus de paramètre token. La connexion est établie avec `new WebSocket(url, ['token', tokenValue])`, ce qui transmet le token via `Sec-WebSocket-Protocol`.
- Le test e2e `websocket.e2e.test.ts` a été mis à jour en conséquence.

---

### 🔴 H-3 — `execFile(..., { shell: true })` réintroduit un risque d'injection ✅ Corrigé

**Fichiers :** `server/skills/project.ts`, `server/skills/verify.ts`, `server/utils/checkpoint.ts`, `server/utils/sandbox.ts`, `server/mcp/McpClient.ts`

**Problème initial :** `shell: true` passé à `execFile` réintroduit l'interprétation shell sur tous les arguments, annulant la protection native d'`execFile`.

**Correction appliquée :**
- **`project.ts`** : `shell` est maintenant `process.platform === 'win32'` — actif uniquement sur Windows pour `npm.cmd`/`npx.cmd`.
- **`verify.ts`** : option `shell: isWin` pour les appels `npm`/`npx` ; `shell: false` explicite pour les appels `node` (binaire natif).
- **`checkpoint.ts`** : `shell: isWin` avec variable `npxBin` résolue selon la plateforme (`npx.cmd` vs `npx`).
- **`sandbox.ts`** : même correction — `shell: isWin`.
- **`McpClient.ts`** : `shell` activé uniquement si la commande se termine par `.cmd`/`.bat` ou est `npx`/`uvx` sur Windows.
- **`server/security.ts`** : ajout des fonctions utilitaires `sanitizeCommandArgument()` (allowlist de caractères) et `validateSafePath()` (rejet des métacaractères shell), disponibles pour toute validation future.

---

### 🟠 M-1 — Clé de chiffrement dérivée d'informations non secrètes ✅ Corrigé

**Fichier :** `server/utils/crypto.ts`

**Problème initial :** `getMasterKey()` dérivait la clé AES-256-GCM depuis `hostname + platform + username`, avec `Leanna_MASTER_KEY` optionnel. Sans cette variable, le chiffrement était une simple obfuscation.

**Correction appliquée :**
- Remplacement de `getMasterKey()` par `ensureMasterKey()` : génère une clé aléatoire de 32 octets (base64) si `Leanna_MASTER_KEY` est absent ou invalide.
- La clé est persistée dans `.env`, mise en cache en mémoire (`cachedMasterKey`) pour éviter les lectures disque répétées.
- Fallback `deriveMachineKey()` (ancienne logique) uniquement si la génération/persistance échoue complètement (environnement restreint).
- `Leanna_MASTER_KEY` documenté dans `.env.example` avec avertissement de sauvegarde.

---

### 🟠 M-2 — Protection anti-SSRF contournable par DNS rebinding ✅ Corrigé

**Fichier :** `server/skills/automationHelpers.ts`

**Problème initial :** `isPrivateIp()` ne vérifiait que la chaîne d'hôte littérale. Un domaine public résolvant vers une IP privée (DNS rebinding) contournait totalement le contrôle.

**Correction appliquée :**
- `assertSafeUrl()` est maintenant `async`.
- Ajout de `resolveAndCheckIp()` : effectue une résolution DNS complète (`dns.lookup(..., { all: true })`), puis vérifie **chaque adresse IP résolue** contre la liste de blocage des plages privées/loopback.
- Si une IP résolue est privée, la navigation est bloquée avec un message explicite mentionnant l'adresse réelle.
- `automationBrowser.ts` mis à jour avec `await assertSafeUrl(...)`.
- Les tests `automationHelpers.test.ts` convertis en `async` et enrichis de cas couvrant les IP littérales privées (127.x, 192.168.x).

---

### 🟠 M-3 — Client FTP acceptant tout hôte sans restriction ✅ Corrigé

**Fichier :** `server/routes/ftp.ts`

**Problème initial :** `host`/`port` validés uniquement pour leur forme via Zod. Le client FTP pouvait être utilisé comme proxy pour sonder un réseau interne.

**Correction appliquée :**
- Ajout de `validateFtpHost()` dans `ftp.ts` : même logique de blocage que `automationHelpers.ts` (IP privées + résolution DNS).
- Validation appliquée sur les 4 endpoints sensibles : `POST /test`, `POST /download`, `POST /push`, `POST /list`.
- Réponse `403` avec message explicatif en cas de blocage.
- Variable d'opt-in `ALLOW_FTP_PRIVATE_IPS=true` pour les déploiements internes légitimes, documentée dans `.env.example`.

---

### 🟠 M-4 — Comparaison non constante du code sandbox ✅ Corrigé

**Fichier :** `server/routes/sandbox.ts`

**Problème initial :** `code !== exitCode` — comparaison directe de chaînes, sensible aux attaques par timing. Entropie de seulement 10⁶ possibilités (6 chiffres).

**Correction appliquée :**
- Ajout de `verifyExitCode()` : utilise `crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))` — temps de comparaison constant quelle que soit la valeur.
- Ajout d'un **rate limiter dédié** (`checkExitCodeRateLimit` / `resetExitCodeRateLimit`) :
  - Fenêtre : 3 tentatives par minute par IP.
  - Blocage : 15 minutes après dépassement, avec message indiquant le délai restant.
  - Réponse `429 Too Many Requests` lors du blocage.
- Appliqué aux 4 points de vérification : `verify-exit-code` (dans `createSandboxRouter`), `deactivate`, `reset`, et `createVerifyExitCodeRouter`.

---

### 🟡 L-1 — Attribut `style` dans le sanitizer HTML ✅ Corrigé

**Fichier :** `src/utils/sanitizeMarkdownHtml.ts`

**Problème initial :** `span: new Set(['style', 'class'])` — l'attribut `style` permettait de l'injection CSS (exfiltration via sélecteurs, mise en page trompeuse).

**Correction appliquée :**
- `ALLOWED_ATTRIBUTES` mis à jour : `span: new Set(['class'])` — `style` retiré.
- Commentaire de justification sécurité ajouté dans le code.

---

### 🟡 L-2 — `git rev-list` avec interpolation shell ✅ Corrigé

**Fichier :** `server/routes/self-root.ts` (l. ~65)

**Problème initial :** `execSync(\`git rev-list ... origin/${gitBranch}...HEAD\`)` — interpolation de `gitBranch` dans une chaîne shell.

**Correction appliquée :**
- Remplacement par `execFileSync('git', ['rev-list', '--left-right', '--count', \`origin/${gitBranch}...HEAD\`])` — les arguments sont dans un tableau, Node les transmet directement à `git` sans interprétation shell.

---

### 🟡 L-3 — Faux positifs du SAST maison ⏳ Reporté

**Fichier :** `security-audit-report.md`

**Statut :** Non corrigé dans ce cycle. L'amélioration du SAST vers une analyse AST (vs pattern-matching texte) est identifiée comme dette technique à traiter séparément. Recommandation : intégrer Semgrep ou ESLint security plugin en CI pour compenser.

---

### 🟡 L-4 — Absence de vérification des dépendances tierces ✅ Corrigé

**Portée :** `package.json`

**Correction appliquée :**
- Ajout de deux scripts dans `package.json` :
  - `npm run audit:deps` → `npm audit --production` (dépendances de production uniquement)
  - `npm run audit:deps:full` → `npm audit` (toutes les dépendances)
- Ces scripts doivent être exécutés régulièrement et intégrés en CI/CD.

---

## 3. Points positifs confirmés (inchangés)

- **Path traversal :** `resolveWorkspacePath()` (server/security.ts) utilise `path.resolve` + vérification `startsWith(root + sep)` — pattern correct.
- **Sanitisation HTML :** allowlist DOM réelle, retrait systématique des `on*`, validation des schémas `href` (blocage `javascript:`, `data:`, `vbscript:`, `file:`).
- **Rendu Mermaid :** `securityLevel: 'strict'` explicitement configuré.
- **Protection SSRF de base :** blocage des IP privées/loopback et métadonnées cloud (AWS/GCP/Alibaba) — désormais renforcé par résolution DNS (M-2).
- **Chiffrement en transit des secrets :** AES-256-GCM avec IV aléatoire, rétrocompatibilité CBC gérée proprement.
- **Validation d'entrée systématique :** middleware Zod générique (`validateBody`) cohérent sur les routes.
- **Rate limiting :** plusieurs profils de limiteurs (`express-rate-limit`) par type de route, avec rate limiter sandbox dédié (nouveau — M-4).

---

## 4. Plan d'action — état d'avancement

| Priorité | Action | Statut |
|---|---|---|
| 1 | Rendre l'authentification obligatoire par défaut (H-1) | ✅ Fait |
| 2 | Faire transiter le jeton WebSocket hors de l'URL (H-2) | ✅ Fait |
| 3 | Éliminer ou conditionner `shell: true` (H-3) | ✅ Fait |
| 4 | Rendre `Leanna_MASTER_KEY` obligatoire (M-1) | ✅ Fait |
| 5 | Corriger le contournement DNS rebinding SSRF (M-2) | ✅ Fait |
| 6 | Durcir FTP (M-3) et `timingSafeEqual` sandbox (M-4) | ✅ Fait |
| 7 | Retirer `style` de la liste blanche HTML (L-1) et fix `self-root.ts` (L-2) | ✅ Fait |
| 8 | Réduire faux positifs SAST (L-3) | ⏳ Reporté (dette technique) |
| 8 | Lancer `npm audit` régulièrement (L-4) | ✅ Scripts ajoutés |

---

## 5. Variables d'environnement de sécurité (état après corrections)

| Variable | Obligatoire | Comportement si absente | Ajoutée/modifiée |
|---|---|---|---|
| `Leanna_API_TOKEN` | Oui (effectif) | Générée automatiquement au 1er démarrage | ✅ v2 |
| `Leanna_MASTER_KEY` | Oui (effectif) | Générée automatiquement au 1er démarrage | ✅ v2 |
| `SANDBOX_EXIT_CODE` | Oui pour quitter le sandbox | Sandbox ne peut pas être désactivé | Inchangé |
| `Leanna_LISTEN_HOST` | Non | `127.0.0.1` par défaut | Inchangé |
| `ALLOW_FTP_PRIVATE_IPS` | Non | `false` — IP privées FTP bloquées | ✅ v2 |
| `AUTOMATION_ALLOWED_DOMAINS` | Non | Mode permissif (toute URL publique) | Inchangé |

---

## 6. Limites de cet audit (inchangées)

- Analyse **statique uniquement** : aucune exécution du serveur, aucun test d'intrusion dynamique, aucune preuve d'exploitation (PoC) réalisée.
- **Pas d'audit des dépendances** — à combler via `npm run audit:deps` (scripts ajoutés).
- L'audit couvre le code applicatif ; il ne couvre pas la configuration de déploiement réelle (reverse proxy, pare-feu, durcissement OS, gestion des secrets en production).
