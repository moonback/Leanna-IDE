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


## Quatrième passe — Géométrie du workspace et conteneurs de vues

### Constats vérifiés

- Le panneau de chat plein écran est positionné sur toute la fenêtre, mais `IdeView` conservait une largeur de workspace de `50vw` lorsque `chatFullscreen` était actif. Le parent et le panneau appliquaient donc deux géométries contradictoires.
- Le conteneur animé des routes fixait `h-full` et `overflow-hidden` sans `min-h-0`. Dans une chaîne de layouts flex, l'absence de cette contrainte peut empêcher les descendants scrollables de rétrécir correctement.
- Les vues Documents, Historique et Mémoire avaient des racines flex sans combinaison explicite `min-h-0` / `overflow-hidden`, contrairement à plusieurs autres pages.
- La liste et le détail des Notebooks possèdent déjà chacun leur `ViewHeader` partagé : il ne faut pas ajouter un troisième header dans `NotebooksView` au risque de dupliquer le titre.

### Corrections appliquées

- En plein écran, le workspace IDE conserve désormais 100 % de sa largeur ; seul le mode chat docké réduit la largeur du workspace en fonction de `chatWidth`.
- Le conteneur animé commun des routes reçoit `min-h-0` pour permettre aux vues flex internes de gérer leur propre scroll.
- Documents, Historique et Mémoire adoptent une racine flex cohérente (`h-full min-h-0 overflow-hidden`) afin que leurs zones de contenu scrollables restent contenues dans la fenêtre.

### Validation restante

- Vérifier le chat plein écran avec et sans sidebar, puis revenir au mode docké et confirmer le calcul de largeur.
- Parcourir Documents, Historique et Mémoire avec une fenêtre courte et une fenêtre étroite : le scroll doit rester dans la zone de contenu, sans débordement vertical du header.
- Vérifier que les vues Notebooks liste et détail conservent un seul header chacune.


## Cinquième passe — Statut de connexion et signalétique inactive

### Correction demandée

- La barre d'état affichait systématiquement l'état Gemini Live `idle` sous le libellé « Hors ligne », même lorsque l'utilisateur n'avait pas démarré de session vocale.
- Le type `ConnectionStatus` de `useLiveAPI` confirme trois états : `idle`, `connecting` et `connected`.

### Correction appliquée

- Le badge Gemini Live est désormais masqué lorsque le statut est `idle`.
- Il apparaît pendant la connexion (`Connexion…`) et une fois connecté (`Connectée`).
- Le cas `idle` n'affiche plus d'icône Wi-Fi barré ni le texte « Hors ligne » dans la StatusBar.

### Validation restante

- Vérifier visuellement les trois états : idle (aucun badge), connecting (indicateur animé), connected (indicateur vert).
- Confirmer que les autres indicateurs de la barre (Sandbox, MCP, Telegram) restent indépendants du statut Gemini Live.

## Sixième passe — États d'erreur des vues de données

### Constats vérifiés

- Les automatisations traitaient certaines réponses HTTP non-2xx comme des succès silencieux ; les actions de tâche ne donnaient pas de retour utilisateur fiable.
- La suppression d'une tâche planifiée ne demandait pas de confirmation.
- La détection GitHub confondait une erreur réseau/API avec l'absence réelle de dépôt.
- L'historique et les souvenirs pouvaient afficher un état vide après une réponse HTTP invalide, ce qui masquait une panne de chargement.

### Corrections appliquées

- Automatisations : validation des statuts HTTP et des payloads de listes, retours de succès/erreur pour lancer, pause/reprise et suppression, confirmation avant suppression, état d'erreur avec action de réessai et libellés accessibles sur les actions icon-only.
- GitHub : séparation entre « aucun dépôt détecté » et « échec de détection » ; les erreurs HTTP des listes de commits, issues et pull requests sont désormais remontées au panneau d'erreur existant.
- Historique : validation de la réponse de liste et des messages d'une conversation ; un échec de chargement de la liste affiche une erreur avec réessai plutôt qu'un faux état vide.
- Mémoire : validation de la réponse API et affichage d'un état d'erreur avec réessai plutôt qu'un faux état vide.

### Validation restante

- Simuler une API indisponible, un statut HTTP 500 et un JSON mal formé sur chacune de ces vues.
- Vérifier que les états vides ne s'affichent qu'après une réponse valide contenant une liste vide.
- Vérifier les retours toast et les confirmations de suppression dans Electron.
- Lancer typecheck, tests UI et ui:audit dans l'environnement local ; ces commandes n'ont pas été exécutées via l'accès GitHub.

## Septième passe — Bibliothèque de snippets

### Constats vérifiés

- La liste des snippets utilisait déjà le statut HTTP pour valider la réponse, mais un échec de chargement laissait l'interface présenter une liste vide comme si elle était réellement vide.

### Correction appliquée

