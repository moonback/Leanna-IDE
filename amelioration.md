# Plan d’amélioration Design, UI et UX — Jarvis OS

> **Périmètre :** audit documentaire et revue des sources du 18 août 2026. Ce rapport concerne l’application active à la racine du dépôt ; les dossiers générés (`dist`, `release`) et `.jarvis/sandbox` sont exclus.

## Résumé exécutif

Jarvis OS possède déjà une base visuelle sérieuse : thèmes clair/sombre, tokens centralisés, typographie adaptée au code, composants UI partagés, retours de chargement et navigation clavier. Son enjeu principal n’est pas d’ajouter davantage de fonctionnalités, mais de rendre les fonctionnalités existantes **plus lisibles, découvrables et rassurantes**.

L’interface actuelle se rapproche d’un IDE expert dense. C’est pertinent pour un profil technique, mais l’accumulation de panneaux, les nombreux états et une barre de navigation de 48 px donnent un coût d’apprentissage élevé. La direction recommandée est un « cockpit IA » : précis et compact, mais organisé autour d’une hiérarchie nette, d’une assistance visible et de modes de travail explicites.

## Éléments examinés

- Application Electron/React/TypeScript avec Vite, Tailwind, Motion, Monaco et Lucide.
- Navigation principale : `src/components/UnifiedSidebar.tsx` et `src/config/ideSidebarConfig.ts`.
- Espace de travail : `src/views/IdeView.tsx`.
- Fondations visuelles et thèmes : `src/index.css`.
- Routes : `src/main.tsx`.

## Atouts à préserver

1. **Système de tokens déjà mature.** Les couleurs, rayons, ombres, états sémantiques et thèmes sont regroupés dans `src/index.css` : excellent socle pour harmoniser plutôt que réinventer.
2. **Identité cohérente.** Le duo indigo/cyan, les fonds profonds et la typographie Inter + JetBrains Mono donnent une identité de produit IA technique crédible.
3. **Feedback existant.** Skeletons, toasts, animation de routes, confirmation des actions critiques et avertissement des fichiers non sauvegardés réduisent l’incertitude.
4. **Performance pensée.** Chargement différé des vues, de Monaco et de plusieurs panneaux, plus explorateur virtualisé : à conserver lors de la refonte.
5. **Accès expert.** Palette de commandes, recherche globale, raccourcis, envoi de sélection à l’IA et barres d’état soutiennent un usage professionnel.
6. **Bases d’accessibilité.** Focus visible, libellés ARIA et navigation structurée sont présents ; ils devront être systématisés.

## Diagnostic prioritaire

| Priorité | Constat | Impact utilisateur | Décision recommandée |
|---|---|---|---|
| P0 | Beaucoup d’outils et panneaux coexistent, pilotés par des états indépendants dans `IdeView`. | L’utilisateur perd le contexte, ouvre plusieurs surfaces et ne sait plus où revenir. | Mettre en place un modèle de panneaux unique et des zones de travail explicites. |
| P0 | Barre latérale très étroite, majoritairement iconographique, avec sous-menus. | Découvrabilité et mémorisation faibles pour les nouveaux utilisateurs. | Ajouter une sidebar extensible et des libellés persistants dans le mode débutant. |
| P0 | Les fonctions IA sont peu visibles lorsque l’assistant n’est pas connecté ; plusieurs panneaux se ferment alors. | Frustration et impression que le produit est cassé ou vide. | Introduire un état « IA prête à connecter » riche, explicatif et actionnable. |
| P1 | Hiérarchie visuelle très uniforme : bordures, surfaces sombres, petites typographies et panneaux similaires. | Lecture lente et priorités métier peu évidentes. | Renforcer la distinction entre navigation, contenu, contexte IA et actions primaires. |
| P1 | Les actions globales, les routes et les panneaux contextuels se recouvrent parfois. | Modèle mental ambigu : page ou panneau ? navigation ou outil ? | Définir une IA claire des niveaux de navigation. |
| P1 | Les animations CSS globales s’appliquent à presque tous les éléments. | Risque de distraction, fatigue et coût de rendu dans les vues denses. | Limiter les transitions aux éléments interactifs et respecter `prefers-reduced-motion`. |
| P1 | Certaines couleurs et ombres sont codées localement. | Cohérence insuffisante entre thèmes et composants. | Étendre les tokens sémantiques et supprimer les couleurs fonctionnelles isolées. |
| P2 | Le contenu est dense et très technique dès le premier écran. | Onboarding difficile, valeur produit peu immédiate. | Créer un premier parcours orienté intention et un état vide guidé. |

## Vision cible : un cockpit IA calme, lisible et maîtrisable

