# 🧪 Guide de test manuel — Module Notebooks

Ce guide explique **comment tester toi-même, dans l'application**, chaque correctif
apporté au module Notebooks (serveur + routes + frontend). Il couvre les bugs
critiques, les problèmes moyens et l'harmonisation du client HTTP.

> Chaque section indique : **ce qui a été corrigé**, **comment le reproduire dans
> l'UI**, et **comment vérifier** que c'est bon (UI, fichiers disque, ou DevTools).

---

## 0. Préparation

### Démarrer l'application

```bash
# À la racine du projet
npm install          # si pas déjà fait
npm run dev          # démarre le serveur (tsx server-bootstrap.ts)
```

- Serveur backend : `http://127.0.0.1:4000` (port défini par `VITE_SERVER_PORT`).
- Ouvre l'app dans ton navigateur (ou la fenêtre Electron si tu lances `npm run desktop`).
- Variables d'environnement utiles dans `.env` :
  - `OPENROUTER_API_KEY` + `OPENROUTER_EMBEDDING_MODEL` → requis pour embeddings, chat, génération.
  - `GITHUB_TOKEN` → requis pour l'import de dépôts privés (optionnel pour les publics).

### Outils de vérification

- **DevTools navigateur** (onglet *Network*) → inspecter les requêtes `/api/notebooks/...`.
- **Explorateur de fichiers** → inspecter les dossiers de persistance :
  - Notebooks : `.Leanna/notebooks/*.json`
  - Embeddings : `.Leanna/notebooks/embeddings/*.json`
  - Backups : `.Leanna/notebooks/backups/`
  - Sandbox (infographies, exports) : `.Leanna/sandbox/`

### Où regarder dans l'app

1. Ouvre le module **Notebooks**.
2. Crée un notebook de test et ajoute **au moins 2 sources** (voir §3) : la plupart
   des fonctions (chat, génération, insights) exigent des sources.

---

## 1. 🔴 Fuite de navigateur Puppeteer (ingestion URL)

**Corrigé :** le navigateur headless est maintenant fermé dans un `finally`, même si
le chargement de la page échoue → plus de processus Chrome zombie.

