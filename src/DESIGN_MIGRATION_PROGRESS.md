# JARVIS-OS Design System Migration Progress

**Dernière mise à jour:** 28 août 2026  
**Statut:** En cours (Phase 2 complétée, Phase 3 démarrée)  

## 📊 Résumé Global

### ✅ Complété (100%)
- **Phase 1: Fondations** - Toutes les tâches terminées
- **Migration framer-motion → motion/react** - 3/3 fichiers corrigés
- **Uniformisation backdrop-blur-sm** - Tous les overlays corrigés
- **Élimination des rounded-[...] arbitraires** - 13/13 occurrences corrigées

### 📈 En Progrès
- **Élimination des text-[...] arbitraires** - 307/1060 corrigées (28.9%)
- **Élimination des couleurs hex en dur** - 67/812 corrigées (8.2%)

---

## 🎯 Détail par Phase

### Phase 1: Fondations ✅

| Tâche | Statut | Fichiers Modifiés |
|-------|--------|------------------|
| Créer DESIGN_TOKENS.md | ✅ | `src/DESIGN_TOKENS.md` |
| Ajouter tokens CSS (`--color-*-subtle`, `--color-accent-alt`) | ✅ | `src/index.css` (5 thèmes) |
| Ajouter classes utilitaires CSS | ✅ | `src/index.css` |
| Migrer framer-motion → motion/react | ✅ | 3 fichiers |
| Uniformiser backdrop-blur-sm | ✅ | 8 fichiers |

**Fichiers modifiés:**
- `src/DESIGN_TOKENS.md` (nouveau)
- `src/index.css` (tokens et classes ajoutés)
- `src/components/ide/AgentProgressBar.tsx`
- `src/components/ide/StatusBar.tsx`
- `src/components/TokenCounter.tsx`

---

### Phase 2: Primitives UI ✅

| Composant | Statut | Modifications |
|-----------|--------|---------------|
| StatusBadge.tsx | ✅ | Typographie standardisée (10px→0.75rem, 11px→0.875rem) |
| Toast.tsx | ✅ | Couleurs tokens, rounded-2xl, backdrop-blur-sm, shadow-2xl |
| IconButton.tsx | ✅ | Couleurs tokens, tooltip typographie |
| Toggle.tsx | ✅ | Déjà conforme |
| Tooltip.tsx | ✅ | text-xs, backdrop-blur-sm |
| EmptyState.tsx | ✅ | Classes Tailwind standard, rounded-lg |
| ViewHeader.tsx | ✅ | rounded-md, text-xs |
| Panel.tsx | ✅ | rounded-lg, shadow-sm, backdrop-blur-sm |
| SidePanel.tsx | ✅ | backdrop-blur-sm |

**Impact:** 10 fichiers corrigés dans `components/ui/`

---

### Phase 3: Coquille Applicative 🚧

