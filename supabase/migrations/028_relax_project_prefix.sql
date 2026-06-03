-- Migration 028: Relax project prefixes — non-unique, derived from up to 7 words
-- Run this in Supabase Studio SQL Editor.
--
-- Reverses the "reserve-forever, globally-unique" model from migration 026.
-- Forcing prefixes to be unique doesn't scale: it produces ugly suffixes
-- (NSTP, NSTP1, NSTP2 …) and blocks legitimately similar project names.
--
-- New model: a prefix is just a derived label. Collisions are allowed. When a
-- short ID like "NSTP-2" matches tasks in more than one project, the MCP server
-- returns the candidates (with their task UUIDs) and the user picks — rather
-- than guessing or rejecting.
--
-- This migration:
--   1. Drops the prefix registry, its sync trigger, and the reuse block.
--   2. Redefines derive_project_prefix: initials of up to 7 words, 7-char cap,
--      NO uniqueness check.
-- create_project_with_defaults already calls derive_project_prefix, so new
-- projects pick this up with no further change.

-- =============================================
-- 1. Remove the uniqueness machinery
-- =============================================
-- The registry existed only to enforce global uniqueness + resolve renamed
-- prefixes. Both are gone; the MCP now resolves directly against projects.prefix.
drop trigger if exists trg_sync_prefix_registry on public.projects;
drop function if exists public.sync_prefix_registry();
drop table if exists public.project_prefix_registry;

-- (No prefix uniqueness index was kept in 026, but drop defensively in case an
-- earlier iteration created one.)
drop index if exists public.projects_prefix_unique;

-- =============================================
-- 2. Redefine the derivation helper (non-unique, up to 7 words)
-- =============================================
-- Rules: initials of up to the first 7 words (e.g. "Non Stop Travel Platform"
-- -> "NSTP"); for a single word, its first 3 letters ("Backend" -> "BAC").
-- Uppercased, alphanumerics only, capped at 7 chars. Falls back to the slug,
-- then 'PRJ'. No uniqueness — duplicates across projects are allowed.
create or replace function public.derive_project_prefix(p_name text, p_slug text)
returns text as $$
declare
  v_words text[];
  v_base text;
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
    -- Initials of the first 7 words, in order.
    v_base := array_to_string(
      array(
        select left(x, 1)
        from unnest(v_words) with ordinality as t(x, ord)
        where ord <= 7
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

  return upper(left(v_base, 7));
end;
$$ language plpgsql;
