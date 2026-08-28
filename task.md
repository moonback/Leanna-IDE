JARVIS-OS
Plan d'action — Modernisation UI/UX
Refonte de l'apparence et de la disposition des composants pour un rendu professionnel et moderne
Périmètre : dossier components/ (124 fichiers)
Date : 28 août 2026

1. Résumé du diagnostic
L'audit du dossier components/ (124 fichiers, ~46 000 lignes) montre une base technique saine — un vrai système de variables CSS existe (var(--text-primary), var(--bg-panel), var(--accent-primary)...) — mais son application composant par composant a dérivé au fil du développement. Le résultat perçu est celui d'un outil interne plutôt que d'un produit fini, pour quatre raisons principales :
1. Typographie trop petite et non standardisée — la majorité des textes de l'app se situe entre 8px et 11px, avec des dizaines de valeurs arbitraires différentes (text-[9.5px], text-[10.5px], text-[12.5px]...) au lieu d'une échelle fixe.
2. Couleurs hors-tokens — plus de 40 couleurs hexadécimales codées en dur pour les statuts et badges, en parallèle du système de tokens existant, ce qui casse la cohérence entre thème clair et sombre.
3. Rayons et ombres incohérents — 7 valeurs de rounded- et 5 de shadow- utilisées sans hiérarchie visuelle claire entre boutons, cartes et modales.
4. Dette technique visible à l'écran — deux librairies d'animation en parallèle (motion/react et framer-motion) et un effet de flou d'arrière-plan (backdrop-blur) appliqué de façon inégale selon les panneaux.

Le plan ci-dessous propose un design system resserré (section 2), un ordre de migration par priorité (section 3), puis des recommandations par famille de composants (section 4) et une checklist de recette (section 5).
2. Design system cible
Objectif : remplacer les valeurs arbitraires par une échelle fixe et documentée, appliquée via les tokens CSS déjà en place plutôt que des styles inline.
2.1 Échelle typographique
Rôle
Ancienne pratique
Nouvelle échelle
Usage
Micro-label
text-[8px] / [9px]
11px (text-xs)
Badges, tags, timestamps
Corps secondaire
text-[10px] / [10.5px]
12px (text-sm)
Texte de support, légendes
Corps principal
text-[11px] / [12px]
14px (text-base)
Contenu courant, listes, chat
Sous-titre
text-[12.5px] / [13px]
16px (text-lg)
Titres de section, en-têtes de panneau
Titre
text-[14px] et ponctuel
20–24px (text-xl/2xl)
Titres de vue, modales principales

Règle : plus aucune taille en pixel arbitraire (text-[Npx]) dans le code applicatif — uniquement ces 5 paliers, définis une fois en config Tailwind et réutilisés partout.
2.2 Palette de couleurs sémantiques
Conserver le système de tokens existant (var(--text-primary), var(--bg-panel), etc.) et y ajouter des tokens de statut manquants pour éliminer les hex en dur :
Token proposé
Rôle
Remplace
--color-success / -subtle
États positifs, validations
#4ade80, #10b981, #34d399, #22c55e...
--color-error / -subtle
Erreurs, suppressions
#ef4444, #f87171, #dc2626, #b91c1c
--color-warning / -subtle
Avertissements
#f59e0b, #fbbf24, #f97316, #fb923c
--color-info / -subtle
Information, liens
#60a5fa, #38bdf8, #3b82f6, #06b6d4
--color-accent-alt / -subtle
Mise en avant secondaire
#a78bfa, #8b5cf6, #a855f7, #6366f1

