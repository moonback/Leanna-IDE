# Audit UX/UI — Leanna-IDE

Date : 2026-11-06  
Branche : `feat/ux-ui-parcours-minimal-glass`  
Périmètre : première passe d'audit du code source React et du système Full Glass.

> Cet audit est une analyse statique du dépôt. Les dimensions, débordements et comportements réels doivent encore être validés dans Electron à plusieurs tailles de fenêtre.

## Objectif produit

Faire de Leanna un espace de travail desktop minimaliste et professionnel. La surface doit exposer les actions fréquentes, garder les fonctions secondaires accessibles sans encombrer l'écran, et conserver les capacités avancées sans multiplier les panneaux concurrents.

## Constats vérifiés dans le code

### Points solides à conserver

- `src/config/navigation.ts` centralise les routes, libellés, icônes et groupes de navigation.
- `ViewHeader` fournit une structure d'en-tête commune aux vues classiques.
- `glass.css` définit une hiérarchie de surfaces L0 à L5 et évite le flou coûteux sur Monaco, le terminal et les webviews.
- `GlobalSidebar` possède déjà des états réduit/déployé, recherche, navigation clavier et prise en compte de `prefers-reduced-motion`.
- `ConfirmDialog` fournit un mécanisme partagé de confirmation ; il faut le réutiliser plutôt que créer une seconde famille de dialogues.
- Les paramètres possèdent une navigation interne recherchable, avec URL partageable par section.

### Frictions et risques identifiés

1. **Destination GitHub absente des groupes globaux** : `NAV_ITEMS.github` et `ROUTES.github` existent, mais `github` n'était présent dans aucun `NAV_GROUPS`. La destination pouvait donc être absente de la navigation globale.
2. **En-tête sous contrainte horizontale** : le titre, la description, la pastille d'état et les actions partagent une seule ligne. Sur les petites fenêtres, les éléments secondaires peuvent entrer en concurrence avec les actions.
3. **IDE dense par nature** : l'IDE cumule de nombreux panneaux, docks, modales et commandes. La prochaine passe doit classer ces commandes par fréquence et contexte avant de déplacer ou supprimer des contrôles.
4. **Paramètres très riches** : la navigation interne contient de nombreuses sections. La recherche est utile, mais la largeur fixe de 232 px et le comportement en petite fenêtre doivent être validés en exécution.
5. **Pas de preuve visuelle dans cet audit** : le code seul ne permet pas de conclure qu'un bouton déborde, qu'une modale manque ou qu'un espacement est incorrect à l'écran.

## Décisions UX appliquées dans cette branche

- Ajout de GitHub dans un groupe global **Intégrations**, sans modifier sa route ni son écran.
- Renforcement sémantique de `ViewHeader` : en-tête nommé, description consultable au survol lorsqu'elle est tronquée, barre d'outils d'actions nommée.
- Ajout d'ajustements responsives au header : les éléments secondaires se contractent avant les actions ; la pastille d'état et le badge sont masqués sur les fenêtres étroites ; les actions restent accessibles horizontalement.
- La réinitialisation des paramètres demande désormais une confirmation destructive via le dialogue partagé ; une réponse HTTP en erreur n'est plus présentée comme une sauvegarde réussie.
- La navigation interne des paramètres réduit sa largeur sur les fenêtres intermédiaires et étroites.
- Les règles de couleurs, de surfaces et de flou restent pilotées par les tokens Full Glass existants.

## Deuxième passe — IDE et commandes contextuelles

### Constats vérifiés

- La sidebar IDE mélange les destinations de pages (`NAV_GROUPS`) et les outils qui ouvrent des panneaux (`ideSidebarConfig`). C'est un choix utile, mais une même destination peut se retrouver dans les deux sources.
- GitHub est un outil direct du rail IDE et était aussi présent dans le menu « Outils » de la barre de statut : deux accès concurrents pour la même action.
- La barre d'onglets de l'éditeur affichait simultanément la minimap, le retour à la ligne, le formatage, les modèles, l'aperçu contextuel et l'enregistrement. Ces options n'ont pas toutes la même fréquence.
- Le dock droit est déjà mutuellement exclusif ; conserver cette règle évite l'empilement de panneaux qui réduit la zone de code.

### Décisions appliquées dans cette passe

- GitHub reste disponible comme destination globale hors IDE, mais son entrée de navigation est filtrée dans le contexte IDE où il existe déjà comme outil direct.
- Suppression du doublon GitHub dans le menu secondaire de la barre de statut.
- Dans les onglets éditeur, conservation des actions contextuelles (aperçu Markdown/HTML) et de l'enregistrement à portée immédiate ; minimap, retour à la ligne, formatage et modèles sont regroupés dans un menu « Plus ».
- Ajout d'états accessibles pour les options activables et fermeture du menu par Échap ou clic extérieur. Le focus revient au déclencheur à la fermeture ; la fermeture d'un onglet ne déclenche pas aussi sa sélection au clavier.
- Correction du menu « Plus » : son rendu absolu était susceptible d'être rogné par les conteneurs IDE en `overflow: hidden`. Le menu est maintenant rendu dans `document.body` via un portail React, avec ancrage recalculé au redimensionnement et au scroll, fermeture au clic extérieur (en tenant compte du portail) et fermeture par Échap.
- Les onglets de fichiers reçoivent un libellé accessible et une interaction clavier.
- La palette de commandes accepte maintenant des actions contextuelles fournies par l'IDE : explorateur, recherche, terminal, GitHub, sandbox, workflows, agents, missions et paramètres.

