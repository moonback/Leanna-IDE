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


## Quinzième passe — Comportement accessible des confirmations

### Constats vérifiés

- `ConfirmDialog` implémentait son propre voile et son propre dialogue, indépendamment du composant partagé `Modal`.
- Il n'utilisait donc pas le mécanisme commun de piège de focus, de restitution du focus, de gestionnaire Escape empilé ni de verrouillage du défilement.
- Le clic sur le voile était géré par une comparaison `target/currentTarget`, sans la protection commune contre les glisser-déposer qui commencent dans le dialogue.
- Les boutons ne déclaraient pas explicitement `type="button"`, ce qui pouvait provoquer une soumission implicite lorsqu'un fournisseur de confirmation était rendu dans un contexte de formulaire.

### Corrections appliquées

- `ConfirmDialog` utilise désormais le composant partagé `Modal` : gestion du focus, retour au déclencheur, Escape, clic voile sécurisé et verrouillage du défilement sont centralisés.
- Le titre et le message restent associés au dialogue via `aria-labelledby` et `aria-describedby`.
- Le bouton Annuler reçoit le focus initial via l'ordre naturel des contrôles ; les deux actions déclarent explicitement `type="button"` et disposent d'un indicateur de focus visible.
- Les variantes visuelles danger/avertissement/conformation sont conservées.

### Validation restante

- Vérifier dans Electron et au clavier que le focus entre dans la confirmation, reste piégé, puis revient au déclencheur après Annuler, Confirmer ou Escape.
- Vérifier que seul le dialogue supérieur réagit à Escape lorsqu'une confirmation est empilée sur une autre modale.
- Vérifier que cliquer dans le dialogue ne ferme pas la confirmation et qu'un glisser-déposer commencé dans le dialogue puis terminé sur le voile ne la ferme pas.
- Vérifier que l'ouverture/fermeture restaure correctement le scroll de la page et qu'aucune soumission de formulaire n'est déclenchée par les actions de confirmation.
- Exécuter typecheck, tests UI, lint et `ui:audit`. Ces validations locales ne sont pas exécutables via l'accès GitHub utilisé pour cette modification.


## Seizième passe — Gestion du focus de l'assistant de configuration

### Constats vérifiés

- `EnvSetupModal` présentait un élément `role="dialog"` et gérait Escape avec un écouteur clavier local, mais ne piégeait pas le focus dans la fenêtre.
- Le défilement de l'interface derrière l'assistant restait possible pendant la saisie.
- La gestion clavier locale ne bénéficiait pas de la pile commune des overlays lorsque plusieurs fenêtres étaient ouvertes.

### Corrections appliquées

- L'assistant utilise désormais `useOverlay` pour centraliser le piège de focus, la restitution du focus à la fermeture, la pile Escape et le verrouillage du défilement.
- La fermeture par Escape reste désactivée pendant l'enregistrement, comme auparavant.
- Le clic sur le voile ne ferme toujours pas l'assistant ; les événements de fond sont explicitement configurés sans fermeture.

### Validation restante

- Ouvrir l'assistant depuis le parcours de démarrage et vérifier que le focus entre dans le premier champ, reste dans le dialogue et revient à l'élément déclencheur après « Plus tard » ou « Terminer ».
- Vérifier qu'Escape ferme l'assistant hors enregistrement et ne le ferme pas pendant une sauvegarde.
- Vérifier que le scroll arrière-plan est bloqué puis restauré, et qu'un clic sur le voile ne ferme pas l'assistant.
- Vérifier le comportement lorsque l'assistant apparaît alors qu'un autre overlay est actif.
- Exécuter typecheck, tests UI, lint et `ui:audit`, puis contrôler le parcours de démarrage dans Electron.


## Dix-septième passe — Accessibilité de la bibliothèque de modèles

### Constats vérifiés

- `TemplateSelectorModal` utilisait un overlay et un panneau visuel sans rôle `dialog`, sans `aria-modal` ni nom accessible associé.
- La fenêtre ne réutilisait pas le gestionnaire commun de focus et ne proposait pas de fermeture avec Escape.
- Les boutons ne déclaraient pas leur type ; le bouton de fermeture n'avait pas de nom accessible explicite.

### Corrections appliquées

- Ajout du rôle dialogue modal et association du titre avec `aria-labelledby`.
- Utilisation de `useOverlay` pour le piège de focus, la restitution du focus, Escape et le verrouillage du scroll.
- Le clic sur le voile conserve le comportement existant (ne ferme pas la bibliothèque).
- Tous les boutons déclarent `type="button"` et le bouton de fermeture expose un libellé accessible.

### Validation restante