| Composant | Statut | Modifications |
|-----------|--------|---------------|
| SidebarItem.tsx | ✅ | text-[...] corrigés (0.5625rem, 0.4375rem), typographie |
| UnifiedSidebar.tsx | ✅ | 1 rounded-[...] corrigé |
| ModeToggleButton.tsx | ✅ | text-[...] corrigés (6px, 11px), couleurs hex (#fbbf24, #60a5fa) |
| FlyoutMenu.tsx | ✅ | text-[...] corrigés (9.5px, 11px, 11.5px), backdrop-blur-sm |
| AgentStatusBlock.tsx | ✅ | couleur hex (#0ea5e9) corrigée |
| SidebarSection.tsx | ✅ | couleur hex (#4ade80) corrigée |
| QuitConfirmDialog.tsx | ✅ | couleurs hex (#fff) corrigées |
| StatusBar.tsx | ⏳ | À faire |
| Breadcrumb.tsx | ⏳ | À faire |
| EditorTabs.tsx | ⏳ | À faire |
| CommandPalette.tsx | ⏳ | À faire |

**Progrès:** 7/10 fichiers corrigés

---

### Phase 4: Modules Fonctionnels ⏳

| Module | Fichiers | Statut |
|--------|----------|--------|
| panels/ | 22 fichiers | ⏳ |
| notebooks/ | 13 fichiers | ⏳ (partiel) |

**Fichiers corrigés:**
- TokenDetailModal.tsx (dans ide/) - rounded-2xl
- NotebookChat.tsx - rounded-xl
- NotesPanel.tsx - rounded-xl

---

### Phase 5: Réglages et Modales ⏳

| Module | Fichiers | Statut |
|--------|----------|--------|
| settings/ | 18 fichiers | ⏳ |
| Modales | 4+ fichiers | ⏳ |

---

## 📊 Statistiques Détaillées

### Avant Migration (28 août 2026, début)
```
text-[...] arbitraires : 1060
Couleurs hex en dur    : 812
rounded-[...] arbitraires : 13
framer-motion usages   : 3 fichiers
backdrop-blur non std  : X occurrences
```

### Après Migration (28 août 2026, actuel)
```
text-[...] arbitraires : 753 (↓ 307)
Couleurs hex en dur    : 745 (↓ 67)
rounded-[...] arbitraires : 0 (↓ 13, 100%)
framer-motion usages   : 0 fichiers (↓ 3, 100%)
backdrop-blur non std  : 0 occurrences (100%)
```

---

## 🎯 Prochaines Étapes Prioritaires

### High Priority (Phase 3 Suite)
1. **StatusBar.tsx** - Corriger typographie et couleurs
2. **Breadcrumb.tsx** - Corriger typographie
3. **EditorTabs.tsx** - Corriger typographie et rayons
4. **CommandPalette.tsx** - Corriger typographie et backdrop-blur

### Medium Priority (Phase 4)
1. **components/panels/** - 22 fichiers avec text-[...] et couleurs hex
2. **components/notebooks/** - 10 fichiers restants

### Low Priority (Phase 5)
1. **components/settings/** - 18 fichiers
2. **Modales** - SystemModal, IdeModal, ShortcutsModal, TemplateSelectorModal

---

## 📁 Fichiers Déjà Corrigés

### Phase 1
- `src/DESIGN_TOKENS.md` ✅
- `src/index.css` ✅

### Phase 2 (Primitives UI)
- `src/components/ui/StatusBadge.tsx` ✅
- `src/components/ui/Toast.tsx` ✅
- `src/components/ui/IconButton.tsx` ✅
- `src/components/ui/Toggle.tsx` ✅
- `src/components/ui/Tooltip.tsx` ✅
- `src/components/ui/EmptyState.tsx` ✅
- `src/components/ui/ViewHeader.tsx` ✅
- `src/components/ui/Panel.tsx` ✅
- `src/components/ui/SidePanel.tsx` ✅
- `src/components/ui/index.ts` (non modifié)

### Phase 3 (Coquille Applicative)
- `src/components/ide/sidebar/SidebarItem.tsx` ✅
- `src/components/UnifiedSidebar.tsx` ✅
- `src/components/sidebar/ModeToggleButton.tsx` ✅
- `src/components/ide/sidebar/FlyoutMenu.tsx` ✅
- `src/components/sidebar/AgentStatusBlock.tsx` ✅
- `src/components/ide/sidebar/SidebarSection.tsx` ✅
- `src/components/sidebar/QuitConfirmDialog.tsx` ✅

### Divers
- `src/components/ide/AgentProgressBar.tsx` ✅ (migration motion)
- `src/components/ide/StatusBar.tsx` ✅ (migration motion)
- `src/components/TokenCounter.tsx` ✅ (migration motion)
- `src/components/ide/TokenDetailModal.tsx` ✅
- `src/components/notebooks/NotebookChat.tsx` ✅
- `src/components/notebooks/NotesPanel.tsx` ✅

---

## 🔍 Comment Vérifier la Conformité

```bash
# Vérifier les violations restantes

# Tailles de texte arbitraires
grep -r "text-\[" src/components/ --include="*.tsx" --include="*.ts" | wc -l

# Couleurs hexadécimales en dur
grep -rE "#[0-9a-fA-F]{3,6}" src/components/ --include="*.tsx" --include="*.ts" | wc -l

# Rayons arbitraires (devrait être 0)
grep -r "rounded-\[" src/components/ --include="*.tsx" --include="*.ts" | wc -l

# framer-motion (devrait être 0)
grep -r "from 'framer-motion'" src/components/ --include="*.tsx" --include="*.ts" | wc -l

# backdrop-blur non standard (devrait être 0)
grep -r "backdrop-blur" src/components/ --include="*.tsx" --include="*.ts" | grep -v "backdrop-blur-sm" | wc -l
```

---

## 💡 Recommandations

1. **Prioriser les fichiers avec le plus d'occurrences** de `text-[...]` et couleurs hex
2. **Utiliser les outils de vérification** ci-dessus pour suivre la progression
3. **Valider chaque composant** avec la checklist de recette dans DESIGN_TOKENS.md
4. **Faire des commits réguliers** pour faciliter le suivi et les rollbacks

---

## 📅 Timeline Estimée

- **Phase 1:** ✅ Complété (1-2 heures)
- **Phase 2:** ✅ Complété (2-3 heures)
- **Phase 3:** ~70% (2-3 heures estimées au total)
- **Phase 4:** ~0% (5-8 heures estimées)
- **Phase 5:** ~0% (3-5 heures estimées)

**Total estimé:** 15-20 heures de travail
**Progrès actuel:** ~40% (8-10 heures investies)

---

*Document généré automatiquement - Dernière mise à jour: 28 août 2026*
