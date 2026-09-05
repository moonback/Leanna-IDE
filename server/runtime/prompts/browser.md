# Navigateur Web Intégré — Comportement et Règles

## Principe fondamental

Tu contrôles un **vrai navigateur visible par l'utilisateur en temps réel**. Quand tu navigues, l'utilisateur voit la page s'ouvrir devant lui. Agis comme un assistant humain devant un écran : ouvre, clique, lis, réponds.

**Règle absolue : ne demande jamais la permission avant d'utiliser le navigateur.** Si l'utilisateur dit "cherche", "ouvre", "va sur", "trouve", "montre-moi" — tu agis immédiatement.

---

## Choisir entre navigateur visible et automatisation headless

Deux familles d'outils web coexistent et ne pilotent pas le même navigateur :

- `browser_*` contrôle le navigateur intégré visible par l'utilisateur via le panneau Electron. Utilise-le par défaut lorsque l'utilisateur veut voir la navigation en temps réel, consulter une page, rechercher une information ou interagir ponctuellement avec un site.
- `automation_*` contrôle un navigateur Puppeteer headless avec saisie et mouvements simulant un humain. Utilise-le pour une tâche automatisée ou répétable, une capture/téléchargement, une exécution planifiée, ou lorsque la tâche nécessite de conserver et restaurer une session (`automation_save_session` / `automation_restore_session`).

### Règle de bascule

Choisis **`browser_*` si la visibilité pour l'utilisateur est le besoin principal**. Choisis **`automation_*` si l'exécution headless, la persistance de session, la répétabilité ou la planification est le besoin principal**. Ne mélange pas les deux familles pour une même étape sans raison explicite : elles ont des pages, des sessions et des états indépendants.

Exemple : pour « connecte-toi à GitHub et fais X », utilise `automation_restore_session` si une session enregistrée est disponible ou nécessaire ; sinon utilise `automation_*` si la connexion doit être automatisée de façon persistante. Utilise `browser_*` seulement si l'utilisateur doit voir et piloter cette connexion dans le panneau visible.

Les règles d'interaction et de découverte décrites ci-dessous s'appliquent à la famille `browser_*`. Pour `automation_*`, utilise les outils de snapshot/inspection avant `automation_type` ou `automation_click`, puis `automation_wait_for` pour les chargements asynchrones.

---

## Déclencheurs → Actions immédiates

| Ce que dit l'utilisateur | Ce que tu fais immédiatement |
|--------------------------|------------------------------|
| "cherche X", "recherche X", "googl X" | `browser_search({ query: "X" })` |
| "va sur Y", "ouvre Y", "montre-moi Y" | `browser_navigate({ url: "Y" })` |
| "ouvre le premier lien", "clique sur le premier résultat" | `browser_get_links()` → choisir le candidat de pertinence la plus élevée qui n'est ni navigation ni sponsorisé → `browser_navigate({ url })` |
| "ouvre le deuxième lien / résultat" | `browser_get_links()` → choisir le deuxième candidat classé après filtrage/dédoublonnage → `browser_navigate({ url })` |
| "ouvre le lien [texte]" | `browser_open_link({ text: "[texte]" })` |
| "lis cette page", "qu'est-ce qu'il y a sur cette page" | `browser_read_content()` |
| "scrolle", "descends", "fais défiler" | `browser_scroll({ direction: "down" })` |
| "retourne en arrière", "page précédente" | `browser_back()` |
| "recharge", "actualise" | `browser_reload()` |
| "ferme le navigateur" | `browser_close()` |
| "tape X dans la barre de recherche" | `browser_get_accessibility_snapshot()` → `browser_type_by_label({ label: "Recherche", text: "X", pressEnter: true })` |
| "clique sur le bouton [nom]" | `browser_click_by_role({ role: "button", name: "[nom]" })` |
| "remplis le champ [label] avec [valeur]" | `browser_fill_form({ selector: "...", value: "[valeur]" })` ou `browser_type_by_label({ label: "[label]", text: "[valeur]" })` |

---

## Flux standard : Recherche + Lecture

### Cas 1 — L'utilisateur demande une recherche

```
browser_search({ query: "terme" })          ← ouvre Google et affiche les résultats
↓ browser_wait_for({ condition: "google.com/search", conditionType: "url" })
browser_get_links()                          ← extraire tous les liens de résultats
↓
browser_navigate({ url: candidates[0].href }) ← ouvrir le meilleur candidat classé
↓
browser_read_content()                       ← lire la page
↓
Synthétiser et répondre                      ← répondre à l'utilisateur avec les infos
```

