# My Work — Personal Board & Time Tracking — Design

**Date:** 2026-06-02
**Component:** frontend (new `/my-work` route + `my-work` components) + new schema (`task_time_sessions`, `user_task_order`) + MCP server (4 timer tools)
**Status:** Approved

## Problem

The app is a multi-project team Kanban tool. A user assigned tasks across several
projects has no single place to see *their own* work, prioritize it personally, or
track how long they spend on each task. There is no time tracking of any kind today.

This feature adds a personal, cross-project command center: one page listing every
task assigned to the user, a one-tap timer per task, a private prioritization order,
and auto-derived time records (today / month / per-sprint). Every start/stop is a
discrete log entry, so the same data doubles as a per-task time-in/time-out attendance
log visible to the project.

## Guiding constraint

**The tracker must never be a burden.** One-tap start/stop, one running task at a
time, and *everything else is derived* — no mandatory fields, no notes, no estimate
hours, no timesheet submission. The moment it asks the user to fill something in, they
stop using it. v1 is deliberately minimal.

## Decisions

| Question | Decision |
|----------|----------|
| Scope | Cross-project hub at top-level route `/my-work`. Shows tasks assigned to the current user across **all** projects. |
| Timer model | Live start/stop. **One** running session at a time per user — starting a new task auto-stops the previous open session. |
| Entry semantics | Every start→stop is **one immutable row**. Returning to a task later creates a **new** row; rows are never merged. `started_at` = time-in, `ended_at` = time-out. |
| Prioritization | Private per-user drag-rank, independent of the team `priority` field. Owner only — nobody else sees it. |
| Mark complete | Reuses existing `tasks.is_done` / `done_at`. No new field. Completed tasks drop off the active list; their logged time stays. |
| Records | Today total + month total + per-sprint total + per-task total. All `SUM`-derived, no stored aggregates. **No estimate hours.** |
| Log view | Chronological per-entry list (user · task · date · in → out · duration). Repeats kept separate. |
| Log visibility | **Project-wide.** Any member of a task's project can read all sessions on that project's tasks. (Doubles as a team activity/attendance feed.) |
| Rank visibility | Private. Owner reads/writes only their own rows. |
| MCP | 4 new tools — `start_task_timer`, `stop_task_timer`, `get_timer_status`, `get_time_summary` — writing the **same** `task_time_sessions` table as the UI (one source of truth). |
| Estimates / notes / categories / billing | **Cut.** Out of scope, by design. |

## Data model

New migration `supabase/migrations/025_time_tracking.sql`:

### `task_time_sessions`
```sql
create table public.task_time_sessions (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,                 -- null = currently running
  created_at  timestamptz not null default now()
);
```
- Duration is **computed** (`ended_at - started_at`), never stored.
- A row with `ended_at is null` is the user's currently running timer.
- "One running at a time" is enforced at write time: before opening a new session,
  close any open session for that `user_id` (set `ended_at = now()`).
- Partial unique index to guarantee at most one open session per user:
  ```sql
  create unique index task_time_sessions_one_open_per_user
    on public.task_time_sessions (user_id) where ended_at is null;
  ```
- Indexes: `(user_id, started_at)` for personal totals; `(task_id)` for per-task sums.

**RLS** (project-wide read, own-row write):
- SELECT: a user may read a session if they are an active member of the project that
  owns `task_id` (mirror the existing task/project membership policy).
- INSERT / UPDATE / DELETE: only rows where `user_id = auth.uid()`.

### `user_task_order`
```sql
create table public.user_task_order (
  user_id  uuid not null references auth.users(id) on delete cascade,
  task_id  uuid not null references public.tasks(id) on delete cascade,
  rank     double precision not null,   -- fractional ranking for cheap drag reorders
  primary key (user_id, task_id)
);
```
- `rank` uses fractional/float ranking so a drag updates one row (midpoint between
  neighbors) without renumbering the list.
- Tasks with no row sort after ranked tasks (default by created/priority).

**RLS:** all operations restricted to `user_id = auth.uid()`. Fully private.

### Types (`src/types/database.ts`)
- `TimeSession`: `{ id, task_id, user_id, started_at, ended_at: string | null, created_at }`.
- `TimeSessionWithTask` (for the log/feed): adds task title, project, and a
  `Pick<Profile,'id'|'full_name'|'avatar_url'>` for the user.
- No change to `Task` is required for completion (existing `is_done` / `done_at`).

## Services (`src/services/`)

New `time-sessions.ts`:
- `startTimer(taskId)` — RPC/transaction: close any open session for the user, insert a
  new open row. Returns the running session.
