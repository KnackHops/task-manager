import { useMemo, useState } from 'react'
import { DragDropContext, type DropResult } from '@hello-pangea/dnd'
import { useQueryClient, useIsFetching } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BoardColumn } from './BoardColumn'
import { useTasks, useReorderTask, taskKeys } from '@/hooks/useTasks'
import { useSprints } from '@/hooks/useSprints'
import { useUpdateProject, projectKeys } from '@/hooks/useProjects'
import { useProjectContext } from '@/contexts/ProjectContext'
import type { TaskWithRelations } from '@/types/database'

interface BoardContainerProps {
  projectId: string
  sprintId?: string | null
  onTaskClick: (taskId: string) => void
}

export function BoardContainer({
  projectId,
  sprintId,
  onTaskClick,
}: BoardContainerProps) {
  const queryClient = useQueryClient()
  const { project, columns: projectColumns, canManageColumns } =
    useProjectContext()
  const { data: tasks, isLoading } = useTasks(
    projectId,
    sprintId !== undefined ? { sprintId } : undefined
  )
  const reorderMutation = useReorderTask(projectId)
  const updateProject = useUpdateProject(project.slug)
  const isRefetchingProject = useIsFetching({ queryKey: projectKeys.detail(project.slug) })
  const isProjectUpdating = updateProject.isPending || isRefetchingProject > 0
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
                ? { ...task, column_id: toColumnId }
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

    setPendingReorder({
      taskId: draggableId,
      fromColumnId: source.droppableId,
      toColumnId: destination.droppableId,
      toIndex: destination.index,
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
      },
      {
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: taskKeys.all(projectId) })
          setPendingReorder(null)
        },
      }
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex h-full gap-4 overflow-x-auto pb-4">
        {projectColumns.map((col) => (
          <BoardColumn
            key={col.id}
            column={col}
            tasks={grouped[col.id] ?? []}
            onTaskClick={onTaskClick}
            isDefault={project.default_column_id === col.id}
            isSprintColumn={project.sprint_column_id === col.id}
            canManage={canManageColumns}
            isUpdating={isProjectUpdating}
            onSetDefault={() => {
              const newDefault =
                project.default_column_id === col.id ? null : col.id
              updateProject.mutate(
                {
                  projectId: project.id,
                  input: { default_column_id: newDefault },
                },
                {
                  onSuccess: () =>
                    toast.success(
                      newDefault
                        ? `Default column set to ${col.name}`
                        : 'Default column cleared'
                    ),
                  onError: (err) => toast.error(err.message),
                }
              )
            }}
            onSetSprintColumn={() => {
              const newSprint =
                project.sprint_column_id === col.id ? null : col.id
              updateProject.mutate(
                {
                  projectId: project.id,
                  input: { sprint_column_id: newSprint },
                },
                {
                  onSuccess: () =>
                    toast.success(
                      newSprint
                        ? `Sprint column set to ${col.name}`
                        : 'Sprint column cleared'
                    ),
                  onError: (err) => toast.error(err.message),
                }
              )
            }}
          />
        ))}
      </div>
    </DragDropContext>
  )
}
