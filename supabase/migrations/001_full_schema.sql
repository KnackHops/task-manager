-- ============================================
-- Task Manager — Full Schema Migration
-- Run this in Supabase Studio → SQL Editor
-- ============================================

-- 1. Helper function: auto-update updated_at
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================
-- 2. PROFILES (extends auth.users)
-- ============================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  avatar_url text,
  role text not null default 'client' check (role in ('client', 'developer', 'admin')),
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select" on public.profiles for select using (true);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- Auto-create profile on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'client')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================
-- 3. PROJECTS
-- ============================================
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  route_manifest jsonb default '[]',
  created_at timestamptz default now()
);

alter table public.projects enable row level security;

create policy "projects_select" on public.projects for select using (true);
create policy "projects_insert" on public.projects for insert with check (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('developer', 'admin'))
);
create policy "projects_update" on public.projects for update using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('developer', 'admin'))
);
create policy "projects_delete" on public.projects for delete using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- Seed default project
insert into public.projects (name, slug) values ('NonStop Travel', 'nonstop');

-- ============================================
-- 4. SPRINTS
-- ============================================
create table public.sprints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  name text not null,
  goal text,
  start_date date not null,
  end_date date not null,
  status text not null default 'planning' check (status in ('planning', 'active', 'completed')),
  created_at timestamptz default now()
);

alter table public.sprints enable row level security;

create policy "sprints_select" on public.sprints for select using (true);
create policy "sprints_insert" on public.sprints for insert with check (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('developer', 'admin'))
);
create policy "sprints_update" on public.sprints for update using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('developer', 'admin'))
);
create policy "sprints_delete" on public.sprints for delete using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- ============================================
-- 5. TASKS
-- ============================================
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  sprint_id uuid references public.sprints(id),
  created_by uuid not null references public.profiles(id),
  assigned_to uuid references public.profiles(id),
  title text not null,
  description text,
  status text not null default 'backlog' check (status in ('backlog', 'todo', 'in_progress', 'review', 'done')),
  priority text not null default 'medium' check (priority in ('critical', 'high', 'medium', 'low')),
  type text not null default 'task' check (type in ('bug', 'feature', 'task', 'improvement')),
  route_path text,
  route_label text,
  position int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.tasks enable row level security;

create policy "tasks_select" on public.tasks for select using (true);
create policy "tasks_insert" on public.tasks for insert with check (auth.uid() = created_by);
create policy "tasks_update" on public.tasks for update using (
  auth.uid() = created_by
  or exists (select 1 from public.profiles where id = auth.uid() and role in ('developer', 'admin'))
);
create policy "tasks_delete" on public.tasks for delete using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.update_updated_at();

-- ============================================
-- 6. COMMENTS
-- ============================================
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.comments enable row level security;

create policy "comments_select" on public.comments for select using (true);
create policy "comments_insert" on public.comments for insert with check (auth.uid() = author_id);
create policy "comments_update" on public.comments for update using (auth.uid() = author_id);
create policy "comments_delete" on public.comments for delete using (
  auth.uid() = author_id
  or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

create trigger comments_updated_at before update on public.comments
  for each row execute function public.update_updated_at();

-- ============================================
-- 7. ATTACHMENTS
-- ============================================
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id),
  file_name text not null,
  file_type text not null,
  file_size bigint not null,
  storage_path text not null,
  thumbnail_path text,
  created_at timestamptz default now(),
  constraint attachment_parent check (
    (task_id is not null and comment_id is null) or
    (task_id is null and comment_id is not null)
  )
);

alter table public.attachments enable row level security;

create policy "attachments_select" on public.attachments for select using (true);
create policy "attachments_insert" on public.attachments for insert with check (auth.uid() = uploaded_by);
create policy "attachments_delete" on public.attachments for delete using (
  auth.uid() = uploaded_by
  or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- ============================================
-- 8. ACTIVITY LOG
-- ============================================
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  action text not null,
  details jsonb,
  created_at timestamptz default now()
);

alter table public.activity_log enable row level security;

create policy "activity_select" on public.activity_log for select using (true);
create policy "activity_insert" on public.activity_log for insert with check (auth.uid() = actor_id);
