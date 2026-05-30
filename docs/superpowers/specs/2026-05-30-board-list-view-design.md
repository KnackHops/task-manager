# Board List View — Design

**Date:** 2026-05-30
**Component:** frontend (`src/components/board`, board route)
**Status:** Approved

## Problem

The project board is kanban-only. At scale, kanban means endless horizontal scroll
and poor cross-column scanning. A **list view** — grouped by column, with inline
editing and drag-to-move — gives a dense, triage-friendly alternative. All data is
already loaded by `useTasks`; this is a pure frontend addition.

## Decisions

| Question | Decision |
|----------|----------|
| Where does it live? | **Toggle on the board page** (same route). Header, sprint filter, New Task button stay shared; only the body swaps. |
| Row organization | **Grouped by column**, collapsible sections, count per group. |
| Row fields | Title + Task ID (NT-1) + Priority. (Lean — other fields live in the panel.) |
| Interactions | Click row body → open `TaskDetailPanel`. **Drag** rows between/within column groups. **Inline quick-edit:** priority, title, mark-done, column. |
| Permissions | Drag + all inline edit controls gated behind `canEditTask`. Read-only members get a plain clickable list. |

## Architecture

### Shared DnD hook — `src/hooks/useBoardDnd.ts` (new)

Extract `BoardContainer`'s grouping + drag handling so board and list share identical
behavior (no duplicated optimistic-reorder logic). The hook:

- Signature: `useBoardDnd(projectId: string, sprintId?: string | null)`.
- Internally uses `useProjectContext`, `useTasks`, `useSprints`, `useReorderTask`,
  `useQueryClient`.
- Owns `pendingReorder` state, the `grouped` `useMemo` (tasks by `column_id`, sorted by
  `position`, with the pending-reorder overlay applied), and `handleDragEnd`
  (sprint auto-assign on sprint column, done auto-mark on done column, synchronous
  cache write, `reorderMutation`).
- Returns `{ grouped, handleDragEnd, isLoading }`.

`BoardContainer` is refactored to consume the hook (its column-management button
handlers stay in the component). This is the only refactor — targeted, serves the feature.

### View toggle — `src/routes/_app/p/$slug/index.tsx`

- `LayoutGrid | List` segmented control in the existing header (near the sprint filter).
- `viewMode: 'board' | 'list'` state, initialized from and persisted to
  `localStorage['boardViewMode']` (default `'board'`).
- Body: `viewMode === 'board' ? <BoardContainer/> : <BoardListView/>`. Both receive the
  same `projectId`, `sprintId`, `onTaskClick` props.

### `BoardListView.tsx` (new)

- `useBoardDnd(projectId, sprintId)` for `grouped` + `handleDragEnd`.
- `<DragDropContext onDragEnd={handleDragEnd}>` wrapping one collapsible section per
  project column.
- Section header: chevron (collapse toggle) + column name + count badge.
- Per-column collapse state persisted in `localStorage['boardListCollapsed:<projectId>']`
  (a JSON map of `columnId → boolean`), default expanded.
- Section body: `<Droppable droppableId={column.id}>` containing `TaskListRow` per task
  (each a `<Draggable>`), plus `provided.placeholder`. Renders even when empty so tasks
  can be dropped into an empty column.
- Loading: row skeletons (reuse `Skeleton`).

### `TaskListRow.tsx` (new)

- `<Draggable draggableId={task.id} index={index}>`; drag enabled only when `canEditTask`.
- Layout: `[done checkbox] [priority ▾] [NT-1] [title] …… [column ▾]`.
- **Row body click** → `onClick(task.id)` (opens panel). Edit controls call
  `e.stopPropagation()` so they trigger neither drag nor panel-open.
- **Inline edits** via `useUpdateTask(projectId)` (existing optimistic mutation that
  patches list + detail caches):
  - **Priority** — small dropdown (critical/high/medium/low), reuses the board's
    priority color map.
  - **Title** — click to enter edit mode (text input); Enter saves, Esc cancels, blur
    saves. No-op if unchanged/empty.
  - **Done** — checkbox sets `{ is_done, done_at }`. Disabled when the task is in a done
    column (matches `TaskDetailPanel` behavior).
  - **Column** — dropdown of project columns; sets `column_id`, and applies
    `{ is_done: true, done_at }` when the target is a done column (mirrors drag).
- When `!canEditTask`: render priority/column/done as static text/badges, title
  non-editable, row still clickable to open the panel.

## What is NOT touched

Only the DnD extraction (which also improves `BoardContainer`). No unrelated refactor.
`TaskCard`, `BoardColumn`, services, hooks (other than the new `useBoardDnd`) unchanged.

## Testing

- `npm run build` — clean (tsc + vite), 0 errors.
- Toggle persists across reload; switching views preserves the sprint filter.
- Drag a row to another column group → task moves, persists, and sprint/done auto-rules
  fire identically to the board.
- Each inline edit (priority, title, done, column) persists optimistically; rollback on
  error.
- Clicking the row body opens the correct task; clicking an edit control does not open
  the panel or start a drag.
- Per-column collapse persists per project.
- Empty column group still accepts drops.
- A read-only member (no `can_edit_task`) sees a clickable list with no edit controls and
  cannot drag.

## Out of scope (YAGNI)

- Flat/global sorting across columns.
- Additional row columns (assignees, tags, points) — available in the panel.
- Multi-select / bulk actions.
- Separate list route.
