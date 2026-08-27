# 🧭 Task — Amélioration de la navigation internet de l’assistant (Leanna)

> **Objectif** : Transformer la navigation web de l’assistant d’une interaction basique (lecture textuelle + clics approximatifs) vers une **perception fine et une interaction précise**, avec persistance des sessions, téléchargement de fichiers, captures d’écran, et une architecture adaptative conciliant vitesse et richesse.

---

## 📋 Table des matières

- [Contexte](#-contexte)
- [Principes directeurs](#-principes-directeurs)
- [1. Découverte et sélection robuste des éléments](#1-découverte-et-sélection-robuste-des-éléments)
- [2. Robustesse et gestion des erreurs](#2-robustesse-et-gestion-des-erreurs)
- [3. Nouvelles actions primitives](#3-nouvelles-actions-primitives)
- [4. Captures d’écran et analyse visuelle](#4-captures-décran-et-analyse-visuelle)
- [5. Téléchargement de fichiers](#5-téléchargement-de-fichiers)
- [6. Cookies et sessions persistantes](#6-cookies-et-sessions-persistantes)
- [7. Contexte adaptatif (vitesse ↔ richesse)](#7-contexte-adaptatif-vitesse--richesse)
- [8. Planification proactive et raisonnement](#8-planification-proactive-et-raisonnement)
- [9. Plan d’implémentation détaillé](#9-plan-dimplantation-détaillé)
- [10. Critères d’acceptation globaux](#10-critères-dacceptation-globaux)
- [11. Dépendances et prérequis](#11-dépendances-et-prérequis)
- [12. Suivi et métriques](#12-suivi-et-métriques)

---

## 🧭 Contexte

L’assistant dispose actuellement de deux couches de navigation :
- **`browserSkill`** – pilote le navigateur intégré visible par l’utilisateur (IPC / BrowserPanel).
- **`automationSkill`** – utilise Puppeteer headless pour des actions automatisées.

Cependant, comme documenté dans `browser-interaction-limits.md`, l’assistant manque de **perception visuelle** et d’**interaction précise** (clics sur des éléments dynamiques, saisie dans des formulaires complexes, etc.). Il est également incapable de **télécharger des fichiers**, de **capturer des écrans**, ou de **conserver des sessions** entre les conversations.

---

## 🎯 Principes directeurs

1. **Perception augmentée** → l’assistant voit et comprend l’interface comme un humain.
2. **Interaction précise** → sélecteurs stables, actions vérifiées.
3. **Persistance** → sessions, cookies, téléchargements sauvegardés.
4. **Adaptativité** → mode rapide (texte) ou riche (vision) selon le contexte.
5. **Fiabilité** → retry, fallback, validation post-action.
6. **Extensibilité** → nouvelles actions ajoutées sans refonte.

---

## 1. Découverte et sélection robuste des éléments

**Problème** : `browser_snapshot` utilise des sélecteurs CSS heuristiques (id, classe, data-testid) qui échouent sur des interfaces dynamiques ou peu sémantiques.

**Solution** : Utiliser l’arbre d’accessibilité (Accessibility Tree) du navigateur.

### Tâches

| ID | Tâche | Fichiers concernés | Priorité |
|----|-------|-------------------|----------|
| 1.1 | Ajouter `browser_get_accessibility_snapshot` (frontend) | `BrowserPanel.tsx` | Haute |
| 1.2 | Ajouter le handler backend pour `browser_get_accessibility_snapshot` | `browser.ts`, `LiveSocketHandler.ts` | Haute |
| 1.3 | Ajouter `browser_click_by_role` et `browser_type_by_label` | `browser.ts`, `BrowserPanel.tsx` | Haute |
| 1.4 | Remplacer l’usage de `browser_snapshot` par `browser_get_accessibility_snapshot` dans le prompt | `browser.md` | Moyenne |

### Détails techniques

- **Frontend (`BrowserPanel.tsx`)** :
  - Utiliser `window.getComputedAccessibleNode()` ou l’API `getAccessibleName`.
  - Retourner un JSON structuré : `{ role, name, states, selector }`.
- **Backend** :
  - Nouvel outil avec paramètres `role` et `name` pour les interactions.

### Critère d’acceptation
- [ ] L’assistant peut cliquer sur un bouton identifié uniquement par son rôle et son nom accessible sur une page dynamique (ex: React SPA).
- [ ] Le snapshot retourne au moins 90% des éléments interactifs (vs < 60% actuellement).

---

## 2. Robustesse et gestion des erreurs

**Problème** : Les actions échouent sur les pages SPA (chargement différé) ou après des changements de DOM. Les retries sont limités et non configurables.

**Solution** : Mécanismes d’attente intelligente, retry avec backoff, validation post-action.

### Tâches

| ID | Tâche | Fichiers concernés | Priorité |
|----|-------|-------------------|----------|
| 2.1 | Ajouter un paramètre `waitFor` (selector, text, networkIdle) à toutes les actions | `browser.ts`, `BrowserPanel.tsx` | Haute |
| 2.2 | Wrapper les actions avec un retry exponentiel (max 3 tentatives) | `browser.ts` (helper `runBrowserActionWithRetry`) | Haute |
| 2.3 | Ajouter une validation post-action (changement détectable) | `BrowserPanel.tsx` (callback `result` avec `changed`) | Moyenne |
| 2.4 | Fallback automatique vers Puppeteer si le navigateur visible est indisponible | `browser.ts` (vérification `emitIdeAction`) | Basse |

### Détails techniques

- **`waitFor`** : l’assistant peut appeler `browser_navigate({ url, waitFor: "#results" })`.
- **Retry** : 1er essai immédiat, 2e après 1s, 3e après 3s.
- **Validation** : retourner `{ success: true, changed: { url: true, elementAppeared: true } }`.

### Critère d’acceptation
- [ ] Une action sur une page SPA (ex: recherche Google) réussit dans 95% des cas après retry.
- [ ] L’assistant peut attendre l’apparition d’un élément avant de continuer.

---

## 3. Nouvelles actions primitives

**Objectif** : Couvrir les besoins courants de navigation (formulaires, menus, fichiers, etc.).

### Tâches

| ID | Tâche | Fichiers concernés | Priorité |
|----|-------|-------------------|----------|
| 3.1 | `browser_get_element_text(selector)` | `browser.ts`, `BrowserPanel.tsx` | Haute |
| 3.2 | `browser_get_element_attribute(selector, attribute)` | Idem | Haute |
| 3.3 | `browser_fill_form(selector, value)` (avec effacement préalable) | Idem | Haute |
| 3.4 | `browser_select_option(selector, value)` (pour `<select>`) | Idem | Haute |
| 3.5 | `browser_upload_file(selector, filePath)` (fichier depuis la sandbox) | `browser.ts`, `BrowserPanel.tsx`, `main.cjs` | Haute |
| 3.6 | `browser_wait_for(condition)` (générique) | `browser.ts`, `BrowserPanel.tsx` | Haute |
| 3.7 | `browser_get_page_state()` (URL, title, cookies, localStorage) | `browser.ts`, `BrowserPanel.tsx` | Moyenne |
| 3.8 | `browser_click_by_coordinates(x, y)` (pour les cas sans sélecteur) | `browser.ts`, `BrowserPanel.tsx` | Basse |

### Détails techniques

- **`browser_fill_form`** : efface le champ (`value = ''`), puis saisit caractère par caractère (pour déclencher les événements `input`/`change`).
- **`browser_upload_file`** : le chemin est relatif à la sandbox ; le fichier est lu et injecté dans l’input `type="file"`.
- **`browser_wait_for`** : supporte `selector`, `text`, `url` (pattern), `timeout`.

### Critère d’acceptation
- [ ] L’assistant peut remplir un formulaire complet (nom, email, sélection, upload) sans intervention humaine.
- [ ] Les nouvelles actions sont documentées dans le prompt `browser.md`.

---

## 4. Captures d’écran et analyse visuelle

**Objectif** : Permettre à l’assistant de « voir » la page et d’analyser des éléments visuels (graphiques, mise en page, erreurs) via Gemini Vision.

### Tâches

| ID | Tâche | Fichiers concernés | Priorité |
|----|-------|-------------------|----------|
| 4.1 | Implémenter `browser_screenshot` (viewport, fullpage, selector) | `BrowserPanel.tsx` (capture), `browser.ts` (skill) | Haute |
| 4.2 | Intégrer la capture avec `reasoning_think` (via `geminiParts`) | `reasoning.ts`, `browser.ts` | Haute |
| 4.3 | Ajouter un cache LRU des analyses visuelles (TTL 10 min) | `browser.ts` | Moyenne |
| 4.4 | Ajouter l’option `browser_get_context({ richness: "visual" })` | `browser.ts` | Moyenne |

### Détails techniques

- **Capture** : utiliser `webContents.capturePage()` dans `main.cjs` (via IPC).
- **Vision** : l’assistant peut appeler `reasoning_think({ prompt, geminiParts: [ { inlineData: { mimeType: "image/png", data: base64 } } ] })`.
- **Cache** : clé = `sha256(pageUrl + question)`, valeur = { description, confidence }.

### Critère d’acceptation
- [ ] L’assistant peut décrire un graphique ou une capture d’écran.
- [ ] La réponse visuelle est obtenue en moins de 4 secondes (cache inclus).

---

## 5. Téléchargement de fichiers

**Objectif** : L’assistant peut sauvegarder un fichier (PDF, image, document) depuis une URL ou un lien cliqué, directement dans la **sandbox** du projet.

### Tâches

| ID | Tâche | Fichiers concernés | Priorité |
|----|-------|-------------------|----------|
| 5.1 | Intercepter `will-download` dans `main.cjs` | `main.cjs` | Haute |
| 5.2 | Ajouter `browser_download_file({ url, selector, filename })` | `browser.ts`, `BrowserPanel.tsx` | Haute |
| 5.3 | Gérer le chemin de destination (sandbox/downloads/) | `browser.ts`, `electron/main.cjs` | Haute |
| 5.4 | Ajouter un retour de progression (éventuellement via WebSocket) | `browser.ts`, `LiveSocketHandler.ts` | Basse |

### Détails techniques

- **`will-download`** : dans `main.cjs`, écouter l’événement sur la webview, demander au backend le chemin de destination via IPC.
- **`browser_download_file`** : si `selector` est fourni, extraire le `href` ; sinon utiliser `url`. Télécharger et sauvegarder dans `.jarvis/sandbox/downloads/`.
- Le fichier apparaît automatiquement dans l’explorateur de fichiers de l’IDE.

### Critère d’acceptation
- [ ] L’assistant peut télécharger un PDF depuis un lien sur une page web.
- [ ] Le fichier est accessible dans l’explorateur de fichiers du projet.

---

## 6. Cookies et sessions persistantes

**Objectif** : Maintenir les sessions de connexion entre les sessions de l’assistant.

### Tâches

| ID | Tâche | Fichiers concernés | Priorité |
|----|-------|-------------------|----------|
| 6.1 | Persistance JSON des cookies `.jarvis/browser-session.json` | `browser.ts`, `main.cjs` | Haute |
| 6.2 | Restaurer les cookies au démarrage du navigateur | `main.cjs` (webContents.session.cookies.set) | Haute |
| 6.3 | Sauvegarder les cookies à la fermeture du navigateur | `main.cjs` (webContents.session.cookies.get) | Haute |
| 6.4 | Ajouter `browser_get_cookies` et `browser_set_cookie` | `browser.ts`, `BrowserPanel.tsx` | Moyenne |
| 6.5 | Option de nettoyage des cookies (via `browser_clear_cookies`) | `browser.ts`, `BrowserPanel.tsx` | Basse |

### Détails techniques

- **Fichier** : `.jarvis/browser-session.json` (à côté des notebooks).
- **Restoration** : lors de `browser_navigate` ou `browser_open`, charger les cookies.
- **Sauvegarde** : à chaque `browser_close` ou changement de projet.
- **Gestion multi-projets** : un fichier de session par projet (ou partagé selon le choix utilisateur).

### Critère d’acceptation
- [ ] L’assistant reste connecté à un site (ex: Gmail) après un redémarrage de l’application.
- [ ] Les cookies sont correctement exportés et importés.

---

## 7. Contexte adaptatif (vitesse ↔ richesse)

**Objectif** : Proposer un seul outil `browser_get_context` qui s’adapte au besoin, avec trois niveaux de richesse.

### Tâches

| ID | Tâche | Fichiers concernés | Priorité |
|----|-------|-------------------|----------|
| 7.1 | Définir les trois modes : `lite`, `standard`, `visual` | `browser.ts` | Haute |
| 7.2 | Implémenter `browser_get_context` | `browser.ts`, `BrowserPanel.tsx` | Haute |
| 7.3 | Détection automatique du mode dans le prompt (via `analyzeComplexity`) | `chainOfThought.ts`, `browser.md` | Moyenne |
| 7.4 | Cache LRU des analyses visuelles | `browser.ts` | Moyenne |

### Détails techniques

- **`lite`** → retourne uniquement l’URL et le titre.
- **`standard`** → retourne texte + snapshot + liens (comportement actuel de `browser_read_content` + `browser_get_links`).
- **`visual`** → ajoute une capture d’écran, une analyse rapide via Vision (si la page a changé), et fusionne le tout.
- La détection automatique utilise la complexité de la question (`assessComplexity`).

### Critère d’acceptation
- [ ] L’appel à `browser_get_context({ richness: "visual", question: "Que montre ce graphique ?" })` retourne une réponse structurée avec l’analyse visuelle.
- [ ] Le mode `lite` est utilisé pour les questions factuelles simples (gain de temps visible).

---

## 8. Planification proactive et raisonnement

**Objectif** : Permettre à l’assistant de planifier une séquence d’actions pour des tâches complexes (ex: « réserve-moi un billet de train »).

### Tâches

| ID | Tâche | Fichiers concernés | Priorité |
|----|-------|-------------------|----------|
| 8.1 | Créer `browser_plan_action(goal)` qui retourne un plan JSON | `browser.ts`, `reasoning.ts` | Moyenne |
| 8.2 | Intégrer l’exécution du plan avec validation à chaque étape | `browser.ts`, `mission/index.ts` | Moyenne |
| 8.3 | Ajouter un historique de navigation (pour apprentissage) | `browser.ts` (historique en mémoire) | Basse |

### Détails techniques

- **Planification** : utiliser `reasoning_think` pour décomposer l’objectif en étapes (ex: "1. Aller sur SNCF Connect", "2. Remplir origine/destination", "3. Cliquer sur Rechercher", etc.).
- **Exécution** : chaque étape est une action `browser_*`. Si une étape échoue, replanifier.
- **Historique** : stocker les actions réussies pour les réutiliser (similarité de contexte).

### Critère d’acceptation
- [ ] L’assistant peut exécuter une séquence de 4 à 5 actions sans intervention humaine.
- [ ] En cas d’échec, il propose une alternative ou demande une clarification.

---

## 9. Plan d’implémentation détaillé

### Sprint 1 — Fondations (J1–J4)

| Jour | Tâches |
|------|--------|
| J1 | **Découverte robuste** : `browser_get_accessibility_snapshot`, `browser_click_by_role`, `browser_type_by_label` |
| J2 | **Robustesse** : `waitFor`, retry avec backoff, validation post-action |
| J3 | **Nouvelles actions** : `browser_get_element_text`, `browser_get_element_attribute`, `browser_fill_form`, `browser_select_option` |
| J4 | **Tests & documentation** de ces nouvelles actions dans `browser.md` |

### Sprint 2 — Persistance & captures (J5–J8)

| Jour | Tâches |
|------|--------|
| J5 | **Cookies & sessions** : persistance JSON, chargement/restauration, `browser_get_cookies` / `browser_set_cookie` |
| J6 | **Téléchargement** : handler `will-download`, `browser_download_file` |
| J7 | **Captures** : `browser_screenshot` (viewport/fullpage/selector), intégration avec `reasoning_think` |
| J8 | **Cache visuel** : LRU des analyses, tests de performance |

### Sprint 3 — Adaptation & planification (J9–J12)

| Jour | Tâches |
|------|--------|
| J9 | **Contexte adaptatif** : `browser_get_context` avec modes `lite/standard/visual` |
| J10 | **Détection automatique du mode** via `assessComplexity` |
| J11 | **Planification** : `browser_plan_action` et exécution pas-à-pas |
| J12 | **Intégration finale** : mise à jour du prompt `browser.md`, tests E2E, polishing |

---

## 10. Critères d’acceptation globaux

- [ ] L’assistant peut naviguer sur un site SPA (ex: React) et interagir avec tous les éléments (boutons, champs, menus) sans erreur de sélecteur.
- [ ] L’assistant peut rester connecté à un site (ex: Gmail) après un redémarrage de l’application.
- [ ] L’assistant peut télécharger un fichier depuis une page web et le retrouver dans l’explorateur de fichiers.
- [ ] L’assistant peut décrire visuellement le contenu d’une capture d’écran (graphique, image).
- [ ] Les actions simples (lecture de texte) sont exécutées en < 1 seconde.
- [ ] Les actions complexes (vision) sont exécutées en < 4 secondes (cache inclus).
- [ ] Toutes les nouvelles actions sont documentées dans `browser.md` et accessibles via l’outil `browser_get_context`.

---

## 11. Dépendances et prérequis

| Dépendance | Version | Statut |
|------------|---------|--------|
| Node.js | ≥ 22.12.0 | ✅ |
| Electron | 43.x | ✅ |
| Gemini API (Vision) | gemini-2.5-flash | ✅ |
| Puppeteer | 25.x | ✅ (fallback) |
| Supabase (optionnel) | – | ❌ (non requis) |

**Configuration nécessaire** :
- `GEMINI_API_KEY` dans `.env` pour la vision.
- **Aucune** configuration supplémentaire pour les cookies/téléchargements.

---

## 12. Suivi et métriques

Pour valider l’amélioration, nous suivrons ces métriques pendant et après le déploiement :

| Métrique | Cible | Méthode de mesure |
|----------|-------|-------------------|
| Taux de succès des clics sur SPA | > 95% | Logs des actions avec `success` |
| Temps moyen de réponse pour une question factuelle | < 1.5 s | Tracing des appels `browser_get_context` |
| Temps moyen pour une analyse visuelle | < 4 s | Idem |
| Nombre d’échecs de sélecteurs | < 5% | Logs `selector not found` |
| Taux d’utilisation du cache visuel | > 40% | Statistiques LRU |
| Satisfaction utilisateur (feedback) | > 4.5/5 | Sondage intégré |

---

## 📎 Annexe : Modifications attendues par fichier

| Fichier | Modifications |
|---------|---------------|
| `server/skills/browser.ts` | +12 nouveaux outils, helper `runBrowserActionWithRetry`, intégration vision |
| `server/skills/reasoning.ts` | Ajout du support `geminiParts` pour la vision |
| `server/skills/chainOfThought.ts` | Détection automatique du mode `visual` |
| `server/live/LiveSocketHandler.ts` | Ajout des nouvelles actions (si nécessaire) |
| `server/runtime/prompts/browser.md` | Documentation complète des nouveaux outils |
| `src/components/ide/BrowserPanel.tsx` | Handlers pour toutes les nouvelles actions, snapshot accessible, capture |
| `electron/main.cjs` | Handler `will-download`, gestion des cookies |
| `src/hooks/useLiveAPI.ts` | Extension du switch pour les nouvelles actions |

---

> **Prochaine étape** : Démarrer par le **Sprint 1** (fondations) pour valider l’approche. 