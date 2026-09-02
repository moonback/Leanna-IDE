# Audit complet — Jarvis OS (Leanna IDE)

**Date :** 2 septembre 2026
**Périmètre :** dump complet du dépôt fourni (`output.md`), 544 fichiers extraits et analysés individuellement (serveur Express/TypeScript ~86 800 lignes, frontend React/Vite ~65 800 lignes, Electron, scripts, schémas Supabase).
**Type d'audit :** revue de code statique manuelle (SAST) + relecture d'architecture + vérification croisée des corrections d'un audit de sécurité précédent déjà présent dans le dépôt (`audit-securite-jarvis-os.md`, v2 du 2 septembre 2026).
**Non couvert :** exécution de l'application, tests d'intrusion dynamiques (DAST), `npm audit` (aucun accès réseau dans cet environnement).

---

## 1. Résumé exécutif

Jarvis OS / *Leanna* est un IDE piloté par des agents IA avec un **shell interactif complet**, accès système de fichiers, navigateur automatisé (Puppeteer), client FTP, client MCP, exécution `git`/`npm`, et — point notable — la **capacité de modifier son propre code source** (auto-édition, "SELF_IDE"). C'est une surface d'attaque native très élevée par construction ; l'important est de vérifier le cloisonnement, pas l'absence de pouvoir.

**Constat général :** le code montre une maturité sécurité réelle et supérieure à la moyenne pour ce type de projet — validation Zod systématique, sanitisation HTML par allowlist DOM, anti-SSRF avec résolution DNS, chiffrement authentifié AES-256-GCM, génération automatique de secrets forts au premier démarrage, redaction des secrets dans les logs, RLS Supabase avec policies restreintes au `service_role` uniquement, garde-fous d'auto-édition (checkpoints, confirmation sur fichiers critiques). Un audit de sécurité antérieur (v2) a déjà corrigé 9 des 11 constats qu'il avait soulevés ; **j'ai vérifié dans le code actuel que ces corrections sont bien en place** (section 4).

Ce nouvel audit complet, portant sur l'ensemble du dépôt (y compris des modules non couverts par l'audit v2 : runtime v2, notebooks, marketplace, live socket, exports), identifie **2 constats de sécurité résiduels/nouveaux (sévérité faible à moyenne)** et une série de **constats de qualité de code / dette technique** qui n'affectent pas la sécurité immédiate mais méritent un plan de traitement.

| Sévérité | Nombre de nouveaux constats |
|---|---|
| 🟠 Moyenne | 1 |
| 🟡 Faible | 1 |
| 🔵 Qualité / dette technique | 6 |
| 🟢 Bonnes pratiques confirmées | 9 |

---

## 2. Vue d'ensemble de l'architecture

- **Backend** : Express + TypeScript (`server/`), ~87 modules routeurs sous `server/routes/`, orchestration d'agents (`server/agents/`), moteur de connaissance/AST (`server/knowledge/`), notebooks type NotebookLM (`server/notebooks/`), système "skills" (outils appelables par le LLM, `server/skills/`), un second système d'exécution en coexistence (`server/runtime/` — "Runtime V2"), pont MCP (`server/mcp/`), sandbox d'exécution isolée avec code de sortie (`server/utils/sandbox.ts`).
- **Frontend** : React 19 + Vite, éditeur Monaco, ~140 composants `.tsx`.
- **Desktop** : Electron (`electron/main.cjs`, `preload.cjs`).
- **Persistance** : Supabase (Postgres) pour conversations, mémoires, listes, workflows, custom skills, tâches planifiées ; fichiers JSON locaux pour profil/registre marketplace.
- **IA** : Google Gemini (`@google/genai`), OpenRouter en option.
- **Particularité structurante** : l'application peut **lire, écrire et committer son propre code source** (dossier `SELF_ROOT`), avec un mécanisme de sandbox/checkpoint/rollback dédié — c'est un choix produit assumé (IDE auto-évolutif), mais cela élève structurellement l'enjeu de sécurité de chaque route fichier/terminal/git.

---

## 3. Vérification des corrections de l'audit précédent (v2)

Le dépôt contient déjà un audit de sécurité (`audit-securite-jarvis-os.md`) documentant 11 constats (3 élevés, 4 moyens, 4 faibles) et leurs corrections. J'ai **relu le code source réel** (pas seulement le document) pour vérifier chaque correction revendiquée :

