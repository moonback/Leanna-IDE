-- Persistent, redacted execution traces for adaptive skill tuning.
create table if not exists public.skill_interactions (
    id uuid default gen_random_uuid() primary key,
    call_id text not null unique,
    tool_name text not null,
    started_at timestamptz not null,
    duration_ms integer not null check (duration_ms >= 0),
    success boolean not null,
    attempt_count integer not null check (attempt_count >= 0),
    agent_id text,
    conversation_id uuid references public.conversations(id) on delete set null,
    message_id uuid references public.conversation_messages(id) on delete set null,
    tool_call_id text,
    arguments_redacted jsonb not null default '{}'::jsonb,
    result_summary text,
    error_message text,
    created_at timestamptz not null default now()
);

create index if not exists idx_skill_interactions_tool_created
on public.skill_interactions(tool_name, created_at desc);

create index if not exists idx_skill_interactions_conversation
on public.skill_interactions(conversation_id, created_at desc);

alter table public.skill_interactions enable row level security;

alter table public.skill_interactions
    add column if not exists tool_call_id text;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'skill_interactions'
          and policyname = 'Service role full access on skill_interactions'
    ) then
        create policy "Service role full access on skill_interactions"
        on public.skill_interactions for all to service_role
        using (true) with check (true);
    end if;
end
$$;

create table if not exists public.skill_interaction_feedback (
    id uuid default gen_random_uuid() primary key,
    call_id text not null references public.skill_interactions(call_id) on delete cascade,
    label text not null check (label in ('correct', 'incorrect', 'needs_improvement')),
    correction text,
    comment text,
    created_at timestamptz not null default now()
);

create index if not exists idx_skill_feedback_call_created
on public.skill_interaction_feedback(call_id, created_at desc);

alter table public.skill_interaction_feedback enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'skill_interaction_feedback'
          and policyname = 'Service role full access on skill_interaction_feedback'
    ) then
        create policy "Service role full access on skill_interaction_feedback"
        on public.skill_interaction_feedback for all to service_role
        using (true) with check (true);
    end if;
end
$$;

create table if not exists public.skill_tuning_proposals (
    id uuid default gen_random_uuid() primary key,
    tool_name text not null,
    status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected')),
    hypothesis text not null,
    evidence jsonb not null default '{}'::jsonb,
    proposed_change jsonb not null default '{}'::jsonb,
    expected_metric text not null,
    confidence numeric(4,3) not null check (confidence >= 0 and confidence <= 1),
    created_at timestamptz not null default now(),
    reviewed_at timestamptz
);

create index if not exists idx_skill_tuning_proposals_status_created
on public.skill_tuning_proposals(status, created_at desc);

alter table public.skill_tuning_proposals enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'skill_tuning_proposals'
          and policyname = 'Service role full access on skill_tuning_proposals'
    ) then
        create policy "Service role full access on skill_tuning_proposals"
        on public.skill_tuning_proposals for all to service_role
        using (true) with check (true);
    end if;
end
$$;

create table if not exists public.custom_skill_revisions (
        id uuid default gen_random_uuid() primary key,
        skill_id uuid not null references public.custom_skills(id) on delete cascade,
        skill_name text not null,
        snapshot jsonb not null,
        source_proposal_id uuid references public.skill_tuning_proposals(id) on delete set null,
        created_at timestamptz not null default now(),
        rolled_back_at timestamptz
);

create index if not exists idx_custom_skill_revisions_skill_created
on public.custom_skill_revisions(skill_id, created_at desc);

alter table public.custom_skill_revisions enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'custom_skill_revisions'
          and policyname = 'Service role full access on custom_skill_revisions'
    ) then
        create policy "Service role full access on custom_skill_revisions"
        on public.custom_skill_revisions for all to service_role
        using (true) with check (true);
    end if;
end
$$;

alter table public.skill_tuning_proposals
    add column if not exists applied_revision_id uuid references public.custom_skill_revisions(id) on delete set null;