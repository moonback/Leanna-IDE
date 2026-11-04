import type { AgentEvent } from "./ProgressNotifier.js";
import { appendJsonl, coreDir, readJsonl } from "../core/paths.js";

export interface SequencedAgentEvent {
  id: number;
  event: AgentEvent;
}

export type AgentEventListener = (entry: SequencedAgentEvent) => void;

interface PersistedAgentEvent extends SequencedAgentEvent {
  recordedAt: string;
}

/**
 * Bounded replay stream for agent activity.
 * Events are append-only persisted so reconnecting clients can resume after a
 * temporary disconnect or server restart. The in-memory window is bounded.
 */
export class AgentEventStream {
  private listeners = new Set<AgentEventListener>();
  private history: SequencedAgentEvent[] = [];
  private nextId = 1;
  private readonly maxHistory: number;
  private readonly filePath: string;

  constructor(options: { filePath?: string; maxHistory?: number } = {}) {
    this.filePath = options.filePath ?? coreDir("agent-events.jsonl");
    this.maxHistory = Math.max(1, options.maxHistory ?? 500);
    this.hydrate();
  }

  private hydrate(): void {
    const persisted = readJsonl<PersistedAgentEvent>(this.filePath)
      .filter((entry) => Number.isSafeInteger(entry.id) && entry.id > 0 && entry.event?.type === "agent_event")
      .sort((a, b) => a.id - b.id);
    this.history = persisted.slice(-this.maxHistory).map(({ id, event }) => ({ id, event }));
    this.nextId = (persisted[persisted.length - 1]?.id ?? 0) + 1;
  }

  /**
   * Subscribe to live events and optionally replay everything after the cursor.
   * Registration and replay are synchronous, so no event falls into a gap.
   */
  subscribe(listener: AgentEventListener, afterId?: number): () => void {
    this.listeners.add(listener);
    if (afterId !== undefined && Number.isSafeInteger(afterId) && afterId >= 0) {
      for (const entry of this.history) {
        if (entry.id > afterId) {
          try { listener(entry); } catch { /* Replay consumers are isolated. */ }
        }
      }
    }
    return () => this.listeners.delete(listener);
  }

  publish(event: AgentEvent): number {
    const entry: SequencedAgentEvent = { id: this.nextId++, event };
    this.history.push(entry);
    if (this.history.length > this.maxHistory) this.history.splice(0, this.history.length - this.maxHistory);

    try {
      const persisted: PersistedAgentEvent = { ...entry, recordedAt: new Date().toISOString() };
      appendJsonl(this.filePath, persisted);
    } catch {
      // Never block agent execution if local persistence is temporarily unavailable.
    }

    for (const listener of this.listeners) {
      try { listener(entry); } catch { /* An SSE client must not block agent execution. */ }
    }
    return entry.id;
  }

  getLatestId(): number {
    return this.nextId - 1;
  }

  getHistory(): SequencedAgentEvent[] {
    return this.history.map((entry) => ({ ...entry }));
  }
}

export const agentEventStream = new AgentEventStream();
