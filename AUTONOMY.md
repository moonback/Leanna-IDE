# Leanna Autonomous Runtime

## Architecture

`LeannaCore` is an event-driven coordinator layered on the existing runtime:

```text
Runtime EventBus → PerceptionEngine → TaskManager → safe task handler → Memory
       ↑                  ↓                 ↓
 HeartbeatService     deterministic      bounded queue
```

It reuses `AgentRuntime` for runtime lifecycle, `Mission`/`Executor` for missions, `ToolRegistry` for permissions and dry-run, and `Memory` for bounded session observations. It never runs an LLM from the heartbeat or from perception.

## Event flow and sleep/wake

1. A normal Runtime EventBus event arrives.
2. `LeannaCore` wakes the adaptive heartbeat immediately.
3. `PerceptionEngine` classifies the event deterministically.
4. Attention-worthy failures create a deduplicated autonomy maintenance/reactive task.
5. The task handler stores compact metadata in session memory (24-hour TTL).
6. The heartbeat returns to active, idle, or sleep according to configured inactivity.

Autonomy-generated events are excluded from input processing, preventing feedback loops. The heartbeat emits state only and does not poll a model.

## Controls and safety

- Existing `PermissionPolicy`, `DryRunController`, sandbox, `AutonomyPolicy`, approvals and `.leannaignore` remain authoritative.
- The foundation does not execute tools or missions directly. A later dispatcher must call the existing mission/tool APIs so those controls stay on the path.
- Task retries are bounded, exponential, and terminate in `dead_letter`; a per-task-type circuit breaker blocks new work during cooldown.
- Queue backpressure rejects new autonomy work after its configured bound, and aging prevents queued lower-priority tasks from permanent starvation.
- Queue concurrency, queue size, deduplication TTL, timeout, retry count, and circuit-breaker settings are configurable.

## API and monitoring

Authenticated runtime metrics include `GET /api/v2/metrics/autonomy`, returning the current runtime state and up to 100 recent autonomy tasks. Existing `/api/v2/metrics`, `/events`, and `/health` remain unchanged.

## Configuration

All values are milliseconds unless stated otherwise:

- `LEANNA_HEARTBEAT_ACTIVE_MS`, `LEANNA_HEARTBEAT_IDLE_MS`, `LEANNA_HEARTBEAT_SLEEP_MS`, `LEANNA_HEARTBEAT_IDLE_AFTER_MS`
- `LEANNA_AUTONOMY_MAX_CONCURRENCY`, `LEANNA_AUTONOMY_MAX_QUEUE_SIZE`, `LEANNA_AUTONOMY_DEDUPE_TTL_MS`
- `LEANNA_AUTONOMY_RETRY_DELAY_MS`, `LEANNA_AUTONOMY_MAX_RETRIES`, `LEANNA_AUTONOMY_TASK_TIMEOUT_MS`
- `LEANNA_AUTONOMY_CIRCUIT_BREAKER_THRESHOLD`, `LEANNA_AUTONOMY_CIRCUIT_BREAKER_COOLDOWN_MS`

## 24/7 operation and recovery

Start normally with `npm run start` (or the existing PM2/Electron deployment). On shutdown, the lifecycle stops LeannaCore before AgentRuntime, so no new autonomous tasks are accepted. Missions retain their existing Supabase resume behaviour. Without Supabase, mission persistence remains unavailable by design.

## Current scope / known limitations

This increment implements the audited event-driven foundation (events, adaptive heartbeat, runtime state, bounded autonomy task orchestration, API visibility and shutdown). It intentionally does **not** claim a Redis event stream, distributed locks, frontend timeline, provider fallback, durable generic task checkpoints, or soak/load measurements. Those need a durable task-store and frontend contract chosen from the existing architecture before implementation.
