# My Work — Personal Board & Time Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cross-project `/my-work` hub where a user sees their assigned tasks, prioritizes them privately, runs a one-at-a-time timer per task (each start/stop is an immutable log entry), and views auto-derived time totals (today / month / sprint); plus a per-project team Logs tab and 4 MCP timer tools — all writing one shared `task_time_sessions` table.

**Architecture:** Two new Postgres tables (`task_time_sessions`, `user_task_order`) with RLS, fronted by two atomic RPCs (`start_task_timer`, `stop_task_timer`) so the "one open session per user" rule is enforced in one place and reused by both the React app and the MCP server. Frontend follows the existing service → TanStack-Query-hook → component → file-route layering. MCP follows the existing `register<Name>(server, ctx)` pattern.

**Tech Stack:** React 19, TanStack Router + Query, Supabase (Postgres + RLS + RPC), Tailwind v4, lucide-react, @hello-pangea/dnd (already used for the board), MCP SDK + zod.

**Testing note:** This repo has **no test framework** (zero existing tests; gantt and task-memory shipped without them) and the user's constraint is "keep it simple / build now." We therefore do not add a test harness. Each task's verification gate is: frontend `npm run build` (runs `tsc -b` + vite build, which also regenerates the TanStack route tree), MCP `npm run build` (tsc), plus explicit SQL / manual runtime checks where behavior matters. Commit after each task.

---

## File Structure

**Database**
- Create: `supabase/migrations/025_time_tracking.sql` — tables, indexes, RLS, RPCs.

**Frontend types & services**
- Modify: `src/types/database.ts` — add `TimeSession`, `TimeSessionWithTask`, `MyWorkTask`, `SessionLogFilters`.
- Create: `src/services/time-sessions.ts` — timer RPCs, my-tasks query, totals, session log.
- Create: `src/services/user-task-order.ts` — private drag-rank upsert.

**Frontend hooks**
- Create: `src/hooks/useTimeTracking.ts` — `useMyTasks`, `useRunningSession`, `useTimeTotals`, `useSessionLog`, `useStartTimer`, `useStopTimer`, `useSetTaskRank`.

**Frontend components** (`src/components/my-work/`)
- Create: `MyWorkView.tsx` — orchestrator (totals header + running bar + ranked list + own-log tab).
- Create: `RunningBar.tsx` — current session + live elapsed + stop.
- Create: `MyTaskRow.tsx` — one task row (drag handle, title, project chip, total, start/stop, complete).
- Create: `TimeTotals.tsx` — today / month / sprint figures.
- Create: `SessionLog.tsx` — chronological entry list with member + date filters (reused on `/my-work` and per-project).
- Create: `src/lib/time-format.ts` — `formatDuration(seconds)` and `formatClock(seconds)` helpers.

**Frontend routes & nav**
- Create: `src/routes/_app/my-work.tsx` — the hub route.
- Create: `src/routes/_app/p/$slug/logs.tsx` — per-project team Logs tab.
- Modify: `src/components/layout/Sidebar.tsx` — add **My Work** global link + **Logs** project link.

**MCP server** (`mcp-server/src/tools/`)
- Create: `time-start.ts`, `time-stop.ts`, `time-status.ts`, `time-summary.ts`.
- Modify: `mcp-server/src/index.ts` — import + register the 4 tools.

---

## Task 1: Database migration — tables, RLS, RPCs

**Files:**
- Create: `supabase/migrations/025_time_tracking.sql`

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply the migration**

Run (PowerShell, from repo root):
```
supabase db push
```
Expected: applies `025_time_tracking.sql` with no error. If `supabase` CLI is unavailable, run the SQL in the Supabase SQL editor.

- [ ] **Step 3: Verify the one-open-session guard**

Run in the Supabase SQL editor (replace `<uuid>` with a real task id, run as an authenticated user via the API, or temporarily test the index by inserting two open rows for the same user):
```sql
-- Two open rows for one user must violate the unique index:
insert into public.task_time_sessions (task_id, user_id) values ('<task-uuid>', '<user-uuid>');
insert into public.task_time_sessions (task_id, user_id) values ('<task-uuid>', '<user-uuid>');
-- Expected: second insert fails with "task_time_sessions_one_open_per_user" unique violation.
-- Clean up afterwards:
delete from public.task_time_sessions where user_id = '<user-uuid>';
```
Expected: second insert errors; cleanup succeeds.

- [ ] **Step 4: Commit**

```
git add supabase/migrations/025_time_tracking.sql
git commit -m "feat(db): time sessions + private task order tables, RLS, start/stop RPCs"
```

---

## Task 2: Frontend types

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add the types**

Append to `src/types/database.ts` (after the existing `Task`/`Sprint` interfaces; `Profile` is already defined in this file):

```typescript
export interface TimeSession {
  id: string
  task_id: string
  user_id: string
  started_at: string
  ended_at: string | null
  created_at: string
}

export interface TimeSessionWithTask extends TimeSession {
  duration_seconds: number
  user: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>
  task: {
    id: string
    title: string
    task_number: number
    project: { id: string; name: string; slug: string; prefix: string }
  } | null
}

export interface MyWorkTask {
  id: string
  title: string
  task_number: number
  priority: TaskPriority
  is_done: boolean
  sprint_id: string | null
  project: { id: string; name: string; slug: string; prefix: string }
  total_seconds: number
  rank: number | null
}

export interface SessionLogFilters {
  projectId?: string
  userId?: string
  from?: string // ISO date (inclusive)
  to?: string   // ISO date (inclusive)
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds (no TS errors). New types are unused so far — that's fine, they are `export`ed.

- [ ] **Step 3: Commit**

```
git add src/types/database.ts
git commit -m "feat(types): time tracking + my-work types"
```

---

## Task 3: Time-format helpers

**Files:**
- Create: `src/lib/time-format.ts`

- [ ] **Step 1: Write the helpers**

```typescript
// Duration formatting for the My Work board and logs.

