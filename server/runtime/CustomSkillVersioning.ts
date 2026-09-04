import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface CustomSkillVersionSnapshot {
  id: string;
  skillId: string;
  skillName: string;
  snapshot: Record<string, unknown>;
  sourceProposalId?: string;
  createdAt: string;
  rolledBackAt?: string;
}

export interface CustomSkillUpdate {
  description?: string;
  parameters?: unknown[];
  instruction?: string;
  category?: string;
  enabled?: boolean;
  icon?: string;
}

export interface CustomSkillVersionStore {
  applyUpdate(input: {
    skillId: string;
    updates: CustomSkillUpdate;
    expectedUpdatedAt?: string;
    sourceProposalId?: string;
  }): Promise<{ skill: Record<string, unknown>; revision: CustomSkillVersionSnapshot }>;
  rollback(revisionId: string): Promise<{ skill: Record<string, unknown>; revision: CustomSkillVersionSnapshot }>;
  listRevisions(skillId?: string): Promise<CustomSkillVersionSnapshot[]>;
}

export class SupabaseCustomSkillVersionStore implements CustomSkillVersionStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async applyUpdate(input: {
    skillId: string;
    updates: CustomSkillUpdate;
    expectedUpdatedAt?: string;
    sourceProposalId?: string;
  }): Promise<{ skill: Record<string, unknown>; revision: CustomSkillVersionSnapshot }> {
    const { data: current, error: readError } = await this.supabase
      .from("custom_skills")
      .select("*")
      .eq("id", input.skillId)
      .single();
    if (readError) throw new Error(readError.message);
    if (input.expectedUpdatedAt && current.updated_at !== input.expectedUpdatedAt) {
      throw new Error("Le custom skill a changé depuis la lecture proposée. Rechargez-le avant application.");
    }

    const { data: revision, error: revisionError } = await this.supabase
      .from("custom_skill_revisions")
      .insert({
        skill_id: current.id,
        skill_name: current.name,
        snapshot: current,
        source_proposal_id: input.sourceProposalId ?? null,
      })
      .select()
      .single();
    if (revisionError) throw new Error(revisionError.message);

    const { data: updated, error: updateError } = await this.supabase
      .from("custom_skills")
      .update(input.updates)
      .eq("id", input.skillId)
      .eq("updated_at", current.updated_at)
      .select()
      .single();
    if (updateError) throw new Error(updateError.message);

    return { skill: updated, revision: mapRevision(revision) };
  }

  async rollback(revisionId: string): Promise<{ skill: Record<string, unknown>; revision: CustomSkillVersionSnapshot }> {
    const { data: revision, error: revisionError } = await this.supabase
      .from("custom_skill_revisions")
      .select("*")
      .eq("id", revisionId)
      .single();
    if (revisionError) throw new Error(revisionError.message);
    if (revision.rolled_back_at) throw new Error("Cette révision a déjà été restaurée.");

    const snapshot = revision.snapshot as Record<string, unknown>;
    const updates: CustomSkillUpdate = {
      description: snapshot.description as string,
      parameters: snapshot.parameters as unknown[],
      instruction: snapshot.instruction as string,
      category: snapshot.category as string,
      enabled: snapshot.enabled as boolean,
      icon: snapshot.icon as string,
    };
    const { data: skill, error: updateError } = await this.supabase
      .from("custom_skills")
      .update(updates)
      .eq("id", revision.skill_id)
      .select()
      .single();
    if (updateError) throw new Error(updateError.message);

    const { data: marked, error: markError } = await this.supabase
      .from("custom_skill_revisions")
      .update({ rolled_back_at: new Date().toISOString() })
      .eq("id", revisionId)
      .select()
      .single();
    if (markError) throw new Error(markError.message);
    return { skill, revision: mapRevision(marked) };
  }

  async listRevisions(skillId?: string): Promise<CustomSkillVersionSnapshot[]> {
    let query = this.supabase
      .from("custom_skill_revisions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (skillId) query = query.eq("skill_id", skillId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapRevision);
  }
}

function mapRevision(row: any): CustomSkillVersionSnapshot {
  return {
    id: row.id,
    skillId: row.skill_id,
    skillName: row.skill_name,
    snapshot: row.snapshot ?? {},
    sourceProposalId: row.source_proposal_id ?? undefined,
    createdAt: row.created_at,
    rolledBackAt: row.rolled_back_at ?? undefined,
  };
}

export function createSupabaseCustomSkillVersionStore(): SupabaseCustomSkillVersionStore | undefined {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return undefined;
  return new SupabaseCustomSkillVersionStore(createClient(url, key));
}