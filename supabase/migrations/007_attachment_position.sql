-- Add position column for drag-to-reorder attachments
alter table public.attachments
  add column position integer not null default 0;

-- Backfill existing rows with position based on created_at order per parent
with ranked as (
  select id,
         row_number() over (
           partition by coalesce(task_id, comment_id)
           order by created_at
         ) - 1 as pos
  from public.attachments
)
update public.attachments a
set position = r.pos
from ranked r
where a.id = r.id;

-- Add UPDATE policy (missing — needed for reorder + reassignment)
create policy "attachments_update" on public.attachments
  for update using (auth.uid() = uploaded_by)
  with check (auth.uid() = uploaded_by);
