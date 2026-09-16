# Rapport d'erreurs TypeScript — Diagnostic réel

## Résultat du diagnostic

> [!NOTE]
> Les erreurs initialement décrites (types globaux manquants, lib.esnext.full.d.ts introuvable) **n'existent pas** dans l'état actuel du projet.
>
> - TypeScript **5.9.3** ✅
> - `@types/node` **22.20.1** ✅
> - 102 fichiers lib TypeScript présents ✅
> - `lib.es2022.full.d.ts`, `lib.dom.d.ts`, `lib.es5.d.ts` tous présents ✅
> - `tsc --noEmit` se termine avec **code 0** (succès) ✅

---

## Erreurs réelles (bugs de code)

`tsc --noEmit` a retourné 0 mais a loggué des **erreurs de type** dans les fichiers serveur :

### Catégorie 1 — Variable déclarée avec `_` mais utilisée sans `_` (TS2552)

Ces fichiers ont des variables préfixées `_` (convention "inutilisées") mais utilisées ensuite sans le préfixe.

| Fichier | Lignes | Détail |
|---|---|---|
| [`PlanningEngine.ts`](file:///c:/Users/Mayss/Desktop/Jarvis-os-ori/server/knowledge/PlanningEngine.ts) | 241, 244, 247… | `_waves` déclaré, `waves` utilisé |
| [`UnderstandingEngine.ts`](file:///c:/Users/Mayss/Desktop/Jarvis-os-ori/server/knowledge/UnderstandingEngine.ts) | 298–370 | `_batch` déclaré, `batch` utilisé |

**Fix** : Renommer `_waves` → `waves` et `_batch` → `batch` aux lignes de déclaration.

---

### Catégorie 2 — Variables inutilisées (TS6133 / TS6196)

| Fichier | Variable | Ligne |
|---|---|---|
| [`SmartSkills.test.ts`](file:///c:/Users/Mayss/Desktop\Jarvis-os-ori/server/autonomy/SmartSkills.test.ts) | `args` | 8 |
| [`Supervisor.ts`](file:///c:/Users/Mayss/Desktop/Jarvis-os-ori/server/autonomy/Supervisor.ts) | `_detectContentLoop` | 232 |
| [`htmlExporter.ts`](file:///c:/Users/Mayss/Desktop/Jarvis-os-ori/server/export/htmlExporter.ts) | `_includeToc` | 19 |
| [`LearningEngine.ts`](file:///c:/Users/Mayss/Desktop/Jarvis-os-ori/server/knowledge/LearningEngine.ts) | `_sig` | 322 |
| [`ReasoningPipeline.ts`](file:///c:/Users/Mayss/Desktop/Jarvis-os-ori/server/knowledge/ReasoningPipeline.ts) | `understanding`, `searchStep`, etc. | 544, 1137… |
| [`SemanticSearch.ts`](file:///c:/Users/Mayss/Desktop/Jarvis-os-ori/server/knowledge/SemanticSearch.ts) | `length`, `computeIDF`, `filePath` | 416, 927, 962 |
| [`LiveSocketHandler.ts`](file:///c:/Users/Mayss/Desktop/Jarvis-os-ori/server/live/LiveSocketHandler.ts) | `_lastToolError` | 1324 |
| [`McpClient.ts`](file:///c:/Users/Mayss/Desktop/Jarvis-os-ori/server/mcp/McpClient.ts) | `JsonRpcResponse`, `id` | 47, 586 |
| [`Executor.ts`](file:///c:/Users/Mayss/Desktop/Jarvis-os-ori/server/mission/Executor.ts) | `availableSkills` | 374 |
| [`Planner.ts`](file:///c:/Users/Mayss/Desktop/Jarvis-os-ori/server/mission/Planner.ts) | `availableSkills`, `plans` | 255, 256 |
| [`Reflection.ts`](file:///c:/Users/Mayss/Desktop/Jarvis-os-ori/server/mission/Reflection.ts) | `_actionKeys`, `params` | 481, 1160 |
| [`ContentGenerator.ts`](file:///c:/Users/Mayss/Desktop/Jarvis-os-ori/server/notebooks/ContentGenerator.ts) | `lang` | 217 |

**Fix** : Supprimer ou utiliser les variables ; préfixer avec `_` si intentionnel.

---

### Catégorie 3 — Propriété manquante dans un type (TS2741)

| Fichier | Ligne | Détail |
|---|---|---|
| [`TaskScheduler.ts`](file:///c:/Users/Mayss/Desktop/Jarvis-os-ori/server/agents/TaskScheduler.ts) | 60, 118 | Propriété `outcome` manquante dans `TaskResult` |

**Fix** : Ajouter `outcome: '...'` à l'objet retourné, ou rendre `outcome` optionnel dans l'interface `TaskResult`.

---

### Catégorie 4 — Propriété inconnue sur un type (TS2353)

| Fichier | Ligne | Détail |
|---|---|---|
| [`knowledge.test.ts`](file:///c:/Users/Mayss/Desktop/Jarvis-os-ori/server/knowledge.test.ts) | 136 | `dependencies` n'existe pas dans `FileNode` |

**Fix** : Ajouter `dependencies` à l'interface `FileNode`, ou retirer la propriété du test.

---

### Catégorie 5 — Type incompatible (TS2322)

| Fichier | Ligne | Détail |
|---|---|---|
| [`Executor.ts`](file:///c:/Users/Mayss/Desktop/Jarvis-os-ori/server/mission/Executor.ts) | 464 | `string` non assignable à `GoalPriority \| undefined` |

**Fix** : Caster avec `as GoalPriority` ou valider la valeur avant l'assignation.

---

### Catégorie 6 — Extensions d'import manquantes (TS2835)

`moduleResolution: NodeNext` exige des extensions `.js` explicites dans les imports relatifs.

| Fichier | Lignes | Import manquant |
|---|---|---|
| [`ContentGenerator.ts`](file:///c:/Users/Mayss/Desktop/Jarvis-os-ori/server/notebooks/ContentGenerator.ts) | 175, 220, 221, 222, 1470, 1537, 1633 | Ajouter `.js` aux imports relatifs |

**Fix** : Remplacer `'../utils/textGeneration'` → `'../utils/textGeneration.js'`, etc.

---

## Plan d'action recommandé

1. **Critique** : Corriger `PlanningEngine.ts` et `UnderstandingEngine.ts` (variables `_waves`/`_batch`) — risque de crash runtime
2. **Important** : Corriger `TaskScheduler.ts` (propriété `outcome` manquante) — impact sur la logique métier
3. **Important** : Corriger `Executor.ts` (type `GoalPriority`) — risque de comportement inattendu
4. **Maintenance** : Corriger les variables inutilisées (TS6133) — nettoyer ou utiliser
5. **NodeNext** : Corriger les extensions `.js` dans `ContentGenerator.ts`