### À vérifier ensuite dans Electron

- Le menu « Plus » est rendu hors de la zone de découpage via un portail ; vérifier dans Electron son ancrage au bouton, ses limites horizontales sur petite fenêtre, et son repositionnement après redimensionnement ou scroll.
- Le focus clavier doit rester logique entre les onglets, leur bouton de fermeture et les actions de l'éditeur.
- Le menu « Outils » de la barre de statut reste une modale personnalisée : vérifier le piège de focus, le retour du focus au déclencheur et le comportement à Échap avant de décider de la remplacer par un drawer.
- La palette de commandes actuelle expose un noyau de commandes, pas encore la totalité des outils IDE annoncés par la configuration de sidebar. Ne pas la présenter comme un accès universel tant que les actions ne sont pas réellement enregistrées.

## Troisième passe — Chat flottant et accessibilité des panneaux

### Constats vérifiés

- Le menu « Outils » de la barre de statut était une boîte de dialogue personnalisée qui fermait avec Échap, mais ne gérait ni le confinement du focus ni son retour au déclencheur.
- Le mode « Plein écran » du ChatPanel utilisait une géométrie de demi-écran (position gauche à 50vw et largeur 50vw), ce qui ne correspondait pas à l'intitulé de l'action.
- L'indicateur de frappe de la zone de saisie forçait l'animation même lorsque l'utilisateur avait activé la préférence système de réduction des animations.

### Corrections appliquées

- Le ChatPanel occupe maintenant toute la fenêtre en mode plein écran (gauche 0, largeur 100vw, sans bordure latérale parasite). En mode flottant, sa largeur maximale est limitée à la largeur visible de la fenêtre.
- Le dialogue « Outils » place le focus à l'intérieur à l'ouverture, piège Tab / Maj+Tab dans ses contrôles, ferme avec Échap et restaure le focus précédent à la fermeture. Le déclencheur expose aussi `aria-controls`.
- L'indicateur de frappe respecte désormais `prefers-reduced-motion` via `useReducedMotion`.

### Vérifications Electron restantes

- Confirmer le plein écran du chat sur un écran desktop et sur une fenêtre redimensionnée.
- Parcourir le dialogue Outils au clavier : ouverture, Tab, Maj+Tab, Échap, retour au bouton déclencheur.
- Vérifier l'absence d'animation de l'indicateur de frappe avec la réduction des animations activée.

## Architecture UX cible

- **Navigation globale** : destinations de premier niveau uniquement, groupées par intention ; ne pas exposer les outils contextuels de l'IDE comme des pages.
- **IDE** : commandes de travail fréquentes visibles ; fonctions rares dans des menus contextuels ou la palette de commandes ; un seul panneau principal par côté, avec docks secondaires repliables.
- **En-têtes** : titre et actions principales toujours prioritaires ; description facultative ; état agent compact et non redondant.
- **Modales** : réservées aux créations/configurations multi-étapes et confirmations destructives. Pour une information consultable, préférer un panneau latéral ; pour une action simple, un menu ou popover.
- **Paramètres** : navigation searchable conservée ; regrouper les réglages par tâche utilisateur et éviter les doublons de vocabulaire.
- **Full Glass** : utiliser les niveaux existants ; pas de blur sur les grandes zones vivantes ni de cartes décoratives sans fonction.

## Prochaine séquence d'audit et de validation

1. Vérifier chaque route et son entrée de navigation (aucune route utilisateur orpheline).
2. Cartographier les actions de l'IDE : visible, menu, palette, panneau ou suppression.
3. Passer les pages une par une : header, largeur utile, densité, scroll, états vides, erreurs et actions principales.
4. Vérifier chaque modale : déclencheur, fermeture Échap, clic extérieur, focus, validation, annulation et état de chargement.
5. Tester les tailles de fenêtre desktop larges, intermédiaires et étroites, ainsi que les thèmes clair, sombre et contraste élevé.
6. Lancer typecheck, tests UI, lint et le script `ui:audit`, puis corriger les régressions.

## Critères d'acceptation

- Chaque destination accessible est visible dans une navigation ou une palette documentée.
- Aucun contrôle important n'est tronqué ou inaccessible au clavier.
- Les actions destructives demandent une confirmation explicite.
- Les vues partagent une hiérarchie d'en-tête cohérente sans forcer un header classique dans l'IDE.
- Les panneaux et modales ont un rôle distinct et prévisible.
- Les tokens Full Glass restent la source de vérité pour les surfaces et les couleurs.
- Les vérifications automatisées passent ; les contrôles visuels sont effectués dans l'application Electron.
