# Gantt Chart — Design

**Date:** 2026-05-31
**Component:** frontend (new `gantt` view) + `tasks` schema
**Status:** Approved

## Problem

Tasks have no scheduling dates, so there is no way to see work laid out on a timeline.
A Gantt view gives a project-wide timeline of dated tasks, grouped by column, with
drag-to-schedule editing.

## Decisions

| Question | Decision |
|----------|----------|
| Date model | `start_date` + `due_date` on tasks (both nullable). Bar spans start→due. |
| Bar rule | A task renders a bar only when **both** dates are set; otherwise it is "Unscheduled". |
| Location | Own route `/p/:slug/gantt` + a Gantt sidebar link (like Sprints analytics). |
| Editing | Drag bar body to move (shift both dates); drag edges to resize; plus date inputs in the detail panel and create dialog. |
| Dependencies | None in v1 (no arrows / join table / cycle checks). |
| Row grouping | By column/status, collapsible (reuses project columns). |
| Timeline scale | Day / Week toggle, default Week. |

## Data model

Migration `supabase/migrations/023_task_dates.sql`:
- `alter table public.tasks add column start_date date;`
- `alter table public.tasks add column due_date date;`
- Both nullable. No DB-level `due >= start` check — the UI enforces it; drag can
  transiently invert before commit. Existing tasks RLS covers the new columns.

Types (`src/types/database.ts`):
- `Task`: add `start_date: string | null`, `due_date: string | null`.
- `UpdateTaskInput`: add `start_date?: string | null`, `due_date?: string | null`.
- `CreateTaskInput`: add `start_date?: string | null`, `due_date?: string | null`.

`src/services/tasks.ts`: add `start_date, due_date` to the `TASK_SELECT` constant so
they load on board/list/gantt queries; `createTask` passes them through when provided.

## Setting dates

- `TaskDetailPanel` Details grid: Start and Due `<input type="date">` fields, saved via
  the existing optimistic `handleFieldUpdate` / `useUpdateTask`.
- `CreateTaskDialog`: optional Start / Due fields included in `CreateTaskInput`.

## Gantt page

- Route: `src/routes/_app/p/$slug/gantt.tsx` (mirrors `sprints.tsx` — wraps in project
  context, renders `GanttView`). Opens `TaskDetailPanel` via `?task=` param like the board.
- `src/components/layout/Sidebar.tsx`: add a **Gantt** nav link (lucide
  `GanttChartSquare`) between Sprints and Archive, project-context aware.
- `src/components/gantt/`:
  - `GanttView.tsx` — orchestrator. Uses `useTasks(projectId)` and `useProjectContext`.
    Splits tasks into scheduled (both dates, not archived) and unscheduled. Computes the
    timeline range: `min(start)` → `max(due)` across scheduled tasks, padded ~1 week each
    side; defaults to a window around today when empty. Holds `scale: 'day' | 'week'`
    (default `week`). Groups scheduled rows by `column_id` (collapsible, persisted per
    project in `localStorage['ganttCollapsed:<projectId>']`). Renders: timescale header,
    grouped rows, a "Today" vertical marker, and an Unscheduled panel.
  - `GanttTimescale` (within GanttView or its own file) — date-axis header built with
    `date-fns`: day columns (`eachDayOfInterval`) or week buckets (`startOfWeek` +
    weekly step). Defines `pxPerDay` per scale (e.g. day ≈ 32px/day; week column ≈ 112px
    ⇒ 16px/day).
  - `GanttRow.tsx` — a task label (pill + title) + the track containing its `GanttBar`.
  - `GanttBar.tsx` — absolute-positioned bar; `left = daysFromRangeStart(start) * pxPerDay`,
    `width = (daysBetween(start,due)+1) * pxPerDay`. Drag body → shift both dates; drag
    left/right edge handles → resize one end. Custom pointer handlers convert pixel delta
    to whole-day delta; preview locally during drag; commit on pointer-up via optimistic
    `useUpdateTask`. Clamps so `due >= start`. Disabled (static) when `!canEditTask`.
  - Unscheduled panel — list of tasks missing a date; clicking opens `TaskDetailPanel` to
    set dates.

### Data flow
`useTasks` (existing, now carrying dates) → GanttView partitions + groups → bars compute
geometry from the shared timeline range. Edits go through `useUpdateTask` (optimistic
cache patch already implemented), so bars move immediately and the board/list stay in sync.

## Edge cases

- Archived tasks excluded (same as board).
- `due < start` prevented during drag/resize (clamp).
- Tasks missing either date → Unscheduled, never rendered as bars.
- Empty project / no dated tasks → timeline centers on the current week; Unscheduled lists everything.
- Read-only members (`!canEditTask`) see static bars and date fields.

## Testing

- `npm run build` — clean (tsc + vite).
- Setting start/due in the panel persists and the bar appears at the right position/width.
- Drag body moves both dates by the dragged number of days; resize moves only one end;
  `due >= start` always holds.
- Day/Week scale toggle re-lays out bars correctly.
- Unscheduled tasks listed; opening one and adding dates moves it onto the timeline.
- Today marker aligns with the current date column.
- A read-only member cannot drag/resize and has no editable date inputs.

## Out of scope (YAGNI)

- Task dependencies / arrows / critical path.
- Month (and finer than day) scales.
- Milestones, baselines, resource/assignee swimlanes.
- Export / print.
