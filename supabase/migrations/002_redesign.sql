-- ============================================
-- Task Manager — Redesign Migration
-- Multi-project, custom columns, tags, permissions
-- Run this AFTER 001_full_schema.sql
-- ============================================

-- ============================================
-- 1. NEW TABLES
-- ============================================

-- Project columns (custom per project)
create table public.project_columns (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  slug text not null,
  position int not null default 0,
  created_at timestamptz default now(),
  unique(project_id, slug)
);

alter table public.project_columns enable row level security;

-- Project members (permissions per user per project)
create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  can_create_task boolean not null default true,
  can_edit_task boolean not null default false,
  can_delete_task boolean not null default false,
  can_archive_task boolean not null default false,
  can_manage_columns boolean not null default false,
  can_manage_members boolean not null default false,
  is_favorite boolean not null default false,
  joined_at timestamptz default now(),
  unique(project_id, user_id)
);

alter table public.project_members enable row level security;

-- Project tags (custom per project)
create table public.project_tags (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  slug text not null,
  color text not null default 'gray',
  created_at timestamptz default now(),
  unique(project_id, slug)
);

alter table public.project_tags enable row level security;

-- Task-tag join table (many-to-many)
create table public.task_tags (
  task_id uuid not null references public.tasks(id) on delete cascade,
  tag_id uuid not null references public.project_tags(id) on delete cascade,
  primary key (task_id, tag_id)
);

alter table public.task_tags enable row level security;

-- ============================================
-- 2. ALTER EXISTING TABLES
-- ============================================

-- Projects: add created_by
alter table public.projects add column created_by uuid references public.profiles(id);

-- Tasks: add column_id, archived fields
alter table public.tasks add column column_id uuid references public.project_columns(id);
alter table public.tasks add column archived boolean not null default false;
alter table public.tasks add column archived_at timestamptz;

-- ============================================
-- 3. DATA MIGRATION (existing "nonstop" project)
-- ============================================

-- 3a. Create default columns for nonstop
do $$
declare
  v_project_id uuid;
  v_col_backlog uuid;
  v_col_todo uuid;
  v_col_in_progress uuid;
  v_col_review uuid;
  v_col_done uuid;
begin
  select id into v_project_id from public.projects where slug = 'nonstop';

  if v_project_id is not null then
    -- Insert columns and capture IDs
    insert into public.project_columns (project_id, name, slug, position)
    values (v_project_id, 'Backlog', 'backlog', 0) returning id into v_col_backlog;

    insert into public.project_columns (project_id, name, slug, position)
    values (v_project_id, 'To Do', 'todo', 1) returning id into v_col_todo;

    insert into public.project_columns (project_id, name, slug, position)
    values (v_project_id, 'In Progress', 'in-progress', 2) returning id into v_col_in_progress;

    insert into public.project_columns (project_id, name, slug, position)
    values (v_project_id, 'Review', 'review', 3) returning id into v_col_review;

    insert into public.project_columns (project_id, name, slug, position)
    values (v_project_id, 'Done', 'done', 4) returning id into v_col_done;

    -- Map existing tasks status → column_id
    update public.tasks set column_id = v_col_backlog where project_id = v_project_id and status = 'backlog';
    update public.tasks set column_id = v_col_todo where project_id = v_project_id and status = 'todo';
    update public.tasks set column_id = v_col_in_progress where project_id = v_project_id and status = 'in_progress';
    update public.tasks set column_id = v_col_review where project_id = v_project_id and status = 'review';
    update public.tasks set column_id = v_col_done where project_id = v_project_id and status = 'done';

    -- Create default tags
    declare
      v_tag_bug uuid;
      v_tag_feature uuid;
      v_tag_task uuid;
      v_tag_improvement uuid;
    begin
      insert into public.project_tags (project_id, name, slug, color)
      values (v_project_id, 'Bug', 'bug', 'red') returning id into v_tag_bug;

      insert into public.project_tags (project_id, name, slug, color)
      values (v_project_id, 'Feature', 'feature', 'blue') returning id into v_tag_feature;

      insert into public.project_tags (project_id, name, slug, color)
      values (v_project_id, 'Task', 'task', 'gray') returning id into v_tag_task;

      insert into public.project_tags (project_id, name, slug, color)
      values (v_project_id, 'Improvement', 'improvement', 'green') returning id into v_tag_improvement;

      -- Map existing tasks type → tag
      insert into public.task_tags (task_id, tag_id)
      select id, v_tag_bug from public.tasks where project_id = v_project_id and type = 'bug';

      insert into public.task_tags (task_id, tag_id)
      select id, v_tag_feature from public.tasks where project_id = v_project_id and type = 'feature';

      insert into public.task_tags (task_id, tag_id)
      select id, v_tag_task from public.tasks where project_id = v_project_id and type = 'task';

      insert into public.task_tags (task_id, tag_id)
      select id, v_tag_improvement from public.tasks where project_id = v_project_id and type = 'improvement';
    end;

    -- Set project created_by to first user
    update public.projects
    set created_by = (select id from public.profiles order by created_at limit 1)
    where id = v_project_id;

    -- Add all existing users as owners (small team, can adjust later)
    insert into public.project_members (project_id, user_id, role, can_create_task, can_edit_task, can_delete_task, can_archive_task, can_manage_columns, can_manage_members)
    select v_project_id, id, 'owner', true, true, true, true, true, true
    from public.profiles
    on conflict (project_id, user_id) do nothing;
  end if;
