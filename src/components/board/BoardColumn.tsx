import { Droppable } from '@hello-pangea/dnd'
import { Pin, Zap, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TaskCard } from './TaskCard'
import type { TaskWithRelations, ProjectColumn } from '@/types/database'

interface BoardColumnProps {
  column: ProjectColumn
  tasks: TaskWithRelations[]
  onTaskClick: (taskId: string) => void
  isDefault?: boolean
  onSetDefault?: () => void
  isSprintColumn?: boolean
  onSetSprintColumn?: () => void
  canManage?: boolean
  isUpdating?: boolean
}

export function BoardColumn({
  column,
  tasks,
  onTaskClick,
  isDefault,
  onSetDefault,
  isSprintColumn,
  onSetSprintColumn,
  canManage,
  isUpdating,
}: BoardColumnProps) {
  return (
    <div className="flex h-full w-64 shrink-0 flex-col rounded-lg bg-muted/50">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-semibold text-foreground">
            {column.name}
          </h3>
          {canManage && (
            <>
              <button
                onClick={onSetDefault}
                disabled={isUpdating}
                title={isDefault ? 'Default column' : 'Set as default column'}
                className={cn(
                  'transition-colors disabled:opacity-50',
                  isDefault
                    ? 'text-primary'
                    : 'text-muted-foreground/40 hover:text-muted-foreground'
                )}
              >
                {isUpdating && isDefault ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Pin className={cn('h-3.5 w-3.5', isDefault && 'fill-current')} />
                )}
              </button>
              <button
                onClick={onSetSprintColumn}
                disabled={isUpdating}
                title={isSprintColumn ? 'Sprint column' : 'Set as sprint column'}
                className={cn(
                  'transition-colors disabled:opacity-50',
                  isSprintColumn
                    ? 'text-amber-500'
                    : 'text-muted-foreground/40 hover:text-muted-foreground'
                )}
              >
                {isUpdating && isSprintColumn ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Zap className={cn('h-3.5 w-3.5', isSprintColumn && 'fill-current')} />
                )}
              </button>
            </>
          )}
        </div>
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">
          {tasks.length}
        </span>
      </div>

      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              'flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2',
              'min-h-[120px]',
              snapshot.isDraggingOver && 'bg-primary/5 rounded-b-lg'
            )}
          >
            {tasks.map((task, index) => (
              <TaskCard
                key={task.id}
                task={task}
                index={index}
                onClick={onTaskClick}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  )
}