L’interface doit donner quatre réponses en moins de trois secondes : **où suis-je ?**, **sur quoi l’IA travaille-t-elle ?**, **quelle action est la plus utile maintenant ?** et **comment annuler ou vérifier ce qui vient de se passer ?**.

Principes directeurs :

- **Calme visuel :** moins de chrome, plus d’espace utile ; une seule couleur vive réservée à l’action ou l’état actif.
- **Divulgation progressive :** l’essentiel visible, les outils avancés disponibles sans encombrer l’écran.
- **Contrôle explicite :** toute action IA affiche son intention, sa progression, son résultat et une option d’annulation/inspection.
- **Contexte persistant :** projet, fichier actif, état de l’agent et tâche courante restent perceptibles.
- **Cohérence système :** mêmes libellés, statuts, espacements, comportements de panneaux et niveaux d’élévation partout.


## Architecture de l’information recommandée

### 1. Trois niveaux, non concurrents

| Niveau | Rôle | Emplacement conseillé | Exemples |
|---|---|---|---|
| Navigation produit | Changer de domaine durablement. | Sidebar principale. | Workspace, Documents, Notebooks, Historique, Paramètres. |
| Outils du workspace | Agir sur le projet ou le code en cours. | Barre d’activité IDE et panneaux secondaires. | Explorateur, Recherche, Git, Sandbox, Terminal/Workflow. |
| Assistance IA | Lancer, observer et contrôler un travail IA. | Rail ou panneau IA constant à droite. | Chat, mission, agents, journal, approbations. |

Ne pas mélanger ces trois niveaux dans le même flyout. Une destination qui conserve son état et mérite une URL est une **page** ; une surface liée au contexte actif est un **panneau** ; une action immédiate est une **commande** accessible depuis la palette.

### 2. Sidebar adaptable

Conserver la version compacte pour les experts, mais proposer une sidebar extensible (48 px → 224–248 px) avec :

- logo et nom du projet en tête ;
- libellés textuels et groupe actif clairement indiqué ;
- boutons « Réduire » et « Personnaliser » ;
- séparateurs légers entre *Workspace*, *Développement* et *Ressources* ;
- badges uniquement pour les éléments nécessitant une attention réelle (erreur, travail en cours, approbation) ;
- infobulles immédiates avec raccourci clavier lorsque la sidebar est réduite.

Les sous-menus de la configuration actuelle doivent rester exceptionnels : au maximum un niveau, ouverts au clic et fermables avec `Escape`. Les outils fréquents (explorateur, recherche, source control, IA) ne doivent pas être cachés.

### 3. Shell IDE proposé

```text
┌──── navigation ────┬──────────── contexte / onglets ─────────────┬── IA ──┐
│ Workspace          │ Fil d’Ariane · statut projet · commande     │ Tâche  │
│ Code               ├──────────────── contenu principal ──────────┤ Chat   │
│ Documents          │ éditeur / document / résultat / dashboard   │ Review │
│ Automatisation     ├──────────────── barre de statut ────────────┤ Logs   │
│                    │ branche · erreurs · sync · position         │        │
└────────────────────┴────────────────────────────────────────────┴────────┘
```

Le panneau IA droit doit être **repliable, redimensionnable et persistant**. Il ne doit pas modifier brutalement la largeur de l’éditeur : utiliser un séparateur draggable, mémoriser la taille et prévoir un mode superposé pour les fenêtres étroites.

## Recommandations UI détaillées

### Hiérarchie, grilles et densité

- Adopter une grille de 8 px pour les grandes zones et conserver 4 px uniquement pour les ajustements fins. Documenter les paliers : 4, 8, 12, 16, 24, 32, 48 px.
- Réserver une taille de texte minimale de 12 px pour les contrôles persistants ; les textes 10–11 px peuvent rester pour les métadonnées non critiques.
- Créer trois niveaux d’élévation nommés : `base`, `raised`, `overlay`. Éviter d’ajouter une bordure et une ombre forte à chaque surface.
- Privilégier les surfaces opaques dans l’IDE ; réserver le glassmorphism aux popovers et overlays afin de préserver le contraste et la lisibilité.
- Définir une zone d’action primaire unique par panneau. Les actions secondaires deviennent texte, icône avec label ou menu contextuel.

### Couleurs, thèmes et états

