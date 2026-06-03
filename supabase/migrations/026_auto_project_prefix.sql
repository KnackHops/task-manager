-- Migration 026: Auto project prefixes + permanent prefix registry
-- Run this in Supabase Studio SQL Editor.
--
-- Context: create_project_with_defaults (migration 002) predates the
-- projects.prefix column (added in 003), so it never set a prefix and every
-- new project defaulted to '' (empty). Empty prefixes break human-readable
-- task IDs in the UI and make tasks unaddressable via the MCP server
-- (resolveTaskId parses "PREFIX-N" and looks projects up by prefix).
--
-- A task's human-readable ID is derived (prefix + task_number), not stored, so
-- renaming a prefix changes every displayed ID. Worse, a freed-up prefix could
-- be reused by a new project, silently misrouting old references. To prevent
-- that, this migration keeps a PERMANENT, globally-unique registry of every
-- prefix any project has ever held. A prefix is reserved forever: no other
-- project can take it, and old IDs always resolve to the correct project.
--
-- This migration:
--   1. Creates the prefix registry (+ RLS).
--   2. Adds a helper that derives a globally-unique prefix from a name.
--   3. Keeps the registry in sync + blocks cross-project reuse (trigger).
--   4. Rewrites create_project_with_defaults to assign a prefix.
--   5. Backfills existing prefixless projects (which populates the registry).

-- =============================================
-- 1. Permanent prefix registry
-- =============================================
-- One row per (prefix) ever owned by a project. prefix is the PK, so it is
-- globally unique across current AND retired prefixes. Rows are never deleted
-- on rename, so historical IDs keep resolving to the right project.
create table if not exists public.project_prefix_registry (
  prefix text primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_prefix_registry_project
  on public.project_prefix_registry (project_id);

-- RLS — project members may read the registry (MCP runs user-scoped).
alter table public.project_prefix_registry enable row level security;

drop policy if exists "prefix_registry_select" on public.project_prefix_registry;
create policy "prefix_registry_select" on public.project_prefix_registry for select using (
  exists (
    select 1 from public.project_members
    where project_id = project_prefix_registry.project_id
      and user_id = auth.uid()
  )
);
-- No insert/update/delete policies: rows are written only by the trigger below
-- (SECURITY DEFINER), never directly by clients.

-- =============================================
-- 2. Prefix derivation helper (globally unique vs the registry)
-- =============================================
-- Rules: initials of each word (e.g. "Task Manager" -> "TM"); for a single
-- word, the first 3 letters ("Backend" -> "BAC"). Capped at 4 chars, uppercased,
-- alphanumerics only. Falls back to the slug, then 'PRJ'. Appends a counter
-- until the candidate is unused by ANY project, past or present.
create or replace function public.derive_project_prefix(p_name text, p_slug text)
returns text as $$
declare
  v_words text[];
  v_base text;
  v_prefix text;
  v_suffix int := 1;
begin
  v_words := array(
    select w
    from regexp_split_to_table(
      regexp_replace(coalesce(p_name, ''), '[^a-zA-Z0-9 ]', '', 'g'),
      '\s+'
    ) as w
    where w <> ''
  );

  if array_length(v_words, 1) is null then
    v_base := '';
  elsif array_length(v_words, 1) = 1 then
    v_base := left(v_words[1], 3);
  else
    v_base := array_to_string(
      array(
        select left(x, 1)
        from unnest(v_words) with ordinality as t(x, ord)
        order by ord
      ),
      ''
    );
  end if;

  -- Fallbacks if the name yields nothing usable
  if coalesce(length(v_base), 0) = 0 then
    v_base := left(regexp_replace(coalesce(p_slug, ''), '[^a-zA-Z0-9]', '', 'g'), 3);
  end if;
  if coalesce(length(v_base), 0) = 0 then
    v_base := 'PRJ';
  end if;

  v_base := upper(left(v_base, 4));

  -- Reserve-forever: never reuse a prefix any project has ever held.
  v_prefix := v_base;
  while exists (select 1 from public.project_prefix_registry where prefix = v_prefix) loop
    v_prefix := v_base || v_suffix::text;
    v_suffix := v_suffix + 1;
  end loop;

  return v_prefix;
end;
$$ language plpgsql;

-- =============================================
-- 3. Keep registry in sync + block cross-project reuse
-- =============================================
-- Fires when a project is created or its prefix changes. Rejects a prefix
-- already reserved by a DIFFERENT project; otherwise records it (old prefixes
-- stay registered, so their IDs keep resolving to this project).
create or replace function public.sync_prefix_registry()
returns trigger as $$
begin
  if coalesce(NEW.prefix, '') = '' then
    return NEW;
  end if;

  if exists (
    select 1 from public.project_prefix_registry
    where prefix = NEW.prefix and project_id <> NEW.id
  ) then
    raise exception 'Prefix "%" is already reserved by another project', NEW.prefix;
  end if;

  insert into public.project_prefix_registry (prefix, project_id)
  values (NEW.prefix, NEW.id)
  on conflict (prefix) do nothing;

  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_sync_prefix_registry on public.projects;
create trigger trg_sync_prefix_registry
  after insert or update of prefix on public.projects
  for each row execute function public.sync_prefix_registry();

-- =============================================
-- 4. Rewrite create_project_with_defaults to set the prefix
-- =============================================
create or replace function public.create_project_with_defaults(
  p_name text,
  p_slug text,
  p_user_id uuid
) returns uuid as $$
declare
  v_project_id uuid;
begin
  -- Insert project (with auto-derived, globally-unique prefix).
  -- The AFTER-INSERT trigger records it in the registry.
  insert into public.projects (name, slug, created_by, prefix)
  values (p_name, p_slug, p_user_id, public.derive_project_prefix(p_name, p_slug))
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

-- =============================================
-- 5. Backfill existing prefixless projects
-- =============================================
-- Assigns a derived, unique prefix to every project that still has ''.
-- Processed oldest-first so existing projects get the cleaner short prefix.
-- The UPDATE fires the sync trigger, which populates the registry.
do $$
declare
  r record;
begin
  for r in
    select id, name, slug
    from public.projects
    where coalesce(prefix, '') = ''
    order by created_at
  loop
    update public.projects
    set prefix = public.derive_project_prefix(r.name, r.slug)
    where id = r.id;
  end loop;

  -- Register any pre-existing non-empty prefixes that the trigger didn't see
  -- (rows present before this migration). Safe: skips ones already registered.
  insert into public.project_prefix_registry (prefix, project_id)
  select prefix, id from public.projects
  where coalesce(prefix, '') <> ''
  on conflict (prefix) do nothing;
end $$;