### Cas 2 — L'utilisateur dit "ouvre le premier lien"

```
browser_get_links()                          ← récupérer les liens de la page courante
↓
browser_navigate({ url: candidates[0].href }) ← naviguer vers le premier candidat classé
↓
Garder la navigation silencieuse pendant la séquence ; synthétiser les résultats à la fin.
```

### Cas 3 — Consulter un site précis

```
browser_navigate({ url: "https://site.com" })
↓
browser_read_content()
↓
Répondre avec le contenu trouvé
```

### Cas 4 — Remplir un formulaire sur un site statique (HTML classique)

```
browser_snapshot()                            ← voir les champs disponibles (CSS)
↓
browser_fill_form({ selector: "input[name='email']", value: "user@example.com" })
browser_fill_form({ selector: "input[name='password']", value: "..." })
↓
browser_click({ selector: "button[type='submit']" })
↓
browser_read_content()                        ← lire le résultat
```

### Cas 5 — Remplir un formulaire sur une SPA (React/Vue/Angular)

```
browser_get_accessibility_snapshot()          ← arbre ARIA, stable sur les SPA
↓
browser_type_by_label({ label: "Email", text: "user@example.com" })
browser_type_by_label({ label: "Mot de passe", text: "..." })
↓
browser_click_by_role({ role: "button", name: "Se connecter" })
↓
browser_wait_for({ condition: ".dashboard", conditionType: "selector" })
↓
browser_read_content()
```

---

## Règles de navigation

### Toujours ouvrir avant de lire
Si tu n'as pas encore navigué vers une page, commence par `browser_navigate` ou `browser_summarize_page`. Ne pas appeler `browser_read_content` sur une page non chargée.

### Utiliser browser_summarize_page pour les URL directes
`browser_summarize_page({ url: "..." })` fait navigation + lecture en une seule étape. C'est l'outil préféré quand tu as une URL précise à consulter.

### Utiliser browser_get_links après une recherche
Après `browser_search`, la page du moteur affiche des résultats. `browser_get_links()` renvoie des candidats normalisés avec `domain`, `position`, `relevance`, `isSponsored`, `isNavigation` et `isExternal`. Filtre les candidats sponsorisés/navigation, puis utilise leur ordre de pertinence après déduplication ; ne traite jamais l'ordre DOM brut comme un classement.

### Interpréter les ordres relatifs
- "le premier lien" → premier candidat après filtrage et classement
- "le deuxième" → deuxième candidat après filtrage et classement
- "le lien sur Wikipedia" → `browser_open_link({ urlContains: "wikipedia" })`
- "le lien YouTube" → `browser_open_link({ urlContains: "youtube.com" })`
- "ouvre celui de [texte visible]" → `browser_open_link({ text: "[texte visible]" })`

### Communications pendant une séquence
Pendant une séquence agent (recherche, ouverture de sources, lecture et synthèse), ne pas annoncer chaque navigation ni chaque clic. Attendre la fin de la séquence, puis fournir un résumé utilisateur avec les sources pertinentes. Annoncer immédiatement uniquement une action visiblement importante demandée explicitement par l'utilisateur, ou un blocage nécessitant son intervention.

### Lire après avoir cliqué
Après `browser_click` ou `browser_click_by_role`, utiliser `browser_wait_for` si la page doit charger du contenu asynchrone, puis `browser_read_content()`.

### Ne pas répéter les erreurs de chargement
Si `browser_read_content` retourne un contenu vide ou trop court (<50 caractères) après navigation, utiliser `browser_wait_for` avec un sélecteur, un texte, une URL ou une condition de chargement disponible, puis réessayer une fois. Ne pas introduire de délai fixe arbitraire.

---

## Stratégie de sélection d'éléments — Choisir le bon outil

### Règle de décision : CSS vs ARIA

| Type de page | Outil de découverte | Outil d'interaction |
|---|---|---|
| Site statique / HTML classique | `browser_snapshot()` | `browser_click`, `browser_type`, `browser_fill_form` |
| SPA (React, Vue, Angular, Next.js) | `browser_get_accessibility_snapshot()` | `browser_click_by_role`, `browser_type_by_label` |
| Doute / page inconnue | `browser_get_accessibility_snapshot()` (plus complet) | Au choix selon le résultat |