- `stopTimer()` — set `ended_at = now()` on the user's open session (no-op if none).
- `getRunningSession()` — the user's open row (or null), joined to its task.
- `listMyTasks()` — tasks assigned to the current user across all projects, joined with
  their `user_task_order` rank and a per-task duration sum.
- `getTotals({ range })` — today / month sums for the user; sprint totals grouped by
  `tasks.sprint_id`.
- `listSessions({ projectId?, userId?, from?, to? })` — log entries, project-scoped.

New `user-task-order.ts`:
- `setRank(taskId, rank)` — upsert. Drag computes the midpoint client-side.

Hooks in `src/hooks/` (TanStack Query, optimistic where it matters):
- `useMyTasks()`, `useRunningSession()`, `useTimeTotals()`, `useSessionLog(filters)`,
  `useStartTimer()`, `useStopTimer()`, `useSetTaskRank()`.
- The running session refetches on an interval / uses a client tick so elapsed time
  updates live without server round-trips.

## UI

### `/my-work` route
- File `src/routes/_app/my-work.tsx`, wrapped in the `_app` authed layout (mirrors
  `projects.tsx` / `sprints.tsx`). Sidebar gets a **My Work** nav link (lucide icon,
  e.g. `ListTodo` / `Timer`) near the top, project-independent.

### Layout
```
┌─ My Work ─────────────────────────────────┐
│  Today: 2h 14m   ·   June: 38h 05m         │  ← live totals (per-sprint via selector)
│  ▶ Running: "Fix login bug"  00:48:12  [⏹] │  ← sticky running bar (forgotten-timer guard)
├────────────────────────────────────────────┤
│  ⠿ Fix login bug      [Proj A]  1h12m  [▶] │  ← drag-rank list of MY assigned tasks
│  ⠿ Gantt tweak        [Proj B]  25m    [▶] │
│  ⠿ Review PR          [Proj A]  0m     [▶] │
│  ☑ completed tasks drop off the active list │
└────────────────────────────────────────────┘
```
- One always-visible running bar.
- `[▶]` starts (auto-stops previous); `[⏹]` stops. Per-task cumulative time shown inline.
- Drag handle reorders via `user_task_order` (optimistic).
- Checkbox marks complete through the existing `useUpdateTask` (`is_done`).
- Each row links to the task (opens existing `TaskDetailPanel` via `?task=`).

### Components (`src/components/my-work/`)
- `MyWorkView.tsx` — orchestrator: totals header, running bar, ranked task list, log tab.
- `RunningBar.tsx` — current session + live elapsed + stop.
- `MyTaskRow.tsx` — one task: drag handle, title, project chip, total, start/stop, done.
- `TimeTotals.tsx` — today / month / sprint figures (sprint via a small selector).
- `SessionLog.tsx` — chronological entry list with member + date filters; reused both
  on `/my-work` (my entries) and per-project (team feed).

### Log entry display
```
Merc · "Fix login bug" · Jun 02 · 09:00 → 09:45 · 45m
Merc · "Fix login bug" · Jun 02 · 10:30 → 11:10 · 40m   (separate row — never merged)
```

## MCP server (`mcp-server/src/tools/`)

Follow the existing `register<Name>(server, ctx)` pattern; wire each in `index.ts`.
All tools act as the authenticated user from `ctx` (API-key auth, migration 018) and
write the same `task_time_sessions` table as the UI.

- `time-start.ts` → `start_task_timer({ task_id })` — closes any open session, opens new.
- `time-stop.ts` → `stop_task_timer()` — closes the user's open session.
- `time-status.ts` → `get_timer_status()` — running task + elapsed, or idle.
- `time-summary.ts` → `get_time_summary({ range: 'today' | 'month' | 'sprint', sprint_id? })`
  — totals for the user.

Because UI and MCP share the table, a timer started by the agent shows live in the web
UI and vice-versa.

## Out of scope (v1)

7/30-day charts, per-project split view, manual session add/edit, idle auto-pause,
daily goals, pomodoro, estimate hours, session notes/categories, billing/invoicing,
timesheet approval. Revisit only if the minimal version proves it's wanted.

## Testing

- DB: open-session uniqueness (starting a 2nd timer closes the 1st); RLS — member can
  read project sessions, cannot insert/edit another user's; rank private.
- Services: start→stop produces one closed row; re-start same task = a second row;
  per-task total = sum of rows; today/month/sprint sums correct across timezones.
- UI: running bar reflects state; start auto-stops previous; drag persists rank;
  complete removes from active list but keeps logged time.
- MCP: each tool round-trips against the same table; status/summary match the UI.
