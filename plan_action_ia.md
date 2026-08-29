# Plan d'Action : Implémentation de l'IA & Assistance au Codage

Ce document décrit les étapes pour intégrer les nouveaux skills d'IA et d'assistance au codage dans Leanna.

## Phase 1 : Recherche & Conception (Terminée)
*   **Technologies** : Gemini (via `@google/genai`) retenu pour l'IA générative (`CodeSuggester`, base de `TestGenerator`). Pour `ErrorPredictor`, couplage d'ESLint (analyse statique) et de l'IA pour l'interprétation d'erreurs complexes. `tsx` utilisé pour le développement et les tests Node.
*   **Architecture** : Les nouveaux skills seront implémentés dans `server/skills`. Ils interagiront avec `ReasoningPipeline` pour le raisonnement et utiliseront `codebaseReader` via le Knowledge System pour obtenir le contexte précis du code.
*   **Interfaces** : Frontend React 19. Intégration de suggestions "inline" (fantômes) dans l'éditeur de code et création d'un panneau latéral listant les erreurs prédites.

## Phase 2 : Développement MVP (En cours)
1.  **Implémenter `CodeSuggester`** : Créer un MVP capable de fournir des suggestions simples (inline) à partir du contexte du fichier ouvert en utilisant Gemini.
2.  **Implémenter `ErrorPredictor`** : Intégrer ESLint et commencer à envoyer les erreurs complexes à l'IA pour explication.

## Phase 3 : Amélioration & Nouveaux Skills (Long terme)
1.  **Développer `TestGenerator`** : Utiliser l'IA pour générer des tests unitaires basiques.
2.  **Améliorer la précision** : Affiner les modèles et le contexte fourni pour de meilleures suggestions.
