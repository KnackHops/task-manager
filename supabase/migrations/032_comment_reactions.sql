-- Emoji reactions on comments. One row per (comment, user, emoji); toggled on/off.

create table public.comment_reactions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (comment_id, user_id, emoji)
);

create index idx_comment_reactions_comment on public.comment_reactions(comment_id);

alter table public.comment_reactions enable row level security;

-- SELECT: any member of the comment's project
create policy "comment_reactions_select" on public.comment_reactions for select using (
  exists (
    select 1 from public.comments c
    join public.tasks t on t.id = c.task_id
    join public.project_members pm on pm.project_id = t.project_id
    where c.id = comment_reactions.comment_id and pm.user_id = auth.uid()
  )
);

-- INSERT: your own reaction, and you must be a member of the comment's project
create policy "comment_reactions_insert" on public.comment_reactions for insert with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.comments c
    join public.tasks t on t.id = c.task_id
    join public.project_members pm on pm.project_id = t.project_id
    where c.id = comment_reactions.comment_id and pm.user_id = auth.uid()
  )
);

-- DELETE: only your own reaction
create policy "comment_reactions_delete" on public.comment_reactions for delete using (
  user_id = auth.uid()
);

-- Realtime so reactions sync across viewers
alter publication supabase_realtime add table public.comment_reactions;