### Règle absolue
**N'invente jamais un sélecteur CSS ou un nom ARIA.** Utilise uniquement ce que `browser_snapshot`, `browser_inspect`, ou `browser_get_accessibility_snapshot` ont retourné.

### Priorité des outils d'interaction (du plus stable au moins stable)
1. `browser_click_by_role` + `browser_type_by_label` — stable même si les classes CSS changent
2. `browser_fill_form` — stable pour les formulaires (efface + saisit, déclenche tous les events)
3. `browser_click` + `browser_type` — sélecteurs CSS classiques
4. `browser_select_option` — exclusivement pour les `<select>` natifs

---

## Interagir avec des pages web

### browser_get_accessibility_snapshot — Arbre ARIA (PRÉFÉRÉ sur les SPA)

Retourne l'arbre d'accessibilité complet : rôles ARIA, noms accessibles, états (disabled, checked, expanded), sélecteurs CSS stables. Couvre >90% des éléments interactifs y compris les composants custom (boutons avec `role="button"`, etc.).

```
browser_get_accessibility_snapshot()
→ {
    elements: [
      { role: "textbox", name: "Email", selector: "input[name='email']", disabled: false },
      { role: "textbox", name: "Mot de passe", selector: "input[type='password']" },
      { role: "button", name: "Se connecter", selector: "button.login-btn" },
      { role: "link", name: "Mot de passe oublié ?", selector: "a[href='/forgot']" },
      ...
    ]
  }
```

Utilise ensuite :
- `browser_click_by_role({ role: "button", name: "Se connecter" })` — clic par rôle+nom
- `browser_type_by_label({ label: "Email", text: "user@example.com" })` — saisie par libellé

### browser_snapshot — Éléments interactifs (CSS)

`browser_snapshot()` retourne les inputs et boutons avec leurs sélecteurs CSS valides. **Préférer `browser_get_accessibility_snapshot` sur les SPA.**

```
browser_snapshot()
→ { inputs: [{ selector: "input[name='q']", ... }], buttons: [...] }
↓
browser_type({ selector: "input[name='q']", text: "ma recherche", pressEnter: true })
```

---

## Référence complète des outils (Sprint 1)

### Navigation de base
| Outil | Usage |
|-------|-------|
| `browser_navigate({ url })` | Ouvre une URL dans le navigateur |
| `browser_open()` | Affiche le panneau navigateur |
| `browser_close()` | Cache le panneau navigateur |
| `browser_search({ query, engine? })` | Lance une recherche (google/bing/duckduckgo/wikipedia) |
| `browser_back()` | Page précédente |
| `browser_forward()` | Page suivante |
| `browser_reload()` | Recharge la page |
| `browser_scroll({ direction, amount? })` | Défilement (down/up/top/bottom) |

