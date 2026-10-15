# Plan d'action — Refonte UI immersive « Leanna Cockpit » (v3)

**Date :** 15 octobre 2026
**Cible :** Leanna IDE v2.0.0 → v3.0.0
**Référence visuelle :** maquette « Leanna IDE v2.0.0 » (cockpit néon violet/cyan, avatar 3D, pods d'action holographiques)

> **Objectif :** donner l'impression de **piloter une IA autonome**, pas d'utiliser un tableau de bord. La 3D et l'animation servent à rendre visibles l'état, l'intention et l'activité des agents. Elles ne doivent jamais ralentir ni gêner le travail de code.

---

## 0. Principes non négociables

| # | Principe | Conséquence concrète |
|---|----------|----------------------|
| P1 | **L'immersion encadre, l'ergonomie décide** | Monaco, le terminal, le diff et l'explorateur restent en 2D, nets, denses et lisibles. La 3D vit dans le cockpit, dans les zones d'ambiance et dans l'avatar. |
| P2 | **Chaque animation porte une information** | Une lueur, une pulsation ou une particule correspond à un état réel (agent actif, mission en cours, erreur). Pas d'animation décorative sans source de données. |
| P3 | **Mode Focus en une touche** | `Ctrl+Shift+F` coupe la 3D, les particules et l'avatar, et passe en IDE dense. L'état est mémorisé. |
| P4 | **Budget de performance strict** | ≤ 3 % CPU au repos, 60 fps sur l'éditeur, scène 3D en pause hors du viewport ou quand la fenêtre est masquée. |
| P5 | **Accessibilité intacte** | `prefers-reduced-motion`, thème high-contrast, navigation clavier complète, contraste AA sur tous les textes posés sur du verre ou du néon. |
| P6 | **Migration incrémentale** | Chaque phase est livrable derrière un feature flag `ui.v3`. Aucune réécriture « big bang ». |

---

## 1. État des lieux (existant à réutiliser)

| Domaine | Existant | Statut pour la v3 |
|---------|----------|-------------------|
| Stack | React 19, Tailwind 4 (`@theme`), `motion` 12, `lucide-react`, Electron 43 | ✅ conservée |
| Tokens | `src/index.css` (2877 l.), `src/DESIGN_TOKENS.md` v2.1, `styles/*.css` (~2100 l.) | 🔁 à refondre en couches |
| Navigation | `src/config/navigation.ts` (source unique), `GlobalSidebar.tsx` (942 l.) | 🔁 restyler, garder la logique |
| Shell IDE | `IdeView.tsx` (1470 l.), `StatusBar`, `RightDock`, `BottomDock`, `EditorTabs` | 🔁 recomposer dans le nouveau shell |
| Présence IA | `views/orb/Orb.tsx`, `Mascot.tsx` (SVG, humeurs), `useOrbState`, `OrbLiveView` | ⭐ base de l'avatar (machine d'états réutilisée) |
| Ambiance | `AmbientBackdrop.tsx` + `motion-pro.css` | 🔁 remplacée par la scène 3D, conservée en fallback |
| Données live | `useAgentEventStream`, `agentActivityStore`, `useAgentStatus`, `useMissionActivity`, `pm2Api`, `SystemHealthDashboard`, `useToken` | ✅ sources des widgets |
| Accueil | `/` redirige vers `/ide` | ➕ nouvelle route **Cockpit** |
| 3D | aucune dépendance | ➕ à introduire |

---

## 2. Direction artistique « Nebula Cockpit »

### 2.1 Palette (tokens primitifs)
- **Fonds :** `--nebula-void #070814`, `--nebula-deep #0d0f24`, `--nebula-panel rgba(20,22,48,.62)`
- **Accents :** violet `#8b5cf6` (primaire, identité Leanna), magenta `#d946ef` (IA / création), cyan `#22d3ee` (exécution / data), vert `#34d399` (succès), ambre `#f59e0b` (attente), rose `#f472b6` (sécurité / veille)
- **Rôles sémantiques par agent :** Architecte = violet, Développeur = cyan, Testeur = ambre, Optimiseur = vert, Sécuritaire = magenta. La couleur suit l'agent dans toute l'interface (liste, graphe, timeline, particules).