- La réponse doit maintenant contenir une liste valide ; un échec conserve un état d'erreur explicite et propose un réessai. L'état vide n'est affiché qu'après un chargement valide sans résultat.

### Validation restante

- Tester une liste vide valide, une erreur HTTP et une réponse JSON sans tableau de snippets.
- Vérifier le réessai après rétablissement du serveur et la conservation du snippet sélectionné.

## Huitième passe — Observabilité et Notebooks

### Constats vérifiés

- Observabilité : les réponses HTTP non réussies ou les payloads incomplets de ses quatre endpoints pouvaient être ignorés, puis interprétés comme des métriques à zéro ou des tableaux vides. Le rafraîchissement manuel ne proposait pas d'état de récupération visible.
- Bibliothèque Notebooks : un échec de chargement pouvait laisser apparaître l'état vide « Créez votre premier notebook ».
- Détail Notebook : après un échec de récupération, le composant conservait le squelette car `notebook` restait nul ; aucun chemin de récupération n'était proposé.

### Corrections appliquées

- Observabilité : validation des quatre réponses (HTTP, indicateur `success`, structures attendues), erreur explicite avec bouton de réessai et masquage des métriques/états vides pendant une erreur de chargement.
- Bibliothèque Notebooks : validation du tableau retourné et affichage d'un état d'erreur avec réessai, distinct de la bibliothèque réellement vide.
- Détail Notebook : validation de l'identifiant et des collections minimales ; le squelette n'est affiché que pendant le chargement. Une erreur ou un notebook introuvable affiche une page récupérable avec réessai et retour à la bibliothèque.

### Validation restante

- Simuler séparément HTTP 500, JSON invalide, `success: false` et payload incomplet pour les quatre endpoints d'observabilité.
- Vérifier qu'une bibliothèque vide valide reste distincte d'une panne API, et qu'un notebook supprimé affiche bien « introuvable ».
- Vérifier les changements de workspace, le retour navigateur et le réessai après rétablissement du serveur.
- Exécuter typecheck, tests UI et audit visuel dans Electron ; ces validations locales n'ont pas été exécutées via GitHub.

## Neuvième passe — Navigation clavier des Notebooks et sémantique des onglets

### Constats vérifiés

- Les cartes de notebooks en vue liste et grille déclenchaient l'ouverture au clic, mais n'exposaient pas de parcours clavier équivalent. Elles contiennent également des actions secondaires ; elles ne doivent donc pas être transformées en boutons englobants qui imbriqueraient des contrôles interactifs.
- Les onglets d'Observabilité étaient visuellement sélectionnés sans exposer `role=tablist`, `role=tab` ni `aria-selected` aux technologies d'assistance.

### Corrections appliquées

- Les cartes liste/grille des notebooks sont désormais focalisables et activables avec Entrée ou Espace, tout en conservant les contrôles secondaires internes et une sémantique de groupe.
- Les onglets Observabilité exposent leur rôle et leur état sélectionné ; les boutons de période exposent leur état `aria-pressed`. Les contrôles ont des types explicites.

### Validation restante

- Parcourir les deux modes d'affichage des notebooks uniquement au clavier, vérifier Entrée/Espace, et vérifier que le bouton de suppression interne reste indépendant.
- Vérifier la lecture des onglets et du sélecteur de période avec un lecteur d'écran.
- Exécuter typecheck, tests UI et audit visuel Electron ; aucune exécution locale n'est disponible depuis l'accès GitHub utilisé pour ces modifications.

## Dixième passe — Documents, mémoire et liens de connaissances

### Constats vérifiés

- Documents : les deux endpoints de chargement pouvaient échouer indépendamment sans état d'erreur cohérent ; la vue pouvait alors présenter des données partielles comme une liste complète.
- Mémoire : les réponses HTTP non réussies des faits documentaires ou de la mémoire projet étaient converties en tableaux vides, ce qui confondait panne et absence de faits.
- Relations : une réponse JSON sans tableau `relations` était acceptée comme une liste vide.
- Suppression d'un fait : le statut HTTP de la suppression n'était pas contrôlé ; l'interface pouvait retirer localement un fait alors que le serveur avait refusé l'opération.
- Les onglets Documents/Mémoire/Relations/Tableau de bord n'exposaient pas leur sémantique de sélection aux technologies d'assistance.

### Corrections appliquées

- Documents : les deux listes doivent répondre correctement et fournir des tableaux valides ; une erreur affiche un état récupérable avec réessai au lieu d'un état vide ou partiel.
- Mémoire : validation des deux endpoints et de leurs tableaux `facts`, conservation d'un état d'erreur distinct de la mémoire vide et action de réessai.
- Relations : validation du tableau `relations` et état d'erreur avec réessai.
- Suppression d'un fait : vérification du statut HTTP avant la mise à jour optimiste de la liste.
- Onglets : ajout de `tablist`, `tab`, `aria-selected` et d'un ordre de tabulation limité à l'onglet actif.