**Tester :**
1. Dans un notebook, ajoute une source de type **URL**.
2. Teste 3 cas :
   - URL valide (ex. une page d'article de blog).
   - URL qui timeout / invalide (ex. `https://example.invalid/page`).
   - URL très lente.

**Vérifier :**
- La source valide s'ingère normalement (texte extrait, résumé généré).
- Pour l'URL invalide : un message d'erreur propre, **pas de blocage**.
- **Gestionnaire des tâches / `tasklist`** : après plusieurs essais ratés, aucun
  processus `chrome.exe` / `chromium` résiduel ne s'accumule.

```powershell
# Windows — compter les process Chrome avant/après plusieurs ingestions URL ratées
Get-Process chrome -ErrorAction SilentlyContinue | Measure-Object
```

---

## 2. 🔴 Perte d'embeddings à l'éviction mémoire (LRU)

**Corrigé :** avant d'évincer un notebook de la RAM, ses vecteurs sont écrits sur
disque de façon **synchrone** (`flushNotebookSync`). Plus de réécriture d'un index
incomplet.

**Tester (scénario de charge) :**
1. Crée plusieurs notebooks et ingère beaucoup de sources (pour dépasser le seuil
   mémoire — par défaut 50 000 vecteurs ; en test tu peux ingérer de gros PDF/dépôts).
2. Alterne les recherches/chat entre notebooks pour déclencher l'éviction LRU.

**Vérifier :**
- Les fichiers `.Leanna/notebooks/embeddings/<notebookId>.json` conservent un nombre
  de vecteurs cohérent (ils ne « rétrécissent » pas après usage d'autres notebooks).
- Après recharge d'un notebook évincé, le chat retrouve bien le contexte de ses sources
  (citations correctes).

> 💡 Test léger : ajoute une source, pose une question (le chat cite la source),
> puis redémarre le serveur et repose la même question → la citation doit revenir.

---

## 3. 🟡 Statut de l'Audio Overview (podcast) persisté

**Corrigé :** après génération du script, `generateAudioOverview` persiste
explicitement le notebook (statut `ready`/`error`) → plus de podcast « coincé » en
`generating` après un redémarrage.

**Tester :**
1. Dans un notebook avec sources, ouvre le panneau **Audio Overview**.
2. Génère un podcast (choisis ton/durée).
3. Attends la fin (statut **prêt**).
4. **Redémarre le serveur** (`Ctrl+C` puis `npm run dev`).
5. Rouvre le notebook et le panneau Audio Overview.

**Vérifier :**
- Le podcast apparaît toujours comme **prêt** (jamais revenu à « génération en cours »).
- Dans `.Leanna/notebooks/<id>.json`, l'entrée `audioOverviews[].status` vaut `"ready"`.

---

## 4. 🔴 Caches intelligents branchés (chat + invalidation)

**Corrigé :** `chatResponseCache` est maintenant lu/écrit par le chat groundé, et
invalidé quand les sources changent. Les stats de `/cache/stats` ne sont plus toujours à zéro.

**Tester le cache (hit) :**
1. Pose une question au chat d'un notebook.
2. Repose **la même question** (ou une question très proche) → la réponse doit
   revenir quasi instantanément (pas d'attente de génération LLM).

**Tester l'invalidation :**
3. **Ajoute ou supprime une source**.
4. Repose la même question → la réponse est **recalculée** (plus de hit instantané),
   car le corpus a changé.

**Vérifier (DevTools / endpoint) :**
- `GET /api/notebooks/<id>/cache/stats` renvoie des `hits` > 0 après la 2ᵉ question.
  ```
  http://127.0.0.1:4000/api/notebooks/<notebookId>/cache/stats
  ```
- Après ajout/suppression de source, les entrées du notebook sont invalidées.

---

## 5. 🔴 / 🟡 Démarrage & arrêt du backup automatique

**Corrigé :** `backupService.start()` tourne au démarrage du serveur, et
`backupService.stop()` est appelé à l'arrêt gracieux (dans `lifecycle.ts`).

**Tester :**
1. Démarre le serveur. Dans les logs tu dois voir :
   `✅ Backup automatique activé (intervalle: 30 min, max: 10 backups)`.
2. Modifie un notebook (ajoute une source), puis déclenche un backup immédiat via
   l'endpoint de backup (ou attends l'intervalle).
3. Arrête le serveur (`Ctrl+C`). Dans les logs tu dois voir :
   `[Lifecycle] BackupService arrêté.`

**Vérifier :**
- Un dossier `backup-<timestamp>/` apparaît dans `.Leanna/notebooks/backups/`
  avec les `.json` des notebooks modifiés + un `_metadata.json`.
- À l'arrêt, aucun timer de backup ne reste actif (log de confirmation).

---

## 6. 🟡 Feedback du chat persisté (pouce 👍 / 👎)

**Corrigé :** l'endpoint `POST /:id/chat/feedback` enregistre réellement le vote
(avant : stub sans effet). Validation `400` si input invalide, `404` si message introuvable.

**Tester :**
1. Dans le chat, clique 👍 ou 👎 sur une réponse de l'assistant.
2. **Redémarre le serveur** puis rouvre la conversation.

**Vérifier :**
- Le vote est toujours affiché après redémarrage.
- Dans `.Leanna/notebooks/<id>.json`, le message concerné a un champ
  `feedback: "up"` ou `"down"`.
- Cas d'erreur (via DevTools / curl) :
  - `POST /chat/feedback` sans `messageId` → **400**.
  - `messageId` inexistant → **404**.

---

## 7. 🟡 Pas de question dupliquée dans le prompt

**Corrigé :** l'historique récent est construit **avant** d'ajouter la question
courante → elle n'apparaît plus deux fois dans le prompt envoyé au LLM.

**Tester :**
1. Pose 2–3 questions de suite dans un même fil de chat.

**Vérifier :**
- Les réponses restent cohérentes et contextualisées.
- (Avancé) En activant les logs de prompt (`TOOL_LOG_TRANSCRIPT="full"`), la question
  n'apparaît qu'une seule fois (section « QUESTION DE L'UTILISATEUR »), pas aussi dans
  « HISTORIQUE RÉCENT ».

---

## 8. 🟡 Base64 des infographies hors du notebook

**Corrigé :** l'image PNG n'est plus stockée en base64 dans le JSON du notebook.
Elle est servie par `GET /:id/generated/:docId/image` depuis la sandbox.

**Tester :**
1. Génère une **Infographie** (panneau Génération → Infographie).
2. Vérifie qu'elle s'affiche bien dans la visionneuse de document.
3. Télécharge-la via le bouton **Télécharger PNG**.

**Vérifier :**
- Le fichier `.Leanna/notebooks/<id>.json` **ne contient plus** de longue chaîne
  base64 pour l'infographie — seulement `filePath`, `imageUrl`, `model`, `prompt`…
  → le fichier notebook reste léger (quelques Ko, pas plusieurs Mo).
- Le PNG existe dans `.Leanna/sandbox/infographies/`.
- Dans DevTools (Network), l'image se charge via
  `GET /api/notebooks/<id>/generated/<docId>/image` (type `image/png`).
- Sécurité : une requête image avec un chemin falsifié reste confinée à la sandbox
  (réponse 400 « Chemin d'image invalide » si tentative de traversée).

> Les anciennes infographies (générées avant le correctif) restent affichables
> grâce au repli base64.

---

## 9. 🟡 Scoring TF-IDF cohérent

**Corrigé :** le *document frequency* se calcule désormais par **tokenisation**
(comme le *term frequency*), et non plus par sous-chaîne. Fini le « cat » qui
matchait « category ».

**Tester :**
1. Ingère une source contenant des mots qui en **contiennent** d'autres
   (ex. « cat », « category », « catalogue »).
2. Pose une question ciblant précisément « cat ».

**Vérifier :**
- Les chunks réellement pertinents (contenant le **mot** « cat ») remontent mieux
  que ceux contenant seulement « category »/« catalogue ».
- Les réponses citent les bons passages.

---

## 10. 🟡 Isolation des threads de conversation

**Corrigé :** chaque **thread** a son propre contexte RAG, et les messages ne sont
plus dupliqués dans l'historique global.

**Tester :**
1. Crée **2 threads** de conversation dans le même notebook.
2. Thread A : pose des questions sur un sujet X.
3. Thread B : pose des questions sur un sujet Y.
4. Reviens au Thread A et pose une question de suivi.

**Vérifier :**
- Le Thread A ne « voit » pas les échanges du Thread B (contexte isolé).
- `GET /api/notebooks/<id>/chat/history?threadId=<A>` ne renvoie que les messages de A.
- Dans `.Leanna/notebooks/<id>.json` : les messages d'un thread sont dans
  `chatThreads[].messages` et **non** dupliqués dans `chatHistory`.

---

## 11. 🟡 Coût LLM caché des follow-ups supprimé

**Corrigé :** Deep Dive, Comparaison et Insights ne déclenchent plus d'appel LLM de
follow-ups (leur UI ne les affichait pas). Le chat principal garde les follow-ups
mais ils sont désactivables via `followUps: false`.

**Tester :**
1. Lance un **Deep Dive**, une **Comparaison** (2+ sources), des **Insights**.
2. Lance une question de **chat** normale.

**Vérifier :**
- Chat normal : les 3 suggestions de follow-up s'affichent toujours.
- Deep Dive / Comparaison / Insights : aucun appel LLM supplémentaire pour les
  follow-ups (l'événement `done` renvoie `followUps: []`).
- (Avancé) Opt-out : un `POST /chat/stream` avec `{ "followUps": false }` ne génère
  pas de follow-ups.

---

## 12. 🟡 Sanitisation du chemin « Enregistrer le message »

**Corrigé :** l'export d'un message dans la sandbox résout le chemin avec
`path.resolve` + vérification de préfixe → impossible d'écrire hors de la sandbox.

**Tester :**
1. Dans le chat, utilise **Enregistrer** sur un message, choisis un dossier normal
   (ex. `mes-notes`).
2. (Avancé) Tente un dossier malveillant via DevTools / curl :
   `{ "folder": "../../échappement" }`.

**Vérifier :**
- Cas normal : le `.md` est écrit dans `.Leanna/sandbox/mes-notes/`.
- Cas malveillant : réponse **400** « Dossier de destination invalide (hors sandbox) » ;
  aucun fichier créé en dehors de `.Leanna/sandbox/`.

---

## 13. 🟡 IDs de threads normalisés (UUID)

**Corrigé :** les threads utilisent `thread-<uuid>` (au lieu de `Date.now()`), et les
messages ont déjà des UUID. Plus de risque de collision à la milliseconde.

**Tester :**
1. Crée rapidement plusieurs threads d'affilée.

**Vérifier :**
- Dans `.Leanna/notebooks/<id>.json`, chaque `chatThreads[].id` est de la forme
  `thread-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` (UUID), tous uniques.

---

## 14. 🟡 Client HTTP frontend harmonisé

**Corrigé :** `CreateNotebookModal` et `GitHubRepositoryImportModal` utilisent
désormais le client `api()` (erreurs normalisées `ApiError`) au lieu de `fetch` brut.
Bonus : le modal GitHub ne recharge plus la liste des dépôts à chaque sélection.

**Tester — Création de notebook :**
1. Crée un notebook via le bouton **+** / modal de création.
2. Teste un cas d'erreur (ex. serveur arrêté) → message d'erreur propre via toast.

**Tester — Import GitHub :**
3. Ouvre le modal **Import GitHub**.
4. Onglet « Mes projets » : la liste se charge ; **sélectionne** plusieurs dépôts
   l'un après l'autre.
5. Onglet « Recherche » : cherche un dépôt public.
6. Onglet « Lien direct » : colle une URL `owner/repo`.
7. Configure le token GitHub (bouton clé) si besoin.
8. Lance une ingestion.

**Vérifier :**
- Création / import fonctionnent comme avant.
- **Sélectionner un dépôt dans « Mes projets » ne recharge plus toute la liste**
  (plus de clignotement / rechargement réseau superflu — vérifiable dans l'onglet
  Network : un seul `GET /api/github/repos` au lieu d'un par sélection).
- Les erreurs réseau affichent un message lisible (toast / message inline).

---

## ✅ Récapitulatif rapide

| # | Fonctionnalité | Action UI | Preuve de bon fonctionnement |
|---|----------------|-----------|------------------------------|
| 1 | Fuite Puppeteer | Ingérer URL (ok + ko) | Aucun Chrome zombie |
| 2 | Embeddings LRU | Charge multi-notebooks | Index embeddings cohérent |
| 3 | Statut podcast | Générer podcast + restart | Reste « prêt » |
| 4 | Cache chat | Reposer même question | Réponse instantanée + stats hits |
| 5 | Backup auto | Démarrer / arrêter serveur | Dossier backup + logs start/stop |
| 6 | Feedback chat | 👍/👎 + restart | `feedback` persisté dans JSON |
| 7 | Pas de doublon | Plusieurs questions | Prompt sans question dupliquée |
| 8 | Infographie | Générer infographie | JSON léger + image via endpoint |
| 9 | TF-IDF | Mots imbriqués | Bons chunks remontés |
| 10 | Threads isolés | 2 threads | Contextes séparés |
| 11 | Follow-ups | Deep dive / compare / insights | Pas d'appel LLM superflu |
| 12 | Chemin sandbox | Enregistrer message | 400 si hors sandbox |
| 13 | IDs threads | Créer threads | UUID uniques |
| 14 | Client HTTP | Créer notebook / import GitHub | Erreurs propres + pas de reload |

---

## 🔧 Vérifications techniques (facultatif)

```bash
# Vérifier que le code compile sans erreur de types
npm run typecheck

# Lancer les tests UI (vitest)
npm run test:ui

# Lancer les tests serveur
npm run test
```

> ℹ️ Il n'existe pas encore de tests automatisés dédiés au dossier
> `server/notebooks/` (chunking, TF-IDF, backup, chat). C'est une amélioration
> recommandée pour la suite — ce guide couvre la validation manuelle en attendant.
