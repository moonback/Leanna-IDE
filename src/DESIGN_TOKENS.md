# JARVIS-OS Design System Tokens

**Version:** 1.0.0  
**Date:** 28 août 2026  
**Périmètre:** Tous les composants React dans `src/components/`  

Ce document définit le design system cible pour la modernisation UI/UX de JARVIS-OS. Tous les nouveaux composants doivent s'y référer.

---

## 1. Échelle Typographique

### Paliers Standardisés

| Rôle | Taille | Classe Tailwind | Usage |
|------|--------|-----------------|-------|
| Micro-label | 11px | `text-xs` | Badges, tags, timestamps |
| Corps secondaire | 12px | `text-sm` | Texte de support, légendes |
| Corps principal | 14px | `text-base` | Contenu courant, listes, chat |
| Sous-titre | 16px | `text-lg` | Titres de section, en-têtes de panneau |
| Titre | 20-24px | `text-xl` / `text-2xl` | Titres de vue, modales principales |

### Règles
- ❌ **Interdit** : `text-[Npx]` avec des valeurs arbitraires (8px, 9.5px, 10.5px, 12.5px, etc.)
- ✅ **Autorisé** : Uniquement les 5 paliers ci-dessus via classes Tailwind standard
- ✅ **Autorisé** : `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`

### Migration
Remplacer toutes les occurrences de :
- `text-[8px]`, `text-[9px]`, `text-[9.5px]` → `text-xs` (11px)
- `text-[10px]`, `text-[10.5px]` → `text-sm` (12px)
- `text-[11px]`, `text-[12px]` → `text-base` (14px)
- `text-[12.5px]`, `text-[13px]`, `text-[14px]` → `text-lg` (16px)
- `text-[14px]` et plus → `text-xl` (20px) ou `text-2xl` (24px)

---

## 2. Palette de Couleurs Sémantiques

### Tokens Existant (à conserver)

| Token | Rôle | Thème Dark | Thème Light |
|-------|------|------------|-------------|
| `--color-success` | États positifs, validations | `#4ade80` | `#059669` |
| `--color-warning` | Avertissements | `#fcd34d` | `#d97706` |
| `--color-error` | Erreurs, suppressions | `#fb7185` | `#dc2626` |
| `--color-info` | Information, liens | `#67e8f9` | `#0891b2` |
| `--accent-primary` | Accent principal | `#818cf8` | `#4f46e5` |
| `--accent-secondary` | Accent secondaire | `#06b6d4` | `#0891b2` |

### Nouveaux Tokens à Ajouter

#### Tokens "-subtle" (fond aplati à faible opacité)

| Token | Description | Valeur (exemple dark) | Usage |
|-------|-------------|----------------------|-------|
| `--color-success-subtle` | Fond success léger | `color-mix(in srgb, var(--color-success) 12%, transparent)` | Badges, fonds de notification |
| `--color-warning-subtle` | Fond warning léger | `color-mix(in srgb, var(--color-warning) 12%, transparent)` | Badges, fonds d'avertissement |
| `--color-error-subtle` | Fond error léger | `color-mix(in srgb, var(--color-error) 12%, transparent)` | Badges, fonds d'erreur |
| `--color-info-subtle` | Fond info léger | `color-mix(in srgb, var(--color-info) 12%, transparent)` | Badges, fonds d'information |
| `--color-accent-alt` | Mise en avant secondaire | `#a78bfa` (dark) / `#6366f1` (light) | Accent alternatif |
| `--color-accent-alt-subtle` | Fond accent-alt léger | `color-mix(in srgb, var(--color-accent-alt) 12%, transparent)` | Fonds secondaires |

### Règles
- ❌ **Interdit** : Couleurs hexadécimales en dur (`#4ade80`, `#ef4444`, `#f59e0b`, etc.)
- ✅ **Autorisé** : Uniquement les tokens CSS (`var(--color-success)`, `var(--color-error-subtle)`, etc.)
- ✅ **Autorisé** : `color-mix(in srgb, var(--color-*) X%, transparent)` pour les variantes

### Classes Utilitaires CSS (déjà définies dans index.css)