| ID | Constat | Statut vérifié dans le code actuel |
|---|---|---|
| H-1 | Authentification désactivée par défaut | ✅ **Confirmé corrigé.** `ensureApiToken()` génère un token 256 bits au démarrage (`server/security.ts:105`), appelé dans `server.ts:347`. `requireAuth` est maintenant monté globalement sur `/api` (`server.ts:464`, avec commentaire explicite du bugfix), plus seulement sur quelques routes. |
| H-2 | Jeton WebSocket dans l'URL | ⚠️ **Partiellement corrigé** — voir constat 🟠 M-5 ci-dessous : le endpoint `/terminal` est bien corrigé, mais `/live` et `/sandbox-watch` acceptent encore un fallback par paramètre d'URL. |
| H-3 | `shell: true` sur `execFile` | ✅ **Confirmé corrigé.** Conditionné à `process.platform === 'win32'` dans `project.ts`, `verify.ts`, `checkpoint.ts`, `sandbox.ts`, `McpClient.ts`. |
| M-1 | Clé de chiffrement dérivable | ✅ **Confirmé corrigé.** `ensureMasterKey()` génère 32 octets aléatoires si absent. |
| M-2 | SSRF / DNS rebinding | ✅ **Confirmé corrigé.** `assertSafeUrl()` est `async` et résout le DNS avant de vérifier les IP. |
| M-3 | FTP sans restriction d'hôte | ✅ **Confirmé corrigé.** `validateFtpHost()` présent, appliqué sur les 4 endpoints sensibles. |
| M-4 | Comparaison non constante (sandbox) | ✅ **Confirmé corrigé.** `crypto.timingSafeEqual` utilisé dans `server/routes/sandbox.ts:110`, avec rate limiter dédié. |
| L-1 | `style` autorisé dans le sanitizer HTML | ✅ **Confirmé corrigé.** `span: new Set(['class'])` — `style` retiré. |
| L-2 | `git rev-list` avec interpolation shell | ✅ **Confirmé corrigé** dans `self-root.ts` (usage `execFileSync` avec tableau d'arguments). |
| L-3 | Faux positifs du SAST maison | ⏳ Reporté (assumé, dette technique documentée). |
| L-4 | Pas de vérification des dépendances | ✅ Scripts `audit:deps` / `audit:deps:full` ajoutés à `package.json` (à exécuter en CI — non exécutable ici, pas d'accès réseau). |

**Conclusion de cette section :** les corrections revendiquées sont réelles et bien implémentées, à une exception près (H-2, partiellement rouverte par des endpoints qui n'existaient peut-être pas encore lors de l'audit v2, ou qui n'ont pas été alignés).

---

## 4. Nouveaux constats de sécurité (audit complet)

### 🟠 M-5 — Jeton transmis en paramètre d'URL pour `/live` et `/sandbox-watch`

**Fichier :** `server.ts` (gestionnaire `server.on('upgrade', ...)`, ~ligne 710-730)

**Problème :** contrairement à `/terminal` (corrigé en H-2), les upgrades WebSocket vers `/live` (session vocale/vidéo Gemini Live) et `/sandbox-watch` (surveillance sandbox) lisent le token avec :
```ts
const token = cookies['Leanna_token'] || url.searchParams.get('token');
```
Le cookie httpOnly est prioritaire, mais le **fallback par paramètre d'URL reste actif**. Si le cookie n'est pas encore posé (première connexion, client tiers, ou Electron avec cookie-jar différent), le token peut se retrouver dans l'URL — donc potentiellement dans les logs du serveur/reverse proxy, l'historique de navigation, et l'en-tête `Referer` si une redirection JS mal formée l'expose.

**Impact :** faible en usage normal (application locale mono-utilisateur), mais devient pertinent dès que `Leanna_LISTEN_HOST` est exporté pour un accès LAN — configuration explicitement documentée comme possible dans le code (`server.ts` avertit déjà de ce cas).

**Recommandation :** répliquer le pattern déjà utilisé pour `/terminal` — lire uniquement le cookie httpOnly ou l'en-tête `Sec-WebSocket-Protocol`, retirer le fallback `url.searchParams.get('token')` pour `/live` et `/sandbox-watch`.

---

### 🟡 L-5 — Comparaison de token non constante dans `authenticateRequest` / `authenticateToken`

**Fichier :** `server/security.ts` (lignes ~24 et ~89)

**Problème :** la comparaison du token API se fait par égalité stricte :
```ts
if (token === configuredToken) { return { ok: true }; }
```
Le constat M-4 de l'audit précédent avait identifié ce même type de faille sur le code de sortie sandbox et l'avait corrigée avec `crypto.timingSafeEqual`, mais la comparaison du token API principal — protégeant l'accès au shell complet — n'a pas reçu le même traitement.

**Impact :** faible en pratique (le token fait 256 bits, l'attaque par timing sur un serveur local/Node avec event-loop est difficile à exploiter à distance), mais c'est une incohérence par rapport au niveau d'exigence déjà appliqué ailleurs dans le même fichier.

**Recommandation :** utiliser `crypto.timingSafeEqual` (avec égalisation de longueur au préalable, comme déjà fait dans `sandbox.ts`) pour `authenticateRequest` et `authenticateToken`.

---

### 🔵 Observations mineures (informatif, pas de correction requise dans l'immédiat)

- **`testCrashSkill.ts`** (`server/skills/`) est un outil de test destiné à valider l'auto-guérison ; il n'est pas dangereux en lui-même (il ne fait que lever une erreur contrôlée), mais s'il est exposé comme "skill" appelable par le LLM en production, vérifier qu'il est bien exclu du registre en dehors de l'environnement de développement/test.
- **Mismatch de documentation `.env.example`** : le code référence `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY` (`src/utils/supabaseClient.ts`, `src/services/supabase.ts`) mais `.env.example` ne documente que `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`. Sans impact sécurité (les policies RLS bloquent déjà tout accès non `service_role`), mais source de confusion en configuration.

---

## 5. Points positifs confirmés (bonnes pratiques)

1. **Path traversal** : `resolveWorkspacePath()` / `resolveRequestedPath()` / `resolveRequestedWritePath()` utilisés de façon cohérente sur **tous** les endpoints fichiers de `server/routes/ide.ts` (lecture, écriture, création, suppression, rename, copy) — aucun `path.join` avec entrée utilisateur non validée trouvé ailleurs dans le dépôt.
2. **Sanitisation HTML** : les 7 usages de `dangerouslySetInnerHTML` dans le frontend passent tous par `sanitizeMarkdownHtml()` (allowlist DOM, retrait des `on*`, blocage `javascript:`/`data:`/`vbscript:`) sauf le rendu Mermaid qui utilise `securityLevel: 'strict'` — cohérent et vérifié composant par composant.
3. **RLS Supabase** : toutes les tables (`conversations`, `memories`, `lists`, `workflows`, `custom_skills`, `scheduled_tasks`) ont `ENABLE ROW LEVEL SECURITY` et des policies limitées au rôle `service_role` uniquement — le frontend utilise la clé `anon`, qui n'a donc **aucun accès direct**, même en cas de fuite de clé anon.
4. **Redaction des secrets dans les logs** : `server/utils/logger.ts` applique des regex de redaction sur les clés API, tokens, formats `sk-…`, `AIza…`, JWT (`eyJ…`).
5. **Marketplace / custom skills = données, pas de code exécutable** : les "skills" installables sont des instructions structurées (JSON/texte), passées dans un pipeline de détection de patterns dangereux (`eval`, `child_process`, `sudo`/`rm -rf`, prompt injection) et marquées explicitement "untrusted" avant d'être injectées dans le prompt — pas de `require()` dynamique de code tiers.
6. **Puppeteer** : `--no-sandbox` uniquement activé hors production (`NODE_ENV !== 'production'`), pas en usage par défaut.
7. **Écoute réseau** : le serveur écoute sur `127.0.0.1` par défaut ; un avertissement explicite est loggé si `Leanna_LISTEN_HOST=0.0.0.0` est utilisé volontairement.
8. **Export de fichiers** (`server/routes/export.ts`) : les noms de fichiers fournis par l'utilisateur sont assainis (`replace(/[^a-zA-Z0-9_-]/g, '_')`) avant usage dans les en-têtes `Content-Disposition` — pas d'écriture sur disque avec un chemin arbitraire.
9. **Traçabilité** : `appendAuditEvent()` est appelé systématiquement sur les opérations fichiers sensibles (écriture, création, suppression, rename), donnant une piste d'audit exploitable a posteriori.

---

## 6. Qualité de code et dette technique

Ces constats n'ont pas d'impact sécurité direct mais affectent la maintenabilité, la fiabilité et la capacité à détecter des régressions :

| Constat | Mesure | Commentaire |
|---|---|---|
| Usage de `any` | **960 occurrences** dans `.ts`/`.tsx` | Le `tsconfig.json` a pourtant `"strict": true` et `"noImplicitAny": true` — ces `any` explicites contournent la vérification de type et masquent des bugs potentiels, notamment aux frontières API (routes Express, réponses LLM). |
| Blocs `catch` silencieux | **119 occurrences** (`catch { /* ignore */ }` ou équivalent) | Beaucoup sont justifiés (lecture de fichier optionnelle, cache best-effort), mais cette densité rend difficile la distinction entre "échec attendu" et "échec masqué" — risque de bugs silencieux, y compris de sécurité (ex. une validation qui échoue silencieusement). |
| Ratio de tests | 56 fichiers `.test.ts` pour 430 fichiers `.ts`/`.tsx` hors tests (~13 %) | Correct pour les modules critiques audités (sécurité, checkpoint, sandbox, delegation) mais clairement partiel sur l'ensemble du frontend (peu de tests `.tsx` visibles) et sur les nouveaux modules `server/runtime/`. |
| Deux systèmes d'agents en coexistence | `server/agents/` (legacy) + `server/runtime/` ("Runtime V2", monté sous `/api/v2/agents`) | Dette d'architecture assumée ("coexistence") mais à surveiller : deux chemins de code pour une même responsabilité augmentent la surface de bugs et rendent l'audit de sécurité plus coûteux à maintenir dans le temps (toute future vérification doit couvrir les deux). |
| `L-3` reporté | SAST maison basé sur pattern-matching texte (`verify.ts`, `MarketplaceRegistry.ts`) | Toujours contournable par obfuscation simple (concaténation de chaînes, `String.fromCharCode`, etc.). Recommandation déjà notée dans l'audit v2 : intégrer Semgrep ou `eslint-plugin-security` en CI plutôt que de maintenir un moteur de règles maison. |
| Fichiers volumineux | `MarketplaceRegistry.ts` (991 lignes), plusieurs routeurs `notebooks/*` | Pas bloquant, mais plusieurs fichiers dépassent 800-1000 lignes, ce qui complique la revue de code et la testabilité unitaire. |

---

## 7. Dépendances (revue statique, sans `npm audit`)

34 dépendances de production, versions globalement récentes et actives en septembre 2026 : `express ^4.21.2`, `zod ^3.25.76`, `ws ^8.21.0`, `puppeteer ^25.3.0`, `@google/genai ^2.4.0`, `react ^19.0.1`, `express-rate-limit ^8.6.0`. Aucune version manifestement obsolète ou connue pour une faille critique n'a été repérée à l'inspection. **Cet audit ne remplace pas `npm audit` / `npm audit --production`** (scripts déjà présents dans `package.json`, à exécuter en CI avec accès réseau — non réalisable dans cet environnement sandboxé sans accès Internet).

---

## 8. Plan d'action priorisé

| Priorité | Action | Effort estimé |
|---|---|---|
| 1 | Aligner `/live` et `/sandbox-watch` sur le pattern déjà utilisé pour `/terminal` (retirer le fallback `?token=` dans l'URL) — M-5 | Faible (quelques lignes, pattern déjà écrit ailleurs dans le dépôt) |
| 2 | Passer `authenticateRequest`/`authenticateToken` sur `crypto.timingSafeEqual` — L-5 | Faible |
| 3 | Exécuter `npm run audit:deps:full` en CI dès qu'un environnement avec accès réseau est disponible, et intégrer Semgrep / `eslint-plugin-security` pour réduire la dépendance au SAST maison (L-3, reporté depuis l'audit v2) | Moyen |
| 4 | Réduire la dette `any` sur les frontières critiques (routes Express, réponses des skills/LLM) en priorité — pas besoin de traiter les 960 occurrences d'un coup | Élevé (à étaler) |
| 5 | Auditer/documenter la coexistence `server/agents/` vs `server/runtime/` : clarifier lequel est la cible à terme, éviter la double maintenance de logiques de sécurité (validation, sandboxing) | Moyen |
| 6 | Vérifier que `testCrashSkill` n'est pas exposé en production | Faible |
| 7 | Aligner `.env.example` avec les variables Supabase réellement utilisées côté client (`SUPABASE_ANON_KEY`) | Faible |

---

## 9. Limites de cet audit

- **Analyse statique uniquement** : aucune exécution du serveur, aucun test d'intrusion dynamique, aucune preuve d'exploitation (PoC).
- **Pas d'accès réseau** : `npm audit` non exécuté ; à lancer séparément via les scripts déjà présents dans `package.json`.
- Couvre le code applicatif du dépôt fourni ; ne couvre pas la configuration de déploiement réelle (reverse proxy éventuel, pare-feu, durcissement OS, gestion des secrets en production, politique de mise à jour des dépendances).
- Le dépôt étant volumineux (544 fichiers, ~180 000 lignes cumulées avec assets/configuration), l'analyse a combiné une lecture exhaustive du code source ciblée sur les zones à risque (authentification, exécution de commandes, accès fichiers, réseau sortant, secrets, rendu HTML) et une recherche automatisée par motifs (`eval`, `exec`, `dangerouslySetInnerHTML`, secrets en dur, `shell: true`, etc.) sur l'intégralité du code TypeScript/TSX. Les modules non explicitement cités dans ce rapport (ex. certains composants UI purement présentatifs) n'ont pas fait l'objet d'une revue ligne à ligne complète.