/** Compact human total, e.g. "0m", "48m", "1h 25m", "12h 03m". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${String(m).padStart(2, '0')}m`
}

/** Live stopwatch clock, e.g. "00:48:12". */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':')
}

/** Seconds elapsed between an ISO start and now (or an ISO end). */
export function elapsedSeconds(startedAt: string, endedAt?: string | null): number {
  const start = new Date(startedAt).getTime()
  const end = endedAt ? new Date(endedAt).getTime() : Date.now()
  return Math.max(0, Math.floor((end - start) / 1000))
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```
git add src/lib/time-format.ts
git commit -m "feat: duration/clock formatting helpers"
```

---

## Task 4: time-sessions service

**Files:**
- Create: `src/services/time-sessions.ts`

Mirrors the import style of `src/services/tasks.ts` (`import { supabase } from '@/lib/supabase'`).

- [ ] **Step 1: Write the service**

```typescript
import { supabase } from '@/lib/supabase'
import type {
  TimeSession,
  TimeSessionWithTask,
  MyWorkTask,
  SessionLogFilters,
} from '@/types/database'
import { elapsedSeconds } from '@/lib/time-format'

/** Start (or switch to) the timer on a task. Closes any open session first (RPC). */
export async function startTimer(taskId: string): Promise<TimeSession> {
  const { data, error } = await supabase.rpc('start_task_timer', { p_task_id: taskId })
  if (error) throw error
  return data as TimeSession
}

/** Stop the running timer. Returns the closed session, or null if none was running. */
export async function stopTimer(): Promise<TimeSession | null> {
  const { data, error } = await supabase.rpc('stop_task_timer')
  if (error) throw error
  return (data as TimeSession) ?? null
}

/** The caller's currently running session (ended_at is null), joined to its task. */
export async function getRunningSession(
  userId: string,
): Promise<TimeSessionWithTask | null> {
  const { data, error } = await supabase
    .from('task_time_sessions')
    .select(
      `id, task_id, user_id, started_at, ended_at, created_at,
       user:profiles!user_id(id, full_name, avatar_url),
       task:tasks!task_id(id, title, task_number,
         project:projects!project_id(id, name, slug, prefix))`,
    )
    .eq('user_id', userId)
    .is('ended_at', null)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as unknown as TimeSessionWithTask
  return { ...row, duration_seconds: elapsedSeconds(row.started_at, row.ended_at) }
}

/** Tasks assigned to the user across all projects, with cumulative time + private rank. */
export async function fetchMyTasks(userId: string): Promise<MyWorkTask[]> {
  // Assigned, non-archived tasks across all projects.
  const { data: assigned, error: aErr } = await supabase
    .from('task_assignees')
    .select(
      `task:tasks!task_id(id, title, task_number, priority, is_done, sprint_id, archived,
        project:projects!project_id(id, name, slug, prefix))`,
    )
    .eq('assignee_id', userId)
  if (aErr) throw aErr

  const tasks = (assigned ?? [])
    .map((r) => (r as Record<string, unknown>).task as Record<string, unknown> | null)
    .filter((t): t is Record<string, unknown> => !!t && !t.archived)

  const taskIds = tasks.map((t) => t.id as string)
  if (taskIds.length === 0) return []

  // Per-task total seconds (sum of all the user's sessions on those tasks).
  const { data: sessions, error: sErr } = await supabase
    .from('task_time_sessions')
    .select('task_id, started_at, ended_at')
    .eq('user_id', userId)
    .in('task_id', taskIds)
  if (sErr) throw sErr

  const totals = new Map<string, number>()
  for (const s of sessions ?? []) {
    const row = s as { task_id: string; started_at: string; ended_at: string | null }
    totals.set(row.task_id, (totals.get(row.task_id) ?? 0) + elapsedSeconds(row.started_at, row.ended_at))
  }

  // Private ranks.
  const { data: ranks, error: rErr } = await supabase
    .from('user_task_order')
    .select('task_id, rank')
    .eq('user_id', userId)
    .in('task_id', taskIds)
  if (rErr) throw rErr
  const rankMap = new Map<string, number>()
  for (const r of ranks ?? []) rankMap.set((r as { task_id: string }).task_id, (r as { rank: number }).rank)

  const result: MyWorkTask[] = tasks.map((t) => ({
    id: t.id as string,
    title: t.title as string,
    task_number: t.task_number as number,
    priority: t.priority as MyWorkTask['priority'],
    is_done: t.is_done as boolean,
    sprint_id: (t.sprint_id as string | null) ?? null,
    project: t.project as MyWorkTask['project'],
    total_seconds: totals.get(t.id as string) ?? 0,
    rank: rankMap.get(t.id as string) ?? null,
  }))

  // Ranked first (ascending rank), then unranked by task_number.
  result.sort((a, b) => {
    if (a.rank != null && b.rank != null) return a.rank - b.rank
    if (a.rank != null) return -1
    if (b.rank != null) return 1
    return a.task_number - b.task_number
  })
  return result
}

/** Sum of the user's session seconds within [from, to) (ISO timestamps). */
async function sumUserSeconds(userId: string, fromIso: string, toIso?: string): Promise<number> {
  let q = supabase
    .from('task_time_sessions')
    .select('started_at, ended_at')
    .eq('user_id', userId)
    .gte('started_at', fromIso)
  if (toIso) q = q.lt('started_at', toIso)
  const { data, error } = await q
  if (error) throw error
  let total = 0
  for (const s of data ?? []) {
    const row = s as { started_at: string; ended_at: string | null }
    total += elapsedSeconds(row.started_at, row.ended_at)
  }
  return total
}

export interface TimeTotals {
  todaySeconds: number
  monthSeconds: number
}

/** Today + this-month totals for the user (local-day / local-month boundaries). */
export async function getTotals(userId: string): Promise<TimeTotals> {
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const [todaySeconds, monthSeconds] = await Promise.all([
    sumUserSeconds(userId, startOfDay.toISOString()),
    sumUserSeconds(userId, startOfMonth.toISOString()),
  ])
  return { todaySeconds, monthSeconds }
}

/** Total seconds the user logged on tasks belonging to a given sprint. */
export async function getSprintTotal(userId: string, sprintId: string): Promise<number> {
  const { data: tasks, error: tErr } = await supabase
    .from('tasks')
    .select('id')
    .eq('sprint_id', sprintId)
  if (tErr) throw tErr
  const ids = (tasks ?? []).map((t) => (t as { id: string }).id)
  if (ids.length === 0) return 0
  const { data, error } = await supabase
    .from('task_time_sessions')
    .select('started_at, ended_at')
    .eq('user_id', userId)
    .in('task_id', ids)
  if (error) throw error
  let total = 0
  for (const s of data ?? []) {
    const row = s as { started_at: string; ended_at: string | null }
    total += elapsedSeconds(row.started_at, row.ended_at)
  }
  return total
}

/** Chronological session log. Project-scoped (team feed) or user-scoped (own log). */
export async function listSessions(filters: SessionLogFilters): Promise<TimeSessionWithTask[]> {
  let q = supabase
    .from('task_time_sessions')
    .select(
      `id, task_id, user_id, started_at, ended_at, created_at,
       user:profiles!user_id(id, full_name, avatar_url),
       task:tasks!task_id(id, title, task_number,
         project:projects!project_id(id, name, slug, prefix))`,
    )
    .order('started_at', { ascending: false })
    .limit(200)

  if (filters.userId) q = q.eq('user_id', filters.userId)
  if (filters.from) q = q.gte('started_at', filters.from)
  if (filters.to) q = q.lte('started_at', filters.to)

  const { data, error } = await q
  if (error) throw error
  let rows = (data ?? []).map((r) => {
    const row = r as unknown as TimeSessionWithTask
    return { ...row, duration_seconds: elapsedSeconds(row.started_at, row.ended_at) }
  })
  // Project filter: applied client-side via the joined task.project (RLS already limits
  // visibility to the caller's projects).
  if (filters.projectId) rows = rows.filter((r) => r.task?.project.id === filters.projectId)
  return rows
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```
git add src/services/time-sessions.ts
git commit -m "feat(service): time sessions — timer, my-tasks, totals, log"
```

---

## Task 5: user-task-order service

**Files:**
- Create: `src/services/user-task-order.ts`

- [ ] **Step 1: Write the service**

```typescript
import { supabase } from '@/lib/supabase'

/** Upsert the caller's private rank for a task. Caller computes the rank (drag midpoint). */
export async function setTaskRank(userId: string, taskId: string, rank: number): Promise<void> {
  const { error } = await supabase
    .from('user_task_order')
    .upsert({ user_id: userId, task_id: taskId, rank }, { onConflict: 'user_id,task_id' })
  if (error) throw error
}

/**
 * Given the ordered list of task ids after a drag and the index the task moved to,
 * return a fractional rank between its new neighbors. Ranks default to their index
 * when a neighbor has no stored rank yet.
 */
export function midpointRank(
  ranks: (number | null)[],
  toIndex: number,
): number {
  const rankAt = (i: number): number | null => (i >= 0 && i < ranks.length ? ranks[i] : null)
  const prev = rankAt(toIndex - 1) ?? (toIndex - 1)
  const next = rankAt(toIndex + 1)
  if (next == null) return prev + 1
  return (prev + next) / 2
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```
git add src/services/user-task-order.ts
git commit -m "feat(service): private user task ordering"
```

---

## Task 6: TanStack Query hooks

**Files:**
- Create: `src/hooks/useTimeTracking.ts`

Mirrors `src/hooks/useTasks.ts` (query-key factory + `useQuery`/`useMutation` + `invalidateQueries`).

- [ ] **Step 1: Write the hooks**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import {
  startTimer,
  stopTimer,
  getRunningSession,
  fetchMyTasks,
  getTotals,
  getSprintTotal,
  listSessions,
} from '@/services/time-sessions'
import { setTaskRank } from '@/services/user-task-order'
import type { SessionLogFilters } from '@/types/database'

export const timeKeys = {
  myTasks: (userId: string) => ['my-tasks', userId] as const,
  running: (userId: string) => ['running-session', userId] as const,
  totals: (userId: string) => ['time-totals', userId] as const,
  sprintTotal: (userId: string, sprintId: string) => ['sprint-total', userId, sprintId] as const,
  log: (filters: SessionLogFilters) => ['session-log', filters] as const,
}

export function useMyTasks(userId: string | undefined) {
  return useQuery({
    queryKey: timeKeys.myTasks(userId ?? ''),
    queryFn: () => fetchMyTasks(userId!),
    enabled: !!userId,
  })
}

export function useRunningSession(userId: string | undefined) {
  return useQuery({
    queryKey: timeKeys.running(userId ?? ''),
    queryFn: () => getRunningSession(userId!),
    enabled: !!userId,
    refetchInterval: 30_000, // resync periodically; the UI ticks locally between fetches
  })
}

export function useTimeTotals(userId: string | undefined) {
  return useQuery({
    queryKey: timeKeys.totals(userId ?? ''),
    queryFn: () => getTotals(userId!),
    enabled: !!userId,
  })
}

export function useSprintTotal(userId: string | undefined, sprintId: string | undefined) {
  return useQuery({
    queryKey: timeKeys.sprintTotal(userId ?? '', sprintId ?? ''),
    queryFn: () => getSprintTotal(userId!, sprintId!),
    enabled: !!userId && !!sprintId,
  })
}

export function useSessionLog(filters: SessionLogFilters) {
  return useQuery({
    queryKey: timeKeys.log(filters),
    queryFn: () => listSessions(filters),
  })
}

function useInvalidateTime(userId: string | undefined) {
  const qc = useQueryClient()
  return () => {
    if (!userId) return
    qc.invalidateQueries({ queryKey: timeKeys.running(userId) })
    qc.invalidateQueries({ queryKey: timeKeys.totals(userId) })
    qc.invalidateQueries({ queryKey: timeKeys.myTasks(userId) })
    qc.invalidateQueries({ queryKey: ['session-log'] })
    qc.invalidateQueries({ queryKey: ['sprint-total'] })
  }
}

export function useStartTimer(userId: string | undefined) {
  const invalidate = useInvalidateTime(userId)
  return useMutation({
    mutationFn: (taskId: string) => startTimer(taskId),
    onSuccess: invalidate,
  })
}

export function useStopTimer(userId: string | undefined) {
  const invalidate = useInvalidateTime(userId)
  return useMutation({
    mutationFn: () => stopTimer(),
    onSuccess: invalidate,
  })
}

export function useSetTaskRank(userId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, rank }: { taskId: string; rank: number }) =>
      setTaskRank(userId!, taskId, rank),
    onSuccess: () => {
      if (userId) qc.invalidateQueries({ queryKey: timeKeys.myTasks(userId) })
    },
  })
}