- Garder l’indigo comme accent de marque, mais réserver le cyan aux informations et la couleur sémantique appropriée aux statuts système.
- Établir des tokens d’état complets : `--status-idle`, `--status-running`, `--status-waiting-approval`, `--status-success`, `--status-error`, avec fond subtil, bordure, icône et texte associés.
- Remplacer les couleurs codées dans les composants par ces tokens. Tout élément doit rester lisible en thème clair et sombre.
- Vérifier le contraste WCAG 2.2 AA : 4,5:1 pour le texte courant, 3:1 pour grands textes et composants graphiques indispensables.
- Ne jamais faire reposer l’information sur la seule couleur : associer icône, libellé et, si utile, forme ou badge.

### Typographie et iconographie

- Utiliser Inter pour l’interface et JetBrains Mono seulement pour code, chemins, raccourcis et données techniques.
- Définir des styles nommés : titre de page, titre de section, corps, métadonnée, label de contrôle, code. Éviter les tailles ad hoc dispersées.
- Utiliser les icônes Lucide à taille cohérente (16 px dans les contrôles, 18–20 px dans la navigation). Chaque bouton uniquement iconographique doit avoir `aria-label` et tooltip.
- Éviter les capitales systématiques sur les labels de navigation ; elles réduisent la lisibilité dans une interface compacte.

### Micro-interactions et mouvement

- Employer Motion pour les changements de structure : apparition d’un panneau, déplacement d’un élément, confirmation de succès. Durée cible : 120–200 ms.
- Éviter animations répétées, glow permanent et transitions de couleur globales pendant la saisie, le défilement ou l’édition de code.
- Ajouter une règle `@media (prefers-reduced-motion: reduce)` qui neutralise les mouvements non essentiels, shimmer et transitions prolongées.
- Utiliser des skeletons pour les données attendues et un feedback déterminé (pourcentage, étapes ou temps estimé) pour les opérations IA longues.


## Parcours UX à refondre en premier

### A. Première ouverture et connexion IA

**Objectif :** faire comprendre immédiatement la proposition de valeur sans demander à l’utilisateur de connaître les panneaux.

1. Afficher un écran d’accueil léger si aucun projet/fichier n’est actif : « Que souhaitez-vous faire ? ».
2. Proposer 3 à 4 actions guidées : ouvrir un projet, expliquer un code, corriger un problème, créer une automatisation.
3. Si l’IA est déconnectée, afficher un bloc stable dans le panneau IA : état, bénéfice de la connexion, bouton « Connecter Jarvis », lien de réglage et diagnostic en cas d’échec.
4. Après connexion, présenter une suggestion contextualisée et non intrusive : projet récent, fichiers modifiés ou première commande utile.
5. Ne fermer aucun panneau sans laisser une explication et une action de récupération.

**Critère de réussite :** un nouveau profil peut ouvrir un projet, connecter l’IA et lancer une première aide sans passer par une infobulle cachée.

### B. Travail avec l’agent

Le travail de l’agent doit être une séquence lisible : **demande → plan → exécution → preuve → décision utilisateur**.

- Dans le panneau droit, afficher une carte de tâche avec objectif, fichiers concernés, état, étapes, durée et action d’arrêt.
- Différencier les étapes en attente, en cours, nécessitant une approbation et terminées. Ne pas réduire cette information à une couleur animée.
- Pour chaque modification, proposer les actions cohérentes : ouvrir le diff, appliquer, rejeter, restaurer, voir le journal.
- Afficher des résumés courts à la fin d’une opération : « 3 fichiers modifiés, 1 test exécuté, aucune erreur détectée » avec liens vers les preuves.
- Conserver un historique de tâches consultable, filtrable et relié au projet/fichier, sans confondre conversation et audit technique.

### C. Édition et contexte code

- Regrouper en haut de l’éditeur le fil d’Ariane, les onglets, le statut de sauvegarde et les actions de fichier, avec priorité visuelle au fichier actif.
- Prévoir un état vide utile : fichiers récents, ouvrir dossier, créer fichier, rechercher dans le projet et démarrer avec l’IA.
- À partir d’une sélection de code, ouvrir un menu contextuel compact : Expliquer, Corriger, Tester, Refactoriser, Documenter. Garder la commande actuelle `Ctrl/Cmd + Entrée` mais la rendre découvrable.
- Présenter le diff dans une surface focalisée, avec résumé IA, nombre d’ajouts/suppressions, navigation entre fichiers et décisions explicites.
- Donner une visibilité constante au statut de sauvegarde, aux erreurs, à la branche et aux changements non commités dans la barre d’état.

### D. Documents, notebooks et connaissance

Les panneaux *Documents*, *Notebooks* et *Knowledge* doivent être pensés comme un seul espace « Connaissance » avec des sous-vues, mêmes filtres et même logique de sélection.

