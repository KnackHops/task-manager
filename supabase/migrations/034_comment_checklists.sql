-- Comment checklists: ordered items per comment with completion tracking.
-- Mirrors task_checklist_items (029), keyed on comment_id.

create table public.comment_checklist_items (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  title text not null,
  is_done boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_comment_checklist_comment on public.comment_checklist_items(comment_id);
create index idx_comment_checklist_position on public.comment_checklist_items(comment_id, position);

alter table public.comment_checklist_items enable row level security;

-- SELECT: any project member of the comment's task's project
create policy "comment_checklist_select" on public.comment_checklist_items for select using (
  exists (
    select 1 from public.comments c
    join public.tasks t on t.id = c.task_id
    join public.project_members pm on pm.project_id = t.project_id
    where c.id = comment_checklist_items.comment_id and pm.user_id = auth.uid()
  )
);

-- INSERT/UPDATE/DELETE: the comment author (and a project member)
create policy "comment_checklist_insert" on public.comment_checklist_items for insert with check (
  exists (
    select 1 from public.comments c
    join public.tasks t on t.id = c.task_id
    join public.project_members pm on pm.project_id = t.project_id
    where c.id = comment_checklist_items.comment_id
      and pm.user_id = auth.uid() and c.author_id = auth.uid()
  )
);

create policy "comment_checklist_update" on public.comment_checklist_items for update using (
  exists (
    select 1 from public.comments c
    join public.tasks t on t.id = c.task_id
    join public.project_members pm on pm.project_id = t.project_id
    where c.id = comment_checklist_items.comment_id
      and pm.user_id = auth.uid() and c.author_id = auth.uid()
  )
);

create policy "comment_checklist_delete" on public.comment_checklist_items for delete using (
  exists (
    select 1 from public.comments c
    join public.tasks t on t.id = c.task_id
    join public.project_members pm on pm.project_id = t.project_id
    where c.id = comment_checklist_items.comment_id
      and pm.user_id = auth.uid() and c.author_id = auth.uid()
  )
);

-- Auto-update updated_at
create trigger comment_checklist_items_updated_at before update on public.comment_checklist_items
  for each row execute function public.update_updated_at();