### 2.2 Matières
- **Verre (glass) :** `backdrop-filter: blur(18px) saturate(140%)`, bord 1 px en dégradé, reflet interne en haut. Trois niveaux : `glass-1` pour les panneaux, `glass-2` pour les cartes, `glass-3` pour les popovers.
- **Néon :** halo `box-shadow` multicouche, tokenisé (`--glow-sm/md/lg`), jamais en valeur arbitraire.
- **Profondeur :** 4 plans en z (fond 3D, panneaux, cartes flottantes, overlays), avec un léger parallaxe sur le plan 3D uniquement.

### 2.3 Typographie
- **UI :** Inter Variable (déjà présente).
- **Code et logs :** JetBrains Mono (déjà présente).
- **Display (titres, pods, chiffres clés) :** **Space Grotesk** ou **Rajdhani** via `@fontsource`, réservée aux titres de section et aux pods d'action.

### 2.4 Livrables
- [ ] Moodboard et 3 écrans clés en haute fidélité (Cockpit, IDE, Mission détail), en sombre et en clair
- [ ] `DESIGN_TOKENS.md` v3.0 : primitifs → sémantiques → composants
- [ ] Variante light « Aurora » (verre clair, accents désaturés) : obligatoire selon le principe « Dark et Light par défaut »

---

## 3. Architecture technique

### 3.1 Nouvelles dépendances

| Paquet | Rôle | Chargement |
|--------|------|------------|
| `three`, `@react-three/fiber` v9 (compatible React 19) | moteur 3D | lazy (`React.lazy`) |
| `@react-three/drei` | `View`, `Float`, `Sparkles`, `Environment`, `useGLTF` | lazy |
| `@react-three/postprocessing` | Bloom, Vignette, ChromaticAberration léger | lazy, coupé en tier « low » |
| `@pixiv/three-vrm` *(option avatar A)* | avatar VRM : expressions et lip-sync | lazy |
| `maath` | easing et damping | lazy |

> Le chunk 3D doit rester **hors du bundle initial**. Objectif : < 450 kB gz chargé après le premier rendu.

### 3.2 Arborescence cible
```
src/
  shell/                      # nouveau shell applicatif
    AppShell.tsx              # grille : topbar / sidebar / main / rail / dock
    TopBar.tsx                # logo, recherche Ctrl+K, statut système, agents x/y, profil
    NavRail.tsx               # remplace le rendu de GlobalSidebar (logique conservée)
    RightRail.tsx             # Agents IA · Missions · Ressources
    BottomBar.tsx             # auto-save, sync, workspace, ticker d'activité
  scene/                      # tout le WebGL est isolé ici
    SceneHost.tsx             # UN SEUL <Canvas> global + <View.Port/>
    quality.ts                # détection GPU, tiers high/medium/low/off
    useSceneVisibility.ts     # pause : fenêtre masquée, Focus, reduced-motion
    layers/
      NebulaBackground.tsx    # fond particulaire réactif à l'activité
      AgentConstellation.tsx  # agents = astres, missions = orbites
      ActionPods.tsx          # Analyser / Planifier / Exécuter / Vérifier / Corriger
      CorePlatform.tsx        # socle holographique sous les pods
    avatar/
      LeannaAvatar.tsx        # modèle 3D et pilotage des expressions
      avatarStateMachine.ts   # mapping OrbStatus + activité → pose/expression
      Avatar2DFallback.tsx    # wrap de Mascot.tsx existant
  views/
    CockpitView.tsx           # nouvelle page d'accueil
  design/
    tokens.css                # primitifs v3
    glass.css, glow.css, motion-v3.css
```

### 3.3 Règles du moteur 3D
1. **Un seul contexte WebGL** pour toute l'application, via le `View` de drei, pour éviter la multiplication des canvas et la perte de contexte sous Electron.
2. `frameloop="demand"` par défaut, avec `invalidate()` déclenché par les événements agents. Le rendu continu ne tourne que pendant une animation active.
3. Pause automatique sur `document.hidden`, sur `blur` de la fenêtre Electron, en mode Focus et quand le cockpit est hors écran.
4. **Tiers de qualité** (`quality.ts`), choisis selon `renderer.capabilities`, le `devicePixelRatio`, une mesure de FPS sur les 2 premières secondes et le réglage utilisateur :
   - `high` : bloom, 4k particules, avatar complet, DPR ≤ 2
   - `medium` : bloom léger, 1,5k particules, DPR ≤ 1,5
   - `low` : sans post-process, 400 particules, DPR 1
   - `off` : fallback CSS (`AmbientBackdrop`) et mascotte 2D