- Afficher la provenance, date, taille, statut d’indexation et dernière utilisation pour chaque ressource.
- Rendre visible ce que l’IA utilise dans une réponse : documents cités, extraits consultés et bouton « ouvrir la source ».
- Prévoir les états : aucun document, indexation en cours, échec d’indexation, résultat vide, accès insuffisant.
- Ajouter une recherche transversale avec filtres par type, projet, date, tag et statut.

## Accessibilité et ergonomie professionnelle

### Indispensable (P0)

- Navigation complète au clavier : ordre de tabulation logique, focus retenu après fermeture d’un modal/panneau, `Escape` homogène, raccourcis non conflictuels.
- Focus visible sur fond clair et sombre, y compris dans les listes virtualisées et Monaco.
- Modales correctement annoncées (`role="dialog"`, `aria-modal`, titre associé) avec piège de focus.
- Contraste contrôlé pour texte atténué, bordures, badges, icônes inactives et zones désactivées.
- Zones cliquables d’au moins 32 × 32 px sur desktop, 40 × 40 px pour les contrôles tactiles si ce support est visé.
- Respect de `prefers-reduced-motion` et absence d’informations portées uniquement par l’animation.

### À intégrer (P1)

- Infobulles au survol et au focus, avec nom, conséquence de l’action et raccourci lorsque présent.
- Paramètre de densité (compacte, équilibrée, confortable) appliqué à la navigation, listes et panneaux sans casser Monaco.
- Redimensionnement et persistance des zones latérales ; réinitialisation facile de la disposition.
- États vides, de chargement, d’erreur et de succès conçus pour chaque écran, avec action de reprise et langage clair.
- Langue cohérente dans toute l’interface. Choisir le français comme langue produit principale ou mettre en place une i18n réelle ; ne pas mélanger français et anglais sans raison produit.

## Design system à formaliser

Créer une documentation interne légère, idéalement dans `docs/design-system.md` ou Storybook plus tard, sans dupliquer les règles dans les composants.

| Fondation | À standardiser | Exemples |
|---|---|---|
| Tokens | Couleurs, typographie, espacements, rayons, élévation, z-index, motion. | `--surface-raised`, `--text-secondary`, `--status-running`. |
| Primitives | Bouton, IconButton, Tooltip, Menu, Popover, Modal, Panel, EmptyState, Badge, Input, Tabs. | Une API et des états identiques partout. |
| Patterns | Page header, panneau latéral, carte de tâche IA, liste de ressources, diff review, barre de statut. | Variantes documentées avec états vides et erreurs. |
| Contenu | Ton, labels, verbes d’action, messages d’erreur, pluriels, statuts. | « Réessayer » plutôt que « Erreur inconnue ». |
| Qualité | A11y, responsive, contrastes, motion, tests visuels futurs. | Checklist avant validation d’un composant. |

### Composants à introduire ou consolider

1. **`AppShell`** : gère la disposition globale, la sidebar, les breakpoints et la persistance des largeurs.
2. **`SidePanel`** : cycle de vie unique (`closed`, `open`, `pinned`, `overlay`), titre, actions, resize et restauration du focus.
3. **`AgentTaskCard`** : contrat d’affichage standard pour tout travail IA.
4. **`EmptyState`** : illustration optionnelle, titre, explication, action primaire, aide secondaire.
5. **`StatusBadge`** : statuts sémantiques accessibles et cohérents.
6. **`Tooltip`/`Menu`** : comportement clavier et positionnement unifiés pour les contrôles iconographiques.
7. **`CommandCenter`** : palette unique permettant recherche de fichiers, navigation, commandes et actions IA.


## Feuille de route de mise en œuvre

### Phase 0 — Mesurer et cadrer (1 semaine)

- Définir les personas prioritaires : développeur autonome, utilisateur IA assisté, administrateur/constructeur d’agents.
- Réaliser 5 tests de parcours sur une build actuelle : ouvrir un projet, trouver un outil, connecter l’IA, demander une modification, examiner le diff.
- Instrumenter de façon respectueuse les événements UX : ouverture de panneau, abandon de connexion, recherche sans résultat, application/rejet de diff, raccourci utilisé. Ne jamais remonter contenu de code ou secrets.
- Établir la liste des écrans/états et une baseline : temps de première action utile, taux de découverte de la recherche, temps de review, erreurs de navigation.
- Valider la direction visuelle par un prototype Figma ou HTML avant d’implémenter.

### Phase 1 — Impact maximal et risque faible (1 à 2 semaines)

