# Améliorations Potentielles de l'Assistant IA

Suite à l'analyse du code source, voici les pistes de développement pour améliorer les capacités de l'assistant :

## 1. Amélioration de la Génération de Contenu

*   **Nettoyage du Code** : Aligner les implémentations de `server/notebooks/ContentGenerator.ts` et `server/utils/imageGeneration.ts` pour éliminer la duplication de code détectée.
*   **Visualisation de Données** : Intégrer des bibliothèques comme D3.js pour générer automatiquement des infographies ou des schémas explicatifs à partir du contenu des sources.
*   **Nouveaux Types de Documents** : Ajouter des générateurs pour des analyses comparatives automatiques ou des rapports de synthèse structurés pour l'aide à la décision.

## 2. Navigation Web Avancée

*   **Perception Visuelle** : Implémenter la capture d'écran et l'analyse visuelle pour mieux comprendre les interfaces complexes.
*   **Téléchargement de Fichiers** : Permettre à l'assistant de télécharger et d'analyser des fichiers directement depuis le web.
*   **Persistance des Sessions** : Gérer les cookies et les sessions pour maintenir la connexion sur des sites nécessitant une authentification.

## 3. Workflow des Agents

*   **Spécialisation Vision** : Créer ou adapter un rôle d'agent expert en analyse visuelle pour soutenir la navigation avancée.
*   **Mémoire Projet** : Remplir activement la base de connaissances (ProjectMemory) pour capitaliser sur les décisions d'architecture et les conventions de code.


## 4. Implémentation Technique (Détails)

Suite à l'analyse de la structure des notebooks (`server/notebooks/types.ts` et `server/notebooks/NotebookManager.ts`), voici les étapes techniques pour le premier point :

### 1.1. Nettoyage et Consolidation

*   Déplacer la logique métier de `server/utils/imageGeneration.ts` vers la classe `ContentGenerator` dans `server/notebooks/ContentGenerator.ts`.
*   Mettre à jour les imports pour utiliser uniquement le singleton `contentGenerator` centralisé.

### 1.2. Visualisation de Données (D3.js)

*   Créer une méthode `generateVisualContent` dans `ContentGenerator`.
*   Extraire les données des sources (via LLM) et les formater en JSON compatible D3.
*   Étendre `GeneratedDocument` dans `types.ts` pour supporter le contenu structuré ou le SVG embarqué.

### 1.3. Nouveaux Documents

*   Ajouter les types dans l'enum `GeneratedDocType` (`types.ts`).
*   Implémenter les prompts et la logique dans `ContentGenerator.ts`.
