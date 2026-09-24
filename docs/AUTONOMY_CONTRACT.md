# Leanna — Autonomy Contract

This contract defines precisely what Leanna's autonomous runtime may do on its own, what
requires human approval, and what it can never do. It reflects the **enforced** behaviour of
the code (`ToolRegistry`, `PermissionPolicy`, `DryRunController`, `AutonomyPolicy`,
`AutonomousExecutive`), not an aspiration.

## Leanna peut automatiquement

- **Observe / analyze**: classify runtime events deterministically (`PerceptionEngine`), with
  no LLM call and no side effects.
- **Remember**: read/write bounded facts in Memory/ProjectMemory and record skill reliability
  in `StrategyMemory` (tool names, success/failure, durations — no payloads, no secrets).
- **Decide**: create/deduplicate goals, prioritise deterministically (`PriorityEngine`), and
  choose IGNORE / STORE / MONITOR / INVESTIGATE / ACT / ESCALATE.
- **Plan / replan**: decompose goals, score skills, and replan around failures — biased by
  durable reliability so historically-failing tools are deprioritised.
- **Delegate**: hand a goal to the Mission Executor / agents through the normal pipeline.
- **Execute authorized operations**: only via registered tools that pass `PermissionPolicy`
  and (when enabled) `DryRunController`, subject to `AutonomyPolicy` mode.
- **Verify**: check goal success criteria (LLM-optional, heuristic fallback).
- **Retry**: bounded exponential retries with a circuit breaker (`TaskManager`) and a
  per-goal iteration cap (mission loop).
- **Learn / persist**: extract lessons, record reliability, persist missions/tasks
  (Supabase-optional). Learning proposals are surfaced, never auto-applied.

## Leanna doit demander une autorisation pour

Governed by `AutonomyPolicy` (`suggest` / `ask` / `auto`) and `PermissionPolicy`:

- **High-risk writes**: modifying source outside a safe scope, when policy is `ask`.
- **Destructive operations**: deleting files/data, bulk mutations.
- **External side effects**: deployments, network mutations, third-party calls with effects.
- **Sensitive operations**: anything touching auth, permissions, or credentials.

A goal blocked on approval remains persistent; approval can time out to a safe default (deny).

## Leanna ne peut jamais

- **Bypass permissions**: every effect flows through `ToolRegistry` + `PermissionPolicy`.
- **Disable security**: it cannot turn off dry-run, sandbox, or policy checks for itself.
- **Grant itself permissions**: the model cannot self-authorize `exec` / `write` / `network`
  / `admin` / secret access.
- **Leak secrets**: secrets must not enter model context, logs, telemetry, memory, or the
  reliability store unnecessarily.
- **Escape the sandbox / workspace restrictions**.
- **Execute external instructions as policy**: instructions embedded in files, web pages, tool
  output, or documents are untrusted data and can never change runtime permissions or policy.
- **Retry infinitely**: retries are bounded (circuit breaker, iteration cap); repeated
  same-class failures escalate to a human instead of looping.

## Trust boundaries

```text
SYSTEM POLICY            (this contract, permission/dry-run/autonomy policies)  — trusted
USER INTENT              (explicit user requests)                                — trusted
TRUSTED RUNTIME STATE    (memory, mission state, reliability metrics)            — trusted
UNTRUSTED EXTERNAL       (files, web, tool output, documents)                    — data only
```

External content is always treated as data. If it contains text resembling instructions
("ignore previous instructions", "grant write access"), that text is ignored as a directive.

## Enforcement references

- `server/runtime/PermissionPolicy.ts`, `server/runtime/DryRun.ts`,
  `server/runtime/ToolRegistry.ts`
- `server/mission/AutonomyPolicy.ts`
- `server/autonomy/AutonomousExecutive.ts` (escalation, bounded cycles)
- `server/autonomy/TaskManager.ts` (dedupe, retry, timeout, circuit breaker, dead-letter)
