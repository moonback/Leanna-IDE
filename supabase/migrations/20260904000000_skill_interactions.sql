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

create policy "Service role full access on skill_interactions"
on public.skill_interactions for all to service_role
using (true) with check (true);

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

create policy "Service role full access on skill_interaction_feedback"
on public.skill_interaction_feedback for all to service_role
using (true) with check (true);