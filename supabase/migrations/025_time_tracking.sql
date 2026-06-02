-- Personal time tracking + private per-user task ordering.
-- Each start/stop of the timer is one immutable row in task_time_sessions
-- (started_at = time-in, ended_at = time-out). Returning to a task later makes a NEW
-- row; rows are never merged. Duration is computed, never stored. At most one open
-- session (ended_at is null) per user — enforced by a partial unique index and the
-- start_task_timer RPC, which closes any open session before opening a new one.

create table public.task_time_sessions (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  created_at  timestamptz not null default now()
);

create index idx_task_time_sessions_user_started on public.task_time_sessions(user_id, started_at);
create index idx_task_time_sessions_task on public.task_time_sessions(task_id);
create unique index task_time_sessions_one_open_per_user
  on public.task_time_sessions(user_id) where ended_at is null;

alter table public.task_time_sessions enable row level security;

-- Read: any active member of the task's project (team-wide log visibility).
create policy "task_time_sessions_select" on public.task_time_sessions for select using (
  exists (
    select 1 from public.tasks t
    join public.project_members pm on pm.project_id = t.project_id
    where t.id = task_time_sessions.task_id and pm.user_id = auth.uid()
  )
);

-- Write: only your own rows.
create policy "task_time_sessions_insert" on public.task_time_sessions for insert with check (
  user_id = auth.uid()
);
create policy "task_time_sessions_update" on public.task_time_sessions for update using (
  user_id = auth.uid()
) with check (user_id = auth.uid());
create policy "task_time_sessions_delete" on public.task_time_sessions for delete using (
  user_id = auth.uid()
);

-- Private per-user task ordering for the My Work board. Fractional rank so a drag
-- updates one row (midpoint between neighbors) without renumbering.
create table public.user_task_order (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  task_id  uuid not null references public.tasks(id) on delete cascade,
  rank     double precision not null,
  primary key (user_id, task_id)
);

alter table public.user_task_order enable row level security;

create policy "user_task_order_all" on public.user_task_order for all using (
  user_id = auth.uid()
) with check (user_id = auth.uid());

-- Atomic start: close any open session for the caller, then open a new one.
create or replace function public.start_task_timer(p_task_id uuid)
returns public.task_time_sessions
language plpgsql security invoker as $$
declare
  v_user uuid := auth.uid();
  v_row public.task_time_sessions;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  update public.task_time_sessions
    set ended_at = now()
    where user_id = v_user and ended_at is null;
  insert into public.task_time_sessions (task_id, user_id)
    values (p_task_id, v_user)
    returning * into v_row;
  return v_row;
end; $$;

-- Atomic stop: close the caller's open session (no-op if none). Returns the closed row
-- or null.
create or replace function public.stop_task_timer()
returns public.task_time_sessions
language plpgsql security invoker as $$
declare
  v_user uuid := auth.uid();
  v_row public.task_time_sessions;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  update public.task_time_sessions
    set ended_at = now()
    where user_id = v_user and ended_at is null
    returning * into v_row;
  return v_row;
end; $$;
