-- Link attachments to a comment checklist item (optional sub-tag of a comment attachment).

alter table public.attachments
  add column comment_checklist_item_id uuid
    references public.comment_checklist_items(id) on delete cascade;

create index idx_attachments_comment_checklist_item
  on public.attachments(comment_checklist_item_id);

-- comment_checklist_item_id only valid on a comment attachment.
alter table public.attachments add constraint attachment_comment_checklist_item check (
  comment_checklist_item_id is null or comment_id is not null
);