```css
/* Success */
.text-success         { color: var(--color-success); }
.bg-success-subtle    { background-color: color-mix(in srgb, var(--color-success) 10%, transparent); }
.border-success-subtle{ border-color: color-mix(in srgb, var(--color-success) 25%, transparent); }
.badge-success { background-color: color-mix(in srgb, var(--color-success) 12%, transparent); color: var(--color-success); border: 1px solid color-mix(in srgb, var(--color-success) 25%, transparent); }

/* Error */
.text-error           { color: var(--color-error); }
.bg-error-subtle      { background-color: color-mix(in srgb, var(--color-error) 10%, transparent); }
.border-error-subtle  { border-color: color-mix(in srgb, var(--color-error) 25%, transparent); }
.badge-error { background-color: color-mix(in srgb, var(--color-error) 12%, transparent); color: var(--color-error); border: 1px solid color-mix(in srgb, var(--color-error) 25%, transparent); }

/* Warning */
.text-warning         { color: var(--color-warning); }
.bg-warning-subtle    { background-color: color-mix(in srgb, var(--color-warning) 10%, transparent); }
.border-warning-subtle{ border-color: color-mix(in srgb, var(--color-warning) 25%, transparent); }
.badge-warning { background-color: color-mix(in srgb, var(--color-warning) 12%, transparent); color: var(--color-warning); border: 1px solid color-mix(in srgb, var(--color-warning) 25%, transparent); }

/* Info */
.text-info            { color: var(--color-info); }
.bg-info-subtle       { background-color: color-mix(in srgb, var(--color-info) 10%, transparent); }
.badge-info { background-color: color-mix(in srgb, var(--color-info) 12%, transparent); color: var(--color-info); border: 1px solid color-mix(in srgb, var(--color-info) 25%, transparent); }
```

---

## 3. Rayons et Élévation

### Paliers de Rayons (border-radius)

| Élément | Rayon | Classe Tailwind | Variable CSS |
|---------|-------|-----------------|--------------|
| Bouton, Input, Badge | 6px | `rounded-md` | `var(--radius-md)` |
| Carte, Panneau | 8px | `rounded-lg` | `var(--radius-lg)` |
| Popover, Dropdown, Tooltip | 12px | `rounded-xl` | `var(--radius-xl)` |
| Modale, Dialogue | 16px | `rounded-2xl` | `var(--radius-2xl)` |

### Paliers d'Ombres

| Élément | Ombre | Classe Tailwind | Variable CSS |
|---------|-------|-----------------|--------------|
| Bouton, Input, Badge | aucune | - | - |
| Bouton, Input (focus) | légère | `shadow-sm` | `var(--shadow-sm)` |
| Carte, Panneau | légère | `shadow-sm` | `var(--shadow-sm)` |
| Popover, Dropdown, Tooltip | marquée | `shadow-lg` | `var(--shadow-lg)` |
| Modale, Dialogue | très marquée | `shadow-2xl` | `var(--shadow-xl)` |

### Règles
- ❌ **Interdit** : Valeurs arbitraires (`rounded-[14px]`, `rounded-[18px]`, `rounded-[28px]`, etc.)
- ❌ **Interdit** : Ombres arbitraires (`shadow-[...]`)
- ✅ **Autorisé** : Uniquement les 4 paliers ci-dessus
- ✅ **Autorisé** : `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`
- ✅ **Autorisé** : `shadow-sm`, `shadow-lg`, `shadow-2xl`

### Hiérarchie Visuelle

```
Bouton/Input/Badge (6px) → Carte/Panneau (8px) → Popover/Tooltip (12px) → Modale (16px)
  ↓                          ↓                        ↓                     ↓
aucune/shadow-sm       shadow-sm               shadow-lg           shadow-2xl
```

Plus l'élément est "au-dessus" de l'interface, plus le rayon et l'ombre sont marqués.

---

## 4. Effets Visuels

### Backdrop Blur (Effet Verre Dépoli)

| Élément | Blur | Classe Tailwind |
|---------|------|-----------------|
| Modales | 12-16px | `backdrop-blur-sm` |
| Dropdowns | 12-16px | `backdrop-blur-sm` |
| Popovers | 12-16px | `backdrop-blur-sm` |
| Tooltips | 12-16px | `backdrop-blur-sm` |
| Banners | 12-16px | `backdrop-blur-sm` |

**Règle** : ✅ Utiliser **UNIQUEMENT** `backdrop-blur-sm` pour tous les overlays.

### Animation

**Décision** : Garder **`motion/react`** uniquement (79 usages vs 3 pour framer-motion).

**Migration** : Convertir les 3 fichiers utilisant `framer-motion` vers `motion/react`.

---

## 5. Checklist de Recette par Composant

Pour qu'un composant soit considéré comme "migré", il doit passer toutes ces vérifications :

- [ ] ✅ Aucune classe `text-[Npx]` arbitraire → uniquement `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`
- [ ] ✅ Aucune couleur hexadécimale en dur (`#...`) → uniquement les tokens `var(--color-*)`
- [ ] ✅ Rayons cohérents : `rounded-md` (6px), `rounded-lg` (8px), `rounded-xl` (12px), `rounded-2xl` (16px)
- [ ] ✅ Ombres cohérentes : `shadow-sm`, `shadow-lg`, `shadow-2xl`
- [ ] ✅ `backdrop-blur-sm` pour tous les overlays (modales, dropdowns, popovers, tooltips)
- [ ] ✅ Une seule librairie d'animation : `motion/react`
- [ ] ✅ Rendu identique en thème clair (`data-theme="light"`) et sombre (`data-theme="dark"`)
- [ ] ✅ Accessibilité : contraste de texte ≥ 4.5:1, focus visible