Chaque token "-subtle" correspond à la même teinte en fond aplati à faible opacité (actuellement recréé à la main via color-mix(in srgb, #hex 12%, transparent) dans plusieurs fichiers) : le token la fige une bonne fois pour toutes.
2.3 Rayons et élévation
Élément
Rayon
Ombre
Bouton, input, badge
rounded-md (6px)
aucune / shadow-sm au focus
Carte, panneau
rounded-lg (8px)
shadow-sm
Popover, dropdown, tooltip
rounded-xl (12px)
shadow-lg
Modale, dialogue
rounded-2xl (16px)
shadow-2xl

Supprimer les valeurs arbitraires (rounded-[14px], rounded-[28px], rounded-[18px]...) au profit de ces 4 paliers, cohérents avec la hiérarchie visuelle (plus l'élément est "au-dessus" de l'interface, plus le rayon et l'ombre sont marqués).
2.4 Nettoyage technique préalable
Choisir une seule librairie d'animation entre motion/react (79 usages) et framer-motion (3 usages), et migrer les 3 fichiers restants.
Uniformiser le flou d'arrière-plan (backdrop-blur-sm partout où un panneau flotte au-dessus du contenu : modales, dropdowns, banners), pour que l'effet "verre dépoli" soit un langage visuel cohérent et pas une exception ponctuelle.
3. Plan de migration par priorité
Migrer 124 fichiers d'un coup est risqué. L'ordre proposé va du plus visible/rentable au plus long à traiter.
Phase 1 — Fondations (config, pas de régression visuelle)
Ajouter les 5 paliers typographiques et les tokens de couleur de statut dans la config Tailwind / les variables CSS globales.
Documenter les 4 paliers rayon/ombre dans un fichier de référence (ex. DESIGN_TOKENS.md) pour que tout nouveau composant s'y réfère.
Trancher et migrer motion/react vs framer-motion.
Phase 2 — Primitives UI (components/ui/)
Ce sont les briques réutilisées partout (Panel, IconButton, Toggle, StatusBadge, Tooltip, Toast, EmptyState, SidePanel...). Les corriger ici propage automatiquement l'amélioration à tous les écrans qui les consomment.
StatusBadge, Toast : brancher sur les nouveaux tokens de couleur au lieu des hex en dur.
Panel, SidePanel : appliquer les paliers rayon/ombre définis en 2.3.
IconButton, Toggle, Tooltip : passer sur l'échelle typographique standard.
Phase 3 — Coquille applicative (structure, navigation)
components/sidebar/, components/ide/sidebar/, StatusBar, Breadcrumb, EditorTabs, CommandPalette — l'ossature visible en permanence. Un passage ici change immédiatement la perception globale de l'app.
Phase 4 — Modules fonctionnels (panels, notebooks)
components/panels/ (22 fichiers) et components/notebooks/ (13 fichiers) : volume le plus important. Traiter panel par panel en réutilisant les primitives déjà corrigées en Phase 2, pour limiter le travail à la substitution de classes plutôt qu'à une refonte.
Phase 5 — Réglages et modales (settings/, templates/)
components/settings/ (18 fichiers) et les modales (SystemModal, IdeModal, ShortcutsModal, TemplateSelectorModal) : moins consultées au quotidien, à traiter en dernier.
4. Recommandations par famille de composants
4.1 Sidebar et navigation
Uniformiser les libellés sur le palier "corps secondaire" (12px) au lieu du mélange 9–11px actuel.
Un seul style d'icône active/inactive, piloté par --accent-primary plutôt que des couleurs ad hoc par item.
4.2 Panneaux (AgentPanel, MissionPanel, SystemHealthDashboard...)
En-tête de panneau systématique : titre en palier "sous-titre" (16px), actions alignées à droite, même hauteur d'en-tête partout (actuellement variable selon le fichier).
Remplacer les indicateurs de statut colorés en dur (points, badges) par les tokens --color-success/-warning/-error.
4.3 Module notebooks
Cohérent avec le plan déjà engagé sur ce module (style NotebookLM) : appliquer en priorité les tokens --notebook-* existants aux nouveaux paliers typo/rayon, pour que ce module serve de vitrine du nouveau design system avant généralisation.
4.4 Modales et overlays
Toutes les modales (SystemModal, IdeModal, ShortcutsModal, CriticalEditConfirm...) sur rounded-2xl + shadow-2xl + backdrop-blur-sm, avec un en-tête de taille fixe (titre 16px, bouton fermeture en haut à droite).
5. Checklist de recette
À valider avant de considérer un composant "migré" :
Aucune classe text-[Npx] arbitraire restante — uniquement les 5 paliers.
Aucune couleur hexadécimale en dur pour un statut — uniquement les tokens --color-*.
Rayon et ombre cohérents avec le niveau d'élévation de l'élément (2.3).
Rendu identique en thème clair et en thème sombre.
Une seule librairie d'animation utilisée dans le fichier.

Ce document sert de référence de suivi : chaque phase peut être cochée au fur et à mesure de son application.