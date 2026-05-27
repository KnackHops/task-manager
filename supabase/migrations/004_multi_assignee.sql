-- ============================================
-- Migration 004: Multi-Assignee
-- Convert single assigned_to FK to many-to-many task_assignees join table
-- ============================================

-- 1. Create task_assignees table
create table public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  assignee_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (task_id, assignee_id)
);

create index idx_task_assignees_assignee on public.task_assignees(assignee_id);

alter table public.task_assignees enable row level security;

-- 2. RLS policies (mirrors task_tags)
create policy "task_assignees_select" on public.task_assignees for select using (
  exists (
    select 1 from public.tasks t
    join public.project_members pm on pm.project_id = t.project_id
    where t.id = task_assignees.task_id and pm.user_id = auth.uid()
  )
);

create policy "task_assignees_insert" on public.task_assignees for insert with check (
  exists (
    select 1 from public.tasks t
    join public.project_members pm on pm.project_id = t.project_id
    where t.id = task_assignees.task_id and pm.user_id = auth.uid()
    and (pm.role = 'owner' or pm.can_create_task or pm.can_edit_task)
  )
);

create policy "task_assignees_delete" on public.task_assignees for delete using (
  exists (
    select 1 from public.tasks t
    join public.project_members pm on pm.project_id = t.project_id
    where t.id = task_assignees.task_id and pm.user_id = auth.uid()
    and (pm.role = 'owner' or pm.can_edit_task)
  )
);

-- 3. Backfill existing assigned_to data
insert into public.task_assignees (task_id, assignee_id)
select id, assigned_to from public.tasks
where assigned_to is not null;

-- 4. Drop the old column
alter table public.tasks drop column assigned_to;
