-- Migration 026: Auto-assign a task-ID prefix on project creation
-- Run this in Supabase Studio SQL Editor.
--
-- Context: create_project_with_defaults (migration 002) predates the
-- projects.prefix column (added in 003), so it never set a prefix and every
-- new project defaulted to '' (empty). Empty prefixes break human-readable
-- task IDs in the UI and make tasks unaddressable via the MCP server
-- (resolveTaskId parses "PREFIX-N" and looks projects up by prefix).
--
-- This migration:
--   1. Adds a helper that derives a unique prefix from a project name.
--   2. Rewrites create_project_with_defaults to use it.
--   3. Backfills existing prefixless projects.

-- =============================================
-- 1. Prefix derivation helper
-- =============================================
-- Rules: initials of each word (e.g. "Task Manager" -> "TM"); for a single
-- word, the first 3 letters ("Backend" -> "BAC"). Capped at 4 chars, uppercased,
-- alphanumerics only. Falls back to the slug, then 'PRJ'. Guarantees global
-- uniqueness (MCP resolves a task's project by prefix) by appending a counter.

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

  -- Ensure global uniqueness
  v_prefix := v_base;
  while exists (select 1 from public.projects where prefix = v_prefix) loop
    v_prefix := v_base || v_suffix::text;
    v_suffix := v_suffix + 1;
  end loop;

  return v_prefix;
end;
$$ language plpgsql;

-- =============================================
-- 2. Rewrite create_project_with_defaults to set the prefix
-- =============================================
create or replace function public.create_project_with_defaults(
  p_name text,
  p_slug text,
  p_user_id uuid
) returns uuid as $$
declare
  v_project_id uuid;
begin
  -- Insert project (with auto-derived prefix)
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
-- 3. Backfill existing prefixless projects
-- =============================================
-- Assigns a derived, unique prefix to every project that still has ''.
-- Processed oldest-first so existing projects get the cleaner short prefix.
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
end $$;

-- =============================================
-- 4. Enforce prefix uniqueness (MCP resolves project by prefix)
-- =============================================
-- Partial index so any legacy/empty prefixes are exempt, but every real
-- prefix must be unique. A Settings edit to a taken prefix will now error.
create unique index if not exists projects_prefix_unique
  on public.projects (prefix)
  where prefix <> '';
