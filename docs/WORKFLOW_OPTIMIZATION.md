# Workflow de développement optimisé

> Référence opérationnelle pour les missions de développement de Leanna. Ce document formalise les mécanismes déjà présents dans le runtime ; il ne crée pas de nouveaux outils ni de nouvelles permissions.

## Objectifs

- Réduire la latence en parallélisant uniquement les opérations réellement indépendantes.
- Réduire les régressions grâce au graphe d'architecture et aux vérifications automatisées.
- Rendre chaque mission traçable : plan, actions, observations, preuves et récupération.
- Préserver les frontières de sécurité : workspace/sandbox, permissions et approbations restent prioritaires.

## 1. PLAN — comprendre avant d'agir

1. Charger le contexte avec `knowledge_build_context` au début d'une mission de code, sauf si le périmètre est déjà parfaitement connu et isolé.
2. Pour une exploration architecturale, consulter le graphe (`graphify_query`, `graphify_path`, `graphify_explain`) avant une lecture massive de fichiers.
3. Avant une modification d'au moins trois fichiers ou d'un module critique, appeler `knowledge_impact_analyze`. Avant de modifier une signature, un type exporté ou un symbole partagé, appeler `knowledge_code_map_impact` et tenir compte des tests consommateurs.
4. Pour une mission d'au moins deux étapes, déclarer le plan avec `set_plan` avant la première écriture. Chaque étape précise l'action, les fichiers cibles et un critère de réussite observable. La dernière étape couvre les vérifications.
5. Réviser le plan si le périmètre change, si une dépendance inattendue apparaît ou si une approche échoue deux fois.

## 2. ACT — exécuter efficacement

- Regrouper les lectures, recherches et autres appels indépendants dans un même lot.
- Regrouper les écritures indépendantes lorsqu'elles ne se chevauchent pas et ne dépendent pas du résultat d'une autre écriture.
- Séquencer toute opération dont les arguments ou la sûreté dépendent d'un résultat précédent.
- Éviter les relectures inutiles ; réutiliser les résultats encore valides.
- Ne jamais contourner la sandbox, les permissions, le dry-run ou une confirmation requise pour gagner du temps.

## 3. OBSERVE — examiner les effets réels

Après chaque lot, examiner les sorties complètes utiles : succès et erreurs par opération, chemins réellement modifiés, diagnostics, hypothèses invalidées et effets secondaires. Un retour positif isolé ne prouve pas que l'objectif métier est atteint.

## 4. VERIFY — produire des preuves

Pour les changements de code, adapter les contrôles au périmètre et exécuter les contrôles pertinents après le lot logique de modifications :

| Niveau | Contrôle | Preuve attendue |
|---|---|---|
| Intégrité | `verify_file` | Empreinte SHA-256 et contenu relu conformes |
| Typage | `verify_typecheck` | TypeScript sans diagnostic bloquant |
| Tests | `verify_run_script` avec `test`, ou tests ciblés disponibles | Résultat de test réel, avec échecs identifiés |
| Comportement | scénario ou résultat observable | Critère de succès du plan satisfait |

Compléments :
- Utiliser `verify_lint` et `verify_format` lorsque disponibles et pertinents.
- Pour une validation consolidée, utiliser `quality_loop` lorsqu'il correspond au périmètre et que l'outil est déclaré.
- Les commandes du dépôt actuellement disponibles incluent `npm run typecheck`, `npm test`, `npm run test:ui`, `npm run lint` et `npm run build`. Ne pas prétendre qu'une commande a été exécutée si elle ne l'a pas été.
- Après une mission ayant modifié du code source, actualiser le graphe via `graphify_update` si l'outil est disponible.

La CI GitHub existante exécute sur Windows : installation reproductible (`npm ci`), typecheck, tests serveur, tests UI, build avec scan des secrets et ESLint actuellement non bloquant en raison d'une dette préexistante. Ne pas présenter ESLint comme une barrière bloquante tant que cette configuration n'a pas changé.

## 5. RECOVER — corriger sans boucle infinie

1. Identifier la première vérification en échec et isoler sa cause racine.
2. Distinguer défaut du patch, test obsolète, dépendance/environnement et problème de données.
3. Réviser le plan, réduire le périmètre du correctif et choisir une approche réellement différente.
4. Limiter à deux tentatives par approche et trois approches au total ; après épuisement, arrêter et escalader avec les éléments vérifiés.
5. Relancer les contrôles impactés après correction. Ne jamais transformer un contrôle non exécuté en succès.

## 6. COMPLETE — clôturer avec des preuves

Appeler `finalize_mission` uniquement après validation réelle des quatre niveaux `integrity`, `compilation`, `tests` et `behavior`. Renseigner les fichiers modifiés et les résultats exacts. Si un niveau échoue ou n'a pas été exécuté, ne pas clôturer comme succès : expliquer le blocage et la prochaine action nécessaire.

## Correspondance avec l'implémentation

| Principe | Implémentation existante |
|---|---|
| Contexte et graphe | `knowledge_build_context`, `graphify_*`, `knowledge_impact_analyze`, `knowledge_code_map_impact` |
| Plan et clôture | `server/skills/setPlan.ts`, `server/skills/finalizeMission.ts` |
| Cycle agentique | `server/runtime/agentic/AgenticRuntime.ts`, `server/agents/AgentRepairLoop.ts` |
| Intégrité SHA-256 | `server/agents/WorkspaceState.ts`, outil `verify_file` |
| Efficience des appels | `server/runtime/prompts/base.md` — `<efficiency_protocol>` |
| Politique de mission | `server/runtime/prompts/autonomy.md` |
| Contrôles CI | `.github/workflows/ci.yml` |

Ce guide est une procédure d'utilisation et de vérification de ces mécanismes. Toute évolution de code doit préserver les contrats de sécurité et les comportements déjà couverts par les tests.
