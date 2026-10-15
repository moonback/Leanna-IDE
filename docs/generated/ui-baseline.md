# Baseline UI — avant refonte v3 (phase 0)

**Date :** 15 octobre 2026
**Commit de référence :** `98fa0ff` + feature flag `uiV3` (désactivé par défaut)
**Plan :** [PLAN_REFONTE_UI_IMMERSIVE.md](../PLAN_REFONTE_UI_IMMERSIVE.md)
**Données brutes :** [ui-baseline.json](ui-baseline.json)

---

## 1. Feature flag `uiV3`

| Élément | Emplacement |
|---------|-------------|
| Module | `src/config/featureFlags.ts` (`useFeatureFlag`, `getFeatureFlags`, `setFeatureFlag`) |
| Initialisation avant le premier rendu | `src/main.tsx` → `initFeatureFlags()` |
| Persistance | `localStorage["Leanna_feature_flags"]` |
| Override de session | `?ui=v3` ou `?ui=classic` dans l'URL |
| Hook CSS | `<html data-ui="v3">` ou `data-ui="classic"`, à cibler avec `:root[data-ui="v3"]` |
| Réglage utilisateur | Paramètres → Apparence → « Interface Cockpit (bêta) » |
| Tests | `src/config/__tests__/featureFlags.test.ts` (5 tests) |

> **Écart avec le plan :** le flag n'est pas stocké dans `useIdeSettings`, parce que ce hook est un état local à `IdeView`. Le shell v3 a besoin d'un état global lisible avant le premier rendu.

## 2. Bundle (mesuré, `npx vite build` puis `npm run ui:baseline`)

| Mesure | Brut | Gzip -9 |
|--------|-----:|--------:|
| **Bundle initial** (6 fichiers : `index.js`, `vendor-react`, `vendor-ui`, `ide-core`, `panels`, `index.css`) | 1490 kB | **348,9 kB** |
| JS total (84 chunks) | 11 337 kB | 2 762 kB |
| CSS total (3 fichiers) | 399 kB | 64 kB |
| Durée de `vite build` | 1 min 52 s | |

> **Note du 15 octobre 2026 (phase 1) :** `npm i` a resynchronisé `node_modules` avec le lockfile (mermaid 11.17.2). Le JS chargé à la demande est passé à 2 979 kB gz, avec de nouveaux diagrammes mermaid (`cynefin`, `swimlanes`). Ce changement ne vient pas de la refonte. Le bundle initial, seul soumis au budget, est mesuré à **351,6 kB gz après la phase 1** (+2,7 kB, dont environ 2,3 kB de CSS Nebula).

**Plus gros chunks (gz) :** `vendor-monaco` 934 kB · `IdeView` 226 kB · `index` 155 kB · `cytoscape` 139 kB · `tsMode` 136 kB · `mermaid.core` 123 kB.

**Budget v3 :** bundle initial ≤ **389 kB gz** (+40 kB). Le chunk 3D doit rester en lazy loading, avec au plus 450 kB gz. La vérification se fait avec `npx vite build`, puis `npm run ui:baseline -- --compare`.

**Observations utiles pour la suite :**
- `IdeView` (226 kB gz) est chargé au démarrage, puisque `/` redirige vers `/ide`. Quand le Cockpit deviendra la page d'accueil (phase 5), ce chunk pourra être chargé à la demande, ce qui libère une marge de budget.
- Le CSS initial pèse 41 kB gz. Fusionner `motion-pro.css`, `pro-polish.css` et `workspace-pro.css` en phase 1 devrait le réduire.

## 3. Audit UI existant (`npm run ui:audit`) : déjà en échec avant toute modification v3

| Règle | Budget | Actuel |
|-------|-------:|-------:|
| arbitrary text size | 0 | 7 |
| hardcoded hex | 217 | 274 |
| title tooltip | 363 | 531 |
| z index literal | 64 | 83 |
| non standard blur | 3 | 6 |
| div onclick | 3 | 4 |
| raw button | 606 | 672 |

Les modifications de la phase 0 n'introduisent aucune nouvelle violation : le réglage d'Apparence réutilise `ToggleSwitch`. La phase 1 (design system) devra résorber ces dérives. En particulier, les z-index littéraux et les flous non standard sont à tokeniser avant d'ajouter les couches de profondeur et de verre.

## 4. Mesures d'exécution : à relever sur la machine de référence

Ces mesures exigent l'application Electron lancée avec un vrai workspace. Elles n'ont pas été relevées automatiquement.

| Mesure | Protocole | Valeur |
|--------|-----------|--------|
| Temps au premier rendu / TTI | `npm run desktop:debug`, DevTools → Performance → recharger, relever LCP et la fin du long task initial | _à mesurer_ |
| CPU au repos | fenêtre visible, aucune mission, Gestionnaire des tâches Windows → processus GPU et Renderer de Leanna, moyenne sur 60 s | _à mesurer_ |
| CPU avec la fenêtre masquée | idem, fenêtre minimisée | _à mesurer_ |
| FPS de l'éditeur | DevTools → Rendering → « Frame rendering stats », défilement continu d'un fichier de 2000 lignes | _à mesurer_ |
| Mémoire après 2 h | DevTools → Memory, heap avant et après `npm run test:missions` en boucle | _à mesurer_ |
| GPU | `chrome://gpu` dans DevTools Electron : modèle, accélération WebGL2 activée | _à relever_ |
