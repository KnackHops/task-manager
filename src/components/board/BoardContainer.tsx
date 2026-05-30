import { DragDropContext } from '@hello-pangea/dnd'
import { useIsFetching } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BoardColumn } from './BoardColumn'
import { Skeleton } from '@/components/ui/Skeleton'
import { useUpdateProject, projectKeys } from '@/hooks/useProjects'
import { useUpdateColumn } from '@/hooks/useColumns'
import { useBoardDnd } from '@/hooks/useBoardDnd'
import { useProjectContext } from '@/contexts/ProjectContext'

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
  const { project, columns: projectColumns, canManageColumns } = useProjectContext()
  const { grouped, handleDragEnd, isLoading } = useBoardDnd(projectId, sprintId)
  const updateProject = useUpdateProject(project.slug)
  const updateColumn = useUpdateColumn(projectId, project.slug)
  const isRefetchingProject = useIsFetching({ queryKey: projectKeys.detail(project.slug) })
  const isProjectUpdating = updateProject.isPending || isRefetchingProject > 0

  if (isLoading) {
    return (
      <div className="flex h-full gap-4 overflow-hidden pb-4">
        {Array.from({ length: 4 }).map((_, col) => (
          <div key={col} className="flex w-64 shrink-0 flex-col gap-3">
            <div className="flex items-center justify-between px-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-6 rounded-full" />
            </div>
            {Array.from({ length: 3 - col % 2 }).map((_, card) => (
              <div key={card} className="rounded-lg border border-border bg-card p-3 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-12 rounded-full" />
                  <Skeleton className="h-5 w-14 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ))}
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
            isDone={col.is_done}
            canManage={canManageColumns}
            isUpdating={isProjectUpdating || updateColumn.isPending}
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
            onToggleDone={() => {
              updateColumn.mutate(
                {
                  columnId: col.id,
                  input: { is_done: !col.is_done },
                },
                {
                  onSuccess: () =>
                    toast.success(
                      !col.is_done
                        ? `${col.name} marked as done column`
                        : `${col.name} unmarked as done column`
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