- Nettoyer les tokens et les couleurs locales ; définir les statuts agent centralisés.
- Ajouter tooltips, labels accessibles et meilleure hiérarchie aux icônes de la sidebar.
- Créer l’état de connexion IA et l’état vide de l’éditeur.
- Limiter les transitions globales et intégrer `prefers-reduced-motion`.
- Clarifier les libellés et les regroupements de la navigation sans déplacer brutalement les fonctions existantes.

**Livrable :** interface plus lisible et compréhensible, sans changement majeur d’architecture.

### Phase 2 — Navigation et panneaux (2 à 3 semaines)

- Introduire `AppShell` et `SidePanel`, puis migrer progressivement les panneaux de `IdeView`.
- Ajouter sidebar extensible, persistance de préférence et réinitialisation de layout.
- Consolider *Documents / Notebooks / Knowledge* dans une destination cohérente.
- Transformer la palette en point d’entrée universel.
- Harmoniser les en-têtes de page/panneau et les actions principales.

**Livrable :** modèle de navigation unifié et réduction de la charge cognitive.

### Phase 3 — Expérience agent de confiance (2 à 4 semaines)

- Déployer la carte de tâche agent, la timeline et les approbations structurées.
- Revoir le flux diff : plan IA, fichiers touchés, décisions, résumés, liens vers preuves.
- Ajouter l’historique de tâches et les liens entre tâche, conversation, changements et validation.
- Faire évoluer l’onboarding par intention, avec suggestions contextuelles discrètes.

**Livrable :** expérience IA explicable, contrôlable et adaptée à un produit professionnel.

### Phase 4 — Finition et qualité continue

- Tests d’accessibilité automatisés et revue manuelle clavier/lecteur d’écran.
- Tests visuels pour thèmes clair/sombre, états de panneaux, menus et modales.
- Audit de performance sur l’IDE dense : animation, ouvertures de panneau, grandes listes, Monaco.
- Design QA à chaque nouvelle vue via une checklist commune.

## Indicateurs de succès

| Objectif | Mesure | Cible initiale |
|---|---|---|
| Découvrabilité | Utilisateurs trouvant Explorateur, Recherche et IA sans aide. | ≥ 90 % lors des tests. |
| Première valeur | Temps entre ouverture et première action IA utile. | < 2 minutes. |
| Compréhension agent | Utilisateurs identifiant tâche, étape, fichiers touchés et décision suivante. | ≥ 90 %. |
| Confiance | Diffs examinés avant application et usage de l’annulation/restauration. | Tendance à la hausse, sans friction excessive. |
| Efficacité | Temps pour retrouver une fonction ou revenir au fichier actif. | Réduction de 25 %. |
| Accessibilité | Violations critiques et sérieuses. | 0 avant livraison. |
| Performance ressentie | Ouverture de panneaux et interactions majeures. | Retour visuel < 100 ms ; animation < 200 ms. |

## Checklist de validation par écran

- [ ] L’objectif de l’écran est compris sans lire toute l’interface.
- [ ] Une action principale et un chemin de retour sont visibles.
- [ ] Les états chargement, vide, erreur, succès et désactivé sont prévus.
- [ ] Les actions importantes ont texte ou tooltip, raccourci éventuel et confirmation proportionnée au risque.
- [ ] Le parcours est utilisable au clavier, avec focus visible et `Escape` cohérent.
- [ ] Le texte, les icônes et les statuts passent les contrastes requis sur les deux thèmes.
- [ ] Les mouvements sont utiles, discrets et désactivables.
- [ ] Les libellés suivent le vocabulaire produit et la langue choisie.
- [ ] L’interface reste lisible à 100 %, 125 % et 200 % de zoom.
- [ ] L’écran ne masque pas silencieusement une fonction indispensable lorsque l’IA est hors ligne.

## Premières décisions à prendre

1. **Public prioritaire :** confirmer si Jarvis OS cible d’abord les développeurs experts ou un public plus large. Cela déterminera la densité par défaut et le niveau d’accompagnement.
2. **Panneau IA :** valider le choix d’un panneau droit persistant comme centre de contrôle de l’agent.
3. **Navigation :** accepter le mode sidebar étendue par défaut pour les nouveaux utilisateurs, avec option compacte mémorisée.
4. **Langue :** trancher entre interface française complète et internationalisation structurée.
5. **Critère de qualité :** intégrer accessibilité AA, thème clair/sombre et mode réduit de mouvement dans la définition de fini.

## Conclusion

La modernisation de Jarvis OS doit être une **clarification**, non une surenchère décorative. En mettant en avant le contexte, le travail de l’agent et les actions prioritaires, l’application conservera son caractère puissant tout en devenant plus fluide, fiable et premium. L’ordre recommandé est : fondations visuelles et accessibilité → navigation/panneaux → expérience agent et review → optimisation continue.