- Ouvrir la bibliothèque, vérifier le focus initial, le confinement du focus, la fermeture Escape et la restitution du focus.
- Vérifier que le clic sur le voile ne ferme pas la bibliothèque et que le scroll arrière-plan est restauré à la fermeture.
- Vérifier les boutons de catégories, de sélection, d'onglet, de copie, de téléchargement et d'application au clavier.
- Tester le rendu sur petite fenêtre : la bibliothèque utilise actuellement une largeur latérale minimale de 300 px et une hauteur de 85 vh ; vérifier qu'aucun panneau ni contrôle ne devient inaccessible.
- Exécuter typecheck, tests UI, lint et `ui:audit`, puis valider dans Electron.


## Dix-huitième passe — Parcours clavier du sélecteur de workspace

### Constats vérifiés

- Le sélecteur de workspace était un dialogue modal personnalisé : il gérait Escape localement, mais ne piégeait pas le focus et ne verrouillait pas le défilement de l'application.
- La fermeture par clic sur le voile était un simple `onClick`, sans distinguer un clic réel d'un glisser-déposer commencé dans le dialogue.
- La modale de démarrage peut être empilée avec la confirmation de fermeture de l'application ; la gestion Escape doit donc respecter la pile commune des overlays.

### Corrections appliquées

- Le sélecteur utilise désormais `useOverlay` pour le focus trap, la restitution du focus, la pile Escape et le scroll lock.
- Les règles existantes de fermeture par Escape sont conservées : aucune fermeture pendant un clonage, un chargement ou une sélection forcée.
- Le clic sur le voile conserve son comportement conditionnel et bénéficie maintenant de la protection contre les drags.
- La référence de focus est attachée au panneau de dialogue, et non au voile.

### Validation restante

- Vérifier le focus initial et le parcours Tab/Shift+Tab dans les onglets Récents/Ouvrir/Cloner.
- Vérifier la fermeture Escape dans les états normaux, pendant le chargement, pendant un clonage et en sélection forcée.
- Ouvrir la confirmation Quitter depuis le sélecteur et vérifier que seul l'overlay supérieur réagit à Escape, puis que le focus revient au sélecteur.
- Vérifier clic sur voile, drag depuis le panneau vers le voile, verrouillage/restauration du scroll et tailles de fenêtre réduites.
- Exécuter typecheck, tests UI, lint et `ui:audit`, puis valider le parcours complet de démarrage dans Electron.


## Dix-neuvième passe — Prévention des doubles créations dans Notebooks

### Constats vérifiés

- `CreateNotebookModal` utilisait un état `creating` pour l'indicateur visuel, mais son gestionnaire ne disposait pas de verrou synchrone. Deux événements rapprochés avant le prochain rendu React pouvaient donc lancer deux requêtes POST.
- La fermeture et le bouton Annuler restaient accessibles pendant la création, ce qui permettait de quitter le parcours alors que la requête était encore en cours.
- Dans `GitHubRepositoryImportModal`, la création rapide de notebook ne disposait d'aucun état de traitement ni de garde anti-double soumission. Un double clic pouvait créer plusieurs notebooks ; l'absence de notebook dans la réponse serveur n'était pas signalée.

### Corrections appliquées

- Ajout d'un verrou `useRef` synchrone dans les deux gestionnaires de création.
- `CreateNotebookModal` bloque les déclenchements concurrents, désactive Annuler et ignore la fermeture de la modale pendant la requête.
- La création rapide depuis l'import GitHub affiche maintenant un état de chargement, désactive les actions concurrentes et libère systématiquement le verrou dans `finally`.
- Une réponse API sans objet `notebook` déclenche désormais un message d'erreur explicite au lieu de laisser le formulaire sans retour.

### Validation restante

- Tester double clic rapide sur Créer dans les deux parcours et vérifier qu'une seule requête POST est envoyée.
- Vérifier que le verrou est libéré après succès et après erreur réseau/serveur, puis qu'une nouvelle tentative fonctionne.
- Vérifier que l'utilisateur ne peut pas fermer le dialogue de création standard pendant la requête et que le bouton Annuler du formulaire GitHub est désactivé pendant la création.
- Vérifier le comportement si le serveur renvoie une réponse 2xx sans objet `notebook`.
- Exécuter typecheck, tests UI, lint et `ui:audit`; ces validations ne sont pas exécutables via l'accès GitHub seul.


## Vingtième passe — Adaptation responsive de l'import GitHub

### Constats vérifiés

- Le panneau d'import GitHub imposait deux colonnes fixes de 44 % et 56 % quelle que soit la largeur de la fenêtre.
- Sur une petite fenêtre Electron ou une largeur proche du mobile, les deux panneaux devenaient trop étroits pour les onglets, les listes de dépôts, les champs et les contrôles de configuration.
- Les conteneurs flex n'explicitaient pas tous `min-width: 0` et `min-height: 0`, ce qui pouvait provoquer des débordements au lieu d'un défilement interne.

### Corrections appliquées

