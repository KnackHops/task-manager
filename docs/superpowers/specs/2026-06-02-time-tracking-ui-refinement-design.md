# Time Tracking UI Refinement + is_done Bug — Design

**Date:** 2026-06-02
**Component:** frontend (`my-work`/`board` components, `useBoardDnd`, `TaskDetailPanel`, `TaskListRow`) + small service re-add
**Status:** Approved

## Problem

After the board-first time-tracking pivot, two views need polish and one bug bites:

1. **Time Logs** is a flat, repetitive session list (same task appears many times) — hard to read.
2. **My Tasks** is a sparse checkbox list — it lacks the context (status, sprint, tags, dates) and ordering control the user wants.
3. **Bug:** a task that was moved into a Done column (setting `is_done = true`) and later moved back to a non-done column keeps `is_done = true` — the board drag and detail-panel paths never clear it. My Tasks filters on `is_done`, so the task vanishes even though it is assigned and not actually done. (MCP's `update_task` already clears it correctly; only the frontend paths drift.)

## Decisions

| Topic | Decision |
|-------|----------|
| Time Logs layout | Group by task. One row per task: title (+ project chip when "All projects"), session count, total time, expand chevron. Expand → individual sessions (date · in→out · duration); running session shows the pulse. Groups sorted by total time desc. |
| Time Logs chrome | Keep running bar + filters (project dropdown, "only my time"). |
| My Tasks ordering | Manual drag-sort, persisted per user via the existing `user_task_order` table. Re-add the `setTaskRank`/`midpointRank` service (deleted in the pivot). |
| My Tasks checkbox | Removed. Completing happens on the board. |
| My Tasks row info | Dense, board-list-view style: drag handle · priority dot · title · tags · status/column chip · sprint · due date · story points · comment/attachment counts · time tracked · timer button. Row click opens the task detail panel. |
| My Tasks data | Reuse `useTasks(projectId)` (already returns `TaskWithRelations` with tags, counts, column, sprint, dates, points). Filter to assigned-to-me, not done, not archived. Merge per-task tracked seconds + private rank. No heavy new task query. |
| Stats | Inline strip: `Today 7m · Week 1h 02m · Sprint 2 38m`. Replaces the boxed stat cards. |
| Bug fix | Board drag (`useBoardDnd`) + detail-panel column change + `TaskListRow` column change: when moving to a **non-done** column, set `is_done = false`, `done_at = null` (match MCP). |

## Data / services

`src/services/user-task-order.ts` (re-add):
- `setTaskRank(userId, taskId, rank): Promise<void>` — upsert into `user_task_order`.
- `getTaskRanks(userId, taskIds): Promise<Record<string, number>>` — fetch ranks for a set of tasks.
- `midpointRank(ranks: (number|null)[], toIndex): number` — fractional rank between post-drag neighbors (same logic as the original).

`src/services/time-sessions.ts`:
- Add `getProjectTaskSeconds(userId, projectId): Promise<Record<string, number>>` — map of taskId → summed seconds for the user's sessions on that project's tasks. (Generalises the per-task total used by the My Tasks rows.)
- Keep existing `getProjectTotals` (today/week) and `getSprintTotal`.

`src/hooks/useTimeTracking.ts`:
- Re-add `useSetTaskRank(userId)` (invalidates `my-project-tasks` / the My Tasks query).
- Add `useProjectTaskSeconds(userId, projectId)` and `useTaskRanks(userId, projectId)` (or fold ranks into the seconds hook). Keep `useProjectTotals`, `useSprintTotal`, `useRunningSession`.

## Components

`src/components/my-work/SessionLog.tsx` → grouped-by-task:
- Group the fetched `TimeSessionWithTask[]` by `task_id`. Each group: task title, project, `sessions[]`, `totalSeconds`, `isRunning` (any open session).
- Render group rows (chevron, title, project chip when no project filter, "N sessions", total). Local expand state (`Set<taskId>`). Expanded → session sub-rows (date · in→out · duration; running shows pulse).
- Sort groups by `totalSeconds` desc. Keep skeleton loading + empty state.

`src/components/board/MyTasksView.tsx` → rich list + drag:
- Header: inline stats strip (`Today · Week · {Sprint}`), built from `useProjectTotals` + `useSprintTotal`.
- List: `@hello-pangea/dnd` `DragDropContext`/`Droppable`/`Draggable`. Each row is dense (fixed-width slots, hide low-priority slots below `sm`/`md` like `TaskListRow`): drag handle · priority dot · title · tags · column chip · sprint · due date · story points · counts · time tracked · `TaskTimerButton`. Row click → `onTaskClick`.
- Source data: `useTasks(projectId)` filtered to `assignees.some(a => a.id === userId) && !is_done && !archived`; merge `useProjectTaskSeconds` and ranks; sort by rank asc then `task_number`.
- `onDragEnd`: build post-drag array, `midpointRank`, `useSetTaskRank`.
- Column name from `useProjectContext().columns`; sprint name from `useSprints(projectId)`.

`src/routes/_app/p/$slug/index.tsx`: unchanged wiring (already renders `MyTasksView` for the `mine` view mode), but `MyTasksView` no longer needs `projectPrefix` if it reads tasks directly — keep the prop it needs.

## Bug fix paths

- `src/hooks/useBoardDnd.ts`: currently sets `isDoneOverride = { is_done: true, done_at }` only when moving into a done column. Add: when the **source** column is a done column and the **destination** is not, set `isDoneOverride = { is_done: false, done_at: null }`.
- `src/components/task/TaskDetailPanel.tsx` (column `<select>` handler): the non-done branch must clear `is_done`/`done_at` when the task is currently done, instead of only updating `column_id`.
- `src/components/board/TaskListRow.tsx` (`changeColumn`): when moving to a non-done column, include `{ is_done: false, done_at: null }` if the task is currently done.

## Out of scope

Column-header sorting on either view, cross-project My Tasks, server-side log grouping, charts. Keep it focused.

## Testing / verification

No test framework (project decision). Verify via `npm run build` (tsc + vite) and manual runtime checks after migration `025` is applied: group/expand in Time Logs; My Tasks shows rich rows, drag persists order, stats strip correct; move a task done→non-done on the board and in the detail panel and confirm it reappears in My Tasks.