## Onzième passe — Récupération des sections Paramètres

### Constat vérifié

- Une ancienne valeur de section conservée dans l'URL ou dans le stockage local pouvait ne correspondre à aucune section encore déclarée. La zone de contenu ne rendait alors aucun panneau et donnait l'impression d'une page Paramètres vide.

### Correction appliquée

- Les identifiants de section sont désormais validés contre les groupes de navigation déclarés.
- Une section inconnue dans le stockage local est ignorée au démarrage ; une section inconnue dans l'URL est remplacée par la section active valide, sans casser les autres paramètres de requête.

### Validation restante

- Simuler une panne HTTP sur chacun des endpoints Documents, Mémoire et Relations, ainsi qu'un JSON sans tableau attendu ; vérifier l'état d'erreur et le réessai.
- Simuler un refus HTTP lors de la suppression d'un fait et vérifier que la ligne reste présente.
- Ouvrir Documents avec un lecteur d'écran et vérifier l'annonce de l'onglet actif.
- Ouvrir Paramètres avec une section inconnue dans l'URL et une valeur périmée dans le stockage local ; vérifier le repli sur une section valide.
- Exécuter typecheck, tests UI, lint et `ui:audit`, puis effectuer les contrôles visuels dans Electron. Ces validations locales ne sont pas disponibles via l'accès GitHub utilisé pour ces changements.


## Douzième passe — Adaptation des cartes de tâches planifiées

### Constat vérifié

- La vue Automatisations utilisait une carte de tâche en ligne permanente : contenu descriptif et groupe de trois actions partageaient la même rangée, sans point de rupture responsive.
- Sur une fenêtre étroite ou avec une sidebar ouverte, les métadonnées de planification pouvaient également dépasser la largeur disponible puisqu'elles étaient forcées sur une seule ligne.

### Correction appliquée

- Les cartes passent en disposition verticale sur les petits écrans, puis retrouvent leur disposition horizontale à partir du breakpoint `sm`.
- Les actions restent regroupées, alignées à droite sur petit écran et replacées naturellement à côté du contenu sur écran plus large.
- Les métadonnées peuvent revenir à la ligne et utilisent une largeur maximale contrainte au conteneur.

### Validation restante

- Tester les cartes avec un nom long, une description longue et une date de prochaine exécution complète.
- Vérifier les largeurs étroites, intermédiaires et larges, avec sidebar globale ouverte et repliée.
- Confirmer que les trois actions restent accessibles au clavier et que leurs zones de clic ne se chevauchent pas.
- Exécuter typecheck, tests UI, lint et `ui:audit`, puis valider le rendu dans Electron.


## Treizième passe — États de détail de l'historique

### Constat vérifié

- Le panneau de détail de l'historique n'était rendu que lorsque la conversation sélectionnée contenait au moins un message.
- Une conversation vide restait donc présentée comme « Chargement… » même après la fin de la requête.
- En cas d'échec de récupération des messages, seul un toast était affiché ; le panneau ne proposait pas de récupération locale et pouvait conserver un état de détail incohérent.

### Correction appliquée

- Le détail s'affiche dès qu'une conversation est sélectionnée, indépendamment du nombre de messages.
- Le chargement, l'erreur et l'état réellement vide disposent de rendus distincts.
- L'erreur de détail propose un réessai directement dans le panneau.
- Les messages précédents sont effacés au début d'une nouvelle sélection pour éviter d'afficher temporairement le contenu d'une autre conversation.

### Validation restante

- Ouvrir une conversation contenant des messages, une conversation vide et une conversation dont l'endpoint renvoie HTTP 500.
- Vérifier le réessai après rétablissement de l'API et l'absence de messages appartenant à la sélection précédente.
- Tester les changements rapides de sélection pendant le chargement.
- Exécuter typecheck, tests UI, lint et `ui:audit`, puis valider le parcours dans Electron.


## Quatorzième passe — Accessibilité clavier des cartes GitHub

### Constat vérifié

- Les cartes Issues et Pull Requests étaient des éléments `div` cliquables annoncés comme des liens via `role="link"`, mais elles n'étaient pas focalisables et ne géraient pas l'activation au clavier.

### Correction appliquée

- Les deux types de cartes sont désormais accessibles dans l'ordre de tabulation (`tabIndex=0`).
- La touche Entrée déclenche la même ouverture externe que le clic.
- Un indicateur de focus visible est ajouté sans modifier la présentation au repos.

### Validation restante

- Parcourir les cartes Issues et Pull Requests au clavier ; vérifier l'ordre de focus, l'annonce du nom accessible et l'ouverture par Entrée.
- Vérifier le comportement d'ouverture externe dans Electron et dans le navigateur.
- Exécuter typecheck, tests UI, lint et `ui:audit`.
