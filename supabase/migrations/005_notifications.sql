-- ============================================
-- Migration 005: Notifications + Comment/Assignment Triggers
-- ============================================

-- 1. Create notifications table
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('comment', 'mention', 'assignment')),
  task_id uuid not null references public.tasks(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  message text not null,
  is_read boolean not null default false,
  project_slug text not null,
  created_at timestamptz not null default now()
);

create index idx_notifications_user_unread on public.notifications(user_id, is_read)
  where is_read = false;
create index idx_notifications_user_created on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;

-- RLS: users can only see/update/delete their own notifications
-- INSERT handled by SECURITY DEFINER trigger functions
create policy "notifications_select" on public.notifications for select
  using (auth.uid() = user_id);

create policy "notifications_update" on public.notifications for update
  using (auth.uid() = user_id);

create policy "notifications_delete" on public.notifications for delete
  using (auth.uid() = user_id);

-- 2. Trigger: notify on new comment
create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_slug text;
  v_actor_name text;
  v_task_title text;
  v_mentioned_ids uuid[];
  v_assignee_ids uuid[];
  v_commenter_ids uuid[];
  v_all_recipients uuid[];
  v_recipient_id uuid;
  v_match text[];
begin
  -- Get task info and project slug
  select t.title, p.slug
  into v_task_title, v_project_slug
  from tasks t
  join projects p on p.id = t.project_id
  where t.id = NEW.task_id;

  -- Get actor name
  select full_name into v_actor_name
  from profiles where id = NEW.author_id;

  -- 1. Extract @mentioned user IDs from body: @[Name](uuid)
  v_mentioned_ids := array[]::uuid[];
  for v_match in
    select regexp_matches(NEW.body, '@\[([^\]]+)\]\(([0-9a-f\-]{36})\)', 'g')
  loop
    v_mentioned_ids := array_append(v_mentioned_ids, v_match[2]::uuid);
  end loop;

  -- 2. Get all task assignees
  select coalesce(array_agg(assignee_id), array[]::uuid[])
  into v_assignee_ids
  from task_assignees
  where task_id = NEW.task_id;

  -- 3. Get previous commenters (exclude current author)
  select coalesce(array_agg(distinct author_id), array[]::uuid[])
  into v_commenter_ids
  from comments
  where task_id = NEW.task_id
    and author_id != NEW.author_id
    and id != NEW.id;

  -- 4. Union + dedup + exclude author
  select coalesce(array_agg(distinct uid), array[]::uuid[])
  into v_all_recipients
  from (
    select unnest(v_mentioned_ids) as uid
    union
    select unnest(v_assignee_ids) as uid
    union
    select unnest(v_commenter_ids) as uid
  ) sub
  where uid != NEW.author_id;

  -- 5. Insert notifications
  foreach v_recipient_id in array v_all_recipients
  loop
    insert into notifications (user_id, type, task_id, comment_id, actor_id, message, project_slug)
    values (
      v_recipient_id,
      case when v_recipient_id = any(v_mentioned_ids) then 'mention' else 'comment' end,
      NEW.task_id,
      NEW.id,
      NEW.author_id,
      case
        when v_recipient_id = any(v_mentioned_ids)
          then v_actor_name || ' mentioned you in "' || v_task_title || '"'
        else v_actor_name || ' commented on "' || v_task_title || '"'
      end,
      v_project_slug
    );
  end loop;

  return NEW;
end;
$$;

create trigger trg_notify_on_comment
  after insert on public.comments
  for each row execute function public.notify_on_comment();

-- 3. Trigger: notify on new assignment
create or replace function public.notify_on_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task_title text;
  v_project_slug text;
  v_actor_id uuid;
  v_actor_name text;
begin
  -- Get task info
  select t.title, p.slug, t.created_by
  into v_task_title, v_project_slug, v_actor_id
  from tasks t
  join projects p on p.id = t.project_id
  where t.id = NEW.task_id;

  -- Use auth.uid() as actor if available, else task creator
  v_actor_id := coalesce(auth.uid(), v_actor_id);

  -- Don't notify if self-assigning
  if NEW.assignee_id = v_actor_id then
    return NEW;
  end if;

  select full_name into v_actor_name
  from profiles where id = v_actor_id;

  insert into notifications (user_id, type, task_id, actor_id, message, project_slug)
  values (
    NEW.assignee_id,
    'assignment',
    NEW.task_id,
    v_actor_id,
    v_actor_name || ' assigned you to "' || v_task_title || '"',
    v_project_slug
  );

  return NEW;
end;
$$;

create trigger trg_notify_on_assignment
  after insert on public.task_assignees
  for each row execute function public.notify_on_assignment();

-- 4. Enable Supabase Realtime
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.notifications;
