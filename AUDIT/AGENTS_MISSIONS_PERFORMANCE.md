# Agents & missions — performances

Légende : **M** = mesuré dans cette session · **E** = estimé · **I** = indisponible.

## Ce qui a été mesuré (machine locale, Windows 10, 1 exécution)

| Mesure | Avant | Après | Statut |
|---|---|---|---|
| `npm test` (suite serveur complète), durée | 243 s (1 491 tests) | 113 s (1 497 tests) | M |
| `tsc --noEmit -p tsconfig.json`, durée | 2 min 09 s | 1 min 39 s | M |

Une seule exécution chacune, sans contrôle de charge machine : ces durées ne permettent aucune conclusion de gain ou de perte de performance. Les correctifs de cette session ne visent pas la performance.

## Métriques de mission demandées

| Mesure | Statut | Raison |
|---|---|---|
| Durée totale de mission, p50/p95/p99 | I | aucune mission réelle exécutée (pas de serveur ni de clé LLM dans la session) |
| Durées planification / outils / vérification | I | idem ; le code les instrumente (`telemetryService`, `PlanEstimator`) |
| Appels LLM, tokens entrée/sortie/raisonnement | I | idem ; disponibles via `/api/observability` sur un serveur lancé |
| Coût estimé par mission | E | `PlanEstimator.estimate` produit `estimatedTokens`/`estimatedCostUsd` à la planification : estimations, pas des mesures |
| Tentatives, taux de réparation, taux d'échec outils | I | instrumentés (`metrics.retriedActions`, `ToolRegistry.recordMetrics`) mais non relevés |
| Parallélisme effectif | E (code) | objectifs : ≤ `maxConcurrentGoals` (3) par vague ; missions réelles : 1 à la fois (`writeQueue`) ; dry-run : sans limite |
| Taux de réussite vérifiée | I | — |

Procédure pour produire la baseline réelle : `npm run dev`, puis `npm run test:missions` avec une clé fournisseur configurée, N ≥ 5 exécutions par scénario dans les mêmes conditions avant et après chaque optimisation.

## Observations de code pertinentes (non mesurées)

- Cache de lecture `ToolRegistry` : 5 s, limité à `read_project_file` et `list_project_files`, vidé après tout outil à effet de bord. Comportement sûr.
- Persistance après chaque action (`Executor.persist`) : écriture locale plus Supabase si configuré. Coût d'E/S proportionnel au nombre d'actions ; non mesuré.
- `waitIfPaused` : sondage à `PAUSE_POLL_MS` pendant une pause. Négligeable hors pause.
- Effet indirect de F-04 : en mode supervisé, une mission en échec n'effectue plus 2 tentatives vides (checkpoint, preuve et rollback chacune). Gain d'E/S réel mais non chiffré.