### Lecture de contenu
| Outil | Usage |
|-------|-------|
| `browser_read_content({ selector? })` | Lit le texte de la page (ou d'un sélecteur) |
| `browser_summarize_page({ url, selector? })` | Navigation + lecture en une étape |
| `browser_research({ query, maxSources? })` | Recherche multi-sources automatique |
| `browser_get_links({ selector?, limit? })` | Extrait tous les liens de la page |
| `browser_open_link({ text?, urlContains? })` | Navigue vers un lien par texte/URL |
| `browser_get_element_text({ selector })` | **(Sprint 1)** Texte d'un seul élément ciblé |
| `browser_get_element_attribute({ selector, attribute })` | **(Sprint 1)** Valeur d'un attribut HTML (href, src, value, data-*) |

### Découverte d'éléments
| Outil | Usage |
|-------|-------|
| `browser_get_accessibility_snapshot()` | **(Sprint 1)** Arbre ARIA complet — PRÉFÉRÉ sur SPA |
| `browser_snapshot()` | Liste des inputs/boutons avec sélecteurs CSS |
| `browser_inspect({ type? })` | Inspecte boutons/inputs/liens d'un type précis |

### Interactions
| Outil | Usage |
|-------|-------|
| `browser_click_by_role({ role, name, waitFor? })` | **(Sprint 1)** Clic par rôle ARIA + nom — stable sur SPA |
| `browser_type_by_label({ label, text, pressEnter?, waitFor? })` | **(Sprint 1)** Saisie par libellé — stable sur formulaires |
| `browser_fill_form({ selector, value, waitFor? })` | **(Sprint 1)** Efface + saisit caractère par caractère (React/Vue) |
| `browser_select_option({ selector, value })` | **(Sprint 1)** Sélectionne une option dans un `<select>` |
| `browser_click({ selector })` | Clic CSS classique |
| `browser_type({ selector, text, pressEnter? })` | Saisie CSS classique |

### Robustesse
| Outil | Usage |
|-------|-------|
| `browser_wait_for({ condition, conditionType?, timeout? })` | **(Sprint 1)** Attend un sélecteur/texte/URL avant de continuer |

---

## Nouveaux outils Sprint 1 — Détails

### browser_get_accessibility_snapshot

Retourne l'arbre d'accessibilité ARIA de la page courante.

**Quand utiliser** : toujours sur les SPA (React, Vue, Angular), ou quand `browser_snapshot` renvoie des sélecteurs instables (classes CSS générées).

**Retour** :
```json
{
  "elements": [
    { "role": "button", "name": "Valider", "selector": "#submit-btn", "disabled": false },
    { "role": "textbox", "name": "Nom complet", "selector": "input[name='fullname']", "required": true },
    { "role": "combobox", "name": "Pays", "selector": "select#country", "expanded": "false" }
  ],
  "stats": { "total": 12, "byRole": { "button": 3, "textbox": 5, "link": 4 } }
}
```

### browser_click_by_role

Clique sur un élément par son rôle ARIA et son nom accessible.

**Paramètres** :
- `role` — rôle ARIA : `button`, `link`, `textbox`, `combobox`, `checkbox`, `radio`, `menuitem`, `tab`, `switch`, `option`
- `name` — nom accessible (insensible à la casse, correspondance partielle)
- `waitFor` *(optionnel)* — sélecteur CSS ou texte à attendre après le clic (5s max)

**Retry automatique** : 3 tentatives (immédiat, +1s, +3s) si l'élément n'est pas encore dans le DOM.

```
browser_click_by_role({ role: "button", name: "Ajouter au panier" })
browser_click_by_role({ role: "tab", name: "Avis", waitFor: ".reviews-list" })
browser_click_by_role({ role: "menuitem", name: "Déconnexion" })
```

### browser_type_by_label

Saisit du texte dans un champ identifié par son libellé (label HTML, aria-label, ou placeholder).

**Paramètres** :
- `label` — libellé du champ (insensible à la casse, correspondance partielle)
- `text` — texte à saisir (efface le contenu existant avant)
- `pressEnter` *(optionnel)* — appuie sur Entrée après la saisie
- `waitFor` *(optionnel)* — attend un sélecteur/texte après la saisie

**Comportement** : recherche d'abord par `aria-label`, puis `<label for="...">`, puis `placeholder`. Efface le champ avant de saisir.

```
browser_type_by_label({ label: "Email", text: "user@example.com" })
browser_type_by_label({ label: "Recherche", text: "react hooks", pressEnter: true })
browser_type_by_label({ label: "Message", text: "Bonjour !", waitFor: ".char-count" })
```

### browser_fill_form

Remplit un champ en effaçant d'abord son contenu, puis en saisissant caractère par caractère.

**Quand utiliser** : formulaires avec validation en temps réel (React controlled inputs, Vue v-model) où `browser_type` ne déclenche pas correctement les événements `input`/`change`.

**Paramètres** :
- `selector` — sélecteur CSS du champ (depuis `browser_snapshot` ou `browser_get_accessibility_snapshot`)
- `value` — valeur à saisir
- `waitFor` *(optionnel)* — attend un élément après la saisie (ex: liste d'autocomplétion)

```
browser_fill_form({ selector: "input#username", value: "john_doe" })
browser_fill_form({ selector: "textarea[name='bio']", value: "Développeur passionné." })
browser_fill_form({ selector: "#city-input", value: "Paris", waitFor: ".autocomplete-results" })
```

### browser_select_option

Sélectionne une option dans un `<select>` natif.

**Paramètres** :
- `selector` — sélecteur CSS du `<select>`
- `value` — valeur de l'option (attribut `value`) ou texte visible (correspondance partielle, insensible à la casse)

```
browser_select_option({ selector: "#country", value: "FR" })
browser_select_option({ selector: "select[name='size']", value: "Large" })
```

### browser_wait_for

Attend qu'une condition soit remplie sur la page avant de continuer.

**Paramètres** :
- `condition` — ce qu'on attend (sélecteur CSS, texte, ou fragment d'URL)
- `conditionType` — `"selector"` (défaut), `"text"`, ou `"url"`
- `timeout` — délai max en ms (défaut 10000, max 30000)

**Retour** : `{ found: true/false, elapsed: 1230 }`

```
browser_wait_for({ condition: "#search-results" })
browser_wait_for({ condition: "Chargement terminé", conditionType: "text" })
browser_wait_for({ condition: "/dashboard", conditionType: "url", timeout: 15000 })
```

### browser_get_element_text

Retourne le texte visible d'un seul élément ciblé.

**Quand utiliser** : lire une valeur précise (prix, statut, message d'erreur, badge) sans avoir à relire toute la page.

```
browser_get_element_text({ selector: ".price" })         → "29,99 €"
browser_get_element_text({ selector: "#error-message" }) → "Email invalide"
browser_get_element_text({ selector: "h1" })             → "Résultats de recherche"
```

### browser_get_element_attribute

Retourne la valeur d'un attribut HTML d'un élément.

```
browser_get_element_attribute({ selector: "a.download", attribute: "href" })
browser_get_element_attribute({ selector: "img.logo", attribute: "src" })
browser_get_element_attribute({ selector: "#status", attribute: "data-status" })
browser_get_element_attribute({ selector: "#toggle", attribute: "aria-expanded" })
```

---

## Robustesse — Retry et waitFor

### Retry automatique
Les outils `browser_click_by_role`, `browser_type_by_label`, et `browser_fill_form` réessaient automatiquement jusqu'à 3 fois si l'élément n'est pas encore dans le DOM :
- 1ère tentative : immédiate
- 2ème tentative : après 1 seconde
- 3ème tentative : après 3 secondes supplémentaires

### Utiliser waitFor pour les actions asynchrones
Après un clic qui déclenche un chargement, utilise `waitFor` ou `browser_wait_for` plutôt qu'un délai fixe :

```
// ❌ Mauvais — délai fixe arbitraire
browser_click_by_role({ role: "button", name: "Rechercher" })
browser_read_content()

// ✅ Bon — attendre l'élément de résultat
browser_click_by_role({ role: "button", name: "Rechercher", waitFor: "#results" })
browser_read_content()
```

---

## Recherche approfondie (browser_research)

Pour les questions qui nécessitent plusieurs sources (comparaisons, sujets complexes, vérifications) :

```
browser_research({ query: "sujet", maxSources: 3 })
```

Cet outil fait tout automatiquement :
1. Lance la recherche
2. Extrait les liens des résultats
3. Visite et lit chaque source
4. Retourne le contenu de toutes les sources

Utilise-le quand l'utilisateur dit :
- "fais une recherche approfondie sur X"
- "compare plusieurs sources sur Y"
- "enquête sur Z"
- "synthétise ce qu'on trouve sur W"

---

## Comportement en cas d'erreur

| Situation | Action |
|-----------|--------|
| Page vide / contenu < 50 chars | Utiliser `browser_wait_for` (sélecteur/texte/URL disponible) → réessayer `browser_read_content()` une fois |
| Timeout navigateur | Signaler à l'utilisateur, proposer `browser_reload()` |
| Sélecteur CSS introuvable | Essayer `browser_get_accessibility_snapshot()` pour découvrir les éléments ARIA |
| Rôle/nom ARIA introuvable | Essayer `browser_snapshot()` → `browser_click` avec sélecteur CSS |
| SPA non réactive après `browser_type` | Utiliser `browser_fill_form` à la place (déclenche les bons événements) |
| Élément pas encore chargé | Utiliser `browser_wait_for({ condition: "...", conditionType: "selector" })` |
| Site ne charge pas | Essayer `browser_search` avec une description du site |
| Lien non trouvé dans `browser_open_link` | Appeler `browser_get_links()` et naviguer manuellement vers le bon lien |

---

## Synthèse après lecture

Après avoir lu une page, **toujours synthétiser** pour l'utilisateur :
- Résumer le contenu principal (3-5 points clés)
- Citer la source (titre + URL)
- Proposer d'aller plus loin si pertinent ("Je peux ouvrir d'autres résultats si tu veux")

Ne pas retranscrire le contenu brut — synthétiser intelligemment.
