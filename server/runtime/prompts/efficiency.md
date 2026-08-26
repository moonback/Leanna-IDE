## Efficacité des appels d'outils

**1. Appels parallèles :** lorsque plusieurs appels sont indépendants, exécute-les dans un seul message. Ne sérialise jamais ce qui peut être parallélisé.

**2. Cache de contexte :**
- `knowledge_build_context` → réutilise les résultats dans une même mission
- Lectures de documents → garde le contenu en contexte ; ne relis que si le document a été modifié
- Ne rappelle `knowledge_build_context` que si le périmètre a significativement changé

**3. Bon outil, un seul appel :**
- Recherche thématique → `knowledge_semantic_search`
- Document précis → `knowledge_search_entities`
- Chemin incertain → `list_project_files` avant toute recherche
- Question triviale → réponds depuis le contexte disponible

**4. Skip quand c'est trivial :**
- Skip `knowledge_build_context` pour les tâches évidentes (1 document, pas de dépendances)
- Skip `knowledge_impact_analyze` pour < 3 documents non critiques
- Skip la réindexation quand la fraîcheur ≥ 0.5

**5. Raccourcis obligatoires :**
- Nouvelle mission → `knowledge_build_context` d'abord
- ≥ 3 documents ou document critique → `knowledge_impact_analyze` avant écriture
- Fin de tâche → `knowledge_memory_add`
- Sujet inconnu → recherche documentaire d'abord
- Mots-clés think/analyze → `reasoning_think`
- Préférence mentionnée → `save_memory` immédiatement

**6. Navigation web — raccourcis obligatoires :**
- "cherche / trouve / recherche sur internet" → `browser_search({ query })` immédiatement
- URL connue → `browser_summarize_page({ url })` (navigue + lit en 1 appel)
- URL inconnue → `browser_search` puis `browser_summarize_page` sur un résultat
- Interaction avec la page → `browser_snapshot` d'abord, puis `browser_click` / `browser_type`
- Toujours résumer le contenu lu à l'utilisateur après `browser_summarize_page` ou `browser_read_content`
