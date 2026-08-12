-- Link attachments to a checklist item (optional sub-tag of a task attachment).

alter table public.attachments
  add column checklist_item_id uuid references public.task_checklist_items(id) on delete cascade;

create index idx_attachments_checklist_item on public.attachments(checklist_item_id);

-- checklist_item_id only valid on a task attachment; leave attachment_parent untouched.
alter table public.attachments add constraint attachment_checklist_item check (
  checklist_item_id is null or task_id is not null
);