/** Local 1-second ticker so a running stopwatch updates smoothly between refetches. */
export function useTicker(active: boolean): number {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [active])
  return Date.now()
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```
git add src/hooks/useTimeTracking.ts
git commit -m "feat(hooks): time tracking queries + mutations"
```

---

## Task 7: TimeTotals + RunningBar components

**Files:**
- Create: `src/components/my-work/TimeTotals.tsx`
- Create: `src/components/my-work/RunningBar.tsx`

- [ ] **Step 1: Write `TimeTotals.tsx`**

```typescript
import { useTimeTotals } from '@/hooks/useTimeTracking'
import { formatDuration } from '@/lib/time-format'

export function TimeTotals({ userId }: { userId: string }) {
  const { data } = useTimeTotals(userId)
  const month = new Date().toLocaleString(undefined, { month: 'long' })
  return (
    <div className="flex items-center gap-6 text-sm">
      <div>
        <span className="text-muted-foreground">Today: </span>
        <span className="font-semibold text-foreground">
          {formatDuration(data?.todaySeconds ?? 0)}
        </span>
      </div>
      <div>
        <span className="text-muted-foreground">{month}: </span>
        <span className="font-semibold text-foreground">
          {formatDuration(data?.monthSeconds ?? 0)}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write `RunningBar.tsx`**

```typescript
import { Square } from 'lucide-react'
import { useRunningSession, useStopTimer, useTicker } from '@/hooks/useTimeTracking'
import { elapsedSeconds, formatClock } from '@/lib/time-format'

