# Runtime autonome événementiel Leanna

Ce document décrit la couche d’autonomie livrée par Leanna, son exploitation 24/7 et ses limites actuelles. Elle complète les systèmes existants ; elle ne les remplace pas.

## Objectif et périmètre

Le runtime autonome réagit aux événements intéressants et reste en veille quand aucun travail n’est nécessaire. Il ne contient pas de boucle LLM et ne contourne jamais les contrôles existants.

```text
Runtime EventBus
  → PerceptionEngine (déterministe)
  → TaskManager (borné, priorisé, dédupliqué)
  → handler sûr (observation/mémoire)
  → EventBus / métriques

HeartbeatService surveille l’état local et choisit ACTIVE, IDLE ou SLEEP.
```

Les composants réutilisés sont `AgentRuntime`, `EventBus`, `Mission`/`Executor`, `ToolRegistry`, `PermissionPolicy`, `DryRunController`, `AutonomyPolicy`, `Memory`, `Observability` et le graceful shutdown existant. L’audit détaillé est disponible dans [AUTONOMY_AUDIT.md](AUTONOMY_AUDIT.md).

## Cycle de vie

### Démarrage

1. `server-bootstrap.ts` charge et valide la configuration.
2. `bootstrapRuntimeSync()` initialise le runtime existant et le registre d’outils.
3. `server.ts` crée et démarre `LeannaCore`.
4. Le cœur s’abonne au `Runtime EventBus`, initialise le heartbeat et passe en `watching`.
5. Les missions interrompues continuent d’utiliser leur mécanisme existant de reprise Supabase.

### Réveil et décision

Lorsqu’un événement runtime normal arrive, `LeannaCore` met à jour `lastWakeAt`, réveille immédiatement le heartbeat et transmet l’événement au `PerceptionEngine`. La perception ne fait appel à aucun modèle : elle classe notamment les échecs de tâches, refus de permissions et échecs de workflows avec des règles locales.

Une perception qui nécessite une attention crée au plus une tâche `maintenance` ou `reactive`. Le fingerprint est fondé sur le type d’événement et les ressources affectées ; les doublons sont refusés pendant le TTL de déduplication. Les événements `autonomy:*` sont ignorés comme entrées pour empêcher une boucle de rétroaction.

### Exécution et retour au repos

Le `TaskManager` exécute les tâches dans la limite de concurrence configurée. L’état passe successivement par `pending`, `running`, puis `completed`, `dead_letter` ou `cancelled`. Après une tâche terminée, le cœur revient à `watching`. À l’inactivité, le heartbeat fait évoluer l’état exposé vers `idle` puis `sleeping`.

Dans cette incrémentation, le handler intégré enregistre un fait compact en mémoire de session, avec TTL de 24 heures. Il ne lance pas automatiquement de mission ou d’outil à effet de bord. Cela garantit que toute extension future devra explicitement traverser les politiques de mission, permissions, sandbox, dry-run et approbation déjà en place.

## Événements et timeline

| Événement | Producteur | Signification |
|---|---|---|
| `autonomy:heartbeat` | `HeartbeatService` | État local ACTIVE/IDLE/SLEEP et raison du tick. |
| `autonomy:stateChanged` | `LeannaCore` | Transition de l’état global observable. |
| `autonomy:health` | `LeannaCore` | Santé `healthy` ou `degraded`. |
| `autonomy:taskCreated` | `LeannaCore` | Tâche autonome acceptée dans la queue. |
| `autonomy:taskStateChanged` | `TaskManager` via `LeannaCore` | Transition de cycle de vie et erreur terminale éventuelle. |

Les événements restent **in-process**. Ils sont adaptés au réveil immédiat et à l’observabilité d’une instance ; ils ne constituent pas encore un journal durable ni un bus multi-processus.

## File, protection contre les boucles et récupération

- **Concurrence** : le nombre de tâches autonomes en cours est limité globalement.
- **Backpressure** : une tâche est refusée lorsque la queue est pleine ; aucun travail accepté n’est évincé.
- **Priorité et aging** : `critical > high > medium > low`, avec un bonus d’âge pour prévenir la starvation.
- **Déduplication** : un fingerprint est conservé pendant le TTL configuré.
- **Retry** : les retries sont exponentiels et bornés par `LEANNA_AUTONOMY_MAX_RETRIES`.
- **Timeout** : une exécution lente est arrêtée côté orchestration et passe dans le chemin d’échec.
- **Circuit breaker** : après le seuil d’échecs du type de tâche, les nouvelles tâches de ce type sont refusées jusqu’à la fin du cooldown.
- **Dead-letter** : une tâche terminalement échouée est visible dans `/api/v2/metrics/autonomy`; les 20 derniers échecs sont conservés dans l’état du core.
- **Shutdown** : les nouveaux travaux et retries sont refusés/annulés, puis le runtime partagé est arrêté par le lifecycle existant.

## Sécurité et modes d’autonomie