end $$;

-- ============================================
-- 4. DROP OLD COLUMNS FROM TASKS
-- ============================================

-- Make column_id required now that data is migrated
alter table public.tasks alter column column_id set not null;

-- Drop old status and type columns (with their CHECK constraints)
alter table public.tasks drop column status;
alter table public.tasks drop column type;

-- ============================================
-- 5. DROP OLD RLS POLICIES
-- ============================================

-- Projects
drop policy if exists "projects_select" on public.projects;
drop policy if exists "projects_insert" on public.projects;
drop policy if exists "projects_update" on public.projects;
drop policy if exists "projects_delete" on public.projects;

-- Tasks
drop policy if exists "tasks_select" on public.tasks;
drop policy if exists "tasks_insert" on public.tasks;
drop policy if exists "tasks_update" on public.tasks;
drop policy if exists "tasks_delete" on public.tasks;

-- Sprints
drop policy if exists "sprints_select" on public.sprints;
drop policy if exists "sprints_insert" on public.sprints;
drop policy if exists "sprints_update" on public.sprints;
drop policy if exists "sprints_delete" on public.sprints;

-- Comments
drop policy if exists "comments_select" on public.comments;
drop policy if exists "comments_insert" on public.comments;
drop policy if exists "comments_update" on public.comments;
drop policy if exists "comments_delete" on public.comments;

-- Attachments
drop policy if exists "attachments_select" on public.attachments;
drop policy if exists "attachments_insert" on public.attachments;
drop policy if exists "attachments_delete" on public.attachments;

-- Activity log
drop policy if exists "activity_select" on public.activity_log;
drop policy if exists "activity_insert" on public.activity_log;

-- ============================================
-- 6. NEW RLS POLICIES (membership-based)
-- ============================================

-- Helper function: check project membership without triggering RLS recursion
-- (security definer bypasses RLS on the project_members table)
create or replace function public.is_project_member(p_project_id uuid, p_user_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.project_members
    where project_id = p_project_id and user_id = p_user_id
  );
$$ language sql security definer stable;

create or replace function public.get_member_role(p_project_id uuid, p_user_id uuid)
returns text as $$
  select role from public.project_members
  where project_id = p_project_id and user_id = p_user_id
  limit 1;
$$ language sql security definer stable;

create or replace function public.has_member_permission(p_project_id uuid, p_user_id uuid, p_permission text)
returns boolean as $$
  select exists (
    select 1 from public.project_members
    where project_id = p_project_id and user_id = p_user_id
    and (
      role = 'owner'
      or (p_permission = 'can_create_task' and can_create_task)
      or (p_permission = 'can_edit_task' and can_edit_task)
      or (p_permission = 'can_delete_task' and can_delete_task)
      or (p_permission = 'can_archive_task' and can_archive_task)
      or (p_permission = 'can_manage_columns' and can_manage_columns)
      or (p_permission = 'can_manage_members' and can_manage_members)
    )
  );
$$ language sql security definer stable;

-- PROJECTS
create policy "projects_select" on public.projects for select using (
  exists (select 1 from public.project_members where project_id = projects.id and user_id = auth.uid())
);
create policy "projects_insert" on public.projects for insert with check (
  auth.uid() = created_by
);
create policy "projects_update" on public.projects for update using (
  exists (select 1 from public.project_members where project_id = projects.id and user_id = auth.uid() and role = 'owner')
);
create policy "projects_delete" on public.projects for delete using (
  exists (select 1 from public.project_members where project_id = projects.id and user_id = auth.uid() and role = 'owner')
);