export function RunningBar({ userId }: { userId: string }) {
  const { data: running } = useRunningSession(userId)
  const stop = useStopTimer(userId)
  useTicker(!!running) // re-render every second while a timer runs

  if (!running) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
        No timer running. Press play on a task to start.
      </div>
    )
  }

  const seconds = elapsedSeconds(running.started_at)
  return (
    <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary" />
        <span className="truncate text-sm font-medium text-foreground">
          {running.task?.title ?? 'Running'}
        </span>
        <span className="font-mono text-sm tabular-nums text-primary">
          {formatClock(seconds)}
        </span>
      </div>
      <button
        onClick={() => stop.mutate()}
        disabled={stop.isPending}
        className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        <Square className="h-3.5 w-3.5" /> Stop
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```
git add src/components/my-work/TimeTotals.tsx src/components/my-work/RunningBar.tsx
git commit -m "feat(my-work): totals header + running timer bar"
```

---

## Task 8: MyTaskRow component

**Files:**
- Create: `src/components/my-work/MyTaskRow.tsx`

- [ ] **Step 1: Write `MyTaskRow.tsx`**

```typescript
import { Play, Square, GripVertical } from 'lucide-react'
import type { MyWorkTask } from '@/types/database'
import { formatDuration } from '@/lib/time-format'
import { cn } from '@/lib/utils'

interface MyTaskRowProps {
  task: MyWorkTask
  isRunning: boolean
  onStart: (taskId: string) => void
  onStop: () => void
  onToggleComplete: (task: MyWorkTask) => void
  dragHandleProps?: Record<string, unknown>
}

export function MyTaskRow({
  task,
  isRunning,
  onStart,
  onStop,
  onToggleComplete,
  dragHandleProps,
}: MyTaskRowProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5',
        isRunning && 'border-primary/40 bg-primary/5',
      )}
    >
      <span {...dragHandleProps} className="cursor-grab text-muted-foreground/50 hover:text-muted-foreground">
        <GripVertical className="h-4 w-4" />
      </span>

      <input
        type="checkbox"
        checked={task.is_done}
        onChange={() => onToggleComplete(task)}
        className="h-4 w-4 shrink-0 rounded border-border accent-primary"
        title="Mark complete"
      />

      <span className={cn('min-w-0 flex-1 truncate text-sm text-foreground', task.is_done && 'line-through text-muted-foreground')}>
        {task.title}
      </span>

      <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[11px] text-muted-foreground">
        {task.project.prefix}-{task.task_number}
      </span>

      <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
        {formatDuration(task.total_seconds)}
      </span>

      {isRunning ? (
        <button
          onClick={onStop}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          title="Stop timer"
        >
          <Square className="h-3.5 w-3.5" />
        </button>
      ) : (
        <button
          onClick={() => onStart(task.id)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          title="Start timer"
        >
          <Play className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```
git add src/components/my-work/MyTaskRow.tsx
git commit -m "feat(my-work): task row with start/stop + complete"
```

---

## Task 9: SessionLog component

**Files:**
- Create: `src/components/my-work/SessionLog.tsx`

- [ ] **Step 1: Write `SessionLog.tsx`**

```typescript
import { useSessionLog } from '@/hooks/useTimeTracking'
import { formatDuration } from '@/lib/time-format'
import type { SessionLogFilters } from '@/types/database'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: '2-digit' })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/**
 * Chronological per-entry log. Pass `userId` for an own-log (My Work) or `projectId`
 * for a project team feed. Each row is one start/stop session — repeats are not merged.
 */
