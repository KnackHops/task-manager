-- Task dependencies: task_id depends on depends_on_id.
-- "Task A depends on Task B" means A should ideally not be marked done until B is done.
-- Soft enforcement only — the UI warns but allows overriding.

create table public.task_dependencies (
  task_id uuid not null references public.tasks(id) on delete cascade,
  depends_on_id uuid not null references public.tasks(id) on delete cascade,
  primary key (task_id, depends_on_id),
  constraint no_self_dependency check (task_id <> depends_on_id)
);

create index idx_task_dependencies_task on public.task_dependencies(task_id);
create index idx_task_dependencies_depends_on on public.task_dependencies(depends_on_id);

alter table public.task_dependencies enable row level security;

create policy "task_dependencies_select" on public.task_dependencies for select using (
  exists (
    select 1 from public.tasks t
    join public.project_members pm on pm.project_id = t.project_id
    where t.id = task_dependencies.task_id and pm.user_id = auth.uid()
  )image.png
);

create policy "task_dependencies_insert" on public.task_dependencies for insert with check (
  exists (
    select 1 from public.tasks t
    join public.project_members pm on pm.project_id = t.project_id
    where t.id = task_dependencies.task_id and pm.user_id = auth.uid()
    and (pm.role = 'owner' or pm.can_create_task or pm.can_edit_task)
  )
);

create policy "task_dependencies_delete" on public.task_dependencies for delete using (
  exists (
    select 1 from public.tasks t
    join public.project_members pm on pm.project_id = t.project_id
    where t.id = task_dependencies.task_id and pm.user_id = auth.uid()
    and (pm.role = 'owner' or pm.can_edit_task)
  )
);
