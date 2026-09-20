# Autonomy Audit — Phase 0

Audit completed before the autonomy implementation. The repository already contains the essential execution, security, mission, memory, scheduling, and observability primitives; the autonomy work therefore extends their orchestration rather than replacing them.

| Existing component | Location | Purpose | Can reuse? | Required modification | Risk | Dependencies |
|---|---|---|---|---|---|---|
| Typed EventBus | `server/runtime/EventBus.ts` | In-process typed pub/sub, metrics, middleware | Yes | Add a small `autonomy:*` taxonomy | In-process only; no durable delivery | `runtime/types.ts` |
| AgentRuntime | `server/runtime/AgentRuntime.ts` | Agent registry, priority queue, tool execution and lifecycle | Yes | Keep its agent queue; inject autonomy as a subscriber | Must not duplicate agent scheduling | EventBus, FSM, ToolRegistry |
| Mission / Planner / Executor / Reflection | `server/mission/` | Persistent long-running mission lifecycle, reflection and bounded retries | Yes | Autonomy only creates observations/tasks; mission execution continues through existing policy | Mission persistence is optional without Supabase | Tool handler, `MissionStore`, `AutonomyPolicy` |
| MissionStore / resume | `server/mission/MissionStore.ts`, `Executor.ts` | Supabase persistence and restart recovery for missions | Yes | None in this increment | No persistence when Supabase is absent | Supabase |
| AutonomyPolicy | `server/mission/AutonomyPolicy.ts` | suggest/ask/auto and `.leannaignore` decision before effects | Yes | No bypass; future mission dispatch must use it | `auto` permits configured effects | Tool permissions, workspace |
| PermissionPolicy / DryRun | `server/runtime/PermissionPolicy.ts`, `DryRun.ts` | Permission enforcement and effect-free simulation | Yes | No modification | Tool declarations without permissions are conservatively treated | ToolRegistry |
| Supervisor / SmartSkills | `server/autonomy/` | Bounded correction and loop protection for live sessions | Yes | Add coordinator beside, not instead of, these guards | Session-local state | Live socket, skills |
| Scheduled task timer | `server/skills/automationScheduler.ts` | Persistent periodic user automations with failure cutoff | Yes | Do not duplicate its user schedule model | Uses `setInterval`; no distributed lock | Supabase, skill handler |
| Workflow engine | `server/runtime/WorkflowEngine.ts` | Workflow execution and EventBus events | Yes | Consume its completion events | No workflow retry persistence | ToolRegistry |
| ProcessingQueue | `server/notebooks/ProcessingQueue.ts` | Bounded source-ingestion queue | Yes, scoped | Leave untouched; unrelated workload | Separate queue semantics | Notebook processing |
| Hierarchical memory | `server/runtime/Memory.ts`, `HierarchicalMemoryService.ts` | Working/session/project/long-term memory with TTL and events | Yes | Store compact autonomy task facts with TTL | Project/long-term persistence is configurable | EventBus, Supabase adapters |
| Runtime observability | `server/runtime/Observability.ts`, `routes/metrics.ts` | Event/tool/task metrics and health endpoints | Yes | Extend metrics endpoint with autonomy state/timeline | Timeline is in-memory in this increment | Runtime EventBus |
| WebSocket broadcasting | `server.ts` | Agent and mission real-time UI events | Yes | Existing broadcasters can consume autonomy events in a future UI increment | No dedicated autonomy client message yet | `ws`, auth |
| Graceful shutdown | `server/lifecycle.ts` | Stops timers/services and flushes persistence | Yes | Stop LeannaCore before shared runtime | Shutdown order must remain safe | Runtime, telemetry, MCP |
| Redis / cache | `REDIS_URL`, knowledge cache modules | Optional knowledge cache | Partial | No autonomy lock/stream added: no existing generic Redis coordination contract was found | Distributed workers remain future work | Redis optional |

## Findings

- The project has an EventBus but it is deliberately in-process. It is appropriate for immediate wake-up and telemetry, but does not by itself provide multi-process durability, distributed locks, or a dead-letter stream.
- `AgentRuntime` already owns agent task scheduling. The new autonomy task manager is intentionally limited to **autonomy-originated work** and does not replace the runtime queue, workflows, missions, or notebook processing queue.
- Existing permission policy, dry-run interception, sandboxing, and mission approval policy are retained. The current foundation only records/observes autonomous maintenance tasks; it does not dispatch unsafe tools directly.
- Mission checkpoint/resume already exists when Supabase is configured. Distributed task checkpointing and Redis recovery are not implemented because no generic durable task-store/lock convention exists to safely extend in this increment.

## Event taxonomy added

`autonomy:heartbeat`, `autonomy:stateChanged`, `autonomy:health`, and `autonomy:taskCreated` are runtime-internal events. They are emitted on the existing `EventBus`, are ignored as sources of new autonomy work, and never invoke an LLM.