---

## 6. Plan de Migration par Phase

### Phase 1 : Fondations (Pas de régression visuelle)
- [ ] Ajouter les nouveaux tokens CSS dans `src/index.css`
- [ ] Créer ce fichier `DESIGN_TOKENS.md` ✅
- [ ] Migrer les 3 fichiers framer-motion → motion/react
- [ ] Uniformiser `backdrop-blur-sm` dans tout le codebase

### Phase 2 : Primitives UI (`components/ui/`)
- [ ] `StatusBadge.tsx` : typographie + couleurs tokens
- [ ] `Toast.tsx` : couleurs tokens + backdrop-blur-sm
- [ ] `Panel.tsx` : rayons + ombres
- [ ] `SidePanel.tsx` : rayons + ombres
- [ ] `IconButton.tsx` : typographie
- [ ] `Toggle.tsx` : typographie
- [ ] `Tooltip.tsx` : typographie + backdrop-blur-sm
- [ ] `EmptyState.tsx` : typographie
- [ ] `ViewHeader.tsx` : typographie

### Phase 3 : Coquille Applicative
- [ ] `components/sidebar/` : typographie + couleurs
- [ ] `components/ide/sidebar/` : typographie + couleurs
- [ ] `StatusBar.tsx` : typographie
- [ ] `Breadcrumb.tsx` : typographie
- [ ] `EditorTabs.tsx` : typographie + rayons
- [ ] `CommandPalette.tsx` : typographie + backdrop-blur-sm

### Phase 4 : Modules Fonctionnels
- [ ] `components/panels/` (22 fichiers) : typographie + couleurs + rayons
- [ ] `components/notebooks/` (13 fichiers) : appliquer tokens --notebook-*

### Phase 5 : Réglages et Modales
- [ ] `components/settings/` (18 fichiers)
- [ ] `SystemModal.tsx`, `IdeModal.tsx`, `ShortcutsModal.tsx`, `TemplateSelectorModal.tsx`

---

## 7. Exemples de Migration

### Avant : StatusBadge.tsx (actuel)
```tsx
// ❌ Tailles arbitraires
const fontSize = size === 'sm' ? '10px' : '11px';
const padding = size === 'sm' ? '2px 6px' : '3px 8px';

// ❌ Couleurs en dur
color: '#4ade80',
backgroundColor: 'rgba(16,185,129,0.12)',
```

### Après : StatusBadge.tsx (migré)
```tsx
// ✅ Tailles standardisées
const fontSize = size === 'sm' ? 'text-sm' : 'text-base'; // 12px ou 14px
const padding = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-1';

// ✅ Couleurs via tokens
color: 'var(--color-success)',
backgroundColor: 'var(--color-success-subtle)',
// Ou via classes utilitaires
className="badge-success"
```

### Avant : Toast.tsx (actuel)
```tsx
// ❌ Couleurs hex en dur
const COLORS = {
  success: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', icon: '#10b981' },
  error:   { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)',  icon: '#ef4444' },
};
// ❌ backrop-blur incohérent
backdrop-blur-xl
```

### Après : Toast.tsx (migré)
```tsx
// ✅ Couleurs via tokens
const COLORS = {
  success: { bg: 'var(--color-success-subtle)', border: 'var(--border-success-subtle)', icon: 'var(--color-success)' },
  error:   { bg: 'var(--color-error-subtle)',  border: 'var(--border-error-subtle)',  icon: 'var(--color-error)' },
};
// ✅ backdrop-blur standardisé
backdrop-blur-sm
```

---

## 8. Outils de Vérification

### Pour trouver les violations :

```bash
# Tailles de texte arbitraires
grep -r "text-\[" src/components/ --include="*.tsx" --include="*.ts"

# Couleurs hex en dur
grep -rE "#[0-9a-fA-F]{3,6}" src/components/ --include="*.tsx" --include="*.ts"

# Rayons arbitraires
grep -r "rounded-\[" src/components/ --include="*.tsx" --include="*.ts"

# Ombres arbitraires
grep -r "shadow-\[" src/components/ --include="*.tsx" --include="*.ts"

# framer-motion à migrer
grep -r "from 'framer-motion'" src/components/ --include="*.tsx" --include="*.ts"

# backdrop-blur non standard
grep -r "backdrop-blur-" src/components/ --include="*.tsx" --include="*.ts" | grep -v "backdrop-blur-sm"
```

---

## 9. Références

- [Tailwind CSS v4 Documentation](https://tailwindcss.com/docs)
- [CSS color-mix() MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/color-value/color-mix)
- [Motion React Documentation](https://motion.dev/react)
