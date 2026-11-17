# Attribution des outils aux agents — méthode de référence

> Mise à jour : 2026-11-06 · Source de vérité : code exécuté au démarrage.
>
> **Attention :** l'ancienne matrice statique « Leanna v1.4.0 » est retirée. Elle contenait
> des listes d'outils, des owners et des niveaux de risque qui ne reflétaient plus le registre
> dynamique actuel. Ne pas utiliser ses anciennes lignes comme politique d'autorisation.

## 1. Où se trouve la politique réelle ?

| Responsabilité | Source de code | Fonction |
|---|---|---|
| Rôles et capacités | `server/agents/roles.ts`, `server/agents/types.ts` | Définit les capacités des rôles statiques et dynamiques |
| Attribution outil → agent | `server/agents/toolAgentMapper.ts` | `resolveToolAttribution`, `getAgentsForTool`, `applyToolRegistryAttribution` |
| Socle des outils sensibles | `server/agents/toolAgentMapper.ts` | `SENSITIVE_TOOL_ATTRIBUTION` |
| Autorisation runtime | `server/runtime/PermissionPolicy.ts` | Vérifie les permissions et les agents autorisés |
| Registre effectif | `server/runtime/ToolRegistry.ts` | Déclarations réellement enregistrées au démarrage |
| Audit dynamique | `server/agents/attributionAudit.ts` | `auditToolAttribution(runtime)`, `enforceAttribution` |

Le ToolRegistry est dynamique : les skills intégrés, plugins, outils MCP et skills personnalisés
peuvent modifier le contenu effectif. Il n'existe donc pas de nombre universel et stable
d'outils ni de matrice statique exhaustive valable pour toutes les installations.

## 2. Ordre de résolution de l'attribution

Le mapper applique la cascade suivante :

1. **Explicite** — attribution déclarée dans le registre ou socle des outils sensibles.
2. **Capability** — capacité déclarée dans la définition du rôle.
3. **Catégorie** — heuristique sémantique ; résultat probable, pas une autorisation explicite.
4. **Non attribué** — rôle neutre `system`, sans inventer un propriétaire spécialisé.

Le rôle affiché `multi` représente plusieurs rôles possibles ; il ne doit pas être interprété
comme un agent unique ni comme une permission supplémentaire.

## 3. Rapport d'audit au démarrage

`auditToolAttribution(runtime)` inspecte les déclarations réellement présentes après
l'enregistrement des outils et produit :

- `totalTools` : nombre d'outils exécutables observés ;
- `certain` : attribution explicite ou issue d'une capability ;
- `probable` : attribution par catégorie ;
- `unattributed` : aucun owner résolu ;
- `actionable` : outils non attribués, avec catégorie et owner suggéré si possible ;
- `entries` : détail par outil.

La somme `certain + probable + unattributed` doit être égale à `totalTools`.
Le mode d'application de la politique d'enforcement est défini par la configuration
d'attribution du bootstrap ; consulter le code et les logs du démarrage avant d'interpréter
un rapport.

## 4. Comment produire une matrice exacte

Pour documenter une installation précise :

1. Démarrer Leanna avec sa configuration réelle et attendre l'enregistrement de tous les outils.
2. Récupérer le rapport d'`auditToolAttribution(runtime)` ou l'export d'observabilité équivalent.
3. Pour chaque outil, joindre les champs de sa déclaration ToolRegistry : permissions,
   attribution explicite, risque, handler et éventuels effets de bord.
4. Comparer les rôles autorisés avec les capacités déclarées et les contrôles de
   `PermissionPolicy`.
5. Conserver le rapport, la version du commit, la configuration non secrète et la date.
6. Ne jamais transformer une attribution probable en autorisation explicite sans revue.

## 5. Règles de sécurité

- L'attribution d'un agent et l'autorisation d'exécuter un outil sont deux contrôles distincts.
- Une attribution à un rôle ne remplace jamais les permissions du ToolRegistry.
- Les outils à effet de bord doivent avoir une attribution explicite et un niveau de risque
  adapté ; les permissions sont vérifiées au point d'exécution.
- Un outil non attribué ne doit pas être présenté comme appartenant à `writer` ou à un autre
  agent métier par défaut.
- Les tableaux historiques d'audits ne prouvent pas la configuration active du runtime.

## 6. Références

- `server/agents/toolAgentMapper.ts`
- `server/agents/attributionAudit.ts`
- `server/agents/attributionAudit.test.ts`
- `server/agents/roles.ts`
- `server/agents/types.ts`
- `server/runtime/PermissionPolicy.ts`
- `server/runtime/ToolRegistry.ts`
