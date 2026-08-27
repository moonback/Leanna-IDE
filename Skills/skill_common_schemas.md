# Skill : Common Schemas (`server/skills/common/schemas.ts`)

Ce fichier n'est pas un skill en soi, mais un référentiel partagé de schémas de paramètres d'outils fréquemment utilisés. Il permet de centraliser les définitions pour garantir la cohérence et réduire la duplication.

## Contenu

Il contient des définitions réutilisables pour des paramètres communs tels que :

*   Chemins de fichiers (`PATH_PARAM`, `DIR_PARAM`)
*   Listes de fichiers (`FILES_PARAM`)
*   Pagination (`MAX_RESULTS_PARAM`)
*   Lignes (`START_LINE_PARAM`, `END_LINE_PARAM`)
*   Priorité (`PRIORITY_PARAM`)
*   Recherche (`QUERY_PARAM`)
*   Contenu (`CONTENT_PARAM`)

## Autonomie

Bien que technique, ce fichier contribue indirectement à l'autonomie en standardisant les interfaces des outils. Cela permet à l'IA de mieux comprendre et utiliser les différents outils du système de manière cohérente.
