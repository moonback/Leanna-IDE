Tu es un senior product designer + senior frontend engineer spécialisé en React, Tailwind CSS et applications desktop AI.

Je travaille sur **Jarvis OS**, une application desktop Electron + React 19 destinée à devenir un espace de travail documentaire IA.

Je veux maintenant faire une **refonte importante de l'UI/UX**, principalement sur l'apparence, la hiérarchie visuelle, les espacements, les proportions et la disposition des éléments.

L'objectif est de rendre Jarvis OS beaucoup plus cohérent avec l'expérience d'un outil moderne de knowledge/document workspace comme **NotebookLM**, tout en conservant l'identité Jarvis OS et sans faire une copie pixel-perfect de NotebookLM.

### CONTEXTE DU PROJET

Le projet contient déjà une architecture notebook relativement complète :

- `src/components/notebooks/NotebookDetail.tsx`
- `src/components/notebooks/NotebookChat.tsx`
- `src/components/notebooks/SourcePanel.tsx`
- `src/components/notebooks/NotesPanel.tsx`
- `src/components/notebooks/GeneratePanel.tsx`
- `src/components/notebooks/AudioOverviewPanel.tsx`
- `src/components/notebooks/NotebookList.tsx`
- `src/components/notebooks/NotesCanvas.tsx`
- `src/components/notebooks/SourcesSummaryCard.tsx`

Le notebook possède déjà :

- sources multiples
- chat RAG avec citations
- conversations
- notes
- génération de contenu
- audio overview
- comparaison de sources
- deep dive
- filtrage des sources
- sauvegarde de réponses en notes
- markdown riche
- recherche
- canvas de notes

Le projet utilise React 19, Tailwind CSS 4, Motion et Lucide React.

Le README décrit également Jarvis comme un environnement combinant IDE, assistant IA et notebooks RAG, mais la partie notebook doit maintenant devenir visuellement beaucoup plus importante et plus élégante.

### OBJECTIF PRINCIPAL

Transforme l'expérience Notebook de Jarvis OS en une interface :

- calme
- premium
- moderne
- documentaire
- très lisible
- minimaliste
- cohérente
- orientée contenu
- avec une excellente hiérarchie visuelle
- avec beaucoup moins d'effet "dashboard technique"
- avec beaucoup moins de petites cartes et de contrôles dispersés
- avec davantage d'espace blanc/négatif
- avec des surfaces visuelles simples et cohérentes

Je veux que l'utilisateur ait immédiatement l'impression :

> "Je suis dans mon espace de connaissance personnel avec une IA qui connaît mes sources."

et non :

> "Je suis dans un panneau de contrôle technique rempli de fonctionnalités."

---

# 1. COMMENCE PAR AUDITER L'INTERFACE EXISTANTE

Avant de modifier le code :

1. Analyse toute l'architecture frontend liée aux notebooks.
2. Analyse `NotebookDetail.tsx`.
3. Analyse `NotebookChat.tsx`.
4. Analyse `SourcePanel.tsx`.
5. Analyse `NotesPanel.tsx`.
6. Analyse `GeneratePanel.tsx`.
7. Analyse `AudioOverviewPanel.tsx`.
8. Analyse `NotebookList.tsx`.
9. Analyse `index.css`.
10. Analyse les variables de thème existantes.
11. Analyse `UnifiedSidebar`, les composants UI génériques et les composants `Panel`, `SidePanel`, `ViewHeader`, etc.

Identifie les incohérences suivantes :

- espacements différents
- tailles de textes incohérentes
- trop de bordures
- trop de radius différents
- trop de couleurs
- boutons trop nombreux
- informations secondaires trop visibles
- hiérarchie incorrecte
- composants trop denses
- éléments techniques exposés inutilement
- répétition de headers
- panneaux qui semblent indépendants au lieu de former un workspace cohérent
- navigation trop chargée
- manque de focus sur le contenu

NE MODIFIE PAS immédiatement.

Commence par comprendre l'architecture.

---

# 2. NOUVEAU DESIGN PRINCIPLE

Adopte un système de design global pour toute la partie Notebook.

Le design doit suivre cette philosophie :

### Content first

Le contenu doit toujours être visuellement plus important que les contrôles.

### Soft hierarchy

Utilise principalement :

- background
- surfaces légèrement différentes
- typographie
- espacement
- petites séparations

et beaucoup moins :

