import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SkillInteractionTrace, SkillTraceObserver } from "./types.js";

export class SupabaseSkillTraceStore implements SkillTraceObserver {
  constructor(private readonly supabase: SupabaseClient) {}

  async record(trace: SkillInteractionTrace): Promise<void> {
    const { error } = await this.supabase.from("skill_interactions").insert({
      call_id: trace.callId,
      tool_name: trace.toolName,
      started_at: trace.startedAt,
      duration_ms: trace.durationMs,
      success: trace.success,
      attempt_count: trace.attemptCount,
      agent_id: trace.agentId ?? null,
      conversation_id: trace.conversationId ?? null,
      message_id: trace.messageId ?? null,
      arguments_redacted: trace.arguments,
      result_summary: trace.resultSummary ?? null,
      error_message: trace.error ?? null,
    });

    if (error) throw new Error(error.message);
  }
}

export function createSupabaseSkillTraceStore(): SupabaseSkillTraceStore | undefined {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return undefined;
  return new SupabaseSkillTraceStore(createClient(url, key));
}