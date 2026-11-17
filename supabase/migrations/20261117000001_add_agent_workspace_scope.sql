-- Workspace ownership for persisted agent state.
-- Existing rows remain NULL and are intentionally excluded by application queries (fail closed).
ALTER TABLE public.agent_tasks
  ADD COLUMN IF NOT EXISTS project_id TEXT;
ALTER TABLE public.agent_orchestrations
  ADD COLUMN IF NOT EXISTS project_id TEXT;
ALTER TABLE public.agent_messages
  ADD COLUMN IF NOT EXISTS project_id TEXT;

CREATE INDEX IF NOT EXISTS idx_agent_tasks_project_created
  ON public.agent_tasks (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_orchestrations_project_created
  ON public.agent_orchestrations (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_messages_project_created
  ON public.agent_messages (project_id, created_at DESC);

COMMENT ON COLUMN public.agent_tasks.project_id IS
  'Workspace owner; NULL legacy rows are hidden until safely assigned.';
COMMENT ON COLUMN public.agent_orchestrations.project_id IS
  'Workspace owner; NULL legacy rows are hidden until safely assigned.';
COMMENT ON COLUMN public.agent_messages.project_id IS
  'Workspace owner; NULL legacy rows are hidden until safely assigned.';