- Le layout passe en pile verticale sous le breakpoint `md`, et conserve les deux colonnes sur les fenêtres plus larges.
- Le sélecteur de dépôts occupe toute la largeur et une hauteur maximale de 42 % en mode étroit ; le panneau de configuration récupère l'espace restant.
- Les proportions 44/56 % sont conservées sur desktop.
- Ajout de contraintes `min-w-0` et `min-h-0` aux conteneurs principaux pour laisser les zones de contenu défiler sans élargir le dialogue.

### Validation restante

- Tester des fenêtres Electron de 360, 480, 768, 1024 et 1440 px de largeur.
- Vérifier que les trois onglets, les cartes de dépôts, le formulaire de lien direct, les filtres et le footer restent utilisables.
- Vérifier que les zones de liste et de configuration défilent indépendamment et que le footer d'import reste visible.
- Tester avec une hauteur de fenêtre réduite et avec la modale de configuration du token ouverte au-dessus.
- Exécuter typecheck, tests UI, lint et `ui:audit`, puis vérifier le rendu dans Electron.

## Vingt-et-unième passe — Fiabilité de l'enregistrement des paramètres

### Constats vérifiés

- Le bouton Enregistrer utilisait uniquement l'état React `saving` pour désactiver l'action. Deux clics rapprochés avant le prochain rendu pouvaient donc lancer deux POST concurrents.
- Le bouton Réinitialiser restait actif pendant la sauvegarde ; une confirmation déjà ouverte pouvait également être validée pendant qu'un enregistrement était en cours.
- En cas d'échec HTTP ou réseau, le profil avait déjà été écrit dans `localStorage`, mais le toast générique ne distinguait pas cette sauvegarde locale de la synchronisation serveur échouée.

### Corrections appliquées

- Ajout d'un verrou synchrone `useRef` pour garantir une seule sauvegarde concurrente, y compris avant le prochain rendu React.
- Désactivation de Réinitialiser pendant l'enregistrement et seconde vérification après la confirmation asynchrone.
- Conservation explicite du comportement local-first : les réglages restent sauvegardés localement même si l'API est indisponible.
- Le message d'erreur distingue désormais l'échec de sauvegarde locale de l'échec de synchronisation serveur ; le verrou est toujours libéré dans `finally`.

### Validation restante

- Simuler deux clics rapides sur Enregistrer et vérifier qu'un seul POST est envoyé.
- Simuler HTTP 500 et une erreur réseau : vérifier que les réglages restent disponibles localement et que le message indique clairement l'échec de synchronisation.
- Ouvrir Réinitialiser, lancer une sauvegarde avant de confirmer, puis vérifier que la réinitialisation ne s'exécute pas pendant celle-ci.
- Vérifier qu'une nouvelle sauvegarde est possible après succès comme après échec.
- Exécuter typecheck, tests UI, lint et `ui:audit`, puis valider les parcours dans Electron ; ces validations locales ne sont pas exécutables via l'accès GitHub seul.

## Vingt-deuxième passe — Fiabilité du changement de modèle

### Constats vérifiés

- `syncProfileToServer` ignorait le statut HTTP : un serveur répondant 4xx/5xx était traité comme une synchronisation réussie par `applyAndSave`.
- `ModelPickerModal` fermait immédiatement la fenêtre sans attendre la persistance serveur ; un échec de synchronisation ne pouvait donc pas être corrigé depuis le sélecteur.
- Le bouton Appliquer ne disposait pas d'état de traitement ni de verrou synchrone, et les actions de fermeture restaient disponibles pendant l'opération.

### Corrections appliquées

- La synchronisation du profil rejette maintenant les réponses HTTP non réussies au lieu de résoudre silencieusement la promesse.
- Le sélecteur attend la fin de `applyAndSave` avant de notifier la session Live et de fermer la fenêtre.
- Ajout d'un verrou anti-double soumission, d'un état « Enregistrement… » et de la désactivation des actions Annuler/Fermer pendant le traitement.
- En cas d'échec, la fenêtre reste ouverte et affiche un message permettant de comprendre que l'application du modèle n'a pas abouti ; l'utilisateur peut réessayer.

### Validation restante

- Simuler HTTP 500 et une erreur réseau sur `POST /api/profile` depuis le sélecteur : vérifier que la promesse rejette, que la fenêtre reste ouverte et qu'un nouvel essai est possible.
- Vérifier qu'une réponse 2xx ferme le sélecteur et déclenche exactement une notification `Leanna-settings-saved`.
- Double-cliquer sur Appliquer et vérifier qu'une seule requête est envoyée.
- Vérifier les variantes modale et panneau docké, notamment la fermeture Escape et le bouton Fermer pendant la synchronisation.
- Exécuter typecheck, tests UI, lint et `ui:audit`, puis valider dans Electron ; ces validations locales ne sont pas exécutables via l'accès GitHub seul.
