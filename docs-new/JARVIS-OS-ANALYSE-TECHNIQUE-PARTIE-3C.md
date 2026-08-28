# JARVIS-OS - ANALYSE TECHNIQUE COMPLÈTE - PARTIE 3C

**Date** : 28 août 2026  
**Version** : 1.0.0  
**Périmètre** : Design System  

---

## 11. DESIGN SYSTEM

### 11.1. Organisation

**Fichier de référence** : `src/DESIGN_TOKENS.md`  
**Version** : 1.0.0  
**Date** : 28 août 2026  
**Périmètre** : Tous les composants React dans `src/components/`

**Architecture** :
- **Tokens CSS** : Variables CSS définies dans `src/index.css`
- **Classes utilitaires** : Classes Tailwind + classes custom
- **Composants UI** : Dans `src/components/ui/` (12 fichiers)
- **5 thèmes** : dark, light, cyberpunk, sepia, high-contrast

---

### 11.2. Tokens de design

#### 11.2.1. Typographie

**Échelle typographique standardisée** :

| Rôle | Taille | Classe Tailwind | Usage | Variable CSS |
|------|--------|-----------------|-------|--------------|
| Micro-label | 10px | `text-xs` | Badges, tags, timestamps | `--text-xs: 0.625rem` |
| Corps secondaire | 12px | `text-sm` | Texte de support, légendes | `--text-sm: 0.75rem` |
| Corps principal | 14px | `text-base` | Contenu courant, listes, chat | `--text-base: 0.875rem` |
| Sous-titre | 16px | `text-lg` | Titres de section, en-têtes | `--text-lg: 1rem` |
| Titre | 18px | `text-xl` | Titres de vue | `--text-xl: 1.125rem` |
| Grande section | 20px | `text-2xl` | Titres majeurs | `--text-2xl: 1.25rem` |
| Très grande | 24px | `text-3xl` | Sections principales | `--text-3xl: 1.5rem` |

**Règles** :
- ❌ **Interdit** : `text-[Npx]` avec valeurs arbitraires (8px, 9.5px, 10.5px, etc.)
- ✅ **Autorisé** : Uniquement les classes Tailwind standard

**Migration** :
- `text-[8px]`, `text-[9px]` → `text-xs` (10px)
- `text-[10px]` → `text-sm` (12px)
- `text-[11px]`, `text-[12px]` → `text-base` (14px)
- `text-[12.5px]`, `text-[13px]`, `text-[14px]` → `text-lg` (16px)
- `text-[14px+]` → `text-xl` (18px) ou `text-2xl` (20px)

---

#### 11.2.2. Couleurs

**Tokens de couleurs sémantiques** :

| Token | Rôle | Thème Dark | Thème Light |
|-------|------|------------|-------------|
| `--color-success` | États positifs | `#4ade80` | `#059669` |
| `--color-warning` | Avertissements | `#fcd34d` | `#d97706` |
| `--color-error` | Erreurs | `#fb7185` | `#dc2626` |
| `--color-info` | Information | `#67e8f9` | `#0891b2` |
| `--accent-primary` | Accent principal | `#818cf8` | `#4f46e5` |
| `--accent-secondary` | Accent secondaire | `#06b6d4` | `#0891b2` |

**Tokens `-subtle`** (12% opacity) :
```css
--color-success-subtle: color-mix(in srgb, var(--color-success) 12%, transparent);
--color-warning-subtle: color-mix(in srgb, var(--color-warning) 12%, transparent);
--color-error-subtle:   color-mix(in srgb, var(--color-error) 12%, transparent);
--color-info-subtle:    color-mix(in srgb, var(--color-info) 12%, transparent);
--color-accent-alt: #a78bfa (dark) / #6366f1 (light)
--color-accent-alt-subtle: color-mix(in srgb, var(--color-accent-alt) 12%, transparent);
```

**Règles** :
- ❌ **Interdit** : Couleurs hex en dur (`#4ade80`, `#ef4444`, etc.)
- ✅ **Autorisé** : Tokens CSS (`var(--color-success)`) ou `color-mix()`

---

#### 11.2.3. Rayons (Border Radius)

| Élément | Rayon | Classe Tailwind | Variable CSS |
|---------|-------|-----------------|--------------|
| Bouton, Input, Badge | 6px | `rounded-md` | `var(--radius-md)` |
| Carte, Panneau | 8px | `rounded-lg` | `var(--radius-lg)` |
| Popover, Dropdown, Tooltip | 12px | `rounded-xl` | `var(--radius-xl)` |
| Modale, Dialogue | 16px | `rounded-2xl` | `var(--radius-2xl)` |