export function SessionLog({ filters }: { filters: SessionLogFilters }) {
  const { data: sessions, isLoading } = useSessionLog(filters)

  if (isLoading) return <p className="px-1 py-4 text-sm text-muted-foreground">Loading…</p>
  if (!sessions || sessions.length === 0)
    return <p className="px-1 py-4 text-sm text-muted-foreground">No time logged yet.</p>

  return (
    <div className="divide-y divide-border">
      {sessions.map((s) => (
        <div key={s.id} className="flex items-center gap-3 py-2 text-sm">
          <span className="w-24 shrink-0 truncate text-muted-foreground">{s.user.full_name}</span>
          <span className="min-w-0 flex-1 truncate text-foreground">{s.task?.title ?? '—'}</span>
          <span className="w-12 shrink-0 text-muted-foreground">{fmtDate(s.started_at)}</span>
          <span className="w-32 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {fmtTime(s.started_at)} → {s.ended_at ? fmtTime(s.ended_at) : '…'}
          </span>
          <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-foreground">
            {formatDuration(s.duration_seconds)}
          </span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```
git add src/components/my-work/SessionLog.tsx
git commit -m "feat(my-work): chronological session log (own + team)"
```

---

## Task 10: MyWorkView orchestrator (with drag-rank)

**Files:**
- Create: `src/components/my-work/MyWorkView.tsx`

Uses `@hello-pangea/dnd` (already a dependency — see `src/components/board`).

- [ ] **Step 1: Write `MyWorkView.tsx`**

```typescript
import { useState } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { useAuth } from '@/contexts/AuthContext'
import {
  useMyTasks,
  useRunningSession,
  useStartTimer,
  useStopTimer,
  useSetTaskRank,
} from '@/hooks/useTimeTracking'
import { useUpdateTask } from '@/hooks/useTasks'
import { midpointRank } from '@/services/user-task-order'
import { TimeTotals } from './TimeTotals'
import { RunningBar } from './RunningBar'
import { MyTaskRow } from './MyTaskRow'
import { SessionLog } from './SessionLog'
import type { MyWorkTask } from '@/types/database'

export function MyWorkView() {
  const { user } = useAuth()
  const userId = user?.id
  const [tab, setTab] = useState<'board' | 'log'>('board')

  const { data: tasks } = useMyTasks(userId)
  const { data: running } = useRunningSession(userId)
  const start = useStartTimer(userId)
  const stop = useStopTimer(userId)
  const setRank = useSetTaskRank(userId)

  if (!userId) return null

  const active = (tasks ?? []).filter((t) => !t.is_done)
  const runningTaskId = running?.task_id ?? null

  const toggleComplete = (task: MyWorkTask) => {
    // Reuse the existing task mutation; updateTask needs the project id.
    updateComplete(task)
  }

  function onDragEnd(result: DropResult) {
    if (!result.destination || !userId) return
    const toIndex = result.destination.index
    const ranks = active.map((t) => t.rank)
    const rank = midpointRank(ranks, toIndex)
    setRank.mutate({ taskId: result.draggableId, rank })
  }

  // updateTask is project-scoped; build per-call.
  function updateComplete(task: MyWorkTask) {
    completeMutationFor(task)
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">My Work</h2>
        <TimeTotals userId={userId} />
      </div>

      <RunningBar userId={userId} />

      <div className="flex gap-2 border-b border-border">
        {(['board', 'log'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              'px-3 py-2 text-sm font-medium transition-colors ' +
              (tab === t
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground')
            }
          >
            {t === 'board' ? 'Board' : 'Log'}
          </button>
        ))}
      </div>

      {tab === 'board' ? (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="my-work">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="flex flex-col gap-2 overflow-y-auto">
                {active.map((task, index) => (
                  <Draggable key={task.id} draggableId={task.id} index={index}>
                    {(p) => (
                      <div ref={p.innerRef} {...p.draggableProps}>
                        <MyTaskRow
                          task={task}
                          isRunning={runningTaskId === task.id}
                          onStart={(id) => start.mutate(id)}
                          onStop={() => stop.mutate()}
                          onToggleComplete={toggleComplete}
                          dragHandleProps={p.dragHandleProps ?? undefined}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
                {active.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No active tasks assigned to you.
                  </p>
                )}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      ) : (
        <div className="overflow-y-auto">
          <SessionLog filters={{ userId }} />
        </div>
      )}
    </div>
  )

  // --- helpers that need per-task project id (declared after return via hoisting is not
  // available for closures; see Step 2 note) ---
  function completeMutationFor(_task: MyWorkTask) {
    /* replaced in Step 2 */
  }
}
```

- [ ] **Step 2: Replace the complete-toggle stub with a working implementation**

The `useUpdateTask` hook is project-scoped, so we cannot call it conditionally per row at the top level. Replace the `toggleComplete` / `updateComplete` / `completeMutationFor` placeholders with a small child component that owns its own mutation. Edit `MyWorkView.tsx`:

1. Delete the `updateComplete`, `toggleComplete`, and `completeMutationFor` functions and the `useUpdateTask` import.
2. Change the `onToggleComplete` wiring to use a dedicated row wrapper. Replace the `<MyTaskRow ... onToggleComplete={toggleComplete} />` usage with `<MyWorkRow ... />` and add this component at the bottom of the file:

```typescript
import { useUpdateTask } from '@/hooks/useTasks'

function MyWorkRow({
  task,
  isRunning,
  onStart,
  onStop,
  dragHandleProps,
}: {
  task: MyWorkTask
  isRunning: boolean
  onStart: (taskId: string) => void
  onStop: () => void
  dragHandleProps?: Record<string, unknown>
}) {
  const update = useUpdateTask(task.project.id)
  return (
    <MyTaskRow
      task={task}
      isRunning={isRunning}
      onStart={onStart}
      onStop={onStop}
      onToggleComplete={(t) =>
        update.mutate({
          taskId: t.id,
          input: { is_done: !t.is_done, done_at: !t.is_done ? new Date().toISOString() : null },
        })
      }
      dragHandleProps={dragHandleProps}
    />
  )
}
```

3. Confirm the `useUpdateTask` mutation signature by reading `src/hooks/useTasks.ts` (look at `useUpdateTask`); adapt the `.mutate(...)` argument shape to match exactly (the example above assumes `{ taskId, input }` — match whatever the hook actually expects).

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`
Expected: build succeeds. If the `useUpdateTask` argument shape differs, fix per the actual signature and rebuild.

- [ ] **Step 4: Commit**

```
git add src/components/my-work/MyWorkView.tsx
git commit -m "feat(my-work): board orchestrator with drag-rank + complete toggle"
```

---

## Task 11: `/my-work` route + sidebar link

**Files:**
- Create: `src/routes/_app/my-work.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Write the route**

```typescript
import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '@/components/layout/AppShell'
import { MyWorkView } from '@/components/my-work/MyWorkView'

export const Route = createFileRoute('/_app/my-work')({
  component: MyWorkPage,
})

function MyWorkPage() {
  return (
    <AppShell>
      <MyWorkView />
    </AppShell>
  )
}
```

- [ ] **Step 2: Add the My Work sidebar link**

In `src/components/layout/Sidebar.tsx`, import an icon (`Timer` is already imported; reuse it or add `ListTodo` to the lucide import block). In the global (non-project) nav section — the block that contains the `/projects`, `/invites`, `/settings` links — add a **My Work** link as the first item, above Projects:

```tsx
<Link
  to="/my-work"
  className={cn(
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
    currentPath === '/my-work'
      ? 'bg-primary/10 text-primary font-medium'
      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
  )}
>
  <ListTodo className="h-4 w-4 shrink-0" />
  {!collapsed && <span>My Work</span>}
</Link>
```

Add `ListTodo` to the existing `lucide-react` import at the top of the file.

- [ ] **Step 3: Verify build + route generation**

Run: `npm run build`
Expected: build succeeds; the router plugin regenerates `src/routeTree.gen.ts` to include `/_app/my-work`. (If `routeTree.gen.ts` is git-tracked, it will show as modified — include it in the commit.)

- [ ] **Step 4: Manual runtime check**

Run: `npm run dev`, log in, click **My Work** in the sidebar. Expected: page loads, lists your assigned tasks, totals show 0 initially. Press play on a task → running bar appears and ticks; press stop → total increments; the Log tab shows the entry. Pressing play on a second task auto-stops the first.

- [ ] **Step 5: Commit**

```
git add src/routes/_app/my-work.tsx src/components/layout/Sidebar.tsx src/routeTree.gen.ts
git commit -m "feat(my-work): /my-work route + sidebar link"
```

---

## Task 12: Per-project team Logs tab

**Files:**
- Create: `src/routes/_app/p/$slug/logs.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Write the route**

```typescript
import { createFileRoute } from '@tanstack/react-router'
import { useProjectContext } from '@/contexts/ProjectContext'
import { SessionLog } from '@/components/my-work/SessionLog'

export const Route = createFileRoute('/_app/p/$slug/logs')({
  component: LogsPage,
})

function LogsPage() {
  const { project } = useProjectContext()
  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 shrink-0">
        <h2 className="text-lg font-semibold text-foreground">Time Logs</h2>
        <p className="text-sm text-muted-foreground">Everyone's tracked time on this project.</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SessionLog filters={{ projectId: project.id }} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add the Logs project-nav link**

In `src/components/layout/Sidebar.tsx`, add to the `projectNav` array (between Gantt and Archive). Add `History` to the lucide import:

```tsx
{ to: `/p/${projectSlug}/logs`, label: 'Logs', icon: History },
```

- [ ] **Step 3: Verify build + route generation**

Run: `npm run build`
Expected: build succeeds; `routeTree.gen.ts` now includes `/_app/p/$slug/logs`.

- [ ] **Step 4: Manual runtime check**

Run: `npm run dev`, open a project, click **Logs**. Expected: shows all members' session entries for that project's tasks (after some have been logged). Confirm a second member's entries are visible (RLS project-wide read).

- [ ] **Step 5: Commit**

```
git add src/routes/_app/p/$slug/logs.tsx src/components/layout/Sidebar.tsx src/routeTree.gen.ts
git commit -m "feat(my-work): per-project team Logs tab"
```

---

## Task 13: MCP timer tools

**Files:**
- Create: `mcp-server/src/tools/time-start.ts`
- Create: `mcp-server/src/tools/time-stop.ts`
- Create: `mcp-server/src/tools/time-status.ts`
- Create: `mcp-server/src/tools/time-summary.ts`
- Modify: `mcp-server/src/index.ts`

All tools use `ctx.userId` + `ctx.supabase` (which holds the authenticated user's session, so `auth.uid()` inside the RPCs resolves to this user). `resolveTaskId` (from `../helpers.js`) accepts `"NT-1"`-style IDs or UUIDs.

- [ ] **Step 1: Write `time-start.ts`**

```typescript
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RequestContext } from '../auth.js'
import { resolveTaskId } from '../helpers.js'

export function registerStartTaskTimer(server: McpServer, ctx: RequestContext) {
  server.tool(
    'start_task_timer',
    `Start the work timer on a task (e.g. "NT-1" or UUID). Only one timer runs at a time — starting this one automatically stops any timer already running for you. Each start/stop is recorded as one time-log entry.`,
    {
      task_id: z.string().describe('Task ID in prefix-number format (e.g. "NT-1") or UUID'),
    },
    async (args) => {
      try {
        const taskUUID = await resolveTaskId(ctx.supabase, args.task_id)
        const { data, error } = await ctx.supabase.rpc('start_task_timer', { p_task_id: taskUUID })
        if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
        const row = data as { started_at: string }
        return { content: [{ type: 'text' as const, text: `Timer started for ${args.task_id} at ${row.started_at}.` }] }
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true }
      }
    },
  )
}
```

- [ ] **Step 2: Write `time-stop.ts`**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RequestContext } from '../auth.js'

export function registerStopTaskTimer(server: McpServer, ctx: RequestContext) {
  server.tool(
    'stop_task_timer',
    `Stop your currently running work timer. Does nothing if no timer is running.`,
    {},
    async () => {
      try {
        const { data, error } = await ctx.supabase.rpc('stop_task_timer')
        if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
        if (!data) return { content: [{ type: 'text' as const, text: 'No timer was running.' }] }
        const row = data as { started_at: string; ended_at: string }
        const secs = Math.floor((new Date(row.ended_at).getTime() - new Date(row.started_at).getTime()) / 1000)
        return { content: [{ type: 'text' as const, text: `Timer stopped. Logged ${Math.floor(secs / 60)}m ${secs % 60}s.` }] }
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true }
      }
    },
  )
}
```

- [ ] **Step 3: Write `time-status.ts`**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RequestContext } from '../auth.js'

export function registerGetTimerStatus(server: McpServer, ctx: RequestContext) {
  server.tool(
    'get_timer_status',
    `Check whether you have a work timer running right now, which task, and for how long.`,
    {},
    async () => {
      try {
        const { data, error } = await ctx.supabase
          .from('task_time_sessions')
          .select('started_at, task:tasks!task_id(title, task_number, project:projects!project_id(prefix))')
          .eq('user_id', ctx.userId)
          .is('ended_at', null)
          .maybeSingle()
        if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
        if (!data) return { content: [{ type: 'text' as const, text: 'No timer running.' }] }
        const row = data as any
        const secs = Math.floor((Date.now() - new Date(row.started_at).getTime()) / 1000)
        const id = row.task ? `${row.task.project?.prefix}-${row.task.task_number}` : '?'
        return {
          content: [{ type: 'text' as const, text: `Running: ${id} "${row.task?.title ?? ''}" — ${Math.floor(secs / 60)}m ${secs % 60}s elapsed.` }],
        }
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true }
      }
    },
  )
}
```

- [ ] **Step 4: Write `time-summary.ts`**

```typescript
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RequestContext } from '../auth.js'

function fmt(secs: number) {
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

export function registerGetTimeSummary(server: McpServer, ctx: RequestContext) {
  server.tool(
    'get_time_summary',
    `Get your total tracked time for a range: "today", "month" (current calendar month), or "sprint" (requires sprint_id).`,
    {
      range: z.enum(['today', 'month', 'sprint']).describe('Which total to compute'),
      sprint_id: z.string().optional().describe('Sprint UUID — required when range is "sprint"'),
    },
    async (args) => {
      try {
        let fromIso: string | undefined
        let taskIds: string[] | undefined

        if (args.range === 'today') {
          const n = new Date()
          fromIso = new Date(n.getFullYear(), n.getMonth(), n.getDate()).toISOString()
        } else if (args.range === 'month') {
          const n = new Date()
          fromIso = new Date(n.getFullYear(), n.getMonth(), 1).toISOString()
        } else {
          if (!args.sprint_id) return { content: [{ type: 'text' as const, text: 'Error: sprint_id is required for range "sprint".' }], isError: true }
          const { data: tasks, error: tErr } = await ctx.supabase.from('tasks').select('id').eq('sprint_id', args.sprint_id)
          if (tErr) return { content: [{ type: 'text' as const, text: `Error: ${tErr.message}` }], isError: true }
          taskIds = (tasks ?? []).map((t: any) => t.id)
          if (taskIds.length === 0) return { content: [{ type: 'text' as const, text: 'Sprint total: 0h 0m (no tasks).' }] }
        }

        let q = ctx.supabase.from('task_time_sessions').select('started_at, ended_at').eq('user_id', ctx.userId)
        if (fromIso) q = q.gte('started_at', fromIso)
        if (taskIds) q = q.in('task_id', taskIds)
        const { data, error } = await q
        if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

        let secs = 0
        for (const s of data ?? []) {
          const row = s as { started_at: string; ended_at: string | null }
          const end = row.ended_at ? new Date(row.ended_at).getTime() : Date.now()
          secs += Math.max(0, Math.floor((end - new Date(row.started_at).getTime()) / 1000))
        }
        return { content: [{ type: 'text' as const, text: `${args.range} total: ${fmt(secs)}.` }] }
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true }
      }
    },
  )
}
```

- [ ] **Step 5: Register the tools in `index.ts`**

Add imports alongside the existing tool imports:

```typescript
import { registerStartTaskTimer } from './tools/time-start.js'
import { registerStopTaskTimer } from './tools/time-stop.js'
import { registerGetTimerStatus } from './tools/time-status.js'
import { registerGetTimeSummary } from './tools/time-summary.js'
```

Add registration calls in `createServer`, after `registerAddComment(server, ctx)`:

```typescript
  registerStartTaskTimer(server, ctx)
  registerStopTaskTimer(server, ctx)
  registerGetTimerStatus(server, ctx)
  registerGetTimeSummary(server, ctx)
```

- [ ] **Step 6: Build the MCP server**

Run (from `mcp-server/`):
```
npm run build
```
Expected: `tsc` completes with no errors. (Check `mcp-server/package.json` for the exact build script if `build` differs.)

- [ ] **Step 7: Commit**

```
git add mcp-server/src/tools/time-start.ts mcp-server/src/tools/time-stop.ts mcp-server/src/tools/time-status.ts mcp-server/src/tools/time-summary.ts mcp-server/src/index.ts
git commit -m "feat(mcp): start/stop/status/summary timer tools"
```

---

## Task 14: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Full frontend build**

Run: `npm run build`
Expected: succeeds with no TS errors.

- [ ] **Step 2: Full MCP build**

Run (from `mcp-server/`): `npm run build`
Expected: succeeds.

- [ ] **Step 3: Runtime smoke test (UI)**

`npm run dev`, then:
- My Work lists assigned tasks across projects. ✅
- Start timer on task A → running bar ticks; start on task B → A auto-stops, B runs. ✅
- Stop → task B total increments; Today/Month totals increase. ✅
- Drag to reorder → order persists after refresh. ✅
- Check a task complete → it leaves the active list; its logged time still appears in the Log tab. ✅
- Project → Logs tab shows entries from all members. ✅

- [ ] **Step 4: Runtime smoke test (MCP)**

Using an MCP client authenticated with an API key:
- `start_task_timer { task_id: "<PREFIX>-1" }` → "Timer started". The UI running bar shows it within ~30s (or on refresh). ✅
- `get_timer_status` → reports the running task + elapsed. ✅
- `stop_task_timer` → "Logged Xm". ✅
- `get_time_summary { range: "today" }` → matches the UI Today total. ✅

- [ ] **Step 5: Final commit (if any tracked artifacts changed)**

```
git add -A
git commit -m "chore: my-work time tracking end-to-end verification"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** `/my-work` hub (T11), one-at-a-time timer + auto-stop (T1 RPC, T7/T8/T10), immutable per-entry sessions (T1), private drag-rank (T1/T5/T10), complete via existing `is_done` (T10), today/month/sprint + per-task totals (T4/T7), chronological log (T9), project-wide log visibility (T1 RLS) on own + team surfaces (T10/T12), 4 MCP tools sharing the table (T13), `task_time_sessions` + `user_task_order` schema (T1). All spec sections map to a task.
- **Placeholders:** Task 10 intentionally introduces and then removes a stub across Steps 1–2 (documented, with full replacement code) because `useUpdateTask` is project-scoped and must live in a child component — this is explicit, not a TODO.
- **Type consistency:** `start_task_timer`/`stop_task_timer` RPC names, `MyWorkTask`/`TimeSession`/`TimeSessionWithTask`/`SessionLogFilters` type names, and `formatDuration`/`formatClock`/`elapsedSeconds` helper names are used identically across the service, hooks, components, and MCP tasks.
- **Testing deviation:** No unit tests — repo has no harness; verification is build + manual/SQL, consistent with the codebase and the user's "simple/build now" constraint.
