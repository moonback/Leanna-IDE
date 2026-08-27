# Plan d'action — Design & disposition du module Notebooks

J'ai passé en revue les 12 composants (~9500 lignes) et croisé le tout avec les principes Apple. Le fondu/spring/reduced-motion est déjà bien géré dans `NotebookDetail.tsx` — le vrai chantier est ailleurs : typographie, cohérence visuelle, accessibilité clavier, et responsive.

## Constats chiffrés (scan du code)

- **233 occurrences** de texte en `text-[10px]`/`[9px]`/`[8px]`, dont **16 en 8px** et **5 en 6-7px** (`SourcesSummaryCard`, `AudioOverviewPanel`...) — en dessous du seuil de lisibilité, et en `px` fixe donc invisible aux réglages Dynamic Type du navigateur.
- **Border-radius incohérent** : `rounded-lg` (96×), `rounded-xl` (82×), `rounded-2xl` (24×), `rounded-md` (12×), `rounded-3xl` (2×) mélangés sans règle apparente de hiérarchie (carte vs bouton vs pastille).
- **Durées d'animation dispersées** : 0.1 / 0.12 / 0.15 / 0.2 / 0.25 / 0.3 / 0.35s coexistent sans grille de référence — pas de "langage de mouvement" unique.
- **Accessibilité clavier faible** : seulement **6 états `focus:`** et **11 `aria-label`** sur l'ensemble du module — la navigation clavier sera quasi invisible.
- **Rupture de layout entre breakpoints** : le rail Sources disparaît sous `lg`, le Studio disparaît sous `xl` — mais le bouton toggle Studio est visible dès `lg` (`hidden lg:flex` sur le bouton vs `hidden xl:flex` sur le panneau). Entre `lg` et `xl`, cliquer sur "Ouvrir Studio" ne montre rien : bouton mort apparent.
- **Pas d'alternative mobile/tablette** : sous `lg`, Sources et Studio sont juste masqués (`hidden`), sans tiroir/modal de repli — l'utilisateur perd des fonctionnalités entières, pas juste une mise en page dégradée (viole *Flexibilité*).

## Phase 0 — Corrections rapides (1-2 jours)

1. **Réparer le bouton Studio fantôme** : aligner les seuils (`lg:flex` partout, ou passer le panneau Studio en `Sheet`/overlay entre `lg` et `xl` au lieu de `hidden`).
2. **Remonter le texte 6-8px vers 11-12px minimum**, sauf badges/compteurs ponctuels — remplacer les `text-[Npx]` par une échelle Tailwind standard (`text-[11px]` → `text-xs`, etc.) pour hériter du zoom navigateur.
3. **Ajouter `focus-visible` systématique** sur tous les boutons icône (`notebook-icon-button`, segments, actions de carte) — actuellement quasi absent.

## Phase 1 — Système de design unifié (3-5 jours)

4. **Geler une échelle de rayons** : ex. `md`=boutons/inputs, `lg`=cartes, `full`=pastilles/avatars — puis remplacer les usages ad hoc de `2xl`/`3xl`.
5. **Geler une échelle de mouvement** en 3 valeurs seulement, conforme à la skill :
   - Défaut UI (fade, ouverture panneau) : `damping 1.0`, `response 0.3`
   - Feedback pression (`active:scale-95/90`) : CSS `100ms ease-out` (déjà correct sur les boutons)
   - Réordonner tout le reste (`0.1/0.12/0.15/0.2/0.25/0.35`) vers l'une de ces deux familles.
6. **Typographie** : définir 2 réglages de `letter-spacing`/`line-height` (titre large vs texte dense), au lieu des 3 valeurs isolées actuelles (`-0.005em`, `-0.01em`, `-0.015em` utilisées 4-6 fois seulement) — appliquer via des classes utilitaires réutilisables plutôt qu'en inline `style`.

## Phase 2 — Responsive & agentivité (3-5 jours)

7. **Sources en `lg`** : remplacer le `hidden` pur par un tiroir (`Sheet`) accessible via le bouton FileText de la navigation segmentée, déjà présent dans le header.
8. **Studio en mobile/tablette** : même traitement — un tiroir plein écran plutôt qu'une disparition silencieuse.
9. **Vérifier la règle de familiarité** : le raccourci `Ctrl+\` pour Studio n'a pas d'équivalent visible pour Sources (`Ctrl+1`) au clavier documenté dans l'UI — harmoniser l'affichage des raccourcis (déjà en `title=""`, envisager une palette de commandes ou un tooltip visible au survol prolongé).

## Phase 3 — Craft & polish (continu)

10. **Auditer les 145 `transition-transform/colors/all`** : garder les micro-feedbacks de pression en CSS (conforme à la skill), mais migrer toute transition de **panneau/contenu** vers des springs Motion pour l'interruptibilité.
11. **Vérifier `prefers-reduced-transparency`** : `backdrop-filter` est utilisé (9 fois) mais je n'ai pas vu de media query correspondante en dehors de `reduced-motion` — l'ajouter pour le header et la barre studio.
12. **Passer une revue visuelle** en review "frame par frame" sur les transitions de panneau (Sources ↔ Chat ↔ SourceViewer) pour vérifier l'absence de saut au changement rapide d'onglet.

Je peux détailler n'importe quelle phase en tickets concrets (fichier par fichier, avec les lignes exactes à modifier) si tu veux commencer par l'une d'elles — Phase 0 est la plus rentable en un minimum de temps.