**Variables CSS** :
```css
--radius-xs: 2px;   --radius-sm: 4px;   --radius-md: 8px;
--radius-lg: 12px;  --radius-xl: 16px;  --radius-2xl: 20px;
--radius-full: 9999px;
```

**Règles** :
- ❌ **Interdit** : `rounded-[14px]`, `rounded-[18px]`, etc.
- ✅ **Autorisé** : Classes Tailwind standard uniquement

---

#### 11.2.4. Ombres

| Élément | Ombre | Classe Tailwind | Variable CSS |
|---------|-------|-----------------|--------------|
| Bouton, Input, Badge | aucune | - | - |
| Bouton, Input (focus) | légère | `shadow-sm` | `var(--shadow-sm)` |
| Carte, Panneau | légère | `shadow-sm` | `var(--shadow-sm)` |
| Popover, Dropdown, Tooltip | marquée | `shadow-lg` | `var(--shadow-lg)` |
| Modale, Dialogue | très marquée | `shadow-2xl` | `var(--shadow-xl)` |

**Règles** :
- ❌ **Interdit** : `shadow-[...]` (valeurs arbitraires)
- ✅ **Autorisé** : `shadow-sm`, `shadow-lg`, `shadow-2xl`

---

#### 11.2.5. Espacement

**Échelle (base 4px)** :
```css
--space-1: 4px;  --space-2: 8px;  --space-3: 12px;
--space-4: 16px; --space-5: 20px; --space-6: 24px;
--space-8: 32px; --space-10: 40px; --space-12: 48px;
```

---

### 11.3. Thèmes

#### 11.3.1. Thème Dark (par défaut)

**Couleurs de surface** :
```css
--bg-base: #0a0a0f;          --bg-secondary: #13131a;
--bg-panel: rgba(17,17,24,0.92); --bg-ctrl: rgba(15,15,22,0.95);
--bg-sidebar: rgba(10,10,16,0.97); --bg-input: rgba(32,32,44,0.4);
--bg-elevated: #1a1a24;
```

**Textes** :
```css
--text-primary: #f0f0f5;  --text-secondary: #b4b4c8;
--text-muted: #8888a4;    --text-dimmed: #5c5c74;
```

**Accents** :
```css
--accent-primary: #818cf8;  --accent-hover: #a5b4fc;
--accent-subtle: rgba(129,140,248,0.12);
--accent-secondary: #06b6d4;
```

**Ombres** :
```css
--shadow-sm: 0 2px 4px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.25);
--shadow-md: 0 4px 16px rgba(0,0,0,0.4), 0 2px 6px rgba(2,6,23,0.3);
--shadow-lg: 0 12px 40px rgba(0,0,0,0.5), 0 4px 16px rgba(2,6,23,0.3);
--shadow-xl: 0 24px 56px rgba(0,0,0,0.55), 0 8px 24px rgba(2,6,23,0.35);
```

---

#### 11.3.2. Thème Light

**Couleurs de surface** :
```css
--bg-base: #ffffff;          --bg-secondary: #ecedf4;
--bg-panel: rgba(255,255,255,0.92); --bg-ctrl: rgba(255,255,255,0.98);
--bg-sidebar: rgba(250,250,255,0.98); --bg-input: rgba(235,236,244,0.7);
--bg-elevated: #ffffff;
```

**Textes** :
```css
--text-primary: #0f172a;  --text-secondary: #475569;
--text-muted: #8394a9;    --text-dimmed: #b8c5d1;
```

---

### 11.4. Effets visuels

#### 11.4.1. Backdrop Blur

**Règle** : ✅ Utiliser **UNIQUEMENT** `backdrop-blur-sm`

**Éléments concernés** : Modales, Dropdowns, Popovers, Tooltips, Banners

**Variables** :
```css
--glass-bg: rgba(17,17,24,0.75);
--glass-border: rgba(99,102,241,0.1);
--glass-blur: 16px;
```

#### 11.4.2. Animation

**Décision** : Utiliser **`motion/react`** uniquement (79 usages vs 3 framer-motion)

**Action** : Migrer les 3 fichiers framer-motion → motion/react

---

### 11.5. Composants UI

**Dossier** : `src/components/ui/` (12 composants)