5. `webglcontextlost` est intercepté : bascule en `off` sans crash, avec un toast discret.
6. Electron : vérifier `app.disableHardwareAcceleration` (doit rester désactivé) et ajouter le flag `--enable-gpu-rasterization`.

### 3.4 Flux de données (aucune donnée inventée)
```
WebSocket ─► useAgentEventStream ─► agentActivityStore ─┬─► RightRail (listes)
                                                         ├─► sceneBus (événements 3D)
useOrbState / LiveAPI ───────────────────────────────────┼─► avatarStateMachine
pm2Api / SystemHealth / useToken ────────────────────────┴─► jauges Ressources
```
- Créer `src/scene/sceneBus.ts`, un petit émetteur typé (`agent:start`, `agent:done`, `mission:progress`, `tool:call`, `error`). La scène s'y abonne **hors de React** (refs mutables), ce qui évite tout re-render React à chaque frame.
- Les widgets du rail restent en React et en DOM (accessibles, sélectionnables).

---

## 4. Feuille de route par phases

> Les estimations supposent 1 dev front et 1 designer à mi-temps. Chaque phase se termine par une démo et un merge derrière `ui.v3`.

### Phase 0 — Cadrage et socle (1 semaine)
- [ ] Ajouter le feature flag `ui.v3` dans `useIdeSettings` (on/off et persistance)
- [ ] Mesurer la baseline : temps au premier rendu, CPU au repos, FPS de l'éditeur, taille du bundle (`npm run build` + `ui:audit`)
- [ ] Faire l'inventaire des écrans et de leur priorité (Cockpit, IDE, Pilotage, Missions, puis le reste)
- [ ] Choisir l'avatar (voir §5) et valider la DA
- **Critère de sortie :** baseline chiffrée dans `docs/generated/ui-baseline.md`, DA validée

### Phase 1 — Design system v3 « Nebula » (2 semaines)
- [ ] `design/tokens.css` : primitifs, sémantiques, couleurs par agent, glow, glass, profondeur, durées et easings
- [ ] Mapper les tokens v2 (`--bg-base`, `--accent-primary`…) vers la v3 pour garder la compatibilité de tous les composants existants
- [ ] Restyler les primitives `src/components/ui/*` : `Button` (variantes `holo`, `ghost`, `danger`), `Panel` (glass), `StatusBadge` (pastille pulsante), `Tabs`, `Tooltip`, `Modal`, `Toast`, `Skeleton` (shimmer néon)
- [ ] Nouveaux composants : `GlowCard`, `RingGauge` (CPU/RAM/Tokens), `ProgressBeam`, `AgentChip`, `HoloButton`
- [ ] Unifier les fichiers `motion-pro.css`, `pro-polish.css` et `workspace-pro.css` dans `motion-v3.css` et supprimer les doublons
- [ ] Mettre à jour `DESIGN_TOKENS.md` en v3.0
- **Critère de sortie :** page « storybook » interne `/dev/ui` qui montre toutes les primitives en sombre, en clair et en high-contrast, avec 0 violation `jsx-a11y`