-- PROJECT_COLUMNS
create policy "columns_select" on public.project_columns for select using (
  exists (select 1 from public.project_members where project_id = project_columns.project_id and user_id = auth.uid())
);
create policy "columns_insert" on public.project_columns for insert with check (
  exists (select 1 from public.project_members pm where pm.project_id = project_columns.project_id and pm.user_id = auth.uid()
    and (pm.role = 'owner' or pm.can_manage_columns))
);
create policy "columns_update" on public.project_columns for update using (
  exists (select 1 from public.project_members pm where pm.project_id = project_columns.project_id and pm.user_id = auth.uid()
    and (pm.role = 'owner' or pm.can_manage_columns))
);
create policy "columns_delete" on public.project_columns for delete using (
  exists (select 1 from public.project_members pm where pm.project_id = project_columns.project_id and pm.user_id = auth.uid()
    and (pm.role = 'owner' or pm.can_manage_columns))
);

-- PROJECT_MEMBERS (use security definer functions to avoid infinite recursion)
create policy "members_select" on public.project_members for select using (
  public.is_project_member(project_id, auth.uid())
);
create policy "members_insert" on public.project_members for insert with check (
  public.has_member_permission(project_members.project_id, auth.uid(), 'can_manage_members')
);
create policy "members_update" on public.project_members for update using (
  -- Can update own row (for is_favorite) OR manage members permission
  auth.uid() = project_members.user_id
  or public.has_member_permission(project_members.project_id, auth.uid(), 'can_manage_members')
);
create policy "members_delete" on public.project_members for delete using (
  public.has_member_permission(project_members.project_id, auth.uid(), 'can_manage_members')
);

-- PROJECT_TAGS
create policy "tags_select" on public.project_tags for select using (
  exists (select 1 from public.project_members where project_id = project_tags.project_id and user_id = auth.uid())
);
create policy "tags_insert" on public.project_tags for insert with check (
  exists (select 1 from public.project_members pm where pm.project_id = project_tags.project_id and pm.user_id = auth.uid()
    and (pm.role = 'owner' or pm.can_manage_columns))
);
create policy "tags_update" on public.project_tags for update using (
  exists (select 1 from public.project_members pm where pm.project_id = project_tags.project_id and pm.user_id = auth.uid()
    and (pm.role = 'owner' or pm.can_manage_columns))
);
create policy "tags_delete" on public.project_tags for delete using (
  exists (select 1 from public.project_members pm where pm.project_id = project_tags.project_id and pm.user_id = auth.uid()
    and (pm.role = 'owner' or pm.can_manage_columns))
);

-- TASK_TAGS
create policy "task_tags_select" on public.task_tags for select using (
  exists (
    select 1 from public.tasks t
    join public.project_members pm on pm.project_id = t.project_id
    where t.id = task_tags.task_id and pm.user_id = auth.uid()
  )
);
create policy "task_tags_insert" on public.task_tags for insert with check (
  exists (
    select 1 from public.tasks t
    join public.project_members pm on pm.project_id = t.project_id
    where t.id = task_tags.task_id and pm.user_id = auth.uid()
    and (pm.role = 'owner' or pm.can_create_task or pm.can_edit_task)
  )
);
create policy "task_tags_delete" on public.task_tags for delete using (
  exists (
    select 1 from public.tasks t
    join public.project_members pm on pm.project_id = t.project_id
    where t.id = task_tags.task_id and pm.user_id = auth.uid()
    and (pm.role = 'owner' or pm.can_edit_task)
  )
);

-- TASKS (membership-based)
create policy "tasks_select" on public.tasks for select using (
  exists (select 1 from public.project_members where project_id = tasks.project_id and user_id = auth.uid())
);
create policy "tasks_insert" on public.tasks for insert with check (
  exists (select 1 from public.project_members pm where pm.project_id = tasks.project_id and pm.user_id = auth.uid()
    and (pm.role = 'owner' or pm.can_create_task))
);
create policy "tasks_update" on public.tasks for update using (
  auth.uid() = created_by
  or exists (select 1 from public.project_members pm where pm.project_id = tasks.project_id and pm.user_id = auth.uid()
    and (pm.role = 'owner' or pm.can_edit_task))
);
create policy "tasks_delete" on public.tasks for delete using (
  exists (select 1 from public.project_members pm where pm.project_id = tasks.project_id and pm.user_id = auth.uid()
    and (pm.role = 'owner' or pm.can_delete_task))
);

