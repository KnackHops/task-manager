import { useState } from 'react'
import { DragDropContext, Droppable } from '@hello-pangea/dnd'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TaskListRow } from './TaskListRow'
import { Skeleton } from '@/components/ui/Skeleton'
import { useBoardDnd } from '@/hooks/useBoardDnd'
import { useProjectContext } from '@/contexts/ProjectContext'
import { useAuth } from '@/contexts/AuthContext'
import { useProjectTaskSeconds } from '@/hooks/useTimeTracking'

interface BoardListViewProps {
  projectId: string
  sprintId?: string | null
  onTaskClick: (taskId: string) => void
}

function collapseKey(projectId: string) {
  return `boardListCollapsed:${projectId}`
}

function loadCollapsed(projectId: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(collapseKey(projectId))
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

export function BoardListView({
  projectId,
  sprintId,
  onTaskClick,
}: BoardListViewProps) {
  const { columns } = useProjectContext()
  const { user } = useAuth()
  const { data: secondsMap } = useProjectTaskSeconds(user?.id, projectId)
  const { grouped, handleDragEnd, isLoading } = useBoardDnd(projectId, sprintId)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    loadCollapsed(projectId)
  )

  const toggleCollapse = (columnId: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [columnId]: !prev[columnId] }
      try {
        localStorage.setItem(collapseKey(projectId), JSON.stringify(next))
      } catch {
        // ignore persistence failures
      }
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="flex h-full flex-col gap-4 overflow-y-auto pb-4">
        {Array.from({ length: 3 }).map((_, group) => (
          <div key={group} className="space-y-2">
            <Skeleton className="h-5 w-32" />
            {Array.from({ length: 3 }).map((_, row) => (
              <Skeleton key={row} className="h-9 w-full rounded-md" />
            ))}
          </div>
        ))}
      </div>
    )
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex h-full flex-col gap-4 overflow-y-auto pb-4">
        {columns.map((col) => {
          const tasks = grouped[col.id] ?? []
          const isCollapsed = collapsed[col.id] ?? false
          return (
            <div key={col.id}>
              <button
                onClick={() => toggleCollapse(col.id)}
                className="mb-1 flex w-full items-center gap-1.5 px-1 text-sm font-semibold text-foreground"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                {col.name}
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">
                  {tasks.length}
                </span>
              </button>

              <Droppable droppableId={col.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      'flex flex-col gap-1 rounded-md',
                      !isCollapsed && 'min-h-[8px]',
                      snapshot.isDraggingOver && 'bg-primary/5'
                    )}
                  >
                    {!isCollapsed &&
                      tasks.map((task, index) => (
                        <TaskListRow
                          key={task.id}
                          task={task}
                          index={index}
                          seconds={secondsMap?.[task.id] ?? 0}
                          onClick={onTaskClick}
                        />
                      ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          )
        })}
      </div>
    </DragDropContext>
  )
}