### Phase 2 — Nouveau shell applicatif (2 semaines)
- [ ] `AppShell` : grille CSS (topbar 64 px, rail gauche 240/72 px repliable, zone principale, rail droit 320 px repliable, bottom bar 40 px)
- [ ] `TopBar` : recherche globale (`GlobalCommandPalette` réutilisée, `Ctrl+K`), pastille « Système actif », compteur « Agents 5/5 », notifications, thème, profil (`UserProfileContext`)
- [ ] `NavRail` : rendu néon des `NAV_GROUPS`, badges dynamiques (agents actifs, missions en attente), carte « Leanna, votre copilote » avec mini-orbe, tâche en cours et contrôles voix (micro, live)
- [ ] `RightRail` : sections Agents IA, Missions en cours et Ressources, chacune repliable et réordonnable
- [ ] `BottomBar` : auto-save, sync, workspace, branche Git, ticker « N agents exécutent des tâches en parallèle… »
- [ ] Brancher `IdeView` dans le shell sans changer sa logique, et alléger `StatusBar` et `RightDock`, qui deviennent redondants
- [ ] Responsive : en dessous de 1280 px, le rail droit passe en tiroir ; en dessous de 1024 px, le rail gauche passe en icônes
- **Critère de sortie :** toutes les routes existantes fonctionnent dans le nouveau shell, sans régression des tests `test:ui`

### Phase 3 — Moteur 3D et ambiance (2 semaines)
- [ ] `SceneHost`, `quality.ts`, `useSceneVisibility`, `sceneBus`
- [ ] `NebulaBackground` : champ de particules et nébuleuse en shader (bruit fBm) ; la densité et la vitesse suivent le nombre d'agents actifs
- [ ] Réglage « Intensité visuelle » dans Paramètres : Off / Sobre / Standard / Cinématique
- [ ] Mode Focus (`Ctrl+Shift+F`) et respect de `prefers-reduced-motion`, qui force `low` sans mouvement de caméra
- [ ] Fallback `off` via `AmbientBackdrop` existant
- **Critère de sortie :** budgets de perf du §7 tenus sur la machine de référence et sur un iGPU Intel

### Phase 4 — Avatar Leanna 3D (3 semaines, en parallèle de la phase 3 côté asset)
- [ ] Produire ou acquérir l'asset (voir §5) : modèle, rig, blendshapes (yeux, bouche A/I/U/E/O, sourire, surprise, concentration)
- [ ] `avatarStateMachine.ts` : réutiliser les humeurs de `Mascot.tsx` (`sleep`, `search`, `idle`, `listen`, `talk`, `think`, `muted`, `happy`, `celebrate`) et ajouter `point` (désigne un pod ou un panneau), `alert` (erreur) et `present` (fin de mission)
- [ ] Lip-sync piloté par l'amplitude audio déjà calculée pour `Orb`/`Mascot` (`amp`)
- [ ] Regard qui suit le curseur (comme la mascotte SVG actuelle), avec un amortissement
- [ ] Bulle de dialogue DOM (et non 3D, pour la lisibilité et les lecteurs d'écran) ancrée sur la tête : « Je suis Leanna ! Prête à accomplir tes missions »
- [ ] L'orbe holographique tenue dans la main reprend le composant `Orb` en version 3D (sphère et anneau orbital) et pulse avec la voix
- **Critère de sortie :** l'avatar réagit aux 12 états, sans fuite mémoire après 30 minutes (heap stable)

### Phase 5 — Cockpit (page d'accueil) (2 semaines)
- [ ] Route `ROUTES.cockpit = '/'` : supprimer la redirection vers `/ide` et ajouter une entrée « Accueil » dans `navigation.ts`
- [ ] Composition : avatar au centre, aperçu du fichier actif à gauche (Monaco en lecture seule, ou dernier diff), terminal et logs en bas à gauche, rail droit
- [ ] **Pods d'action** (3D cliquables et doublés de vrais `<button>` DOM pour l'accessibilité) :
  | Pod | Action réelle | Couleur |
  |-----|---------------|---------|
  | Analyser | lance une mission d'analyse sur le projet ou la sélection | bleu |
  | Planifier | ouvre la création de mission (`MissionCreatedPrompt`) en mode plan | violet |
  | Exécuter | reprend ou lance la mission sélectionnée | cyan |
  | Vérifier | lance les tests et la vérification (pipeline JEV) | ambre |
  | Corriger | lance une mission de correction sur les erreurs courantes | magenta |
- [ ] Le pod de la phase en cours de la mission active s'illumine, et l'avatar le désigne (état `point`)
- [ ] Interaction : survol (élévation et halo), clic (impulsion vers le socle), raccourcis `1` à `5`
- [ ] État vide (aucun projet) : l'avatar propose d'ouvrir un projet (`StartupProjectModal`)
- **Critère de sortie :** les 5 pods déclenchent de vraies actions et sont testés en E2E