- grosses bordures
- ombres fortes
- gradients
- couleurs saturées
- badges partout

### Premium desktop workspace

L'application doit ressembler à un vrai produit desktop professionnel, pas à un template SaaS.

### Calm AI

L'IA doit sembler présente mais discrète.

Évite les animations permanentes ou agressives.

Les animations doivent servir :

- transition
- feedback
- état de génération
- apparition de contenu

et pas décorer inutilement.

---

# 3. REVOIR COMPLÈTEMENT LA DISPOSITION DU NOTEBOOK

Je veux une architecture visuelle proche de cette logique :

┌─────────────────────────────────────────────────────────────┐
│ Header notebook                                             │
│ ←  Notebook title                         Search / Actions │
├───────────────┬───────────────────────────────┬─────────────┤
│               │                               │             │
│   SOURCES     │                               │   CONTEXT   │
│               │        MAIN CONTENT            │   / NOTES   │
│  source 1     │                               │             │
│  source 2     │       Chat / content          │             │
│  source 3     │                               │             │
│               │                               │             │
│  + Add source │                               │             │
│               │                               │             │
├───────────────┴───────────────────────────────┴─────────────┤
│                     AI INPUT                                │
└─────────────────────────────────────────────────────────────┘

Mais ne reproduis pas aveuglément ce schéma.

Analyse le meilleur layout selon la taille de la fenêtre.

Le layout doit être responsive.

Sur grand écran :

- sidebar sources à gauche
- contenu principal centré
- panneau contextuel à droite si nécessaire

Sur écran moyen :

- sidebar gauche conservée
- panneau droit transformé en drawer/sheet

Sur petit écran :

- navigation sous forme de drawer
- contenu principal prioritaire
- aucun overflow horizontal

---

# 4. SIMPLIFIER LA NAVIGATION DU NOTEBOOK

Actuellement `NotebookDetail` possède :

- Sources
- Chat
- Notes
- Générer
- Audio

Ne traite plus ces éléments comme cinq gros panneaux totalement indépendants.

Je veux une expérience plus cohérente.

Réfléchis à une navigation composée de :

### Workspace principal

- Chat
- Sources
- Notes

### Actions secondaires

- Generate
- Audio Overview
- Compare
- Deep Dive

Les actions secondaires doivent être accessibles sans prendre constamment de place.

Évite une grosse barre avec 5-8 onglets visuellement équivalents.

La fonctionnalité principale doit clairement être :

**Sources → Chat → Knowledge**

---

# 5. SIDEBAR SOURCES

La sidebar Sources doit devenir un élément central de l'expérience.

Elle doit permettre de comprendre immédiatement :

- combien de sources existent
- quelles sources sont sélectionnées
- quels fichiers sont utilisés par l'IA
- quelles sources sont nouvelles
- quelle source est active

Chaque source doit avoir :

- icône de type
- titre
- information secondaire minimale
- état de sélection
- menu contextuel discret

Évite les cartes massives.

Utilise une liste compacte mais respirante.

Ajoute :

- recherche
- sélection multiple
- bouton Add sources
- filtre éventuel

Le bouton "Add sources" doit être clairement visible mais ne doit pas dominer la sidebar.

---

# 6. CHAT

Le Chat doit devenir la zone la plus importante de l'application.

Je veux :

- colonne centrale avec largeur de lecture confortable
- messages avec beaucoup d'espace
- excellente typographie
- réponses AI très lisibles
- citations intégrées naturellement
- actions secondaires discrètes
- composer fixé en bas

Évite les énormes bulles de chat.

Le message assistant doit ressembler davantage à un document intelligent qu'à une bulle de messagerie.

Les citations doivent être élégantes :

- petit indicateur
- source identifiable
- hover/click
- preview du passage
- possibilité d'ouvrir la source

Le chat doit donner l'impression que les réponses sont construites à partir du notebook.

---

# 7. AI COMPOSER

Refais le composer du chat.

Il doit devenir une pièce maîtresse du design.

Style souhaité :

- grande surface arrondie
- très légère séparation
- texte confortable
- bouton envoyer clairement identifiable
- boutons secondaires minimalistes
- possibilité de sélectionner les sources
- commandes/slash discrètes

Le composer doit avoir une sensation "AI workspace premium".

Évite une barre de formulaire classique.

---

# 8. NOTES

Les Notes doivent être intégrées naturellement dans le workspace.

