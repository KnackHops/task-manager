import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { DropResult } from '@hello-pangea/dnd'
import { useTasks, useReorderTask, taskKeys } from '@/hooks/useTasks'
import { useSprints } from '@/hooks/useSprints'
import { useProjectContext } from '@/contexts/ProjectContext'
import type { TaskWithRelations } from '@/types/database'

/**
 * Shared board drag-and-drop state + handler. Owns the column grouping (sorted by
 * position with an instant pending-reorder overlay) and the drag-end logic (sprint
 * auto-assign on the sprint column, done auto-mark on done columns, synchronous cache
 * write, reorder mutation). Consumed by both the kanban board and the list view so the
 * two stay behaviorally identical.
 */
export function useBoardDnd(projectId: string, sprintId?: string | null) {
  const queryClient = useQueryClient()
  const { project, columns: projectColumns, doneColumnIds } = useProjectContext()
  const { data: tasks, isLoading } = useTasks(
    projectId,
    sprintId !== undefined ? { sprintId } : undefined
  )
  const reorderMutation = useReorderTask(projectId)
  const { data: sprints } = useSprints(projectId)
  const activeSprint = useMemo(
    () => sprints?.find((s) => s.status === 'active'),
    [sprints]
  )

  // Local override applied on top of query data — bypasses React Query's
  // async notification delay so the card moves instantly on drop.
  const [pendingReorder, setPendingReorder] = useState<{
    taskId: string
    fromColumnId: string
    toColumnId: string
    toIndex: number
    isDoneOverride?: { is_done: boolean; done_at: string | null }
  } | null>(null)

  const grouped = useMemo(() => {
    const map: Record<string, TaskWithRelations[]> = {}
    for (const col of projectColumns) {
      map[col.id] = []
    }

    if (tasks) {
      for (const task of tasks) {
        const col = map[task.column_id]
        if (col) {
          col.push(task)
        }
      }
    }

    // Sort each column by position
    for (const key of Object.keys(map)) {
      map[key]!.sort((a, b) => a.position - b.position)
    }

    // Apply pending reorder on top of query data
    if (pendingReorder) {
      const { taskId, fromColumnId, toColumnId, toIndex } = pendingReorder
      const fromCol = map[fromColumnId]
      if (fromCol) {
        const idx = fromCol.findIndex((t) => t.id === taskId)
        if (idx !== -1) {
          const [task] = fromCol.splice(idx, 1)
          const toCol = map[toColumnId]
          if (toCol && task) {
            const movedTask =
              fromColumnId !== toColumnId
                ? { ...task, column_id: toColumnId, ...(pendingReorder.isDoneOverride ?? {}) }
                : task
            toCol.splice(toIndex, 0, movedTask)
          }
        }
      }
    }

    return map
  }, [tasks, projectColumns, pendingReorder])

  const handleDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result
    if (!destination) return
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    )
      return

    // Auto-assign sprint when dragging into sprint column
    const isMovingIntoSprintColumn =
      project.sprint_column_id &&
      destination.droppableId === project.sprint_column_id &&
      source.droppableId !== project.sprint_column_id
    const sprintIdOverride =
      isMovingIntoSprintColumn && activeSprint ? activeSprint.id : undefined

    // Auto-mark done when moving into a done column (skip if unfinished deps)
    const isMovingIntoDoneColumn =
      doneColumnIds.includes(destination.droppableId) &&
      !doneColumnIds.includes(source.droppableId)
    const draggedTask = tasks?.find((t) => t.id === draggableId)
    const hasUnfinishedDeps = draggedTask?.dependencies?.some((d) => !d.is_done) ?? false
    const isDoneOverride = isMovingIntoDoneColumn && !hasUnfinishedDeps
      ? { is_done: true as const, done_at: new Date().toISOString() }
      : undefined

    setPendingReorder({
      taskId: draggableId,
      fromColumnId: source.droppableId,
      toColumnId: destination.droppableId,
      toIndex: destination.index,
      isDoneOverride,
    })

    // Also update React Query cache so data persists after pendingReorder clears
    queryClient.setQueriesData<TaskWithRelations[]>(
      { queryKey: taskKeys.all(projectId) },
      (old) => {
        if (!old) return old
        const draggedTask = old.find((t) => t.id === draggableId)
        if (!draggedTask) return old

        const sourceColumnId = draggedTask.column_id
        const isSameColumn = sourceColumnId === destination.droppableId
        const withoutDragged = old.filter((t) => t.id !== draggableId)

        const destTasks = withoutDragged
          .filter((t) => t.column_id === destination.droppableId && !t.archived)
          .sort((a, b) => a.position - b.position)

        const updatedDragged = {
          ...draggedTask,
          column_id: destination.droppableId,
          ...(sprintIdOverride ? { sprint_id: sprintIdOverride } : {}),
          ...(isDoneOverride ?? {}),
        }
        destTasks.splice(destination.index, 0, updatedDragged)

        const updatedIds = new Map<string, number>()
        destTasks.forEach((t, i) => updatedIds.set(t.id, i))

        if (!isSameColumn) {
          const sourceTasks = withoutDragged
            .filter((t) => t.column_id === sourceColumnId && !t.archived)
            .sort((a, b) => a.position - b.position)
          sourceTasks.forEach((t, i) => updatedIds.set(t.id, i))
        }

        return old.map((t) => {
          const newPos = updatedIds.get(t.id)
          if (t.id === draggableId) {
            return {
              ...t,
              column_id: destination.droppableId,
              position: newPos ?? destination.index,
              ...(sprintIdOverride ? { sprint_id: sprintIdOverride } : {}),
              ...(isDoneOverride ?? {}),
            }
          }
          if (newPos !== undefined) return { ...t, position: newPos }
          return t
        })
      }
    )

    reorderMutation.mutate(
      {
        taskId: draggableId,
        newColumnId: destination.droppableId,
        newPosition: destination.index,
        sprintIdOverride,
        isDoneOverride,
      },
      {
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: taskKeys.all(projectId) })
          setPendingReorder(null)
        },
      }
    )
  }

  return { grouped, handleDragEnd, isLoading }
}
