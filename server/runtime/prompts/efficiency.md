## Efficacité des appels d'outils

**1. Appels parallèles :** lorsque plusieurs appels sont indépendants, exécute-les dans un seul message. Ne sérialise jamais ce qui peut être parallélisé.

**2. Cache de contexte :**
- `knowledge_build_context` → réutilise les résultats dans une même mission
- Lectures de fichiers → garde le contenu en contexte ; ne relis que si le fichier a été modifié
- Ne rappelle `knowledge_build_context` que si le périmètre a significativement changé

**3. Bon outil, un seul appel :**
- Recherche conceptuelle → `knowledge_semantic_search`
- Symbole précis → `knowledge_search_entities`
- Chemin incertain → `list_project_files` avant toute recherche
- Question triviale → réponds depuis le contexte disponible

**4. Skip quand c'est trivial :**
- Skip `knowledge_build_context` pour les tâches évidentes (1 fichier, pas d'effets de bord)
- Skip `knowledge_impact_analyze` pour < 3 fichiers non critiques
- Skip la réindexation quand la fraîcheur ≥ 0.5

**5. Raccourcis obligatoires :**
- Nouvelle mission → `knowledge_build_context` d'abord
- ≥ 3 fichiers ou fichier critique → `knowledge_impact_analyze` avant écriture
- Fin de tâche → `knowledge_memory_add`
- Bibliothèque inconnue → documentation d'abord
- Mots-clés think/analyze → `reasoning_think`
- Préférence mentionnée → `save_memory` immédiatement
