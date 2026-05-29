-- Allow orphan attachments (both task_id and comment_id null)
-- for temporary uploads before comment creation
alter table public.attachments drop constraint attachment_parent;

alter table public.attachments add constraint attachment_parent check (
  (task_id is not null and comment_id is null) or
  (task_id is null and comment_id is not null) or
  (task_id is null and comment_id is null)
);
