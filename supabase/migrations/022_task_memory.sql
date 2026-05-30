-- Per-task persistent memory for the MCP server (Claude Code).
-- Key-value facts scoped to a task, shared across users, auto-removed when the
-- task is deleted. Distinct from comments: this is Claude's own knowledge store,
-- not human-facing conversation. Claude-only — no task-manager frontend surface.

create table public.task_memory (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  key text not null,
  value text not null,
  type text not null default 'fact',
  author_id uuid not null references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (task_id, key)
);

create index idx_task_memory_task on public.task_memory(task_id);

alter table public.task_memory enable row level security;

-- Memory is intentionally shared per task and Claude-only. Any authenticated
-- member can read/write/clear; author_id is stamped on write for traceability.
create policy "task_memory_select" on public.task_memory for select using (true);
create policy "task_memory_insert" on public.task_memory for insert with check (auth.uid() = author_id);
create policy "task_memory_update" on public.task_memory for update using (true);
create policy "task_memory_delete" on public.task_memory for delete using (true);

create trigger task_memory_updated_at before update on public.task_memory
  for each row execute function public.update_updated_at();
