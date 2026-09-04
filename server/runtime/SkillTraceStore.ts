import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SkillInteractionTrace, SkillTraceObserver } from "./types.js";

export type SkillFeedbackLabel = "correct" | "incorrect" | "needs_improvement";

export interface SkillInteractionFeedback {
  callId: string;
  label: SkillFeedbackLabel;
  correction?: string;
  comment?: string;
}

export interface SkillInteractionRecord extends SkillInteractionTrace {
  id: string;
  createdAt: string;
}

export interface SkillMetrics {
  toolName: string;
  calls: number;
  failures: number;
  successRate: number;
  averageDurationMs: number;
  feedback: {
    correct: number;
    incorrect: number;
    needsImprovement: number;
  };
}

export type SkillProposalStatus = "proposed" | "approved" | "rejected";

export interface SkillTuningProposal {
  id: string;
  toolName: string;
  status: SkillProposalStatus;
  hypothesis: string;
  evidence: Record<string, unknown>;
  proposedChange: Record<string, unknown>;
  expectedMetric: string;
  confidence: number;
  createdAt: string;
  reviewedAt?: string;
}

export interface SkillTuningStore extends SkillTraceObserver {
  listRecent(options?: { toolName?: string; limit?: number }): Promise<SkillInteractionRecord[]>;
  getMetrics(options?: { toolName?: string; limit?: number }): Promise<SkillMetrics[]>;
  recordFeedback(feedback: SkillInteractionFeedback): Promise<void>;
  listProposals(options?: { status?: SkillProposalStatus; limit?: number }): Promise<SkillTuningProposal[]>;
  createProposal(proposal: Omit<SkillTuningProposal, "id" | "createdAt" | "reviewedAt">): Promise<SkillTuningProposal>;
  updateProposalStatus(id: string, status: Exclude<SkillProposalStatus, "proposed">): Promise<SkillTuningProposal>;
  markProposalApplied(id: string, revisionId: string): Promise<void>;
}

export class SupabaseSkillTraceStore implements SkillTuningStore {
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

  async listRecent(options: { toolName?: string; limit?: number } = {}): Promise<SkillInteractionRecord[]> {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
    let query = this.supabase
      .from("skill_interactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (options.toolName) query = query.eq("tool_name", options.toolName);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: any) => ({
      callId: row.call_id,
      toolName: row.tool_name,
      startedAt: row.started_at,
      durationMs: row.duration_ms,
      success: row.success,
      attemptCount: row.attempt_count,
      agentId: row.agent_id ?? undefined,
      conversationId: row.conversation_id ?? undefined,
      messageId: row.message_id ?? undefined,
      arguments: row.arguments_redacted ?? {},
      resultSummary: row.result_summary ?? undefined,
      error: row.error_message ?? undefined,
      id: row.id,
      createdAt: row.created_at,
    }));
  }

  async getMetrics(options: { toolName?: string; limit?: number } = {}): Promise<SkillMetrics[]> {
    const traces = await this.listRecent(options);
    const grouped = new Map<string, SkillMetrics>();
    for (const trace of traces) {
      const current = grouped.get(trace.toolName) ?? {
        toolName: trace.toolName,
        calls: 0,
        failures: 0,
        successRate: 0,
        averageDurationMs: 0,
        feedback: { correct: 0, incorrect: 0, needsImprovement: 0 },
      };
      current.calls += 1;
      current.failures += trace.success ? 0 : 1;
      current.averageDurationMs += trace.durationMs;
      grouped.set(trace.toolName, current);
    }

    if (traces.length > 0) {
      const { data, error } = await this.supabase
        .from("skill_interaction_feedback")
        .select("call_id, label")
        .in("call_id", traces.map((trace) => trace.callId));
      if (error) throw new Error(error.message);

      const toolByCallId = new Map(traces.map((trace) => [trace.callId, trace.toolName]));
      for (const feedback of data ?? []) {
        const toolName = toolByCallId.get(feedback.call_id);
        const metric = toolName ? grouped.get(toolName) : undefined;
        if (!metric) continue;
        if (feedback.label === "correct") metric.feedback.correct += 1;
        if (feedback.label === "incorrect") metric.feedback.incorrect += 1;
        if (feedback.label === "needs_improvement") metric.feedback.needsImprovement += 1;
      }
    }

    for (const metric of grouped.values()) {
      metric.successRate = Math.round(((metric.calls - metric.failures) / metric.calls) * 100) / 100;
      metric.averageDurationMs = Math.round(metric.averageDurationMs / metric.calls);
    }
    return Array.from(grouped.values()).sort((left, right) => right.calls - left.calls);
  }

  async recordFeedback(feedback: SkillInteractionFeedback): Promise<void> {
    const { error } = await this.supabase.from("skill_interaction_feedback").insert({
      call_id: feedback.callId,
      label: feedback.label,
      correction: feedback.correction ?? null,
      comment: feedback.comment ?? null,
    });
    if (error) throw new Error(error.message);
  }

  async listProposals(options: { status?: SkillProposalStatus; limit?: number } = {}): Promise<SkillTuningProposal[]> {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
    let query = this.supabase
      .from("skill_tuning_proposals")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (options.status) query = query.eq("status", options.status);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: any) => ({
      id: row.id,
      toolName: row.tool_name,
      status: row.status,
      hypothesis: row.hypothesis,
      evidence: row.evidence ?? {},
      proposedChange: row.proposed_change ?? {},
      expectedMetric: row.expected_metric,
      confidence: Number(row.confidence),
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at ?? undefined,
    }));
  }

  async createProposal(proposal: Omit<SkillTuningProposal, "id" | "createdAt" | "reviewedAt">): Promise<SkillTuningProposal> {
    const { data, error } = await this.supabase
      .from("skill_tuning_proposals")
      .insert({
        tool_name: proposal.toolName,
        status: proposal.status,
        hypothesis: proposal.hypothesis,
        evidence: proposal.evidence,
        proposed_change: proposal.proposedChange,
        expected_metric: proposal.expectedMetric,
        confidence: proposal.confidence,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return {
      id: data.id,
      toolName: data.tool_name,
      status: data.status,
      hypothesis: data.hypothesis,
      evidence: data.evidence ?? {},
      proposedChange: data.proposed_change ?? {},
      expectedMetric: data.expected_metric,
      confidence: Number(data.confidence),
      createdAt: data.created_at,
    };
  }

  async updateProposalStatus(id: string, status: Exclude<SkillProposalStatus, "proposed">): Promise<SkillTuningProposal> {
    const { data, error } = await this.supabase
      .from("skill_tuning_proposals")
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return {
      id: data.id,
      toolName: data.tool_name,
      status: data.status,
      hypothesis: data.hypothesis,
      evidence: data.evidence ?? {},
      proposedChange: data.proposed_change ?? {},
      expectedMetric: data.expected_metric,
      confidence: Number(data.confidence),
      createdAt: data.created_at,
      reviewedAt: data.reviewed_at ?? undefined,
    };
  }

  async markProposalApplied(id: string, revisionId: string): Promise<void> {
    const { error } = await this.supabase
      .from("skill_tuning_proposals")
      .update({ applied_revision_id: revisionId })
      .eq("id", id);
    if (error) throw new Error(error.message);
  }
}

export function createSupabaseSkillTraceStore(): SupabaseSkillTraceStore | undefined {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return undefined;
  return new SupabaseSkillTraceStore(createClient(url, key));
}