Le runtime autonome n’accorde aucune permission. Les protections suivantes restent obligatoires pour toute action réelle :

1. `PermissionPolicy` vérifie les permissions déclarées par outil.
2. `DryRunController` intercepte les effets `write`, `exec` et `network` quand le dry-run est actif.
3. `AutonomyPolicy` applique les modes `suggest`, `ask` et `auto`, ainsi que `.leannaignore`.
4. Le sandbox, les confirmations et les checkpoints existants restent sur le chemin des écritures.

Pour démarrer prudemment, conserver :

```env
Leanna_PERMISSION_MODE="enforce"
Leanna_DRY_RUN="true"
LEANNA_AUTONOMY_MAX_CONCURRENCY="1"
```

Ne mettez `Leanna_DRY_RUN="false"` qu’après avoir vérifié les permissions accordées et le comportement des missions. Le mode `auto` d’`AutonomyPolicy` ne doit pas être considéré comme une permission globale : les permissions runtime et les protections de chemins restent applicables.

## Configuration

Toutes les durées sont en millisecondes.

| Variable | Défaut | Rôle |
|---|---:|---|
| `LEANNA_HEARTBEAT_ACTIVE_MS` | 15000 | Tick lorsque l’activité ou la santé requiert l’attention. |
| `LEANNA_HEARTBEAT_IDLE_MS` | 60000 | Tick après une première période d’inactivité. |
| `LEANNA_HEARTBEAT_SLEEP_MS` | 300000 | Tick minimal en veille. Les événements réveillent immédiatement. |
| `LEANNA_HEARTBEAT_IDLE_AFTER_MS` | 300000 | Seuil avant le passage idle, puis sleep. |
| `LEANNA_AUTONOMY_MAX_CONCURRENCY` | 2 | Tâches autonomes exécutées simultanément. |
| `LEANNA_AUTONOMY_MAX_QUEUE_SIZE` | 100 | Maximum de tâches en attente ; au-delà, backpressure. |
| `LEANNA_AUTONOMY_DEDUPE_TTL_MS` | 300000 | Fenêtre de déduplication par fingerprint. |
| `LEANNA_AUTONOMY_RETRY_DELAY_MS` | 1000 | Délai de base pour les retries exponentiels. |
| `LEANNA_AUTONOMY_MAX_RETRIES` | 3 | Tentatives maximales par tâche. |
| `LEANNA_AUTONOMY_TASK_TIMEOUT_MS` | 60000 | Timeout d’une tentative. |
| `LEANNA_AUTONOMY_CIRCUIT_BREAKER_THRESHOLD` | 5 | Échecs avant ouverture du circuit. |
| `LEANNA_AUTONOMY_CIRCUIT_BREAKER_COOLDOWN_MS` | 300000 | Temps de refroidissement du circuit. |

Les valeurs invalides ou non positives reviennent au défaut sûr du code.

## Lancer et superviser 24/7

### Développement

```bash
npm install
cp .env.example .env
npm run dev
```

### Production avec PM2

```bash
npm run build
pm2 start ecosystem.config.cjs --only leanna-server
pm2 status
pm2 logs leanna-server
pm2 save
pm2 startup
```

La configuration PM2 existante utilise une seule instance, un redémarrage automatique, un backoff de redémarrage, une limite mémoire de 1 Go et un délai d’arrêt gracieux. Une seule instance est importante : le `EventBus` et le `TaskManager` autonomes actuels sont locaux au processus.

### Vérifier l’état

Toutes les routes suivantes, sauf `/api/health`, requièrent `x-leanna-token` :

```bash
curl http://127.0.0.1:4000/api/health
curl -H "x-leanna-token: $Leanna_API_TOKEN" \
  http://127.0.0.1:4000/api/v2/metrics/autonomy
curl -H "x-leanna-token: $Leanna_API_TOKEN" \
  http://127.0.0.1:4000/api/v2/metrics/health
```

Le premier endpoint retourne l’état, les tâches récentes (maximum 100) et les erreurs terminales. Les logs PM2 complètent les métriques runtime.

### Arrêter proprement et récupérer

```bash
pm2 stop leanna-server
# ou, sans PM2 : Ctrl+C / SIGTERM sur npm start
```

Le lifecycle arrête d’abord LeannaCore, ses timers et sa queue, puis AgentRuntime, les services externes et le serveur HTTP. Après redémarrage, les missions déjà persistées peuvent être reprises seulement si Supabase et la table `missions` sont configurés. Les tâches génériques du `TaskManager` ne sont pas encore persistées et ne sont donc pas reprises après un crash.

## Limites connues et prochaines étapes

Cette fondation ne prétend pas encore fournir : Redis Streams, locks distribués, task store durable, checkpoint/reprise des tâches génériques, fallbacks de providers, WebSocket dédié/timeline frontend, ni test de charge/soak. Ces étapes exigent de choisir et d’intégrer un contrat de persistance partagé sans dupliquer les systèmes de missions, queues ou permissions existants.
