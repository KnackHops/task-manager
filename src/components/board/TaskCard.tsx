import { Draggable } from '@hello-pangea/dnd'
import { GitMerge, MessageSquare, Paperclip, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TagBadge } from '@/components/ui/Badge'
import { TaskNumberPill } from '@/components/ui/TaskNumberPill'
import { Avatar } from '@/components/ui/Avatar'
import { useProjectContext } from '@/contexts/ProjectContext'
import { useSprints } from '@/hooks/useSprints'
import type { TaskWithRelations } from '@/types/database'

const priorityBorderColors: Record<string, string> = {
  critical: 'border-l-red-500',
  high: 'border-l-orange-500',
  medium: 'border-l-yellow-500',
  low: 'border-l-gray-500',
}

interface TaskCardProps {
  task: TaskWithRelations
  index: number
  onClick: (taskId: string) => void
}

export function TaskCard({ task, index, onClick }: TaskCardProps) {
  const { project } = useProjectContext()
  const { data: sprints } = useSprints(project.id)
  const taskId = project.prefix ? `${project.prefix}-${task.task_number}` : null
  const sprintName = task.sprint_id
    ? sprints?.find((s) => s.id === task.sprint_id)?.name
    : null

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          style={provided.draggableProps.style}
          onClick={() => onClick(task.id)}
          className={cn(
            'rounded-lg border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md border-l-4',
            priorityBorderColors[task.priority],
            snapshot.isDragging && 'shadow-lg ring-2 ring-primary/30'
          )}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            {taskId && <TaskNumberPill taskId={taskId} />}
            {task.tags?.map((tag) => (
              <TagBadge key={tag.id} name={tag.name} color={tag.color} />
            ))}
            {task.story_points != null && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0 text-[10px] font-medium text-primary">
                <Zap className="h-2.5 w-2.5" />
                {task.story_points}
              </span>
            )}
          </div>

          <p className="mt-1.5 text-sm font-medium text-card-foreground line-clamp-2">
            {task.title}
          </p>

          {task.dependencies && task.dependencies.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
              <GitMerge className={cn('h-3 w-3 shrink-0', task.dependencies.every((d) => d.is_done) && 'text-emerald-500')} />
              {task.dependencies.map((d) => (
                <span key={d.id} className={cn(d.is_done && 'text-emerald-500')}>{project.prefix}-{d.task_number}</span>
              ))}
            </div>
          )}

          {((task.comment_count ?? 0) > 0 ||
            (task.attachment_count ?? 0) > 0 ||
            sprintName ||
            (task.assignees && task.assignees.length > 0)) && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground">
                {(task.comment_count ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-0.5">
                    <MessageSquare className="h-3 w-3" />
                    {task.comment_count}
                  </span>
                )}
                {(task.attachment_count ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-0.5">
                    <Paperclip className="h-3 w-3" />
                    {task.attachment_count}
                  </span>
                )}
                {sprintName && (
                  <span className="inline-flex items-center gap-0.5 truncate max-w-[100px]">
                    {sprintName}
                  </span>
                )}
              </div>
              {task.assignees && task.assignees.length > 0 && (
                <div className="flex -space-x-1.5">
                  {task.assignees.slice(0, 3).map((a) => (
                    <Avatar
                      key={a.id}
                      name={a.full_name}
                      url={a.avatar_url}
                      size="sm"
                      className="ring-2 ring-card"
                    />
                  ))}
                  {task.assignees.length > 3 && (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-card">
                      +{task.assignees.length - 3}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {task.route_label && (
            <div className="mt-2">
              <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                {task.route_label}
              </span>
            </div>
          )}
        </div>
      )}
    </Draggable>
  )
}
