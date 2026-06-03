-- Task checklists: ordered items per task with completion tracking.

create table public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null,
  is_done boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_checklist_task on public.task_checklist_items(task_id);
create index idx_checklist_position on public.task_checklist_items(task_id, position);

alter table public.task_checklist_items enable row level security;

-- SELECT: any project member can read
create policy "checklist_items_select" on public.task_checklist_items for select using (
  exists (
    select 1 from public.tasks t
    join public.project_members pm on pm.project_id = t.project_id
    where t.id = task_checklist_items.task_id and pm.user_id = auth.uid()
  )
);

-- INSERT: member with can_edit_task or can_create_task or owner
create policy "checklist_items_insert" on public.task_checklist_items for insert with check (
  exists (
    select 1 from public.tasks t
    join public.project_members pm on pm.project_id = t.project_id
    where t.id = task_checklist_items.task_id and pm.user_id = auth.uid()
    and (pm.role = 'owner' or pm.can_edit_task or pm.can_create_task)
  )
);

-- UPDATE: member with can_edit_task or owner
create policy "checklist_items_update" on public.task_checklist_items for update using (
  exists (
    select 1 from public.tasks t
    join public.project_members pm on pm.project_id = t.project_id
    where t.id = task_checklist_items.task_id and pm.user_id = auth.uid()
    and (pm.role = 'owner' or pm.can_edit_task)
  )
);

-- DELETE: member with can_edit_task or owner
create policy "checklist_items_delete" on public.task_checklist_items for delete using (
  exists (
    select 1 from public.tasks t
    join public.project_members pm on pm.project_id = t.project_id
    where t.id = task_checklist_items.task_id and pm.user_id = auth.uid()
    and (pm.role = 'owner' or pm.can_edit_task)
  )
);

-- Auto-update updated_at
create trigger checklist_items_updated_at before update on public.task_checklist_items
  for each row execute function public.update_updated_at();
