-- Associe chaque conversation au workspace actif de Leanna.
-- Les conversations historiques restent project_id = '' car leur projet d'origine
-- ne peut pas être déduit de manière fiable à partir des anciennes données.
alter table public.conversations
  add column if not exists project_id text not null default '';

create index if not exists idx_conversations_project_started_at
  on public.conversations (project_id, started_at desc);
