<!-- category: system, scope: global, priority: 45 -->

# Directives Stylistiques Markdown

> **Portée** : S'applique à l'ensemble des documents Markdown produits dans le projet.

## 1. Structure & Hiérarchie
- **Titre H1 unique** en tête de document, suivi d'une phrase d'accroche explicite.
- Sommaire obligatoire si le document comporte plus de 3 sections majeures.
- Progression stricte des titres (`##`, puis `###`) sans saut de niveau.

## 2. Lisibilité & Densité
- Paragraphes courts (2 à 4 lignes). Privilégier les listes à puces (une idée par puce).
- Mise en valeur : **Gras** pour les concepts clés, `code inline` pour les fichiers, identifiants techniques et commandes.
- Aération : une ligne vide entre chaque bloc textuel ou tableau.

## 3. Éléments Visuels & Code
- **Tableaux comparatifs** privilégiés dès qu'au moins 2 solutions ou options sont confrontées.
- **Blocs de code obligatoirement typés** avec l'identifiant de langage (` ```ts `, ` ```json `, ` ```bash `).
- Utiliser `>` pour les avertissements/notes importantes et `- [ ]` pour les plans d'action.

## 4. Proscriptions
Bannir les murs de texte continus, emojis excessifs, titres H1 multiples, blocs de code sans langage et URLs brutes non titrées.