Je veux éviter l'impression d'une page séparée de gestion de notes.

Une note doit ressembler à un document léger :

- titre
- contenu
- références aux sources
- date/modification
- actions discrètes

Les notes importantes doivent pouvoir être mises en avant.

Si le Canvas existe déjà, conserve-le mais améliore sa cohérence visuelle.

---

# 9. GENERATE

La génération de contenu ne doit pas ressembler à un dashboard avec 15 cartes.

Regroupe les actions par intention.

Par exemple :

### Understand

- Summary
- Key insights
- FAQ
- Glossary

### Study

- Study guide
- Quiz
- Timeline

### Create

- Brief
- Report
- Structured plan

### Visualize

- Mind map
- Diagram

Présente ces actions comme une bibliothèque élégante et compacte.

---

# 10. AUDIO OVERVIEW

L'Audio Overview doit avoir une interface beaucoup plus éditoriale.

Créer une hiérarchie claire :

- titre
- description
- player
- progression
- hosts
- vitesse
- actions

Évite de transformer le player en dashboard.

---

# 11. DESIGN SYSTEM

Crée ou consolide un véritable design system.

Définis des tokens cohérents pour :

### Colors

- background
- surface
- surface elevated
- border
- text primary
- text secondary
- text muted
- accent
- success
- warning
- danger

### Spacing

Utilise une échelle cohérente.

Par exemple :

4 / 8 / 12 / 16 / 20 / 24 / 32 / 40

### Radius

Limite le nombre de radius.

Par exemple :

- small
- medium
- large
- pill

### Typography

Définis clairement :

- display
- title
- heading
- body
- caption
- metadata

Évite les dizaines de tailles arbitraires du type :

`text-[9px]`
`text-[10px]`
`text-[11px]`
`text-[12px]`

Utilise une échelle typographique cohérente.

---

# 12. COULEURS

Réduis fortement la quantité de couleurs visibles.

L'accent Jarvis doit être utilisé pour :

- état actif
- action principale
- focus
- éléments IA
- progression

Pas pour décorer tous les composants.

Les éléments secondaires doivent principalement utiliser les neutres du thème.

Le dark mode doit être particulièrement travaillé :

- éviter le noir absolu partout
- surfaces légèrement différenciées
- contraste subtil
- texte secondaire suffisamment lisible

Le light mode doit avoir une vraie identité et ne doit pas simplement être une inversion du dark mode.

---

# 13. BORDURES / SHADOWS

Réduis drastiquement :

- bordures épaisses
- ombres
- glassmorphism
- gradients

Utilise plutôt :

- séparation subtile
- background contrast
- spacing

L'interface doit respirer.

---

# 14. ICONOGRAPHIE

Utilise Lucide React de manière cohérente.

Les icônes doivent :

- avoir des tailles cohérentes
- être alignées
- ne jamais remplacer du texte lorsqu'un label est nécessaire
- avoir une couleur secondaire par défaut
- devenir accentuées uniquement dans les états actifs

Évite les icônes décoratives inutiles.

---

# 15. HEADER NOTEBOOK

Créer un header beaucoup plus élégant.

Il doit contenir :

- retour
- icône du notebook
- titre
- éventuellement description courte
- état d'indexation
- actions secondaires

Le titre du notebook doit être immédiatement identifiable.

Évite les headers surchargés.

---

# 16. EMPTY STATES

Refais tous les empty states.

Ils doivent être :

- simples
- chaleureux
- utiles
- orientés action

Exemple :

"No sources yet"

avec :

"Add PDFs, websites, documents or text to start building your notebook."

Puis un CTA clair.

Évite les gros graphiques ou illustrations inutiles.

---

# 17. LOADING STATES

Les skeletons doivent avoir exactement la même logique visuelle que les composants finaux.

Évite les skeletons trop nombreux.

Préférer :

- quelques grandes zones animées
- transitions douces
- conservation du layout

---

# 18. MOTION

Utilise Motion uniquement pour :

- changement de vue
- ouverture de panneau
- apparition de contenu
- état de génération
- feedback utilisateur

Durées courtes :

150–250ms pour la majorité des interactions.

Évite :

- animations permanentes
- rotations inutiles
- effets flashy
- mouvements qui gênent la lecture

---

# 19. RESPONSIVE / RESIZABLE

L'application étant desktop-first, optimise particulièrement :