### Phase 6 — Visualisation des agents et missions (2 semaines)
- [ ] `AgentConstellation` dans Pilotage : chaque agent est un astre coloré, ses outils sont des satellites et ses échanges des faisceaux lumineux (événements `sceneBus`)
- [ ] Missions : anneaux de progression autour de l'avatar ou du socle, synchronisés avec `ProgressBeam` dans le rail
- [ ] Timeline (`MissionTimelineView`) restylée : piste néon, nœuds lumineux et replay animé
- [ ] Animation de handoff entre agents (particule voyageant d'un astre à l'autre) quand un agent délègue
- **Critère de sortie :** une mission multi-agents réelle est lisible visuellement de bout en bout

### Phase 7 — Motion et sound design (1 semaine)
- [ ] Étendre `lib/motion.ts` avec des presets `enter`, `exit`, `hover-lift`, `pulse-status`, `beam`, `stagger-list` (durées 120, 200, 320 et 600 ms ; easing `cubic-bezier(.2,.8,.2,1)`)
- [ ] Transitions de route : fondu et léger zoom de caméra en 3D
- [ ] Sons subtils (`lib/sound.ts`, dossier `sounds/`) : début de mission, fin, erreur, clic sur un pod, désactivables et à volume par défaut faible
- [ ] Micro-interactions : ripple sur les boutons holo, compteurs qui défilent pour les jauges, curseur de saisie néon dans le chat
- **Critère de sortie :** guide motion documenté, tous les sons désactivables

### Phase 8 — Qualité, accessibilité et performance (1,5 semaine)
- [ ] Audit WCAG 2.1 AA : contraste sur verre (opacité minimale de panneau garantie), focus visibles néon, ordre de tabulation, `aria-live` pour les statuts agents
- [ ] Profiling : Chrome DevTools Performance et `renderer.info` (draw calls < 150, triangles < 300k en `high`)
- [ ] Tests : snapshots visuels (Playwright) des 3 thèmes × 3 tiers, tests unitaires de `avatarStateMachine` et `quality.ts`, et test de perte de contexte WebGL
- [ ] Soak de 2 h avec cockpit ouvert et missions en boucle : mémoire et GPU stables
- **Critère de sortie :** les budgets du §7 sont tenus et les tests sont verts

### Phase 9 — Déploiement (1 semaine)
- [ ] Bêta : `ui.v3` activé par défaut pour les nouveaux profils, avec un bouton « Revenir à l'interface classique »
- [ ] Onboarding : visite guidée de 4 étapes animée par l'avatar
- [ ] Collecte de télémétrie locale (OpenTelemetry déjà présent) : FPS moyen, tier choisi, usage du mode Focus
- [ ] Retrait de l'ancien shell et des CSS v2 orphelins, puis mise à jour de `README`, `ARCHITECTURE.md` et `ROADMAP.md`

**Durée totale estimée : environ 17 à 18 semaines** (environ 13 avec du parallélisme sur les phases 3, 4 et 6).

---

## 5. Décision : l'avatar

| Option | Description | Avantages | Inconvénients | Recommandation |
|--------|-------------|-----------|---------------|----------------|
| **A. Modèle VRM** (`@pixiv/three-vrm`) | Personnage 3D stylisé anime, créé avec VRoid Studio puis retouché | expressions et lip-sync natifs, format ouvert, 2–8 Mo | il faut un rig propre ; le rendu dépend du shader MToon | ⭐ **Recommandée** |
| B. GLB sur mesure (Blender) | modèle commandé à un artiste 3D | qualité maximale, proche de la maquette | coût et délai élevés, blendshapes à créer | si le budget le permet |
| C. Vidéo pré-rendue par état (WebM alpha) | boucles rendues hors ligne | rendu le plus fidèle à la maquette, faible coût GPU | pas de suivi du regard, transitions rigides, poids élevé | fallback « medium » |
| D. Mascotte SVG actuelle restylée | évolution de `Mascot.tsx` | déjà fonctionnelle, très léger | moins immersive | **fallback `low` et `off`** |