| Composant | Description | Statut |
|-----------|-------------|--------|
| `AgentTaskCard.tsx` | Carte de tâche agent | ✅ Conforme |
| `EmptyState.tsx` | État vide | ✅ Conforme |
| `IconButton.tsx` | Bouton icône | ⚠️ Partiel |
| `Panel.tsx` | Panneau de base | ⚠️ Partiel |
| `SidePanel.tsx` | Panneau latéral | ⚠️ Partiel |
| `Skeleton.tsx` | Squelette | ✅ Conforme |
| `StatusBadge.tsx` | Badge de statut | ⚠️ Partiel |
| `Toast.tsx` | Notification | ⚠️ Partiel |
| `Toggle.tsx` | Interrupteur | ⚠️ Partiel |
| `Tooltip.tsx` | Info-bulle | ⚠️ Partiel |
| `ViewHeader.tsx` | En-tête de vue | ⚠️ Partiel |

---

### 11.6. Classes utilitaires CSS

**Définies dans** `src/index.css` (ligne 73-94)

```css
/* Success */
.text-success { color: var(--color-success); }
.bg-success-subtle { background-color: color-mix(in srgb, var(--color-success) 10%, transparent); }
.border-success-subtle { border-color: color-mix(in srgb, var(--color-success) 25%, transparent); }
.badge-success {
  background-color: color-mix(in srgb, var(--color-success) 12%, transparent);
  color: var(--color-success);
  border: 1px solid color-mix(in srgb, var(--color-success) 25%, transparent);
}

/* Error */
.text-error { color: var(--color-error); }
.bg-error-subtle { background-color: color-mix(in srgb, var(--color-error) 10%, transparent); }

/* Warning */
.text-warning { color: var(--color-warning); }
.bg-warning-subtle { background-color: color-mix(in srgb, var(--color-warning) 10%, transparent); }

/* Info */
.text-info { color: var(--color-info); }
.bg-info-subtle { background-color: color-mix(in srgb, var(--color-info) 10%, transparent); }
```

---

### 11.7. Hiérarchie visuelle

```
Bouton/Input/Badge (6px) → Carte/Panneau (8px) → Popover/Tooltip (12px) → Modale (16px)
  ↓                          ↓                        ↓                     ↓
aucune/shadow-sm       shadow-sm               shadow-lg           shadow-2xl
```

**Règle** : Plus l'élément est "au-dessus", plus rayon et ombre sont marqués.

---

### 11.8. Accessibilité

**Règles** :
- Contraste de texte ≥ 4.5:1
- Focus visible sur tous les éléments interactifs
- Navigation au clavier supportée
- ARIA labels sur les composants complexes
- Texte alternatif sur les images

---

### 11.9. Plan de migration

**Phase 1 : Fondations**
- [x] Tokens CSS dans `src/index.css`
- [x] Document `DESIGN_TOKENS.md`
- [ ] Migrer 3 fichiers framer-motion → motion/react
- [ ] Uniformiser `backdrop-blur-sm`

**Phase 2 : Primitives UI** (`components/ui/`)
- [ ] StatusBadge, Toast, Panel, SidePanel, IconButton
- [ ] Toggle, Tooltip, EmptyState, ViewHeader

**Phase 3 : Coquille**
- [ ] Sidebar, IDE sidebar, StatusBar, Breadcrumb
- [ ] EditorTabs, CommandPalette

**Phase 4 : Modules**
- [ ] panels/ (22 fichiers), notebooks/ (13 fichiers)

**Phase 5 : Réglages**
- [ ] settings/ (18 fichiers), modales

---

### 11.10. Cohérence visuelle

**6 règles d'or** :
1. ✅ Une échelle typographique (7 paliers)
2. ✅ Une palette de couleurs (tokens sémantiques)
3. ✅ Une échelle de rayons (5 paliers)
4. ✅ Une échelle d'ombres (4 paliers)
5. ✅ Un effet backdrop-blur (`backdrop-blur-sm`)
6. ✅ Une librairie d'animation (`motion/react`)

---

## 📚 RÉFÉRENCES

**Fichiers analysés** :
- `src/DESIGN_TOKENS.md` (document de référence)
- `src/index.css` (tokens CSS et 5 thèmes)
- `src/components/ui/` (12 composants)

---

*Fin de la Partie 3C - Suite : PARTIE-3D (Flux utilisateur + Diagrammes)*