-- COMMENTS (membership-based)
create policy "comments_select" on public.comments for select using (
  exists (
    select 1 from public.tasks t
    join public.project_members pm on pm.project_id = t.project_id
    where t.id = comments.task_id and pm.user_id = auth.uid()
  )
);
create policy "comments_insert" on public.comments for insert with check (
  auth.uid() = author_id
  and exists (
    select 1 from public.tasks t
    join public.project_members pm on pm.project_id = t.project_id
    where t.id = comments.task_id and pm.user_id = auth.uid()
  )
);
create policy "comments_update" on public.comments for update using (auth.uid() = author_id);
create policy "comments_delete" on public.comments for delete using (
  auth.uid() = author_id
  or exists (
    select 1 from public.tasks t
    join public.project_members pm on pm.project_id = t.project_id
    where t.id = comments.task_id and pm.user_id = auth.uid() and pm.role = 'owner'
  )
);

-- ATTACHMENTS (membership-based)
create policy "attachments_select" on public.attachments for select using (
  exists (
    select 1 from public.tasks t
    join public.project_members pm on pm.project_id = t.project_id
    where t.id = attachments.task_id and pm.user_id = auth.uid()
  )
);
create policy "attachments_insert" on public.attachments for insert with check (
  auth.uid() = uploaded_by
  and exists (
    select 1 from public.tasks t
    join public.project_members pm on pm.project_id = t.project_id
    where t.id = attachments.task_id and pm.user_id = auth.uid()
  )
);
create policy "attachments_delete" on public.attachments for delete using (
  auth.uid() = uploaded_by
  or exists (
    select 1 from public.tasks t
    join public.project_members pm on pm.project_id = t.project_id
    where t.id = attachments.task_id and pm.user_id = auth.uid() and pm.role = 'owner'
  )
);

-- ACTIVITY_LOG (membership-based)
create policy "activity_select" on public.activity_log for select using (
  exists (
    select 1 from public.tasks t
    join public.project_members pm on pm.project_id = t.project_id
    where t.id = activity_log.task_id and pm.user_id = auth.uid()
  )
);
create policy "activity_insert" on public.activity_log for insert with check (
  auth.uid() = actor_id
);

-- SPRINTS (membership-based)
create policy "sprints_select" on public.sprints for select using (
  exists (select 1 from public.project_members where project_id = sprints.project_id and user_id = auth.uid())
);
create policy "sprints_insert" on public.sprints for insert with check (
  exists (select 1 from public.project_members pm where pm.project_id = sprints.project_id and pm.user_id = auth.uid()
    and pm.role = 'owner')
);
create policy "sprints_update" on public.sprints for update using (
  exists (select 1 from public.project_members pm where pm.project_id = sprints.project_id and pm.user_id = auth.uid()
    and pm.role = 'owner')
);
create policy "sprints_delete" on public.sprints for delete using (
  exists (select 1 from public.project_members pm where pm.project_id = sprints.project_id and pm.user_id = auth.uid()
    and pm.role = 'owner')
);

-- ============================================
-- 7. DB FUNCTION: Create project with defaults
-- ============================================
create or replace function public.create_project_with_defaults(
  p_name text,
  p_slug text,
  p_user_id uuid
) returns uuid as $$
declare
  v_project_id uuid;
begin
  -- Insert project
  insert into public.projects (name, slug, created_by)
  values (p_name, p_slug, p_user_id)
  returning id into v_project_id;

  -- Add creator as owner with all permissions
  insert into public.project_members (
    project_id, user_id, role,
    can_create_task, can_edit_task, can_delete_task,
    can_archive_task, can_manage_columns, can_manage_members
  ) values (
    v_project_id, p_user_id, 'owner',
    true, true, true, true, true, true
  );

  -- Default columns
  insert into public.project_columns (project_id, name, slug, position) values
    (v_project_id, 'Backlog', 'backlog', 0),
    (v_project_id, 'To Do', 'todo', 1),
    (v_project_id, 'In Progress', 'in-progress', 2),
    (v_project_id, 'Review', 'review', 3),
    (v_project_id, 'Done', 'done', 4);

  -- Default tags
  insert into public.project_tags (project_id, name, slug, color) values
    (v_project_id, 'Bug', 'bug', 'red'),
    (v_project_id, 'Feature', 'feature', 'blue'),
    (v_project_id, 'Task', 'task', 'gray'),
    (v_project_id, 'Improvement', 'improvement', 'green');

  return v_project_id;
end;
$$ language plpgsql security definer;

-- ============================================
-- 8. INDEXES for performance
-- ============================================
create index idx_project_columns_project on public.project_columns(project_id, position);
create index idx_project_members_user on public.project_members(user_id);
create index idx_project_members_project on public.project_members(project_id);
create index idx_project_tags_project on public.project_tags(project_id);
create index idx_tasks_column on public.tasks(column_id, position);
create index idx_tasks_archived on public.tasks(project_id, archived);
create index idx_task_tags_task on public.task_tags(task_id);
create index idx_task_tags_tag on public.task_tags(tag_id);