> **Point d'attention :** l'avatar doit être une création originale (licence claire, cession des droits), et non un modèle trouvé en ligne sans licence.

---

## 6. Correspondance maquette → fonctionnalités réelles

| Élément de la maquette | Source de données | À créer ou adapter |
|------------------------|-------------------|--------------------|
| « Système actif » | santé du serveur et du WebSocket (`ConnectionBanner`) | pastille TopBar |
| « Agents : 5/5 » | `agentActivityStore` | compteur TopBar |
| Liste Agents IA (Actif, En cours, Veille) | `useAgentStatus`, `AgentFleetPanel` | `RightRail/AgentsSection` |
| Missions en cours et % | `MissionPanel`, `useMissionActivity` | `RightRail/MissionsSection` |
| Ressources CPU, RAM et Tokens | `pm2Api`, `SystemHealthDashboard`, `useToken` | `RingGauge` ×3 |
| Projet et branche | `useWorkspaceState`, Git | pied du rail droit |
| Terminal (Logs, Sortie, Erreurs) | `TerminalPanel`, `useTerminal`, `AssistantLogsPanel` | dock bas restylé |
| Carte « Tâche en cours » | mission active | NavRail |
| Contrôles voix (micro, live) | `LiveAPIContext`, `useAudio` | NavRail |
| « 3 agents exécutent des tâches en parallèle… » | `agentActivityStore` | ticker BottomBar |
| Auto-save, Synchronisé, Workspace | `useIdeSettings`, `useWorkspaceState` | BottomBar |

> La règle P2 s'applique ici : un élément de la maquette sans source de données réelle n'est pas affiché, ou il est marqué « bientôt ».

---

## 7. Budgets et KPI

| Mesure | Cible |
|--------|-------|
| Bundle initial (hors chunk 3D) | ≤ baseline + 40 kB gz |
| Chunk 3D (lazy) | ≤ 450 kB gz, sans compter l'asset avatar |
| Asset avatar | ≤ 8 Mo, chargé après l'interactivité |
| Time-to-interactive | ≤ baseline + 150 ms |
| FPS cockpit (`high`, GPU dédié) | ≥ 55 |
| FPS cockpit (`medium`, iGPU) | ≥ 45 |
| FPS de l'éditeur (cockpit masqué) | 60, et 0 frame WebGL rendue |
| CPU au repos (fenêtre visible, aucune activité) | ≤ 3 % |
| CPU avec la fenêtre masquée | ≈ 0 % (rendu en pause) |
| Mémoire après 2 h | dérive < 50 Mo |
| Accessibilité | 0 violation axe-core critique, contraste AA |

---

## 8. Risques et parades

| Risque | Impact | Parade |
|--------|--------|--------|
| GPU faibles ou perte de contexte | crash ou lenteur | tiers auto, fallback `off`, gestion de `webglcontextlost` |
| Immersion au détriment de la productivité | rejet utilisateur | mode Focus, 3D cantonnée au cockpit, réglage d'intensité |
| Lisibilité du texte sur le verre | accessibilité | opacité minimale de panneau, tests de contraste automatisés |
| Dérive du périmètre (« tout en 3D ») | retard | règle P1, revue de DA à chaque phase |
| Coût de l'asset avatar | budget | VRM (option A) et fallback SVG existant |
| Régressions sur une base volumineuse (`IdeView` 1470 l., `GlobalSidebar` 942 l.) | bugs | flag `ui.v3`, refonte du rendu seulement (la logique ne change pas), tests `test:ui` |
| Licence des polices et assets | légal | uniquement des fichiers OFL ou des créations commandées avec cession |

---

## 9. Prochaines actions immédiates (semaine 1)

1. Valider ce plan et choisir l'option d'avatar (§5).
2. Créer le flag `ui.v3` et mesurer la baseline de performance.
3. Prototyper un `SceneHost` minimal (fond nébuleuse et un pod cliquable) pour mesurer le coût réel sous Electron.
4. Lancer la production des maquettes haute fidélité (Cockpit, IDE, Mission) et la commande de l'asset avatar.
5. Rédiger `DESIGN_TOKENS.md` v3 (palette, verre, glow, couleurs par agent).
