# Générateur de Slides (Reveal.js) pour Jarvis OS

## Objectif

Ajouter un générateur de présentations interactives **Reveal.js** directement intégré dans le système de notebooks. Un document Markdown généré (résumé, rapport, FAQ, etc.) peut être converti en slides professionnels en un clic, avec choix du thème, prévisualisation HTML, et export HTML/PDF.

## Vue d'ensemble

L'utilisateur clique sur un bouton **"Présentation"** dans la barre d'actions d'un document généré → un modal s'ouvre pour choisir le thème Reveal.js → le contenu Markdown est découpé en slides intelligemment (par titres `#`, `##`) → une présentation HTML Reveal.js self-contained est générée côté serveur → le frontend affiche un aperçu iframe + bouton de téléchargement HTML.

---

## Proposed Changes

### Backend — Nouveau endpoint

#### [MODIFY] [notebooks.ts](file:///c:/Users/Mayss/Desktop/Jarvis-os-ori/server/routes/notebooks.ts)

Ajout du endpoint `POST /api/notebooks/:id/generated/:docId/slides` qui :
1. Récupère le document généré (Markdown)
2. Parse le Markdown en slides (split sur les `---`, `# Title`, `## Section`)
3. Construit le HTML Reveal.js self-contained avec le thème sélectionné
4. Retourne le HTML complet (pour aperçu + téléchargement)

---

### Frontend — Composant SlidePreviewModal

#### [NEW] [SlidePreviewModal.tsx](file:///c:/Users/Mayss/Desktop/Jarvis-os-ori/src/components/notebooks/SlidePreviewModal.tsx)

Modal premium avec :
- **Sélecteur de thème** : 8 thèmes Reveal.js (Black, White, League, Beige, Sky, Night, Serif, Simple + 1 thème "Jarvis" dark custom)
- **Options** : orientation (16:9 / 4:3), transition (slide, fade, zoom, convex)
- **Aperçu iframe** live du HTML généré
- **Boutons** : Télécharger HTML, Ouvrir dans un nouvel onglet

#### [MODIFY] [GeneratePanel.tsx](file:///c:/Users/Mayss/Desktop/Jarvis-os-ori/src/components/notebooks/GeneratePanel.tsx)

Ajout dans la barre d'actions du document sélectionné :
- Bouton **🎞️ Présentation** (icône `Presentation`) à côté des boutons Copy/Export MD
- State `showSlideModal` + handler `handleOpenSlides`

---

## Détails techniques

### Logique de découpage Markdown → Slides

```
# Titre principal   → Slide titre (centré)
## Sous-section     → Nouvelle slide horizontale  
### Point           → Bullet sur slide courante
---                 → Séparateur de slide explicite
```

Le découpage intelligent :
1. Cherche les séparateurs `---` ou `\n## ` / `\n# `
2. Chaque slide reçoit un titre + contenu (bullets, code blocks, tableaux)
3. Limite à ~400 chars/slide pour la lisibilité

### Template HTML Reveal.js

Le HTML généré est **100% self-contained** (CDN Reveal.js) :
```html
<!DOCTYPE html>
<html>
  <head>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5/dist/reveal.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5/dist/theme/{theme}.css">
  </head>
  <body>
    <div class="reveal"><div class="slides">
      <section>...</section>
      ...
    </div></div>
    <script src="https://cdn.jsdelivr.net/npm/reveal.js@5/dist/reveal.esm.js" type="module">
      Reveal.initialize({ transition: '{transition}', ... });
    </script>
  </body>
</html>
```

### Thème Jarvis custom (dark)

Un thème CSS inline sombre avec les couleurs de Jarvis OS (bleu électrique / fond sombre) injecté directement dans le HTML.

---

## Open Questions

> [!IMPORTANT]
> **Export PDF** : Puppeteer est déjà installé dans le projet (`package.json`). Voulez-vous inclure l'export PDF côté serveur (via Puppeteer qui rend la page Reveal.js) ou se limiter à l'export HTML pour l'instant ?

> [!NOTE]
> **Types de documents exclus** : Les types `infographic` et `mindmap` seront exclus du bouton "Présentation" (ils ne sont pas du Markdown structuré). Tous les autres types (résumé, rapport, FAQ, guide, etc.) sont compatibles.

---

## Verification Plan

### Automated Tests
- Aucun test automatisé ajouté (logique pure de template string, risque faible)

### Manual Verification
1. Générer un "Résumé" ou "Rapport" dans un notebook
2. Cliquer sur 🎞️ Présentation → vérifier l'ouverture du modal
3. Changer le thème → vérifier la mise à jour de l'aperçu
4. Télécharger le HTML → ouvrir dans navigateur → vérifier que Reveal.js fonctionne
5. Tester avec différents types de documents (FAQ, timeline, SWOT)