1366x768
1440x900
1920x1080
2560x1440

Teste les layouts avec différentes largeurs.

Les panneaux doivent être réellement redimensionnables lorsque cela apporte de la valeur.

Évite les layouts qui cassent lorsque :

- sidebar ouverte
- split view active
- fenêtre réduite
- contenu très long
- titre très long
- beaucoup de sources

---

# 20. NE PAS CASSER LES FONCTIONNALITÉS

C'est extrêmement important.

La refonte est principalement VISUELLE et UX.

Ne supprime aucune fonctionnalité existante sans raison.

Ne casse pas :

- RAG
- citations
- source filtering
- chat threads
- génération
- audio
- notes
- canvas
- recherche
- streaming
- commandes slash
- sauvegarde
- persistance
- raccourcis clavier

Réutilise les composants et hooks existants lorsqu'ils sont corrects.

Refactor uniquement lorsque nécessaire pour obtenir une meilleure architecture UI.

---

# 21. PRIORITÉ DES MODIFICATIONS

Travaille dans cet ordre :

### Phase 1 — Audit

Comprendre les composants existants.

### Phase 2 — Design tokens

Uniformiser :

- couleurs
- typography
- spacing
- radius
- borders
- shadows

### Phase 3 — Notebook shell

Refaire :

- header
- sidebar
- navigation
- layout principal

### Phase 4 — Chat

Refaire :

- messages
- citations
- composer
- actions

### Phase 5 — Sources

Refaire la liste et la sélection.

### Phase 6 — Notes

Refaire la hiérarchie et les interactions.

### Phase 7 — Generate / Audio

Harmoniser les interfaces secondaires.

### Phase 8 — Empty/loading/error states

Uniformiser toute l'expérience.

### Phase 9 — Responsive

Tester plusieurs tailles.

### Phase 10 — QA

Vérifier que rien n'a été cassé.

---

# 22. RÈGLE IMPORTANTE : NE PAS AJOUTER DE COMPLEXITÉ

Si un composant peut être rendu plus simple, fais-le.

Si deux composants ont la même fonction visuelle, crée un composant partagé.

Examine notamment :

- Panel
- SidePanel
- ViewHeader
- IconButton
- EmptyState
- StatusBadge
- Skeleton
- Toast

Évite de créer encore une nouvelle variante visuelle si une abstraction existante peut être améliorée.

---

# 23. CONSERVER L'IDENTITÉ JARVIS

Je ne veux PAS que Jarvis devienne une copie de NotebookLM.

NotebookLM doit servir de référence UX :

- simplicité
- hiérarchie
- espace
- orientation documentaire
- sources visibles
- chat central
- contenu prioritaire

Mais Jarvis doit conserver :

- son identité
- son accent
- ses fonctionnalités IA
- son côté desktop
- ses capacités multi-agents
- son intégration IDE
- son système de notebooks

Le résultat doit être :

**Jarvis OS + principes UX NotebookLM**

et non :

**copie de NotebookLM**.

---

# 24. AVANT DE CODER

Après ton audit, donne-moi d'abord un court plan de refonte comprenant :

1. problèmes UI actuels détectés
2. nouvelle architecture visuelle
3. composants à modifier
4. composants à créer éventuellement
5. design tokens à modifier
6. risques de régression

Puis commence l'implémentation.

Ne demande pas confirmation si les changements sont clairement dans le périmètre demandé.

---

# 25. APRÈS IMPLÉMENTATION

Exécute :

- TypeScript check
- lint
- tests pertinents
- build

Corrige les erreurs.

Vérifie également :

- overflow horizontal
- overflow vertical
- focus clavier
- boutons accessibles
- contrastes
- dark mode
- light mode
- fenêtre desktop étroite
- fenêtre desktop large

Enfin, donne-moi :

### Résumé

Ce qui a changé.

### Fichiers

Liste des fichiers modifiés.

### Design

Explique les principales décisions UX/UI.

### Tests

Résultat du typecheck/lint/build/tests.

### Régressions

Signale honnêtement tout problème restant.

IMPORTANT :

Ne fais pas uniquement quelques changements de couleurs.

Je veux une **vraie refonte de l'expérience visuelle et de la disposition**, avec une hiérarchie beaucoup plus proche d'un produit documentaire premium.

Le résultat doit paraître suffisamment différent pour qu'on sente une nouvelle version majeure de l'interface.